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


def replace_range(path: str, start: str, end: str, replacement: str) -> None:
    content = read(path)
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: start marker not found: {start!r}")
    end_index = content.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{path}: end marker not found: {end!r}")
    write(path, content[:start_index] + replacement + content[end_index:])


config_path = "src/core/config.js"
snapshot_path = "src/modules/live-parser/snapshot-engine.js"

replace_exact(
    config_path,
    """const STATE = {\n    liveParserTimer: null,\n    lastSavedBucket: null,\n    liveWaitStatus: null,\n    liveStartedAt: null,\n    pendingPresetEvent: null,\n    manualSegmentSnapshots: {},\n    liveSegmentSnapshots: {},\n    recommendationFreeze: null,\n    recommendationHistory: [],\n    lastRecommendationHtml: null,\n    lastRecommendationMeta: null,\n    presetProgression: null,\n    liveAutoResumeChecked: false,\n\n    tacticWatcherStarted: false,""",
    """const STATE = {\n    pendingPresetEvent: null,\n    manualSegmentSnapshots: {},\n    recommendationFreeze: null,\n    recommendationHistory: [],\n    lastRecommendationHtml: null,\n    lastRecommendationMeta: null,\n    presetProgression: null,\n\n    tacticWatcherStarted: false,""",
)

replace_range(
    snapshot_path,
    "    compactSegmentSnapshotsForStorage() {\n",
    "    persistLiveState(extra = {}) {\n",
    "",
)

minimal_legacy_persist = """    persistLiveState(extra = {}) {\n        const gameId = MatchStateParser.getGameId();\n        if (!gameId) return;\n\n        const allowedExtra = {};\n        [\n            'pendingPresetEvent',\n            'pendingEffectRetry',\n            'consumedPresetEventKey',\n            'manualTacticEventPending',\n            'recommendationFreeze',\n            'presetProgression',\n            'lastRecommendationHtml',\n            'lastRecommendationMeta',\n            'migratedFrom'\n        ].forEach(key => {\n            if (Object.prototype.hasOwnProperty.call(extra || {}, key)) allowedExtra[key] = extra[key];\n        });\n\n        const payload = Object.assign({\n            schema: 'slf_live_parser_state_v2',\n            gameId,\n            ts: Date.now(),\n            url: location.href,\n            recommendationFreeze: STATE.recommendationFreeze || null,\n            pendingPresetEvent: STATE.pendingPresetEvent || null,\n            presetProgression: STATE.presetProgression || null,\n            lastRecommendationHtml: STATE.lastRecommendationHtml || null,\n            lastRecommendationMeta: STATE.lastRecommendationMeta || null\n        }, allowedExtra);\n\n        try {\n            localStorage.setItem(this.getLiveStorageKey(gameId), JSON.stringify(payload));\n        } catch (error) {\n            debugWarn('[SLF] Legacy manual-state compatibility persist failed', error);\n        }\n    },\n\n"""
replace_range(
    snapshot_path,
    "    persistLiveState(extra = {}) {\n",
    "    loadLiveState(gameId = MatchStateParser.getGameId()) {\n",
    minimal_legacy_persist,
)

review_path = ROOT / "data/audit/manual-match-symbol-review-v1.json"
review = json.loads(review_path.read_text(encoding="utf-8"))
removed_names = {
    "STATE.liveParserTimer",
    "STATE.lastSavedBucket",
    "STATE.liveWaitStatus",
    "STATE.liveSegmentSnapshots",
    "STATE.liveStartedAt",
    "STATE.liveAutoResumeChecked",
}
removed_entries = [item for item in review["symbols"] if item["symbol"] in removed_names]
if {item["symbol"] for item in removed_entries} != removed_names:
    missing = removed_names - {item["symbol"] for item in removed_entries}
    raise RuntimeError(f"manual symbol review missing Stage 3 entries: {sorted(missing)}")
review["symbols"] = [item for item in review["symbols"] if item["symbol"] not in removed_names]
review.setdefault("removedSymbols", []).extend([
    {
        "symbol": item["symbol"],
        "removedInStage": 3,
        "trackingIssue": 151,
        "reason": "Loop-only state removed after deletion of the automatic runtime.",
    }
    for item in removed_entries
])
review["stage3"] = {
    "issue": 151,
    "status": "implemented",
    "exitCriterion": "Runtime STATE and legacy compatibility payload contain manual-workflow concepts only.",
}
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

contract_path = ROOT / "data/audit/manual-state-envelope-v1.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
contract["loopOnlyState"] = {
    "status": "removed",
    "stage": 3,
    "trackingIssue": 151,
    "removedFields": [
        "active",
        "lastSavedBucket",
        "liveWaitStatus",
        "liveStartedAt",
        "liveSegmentSnapshots",
        "liveAutoResumeChecked",
    ],
}
contract["legacyCompatibility"]["payloadScope"] = "manual_fields_only"
contract["nextRemovalGate"] = [
    "Move active modules out of the live-parser directory and update dependency paths.",
    "Retain the legacy storage key and compatibility bridge through the published transition window.",
]
contract_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

test_path = "tools/test-legacy-live-parser-boundary.mjs"
test = read(test_path)
needle = "console.log('[legacy-live-parser-boundary-test] passed');"
assertions = """const configSource = sourceByFile.get('src/core/config.js') || '';\nfor (const token of ['liveParserTimer', 'lastSavedBucket', 'liveWaitStatus', 'liveStartedAt', 'liveSegmentSnapshots', 'liveAutoResumeChecked']) {\n  assert.doesNotMatch(configSource, new RegExp(`\\b${token}\\b`));\n  assert.doesNotMatch(snapshotEngine, new RegExp(`\\b${token}\\b`));\n}\nassert.doesNotMatch(snapshotEngine, /compactSegmentSnapshotsForStorage/);\n\n"""
if needle not in test:
    raise RuntimeError("legacy boundary completion marker not found")
write(test_path, test.replace(needle, assertions + needle))

write(
    "docs/audit/legacy-live-parser-stage3-2026-08-03.md",
    """# Legacy live-parser removal — Stage 3\n\nTracking issue: #151.\n\n## Removed\n\n- `STATE.liveParserTimer`;\n- `STATE.lastSavedBucket`;\n- `STATE.liveWaitStatus`;\n- `STATE.liveStartedAt`;\n- `STATE.liveSegmentSnapshots`;\n- `STATE.liveAutoResumeChecked`;\n- compact serialization of automatic segment snapshots;\n- automatic-loop fields from the legacy compatibility payload.\n\n## Retained for transition compatibility\n\n- `slf_live_parser_state_v2:<gameId>` read/write fallback;\n- `persistLiveState`, `loadLiveState` and `clearLiveState` compatibility methods;\n- manual pending-event, retry, recommendation and progression fields.\n\n## Exit criterion\n\nRuntime state contains no automatic-loop concepts. The old key is a minimal manual-state migration envelope only.\n""",
)

print("[stage3-remove-loop-state] applied")
