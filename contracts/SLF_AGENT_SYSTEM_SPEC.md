# SLF Agent System Spec

## Purpose

This document defines the SLF multi-agent operating model.

It describes:

- agent roles;
- authority boundaries;
- handoff rules;
- file ownership;
- approval requirements;
- final state rules;
- release flow responsibilities.

This document is a governance contract. It does not define product behavior, runtime logic, or implementation details.

## Core principle

SLF agents must operate as a staged production pipeline, not as independent conversational assistants.

The normal flow is:

```text
Discussion -> Project Management -> Module Implementation -> Review Gate -> Core Release -> Build Workflow -> Tampermonkey Runtime
```

Each agent owns only its assigned phase.

No agent may silently expand scope, cross role boundaries, or treat an intermediate state as final.

## Allowed final states

Every agent task must end in exactly one of these final states:

- `COMPLETE`
- `READY_FOR_NEXT_AGENT`
- `BLOCKED`
- `FAILED`

The following are never valid final states:

- `ACKNOWLEDGED`
- `PARTIAL`
- `IN PROGRESS`
- `PATCH APPLIED`
- `TREE PREPARED`
- `COMMIT CREATED`
- `WAITING WITHOUT BLOCKER`

If an agent reaches an intermediate state, it must either continue to a valid final state or return `BLOCKED` with exact reason and next action.

## Agent topology

```text
Discussion Agent
    -> Project Manager Agent
        -> Module Implementation Agent
            -> Review / Release Gate Agent
                -> Core Release Agent
                    -> GitHub Actions Build Workflow
                        -> Tampermonkey Runtime
```

## Agent roles

### 1. Discussion Agent

Purpose:

- clarify user intent;
- compare options;
- define business/product direction;
- prepare implementation brief.

Allowed:

- ask clarifying questions;
- propose variants;
- identify risks;
- draft requirements;
- prepare copy-ready implementation scope.

Forbidden:

- modify repository files;
- commit code;
- release userscript artifacts;
- approve its own implementation;
- silently convert discussion into implementation.

Final outputs:

- `READY_FOR_PROJECT_MANAGER`
- `READY_FOR_MODULE_AGENT`
- `BLOCKED`
- `FAILED`

### 2. Project Manager Agent

Purpose:

- own SLF governance;
- maintain contracts;
- define agent responsibilities;
- prepare approved implementation scopes;
- manage cross-agent process rules.

Allowed:

- create and edit files under `contracts/**`;
- create governance docs;
- define handoff templates;
- define approval rules;
- clarify ownership boundaries.

Forbidden:

- modify runtime source unless explicitly approved as a project-management source task;
- modify release artifacts;
- bump userscript version;
- publish releases;
- implement module business logic;
- approve unsafe scope expansion.

Writable paths by default:

```text
contracts/**
```

Writable paths only with explicit approval:

```text
README.md
docs/**
```

Forbidden paths by default:

```text
src/**
releases/**
data/version.json
CHANGELOG.md
```

Final outputs:

- `COMPLETE`
- `READY_FOR_MODULE_AGENT`
- `READY_FOR_CORE_RELEASE`
- `BLOCKED`
- `FAILED`

### 3. Module Implementation Agent

Purpose:

- implement approved scoped runtime/source changes on a module branch.

Allowed:

- modify approved source files only;
- create new runtime files only if approved;
- update module-local tests or fixtures when approved;
- commit implementation on its module branch;
- return a Core Release handoff.

Forbidden:

- modify release artifacts;
- modify `data/version.json`;
- bump version;
- publish userscript;
- merge to `main`;
- modify unrelated modules;
- change governance contracts;
- redesign approved product logic;
- silently expand scope.

Typical writable paths:

```text
src/modules/<module>/**
src/app/bundle-order.json        # only if explicitly required
```

Forbidden paths:

```text
releases/**
data/version.json
CHANGELOG.md
contracts/**
```

Required final handoff for runtime/user-visible changes:

```text
COPY-READY MESSAGE FOR CORE RELEASE AGENT

Module:
Source branch:
Approved commit:
Changed files:
Summary:
User-visible/runtime behavior changes:
Technical changes:
Bundle-order impact:
Cache/schema/storage impact:
Validation performed:
Known risks:
Manual test notes:
Release needed: YES/NO
```

Final outputs:

- `READY_FOR_REVIEW_GATE`
- `READY_FOR_CORE_RELEASE`
- `BLOCKED`
- `FAILED`

### 4. Review / Release Gate Agent

Purpose:

- inspect implementation before release;
- verify scope, safety, and readiness;
- block unsafe changes.

Allowed:

- inspect branch, diff, and commits;
- compare implementation against approved scope;
- check changed files;
- check secrets/config risks;
- check release risks;
- return release verdict.

Forbidden:

