# Tasks — Weekly background form training

## Implementation tasks

| ID | Task | State |
|---|---|---|
| T1 | Add `src/modules/team-management/weekly-form-training.js` with one closure and one `start()` entry | Done |
| T2 | Factor `readChoiceDocument(doc)` out of the notice module; keep `parseSavedChoiceState` shape and rendering | Done |
| T3 | Add one guarded `SLFWeeklyFormTraining.start()` call in `App.start()` before the preset callback | Done |
| T4 | Register the module and its audit entry in `src/app/bundle-order.json`; count 95 → 96; bootstrap requires the public symbol | Done |
| T5 | Write `spec.md`, `plan.md`, `tasks.md` | Done |
| T6 | Focused verification passed: `node tools/check-bundle-order.mjs` (96 modules), `node --check` on the module, diff scope confirmed | Done |
| T7 | VM suite `tests/test-weekly-form-training.mjs`: 51 scenarios, all passing; mutation bite proof — 19 mutations → 14 scenario failures | Done |
| T8 | Browser e2e `run_weekly_form_training_case(browser)` in `tests/browser/test_exact_userscript.py` with 8 new fixtures; proven RED against the stale artifact, GREEN expected once the orchestrator rebuilds `releases/latest.user.js` | Done — GREEN pending artifact rebuild |

## Acceptance traceability

`VM` = `tests/test-weekly-form-training.mjs`; `browser` = `run_weekly_form_training_case` on the rebuilt exact artifact.

| Scenario | Implementation anchor | Test |
|---|---|---|
| R1 second tab does nothing | `runOnce()` → `navigator.locks` `ifAvailable` | VM+browser |
| R1 mirrors/frames never elect | `start()` / `runOnce()` origin and top-level checks | VM |
| R2 missing record due | `readState()` → `defaultState()` → `isDue()` | VM |
| R2 malformed/future not due | `isValidState()` / `isDue()` | VM |
| R2 completion advances cadence | `runSweep()` finalizer | VM |
| R3 dynamic home | `discover()` → `state.homeTeamId` | VM+browser |
| R3 ambiguous home aborts | `readActiveTeam()` + `discover()` | VM |
| R3 crash recovery first | `coordinatedRun()` → `attemptRestore()` before due | VM |
| R3 other account never restores | `attemptRestore()` identity check | VM+browser |
| R4 only level-2 clubs | `parseEligibility()` | VM+browser |
| R4 TOP 5 by form, TOP 3 by ТТД | `rankCandidates()` | VM |
| R4 missing ТТД outside five | `rankCandidates()` only checks the five | VM |
| R4 zero saves on bad data | `processClub()` blocked returns before POST | VM+browser |
| R5 activity guard | `activityGuard()` re-read before switch/save | VM |
| R5 match guard | `matchGuard()` after each switch and before save | VM |
| R6 state verification | fresh form read after POST | VM+browser |
| R6 unchanged trio honest record | `extensionProven` | VM |
| R6 uncertain no repeat | `uncertain`/`posting` → `inspectClub()` only | VM |
| R7 complete vs partial | `runSweep()` finalizer | VM+browser |

## Definition of Done

- `cd SLF && node tools/check-bundle-order.mjs` passes with 96 modules.
- The new module passes `node --check`.
- Only the allowed paths changed.
- `node tests/test-weekly-form-training.mjs` reports 51/51 scenarios passing; the mutation bite proof (19 mutations → 14 scenario failures) is on record.
- The browser suite passes `run_weekly_form_training_case` against the exact rebuilt `releases/latest.user.js`.
- Canonical CI is green on the exact PR head; merge happens under the owner's `commit approved` receipt; automatic release evaluation and verification follow `SLF_AUTOMATIC_RELEASE_POLICY.md` (pending).
- No team ID is hardcoded as home.
- No live mutation during implementation.
