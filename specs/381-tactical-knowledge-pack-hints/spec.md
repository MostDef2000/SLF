# 381 — Tactical knowledge pack → registry seed priors

## Approved outcome
Close the evidence loop cells → rules → pack → `evidenceAdjustment`: a validated tactical knowledge pack (`slf_tactical_knowledge_pack_v1`) is loaded anonymously by the userscript, cached for 24 h, and consumed by the active preset registry as bounded seed priors (+3) for preset scoring, with a one-line provenance label in the compact coach card. No automatic tactic application; hint generation stays synchronous and never awaits the loader.

## Background
The RAG export (`data/tactics_knowledge-pack.latest.json`, served at `https://slf-api.mostdef.ru/slf_ai/tactics/knowledge-pack.latest.json`) carries seed rules of the form `{id, when:{score_state, minute_min, my_bad_min, my_bad_max, pressure}, recommendation:{preset, reason}, confidence:'seed_rule'}`. Until now nothing consumed them at decision time.

## Invariants
- **Seed priors are labeled hypotheses, not outcome evidence.** A matching seed adds +3 to the candidate score; multiple matches do NOT stack (matched rule ids are collected for provenance); the total is clamped to ±5. Seeds are never presented as outcome evidence — the UI labels them `База: seed (гипотеза)`.
- **Supersession of the v9 noop reservation (labeled seed priors only).** `specs/325-tactical-suite-v9/spec.md` («No release of evidence ranking» — `evidenceAdjustment()` stays a noop) is superseded FOR LABELED SEED PRIORS ONLY. The cohort/evidence requirements (clean cohort, n≥30, outcome association) remain fully in force for any future OUTCOME-evidence delta; this feature ships none.
- **Fail-closed pack validation.** Exact schema match, nonempty version, unique nonempty rule ids, `confidence === 'seed_rule'`, nonempty `recommendation.preset`, `when` restricted to supported keys with strict numerics (no null/`''` coercion), `score_state ∈ {losing, winning, draw}`, ordered `my_bad_min ≤ my_bad_max`, pressure literal `opponent_advantage_xg_or_xt` only. One malformed rule rejects the whole pack. An EMPTY rules array is valid — it is the withdrawal mechanism.
- **Never await during hint generation.** init reads the localStorage cache synchronously; at most ONE anonymous GET (no Authorization header, 15s timeout) per page load when the cache is absent/expired/invalid; a completed fetch affects the NEXT hint only. No polling, no auto-rerender. Expired cache must not score.
- **Condition mapping is documented as approximate.** `score_state` → exact equality with `context.scoreState` (`'unknown'` never matches); `minute_min` → finite `context.minute >= bound`; `my_bad_min/max` → inclusive bounds on `context.myBad` AND `context.myBad > 0` (missing bad-actions normalize to 0 — missing is NOT 0% execution); `pressure` → `context.underPressure === true`, a documented approximation of the pack's xG/xT pressure literal.
- **No veto, no eligibility change.** A seed match adds at most +3; no match returns 0 (never a negative veto). Hard vetoes, fallback policy (`5.61-tactical-suite-v12-hold-current`) and `fallbackEligible === false` are untouched. `generatorContext.safeRules` is not scoring input.
- **`HINT_RULES` stays an unused container.** Consumption is via the registry seam (`registry.knowledgeAssessment` + `evidenceAdjustment` adapter), not via hint rules — documented decision.
- **No release artifact, VPS or telemetry-schema changes.** `releases/**`, `data/version.json`, `CHANGELOG.md`, `vps/**` untouched; no automatic tactic application anywhere.

## Acceptance
`node --check` on touched sources; `check-bundle-order.mjs` (92 modules); `sync-active-preset-inventory.mjs --check`; the tactic runtime regressions (situation-diversity, fallback-hold-current, transition-graph, decision-linkage, manual-telemetry-final-boundary, v12 lead-press-hold, final-tactic-merge) all green; `tools/test-tactical-knowledge-pack.mjs` (separate test worker) wired into the `runtime-tactics` CI job. Registry returns `{delta, source, ruleIds, n, packVersion}` with `delta ∈ {0, +3}` for seed packs; provenance line renders escaped in the compact coach block.

## Non-functional requirements

- **Bounded influence.** Seed delta +3, clamp ±5, non-stacking; scoring scale of the direction policy is otherwise untouched.
- **Veto/eligibility preserved.** `evidenceAdjustment` feeds `boundedEvidenceAdjustment` only; vetoed candidates stay at −999; `rulePrior > 0` eligibility unchanged.
- **Rollback = revert + empty-pack withdrawal.** Reverting the branch removes the seam; publishing a pack with `rules: []` withdraws all seed priors without a client release.
- **Endpoint outage ≠ kill switch.** Missing GM capability, transport failure, malformed pack or expired cache leave scoring unchanged (delta 0); cache-write failure never discards valid in-memory state.
