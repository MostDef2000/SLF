# Legacy live-parser removal — Stage 6 final repository audit

Tracking issue: #151.

## Repository-complete state

- no automatic parser runtime;
- no loop-only state;
- no active module under `src/modules/live-parser/`;
- no legacy state write or compatibility API;
- userscript metadata describes manual match telemetry;
- no active source references removed live-parser symbols;
- the obsolete recommendation-history constant is removed.

## Deliberate migration exception

`slf_live_parser_state_v2:<gameId>` remains as read-only input in `loadManualState()`. New writes use `slf_manual_match_state_v1:<gameId>` exclusively. Clearing manual state removes both keys.

## External acceptance gate

Repository work is complete. Closing #151 requires a published post-Stage-6 userscript and one production manual event → effect verification on that version.
