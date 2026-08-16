#!/usr/bin/env python3
"""Build privacy-safe tactical telemetry evidence and match outcomes for SLF RAG."""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import requests

GENERATOR_VERSION = "5.61"
GENERATOR_START = dt.datetime(2026, 7, 13, tzinfo=dt.timezone.utc)
STABLE_START = dt.datetime(2026, 7, 23, tzinfo=dt.timezone.utc)
CATALOG_SOURCE_ID = "preset_evidence_561"
OUTCOMES_SOURCE_ID = "match_outcomes_summary"
QUALITY_SOURCE_ID = "telemetry_quality_summary"
AI_CONTEXT_MARKER = "<!-- SLF_PRESET_EVIDENCE_561 -->"
CORE_METRICS = ("myXG", "oppXG", "myShots", "oppShots", "myBadActionsPct")
VALID_SCORE_STATES = {"winning", "losing", "draw"}


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def safe_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def safe_int(value: Any) -> int | None:
    number = safe_float(value)
    return int(number) if number is not None else None


def get_path(obj: Mapping[str, Any] | None, path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def first_path(obj: Mapping[str, Any], paths: Sequence[str]) -> Any:
    for path in paths:
        value = get_path(obj, path)
        if value not in (None, ""):
            return value
    return None


def normalize_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "records", "results", "documents"):
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
        values = list(payload.values())
        if values and all(isinstance(row, dict) for row in values):
            return values
    return []


def fetch_collection(api_base: str, token: str, name: str) -> list[dict[str, Any]]:
    url = f"{api_base.rstrip('/')}/{name}"
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=90)
    response.raise_for_status()
    return normalize_payload(response.json())


def load_rows(path: str | None) -> list[dict[str, Any]]:
    if not path:
        return []
    return normalize_payload(read_json(Path(path), []))


def record_datetime(record: Mapping[str, Any]) -> dt.datetime | None:
    value = first_path(record, [
        "ts", "parsedAt", "source.collectedAt", "telemetryContext.capturedAt",
        "phaseEnd.ts", "phaseStart.ts", "after.ts", "before.ts", "beforeSnapshot.ts",
        "createdAt", "created_at", "timestamp", "date"
    ])
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        seconds = float(value) / 1000 if float(value) > 10_000_000_000 else float(value)
        try:
            return dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def generator_period(record: Mapping[str, Any]) -> str:
    timestamp = record_datetime(record)
    if timestamp is None:
        return "unknown"
    if timestamp < GENERATOR_START:
        return "pre_5_61"
    if timestamp < STABLE_START:
        return "transition_5_61"
    return "stable_5_61"


def game_id(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "gameId", "telemetryContext.gameId", "phaseStart.gameId", "phaseEnd.gameId",
        "before.gameId", "beforeSnapshot.gameId", "snapshot.gameId", "after.gameId"
    ])
    return str(value or "")


def match_ref(value: str) -> str:
    if not value:
        return "unknown"
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()[:12]


def preset_name(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "presetName", "preset", "preset.name", "event.presetName", "event.preset",
        "tacticPreset", "appliedPreset", "tacticContext.appliedPreset",
        "telemetryContext.presetId", "phaseStart.presetId", "phaseEnd.presetId",
        "meta.presetName", "analysis.presetName"
    ])
    if isinstance(value, Mapping):
        value = value.get("name") or value.get("id")
    return str(value or "unknown")


def score_snapshot(record: Mapping[str, Any]) -> Mapping[str, Any]:
    for path in ("phaseStart", "before", "beforeSnapshot", "snapshot", "phaseEnd", "after"):
        value = get_path(record, path)
        if isinstance(value, Mapping) and isinstance(value.get("score"), Mapping):
            return value
    return record


def score_state(record: Mapping[str, Any]) -> str:
    explicit = first_path(record, [
        "telemetryContext.scoreState", "scoreState", "context.scoreState",
        "phaseStart.scoreState", "phaseEnd.scoreState", "snapshot.scoreState", "event.scoreState"
    ])
    normalized = str(explicit or "").strip().lower()
    if normalized in VALID_SCORE_STATES:
        return normalized

    snapshot = score_snapshot(record)
    score = snapshot.get("score") if isinstance(snapshot.get("score"), Mapping) else None
    teams = snapshot.get("teams") if isinstance(snapshot.get("teams"), list) else []
    my_team = safe_int(snapshot.get("myTeam"))
    if (not score or len(teams) < 2 or my_team is None) and snapshot is not record:
        score = record.get("score") if isinstance(record.get("score"), Mapping) else score
        teams = record.get("teams") if isinstance(record.get("teams"), list) else teams
        my_team = safe_int(record.get("myTeam")) if record.get("myTeam") is not None else my_team
    if not score or len(teams) < 2 or my_team is None:
        return "unknown"
    home = safe_int(score.get("home"))
    away = safe_int(score.get("away"))
    if home is None or away is None:
        return "unknown"
    is_home = safe_int(teams[0]) == my_team
    mine, opp = (home, away) if is_home else (away, home)
    return "winning" if mine > opp else "losing" if mine < opp else "draw"


