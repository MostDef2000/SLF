#!/usr/bin/env python3
"""Purge unknown-identity preset telemetry records and rebuild SLF RAG.

Deletes records from ``preset_events_v2`` and ``preset_effects_v2`` whose
preset identity is unknown: the extracted preset name is empty or literally
"unknown" (case-insensitive, whitespace-tolerant). The name is extracted
exactly like ``preset_name()`` in ``vps/exporter-rag/slf_preset_evidence_561.py``
(the exact-matcher evidence generator from issue #380): same dotted-path list,
same ``Mapping -> name|id`` unwrap, same ``str(value or "unknown")`` fallback.

Deliberate asymmetry versus the exporter's quarantine set: this tool deletes
ONLY empty/missing names and the literal "unknown" value. Names such as
"manual", "manual_change", "null" and "none", and records with conflicting
explicit identities, are different evidence categories and are NOT deleted
here (they stay in raw counts and diagnostics in slf_preset_evidence_561.py).

``match_snapshots_v2`` and ``match_results_v2`` are backed up but never
rewritten: unknown preset attribution in ``match_results_v2`` byFinalPreset
fields is a valid match outcome, not garbage.

The tool is criterion-based, has no date/cutoff lock, and is safe to re-run
(preview anytime, apply monthly) while unknown-identity telemetry keeps
arriving. Unlike purge_tactical_data.py, apply mode CREATES a verified backup
of all four collections before touching anything. The backup directory must
not already exist: the tool fails closed rather than overwriting it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any, Mapping, Sequence

BACKUP_COLLECTIONS = (
    "match_snapshots_v2",
    "match_results_v2",
    "preset_events_v2",
    "preset_effects_v2",
)

PURGE_COLLECTIONS = (
    "preset_events_v2",
    "preset_effects_v2",
)

# Verbatim from vps/exporter-rag/slf_preset_evidence_561.py, preset_name().
# Kept in lockstep with the exporter on purpose; the unit tests load the
# exporter module and fail if the two lists drift apart.
PRESET_NAME_PATHS = (
    "presetName", "preset", "preset.name", "event.presetName", "event.preset",
    "tacticPreset", "appliedPreset", "tacticContext.appliedPreset",
    "telemetryContext.presetId", "phaseStart.presetId", "phaseEnd.presetId",
    "meta.presetName", "analysis.presetName"
)

UNKNOWN_IDENTITY = "unknown"

DEFAULT_DATA_DIR = Path("/opt/slf/slf-server/data")
DEFAULT_BACKUP_ROOT = Path("/var/backups/slf-unknown-purge")
DEFAULT_EXPORT_COMMAND = Path("/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/run_daily_export.sh")
DEFAULT_SERVICE = "slf-server.service"

SAMPLE_ID_LIMIT = 20


def get_path(record: Mapping[str, Any], dotted_path: str) -> Any:
    current: Any = record
    for part in dotted_path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def first_path(record: Mapping[str, Any], paths: Sequence[str]) -> Any:
    for path in paths:
        value = get_path(record, path)
        if value not in (None, ""):
            return value
    return None


def preset_name(record: Mapping[str, Any]) -> str:
    """Mirror of preset_name() in vps/exporter-rag/slf_preset_evidence_561.py."""
    value = first_path(record, PRESET_NAME_PATHS)
    if isinstance(value, Mapping):
        value = value.get("name") or value.get("id")
    return str(value or UNKNOWN_IDENTITY)


def is_unknown_identity(record: Mapping[str, Any]) -> bool:
    """True iff the extracted preset name strips to empty or "unknown".

    Narrower than the exporter's comparable_preset_name() quarantine: names
    like "manual", "manual_change", "null", "none" and conflicting-identity
    records are NOT unknown-identity carriers and must survive this purge.
    """
    name = preset_name(record).strip()
    return not name or name.lower() == UNKNOWN_IDENTITY


def unknown_identity_kind(record: Mapping[str, Any]) -> str:
    """Classify an unknown-identity record: literal "unknown" vs empty/missing."""
    value = first_path(record, PRESET_NAME_PATHS)
    if isinstance(value, Mapping):
        value = value.get("name") or value.get("id")
    if not value or not str(value).strip():
        return "emptyOrMissing"
    return "literalUnknown"


def record_identifier(record: Mapping[str, Any], index: int) -> str:
    for key in ("id", "gameId", "ts"):
        value = record.get(key)
        if value not in (None, ""):
            return str(value)
    return f"<no-id:{index}>"


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


def filter_unknown(records: Sequence[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any], list[str]]:
    kept: list[dict[str, Any]] = []
    removed_ids: list[str] = []
    literal_unknown = 0
    empty_or_missing = 0

    for index, record in enumerate(records):
        if is_unknown_identity(record):
            removed_ids.append(record_identifier(record, index))
            if unknown_identity_kind(record) == "literalUnknown":
                literal_unknown += 1
            else:
                empty_or_missing += 1
            continue
        kept.append(dict(record))

    stats = {
        "before": len(records),
        "removed": len(removed_ids),
        "kept": len(kept),
        "removedBreakdown": {
            "literalUnknown": literal_unknown,
            "emptyOrMissing": empty_or_missing,
        },
    }
    return kept, stats, removed_ids


def scan_purge(data_dir: Path) -> tuple[dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]], dict[str, list[str]]]:
    kept_map: dict[str, list[dict[str, Any]]] = {}
    stats_map: dict[str, dict[str, Any]] = {}
    removed_map: dict[str, list[str]] = {}
    for collection in PURGE_COLLECTIONS:
        rows = load_collection(data_dir / f"{collection}.json")
        kept, stats, removed_ids = filter_unknown(rows)
        kept_map[collection] = kept
        stats_map[collection] = stats
        removed_map[collection] = removed_ids
    return kept_map, stats_map, removed_map


def build_preview(data_dir: Path, *, list_ids: bool = False) -> dict[str, Any]:
    _, stats, removed_ids = scan_purge(data_dir)
    limit = None if list_ids else SAMPLE_ID_LIMIT
    samples = {
        collection: ids if limit is None else ids[:SAMPLE_ID_LIMIT]
        for collection, ids in removed_ids.items()
    }
    return {
        "mode": "preview",
        "collections": stats,
        "samples": samples,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_backup(data_dir: Path, backup_dir: Path) -> dict[str, str]:
    """Copy all backed-up collections and verify every copy byte-for-byte.

    Fails closed if the backup directory already exists: the refusal is
    raised before any deletion and the existing directory is left untouched.
    The failure cleanup only ever removes a directory this call created.
    """
    created = False
    try:
        if backup_dir.exists():
            raise RuntimeError(
                f"Backup directory already exists, refusing to overwrite: {backup_dir}"
            )
        try:
            backup_dir.mkdir(parents=True, exist_ok=False)
        except FileExistsError as exc:
            raise RuntimeError(
                f"Backup directory already exists, refusing to overwrite: {backup_dir}"
            ) from exc
        created = True
        checksums: list[str] = []
        source_shas: dict[str, str] = {}
        for collection in BACKUP_COLLECTIONS:
            source = data_dir / f"{collection}.json"
            if not source.is_file():
                raise RuntimeError(f"Missing collection file: {source}")
            copy = backup_dir / f"{collection}.json"
            shutil.copy2(source, copy)
            source_sha = sha256_file(source)
            copy_sha = sha256_file(copy)
            if source_sha != copy_sha:
                raise RuntimeError(
                    f"Backup verification failed for {collection}: "
                    f"copy sha256 {copy_sha} != source sha256 {source_sha}"
                )
            checksums.append(f"{source_sha}  {copy.name}")
            source_shas[collection] = source_sha
        (backup_dir / "SHA256SUMS").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    except Exception:
        if created:
            shutil.rmtree(backup_dir, ignore_errors=True)
        raise
    return source_shas


def replace_collections(
    data_dir: Path,
    kept: Mapping[str, Sequence[Mapping[str, Any]]],
    removed_counts: Mapping[str, int],
) -> list[str]:
    """Atomically rewrite only purge collections that actually lose records."""
    rewritten: list[str] = []
    staged: list[tuple[Path, Path]] = []
    try:
        for collection in PURGE_COLLECTIONS:
            if removed_counts[collection] == 0:
                continue
            target = data_dir / f"{collection}.json"
            temp = data_dir / f".{collection}.json.unknown-purge-tmp"
            mode = target.stat().st_mode & 0o777
            with temp.open("w", encoding="utf-8") as handle:
                json.dump(list(kept[collection]), handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp, mode)
            staged.append((temp, target))
            rewritten.append(collection)

        for temp, target in staged:
            os.replace(temp, target)
        fsync_directory(data_dir)
    finally:
        for temp, _ in staged:
            temp.unlink(missing_ok=True)
    return rewritten


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


def verify_clean(data_dir: Path) -> dict[str, dict[str, Any]]:
    _, stats, _ = scan_purge(data_dir)
    for collection, values in stats.items():
        if values["removed"] != 0:
            raise RuntimeError(f"Post-purge verification failed for {collection}: {values}")
    return stats


def untouched_collections() -> tuple[str, ...]:
    return tuple(c for c in BACKUP_COLLECTIONS if c not in PURGE_COLLECTIONS)


def verify_untouched(data_dir: Path, expected: Mapping[str, str]) -> None:
    for collection in untouched_collections():
        actual = sha256_file(data_dir / f"{collection}.json")
        if actual != expected[collection]:
            raise RuntimeError(
                f"Untouched collection {collection} changed during apply: "
                f"sha256 {actual} != expected {expected[collection]}"
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--export-command", type=Path, default=DEFAULT_EXPORT_COMMAND)
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
        help=f"Backup directory, must not already exist (default: {DEFAULT_BACKUP_ROOT}/<UTC timestamp>)",
    )
    parser.add_argument("--list-ids", action="store_true", help="Print all would-be-deleted identifiers, not just the first 20")
    parser.add_argument("--apply", action="store_true", help="Perform the purge; otherwise only print a preview")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.data_dir.is_dir():
        raise RuntimeError(f"Missing data directory: {args.data_dir}")

    preview = build_preview(args.data_dir, list_ids=args.list_ids)
    preview["mode"] = "apply" if args.apply else "preview"
    print(json.dumps(preview, ensure_ascii=False, indent=2))

    if not args.apply:
        return 0
    if os.geteuid() != 0:
        raise RuntimeError("Apply mode must run as root")
    missing = [c for c in BACKUP_COLLECTIONS if not (args.data_dir / f"{c}.json").is_file()]
    if missing:
        raise RuntimeError(f"Missing collection files, refusing to apply: {', '.join(missing)}")
    if not args.export_command.is_file():
        raise RuntimeError(f"Missing export command: {args.export_command}")

    if args.backup_dir is not None:
        backup_dir = args.backup_dir
    else:
        timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = DEFAULT_BACKUP_ROOT / timestamp
    source_shas = create_backup(args.data_dir, backup_dir)

    was_active = service_is_active(args.service)
    if was_active:
        run(["systemctl", "stop", args.service])

    try:
        kept, apply_stats, _ = scan_purge(args.data_dir)
        removed_counts = {c: apply_stats[c]["removed"] for c in PURGE_COLLECTIONS}
        rewritten = replace_collections(args.data_dir, kept, removed_counts)
    finally:
        if was_active:
            run(["systemctl", "start", args.service], check=False)

    if was_active and not service_is_active(args.service):
        raise RuntimeError(f"Service failed to restart: {args.service}")

    post_stats = verify_clean(args.data_dir)
    verify_untouched(args.data_dir, source_shas)
    run([str(args.export_command)])
    final_stats = verify_clean(args.data_dir)
    verify_untouched(args.data_dir, source_shas)

    result = {
        "ok": True,
        "backupDir": str(backup_dir),
        "backupCreated": True,
        "collections": apply_stats,
        "rewrittenCollections": rewritten,
        "postVerification": final_stats,
        "untouchedCollections": {
            collection: {"sha256Verified": True, "sha256": source_shas[collection]}
            for collection in untouched_collections()
        },
        "exportCommand": str(args.export_command),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
