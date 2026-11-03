#!/usr/bin/env python3

import importlib.util
import json
import tempfile
from pathlib import Path

MODULE = Path(__file__).with_name("slf_tactical_lab_v1.py")
spec = importlib.util.spec_from_file_location("slf_tactical_lab_v1", MODULE)
lab = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(lab)


def snapshot(key, game, experiment, assignment, kind=None, context=None, extra=None, state=None):
    row = {
        "snapshotKey": key,
        "gameId": game,
        "status": "live",
        "minute": 48,
        "teams": [1, 2],
        "myTeam": 1,
        "score": {"home": 1, "away": 0},
        "tacticalLab": state or {
            "schema": "slf_tactical_lab_match_v1",
            "populationVersion": "slf_tactical_lab_561_p01",
            "assignment": {
                "assignmentId": assignment,
                "experimentId": experiment,
                "populationVersion": "slf_tactical_lab_561_p01",
                "genomeFingerprint": "tlab1-fixture",
            },
            "activation": None,
            "completed": None,
        },
    }
    if kind:
        row["tacticalLabEvent"] = {
            "schema": "slf_tactical_lab_event_v1",
            "eventKey": f"event-{kind}-{assignment}",
            "kind": kind,
            "assignmentId": assignment,
            "experimentId": experiment,
            "populationVersion": "slf_tactical_lab_561_p01",
            "genomeVersion": "slf_tactical_genome_v1",
            "genomeFingerprint": "tlab1-fixture",
            "context": context or {},
            "extra": extra or {},
        }
    return row


entry = {
    "minute": 48,
    "bucket": "46-60",
    "scoreState": "winning",
    "scoreDiff": 1,
    "homeAway": "home",
    "strengthGap": 4,
    "strengthBucket": "stronger",
    "previous": {
        "presetId": "Arteta_Control433_bal3",
        "tacticFingerprint": "prod-fingerprint",
        "phaseSequence": 2,
        "phaseDuration": 18,
    },
    "productionRecommendation": {"presetId": "Pep_ControlledPush_att3", "margin": 11},
}
exit_context = {
    "minute": 67,
    "scoreState": "winning",
    "scoreDiff": 1,
    "homeAway": "home",
    "strengthBucket": "stronger",
    "previous": {"tacticFingerprint": "lab-fingerprint"},
    "productionRecommendation": {"presetId": "Simeone_Compact442_def4"},
    "next": {"presetId": "Simeone_Compact442_def4", "tacticSource": "production", "tacticFingerprint": "next-fingerprint"},
}
assignment = "tactical_lab_assignment|game-secret-1|EXP-561-P01-0042"
experiment = "EXP-561-P01-0042"
completed = {
    "experimentId": experiment,
    "fromMinute": 48,
    "toMinute": 67,
    "durationMinutes": 19,
    "elapsedWallClockMs": 90500,
    "exitReason": "user_selected_production",
    "entryContext": entry,
    "exitContext": exit_context,
    "delta": {"myXG": 0.7, "oppXG": 0.2, "myShots": 4, "oppShots": 1},
}
state_completed = {
    "schema": "slf_tactical_lab_match_v1",
    "populationVersion": "slf_tactical_lab_561_p01",
    "assignment": {
        "assignmentId": assignment,
        "experimentId": experiment,
        "populationVersion": "slf_tactical_lab_561_p01",
        "genomeFingerprint": "tlab1-fixture",
    },
    "activation": None,
    "completed": completed,
}

snapshots = [
    snapshot("s0", "game-secret-1", experiment, assignment),
    snapshot("s1", "game-secret-1", experiment, assignment, "activation", entry, {"origin": "extreme"}),
    snapshot("s1-duplicate-http", "game-secret-1", experiment, assignment, "activation", entry, {"origin": "extreme"}),
    snapshot("s2", "game-secret-1", experiment, assignment, "exit", exit_context, {
        "durationMinutes": 19,
        "elapsedWallClockMs": 90500,
        "exitReason": "user_selected_production",
        "delta": {"myXG": 0.7, "oppXG": 0.2, "myShots": 4, "oppShots": 1},
        "entryContext": entry,
    }, state_completed),
]
results = [{
    "resultKey": "result-secret",
    "gameId": "game-secret-1",
    "status": "finished",
    "teams": [1, 2],
    "myTeam": 1,
    "score": {"home": 2, "away": 1},
    "tacticalLab": state_completed,
}]

