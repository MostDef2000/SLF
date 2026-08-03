# Runtime reachability audit baseline — 2026-08-03

## Purpose

This PR establishes a reproducible audit baseline before any legacy-code deletion. It does not modify runtime source, userscript behavior, tactical policy, API behavior, production data or deployment state.

The repository currently bundles 56 source modules through `src/app/bundle-order.json`. The existing dependency audit describes declared module relationships, but it does not prove browser runtime reachability. DOM callbacks, timers, mutation observers, userscript menu commands, global exports and data-driven dispatch can keep code reachable without a conventional import edge.

## Audit outputs

### Automated evidence

`tools/audit-runtime-reachability.mjs` reads:

- `src/app/bundle-order.json`;
- every source file listed in the bundle;
- the dependency audit embedded in the manifest;
- `releases/latest.user.js`.

For every bundled module it reports:

- source presence and release-bundle marker presence;
- declared and public symbols;
- incoming dependency-audit edges;
- external textual references to public symbols;
- DOM, timer, observer, menu-command, IIFE and global-export hooks;
- legacy naming markers;
- a conservative review status.

The generated status is evidence for review, not deletion authorization. In particular, `UNREFERENCED_CANDIDATE` and `LEGACY_CANDIDATE` do not mean dead code.

### Manual review baseline

`data/audit/runtime-reachability-review-v1.json` records the first bounded manual review. It separates active manual match telemetry from historical automatic-parser naming.

Initial findings:

1. `src/app/bootstrap.js` explicitly mounts a manual-only Coach Hint workflow and does not invoke live-parser auto-resume.
2. `src/app/ui-layer.js` mounts manual result/API controls; it does not expose live-parser start/stop controls.
3. Match-state, match-stats and squad parsers remain active despite their historical `live-parser` directory name.
4. `SnapshotEngine` and `EventTracker` are mixed modules: active manual telemetry and legacy candidates coexist in the same objects.
5. `runtime-telemetry-integrity.js` remains active. It restores pending preset events, assigns deterministic effect keys, guards finished-result submission and installs the current manual tactic watcher.
6. Persisted-state naming cannot be deleted mechanically. `pendingPresetEvent` recovery currently shares the historical live-state envelope.

## Candidate queue

The first symbol-level review queue includes:

- `SnapshotEngine.startLive`;
- `SnapshotEngine.stopLive`;
- `SnapshotEngine.autoResumeIfNeeded`;
- `STATE.liveParserTimer`;
- `STATE.lastSavedBucket`;
- `STATE.liveWaitStatus`;
- `STATE.liveSegmentSnapshots`;
- the older `EventTracker.startManualTacticWatcher` implementation.

None of these identifiers is approved for deletion by this PR. Each requires repository-wide reference evidence and browser-level regression coverage.

## Required evidence before deletion

A later removal PR must provide all of the following for each deleted symbol:

1. zero static references outside its declaration after accounting for generated bundle markers;
2. no bootstrap, DOM callback, timer, observer, menu-command or global-export path;
3. manual workflow tests covering:
   - `Подсказка` snapshot submission;
   - preset/manual tactic event creation;
   - pending event recovery after reload;
   - effect creation in a later generation window;
   - network failure retry and idempotent effect key;
   - finished-result submission guard;
4. unchanged tactical recommendations and preset data;
5. unchanged VPS schemas and historical data;
6. successful bundle contract, runtime telemetry, analytics and API workflows.

## Proposed follow-up sequence

1. Complete symbol-level audit for `snapshot-engine.js`, `event-tracker.js`, `config.js` and `ui-layer.js`.
2. Extract active manual telemetry into clearly named modules without behavior changes.
3. Add browser-oriented regression coverage for the manual buttons and pending-event lifecycle.
4. Delete the confirmed automatic-loop symbols in a separate PR.
5. Audit collection aliases, deprecated presets, transfer helpers and compatibility wrappers as separate scopes.

## Non-goals

- no source relocation;
- no runtime deletion;
- no userscript publication decision;
- no VPS deployment;
- no production-data mutation;
- no change to tactical weights, recommendations or presets.
