# Legacy live-parser removal — Stage 1

Tracking issue: #151.

## Completed boundary migration

- Recommendation persistence uses `persistManualState`.
- Effect/progression persistence uses `persistManualState`.
- Recommendation freeze persistence uses `persistManualState`.
- Manual effect retry and manual tactic events no longer read `liveParserTimer`.
- The manual hint button no longer reads `liveWaitStatus`.
- Manual hint aggregation uses `manualSegmentSnapshots` and `rememberManualSnapshot`.

## Compatibility retained

`persistLiveState`, the old storage key and the automatic interval remain for the next stages. They no longer serve active manual callers.

## Exit criterion

Compatibility persistence APIs and live-only wait/segment state are reachable only from the historical automatic implementation or the migration bridge.
