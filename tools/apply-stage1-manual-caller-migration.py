#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} occurrence(s), found {count}: {old!r}")
    write(path, content.replace(old, new))


# Active recommendation persistence must use the manual-state API.
replace_exact(
    "src/modules/strategy-data-recommendations/recommendation-engine.js",
    """        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.persistLiveState) {\n            SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });\n        }""",
    """        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.persistManualState) {\n            SnapshotEngine.persistManualState();\n        }""",
)

# Effect/progression persistence is part of the active manual workflow.
replace_exact(
    "src/modules/live-parser/event-tracker.js",
    "                SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });",
    "                SnapshotEngine.persistManualState();",
)

# Recommendation freeze remains active, but no longer carries automatic-loop semantics.
replace_exact(
    "src/modules/live-parser/snapshot-engine.js",
    """        UI.updateParserStatus(waitText);\n        UI.addParserLog(waitText);\n        this.persistLiveState({ active: true });""",
    """        UI.updateParserStatus(waitText);\n        UI.addParserLog(waitText);\n        this.persistManualState();""",
)
replace_exact(
    "src/modules/live-parser/snapshot-engine.js",
    """        STATE.recommendationFreeze = null;\n        this.persistLiveState({ active: !!STATE.liveParserTimer, freezeClearedReason: reason });""",
    """        STATE.recommendationFreeze = null;\n        this.persistManualState({ freezeClearedReason: reason });""",
)

# Split the active manual aggregation store from the historical interval store.
replace_exact(
    "src/core/config.js",
    """    pendingPresetEvent: null,\n    liveSegmentSnapshots: {},""",
    """    pendingPresetEvent: null,\n    manualSegmentSnapshots: {},\n    liveSegmentSnapshots: {},""",
)
manual_snapshot_method = """    rememberManualSnapshot(snapshot) {\n        if (!snapshot || !snapshot.gameId || !snapshot.bucket) return snapshot;\n\n        const key = `${snapshot.gameId}|${snapshot.bucket}`;\n        const store = STATE.manualSegmentSnapshots && typeof STATE.manualSegmentSnapshots === 'object'\n            ? STATE.manualSegmentSnapshots\n            : (STATE.manualSegmentSnapshots = {});\n        const list = Array.isArray(store[key]) ? store[key] : [];\n        list.push(snapshot);\n        store[key] = list.slice(-12);\n\n        snapshot.segmentAggregate = this.buildSegmentAggregate(store[key], snapshot);\n        return snapshot;\n    },\n\n"""
replace_exact(
    "src/modules/live-parser/snapshot-engine.js",
    "    rememberLiveSnapshot(snapshot) {\n",
    manual_snapshot_method + "    rememberLiveSnapshot(snapshot) {\n",
)

# The active manual button must not touch live-only wait state or aggregation methods.
replace_exact(
    "src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js",
    """    function resetLiveOnlyRecommendationState() {\n        if (typeof STATE === 'undefined') return;\n        STATE.recommendationFreeze = null;\n        // Keep pendingPresetEvent until the target generation window is reached.\n        STATE.liveWaitStatus = null;\n    }""",
    """    function resetManualRecommendationState() {\n        if (typeof STATE === 'undefined') return;\n        STATE.recommendationFreeze = null;\n        // Keep pendingPresetEvent until the target generation window is reached.\n    }""",
)
replace_exact(
    "src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js",
    "        resetLiveOnlyRecommendationState();",
    "        resetManualRecommendationState();",
)
replace_exact(
    "src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js",
    """        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberLiveSnapshot) {\n            SnapshotEngine.rememberLiveSnapshot(snapshot);\n        }""",
    """        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberManualSnapshot) {\n            SnapshotEngine.rememberManualSnapshot(snapshot);\n        }""",
)

# Manual-state payloads must not read the automatic timer.
replace_exact(
    "src/modules/live-parser/runtime-telemetry-integrity.js",
    "                    active: !!STATE.liveParserTimer,\n",
    "",
    expected=3,
)

# Update the machine-readable boundary inventory.
review_path = ROOT / "data/audit/manual-match-symbol-review-v1.json"
review = json.loads(review_path.read_text(encoding="utf-8"))
by_symbol = {item["symbol"]: item for item in review["symbols"]}

by_symbol["STATE.liveParserTimer"].update({
    "classification": "LEGACY_AUTOMATIC_LOOP",
    "allowedFiles": [
        "src/core/config.js",
        "src/modules/live-parser/snapshot-engine.js",
    ],
    "evidence": [
        "Only the historical automatic interval reads or writes this field after active caller migration.",
    ],
    "removalBlockedBy": ["automatic-loop deletion PR"],
})
by_symbol["STATE.liveWaitStatus"].update({
    "classification": "LEGACY_AUTOMATIC_LOOP",
    "allowedFiles": [
        "src/core/config.js",
        "src/modules/live-parser/snapshot-engine.js",
    ],
    "evidence": [
        "Only the historical interval wait path uses this field after the manual hint reset was removed.",
    ],
    "removalBlockedBy": ["automatic-loop deletion PR"],
})
by_symbol["SnapshotEngine.persistLiveState"].update({
    "allowedFiles": [
        "src/modules/live-parser/snapshot-engine.js",
        "src/modules/live-parser/runtime-telemetry-integrity.js",
    ],
    "evidence": [
        "The original method is retained for the legacy interval and dual-write compatibility bridge only.",
        "Active recommendation, effect and freeze callers use persistManualState.",
    ],
    "deletionStatus": "KEEP_UNTIL_MIGRATED",
})
by_symbol["SnapshotEngine.persistManualState"].update({
    "allowedFiles": [
        "src/modules/live-parser/snapshot-engine.js",
        "src/modules/live-parser/event-tracker.js",
        "src/modules/live-parser/runtime-telemetry-integrity.js",
        "src/modules/strategy-data-recommendations/recommendation-engine.js",
    ],
    "evidence": [
        "All active recommendation, freeze, effect and manual watcher persistence uses the manual-state API.",
    ],
})

