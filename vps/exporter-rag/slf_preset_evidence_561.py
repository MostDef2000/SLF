#!/usr/bin/env python3
"""Build privacy-safe, generator-version-aware preset evidence for SLF RAG."""
from __future__ import annotations

import argparse
import collections
import datetime as dt
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
AI_CONTEXT_MARKER = "<!-- SLF_PRESET_EVIDENCE_561 -->"
CORE_METRICS = ("myXG", "oppXG", "myShots", "oppShots", "myBadActionsPct")


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
        "ts", "source.collectedAt", "after.ts", "before.ts", "beforeSnapshot.ts",
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


def preset_name(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "presetName", "preset", "preset.name", "event.presetName", "event.preset",
        "tacticPreset", "appliedPreset", "meta.presetName", "analysis.presetName"
    ])
    if isinstance(value, Mapping):
        value = value.get("name") or value.get("id")
    return str(value or "unknown")


def score_state(record: Mapping[str, Any]) -> str:
    explicit = first_path(record, ["scoreState", "context.scoreState", "snapshot.scoreState", "event.scoreState"])
    if str(explicit or "").lower() in {"winning", "losing", "draw"}:
        return str(explicit).lower()

    snapshot = first_path(record, ["before", "beforeSnapshot", "snapshot", "after"])
    if not isinstance(snapshot, Mapping):
        snapshot = record
    score = snapshot.get("score") if isinstance(snapshot.get("score"), Mapping) else None
    teams = snapshot.get("teams") if isinstance(snapshot.get("teams"), list) else []
    my_team = safe_int(snapshot.get("myTeam"))
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
    return safe_int(first_path(record, ["fromMinute", "minute", "before.minute", "beforeSnapshot.minute", "snapshot.minute"]))


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
        "source.scriptVersion", "after.source.scriptVersion", "before.source.scriptVersion",
        "beforeSnapshot.source.scriptVersion", "scriptVersion"
    ])
    return str(value or "unknown")


def metric(record: Mapping[str, Any], name: str) -> float | None:
    return safe_float(get_path(record, f"delta.{name}"))


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


