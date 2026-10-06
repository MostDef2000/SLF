#!/usr/bin/env python3
"""One-shot idempotent backfill of missing finished-match scores (issue #315).

Legacy ``match_results_v2`` records on production carry a finished outcome whose
score was never resolved, so their ``resultKey`` still contains the ``|?:?|``
placeholder (43 records).  The live API now rejects such records on append
(QR-010), but it cannot repair the ones already persisted.

This tool repairs those records by reading the resolved score from
``match_snapshots_v2``.  It is dry-run by default and never mutates data unless
``--apply`` is passed.  ``--apply`` backs up the results file byte-for-byte
before an atomic rewrite, and every repaired record carries provenance
(``scoreSource`` / ``backfill``) so a second run reports zero candidates.

The valid-score rule below replicates ``vps/api/server.py:valid_finished_score``
(QR-010, the 422 contract for finished ``match_results_v2`` appends) exactly:
``score`` must be a dict whose ``home`` and ``away`` are exact Python ``int``s in
``0..99`` — booleans are excluded because ``type(x) is int`` is ``False`` for
``bool``.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

BACKFILL_SCORE_SOURCE = "backfill_from_snapshots_v1"
FROM_COLLECTION = "match_snapshots_v2"
PLAN_SCHEMA = "slf_backfill_plan_v1"

DEFAULT_RESULTS_PATH = "/opt/slf/slf-server/data/match_results_v2.json"
DEFAULT_SNAPSHOTS_PATH = "/opt/slf/slf-server/data/match_snapshots_v2.json"


def valid_finished_score(score):
    # Mirrors vps/api/server.py:valid_finished_score (QR-010).  Fail closed on
    # any missing or malformed score; ints only (bool is excluded).
    if not isinstance(score, dict):
        return False
    home = score.get("home")
    away = score.get("away")
    if type(home) is not int or type(away) is not int:
        return False
    return 0 <= home <= 99 and 0 <= away <= 99


def normalize_game_id(value):
    """Normalize a gameId (int or string) to a comparable string key."""
    if value is None:
        return None
    return str(value)


def is_candidate(record):
    """A finished match_result whose score is missing or invalid."""
    if not isinstance(record, dict):
        return False
    if record.get("recordType") != "match_result":
        return False
    if record.get("status") != "finished":
        return False
    return not valid_finished_score(record.get("score"))


def load_collection(path):
    """Load a JSON-array collection file, failing closed on any error."""
    try:
        with open(path, "r", encoding="utf-8") as file_handle:
            payload = json.load(file_handle)
    except FileNotFoundError as error:
        raise RuntimeError(f"Missing collection file: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {path}: {error}") from error
    except UnicodeDecodeError as error:
        raise RuntimeError(f"Cannot decode {path}: {error}") from error

    if not isinstance(payload, list):
        raise RuntimeError(f"Collection must be a JSON list: {path}")
    return payload


def parsed_at_key(snapshot):
    """Comparable parsedAt value (int epoch ms), non-numeric treated as lowest."""
    value = snapshot.get("parsedAt")
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return value
    return 0


def best_snapshot_by_game(snapshots):
    """Map normalized gameId -> snapshot with max parsedAt among valid scores."""
    by_game = {}
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        game_id = normalize_game_id(snapshot.get("gameId"))
        if game_id is None:
            continue
        if not valid_finished_score(snapshot.get("score")):
            continue
        by_game.setdefault(game_id, []).append(snapshot)

    best = {}
    for game_id, rows in by_game.items():
        best[game_id] = max(rows, key=parsed_at_key)
    return best


def already_resolved_game_ids(results):
    """Set of normalized gameIds that already have a valid score on any result."""
    resolved = set()
    for record in results:
        if not isinstance(record, dict):
            continue
        if not valid_finished_score(record.get("score")):
            continue
        game_id = normalize_game_id(record.get("gameId"))
        if game_id is not None:
            resolved.add(game_id)
    return resolved


def build_result_key(game_id, score, teams):
    return (
        f"match_result|{game_id}|finished_match|"
        f"{score['home']}:{score['away']}|{teams[0]}-{teams[1]}"
    )


def build_plan(results, snapshots, tool_version, mode):
    """Compute the backfill plan; returns (plan_dict, resolved_candidates).

    ``resolved_candidates`` entries carry a private ``_index`` back into the
    original ``results`` list and are sorted by normalized gameId for a
    deterministic report.  Skip reasons are evaluated in this order:
    ``already_resolved`` (another result for the game already has a valid
    score), ``teams_missing`` (cannot rebuild the resultKey), then
    ``no_snapshot_score`` (no snapshot resolves the game).
    """
    best_by_game = best_snapshot_by_game(snapshots)
    resolved_game_ids = already_resolved_game_ids(results)

    candidates = []
    skipped = []
    for index, record in enumerate(results):
        if not is_candidate(record):
            continue

        game_id = record.get("gameId")
        normalized_id = normalize_game_id(game_id)
        current_key = record.get("resultKey")

        if normalized_id is not None and normalized_id in resolved_game_ids:
            skipped.append(
                {"gameId": game_id, "currentResultKey": current_key, "reason": "already_resolved"}
            )
            continue

        teams = record.get("teams")
        if not isinstance(teams, list) or len(teams) < 2:
            skipped.append(
                {"gameId": game_id, "currentResultKey": current_key, "reason": "teams_missing"}
            )
            continue

        best = best_by_game.get(normalized_id) if normalized_id is not None else None
        if best is None:
            skipped.append(
                {"gameId": game_id, "currentResultKey": current_key, "reason": "no_snapshot_score"}
            )
            continue

        score = {"home": best["score"]["home"], "away": best["score"]["away"]}
        candidates.append(
            {
                "_index": index,
                "gameId": game_id,
                "currentResultKey": current_key,
                "resolvedScore": score,
                "snapshotKey": best.get("snapshotKey"),
                "snapshotParsedAt": best.get("parsedAt"),
                "newResultKey": build_result_key(game_id, score, teams),
            }
        )

    candidates.sort(
        key=lambda entry: (
            normalize_game_id(entry["gameId"]) or "",
            str(entry["currentResultKey"] or ""),
        )
    )

    plan = {
        "schema": PLAN_SCHEMA,
        "mode": mode,
        "toolVersion": tool_version,
        "totalRecords": len(results),
        "candidateCount": len(candidates) + len(skipped),
        "resolvedCount": len(candidates),
        "skippedCount": len(skipped),
        "candidates": [
            {key: value for key, value in entry.items() if key != "_index"}
            for entry in candidates
        ],
        "skipped": skipped,
    }
    return plan, candidates


def create_backup(results_path):
    """Byte-for-byte copy of the results file to ``<results>.bak-<YYYYmmddHHMMSS>``."""
    timestamp = time.strftime("%Y%m%d%H%M%S", time.localtime())
    backup_path = f"{results_path}.bak-{timestamp}"
    if os.path.exists(backup_path):
        raise RuntimeError(f"Backup target already exists, refusing to proceed: {backup_path}")
    shutil.copy2(results_path, backup_path)
    return backup_path


def apply_rewrites(results, candidates, tool_version, applied_at_ms):
    for entry in candidates:
        record = results[entry["_index"]]
        score = entry["resolvedScore"]
        record["score"] = {"home": score["home"], "away": score["away"]}
        record["resultKey"] = entry["newResultKey"]
        record["scoreSource"] = BACKFILL_SCORE_SOURCE
        record["backfill"] = {
            "fromCollection": FROM_COLLECTION,
            "snapshotKey": entry["snapshotKey"],
            "snapshotParsedAt": entry["snapshotParsedAt"],
            "appliedAt": applied_at_ms,
            "toolVersion": tool_version,
        }


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_atomically(path, data):
    directory = os.path.dirname(os.path.abspath(path)) or "."
    temp_path = os.path.join(
        directory, f".{os.path.basename(path)}.backfill-tmp-{os.getpid()}"
    )
    mode = os.stat(path).st_mode & 0o777
    try:
        with open(temp_path, "w", encoding="utf-8") as file_handle:
            json.dump(data, file_handle, ensure_ascii=False, indent=2)
            file_handle.write("\n")
            file_handle.flush()
            os.fsync(file_handle.fileno())
        os.chmod(temp_path, mode)
        os.replace(temp_path, path)
        fsync_directory(directory)
    finally:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--results",
        default=DEFAULT_RESULTS_PATH,
        help=f"Path to match_results_v2 JSON array (default: {DEFAULT_RESULTS_PATH})",
    )
    parser.add_argument(
        "--snapshots",
        default=DEFAULT_SNAPSHOTS_PATH,
        help=f"Path to match_snapshots_v2 JSON array (default: {DEFAULT_SNAPSHOTS_PATH})",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Back up the results file and rewrite repaired records (off by default)",
    )
    parser.add_argument(
        "--tool-version",
        default="backfill_v1",
        help="Tool version recorded in the backfill provenance field (default: backfill_v1)",
    )
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    mode = "apply" if args.apply else "dry_run"

    # Fail closed on missing/unparseable/non-list files before any side effect.
    results = load_collection(args.results)
    snapshots = load_collection(args.snapshots)

    plan, resolved = build_plan(results, snapshots, args.tool_version, mode)

    if not args.apply:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    if not resolved:
        print("nothing to do")
        return 0

    backup_path = create_backup(args.results)
    apply_rewrites(results, resolved, args.tool_version, int(time.time() * 1000))
    write_atomically(args.results, results)

    plan["backupFile"] = backup_path
    plan["appliedCount"] = len(resolved)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
