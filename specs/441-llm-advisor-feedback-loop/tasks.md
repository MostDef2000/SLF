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

- [x] Explore: data foundations mapped (log schema `advisor_log_v1.json` single-array cap 5000; collections + per-collection RLocks; prompt anatomy; `_LOG_LOCK` vs collection locks; test seams) with file:line evidence.
- [x] `vps/api/advisor.py`: `build_enrichment()` — history (same-gameId ≤8, pad ≤4 recent others; compact RU lines with apply facts: применён успешно / применение не удалось / применение не отмечено / консультация с ошибкой) + knowledge pack rules (id/when/preset/reason/confidence, 400-char entry cap, honest provenance label «сеяные гипотезы, не проверенные законы движка»); `ENRICHMENT_BUDGET_CHARS = 6000`, whole-entry assembly + «(усечено по бюджету)»; empty/corrupt sources → empty sections, never fail the consultation.
- [x] `vps/api/server.py`: `read_knowledge_pack()` — daily exporter artifact `/var/www/html/slf_ai/tactics/knowledge-pack.latest.json` (env `SLF_KNOWLEDGE_PACK_PATH`), None on any failure; `_LOG_LOCK` snapshot released before the provider call, never recursive; corrective retry reuses the enriched messages.
- [x] Source decision (evidence-based): `tactics` collection REJECTED — retired legacy (client never writes; production holds preset vectors, not hypotheses); knowledge pack file chosen per spec «tactical knowledge pack», availability proven (live fetch + `run_daily_export.sh` on-box).
- [x] `build_messages(context, enrichment="")`: byte-identical to pre-Ф2b when empty (independent oracle test); enrichment inserted before «Дай JSON-ответ.».
- [x] Tests: 9 enrichment tests (apply-fact renderings, same-game priority, byte identity, budget/entry-boundary truncation, corrupt log, missing/corrupt/raising/garbage pack reader, `read_knowledge=None`, pack rendering with entry-cap length pin); RED-on-base verified (8/9 fail at `48a053e`).
- [x] PR → green CI → merge → deploy (`vps/api`) → live probes.

**Ф2b evidence (2026-11-16):** PR #447 (squash-merged `7f69fb699875bbaed1a7a095c72e40b3877aab41`); gates observed by orchestrator: `vps.api.test_advisor` 38/38 (29 pre-existing + 9 enrichment), `test_server` 12/12, `test_server_contract` 8/8, `py_compile` OK; RED-on-base re-verified in detached worktree (8/9 new tests fail at base; the passing one is the deliberate byte-identity absence assertion). Cross-family adversarial review (Claude Haiku): budget bound, entry cap, lock discipline, failure tolerance, contract safety verified; 2 MINOR findings accepted and fixed (entry-cap length assertion strengthened; «не применён» → «применение не отмечено» — absence of an apply event does not imply an attempted apply). Lane-A deploy run 43846975929 green (gate ✓, deploy ✓, on-box `API_READINESS_OK` marker ✓); live probes: `/api/analysis` 401, `/api/advisor` 401, `/api/advisor_apply` 401.

**Ф2b NFR interpretation (recorded):** spec «request ≤ 64 KB» = the existing client-context cap (`validate_context`, unchanged); the enrichment block is bounded by its own fixed cap (`ENRICHMENT_BUDGET_CHARS = 6000`, covering history + knowledge — stricter than the spec's knowledge-block-only wording). Scoped out (→ Ф2c): advice → apply → score-delta evaluation (`match_results_v2` join); relevance scoring of knowledge entries (generator order used); forum claims / dave supplement / generator updates raw sources (the knowledge pack already distils them).

## Ф2c — automatic feedback loop

- [ ] (not started)

## Acceptance traceability

| spec NFR | task | evidence |
|---|---|---|
| Self-sufficiency | Ф2a | node test: payload without snapshot |
| Apply-by-click | Ф2a | node test: click→apply, no auto path |
| Apply telemetry | Ф2a | pytest: apply event keyed by `adviceId` |
| Enrichment budget | Ф2b | pytest: `ENRICHMENT_BUDGET_CHARS` whole-block cap + entry-cap length pin (PR #447) |
| Feedback correctness | Ф2c | pytest: per-game linking |

## Definition of Done

All Ф2a boxes checked with observed evidence; release + deploy verified; live probe; JOURNAL entry.
