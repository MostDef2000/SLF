# #331 implementation and quality plan

Risk: **HIGH**, production control/policy behavior changed; source-only Git PR does not prove match effectiveness.
Bounded changes: `src/modules/tactics-presets/**`, `src/modules/manual-match-telemetry/**`, `data/tactics/**`, `tools/**`, `tests/browser/**`, `vps/exporter-rag/**` when necessary for v10 cohort, and `specs/331-tactical-suite-v10/**`.
Exclusions: generator engine, raw match data, secret configs, personal player data, legacy result migration, automatic champion promotion, manual release artifact editing.

1. Build native-valid 12-entry canonical registry and v10 suite/schema identity; leave Bielsa strictly outside active production.
2. Update deterministic inventory source+tests and preserve legacy LAB P02/P03 exact repeat genome identities.
3. Update 12-situation scoring, clean-exit/hard-veto contracts and graph, reduce all-in risk.
4. Fail-close preflight before mutating any control, restore original vector on handler failure and report incomplete rollback; manual formation workflow kept explicit.
5. Update UI/dropdown retirement policy, telemetry attribution and exporter current-v10 cohort gate if included.
6. Install anti-regression fixtures for native-range errors, counter outlet veto, preset application no mutation on invalid control and failure recovery, foreign-match/no-autoApply safety.
7. Open one bounded PR from current main, exact-head CI, scope/diff review, merge only green exact head, verify automatic release. In absence of green quality gate, keep PR unmerged and report blocker.

Correct-course: if a live game-server confirmation is not observable, never reinterpret browser readback as confirmation or unlock retune. Do not conflate prototype fitness with causal W/D/L evidence.
