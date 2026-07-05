# SLF Task Runtime Contract

Version: 1.0.0
Status: Active
Applies to: all SLF implementation, release, governance, fallback, and acceptance workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The SLF Task Runtime Contract defines the mandatory state model for SLF work.

Its purpose is to prevent ambiguous completion claims such as `готово`, `ready`, or `done` when only an intermediate phase is complete.

Every implementation/release workflow must expose or maintain a runtime state until it reaches one of the terminal states:

```text
COMPLETE
BLOCKED
FAILED
```

## 2. Runtime phases

Allowed phases:

```text
DISCUSSION
READY_FOR_IMPLEMENTATION
IMPLEMENTING
MODULE_COMMITTED
HANDOFF_VALIDATED
CORE_RELEASE_INTEGRATING
SOURCE_INTEGRATED
ACTIONS_REQUIRED
ACTIONS_RUNNING
ACTIONS_COMPLETED
BROWSER_ACCEPTANCE
COMPLETE
BLOCKED
FAILED
```

## 3. Phase meanings

### DISCUSSION

The task is being shaped. No repository write is allowed.

### READY_FOR_IMPLEMENTATION

Scope is clear and the task is ready for implementation after required approval.

### IMPLEMENTING

The responsible module agent is actively applying the approved change.

### MODULE_COMMITTED

Approved implementation exists in the module branch.

This is not release-ready.

### HANDOFF_VALIDATED

The module output was validated by Project Manager / release gate checks and is eligible for Core Release.

### CORE_RELEASE_INTEGRATING

Core Release is applying the approved source changes into `main`.

### SOURCE_INTEGRATED

Approved source/tooling files are verified on `main`.

This does not mean the Tampermonkey release artifact is updated.

### ACTIONS_REQUIRED

The user may run GitHub Actions because source integration is complete and runtime/build-affecting files require a latest-release build.

### ACTIONS_RUNNING

GitHub Actions are running. The safe action is to wait for completion.

### ACTIONS_COMPLETED

GitHub Actions completed and release artifacts were produced/committed.

### BROWSER_ACCEPTANCE

The change needs browser/Tampermonkey validation after Actions completed.

### COMPLETE

The task lifecycle is complete. Required implementation, source integration, release build, and acceptance gates are complete or explicitly not required.

### BLOCKED

A safe required step cannot be completed. The agent must provide the exact next safe manual action.

### FAILED

The task failed due to implementation, integration, build, or validation failure. The agent must provide the failure reason and recovery path.

## 4. Required runtime block

For implementation/release tasks, the agent must maintain this block internally and include it in user-facing status when relevant:

```text
SLF Task Runtime
- Task:
- Responsible agent:
- Current phase:
- Branch:
- Approved commit/range:
- Changed files:
- Module implementation:
- Core Release integration:
- main updated:
- Actions needed:
- Safe user action:
- Final state:
```

## 5. Transition rules

- `MODULE_COMMITTED` must not be treated as release-ready.
- `SOURCE_INTEGRATED` must not be treated as released.
- `ACTIONS_REQUIRED` is the earliest phase where the user may be told to run GitHub Actions.
- `COMPLETE` requires all required gates to be complete or explicitly not applicable.
- Any blocked transition must move the task to `BLOCKED` and include a precise safe manual fallback.
- Any failed transition must move the task to `FAILED` and include evidence and recovery guidance.

## 6. User-action rules

The agent must not tell the user to:

- run GitHub Actions before `ACTIONS_REQUIRED`;
- treat a module branch commit as released;
- manually copy handoffs between agents when same-chat continuation is available;
- trust unstated assumptions instead of runtime evidence.

## 7. Status wording rule

The agent must not use broad completion wording such as `готово`, `done`, `release-ready`, or `released` unless the runtime state supports it.

Preferred wording:

```text
Phase: MODULE_COMMITTED
Safe user action: DO NOT RUN ACTIONS YET
Next action: Core Release integration
```

```text
Phase: ACTIONS_REQUIRED
Safe user action: Run GitHub Actions on main
```

```text
Phase: COMPLETE
Safe user action: none
```

## 8. Relationship to other contracts

This contract is referenced by:

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
