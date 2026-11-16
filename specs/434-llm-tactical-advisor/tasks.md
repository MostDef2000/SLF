# Tasks — LLM tactical advisor, Ф1 MVP

Issue: #434. Branch: `feat/434-llm-advisor` (base `5ae9203`).

## T1 — VPS advisor endpoint

- [x] `vps/api/advisor.py`: context validation, prompt builder, OpenRouter call (2 attempts, Retry-After backoff, 15 s per attempt), strict answer validation (preset whitelist, confidence enum, reason ≤ 400), `advisor_log_v1` append, fail-closed 503 without key.
- [x] `vps/api/server.py`: register `POST /api/advisor` (static rule; token-gated).
- [x] `vps/api/test_advisor.py`: success / 429→retry→success / invalid JSON→corrective retry→502 / unknown preset→502 / missing key→503 / bad request→400 / log written.

## T2 — Userscript second opinion

- [x] `src/core/api.js`: optional `timeoutMs` in `requestApi`; `postJson(collection, data, label, timeoutMs)` helper.
- [x] `src/modules/strategy-data-recommendations/llm-second-opinion.js`: `buildPayload` (fail-closed, catalog from registry, signals whitelist, hints cap), `requestSecondOpinion`, `renderAnswer` (escaped), answer container mount.
- [x] `src/app/bundle-order.json`: register the module after `tactical-knowledge-pack.js`.
- [x] `strategy-data-task-a-ui-extension.js`: store `STATE.lastRecommendationSnapshot`; mount «🤖 LLM» button next to «↻ Подсказка»; wire click → payload → request → render; never auto-apply.
- [x] `tools/test-llm-second-opinion.mjs`: payload contract, escaping, unavailable path, `postJson` timeout pass-through.

## T3 — Delivery

- [x] Build latest-only userscript; `node --check`; run new + adjacent tests locally.
- [ ] PR linked to this spec; green CI (7 checks); exact-green-head merge.
- [ ] Automatic release published; artifact verified (new button + module present, version bumped).
- [ ] `deploy-vps.yml` dispatched (target `api`) on merged main SHA; unauthenticated probe 401 as before.
- [ ] Lane-B handoff: one command for the owner to set `OPENROUTER_API_KEY` in the service env + restart; live probe after.

## Acceptance traceability

| spec NFR | task | evidence |
|---|---|---|
| Fail-closed availability | T1 | `test_advisor.py::test_missing_key_returns_503` |
| Answer validity | T1 | `test_advisor.py::test_unknown_preset_rejected`, `::test_invalid_json_retry_then_502` |
| Latency ceiling | T1/T2 | per-attempt timeout 15 s, 2 attempts, client 35 s |
| Advisory-only | T2 | `test-llm-second-opinion.mjs` renderer never emits apply controls |
| Telemetry | T1 | `test_advisor.py::test_log_written_on_success`, `::test_log_written_on_error` |
| Payload budget | T1/T2 | validation caps + node payload test |

## Definition of Done

All boxes checked with observed evidence; JOURNAL entry records the release version, deploy SHA, and the lane-B key step.
