# Branch Contract: team-management

## Role

Medium/low-frequency product branch for squad and team-management modules.

## Shared governance policies

This agent must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`

When shared governance conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

Do not ask for separate confirmation for every small internal edit after the user has provided `commit approved`. Stop only for required confirmation cases or stop conditions defined in shared governance.

## Branch lifecycle and source rule

`main` is the only long-term source of truth after integration. This contract defines domain ownership; it does not define a permanent workflow branch.

For each approved implementation task, use a fresh disposable task/domain branch created from current `main`. The exact branch name and base SHA must be recorded in the Implementation Scope Check.

Before implementation, perform the Branch Freshness Check defined in `contracts/SLF_GOVERNANCE.md`.

Do not implement from a stale branch. If a candidate branch is not fresh from current `main` and there is no explicitly approved active diff/range, stop and recreate it from current `main`.

Read implementation source from `main/src/**` or from the verified fresh task/domain branch. Do not use `releases/latest.user.js` as editable source.

## Game knowledge source priority

When team-management logic depends on game rules, youth/academy mechanics, training mechanics, real-career status, SoccerDonna/Transfermarkt context, or forum/developer explanations, use this priority order:

1. Server/API structured data and current API output are the source of truth for current machine-readable game data.
2. Official Wiki and documented game rules have priority for mechanics, rule interpretation, and user-facing explanations.
3. `forum_faq` is an advisory context layer based on forum/developer/manager fragments.
4. If Wiki/API and `forum_faq` conflict, follow Wiki/API and mention `forum_faq` only as context.
5. `forum_faq` must never overwrite Wiki, API data, structured exports, or canonical game rules.

Team Management may read `forum_faq` as read-only advisory context for youth academy, instant reports, real-career status, training, SoccerDonna, and developer intent. It must not treat `forum_faq` as primary official truth and must not create, edit, upload, merge, or rewrite `forum_faq` documents.

## Scope

This branch owns:

- SLF Team4 Status Monitor v1;
- real-career player status markers;
- team4 loan limit panel;
- training helper;
- youth scouting / youth monitor / youth autofill;
- small team4 and squad-management UI helpers.

No separate `youth-scouting` branch is used. Youth work belongs here.

## Allowed areas

- `src/modules/team-management/**`
- `src/modules/team4-status-monitor/**`
- `src/modules/team4-loans/**`
- `src/modules/training-helper/**`
- `src/modules/youth-monitor/**`

## Forbidden areas

- transfer analyzer logic;
- strategy-data-recommendations;
- live parser;
- tactics presets;
- release files;
- GitHub/Tampermonkey metadata.

## Output

This domain does not create module release manifests.

After every completed in-scope implementation task, produce exactly two internal artifacts:

1. Technical report
- commit hash
- changed files
- summary
- checks
- files/scopes not changed
- knowledge source block when server/API, exports, Wiki, or `forum_faq` were used

2. Internal PM/Core Release handoff
- Module name
- Source task/domain branch
- Approved commit
- Changed files
- Summary
- Integration notes
- Acceptance checks
- Safety checks
- Cache/schema/storage keys changed: YES/NO
- Bundle-order changes needed: YES/NO
- Core Release Authorization

## Internal handoff requirements

Every implementation handoff must include a Core Release Authorization section stating:

- whether Core Release may integrate the approved files into `main`;
- that the approved commit and changed files must match the handoff;
- that release files and out-of-scope files must not be touched;
- that Core Release must complete source integration rather than stop at a prepared tree;
- that generated release artifacts must not be published or edited manually;
- that `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md` governs CI and publication, while manual workflow dispatch is fallback-only.

The handoff must explicitly state whether cache/schema/storage keys changed. Do not introduce new cache/schema/storage key versions unless explicitly required and approved.

The handoff must explicitly state whether bundle-order changes are needed.

The PM receives and validates this handoff internally in the same chat. Do not ask the user to copy the handoff, choose another agent, merge the PR, or run routine GitHub Actions.

## Integration

PM/Core Release integrates the approved commit after validating the internal handoff. `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md` overrides older manual-release wording.

Do not use:
- module-releases/
- manifest release flow
- release files
- version bump
- common userscript publication
