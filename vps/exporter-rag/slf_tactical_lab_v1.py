#!/usr/bin/env python3
"""Build privacy-safe Tactical Lab v1 aggregates from cached tactical collections."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

SUMMARY_SCHEMA = "slf_tactical_lab_summary_v1"
QUALITY_SCHEMA = "slf_tactical_lab_quality_v1"
POPULATION_FALLBACK = "slf_tactical_lab_561_p01"
MINUTE_BUCKETS = ((0, 14, "0-14"), (15, 29, "15-29"), (30, 44, "30-44"), (45, 59, "45-59"), (60, 74, "60-74"), (75, 200, "75+"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def as_records(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        for key in ("data", "items", "records", "results"):
            if isinstance(value.get(key), list):
                return [row for row in value[key] if isinstance(row, dict)]
    return []


def number(value: Any) -> Optional[float]:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def integer(value: Any) -> Optional[int]:
    parsed = number(value)
    return int(parsed) if parsed is not None else None


def ratio(numerator: int, denominator: int) -> float:
    return round((numerator / denominator) if denominator else 0.0, 4)


def rounded(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def average(values: Iterable[Any]) -> Optional[float]:
    rows = [parsed for value in values if (parsed := number(value)) is not None]
    return rounded(sum(rows) / len(rows)) if rows else None


def median(values: Iterable[Any]) -> Optional[float]:
    rows = sorted(parsed for value in values if (parsed := number(value)) is not None)
    if not rows:
        return None
    middle = len(rows) // 2
    if len(rows) % 2:
        return rounded(rows[middle])
    return rounded((rows[middle - 1] + rows[middle]) / 2)


def minute_bucket(value: Any) -> str:
    minute = integer(value)
    if minute is None:
        return "unknown"
    for low, high, label in MINUTE_BUCKETS:
        if low <= minute <= high:
            return label
    return "unknown"


def counter_dict(values: Iterable[Any]) -> Dict[str, int]:
    counter = Counter(str(value or "unknown") for value in values)
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def assignment_from_state(state: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(state, dict):
        return None
    assignment = state.get("assignment")
    if not isinstance(assignment, dict):
        return None
    experiment_id = str(assignment.get("experimentId") or "").strip()
    assignment_id = str(assignment.get("assignmentId") or "").strip()
    if not experiment_id or not assignment_id:
        return None
    return assignment


def lab_state(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    state = record.get("tacticalLab")
    return state if isinstance(state, dict) else None


def lifecycle(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    event = record.get("tacticalLabEvent")
    if not isinstance(event, dict) or event.get("schema") != "slf_tactical_lab_event_v1":
        return None
    if event.get("kind") not in {"activation", "exit"}:
        return None
    return event


def owned_result(record: Dict[str, Any]) -> Optional[str]:
    score = record.get("score") if isinstance(record.get("score"), dict) else {}
    teams = record.get("teams") if isinstance(record.get("teams"), list) else []
    my_team = record.get("myTeam")
    if len(teams) < 2 or my_team is None:
        return None
    home = integer(score.get("home"))
    away = integer(score.get("away"))
    if home is None or away is None:
        return None
    try:
        is_home = int(teams[0]) == int(my_team)
    except (TypeError, ValueError):
        is_home = str(teams[0]) == str(my_team)
    mine, theirs = (home, away) if is_home else (away, home)
    return "win" if mine > theirs else "loss" if mine < theirs else "draw"


def safe_previous(context: Dict[str, Any]) -> str:
    previous = context.get("previous") if isinstance(context.get("previous"), dict) else {}
    preset = str(previous.get("presetId") or "").strip()
    if preset:
        return preset
    return "manual" if previous.get("tacticFingerprint") else "unknown"


def completeness(context: Any, fields: Sequence[str]) -> bool:
    if not isinstance(context, dict):
        return False
    for field in fields:
        current: Any = context
        for part in field.split("."):
            if not isinstance(current, dict) or part not in current:
                return False
            current = current.get(part)
        if current in (None, "", "unknown"):
            return False
    return True


def collect_evidence(snapshots: Sequence[Dict[str, Any]], results: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    assignments: Dict[str, Dict[str, Any]] = {}
    activation_events: Dict[str, Dict[str, Any]] = {}
    exit_events: Dict[str, Dict[str, Any]] = {}
    result_by_assignment: Dict[str, Dict[str, Any]] = {}
    duplicate_events = 0

    def remember_state(record: Dict[str, Any], is_result: bool = False) -> None:
        state = lab_state(record)
        assignment = assignment_from_state(state)
        if not assignment:
            return
        assignment_id = str(assignment["assignmentId"])
        current = assignments.get(assignment_id, {})
        assignments[assignment_id] = {
            "assignmentId": assignment_id,
            "experimentId": str(assignment.get("experimentId") or current.get("experimentId") or ""),
            "populationVersion": str(assignment.get("populationVersion") or state.get("populationVersion") or current.get("populationVersion") or POPULATION_FALLBACK),
            "genomeFingerprint": str(assignment.get("genomeFingerprint") or current.get("genomeFingerprint") or ""),
            "activation": state.get("activation") if isinstance(state.get("activation"), dict) else current.get("activation"),
            "completed": state.get("completed") if isinstance(state.get("completed"), dict) else current.get("completed"),
        }
        if is_result:
            result_by_assignment[assignment_id] = record

    for record in snapshots:
        remember_state(record)
        event = lifecycle(record)
        if not event:
            continue
        event_key = str(event.get("eventKey") or "").strip()
        assignment_id = str(event.get("assignmentId") or "").strip()
        if not event_key or not assignment_id:
            continue
        target = activation_events if event.get("kind") == "activation" else exit_events
        if event_key in target:
            duplicate_events += 1
            continue
        target[event_key] = event
        if assignment_id not in assignments:
            assignments[assignment_id] = {
                "assignmentId": assignment_id,
                "experimentId": str(event.get("experimentId") or ""),
                "populationVersion": str(event.get("populationVersion") or POPULATION_FALLBACK),
                "genomeFingerprint": str(event.get("genomeFingerprint") or ""),
                "activation": None,
                "completed": None,
            }

    for record in results:
        remember_state(record, is_result=True)

    activation_by_assignment: Dict[str, Dict[str, Any]] = {}
    for event in activation_events.values():
        assignment_id = str(event.get("assignmentId") or "")
        activation_by_assignment.setdefault(assignment_id, event)

    exit_by_assignment: Dict[str, Dict[str, Any]] = {}
    for event in exit_events.values():
        assignment_id = str(event.get("assignmentId") or "")
        exit_by_assignment.setdefault(assignment_id, event)

    return {
        "assignments": assignments,
        "activationByAssignment": activation_by_assignment,
        "exitByAssignment": exit_by_assignment,
        "resultByAssignment": result_by_assignment,
        "duplicateLifecycleDropped": duplicate_events,
        "activationEventCount": len(activation_events),
        "exitEventCount": len(exit_events),
    }


def build_outputs(snapshots: Sequence[Dict[str, Any]], results: Sequence[Dict[str, Any]]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    evidence = collect_evidence(snapshots, results)
    assignments = evidence["assignments"]
    activation_by_assignment = evidence["activationByAssignment"]
    exit_by_assignment = evidence["exitByAssignment"]
    result_by_assignment = evidence["resultByAssignment"]

    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    population_counts: Counter[str] = Counter()
    for assignment_id, row in assignments.items():
        experiment_id = str(row.get("experimentId") or "unknown")
        population = str(row.get("populationVersion") or POPULATION_FALLBACK)
        population_counts[population] += 1
        activation_event = activation_by_assignment.get(assignment_id)
        exit_event = exit_by_assignment.get(assignment_id)
        activation_state = row.get("activation") if isinstance(row.get("activation"), dict) else None
        completed_state = row.get("completed") if isinstance(row.get("completed"), dict) else None

        entry = activation_event.get("context") if isinstance(activation_event, dict) and isinstance(activation_event.get("context"), dict) else None
        if entry is None and activation_state:
            entry = activation_state.get("entryContext") if isinstance(activation_state.get("entryContext"), dict) else None
        exit_context = exit_event.get("context") if isinstance(exit_event, dict) and isinstance(exit_event.get("context"), dict) else None
        if exit_context is None and completed_state:
            exit_context = completed_state.get("exitContext") if isinstance(completed_state.get("exitContext"), dict) else None

        exit_extra = exit_event.get("extra") if isinstance(exit_event, dict) and isinstance(exit_event.get("extra"), dict) else {}
        duration = exit_extra.get("durationMinutes")
        if duration is None and completed_state:
            duration = completed_state.get("durationMinutes")
        delta = exit_extra.get("delta") if isinstance(exit_extra.get("delta"), dict) else None
        if delta is None and completed_state and isinstance(completed_state.get("delta"), dict):
            delta = completed_state.get("delta")

        result = owned_result(result_by_assignment.get(assignment_id, {})) if assignment_id in result_by_assignment else None
        buckets[experiment_id].append({
            "activated": bool(entry or activation_state or completed_state),
            "completed": bool(exit_context or completed_state),
            "entry": entry,
            "exit": exit_context,
            "duration": duration,
            "delta": delta,
            "result": result,
            "resultLinked": assignment_id in result_by_assignment,
            "populationVersion": population,
        })

    per_experiment: List[Dict[str, Any]] = []
    for experiment_id in sorted(buckets):
        rows = buckets[experiment_id]
        activated = [row for row in rows if row["activated"]]
        completed = [row for row in rows if row["completed"]]
        entry_rows = [row["entry"] for row in activated if isinstance(row.get("entry"), dict)]
        exit_rows = [row["exit"] for row in completed if isinstance(row.get("exit"), dict)]
        deltas = [row["delta"] for row in completed if isinstance(row.get("delta"), dict)]
        result_rows = [row["result"] for row in activated if row.get("result") in {"win", "draw", "loss"}]
        result_counts = Counter(result_rows)
        numeric_delta_keys = sorted({key for delta in deltas for key, value in delta.items() if number(value) is not None})
        avg_delta = {key: average(delta.get(key) for delta in deltas) for key in numeric_delta_keys}
        avg_delta = {key: value for key, value in avg_delta.items() if value is not None}
        points = result_counts["win"] * 3 + result_counts["draw"]

        per_experiment.append({
            "experimentId": experiment_id,
            "populationVersion": rows[0].get("populationVersion") or POPULATION_FALLBACK,
            "assignments": len(rows),
            "activations": len(activated),
            "completedPhases": len(completed),
            "activationRate": ratio(len(activated), len(rows)),
            "exposureMinutes": {
                "total": rounded(sum(number(row.get("duration")) or 0 for row in completed), 2),
                "average": average(row.get("duration") for row in completed),
                "median": median(row.get("duration") for row in completed),
            },
            "entryContext": {
                "minuteBuckets": counter_dict(minute_bucket(row.get("minute")) for row in entry_rows),
                "previousPreset": counter_dict(safe_previous(row) for row in entry_rows),
                "scoreState": counter_dict(row.get("scoreState") for row in entry_rows),
                "homeAway": counter_dict(row.get("homeAway") for row in entry_rows),
                "strengthBucket": counter_dict(row.get("strengthBucket") for row in entry_rows),
            },
            "phaseEffect": {
                "samples": len(deltas),
                "averageDelta": avg_delta,
            },
            "outcomeAssociation": {
                "linkedFinishedResults": len(result_rows),
                "wins": result_counts["win"],
                "draws": result_counts["draw"],
                "losses": result_counts["loss"],
                "winRate": ratio(result_counts["win"], len(result_rows)),
                "pointsPerMatch": rounded(points / len(result_rows), 3) if result_rows else None,
            },
            "contextCompleteness": {
                "entryComplete": sum(completeness(row, ("minute", "scoreState", "homeAway", "strengthBucket", "previous.tacticFingerprint", "productionRecommendation.presetId")) for row in entry_rows),
                "exitComplete": sum(completeness(row, ("minute", "scoreState", "next.tacticSource")) for row in exit_rows),
            },
        })

    assignment_count = len(assignments)
    activated_count = sum(1 for rows in buckets.values() for row in rows if row["activated"])
    completed_count = sum(1 for rows in buckets.values() for row in rows if row["completed"])
    linked_count = sum(1 for rows in buckets.values() for row in rows if row["activated"] and row["resultLinked"])
    entry_contexts = [row["entry"] for rows in buckets.values() for row in rows if row["activated"] and isinstance(row.get("entry"), dict)]
    exit_contexts = [row["exit"] for rows in buckets.values() for row in rows if row["completed"] and isinstance(row.get("exit"), dict)]
    entry_complete = sum(completeness(row, ("minute", "scoreState", "homeAway", "strengthBucket", "previous.tacticFingerprint", "productionRecommendation.presetId")) for row in entry_contexts)
    exit_complete = sum(completeness(row, ("minute", "scoreState", "next.tacticSource")) for row in exit_contexts)
    unknown_previous = sum(safe_previous(row) == "unknown" for row in entry_contexts)

    summary = {
        "schema": SUMMARY_SCHEMA,
        "generatedAt": now_iso(),
        "evidencePolicy": "real match telemetry is evidence; RAG/generator knowledge is prior only",
        "populationVersions": dict(sorted(population_counts.items())),
        "summary": {
            "assignments": assignment_count,
            "activations": activated_count,
            "completedPhases": completed_count,
            "activationRate": ratio(activated_count, assignment_count),
            "experimentsAssigned": len(per_experiment),
            "experimentsActivated": sum(1 for row in per_experiment if row["activations"] > 0),
            "linkedFinishedResults": linked_count,
        },
        "experiments": per_experiment,
        "privacy": {
            "containsRawGameId": False,
            "containsAssignmentId": False,
            "containsEventKey": False,
            "containsTeamNames": False,
        },
    }
    quality = {
        "schema": QUALITY_SCHEMA,
        "generatedAt": now_iso(),
        "populationVersions": dict(sorted(population_counts.items())),
        "counts": {
            "assignments": assignment_count,
            "activations": activated_count,
            "completedPhases": completed_count,
            "activationLifecycleEvents": evidence["activationEventCount"],
            "exitLifecycleEvents": evidence["exitEventCount"],
            "duplicateLifecycleEventsDropped": evidence["duplicateLifecycleDropped"],
            "linkedFinishedResults": linked_count,
        },
        "coverage": {
            "activation": ratio(activated_count, assignment_count),
            "completedPhase": ratio(completed_count, activated_count),
            "finishedResultLinkage": ratio(linked_count, activated_count),
            "entryContextComplete": ratio(entry_complete, len(entry_contexts)),
            "exitContextComplete": ratio(exit_complete, len(exit_contexts)),
            "knownPreviousTactic": ratio(len(entry_contexts) - unknown_previous, len(entry_contexts)),
        },
        "readiness": {
            "hasAssignments": assignment_count > 0,
            "hasActivations": activated_count > 0,
            "hasCompletedPhases": completed_count > 0,
            "automaticPromotionAllowed": False,
            "note": "Tactical Lab v1 is evidence collection only; promotion/evolution is deferred to issue #252.",
        },
        "privacy": summary["privacy"],
    }
    return summary, quality


def file_row(path: Path, relative: str) -> Dict[str, Any]:
    raw = path.read_bytes() if path.exists() else b""
    return {
        "path": relative,
        "exists": path.exists(),
        "sizeBytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest() if raw else None,
    }


def enrich_public_indexes(out: Path) -> None:
    summary_path = out / "data" / "tactical_lab_summary.json"
    quality_path = out / "data" / "tactical_lab_quality.json"
    manifest_path = out / "manifest.json"
    manifest = read_json(manifest_path, {})
    if isinstance(manifest, dict):
        files = manifest.setdefault("files", {})
        files["tacticalLabSummary"] = file_row(summary_path, "data/tactical_lab_summary.json")
        files["tacticalLabQuality"] = file_row(quality_path, "data/tactical_lab_quality.json")
        order = manifest.setdefault("recommendedReadOrder", [])
        for rel in ("data/tactical_lab_quality.json", "data/tactical_lab_summary.json"):
            if rel in order:
                order.remove(rel)
        order[0:0] = ["data/tactical_lab_quality.json", "data/tactical_lab_summary.json"]
        write_json(manifest_path, manifest)

    catalog_path = out / "rag" / "catalog.json"
    catalog = read_json(catalog_path, {})
    if isinstance(catalog, dict):
        sources = [row for row in catalog.get("sources", []) if isinstance(row, dict) and row.get("id") not in {"tactical_lab_summary", "tactical_lab_quality"}]
        sources.extend([
            {"id": "tactical_lab_quality", "type": "telemetry_quality", "authority": "observed_data", "path": "data/tactical_lab_quality.json"},
            {"id": "tactical_lab_summary", "type": "experimental_tactics", "authority": "observed_data", "path": "data/tactical_lab_summary.json"},
        ])
        catalog["sources"] = sources
        catalog["updatedAt"] = now_iso()
        write_json(catalog_path, catalog)

    search_path = out / "rag" / "search_index.json"
    search = read_json(search_path, {})
    if isinstance(search, dict):
        items = [row for row in search.get("items", []) if isinstance(row, dict) and row.get("id") != "tactical_lab_v1_summary"]
        summary = read_json(summary_path, {})
        counts = summary.get("summary", {}) if isinstance(summary, dict) else {}
        items.append({
            "id": "tactical_lab_v1_summary",
            "type": "experimental_tactics",
            "title": "Tactical Lab v1 evidence",
            "topic": "tactics",
            "text": f"Tactical Lab P01: assignments={counts.get('assignments', 0)}, activations={counts.get('activations', 0)}, completed={counts.get('completedPhases', 0)}. Real match telemetry is evidence; RAG is prior only.",
            "path": "data/tactical_lab_summary.json",
        })
        search["items"] = items
        search["count"] = len(items)
        search["updatedAt"] = now_iso()
        write_json(search_path, search)

    context_path = out / "ai_context.md"
    marker = "## Tactical Lab v1"
    if context_path.exists():
        text = context_path.read_text(encoding="utf-8", errors="replace")
        if marker in text:
            text = text.split(marker, 1)[0].rstrip() + "\n"
        text += (
            "\n## Tactical Lab v1\n\n"
            "Read `data/tactical_lab_quality.json` before `data/tactical_lab_summary.json`. "
            "Treat RAG/generator knowledge only as a prior or seed. Tactical Lab conclusions must come from real match telemetry, "
            "with entry context, previous tactic, exposure and finished-result linkage considered before comparing experiments. "
            "Do not promote experiments into production automatically; v2+ optimization is deferred to issue #252.\n"
        )
        context_path.write_text(text, encoding="utf-8")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build privacy-safe Tactical Lab v1 summaries from cached tactical collections.")
    parser.add_argument("--out", default="/var/www/html/slf_ai")
    parser.add_argument("--cache-dir", default="cache")
    args = parser.parse_args(argv)

    out = Path(args.out)
    cache = Path(args.cache_dir)
    snapshots = as_records(read_json(cache / "match_snapshots_v2.json", []))
    results = as_records(read_json(cache / "match_results_v2.json", []))
    summary, quality = build_outputs(snapshots, results)
    write_json(out / "data" / "tactical_lab_summary.json", summary)
    write_json(out / "data" / "tactical_lab_quality.json", quality)
    enrich_public_indexes(out)
    print(json.dumps({
        "ok": True,
        "out": str(out),
        "assignments": summary["summary"]["assignments"],
        "activations": summary["summary"]["activations"],
        "completed_phases": summary["summary"]["completedPhases"],
        "experiments_assigned": summary["summary"]["experimentsAssigned"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
