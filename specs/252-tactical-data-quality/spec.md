# Spec: Tactical data-quality linkage

Issue: #252
Status: Approved implementation
Base: dba05d6739c0ccde80276c4ea3361f6fa2f3e30d

## Problem

Current tactical telemetry contains useful volume but too many records lose score state, exact production preset identity, high-resolution Tactical Lab exposure, or a resolvable finished-match outcome. Historical records must remain untouched.

## Required behavior

- Read the live/final score from the score-board structure without inventing zero values when score text is absent.
- Preserve the legacy score-board parser and add a conservative structural fallback only when exactly two score values are present.
- Attribute a production preset only when the observed tactical controls exactly match one of the active built-in production preset control objects (eleven through Tactical Suite v7; ten active from Tactical Selector v8).
- Preserve non-production explicit preset labels and historical data compatibility.
- Export Tactical Lab wall-clock exposure from `elapsedWallClockMs` while preserving legacy game-minute exposure.
- Distinguish a linked finished-result record from a finished result whose owned-team outcome can actually be resolved.
- Report privacy-safe unresolved-result reasons in Tactical Lab and match-outcome quality summaries.
- Keep P03 assignment weights and all production preset controls unchanged.

## Non-functional requirements

- No destructive data migration.
- No secrets or raw game IDs in derived public reports.
- No fuzzy preset matching.
- No automatic experiment promotion.
- Backward-compatible report fields remain present.
- Runtime and exporter regressions cover new behavior.

## Follow-up: finished-result score recovery (2026-10-05)

Status: Approved implementation
Base: 67755f2a576130a3c5156e67297acb1f8f4d684d
Target release: 4.4.330

### Evidence

The current 2026-10-04 RAG export contains 329 `match_results_v2` rows, but only 44 are outcome-resolvable; 285 are invalid because the score is missing. Tactical Lab links 85 finished results to activated experiments, yet resolves 0 outcomes because all linked results have `missing_or_invalid_score`. Fresh result rows exist from 4.4.328 and 4.4.329, so this is an active evidence blocker rather than a historical-only defect.

### Required behavior

- Preserve the legacy `.score_board` parser.
- Support the FM2026 host score representation used by current design surfaces: a compact `.fm-score` value such as `2-1`.
- Restrict the FM2026 fallback to the match surface.
- Accept only one unambiguous score pair and fail closed when multiple score-looking nodes exist.
- Never synthesize a zero score from missing or malformed content.
- Finished `match_results_v2` records must carry the parsed final score and a result key containing that score.

### Non-functional requirements

- No P03 population or weights change.
- No production preset or Production Advisor change.
- No API, VPS, storage, schema, or historical-data rewrite.
- No automatic Tactical Lab promotion/evolution.
- Exact-artifact browser regression must exercise FM2026 finished-score parsing and ambiguity rejection.

## Follow-up: Tactical Selector v8 — evidence-guided active preset retirement (2026-10-05)

Status: Approved implementation
Base: 44f14bf2e5f529c208f81e5288642afcb09bae43

### Evidence

Current 2026-10-04 RAG export:

- stable named effects: 55;
- `readyForRetune: false`, `minimumStableNamedEffects: 60`;
- `Compact_Counter_def3`: n=6, xgBalance=-0.3517, shotsBalance=-3.0, effectScoreV1=-3.6668;
- `Pep_BoxControl_bal2`: n=19, effectScoreV1=+0.7512;
- `Arteta_Control433_bal3`: n=12, effectScoreV1=+0.4167;
- finished-outcome evidence is incomplete because historical `match_results_v2` still contains 285 missing-score rows.

Interpretation: this change may retire a preset from production selection, but it must not claim that Compact Counter's underlying sliders are intrinsically bad and must not numerically retune tactic controls.

### Required behavior