def build_report(events: Sequence[Mapping[str, Any]], effects: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    period_event_counts = collections.Counter(generator_period(row) for row in events)
    period_effect_counts = collections.Counter(generator_period(row) for row in effects)
    event_versions = collections.Counter(script_version(row) for row in events)
    effect_versions = collections.Counter(script_version(row) for row in effects)

    event_groups: dict[tuple[str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)
    effect_groups: dict[tuple[str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)
    context_groups: dict[tuple[str, str, str, str], list[Mapping[str, Any]]] = collections.defaultdict(list)

    for row in events:
        event_groups[(generator_period(row), preset_name(row))].append(row)
    for row in effects:
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

    stable_named = [row for row in effects if generator_period(row) == "stable_5_61" and preset_name(row) not in {"unknown", "manual_change"}]
    stable_presets = {preset_name(row) for row in stable_named}
    ready = len(stable_named) >= 60 and len(stable_presets) >= 5

    return {
        "schema": "slf_preset_evidence_561_v1",
        "generatedAt": now_iso(),
        "generatorVersion": GENERATOR_VERSION,
        "periods": {
            "pre_5_61": {"untilExclusive": GENERATOR_START.isoformat()},
            "transition_5_61": {"fromInclusive": GENERATOR_START.isoformat(), "untilExclusive": STABLE_START.isoformat()},
            "stable_5_61": {"fromInclusive": STABLE_START.isoformat()},
        },
        "counts": {
            "events": len(events),
            "effects": len(effects),
            "eventsByPeriod": dict(period_event_counts),
            "effectsByPeriod": dict(period_effect_counts),
            "unknownPresetEvents": sum(1 for row in events if preset_name(row) == "unknown"),
            "manualChangeEffects": sum(1 for row in effects if preset_name(row) == "manual_change"),
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
            "Score state is derived from the score, teams and myTeam; bucket labels are never treated as score state.",
            "No raw event or effect records are written to the public export.",
            "The transition cohort 2026-07-13 through 2026-07-22 is kept separate from stable generator 5.61 evidence.",
        ],
    }


def enrich_catalog(out: Path, report: Mapping[str, Any]) -> None:
    path = out / "rag" / "catalog.json"
    catalog = read_json(path, {})
    if not isinstance(catalog, dict):
        catalog = {}
    sources = [row for row in catalog.get("sources", []) if isinstance(row, dict) and row.get("id") != CATALOG_SOURCE_ID]
    sources.append({
        "id": CATALOG_SOURCE_ID,
        "type": "generator_segmented_preset_evidence",
        "authority": "observed_data",
        "path": "data/preset_evidence_561.json",
        "count": report.get("counts", {}).get("effects", 0),
        "generatorVersion": GENERATOR_VERSION,
        "readyForRetune": report.get("quality", {}).get("readyForRetune", False),
    })
    catalog["sources"] = sources
    catalog["presetEvidence"] = {
        "generatorVersion": GENERATOR_VERSION,
        "path": "data/preset_evidence_561.json",
        "stableNamedEffects": report.get("counts", {}).get("stableNamedEffects", 0),
        "readyForRetune": report.get("quality", {}).get("readyForRetune", False),
    }
    write_json(path, catalog)


def enrich_search_index(out: Path, report: Mapping[str, Any]) -> None:
    path = out / "rag" / "search_index.json"
    index = read_json(path, {})
    if not isinstance(index, dict):
        index = {}
    items = [row for row in index.get("items", []) if isinstance(row, dict) and row.get("id") != CATALOG_SOURCE_ID]
    counts = report.get("counts", {})
    quality = report.get("quality", {})
    items.append({
        "id": CATALOG_SOURCE_ID,
        "type": "match_evidence",
        "title": "Эффективность тактик по периодам генератора 5.61",
        "topic": "tactics_generator_561",
        "text": f"Эффекты: {counts.get('effects', 0)}. Чистая stable-5.61 выборка: {counts.get('stableNamedEffects', 0)}. Ready for retune: {quality.get('readyForRetune', False)}.",
        "path": "data/preset_evidence_561.json",
    })
    index["items"] = items
    index["count"] = len(items)
    index["updatedAt"] = now_iso()
    write_json(path, index)


def enrich_ai_context(out: Path, report: Mapping[str, Any]) -> None:
    path = out / "ai_context.md"
    text = path.read_text(encoding="utf-8") if path.exists() else "# SLF AI RAG Current Export\n"
    if AI_CONTEXT_MARKER in text:
        text = text.split(AI_CONTEXT_MARKER, 1)[0].rstrip() + "\n"
    counts = report.get("counts", {})
    quality = report.get("quality", {})
    block = f"""

{AI_CONTEXT_MARKER}
## Generator 5.61 preset evidence

- Read `data/preset_evidence_561.json` before changing tactical thresholds.
- Stable 5.61 named effects: {counts.get('stableNamedEffects', 0)}.
- Ready for numeric retune: {str(quality.get('readyForRetune', False)).lower()}.
- Keep the 2026-07-13 through 2026-07-22 transition cohort separate.
- Do not infer score state from bucket labels.
"""
    path.write_text(text.rstrip() + block, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.environ.get("SLF_AI_OUT", "/var/www/html/slf_ai"))
    parser.add_argument("--api-base", default=os.environ.get("SLF_API_BASE", "http://127.0.0.1:5000/api"))
    parser.add_argument("--token", default=os.environ.get("SLF_API_TOKEN", ""))
    parser.add_argument("--events-file")
    parser.add_argument("--effects-file")
    args = parser.parse_args()

    if args.events_file or args.effects_file:
        events = load_rows(args.events_file)
        effects = load_rows(args.effects_file)
    else:
        if not args.token:
            raise SystemExit("SLF_API_TOKEN is required")
        events = fetch_collection(args.api_base, args.token, "preset_events_v2")
        effects = fetch_collection(args.api_base, args.token, "preset_effects_v2")

    out = Path(args.out)
    report = build_report(events, effects)
    write_json(out / "data" / "preset_evidence_561.json", report)
    enrich_catalog(out, report)
    enrich_search_index(out, report)
    enrich_ai_context(out, report)

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "events": len(events),
        "effects": len(effects),
        "stable_named_effects": report["counts"]["stableNamedEffects"],
        "ready_for_retune": report["quality"]["readyForRetune"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
