# Spec — LLM tactical advisor, Ф1 MVP (second opinion)

Issue: #434. Status: Active.

## Why

The in-match hint engine is a deterministic rule ladder (`cah-runtime-context.js`). It is fast and debuggable but cannot reason about novel situations, cannot read coach hints semantically, and does not improve with accumulated experience. The owner wants an advisor that knows the rules, reasons about the situation, and gets more accurate over time. Ф1 delivers the minimal advisory loop: rules stay primary, an LLM provides a validated second opinion, and every consultation is logged to build the feedback dataset.

## What (Ф1)

- `POST /api/advisor` on the VPS API: token-protected, takes the compact match context + rules decision + client preset catalog, consults OpenRouter, validates the answer, logs the call, returns a structured opinion.
- Userscript button «🤖 LLM» next to «↻ Подсказка»: builds the payload from the last manual hint snapshot, renders the answer under the recommendation block. Advisory only — never applies tactics.
- Model is env-configurable (`SLF_ADVISOR_MODEL`, default `particle-ai/particle-1:free`).

## Measurable NFR targets

| NFR | Target | Evidence status |
|---|---|---|
| Fail-closed availability | No API key → HTTP 503 `advisor_not_configured`; userscript renders a muted "недоступен" block; no crash, no retry storm | pytest (planned) |
| Answer validity | 100% of `available:true` responses carry a preset id from the request catalog; invalid LLM output never reaches the client | pytest (planned) |
| Latency ceiling | Server completes ≤ ~35 s worst case (2 attempts × 15 s + backoff); client timeout 35 s | code review + pytest |
| Advisory-only | No userscript code path applies a tactic from the LLM answer | node test + review |
| Telemetry | Every consultation (ok or error) appends one `advisor_log_v1` record | pytest (planned) |
| Payload budget | Request context ≤ 64 KB; catalog ≤ 40 presets; hints ≤ 20 × 300 chars | pytest + node test |

## Acceptance examples — dialogue continuity (#471)

```gherkin
Feature: LLM tactical dialogue survives a truncated reply
  Rule: A chat turn that exceeds the response budget must not break the conversation

    Scenario: Dialogue reply gets the larger output budget
      Given a validated advisor request with a non-empty dialogue for a live match
      When the provider is called
      Then max_tokens is 2400 on every attempt of that consultation
      And a request without dialogue still uses max_tokens 1200

    Scenario: Truncated empty reply is reported honestly and can be retried
      Given the provider returns no content with finish_reason "length"
      When the advisor error response is built
      Then errorKind is "empty_answer" and finishReason is "length"
      And the client shows "Модель исчерпала лимит ответа и ничего не вернула. Попробуйте ещё раз."
      And the chat offers "Повторить" without appending a second user turn
      And after a successful retry the assistant reply is added to the dialogue

    Scenario: No arbitrary provider string is reflected
      Given an empty answer with finish_reason "error" or any other non-empty answer
      When the error response is built
      Then no finishReason field is present
```

## Acceptance

1. `pytest vps/api` green including new advisor tests (success, 429→retry→success, invalid JSON→retry→honest failure, missing key→503, log written).
2. `node tools/test-llm-second-opinion.mjs` green (payload contract, HTML escaping, fail-closed without rules decision).
3. Full existing CI suite green; userscript release bumps to next patch version.
4. Deployed API answers 503 `advisor_not_configured` until the owner installs `OPENROUTER_API_KEY` (lane-B step); after the key is set, a live request returns a validated answer.

## Definition of Done

PR merged to `main` with green CI; automatic latest-only release published and verified; `deploy-vps.yml` dispatched for target `api`; lane-B key step handed to the owner as one command; JOURNAL updated.
