# Plan: Tactical Suite v9 (no-implicit-fallback hold-current contract)

Issue: MostDef2000/SLF#325 (parent #252)
Base: c5ca7de7a475d986cd601e0635369313ec5fb34a

## Implementation

Orders as implemented (R1–R4 in the working tree; R5 = these documents + the audit report).

**R1 — registry v9 + policy v9 + fallback elimination.**

- `src/modules/tactics-presets/active-preset-registry.js` — suite identity (`slf_tactic_suite_561_v9`, schema `slf_rule_decision_v9_tactical_suite`, `fallbackPolicy '5.61-tactical-suite-v9-hold-current'`, `inventorySchema 'slf_active_preset_inventory_v3'`), 10 active presets, 10 situations, 14 controlFields, `roleContracts` with `fallbackEligible:false` for all, `evidenceAdjustment()` bounded noop, v9 control deltas (BoxControl build_fast/dribble/shot 2→1; Conte cross 5→4; LowBlock build_fast 2→1; Bielsa cross 5→4; formations unchanged), retired `Compact_Counter_def3` kept module-local as `HISTORICAL_COMPACT_COUNTER` (bytes unchanged, never exported).
- `src/modules/tactics-presets/tactic-preset-direction-policy.js` — VERSION `'5.61-tactical-suite-v9.0'`; install guard against a hardcoded `EXPECTED_SUITE` constant; `choose()` hold branch; `runTacticalSuiteV9` hold action; `selectSuiteV9` hold; `preferredPreset → null`; score parts `{rulePrior, contextFit, riskAdjustment, boundedEvidenceAdjustment}`.
- `src/modules/strategy-data-recommendations/cah-runtime-context.js` — `selected?.preset || null` and `action.preset` null-safe (PresetRuleScorer no longer `candidates.find(Arteta)` and can no longer select a VETOED preset).
- `src/modules/strategy-data-recommendations/cah-decision-core.js` — `toPlanRows` renders `'Рекомендация отсутствует — оставить текущую тактику'` when `action.preset` is null (no Arteta display default).
- `src/modules/strategy-data-recommendations/current-action-hint-engine.js` — `ACTIVE_PRESETS` = exactly the 10 active ids; `Compact_Counter_def3` removed from the selectable set (signature kept in `TACTIC_SIGNATURES` marked `legacy_retired`, detection only); registry-aware schema read.
- `src/modules/strategy-data-recommendations/re-plan-engine.js` — `selectPreset` null-hold plan row; `selectRawPreset` becomes a registry-safe wrapper over `selectRawPresetRules` (returns null when the registry is present and the raw id is not active).
- `src/modules/tactics-presets/tactical-lab-v1.js` — `productionIds` derived from `window.SLFActivePresetRegistry.active`.

**R2 — telemetry single-writer contract.**

- `src/modules/manual-match-telemetry/event-tracker.js` — `enrich()` MERGE (prior wins; registry `libraryVersion`/`recommendationSchema`; killed the stale `'active_presets_v2_bold_policy_v3'` artifact and the `|| 'bold'` riskAppetite default → `registry.defaultRiskAppetite || 'standard'`); `resolveRecommendationState()` (`lab_override`/`fallback_hold`/`recommended_and_applied`/`recommended_not_applied`/`manual_override`/null; `unknown_legacy` read-time only); `buildPresetEffect` writes 10 recommendation fields at the effect root and inside `tacticContext`; `savePresetEvent` adds `applicationSource 'preset_apply'` + `recommendedPreset`/`actualPreset`/`recommendationState`.

**R3 — canonical inventory artifact.**

- `tools/sync-active-preset-inventory.mjs` (new) — `--check` default / `--write`; vm-sandbox registry load; registry invariants validated in both modes; byte-deterministic output (no timestamps, stable key order, 2-space JSON + trailing newline).
- `data/tactics/active-preset-inventory-v3.json` (new, generated) — `presetCount 10`, `minDistance 8`, full 10×10 pairwise matrix + 45 sorted nearest pairs + roleContracts/formations.

**R4 — regression coverage + CI.**

- `tools/test-tactic-fallback-hold-current.mjs` (new) — hold branch through the real closure path (empty-active registry sandbox), `preferredPreset` null paths, `selectRawPreset` hold paths, mixed-stack install guard, `toPlanRows` hold text, static source guard against Arteta fallback literals.
- `tools/test-tactic-transition-graph.mjs` (new) — STEP mirror + live-graph validation via `shortestStep()` (adjacency, no extra edges, no removed/retired targets, no LowBlock→Bielsa, connectivity, family sanity, guard passthrough).
- `tools/test-tactical-situation-diversity.mjs` (updated) — v9 identity pins, roleContracts block, v9 14-field control table + formations, 11 selection scenarios, `execFileSync` `sync --check`.
- `tools/test-tactic-telemetry-envelope.mjs` (updated) — scenarios `recommended_not_applied` / `fallback_hold` / `manual_override` / `lab_override` + enrich MERGE assertions.
- `.github/workflows/quality-integration.yml` (updated) — `node --check` for the 3 new/updated test files + sync tool in both `static-contract-security` (lines 39–42) and `runtime-tactics` (lines 111–114); executions: diversity + `sync --check` in `static-contract-security` (lines 65–66); telemetry envelope + diversity + fallback-hold + transition-graph + `sync --check` in `runtime-tactics` (lines 154–161).

