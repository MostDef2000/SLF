# SLF Single-Chat Universal Agent

## Purpose

This contract defines the single-chat universal execution mode for SLF.

In this mode, one assistant conversation may execute multiple SLF agent roles sequentially while preserving the same governance, scope, approval, and release rules used by the dedicated agents.

This document does not replace module-specific contracts. It defines an operating mode for using them inside one conversation.

## Core principle

One chat may contain multiple logical agent phases.

Roles are phases, not separate conversations.

The assistant may act as:

```text
Orchestrator -> Project Manager -> Module Implementation -> Review Gate -> Core Release -> Release Verification
```

but each phase must remain logically separated and must follow its own authority boundaries.

## When this mode is allowed

Single-chat universal mode may be used when:

- the user explicitly asks the assistant to act as the universal SLF agent;
- the task can be executed with available repository/tooling access;
- required approvals are present;
- role boundaries can be preserved inside the conversation;
- the task does not require a separate external agent runner.

## Required phase structure

The assistant must make phase transitions explicit.

Recommended phase headers:

```text
Phase: Orchestrator Intake
Phase: Scope Check
Phase: Implementation
Phase: Review Gate
Phase: Core Release
Phase: Release Verification
Final State
```

Not every task requires every phase.

Docs/contracts-only tasks may stop after:

```text
Scope Check -> Governance Write -> Verification -> COMPLETE
```

Runtime tasks normally require:

```text
Scope Check -> Implementation -> Review Gate -> Core Release -> Build Instruction -> Release Verification
```

## Approval rules

Repository writes still require explicit approval.

Valid approval phrases include:

```text
COMMIT APPROVED
внедряй
делай реализацию
готовь ветку
```

If approval is absent, the assistant may prepare a plan, patch, or handoff, but must not write to GitHub.

## Role boundaries

### Orchestrator phase

Allowed:

- classify task type;
- choose route;
- detect required agents/phases;
- detect release need;
- decide whether the task is docs-only, source/runtime, release, or tooling.

Must not:

- change files before approval;
- skip scope check.

### Project Manager phase

Allowed:

- define scope;
- clarify requirements;
- edit governance files after approval;
- maintain contracts and backlog tasks.

Must not:

- change runtime source unless explicitly acting in a later implementation phase with approved scope.

### Module Implementation phase

Allowed:

- change only approved source files;
- create isolated implementation commits;
- perform minimal local cleanup inside approved scope.

Must not:

- change release files;
- bump version;
- edit `data/version.json`;
- edit `CHANGELOG.md`;
- silently expand scope;
- mix unrelated work.

### Review Gate phase

Allowed:

- inspect changed files;
- verify scope boundaries;
- identify release risks;
- return approval, required changes, or blocker.

Must not:

- approve unrelated changes;
- hide scope violations.

### Core Release phase

Allowed:

- integrate approved runtime/source changes into `main` when needed;
- prepare release handoff;
- verify release-channel requirements;
- instruct whether GitHub Actions build is required.

Must follow:

- `contracts/branches/core-release.md`;
- latest-only release rules;
- Git-safe continuous release execution.

Must not:

- treat `releases/latest.user.js` as editable source;
- create archive userscripts;
- stop at intermediate states.

### Release Verification phase

Allowed:

- verify `data/version.json`;
- verify `releases/latest.user.js`;
- verify `releases/latest.meta.js`;
- verify `CHANGELOG.md`;
- verify build result when available.

Must not:

- claim runtime browser behavior is verified unless actually checked by the user or test environment.

## Git safety rules

Single-chat mode must follow:

- `main` is source of truth;
- branches are disposable execution states;
- stale branch or stale SHA requires re-fetch/reconcile before write;
- unrelated changes must not be mixed;
- release files are build outputs unless the current phase is authorized release tooling.

If a branch is diverged and contains old unreleased work, the assistant must choose one of:

```text
reset/recreate from current main
release old approved work first
declare cumulative branch only with explicit user approval
```

## Output states

Valid final states:

```text
COMPLETE
BLOCKED
FAILED
```

Invalid final states:

```text
ACKNOWLEDGED
PARTIAL
IN_PROGRESS
PATCH_APPLIED
TREE_PREPARED
COMMIT_CREATED
WAITING_WITHOUT_BLOCKER
```

If an intermediate state is reached, the assistant must either continue to a valid final state or return `BLOCKED` with exact reason and next action.

## Runtime release rule

If `src/**` runtime behavior changes, release is normally required.

The assistant must output:

```text
Manual Build Action:
- RUN ACTIONS: YES|NO
- Safe to run now: YES|NO
- Required branch: main|not applicable
- Required workflow: Build latest SLF release|not applicable
- Reason: <reason>
```

Docs/contracts-only changes normally require:

```text
RUN ACTIONS: NO
```

## User workflow

The user may submit tasks directly to the universal agent using:

```text
SLF UNIVERSAL TASK

Goal:
...

Expected behavior:
...

Allowed files:
...

Forbidden:
...

Release needed:
YES / NO / UNKNOWN

COMMIT APPROVED
```

The assistant then performs all applicable phases inside the same conversation.

## Escalation rules

The assistant must return `BLOCKED` when:

- required file content cannot be read safely;
- write permission is blocked;
- scope is ambiguous and unsafe to infer;
- the requested change conflicts with repository contracts;
- runtime behavior cannot be safely validated without user/manual browser check;
- a destructive or cumulative branch action requires explicit approval.

## Contract precedence

This contract is subordinate to specific safety and release contracts.

When there is a conflict, stricter rules apply.

Relevant contracts:

- `contracts/SLF_AGENT_SYSTEM_SPEC.md`
- `contracts/SLF_ORCHESTRATION_LOOP.md`
- `contracts/SLF_ORCHESTRATOR_ENGINE.md`
- `contracts/SLF_STATE_MODEL.md`
- `contracts/SLF_GIT_CONFLICT_STRATEGY.md`
- `contracts/branches/core-release.md`

END
