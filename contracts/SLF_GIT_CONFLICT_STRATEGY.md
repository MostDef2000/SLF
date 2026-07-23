# SLF Git Conflict Strategy

Version: 2.0.0
Status: Active compatibility contract
Source of truth: `contracts/SLF_GOVERNANCE.md`, `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`, and `contracts/branches/core-release.md`

## Purpose

This document defines deterministic, scoped, recoverable Git behavior for SLF. It exists to prevent stale-SHA conflicts, branch drift, unsafe parallel writes, partial integration, accidental overwrite of `main`, and confusion between source and generated release artifacts.

It does not override active governance, runtime, release, or domain contracts.

## Core principle

```text
read current state
→ verify approved scope and capability path
→ apply the approved change idempotently
→ validate complete output
→ commit on a fresh disposable branch
→ verify branch diff
→ PR and CI
→ merge into main
→ verify main
```

No write may be based on stale assumptions when the latest repository state can be re-fetched.

## Source and branch model

- `main` is the only long-term source of truth after integration.
- Task/domain branches are fresh disposable execution state.
- A branch used for completed work must not be reused for a new task unless recreated or refreshed from current `main`.
- Generated release artifacts are build outputs, not editable source.
- Governance changes follow the same branch → PR → CI → merge workflow; they must not be written directly to `main` during normal execution.

```text
Implementation source:      src/**
Governance source:          contracts/**
Generated release outputs:  releases/latest.user.js
                            releases/latest.meta.js
                            data/version.json
                            CHANGELOG.md
```

## Pre-write capability and scope check

Before the first repository write, the responsible agent must know:

```text
Repository
Current main SHA
Target branch and base SHA
Approved task and behavior
Required file set
Expected changed files
Forbidden paths
Write method for every required file
Post-write verification method
PR creation path
CI inspection path
Merge path
Release verification path when applicable
```

For multi-file work, a safe strategy for the complete required file set must exist before the first partial write.

## Branch freshness

Before implementation, perform the active `Branch Freshness Check`.

Rules:

- create the task branch from current `main`;
- do not implement from a stale branch;
- if no approved active diff exists, recreate from current `main`;
- before merge, verify the branch is not behind `main` and the changed-file list still matches scope;
- never force-push `main`.

## Execution-method fallback ladder

Use the first safe available method:

1. connector-native repository operations / GitHub Contents API;
2. Git Data API with blobs, tree, commit, and ref update;
3. local git with authenticated push;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step;
6. terminal `BLOCKED` only when no safe method remains.

Failure of one connector or tool is not a task-level blocker while another safe method remains.

## Recoverable conflict rule

Recoverable conflicts include:

- stale SHA;
- `409 Conflict`;
- file changed after read;
- branch advanced after read;
- the same patch is already partly applied;
- a deterministic non-semantic merge conflict.

Required behavior:

```text
1. re-fetch current main and target files;
2. verify the approved scope is still valid;
3. re-apply the same approved operation idempotently;
4. retry once using the current safe execution method or the next safe fallback;
5. re-read and verify the result;
6. continue from the last verified safe phase.
```

The user must not be asked to retry routine Git operations manually while an agent-executable fallback exists.

## Idempotency

Approved operations must be repeat-safe:

- no duplicate imports;
- no duplicate bundle entries or bootstrap mounts;
- no duplicate contract sections;
- no duplicate changelog entry for the same release;
- deleting an already absent approved reference is not a fatal error;
- adding an already present approved item does not create a second copy.

Before claiming success, re-read the target state.

## Atomicity and sequential writes

A runtime-required multi-file set must be integrated atomically or verified as a complete safe set on the isolated task branch before PR creation.

Typical atomic sets include:

```text
new module + bundle-order/bootstrap wiring
module deletion + reference cleanup
runtime source + required configuration/wiring
release artifacts + version metadata + changelog
```

Sequential writes are allowed on an isolated task branch only when:

- each intermediate state is confined to the branch;
- no partial state is merged into `main`;
- the complete file set is re-fetched and verified before PR creation;
- all actual changed files match the approved scope.

