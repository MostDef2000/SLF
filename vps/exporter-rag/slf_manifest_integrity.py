#!/usr/bin/env python3
"""Finalize and verify the public SLF AI export before any Drive sync.

Every manifest entry is computed from *final* artifact bytes. Missing or
unsafe paths fail closed: refreshing metadata must never hide missing output.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import Any


REQUIRED_ARTIFACTS = {
    "presetEventsSummary",
    "presetEffectsSummary",
    "matchOutcomesSummary",
    "telemetryQualitySummary",
    "presetEvidence561",
    "tacticalLabSummary",
    "tacticalLabQuality",
}


class ExportIntegrityError(ValueError):
    """The export is incomplete or inconsistent; publication is forbidden."""


def _read_manifest(root: Path) -> dict[str, Any]:
    manifest_path = root / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ExportIntegrityError("Missing or invalid manifest.json") from exc
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), dict):
        raise ExportIntegrityError("Manifest has no files map")
    missing = REQUIRED_ARTIFACTS.difference(manifest["files"])
    if missing:
        raise ExportIntegrityError(f"Manifest is missing required entries: {sorted(missing)}")
    return manifest


def _safe_artifact(root: Path, entry: dict[str, Any]) -> Path:
    raw = entry.get("path")
    if not isinstance(raw, str) or not raw or "\\" in raw:
        raise ExportIntegrityError(f"Invalid artifact path: {raw!r}")
    relative = PurePosixPath(raw)
    if relative.is_absolute() or ".." in relative.parts or relative.as_posix() != raw:
        raise ExportIntegrityError(f"Unsafe artifact path: {raw!r}")
    candidate = root.joinpath(*relative.parts)
    if not candidate.is_file():
        raise ExportIntegrityError(f"Required artifact not found: {raw}")
    resolved_root = root.resolve(strict=True)
    resolved_path = candidate.resolve(strict=True)
    if resolved_root not in resolved_path.parents:
        raise ExportIntegrityError(f"Artifact escapes export root: {raw}")
    return candidate


def _measure(path: Path) -> tuple[int, str]:
    content = path.read_bytes()
    return len(content), hashlib.sha256(content).hexdigest()


def verify(root: Path) -> dict[str, Any]:
    manifest = _read_manifest(root)
    for name, entry in manifest["files"].items():
        if not isinstance(entry, dict):
            raise ExportIntegrityError(f"Invalid manifest entry: {name}")
        path = _safe_artifact(root, entry)
        size, digest = _measure(path)
        if entry.get("exists") is not True:
            raise ExportIntegrityError(f"Artifact marked absent: {name}")
        if type(entry.get("sizeBytes")) is not int or entry["sizeBytes"] != size:
            raise ExportIntegrityError(f"Size mismatch for {name}: expected {entry.get('sizeBytes')}, actual {size}")
        if entry.get("sha256") != digest:
            raise ExportIntegrityError(f"SHA-256 mismatch for {name}")
    return {"ok": True, "verifiedFiles": len(manifest["files"]), "out": str(root)}


def finalize(root: Path) -> dict[str, Any]:
    manifest = _read_manifest(root)
    for name, entry in manifest["files"].items():
        if not isinstance(entry, dict):
            raise ExportIntegrityError(f"Invalid manifest entry: {name}")
        path = _safe_artifact(root, entry)
        size, digest = _measure(path)
        entry.update({"exists": True, "sizeBytes": size, "sha256": digest})

    destination = root / "manifest.json"
    temporary = root / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination)
    return verify(root)


def main() -> int:
    parser = argparse.ArgumentParser(description="Finalize/verify SLF AI export file hashes")
    parser.add_argument("--out", type=Path, required=True)
    commands = parser.add_mutually_exclusive_group(required=True)
    commands.add_argument("--finalize", action="store_true", help="Refresh every manifest entry and verify")
    commands.add_argument("--verify", action="store_true", help="Verify without modifying the export")
    args = parser.parse_args()
    try:
        result = finalize(args.out) if args.finalize else verify(args.out)
    except (ExportIntegrityError, OSError) as exc:
        parser.exit(1, f"ERROR: SLF export integrity failed: {exc}\n")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