def minute_of(record: Mapping[str, Any]) -> int | None:
    return safe_int(first_path(record, [
        "fromMinute", "minute", "telemetryContext.minute", "phaseStart.minute",
        "before.minute", "beforeSnapshot.minute", "snapshot.minute"
    ]))


def minute_bucket(minute: int | None) -> str:
    if minute is None:
        return "unknown"
    if minute < 30:
        return "000-029"
    if minute < 55:
        return "030-054"
    if minute < 70:
        return "055-069"
    if minute < 80:
        return "070-079"
    if minute < 86:
        return "080-085"
    return "086+"


def script_version(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "telemetryContext.scriptVersion", "source.scriptVersion", "after.source.scriptVersion",
        "before.source.scriptVersion", "beforeSnapshot.source.scriptVersion", "scriptVersion"
    ])
    return str(value or "unknown")


def generator_version(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "telemetryContext.generatorVersion", "generatorVersion", "source.generatorVersion",
        "after.generatorVersion", "before.generatorVersion", "beforeSnapshot.generatorVersion"
    ])
    return str(value or "unknown")


def metric(record: Mapping[str, Any], name: str) -> float | None:
    value = get_path(record, f"delta.{name}")
    if value is None and name == "myXG":
        value = get_path(record, "delta.myXg")
    if value is None and name == "oppXG":
        value = get_path(record, "delta.oppXg")
    return safe_float(value)


