#!/usr/bin/env python3
"""Bounded stdout digest of an slf_tactics_audit_252_v1 report (issue #252).

Reads the JSON report produced by vps/ops/slf_tactics_audit_252.py and prints
a fixed-shape analysis digest (8 sections, hard-capped lists) to stdout:
situation table for the audited preset, alignment aggregates over the
arteta_segments rollups, scored-games and failure-candidate tables, eligible
phase details with linked effect deltas, and the outcome split.

Read-only by construction: the report file is opened read-only and the digest
is printed to stdout — there is no output path flag and this tool writes
nothing.  Fail-closed: a missing/unreadable report, invalid JSON or a report
whose meta.schema is not ``slf_tactics_audit_252_v1`` aborts with exit code 2
and a single stderr line (no traceback, no partial digest).

Every collection field is accessed via safe getters and only whitelisted
fields are printed — raw JSON objects are never dumped.  The total stdout is
bounded (hard budget 120 lines for prod-shaped reports; every list section is
capped with a ``... +N more`` marker).

Reconciliation notes: the situation table counts decision/recommendation
events naming the audited preset (decision.preset OR
telemetry.recommendationPreset), so its TOTAL events intentionally does not
reconcile with the report's per-game artetaPhaseCount (which keys on
presetName OR decision.preset instead).  The alignment class fallbackApplied
also includes segments where actualPreset equals the audited preset while
recommendedPreset is None/absent (legacy snapshots); such segments contribute
to artetaExposureMinutes but not to recommendationMismatchMinutes, which
requires a non-None recommendation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys

DIGEST_VERSION = "slf_tactics_audit_252_digest_v1"
REPORT_SCHEMA = "slf_tactics_audit_252_v1"
DEFAULT_REPORT_PATH = "/tmp/slf_tactics_audit_252_report.json"
DEFAULT_ARTETA = "Arteta_Control433_bal3"

LINE_BUDGET = 120
SITUATION_ROWS_CAP = 10
SCORED_GAMES_CAP = 20
ELIGIBLE_PHASES_CAP = 10
FAILURE_CANDIDATES_CAP = 5
OUTCOMES = ("win", "draw", "loss")

MISSING = "missing"
UNKNOWN = "unknown"

DELTA_FIELDS = (
    "myXG",
    "oppXG",
    "xGDifference",
    "myShots",
    "oppShots",
    "shotDifference",
    "myBadActionsPct",
    "oppBadActionsPct",
)

# The eligible-phase line renders exactly these delta fields; the delta
# presence gate keys on them, so a delta carrying only a non-rendered field
# (e.g. shotDifference alone) honestly prints "effects=none-linked".
RENDERED_DELTA_FIELDS = (
    "myXG",
    "oppXG",
    "xGDifference",
    "myShots",
    "oppShots",
    "myBadActionsPct",
    "oppBadActionsPct",
)


class DigestError(Exception):
    """Fail-closed digest error (exit 2, single stderr line)."""


# ---------------------------------------------------------------------------
# Safe getters / formatting
# ---------------------------------------------------------------------------

def dict_or_none(value):
    return value if isinstance(value, dict) else {}


def list_or_empty(value):
    return value if isinstance(value, list) else []


def is_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float))


def num_or_zero(value) -> "int | float":
    return value if is_number(value) else 0


def fmt_num(value):
    """Compact deterministic number rendering (None -> '?'); never raises."""
    if value is None:
        return "?"
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = f"{value:.3f}".rstrip("0").rstrip(".")
        return text if text not in ("", "-") else "0"
    return str(value)


def situation_label(value):
    return value if isinstance(value, str) else MISSING


def arteta_games(report):
    games = dict_or_none(report.get("arteta_segments")).get("games")
    return [game for game in list_or_empty(games) if isinstance(game, dict)]


def game_segments(game):
    return [seg for seg in list_or_empty(game.get("segments")) if isinstance(seg, dict)]


def segment_span(segment):
    span = num_or_zero(segment.get("toMinute")) - num_or_zero(segment.get("fromMinute"))
    return max(span, 0)


def scored_games(games):
    """Arteta games with a finished valid result, ordered by gameId."""
    scored = [game for game in games if isinstance(game.get("finishedResult"), dict)]
    return sorted(scored, key=lambda game: str(game.get("gameId")))


def game_line(game):
    result = dict_or_none(game.get("finishedResult"))
    score = dict_or_none(result.get("score"))
    outcome = result.get("outcome")
    outcome_label = outcome if isinstance(outcome, str) else UNKNOWN
    return (
        f"  gameId={game.get('gameId')} outcome={outcome_label} "
        f"score={fmt_num(score.get('home'))}:{fmt_num(score.get('away'))} "
        f"exposure={fmt_num(game.get('artetaExposureMinutes'))} "
        f"nonStable={fmt_num(game.get('artetaNonStableMinutes'))} "
        f"mismatch={fmt_num(game.get('recommendationMismatchMinutes'))}"
    )


# ---------------------------------------------------------------------------
# Section builders (each returns a list of stdout lines)
# ---------------------------------------------------------------------------

def build_header_lines(report_path, raw, report):
    meta = dict_or_none(report.get("meta"))
    inputs = dict_or_none(meta.get("inputs"))
    rows = " ".join(
        f"{name}={dict_or_none(inputs.get(name)).get('rows')}"
        for name in ("results", "snapshots", "events", "effects")
    )
    return [
        f"report: {report_path} ({len(raw)} bytes, sha256={hashlib.sha256(raw).hexdigest()})",
        f"schema: {meta.get('schema')}",
        f"inputs: {rows}",
    ]


def build_situation_lines(report, arteta):
    """Per canonical situation, arteta-named event counts + applied minutes."""
    involved = {}
    for row in list_or_empty(report.get("events")):
        if not isinstance(row, dict):
            continue
        decision = dict_or_none(row.get("decision"))
        telemetry = dict_or_none(row.get("telemetry"))
        if decision.get("preset") != arteta and telemetry.get("recommendationPreset") != arteta:
            continue
        key = situation_label(decision.get("situation"))
        involved.setdefault(key, [0, 0])
        involved[key][0] += 1
    for game in arteta_games(report):
        for segment in game_segments(game):
            if segment.get("actualPreset") != arteta:
                continue
            key = situation_label(segment.get("situation"))
            involved.setdefault(key, [0, 0])
            involved[key][1] += segment_span(segment)

    if not involved:
        # Zero arteta involvement anywhere: collapse to a single line.
        return ["situations (arteta decision/recommendation events):", "  others=0"]

    universe = set()
    by_preset = dict_or_none(
        dict_or_none(report.get("distributions")).get("eventsByPresetSituation")
    )
    for situations in by_preset.values():
        if isinstance(situations, dict):
            universe.update(situations.keys())

    lines = ["situations (arteta decision/recommendation events):"]
    rows = sorted(involved.items(), key=lambda item: (-item[1][0], item[0]))
    for name, (count, minutes) in rows[:SITUATION_ROWS_CAP]:
        lines.append(f"  situation={name} events={count} appliedMinutes={minutes}")
    if len(rows) > SITUATION_ROWS_CAP:
        lines.append(f"  ... +{len(rows) - SITUATION_ROWS_CAP} more situations")
    lines.append(
        f"  TOTAL events={sum(item[1][0] for item in involved.items())} "
        f"appliedMinutes={sum(item[1][1] for item in involved.items())}"
    )
    not_involved = sorted(name for name in universe if name not in involved)
    lines.append(f"  notInvolved={len(not_involved)}")
    return lines


def build_alignment_lines(report, arteta):
    games = arteta_games(report)
    exposure = sum(num_or_zero(game.get("artetaExposureMinutes")) for game in games)
    non_stable = sum(num_or_zero(game.get("artetaNonStableMinutes")) for game in games)
    mismatch = sum(num_or_zero(game.get("recommendationMismatchMinutes")) for game in games)
    aligned = not_applied = fallback_applied = 0
    for game in games:
        for segment in game_segments(game):
            recommended = segment.get("recommendedPreset")
            actual = segment.get("actualPreset")
            if recommended == arteta and actual == arteta:
                aligned += 1
            elif recommended == arteta:
                not_applied += 1
            elif actual == arteta:
                fallback_applied += 1
    return [
        (
            f"alignment: artetaExposureMinutes={exposure} "
            f"artetaNonStableMinutes={non_stable} "
            f"recommendationMismatchMinutes={mismatch}"
        ),
        f"segments: aligned={aligned} notApplied={not_applied} fallbackApplied={fallback_applied}",
    ]


def build_scored_lines(report, arteta):
    games = scored_games(arteta_games(report))
    lines = [f"scored games ({len(games)} with finished valid result):"]
    for game in games[:SCORED_GAMES_CAP]:
        lines.append(game_line(game))
    if len(games) > SCORED_GAMES_CAP:
        lines.append(f"  ... +{len(games) - SCORED_GAMES_CAP} more scored games")
    return lines


def phase_situation(game, from_minute):
    """Situation of the segment covering the phase's opening minute."""
    best = None
    best_start = None
    for segment in game_segments(game):
        start = segment.get("fromMinute")
        if not is_number(start) or not is_number(from_minute) or start > from_minute:
            continue
        if best_start is None or start > best_start:
            best, best_start = segment, start
    if best is None:
        return None
    return best.get("situation")


