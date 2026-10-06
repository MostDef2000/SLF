#!/usr/bin/env python3
"""One-shot quarantine of duplicate match_results_v2 rows (issues #318/#321).

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
atomic rewrite of the results file without them.  All three artifacts are
chowned back to the original results file's uid/gid (issue #321: a prod
incident where ``os.replace`` re-created ``match_results_v2.json`` as
``root:root`` while gunicorn runs as ``slf``); the chown is best-effort — on
``PermissionError`` (non-root run) a one-line warning is printed and the
artifact keeps the invoking user's ownership.  If any step fails the later
steps are not performed, what was already done is printed, and the tool
exits non-zero.

Quarantine rules are ``--quarantine GAME_ID:SPEC`` (repeatable):
  - SPEC ``?``   matches every row of GAME whose score is invalid;
  - SPEC ``H:A`` matches rows of GAME whose score is exactly ``{home: H,
    away: A}`` (validated ints only, so ``true``/``1.0`` never match);
  - SPEC ``H:A@keep=latest|oldest`` additionally keeps exactly one of the
    matched rows (issue #321) and quarantines the rest: the row with the
    maximum (``latest``) or minimum (``oldest``) numeric ``parsedAt``.  A
    ``parsedAt`` counts as resolvable only when it is a non-bool ``int`` or
    a finite non-bool ``float`` — a strict parsedAt-only variant of the
    backfill tool's ``parsed_at_key`` (no ``ts``/``collectedAt`` fallback).
    When NO matched row has a resolvable ``parsedAt`` the rule is refused
    and behaves exactly like an unmatched rule (dry-run lists it in
    ``unmatchedRules`` with ``reason: no_resolvable_parsed_at``;
    ``--apply`` takes the existing fail-closed unmatched path).  Ties keep
    the FIRST row in list order.  A keep rule matching exactly one row
    keeps that row and quarantines nothing (it still counts as matched, so
    the match record survives; such a run is an idempotent no-op).  The
    ``?`` spec must not carry a ``@keep`` suffix (argparse error).  Keep
    rules report ``keep``, the surviving ``keptRow`` and
    ``quarantinedIndices`` in the plan's rule report.

The valid-score rule replicates ``vps/api/server.py:valid_finished_score``
(QR-010, the 422 contract for finished ``match_results_v2`` appends) exactly:
``score`` must be a dict whose ``home`` and ``away`` are exact Python ``int``s
in ``0..99`` — booleans are excluded because ``type(x) is int`` is ``False``
for ``bool``.

Fail-closed: malformed/non-list results, rows without ``gameId`` and
``resultKey``, unmatched rules (on ``--apply`` every rule must match at least
one row; the plan lists each unmatched rule together with that game's actual
rows so the spec can be fixed — keep rules refused for lack of a resolvable
``parsedAt`` are reported the same way, with a ``reason`` field), or
pre-existing backup/quarantine targets all abort with no mutation.  When
every rule matches zero rows (or every match was kept by a single-row keep
rule) the run is an idempotent no-op (``nothing to do``, exit 0).
"""
from __future__ import annotations

import argparse
import json
import math
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
# @keep modifier suffix, exact-score specs only (issue #321).
KEEP_SUFFIX = re.compile(r"@keep=(latest|oldest)\Z")

