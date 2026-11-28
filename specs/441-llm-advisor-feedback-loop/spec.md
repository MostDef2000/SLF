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

## Pre-LLM forced match-data refresh (#483) — acceptance examples

The visible match DOM lags the server (minute, score, signal and stats are filled asynchronously), so an advisor answer built from it can describe an older state. Before every advisor request — «🤖 LLM» button, chat send, chat retry — the client now fetches ONE fresh match observation from the same-origin desktop JSON endpoint (`GET /ajax/game4.php?action=get_stat_desktop&game_id=<id>&...`, `no-store`, `redirect: error`, 5 s deadline covering the body read), validates it fail-closed, normalizes it into the snapshot via `SnapshotEngine.build(fresh)` and reruns the rules. Match-derived fields (game id, status, minute, score, per-team stats, xT, shots table, events) come from the fresh observation; DOM-only fields (team display names/aliases, power2/power, developer hints, lineup/formation, current tactic) still come from the page. The 35 s advisor deadline is unchanged.

```gherkin
Feature: Pre-LLM forced match-data refresh
  Rule: The advisor answers only from a fresh match observation fetched immediately before the request.

  Scenario: Stale DOM with a fresh desktop observation
    Given the visible DOM still shows minute 54 and score 1:0
    And the desktop observation returns minute 61, score 2:0 and a new signal for the same game id
    When the user clicks "🤖 LLM" (or sends a chat turn, or clicks "Повторить")
    Then exactly one advisor POST is made
    And its payload carries minute 61, score 2:0 and the fresh signal
    And the visible DOM is unchanged and the page is not reloaded
    And no tactic control is changed

  Scenario: DOM-only fields are not invented from JSON
    Given the fresh desktop observation carries no team display names, power2, hints, lineup/formation or current tactic
    When the payload is built from that observation
    Then those fields still come from the DOM
    And a field absent from both sources stays empty instead of being invented

  Rule: A refresh or validation failure fails closed — no advisor answer from stale or cached data.

  Scenario Outline: Refresh failure is retryable and sends nothing
    Given the pre-LLM refresh fails with <failure>
    When an advisor entry is triggered
    Then zero advisor POSTs are made
    And no cached or partial advisor answer is rendered
    And no assistant chat turn is added
    And a retryable message is shown
    And the request guard is released so a later retry is accepted

    Examples:
      | failure                                              |
      | non-JSON body (login or redirect page)               |
      | timeout, including a body read that exceeds 5 s      |
      | HTTP error status                                    |
      | identity mismatch (returned game id differs)         |

  Scenario: Retry after a failed refresh uses the same dialogue
    Given a chat send failed during the refresh
    And the user's turn was recorded once
    When the user clicks "Повторить" with a now-successful refresh
    Then the same dialogue is sent once
    And no duplicate user turn is added

  Rule: A match identity change during refresh aborts the request.

  Scenario: Game changes while the observation is in flight
    Given an advisor entry is triggered on game A
    And the page moves to game B before the refresh completes
    Then zero advisor POSTs are made
    And no answer or chat window is mounted into game B

  Rule: Inactive or ambiguous match states are refused honestly.

  Scenario Outline: Inactive state blocks the request
    Given the refreshed observation reports <state>
    When an advisor entry is triggered
    Then zero advisor POSTs are made
    And an honest message names the state
    And a retry control is offered only when <retry offered> is yes

    Examples:
      | state                | retry offered |
      | not started          | no            |
      | finished             | no            |
      | paused or suspended  | yes           |
      | ambiguous clock      | yes           |

  Rule: The refresh never mutates the page or the tactic.

  Scenario: No reload, no DOM replacement, no auto-apply
    Given an advisor entry completes or fails
    Then the page is not reloaded and the match DOM is not replaced
    And no tactic is applied without an explicit apply click
```
