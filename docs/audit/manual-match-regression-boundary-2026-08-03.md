# Manual match regression and legacy boundary — 2026-08-03

## Purpose

This change converts the first removal-oriented audit queue into executable contracts. It does not remove, move or modify runtime code.

The current product workflow is manual:

1. the user requests a hint;
2. a snapshot is submitted unless its manual fingerprint is unchanged;
3. a preset or manual tactic event remains pending until a later generation window;
4. the next eligible hint submits a deterministic effect and an after snapshot;
5. failed effect submission restores the pending event for retry;
6. a finished result can only be submitted when the match status is `finished`.

The historical automatic loop remains present in source but is not invoked by the current bootstrap or UI.

## Added contracts

### Manual workflow regression

`tools/test-manual-match-workflow.mjs` executes the real `event-tracker.js` and `manual-match-runtime.js` modules in a controlled browser-like VM harness. It verifies:

- first manual hint snapshot submission;
- duplicate manual fingerprint suppression;
- submission after the snapshot changes;
- effect creation in the target generation window;
- deterministic `preset_effect|gameId|eventKey` identity;
- successful pending-event cleanup;
- network-failure pending-event restoration;
- no manual snapshot submission after `finished`;
- finished-result state guard.

The pre-existing runtime integrity test continues to cover manual tactic watcher installation, persisted pending-event recovery and cross-game rejection.

### Legacy boundary contract

`tools/test-legacy-live-parser-boundary.mjs` scans every JavaScript file under `src/` and joins observed token locations to `data/audit/manual-match-symbol-review-v1.json`.

It fails when:

- a reviewed symbol appears in an unclassified file;
- an owner no longer contains its reviewed token;
- a forbidden active call to `SnapshotEngine.startLive`, `stopLive`, `autoResumeIfNeeded` or the older `EventTracker.startManualTacticWatcher` appears;
- bootstrap stops declaring manual-only mode;
- the active watcher disappears from `manual-match-runtime.js`;
- the pending-effect recovery markers disappear.

## Symbol conclusions

### Historical automatic loop

These identifiers remain removal candidates, but are not deleted here:

- `SnapshotEngine.startLive`;
- `SnapshotEngine.stopLive`;
- `SnapshotEngine.autoResumeIfNeeded`;
- `STATE.lastSavedBucket`;
- `STATE.liveWaitStatus`;
- `STATE.liveSegmentSnapshots`;
- `STATE.liveStartedAt`;
- `STATE.liveAutoResumeChecked`.

### Duplicate watcher

`EventTracker.startManualTacticWatcher` is the older implementation. The active path is `installManualWatcher()` in `manual-match-runtime.js`.

### Active state that is only historically named

These identifiers cannot be removed with the automatic loop:

- `LIVE_PARSER_STATE_PREFIX`;
- `SnapshotEngine.persistLiveState`;
- `SnapshotEngine.loadLiveState`;
- the pending-event and effect-retry fields stored in that envelope.

They must first move to a clearly named manual-match state module with backward-compatible reading of the existing localStorage key.

## Next refactoring step

After this PR is merged, the next behavior-preserving PR should extract the active manual state envelope and manual telemetry submission from `snapshot-engine.js` without deleting the old loop. Only after that extraction and a green regression workflow should the automatic loop be removed in a separate PR.

## Non-goals

- no runtime source edits;
- no userscript release change;
- no localStorage migration;
- no tactical recommendation changes;
- no VPS API or production-data changes.
