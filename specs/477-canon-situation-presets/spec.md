# Spec — Recommend the exact manual tactic for the observed situation (#477)

Base: `78bda2bf54eb59157f78c7bdfa4632cab9cb1323`.

## Problem and decision

When a manager asks for tactical advice, the hint must answer: **Which situation applies, why does it apply, and which settings does the manual prescribe?** Today a situation can be recognized correctly but its tactic can still be replaced by a coach preset, a Dave etalon, a scenario adjustment or an LLM response. The current final selection starts from a preset or current tactic and may overlay etalon settings (`src/modules/strategy-data-recommendations/final-tactic-merge-layer.js:204–263`).

The owner designated the screenshot’s **12 situations and eight legend lines** as canon. The authority for wording is `shared/slf-developer-tactics-analysis.md:8–33`; the concrete numeric realizations, including the flank and relative-strength variants, are in `shared/slf-manual-vs-teams.md:11–26`. The numeric choices make the presets actionable; they do not replace the manual’s wording or turn its permitted ranges into new claims about the manual.

The same reference governs three related decisions:

- **Starting recommendation:** compare each of the owner’s seven clubs with its **own league**. Recommend row 2 for a league favourite, row 1 for a comparable middle club or row 3 for a league underdog. Label this as a starting baseline, not an observation about today’s opponent.
- **Live recommendation:** match the observed situation to the manual. When resolved, its ID, variant and six manual settings are authoritative. Other data-backed SLF situations remain available under their own names; they are not additional screenshot rows.
- **LLM second opinion:** explain and recommend within the same manual. Preserve both fine-grained `adjust` advice and mapped `switch` advice. Neither can override the deterministic match. This incorporates Issue #477 clarifications `7057570345` and `7057582927`.

The six settings are attack direction (left/centre/right priority), buildup type, tempo, diagonals, one-touch play and style. The manual does not prescribe every other slider, the formation or player roles. Giving advice must not itself apply a tactic. The existing explicit acceptance action remains available; acceptance tests exercise it in an isolated fixture, not on slf.fm.

## Acceptance

