#!/usr/bin/env python3
"""Read-only audit extraction for the production-tactics audit (issue #252).

Evidence-collection tooling only: it reads the four tactical collections
(``match_results_v2``, ``match_snapshots_v2``, ``preset_events_v2``,
``preset_effects_v2``) and writes ONE bounded JSON report (schema
``slf_tactics_audit_252_v1``) to ``--out`` (default under ``/tmp``).  It never
mutates production data, presets or policy — input files are opened read-only
and the report file is the only thing this tool writes.

Purpose: test the hypothesis that ``Arteta_Control433_bal3`` underperforms by
joining finished-match outcome cohorts with per-phase events/effects and
per-minute snapshot segments (situation / recommended / actual preset /
score-state change-points), plus distribution and linkage rollups.  Collection
growth is also observable: coverage reports duplicate rows per gameId (the
same duplicate family as game 33723318).

Input modes:
  - file mode (default): reads the four JSON-array collection files;
  - ``--api``: GET ``{api_base}/{collection}`` with an ``Authorization:
    Bearer <SLF_API_TOKEN>`` header.  The token is read ONLY from the
    environment variable ``SLF_API_TOKEN`` (fail-closed error when missing)
    and is never printed, logged, or accepted as a CLI argument.  ``api_base``
    defaults to ``$SLF_API_BASE`` else ``http://127.0.0.1:5000/api`` (same
    contract as vps/ops/verify_api_deployment.py).

Fail-closed: missing/unparseable/non-list inputs, non-object rows and rows
without ``gameId`` abort with a clear stderr message and a non-zero exit
before the report is written.  Every collection field is accessed via safe
getters (epoch variance: pre-4.4.328 rows lack ``ruleDecision``, pre-v4 rows
lack ``phaseId``), so absent fields become ``None`` instead of errors.

Determinism: rows are sorted (gameId, then minute/ts; stable ties keep file
order), histogram keys are emitted sorted, and the report is dumped with
``ensure_ascii=False, indent=2``.  ``gameId`` may be int or string — joins
normalize via ``str()`` keys internally while outputs preserve the original
value.  The valid-score rule replicates
``vps/api/server.py:valid_finished_score`` (QR-010) exactly via the shared
mirror used by vps/ops/quarantine_duplicate_results.py and
vps/ops/backfill_finished_scores.py: ``score`` must be a dict whose ``home``
and ``away`` are exact Python ints in ``0..99`` (booleans excluded because
``type(x) is int`` is False for bool).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

REPORT_SCHEMA = "slf_tactics_audit_252_v1"

DEFAULT_RESULTS_PATH = "/opt/slf/slf-server/data/match_results_v2.json"
DEFAULT_SNAPSHOTS_PATH = "/opt/slf/slf-server/data/match_snapshots_v2.json"
DEFAULT_EVENTS_PATH = "/opt/slf/slf-server/data/preset_events_v2.json"
DEFAULT_EFFECTS_PATH = "/opt/slf/slf-server/data/preset_effects_v2.json"

DEFAULT_ARTETA = "Arteta_Control433_bal3"
DEFAULT_API_BASE = "http://127.0.0.1:5000/api"
API_TIMEOUT_SECONDS = 30.0

# Duplicate-family probe requested by the issue #252 audit (gameId may be an
# int or a string in stored rows, so the probe key is normalized).
DUP_AUDIT_GAME_KEY = "33723318"

STABLE_SITUATION = "stable_control"
MISSING_BUCKET = "missing"

COLLECTIONS = ("results", "snapshots", "events", "effects")

TELEMETRY_KEYS = (
    "homeAway",
    "scoreState",
    "strengthGap",
    "strengthGapBucket",
    "presetId",
    "recommendationPreset",
    "riskAppetite",
    "explorationApplied",
    "completeness",
)
TACTIC_CONTEXT_KEYS = (
    "appliedPreset",
    "appliedTactic",
    "tacticFingerprint",
    "transitionSource",
    "closeReason",
)
DELTA_KEYS = (
    "myXG",
    "oppXG",
    "xGDifference",
    "myShots",
    "oppShots",
    "shotDifference",
    "myBadActionsPct",
    "oppBadActionsPct",
    "myPower",
    "oppPower",
    "strengthGap",
)
ELIGIBILITY_KEYS = (
    "durationMinutes",
    "completeness",
    "eligibleForRanking",
    "reasons",
)


# ---------------------------------------------------------------------------
# Shared mirrors / safe getters
# ---------------------------------------------------------------------------

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


def resolvable_ts(row, field):
    """Numeric non-bool ``row[field]`` (int or finite float), else None.

    Strict single-field variant of the backfill tool's parsed_at_key: each
    collection has one canonical timestamp (``parsedAt`` for results, ``ts``
    for the others) and no fallback chain, per the issue #252 spec.
    """
    value = row.get(field)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    return None


def is_v4_row(row):
    """schemaVersion 4, strict int (bool/float/string variants count as legacy)."""
    value = row.get("schemaVersion")
    return type(value) is int and value == 4


def dict_or_none(value):
    return value if isinstance(value, dict) else {}


def sort_bucket(minute):
    """None-safe numeric sort key component ((1, 0) sorts after any number)."""
    if isinstance(minute, bool) or not isinstance(minute, (int, float)):
        return (1, 0)
    if isinstance(minute, float) and not math.isfinite(minute):
        return (1, 0)
    return (0, minute)


def histogram(counter):
    """Deterministic {key: count} map with sorted keys."""
    return {key: counter[key] for key in sorted(counter)}


def validate_rows(rows, collection):
    """Fail closed unless every row is an object carrying a gameId."""
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise RuntimeError(f"{collection} row {index} is not a JSON object")
        if row.get("gameId") is None:
            raise RuntimeError(f"{collection} row {index} is missing gameId")


# ---------------------------------------------------------------------------
# Input loading (file mode read-only / API mode GET)
# ---------------------------------------------------------------------------

def load_collection_file(path):
    """Read a JSON-array collection file read-only; returns (raw_bytes, rows)."""
    try:
        with open(path, "rb") as file_handle:
            raw = file_handle.read()
    except FileNotFoundError as error:
        raise RuntimeError(f"Missing collection file: {path}") from error
    except MemoryError as error:
        raise RuntimeError(f"Out of memory reading {path}; file too large") from error
    except OSError as error:
        raise RuntimeError(f"Cannot read collection file {path}: {error}") from error
    return raw, parse_collection_bytes(raw, path)


def parse_collection_bytes(raw, source_label):
    try:
        payload = json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise RuntimeError(f"Cannot decode {source_label}: {error}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in {source_label}: {error}") from error
    except MemoryError as error:
        raise RuntimeError(
            f"Out of memory parsing {source_label} ({len(raw)} bytes); "
            "collection too large for in-process JSON load"
        ) from error
    if not isinstance(payload, list):
        raise RuntimeError(f"Collection must be a JSON list: {source_label}")
    return payload


def fetch_collection(api_base, collection, token):
    """GET one collection over the live API; returns (raw_bytes, rows).

    The token is only placed in the Authorization header of the request; it is
    never part of any error message, log line, or report field.
    """
    url = f"{api_base.rstrip('/')}/{collection}"
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        # error.code and reason only — never the request headers (token).
        raise RuntimeError(
            f"API request failed for {url}: HTTP {error.code} {error.reason}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"API request failed for {url}: {error.reason}") from error
    except OSError as error:
        raise RuntimeError(f"API request failed for {url}: {error}") from error
    except ValueError as error:
        # http.client raises ValueError("Invalid header value %r ...") when a
        # header value is malformed — e.g. an API token carrying a control
        # character such as a trailing \r — and that repr embeds the full
        # Authorization header value.  The message must therefore never
        # propagate (token-leak guard; same discipline as
        # vps/ops/verify_api_deployment.py's fail-closed token handling).
        raise RuntimeError(
            f"API request failed for {url}: invalid request headers "
            "(rejected by http.client; the token value is never echoed)"
        ) from error
    return raw, parse_collection_bytes(raw, url)


def redact_secrets(message, token):
    """Replace any occurrence of ``token`` in ``message`` with "[redacted]".

    Backstop for the token-never-printed invariant: the ``__main__`` catch-all
    redacts the API token from every error text before it reaches stderr, so a
    library exception embedding the header value can never leak it.  An empty
    or absent token leaves the message unchanged (nothing to redact).
    """
    if not token:
        return message
    return message.replace(token, "[redacted]")


# ---------------------------------------------------------------------------
# Row reductions (events / effects)
# ---------------------------------------------------------------------------

def reduce_telemetry(row):
    source = dict_or_none(row.get("telemetry"))
    return {key: source.get(key) for key in TELEMETRY_KEYS}


def reduce_decision(row):
    rule_decision = row.get("ruleDecision")
    if not isinstance(rule_decision, dict):
        return None
    action = dict_or_none(rule_decision.get("action"))
    return {
        "preset": action.get("preset"),
        "situation": action.get("decision"),
        "score": action.get("score"),
        "confidence": rule_decision.get("confidence"),
        "guardType": action.get("guardType"),
    }


def reduce_active_signals(row):
    rule_decision = row.get("ruleDecision")
    if not isinstance(rule_decision, dict):
        return []
    signals = rule_decision.get("signals")
    if not isinstance(signals, dict):
        return []
    return sorted(str(key) for key, value in signals.items() if value)


def reduce_named_object(row, name, keys):
    source = dict_or_none(row.get(name))
    return {key: source.get(key) for key in keys}


def build_event_row(row):
    return {
        "gameId": row.get("gameId"),
        "phaseId": row.get("phaseId"),
        "phaseSequence": row.get("phaseSequence"),
        "presetName": row.get("presetName"),
        "minute": row.get("minute"),
        "bucket": row.get("bucket"),
        "ts": row.get("ts"),
        "scriptVersion": row.get("scriptVersion"),
        "telemetry": reduce_telemetry(row),
        "decision": reduce_decision(row),
        "activeSignals": reduce_active_signals(row),
    }


def build_effect_row(row):
    return {
        "gameId": row.get("gameId"),
        "sessionId": row.get("sessionId"),
        "phaseId": row.get("phaseId"),
        "phaseSequence": row.get("phaseSequence"),
        "presetName": row.get("presetName"),
        "fromMinute": row.get("fromMinute"),
        "toMinute": row.get("toMinute"),
        "fromBucket": row.get("fromBucket"),
        "toBucket": row.get("toBucket"),
        "scriptVersion": row.get("scriptVersion"),
        "tacticContext": reduce_named_object(row, "tacticContext", TACTIC_CONTEXT_KEYS),
        "delta": reduce_named_object(row, "delta", DELTA_KEYS),
        "eligibility": reduce_named_object(row, "eligibility", ELIGIBILITY_KEYS),
        "telemetry": reduce_telemetry(row),
    }


# ---------------------------------------------------------------------------
# Coverage
# ---------------------------------------------------------------------------

def results_coverage(results):
    total = len(results)
    finished = 0
    live = 0
    finished_valid = 0
    missing_score = 0
    invalid_score = 0
    game_keys = set()
    dup_audit_rows = 0
    for row in results:
        status = row.get("status")
        if status == "finished":
            finished += 1
            if valid_finished_score(row.get("score")):
                finished_valid += 1
            elif row.get("score") is None:
                missing_score += 1
            else:
                invalid_score += 1
        elif status == "live":
            live += 1
        game_key = normalize_game_id(row.get("gameId"))
        game_keys.add(game_key)
        if game_key == DUP_AUDIT_GAME_KEY:
            dup_audit_rows += 1
    distinct_games = len(game_keys)
    # Rows beyond the first per gameId (file order) = rows - distinct games.
    duplicate_game_rows = total - distinct_games
    return {
        "totalRows": total,
        "finishedRows": finished,
        "liveRows": live,
        "finishedValidScoreRows": finished_valid,
        "finishedInvalidScoreRows": missing_score + invalid_score,
        "finishedInvalidScoreReasons": {
            "missing_score": missing_score,
            "invalid_score": invalid_score,
        },
        "distinctGames": distinct_games,
        "duplicateGameIdRows": duplicate_game_rows,
        f"gameId{DUP_AUDIT_GAME_KEY}Rows": dup_audit_rows,
    }


def snapshot_coverage(snapshots):
    game_keys = set()
    seen_minutes = set()
    duplicates = 0
    for row in snapshots:
        game_key = normalize_game_id(row.get("gameId"))
        game_keys.add(game_key)
        minute_key = (game_key, str(row.get("minute")))
        if minute_key in seen_minutes:
            duplicates += 1
        else:
            seen_minutes.add(minute_key)
    return {
        "totalRows": len(snapshots),
        "distinctGames": len(game_keys),
        "duplicateMinuteRows": duplicates,
    }


def phase_coverage(rows):
    v4 = sum(1 for row in rows if is_v4_row(row))
    with_decision = sum(1 for row in rows if isinstance(row.get("ruleDecision"), dict))
    return {
        "totalRows": len(rows),
        "v4Rows": v4,
        "legacyRows": len(rows) - v4,
        "rowsWithRuleDecision": with_decision,
    }


# ---------------------------------------------------------------------------
# Results outcome cohort
# ---------------------------------------------------------------------------

def build_cohort_rows(results):
    """Outcome cohort: finished + valid score + myTeam + gameId, deduped per
    gameId keeping the LATEST resolvable parsedAt (ties keep the first row in
    file order).  Coverage above counts everything; this is the joined view."""
    latest = {}
    for row in results:
        if row.get("status") != "finished":
            continue
        if not valid_finished_score(row.get("score")):
            continue
        game_key = normalize_game_id(row.get("gameId"))
        if game_key is None:
            continue
        if row.get("myTeam") is None:
            continue
        parsed_at = resolvable_ts(row, "parsedAt")
        current = latest.get(game_key)
        if current is None:
            latest[game_key] = (parsed_at, row)
        elif parsed_at is not None and (current[0] is None or parsed_at > current[0]):
            latest[game_key] = (parsed_at, row)

    cohort_rows = [
        build_cohort_row(game_key, row) for game_key, (_, row) in latest.items()
    ]
    cohort_rows.sort(key=lambda entry: normalize_game_id(entry["gameId"]) or "")
    return cohort_rows


def build_cohort_row(game_key, row):
    teams = row.get("teams")
    if not isinstance(teams, list):
        teams = []
    my_team = row.get("myTeam")
    if len(teams) >= 1 and my_team == teams[0]:
        home_away = "home"
    elif len(teams) >= 2 and my_team == teams[1]:
        home_away = "away"
    else:
        home_away = "unknown"
    score = dict_or_none(row.get("score"))
    if home_away == "home":
        my_goals, opp_goals = score.get("home"), score.get("away")
    elif home_away == "away":
        my_goals, opp_goals = score.get("away"), score.get("home")
    else:
        # Cannot orient the score without a side; keep the audit honest
        # instead of guessing (myGoals/oppGoals/outcome/points stay None).
        my_goals, opp_goals = None, None
    if my_goals is None or opp_goals is None:
        outcome, points = None, None
    elif my_goals > opp_goals:
        outcome, points = "win", 3
    elif my_goals < opp_goals:
        outcome, points = "loss", 0
    else:
        outcome, points = "draw", 1
    source = dict_or_none(row.get("source"))
    tactic_telemetry = dict_or_none(row.get("tacticTelemetry"))
    context = dict_or_none(row.get("telemetryContext"))
    return {
        "gameId": row.get("gameId"),
        "parsedAt": row.get("parsedAt"),
        "teams": teams,
        "myTeam": my_team,
        "homeAway": home_away,
        "score": {"home": score.get("home"), "away": score.get("away")},
        "myGoals": my_goals,
        "oppGoals": opp_goals,
        "outcome": outcome,
        "points": points,
        "userscriptVersion": source.get("scriptVersion"),
        "initialPreset": row.get("initialPreset"),
        "currentPreset": row.get("currentPreset"),
        "transitionCount": row.get("transitionCount"),
        "riskAppetite": tactic_telemetry.get("riskAppetite"),
        "scoreState": context.get("scoreState"),
    }


# ---------------------------------------------------------------------------
# Events / effects sections
# ---------------------------------------------------------------------------

def event_sort_key(entry):
    return (
        normalize_game_id(entry["gameId"]) or "",
        sort_bucket(entry["minute"]),
        sort_bucket(entry["ts"]),
    )


def effect_sort_key(entry):
    return (
        normalize_game_id(entry["gameId"]) or "",
        sort_bucket(entry["fromMinute"]),
        sort_bucket(entry["toMinute"]),
    )


def build_phase_sections(events, effects):
    v4_events = [build_event_row(row) for row in events if is_v4_row(row)]
    v4_effects = [build_effect_row(row) for row in effects if is_v4_row(row)]
    v4_events.sort(key=event_sort_key)
    v4_effects.sort(key=effect_sort_key)
    return v4_events, v4_effects


# ---------------------------------------------------------------------------
# Arteta segments (snapshot change-points per Arteta game)
# ---------------------------------------------------------------------------

def snapshot_features(snapshot):
    """(situation, recommendedPreset, actualPreset, scoreState) of one snapshot."""
    rule_decision = dict_or_none(snapshot.get("ruleDecision"))
    action = dict_or_none(rule_decision.get("action"))
    situation = action.get("decision")
    tactic_telemetry = dict_or_none(snapshot.get("tacticTelemetry"))
    recommended = action.get("preset")
    if recommended is None:
        recommended = tactic_telemetry.get("recommendedPreset")
    actual = tactic_telemetry.get("currentPreset")
    if actual is None:
        actual = dict_or_none(snapshot.get("tacticalPhase")).get("presetId")
    score_state = dict_or_none(snapshot.get("telemetryContext")).get("scoreState")
    return (situation, recommended, actual, score_state)


def dedupe_snapshots_by_minute(snapshots):
    """Per game_key: dedupe (gameId, minute) keeping the LATEST ts, ordered by
    numeric minute (rows without a numeric minute are ignored for segments)."""
    by_game = {}
    for row in snapshots:
        minute = row.get("minute")
        if isinstance(minute, bool) or not isinstance(minute, (int, float)):
            continue
        if isinstance(minute, float) and not math.isfinite(minute):
            continue
        game_key = normalize_game_id(row.get("gameId"))
        minute_key = str(minute)
        ts = resolvable_ts(row, "ts")
        game_map = by_game.setdefault(game_key, {})
        current = game_map.get(minute_key)
        if current is None:
            game_map[minute_key] = (minute, ts, row)
        elif ts is not None and (current[1] is None or ts > current[1]):
            game_map[minute_key] = (minute, ts, row)
    ordered = {}
    for game_key, game_map in by_game.items():
        rows = sorted(game_map.values(), key=lambda item: item[0])
        ordered[game_key] = [(minute, snapshot_features(row)) for minute, _, row in rows]
    return ordered


def build_segments(features_by_minute):
    """Change-point segments: a new segment starts when ANY of (situation,
    recommendedPreset, actualPreset, scoreState) changes vs the previous
    snapshot.  A segment ends where the NEXT segment starts (the minute the
    change was observed), so consecutive segments tile the observed match and
    span = toMinute - fromMinute is the minutes the features held; the final
    segment runs to the last observed snapshot minute."""
    segments = []
    for minute, features in features_by_minute:
        if segments and features == segments[-1]["features"]:
            # Same run: the open segment keeps holding until a change appears.
            continue
        if segments:
            segments[-1]["toMinute"] = minute
        segments.append({"fromMinute": minute, "toMinute": None, "features": features})
    if segments:
        segments[-1]["toMinute"] = features_by_minute[-1][0]
    return [close_segment(segment) for segment in segments]


def close_segment(segment):
    situation, recommended, actual, score_state = segment["features"]
    return {
        "fromMinute": segment["fromMinute"],
        "toMinute": segment["toMinute"],
        "situation": situation,
        "recommendedPreset": recommended,
        "actualPreset": actual,
        "scoreState": score_state,
    }


def segment_span(segment):
    span = segment["toMinute"]
    start = segment["fromMinute"]
    if isinstance(span, bool) or not isinstance(span, (int, float)):
        return 0
    if isinstance(start, bool) or not isinstance(start, (int, float)):
        return 0
    return max(span - start, 0)


def arteta_event_matches(row, arteta):
    if row.get("presetName") == arteta:
        return True
    decision = reduce_decision(row)
    return decision is not None and decision.get("preset") == arteta


def collect_arteta_games(events, effects, arteta):
    """game_key -> {events: [...raw...], effects: [...raw...]} for games with
    at least one qualifying event (presetName or decision.preset) or effect
    (presetName)."""
    games = {}
    for row in events:
        if arteta_event_matches(row, arteta):
            games.setdefault(normalize_game_id(row.get("gameId")), {"events": [], "effects": []})["events"].append(row)
    for row in effects:
        if row.get("presetName") == arteta:
            games.setdefault(normalize_game_id(row.get("gameId")), {"events": [], "effects": []})["effects"].append(row)
    return games


def numeric_min(values):
    values = [value for value in values if is_number(value)]
    return min(values) if values else None


def numeric_max(values):
    values = [value for value in values if is_number(value)]
    return max(values) if values else None


def is_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and (
        not isinstance(value, float) or math.isfinite(value)
    )


def build_arteta_segments(arteta_games, snapshots_by_game, cohort_by_key, arteta):
    game_entries = []
    for game_key in sorted(arteta_games):
        phases = arteta_games[game_key]
        events = phases["events"]
        effects = phases["effects"]
        features_by_minute = snapshots_by_game.get(game_key, [])
        segments = build_segments(features_by_minute)

        exposure = 0
        non_stable = 0
        mismatch = 0
        first_non_stable_minute = None
        for segment in segments:
            span = segment_span(segment)
            if segment["actualPreset"] == arteta:
                exposure += span
                if segment["situation"] not in (None, STABLE_SITUATION):
                    non_stable += span
            if (
                segment["recommendedPreset"] is not None
                and segment["recommendedPreset"] != segment["actualPreset"]
            ):
                mismatch += span
        for minute, features in features_by_minute:
            if features[0] is not None and features[0] != STABLE_SITUATION:
                first_non_stable_minute = minute
                break

        event_minutes = [row.get("minute") for row in events]
        effect_minutes = [row.get("fromMinute") for row in effects]
        cohort = cohort_by_key.get(game_key)
        if cohort is not None:
            finished_result = {
                "outcome": cohort["outcome"],
                "score": dict(cohort["score"]),
                "homeAway": cohort["homeAway"],
            }
        else:
            finished_result = None
        game_entries.append(
            {
                "gameId": (events or effects)[0].get("gameId"),
                "finishedResult": finished_result,
                "artetaPhaseCount": len(events) + len(effects),
                "firstArtetaMinute": numeric_min(event_minutes + effect_minutes),
                "lastArtetaMinute": numeric_max(event_minutes + effect_minutes),
                "firstNonStableSituationMinute": first_non_stable_minute,
                "matchEndMinute": numeric_max(
                    [minute for minute, _ in features_by_minute]
                ),
                "artetaExposureMinutes": exposure,
                "artetaNonStableMinutes": non_stable,
                "recommendationMismatchMinutes": mismatch,
                "segments": segments,
            }
        )
    return game_entries


# ---------------------------------------------------------------------------
# Distributions / linkage
# ---------------------------------------------------------------------------

def script_version_of(row, collection):
    if collection == "results":
        value = dict_or_none(row.get("source")).get("scriptVersion")
    else:
        value = row.get("scriptVersion")
    if value is None:
        return MISSING_BUCKET
    if isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True)


def build_distributions(events, effects, v4_events, v4_effects, raw_collections):
    events_by_preset = {}
    events_by_preset_situation = {}
    recommendation_counts = {}
    for entry in v4_events:
        preset = entry["presetName"]
        preset_key = preset if isinstance(preset, str) else json.dumps(preset, sort_keys=True) if preset is not None else MISSING_BUCKET
        events_by_preset[preset_key] = events_by_preset.get(preset_key, 0) + 1
        situation = entry["decision"]["situation"] if entry["decision"] else None
        situation_key = situation if isinstance(situation, str) else json.dumps(situation, sort_keys=True) if situation is not None else MISSING_BUCKET
        by_situation = events_by_preset_situation.setdefault(preset_key, {})
        by_situation[situation_key] = by_situation.get(situation_key, 0) + 1
        if entry["decision"] and entry["decision"]["preset"] is not None:
            recommended = entry["decision"]["preset"]
            recommended_key = recommended if isinstance(recommended, str) else json.dumps(recommended, sort_keys=True)
            recommendation_counts[recommended_key] = recommendation_counts.get(recommended_key, 0) + 1

    eligible = 0
    ineligible = 0
    reason_counts = {}
    for entry in v4_effects:
        if entry["eligibility"]["eligibleForRanking"]:
            eligible += 1
        else:
            ineligible += 1
        reasons = entry["eligibility"]["reasons"]
        if isinstance(reasons, (list, tuple)):
            reason_items = list(reasons)
        elif reasons is None:
            reason_items = []
        else:
            reason_items = [reasons]
        for reason in reason_items:
            reason_key = reason if isinstance(reason, str) else json.dumps(reason, sort_keys=True)
            reason_counts[reason_key] = reason_counts.get(reason_key, 0) + 1

    version_histogram = {
        collection: histogram_versions(rows, collection)
        for collection, rows in raw_collections.items()
    }
    return {
        "eventsByPreset": histogram(events_by_preset),
        "eventsByPresetSituation": {
            preset: histogram(by_situation)
            for preset, by_situation in sorted(events_by_preset_situation.items())
        },
        "recommendationCounts": histogram(recommendation_counts),
        "effectEligibility": {
            "eligibleCount": eligible,
            "ineligibleCount": ineligible,
            "reasons": histogram(reason_counts),
        },
        "scriptVersionHistogram": {
            collection: version_histogram[collection] for collection in COLLECTIONS
        },
    }


def histogram_versions(rows, collection):
    counter = {}
    for row in rows:
        version = script_version_of(row, collection)
        counter[version] = counter.get(version, 0) + 1
    return histogram(counter)


def build_linkage(arteta_game_entries, arteta_games, arteta):
    eligible_phases = 0
    exposure_minutes = 0
    for row in arteta_games.values():
        for effect in row["effects"]:
            eligibility = dict_or_none(effect.get("eligibility"))
            if eligibility.get("eligibleForRanking"):
                eligible_phases += 1
            duration = eligibility.get("durationMinutes")
            if isinstance(duration, (int, float)) and not isinstance(duration, bool):
                exposure_minutes += duration
    with_result = sum(1 for entry in arteta_game_entries if entry["finishedResult"] is not None)
    return {
        "artetaGames": len(arteta_game_entries),
        "artetaGamesWithFinishedValidResult": with_result,
        "artetaPhasesTotal": sum(entry["artetaPhaseCount"] for entry in arteta_game_entries),
        "artetaEligiblePhases": eligible_phases,
        "artetaPhaseExposureMinutes": exposure_minutes,
    }


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------

def build_report(results, snapshots, events, effects, *, arteta, inputs, generated_at):
    """Assemble the full report dict.  ``inputs`` maps collection name to
    {path, bytes, sha256, rows}; ``results`` etc. are the parsed row lists."""
    validate_rows(results, "results")
    validate_rows(snapshots, "snapshots")
    validate_rows(events, "events")
    validate_rows(effects, "effects")

    coverage = {
        "results": results_coverage(results),
        "snapshots": snapshot_coverage(snapshots),
        "events": phase_coverage(events),
        "effects": phase_coverage(effects),
    }
    cohort_rows = build_cohort_rows(results)
    cohort_by_key = {
        normalize_game_id(entry["gameId"]): entry for entry in cohort_rows
    }
    v4_events, v4_effects = build_phase_sections(events, effects)

    arteta_games = collect_arteta_games(events, effects, arteta)
    snapshots_by_game = dedupe_snapshots_by_minute(snapshots)
    arteta_game_entries = build_arteta_segments(
        arteta_games, snapshots_by_game, cohort_by_key, arteta
    )

    distributions = build_distributions(
        events, effects, v4_events, v4_effects,
        {"results": results, "snapshots": snapshots, "events": events, "effects": effects},
    )
    linkage = build_linkage(arteta_game_entries, arteta_games, arteta)

    freshness = {
        "results": numeric_max([resolvable_ts(row, "parsedAt") for row in results]),
        "snapshots": numeric_max([resolvable_ts(row, "ts") for row in snapshots]),
        "events": numeric_max([resolvable_ts(row, "ts") for row in events]),
        "effects": numeric_max([resolvable_ts(row, "ts") for row in effects]),
    }

    return {
        "meta": {
            "schema": REPORT_SCHEMA,
            "scriptVersion": REPORT_SCHEMA,
            "generatedAt": generated_at,
            "artetaPreset": arteta,
            "inputs": {name: inputs[name] for name in COLLECTIONS},
            "freshness": freshness,
        },
        "coverage": coverage,
        "results_cohort": cohort_rows,
        "events": v4_events,
        "effects": v4_effects,
        "arteta_segments": {"games": arteta_game_entries},
        "distributions": distributions,
        "linkage": linkage,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def render_report_bytes(report):
    return (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_report(path, payload):
    # The report file is the ONLY thing this tool writes; inputs are read-only.
    with open(path, "wb") as file_handle:
        file_handle.write(payload)
        file_handle.flush()
        os.fsync(file_handle.fileno())


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
        "--events",
        default=DEFAULT_EVENTS_PATH,
        help=f"Path to preset_events_v2 JSON array (default: {DEFAULT_EVENTS_PATH})",
    )
    parser.add_argument(
        "--effects",
        default=DEFAULT_EFFECTS_PATH,
        help=f"Path to preset_effects_v2 JSON array (default: {DEFAULT_EFFECTS_PATH})",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Report output path (default: /tmp/slf_tactics_audit_252_<epoch_ms>.json)",
    )
    parser.add_argument(
        "--arteta",
        default=DEFAULT_ARTETA,
        help=f"Audited preset name (default: {DEFAULT_ARTETA})",
    )
    parser.add_argument(
        "--api",
        action="store_true",
        help="Fetch collections from the live API instead of reading files",
    )
    parser.add_argument(
        "--api-base",
        default=None,
        help=(
            "API base URL (default: $SLF_API_BASE else "
            f"{DEFAULT_API_BASE}); --api only"
        ),
    )
    return parser


def default_out_path(epoch_ms):
    return f"/tmp/slf_tactics_audit_252_{epoch_ms}.json"


def ensure_out_is_not_input(out_path, input_paths):
    """Structural read-only guard: the report file must never overwrite one of
    the input collection files.  Compares fully resolved paths, so a relative
    ``--out`` that lands on an input file is refused too."""
    out_abs = os.path.realpath(out_path)
    for path in input_paths:
        if path and os.path.realpath(path) == out_abs:
            raise RuntimeError(
                f"Refusing to write the report over an input collection file: {out_path}"
            )


def load_inputs(args):
    """Load the four collections in file or API mode.

    Returns (collections_by_name, inputs_meta).  The API token never leaves
    this function except inside the Authorization header.
    """
    if args.api:
        api_base = args.api_base or os.environ.get("SLF_API_BASE") or DEFAULT_API_BASE
        token = os.environ.get("SLF_API_TOKEN")
        if not token:
            raise RuntimeError(
                "SLF_API_TOKEN is required in the environment for --api mode "
                "(the token is read only from the environment, never from the CLI)"
            )
        collections = {}
        inputs = {}
        collection_files = {
            "results": "match_results_v2",
            "snapshots": "match_snapshots_v2",
            "events": "preset_events_v2",
            "effects": "preset_effects_v2",
        }
        for name in COLLECTIONS:
            raw, rows = fetch_collection(api_base, collection_files[name], token)
            collections[name] = rows
            inputs[name] = {
                "path": f"{api_base.rstrip('/')}/{collection_files[name]}",
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "rows": len(rows),
            }
        return collections, inputs

    collection_files = {
        "results": args.results,
        "snapshots": args.snapshots,
        "events": args.events,
        "effects": args.effects,
    }
    collections = {}
    inputs = {}
    for name in COLLECTIONS:
        raw, rows = load_collection_file(collection_files[name])
        collections[name] = rows
        inputs[name] = {
            "path": collection_files[name],
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "rows": len(rows),
        }
    return collections, inputs


def print_summary(report, out_path, payload):
    meta = report["meta"]
    coverage = report["coverage"]
    results_cov = coverage["results"]
    reasons = results_cov["finishedInvalidScoreReasons"]
    print(
        f"SLF tactics audit 252 (read-only) — arteta={meta['artetaPreset']} "
        f"mode={'api' if meta['inputs']['results']['path'].startswith(('http://', 'https://')) else 'file'}"
    )
    print(
        "coverage results: total={totalRows} finished={finishedRows} live={liveRows} "
        "validScore={finishedValidScoreRows} invalidScore={finishedInvalidScoreRows} "
        "(missing_score={missing}, invalid_score={invalid}) games={distinctGames} "
        "dupGameIdRows={duplicateGameIdRows} gameId{dup_game}Rows={dup_rows}".format(
            dup_game=DUP_AUDIT_GAME_KEY,
            dup_rows=results_cov[f"gameId{DUP_AUDIT_GAME_KEY}Rows"],
            missing=reasons["missing_score"],
            invalid=reasons["invalid_score"],
            **results_cov,
        )
    )
    print(
        "coverage snapshots: total={totalRows} games={distinctGames} "
        "dupMinuteRows={duplicateMinuteRows}".format(**coverage["snapshots"])
    )
    print(
        "coverage events: total={totalRows} v4={v4Rows} legacy={legacyRows} "
        "withRuleDecision={rowsWithRuleDecision}".format(**coverage["events"])
    )
    print(
        "coverage effects: total={totalRows} v4={v4Rows} legacy={legacyRows} "
        "withRuleDecision={rowsWithRuleDecision}".format(**coverage["effects"])
    )

    cohort = report["results_cohort"]
    outcome_counts = {"win": 0, "draw": 0, "loss": 0, "unknown": 0}
    for entry in cohort:
        outcome_counts[entry["outcome"] or "unknown"] += 1
    print(
        f"cohort: {len(cohort)} games — win={outcome_counts['win']} "
        f"draw={outcome_counts['draw']} loss={outcome_counts['loss']} "
        f"unknown={outcome_counts['unknown']}"
    )

    games = report["arteta_segments"]["games"]
    print(f"arteta games ({len(games)}):")
    for entry in games[:20]:
        result = entry["finishedResult"]
        if result is not None:
            score = result["score"]
            score_label = f"{score['home']}:{score['away']}"
            outcome_label = result["outcome"]
        else:
            score_label = "-"
            outcome_label = "-"
        print(f"  gameId={entry['gameId']} outcome={outcome_label} score={score_label}")
    if len(games) > 20:
        print(f"  ... +{len(games) - 20} more")

    top = sorted(games, key=lambda entry: (-entry["artetaNonStableMinutes"], str(entry["gameId"])))
    print(f"segments: {len(games)} games; top-10 by artetaNonStableMinutes:")
    for entry in top[:10]:
        print(
            f"  gameId={entry['gameId']} nonStable={entry['artetaNonStableMinutes']} "
            f"exposure={entry['artetaExposureMinutes']} "
            f"mismatch={entry['recommendationMismatchMinutes']}"
        )

    linkage = report["linkage"]
    print(
        "linkage: artetaGames={artetaGames} "
        "artetaGamesWithFinishedValidResult={artetaGamesWithFinishedValidResult} "
        "artetaPhasesTotal={artetaPhasesTotal} "
        "artetaEligiblePhases={artetaEligiblePhases} "
        "artetaPhaseExposureMinutes={artetaPhaseExposureMinutes}".format(**linkage)
    )
    print(f"report: {out_path} ({len(payload)} bytes, sha256={hashlib.sha256(payload).hexdigest()})")


def main(argv=None):
    args = build_parser().parse_args(argv)
    epoch_ms = int(time.time() * 1000)
    out_path = args.out or default_out_path(epoch_ms)

    # Read-only structural guard: refuse a report path that collides with any
    # input collection file (file mode) before anything is loaded or written.
    if not args.api:
        ensure_out_is_not_input(
            out_path, [args.results, args.snapshots, args.events, args.effects]
        )

    collections, inputs = load_inputs(args)
    report = build_report(
        collections["results"],
        collections["snapshots"],
        collections["events"],
        collections["effects"],
        arteta=args.arteta,
        inputs=inputs,
        generated_at=epoch_ms,
    )
    payload = render_report_bytes(report)
    write_report(out_path, payload)
    print_summary(report, out_path, payload)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Token-leak backstop: an exception text may embed the Authorization
        # header value (e.g. http.client's "Invalid header value %r"); the
        # token is redacted before anything reaches stderr.
        message = redact_secrets(str(error), os.environ.get("SLF_API_TOKEN"))
        print(f"ERROR: {message}", file=sys.stderr)
        raise SystemExit(1)
