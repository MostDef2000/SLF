# #327 — Post-v9 tactical telemetry integrity

Status: Approved for bounded implementation on 2026-10-11 (`commit approved`).
Parent: #252. Baseline: `main@58cb4653902706bb204ffcafa355530ef856b69e`.

## Product outcome

Allow reliable review of the match generator's response to **confirmed** tactical changes, without corrupted export metadata or false historical evidence. Full tactical vector includes all 14 radio-controlled axes and ordered-normalized `priority`. Preserve exact applied controls and before/after context through match snapshot, transition, phase, and finished result.

## Accepted scope

1. **Export:** all manifest entries match final bytes after every producer. Missing/corrupt files stop Drive publishing. No runtime input or secret logging.
2. **Telemetry:** record initial/applied/final 15-control vectors, fingerprint, match minute + wall-clock, context, source, version, action sequence; distinguish editable draft from applied confirmation and refuse to assign effects to unconfirmed edits. Idempotent same-minute A→B→A; no double counting after retry/reload; own-match-only.
3. **Historical cleanup:** permanently delete *only invalid-score result rows* from `match_results_v2` after exact current dry-run count and manual production authorization. User rejects archiving invalid rows. Never bulk-delete matching snapshots/events/effects.
4. **Readiness:** physical deletion must not be misinterpreted as better data collection. v8/legacy cohorts remain isolated from v9-current. No readiness/promotion inference from mixed legacy named effects.

## NFRs

- Integrity: published manifest SHA-256 and byte sizes correct for 100% of declared artifacts; failures abort sync.
- Reliability: no confirmed applied transition lost to same-minute identity collisions or retry. No duplicate finished result.
- Safety: no third-party matches, draft changes, secrets, or raw private records leaked into public AI export.
- Availability: source-only change does not restart production; VPS operational cleanup is separately gated.
- Reversibility: source changes revert via PR. User-authorized production removal is irreversible and must fail closed on drift.

## Exclusions

No preset control retuning, recommendation-policy changes, auto-apply, automatic promotion, generated release artifact edits, bulk deletion of unrelated collections, credential changes.

## Acceptance

- Export two-producer overwrite regression, corruption/missing/path-traversal rejects, and final manifest parity tests.
- Browser/manual control fixture: 2 committed changes in one minute, unsaved draft, custom tactic, preset/LAB, retry/reload, finish, score invalid, foreign match.
- Guarded read-only deletion preview with exact eligible IDs/count, live validation and post-run preservation of valid scored matches.
- Exact-head `SLF CI / ci`, automatic userscript release evidence, separately approved VPS deploy, final browser check.
