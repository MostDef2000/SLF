# Branch Contract: team-management

## Role

Medium/low-frequency product branch for squad and team-management modules.

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
