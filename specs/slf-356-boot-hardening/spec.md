# Boot hardening: per-step fault isolation in the init chain (#356)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `fix/356-boot-hardening`, base `e775f72` (main at admission).

## Goal and user-visible behaviour

One synchronous failure anywhere in the userscript init chain must never permanently kill the rest of the chain. Today a single throw in `App.mountUI()` aborts every remaining mount step — and because the body observer (150 ms debounce) re-runs `mountUI()` wholesale, a persistently-throwing step permanently suppresses everything downstream of it, including the observer registration inside `App.start()`. The userscript boots degraded instead of partially: no loan-limit panel, no tactics dropdown, no observer — from one broken step.

## Failure facts the fix is anchored to (verified 2026-10-16, implementation session)

1. `src/app/bootstrap.js` `mountUI()` (base lines 95–111) is a strict sequence with ZERO try/catch: `UI.addMatchParserPanel()` → `void TacticPresetLibraryPanel` → `TrainingGuidePanel.mount()` → `this.placeTrainingGuideBeforeChampAverages()` → `LoanLimitPanel.mount()` → tactics-dropdown existence check + `UI.addDropdown()`. A throw at any step aborts the remaining steps on every observer pass; in `App.start()` (base lines 125–127) a throw on the initial pass also prevents `DomUtils.installObserver` from ever registering.
2. `src/modules/team-management/training-reference-guide.js` self-starts `TrainingGuidePanel.mount()` at eval time (base line 279). The userscript header declares no `@run-at`, so document-start evaluation is possible; with `document.body` still null the mount fallback `(document.querySelector('.pad2')||document.body).appendChild(panel)` (base line 271) throws and kills the remainder of the bundle.
3. `src/modules/team-management/team4-leadership-upgrade-indicator.js` `decorate()` (base line 45) sets `node.dataset.slfMount` unconditionally, overwriting the marker bootstrap.js:28 wrote on the training guide panel (`fm2026-training-before-champ` → clobbered to the adapter's generic `fm2026-training-content`).

## Behaviour

- `mountUI()`: every init step is wrapped in its own try/catch. A failing step logs `'[SLF] <step-name> failed; continuing startup'` with the original error object and the chain continues to the next step. Step names: `match-parser-panel`, `tactic-preset-library`, `training-guide-mount`, `training-benchmarks-card`, `loan-limit-panel`, `tactics-dropdown`. Step order is unchanged; the observer mechanism (`DomUtils.installObserver`) is unchanged; the dropdown step keeps its existence check and async nature (only its synchronous part is guarded).
- **Logging deviation (sanctioned by the work order's fallback clause):** the established fail-open precedent is `debugWarn('[SLF] <name> failed; continuing startup', error)` (config.js:233, `CONFIG.DEBUG`-gated). `debugWarn` IS in the shared IIFE bundle scope, but referencing it in bootstrap.js fails `node tools/check-bundle-order.mjs` (dependency audit: "src/app/bootstrap.js uses undeclared audited dependency debugWarn — src/core/config.js", observed empirically) and the only remedy is a `src/app/bundle-order.json` dependency-audit edit, which the work order's no-touch list and allowed-path enumeration forbid. The guards therefore log via `console.warn` with the identical message format. Consequence: the warning is not `CONFIG.DEBUG`-gated (visible in production consoles when a step genuinely fails — fail-visible instead of fail-silent; the same audited-dependency constraint applies to any `CONFIG` reference).
- `training-reference-guide.js`: the eval-time self-start guards on `document.body`; when body is null it defers `mount()` to `DOMContentLoaded` (`{ once: true }`) instead of throwing. `mount()`'s own `panelId` idempotence guard semantics are unchanged.
- `team4-leadership-upgrade-indicator.js` `decorate()`: sets `node.dataset.slfMount` only when the node does not already carry a `slfMount` value (single owner; bootstrap's `fm2026-training-before-champ` wins over the adapter's generic re-decoration value).

## Out of scope

`src/app/bundle-order.json` (see deviation note above), all other modules, generated files (`releases/*`, `data/version.json`, `CHANGELOG.md`, `CHANGELOG`), mount order, any placement logic, the dom-utils observer, and the production debug boundary (no `window.SLF*` export — check-bundle-order.mjs:37–64).

## Acceptance criteria

1. `node tools/check-bundle-order.mjs` passes (observed: "OK: 90 registered runtime modules … production debug boundary rejects 4 privileged export patterns … 8 deterministic scenarios").
2. `node --check` passes on both touched module files (`training-reference-guide.js`, `team4-leadership-upgrade-indicator.js`). Standalone `node --check src/app/bootstrap.js` is NOT meaningful (bundle segment: opener lives in bootstrap-preamble.js; it fails identically on base e775f72 — observed).
3. `node tools/test-boot-continuation.mjs` — all cases pass (T1 continuation; T2 six per-step throw variants; T3a body-null deferral; T3b eval-mount preservation; T4a single-owner marker; T4b marker stamping).
4. Pre-fix failure map reproduced against base e775f72 sources via `SLF_BOOTSTRAP_PATH` / `SLF_TRAINING_GUIDE_PATH` / `SLF_TEAM4_PATH` env overrides (base files extracted with `git show e775f72:<path>`): T1 and all six T2 variants FAIL with propagation/missing-tail semantics; T3a FAILS with `TypeError: Cannot read properties of null (reading 'appendChild')` at base training-reference-guide.js:271 (thrown at the base :279 self-start); T4a FAILS with `'fm2026-training-content'` ≠ `'fm2026-training-before-champ'`. T3b and T4b pass pre-fix by design (preservation guards). Exit code 1.
5. Test registered in BOTH workflow files adjacent to the existing test registrations: `build-latest-release.yml` (validate step, after `test-loan-limit-fm2026.mjs`), `quality-integration.yml` (`node --check` block + runtime regressions step). Only registration lines changed.
6. `git diff --stat` shows changes only in: the 3 source files, `tools/test-boot-continuation.mjs` (new), both workflow files, `specs/slf-356-boot-hardening/*` (this SDD set).

## NFR assessment

- **Correctness:** guard-per-step with the established fail-open message format; step order, observer mechanism and placement logic untouched (verified by diff).
- **Fail-visible:** a contained step failure always logs (post-change; previously silent death of the tail), with the original error object attached.
- **Risk:** low — three one-point behavioural changes, no data contracts, no build/release artefacts, no schema changes.