Do not advance `main` with incomplete runtime wiring.

## Conflict classification

### Recoverable

The approved intent is unchanged and the conflict can be resolved mechanically from current state.

Action: re-fetch, replay idempotently, retry once, and continue.

### Structural

Examples:

- expected file or anchor moved;
- manifest/bootstrap structure changed materially;
- approved handoff no longer matches current `main`;
- safe application would require interpreting new product behavior.

Action: return to scope/review. Use terminal `BLOCKED` only after the active blocker-evidence gate is satisfied.

### Scope or safety conflict

Examples:

- an unapproved file must change;
- generated artifacts would be edited as source;
- unrelated work would be overwritten;
- a destructive action was not approved;
- resolving the conflict requires guessing business logic;
- secrets or protected values would be exposed.

Action: do not apply the change. Request the required approval or return `FAILED`/`BLOCKED` according to active governance.

## Shared-file serialization

Work touching the same path or shared wiring must be serialized.

Shared paths include:

```text
src/app/bundle-order.json
src/bootstrap.js
.github/workflows/**
tools/build-latest-userscript.mjs
tools/check-bundle-order.mjs
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
core governance contracts
```

Parallel work is permitted only when writable paths and integration dependencies do not overlap.

## Bundle and bootstrap safety

Before modifying shared runtime wiring, verify:

- every referenced module exists or is created in the same complete set;
- deleted modules have no remaining references;
- no duplicate entry or mount exists;
- ordering changes are intentional and approved;
- JSON and JavaScript syntax remain valid;
- all required wiring changes are included.

A changed structure that cannot be reconciled mechanically must return to review rather than being guessed.

## Protected and secret-bearing files

- Never display or commit credentials, tokens, cookies, private environment values, or secret-bearing logs.
- Preserve unchanged protected ranges exactly.
- Never replace a protected file from incomplete or truncated content.
- Use hashes, redacted comparisons, or unchanged-range verification where appropriate.
- Existing unchanged secrets do not expand scope, but any new secret handling requires explicit approval.

## Release artifact safety

Generated release outputs must be produced by the canonical workflow, not hand-edited as implementation source.

Module and PM phases must not manually change:

```text
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

Documentation-only changes do not bump the userscript version or trigger a release. Manual workflow dispatch is fallback-only.

## Post-write integrity gate

After every file write and before creating or updating a PR:

1. fetch the complete written file from the branch;
2. verify it is not truncated;
3. verify expected structural markers and ending;
4. validate syntax or parseability where applicable;
5. compare the branch against current `main`;
6. verify all and only approved files changed;
7. verify forbidden/generated files were not modified;
8. verify the complete required file set is present.

A failed integrity check returns the task to implementation. It is not automatically a terminal blocker.

## PR, merge, and main advancement

A branch commit is an intermediate checkpoint.

The PM/Core Release must:

- open or update the PR;
- inspect CI and changed files;
- re-check branch freshness;
- merge only when safe;
- verify that `main` advanced to the expected integration result;
- verify exact files on `main`;
- continue to automatic release verification when applicable.

Do not stop after a prepared tree, commit, PR, merge, or running workflow.

## Blocker threshold

Agent-level `BLOCKED` is routed to safe recovery when possible.

The task may enter terminal `BLOCKED` only when:

- the required operation failed with evidence;
- current repository state was re-fetched;
- the primary method was attempted;
- safe fallbacks were evaluated and attempted where available;
- no deterministic agent-executable path remains;
- no narrow consolidated manual step can safely recover the lifecycle;
- the exact minimum recovery action is known.

Waiting for CI, mergeability, automatic workflow start, or release artifacts is not a blocker. An empty push-workflow lookup is not proof that the workflow did not run.

## Terminal reporting for Git blockers

A terminal Git blocker report must include:

```text
Final State: BLOCKED
Conflict type
Completed steps
Blocked operation
Affected files
Latest verified main SHA
Recovery attempts
Why remaining automatic recovery is unsafe
Minimum recovery action
Continuation checkpoint
```
