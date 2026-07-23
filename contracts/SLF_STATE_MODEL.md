# SLF State Model

Version: 2.0.0
Status: Active compatibility contract
Source of truth: `contracts/runtime/SLF_TASK_RUNTIME.md`

## Purpose

This document provides a compact orchestration-level state model. The detailed task phases and user-facing status rules are defined by `contracts/runtime/SLF_TASK_RUNTIME.md`.

## Orchestration states

```text
INIT
ROUTING
EXECUTING
RECOVERING
RETRYING
CONSOLIDATING
BUILDING
RELEASING
BROWSER_ACCEPTANCE
COMPLETE
BLOCKED
FAILED
```

Only one orchestration state may be active at a time. Only the Project Manager acting as orchestrator may change the system state.

## Canonical transitions

```text
INIT → ROUTING
ROUTING → EXECUTING
EXECUTING → ROUTING
EXECUTING → CONSOLIDATING
EXECUTING → RECOVERING
RECOVERING → RETRYING
RETRYING → EXECUTING
CONSOLIDATING → BUILDING        # when runtime/build release is required
CONSOLIDATING → COMPLETE        # documentation-only work after merge verification
BUILDING → RELEASING
RELEASING → BROWSER_ACCEPTANCE  # when browser acceptance is required
RELEASING → COMPLETE            # when browser acceptance is not required or deferred
BROWSER_ACCEPTANCE → COMPLETE
```

Transition to `BLOCKED` is allowed only after the blocker-evidence gate is satisfied. Transition to `FAILED` is allowed when implementation, integration, validation, or release has failed and no approved deterministic recovery remains.

## Executor results

Internal agents do not set system states. They return:

```text
READY_FOR_ROUTING
BLOCKED
FAILED
```

- `READY_FOR_ROUTING`: the current role completed its authorized phase.
- agent-level `BLOCKED`: the current role cannot continue within its authority; the orchestrator must attempt safe routing or recovery.
- `FAILED`: the role encountered a failure; the orchestrator determines whether recovery is possible.

## Mapping to task runtime phases

The authoritative detailed phases remain:

```text
DISCUSSION
READY_FOR_IMPLEMENTATION
IMPLEMENTING
MODULE_COMMITTED
HANDOFF_VALIDATED
CORE_RELEASE_INTEGRATING
SOURCE_INTEGRATED
MANUAL_STEP_REQUIRED
ACTIONS_REQUIRED
ACTIONS_RUNNING
ACTIONS_COMPLETED
BROWSER_ACCEPTANCE
COMPLETE
BLOCKED
FAILED
```

`ACTIONS_REQUIRED` is fallback-only. Normal eligible source changes move from `SOURCE_INTEGRATED` to `ACTIONS_RUNNING` automatically.

## Terminal states

The only terminal task states are:

```text
COMPLETE
BLOCKED
FAILED
```

Commits, handoffs, prepared trees, PRs, merges, and workflow-running states are intermediate and must not be presented as final.

## Completion conditions

Runtime/release work is `COMPLETE` only after approved source is verified on `main`, required CI passes, automatic release succeeds when applicable, release commit/version are verified, and browser/Tampermonkey instructions are explicit.

Documentation-only work is `COMPLETE` after approved files are merged and verified on `main`, with release marked not required.
