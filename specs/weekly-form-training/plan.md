# Plan — Weekly background form training

## Contour

Userscript only (`src/**`). No VPS change, no release artifact change in this task, no live slf.fm mutation from the implementation worker.

## Architecture

One bundle-local closure `SLFWeeklyFormTraining` with a single production entry `start()`. Parsers, ranking, request adapter, state store and coordinator are private. No page-global callable save function and no debug export.

`start()` is called once from `App.start()` in `src/app/bootstrap.js`, outside and before the `PresetStorage.loadFromServerAndMerge` callback. It installs activity listeners and schedules the coordinator, then returns immediately. It is never called from `mountUI()` (the body observer would re-run it).

### Writer election

- Top-level `https://slf.fm` only; `www` and mirrors never elect a writer.
- Admission after DOM readiness: authenticated owner (`foot_login_id === 6945`) and new-dark identification (`data-slf-design="fm2026"`, dark-theme class, or a new-design anchor).
- `navigator.locks.request('slf:weekly-form-training:v1', {mode:'exclusive', ifAvailable:true}, callback)`. If the lock is unavailable, do nothing. No localStorage lease fallback.
- All admission conditions are re-read inside the callback. The lock is held through reads, POST, verification, restoration and checkpoint.

### State and cadence

`localStorage` key `slf_weekly_form_training_v1:<userId>`, validated against `foot_login_id`.

Envelope:

```json
{
  "v": 1,
  "userId": "6945",
  "startedAt": 0,
  "lastCompletedAt": 0,
  "retryAfter": 0,
  "restorePending": false,
  "phase": "idle",
  "homeTeamId": "",
  "clubs": {
    "<id>": {
      "status": "verified|ineligible|blocked|posting|uncertain",
      "intendedPids": [],
      "priorExpiry": "",
      "observedExpiry": "",
      "reason": "",
      "attemptAt": 0
    }
  }
}
```

All timestamps are UTC epoch milliseconds. Every critical checkpoint is persisted and read back before the next mutation.

- First valid missing record is due.
- Malformed or future-inconsistent state is not due.
- `lastCompletedAt` advances only when every discovered club is terminal (`verified` / `ineligible`) and the home team is restored and verified.
- Next cycle is at least 7 elapsed days after completion; one catch-up sweep, not one per missed week.
- `retryAfter` implements the bounded 15-minute transient retry; uncertain clubs are re-inspected read-only and are not POSTed again in the same cycle.

### Activity and idle guard

Every participating SLF tab records trusted `pointerdown`, `keydown`, `wheel`, `input`, `submit`, `focusin` and page-show activity to the shared GM timestamp `slf_weekly_form_activity_v1`, with same-origin `storage` and `BroadcastChannel` signals. The coordinator requires 120 s of quiet, no focused/active edit, and the between-matches guard. Guards are re-read before each switch and immediately before save. Activity never blocks native input and never pretends a dispatched mutation was undone.

### Sweep

1. Fetch a fresh `team4.php?action=lineup` document; verify identity, active team and switcher; read the match-day globals from that response.
2. Persist `restorePending:true` with the captured home team before the first `goto`.
3. For each discovered club, serially: `goto` → validate JSON → fresh lineup read → identity + active-team evidence → match-day guard → XI → eligibility (`train.php?action=team`, then the form page) → form values → ТТД → rank → re-fetch form and re-check all guards → persist `posting` with intended PIDs and prior expiry → one POST → fresh verification → next club.
4. In `finally`, switch to the captured home team and verify it from a fresh authenticated lineup response before clearing `restorePending`.
5. Close as `complete` or `partial`; a partial cycle never claims that all eligible clubs were saved.

### Request adapter

All requests are same-origin `fetch` with `credentials:'include'` and `cache:'no-store'`; GETs carry a cache-buster. The server clock is the `Date` header of a fresh response. The team switch is `GET /ajax/userset.php?action=goto&idteam=<ID>`; its JSON is validated and the active team is proven independently from a fetched document.

### ТТД request replay

`GET team4.php?action=playerstats` (read-only) → `GET ...&gamelist` (read-only; fallback `&gamelist=1`, then the playerstats HTML) → `POST ...&team_id=&season=0&gamestat` with `gamechoice[]=<gid>` repeated. Parse `json.stat`; require each row length 68; PID = index 0, ТТД = index 63; reject blank/null/non-integer/negative ТТД for the top five. Rows outside the top five cannot affect the result.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Two tabs run at once | `navigator.locks` exclusive lock with `ifAvailable:true`; no lease fallback |
| Tab closes mid-sweep | `restorePending` persisted before the first switch; next lock holder restores home before due checks |
| Home team changes between sessions | Home is captured at cycle start; no team ID is hardcoded |
| Owner is using the site | 120 s idle guard plus same-origin cross-tab activity signals |
| A match is live or about to start | `fm_md_today` / `fm_md_next` guard re-read after each switch and before save |
| Unknown page schema after a site redesign | Fail closed: blocked/abort, never a guessed save |
| Response lost after POST | Record `uncertain`, restore home first, no repeat POST that cycle |
| Expiry extension unprovable for an unchanged trio | Record `extensionProven:false` and an honest reason |
| Storage unavailable or read-back mismatch | Abort before the next training mutation |

## Test design (separate test worker)

- **Parsers (unit):** switcher, active team, XI, eligibility, form `ПОСЛЕ`, locale decimals, expiry, match-day literals, gamestat rows, ranking ties and edge cases.
- **Coordinator (unit with fake fetch/locks/timers/storage):** lock unavailability, admission re-read, due/malformed/future state, restore recovery before due, dynamic home, abort on ambiguity, idle guard, match guard, blocked/ineligible/uncertain transitions, no repeat POST, complete vs partial.
- **Integration (browser, separate worker):** new dark design only; no live mutation in the implementation task.

## Correct-course impact

No change to existing tactics, presets, transfer, telemetry or release flows. The notice module keeps its public shape; only an internal parser is factored out and exposed on its existing API object for tests.
