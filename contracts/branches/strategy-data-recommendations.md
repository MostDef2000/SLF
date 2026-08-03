# Branch Contract: strategy-data-recommendations

## Role

High-frequency product branch for match data, strategy/tactic presets, manual match telemetry, and recommendation logic.

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

## Server/API knowledge source policy

For game knowledge, strategy data, wiki data, data-export content, and `forum_faq` content, the authoritative current source is the live server/API data.

The Strategy Data Agent may use approved read-only API/server access to inspect the current game knowledge source directly when a task requires it.

Model:

```text
server/API = current source of truth
official wiki/API docs = primary game-rule source
local exports = cache/snapshot/fallback
forum_faq = fragment-based advisory knowledge source
Strategy Data Agent = read-only consumer of server/API knowledge
```

Knowledge priority for game rules:

1. Server/API structured data and current API output are the source of truth for current machine-readable game data.
2. Official Wiki and documented game rules have priority for mechanics, rule interpretation, and user-facing explanations.
3. `forum_faq` is an advisory context layer based on forum/developer/manager fragments.
4. If Wiki/API and `forum_faq` conflict, follow Wiki/API and mention `forum_faq` only as context.
5. `forum_faq` must never overwrite Wiki, API data, structured exports, or canonical game rules.

Rules:

- Server/API data is the source of truth for current game knowledge.
- Local export files are snapshots/caches/fallbacks, not the primary source of truth when server/API access is available.
- Local export files may be used for reproducible debugging, offline comparison, and fallback analysis.
- If live API data conflicts with an older export snapshot, live server/API data wins unless the user explicitly asks to analyze that snapshot historically.
- The agent may read server/API data for analysis, parser work, recommendation logic, and validation.
- The agent must not modify server/API data.
- The agent must not send write requests, mutations, destructive requests, or admin/update operations to the server/API.
- The agent must not use POST, PUT, PATCH, DELETE, or mutation endpoints unless the user creates a separate explicitly approved tooling task.
- The agent must not store, print, commit, or expose credentials, cookies, tokens, session IDs, or secrets.
- If credentials are required and not already safely available in the user's environment, the agent must stop and ask the user for a safe read-only workflow rather than requesting secrets in chat.
- Any API use must be described as read-only in the technical report.
- Export scripts such as `slf-wiki.ps1`, `slf-data.ps1`, `slf-all.ps1`, and `slf-check.ps1` are allowed as read-only acquisition/validation tooling when explicitly provided or approved by the user.

### forum_faq policy

`forum_faq` is a fragment-based advisory knowledge source.

The user provides parsed forum/developer/manager data as separate fragments. The Project Manager Agent normalizes each fragment into a small upload-ready `forum_faq` document and tells the user where to place/move it on the server after FTP upload.

`forum_faq` must support many small documents, not one merged master file. New data should be added as new documents unless the user explicitly requests replacing an existing document.

`forum_faq` is advisory: "принять к сведению". It must not overwrite `wiki` or `data`.

Strategy Data Agent rules for `forum_faq`:

- The agent may read `forum_faq` from server/API as read-only tactical/contextual hints.
- The agent must treat `forum_faq` as advisory context, not as primary official truth.
- `forum_faq` must not override `wiki` or `data` when there is a conflict, unless the user explicitly asks to analyze the forum hint itself.
- The agent may use `forum_faq` for recommendation explanations, tactical hints, and hypothesis generation.
- The agent must not create, edit, delete, upload, merge, or rewrite `forum_faq` documents.
- The agent must preserve fragment boundaries when referring to `forum_faq`; it must not assume all fragments form one canonical document.

When using server/API data, the Strategy Data Agent must report:

```text
Knowledge source:
- source type: server/API
- endpoint or source name:
- read timestamp:
- local export used: YES/NO
- forum_faq used: YES/NO
- API/export mismatch: YES/NO
- write/mutation attempted: NO
```

For recommendation-engine changes, Strategy Data Agent must explicitly state which server/API knowledge was used and whether any local export snapshot or `forum_faq` fragment was used for verification.

If API access is unavailable in the current environment, Strategy Data Agent must return BLOCKED or ask the user for a fresh export snapshot. It must not invent game knowledge from memory.

## Scope

This branch owns:

- uploaded or parsed match data workflows;
- manual match snapshots, tactic telemetry, and match result parsing;
- strategy and tactic preset library;
- recommendation engine and tactical decision model;
- game.php recommendation UI;
- logic that makes recommendations account for available tactics/strategy presets.

## Allowed areas

- `src/modules/strategy-data-recommendations/**`
- `src/modules/match-reading/**`
- `src/modules/manual-match-telemetry/**`
- `src/modules/tactics-presets/**`

## Forbidden areas

- transfer analyzer logic;
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
- knowledge source block when server/API, exports, or `forum_faq` were used

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
