# Spec — LLM advisor Ф2: self-sufficient button, one-click apply, feedback loop

Issue: #441. Status: Active.

## Why

Ф1 (#434) delivered the advisor, but the «🤖 LLM» button is fail-closed on the manual hint snapshot: it refuses until «↻ Подсказка» is clicked. The owner no longer wants the manual hint flow. Ф2 makes the LLM button the single primary entry: it works standalone, applies the answer in one click, and the advisor gets smarter with every match from automatically collected feedback.

## Owner decisions (2026-11-16)

- RAG: all knowledge bases (forum claims, supplement, generator updates, tactical knowledge pack), server-side relevance selection.
- History: past matches (results, applied presets) + current-match advice history.
- Evaluation: automatic only (applied/not + score delta); no manual ratings.
- «↻ Подсказка» hidden from UI; rule ladder stays internal as the LLM's structured input.

## What (Ф2)

- **Ф2a**: self-sufficient LLM button (internal rule-ladder run), «Применить» one-click apply via the existing tactic-control path, `adviceId` in advisor response, apply events reported to server.
- **Ф2b**: server-side prompt enrichment from all knowledge bases + history, budget-capped.
- **Ф2c**: automatic outcome evaluation (advice → apply → score delta) and experience injection into future prompts.

## Honest expectation (recorded)

The model itself (free Nemotron via `SLF_ADVISOR_MODEL`) does not retrain. Improvement comes from the growing context: every match adds logged advice + outcomes + apply facts, and future prompts retrieve that experience.

## Measurable NFR targets

| NFR | Target | Evidence status |
|---|---|---|
| Self-sufficiency | LLM button works with zero manual-hint clicks in a fresh match | node test + live probe |
| Apply-by-click | Preset applies only on explicit click; never auto; apply failure rolls back and surfaces honestly | node test + review |
| Apply telemetry | Every apply event reaches the server keyed by `adviceId` | pytest + node test |
| Enrichment budget | Prompt knowledge block ≤ fixed char cap; request ≤ 64 KB | pytest |
| Feedback correctness | Evaluation links advice → apply → outcome per gameId; no cross-game leakage | pytest |
| Latency ceiling | Unchanged from Ф1 (2×15 s attempts, client 35 s) | existing tests |

## Acceptance

1. Fresh match → click «🤖 LLM» → validated answer renders without any manual hint click.
2. «Применить» applies the suggested preset through the existing bridge; failure surfaces honestly, no silent state.
3. Apply event lands on the server keyed by `adviceId` (visible in advisor log).
4. (Ф2b) Advisor prompt includes relevant knowledge + history within budget.
5. (Ф2c) After match end, advice records carry automatic outcome evaluation; future prompts include it.
6. Full CI green; release bumps; deploy + live probe per policy.

## Definition of Done

Per phase: PR merged to `main` with green CI; release (`src/**`) and/or deploy (`vps/api/**`) verified; live probe; JOURNAL updated.
