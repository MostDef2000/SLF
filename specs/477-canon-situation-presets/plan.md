# Plan — One resolved situation from match evidence to visible advice (#477)

Base: `78bda2bf54eb59157f78c7bdfa4632cab9cb1323`.

## 1. Recommended design

**1. Separate the source text from its numeric realization.** Use one versioned catalog containing 12 stable situation IDs, verbatim cells, eight legend lines, and the exact allowed recommendation variants. Use the transcription for text and the selected numeric table for settings (`shared/slf-developer-tactics-analysis.md:8–33`; `shared/slf-manual-vs-teams.md:11–26`). Never key identity by vector: rows 2 and 7 coincide, as do row 6 for the stronger XI and row 12. Keep data-backed SLF additions in a separate namespace with provenance, evidence requirements and eligible coach roles.

**2. Rebuild the inventory and runtime presets as one contract.** Produce a crosswalk in both directions. For every active coach ID record its role, manual row/variant or evidenced addition, changed attack controls, retained non-manual controls and eligibility. For every manual row/variant identify its exact realization and any eligible coach switch. Multiple roles may support one row; one coach name alone is not an exact variant. If no eligible preset realizes a variant, recommend the exact manual settings without claiming a mapped switch exists.

Cover all 13 roles from `data/tactics/active-preset-inventory-v3.json:79–91`: `default_start`, `pressure_counter`, `pressure_escape`, `possession_control`, `press_cooldown`, `controlled_chase`, `positional_siege`, `width_attack`, `late_high_pressure`, `protect_lead`, `emergency_lock`, `protect_lead_with_outlet`, `lead_press_hold`. Start the comparison with Emery/default start → row 1; press escape → row 6 when pressure on the exit is established; controlled chase → row 4 when the attacking side is known; positional siege → row 8 when a deep block is evidenced. These are role comparisons, not automatic authorization to switch. Press fatigue is an SLF addition, not a synonym for chaos. Arteta can be compared with row 11 without making Arteta automatically eligible.

Preserve persisted aliases, retired exclusions, UI-only `standard`, fixed 4‑2‑3‑1, and manual-only conditions (`src/modules/tactics-presets/active-preset-registry.js:15–43,55–60`). The captured comparison found only row 1 exactly matched an existing captured preset on the specified fields (`shared/slf-canon-hints-integration.md:68–70`). Do not copy the seven-club example’s unrelated defensive settings into every coach preset.

**3. Establish league baselines separately from live evidence.** Use `/tmp/opencode/slf-league-standings/summary.json`, being collected by the executor, as an intake artifact, not a shipped path or a dependency on the user’s machine. Validate club identity, league, season, date, comparison population, standings and available strength measure. Before assigning labels, document the classification rule: metric, thresholds, treatment of ties, and what makes conflicting or incomplete evidence insufficient. Apply that same rule within each club’s own division; do not infer labels from owner-internal rank or a single result.

Produce seven auditable records: `club → dated own-league evidence → class → starting row → exact mapped settings`. Favourite/middle/underdog feed the same rebuilt row 2/1/3 entries, not seven new copies of those vectors. Retain enough provenance in the authorized delivery evidence to reproduce the result after scratch disappears. A missing record leaves that club unresolved. Эйрбас’s low owner-internal rank is not underdog evidence (`shared/slf-manual-vs-teams.md:28–40`). These are advisor starting recommendations only; **do not set tactics on slf.fm**.

**4. Resolve the live decision once from the snapshot.** Reuse the existing signal and recommendation path; do not add a separate classifier in the UI or prompt. Preserve unknown values before normalization. Return a decision distinguishable as `matched`, `ambiguous`, `missing_inputs`, or `no_match`, with source/version, candidate or selected IDs, bounded evidence, missing inputs, and an exact variant/vector only for a resolved tactic. The canon channel supplies the catalog to the matcher and carries its decision into the LLM context.

A specific supported live situation outranks a generic XI comparison or starting baseline. An established manager intent may distinguish competing specific rows. If specific rows remain indistinguishable, report the choice needed; do not break ties by list order. Do not select an SLF addition to conceal an unresolved manual variant. The trigger list is engineering guidance, not screenshot text (`shared/slf-canon-hints-integration.md:45–62`). In particular, missing pressure is not low pressure; a 0:0 score is not evidence of a deep block.

**5. Enforce exactness at final selection.** A matched decision supplies all six manual settings, including explicit priority for `000`, `110` and `011`. Do not feed those fields through the legacy overlay after selection. Preserve the contract for unrelated fields; compute explanatory differences *from* the authoritative result. The existing merge resolves a base, applies overrides and returns the resulting vector and delta (`src/modules/strategy-data-recommendations/final-tactic-merge-layer.js:204–263`). Preserve non-canon behavior where it does not violate the distinction between a manual match, an SLF addition and a hold. Render text, variant, reason and suggested controls from the same decision.

**6. Give the advisor the manual without eliminating `adjust`.** `src/modules/strategy-data-recommendations/llm-second-opinion.js` and `vps/api/advisor.py` are in scope for client context, prompt, validation and actionable-answer handling. Send the same structured reference—12 rows and eight legend lines—plus the selected decision or explicit no-match state. Do not put it into `developerHints`: that field already carries bounded page-sourced coach hints (`llm-second-opinion.js:126–151`; `vps/api/advisor.py:286–290,386,844`). A matched explanation identifies the actual row and its evidence. For no match, ask for distinguishing evidence or explain a separately supported SLF addition without inventing canon.

Retain both existing modes (`vps/api/advisor.py:134–156`; `llm-second-opinion.js:206–230,232–248`):

