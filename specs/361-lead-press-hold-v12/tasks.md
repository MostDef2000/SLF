# Tasks — Tactical Suite v12 lead-press-hold (#361)

## Acceptance checklist

- [x] `Flick_LeadPressHold_v12` registered in all registry surfaces (ACTIVE_PRESET_NAMES, PRESETS, LABELS, FORMATIONS, DISPLAY_META/DISPLAY_ORDER, META, TRAITS, ROLE_CONTRACTS, SCHEME_STATES/PRESET_SCHEME_STATE, LADDERS.defensive between Allegri and Simeone_CompactLead, AUDIT.conditional, situations) with the exact 14-field owner-approved vector — verified by `tests/test-tactic-suite-v12-lead-press-hold.mjs` and the diversity frozen-vector table.
- [x] `SCORE_BY_SITUATION.lead_press_hold` = {Flick 80, Allegri 45, Simeone 35, Emery 30} — source-text assert + observable priors via real `scoreCandidate`.
- [x] Veto (a): Flick gated to `winning && 60 ≤ minute ≤ 85 && opponentPressVector ≥ 20` — boundary matrix green.
- [x] Veto (b): Simeone gated vs high press; valid after 85', at 2+ goal lead, in `emergency_lock` — carve-out asserts green.
- [x] Veto (c): dribble ≤ 1 presets never recommended in `lead_press_hold` / `protect_lead` / `protect_lead_with_outlet` — per-situation asserts green; guard inactive in `emergency_lock`.
- [x] STEP edges: Flick ↔ Allegri, Flick ↔ Simeone_CompactLead; graph connectivity invariants green.
- [x] `SUITE_VERSION = slf_tactic_suite_561_v12`, `fallbackPolicy = 5.61-tactical-suite-v12-hold-current`, policy `VERSION = 5.61-tactical-suite-v12.0`, install guard bumped.
- [x] `opponentPressVector` context contract (direct field + `oppPressVector` + `oppPress` aliases, default 0) documented and tested.
- [x] Named-trainer invariant: all 13 active presets carry a real trainer; `standard` documented as UI-only baseline excluded from recommendations.
- [x] Intensity-logic requirement documented as not-implemented with rationale (no mechanism, no precedent) — deferred.
- [x] CI orbit updated without assertion weakening: `tools/sync-active-preset-inventory.mjs` (v12, count 13) + regenerated `data/tactics/active-preset-inventory-v3.json` (idempotent, `--check` green), `tools/test-tactical-situation-diversity.mjs`, `tools/test-tactic-fallback-hold-current.mjs`, `tools/test-tactic-transition-graph.mjs`, `tools/test-coach-preset-aliases.mjs`.
- [x] Spec artifacts (spec/plan/tasks) complete.

## Definition of Done

All commands green (exact matrix run at implementation close):

```
node --check src/modules/tactics-presets/active-preset-registry.js
node --check src/modules/tactics-presets/tactic-preset-direction-policy.js
node tests/test-tactic-suite-v12-lead-press-hold.mjs
node tests/test-preset-storage-sync-status.mjs
node tools/test-tactical-situation-diversity.mjs   (incl. sub-runs: bridge, aliases, inventory --check)
node tools/test-tactic-fallback-hold-current.mjs
node tools/test-tactic-transition-graph.mjs
node tools/test-coach-preset-aliases.mjs
node tools/sync-active-preset-inventory.mjs --check
node tools/check-bundle-order.mjs
```

Scope: only `src/modules/tactics-presets/**`, `specs/361-lead-press-hold-v12/**`, `tests/**`, the five named `tools/` files and the one `data/` JSON. No commits in the work session (orchestrator owns git lifecycle). Runtime acceptance (widget recommendation under a live 1:0 + high-press situation) follows per the normal user-acceptance flow after merge/release.
