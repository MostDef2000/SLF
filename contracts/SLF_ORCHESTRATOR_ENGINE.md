# SLF Orchestrator Engine

Version: 2.0.0
Status: Active compatibility contract
Source of truth: `contracts/SLF_GOVERNANCE.md`, `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`, and `contracts/branches/project-manager.md`

## Purpose

The Orchestrator Engine is the SLF control system for task routing, state transitions, recovery, integration, release orchestration, and terminal-state decisions.

This document defines the engine model only. It does not replace active governance, runtime, release-gate, Core Release, Task Intake, or domain contracts.

## System model

```text
User request
→ Task Intake
→ Project Manager orchestration
→ domain executor
→ review and integrity gates
→ Core Release
→ CI and automatic release
→ runtime/browser acceptance
→ terminal state
```

## Authority

Only the Project Manager acting as orchestrator may:

- select the next internal role;
- change the system task state;
- choose recovery and fallback paths;
- validate handoffs;
- merge approved work;
- determine release applicability;
- declare `COMPLETE`, `BLOCKED`, or `FAILED`.

Domain agents and release executors are stateless within their authority boundaries. They must not silently expand scope or declare system-level completion.

## Execution loop

```text
while task_state not in [COMPLETE, BLOCKED, FAILED]:
    role = select_next_role(task_state, approved_scope, repository_state)
    result = execute(role)

    if result == READY_FOR_ROUTING:
        validate_handoff_and_route()

    if result == BLOCKED:
        if safe_recovery_exists():
            transition_to_recovery()
            recover_idempotently()
            retry_once()
        else:
            validate_blocker_evidence()
            task_state = BLOCKED

    if result == FAILED:
        if deterministic_recovery_is_safe():
            recover_idempotently()
            retry_once()
        else:
            task_state = FAILED

    if completion_conditions_are_verified():
        task_state = COMPLETE
```

## Agent output contract

Internal executor results are:

```text
READY_FOR_ROUTING
BLOCKED
FAILED
```

`READY_FOR_ROUTING` means the current role completed its authorized phase and the orchestrator must select the next role. It is not a final user-facing state.

## Git and recovery model

- `main` is the only long-term source of truth.
- Task/domain branches are disposable execution state.
- Commits are checkpoints, not completion.
- Recoverable stale-SHA, branch-advance, or idempotent partial-application problems require re-fetch, safe replay, and one retry.
- Failure of one connector or execution method is not a project blocker while another safe method remains.
- A required multi-file set must not be partially integrated into `main`.

## Release model

For eligible runtime/build changes merged into `main`, the orchestrator verifies the automatic `SLF Validate and Release` workflow and the resulting release commit/version.

Manual workflow dispatch is fallback-only. Documentation-only changes do not create a userscript release.

## Completion conditions

Runtime or release work is `COMPLETE` only when:

- all required roles have completed;
- approved source is verified on `main`;
- required CI passes;
- automatic release succeeds when applicable;
- release artifacts and version are verified;
- browser acceptance is complete, deferred, or explicitly not applicable;
- the Tampermonkey instruction is explicit.

Documentation-only work is `COMPLETE` when approved files are merged and verified on `main` and no runtime release is required.
