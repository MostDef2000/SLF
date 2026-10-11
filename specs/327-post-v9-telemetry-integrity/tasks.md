# #327 — acceptance tasks and evidence

## PR A — exporter
- [x] Source diagnosis: `slf_preset_evidence_561.main` overwrites two summary files after initial manifest.
- [x] Implement final-stage digest refresh + independent verification before any Drive sync (#328).
- [x] Add regression tests for two-producer overwrite, changed-byte corruption, missing entries and unsafe paths (#328).
- [x] Exact-head SLF CI SUCCESS and merge (#328, main 583d08d); VPS deployment still separate.

## PR B — applied tactics
- [x] Canonical 15-field vector and fingerprint in initial/periodic/finished snapshots; custom marked unknown (PR B).
- [ ] Detect manual/preset/LAB changes; classify `draft_changed/apply_attempted/applied_confirmed/applied_unverified/apply_failed`.
- [x] Same-minute UI-observed A→B→A creates unique sequential events and phase/revision snapshot keys (PR B).
- [ ] Close/open phases only when confirmed; retain previous/applied/next controls and statistical context.
- [ ] Correlation to final scored result; negative/reload/outbox/foreign-match fixtures.
- [ ] Exact-head CI, release verification and browser acceptance.

## PR C — historical cleanup/quality
- [ ] Safe dry-run of invalid-score result records and precise current count; no July cutoff bulk purge.
- [ ] User-requested irreversible deletion of invalid-result rows only, separately verified in production.
- [ ] Valid scored records, snapshots, events and effects unchanged; audit aggregate counts without misleading improved coverage claims.
- [ ] V8/v9-current cohort isolation, no false `readyForRetune`; exact-head CI and report.

## Definition of done

All in-scope fixes pass canonical CI and source is merged to protected main. Required userscript release is verified separately on generated release branch. VPS exporter and live-data cleanup remain pending until independently verified in target environment; no source PR claims operational completion without evidence.
