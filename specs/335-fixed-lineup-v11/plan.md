# #335 — implementation plan / risk and quality

**Risk HIGH:** previous tactic catalogue uses mismatched formations, while a real user keeps the same XI for all matches; new numeric controls are unproven and risk repeating avoidable losses. Approval is only for source changes consistent with the corrected blueprint. Blueprints are designs, not runtime evidence.

1. Fresh branch from verified `main@0ff8cd89`. No generator, match database, secret or generated publication edit.
2. Rebuild 12 production v11 modes (full 14-control native vectors+priority). Keep old v10 IDs as read-time selection aliases only; the raw v10 suite remains historical. Add fixed-lineup profile (RW and RM variants) and ensure all 12 modes use the same canonical RW profile.
3. Make policy Emery default with Arteta diagnostic/manual only and preserves all score, transition, fatigue, counter/outlet and press/high-risk vetoes. Re-key STEP/scoring. Never automatically recommend a formation change, or automatically apply a preset.
4. Make lineup observer read only. When a mode is explicitly selected, before/after inspect actual native formation, but never perform any lineup mutation; fail success attribution if native page unexpectedly changes it. Display one clear RW/RM locked formation instruction in UI.
5. Distinguish v11 suite/recommendation schema in all new telemetry and VPS evidence gate; keep v9/v10 samples visible but ineligible to authorize v11 retune. Current `ui_readback_confirmed` is not `game_confirmed`.
6. Rebuild deterministic inventory with fixedFormationProfile. Test: exact 12 vectors, two wing variants, no CD2, no silent formation save, fail-close input/readback, Arteta not auto, 11 contextual outcomes, transition graph, old-ID storage, cohort isolation.
7. Open one PR; exact-head CI, browser tests, static/reliability/release checks. Fix only in-scope regressions, re-check diff and base/head, merge only verified green exact-head. Automatic userscript publication and released artifact SHA verification.
8. User Tampermonkey installation and one user-owned match acceptance after release; no implied improvement guarantee or game-server acceptance.

**Correct-course:** If native DOM formation is not available, do not fail user control change merely from lack of observability, but do not infer a valid formation. If formation unexpectedly changes during preset apply, fail success attribution. Leave exceptional user-initiated lineup edits outside preset path. Reject unsupported control inputs before any write.

**Tests:** P0 native controls+rollback+absence of formation mutation and Arteta/manual-only; P1 12 profiles + wing variations + v10 history and telemetry, browser E2E; P2 aggregate outcome statistics; P3 live match controlled by user. Performance benefit is unproven; acceptance establishes correctness, not superiority.
