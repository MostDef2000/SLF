# Plan: Tactical data-quality linkage

Issue: #252

## Implementation

1. Harden `MatchStateParser.readScore()` with strict numeric parsing and a score-board-only fallback.
2. Add exact production preset recognition to tactical telemetry using the canonical active built-in preset map already present in `BASE_PRESETS`.
3. Extend Tactical Lab aggregation with wall-clock exposure and explicit result-resolution diagnostics.
4. Extend preset evidence/outcome aggregation with privacy-safe invalid-result reason counts.
5. Update dependency metadata, regressions, and audit documentation.

## Risk controls

- Score fallback accepts only exactly two standalone integer values inside the score board.
- Production preset recognition is exact full-control fingerprint equality; multiple matches resolve to unknown.
- Existing legacy duration/result fields are not removed.
- P03 and production tactic definitions are not edited.

## Verification

- Node tactical telemetry regression.
- Python Tactical Lab exporter regression.
- Python preset evidence exporter regression.
- Browser exact-userscript regression.
- Canonical `SLF CI / ci` on final PR head.
- Fresh base/head/scope comparison before merge.
- Release provenance verification after merge because runtime source changes.

## Follow-up plan: finished-result score recovery

1. Extend `MatchStateParser.readScore()` after the existing legacy parser with one FM2026 fallback scoped to `.match_content .fm-score`.
2. Parse only a complete `N-N`, `N:N`, en-dash, or em-dash score pair with one- or two-digit sides.
3. Return a score only when exactly one FM2026 candidate is valid; multiple candidates remain unresolved.
4. Replace the finished-match browser fixture's legacy score board with the FM2026 compact score representation.
5. Require the finished-result payload and `resultKey` to retain the parsed score.
6. Verify branch scope, canonical `SLF CI / ci`, exact-green-head merge, and automatic userscript publication.

### Correct-course / risk check

The production evidence proves missing final scores but does not expose raw production DOM. Repository FM2026 fixtures establish `.fm-score` as a current host score class. The implementation therefore adds only that evidenced compatibility path and does not introduce broad `[class*=score]` or page-wide numeric scraping. If canonical/browser evidence contradicts this assumption, the task returns to implementation rather than widening selectors speculatively.

## Follow-up plan: Tactical Selector v8 active preset retirement

1. Bump the registry identity to `slf_tactic_suite_561_v8` / `slf_rule_decision_v8_tactical_suite` and reduce `ACTIVE_PRESET_NAMES` to the ten retained presets.
2. Move `Compact_Counter_def3` out of every active registry map (controls, label, formation, meta, traits, scheme state, display meta, ladders, audit tiers) into a module-local unchanged historical definition, and add it to the removed/retired identity so `BASE_PRESETS`/`BASE_LABELS` and the dropdown exclude it.
3. In the direction policy, remove the `pressure_counter` situation, drop the Compact Counter veto/evidence guard, and route the under-pressure classification branch through conservative `pressure_escape` (both confirmed-outlet and blocked-outlet cases); the higher-priority preserved roles (`final_all_in`, `emergency_lock`, `press_cooldown`, `protect_lead`) keep their existing precedence over the pressure branch, per issue #303 point 5.
4. Keep `autoApply: false` and the Production Advisor manual-only; keep the v7 compatibility install marker for the downstream passive layers while adding the v8 marker.
5. Update node selector-scenario regression coverage and the exact-userscript dropdown expectation for the 10-active set.
6. Verify exact-head `SLF CI / ci`, exact branch scope, and automatic userscript release provenance.

### Risk controls

- No slider/control/formation value is edited for any retained active preset; a hardcoded base snapshot in the node regression fails if any value drifts.
- Compact Counter's original controls are retained byte-for-byte in module-local source and asserted unchanged by source-text regression.
- `Compact_Counter_def3` can never be recommended because it is absent from the direction policy's active set; `hardVeto` rejects it explicitly.
- Tactical Lab P03 population/assignment identity is not touched; only the manual dropdown expectation changes in the browser test.
- The `browser-e2e` dropdown assertion is re-derived from `ui-layer.js` + `preset-storage.js`, not guessed.

## Follow-up plan: entry-context recovery and availability counters (2026-11-03)

1. In the Tactical Lab exporter, recover the entry context when the activation lifecycle snapshot is missing by selecting the first dict-valued observation in a fixed order (activation event `context` → activation state `entryContext` → completed state `entryContext` → exit event `extra.entryContext`); an existing empty dict keeps precedence, contexts are never field-merged, and nothing is inferred from the exit score or exit minute.
2. Add count-only per-field availability counters (`entryContextFieldAvailability`) and advisor absence reasons (`noRuleDecisionRecorded` vs `recommendationPresetMissing`) as additive summary keys, reusing the `completeness()` missing-value rule and the existing `knownPreviousTactic` semantics for `previousPreset`.
3. Guard the client `scoreContext` in `tactical-lab-v1.js`: attribute home/away only with a two-entry `teams` array and a present `myTeam` (previously a missing/short array silently assumed `away`), and require finite numeric `home`/`away` before comparison (previously `Number('')`/`Number(null)` coerced to 0 and could fabricate a draw); valid inputs are unchanged.
4. Keep strict `entryCompleteness` semantics and all existing report keys unchanged.

### Verification

- `python3 vps/exporter-rag/test_slf_tactical_lab_v1.py` — passes; covers recovery from completed state (a), empty-dict precedence without field merging (a2), recovery from exit-event extras (b), unrecoverable rows with per-field missing counts (c), per-field counters and advisor absence reasons (d), unchanged strict `entryCompleteness` (e), and privacy flags plus count-only counters (f).
- `node tools/test-tactical-situation-diversity.mjs` — passes (loads `tactical-lab-v1.js` source).
- `node --check src/modules/tactics-presets/tactical-lab-v1.js` — passes.
- Browser exact-userscript suite via canonical `SLF CI / ci`.

### Risk controls

- Recovery is selection of an already-recorded context, not synthesis: no context is invented and no field is merged from different observations.
- New summary keys are additive; existing keys and the strict `entryCompleteness` semantics are unchanged.
- The client guard changes only the unknown-input path; valid inputs produce identical output.
