# Spec — Weekly background form training

Status: Active

## Problem and decision

The owner has seven SLF clubs and must periodically open `team4.php?action=form` and re-pick up to three players for «Тренировки формы игроков». The owner explicitly does not want to visit the Form tab. The approved automation is a **weekly background userscript** that runs on any top-level `https://slf.fm` page, selects players from the starting XI, and saves one trio per eligible club.

Binding owner decisions (2026-11-26):

1. **Engine:** the existing Tampermonkey userscript; weekly; background on any slf.fm page; no Form-tab visit.
2. **Teams:** auto-detect every owned club with a level-2 training base; process all eligible clubs.
3. **Ranking:** from the STARTING XI only → TOP 5 BY FORM → from those five TOP 3 BY ТТД. Never boost weak form. No substitutes, no sixth-form promotion.
4. **Cadence:** once per week.
5. **Safety:** full sweep with a cross-tab lock, an idle guard, and verified restoration in all outcomes.
6. **HOME TEAM IS DYNAMIC:** capture the active team at cycle start and restore to THAT team. No team ID is hardcoded as home. If the active team cannot be determined unambiguously, abort with no writes.

## Scope

- New module `src/modules/team-management/weekly-form-training.js`, one bundle-local closure `SLFWeeklyFormTraining` with one production entry `start()`.
- One guarded call in `src/app/bootstrap.js` inside `App.start()`, before the preset callback; never from `mountUI()`.
- Bundle-order registration: one module entry, count 95 → 96; the module declares the public symbol `SLFWeeklyFormTraining` and its actual host capabilities.
- Notice module refactor: `readChoiceDocument(doc)` returns `{savedUntil, checkedPids}`; `parseSavedChoiceState(html)` keeps `{savedUntil, checkedCount}` and existing rendering/startup.
- No page-global save function, no debug export, no release artifacts, no live mutations in this change.

## Captured contracts (evidence)

| # | Contract |
|---|---|
| C1 | Club switcher: `div.fmc-tabs-host > div.lt3.fmc-tabs > div[data-team="<ID>"][onclick="setgo(this, <ID>, 0, 0)"]`; active tab has `class="b"`. Seven owned IDs were observed; the trailing `div.team-add[onclick="buycell(8)"]` is not a club. |
| C2 | Identity: `foot_login_id` is a page-level `let` global (not `window.foot_login_id`); expected value `6945`. Read via the page window property, a bare `window` property, or the inline-script declaration scan. |
| C3 | Active team: `#globalcontent.game-ui__background` class `user-custom__team-<ID>` with a non-zero ID (`team-0` is neutral), cross-checked against `.fmc-navclub` href `/roster.php?id=<ID>`. `<title>` is unreliable. |
| C4 | Eligibility: `GET /train.php?action=team` → `table.tt-base`; the level-2 column has `is-current` and form-training capacity 3. Second check on the form page: `div.need_base[data-base="1"]` plus usable `coach[]` controls. Unknown schema is blocked, not ineligible. |
| C5 | XI: `GET /team4.php?action=lineup` → `.fcpitch` contains exactly 11 `a[href*="player.php?action=view&id="]`; never `#lineupPlayersList`. |
| C6 | Form: `GET /team4.php?action=form&date=1` → column `ПОСЛЕ` joined by PID; parse finite locale-aware decimals strictly. Capture checked `coach[]` values, the submit label, and `.coach_expire` text/date. |
| C7 | ТТД: `GET /team4.php?action=playerstats` auto-fires a read-only `gamelist` GET, then a `gamestat` POST to `team4.php?action=playerstats&team_id=&season=0&gamestat` with `gamechoice[]=<gid>` repeated. Response `{"stat":[[...68...]],"summary":[...],"show":1}`; PID = index 0, `ttd` = index 63. |
| C8 | Between-matches guard: globals `fm_md_today` / `fm_md_next` (`final`, `online`, `unix`). Safe when (`fm_md_today` null or `final==1`) AND (`fm_md_next` null or (`online!=1` and `unix > now`)). Available only for the active club; re-check after each switch. |
| C9 | Server clock: fresh same-origin response `Date` header (GMT); the main page is `no-store`. Local timers only wake the coordinator; cadence never derives from `data-expire`. |
| C10 | Save: POST to `team4.php?action=form&date=1`, urlencoded `coach[]=<pid>` × exactly 3 + `coach_set=<observed submit value>`. No CSRF, no JS interceptor. Verify by fresh uncached GET: checked set == intended trio AND `.coach_expire` date in the future. There is no unique response marker; an unchanged trio's expiry extension is not provable and is recorded honestly. |
| C11 | Team switch: `GET /ajax/userset.php?action=goto&idteam=<ID>` is a session mutation despite GET. Validate JSON plus independent team evidence on fetched documents. |

## Acceptance

