# Legacy live-parser removal — Stage 5

Tracking issue: #151.

## Release gate

Published userscript `4.4.260` contains the manual-state envelope and renamed manual telemetry layout. It contains neither `startLive` nor `liveParserTimer`.

## Removed

- writes to `slf_live_parser_state_v2:<gameId>`;
- global `LIVE_PARSER_STATE_PREFIX`;
- `SnapshotEngine.persistLiveState`;
- `SnapshotEngine.loadLiveState`;
- `SnapshotEngine.clearLiveState`;
- legacy storage helpers from the snapshot engine.

## Retained

A read-only fallback for `slf_live_parser_state_v2:<gameId>` remains inside the manual-state loader. A valid old record is copied to `slf_manual_match_state_v1:<gameId>`. `clearManualState()` deletes both keys.

## Exit criterion

The active runtime writes only the manual-state key and exposes only manual-state APIs.
