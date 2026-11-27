# Tasks — Canon situation hints, coach presets and league-relative starts (#477)

Base: `78bda2bf54eb59157f78c7bdfa4632cab9cb1323`.

## Work and acceptance traceability

| Task | Work and evidence | Spec |
|---|---|---|
| [ ] T1 | Capture independent expectations for the 12 verbatim rows, eight legend lines, numeric examples and observations. Demonstrate a failing-before final-selection case on the base. | R1, R6, R7 |
| [ ] T2 | Establish the versioned manual catalog and explicit row 4/6 variants. Keep distinct IDs for equal vectors. Document data-backed additions with their own provenance and entry conditions. | R1–R4 |
| [ ] T3 | Complete the 13-ID coach crosswalk and reverse row/variant coverage. Rebuild inventory and runtime entries together. Record changed attack controls, retained non-manual controls, eligibility, aliases and any manual-only associations. | R1, R4, R5 |
| [ ] T4 | Validate the executor’s league summary. Document the common own-league classification rule, thresholds, comparison population, ties and evidence gaps. Produce seven dated club records mapped to favourite → row 2, middle → row 1, underdog → row 3. | R1, R3, R5, R9 |
| [ ] T5 | Verify Эйрбас owner-rank independence, missing/wrong-season and conflicting league inputs, classification boundaries and replacement of the starting baseline by specific live evidence. Do not apply a tactic on slf.fm. | R2, R3, R9 |
| [ ] T6 | Resolve matched, ambiguous, missing-input and no-match cases at the existing decision seam. Test all R1 examples, collisions in both candidate orders, additions alone and additions competing with manual cases. | R1–R4, R9 |
| [ ] T7 | Carry the selected ID, variant and all six settings through final selection. Exercise competing preset, etalon and scenario delta. Compare the actual actionable result with independent literal expectations. | R1, R2, R5, R6 |
| [ ] T8 | Render the same decision in the dark new-design hint: full verbatim row, eight-line legend, chosen variant, evidence or uncertainty, and separate commentary. Test keyboard access and no auto-apply on render/refresh. | R2–R4, R7, NFRs |
| [ ] T9 | Feed the shared 12-row/eight-line reference and deterministic decision to `llm-second-opinion.js` and `vps/api/advisor.py` separately from `developerHints`. Verify matched citation, equal-vector identity, honest no-match advice and full coach-hint coexistence. | R1–R3, R6–R8 |
| [ ] T10 | Preserve valid 1–3-control `adjust` replies and exact, eligible canon-mapped `switch` replies. Exercise the real explicit fixture acceptance handler. Reject mixed contradictory, invalid, stale and wrong-variant actions without losing deterministic advice. | R5–R8 |
| [ ] T11 | Run old/new client/API, unavailable-advisor, untrusted-text, privacy and performance checks. Record the exact targeted test commands, case counts and results alongside canonical bundle/build, tactical regression and browser results. | R1–R9, NFRs |
| [ ] T12 | Record correct-course outcome, review findings, exact-head CI, automatic release outcome and published userscript verification. Report API source verification separately; do not claim VPS rollout or live game mutation. | R1–R9, release gate |

## Definition of Done

- [ ] All 12 manual situations select the independently expected **final** six settings. Both row 4 flanks and all three row 6 strengths have passing evidence.
- [ ] Equal vectors do not collapse different situations. A specific observed situation wins over a generic baseline; unresolved collisions and missing inputs produce an explanation, not a fabricated tactic.
- [ ] All 13 coach presets are accounted for in inventory and runtime. Every manual row/variant has an exact recommendation. All offered switches are eligible and realize the designated variant; fixed lineup, aliases, retired exclusions and manual-only restrictions remain intact.
- [ ] SLF additions have positive evidence, separate attribution and tested behavior with and without a competing manual decision.
- [ ] All seven clubs have reproducible, dated own-league classifications and starting mappings for full acceptance. Missing evidence is reported as incomplete, never counted as a successful classification. Эйрбас is not classified by its position among the owner’s seven clubs.
- [ ] The hint shows the verbatim manual row and eight legend lines, selected concrete settings, and readable source and uncertainty labels. The manager can operate it by keyboard on the new-design dark page.
- [ ] The LLM receives the authoritative reference separately from coach hints, explains the actual matched situation, and does not invent a match. Invalid or absent second opinions never replace deterministic advice.
- [ ] Valid 1–3-control adjustments remain available. A manager-accepted two-control adjustment changes exactly those controls in the fixture. Contradictory adjustments and wrong-variant switches are not actionable. Rendering or receiving advice alone changes nothing.
- [ ] Required local and targeted checks pass; NFR concerns have recorded dispositions. No test relies on a live tactic write or substitutes old-design coverage for new-design acceptance.
- [ ] Generated outputs are **never hand-edited**. Merge, userscript publication, runtime acceptance and API source verification have distinct evidence. No VPS deployment, live site preset edit, player-role change or game-state mutation is claimed.
