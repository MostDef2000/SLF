# SLF #342 — Game-server acceptance proof for tactical changes

Issue: https://github.com/MostDef2000/SLF/issues/342
Status: investigation phase 1 complete (2026-10-14); phase 2 (network + live experiment) pending owner-gated execution.
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

## 3. Evidence status contract (proposal)

| status | meaning | required evidence |
|---|---|---|
| `apply_attempted` | click sequence issued | before/after intent vector, `applicationSequence` |
| `ui_readback_confirmed` | local controls match intent | DOM readback equality (current behaviour) |
| `game_confirmed` | server persisted the application | server-authored state read (raw-HTML `checked` vector) equal to intent, timestamped after apply; join keys: gameId/page-entity + `applicationSequence` + fingerprint |
| `rejected` | server state diverges after apply | authoritative readback differs, retry/rollback observed |
| `unverified` | no authoritative read performed | default state, ranking stays fail-closed |
| `UNOBSERVABLE` | no trustworthy signal exists for an entity | explicit verdict; keeps fail-closed contract (issue criterion 6) |

Boundaries: only the raw-HTML authoritative read promotes to `game_confirmed`. UI readback, local
promises, score changes, and later match results never promote. `game_confirmed` must not be
synthesized from `currentTactic` in match snapshots (that field is UI-readback provenance).

## 4. Open questions (phase 2+)

1. **Persistence trigger**: does the game save on radio click (autosave XHR) or only on form
   submit? Requires network observation during one controlled change (owner-gated game mutation).
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
