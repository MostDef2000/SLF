# Plan — LLM tactical advisor, Ф1 MVP

Issue: #434. Contours: VPS (`vps/api/**`) + userscript (`src/**`).

## Decisions

1. **Hybrid, not replacement.** Rules ladder stays the primary decider; LLM is a second opinion. Rationale: rules are instant and deterministic; the LLM adds reasoning over coach hints and non-standard situations. Ф4 (LLM primary) is explicitly out of scope until accuracy is proven from `advisor_log_v1`.
2. **Client sends the preset catalog.** The userscript already holds `SLFActivePresetRegistry` (labels, meta.idea/use/risk, active list). Sending it per-request guarantees zero drift between what the user's script knows and what the LLM sees. Server-side catalog via the exporter is a Ф2 candidate (pinned-literal cross-check pattern exists in `slf_rag_build.py`).
3. **Model via env.** `SLF_ADVISOR_MODEL` (default `particle-ai/particle-1:free`). The free pool throws transient 429 `fleet_capacity_exhausted` — the server retries once honoring `Retry-After` (capped 5 s) and then reports honest unavailability. A cheaper paid model can be selected later by changing one env var.
4. **Secrets.** `OPENROUTER_API_KEY` lives only in the VPS service env (lane-B step after deploy). Never in Git, never in GitHub secrets (DR-009 spirit), never echoed in logs. Endpoint is 503 fail-closed without it.
5. **Transport.** Reuse `core/api.js` `requestApi` with a new optional `timeoutMs` parameter and a `postJson` helper (parseJson: true). Default timeout unchanged (15 s) — backward compatible.
6. **Logging.** `advisor_log_v1` collection, append mode, one record per consultation attempt outcome: `{ts, gameId, minute, rulesPreset, llmPreset, confidence, latencyMs, outcome, errorKind, model}`. This is the Ф3 feedback seed; no unique key required (not in `TACTICAL_UNIQUE_KEYS`).
7. **Prompt.** System: trainer role + hard rules (pick strictly from catalog, JSON-only answer, explain agreement/disagreement with the rules engine). User: compact JSON context + catalog lines. Temperature 0.4, max_tokens 700 (particle-1 spends reasoning tokens; 30 was proven too few in the connection test).

## Risk profile

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free-model 429 capacity | High | Feature unavailable intermittently | 2 attempts + Retry-After backoff; honest "недоступен" UI; env model switch |
| LLM hallucinated preset id | Medium | Invalid advice | Server-side whitelist validation + corrective retry |
| LLM latency 3–8 s (reasoning model) | High | UX delay | Button shows «Думает…»; 35 s client timeout; advisory-only so no match-time pressure |
| Prompt injection via developerHints | Low | Skewed advice | Hints truncated (20 × 300 chars); answer validated against whitelist; advisory-only |
| innerHTML wipe of answer block on next hint | Certain | Stale answer disappears | Accepted: answer belongs to the hint that produced it |

## Test design

- **VPS (pytest, `vps/api/test_advisor.py`)**: mock the OpenRouter HTTP call; cover success, 429→retry→success, invalid JSON→corrective retry→502, unknown preset→502, missing key→503, oversized/invalid request→400, log record written for ok and error paths.
- **Userscript (node, `tools/test-llm-second-opinion.mjs`)**: vm sandbox; payload contract (catalog from registry, signals whitelist, hints cap, fail-closed null without rules decision), renderer escaping (`<script>` in reason), unavailable rendering, `Api.postJson` timeout pass-through with a stubbed `GM_xmlhttpRequest`.

## Correct-course impact

If OpenRouter free capacity proves unusable in practice, switch `SLF_ADVISOR_MODEL` to a cheap paid model — no code change, no re-authorization (same admitted scope: model is env-configurable by design).
