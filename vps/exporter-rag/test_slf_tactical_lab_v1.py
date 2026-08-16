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
assert row["outcomeAssociation"]["wins"] == 1
assert row["outcomeAssociation"]["pointsPerMatch"] == 3

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
