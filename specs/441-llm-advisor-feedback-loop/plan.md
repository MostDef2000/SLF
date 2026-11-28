# Plan — LLM advisor Ф2 (#441)

## Risk profile

- Medium: userscript wiring changes (button flows, STATE), new server response field + small endpoint, contract evolution. The apply path is existing and battle-tested (`tactic-control-bridge` with rollback) — reused, not rebuilt.
- Guardrail evolution: Ф1 "advisory-only, never apply" → Ф2 "apply only by explicit click, never auto, always logged". The never-auto invariant is absolute.

## Phasing

- Ф2a first (owner's immediate pain: button refuses without a manual hint click). Ф2b, Ф2c follow as separate PRs on the same issue.
- Each phase: fresh branch from `main` → bounded PR → green CI → exact-green-head merge → release/deploy per policy → live probe.

## Ф2a design (from issue #441 + code reconnaissance)

- `llm-second-opinion.js`: add a self-sufficient request entry — build the payload from an internally computed `ruleDecision` (the same ladder the manual hint runs) instead of `STATE.lastRecommendationSnapshot`.
- UI wiring: LLM button → new entry; hide the «↻ Подсказка» block; render «Применить» on the answer → `applyPresetAsync(preset)`; report the apply event with `adviceId`.
- Server: advisor response gains `adviceId` (log record id); a small token-gated endpoint records apply events (extends the advisor log).

## Risk-based test design

- Payload built without a snapshot (fresh match) → node test.
- Apply button: click → apply called with the suggested preset; no auto-apply path exists → node test.
- Apply failure → honest error surfaced, no partial state → node test (bridge rollback contract).
- Server: `adviceId` present in the response; apply event updates the log record → pytest.
- Regression: existing Ф1 suites stay green.

## Correct-course check

- If the internal ladder invocation proves tangled (hidden coupling to the manual flow), stop and re-scope Ф2a with the owner before forcing it.

## Pre-LLM forced match-data refresh (#483) — design and risk notes

**Problem.** The Ф2a/chat entries built the payload from `SnapshotEngine.build()` reading the DOM at click time. The live DOM lags the server (minute, score, signal and stats are filled asynchronously), so an answer could describe an older match state. #483 fetches fresh match data before every advisor request instead of trusting the visible DOM.

**Refresh seam.**
- `MatchStatsParser.fetchDesktopObservation({ gameId, timeoutMs, fetchImpl })` issues one same-origin `GET /ajax/game4.php?action=get_stat_desktop&game_id=<id>&...` with the native param shape (including `goal_count=NaN` and a per-call cache-bust), `cache: 'no-store'`, `credentials: 'same-origin'`, `redirect: 'error'`, `Accept: application/json`. One `AbortController` timer of 5 s wraps BOTH the request and the body read; expiry rejects the raced promise and aborts the fetch.
- `MatchStatsParser.normalizeDesktopObservation(payload, expectedGameId)` validates strictly and returns a private normalized record: the live entry is selected by exact game id, team ids must be distinct positive integers, goals come from `t[teamId].goals` (never the stale top-level `score`), stats are decoded field-by-field, and status is classified (`finished`, `not_started`, `paused`; halftime accepted). xT is accepted only for a confirmed `{home,away}` numeric shape, otherwise `null`; `shotsTable` keeps its existing empty shape; unsupported counters stay `null` rather than guessed.
- `SnapshotEngine.build(fresh = null)` takes the normalized observation. With `fresh`, every match-derived field (gameId, status, minuteInfo, score, xT, teams, per-team stats, shotsTable, eventsText) comes from it; DOM-only fields (team display names/aliases, power2/power, developer hints, lineup rows/formation, current tactic) are still read from the page. Power is merged back per team from the DOM. No argument → the original DOM path is unchanged (regression-safe).
- `SnapshotEngine.fetchFreshObservation()` captures the current URL game id synchronously (never a cached snapshot preference) and re-validates identity before returning. `manual-match-runtime.js` forwards `...args` so the phase wrapper preserves the fresh observation.

**Fail-closed validation and the shared guard.**
- All failures are classified (`slfMatchRefreshError.kind`): `not_started`, `finished`, `paused`, `timeout`, `network`, `http_status`, `non_json`, `invalid_observation`, `identity_mismatch`, `stale_tactic`. The UI maps each kind to an honest message; only retryable kinds offer «Повторить».
- Button, chat send and chat retry share ONE guarded transaction (`requestLlmSecondOpinionFresh`) with a single busy guard (`llmRefreshBusy` / `llmChatBusy`) acquired before any await and released in `finally`. It makes at most one advisor POST, never renders a cached or partial answer on a refresh failure, and records the user's chat turn exactly once before the refresh (retry reuses it, so a failure adds no duplicate turn).
- Identity is rechecked before the snapshot build, after the lab checkpoint await and after the rules; a current-tactic or foreign-target signature drift across the checkpoint raises `stale_tactic` and sends nothing. The 5 s preflight is separate from and does not change the 35 s advisor deadline.
- No reload, no DOM replacement, no auto-apply: the refresh only reads JSON and rebuilds the in-memory snapshot.

**Risks.**
- Coupling to a private page AJAX endpoint: same-origin only, session credentials only, redirects blocked. Shape drift surfaces as `invalid_observation` and fails closed — never a silent fallback to stale DOM.
- Added latency: up to 5 s sequentially before the unchanged 35 s advisor request; on failure the user pays the preflight time but no advisor request is sent.
- Double request per click (one JSON GET + one advisor POST) is deliberate; the GET is cache-busted and `no-store`.
- Test seam `window.SLFStrategyTaskAInternals` exposes the entry points to the VM/browser harness only; callers still go through the DOM controls, so it adds no production behavior.

**Test plan.**
- VM: `node tests/test-llm-match-refresh.mjs` — 14/14 green (observed 2026-11-28). Covers shared clock semantics, strict normalization and every rejection class, fetch failure classification plus the body-read deadline and same-origin init, `build(fresh)` vs DOM-only fields and the unchanged no-arg path, the runtime wrapper's argument forwarding, and 7 UI preflight cases (fresh payload, failure with zero POST + retry, non-retryable inactive states, game change, control drift, foreign-target drift). `tools/test-llm-second-opinion.mjs` was updated for the refresh seam.
- Browser e2e: written for the real artifact (stale DOM/fresh POST, refresh failure/retry, game change, inactive states, no-reload invariant), but execution is precondition-blocked — the harness runs `releases/latest.user.js`, which still reflects `1ff8489` (#477) until the #483 bundle is rebuilt and published.
- Pending: `py_compile` of the touched browser test, full CI on the exact head, release publish (`src/**`), lane-A deploy and live probe.