def build_eligible_lines(report, arteta, games_by_key):
    effects = [row for row in list_or_empty(report.get("effects")) if isinstance(row, dict)]
    eligible = [
        row
        for row in effects
        if row.get("presetName") == arteta
        and dict_or_none(row.get("eligibility")).get("eligibleForRanking")
    ]
    eligible.sort(
        key=lambda row: (str(row.get("gameId")), num_or_zero(row.get("fromMinute")))
    )
    lines = [f"eligible phases ({len(eligible)}):"]
    for row in eligible[:ELIGIBLE_PHASES_CAP]:
        eligibility = dict_or_none(row.get("eligibility"))
        game = games_by_key.get(str(row.get("gameId")))
        situation = phase_situation(game, row.get("fromMinute")) if game else None
        line = (
            f"  gameId={row.get('gameId')} "
            f"situation={situation_label(situation) if situation is not None else UNKNOWN} "
            f"minutes={fmt_num(eligibility.get('durationMinutes'))} "
            f"completeness={fmt_num(eligibility.get('completeness'))}"
        )
        delta = dict_or_none(row.get("delta"))
        if any(delta.get(field) is not None for field in RENDERED_DELTA_FIELDS):
            line += (
                f" delta={fmt_num(delta.get('myXG'))}/{fmt_num(delta.get('oppXG'))}/"
                f"{fmt_num(delta.get('xGDifference'))}"
                f" shots={fmt_num(delta.get('myShots'))}:{fmt_num(delta.get('oppShots'))}"
                f" badActions={fmt_num(delta.get('myBadActionsPct'))}%:"
                f"{fmt_num(delta.get('oppBadActionsPct'))}%"
            )
        else:
            line += " effects=none-linked"
        lines.append(line)
    if len(eligible) > ELIGIBLE_PHASES_CAP:
        lines.append(f"  ... +{len(eligible) - ELIGIBLE_PHASES_CAP} more eligible phases")
    return lines


