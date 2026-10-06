# Tasks: Tactical Suite v9 (no-implicit-fallback hold-current contract)

Issue: MostDef2000/SLF#325 (parent #252)
Base: c5ca7de7a475d986cd601e0635369313ec5fb34a

## Implementation orders

- [x] R1: registry v9 — suite identity (`slf_tactic_suite_561_v9`, `slf_rule_decision_v9_tactical_suite`, `5.61-tactical-suite-v9-hold-current`, `slf_active_preset_inventory_v3`), 10 active, roleContracts `fallbackEligible:false` ×10, 10 situations, 14 controlFields, `evidenceAdjustment()` noop, v9 control deltas, formations unchanged.
- [x] R1: policy v9 — VERSION `5.61-tactical-suite-v9.0`, install guard on `EXPECTED_SUITE` constant, `choose()` hold branch, `runTacticalSuiteV9` hold action, `selectSuiteV9` hold, `preferredPreset → null`, score parts `{rulePrior, contextFit, riskAdjustment, boundedEvidenceAdjustment}`.
- [x] R1: fallback elimination — `cah-runtime-context` (selected/preset null-safe), `cah-decision-core` (toPlanRows hold text), `current-action-hint-engine` (10 ACTIVE_PRESETS, Compact `legacy_retired`, registry-aware schema), `re-plan-engine` (null-hold selectPreset, registry-safe selectRawPreset wrapper), `tactical-lab-v1` (registry-derived productionIds).
- [x] R2: telemetry single-writer — enrich MERGE (prior wins; registry libraryVersion/recommendationSchema; removed `'active_presets_v2_bold_policy_v3'` and `|| 'bold'` default), `resolveRecommendationState`, `buildPresetEffect` 10 fields root+tacticContext, `savePresetEvent` applicationSource/recommended/actual/state.
- [x] R3: canonical inventory — `tools/sync-active-preset-inventory.mjs` (--check/--write, vm sandbox, registry invariants, byte-deterministic) + generated `data/tactics/active-preset-inventory-v3.json` (presetCount 10, minDistance 8).
- [x] R4: tests — `test-tactic-fallback-hold-current.mjs` (new), `test-tactic-transition-graph.mjs` (new), `test-tactical-situation-diversity.mjs` (v9 pins + roleContracts + sync --check), `test-tactic-telemetry-envelope.mjs` (4 application-state scenarios + MERGE).
- [x] R4: CI registration — `node --check` × 4 in `static-contract-security` and × 4 in `runtime-tactics`; executions in both jobs (diversity + sync --check; envelope + diversity + fallback-hold + transition-graph + sync --check).
- [x] R5: SDD artifacts — `specs/325-tactical-suite-v9/{spec,plan,tasks}.md`.
- [x] R5: owner-facing validation report — `docs/audit/tactical-suite-v9-refresh.md`.

## Acceptance traceability (issue #325 criteria → evidence)

| Acceptance criterion | Evidence (test / command / artifact) |
|---|---|
| No implicit preset fallback in any decision path | `node tools/test-tactic-fallback-hold-current.mjs` (hold via real closure path, `preferredPreset` null paths, `toPlanRows` hold text, static source guard) — exit 0 |
| `fallbackEligible:false` for every active preset + situation coverage | `node tools/sync-active-preset-inventory.mjs --check` (registry invariants) + `node tools/test-tactical-situation-diversity.mjs` (roleContracts block) — exit 0 |
| Registry↔inventory drift closed by a canonical generated artifact | `sync --check` ok (`presetCount=10, minDistance=8`); drift fails both CI jobs; diversity test re-runs `sync --check` |
| Retired `Compact_Counter_def3` never selectable | diversity test retirement block + `test-tactic-transition-graph.mjs` (`selectRawPreset` never emits a removed preset; no retired edge targets) |
| Telemetry single-writer + application states | `node tools/test-tactic-telemetry-envelope.mjs` (recommended_not_applied / fallback_hold / manual_override / lab_override + enrich MERGE prior-wins) — exit 0 |
| Transition graph safety (connectivity, no retired targets, no LowBlock→Bielsa) | `node tools/test-tactic-transition-graph.mjs` — exit 0 |
| Manual safety flags untouched (no auto-train/auto-apply) | `data/tactics/tactic-evaluation-contract-v2.json` untouched (`git diff` empty for the path); `policy.autoApply === false` asserted in the diversity test |
| No evidence ranking release | `registry.evidenceAdjustment() === 0` asserted in the diversity test; `boundedEvidenceAdjustment` part present but 0 |
| CI gates registered | `.github/workflows/quality-integration.yml` lines 39–42, 65–66, 111–114, 154–161 |
| Suite runtime within CI budget | plain-process node tests (no browser/network); executed inline in the existing jobs — no new workflow/job |

## Definition of Done

All checkboxes above are checked; the full local verification battery (`check-bundle-order`, `sync --check`, the four tactic tests) exits 0 on the exact head; the diff is limited to the approved paths; CI is green on the exact head and the PR is merged; the merge to `main` auto-triggers SLF Release (patch bump from the release manifest, no manual version edits). The v9 suite then begins accumulating its own telemetry cohort under `libraryVersion 'slf_tactic_suite_561_v9'`, separated from the v8 legacy cohort; no champion/evidence ranking is enabled until the #252 readiness criteria are met.