```gherkin
Feature: Recommend a tactic from the same manual used to explain it

  Rule: R1 — A resolved situation selects its exact manual settings
    Scenario Outline: Resolve a row from observations rather than a supplied row ID
      Given the match evidence establishes <situation>
      And no competing specific intention remains unresolved
      When the manager requests a tactical recommendation
      Then the final hint identifies row <id>
      And its priority L/C/R, build_type, build_temp, build_long, build_fast and style equal <vector>

      Examples:
        | id | situation                                           | vector        |
        | 1  | comparable starting XIs, no overriding need          | 000 2 2 2 2 3 |
        | 2  | stronger starting XI, no need to rescue the match    | 000 3 2 2 2 3 |
        | 3  | weaker starting XI, playing as the underdog          | 101 2 2 1 1 2 |
        | 4  | goal needed, left flank established                  | 110 3 3 2 2 4 |
        | 4  | goal needed, right flank established                 | 011 3 3 2 2 4 |
        | 5  | leading with intent to protect the score             | 101 1 2 1 1 1 |
        | 6  | opponent presses our first pass, our XI weaker       | 101 2 3 1 1 2 |
        | 6  | opponent presses our first pass, XIs comparable      | 101 2 3 1 1 3 |
        | 6  | opponent presses our first pass, our XI stronger     | 101 2 3 1 1 4 |
        | 7  | opponent observably leaves our first pass free       | 000 3 2 2 2 3 |
        | 8  | progression stalls at a confirmed deep block        | 000 3 1 2 3 3 |
        | 9  | sustained turnovers and transitions in both directions | 101 2 2 1 1 3 |
        | 10 | confirmed aerial outlet and intent to play through it | 101 1 2 1 1 3 |
        | 11 | established intention to control play through passes | 000 3 1 2 2 3 |
        | 12 | established intention for repeated fast wide attacks | 101 2 3 1 1 4 |

  Rule: R2 — Resolve collisions by evidence, not array order or vector equality
    Scenario: Specific observed pressure behavior outranks a generic strength comparison
      Given our starting XI is stronger
      And the opponent observably leaves the first pass free
      When the manager requests advice with either ordering of the candidates
      Then the hint identifies row 7 rather than row 2
      And explains the free first pass, although the two rows share a vector

    Scenario: Equally supported specific intentions remain ambiguous
      Given evidence supports both a positional push for a goal and repeated fast wide attacks
      And neither the observations nor the manager distinguish the intended approach
      When advice is requested
      Then the hint names the alternatives and the choice needed to distinguish them
      And offers neither resolved tactic until that choice is known

  Rule: R3 — Unknown is not zero, equality, a default flank or lack of pressure
    Scenario Outline: Refuse an unresolved recommendation
      Given <evidence>
      When the manager requests advice
      Then the hint identifies <needed input>
      And does not offer a resolved tactic or silently substitute a coach preset

      Examples:
        | evidence                                                       | needed input                    |
        | no XI comparison and no specific situation observed            | relative XI or situation        |
        | a goal is needed but the attacking side is unknown             | left or right attacking flank   |
        | our first pass is under pressure but relative XI is unknown    | strength relative to this rival |
        | no pressure observation and no other distinguishing evidence   | an observation of the situation |

  Rule: R4 — Preserve data-backed additions without attributing them to the manual
    Scenario: An additional situation has positive evidence
      Given press fatigue is established and the press_cooldown entry conditions pass
      And no manual situation is established or awaiting a distinguishing choice
      When the manager requests advice
      Then the hint identifies press_cooldown as an SLF situation
      And recommends its eligible coach tactic without calling it a screenshot row

    Scenario: An eligible addition cannot displace a manual match
      Given an SLF addition is eligible and a manual row is resolved
      When advice is requested
      Then the selected tactic is the resolved manual row and exact variant
      And the addition does not replace its identity or settings

  Rule: R5 — Rebuild the coach presets and preserve their eligibility contracts
    Scenario: Compare the rebuilt inventory with the runtime catalog
      Given the 13 active coach preset IDs on the issue base
      When the inventory, runtime registry and situation mapping are compared
      Then each ID has the same coach, role, eligibility and documented mapping across those sources
      And every coach preset mapped to a manual row has that row's specified attack settings for its declared variant
      And each of the 12 rows and its variants can be recommended exactly
      And no nearest-vector lookup is treated as proof of a mapping

    Scenario: Manual recommendation does not grant coach eligibility
      Given control through passing establishes row 11
      And the associated Arteta preset is manual-only
      When the manager requests advice
      Then the advisor can recommend row 11's exact settings
      But does not automatically select Arteta or substitute a retired or UI-only preset

  Rule: R6 — The deterministic selection survives every downstream proposal
    Scenario Outline: A competing proposal favors a different tactic
      Given row 4 is resolved for the right flank
      When <proposal> favors a different tactic or priority
      Then the actionable manual recommendation remains row 4 with 011 3 3 2 2 4
      And no conflicting preset or adjustment is offered as the selected tactic

      Examples:
        | proposal                           |
        | the highest-scoring coach preset   |
        | a Dave etalon or scenario delta    |
        | a late LLM adjust response         |
        | a late LLM switch response         |

  Rule: R7 — Show the manual verbatim and do not auto-apply
    Scenario: Read advice on the new-design dark match page
      Given a manual row is resolved and page-sourced coach hints are present
      When the manager opens the hint and its legend by keyboard
      Then the situation and all six setting descriptions use the row's verbatim text
      And all eight legend lines are readable verbatim
      And the selected numeric variant is distinguishable from the manual's permitted range
      And coach and model commentary are distinguishable from manual text
      And opening, refreshing or receiving advice changes no game control and submits no tactic

  Rule: R8 — The LLM uses the manual and preserves precise adjustment
    Scenario: Explain the actual match rather than a different row with the same vector
      Given the matcher resolved row 7 because the opponent leaves the first pass free
      When the manager asks the advisor why it recommends this tactic
      Then the answer names «Соперник почти не прессингует»
      And relates the observed first pass to the recommended buildup
      And does not cite row 2 or assert that our team is the favourite

    Scenario: Produce and explicitly accept a precise adjustment
      Given row 8 «Взлом автобуса» is resolved
      And its manual settings already match except build_temp=2 and build_fast=2
      When the advisor recommends adjust with build_temp=1 and build_fast=3
      Then the answer identifies row 8 and presents those two changes
      And receiving it changes no controls
      When the manager explicitly accepts the adjustment in the new-design fixture
      Then only those two sliders change and no preset switch occurs
      And the resulting manual settings equal row 8's exact vector

    Scenario: Reject a partly contradictory adjustment
      Given row 8 is resolved with target build_temp=1
      When the model returns two changes, one of which sets build_temp=3
      Then the conflicting answer is not presented as actionable advice
      And the deterministic row 8 recommendation remains available unchanged

    Scenario: A switch must match the situation and its variant
      Given row 4 is resolved for the right flank
      When the advisor proposes a preset switch
      Then a switch is actionable only for an eligible canon-mapped preset realizing row 4 with priority 011
      And a catalog entry for priority 110 is rejected even if it also maps to row 4

    Scenario: The advisor remains useful without inventing a match
      Given no manual situation is established and opponent pressure is unknown
      When the manager asks for tactical advice
      Then the advisor explains the uncertainty and identifies evidence that would distinguish the situations
      And may explain a separately evidenced SLF addition under its own name
      But does not invent a manual match or offer a canon switch based on a guess

  Rule: R9 — Choose each club's starting recommendation relative to its own league
    Scenario Outline: Review each of the seven clubs independently
      Given dated season and division evidence comparing <club> with its league peers
      When the advisor prepares the club's starting recommendation
      Then it reports the club, league, evidence date, league class and corresponding manual row
      And the starting settings equal the same row's settings in live advice

      Examples:
        | club          |
        | Боа           |
        | Пршибрам      |
        | Честер        |
        | Каррарезе     |
        | Луч           |
        | Норт Дистрикт |
        | Эйрбас        |

    Scenario Outline: Translate an evidenced league class to a starting tactic
      Given the own-league comparison establishes <class>
      And no more specific match situation is established
      When the starting tactic is requested
      Then the recommendation is <row> with <vector>

      Examples:
        | class             | row             | vector        |
        | favourite         | 2 — Ты фаворит  | 000 3 2 2 2 3 |
        | middle/comparable | 1 — Равный матч | 000 2 2 2 2 3 |
        | underdog          | 3 — Ты андердог | 101 2 2 1 1 2 |

    Scenario: Эйрбас's owner-internal rank cannot determine its tactic
      Given Эйрбас is last among the owner's seven clubs
      And the fixture establishes favourite status among its own league peers
      When the starting recommendation is prepared
      Then Эйрбас receives row 2, not row 3
      And changing only the strengths of owner clubs outside that league does not change the result

    Scenario: Missing league evidence does not create a middle classification
      Given a club's league evidence is absent, incomparable or from another season
      When a starting recommendation is requested
      Then the advisor reports insufficient league evidence rather than defaulting to row 1

    Scenario: A starting baseline does not override a live situation
      Given a league favourite began with row 2
      And the live evidence now establishes a lead and an intention to protect it
      When the manager requests match advice
      Then the advisor recommends row 5 and explains the current situation
      And does not treat the starting baseline as evidence against the live match
```