def build_outcome_lines(report, arteta):
    scored = scored_games(arteta_games(report))
    buckets = {name: [] for name in OUTCOMES}
    unknown = []
    for game in scored:
        outcome = dict_or_none(game.get("finishedResult")).get("outcome")
        if outcome in buckets:
            buckets[outcome].append(game)
        else:
            unknown.append(game)
    lines = ["outcome split (scored arteta games):"]

    def split_line(label, games):
        return (
            f"  outcome={label} games={len(games)} "
            f"exposure={sum(num_or_zero(g.get('artetaExposureMinutes')) for g in games)} "
            f"mismatch={sum(num_or_zero(g.get('recommendationMismatchMinutes')) for g in games)}"
        )

    for name in OUTCOMES:
        lines.append(split_line(name, buckets[name]))
    if unknown:
        # Scored games whose score could not be oriented (homeAway unknown).
        lines.append(split_line(UNKNOWN, unknown))
    return lines


def build_failure_lines(report, arteta):
    scored = scored_games(arteta_games(report))
    losses = [
        game
        for game in scored
        if dict_or_none(game.get("finishedResult")).get("outcome") == "loss"
    ]
    losses.sort(
        key=lambda game: (-num_or_zero(game.get("recommendationMismatchMinutes")), str(game.get("gameId")))
    )
    lines = [f"failure candidates ({len(losses)} losses, mismatch desc, max {FAILURE_CANDIDATES_CAP}):"]
    for game in losses[:FAILURE_CANDIDATES_CAP]:
        lines.append(game_line(game))
    if len(losses) > FAILURE_CANDIDATES_CAP:
        lines.append(f"  ... +{len(losses) - FAILURE_CANDIDATES_CAP} more loss games")
    return lines


