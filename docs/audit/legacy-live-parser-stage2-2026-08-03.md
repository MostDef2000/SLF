# Legacy live-parser removal — Stage 2

Tracking issue: #151.

## Removed

- `SnapshotEngine.startLive`;
- `SnapshotEngine.stopLive`;
- `SnapshotEngine.autoResumeIfNeeded`;
- the 15-second interval and automatic bucket submission path;
- `SnapshotEngine.rememberLiveSnapshot`;
- the superseded `EventTracker.startManualTacticWatcher`.

## Retained for Stage 3/5

- loop-only `STATE` declarations and old envelope fields;
- the legacy storage key;
- compatibility `persistLiveState`/`loadLiveState` bridges and dual-write migration.

## Validation boundary

The deletion commit passed syntax checks, runtime integrity, manual workflow, manual-state migration, legacy-boundary, reachability and bundle-order contracts before it was written to the branch. Standard pull-request workflows validate the trusted connector head separately.

## Exit criterion

No automatic parser runtime or duplicate tactic watcher remains executable.
