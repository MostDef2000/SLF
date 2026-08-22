# 002-refactoring-program — Plan

## HOW

Staged decomposition, biggest concentration of debt first. Each stage is an independent canonical task; this plan is the shared playbook.

## Stages

| # | Target | Size | Split strategy | Risk |
|---|---|---|---|---|
| 1 | `src/modules/transfer-analyzer/transfer-market-analyzer.js` | 4407 | Extract cohesive units: tooltip/portal UI helpers, money parsing, cache/state management, rendering, scan orchestration. `TransferMarketAnalyzer` remains the facade symbol | Medium — 19% of userscript source |
| 2 | `src/modules/manual-match-telemetry/manual-match-runtime.js` | 1270 | Separate runtime loop, page detection, telemetry flush | Medium |
| 3 | `src/modules/transfer-analyzer/tm-enrichment-layer.js` | 1193 | Isolate transport (`GM_xmlhttpRequest`) from parsing and localStorage cache | Low |
| 4 | strategy/tactics cluster | ~2800 total | `tactic-control-engine.js` (1019), `recommendation-engine.js` (975), `current-action-hint-engine.js` (796) split by policy boundaries; watch `STATE` coupling | Medium |
| 5 | VPS Python | ~2700 | `slf_preset_evidence_561.py` (941), `slf_ai_export.py` (844): shared helper module, deduplication. Deployment separately governed per DR-008 | Low in Git / medium at deploy |
| 6 | tools/tests | spot | `tools/check-bundle-order.mjs` (554) and duplicated test-* fixtures/helpers | Low |

## Cross-stage rules

1. Pure structural moves only; no behaviour change.
2. Any file split updates `src/app/bundle-order.json` **and** its `dependencyAudit` entries in the same PR; `tools/check-bundle-order.mjs`, `tools/test-security-boundaries.mjs` and `tools/test-userscript-artifact-boundary.mjs` must pass.
3. One stage = one Issue + visible Implementation Scope Check + exact `commit approved` + one fresh branch + one bounded PR.
4. Stages touching `src/**` trigger automatic release per `SLF_AUTOMATIC_RELEASE_POLICY`; release verification and Tampermonkey acceptance close the stage.
5. Stage 5 deploy follows DR-008 and is a separately governed production operation.

## Risk profile

Program-level: `NOT REQUIRED` (planning artifact). Each stage PR carries its own risk profile derived from its diff.

## Test design

- unit: existing `tools/test-*.mjs` suites must stay green unchanged except where they assert file inventories (updated in the same PR).
- integration: canonical CI aggregate quality suites per PR.
- end-to-end: `tests/browser/**` exact userscript tests per userscript stage.
- runtime-manual: Tampermonkey update acceptance after each userscript release.

## Correct-course

If a planned split breaks an exact-artifact contract, narrow the stage instead of weakening validators. If stage order becomes suboptimal (e.g. stage 4 uncovers shared extraction needed by stage 1), record the discovery in this feature's tasks and re-sequence via checkpoint update — no silent scope drift.

## Decisions / rejected alternatives

- **Staged program over one big-bang refactor**: governance requires bounded PRs; big-bang would be unreviewable and unreleasable.
- **Facade symbols preserved**: consumers (bootstrap, bundle audit, browser tests) reference them; renaming is out of scope.
- **VPS after userscript stages**: decouples release mechanics from deploy mechanics; VPS deploys are separately governed.
