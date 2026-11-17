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

## Two-mode advice (#467) — acceptance examples

The advisor may answer in two modes. These examples pin the behavior; they complement (not replace) the tests.

```gherkin
Feature: LLM advisor two-mode advice
  Rule: Normal play uses fine-grained slider adjustment; a full preset switch is reserved for a radical picture change.

  Scenario: Advisor proposes a small adjustment during normal play
    Given a live match with a current slider vector sent to the advisor
    When the model returns mode "adjust" with 1 to 3 in-domain control changes
    Then the answer renders a "Точечная подстройка" change list with an apply-adjust button
    And no whole-preset apply button is shown

  Scenario: Adjustment is applied only on explicit click and preserves priority
    Given an adjust answer with changes for "press_intense" and "style"
    And the current vector has priority ["center"]
    When the user clicks "Применить изменения"
    Then only those two controls are applied through the bridge with strict readback
    And the current priority ["center"] is preserved (not cleared to [])
    And an apply event is reported keyed by adviceId

  Scenario: Adjustment is never applied automatically
    Given an adjust answer is rendered
    When no click occurs
    Then no tactic control is changed

  Scenario: Radical picture change uses a full preset switch
    Given the model returns mode "switch" with a preset id from the catalog
    When the answer renders
    Then the existing "Применить пресет" button is shown
    And clicking it applies the whole preset through the unchanged switch path

  Scenario: Legacy answer stays compatible
    Given the model returns a preset-only answer with no "mode" field
    When the server validates and responds
    Then it is treated as mode "switch" with the same response shape as before

  Scenario: Invalid adjustment is rejected, not applied
    Given the model returns mode "adjust" with an unknown control, an out-of-domain value, more than 3 changes, or a duplicate control
    When the server validates the answer
    Then it follows the invalid_answer corrective-retry path and never reaches the client as an applicable change
```
