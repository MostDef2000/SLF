#!/usr/bin/env python3
"""One-shot quarantine of duplicate match_results_v2 rows (issue #318).

Production ``match_results_v2`` accumulated duplicate finished-match records
for the same game (e.g. game 34473385 carrying an unresolved ``?:?`` row next
to a stray ``0:0`` row next to the real ``1:0`` row).  The live API now
rejects such duplicates on append, but it cannot remove the ones already
persisted, and nothing may ever be deleted outright.

This tool moves selected rows into a quarantine file instead of deleting
them.  It is dry-run by default and prints a plan (schema
``slf_quarantine_plan_v1``) that lists every rule with the FULL matched row
dicts (every field, including ``parsedAt``/``resultKey``) so the owner can
eyeball exactly what would be removed.  ``--apply`` then performs, in order:
a byte-identical ``<results>.bak-<epoch-ms>`` backup, a
``<stem>.quarantine-<epoch-ms>.json`` file holding the removed rows, and an
atomic rewrite of the results file without them.  If any step fails the
later steps are not performed, what was already done is printed, and the
tool exits non-zero.

Quarantine rules are ``--quarantine GAME_ID:SPEC`` (repeatable):
  - SPEC ``?``   matches every row of GAME whose score is invalid;
  - SPEC ``H:A`` matches rows of GAME whose score is exactly ``{home: H,
    away: A}`` (validated ints only, so ``true``/``1.0`` never match).

The valid-score rule replicates ``vps/api/server.py:valid_finished_score``
(QR-010, the 422 contract for finished ``match_results_v2`` appends) exactly:
``score`` must be a dict whose ``home`` and ``away`` are exact Python ``int``s
in ``0..99`` — booleans are excluded because ``type(x) is int`` is ``False``
for ``bool``.

Fail-closed: malformed/non-list results, rows without ``gameId`` and
``resultKey``, unmatched rules (on ``--apply`` every rule must match at least
one row; the plan lists each unmatched rule together with that game's actual
rows so the spec can be fixed), or pre-existing backup/quarantine targets all
abort with no mutation.  When every rule matches zero rows the run is an
idempotent no-op (``nothing to do``, exit 0).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from collections import namedtuple

TOOL_VERSION = "slf_quarantine_v1"
PLAN_SCHEMA = "slf_quarantine_plan_v1"

DEFAULT_RESULTS_PATH = "/opt/slf/slf-server/data/match_results_v2.json"

ALL_INVALID_SPEC = "?"
# Exact scores are specified as strict decimals: no signs, no underscores.
EXACT_SCORE_PART = re.compile(r"\d+")

QuarantineRule = namedtuple(
    "QuarantineRule", ["game_id", "key", "all_invalid", "home", "away"]
)


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


def load_collection(path):
    """Load the results JSON-array file, failing closed on any error."""
    try:
        with open(path, "r", encoding="utf-8") as file_handle:
            payload = json.load(file_handle)
    except FileNotFoundError as error:
        raise RuntimeError(f"Missing results file: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {path}: {error}") from error
    except UnicodeDecodeError as error:
        raise RuntimeError(f"Cannot decode {path}: {error}") from error

    if not isinstance(payload, list):
        raise RuntimeError(f"Results must be a JSON list: {path}")
    return payload


def validate_rows(results):
    """Fail closed unless every row is an object carrying gameId and resultKey."""
    for index, row in enumerate(results):
        if not isinstance(row, dict):
            raise RuntimeError(f"Row {index} is not a JSON object")
        if row.get("gameId") is None:
            raise RuntimeError(f"Row {index} is missing gameId")
        if row.get("resultKey") is None:
            raise RuntimeError(f"Row {index} is missing resultKey")


def parse_rule(text):
    """Parse ``GAME_ID:SPEC`` where SPEC is ``?`` or ``H:A`` (strict decimals)."""
    parts = text.rsplit(":", 2)
    if (
        len(parts) == 3
        and parts[0]
        and EXACT_SCORE_PART.fullmatch(parts[1])
        and EXACT_SCORE_PART.fullmatch(parts[2])
    ):
        game_id = parts[0]
        return QuarantineRule(game_id, normalize_game_id(game_id), False, int(parts[1]), int(parts[2]))
    if len(parts) == 2 and parts[0] and parts[1] == ALL_INVALID_SPEC:
        game_id = parts[0]
        return QuarantineRule(game_id, normalize_game_id(game_id), True, None, None)
    raise argparse.ArgumentTypeError(
        f"invalid quarantine rule {text!r}: expected GAME_ID:? or GAME_ID:H:A"
    )


def rule_spec_label(rule):
    return ALL_INVALID_SPEC if rule.all_invalid else f"{rule.home}:{rule.away}"


def rule_matches(rule, row):
    """Whether one row is matched by one quarantine rule.

    Exact ``H:A`` matching requires the row score to be valid first, so bool
    and float components (``True`` == ``1`` in Python) never match an exact
    spec; such rows are caught by the ``?`` spec instead.
    """
    if normalize_game_id(row.get("gameId")) != rule.key:
        return False
    score = row.get("score")
    if rule.all_invalid:
        return not valid_finished_score(score)
    if not valid_finished_score(score):
        return False
    return score["home"] == rule.home and score["away"] == rule.away


def build_plan(results, rules, mode):
    """Compute the quarantine plan; returns (plan, ordered matched indices).

    A row matched by several rules is quarantined once (dedup by index) while
    every rule still reports its own hits.  Rules with zero matches are
    reported in ``unmatchedRules`` together with all rows of that game so the
    spec can be fixed.
    """
    matched_indices = set()
    rule_reports = []
    unmatched_rules = []
    for rule in rules:
        hits = [index for index, row in enumerate(results) if rule_matches(rule, row)]
        if hits:
            matched_indices.update(hits)
            rule_reports.append(
                {
                    "gameId": rule.game_id,
                    "spec": rule_spec_label(rule),
                    "matchedIndices": hits,
                    "matchedRows": [results[index] for index in hits],
                }
            )
        else:
            unmatched_rules.append(
                {
                    "gameId": rule.game_id,
                    "spec": rule_spec_label(rule),
                    "gameRows": [
                        row
                        for row in results
                        if normalize_game_id(row.get("gameId")) == rule.key
                    ],
                }
            )

    ordered_indices = sorted(matched_indices)
    plan = {
        "schema": PLAN_SCHEMA,
        "mode": mode,
        "toolVersion": TOOL_VERSION,
        "totalRecords": len(results),
        "rules": rule_reports,
        "unmatchedRules": unmatched_rules,
        "quarantinedCount": len(ordered_indices),
    }
    return plan, ordered_indices


def create_backup(results_path, backup_path):
    """Byte-for-byte copy of the results file, refusing to overwrite."""
    if os.path.exists(backup_path):
        raise RuntimeError(f"Backup target already exists, refusing to proceed: {backup_path}")
    shutil.copy2(results_path, backup_path)
    return backup_path


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_quarantine_file(quarantine_path, removed_rows, mode):
    """Write the removed rows as a JSON list, refusing to overwrite."""
    if os.path.exists(quarantine_path):
        raise RuntimeError(
            f"Quarantine target already exists, refusing to proceed: {quarantine_path}"
        )
    with open(quarantine_path, "w", encoding="utf-8") as file_handle:
        json.dump(removed_rows, file_handle, ensure_ascii=False, indent=2)
        file_handle.write("\n")
        file_handle.flush()
        os.fsync(file_handle.fileno())
    os.chmod(quarantine_path, mode)
    fsync_directory(os.path.dirname(os.path.abspath(quarantine_path)))
    return quarantine_path


def write_atomically(path, data, temp_path):
    directory = os.path.dirname(os.path.abspath(path)) or "."
    mode = os.stat(path).st_mode & 0o777
    created = False
    try:
        # O_EXCL refuses a stale or planted temp target instead of silently
        # truncating it; O_NOFOLLOW refuses to write through a planted symlink
        # (same discipline as vps/api/server.py:save_collection).
        try:
            descriptor = os.open(
                temp_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
                0o600,
            )
        except FileExistsError as error:
            raise RuntimeError(
                f"Temporary target already exists, refusing to proceed: {temp_path}"
            ) from error
        created = True
        with os.fdopen(descriptor, "w", encoding="utf-8") as file_handle:
            json.dump(data, file_handle, ensure_ascii=False, indent=2)
            file_handle.write("\n")
            file_handle.flush()
            os.fsync(file_handle.fileno())
        os.chmod(temp_path, mode)
        os.replace(temp_path, path)
        fsync_directory(directory)
    finally:
        # Only ever remove the exact temp file this run created; a target this
        # run refused to open is never ours to delete.
        if created and os.path.exists(temp_path):
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
        "--quarantine",
        action="append",
        default=[],
        type=parse_rule,
        metavar="GAME_ID:SPEC",
        help=(
            "Quarantine rule, repeatable; SPEC is '?' (all invalid-score rows "
            "of the game) or 'H:A' (exact valid score)"
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Back up, write the quarantine file and rewrite the results file (off by default)",
    )
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    mode = "apply" if args.apply else "dry_run"

    # Fail closed on missing/unparseable/non-list files and incomplete rows
    # before any side effect.
    results = load_collection(args.results)
    validate_rows(results)

    plan, matched_indices = build_plan(results, args.quarantine, mode)
    unmatched_count = len(plan["unmatchedRules"])
    plan_json = json.dumps(plan, ensure_ascii=False, indent=2)

    if unmatched_count == len(args.quarantine):
        # Every rule (possibly none were given) matched zero rows: idempotent
        # no-op, no backup is created.
        print(plan_json)
        print("nothing to do")
        return 0

    if unmatched_count:
        print(plan_json)
        if args.apply:
            print(
                f"ERROR: {unmatched_count} of {len(args.quarantine)} quarantine rules "
                "matched no rows; refusing to apply (see unmatchedRules in the plan above)",
                file=sys.stderr,
            )
            return 1
        print(
            f"NOTE: {unmatched_count} of {len(args.quarantine)} quarantine rules "
            "matched no rows (dry run; see unmatchedRules in the plan above)",
            file=sys.stderr,
        )
        return 0

    if not args.apply:
        print(plan_json)
        return 0

    epoch_ms = int(time.time() * 1000)
    backup_path = f"{args.results}.bak-{epoch_ms}"
    results_name = os.path.basename(args.results)
    stem = results_name[: -len(".json")] if results_name.endswith(".json") else results_name
    quarantine_path = os.path.join(
        os.path.dirname(os.path.abspath(args.results)),
        f"{stem}.quarantine-{epoch_ms}.json",
    )
    temp_path = f"{args.results}.{os.getpid()}.quarantine-tmp"
    file_mode = os.stat(args.results).st_mode & 0o777
    matched_set = set(matched_indices)
    removed_rows = [results[index] for index in matched_indices]
    remaining_rows = [row for index, row in enumerate(results) if index not in matched_set]

    # Fail closed on a stale or planted temp target before any side effect,
    # same discipline as the backup/quarantine refusals inside the sequence
    # below (write_atomically re-checks with O_EXCL against races).
    if os.path.exists(temp_path):
        raise RuntimeError(
            f"Temporary target already exists, refusing to proceed: {temp_path}"
        )

    # Order matters: backup first, then the quarantine file, then the rewrite.
    # If a step fails the later steps are not performed.
    completed = []
    try:
        create_backup(args.results, backup_path)
        completed.append(f"backup {backup_path}")
        write_quarantine_file(quarantine_path, removed_rows, file_mode)
        completed.append(f"quarantine {quarantine_path}")
        write_atomically(args.results, remaining_rows, temp_path)
        completed.append(f"rewrote {args.results}")
    except Exception:
        if completed:
            print("Quarantine aborted after completing:", file=sys.stderr)
            for step in completed:
                print(f"  {step}", file=sys.stderr)
        raise

    plan["backupFile"] = backup_path
    plan["quarantineFile"] = quarantine_path
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