QuarantineRule = namedtuple(
    "QuarantineRule", ["game_id", "key", "all_invalid", "home", "away", "keep"]
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
    """Parse ``GAME_ID:SPEC`` where SPEC is ``?``, ``H:A`` (strict decimals)
    or ``H:A@keep=latest|oldest`` (keep modifier, exact-score specs only)."""
    original_text = text
    keep = None
    keep_match = KEEP_SUFFIX.search(text)
    if keep_match:
        keep = keep_match.group(1)
        text = text[: keep_match.start()]
    parts = text.rsplit(":", 2)
    if (
        len(parts) == 3
        and parts[0]
        and EXACT_SCORE_PART.fullmatch(parts[1])
        and EXACT_SCORE_PART.fullmatch(parts[2])
    ):
        game_id = parts[0]
        return QuarantineRule(
            game_id, normalize_game_id(game_id), False, int(parts[1]), int(parts[2]), keep
        )
    if len(parts) == 2 and parts[0] and parts[1] == ALL_INVALID_SPEC:
        if keep is not None:
            raise argparse.ArgumentTypeError(
                f"invalid quarantine rule {original_text!r}: "
                "the '?' spec must not carry a @keep suffix"
            )
        game_id = parts[0]
        return QuarantineRule(game_id, normalize_game_id(game_id), True, None, None, None)
    raise argparse.ArgumentTypeError(
        f"invalid quarantine rule {original_text!r}: expected GAME_ID:?, "
        "GAME_ID:H:A or GAME_ID:H:A@keep=latest|oldest"
    )


def rule_spec_label(rule):
    label = ALL_INVALID_SPEC if rule.all_invalid else f"{rule.home}:{rule.away}"
    if rule.keep:
        label += f"@keep={rule.keep}"
    return label


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


def resolvable_parsed_at(row):
    """Numeric ``parsedAt`` of a row, or None when it does not resolve.

    Issue #321 keeps this strict (unlike the backfill tool's
    ``parsedAt`` -> ``ts`` -> ``collectedAt`` fallback in
    vps/ops/backfill_finished_scores.py:parsed_at_key): only the ``parsedAt``
    field counts, and only a non-bool ``int`` or a finite non-bool ``float``
    is resolvable.  ``bool`` is excluded explicitly because ``True`` is an
    ``int`` in Python.
    """
    value = row.get("parsedAt")
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    return None


def select_kept_index(hits, results, keep):
    """Index of the kept row among ``hits`` for a ``@keep`` rule, else None.

    ``latest`` keeps the maximum resolvable parsedAt, ``oldest`` the minimum;
    ties keep the FIRST row in list order (deterministic).  Returns None when
    no matched row has a resolvable parsedAt — the rule is then refused and
    reported like an unmatched rule (issue #321).
    """
    kept_index = None
    kept_at = None
    for index in hits:  # hits are in list order
        parsed_at = resolvable_parsed_at(results[index])
        if parsed_at is None:
            continue
        if kept_at is None:
            kept_index, kept_at = index, parsed_at
        elif keep == "latest" and parsed_at > kept_at:
            kept_index, kept_at = index, parsed_at
        elif keep == "oldest" and parsed_at < kept_at:
            kept_index, kept_at = index, parsed_at
    return kept_index


def build_plan(results, rules, mode):
    """Compute the quarantine plan; returns (plan, ordered matched indices).

    A row matched by several rules is quarantined once (dedup by index) while
    every rule still reports its own hits.  Rules with zero matches are
    reported in ``unmatchedRules`` together with all rows of that game so the
    spec can be fixed.  A ``@keep`` rule is refused the same way when none of
    its matches carries a resolvable ``parsedAt`` (``reason:
    no_resolvable_parsed_at``); otherwise it quarantines every matched row
    except the kept one and reports ``keep``/``keptRow``/``quarantinedIndices``.
    """
    matched_indices = set()
    rule_reports = []
    unmatched_rules = []
    for rule in rules:
        hits = [index for index, row in enumerate(results) if rule_matches(rule, row)]
        kept_index = None
        if rule.keep and hits:
            kept_index = select_kept_index(hits, results, rule.keep)
        if not hits or (rule.keep and kept_index is None):
            unmatched = {
                "gameId": rule.game_id,
                "spec": rule_spec_label(rule),
                "gameRows": [
                    row
                    for row in results
                    if normalize_game_id(row.get("gameId")) == rule.key
                ],
            }
            if rule.keep and hits:
                unmatched["reason"] = "no_resolvable_parsed_at"
                unmatched["matchedRows"] = [results[index] for index in hits]
            unmatched_rules.append(unmatched)
            continue
        if rule.keep:
            quarantined_hits = [index for index in hits if index != kept_index]
            matched_indices.update(quarantined_hits)
            rule_reports.append(
                {
                    "gameId": rule.game_id,
                    "spec": rule_spec_label(rule),
                    "matchedIndices": hits,
                    "matchedRows": [results[index] for index in hits],
                    "keep": rule.keep,
                    "keptRow": results[kept_index],
                    "quarantinedIndices": quarantined_hits,
                }
            )
            continue
        matched_indices.update(hits)
        rule_reports.append(
            {
                "gameId": rule.game_id,
                "spec": rule_spec_label(rule),
                "matchedIndices": hits,
                "matchedRows": [results[index] for index in hits],
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


def preserve_ownership(path, owner_uid, owner_gid):
    """Best-effort chown of an apply artifact to the original file's owner.

    Issue #321 prod incident: ``os.replace`` re-created match_results_v2.json
    as ``root:root`` while gunicorn runs as ``slf``.  A non-root run cannot
    chown at all; that must not fail the run — a one-line warning is printed
    and the artifact keeps the invoking user's ownership.
    """
    if owner_uid is None:
        return
    try:
        os.chown(path, owner_uid, owner_gid)
    except PermissionError:
        print(
            f"WARNING: could not chown {path} to {owner_uid}:{owner_gid} "
            "(not running as root?); artifact keeps the invoking user's ownership",
            file=sys.stderr,
        )


def create_backup(results_path, backup_path, owner_uid=None, owner_gid=None):
    """Byte-for-byte copy of the results file, refusing to overwrite."""
    if os.path.exists(backup_path):
        raise RuntimeError(f"Backup target already exists, refusing to proceed: {backup_path}")
    shutil.copy2(results_path, backup_path)
    preserve_ownership(backup_path, owner_uid, owner_gid)
    return backup_path


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_quarantine_file(quarantine_path, removed_rows, mode, owner_uid=None, owner_gid=None):
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
    preserve_ownership(quarantine_path, owner_uid, owner_gid)
    fsync_directory(os.path.dirname(os.path.abspath(quarantine_path)))
    return quarantine_path


def write_atomically(path, data, temp_path, owner_uid=None, owner_gid=None):
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
        # Chown BEFORE os.replace so the final file has the right owner from
        # the first moment on its new inode (issue #321).
        preserve_ownership(temp_path, owner_uid, owner_gid)
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
            "of the game), 'H:A' (exact valid score) or 'H:A@keep=latest|oldest' "
            "(exact score, keep one row by parsedAt and quarantine the rest)"
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

    if not matched_indices:
        # Every rule matched but kept its only row (a @keep rule matching
        # exactly one row quarantines nothing): idempotent no-op, no backup.
        print(plan_json)
        print("nothing to do")
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
    # Issue #321: capture the ORIGINAL results file's owner once — all apply
    # artifacts (backup, quarantine file, rewritten results file) must keep it.
    results_stat = os.stat(args.results)
    file_mode = results_stat.st_mode & 0o777
    owner_uid = results_stat.st_uid
    owner_gid = results_stat.st_gid
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
        create_backup(args.results, backup_path, owner_uid=owner_uid, owner_gid=owner_gid)
        completed.append(f"backup {backup_path}")
        write_quarantine_file(
            quarantine_path, removed_rows, file_mode, owner_uid=owner_uid, owner_gid=owner_gid
        )
        completed.append(f"quarantine {quarantine_path}")
        write_atomically(
            args.results, remaining_rows, temp_path, owner_uid=owner_uid, owner_gid=owner_gid
        )
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
