#!/usr/bin/env python3
"""
SLF Stage 2: Moment-Based Tactical Engine builder.

Purpose
-------
Build deterministic, explainable Stage 2 tactical artifacts from the existing
SLF AI export/RAG mirror without changing userscript runtime behavior.

Default input/output root on VPS:
    /var/www/html/slf_ai

Expected placement on VPS:
    /opt/slf_ai_exporter_v2/slf_ai_exporter_v2/slf_stage2_moment_build.py

Generated artifacts:
    rag/moment_events.jsonl
    rag/tactical_recommendations.jsonl
    rag/preset_decisions.jsonl
    rag/weak_zones.jsonl

Optional runtime pack update:
    tactics/knowledge-pack.latest.json

Contract boundaries
-------------------
- VPS/export data remains source of truth.
- RAG artifacts are derived and rebuildable.
- Google Drive is mirror only.
- Userscript must not read the full RAG corpus.
- This builder does not require external APIs and must not use secrets.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

SCHEMA_VERSION = "slf_stage2_moment_engine_v1"
DEFAULT_EXPORT_ROOT = "/var/www/html/slf_ai"


JsonObject = Dict[str, Any]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def load_jsonl(path: Path, limit: Optional[int] = None) -> List[JsonObject]:
    rows: List[JsonObject] = []
    if not path.exists():
        return rows
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except Exception:
                    continue
                if isinstance(item, dict):
                    rows.append(item)
                if limit and len(rows) >= limit:
                    break
    except Exception:
        return rows
    return rows


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def atomic_write_json(path: Path, data: Any) -> None:
    atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def atomic_write_jsonl(path: Path, rows: Iterable[JsonObject]) -> None:
    lines = [json.dumps(row, ensure_ascii=False, sort_keys=True) for row in rows]
    atomic_write_text(path, "\n".join(lines) + ("\n" if lines else ""))


def number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        n = float(value)
        if math.isfinite(n):
            return n
    except Exception:
        pass
    return default


def safe_ratio(a: float, b: float) -> Optional[float]:
    if not b:
        return None
    return a / b


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def extract_rows(summary: Any, likely_keys: Iterable[str]) -> List[JsonObject]:
    """Best-effort extraction from summary or raw export shapes.

    Existing Stage 1 summaries are compact; future exports may include samples,
    rows, items or by-game structures. This function intentionally tolerates all
    supported shapes so Stage 2 can be deployed before raw export format is final.
    """
    if isinstance(summary, list):
        return [x for x in summary if isinstance(x, dict)]
    if not isinstance(summary, dict):
        return []

    for key in likely_keys:
        value = summary.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = extract_rows(value, ["rows", "items", "data", "records", "samples"])
            if nested:
                return nested

    for key in ("rows", "items", "data", "records", "samples"):
        value = summary.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]

    by_game = summary.get("byGame") or summary.get("games") or summary.get("matches")
    if isinstance(by_game, dict):
        rows: List[JsonObject] = []
        for game_id, value in by_game.items():
            for row in extract_rows(value, ["rows", "items", "snapshots", "results"]):
                row.setdefault("gameId", game_id)
                rows.append(row)
        return rows

    return []


def get_game_id(row: JsonObject) -> str:
    for key in ("gameId", "game_id", "matchId", "match_id", "key"):
        value = row.get(key)
        if value not in (None, ""):
            return str(value)
    return "unknown"


def get_bucket(row: JsonObject) -> str:
    value = row.get("bucket") or row.get("generationBucket") or row.get("window") or ""
    if isinstance(value, dict):
        return str(value.get("label") or value.get("key") or "")
    return str(value or "")


def get_minute(row: JsonObject) -> Optional[int]:
    for key in ("minute", "effectiveMinute", "baseMinute"):
        value = row.get(key)
        if value is None:
            continue
        try:
            n = int(float(value))
            return max(0, min(120, n))
        except Exception:
            continue
    window = row.get("generationWindow")
    if isinstance(window, dict):
        value = window.get("effectiveMinute") or window.get("to") or window.get("from")
        try:
            return int(float(value))
        except Exception:
            return None
    return None


def phase_for_minute(minute: Optional[int], bucket: str = "") -> str:
    if minute is None:
        if bucket.startswith("01"):
            return "early"
        return "unknown"
    if minute < 15:
        return "collect"
    if minute <= 45:
        return "first_half"
    if minute <= 60:
        return "second_half_open"
    if minute <= 75:
        return "late_setup"
    if minute <= 84:
        return "late"
    return "final_5"


def score_state(row: JsonObject) -> Tuple[str, int]:
    score = row.get("score") or {}
    if isinstance(score, dict):
        home = score.get("home")
        away = score.get("away")
        my_team = row.get("myTeam")
        teams = row.get("teams") if isinstance(row.get("teams"), list) else []
        if home is not None and away is not None:
            home_n = int(number(home))
            away_n = int(number(away))
            if teams and str(my_team) == str(teams[1]):
                diff = away_n - home_n
            else:
                diff = home_n - away_n
            if diff > 0:
                return "winning", diff
            if diff < 0:
                return "losing", diff
            return "draw", 0
    value = row.get("scoreState") or row.get("state")
    if value in {"winning", "losing", "draw"}:
        return str(value), int(number(row.get("scoreDiff"), 0))
    return "unknown", 0


def team_stats(row: JsonObject) -> Tuple[JsonObject, JsonObject]:
    my_team = str(row.get("myTeam") or "")
    stats = row.get("stats")
    if isinstance(stats, list):
        my: JsonObject = {}
        opp: JsonObject = {}
        for item in stats:
            if not isinstance(item, dict):
                continue
            item_stats = item.get("stats") if isinstance(item.get("stats"), dict) else item
            if my_team and str(item.get("teamId") or item.get("team_id") or "") == my_team:
                my = item_stats
            elif not opp:
                opp = item_stats
        if my or opp:
            return my, opp
    my = row.get("my") if isinstance(row.get("my"), dict) else {}
    opp = row.get("opp") if isinstance(row.get("opp"), dict) else {}
    return my, opp


def get_xt(row: JsonObject) -> Tuple[float, float]:
    xt = row.get("xT") or row.get("xt") or {}
    if isinstance(xt, dict):
        home = number(xt.get("home"), 0)
        away = number(xt.get("away"), 0)
        teams = row.get("teams") if isinstance(row.get("teams"), list) else []
        my_team = str(row.get("myTeam") or "")
        if teams and my_team and str(teams[1]) == my_team:
            return away, home
        return home, away
    return number(row.get("myXT"), 0), number(row.get("oppXT"), 0)


def classify_moment(row: JsonObject) -> Tuple[List[str], float, List[str]]:
    minute = get_minute(row)
    bucket = get_bucket(row)
    phase = phase_for_minute(minute, bucket)
    score, diff = score_state(row)
    my_stats, opp_stats = team_stats(row)
    my_xg = number(my_stats.get("xG") or row.get("myXg") or row.get("myXG"), 0)
    opp_xg = number(opp_stats.get("xG") or row.get("oppXg") or row.get("oppXG"), 0)
    my_xt, opp_xt = get_xt(row)
    my_bad = number(my_stats.get("badActionsPct") or my_stats.get("defective") or row.get("myBad"), 0)
    opp_press = number(opp_stats.get("pressVector") or opp_stats.get("press_height") or row.get("oppPressVector"), 0)
    opp_def = number(opp_stats.get("defVector") or opp_stats.get("def_height") or row.get("oppDefVector"), 0)

    signals: List[str] = []
    reasons: List[str] = []

    def add(signal: str, reason: str) -> None:
        if signal not in signals:
            signals.append(signal)
            reasons.append(reason)

    if phase == "collect":
        add("collect_data", "до 15-й минуты собираем стартовые метрики")
    if score == "winning" and minute is not None and minute >= 70:
        add("protect_lead", "ведём после 70-й минуты")
    if score == "losing" and minute is not None and minute >= 55:
        add("need_goal", "проигрываем после 55-й минуты")
    if score == "losing" and minute is not None and minute >= 80:
        add("late_need_goal", "проигрываем в финальной фазе")
    if opp_xg > my_xg + 0.45 or opp_xt > my_xt + 0.25:
        add("under_pressure", "соперник опаснее по xG/xT")
    if my_xg > opp_xg + 0.35 or my_xt > opp_xt + 0.20:
        add("attacking_momentum", "у нас лучше атакующий импульс по xG/xT")
    if my_bad >= 20:
        add("high_bad_actions", "высокий процент брака")
    if opp_press >= 65:
        add("opponent_high_press", "соперник высоко прессингует")
    if 0 < opp_def <= 45:
        add("opponent_low_block", "соперник низко обороняется")

    hints = as_list(row.get("developerHints"))
    hint_text = " ".join(str(x.get("text") if isinstance(x, dict) else x) for x in hints).lower()
    if "лучше ожиданий" in hint_text:
        add("generator_quality_positive", "генератор оценивает игру лучше ожиданий")
    if "ожидает" in hint_text and ("атак" in hint_text or "оборон" in hint_text):
        add("generator_attention", "подсказки генератора требуют проверки атаки/обороны")

    if not signals:
        add("balanced_control", "нет сильного аварийного сигнала")

    evidence_count = len(signals)
    metric_presence = sum(1 for x in [my_xg, opp_xg, my_xt, opp_xt, my_bad, opp_press, opp_def] if x)
    confidence = clamp(0.35 + evidence_count * 0.06 + min(metric_presence, 5) * 0.05)
    return signals, confidence, reasons


def recommend_preset(signals: List[str]) -> Tuple[str, str, str]:
    s = set(signals)
    if "collect_data" in s:
        return "hold_current", "collect_more_data", "до первого валидного tactical window лучше не делать резких изменений"
    if "late_need_goal" in s:
        return "Xabi_VerticalBox_att3", "late_goal_push", "нужен вертикальный риск в финальной фазе"
    if "need_goal" in s and "under_pressure" not in s:
        return "Pep_ControlledPush_att3", "step_up_attack", "нужно усилить атаку без полного развала структуры"
    if "protect_lead" in s and "under_pressure" in s:
        return "Simeone_LowBlock_def5", "protect_under_pressure", "ведём и соперник создаёт давление"
    if "protect_lead" in s:
        return "Simeone_Compact442_def4", "protect_lead", "ведём поздно, нужен компактный контроль"
    if "under_pressure" in s and "high_bad_actions" in s:
        return "Henta_Hold_def3", "stabilize_errors", "давление соперника и высокий брак требуют стабилизации"
    if "under_pressure" in s:
        return "Mourinho_WeakSide_def3", "absorb_and_counter", "соперник опаснее, нужен более осторожный контр-план"
    if "attacking_momentum" in s and "opponent_low_block" in s:
        return "Pep_ControlledPush_att3", "controlled_push_low_block", "есть импульс против низкого блока"
    if "opponent_high_press" in s:
        return "Compact_Counter_def3", "counter_high_press", "соперник высоко прессингует, можно атаковать пространство за линиями"
    return "Pep_StandardControl_bal3", "balanced_control", "баланс без сильного аварийного сигнала"


def build_from_snapshots(snapshot_rows: List[JsonObject], generated_at: str) -> Tuple[List[JsonObject], List[JsonObject], List[JsonObject], List[JsonObject]]:
    moment_events: List[JsonObject] = []
    recommendations: List[JsonObject] = []
    preset_decisions: List[JsonObject] = []
    weak_zones: List[JsonObject] = []

    # Deterministic order keeps rebuilds stable.
    snapshot_rows = sorted(
        snapshot_rows,
        key=lambda r: (get_game_id(r), get_minute(r) or 0, get_bucket(r), str(r.get("ts") or "")),
    )

    for row in snapshot_rows:
        game_id = get_game_id(row)
        minute = get_minute(row)
        bucket = get_bucket(row)
        phase = phase_for_minute(minute, bucket)
        score, diff = score_state(row)
        signals, confidence, reasons = classify_moment(row)
        recommendation, decision, decision_reason = recommend_preset(signals)
        source_refs = ["match_snapshots_v2"]
        if row.get("developerHints"):
            source_refs.append("developer_hints")
        if row.get("generatorDetailMetrics"):
            source_refs.append("generator_detail_metrics")

        event_key = "|".join(["moment", game_id, bucket, str(minute or ""), ",".join(signals)])
        moment_events.append({
            "schema": "slf_moment_event_v1",
            "stage": "stage2_moment_engine",
            "eventKey": event_key,
            "generatedAt": generated_at,
            "gameId": game_id,
            "bucket": bucket,
            "minute": minute,
            "phase": phase,
            "scoreState": score,
            "scoreDiff": diff,
            "signals": signals,
            "reason": reasons,
            "confidence": round(confidence, 3),
            "sourceRefs": source_refs,
        })

        recommendations.append({
            "schema": "slf_tactical_recommendation_v1",
            "stage": "stage2_moment_engine",
            "recommendationKey": "|".join(["recommendation", game_id, bucket, str(minute or "")]),
            "generatedAt": generated_at,
            "gameId": game_id,
            "bucket": bucket,
            "minute": minute,
            "phase": phase,
            "recommendation": recommendation,
            "decision": decision,
            "reason": [decision_reason, *reasons[:4]],
            "risk": risk_for_signals(signals),
            "reviewAgain": "next_generation_snapshot_or_game_state_change",
            "confidence": round(clamp(confidence - 0.03), 3),
            "sourceRefs": source_refs,
        })

        current_preset = row.get("currentTacticName") or row.get("presetName") or "unknown"
        preset_decisions.append({
            "schema": "slf_preset_decision_v1",
            "stage": "stage2_moment_engine",
            "decisionKey": "|".join(["preset_decision", game_id, bucket, str(minute or "")]),
            "generatedAt": generated_at,
            "gameId": game_id,
            "bucket": bucket,
            "minute": minute,
            "fromPreset": current_preset,
            "toPreset": recommendation,
            "decision": decision,
            "guard": "single_recommendation_no_top3_no_simulation",
            "reason": decision_reason,
            "signals": signals,
            "confidence": round(clamp(confidence - 0.05), 3),
            "sourceRefs": source_refs,
        })

        weak_zone = infer_weak_zone(row, signals)
        if weak_zone:
            weak_zones.append(weak_zone | {
                "schema": "slf_weak_zone_v1",
                "stage": "stage2_moment_engine",
                "generatedAt": generated_at,
                "gameId": game_id,
                "bucket": bucket,
                "minute": minute,
            })

    return moment_events, recommendations, preset_decisions, weak_zones


def risk_for_signals(signals: List[str]) -> str:
    s = set(signals)
    if "late_need_goal" in s or ("under_pressure" in s and "high_bad_actions" in s):
        return "high"
    if "need_goal" in s or "under_pressure" in s or "protect_lead" in s:
        return "medium"
    return "low"


def infer_weak_zone(row: JsonObject, signals: List[str]) -> Optional[JsonObject]:
    # v1 uses existing player/signal hints when present and otherwise emits only
    # high-confidence tactical zone proxies.
    player_signals = row.get("playerSignals") if isinstance(row.get("playerSignals"), dict) else {}
    weak_opp = as_list(player_signals.get("weakOppSkill"))
    if weak_opp:
        first = weak_opp[0]
        if isinstance(first, dict):
            pos = str(first.get("normalizedPosition") or first.get("position") or "").upper()
            if pos in {"DR", "MR"}:
                zone = "opponent_right_flank"
            elif pos in {"DL", "ML"}:
                zone = "opponent_left_flank"
            elif pos in {"DC", "DM", "CM"}:
                zone = "opponent_center"
            else:
                zone = "opponent_unknown"
            return {
                "weakZoneKey": "|".join(["weak_zone", get_game_id(row), get_bucket(row), zone]),
                "team": "opponent",
                "zone": zone,
                "reason": [f"weak opponent position: {pos}"],
                "confidence": 0.62,
                "sourceRefs": ["player_observations", "match_snapshots_v2"],
            }

    if "opponent_high_press" in signals:
        return {
            "weakZoneKey": "|".join(["weak_zone", get_game_id(row), get_bucket(row), "space_behind_press"]),
            "team": "opponent",
            "zone": "space_behind_press",
            "reason": ["opponent high press creates space behind lines"],
            "confidence": 0.52,
            "sourceRefs": ["match_snapshots_v2"],
        }
    if "opponent_low_block" in signals and "attacking_momentum" in signals:
        return {
            "weakZoneKey": "|".join(["weak_zone", get_game_id(row), get_bucket(row), "low_block_pressure_zone"]),
            "team": "opponent",
            "zone": "low_block_pressure_zone",
            "reason": ["attacking momentum against low block"],
            "confidence": 0.5,
            "sourceRefs": ["match_snapshots_v2"],
        }
    return None


def build_summary_fallback(match_summary: JsonObject, generated_at: str) -> Tuple[List[JsonObject], List[JsonObject], List[JsonObject], List[JsonObject]]:
    counts = match_summary.get("counts") if isinstance(match_summary.get("counts"), dict) else {}
    top_games = match_summary.get("topGamesBySnapshotCount") if isinstance(match_summary.get("topGamesBySnapshotCount"), list) else []
    total_snapshots = int(number(counts.get("match_snapshots_v2"), 0))
    total_results = int(number(counts.get("match_results_v2"), 0))

    rows: List[JsonObject] = []
    for item in top_games[:50]:
        if not isinstance(item, dict):
            continue
        game_id = str(item.get("key") or item.get("gameId") or "unknown")
        count = int(number(item.get("count"), 0))
        confidence = clamp(0.35 + min(count, 12) * 0.03)
        rows.append({
            "schema": "slf_moment_event_v1",
            "stage": "stage2_moment_engine",
            "eventKey": f"moment_summary|{game_id}",
            "generatedAt": generated_at,
            "gameId": game_id,
            "bucket": "summary",
            "minute": None,
            "phase": "post_match_summary",
            "scoreState": "unknown",
            "scoreDiff": 0,
            "signals": ["historical_match_available"],
            "reason": [f"у матча есть {count} сохранённых generation snapshots"],
            "confidence": round(confidence, 3),
            "sourceRefs": ["match_data_summary.json"],
        })

    recs = [{
        "schema": "slf_tactical_recommendation_v1",
        "stage": "stage2_moment_engine",
        "recommendationKey": "stage2_dataset_readiness",
        "generatedAt": generated_at,
        "gameId": "dataset",
        "bucket": "summary",
        "minute": None,
        "phase": "dataset_readiness",
        "recommendation": "build_moment_engine_from_raw_snapshots",
        "decision": "dataset_ready_for_stage2",
        "reason": [
            f"match_snapshots_v2: {total_snapshots}",
            f"match_results_v2: {total_results}",
            "для полноценных moment cards нужен raw snapshot export или samples в summary",
        ],
        "risk": "low",
        "reviewAgain": "after_next_daily_export",
        "confidence": 0.58 if total_snapshots else 0.25,
        "sourceRefs": ["match_data_summary.json"],
    }]
    return rows, recs, [], []


def update_knowledge_pack(pack_path: Path, recommendations: List[JsonObject], generated_at: str, max_items: int) -> None:
    pack = load_json(pack_path, {})
    if not isinstance(pack, dict):
        pack = {}

    compact = []
    for row in recommendations[:max_items]:
        compact.append({
            "schema": "slf_runtime_moment_hint_v1",
            "gameId": row.get("gameId"),
            "bucket": row.get("bucket"),
            "phase": row.get("phase"),
            "recommendation": row.get("recommendation"),
            "decision": row.get("decision"),
            "reason": row.get("reason", [])[:4],
            "risk": row.get("risk"),
            "confidence": row.get("confidence"),
        })

    pack["stage2"] = {
        "schema": "slf_runtime_stage2_pack_v1",
        "generatedAt": generated_at,
        "source": "slf_stage2_moment_build.py",
        "mode": "compact_runtime_hints_only",
        "items": compact,
    }
    atomic_write_json(pack_path, pack)


def run(root: Path, max_pack_items: int, update_pack: bool) -> JsonObject:
    generated_at = utc_now()
    data_dir = root / "data"
    rag_dir = root / "rag"
    tactics_dir = root / "tactics"

    match_summary = load_json(data_dir / "match_data_summary.json", {})
    preset_events_summary = load_json(data_dir / "preset_events_summary.json", {})
    preset_effects_summary = load_json(data_dir / "preset_effects_summary.json", {})

    snapshot_rows = extract_rows(match_summary, ["snapshots", "match_snapshots_v2", "snapshotRows"])
    result_rows = extract_rows(match_summary, ["results", "match_results_v2", "resultRows"])

    # Future-safe: if the exporter later writes raw JSONL, the builder starts
    # using it automatically without changing contract names.
    snapshot_rows.extend(load_jsonl(data_dir / "match_snapshots_v2.jsonl"))
    result_rows.extend(load_jsonl(data_dir / "match_results_v2.jsonl"))

    if snapshot_rows:
        moment_events, recommendations, preset_decisions, weak_zones = build_from_snapshots(snapshot_rows, generated_at)
    else:
        moment_events, recommendations, preset_decisions, weak_zones = build_summary_fallback(match_summary, generated_at)

    # Attach dataset-level support refs when available.
    if preset_events_summary:
        for row in recommendations:
            row.setdefault("sourceRefs", []).append("preset_events_summary.json")
    if preset_effects_summary:
        for row in recommendations:
            row.setdefault("sourceRefs", []).append("preset_effects_summary.json")

    atomic_write_jsonl(rag_dir / "moment_events.jsonl", moment_events)
    atomic_write_jsonl(rag_dir / "tactical_recommendations.jsonl", recommendations)
    atomic_write_jsonl(rag_dir / "preset_decisions.jsonl", preset_decisions)
    atomic_write_jsonl(rag_dir / "weak_zones.jsonl", weak_zones)

    if update_pack:
        update_knowledge_pack(tactics_dir / "knowledge-pack.latest.json", recommendations, generated_at, max_pack_items)

    summary = {
        "schema": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "root": str(root),
        "inputs": {
            "match_data_summary": bool(match_summary),
            "preset_events_summary": bool(preset_events_summary),
            "preset_effects_summary": bool(preset_effects_summary),
            "snapshot_rows": len(snapshot_rows),
            "result_rows": len(result_rows),
        },
        "outputs": {
            "moment_events": len(moment_events),
            "tactical_recommendations": len(recommendations),
            "preset_decisions": len(preset_decisions),
            "weak_zones": len(weak_zones),
            "knowledge_pack_updated": bool(update_pack),
        },
    }
    atomic_write_json(rag_dir / "stage2_build_summary.json", summary)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Build SLF Stage 2 moment-based tactical artifacts.")
    parser.add_argument("--root", default=DEFAULT_EXPORT_ROOT, help="SLF AI export root; default: /var/www/html/slf_ai")
    parser.add_argument("--max-pack-items", type=int, default=50, help="Maximum compact recommendations added to runtime pack")
    parser.add_argument("--no-pack-update", action="store_true", help="Do not update tactics/knowledge-pack.latest.json")
    args = parser.parse_args()

    summary = run(Path(args.root), max_pack_items=args.max_pack_items, update_pack=not args.no_pack_update)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
