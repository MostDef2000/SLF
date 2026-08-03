# Legacy live-parser removal — Stage 3

Tracking issue: #151.

## Removed

- `STATE.liveParserTimer`;
- `STATE.lastSavedBucket`;
- `STATE.liveWaitStatus`;
- `STATE.liveStartedAt`;
- `STATE.liveSegmentSnapshots`;
- `STATE.liveAutoResumeChecked`;
- compact serialization of automatic segment snapshots;
- automatic-loop fields from the legacy compatibility payload.

## Retained for transition compatibility

- `slf_live_parser_state_v2:<gameId>` read/write fallback;
- `persistLiveState`, `loadLiveState` and `clearLiveState` compatibility methods;
- manual pending-event, retry, recommendation and progression fields.

## Validation boundary

The exact cleanup passed syntax checks, runtime integrity, manual workflow, state migration, legacy-boundary, reachability and bundle-order validation before the final branch commit. Standard workflows validate the trusted connector head separately.

## Exit criterion

Runtime state contains no automatic-loop concepts. The old key is a minimal manual-state migration envelope only.
