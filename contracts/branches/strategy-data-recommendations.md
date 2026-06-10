# Branch Contract: strategy-data-recommendations

## Role

High-frequency product branch for match data, strategy/tactic presets, live parser snapshots, and recommendation logic.

## Shared governance policies

This agent must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`

When shared governance conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

After `COMMIT APPROVED`, do not ask for separate confirmation for each internal edit. Stop only for required confirmation cases or stop conditions defined in shared governance.

## Branch lifecycle and source rule

`main` is the long-term source of truth after release. This module branch is a disposable working branch, not long-term storage.

Before implementation, perform the Branch Freshness Check defined in `contracts/SLF_GOVERNANCE.md`.

Do not implement from a stale `strategy-data-recommendations` branch. If this branch is not fresh from current `main` and there is no explicitly approved active diff/range, stop and request branch reset/recreate from current `main`.

Read implementation source from `main/src/**` or from a verified fresh `strategy-data-recommendations` branch. Do not use `releases/latest.user.js` as editable source.

## Server/API knowledge source policy

For game knowledge, strategy data, wiki data, and data-export content, the authoritative source is the current server/API data.

The Strategy Data Agent may use approved read-only API/server access to inspect the current game knowledge source directly when a task requires it.

Rules:

- Server/API data is the source of truth for current game knowledge.
- Local export files are snapshots/caches/fallbacks, not the primary source of truth when server/API access is available.
- The agent may read server/API data for analysis, parser work, recommendation logic, and validation.
- The agent must not modify server/API data.
- The agent must not send write requests, mutations, destructive requests, or admin/update operations to the server/API.
- The agent must not store, print, commit, or expose credentials, cookies, tokens, session IDs, or secrets.
- If credentials are required and not already safely available in the user's environment, the agent must stop and ask the user for a safe read-only workflow rather than requesting secrets in chat.
- Any API use must be described as read-only in the technical report.
- If live API data conflicts with an older export snapshot, live server/API data wins unless the user explicitly asks to analyze that snapshot historically.
- Export scripts such as `slf-wiki.ps1`, `slf-data.ps1`, `slf-all.ps1`, and `slf-check.ps1` are allowed as read-only acquisition/validation tooling when explicitly provided or approved by the user.

## Scope

This branch owns:

- uploaded or parsed match data workflows;
- live parser snapshots and match result parsing;
- strategy and tactic preset library;
- recommendation engine and tactical decision model;
- game.php recommendation UI;
- logic that makes recommendations account for available tactics/strategy presets.

## Allowed areas

- `src/modules/strategy-data-recommendations/**`
- `src/modules/live-parser/**`
- `src/modules/tactics-presets/**`

## Forbidden areas

- transfer analyzer logic;
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
