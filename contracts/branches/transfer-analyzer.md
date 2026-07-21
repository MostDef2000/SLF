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

`main` is the only long-term source of truth after integration. This contract defines domain ownership; it does not define a permanent workflow branch.

For each approved implementation task, use a fresh disposable task/domain branch created from current `main`. The exact branch name and base SHA must be recorded in the Implementation Scope Check.

Before implementation, perform the Branch Freshness Check defined in `contracts/SLF_GOVERNANCE.md`.

Do not implement from a stale branch. If a candidate branch is not fresh from current `main` and there is no explicitly approved active diff/range, stop and recreate it from current `main`.

Read implementation source from `main/src/**` or from the verified fresh task/domain branch. Do not use `releases/latest.user.js` as editable source.

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

This domain does not create module release manifests.

After every completed in-scope task, produce exactly two internal artifacts:

1. Technical report
- commit hash
- changed files
- summary
- checks
- files/scopes not changed
- knowledge source block when server/API, exports, Wiki, or `forum_faq` were used

2. Internal PM/Core Release handoff
- module name
- source task/domain branch
- approved commit
- changed files
- summary
- integration notes
- acceptance checks
- safety checks
- target next patch version if known
- instruction to integrate only approved files
- instruction not to invent business logic

The PM receives and validates this handoff internally in the same chat. Do not ask the user to copy the handoff, choose another agent, merge the PR, or run routine GitHub Actions.

## Integration

PM/Core Release integrates the approved commit after validating the internal handoff. `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md` governs CI and publication and overrides older manual-release wording.

Do not use:
- module-releases/
- manifest release flow
- release files
- version bump
- common userscript publication