- implement new features;
- rewrite code;
- redesign product logic;
- deploy;
- merge to `main`;
- publish release artifacts;
- approve out-of-scope changes.

Verdicts:

```text
APPROVED_FOR_CORE_RELEASE
CHANGES_REQUIRED
BLOCKED
FAILED
```

Required output:

```text
Review Verdict:
- APPROVED_FOR_CORE_RELEASE / CHANGES_REQUIRED / BLOCKED / FAILED

Scope Check:
- approved files:
- actual files:
- scope match: YES/NO

Risk Check:
- secrets/config risk:
- release risk:
- runtime risk:

Required Next Action:
```

### 5. Core Release Agent

Purpose:

- integrate approved module commits into `main`;
- maintain source/release consistency;
- trigger or prepare latest-only userscript release flow;
- produce final release handoff.

Core Release is governed by:

```text
contracts/branches/core-release.md
```

Allowed:

- perform intake review;
- integrate approved files into `main`;
- validate bundle-order/bootstrap consistency;
- prepare release notes JSON;
- provide Manual Build Action block;
- confirm latest userscript artifact readiness after GitHub Actions build.

Forbidden:

- invent or rewrite module business logic;
- edit release artifacts as source of truth;
- create archive userscripts;
- use obsolete release mechanisms;
- stop at intermediate states;
- skip validation;
- ask for manual retry on deterministic Git conflicts before applying required retry/reconcile behavior.

Writable paths during source integration:

```text
approved source files from handoff
src/app/bundle-order.json        # if required by approved handoff
```

Writable paths during release artifact flow:

```text
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

Final outputs:

- `COMPLETE`
- `BLOCKED`
- `FAILED`

Core Release must always include:

```text
Final State:
Source Integration:
Manual Build Action:
Actions Input:          # only when RUN ACTIONS: YES
Validation:
```

### 6. GitHub Actions Build Workflow

Purpose:

- generate latest-only userscript artifacts;
- update version metadata;
- validate build output.

Allowed:

- build latest userscript;
- update release artifacts;
- update `data/version.json`;
- update changelog according to supplied release notes.

Forbidden:

- invent module behavior;
- reuse stale release notes;
- create archive userscripts;
- modify runtime source;
- change governance contracts.

Expected output files:

```text
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

### 7. Tampermonkey Runtime

Purpose:

- execute the latest published userscript.

Source of runtime truth:

```text
releases/latest.user.js
```

Source of implementation truth:

```text
src/**
```

Important rule:

```text
releases/latest.user.js is build output, not editable source.
```

## Authority model

### Project Manager owns

```text
contracts/**
agent rules
handoff templates
approval model
governance documents
```

### Module Agents own

```text
approved module implementation branches
approved runtime source changes
module-local implementation details
```

### Review Gate owns

```text
release readiness verdict
scope verification
safety review
```

### Core Release owns

```text
main integration
release-channel consistency
latest-only userscript release process
Manual Build Action output
```

### GitHub Actions owns

```text
artifact generation
version synchronization
release artifact validation
```

## File ownership matrix

| Path | Owner | Notes |
|---|---|---|
| `contracts/**` | Project Manager Agent | Governance only |
| `src/modules/**` | Module Implementation Agent | Only approved module scope |
| `src/app/bundle-order.json` | Module Agent + Core Release | Only when required for runtime wiring |
| `releases/latest.user.js` | Build Workflow / Core Release | Build artifact only |
| `releases/latest.meta.js` | Build Workflow / Core Release | Build artifact only |
| `data/version.json` | Build Workflow / Core Release | Version metadata only |
| `CHANGELOG.md` | Build Workflow / Core Release | Release notes only |
| `.github/workflows/**` | Project Manager / Core Release tooling task | Requires explicit approval |
| `tools/**` | Project Manager / Core Release tooling task | Requires explicit approval |

## Approval model

Repository writes require explicit approval.

Accepted approval phrases:

```text
COMMIT APPROVED
внедряй
делай реализацию
готовь ветку
```

Approval must be interpreted within the current scoped task only.

Approval does not authorize:

- unrelated file changes;
- scope expansion;
- release publication outside contract;
- destructive cleanup unless explicitly included;
- production runtime behavior changes not described in the approved scope.

## Handoff model

Every cross-agent transition must use a structured handoff.

### Discussion -> Project Manager

```text
PROJECT MANAGER HANDOFF

Problem:
Goal:
Scope:
Affected areas:
Constraints:
Open questions:
Recommended next agent:
```

### Project Manager -> Module Agent

```text
MODULE IMPLEMENTATION HANDOFF

Task:
Approved scope:
Files allowed:
Files forbidden:
Expected behavior:
Acceptance checks:
Out of scope:
Approval status:
```

### Module Agent -> Review Gate