insert_before = next(i for i, item in enumerate(review["symbols"]) if item["symbol"] == "STATE.liveSegmentSnapshots")
new_entries = [
    {
        "symbol": "STATE.manualSegmentSnapshots",
        "token": "manualSegmentSnapshots",
        "owner": "src/core/config.js",
        "classification": "ACTIVE_MANUAL_BOUNDARY",
        "allowedFiles": [
            "src/core/config.js",
            "src/modules/live-parser/snapshot-engine.js",
        ],
        "evidence": [
            "Stores in-memory samples created only by explicit manual hint requests.",
        ],
        "deletionStatus": "KEEP",
    },
    {
        "symbol": "SnapshotEngine.rememberManualSnapshot",
        "token": "rememberManualSnapshot",
        "owner": "src/modules/live-parser/snapshot-engine.js",
        "classification": "ACTIVE_MANUAL_BOUNDARY",
        "allowedFiles": [
            "src/modules/live-parser/snapshot-engine.js",
            "src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js",
        ],
        "evidence": [
            "The manual hint button records the current explicit snapshot through this method.",
        ],
        "deletionStatus": "KEEP",
    },
    {
        "symbol": "SnapshotEngine.rememberLiveSnapshot",
        "token": "rememberLiveSnapshot",
        "owner": "src/modules/live-parser/snapshot-engine.js",
        "classification": "LEGACY_AUTOMATIC_LOOP",
        "allowedFiles": ["src/modules/live-parser/snapshot-engine.js"],
        "evidence": [
            "After caller migration this method is referenced only by the historical automatic interval.",
        ],
        "deletionStatus": "BLOCKED",
        "removalBlockedBy": ["automatic-loop deletion PR"],
    },
]
existing_symbols = set(by_symbol)
for entry in reversed(new_entries):
    if entry["symbol"] not in existing_symbols:
        review["symbols"].insert(insert_before, entry)

review["stage1"] = {
    "issue": 151,
    "status": "implemented",
    "exitCriterion": "Compatibility persistence and live-only wait state have no active callers.",
}
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Strengthen executable boundary assertions.
test_path = "tools/test-legacy-live-parser-boundary.mjs"
test = read(test_path)
test = test.replace(
    """const runtimeIntegrity = sourceByFile.get('src/modules/live-parser/runtime-telemetry-integrity.js') || '';\n""",
    """const runtimeIntegrity = sourceByFile.get('src/modules/live-parser/runtime-telemetry-integrity.js') || '';\nconst recommendationEngine = sourceByFile.get('src/modules/strategy-data-recommendations/recommendation-engine.js') || '';\nconst strategyUi = sourceByFile.get('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js') || '';\n""",
)
test = test.replace(
    """assert.match(runtimeIntegrity, /consumedPresetEventKey/);\n""",
    """assert.match(runtimeIntegrity, /consumedPresetEventKey/);\nassert.doesNotMatch(runtimeIntegrity, /active:\\s*!!STATE\\.liveParserTimer/);\nassert.doesNotMatch(recommendationEngine, /persistLiveState/);\nassert.match(recommendationEngine, /persistManualState/);\nassert.doesNotMatch(eventTracker, /persistLiveState/);\nassert.match(eventTracker, /persistManualState/);\nassert.doesNotMatch(strategyUi, /liveWaitStatus|rememberLiveSnapshot/);\nassert.match(strategyUi, /rememberManualSnapshot/);\nassert.match(snapshotEngine, /rememberManualSnapshot\\s*\\(snapshot\\)/);\n""",
)
write(test_path, test)

# Stage documentation.
doc = """# Legacy live-parser removal — Stage 1\n\nTracking issue: #151.\n\n## Completed boundary migration\n\n- Recommendation persistence uses `persistManualState`.\n- Effect/progression persistence uses `persistManualState`.\n- Recommendation freeze persistence uses `persistManualState`.\n- Manual effect retry and manual tactic events no longer read `liveParserTimer`.\n- The manual hint button no longer reads `liveWaitStatus`.\n- Manual hint aggregation uses `manualSegmentSnapshots` and `rememberManualSnapshot`.\n\n## Compatibility retained\n\n`persistLiveState`, the old storage key and the automatic interval remain for the next stages. They no longer serve active manual callers.\n\n## Exit criterion\n\nCompatibility persistence APIs and live-only wait/segment state are reachable only from the historical automatic implementation or the migration bridge.\n"""
write("docs/audit/legacy-live-parser-stage1-2026-08-03.md", doc)

print("[stage1-manual-caller-migration] applied")
