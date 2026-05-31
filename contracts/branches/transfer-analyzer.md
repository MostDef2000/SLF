# Branch Contract: transfer-analyzer

## Role

High-frequency product branch for transfer market logic, MKT/TM/SLF alter valuation, transfer recommendations, and transfer UI/details.

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
