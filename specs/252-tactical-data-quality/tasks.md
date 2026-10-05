# Tasks: Tactical data-quality linkage

Issue: #252

- [x] Harden score parsing without synthetic zeros.
- [x] Add exact production preset attribution.
- [x] Add Tactical Lab high-resolution exposure output.
- [x] Add Tactical Lab linked-vs-resolved result diagnostics.
- [x] Add match-outcome invalid-result reason diagnostics.
- [x] Update bundle dependency declaration.
- [x] Add/extend runtime, exporter, and browser regressions.
- [x] Update Tactical Lab audit documentation.
- [x] Verify approved changed-file scope.
- [x] Open bounded PR.
- [ ] Require exact-head `SLF CI / ci = SUCCESS`.
- [ ] Merge and verify automatic userscript release.
- [ ] Leave VPS exporter deployment unperformed pending separate operational approval.

## Definition of Done

Repository source is merged to `main`, exact-head canonical CI is green, required userscript release is verified on `release`, P03/production tactic behavior is unchanged, and no VPS operational deployment has been performed.

## Follow-up: finished-result score recovery

- [x] Audit current RAG evidence and confirm v2+ remains NOT READY.
- [x] Confirm active missing-score defect affects fresh 4.4.328/4.4.329 result rows.
- [x] Preserve legacy score-board parsing.
- [x] Add fail-closed FM2026 `.fm-score` compatibility inside the match surface.
- [x] Update finished-match fixture to FM2026 score markup.
- [x] Add ambiguity rejection regression.
- [x] Require finished result payload score and score-bearing result key.
- [x] Keep P03, production tactics, API/VPS/storage and historical data unchanged.
- [ ] Verify exact branch diff remains inside approved scope.
- [ ] Open bounded PR.
- [ ] Require exact-head `SLF CI / ci = SUCCESS`.
- [ ] Merge exact green head to `main`.
- [ ] Verify automatic release 4.4.330 on `release`.
- [ ] Browser/Tampermonkey acceptance: new finished result carries a valid final score.

### Follow-up Definition of Done

The parser compatibility change is merged to protected `main`, exact-head canonical CI is green, 4.4.330 is verified on `release`, and no generated source artifact or production data was edited manually. Tactical Lab v2+ remains deferred until post-release evidence demonstrates non-zero finished-outcome resolution.
