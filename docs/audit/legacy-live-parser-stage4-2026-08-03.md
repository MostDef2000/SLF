# Legacy live-parser removal — Stage 4

Tracking issue: #151.

## New active layout

### Match reading

- `src/modules/match-reading/match-state-parser.js`;
- `src/modules/match-reading/match-stats-parser.js`;
- `src/modules/match-reading/squad-parser.js`.

### Manual match telemetry

- `src/modules/manual-match-telemetry/snapshot-engine.js`;
- `src/modules/manual-match-telemetry/event-tracker.js`;
- `src/modules/manual-match-telemetry/manual-match-runtime.js`.

The runtime integrity regression is now `tools/test-manual-match-runtime.mjs`.

## Updated contracts

Bundle order, dependency audit, workflow path filters, test source paths, audit records, documentation references and release source markers use the new paths.

## Exit criterion

No active source module is stored under `src/modules/live-parser/`. Remaining `live` names are transition-only storage compatibility APIs scheduled for Stage 5.