def average(values: Iterable[float | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return sum(clean) / len(clean) if clean else None


def rounded(value: float | None) -> float | None:
    return round(value, 4) if value is not None else None


def aggregate_effects(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    metric_values = {name: [metric(row, name) for row in records] for name in CORE_METRICS}
    averages = {name: rounded(average(values)) for name, values in metric_values.items()}
    complete = sum(all(metric(row, name) is not None for name in CORE_METRICS) for row in records)
    my_xg = averages["myXG"]
    opp_xg = averages["oppXG"]
    my_shots = averages["myShots"]
    opp_shots = averages["oppShots"]
    bad = averages["myBadActionsPct"]
    score = None
    if None not in (my_xg, opp_xg, my_shots, opp_shots, bad):
        score = 4 * my_xg - 5 * opp_xg + 0.5 * my_shots - 0.5 * opp_shots - 0.3 * bad
    return {
        "sample": len(records),
        "completeCoreSample": complete,
        "coreCompleteness": round(complete / len(records), 3) if records else 0,
        "avgDelta": averages,
        "xgBalance": rounded(my_xg - opp_xg) if my_xg is not None and opp_xg is not None else None,
        "shotsBalance": rounded(my_shots - opp_shots) if my_shots is not None and opp_shots is not None else None,
        "effectScoreV1": rounded(score),
    }


def is_phase_event(record: Mapping[str, Any]) -> bool:
    return (
        record.get("type") == "tactical_phase_start"
        or record.get("eventType") == "tactical_phase_start"
        or record.get("parserVersion") == "tactical_phase_start_v4"
    )


def is_phase_effect(record: Mapping[str, Any]) -> bool:
    return (
        record.get("eventType") == "tactical_phase"
        or record.get("parserVersion") == "tactical_phase_effect_v4"
    )


def select_analysis_cohort(
    events: Sequence[Mapping[str, Any]],
    effects: Sequence[Mapping[str, Any]],
) -> tuple[list[Mapping[str, Any]], list[Mapping[str, Any]], dict[str, Any]]:
    phase_effects = [row for row in effects if is_phase_effect(row)]
    phase_games = {game_id(row) for row in phase_effects if game_id(row)}
    legacy_effects = [row for row in effects if not is_phase_effect(row)]
    selected_effects = phase_effects + [row for row in legacy_effects if game_id(row) not in phase_games]

    phase_events = [row for row in events if is_phase_event(row)]
    phase_event_games = {game_id(row) for row in phase_events if game_id(row)}
    legacy_events = [row for row in events if not is_phase_event(row)]
    selected_events = phase_events + [row for row in legacy_events if game_id(row) not in phase_event_games]

    return selected_events, selected_effects, {
        "policy": "v4_tactical_phase_primary_per_game_else_legacy",
        "rawEvents": len(events),
        "rawEffects": len(effects),
        "phaseEvents": len(phase_events),
        "phaseEffects": len(phase_effects),
        "legacyEvents": len(legacy_events),
        "legacyEffects": len(legacy_effects),
        "analysisEvents": len(selected_events),
        "analysisEffects": len(selected_effects),
        "gamesUsingPhaseEffects": len(phase_games),
    }


def build_report(events: Sequence[Mapping[str, Any]], effects: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    analysis_events, analysis_effects, cohort = select_analysis_cohort(events, effects)
    period_event_counts = collections.Counter(generator_period(row) for row in analysis_events)
    period_effect_counts = collections.Counter(generator_period(row) for row in analysis_effects)
    event_versions = collections.Counter(script_version(row) for row in analysis_events)
    effect_versions = collections.Counter(script_version(row) for row in analysis_effects)

    event_groups: dict[tuple[str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)
    effect_groups: dict[tuple[str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)
    context_groups: dict[tuple[str, str, str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)

    for row in analysis_events:
        event_groups[(generator_period(row), preset_name(row))].append(row)
    for row in analysis_effects:
        period = generator_period(row)
        preset = preset_name(row)
        effect_groups[(period, preset)].append(row)
        context_groups[(period, preset, score_state(row), minute_bucket(minute_of(row)))].append(row)

    by_period_preset = []
    keys = sorted(set(event_groups) | set(effect_groups))
    for period, preset in keys:
        effect_rows = effect_groups.get((period, preset), [])
        event_count = len(event_groups.get((period, preset), []))
        by_period_preset.append({
            "period": period,
            "presetName": preset,
            "eventCount": event_count,
            "effectConversion": round(len(effect_rows) / event_count, 3) if event_count else None,
            **aggregate_effects(effect_rows),
        })
    by_period_preset.sort(key=lambda row: (row["period"], -row["sample"], row["presetName"]))

    by_context = []
    for (period, preset, state, bucket), rows in context_groups.items():
        by_context.append({
            "period": period,
            "presetName": preset,
            "scoreState": state,
            "minuteBucket": bucket,
            **aggregate_effects(rows),
        })
    by_context.sort(key=lambda row: (row["period"], -row["sample"], row["presetName"]))

    stable_named = [
        row for row in analysis_effects
        if generator_period(row) == "stable_5_61" and preset_name(row) not in {"unknown", "manual_change"}
    ]
    stable_presets = {preset_name(row) for row in stable_named}
    ready = len(stable_named) >= 60 and len(stable_presets) >= 5

    return {
        "schema": "slf_preset_evidence_561_v2",
        "generatedAt": now_iso(),
        "generatorVersion": GENERATOR_VERSION,
        "periods": {
            "pre_5_61": {"untilExclusive": GENERATOR_START.isoformat()},
            "transition_5_61": {"fromInclusive": GENERATOR_START.isoformat(), "untilExclusive": STABLE_START.isoformat()},
            "stable_5_61": {"fromInclusive": STABLE_START.isoformat()},
        },
        "cohort": cohort,
        "counts": {
            "events": len(analysis_events),
            "effects": len(analysis_effects),
            "rawEvents": len(events),
            "rawEffects": len(effects),
            "eventsByPeriod": dict(period_event_counts),
            "effectsByPeriod": dict(period_effect_counts),
            "unknownPresetEvents": sum(1 for row in analysis_events if preset_name(row) == "unknown"),
            "manualChangeEffects": sum(1 for row in analysis_effects if preset_name(row) == "manual_change"),
            "stableNamedEffects": len(stable_named),
            "stablePresetCount": len(stable_presets),
        },
        "scriptVersions": {
            "events": dict(event_versions.most_common()),
            "effects": dict(effect_versions.most_common()),
        },
        "quality": {
            "readyForRetune": ready,
            "minimumStableNamedEffects": 60,
            "minimumStablePresetCount": 5,
            "warning": None if ready else "Недостаточно чистых stable-5.61 эффектов для числовой ретюнировки. Использовать консервативную политику и продолжать сбор.",
        },
        "byPeriodPreset": by_period_preset,
        "byPeriodPresetContext": by_context[:2000],
        "notes": [
            "Score state is derived only from explicit winning/draw/losing context or owned-team score; bucket labels are never score state.",
            "For a game with v4 tactical-phase effects, legacy effects from the same game are excluded from the primary analysis cohort.",
            "No raw event or effect records are written to the public export.",
            "The transition cohort 2026-07-13 through 2026-07-22 is kept separate from stable generator 5.61 evidence.",
        ],
    }


def build_effects_summary(events: Sequence[Mapping[str, Any]], effects: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    _, analysis_effects, cohort = select_analysis_cohort(events, effects)
    by_preset: dict[str, list[Mapping[str, Any]]] = collections.defaultdict(list)
    by_context: dict[tuple[str, str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)
    for row in analysis_effects:
        name = preset_name(row)
        by_preset[name].append(row)
        by_context[(name, score_state(row), minute_bucket(minute_of(row)))].append(row)

    preset_rows = [
        {"presetName": name, **aggregate_effects(rows)}
        for name, rows in by_preset.items()
    ]
    preset_rows.sort(key=lambda row: (-row["sample"], row["presetName"]))
    context_rows = [
        {
            "presetName": name,
            "scoreState": state,
            "minuteBucket": bucket,
            **aggregate_effects(rows),
        }
        for (name, state, bucket), rows in by_context.items()
    ]
    context_rows.sort(key=lambda row: (-row["sample"], row["presetName"], row["scoreState"], row["minuteBucket"]))
    return {
        "schema": "preset_effects_summary_v2_tactical_phase",
        "generatedAt": now_iso(),
        "sourceCollection": "preset_effects_v2",
        "count": len(effects),
        "analysisCount": len(analysis_effects),
        "cohort": cohort,
        "byPreset": preset_rows,
        "byPresetContext": context_rows[:2000],
        "notes": [
            "v4 tactical phases are the primary analysis unit when present for a game; legacy effects remain a historical fallback.",
            "Score state never uses minute/generation bucket labels.",
        ],
    }


def build_events_summary(events: Sequence[Mapping[str, Any]], effects: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    analysis_events, _, cohort = select_analysis_cohort(events, effects)
    by_preset = collections.Counter(preset_name(row) for row in analysis_events)
    by_context = collections.Counter(
        (preset_name(row), score_state(row), minute_bucket(minute_of(row)))
        for row in analysis_events
    )
    return {
        "schema": "preset_events_summary_v2_tactical_phase",
        "generatedAt": now_iso(),
        "sourceCollection": "preset_events_v2",
        "count": len(events),
        "analysisCount": len(analysis_events),
        "cohort": cohort,
        "byPreset": [{"presetName": key, "count": value} for key, value in by_preset.most_common()],
        "byPresetContext": [
            {"presetName": key[0], "scoreState": key[1], "minuteBucket": key[2], "count": value}
            for key, value in by_context.most_common(2000)
        ],
        "notes": ["Score state never uses minute/generation bucket labels."],
    }


def result_score(record: Mapping[str, Any]) -> dict[str, Any] | None:
    teams = record.get("teams") if isinstance(record.get("teams"), list) else []
    my_team = safe_int(record.get("myTeam"))
    score = record.get("score") if isinstance(record.get("score"), Mapping) else None
    if len(teams) < 2 or my_team is None or not score:
        return None
    home = safe_int(score.get("home"))
    away = safe_int(score.get("away"))
    if home is None or away is None:
        return None
    home_id = safe_int(teams[0])
    away_id = safe_int(teams[1])
    if my_team == home_id:
        return {"myGoals": home, "opponentGoals": away, "homeAway": "home"}
    if my_team == away_id:
        return {"myGoals": away, "opponentGoals": home, "homeAway": "away"}
    return None


def result_vs_expected(record: Mapping[str, Any]) -> float | None:
    expected = record.get("generatorExpectedPerformance")
    if not isinstance(expected, Mapping):
        return None
    values = [
        safe_float(get_path(expected, "attack.actual")),
        safe_float(get_path(expected, "attack.expected")),
        safe_float(get_path(expected, "defense.actual")),
        safe_float(get_path(expected, "defense.expected")),
    ]
    if any(value is None for value in values):
        return None
    attack_actual, attack_expected, defense_actual, defense_expected = values
    return rounded((attack_actual - attack_expected) - (defense_actual - defense_expected))


def build_match_outcomes_summary(
    results: Sequence[Mapping[str, Any]],
    effects: Sequence[Mapping[str, Any]],
    limit: int = 50,
) -> dict[str, Any]:
    phase_counts = collections.Counter(
        game_id(row) for row in effects if is_phase_effect(row) and game_id(row)
    )
    latest_by_game: dict[str, Mapping[str, Any]] = {}
    invalid_results = 0
    for row in results:
        gid = game_id(row)
        if not gid or result_score(row) is None:
            invalid_results += 1
            continue
        current = latest_by_game.get(gid)
        if current is None or (record_datetime(row) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) >= (record_datetime(current) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)):
            latest_by_game[gid] = row

    rows: list[dict[str, Any]] = []
    for gid, row in latest_by_game.items():
        score = result_score(row)
        if score is None:
            continue
        goal_difference = score["myGoals"] - score["opponentGoals"]
        points = 3 if goal_difference > 0 else 1 if goal_difference == 0 else 0
        telemetry = row.get("tacticTelemetry") if isinstance(row.get("tacticTelemetry"), Mapping) else {}
        timestamp = record_datetime(row)
        transitions = telemetry.get("transitions") if isinstance(telemetry.get("transitions"), list) else []
        rows.append({
            "matchRef": match_ref(gid),
            "ts": timestamp.isoformat() if timestamp else None,
            "homeAway": score["homeAway"],
            "myGoals": score["myGoals"],
            "opponentGoals": score["opponentGoals"],
            "goalDifference": goal_difference,
            "points": points,
            "result": "win" if points == 3 else "draw" if points == 1 else "loss",
            "resultVsExpected": result_vs_expected(row),
            "resultVsExpectedModel": "generator_xg_channel_delta_v1",
            "initialPreset": telemetry.get("initialPreset") or None,
            "finalPreset": telemetry.get("currentPreset") or None,
            "riskAppetite": telemetry.get("riskAppetite") or get_path(row, "telemetryContext.riskAppetite") or None,
            "scriptVersion": script_version(row),
            "generatorVersion": generator_version(row),
            "phaseCount": int(phase_counts.get(gid, 0)),
            "transitionCount": safe_int(telemetry.get("transitionCount")) if telemetry else len(transitions),
        })
    rows.sort(key=lambda item: item.get("ts") or "", reverse=True)

    def aggregate(group: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
        matches = len(group)
        wins = sum(1 for item in group if item.get("points") == 3)
        draws = sum(1 for item in group if item.get("points") == 1)
        losses = sum(1 for item in group if item.get("points") == 0)
        points = sum(int(item.get("points") or 0) for item in group)
        goals_for = sum(int(item.get("myGoals") or 0) for item in group)
        goals_against = sum(int(item.get("opponentGoals") or 0) for item in group)
        expected_values = [safe_float(item.get("resultVsExpected")) for item in group]
        expected_values = [value for value in expected_values if value is not None]
        return {
            "matches": matches,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "points": points,
            "pointsPerMatch": round(points / matches, 3) if matches else None,
            "goalsFor": goals_for,
            "goalsAgainst": goals_against,
            "goalDifference": goals_for - goals_against,
            "goalsForPerMatch": round(goals_for / matches, 3) if matches else None,
            "goalsAgainstPerMatch": round(goals_against / matches, 3) if matches else None,
            "resultVsExpectedCoverage": round(len(expected_values) / matches, 3) if matches else None,
            "avgResultVsExpected": round(sum(expected_values) / len(expected_values), 4) if expected_values else None,
        }

    home = [row for row in rows if row["homeAway"] == "home"]
    away = [row for row in rows if row["homeAway"] == "away"]
    by_script = collections.Counter(row["scriptVersion"] for row in rows)
    by_generator = collections.Counter(row["generatorVersion"] for row in rows)
    by_final_preset = collections.Counter(row["finalPreset"] or "unknown" for row in rows)
    by_risk = collections.Counter(row["riskAppetite"] or "unknown" for row in rows)
    return {
        "schema": "slf_match_outcomes_summary_v1",
        "generatedAt": now_iso(),
        "sourceCollection": "match_results_v2",
        "privacy": {
            "rawRecordsIncluded": False,
            "rawGameIdsIncluded": False,
            "teamNamesIncluded": False,
            "matchReference": "sha256(gameId)[:12]",
        },
        "counts": {
            "sourceRows": len(results),
            "validUniqueMatches": len(rows),
            "invalidOrUnjoinableRows": invalid_results,
        },
        "overall": aggregate(rows),
        "home": aggregate(home),
        "away": aggregate(away),
        "byScriptVersion": dict(by_script.most_common()),
        "byGeneratorVersion": dict(by_generator.most_common()),
        "byFinalPreset": dict(by_final_preset.most_common()),
        "byRiskAppetite": dict(by_risk.most_common()),
        "recentMatches": rows[:limit],
        "notes": [
            "Match outcomes are a separate analysis unit and are not copied into every tactical phase score.",
            "Phase counts use canonical v4 tactical-phase effects when available.",
        ],
    }


def build_telemetry_quality_summary(
    snapshots: Sequence[Mapping[str, Any]],
    results: Sequence[Mapping[str, Any]],
    events: Sequence[Mapping[str, Any]],
    effects: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    phase_events = [row for row in events if is_phase_event(row)]
    phase_effects = [row for row in effects if is_phase_effect(row)]
    phase_start_ids = {str(row.get("phaseId") or "") for row in phase_events if row.get("phaseId")}
    phase_effect_ids = {str(row.get("phaseId") or "") for row in phase_effects if row.get("phaseId")}
    snapshot_games = {game_id(row) for row in snapshots if game_id(row)}
    result_games = {game_id(row) for row in results if game_id(row) and result_score(row) is not None}
    analysis_events, analysis_effects, cohort = select_analysis_cohort(events, effects)
    tactical_rows = [*analysis_events, *analysis_effects]

    def coverage(rows: Sequence[Mapping[str, Any]], predicate) -> float | None:
        if not rows:
            return None
        return round(sum(1 for row in rows if predicate(row)) / len(rows), 3)

    eligible = [row for row in phase_effects if isinstance(row.get("eligibility"), Mapping)]
    eligible_count = sum(1 for row in eligible if bool(get_path(row, "eligibility.eligibleForRanking")))
    orphan_effects = phase_effect_ids - phase_start_ids
    open_phases = phase_start_ids - phase_effect_ids
    snapshots_per_game = round(len(snapshots) / len(snapshot_games), 3) if snapshot_games else None
    return {
        "schema": "slf_telemetry_quality_summary_v1",
        "generatedAt": now_iso(),
        "sources": {
            "match_snapshots_v2": len(snapshots),
            "match_results_v2": len(results),
            "preset_events_v2": len(events),
            "preset_effects_v2": len(effects),
        },
        "cohort": cohort,
        "coverage": {
            "uniqueSnapshotGames": len(snapshot_games),
            "uniqueResultGames": len(result_games),
            "resultCoverageVsObservedGames": round(len(result_games & snapshot_games) / len(snapshot_games), 3) if snapshot_games else None,
            "snapshotsPerObservedGame": snapshots_per_game,
            "knownPresetRate": coverage(tactical_rows, lambda row: preset_name(row) not in {"", "unknown", "manual_change"}),
            "knownScoreStateRate": coverage(analysis_effects, lambda row: score_state(row) in VALID_SCORE_STATES),
            "scriptVersionCoverage": coverage(tactical_rows, lambda row: script_version(row) != "unknown"),
            "generatorVersionCoverage": coverage(tactical_rows, lambda row: generator_version(row) != "unknown"),
            "phaseClosureRate": round(len(phase_start_ids & phase_effect_ids) / len(phase_start_ids), 3) if phase_start_ids else None,
            "eligiblePhaseRate": round(eligible_count / len(eligible), 3) if eligible else None,
        },
        "phaseIntegrity": {
            "phaseStartRecords": len(phase_events),
            "phaseEffectRecords": len(phase_effects),
            "uniquePhaseStarts": len(phase_start_ids),
            "uniquePhaseEffects": len(phase_effect_ids),
            "orphanPhaseEffects": len(orphan_effects),
            "unclosedPhaseStarts": len(open_phases),
            "eligiblePhases": eligible_count,
            "ineligiblePhases": len(eligible) - eligible_count,
        },
        "reliability": {
            "serverSideRetryCount": None,
            "serverSideRetryCountStatus": "not_available_in_persisted_collections",
            "clientOutboxIsBounded": True,
            "clientOutboxLimit": 12,
        },
        "warnings": [
            warning for warning in [
                "No v4 tactical phases collected yet." if not phase_events else None,
                "Some tactical-phase effects have no matching phase start." if orphan_effects else None,
                "Some phase starts are not yet closed; active/current matches may explain part of this count." if open_phases else None,
            ] if warning
        ],
    }


def enrich_catalog(
    out: Path,
    report: Mapping[str, Any],
    outcomes: Mapping[str, Any],
    quality: Mapping[str, Any],
) -> None:
    path = out / "rag" / "catalog.json"
    catalog = read_json(path, {})
    if not isinstance(catalog, dict):
        catalog = {}
    replace_ids = {CATALOG_SOURCE_ID, OUTCOMES_SOURCE_ID, QUALITY_SOURCE_ID}
    sources = [
        row for row in catalog.get("sources", [])
        if isinstance(row, dict) and row.get("id") not in replace_ids
    ]
    sources.extend([
        {
            "id": CATALOG_SOURCE_ID,
            "type": "generator_segmented_preset_evidence",
            "authority": "observed_data",
            "path": "data/preset_evidence_561.json",
            "count": report.get("counts", {}).get("effects", 0),
            "generatorVersion": GENERATOR_VERSION,
            "readyForRetune": report.get("quality", {}).get("readyForRetune", False),
        },
        {
            "id": OUTCOMES_SOURCE_ID,
            "type": "privacy_safe_match_outcomes",
            "authority": "observed_data",
            "path": "data/match_outcomes_summary.json",
            "count": outcomes.get("counts", {}).get("validUniqueMatches", 0),
        },
        {
            "id": QUALITY_SOURCE_ID,
            "type": "telemetry_quality",
            "authority": "observed_data_quality",
            "path": "data/telemetry_quality_summary.json",
            "phaseStartRecords": quality.get("phaseIntegrity", {}).get("phaseStartRecords", 0),
            "phaseEffectRecords": quality.get("phaseIntegrity", {}).get("phaseEffectRecords", 0),
        },
    ])
    catalog["sources"] = sources
    catalog["presetEvidence"] = {
        "generatorVersion": GENERATOR_VERSION,
        "path": "data/preset_evidence_561.json",
        "stableNamedEffects": report.get("counts", {}).get("stableNamedEffects", 0),
        "readyForRetune": report.get("quality", {}).get("readyForRetune", False),
    }
    catalog["matchOutcomes"] = {
        "path": "data/match_outcomes_summary.json",
        "matches": outcomes.get("counts", {}).get("validUniqueMatches", 0),
        "pointsPerMatch": outcomes.get("overall", {}).get("pointsPerMatch"),
    }
    catalog["telemetryQuality"] = {
        "path": "data/telemetry_quality_summary.json",
        "phaseClosureRate": quality.get("coverage", {}).get("phaseClosureRate"),
        "knownScoreStateRate": quality.get("coverage", {}).get("knownScoreStateRate"),
    }
    write_json(path, catalog)


def enrich_search_index(
    out: Path,
    report: Mapping[str, Any],
    outcomes: Mapping[str, Any],
    quality: Mapping[str, Any],
) -> None:
    path = out / "rag" / "search_index.json"
    index = read_json(path, {})
    if not isinstance(index, dict):
        index = {}
    replace_ids = {CATALOG_SOURCE_ID, OUTCOMES_SOURCE_ID, QUALITY_SOURCE_ID}
    items = [
        row for row in index.get("items", [])
        if isinstance(row, dict) and row.get("id") not in replace_ids
    ]
    counts = report.get("counts", {})
    report_quality = report.get("quality", {})
    overall = outcomes.get("overall", {})
    coverage = quality.get("coverage", {})
    items.extend([
        {
            "id": CATALOG_SOURCE_ID,
            "type": "match_evidence",
            "title": "Эффективность тактик по периодам генератора 5.61",
            "topic": "tactics_generator_561",
            "text": f"Эффекты: {counts.get('effects', 0)}. Чистая stable-5.61 выборка: {counts.get('stableNamedEffects', 0)}. Ready for retune: {report_quality.get('readyForRetune', False)}.",
            "path": "data/preset_evidence_561.json",
        },
        {
            "id": OUTCOMES_SOURCE_ID,
            "type": "match_evidence",
            "title": "Результаты матчей",
            "topic": "match_outcomes",
            "text": f"Матчи: {overall.get('matches', 0)}. W-D-L: {overall.get('wins', 0)}-{overall.get('draws', 0)}-{overall.get('losses', 0)}. Очков за матч: {overall.get('pointsPerMatch')}. Голы: {overall.get('goalsFor', 0)}-{overall.get('goalsAgainst', 0)}.",
            "path": "data/match_outcomes_summary.json",
        },
        {
            "id": QUALITY_SOURCE_ID,
            "type": "match_evidence",
            "title": "Качество тактической телеметрии",
            "topic": "telemetry_quality",
            "text": f"Phase closure: {coverage.get('phaseClosureRate')}. Known score state: {coverage.get('knownScoreStateRate')}. Script provenance: {coverage.get('scriptVersionCoverage')}. Generator provenance: {coverage.get('generatorVersionCoverage')}.",
            "path": "data/telemetry_quality_summary.json",
        },
    ])
    index["items"] = items
    index["count"] = len(items)
    index["updatedAt"] = now_iso()
    write_json(path, index)


def enrich_ai_context(
    out: Path,
    report: Mapping[str, Any],
    outcomes: Mapping[str, Any],
    quality: Mapping[str, Any],
) -> None:
    path = out / "ai_context.md"
    text = path.read_text(encoding="utf-8") if path.exists() else "# SLF AI RAG Current Export\n"
    if AI_CONTEXT_MARKER in text:
        text = text.split(AI_CONTEXT_MARKER, 1)[0].rstrip() + "\n"
    counts = report.get("counts", {})
    report_quality = report.get("quality", {})
    overall = outcomes.get("overall", {})
    coverage = quality.get("coverage", {})
    block = f"""

{AI_CONTEXT_MARKER}
## Tactical telemetry and generator 5.61 evidence

Read in this order before changing tactical policy:

1. `data/telemetry_quality_summary.json`
2. `data/match_outcomes_summary.json`
3. `data/preset_evidence_561.json`
4. `data/preset_effects_summary.json`

- Stable 5.61 named effects: {counts.get('stableNamedEffects', 0)}.
- Ready for numeric retune: {str(report_quality.get('readyForRetune', False)).lower()}.
- Match W-D-L: {overall.get('wins', 0)}-{overall.get('draws', 0)}-{overall.get('losses', 0)}; points per match: {overall.get('pointsPerMatch')}.
- Tactical phase closure rate: {coverage.get('phaseClosureRate')}.
- Known score-state rate: {coverage.get('knownScoreStateRate')}.
- v4 tactical phases are primary for a game when present; legacy effects from that same game are not double-counted.
- Keep the 2026-07-13 through 2026-07-22 transition cohort separate.
- Never infer score state from minute/generation bucket labels.
"""
    path.write_text(text.rstrip() + block, encoding="utf-8")


def enrich_manifest(out: Path) -> None:
    path = out / "manifest.json"
    manifest = read_json(path, {})
    if not isinstance(manifest, dict):
        return
    files = manifest.get("files") if isinstance(manifest.get("files"), dict) else {}
    additions = {
        "matchOutcomesSummary": "data/match_outcomes_summary.json",
        "telemetryQualitySummary": "data/telemetry_quality_summary.json",
        "presetEvidence561": "data/preset_evidence_561.json",
    }
    for key, relative in additions.items():
        target = out / relative
        content = target.read_text(encoding="utf-8", errors="replace") if target.exists() else ""
        files[key] = {
            "path": relative,
            "exists": target.exists(),
            "sizeBytes": target.stat().st_size if target.exists() else 0,
            "sha256": hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest() if target.exists() else None,
        }
    manifest["files"] = files
    preferred = [
        "data/telemetry_quality_summary.json",
        "data/match_outcomes_summary.json",
        "data/preset_evidence_561.json",
        "data/preset_effects_summary.json",
    ]
    existing = [item for item in manifest.get("recommendedReadOrder", []) if item not in preferred]
    manifest["recommendedReadOrder"] = preferred + existing
    write_json(path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.environ.get("SLF_AI_OUT", "/var/www/html/slf_ai"))
    parser.add_argument("--api-base", default=os.environ.get("SLF_API_BASE", "http://127.0.0.1:5000/api"))
    parser.add_argument("--token", default=os.environ.get("SLF_API_TOKEN", ""))
    parser.add_argument("--events-file")
    parser.add_argument("--effects-file")
    parser.add_argument("--snapshots-file")
    parser.add_argument("--results-file")
    args = parser.parse_args()

    file_mode = any([args.events_file, args.effects_file, args.snapshots_file, args.results_file])
    if file_mode:
        events = load_rows(args.events_file)
        effects = load_rows(args.effects_file)
        snapshots = load_rows(args.snapshots_file)
        results = load_rows(args.results_file)
    else:
        if not args.token:
            raise SystemExit("SLF_API_TOKEN is required")
        events = fetch_collection(args.api_base, args.token, "preset_events_v2")
        effects = fetch_collection(args.api_base, args.token, "preset_effects_v2")
        snapshots = fetch_collection(args.api_base, args.token, "match_snapshots_v2")
        results = fetch_collection(args.api_base, args.token, "match_results_v2")

    out = Path(args.out)
    report = build_report(events, effects)
    outcomes = build_match_outcomes_summary(results, effects)
    quality = build_telemetry_quality_summary(snapshots, results, events, effects)
    effects_summary = build_effects_summary(events, effects)
    events_summary = build_events_summary(events, effects)

    write_json(out / "data" / "preset_evidence_561.json", report)
    write_json(out / "data" / "match_outcomes_summary.json", outcomes)
    write_json(out / "data" / "telemetry_quality_summary.json", quality)
    write_json(out / "data" / "preset_effects_summary.json", effects_summary)
    write_json(out / "data" / "preset_events_summary.json", events_summary)
    enrich_catalog(out, report, outcomes, quality)
    enrich_search_index(out, report, outcomes, quality)
    enrich_ai_context(out, report, outcomes, quality)
    enrich_manifest(out)

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "events": len(events),
        "effects": len(effects),
        "snapshots": len(snapshots),
        "results": len(results),
        "stable_named_effects": report["counts"]["stableNamedEffects"],
        "ready_for_retune": report["quality"]["readyForRetune"],
        "valid_match_outcomes": outcomes["counts"]["validUniqueMatches"],
        "phase_effects": quality["phaseIntegrity"]["phaseEffectRecords"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
