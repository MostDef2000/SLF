# DR-005 — Standard module handoff

Status: Active
Date: 2026-06-25
Decision: Module implementation agents must return a copy-ready handoff block after completed in-scope work.
Scope: all module branches and Core Release intake.

## Context

SLF uses module-scoped work followed by Core Release integration. Core Release must receive exact scope, changed files, checks, and integration notes.

## Decision

Every completed module implementation task must end with a `COPY-READY MESSAGE FOR CORE RELEASE AGENT` block.

The handoff must include:

- module name;
- source branch;
- approved commit;
- changed files;
- summary;
- integration notes;
- acceptance checks;
- safety checks;
- knowledge/API sources used;
- cache/schema/storage impact;
- bundle-order impact;
- instruction to integrate only approved files.

If a field is not relevant, the agent must write `NONE` instead of omitting it.

## Consequences

- Core Release gets a stable input format.
- Module agents remain responsible for declaring scope and evidence.
- Missing handoff fields can be treated as `CHANGES REQUIRED` by review/release gates.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/core-release.md`
- `contracts/branches/strategy-data-recommendations.md`
- `contracts/branches/transfer-analyzer.md`
- `contracts/branches/team-management.md`
