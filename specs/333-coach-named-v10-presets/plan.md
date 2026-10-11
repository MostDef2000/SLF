# #333 — implementation plan

Risk: **HIGH** because production IDs are used as keys across UI, family transitions, persisted progressions, match telemetry and VPS evidence. Failure can appear as a missing preset or silently split a cohort.

1. Confirm current protected main and #331 version, then branch from that exact commit.
2. Change only the 3 canonical registry keys plus display labels and trainer metadata. Export a **closed exact alias map**; add old keys to removed identities but retain them for read-time resolution only.
3. Normalize alias on selection, family lookup, manual apply, legacy progression and telemetry attribution without altering raw past match records.
4. Replace IDs in the policy graph/score/veto tables and deterministic inventory, leaving all other controls, roles and selections untouched.
5. Update v10 exporter aggregations to resolve aliases only if the exact v10 suite + schema are present; distinct-preset-count must be based on canonical IDs. Historical v9/legacy rows retain original labels.
6. Extend Node and browser tests with old-ID selection, graph behavior, exact control/formation parity and no generic user-facing names. Add Python old+new cohort fixture with strict v9 negative case.
7. Open scoped PR; exact-head canonical `SLF CI / ci`; correct only in-scope regressions; squash to protected main; verify automatic release on `release`. Do not modify generated files.
8. Record evidence and hand off independent VPS exporter deploy + live browser acceptance.

## Correct-course guards

- Do **not** rename internal `midblock_safe_control` role or historic `midblock_control_4231` scheme-state IDs: they are semantic keys, not production identity labels.
- Do **not** rewrite persisted raw `match_results_v2` / `preset_effects_v2` / `preset_events_v2` / `match_snapshots_v2`.
- Do **not** treat browser `ui_readback_confirmed` as game-server confirmation or infer higher win rate from a name change.
- If exact-head CI or inventory parity is absent, stop before merge.