```gherkin
Feature: Weekly background form training

  Rule: R1 — One writer tab holds the cross-tab lock
    Scenario: A second tab cannot run concurrently
      Given a top-level https://slf.fm page with the owner authenticated and the new dark design
      And another tab already holds "slf:weekly-form-training:v1"
      When the coordinator wakes
      Then it does nothing
      And it does not fall back to a localStorage lease

    Scenario: Mirrors and frames are never elected
      Given the page origin is https://www.slf.fm or the page is an iframe
      When the coordinator wakes
      Then no lock is requested and no request is sent

  Rule: R2 — The cycle is weekly and state is fail-closed
    Scenario: A valid missing record is due
      Given no state record exists for the owner
      When the coordinator runs
      Then one sweep starts

    Scenario: Malformed or future-inconsistent state is not due
      Given the state record is malformed or lastCompletedAt/startedAt is in the future
      When the coordinator runs
      Then no sweep starts and no training request is sent

    Scenario: Completion advances the cadence
      Given every discovered club is verified or proven ineligible
      And the home team is restored and independently verified
      When the sweep closes
      Then lastCompletedAt is set from the server clock
      And the next cycle is at least 7 elapsed days later

  Rule: R3 — Home team is dynamic and restoration is crash-safe
    Scenario: The active team is captured, not hardcoded
      Given the active team at cycle start is 18280
      When the sweep runs
      Then the cycle restores to 18280 and never to a hardcoded club

    Scenario: Ambiguous active team aborts with no writes
      Given the active-team class and the nav-club link disagree or one is missing
      When the coordinator runs
      Then the cycle aborts before any switch or save

    Scenario: A crash leaves a recovery marker
      Given restorePending was persisted before the first switch
      When a new lock holder runs
      Then it restores the captured home team first and verifies it independently
      And only then clears restorePending

    Scenario: Another account never restores
      Given the page belongs to a different foot_login_id
      When restorePending is present
      Then no goto is attempted and the marker is kept

  Rule: R4 — Eligibility and ranking follow the approved rule
    Scenario: Only level-2 clubs are processed
      Given a club's form-training capacity is 0 or 2
      When the club is inspected
      Then it is recorded as ineligible and no save is attempted

    Scenario: Ranking is TOP 5 BY FORM, then TOP 3 BY ТТД
      Given an XI of 11 starters with finite form values
      And exactly one non-negative integer ТТД for each of the top five
      When the trio is selected
      Then the five are the five highest form values, ties broken by ascending PID
      And the three are the three highest ТТД among those five, ties broken by form and PID

    Scenario: Missing ТТД outside the five does not affect the result
      Given a starter outside the top five has no ТТД
      When the trio is selected
      Then the result is unchanged

    Scenario: Incomplete data means zero saves for that club
      Given the XI is not exactly 11 unique starters
      Or any top-five ТТД is missing, duplicated or invalid
      Or a winner has no usable coach[] checkbox
      When the club is processed
      Then no POST is sent for that club

  Rule: R5 — Every guard is re-read before switching and before saving
    Scenario: Recent human activity blocks new work
      Given a trusted pointer, key, wheel, input, submit, focus or page-show event occurred less than 120 seconds ago
      When a switch or save is about to start
      Then the new operation does not start
      And an already dispatched request is allowed to settle and is checkpointed honestly

    Scenario: A match is in progress or about to start
      Given fm_md_today is not final, or fm_md_next is online or due
      When the active club is about to be processed
      Then the sweep stops, the home team is restored, and no training POST is sent

  Rule: R6 — Save is verified by state, never by a response marker
    Scenario: A successful save is verified from a fresh form read
      Given the POST was sent with exactly three coach[] values and the observed submit label
      When a fresh uncached form read returns the same three checked PIDs and a future expiry
      Then the club is recorded as verified

    Scenario: An unchanged trio is recorded honestly
      Given the intended trio equals the previously checked trio
      And the observed expiry did not change
      When verification runs
      Then the club may be verified by state
      And the record states that the expiry extension is not provable

    Scenario: A lost response is uncertain and is not repeated
      Given the POST was dispatched and the response or verification was lost
      When the sweep continues
      Then the club is recorded as uncertain, the home team is restored first
      And no repeat POST is sent for that club in that cycle

  Rule: R7 — A cycle closes as complete or partial
    Scenario: Partial is never reported as fully saved
      Given at least one club is blocked or uncertain
      When the sweep closes
      Then the phase is partial and lastCompletedAt does not advance
      And a bounded diagnostic is emitted without HTML, cookies or tokens
```

## NFR assessment

- **Safety:** fail-closed on identity, active-team ambiguity, missing server clock, unknown match-day schema, storage failure, and unknown form/stat schema. No rollback POSTs. No parallel club requests.
- **Privacy:** state is scoped by the owner user id and validated at read time; no secrets, cookies, tokens or page HTML are logged or stored.
- **Performance:** one serial sweep per week; local timers only wake the coordinator. No polling of `data-expire`.
- **Compatibility:** new dark design only; legacy design and light theme are out of scope (owner decision 2026-10-20).
- **Observability:** bounded `console.warn` diagnostics with reason codes only.