# ---------------------------------------------------------------------------
# Loading and CLI
# ---------------------------------------------------------------------------

def load_report(path):
    """Read and validate the report; raise DigestError on any failure."""
    try:
        with open(path, "rb") as file_handle:
            raw = file_handle.read()
    except FileNotFoundError as error:
        raise DigestError(f"report file not found: {path}") from error
    except OSError as error:
        raise DigestError(f"cannot read report file {path}: {error}") from error
    try:
        report = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise DigestError(f"invalid JSON in report {path}: {error}") from error
    if not isinstance(report, dict):
        raise DigestError(f"report must be a JSON object: {path}")
    meta = dict_or_none(report.get("meta"))
    schema = meta.get("schema")
    if schema != REPORT_SCHEMA:
        raise DigestError(
            f"unsupported report schema {schema!r}: expected {REPORT_SCHEMA!r} ({path})"
        )
    return raw, report


def build_digest_lines(report, report_path, raw, arteta):
    games_by_key = {str(game.get("gameId")): game for game in arteta_games(report)}
    lines = []
    lines += build_header_lines(report_path, raw, report)
    lines += build_situation_lines(report, arteta)
    lines += build_alignment_lines(report, arteta)
    lines += build_scored_lines(report, arteta)
    lines += build_eligible_lines(report, arteta, games_by_key)
    lines += build_outcome_lines(report, arteta)
    lines += build_failure_lines(report, arteta)
    lines.append(f"digest: sections=8 lines={len(lines) + 1} version={DIGEST_VERSION}")
    if len(lines) > LINE_BUDGET:
        # Defensive hard budget: the section caps above keep the digest far
        # below this line; truncate rather than ever print an unbounded digest.
        return lines[: LINE_BUDGET - 1] + [
            f"digest: TRUNCATED at line budget {LINE_BUDGET} version={DIGEST_VERSION}"
        ]
    return lines


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        default=DEFAULT_REPORT_PATH,
        help=f"Path to the slf_tactics_audit_252_v1 report JSON (default: {DEFAULT_REPORT_PATH})",
    )
    parser.add_argument(
        "--arteta",
        default=DEFAULT_ARTETA,
        help=f"Audited preset name (default: {DEFAULT_ARTETA})",
    )
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    raw, report = load_report(args.report)
    for line in build_digest_lines(report, args.report, raw, args.arteta):
        print(line)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DigestError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
