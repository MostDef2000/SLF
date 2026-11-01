# SLF #342 — Game-server acceptance proof for tactical changes

Issue: https://github.com/MostDef2000/SLF/issues/342
Status: phases 1–5 complete (2026-11-01; live matrix verdicts in §5.1, handoff in §8).
Risk profile: docs-only. No product code, no VPS, no release in this artifact set.

## 1. Problem restated

Tactical telemetry records tactic applications as `ui_readback_confirmed` (DOM radio/checkbox state
re-read after the click sequence). `game_confirmed` requires an externally proven server acceptance
signal. The current readback chain:

- `getCurrentTactic()` (`src/modules/tactics-presets/tactic-control-engine.js`) reads
  `input[type=radio]:checked` / `checkbox:checked` from the editor DOM.
- The same readback is written into match snapshots (`currentTactic` in
  `src/modules/manual-match-telemetry/snapshot-engine.js`).
- Ranking stays fail-closed (`eligibleForRanking=false`, `application_unverified`).

Drive export 2026-10-14 (verified sha256, manifest `slf_ai_manifest_v1`) quantifies the provenance
gap: 666 preset events (70% `unknown` preset attribution), 2229 match snapshots over 218 games carry
UI-readback state only, generator version coverage 2.8%, phase closure 87.4% (52 unclosed starts).

## 2. Phase-1 finding: a server-authored persistence read exists

Raw HTML of the between-match tactic page (`GET /team4.php?action=tactic`, authenticated, **without
executing page JS**) contains the persisted tactic state as server-rendered `checked` attributes on
14 hidden radio groups:

```
name="def_line" value="2" ... checked
name="style"    value="3" ... checked
... (14 groups total: def_line, press_line, def_width, press_intense,
     build_type, build_temp, build_long, build_fast, style,
     pass_risk, dribble, cross, corner, shot)
```

Observed 2026-10-14 live (read-only GET, no mutation): 29 `checked` occurrences total; browser DOM
readback and raw-HTML state agreed (`def_line=2`, `style=3`, all others at defaults). The page is a
`<form method="post">`; visible controls are a custom UI layered over hidden native inputs, so the
`checked` state in the response body is authored by the game server, not by client script.

**Probe recipe (candidate for `game_confirmed` on the team4 entity):**

1. Apply tactic via the normal control path (UI readback confirmed as today).
2. Refetch `GET /team4.php?action=tactic` raw HTML (`fetch(..., {credentials:'include'})`, no JS
   execution) — a GET is live-safe.
3. Parse the 14 `name=value checked` pairs; compare against the applied 14-field vector.
4. Equal vector ⇒ server persisted the change ⇒ `game_confirmed` for that application, joined by
   timestamp + `applicationSequence` + fingerprint as defined in the event schema.

This satisfies the issue's "fresh server-backed state read" acceptance criterion without intercepting
credentials or unrelated accounts, and without trusting any click, promise, score, or later result.

### 2.1 Phase-2 result: persistence trigger and latency (verified live, 2026-10-14)

One controlled A→B→A cycle on the owner account (between matches, one mutation per step, rollback
verified) established:

- **Trigger**: a radio click autosaves immediately — `POST /ajax/tactic_ajax.php` with body
  `action=ttx&p=<group>&v=<value>&idgame=0&type=0&external_id=0&hash=<64-hex session request
  signature>`. No form submit is required. `hash` is a session-derived request signature (shape
  recorded only; the value is never stored — treat as sensitive).
- **Latency-to-persistence**: an authoritative raw-HTML refetch ~450 ms after the click already
  returned the new value (`def_line=3`), i.e. persistence is effectively synchronous with the
  autosave XHR.
- **Revert integrity**: after the rollback click the authoritative readback returned the baseline
  14-group vector byte-identical (no spurious state, no partial writes observed).
- `idgame=0` confirms this autosave path serves the between-match entity; whether the in-match
  editor reuses it is the phase-3 question.

Consequence: `game_confirmed` is achievable for team4 tactic applications by pairing the UI apply
with the raw-HTML authoritative readback (§2 recipe). The ranking unlock decision itself stays with
a future implementation task (own scope check).

### 2.2 Entity scope: one account, seven teams (mapped 2026-10-14, read-only)

The owner account (MostDef) manages seven teams; each team is an independent tactic entity:

| teamId | team |
|---|---|
| 23698 | Луч |
| 21473 | Каррарезе |
| 18280 | Пршибрам |
| 22962 | Боа |
| 79252 | Честер |
| 19703 | Эйрбас |
| 105995 | Норт Дистрикт |