summary, quality = lab.build_outputs(snapshots, results)
assert summary["schema"] == "slf_tactical_lab_summary_v1"
assert quality["schema"] == "slf_tactical_lab_quality_v1"
assert summary["summary"]["assignments"] == 1
assert summary["summary"]["activations"] == 1
assert summary["summary"]["completedPhases"] == 1
assert summary["summary"]["linkedFinishedResults"] == 1
assert quality["counts"]["duplicateLifecycleEventsDropped"] == 1
assert quality["coverage"]["finishedResultLinkage"] == 1
row = summary["experiments"][0]
assert row["experimentId"] == experiment
assert row["entryContext"]["previousPreset"]["Arteta_Control433_bal3"] == 1
assert row["entryContext"]["minuteBuckets"]["45-59"] == 1
assert row["phaseEffect"]["averageDelta"]["myXG"] == 0.7
assert row["exposureMinutes"]["total"] == 19
assert row["exposureWallClockSeconds"]["total"] == 90.5
assert row["exposureWallClockSeconds"]["samples"] == 1
assert row["outcomeAssociation"]["linkedFinishedResults"] == 1
assert row["outcomeAssociation"]["resolvedFinishedResults"] == 1
assert row["outcomeAssociation"]["wins"] == 1
assert row["outcomeAssociation"]["pointsPerMatch"] == 3
assert quality["coverage"]["finishedOutcomeResolution"] == 1

broken_assignment = "tactical_lab_assignment|game-secret-2|EXP-561-P03-0001"
broken_state = {
    "schema": "slf_tactical_lab_match_v1",
    "populationVersion": "slf_tactical_lab_561_p03",
    "assignment": {
        "assignmentId": broken_assignment,
        "experimentId": "EXP-561-P03-0001",
        "populationVersion": "slf_tactical_lab_561_p03",
        "genomeFingerprint": "tlab-broken-result",
    },
    "activation": {"entryContext": entry},
    "completed": {
        "durationMinutes": 0,
        "elapsedWallClockMs": 12000,
        "entryContext": entry,
        "exitContext": exit_context,
        "delta": {"myXG": 0.1, "oppXG": 0.2},
    },
}
broken_snapshots = [snapshot("broken-s0", "game-secret-2", "EXP-561-P03-0001", broken_assignment, state=broken_state)]
broken_results = [{
    "resultKey": "broken-result-secret",
    "gameId": "game-secret-2",
    "status": "finished",
    "teams": [1, 2],
    "myTeam": 1,
    "score": None,
    "tacticalLab": broken_state,
}]
broken_summary, broken_quality = lab.build_outputs(broken_snapshots, broken_results)
broken_outcome = broken_summary["experiments"][0]["outcomeAssociation"]
assert broken_outcome["linkedFinishedResults"] == 1
assert broken_outcome["resolvedFinishedResults"] == 0
assert broken_outcome["unresolvedResultReasons"] == {"missing_or_invalid_score": 1}
assert broken_quality["counts"]["unresolvedResultReasons"] == {"missing_or_invalid_score": 1}
assert broken_quality["coverage"]["finishedOutcomeResolution"] == 0

# --- SLF #252 tactical data-quality: entry-context recovery, per-field counters,
# --- advisor absence reasons. Strict entryCompleteness semantics are unchanged.

# (a) activation event missing + completed.entryContext present -> entry context recovered
recovered_assignment = "tactical_lab_assignment|game-secret-3|EXP-561-P03-0002"
recovered_state = {
    "schema": "slf_tactical_lab_match_v1",
    "populationVersion": "slf_tactical_lab_561_p03",
    "assignment": {
        "assignmentId": recovered_assignment,
        "experimentId": "EXP-561-P03-0002",
        "populationVersion": "slf_tactical_lab_561_p03",
        "genomeFingerprint": "tlab1-recovered",
    },
    "activation": None,
    "completed": {
        "experimentId": "EXP-561-P03-0002",
        "durationMinutes": 12,
        "elapsedWallClockMs": 60000,
        "exitReason": "match_finished",
        "entryContext": entry,
        "exitContext": exit_context,
    },
}
recovered_summary, recovered_quality = lab.build_outputs(
    [snapshot("recovered-s0", "game-secret-3", "EXP-561-P03-0002", recovered_assignment, state=recovered_state)],
    [],
)
recovered_row = recovered_summary["experiments"][0]
assert recovered_row["activations"] == 1
assert recovered_row["completedPhases"] == 1
assert recovered_row["entryContext"]["minuteBuckets"] == {"45-59": 1}
assert recovered_row["entryContext"]["previousPreset"]["Arteta_Control433_bal3"] == 1
assert recovered_row["entryContext"]["scoreState"] == {"winning": 1}
assert recovered_row["entryContext"]["homeAway"] == {"home": 1}
assert recovered_quality["coverage"]["entryContextComplete"] == 1

