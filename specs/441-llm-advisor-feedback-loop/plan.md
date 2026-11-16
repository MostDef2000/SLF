# Plan — LLM advisor Ф2 (#441)

## Risk profile

- Medium: userscript wiring changes (button flows, STATE), new server response field + small endpoint, contract evolution. The apply path is existing and battle-tested (`tactic-control-bridge` with rollback) — reused, not rebuilt.
- Guardrail evolution: Ф1 "advisory-only, never apply" → Ф2 "apply only by explicit click, never auto, always logged". The never-auto invariant is absolute.

## Phasing

- Ф2a first (owner's immediate pain: button refuses without a manual hint click). Ф2b, Ф2c follow as separate PRs on the same issue.
- Each phase: fresh branch from `main` → bounded PR → green CI → exact-green-head merge → release/deploy per policy → live probe.

## Ф2a design (from issue #441 + code reconnaissance)

- `llm-second-opinion.js`: add a self-sufficient request entry — build the payload from an internally computed `ruleDecision` (the same ladder the manual hint runs) instead of `STATE.lastRecommendationSnapshot`.
- UI wiring: LLM button → new entry; hide the «↻ Подсказка» block; render «Применить» on the answer → `applyPresetAsync(preset)`; report the apply event with `adviceId`.
- Server: advisor response gains `adviceId` (log record id); a small token-gated endpoint records apply events (extends the advisor log).

## Risk-based test design

- Payload built without a snapshot (fresh match) → node test.
- Apply button: click → apply called with the suggested preset; no auto-apply path exists → node test.
- Apply failure → honest error surfaced, no partial state → node test (bridge rollback contract).
- Server: `adviceId` present in the response; apply event updates the log record → pytest.
- Regression: existing Ф1 suites stay green.

## Correct-course check

- If the internal ladder invocation proves tangled (hidden coupling to the manual flow), stop and re-scope Ф2a with the owner before forcing it.