- **`adjust`:** accept 1–3 distinct, in-range precise changes. For a matched row, each changed manual control must move directly to its selected value. Other eligible controls may be adjusted without altering the manual settings. Validate the whole proposal; do not silently apply the valid half of a contradictory answer. A partial adjustment is allowed but must not be described as having applied the entire row if other differences remain. Keep the existing explicit click action.
- **`switch`:** for a manual match, require an eligible preset mapped to the specific selected row and realizing its exact variant. A catalog ID, row number or matching coach name alone is insufficient. Without a manual match, do not offer a speculative canon switch.
- **At the client boundary:** validate the response against the decision that is current when shown and accepted. A contradictory, malformed, stale or unsupported response cannot change the deterministic result or expose a conflicting action. Old or unavailable API behavior must not break local advice. Prompt wording is not the enforcement mechanism.

## 2. Risk profile and risk-based test design

| Priority | Failure mode | Discriminating check |
|---|---|---|
| High | Correct label but wrong final controls | Drive each R1 example through the actual recommendation boundary with deliberately different initial controls. Assert independent literal expectations for all six settings, not production-catalog values compared with themselves. |
| High | Situation identity lost when vectors coincide | Assert row IDs and evidence as well as settings for 2/7 and stronger-XI 6/12. Reverse candidate order. |
| High | Unknown data or collision selects a plausible but false tactic | Omit XI, flank and press data separately; distinguish absent from observed low pressure. Test unresolved specific intents and the addition-versus-unresolved case. Expect a reason and no selected variant. |
| High | Canon wins locally but loses to merge or a late model reply | Inject conflicting etalon, preset, delta, `adjust`, `switch`, previous-snapshot reply and timeout. Compare final ID, controls, provenance and actionable UI before/after. |
| High | Validation suppresses all precision advice | Exercise valid one-, two- and three-change replies. Explicitly accept the two-change row 8 example through the existing fixture handler. Only the requested controls change; no switch. Reject duplicate, excessive, out-of-range and mixed contradictory proposals. |
| High | Incorrect variant or ineligible coach becomes actionable | Compare all 13 inventory/runtime mappings and metadata; exercise right/left row 4 variants, manual-only Arteta, retired presets, UI-only `standard`, and valid versus wrong-variant switches. |
| High | Club classified against the wrong population | Verify seven club/league identities and reproduce every class from recorded data. Change only other-league clubs: result must not move. Change own-league evidence across a documented boundary: row must change. Exercise ties, conflicts and wrong season. |
| High | Advice causes automatic application | On the dark new-design fixture, observe native controls and tactic submissions during render, refresh and reply arrival. Expect no changes/submissions. Separately verify the explicit adjustment action. |
| Medium | Paraphrased manual or lost coach hints | Compare 12×7 cells and eight legend lines with an independent transcription, including punctuation and spaces. Fill the existing coach-hint budget and verify both channels remain intact. |
| Medium | Split userscript/API rollout breaks clients | Exercise old request/new API, new client/old API, invalid reply and unavailable API. A usable local decision must not require the new server. |
| Medium | Unreadable or unsafe UI | Check keyboard access, visible focus and textual source/uncertainty labels. Render untrusted coach/model text and verify it does not become executable markup. |

## 3. Verification and correct-course check

From `SLF/`, during authorized implementation, run the existing checks:

```sh
node tools/check-bundle-order.mjs
node tools/build-latest-userscript.mjs
python3 tests/browser/test_fm2026_design_adapter.py
node tests/test-tactic-suite-v12-lead-press-hold.mjs
```

The first three commands and build-before-browser order are recorded in `specs/475-train-apply-selected-new-design/plan.md:29–39`. The registry identifies the named tactical regression in `src/modules/tactics-presets/active-preset-registry.js:38–43`. These checks alone do **not** cover #477. Run the targeted matcher, inventory parity, league classification, API context/validation, and new-design advice/acceptance cases added or extended for this issue. Record exact commands, cases exercised and results; the browser test must reach the actual hint and adjustment handler.

**Correct-course gates:**

1. Demonstrate a wrong or substituted final tactic on the supplied base. If the new check already passes there, inspect whether it injected the desired row ID, bypassed the merge, or asserted only the label.
2. If conflicting advice is rejected but no valid `adjust` reaches the explicit acceptance handler, the design fails R8. Fix the boundary; do not replace adjustments with preset-only switching.
3. If a row or variant has no reliable discriminator, report the missing input or ask for a choice. Do not invent a threshold, infer a flank from `cross`, or weaken a coach veto to make coverage green.
4. If a club’s classification cannot be reproduced from dated own-league evidence, record the exact gap. Do not turn missing data into row 1 or owner-internal rank into row 3.
5. Stop for scope review if acceptance appears to require live site writes, player-role changes, old-design enablement or deployment. None is necessary to test the recommendation contract.

## 4. Rejected alternatives and release impact

Renaming Dave `b1…b12` preserves the wrong selection semantics. Nearest-preset matching cannot guarantee exact controls. Prompt-only enforcement cannot constrain an old or conflicting response. Suppressing all model actions would enforce no substitution at the cost of removing the owner’s required `adjust` capability. Ranking the seven clubs against one another answers a different question from league-relative strength.

The eventual `src/**` runtime change and API prompt/context change require release-impact reporting. Expect automatic **userscript** release evaluation after exact-head green `SLF CI / ci` and merge; verify the published artifact separately (`contracts/SLF_AUTOMATIC_RELEASE_POLICY.md:38–55`; `specs/475-train-apply-selected-new-design/plan.md:43–45`). SDD files alone do not establish runtime readiness. API code verification is not a VPS deployment, and userscript publication is not proof that the new prompt is live. No VPS deployment, live game write or routine manual release dispatch is part of #477.