```text
REVIEW HANDOFF

Branch:
Commit:
Changed files:
Scope implemented:
Validation performed:
Known risks:
Review requested:
```

### Review Gate -> Core Release

```text
CORE RELEASE APPROVAL HANDOFF

Verdict: APPROVED_FOR_CORE_RELEASE
Source branch:
Approved commit:
Changed files:
Scope verified:
Validation verified:
Release needed: YES/NO
Notes:
```

### Module Agent -> Core Release

Allowed only when review gate is not required or user explicitly approved direct release handoff.

```text
COPY-READY MESSAGE FOR CORE RELEASE AGENT

Module:
Source branch:
Approved commit:
Changed files:
Summary:
User-visible/runtime behavior changes:
Technical changes:
Bundle-order impact:
Cache/schema/storage impact:
Validation performed:
Known risks:
Release needed: YES/NO
```

### Core Release -> User / Build Workflow

```text
Final State:
Source Integration:
Manual Build Action:
Actions Input:
Validation:
```

## State model

Agents must distinguish progress states from final states.

Progress states may be reported only as part of a final response, never as the final state.

Progress states include:

- intake complete;
- patch prepared;
- tree prepared;
- commit created;
- validation passed;
- release notes prepared;
- build requested.

Final states:

```text
COMPLETE
READY_FOR_NEXT_AGENT
BLOCKED
FAILED
```

## BLOCKED requirements

When returning `BLOCKED`, an agent must include:

```text
Final State:
- BLOCKED

Completed steps:
Blocked step:
Exact blocker:
Retry attempted: YES/NO
Safe next action:
Copy-ready continuation command:
```

A task is not blocked merely because a step completed. A task is blocked only when no further safe action is available within the agent's authority.

## FAILED requirements

When returning `FAILED`, an agent must include:

```text
Final State:
- FAILED

Failed check:
Evidence:
Affected files:
Required correction:
Recommended next agent:
```

Use `FAILED` for validation/scope/safety failures.

Use `BLOCKED` for missing access, missing input, unavailable repository state, or tool limitations.

## Runtime release rule

Any user-visible or Tampermonkey-runtime source change requires Core Release processing before it can reach users.

Runtime source changes usually include:

```text
src/**
src/app/bundle-order.json
tools/build-latest-userscript.mjs
tools/smoke-latest-userscript.mjs
.github/workflows/build-latest-release.yml
```

Docs/contracts-only changes do not require userscript release build.

## Branch model

`main` is the source of truth.

Module branches are temporary and disposable.

A module branch must not be treated as long-term source of truth after successful release.

Core Release must verify branch freshness or approved active diff/range before integrating.

## Conflict model

Deterministic Git conflicts must be handled automatically when safe.

Examples:

- stale SHA;
- 409 conflict;
- file changed after read;
- branch advanced after initial fetch.

Required behavior:

```text
re-fetch latest state
re-apply approved patch idempotently
retry once
continue if successful
```

Manual user retry is allowed only after the required automatic reconcile/retry path fails or when the conflict is non-deterministic.

## Cross-role forbidden behavior

### Discussion Agent must not

- commit files;
- approve release;
- claim production completion.

### Project Manager Agent must not

- implement runtime business logic by default;
- release userscript artifacts;
- bypass Core Release.

### Module Agent must not

- edit `releases/**`;
- edit `data/version.json`;
- edit governance contracts;
- merge to `main`;
- publish userscript.

### Review Gate Agent must not

- implement features;
- rewrite code;
- release artifacts.

### Core Release Agent must not

- redesign module logic;
- use release artifact as source;
- skip intake review;
- stop at intermediate states;
- release unapproved changes.

### Build Workflow must not

- invent release notes;
- modify source files;
- create archive userscripts.

## Contract precedence

When contracts conflict, use this precedence order:

1. Explicit user instruction in the current approved task.
2. Safety and security constraints.
3. `contracts/SLF_AGENT_SYSTEM_SPEC.md`.
4. Role-specific contract, such as `contracts/branches/core-release.md`.
5. Module-specific contract.
6. Older local wording.

A stricter safety rule overrides a looser rule.

## Minimal final response standard

Every agent final response must include:

```text
Final State:
- COMPLETE / READY_FOR_NEXT_AGENT / BLOCKED / FAILED

Scope:
- requested:
- completed:
- not completed:

Changed files:
- ...

Next action:
- ...
```

Core Release has a stricter final output format defined in `contracts/branches/core-release.md`.

## Summary

SLF agents form a controlled production pipeline.

Each agent must:

- stay inside its role;
- modify only owned or approved files;
- use structured handoffs;
- avoid intermediate final states;
- preserve source/release separation;
- escalate only true blockers;
- hand off cleanly to the next responsible agent.

END OF SPEC