# (a2) precedence: an empty activation-event context stays selected; a lower-priority
# completed.entryContext must not be field-merged into it.
precedence_assignment = "tactical_lab_assignment|game-secret-6|EXP-561-P03-0007"
precedence_state = {
    "schema": "slf_tactical_lab_match_v1",
    "populationVersion": "slf_tactical_lab_561_p03",
    "assignment": {
        "assignmentId": precedence_assignment,
        "experimentId": "EXP-561-P03-0007",
        "populationVersion": "slf_tactical_lab_561_p03",
        "genomeFingerprint": "tlab1-precedence",
    },
    "activation": None,
    "completed": {"entryContext": entry, "exitContext": exit_context},
}
precedence_summary, _ = lab.build_outputs([
    snapshot("prec-s0", "game-secret-6", "EXP-561-P03-0007", precedence_assignment, state=precedence_state),
    snapshot("prec-s1", "game-secret-6", "EXP-561-P03-0007", precedence_assignment, "activation", {}, {}),
], [])
precedence_row = precedence_summary["experiments"][0]
assert precedence_row["entryContext"]["minuteBuckets"] == {"unknown": 1}
assert "45-59" not in precedence_row["entryContext"]["minuteBuckets"]
assert precedence_row["entryContext"]["previousPreset"] == {"unknown": 1}

# (b) only exit event extra.entryContext -> entry context recovered
exit_only_assignment = "tactical_lab_assignment|game-secret-4|EXP-561-P03-0003"
exit_only_summary, exit_only_quality = lab.build_outputs(
    [snapshot("exit-only-s0", "game-secret-4", "EXP-561-P03-0003", exit_only_assignment, "exit", exit_context, {
        "durationMinutes": 19,
        "entryContext": entry,
    })],
    [],
)
exit_only_row = exit_only_summary["experiments"][0]
assert exit_only_row["activations"] == 1
assert exit_only_row["entryContext"]["minuteBuckets"] == {"45-59": 1}
assert exit_only_row["entryContext"]["homeAway"] == {"home": 1}
assert exit_only_quality["coverage"]["entryContextComplete"] == 1

# (c) nothing recoverable -> per-field counters show missing, strict completeness unchanged
unrecoverable_assignment = "tactical_lab_assignment|game-secret-5|EXP-561-P03-0005"
empty_entry = {
    "minute": None,
    "bucket": None,
    "scoreState": "unknown",
    "scoreDiff": None,
    "homeAway": "unknown",
    "strengthBucket": "unknown",
    "previous": {},
    "productionRecommendation": None,
}
unrec_summary, unrec_quality = lab.build_outputs(
    [snapshot("unrec-s0", "game-secret-5", "EXP-561-P03-0005", unrecoverable_assignment, "activation", empty_entry, {})],
    [],
)
unrec_row = unrec_summary["experiments"][0]
assert unrec_row["activations"] == 1
assert unrec_row["entryContext"]["minuteBuckets"] == {"unknown": 1}
assert unrec_quality["coverage"]["entryContextComplete"] == 0
unrec_availability = unrec_quality["entryContextFieldAvailability"]
assert unrec_availability["samples"] == 1
for field in ("minuteBucket", "scoreState", "homeAway", "previousPreset", "productionRecommendation"):
    assert unrec_availability[field] == {"available": 0, "missing": 1}, field
assert unrec_quality["productionRecommendationAbsenceReasons"] == {
    "noRuleDecisionRecorded": 1,
    "recommendationPresetMissing": 0,
}

# (d) per-field availability counters + advisor absence reason counts
null_preset_entry = {**entry, "productionRecommendation": {"presetId": None, "margin": 0}}
partial_entry = {
    "minute": None,
    "bucket": None,
    "scoreState": "unknown",
    "scoreDiff": None,
    "homeAway": "unknown",
    "strengthBucket": "even",
    "previous": {"tacticFingerprint": "manual-fingerprint"},
    "productionRecommendation": None,
}
advisor_snapshots = [
    snapshot("adv-s0", "game-secret-7", "EXP-561-P03-0006", "tactical_lab_assignment|game-secret-7|EXP-561-P03-0006", "activation", entry, {}),
    snapshot("adv-s1", "game-secret-8", "EXP-561-P03-0006", "tactical_lab_assignment|game-secret-8|EXP-561-P03-0006", "activation", null_preset_entry, {}),
    snapshot("adv-s2", "game-secret-9", "EXP-561-P03-0006", "tactical_lab_assignment|game-secret-9|EXP-561-P03-0006", "activation", partial_entry, {}),
]
advisor_summary, advisor_quality = lab.build_outputs(advisor_snapshots, [])
advisor_row = advisor_summary["experiments"][0]
assert advisor_row["entryContext"]["minuteBuckets"] == {"45-59": 2, "unknown": 1}
advisor_availability = advisor_quality["entryContextFieldAvailability"]
assert advisor_availability["samples"] == 3
assert advisor_availability["minuteBucket"] == {"available": 2, "missing": 1}
assert advisor_availability["scoreState"] == {"available": 2, "missing": 1}
assert advisor_availability["homeAway"] == {"available": 2, "missing": 1}
assert advisor_availability["previousPreset"] == {"available": 3, "missing": 0}
assert advisor_availability["productionRecommendation"] == {"available": 1, "missing": 2}
assert advisor_quality["productionRecommendationAbsenceReasons"] == {
    "noRuleDecisionRecorded": 1,
    "recommendationPresetMissing": 1,
}
assert advisor_quality["coverage"]["entryContextComplete"] == 0.3333