The Эйрбас favourite case is an acceptance fixture, **not** a claim about its current league. The historical comparison warns against assigning row 3 from last place among the owner’s clubs (`shared/slf-manual-vs-teams.md:28–40`).

## Non-functional requirements

| Area | Design verdict | Justification and acceptance evidence |
|---|---|---|
| Security | CONCERNS | Page hints and model output are untrusted. Render text safely; validate every actionable change or switch against the current decision. Verify hostile text, stale answers and mixed valid/invalid changes cannot produce an unsafe action. |
| Privacy | PASS by design | Advice needs bounded tactical evidence, not a roster dump, raw page content, new telemetry or the complete league dataset in the prompt. Inspect the outgoing context. |
| Performance | PASS by design | Resolve a bounded catalog locally once per requested snapshot. No new polling, live standings fetch per hint or wait for an LLM before local advice is available. |
| Compatibility | CONCERNS | Preserve active IDs, persisted aliases, fixed lineup, manual-only restrictions, page coach hints, and `adjust`/`switch` clients. Exercise old request/new API and new client/old or unavailable API. |
| Accessibility | CONCERNS | Verify keyboard access to the hint, legend and explicit adjustment action on the dark new design. Situation, source, uncertainty and actionable changes must be intelligible from text, not color alone. |

**Outside scope:** applying tactics on slf.fm, editing live site presets, game-state mutation, VPS deployment, old-design enablement, player-role or formation changes. A userscript release does not establish VPS rollout or live game acceptance.
