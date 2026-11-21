# Spec — Visible confirmation for finished-match parse (#479)

Base: `1ff8489a3d8c057a885f30e2660330009b412e78`.

## Problem and decision

On a finished match page, pressing «Спарсить завершённый» sends the final result but gives no visible confirmation. A live browser probe with the userscript injected on `game.php?id=35144919` observed:

- `#slf-parser-status` remains «ожидание» — it is never updated on resolve or reject of the parse send.
- The only success text goes to `#slf-parser-log` via `addParserLog()` (`src/app/ui-layer.js:64`). That element is a shared single-line log with `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` (`ui-layer.js:130`), computed height `0px` before the click, and 10+ other writers (`event-tracker.js:166,353-365`, `strategy-data-task-a-ui-extension.js:586,590,624,638`). The message is easy to miss or overwrite.

The fix writes a clear success/failure message to the dedicated `#slf-parser-status` element and makes that element readable in the new design. The shared log stays as supplementary detail. The API send logic is unchanged.

## Acceptance

```gherkin
Feature: The manager sees that the finished-match parse completed

  Rule: R1 — Success is shown in the dedicated status element
    Scenario: Parse send resolves on a finished match
      Given the new-design dark match page has the parser panel
      And #slf-parser-status reads «ожидание»
      When the manager clicks «Спарсить завершённый»
      And the result send resolves successfully
      Then #slf-parser-status shows a clear success message
      And the message is visible (non-zero height, not clipped)

  Rule: R2 — Failure is shown in the same place
    Scenario: Parse send rejects
      Given the manager clicks «Спарсить завершённый»
      And the result send rejects with a known error kind
      Then #slf-parser-status shows a failure message naming the error kind
      And no success message is shown

  Rule: R3 — The shared log remains supplementary
    Scenario: Other events write to the log
      Given the parse succeeded and the status shows success
      When another feature writes to #slf-parser-log
      Then #slf-parser-status still shows the parse result

  Rule: R4 — No auto-apply and no game-state change from the confirmation
    Scenario: Reading the confirmation changes nothing
      Given the status shows the parse result
      Then no tactic, role, or lineup was changed by the confirmation
      And no additional API request was made by displaying the status
```

## Non-functional requirements

| Area | Verdict | Basis |
|---|---|---|
| Security | PASS | Status text is static or an error kind; no HTML injection, no new endpoint. |
| Privacy | PASS | No new data leaves the page. |
| Performance | PASS | One DOM text update per send. |
| Compatibility | CONCERNS | Must remain readable in the new design and not regress the old-design log assertions. |
| Accessibility | CONCERNS | Status must be readable text, not color alone; verify in the dark fixture. |

**Outside scope:** VPS/deploy, game-state mutation, old design, tactics/roles, API send logic, other modules.
