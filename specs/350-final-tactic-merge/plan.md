# #350 — implementation plan / risk and quality

**Risk MEDIUM:** the merge layer is additive over an already-guarded engine
chain, but it rewrites the panel's primary action surface and the apply path
now sends a full 14-control vector instead of a partial one. Main risks:
(1) ordinal type drift (etalon numbers vs registry/current strings) breaking
strict bridge equality or telemetry fingerprints — mitigated by normalizing
every merged value to `String` before comparison and apply;
(2) accidental mutation of `result.action` / `result.etalon` — mitigated by the
wrapper only assigning `result.finalTactic` and copying all vectors;
(3) double/stale apply — mitigated by reusing the token state machine,
reentrancy guard and 5s rollback re-enable unchanged;
(4) broken panel when the merge or etalon layer is absent — mitigated by
preset-only (T1) degradation and a legacy «Действие» fallback row in the UI;
(5) module accounting drift — mitigated by updating BOTH consumers
(bundle-order audit, reliability budget) to 90.

Risk-based test design: P0 = merge decision table (T1–T6) with string/number
normalization, action/etalon non-mutation, full-vector apply contract; P1 =
panel rendering (merged block, provenance line, T2 reference line, hold_current
wording) and state machine reuse; P2 = existing suite (bundle-order, sync
`--check`, bridge, fallback, telemetry budget). The two pre-merge etalon UI
tests are reworked to the merged shape and registered in CI as must-pass.

1. Layer: `final-tactic-merge-layer.js` — IIFE, outermost
   `CurrentActionHintEngine.run` wrapper installed after `dave56-etalon-layer.js`
   in bundle order; guards (v11 registry, engine present, idempotency flag,
   etalon-layer presence → T1 degrade); pure `computeFinalTactic(snapshot,
   context, result)` implementing the T1–T6 table; exposes
   `window.SLFFinalTacticMergeLayer = {version, autoApply:false, computeFinalTactic}`.
2. UI: `strategy-data-task-a-ui-extension.js` — single «Рекомендация» block
   replacing the «Действие» row + etalon-only block; vector grouped
   оборона/построение/атака/стиль; Δ vs current (14+priority, etalonDeltaText
   pattern); per-block provenance line; scenario notes; T2 reference line; ONE
   `#slf-final-tactic-apply-btn` with the preserved state machine renamed to
   `applyFinalTactic`; STATE fields switched to
   `finalTacticRecommendation`/`finalTacticApplyStatus`; delegation updated.
3. Plumbing: `STATE.finalTacticRecommendation = null` /
   `STATE.finalTacticApplyStatus = 'idle'` in `src/core/config.js` (replacing
   the etalon pair — sole runtime consumer is the task-A UI extension).
4. Registration: `final-tactic-merge-layer.js` inserted after
   `dave56-etalon-layer.js` in `src/app/bundle-order.json` with an audit entry
   and `expectedModuleCount` 89→90; `bundle.expectedModules` 89→90 in
   `data/quality/reliability-budget-v1.json` (two consumers, both updated).
5. Contract: `contracts/branches/strategy-data-recommendations.md` — etalon
   policy section retitled to the merged recommendation policy with the compact
   T1–T6 table; «result.action never modified» survives with a sentence that
   the replacement applies to the display/apply surface, not preset ranking;
   the single merged «Применить» button is the only trigger; `autoApply:false`
   invariants unchanged.
6. Specs: this spec set under `specs/350-final-tactic-merge/` (format of
   `specs/348-dave56-etalon-hint/`).
7. Verification (once, at the end): `node --check` on touched JS;
   `check-bundle-order.mjs` (90 modules); `sync-dave56-etalon.mjs --check`;
   `sync-active-preset-inventory.mjs --check`; the three dave56 data/mapping/
   matcher tests (must stay green — the matcher test proves action identity and
   does not load the new module); `test-tactic-bridge-v10.mjs`,
   `test-tactic-fallback-hold-current.mjs`,
   `test-telemetry-properties-and-mutations.mjs` (budget 90); the two etalon
   panel/apply-contract tests reworked to the merged shape (must-pass in CI).

**Correct-course:** if the registry is not the v11 suite the layer stays
dormant (no wrapper effect). If the etalon layer is absent or the etalon failed,
finalTactic degrades to pure preset / pure current. If the bridge reports
`rollback_unverified`, the button stays disabled pending a fresh hint render.

**Correctness notes:** the merged vector contains all 14 controls plus
priority; etalon keys not covered (pass_risk, dribble, cross, corner, shot)
always come from the preset (or current) base; `deltaVsCurrent` is recomputed
over all 14+priority defensively (try/catch → null); `referenceLine` is set
only for T2.