# (e) strict entryCompleteness semantics unchanged on the existing fixtures
assert quality["coverage"]["entryContextComplete"] == 1
assert quality["coverage"]["exitContextComplete"] == 1
assert quality["coverage"]["knownPreviousTactic"] == 1
assert broken_quality["coverage"]["entryContextComplete"] == 1
assert recovered_quality["coverage"]["entryContextComplete"] == 1
assert exit_only_quality["coverage"]["entryContextComplete"] == 1

# (f) privacy flags stay false on every sanitized output; counters are counts only
for payload in (summary, quality, recovered_summary, recovered_quality, exit_only_summary,
                exit_only_quality, unrec_summary, unrec_quality, advisor_summary, advisor_quality):
    assert payload["privacy"]["containsRawGameId"] is False
    assert payload["privacy"]["containsAssignmentId"] is False
    assert payload["privacy"]["containsEventKey"] is False
    assert payload["privacy"]["containsTeamNames"] is False
availability_all = quality["entryContextFieldAvailability"]
assert availability_all["samples"] == 1
for field in ("minuteBucket", "scoreState", "homeAway", "previousPreset", "productionRecommendation"):
    assert availability_all[field] == {"available": 1, "missing": 0}, field
    assert all(isinstance(value, int) for value in availability_all[field].values())
assert quality["productionRecommendationAbsenceReasons"] == {
    "noRuleDecisionRecorded": 0,
    "recommendationPresetMissing": 0,
}
assert all(isinstance(value, int) for value in quality["productionRecommendationAbsenceReasons"].values())

serialized_new = json.dumps({
    "recovered": [recovered_summary, recovered_quality],
    "exitOnly": [exit_only_summary, exit_only_quality],
    "unrecoverable": [unrec_summary, unrec_quality],
    "advisor": [advisor_summary, advisor_quality],
    "precedence": precedence_summary,
}, ensure_ascii=False)
for secret in ("game-secret-3", "game-secret-4", "game-secret-6", "game-secret-7", "game-secret-8", "game-secret-9",
               recovered_assignment, exit_only_assignment, precedence_assignment, unrecoverable_assignment,
               "event-activation", "event-exit"):
    assert secret not in serialized_new, secret

serialized = json.dumps({"summary": summary, "quality": quality}, ensure_ascii=False)
for secret in ("game-secret-1", assignment, "result-secret", "event-activation"):
    assert secret not in serialized, secret
assert summary["privacy"]["containsRawGameId"] is False

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    cache = root / "cache"
    out = root / "out"
    (cache).mkdir(parents=True)
    (out / "rag").mkdir(parents=True)
    (cache / "match_snapshots_v2.json").write_text(json.dumps(snapshots), encoding="utf-8")
    (cache / "match_results_v2.json").write_text(json.dumps(results), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps({"files": {}, "recommendedReadOrder": ["data/match_outcomes_summary.json"]}), encoding="utf-8")
    (out / "rag" / "catalog.json").write_text(json.dumps({"sources": []}), encoding="utf-8")
    (out / "rag" / "search_index.json").write_text(json.dumps({"items": [], "count": 0}), encoding="utf-8")
    (out / "ai_context.md").write_text("# AI context\n", encoding="utf-8")
    assert lab.main(["--out", str(out), "--cache-dir", str(cache)]) == 0
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["files"]["tacticalLabSummary"]["exists"] is True
    assert manifest["files"]["tacticalLabQuality"]["exists"] is True
    assert manifest["recommendedReadOrder"][:2] == ["data/tactical_lab_quality.json", "data/tactical_lab_summary.json"]
    catalog = json.loads((out / "rag" / "catalog.json").read_text(encoding="utf-8"))
    assert {row["id"] for row in catalog["sources"]} >= {"tactical_lab_summary", "tactical_lab_quality"}
    search = json.loads((out / "rag" / "search_index.json").read_text(encoding="utf-8"))
    assert any(row["id"] == "tactical_lab_v1_summary" for row in search["items"])
    assert "Tactical Lab v1" in (out / "ai_context.md").read_text(encoding="utf-8")

print("tactical lab v1 safe aggregation, privacy and RAG integration: OK")
