# DR-001 — Knowledge source priority

Status: Active
Date: 2026-06-25
Decision: SLF agents must use server/API and wiki data as primary knowledge sources, with forum_faq as advisory context only.
Scope: all agents that analyze game rules, tactics, recommendations, transfers, player status, or implementation behavior based on SLF knowledge/data.

## Context

SLF uses multiple knowledge sources:

- server/API structured data;
- `wiki_docs` and documented game-rule data;
- tactics and preset data;
- match snapshots/results;
- forum-derived `forum_faq` notes.

These sources do not have equal authority. Forum-derived notes are useful but can be fragmentary, contextual, or advisory.

## Decision

Agents must apply this source priority:

1. Server/API structured data and current API output.
2. Official wiki/docs data from `wiki_docs` or equivalent canonical documentation.
3. Tactics/preset data from `tactics`, `preset_effects*`, and `preset_events*`.
4. Match data from `match_results*` and `match_snapshots*`.
5. Player/status data where relevant.
6. `forum_faq` as advisory context only.
7. Screenshots or user description as task context, not as canonical project data.

If wiki/API data conflicts with `forum_faq`, wiki/API data wins.

`forum_faq` must not be treated as official rules unless the same claim is confirmed by wiki/API or another canonical source.

## Consequences

- Tactical and recommendation outputs must report which knowledge sources were used.
- Missing required API/wiki data can block API-validated conclusions.
- Forum notes can support reasoning, but must be labeled advisory.
- Agents must not invent rules or available tactics when the canonical sources are absent.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/strategy-data-recommendations.md`
- `contracts/branches/transfer-analyzer.md`
- `contracts/branches/team-management.md`
