# Spec — Prepare a training profile for selected players on FM 2026 (#475)

Base: `23cf5a8022a69633efccc5ac85f7865963cf2144`.

## Problem and decision

On new-design `train.php`, a manager can select players and press «Применить к выбранным», but the guide reports that it cannot find the group planning table. The guide looks for controls in a table footer; the site now presents them in the native bulk panel. The button should prepare an **editable draft in that panel**. It must not change which players are selected or save their training plans.

Acceptance is on the **new design, dark theme**. The owner explicitly ruled out treating a passing old-design test as product acceptance (`JOURNAL.md:14346–14352`, 2026-10-20). Preserve the existing footer fallback without adding old-design support. Game save mechanics, benchmark calculation, VPS, and other modules are out of scope.

## Acceptance

```gherkin
Feature: Prepare a role profile for the selected players

  Rule: R1 — Use the native bulk panel when present
    Scenario: Apply a field profile without a table footer
      Given the new-design dark training page has a .train-bulk panel and no tfoot
      And two field players are checked and a complete CM profile is available
      When the manager presses «Применить к выбранным» for CM
      Then the ten profile chips are is-on with data-order 1 through 10 respectively
      And their .train-bulk__up inputs are enabled and contain the rounded profile targets
      And the same two players remain checked
      And the legacy footer path is not invoked

  Rule: R2 — Interpret each native index in the selected role's vocabulary
    Scenario Outline: Fill the correct targets even where the chip labels differ
      Given only <type> players are checked
      And the <role> profile assigns targets 51 through 60 to <skills> respectively
      When the manager applies that profile
      Then inputs at data-i 1 through 10 contain 51 through 60 respectively

      Examples:
        | type  | role | skills                        |
        | FIELD | CM   | ПС СУ ТУ СК УС ОТ ВП ТХ БВ КР |
        | GK    | GK   | ПС СВ ТВ СК РЕ ИВ ВП РМ ПИ ВВ |

  Rule: R3 — Replace stale chip state; endurance is not part of either profile
    Scenario: Apply twice over an existing manual draft
      Given chip 11 «вын» is active and some other chips have manual priorities
      When the manager applies the same valid profile twice
      Then the second draft has the same targets and priorities as the first
      And chip 11 is off, has no active order, and its target is disabled

  Rule: R4 — Reject an unusable draft before changing any controls
    Scenario Outline: Leave the current draft intact
      Given <condition>
      When the manager applies the profile
      Then the guide displays an error and leaves the draft and player selection unchanged

      Examples:
        | condition                                             |
        | no player is checked                                  |
        | both a goalkeeper and a field player are checked      |
        | only goalkeepers are checked for a field profile      |
        | a required target is missing                          |
        | the bulk panel exists but a required input is missing |

  Rule: R5 — Preserve the existing fallback only when the bulk panel is absent
    Scenario: Existing footer-only behavior
      Given there is no bulk panel and a valid legacy group footer is present
      When a compatible profile is applied to selected players
      Then the existing ten footer targets and order selectors are filled as before
      And saving still requires the native save action

  Rule: R6 — Preparation is not persistence
    Scenario: Leave the manager in control of saving
      Given a valid profile and compatible selected players on the new design
      When the manager applies the profile
      Then the status says the profile is prepared and directs them to «Сохранить»
      And no native save click, form submission, or training-plan POST occurs
      And the manager can edit the targets before deciding whether to save
```

The site, not the guide, decides whether a later save is valid. In particular, at least one target must exceed a current value for a selected player. “Prepared” does not mean “accepted by the game.”

## NFR assessment

Design verdicts, not runtime test results:

| Area | Verdict | Basis |
|---|---|---|
| Security | PASS | Apply writes numeric values into existing controls. It needs no endpoint, credential, new permission, or HTML injection. |
| Privacy | PASS | Player selection and targets stay in the current page. No new logging, storage, telemetry, or VPS call. |
| Performance | PASS | One user-triggered pass over the selection and eleven chips; no polling or background observer. |
| Compatibility | CONCERNS | The native chip structure belongs to the site. Validate the complete panel before mutation. A malformed panel is an error, not permission to try the footer. |
| Accessibility | PASS | Retain the existing button and native editable inputs. Express success, failure, and the required next action in text, not just chip color; verify keyboard activation. |
