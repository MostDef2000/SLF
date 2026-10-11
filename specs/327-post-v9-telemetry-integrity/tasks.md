# #327 — acceptance tasks and evidence

## PR A — exporter
- [x] Source diagnosis: `slf_preset_evidence_561.main` overwrites two summary files after initial manifest.
- [x] Implement final-stage digest refresh + independent verification before any Drive sync (#328).
- [x] Add regression tests for two-producer overwrite, changed-byte corruption, missing entries and unsafe paths (#328).
- [x] Exact-head SLF CI SUCCESS and merge (#328, main 583d08d); VPS deployment still separate.

## PR B — applied tactics
- [x] Canonical 15-field vector and fingerprint in initial/periodic/finished snapshots; custom marked unknown (PR B).
- [x] Capture manual/preset changes and label `ui_readback_confirmed` vs `applied_unverified` without inventing native game acknowledgment; LAB remains separate (PR #329).
- [x] Same-minute UI-observed A→B→A creates unique sequential events and phase/revision snapshot keys (PR B).
- [x] Preserve previous/current controls and statistical context at phase boundaries; unverified game application is excluded from ranking (#329).
- [x] Finished result carries tactical application summary and last-closed-phase linkage; existing outbox/foreign-match fixtures remain green (#329).
- [x] Exact-head CI SUCCESS on #329; generated release 4.4.336 verified on `release` for source 5f85e45. Browser CI green; live manual browser acceptance remains operational.

## PR C — historical cleanup/quality
- [x] Add strict read-only live dry-run and SHA/count guarded physical-delete tool; **current production count still requires operator preview** (PR C).
- [ ] User-requested irreversible deletion of invalid-result rows only, separately verified in production.
- [ ] Valid scored records, snapshots, events and effects unchanged; audit aggregate counts without misleading improved coverage claims.
- [x] Add version/schema/scored/game-confirmed-only v9 retune gate and regression tests; exact-head CI and source merge are separate checks (PR C).

## Definition of done

All in-scope fixes pass canonical CI and source is merged to protected main. Required userscript release is verified separately on generated release branch. VPS exporter and live-data cleanup remain pending until independently verified in target environment; no source PR claims operational completion without evidence.
