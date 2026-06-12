# Branch Contract: transfer-analyzer

## Role

High-frequency product branch for transfer market logic, MKT/TM/SLF alter valuation, transfer recommendations, and transfer UI/details.

## Shared governance policies

This agent must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`

When shared governance conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

After `COMMIT APPROVED`, do not ask for separate confirmation for each internal edit. Stop only for required confirmation cases or stop conditions defined in shared governance.

## Branch lifecycle and source rule

`main` is the long-term source of truth after release. This module branch is a disposable working branch, not long-term storage.

Before implementation, perform the Branch Freshness Check defined in `contracts/SLF_GOVERNANCE.md`.

Do not implement from a stale `transfer-analyzer` branch. If this branch is not fresh from current `main` and there is no explicitly approved active diff/range, stop and request branch reset/recreate from current `main`.

Read implementation source from `main/src/**` or from a verified fresh `transfer-analyzer` branch. Do not use `releases/latest.user.js` as editable source.

## Game knowledge source priority

When transfer logic depends on game rules, player mechanics, economy rules, Transfermarkt context, or forum/developer explanations, use this priority order:

1. Server/API structured data and current API output are the source of truth for current machine-readable game data.
2. Official Wiki and documented game rules have priority for mechanics, rule interpretation, and user-facing explanations.
3. `forum_faq` is an advisory context layer based on forum/developer/manager fragments.
4. If Wiki/API and `forum_faq` conflict, follow Wiki/API and mention `forum_faq` only as context.
5. `forum_faq` must never overwrite Wiki, API data, structured exports, or canonical game rules.

Transfer Analyzer may read `forum_faq` as read-only advisory context for transfer taxes, TM/SD/TM-like data, economy discussion, player status explanations, and developer intent. It must not treat `forum_faq` as primary official truth and must not create, edit, upload, merge, or rewrite `forum_faq` documents.

## Scope

This branch owns:

- transfer pages analysis;
- MKT current price, p75 baseline, and ratio logic;
- TM enrichment used by transfers;
- SLF alter finalSkill used by transfer valuation;
- transfer verdict logic;
- transfer details/tooltip UI;
- transfer cache and history sync-only page.

## Allowed areas

- `src/modules/transfer-analyzer/**`

## Forbidden areas

- strategy-data-recommendations;
- live parser;
- tactics presets;
- team-management modules;
- release files;
- GitHub/Tampermonkey metadata.

## Output

This branch does not create module release manifests.

After every completed in-scope task, return exactly two sections:

1. Technical report
- commit hash
- changed files
- summary
- checks
- files/scopes not changed
- knowledge source block when server/API, exports, Wiki, or `forum_faq` were used

2. COPY-READY MESSAGE FOR CORE RELEASE AGENT
- module name
- source branch
- approved commit
- changed files
- summary
- integration notes
- acceptance checks
- safety checks
- target next patch version if known
- instruction to integrate only approved files
- instruction not to invent business logic

## Integration

Core Release integrates approved commits from the copy-ready handoff.

Do not use:
- module-releases/
- manifest release flow
- release files
- version bump
- common userscript publication
