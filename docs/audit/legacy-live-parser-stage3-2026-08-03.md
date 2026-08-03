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

## Exit criterion

Runtime state contains no automatic-loop concepts. The old key is a minimal manual-state migration envelope only.
