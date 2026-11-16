# Tasks — LLM advisor Ф2 (#441)

Issue: #441. Branch: `feat/441-llm-first-button` (Ф2a).

## Ф2a — self-sufficient button + one-click apply

- [x] Explore: map current wiring (LLM button, manual hint flow, snapshot, apply bridge, telemetry path) with file:line evidence.
- [x] `src/modules/strategy-data-recommendations/llm-second-opinion.js`: self-sufficient payload entry (internal `ruleDecision`, no snapshot dependency).
- [x] UI wiring: LLM button → new entry; «↻ Подсказка» hidden; «Применить» on answer → `applyPresetAsync` + apply event with `adviceId`.
- [x] `vps/api/`: `adviceId` in advisor response; apply-event recording (token-gated, stdlib-only).
- [x] Tests: node (payload without snapshot, apply-by-click, honest failure) + pytest (`adviceId`, apply event); existing suites green.
- [x] PR → green CI → merge → release (`src`) + deploy (`vps/api`) → live probe.

**Ф2a evidence (2026-11-16):** PR #442 (squash-merged `61cb44d7dfa8da13b726dae3c4283d0be7b226f2`); commits `ba5d19f` (code+unit tests, 7 files +395/−49), `cd53110` (e2e suite 1, 19/19), `2d1f2a6` (e2e suite 2 fm2026 design adapter, 10/10). Gates observed: pytest 41 passed + 4 subtests; node suite green; py_compile; bundle-order audit OK; RED-on-base `fc07ba3` verified in temp worktree (5 pytest failures + node assertion failures + standalone apply-button probe). Cross-family peer review (Claude Haiku) + incremental re-reviews of 4 accepted findings (ok:false failure reporting, stale-diagnostics reset, UnicodeDecodeError in both log writers, adviceId length cap 128) — no divergence. Release workflow success on main; lane-A deploy dispatched for `61cb44d` (run 43835890428): host accepted (`DEPLOYMENT_ACCEPTED` marker ✓), live probes from sandbox: `/api/analysis` 401, `/api/advisor` 401, `/api/advisor_apply` 401 (new endpoint live). Workflow health probe from GitHub runners fails with edge 403 — pre-existing drift since ~16 Nov 00:55, tracked in #444 (deploy itself green; rollback not needed).

**Ф2a residual risks (recorded):** `append_log` blind-overwrite on corrupt log (pre-existing, unchanged); advisor stub in e2e not gated by api_mode (trap for future "advisor unavailable" cases); lab exposure data-loss — `lastSeenMinute`/`toMinute`/`durationMinutes` now null without the retired manual checkpoint (Ф2c recovery point: replacement checkpoint trigger from the LLM fresh path); dead CSS selector `#slf-manual-recommendation-btn` in `version-badge.js:64` (chore).

## Ф2b — server-side context enrichment

- [ ] (not started)

## Ф2c — automatic feedback loop

- [ ] (not started)

## Acceptance traceability

| spec NFR | task | evidence |
|---|---|---|
| Self-sufficiency | Ф2a | node test: payload without snapshot |
| Apply-by-click | Ф2a | node test: click→apply, no auto path |
| Apply telemetry | Ф2a | pytest: apply event keyed by `adviceId` |
| Enrichment budget | Ф2b | pytest: prompt cap |
| Feedback correctness | Ф2c | pytest: per-game linking |

## Definition of Done

All Ф2a boxes checked with observed evidence; release + deploy verified; live probe; JOURNAL entry.
