#!/usr/bin/env python3
"""Irreversibly purge obsolete tactical telemetry and rebuild SLF RAG.

This tool intentionally creates no data backup. It keeps only records whose
recognized UTC timestamp is on or after the supplied cutoff. Records without a
recognized timestamp are deleted as explicitly requested by the operator.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any, Mapping, Sequence

COLLECTIONS = (
    "match_snapshots_v2",
    "match_results_v2",
    "preset_events_v2",
    "preset_effects_v2",
)

DATE_PATHS = (
    "ts",
    "source.collectedAt",
    "source.ts",
    "collectedAt",
    "createdAt",
    "created_at",
    "savedAt",
    "updatedAt",
    "updated_at",
    "finishedAt",
    "timestamp",
    "date",
    "after.ts",
    "before.ts",
    "beforeSnapshot.ts",
    "snapshot.ts",
    "result.ts",
    "event.ts",
)

DEFAULT_DATA_DIR = Path("/root/slf-server/data")
DEFAULT_BACKUP_ROOT = Path("/var/backups/slf-code")
DEFAULT_EXPORT_COMMAND = Path("/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh")
DEFAULT_SERVICE = "slf-server.service"
EXPECTED_CUTOFF = "2026-07-22T00:00:00Z"


def get_path(record: Mapping[str, Any], dotted_path: str) -> Any:
    current: Any = record
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def parse_datetime(value: Any) -> dt.datetime | None:
    if value in (None, "") or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        number = float(value)
        if not math.isfinite(number):
            return None
        absolute = abs(number)
        if absolute > 10_000_000_000_000_000:
            number /= 1_000_000_000
        elif absolute > 10_000_000_000_000:
            number /= 1_000_000
        elif absolute > 10_000_000_000:
            number /= 1_000
        try:
            return dt.datetime.fromtimestamp(number, tz=dt.timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None

    text = str(value).strip()
    if not text:
        return None

    try:
        numeric = float(text)
    except ValueError:
        numeric = None
    if numeric is not None and math.isfinite(numeric):
        return parse_datetime(numeric)

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def record_datetime(record: Mapping[str, Any]) -> dt.datetime | None:
    for path in DATE_PATHS:
        parsed = parse_datetime(get_path(record, path))
        if parsed is not None:
            return parsed
    return None


def parse_cutoff(text: str) -> dt.datetime:
    parsed = parse_datetime(text)
    if parsed is None:
        raise argparse.ArgumentTypeError(f"Invalid cutoff datetime: {text}")
    return parsed


def load_collection(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing collection file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in {path}: {exc}") from exc

    if not isinstance(payload, list):
        raise RuntimeError(f"Collection must be a JSON list: {path}")
    if any(not isinstance(row, dict) for row in payload):
        raise RuntimeError(f"Collection contains a non-object record: {path}")
    return payload


def filter_records(records: Sequence[Mapping[str, Any]], cutoff: dt.datetime) -> tuple[list[dict[str, Any]], dict[str, int]]:
    kept: list[dict[str, Any]] = []
    removed_before = 0
    removed_undated = 0

    for record in records:
        timestamp = record_datetime(record)
        if timestamp is None:
            removed_undated += 1
            continue
        if timestamp < cutoff:
            removed_before += 1
            continue
        kept.append(dict(record))

    return kept, {
        "before": len(records),
        "kept": len(kept),
        "removedBeforeCutoff": removed_before,
        "removedUnknownDate": removed_undated,
    }


def scan(data_dir: Path, cutoff: dt.datetime) -> tuple[dict[str, list[dict[str, Any]]], dict[str, dict[str, int]]]:
    filtered: dict[str, list[dict[str, Any]]] = {}
    stats: dict[str, dict[str, int]] = {}
    for collection in COLLECTIONS:
        path = data_dir / f"{collection}.json"
        rows = load_collection(path)
        kept, collection_stats = filter_records(rows, cutoff)
        filtered[collection] = kept
        stats[collection] = collection_stats
    return filtered, stats


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_collections(data_dir: Path, filtered: Mapping[str, Sequence[Mapping[str, Any]]]) -> None:
    staged: list[tuple[Path, Path]] = []
    try:
        for collection in COLLECTIONS:
            target = data_dir / f"{collection}.json"
            temp = data_dir / f".{collection}.json.purge-tmp"
            mode = target.stat().st_mode & 0o777
            with temp.open("w", encoding="utf-8") as handle:
                json.dump(filtered[collection], handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp, mode)
            staged.append((temp, target))

        for temp, target in staged:
            os.replace(temp, target)
        fsync_directory(data_dir)
    finally:
        for temp, _ in staged:
            temp.unlink(missing_ok=True)


def run(command: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=check, text=True, stdout=sys.stdout, stderr=sys.stderr)


def service_is_active(service: str) -> bool:
    result = subprocess.run(
        ["systemctl", "is-active", "--quiet", service],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def verify_clean(data_dir: Path, cutoff: dt.datetime) -> dict[str, dict[str, int]]:
    _, stats = scan(data_dir, cutoff)
    for collection, values in stats.items():
        if values["removedBeforeCutoff"] != 0 or values["removedUnknownDate"] != 0:
            raise RuntimeError(f"Post-purge verification failed for {collection}: {values}")
    return stats


def clear_code_backups(backup_root: Path) -> int:
    resolved = backup_root.resolve()
    expected = DEFAULT_BACKUP_ROOT.resolve()
    if resolved != expected:
        raise RuntimeError(f"Refusing to clear unexpected backup root: {resolved}; expected {expected}")
    if not resolved.exists():
        return 0
    if not resolved.is_dir():
        raise RuntimeError(f"Backup root is not a directory: {resolved}")

    removed = 0
    for child in resolved.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
        removed += 1
    fsync_directory(resolved)
    return removed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cutoff", required=True, type=parse_cutoff, help="UTC cutoff; records before it are deleted")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--export-command", type=Path, default=DEFAULT_EXPORT_COMMAND)
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUP_ROOT)
    parser.add_argument("--apply", action="store_true", help="Perform the irreversible purge; otherwise only print a preview")
    parser.add_argument(
        "--delete-code-backups",
        action="store_true",
        help="After successful purge/export verification, empty /var/backups/slf-code",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    cutoff: dt.datetime = args.cutoff

    if cutoff.isoformat().replace("+00:00", "Z") != EXPECTED_CUTOFF:
        raise RuntimeError(f"This migration is locked to cutoff {EXPECTED_CUTOFF}")
    if not args.data_dir.is_dir():
        raise RuntimeError(f"Missing data directory: {args.data_dir}")

    _, preview_stats = scan(args.data_dir, cutoff)
    preview = {
        "mode": "apply" if args.apply else "preview",
        "cutoff": cutoff.isoformat(),
        "deleteUnknownDate": True,
        "collections": preview_stats,
    }
    print(json.dumps(preview, ensure_ascii=False, indent=2))

    if not args.apply:
        return 0
    if os.geteuid() != 0:
        raise RuntimeError("Apply mode must run as root")
    if not args.delete_code_backups:
        raise RuntimeError("Apply mode requires --delete-code-backups for the approved operation")
    if not args.export_command.is_file():
        raise RuntimeError(f"Missing export command: {args.export_command}")

    was_active = service_is_active(args.service)
    if was_active:
        run(["systemctl", "stop", args.service])

    try:
        filtered, apply_stats = scan(args.data_dir, cutoff)
        replace_collections(args.data_dir, filtered)
    finally:
        if was_active:
            run(["systemctl", "start", args.service], check=False)

    if was_active and not service_is_active(args.service):
        raise RuntimeError(f"Service failed to restart: {args.service}")

    verify_clean(args.data_dir, cutoff)
    run([str(args.export_command)])
    final_stats = verify_clean(args.data_dir, cutoff)
    deleted_backup_entries = clear_code_backups(args.backup_root)

    result = {
        "ok": True,
        "cutoff": cutoff.isoformat(),
        "deleteUnknownDate": True,
        "collections": apply_stats,
        "postVerification": final_stats,
        "exportCommand": str(args.export_command),
        "deletedCodeBackupEntries": deleted_backup_entries,
        "backupCreated": False,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
