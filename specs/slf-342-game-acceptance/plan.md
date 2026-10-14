# SLF #342 — plan

Deliverable: evidence/provenance contract for tactical acceptance (`game_confirmed`), validated
against real game behavior. Investigation only; any source change later requires its own visible
Implementation Scope Check and `commit approved`.

Correct-course check: the phase-1 finding (server-rendered `checked` vector on team4) upgrades the
plan from "search for a signal" to "characterize a found signal + bound its entity scope".

## Phases

### Phase 1 — signal discovery (done, 2026-10-14)
- Raw-HTML read of `/team4.php?action=tactic` carries the persisted 14-group radio vector
  (`checked` server-authored, hidden inputs, custom UI on top).
- Probe recipe drafted; read is live-safe GET, no credentials touched.
- Provenance gap quantified from the sha256-verified Drive export.

### Phase 2 — persistence trigger characterization (done, 2026-10-14, owner-gated live)
- Trigger: click autosave `POST /ajax/tactic_ajax.php` (`action=ttx&p=<group>&v=<value>`,
  `idgame=0` outside a match); no form submit needed (spec §2.1).
- Latency-to-persistence: authoritative raw-HTML readback ~450 ms after the click already returned
  the new value; the revert cycle returned the baseline vector byte-identical (clean A→B→A).
- Entity scope mapped read-only: one account → seven teams (spec §2.2); active team is a server
  session variable switched via `GET /ajax/userset.php?action=goto&idteam=<id>`; all seven tactic
  vectors identical at observation time; `teamId` added to `game_confirmed` join keys.

### Phase 3 — entity scope: game.php vs team4
- Determine whether the in-match editor (game.php) writes the entity the team4 page reads back.
- Piggyback protocol (zero extra mutations): during the owner's normal mid-match tactic change,
  observe the network log; after the final whistle, read back the team4 entity for that team and
  compare with the in-match values. Requires one owner "go" per observed match.
- Read-only probes of game.php markup whenever a match is observable (owner-driven or dumps
  supplied by owner). If match tactic is a separate entity: define per-entity join keys and mark
  snapshot `currentTactic` as corroborating evidence only.

### Phase 4 — negative cases (criterion 4 matrix in spec.md §5)
- Isolated fixtures: stale cache, unchanged values, A→B→A idempotency (pure client logic, no game
  mutation needed).
- Owner-gated live: server rejection, delayed response, reload/retry — one mutation each, spaced.

### Phase 5 — contract finalization
- Finalize statuses, join keys (`gameId`/page-entity, `applicationSequence`, fingerprint, minute),
  and the UNOBSERVABLE verdict conditions if any entity proves untrustworthy.
- Hand off to a future implementation task (own scope check); this issue delivers the contract.

## Risk-based test design
- Risk: overclaiming acceptance from weak signals. Test: every promotion path in the contract must
  name its authoritative evidence type; matrix cases must fail loudly (stay `unverified`/`rejected`)
  when the signal is absent.
- Risk: live experiments disturbing ongoing matches. Control: owner-gated timing, one mutation per
  step, rollback = re-apply previous vector.

## Quality verdict
PASS for phase 1 (docs-only, live-safe read-only probes, evidence recorded in spec.md §2).
PASS for phase 2 (one owner-gated A→B→A mutation cycle + read-only 7-team sweep; account state
restored byte-identical; evidence in spec.md §2.1–2.2).