- The active team is a server-side session variable. Switching = clicking the team badge
  (`setgo(this, idteam, …)`) which issues `GET /ajax/userset.php?action=goto&idteam=<id>`; the
  response echoes the newly active team (name + country flag), confirming server registration.
- `GET /team4.php?action=tactic` always reads the **active team's** persisted 14-group vector.
- Live sweep of all seven teams (switch + raw-HTML read only, no mutations): all seven vectors were
  identical at observation time (defaults with `style=3`, `corner=1`). Per-team entities are
  confirmed structurally by the server echo; vector equality is a current-data observation, not an
  invariant. Team-page raw HTML also embeds the 7-badge switcher strip — name-matching probes must
  read the active-team line, not the strip.
- Session hygiene: the active team was restored to Норт Дистрикт (105995) after the sweep.

Implications for the contract:

- `game_confirmed` join keys MUST include `teamId` (account-level multi-team entities).
- Telemetry/snapshot records must carry the active `teamId` at apply time.
- Probes must never assume the previously active team; confirm via the server echo or the active-team
  topbar line after any switch.

## 3. Evidence status contract (proposal)

| status | meaning | required evidence |
|---|---|---|
| `apply_attempted` | click sequence issued | before/after intent vector, `applicationSequence` |
| `ui_readback_confirmed` | local controls match intent | DOM readback equality (current behaviour) |
| `game_confirmed` | server persisted the application | server-authored state read (raw-HTML `checked` vector) equal to intent, timestamped after apply; join keys: `teamId` + gameId/page-entity + `applicationSequence` + fingerprint |
| `rejected` | server state diverges after apply | authoritative readback differs, retry/rollback observed |
| `unverified` | no authoritative read performed | default state, ranking stays fail-closed |
| `UNOBSERVABLE` | no trustworthy signal exists for an entity | explicit verdict; keeps fail-closed contract (issue criterion 6) |

Boundaries: only the raw-HTML authoritative read promotes to `game_confirmed`. UI readback, local
promises, score changes, and later match results never promote. `game_confirmed` must not be
synthesized from `currentTactic` in match snapshots (that field is UI-readback provenance).

## 4. Open questions (phase 2+)

1. **Persistence trigger**: RESOLVED (2026-10-14, live): a radio click autosaves via
   `POST /ajax/tactic_ajax.php` (`action=ttx&p=<group>&v=<value>`); persistence ~450 ms; see §2.1.
2. **game.php (in-match editor)**: does the match-time tactic editor persist to the same entity the
   team4 page reads back, or is it a separate per-match entity reset after the final whistle? If
   separate, `game_confirmed` needs a per-entity join and the match snapshot's `currentTactic` may
   become corroborating (not authoritative) evidence.
3. **Same-minute A→B→A**: idempotent event IDs and phase attribution under rapid switches
   (existing phase schema has unique keys; verify against reload/retry).
4. **Stale cache / foreign match**: refetch must not read a cached page; foreign matches are out of
   scope (user-owned account only).
5. **Formation / v11 lineup dimension**: `formation` in match snapshots comes from server-rendered
   match pages (`SquadParser.readFormation`) — a candidate server-authored signal for the lineup
   axis; mapping to the 15-field vector is unspecified.

## 5. Negative-case matrix (criterion 4)

| case | method | pass condition |
|---|---|---|
| server rejection | controlled change, authoritative read diverges | `rejected` recorded, ranking untouched |
| delayed response | read immediately vs after N s | no premature `game_confirmed` |
| network failure | offline/unreachable refetch | `unverified`, event id stable for retry |
| unchanged native values | apply a vector identical to server state | no spurious transition event |
| same-minute A→B→A | controlled rapid switches | stable idempotent ids, correct phase attribution |
| reload/retry | apply, reload, re-read | single confirmed application, no duplicates |
| stale cached state | refetch with cache disabled vs warm | authoritative read must bypass cache |
| foreign match | n/a | out of scope, never read |

Live experiments that mutate game state (any controlled change, A→B→A) are owner-gated: explicit
command in chat, timing between matches, one mutation per step, rollback = re-apply previous vector.

### 5.1 Live verdicts — match 35025920 (2026-11-01, УАИ Уркиса — Норт Дистрикт 1:3)

Piggyback observation (zero orchestrator mutations; the owner's normal halftime change was observed
post-final through the authoritative read):

