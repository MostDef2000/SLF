# Final merged tactic recommendation in the hint panel (#350)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `feat/350-final-tactic-merge`, base `422027e` (rebased from the original `49b3663` after #351 hotfix merged to main).

## Goal and user-visible behaviour

The game.php «Подсказка» hint panel consolidates the v11 preset recommendation
(base) and the Dave 5.6 etalon (situational overrides) into ONE final
recommended tactic, `result.finalTactic`, computed by a new outermost engine
wrapper `final-tactic-merge-layer.js` (installed after `dave56-etalon-layer.js`).
The panel renders a single merged **«Рекомендация»** block (replacing the
«Действие» row and the etalon-only block): preset title (incl. the
hold_current wording «оставить текущую тактику»), the merged vector grouped by
оборона/построение/атака/стиль, Δ vs current tactic over all 14 controls plus
priority, per-block provenance («оборона/построение/стиль ← эталон d5+b5+s1 ·
атака ← пресет Conte_WideChannels_v11»), scenario notes, the T2 reference line,
and ONE **«Применить»** button (`#slf-final-tactic-apply-btn`) applying the full
merged vector (14 string ordinals + priority) through the strict
tactic-control bridge with `source: rec.source` (`merged:etalon:*+presets:*` /
`merged:current:*`). «Решение»/«Кандидаты» rows stay unchanged (informational).

## Merge decision table

Strength of an etalon block: defense is strong when the final defense situation
is d2–d12 or a scenario replaced/shifted the defense block; buildup is strong
for b2–b12 or a scenario replacement/shift (s1/s2@≥60/s4/s5 replace blocks,
s2 pre-60 does not; s3 shifts press_line→defense and the rest→buildup; s6
shifts buildup only).

| Case | Condition | Result |
| --- | --- | --- |
| T1 | no scoreState / `etalon.ok === false` / empty applyVector (incl. etalon layer absent) | pure preset vector; pure current when hold_current |
| T2 | only d1/b1 defaults matched, no strong scenario (incl. s2 pre-60) | preset base, etalon shown as reference line, no override |
| T3 | defense strong only | etalon defenseVector overrides present keys, preset fills gaps |
| T4 | buildup strong only | etalon buildupVector overrides present keys (style may be absent → preset); priority = etalon priorityLanes when non-null, else preset |
| T5 | both strong | full etalon override of present keys across both blocks |
| T6 | hold_current (`action.preset === null`) | base = `getCurrentTactic()` (strings); override rules unchanged |

`result.finalTactic` never mutates `result.action` or `result.etalon`; all 14
values are normalized to STRING ordinals (registry/current are strings, etalon
vectors are numbers) so telemetry fingerprints are stable.

## Acceptance / NFR

The merge is deterministic and side-effect free: pure synchronous computation
over the already-computed `result.action` / `result.etalon`, no DOM access, no
bridge calls, `autoApply: false` — the single merged button remains the only
trigger and reuses the proven token state machine (idle→applying→applied /
failed_rolled_back / failed_unverified / already_applied, 5s rollback
re-enable, reentrancy guard, foreign/finished/in-progress disabled). Degradation
is graceful: a wrapper exception or missing etalon layer produces a preset-only
(or hold-current) finalTactic instead of a broken panel. Bundle/module
accounting stays consistent: `check-bundle-order.mjs` green with 90 modules and
`test-telemetry-properties-and-mutations.mjs` budget 90. The two etalon panel/
apply-contract tests pin the pre-merge UI and were reworked to the merged shape
(must-pass in CI; all green).

## Exclusions

Generated release artifacts (`releases/**`, `CHANGELOG.md`, `data/version.json`,
`data/release-evidence.json`), dave56 etalon data/mapping/layer modules
(read-only consumers), current-action-hint-engine and all inner engine layers
(read-only), tactics-presets control plane (read-only), VPS code, CI workflows,
tests/** (the pinned etalon tests were reworked in-place to the merged shape;
the assertion sets now pin merged behavior and stay registered in CI).
Preset ranking and the v11 engine decision are unchanged — the merge applies to
the display/apply surface only.
