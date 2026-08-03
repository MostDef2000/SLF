#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def remove_range(path: str, start: str, end: str) -> None:
    content = read(path)
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: start marker not found: {start!r}")
    end_index = content.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{path}: end marker not found: {end!r}")
    write(path, content[:start_index] + content[end_index:])


snapshot_path = "src/modules/live-parser/snapshot-engine.js"
event_path = "src/modules/live-parser/event-tracker.js"

# Delete the historical auto-resume path while preserving the active manual aggregator.
remove_range(
    snapshot_path,
    "    autoResumeIfNeeded() {\n",
    "    rememberManualSnapshot(snapshot) {\n",
)

# Delete the legacy interval-only segment store method.
remove_range(
    snapshot_path,
    "    rememberLiveSnapshot(snapshot) {\n",
    "    buildSegmentAggregate(list, snapshot) {\n",
)

# Delete start/stop and the 15-second automatic submission loop.
remove_range(
    snapshot_path,
    "    startLive(options = {}) {\n",
    "};\n\n    // ============================================================",
)

# Delete the superseded watcher; runtime-telemetry-integrity owns the active watcher.
remove_range(
    event_path,
    "        startManualTacticWatcher() {\n",
    "    };\n\n    (function installTacticTelemetryEnvelope()",
)

# Update the machine-readable symbol inventory.
review_path = ROOT / "data/audit/manual-match-symbol-review-v1.json"
review = json.loads(review_path.read_text(encoding="utf-8"))
removed_names = {
    "SnapshotEngine.startLive",
    "SnapshotEngine.stopLive",
    "SnapshotEngine.autoResumeIfNeeded",
    "EventTracker.startManualTacticWatcher",
    "SnapshotEngine.rememberLiveSnapshot",
}
removed_entries = [item for item in review["symbols"] if item["symbol"] in removed_names]
if {item["symbol"] for item in removed_entries} != removed_names:
    missing = removed_names - {item["symbol"] for item in removed_entries}
    raise RuntimeError(f"manual symbol review missing removal entries: {sorted(missing)}")
review["symbols"] = [item for item in review["symbols"] if item["symbol"] not in removed_names]
review.setdefault("removedSymbols", []).extend([
    {
        "symbol": item["symbol"],
        "removedInStage": 2,
        "trackingIssue": 151,
        "reason": "Historical automatic loop or superseded watcher removed after active callers were migrated.",
    }
    for item in removed_entries
])

by_symbol = {item["symbol"]: item for item in review["symbols"]}
by_symbol["STATE.liveParserTimer"].update({
    "classification": "LEGACY_STATE_RESIDUE",
    "evidence": [
        "No timer is created after Stage 2; the field remains only in the old persistence envelope until Stage 3.",
    ],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
by_symbol["STATE.lastSavedBucket"].update({
    "classification": "LEGACY_STATE_RESIDUE",
    "evidence": ["No bucket auto-save loop remains; the field is serialized only by the old state envelope."],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
by_symbol["STATE.liveWaitStatus"].update({
    "classification": "LEGACY_STATE_RESIDUE",
    "evidence": ["No wait loop remains; the field is serialized only by the old state envelope."],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
by_symbol["STATE.liveStartedAt"].update({
    "classification": "LEGACY_STATE_RESIDUE",
    "evidence": ["No automatic run start remains; the field is serialized only by the old state envelope."],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
by_symbol["STATE.liveSegmentSnapshots"].update({
    "classification": "LEGACY_STATE_RESIDUE",
    "evidence": ["The active manual workflow uses manualSegmentSnapshots; this field remains only in old state serialization."],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
by_symbol["STATE.liveAutoResumeChecked"].update({
    "classification": "UNREFERENCED_CANDIDATE",
    "allowedFiles": ["src/core/config.js"],
    "evidence": ["The auto-resume method was removed; only the declaration remains."],
    "removalBlockedBy": ["loop-only state cleanup PR"],
})
review["classifications"]["LEGACY_STATE_RESIDUE"] = "State retained only by the compatibility envelope after the automatic runtime was deleted."
review["classifications"]["UNREFERENCED_CANDIDATE"] = "Declared legacy state with no runtime consumer after deletion of its owner path."
review["stage2"] = {
    "issue": 151,
    "status": "implemented",
    "exitCriterion": "No automatic interval, auto-resume path, stop/start API, legacy snapshot collector or duplicate watcher remains.",
}
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Update the migration contract: the next gate is state cleanup, not loop deletion.
contract_path = ROOT / "data/audit/manual-state-envelope-v1.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
contract["automaticLoop"] = {
    "status": "removed",
    "stage": 2,
    "trackingIssue": 151,
}
contract["nextRemovalGate"] = [
    "Remove loop-only STATE declarations and legacy serialization fields.",
    "Retain legacy-key migration and dual-write through the published transition release.",
]
contract_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Flip executable assertions from presence to absence.
test_path = "tools/test-legacy-live-parser-boundary.mjs"
test = read(test_path)
old = """assert.match(snapshotEngine, /STATE\\.liveParserTimer\\s*=\\s*setInterval\\s*\\(/);\nassert.match(snapshotEngine, /},\\s*15000\\s*\\);/);\nassert.match(eventTracker, /startManualTacticWatcher\\s*\\(\\)/);\nassert.doesNotMatch(eventTracker, /EventTracker\\.startManualTacticWatcher\\s*\\(/);\n"""
new = """assert.doesNotMatch(snapshotEngine, /startLive\\s*\\(|stopLive\\s*\\(|autoResumeIfNeeded\\s*\\(/);\nassert.doesNotMatch(snapshotEngine, /setInterval\\s*\\(|15000|rememberLiveSnapshot/);\nassert.doesNotMatch(eventTracker, /startManualTacticWatcher\\s*\\(/);\n"""
if old not in test:
    raise RuntimeError("legacy boundary assertion block not found")
test = test.replace(old, new)
write(test_path, test)

write(
    "docs/audit/legacy-live-parser-stage2-2026-08-03.md",
    """# Legacy live-parser removal — Stage 2\n\nTracking issue: #151.\n\n## Removed\n\n- `SnapshotEngine.startLive`;\n- `SnapshotEngine.stopLive`;\n- `SnapshotEngine.autoResumeIfNeeded`;\n- the 15-second interval and automatic bucket submission path;\n- `SnapshotEngine.rememberLiveSnapshot`;\n- the superseded `EventTracker.startManualTacticWatcher`.\n\n## Retained for Stage 3/5\n\n- loop-only `STATE` declarations and old envelope fields;\n- the legacy storage key;\n- compatibility `persistLiveState`/`loadLiveState` bridges and dual-write migration.\n\n## Exit criterion\n\nNo automatic parser runtime or duplicate tactic watcher remains executable.\n""",
)

print("[stage2-remove-auto-loop] applied")