- Post-final panel read (`POST ajax/game4.php?action=tactic`, `game_id`+`team_id`) returned
  `success=1` with `data-now` (final 17-field vector) and `data-changes` — a server-authored
  application log `[{m:45, p, b, a} × 7]` (minute, param, before, after) covering the owner's
  halftime change: `press_line 2→1, build_type 2→3, build_temp 3→2, build_fast 3→2, style 4→3,
  pass_risk 3→2, dribble 3→2`.
- Before-values (`b`) equal the team baseline vector byte-for-byte; after-values (`a`) equal the
  final `data-now` vector. Minute attribution (`m:45`) is server-authored. This is the
  `applicationSequence`/phase-attribution evidence class of criterion 2, observed on the game entity.
- Entity separation re-confirmed on a live match: the match entity (join key `idgame`) carried its
  own vector and change history while the team entity stayed at baseline.

Authoritative-read availability (new finding; contract amendment):

| match phase | panel read result | `tactic_security_hash` on match page |
|---|---|---|
| pre-match, entity not yet created (T-31 min) | `success=-2` | present |
| live, active play (m≈28–85; 10+ attempts, fresh session, exact UI params) | `success=-2` (denied) | present early, gone by m≈85 |
| post-final | `success=1`, full vector + `data-changes` | n/a |

(Contrast: 2026-10-29, cup match 35025904 — the same read succeeded at T-4h pre-match, when the
match tactic entity already existed. Today's T-31m denial is attributed to the entity not existing
yet; the live-play denial held with the entity present and after a fresh re-login.)

Verdict: the raw-HTML authoritative read cannot promote `game_confirmed` during active play —
mid-match promotion via this channel is `UNOBSERVABLE`. `game_confirmed` for in-match applications
becomes **eventually-confirmed**: mid-match corroboration = live-feed `tactic_hash` (per-team,
`get_stat_desktop`) + the write-response echo (`tactic_ajax` returns the full new vector); the
authoritative read promotes at the post-final readback. Ranking stays fail-closed until promotion
(§6 unchanged).

Matrix rows executed live 2026-11-01: piggyback observation (above), stale cached state (post-final
warm vs cache-disabled refetch returned identical vectors, both error-free — authoritative read
bypasses cache). Rows deferred with reason: server rejection, delayed response, reload/retry,
unchanged values — live-gated mutations; the verify channel (authoritative readback) is denied
during active play, and the safety gate forbids mutations that cannot be read back (rollback =
re-apply previous vector requires read verification). Deferred to the next live window with a
revised protocol: probe the panel read-only at halftime (the m=45 owner change proves a mid-match
write path exists; whether the read channel opens during the break is untested).

## 6. Current cohort posture (unchanged)

`eligibleForRanking=false` and the `ui_readback_confirmed` fail-closed contract remain in force.
Nothing in this document enables automatic retune or promotion. v9/v10 historical, v11 current
cohorts remain separate (Drive export confirms cohort policy
`v4_tactical_phase_primary_per_game_else_legacy`).

## 7. Drive export role for #342

The 2026-10-14 export (`manifest.json` + sha256-verified summaries) is supporting evidence for the
provenance-gap quantification only: snapshots carry UI-readback provenance, so they cannot prove
acceptance. Raw collections stay on the VPS; summaries were verified against the manifest and cached
out-of-band for analysis (not committed to this repository).

## 8. Handoff note (phase 5)

For a future implementation task (own Implementation Scope Check + `commit approved` required; this
issue delivers the contract only):

1. Promotion rule to implement: `game_confirmed` only from the raw-HTML authoritative read equal to
   the intent vector (team4 entity: server-rendered `checked`; match entity: post-final panel
   `data-now` + `data-changes`). UI readback, `currentTactic` snapshots, live-feed `tactic_hash` and
   write-response echoes are corroboration/provenance only — they never promote.
2. In-match semantics: during active play the authoritative read is server-denied (`success=-2`,
   spec §5.1). Record in-match applications as `unverified` + corroboration, promote to
   `game_confirmed` on the post-final authoritative read (eventually-confirmed). Ranking stays
   fail-closed until promotion.
3. Join keys: `teamId` + `idgame` (match entity) / page-entity + `applicationSequence` + intent
   fingerprint + server minute (`data-changes[].m`). Event ids must be deterministic (fingerprint +
   sequence, never timestamps) so retries dedupe (fixture: `tests/test-tactic-acceptance-contract.mjs`).
4. Deferred live work (next live window, owner-gated, one mutation per step): server rejection,
   delayed response, reload/retry; plus a read-only halftime probe of the panel channel.
