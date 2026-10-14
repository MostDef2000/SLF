# SLF #342 — tasks

Issue: https://github.com/MostDef2000/SLF/issues/342 · plan: `plan.md` · contract: `spec.md`

## Definition of Done (investigation issue)
- [x] Phase 1: server-authored persistence signal identified and documented (spec §2).
- [x] Evidence status contract drafted with promotion boundaries (spec §3).
- [x] Provenance gap quantified from verified Drive export (spec §1, §7).
- [x] Phase 2: persistence trigger characterized — click autosave `POST /ajax/tactic_ajax.php`,
      ~450 ms persistence, clean A→B→A revert (spec §2.1, plan phase 2).
- [x] Phase 2b: entity scope mapped — one account, seven teams, `teamId` in join keys (spec §2.2).
- [ ] Phase 3: game.php entity scope resolved (piggyback observation in a live match).
- [ ] Phase 4: negative-case matrix executed; fixtures for client-side cases.
- [ ] Phase 5: contract finalized; UNOBSERVABLE verdict if applicable; handoff note for any
      future implementation task.

## Acceptance traceability
| issue criterion | artifact |
|---|---|
| 1 actual behavior documented, live-safe | spec §2, §2.1–2.2 (phases 1–2), plan phase 3 |
| 2 server-authored state linked to keys | spec §2–3 (probe recipe + join keys incl. `teamId`) |
| 3 precise statuses and boundaries | spec §3 |
| 4 success/negative cases | spec §5 matrix, plan phase 4; A→B→A live-verified (§2.1) |
| 5 ranking stays fail-closed | spec §6 |
| 6 UNOBSERVABLE path preserved | spec §3, §5 |
| 7 live-safe evidence, user-owned account only | spec §2, §2.1–2.2; plan phase 2 controls (executed: one mutation cycle, rollback verified, active team restored) |

## Gates
- Every live mutation: explicit owner command in chat + timing between matches + one mutation per
  step + rollback = re-apply previous vector.
- Any future source change: fresh Implementation Scope Check + `commit approved` + bounded PR +
  exact-head CI + protected merge (per governance).
