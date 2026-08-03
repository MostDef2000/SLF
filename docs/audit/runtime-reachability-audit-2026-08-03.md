# Runtime reachability audit baseline — 2026-08-03

## Purpose

This PR establishes a reproducible audit baseline before any legacy-code deletion. It does not modify runtime source, userscript behavior, tactical policy, API behavior, production data or deployment state.

The repository currently bundles 56 source modules through `src/app/bundle-order.json`. The existing dependency audit describes declared module relationships, but it does not prove browser runtime reachability. DOM callbacks, timers, mutation observers, userscript menu commands, global exports, object patching and data-driven dispatch can keep code reachable without a conventional import edge.

## Audit outputs

### Automated evidence

`tools/audit-runtime-reachability.mjs` reads:

- `src/app/bundle-order.json`;
- every source file listed in the bundle;
- the dependency audit embedded in the manifest;
- `releases/latest.user.js`;
- `data/audit/runtime-reachability-review-v1.json`.

For every bundled module it reports:

- source presence and release-bundle marker presence;
- declared and public symbols;
- incoming dependency-audit edges;
- external textual references to public symbols;
- DOM, timer, observer, menu-command, IIFE and global-export hooks;
- legacy naming markers;
- a conservative automated review status;
- the corresponding manual classification and evidence count.

The generated status is evidence for review, not deletion authorization. In particular, `UNREFERENCED_CANDIDATE` and `LEGACY_CANDIDATE` do not mean dead code.

### CI review gate

The workflow fails when:

- a bundled source file is missing;
- a source/release marker is out of sync;
- the expected module count changes unexpectedly;
- an automated candidate has no manual classification or evidence;
- a manual review points to a file no longer present in the bundle.

This means a new `ACTIVE_WITH_LEGACY_MARKERS`, `LEGACY_CANDIDATE` or `UNREFERENCED_CANDIDATE` result cannot enter the repository silently.

## Current audit result

The first complete run reports:

- 56 bundled modules;
- 39 `ACTIVE_EVIDENCE` modules;
- 7 `ACTIVE_WITH_LEGACY_MARKERS` modules;
- 10 `UNREFERENCED_CANDIDATE` modules;
- 17 total review candidates;
- 17 manually classified candidates;
- zero unreviewed candidates;
- zero stale manual reviews;
- zero release marker mismatches.

## Candidate inventory

### Active modules containing legacy or compatibility markers

These modules are active and cannot be deleted at module granularity:

- `src/core/config.js` — active central configuration/state mixed with historical live-parser naming;
- `src/core/api.js` — active API client mixed with legacy collection compatibility;
- `src/modules/manual-match-telemetry/snapshot-engine.js` — active manual snapshots/results/state recovery mixed with the old automatic loop;
- `src/modules/manual-match-telemetry/event-tracker.js` — active manual events/effects mixed with an older watcher implementation;
- `src/modules/strategy-data-recommendations/recommendation-engine.js` — active recommendation engine containing compatibility markers;
- `src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js` — active extension requiring symbol-level separation;
- `src/modules/manual-match-telemetry/manual-match-runtime.js` — active pending-event recovery and manual watcher under a historical namespace.

### Modules with insufficient positive static reachability evidence

These modules remain bundled and published. They are classified `REVIEW_REQUIRED`, not dead:

- `src/modules/transfer-analyzer/config.js`;
- `src/modules/strategy-data-recommendations/preset-fit-scoring.js`;
- `src/modules/transfer-analyzer/transfer-history-money-parser.js`;
- `src/modules/transfer-analyzer/transfer-candidate-scanner-money-parser.js`;
- `src/modules/transfer-analyzer/transfer-candidate-pagination-policy.js`;
- `src/modules/transfer-analyzer/transfer-candidate-full-market-policy.js`;
- `src/modules/transfer-analyzer/purchase-forecast-full-date-policy.js`;
- `src/modules/transfer-analyzer/transfer-tm-profile-guard.js`;
- `src/modules/transfer-analyzer/transfer-my-bids-cache-policy.js`;
- `src/modules/transfer-analyzer/transfer-history-visible-analysis-cleanup.js`.

The transfer modules may attach behavior by load-order side effects or mutate existing analyzer objects. They require a dedicated transfer-scope audit before any deletion decision.

## First symbol-level queue

The first removal-oriented review queue is intentionally limited to the match/manual-telemetry scope:

- `SnapshotEngine.startLive`;
- `SnapshotEngine.stopLive`;
- `SnapshotEngine.autoResumeIfNeeded`;
- `STATE.liveParserTimer`;
- `STATE.lastSavedBucket`;
- `STATE.liveWaitStatus`;
- `STATE.liveSegmentSnapshots`;
- the older `EventTracker.startManualTacticWatcher` implementation;
- `LIVE_PARSER_STATE_PREFIX` and persisted-state envelope fields that may still support pending-event recovery.

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

1. Merge this audit-only baseline.
2. Complete symbol-level call-path evidence for `snapshot-engine.js`, `event-tracker.js`, `config.js`, `manual-match-runtime.js`, `bootstrap.js` and `ui-layer.js`.
3. Add browser-oriented regression coverage for the manual buttons and pending-event lifecycle.
4. Extract active manual telemetry into clearly named modules without behavior changes.
5. Delete only the confirmed automatic-loop symbols in a separate PR.
6. Audit transfer side-effect modules, collection aliases, deprecated presets and compatibility wrappers as separate scopes.

## Readiness

The audit baseline is ready for review when the workflow reports all 17 candidates classified with zero unreviewed or stale entries. Readiness does not authorize deletion and does not authorize merging without explicit approval.

## Non-goals

- no source relocation;
- no runtime deletion;
- no userscript publication decision;
- no VPS deployment;
- no production-data mutation;
- no change to tactical weights, recommendations or presets.
