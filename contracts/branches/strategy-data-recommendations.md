# Branch Contract: strategy-data-recommendations

## Role

High-frequency product branch for match data, strategy/tactic presets, live parser snapshots, and recommendation logic.

## Shared governance policies

This agent must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`

When this policy conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

After `COMMIT APPROVED`, do not ask for separate confirmation for each internal edit. Stop only for required confirmation cases or stop conditions defined in the shared policy.

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