**The 9 eliminated fallback sites (v8 behavior → v9 behavior):**

| # | Site | v8 behavior | v9 behavior |
|---|---|---|---|
| 1 | policy `choose()` | Arteta default object when no eligible candidate | hold_current object (`name:null`, `hold:true`, `fallbackReason:'no_eligible_candidate'`) |
| 2 | policy `selectRawPreset` (`selectSuiteV9`) | Arteta injection for invalid/missing decision | hold `{name:null, progressionAction:'hold_current', fallbackReason:'invalid_preset'\|'no_decision'}` |
| 3 | policy `preferredPreset` | Arteta default for unknown situations | `null` |
| 4 | `cah-runtime-context` PresetRuleScorer | `candidates.find(Arteta)` (could select a VETOED preset) | `selected` stays null |
| 5 | `cah-runtime-context` `action.preset` | Arteta string default | `null` |
| 6 | `cah-decision-core` `toPlanRows` | Arteta display default | hold text row |
| 7 | `re-plan-engine` `selectPreset` | `Pep_BoxControl_bal2` default | null-hold plan row |
| 8 | `re-plan-engine` legacy `selectRawPreset` | removed-preset ids returned | registry-safe wrapper (null when registry present) |
| 9 | `current-action-hint-engine` `ACTIVE_PRESETS` | retired `Compact_Counter_def3` selectable | removed (signature kept for detection only) |

## Risk controls

- **Mixed-version guard.** The policy installs only on a registry whose `suiteVersion` equals the hardcoded `EXPECTED_SUITE = 'slf_tactic_suite_561_v9'`; a v8 registry + v9 policy installs nothing (asserted by the mixed-stack sandbox in `test-tactic-fallback-hold-current.mjs`).
- **Null-tolerance verification.** Every read site listed in the 9-site table is covered by an explicit assertion (hold branch, null preset, hold text, wrapper null); the static source guard additionally bans `|| 'Arteta'`, `find(...Arteta`, `? 'Arteta` in the policy source.
- **enrich() merge prior-wins.** Non-null prior values are never clobbered by null; asserted by the MERGE scenario in `test-tactic-telemetry-envelope.mjs` (prior `recommendedPreset`/`rawRecommendedPreset` survive).
- **CI registration in both jobs.** Syntax gates and executions are registered in `static-contract-security` AND `runtime-tactics`, so a failing tactic test blocks the aggregate `ci` job regardless of which job surface runs it.
- **Generated files never hand-edited.** `data/tactics/active-preset-inventory-v3.json` is produced only by `tools/sync-active-preset-inventory.mjs --write`; drift fails `sync --check` locally, in the diversity test, and in both CI jobs.

## Verification plan

All of the following exit 0 locally on the R1–R4 state:

- `node tools/sync-active-preset-inventory.mjs --check` — inventory in sync with the registry (`presetCount=10, minDistance=8`).
- `node tools/check-bundle-order.mjs` — bundle order unchanged.
- `node tools/test-tactical-situation-diversity.mjs` — v9 identity pins + roleContracts + control table + sync re-check.
- `node tools/test-tactic-fallback-hold-current.mjs` — hold-current contract incl. mixed-stack guard.
- `node tools/test-tactic-transition-graph.mjs` — transition graph invariants.
- `node tools/test-tactic-telemetry-envelope.mjs` — application states + enrich MERGE.
- `node --check` over the four touched/new tool files and the touched modules (mirrors the CI syntax gates).
- `git diff --stat` / `git status --porcelain` limited to the approved R1–R5 paths (11 modified tracked + 4 untracked tools/JSON + 4 new docs files).
- Exact-head canonical `SLF CI / ci = SUCCESS` on the PR.

## Correct-course

- **R1 smoke caught a self-referential install guard.** The first draft derived `SUITE` from `registry.suiteVersion` before the guard, making `registry.suiteVersion !== SUITE` a tautology — a stale v8 registry would have satisfied it and silently installed a mixed stack. Fixed to a hardcoded `EXPECTED_SUITE = 'slf_tactic_suite_561_v9'` constant compared against the registry, with `SUITE` derived from the registry only after the check.
- **R4 rank monkey-patch seam bypassed by closure.** The first attempt at forcing a hold scenario patched `rank` on the exported policy object, but `choose()` reads the closure-local `rank`, so the patch was a no-op. Replaced with an empty-active registry sandbox (`active: []`, v9 suite identity): the real closure path `rank → choose → hold` runs unpatched production code.

## Deviation note

- **riskAppetite default `'bold'` → `registry.defaultRiskAppetite` (`'standard'`).** v8's literal `'bold'` fallback made the engine own the appetite default; v9 makes the registry own it. Observable change for rows that previously defaulted to bold; intentional and covered by the envelope test.
- **`lab_override` is defensive-only.** Tactical Lab applies through the bridge and bypasses `savePresetEvent`, so no currently firing code path writes `lab_override`; the branch exists to classify lab-sourced rows if they ever reach `resolveRecommendationState` (and is exercised directly by the envelope test).
