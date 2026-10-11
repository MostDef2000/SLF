#!/usr/bin/env python3
"""Permanently remove invalid-score finished result rows, never other telemetry.

The operator explicitly requested no archive or backup of deleted rows.
Production apply requires a matching dry-run count and whole-file SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from typing import Any

RESULTS_FILE = Path('/opt/slf/slf-server/data/match_results_v2.json')
SERVICE = 'slf-server.service'


def valid_score(score: Any) -> bool:
    return (isinstance(score, dict)
            and type(score.get('home')) is int
            and type(score.get('away')) is int
            and 0 <= score['home'] <= 99
            and 0 <= score['away'] <= 99)


def inspect(path: Path) -> tuple[dict[str, Any], list[dict], list[dict]]:
    original = path.read_bytes()
    rows = json.loads(original.decode('utf-8'))
    if not isinstance(rows, list) or any(not isinstance(x, dict) for x in rows):
        raise RuntimeError('Refusing malformed match_results_v2 collection')
    valid, invalid = [], []
    for index, row in enumerate(rows):
        if row.get('recordType') != 'match_result' or row.get('resultType') != 'finished_match':
            raise RuntimeError(f'Refusing unexpected record schema at index {index}')
        if valid_score(row.get('score')):
            valid.append(row)
        else:
            invalid.append(row)
    valid_payload = json.dumps(valid, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    meta = {
        'schema': 'slf_invalid_result_purge_plan_v1',
        'path': str(path),
        'totalRows': len(rows),
        'validRowsPreserved': len(valid),
        'invalidRowsToDelete': len(invalid),
        'missingScoreRows': sum(x.get('score') is None for x in invalid),
        'malformedScoreRows': sum(x.get('score') is not None for x in invalid),
        'sourceSha256': hashlib.sha256(original).hexdigest(),
        'survivorDigestSha256': hashlib.sha256(valid_payload).hexdigest(),
        'destructive': True,
        'backupCreated': False,
        'archiveCreated': False,
        'otherCollectionsTouched': False,
    }
    return meta, valid, invalid


def _fsync_dir(path: Path) -> None:
    fd = os.open(str(path), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def rewrite_atomic(path: Path, survivors: list[dict]) -> None:
    original = path.stat()
    fd, temp_name = tempfile.mkstemp(prefix='.match_results_v2.purge-', suffix='.tmp', dir=path.parent)
    tmp = Path(temp_name)
    try:
        os.fchmod(fd, stat.S_IMODE(original.st_mode))
        if hasattr(os, 'fchown') and os.geteuid() == 0:
            os.fchown(fd, original.st_uid, original.st_gid)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(survivors, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        _fsync_dir(path.parent)
    finally:
        tmp.unlink(missing_ok=True)


def delete_if_exact(path: Path, expected_count: int, expected_sha: str) -> dict[str, Any]:
    before, survivors, _ = inspect(path)
    if before['invalidRowsToDelete'] != expected_count:
        raise RuntimeError('Invalid row count drift; nothing deleted')
    if before['sourceSha256'] != expected_sha:
        raise RuntimeError('Source bytes changed since preview; nothing deleted')
    if expected_count <= 0:
        raise RuntimeError('Refusing a non-positive irreversible deletion count')
    rewrite_atomic(path, survivors)
    after, retained, _ = inspect(path)
    if after['invalidRowsToDelete'] != 0 or len(retained) != before['validRowsPreserved'] or after['survivorDigestSha256'] != before['survivorDigestSha256']:
        raise RuntimeError('Post-delete survivor integrity check FAILED')
    return {
        'ok': True,
        'deletedRows': expected_count,
        'remainingValidRows': after['validRowsPreserved'],
        'postSourceSha256': after['sourceSha256'],
        'survivorDigestSha256': after['survivorDigestSha256'],
        'otherCollectionsTouched': False,
        'archiveCreated': False,
        'backupCreated': False,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--results-path', type=Path, default=RESULTS_FILE)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--expected-invalid-count', type=int)
    ap.add_argument('--expected-sha256')
    ap.add_argument('--ack-permanent-deletion', action='store_true')
    args = ap.parse_args()
    path = args.results_path
    if not args.apply:
        plan, _, _ = inspect(path)
        print(json.dumps({**plan, 'mode': 'dry_run'}, ensure_ascii=False, indent=2))
        return 0
    if path.is_symlink() or path.resolve() != RESULTS_FILE or os.geteuid() != 0:
        raise RuntimeError('Production apply is restricted to canonical file and root')
    if not args.ack_permanent_deletion or args.expected_invalid_count is None or not args.expected_sha256:
        raise RuntimeError('Apply requires deletion acknowledgement, exact count and preview source SHA')
    # No file mutation happens until the service is stopped and checksum/count
    # have been rechecked. The script never deletes code backups or raw events.
    active = subprocess.run(['systemctl', 'is-active', '--quiet', SERVICE], check=False).returncode == 0
    if active:
        subprocess.run(['systemctl', 'stop', SERVICE], check=True)
    try:
        result = delete_if_exact(path, args.expected_invalid_count, args.expected_sha256)
    finally:
        if active:
            subprocess.run(['systemctl', 'start', SERVICE], check=True)
    if active and subprocess.run(['systemctl', 'is-active', '--quiet', SERVICE], check=False).returncode != 0:
        raise RuntimeError('Service did not recover after deletion')
    print(json.dumps({**result, 'mode': 'applied'}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, UnicodeError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        raise SystemExit(1)