- Introduce Tactical Suite v8 / recommendation schema v8 (`slf_tactic_suite_561_v8`, `slf_rule_decision_v8_tactical_suite`).
- Reduce the production-active preset set from 11 to 10 by retiring `Compact_Counter_def3` from active production selection.
- Remove the dedicated `pressure_counter` recommendation situation.
- Under opponent pressure, when `emergency_lock` is not required, rank conservatively through `pressure_escape`: `Pep_BoxControl_bal2`, `Arteta_Control433_bal3`, `Pep_PressCooldown_bal2`.
- Preserve the remaining role map: `Arteta_Control433_bal3` (stable_control), `Pep_ControlledPush_att3` (controlled_chase), `Pep_TwoThreeFive_att3` (positional_siege), `Conte_WingbackWidth_bal4` (width_attack), `Klopp_Gegenpress_att4` (late_high_pressure), `Simeone_Compact442_def4` (protect_lead), `Simeone_LowBlock_def5` (emergency_lock), `Bielsa_ChaosPress_att5` (final_all_in).
- `Compact_Counter_def3` may remain only as an unchanged module-local historical definition; it must not be exported into the active registry, `BASE_PRESETS`, `BASE_LABELS`, labels, ladders, recommendation candidates, or active UI.
- Keep the Production Advisor manual-only (`autoApply: false`).
- Keep telemetry/version identity explicit so post-change data can be segmented as v8.

### Non-functional requirements

- No tactical slider, control, or formation value changes for the remaining active presets.
- No P03 population/weights change; no Tactical Lab v2+/survivor/evolution/P04 work.
- No API, VPS, storage, schema, or historical-data rewrite.
- Generated release artifacts remain workflow-produced only.
- Selector keeps at least two eligible ranked alternatives with score/margin/confidence diagnostics.
- Progression guards and emergency overrides remain deterministic.
- Existing Tactical Lab P03 assignments and population identity remain intact.

## Follow-up: entry-context recovery and availability counters (2026-11-03)

Status: Approved implementation
Base: 86e3b82fa212b2a73d7db3a288af483cb47b7b1d

### Required behavior

- Tactical Lab exporter entry-context recovery: when the activation lifecycle snapshot is missing, the entry context is recovered by selecting the first dict-valued observation in a fixed order — activation event `context` → activation state `entryContext` → completed state `entryContext` → exit event `extra.entryContext`. An existing empty dict keeps precedence over lower-priority observations; contexts are never field-merged across observations; the entry context is never inferred from the exit score or exit minute.
- Additive, count-only per-field availability diagnostics under `entryContextFieldAvailability`: `samples` plus `minuteBucket`, `scoreState`, `homeAway`, `previousPreset` and `productionRecommendation`, each reported as `available`/`missing` counts. A field is available when it is present and usable under the same missing-value rule as `completeness()` (`None`/`''`/`'unknown'` count as missing); `previousPreset` follows the existing `knownPreviousTactic` semantics (a named preset or a manual tactic fingerprint counts as available).
- Production Advisor recommendation absence reasons are distinguished and reported count-only under `productionRecommendationAbsenceReasons`: `noRuleDecisionRecorded` (no recommendation object recorded) versus `recommendationPresetMissing` (a recommendation object without a usable preset).
- Client `scoreContext` guard in Tactical Lab v1: home/away is observed evidence, never a default — the side is attributed only when the `teams` array has exactly two entries and `myTeam` is present; otherwise `homeAway` is `unknown` (previously a missing/short `teams` array silently assumed `away`). Score values must be finite numbers before any comparison, so coercion of empty/null values can no longer fabricate a draw; valid inputs produce unchanged `scoreState`/`scoreDiff`/`homeAway` output.
- Strict `entryCompleteness` metric semantics are unchanged; the new counters and absence reasons are additive report keys only.

### Non-functional requirements

- No historical data rewrite and no schema/storage change beyond additive summary keys.
- Counters are counts only; the existing privacy sanitization flags remain false on all sanitized outputs.
- No P03 population/weights change and no production preset change.
