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
- [x] PR linked to this spec; green CI (7 checks); exact-green-head merge. (#435 merged at 627189b, run 484 green; +1 CI fix #436.)
- [x] Automatic release published; artifact verified (new button + module present, version bumped). (4.4.380 on release branch: LLMSecondOpinion x10, /api/advisor x2.)
- [x] `deploy-vps.yml` dispatched (target `api`) on merged main SHA; unauthenticated probe 401 as before. (First dispatch 627189b failed fail-closed: deploy-code.sh did not stage advisor.py, API down ~4 min, restored by re-deploying 63543f7; fix in #436; re-deploy 54baa55 — on-box deploy + marker green, external probes 401. Workflow's own runner-side health probe gets 403 from the edge — separate edge issue, flagged.)
- [x] Lane-B handoff: one command for the owner to set `OPENROUTER_API_KEY` in the service env + restart; live probe after. (Done 2026-11-16: key appended via owner-run piped ssh command — value never in chat/git; `slf-server` restarted; live probe through the full path edge→gunicorn→SOCKS relay→OpenRouter: unauthenticated 401, authenticated 200 `available:true`, `model` = `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` via `SLF_ADVISOR_MODEL`, latency 5.1 s, valid Russian reason referencing a catalog preset. Env-edit incident: first append glued onto the `SLF_API_TOKEN` line (file had no trailing newline) — restored from pre-edit backup, re-appended with newline guard.)

## Acceptance traceability

| spec NFR | task | evidence |
|---|---|---|
| Fail-closed availability | T1 | `test_advisor.py::test_missing_key_returns_503` |
| Answer validity | T1 | `test_advisor.py::test_unknown_preset_rejected`, `::test_invalid_json_retry_then_502` |
| Latency ceiling | T1/T2 | per-attempt timeout 15 s, 2 attempts, client 35 s |
| Advisory-only | T2 | `test-llm-second-opinion.mjs` renderer never emits apply controls |
| Telemetry | T1 | `test_advisor.py::test_log_written_on_success`, `::test_log_written_on_error` |
| Payload budget | T1/T2 | validation caps + node payload test |
| Acceptance 4 (live answer after key) | T1/T3 | live probe 2026-11-16: 200 `available:true`, validated answer, 5.1 s |
| Egress via SOCKS relay (#434 root cause) | T1 | `SLF_ADVISOR_PROXY` path verified live: key pre-flight 200 + advisor 200 through relay |
| Model env-configurable (spec What) | T1 | `SLF_ADVISOR_MODEL` override observed in live response `model` field |

## Definition of Done

All boxes checked with observed evidence; JOURNAL entry records the release version, deploy SHA, and the lane-B key step.
