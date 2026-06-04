# Branch Contract: team-management

## Role

Medium/low-frequency product branch for squad and team-management modules.

## Shared governance policies

This agent must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`

When shared governance conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

Do not ask for separate confirmation for every small internal edit after the user has provided `COMMIT APPROVED`. Stop only for required confirmation cases or stop conditions defined in shared governance.

## Branch lifecycle and source rule

`main` is the long-term source of truth after release. This module branch is a disposable working branch, not long-term storage.

Before implementation, perform the Branch Freshness Check defined in `contracts/SLF_GOVERNANCE.md`.

Do not implement from a stale `team-management` branch. If this branch is not fresh from current `main` and there is no explicitly approved active diff/range, stop and request branch reset/recreate from current `main`.

Read implementation source from `main/src/**` or from a verified fresh `team-management` branch. Do not use `releases/latest.user.js` as editable source.

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

This branch does not create module release manifests.

After every completed in-scope implementation task, return exactly two sections:

1. Technical report
- commit hash
- changed files
- summary
- checks
- files/scopes not changed

2. COPY-READY MESSAGE FOR CORE RELEASE AGENT
- Module name
- Source branch
- Approved commit
- Changed files
- Summary
- Integration notes
- Acceptance checks
- Safety checks
- Cache/schema/storage keys changed: YES/NO
- Bundle-order/module-registry changes needed: YES/NO
- Core Release Authorization

## COPY-READY MESSAGE requirements

Every implementation handoff must include a Core Release Authorization section stating:

- whether Core Release may integrate the approved files into main;
- that the approved commit and changed files must match the handoff;
- that release files and out-of-scope files must not be touched;
- that Core Release should create the source integration commit, not stop at a prepared tree;
- that Core Release must not publish release artifacts manually;
- that the user manually runs GitHub Actions only after Core Release reports RUN ACTIONS: YES.

The copy-ready handoff must explicitly state whether cache/schema/storage keys changed. Do not introduce new cache/schema/storage key versions unless explicitly required and approved.

The copy-ready handoff must explicitly state whether bundle-order or module-registry changes are needed.

## Integration

Core Release integrates approved commits from the copy-ready handoff.

Do not use:
- module-releases/
- manifest release flow
- release files
- version bump
- common userscript publication
