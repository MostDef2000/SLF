# #348 — executable acceptance checklist

- [ ] [A1] `dave56-etalon-data.js` embeds all 24 situations (defense-12, buildup-12) and 6 score-play scenarios verbatim from the work order, with word maps, domain ranges, lane words, calibration and provenance; pure data, exported as `window.SLFDave56EtalonData`.
- [ ] [A2] `dave56-etalon-mapping.js` resolves every word to its domain ordinal; slash pairs resolve conservatively to the min ordinal on the defensive axis (Обычный/атака→Обычный, Средняя/высокая→Средняя, Низкий/средний→Низкий, Широкая/средняя→средняя) with the aggressive alternate available via `conservative:false`; ordinals clamp to domain; lane words map to priority arrays with documented omissions.
- [ ] [A3] `dave56-etalon-layer.js` wraps `CurrentActionHintEngine.run` outermost, installs only under the v11 suite registry, computes `result.etalon` (situation ids, labels, conservative vectors, merged apply vector, priority lanes, delta vs current, confidence, scenarios, notes, insufficientData) and never modifies `result.action`; defaults d1/b1 with `b10_lane_play` always reported.
- [ ] [A4] Scenario precedence is fixed (s2→s1→s4→s5→s3→s6, mutually exclusive); s2 overrides defense/buildup to d5/b5 only from minute 60; s4 adds late-delta press_intense+1 with the «навал» note from minute 80; s3 deltas respect caps.
- [ ] [A5] Hint panel renders the etalon block (labels, control words, priority lanes, scenario notes, confidence/insufficient markers) after the «Действие» line, with a single «Применить» button; no automatic apply path exists (`autoApply:false` unchanged; button is the only trigger).
- [ ] [A6] Apply state machine: token-stamped `STATE.etalonRecommendation`; `applying→applied` on `ui_readback_confirmed`, `failed_rolled_back`/`failed_unverified` per bridge status, stale token invalidated with a re-render hint, already-applied detected against `getCurrentTactic()`; bridge source `etalon:dave56:*`, strict mode.
- [ ] [A7] `STATE.etalonRecommendation`/`STATE.etalonApplyStatus` in `src/core/config.js`; three modules registered in `src/app/bundle-order.json` after `moment-drift-stabilizer.js` with audit entries and `expectedModuleCount` 89.
- [ ] [A8] `tools/sync-dave56-etalon.mjs` regenerates and validates `data/tactics/dave56-etalon-v1.json`; `--check` exits 1 on drift; invariant failures (unknown words, out-of-domain ordinals) fail both modes.
- [ ] [A9] Provenance note `dave56_etalon_source` added to `dave-engine-knowledge.js` (data-only, audit surface unchanged); etalon application policy section added to `contracts/branches/strategy-data-recommendations.md`; this spec set exists under `specs/348-dave56-etalon-hint/`.
- [ ] [A10] Verification green: `check-bundle-order.mjs`, `sync-dave56-etalon.mjs --check`, `sync-active-preset-inventory.mjs --check`, `test-tactic-bridge-v10.mjs`, `test-tactic-fallback-hold-current.mjs`, `node --check` on every touched JS file, and the 7-case vm smoke (conservative/alternate resolution, scenario precedence and minute gates, insufficient data, `result.action` untouched).

## Operational, external and not implied

- [ ] Owner-side in-game acceptance of the hint block and one-click apply on a live match (separate from this implementation).
- [ ] Merge/PR/CI/release lifecycle handled by the delivery orchestrator; this task ships source changes only.
