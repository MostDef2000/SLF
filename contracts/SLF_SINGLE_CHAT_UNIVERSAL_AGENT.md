# SLF Single-Chat Universal Agent

Version: 2.0.0
Status: Active compatibility contract
Source of truth: active SLF governance, Project Manager, runtime, Core Release, release-gate, and domain contracts

## Purpose

This contract defines the single-chat execution mode for SLF. One conversation may execute several logical roles sequentially while preserving each role's authority, scope, approval, safety, and release boundaries.

This operating mode does not replace module-specific or higher-priority contracts.

## Core principle

Roles are internal phases, not separate conversations:

```text
Task Intake
→ Project Manager
→ Domain Implementation
→ Review / Integrity Gate
→ Core Release
→ Release Verification
```

The user must not normally select the next agent, copy handoffs between chats, merge pull requests, or manually run GitHub Actions.

## Contract priority

When wording differs, apply this order:

1. `contracts/SLF_GOVERNANCE.md`;
2. `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
3. `contracts/runtime/SLF_TASK_RUNTIME.md` and `contracts/runtime/RELEASE_READINESS_GATE.md`;
4. `contracts/branches/task-intake.md`, `project-manager.md`, and `core-release.md`;
5. the relevant domain contract;
6. this compatibility contract and older system documents only where they do not conflict with the active set.

## Approval boundary

Before any repository write, the Project Manager must present an `Implementation Scope Check` for the exact task, intended behavior, files, risks, and acceptance checks.

Repository writes require explicit approval accepted by active governance. Approval persists for the exact approved scope through the complete deterministic lifecycle.

After approval, no separate confirmation is required for branch creation, implementation, commits, PR creation, CI, merge, automatic release, or release verification.

New approval is required only for scope expansion, destructive action, unapproved protected-file changes, secrets or credentials, behavior redesign, or a non-recoverable platform/permission blocker.

## Required workflow

```text
Scope Check
→ approval
→ fresh disposable task/domain branch
→ implementation
→ post-write integrity verification
→ internal handoff
→ PR
→ CI
→ merge into main
→ automatic release when applicable
→ release/version verification
→ browser acceptance when applicable
→ COMPLETE
```

Phase boundaries must remain logically explicit internally even when user-facing progress reporting is concise.

## Role boundaries

### Task Intake

May normalize the request and produce the canonical Task Brief. It must not create Issues, branches, commits, PRs, or repository changes.

### Project Manager / Orchestrator

Owns classification, duplicate review, scope, approval progression, routing, branch freshness, handoff validation, PR/CI/merge, release verification, and terminal state.

### Domain Implementation

May change only approved source files in the responsible domain. It must not edit generated release artifacts, bump versions, alter unrelated modules, or expand business logic.

### Review / Integrity Gate

Must verify complete file content, structural integrity, syntax where applicable, exact changed-file scope, secrets/config risk, and consistency with current `main`.

### Core Release

Must validate the approved handoff, reconcile with current `main`, complete PR/CI/merge, and verify automatic release output. It must not invent product behavior or manually edit generated artifacts.

### Release Verification

Must verify the release commit and version hierarchy defined by the automatic release policy. Browser behavior may be claimed only when actually tested or explicitly accepted/deferred.

## Internal routing results and terminal states

Internal executors return:

```text
READY_FOR_ROUTING
BLOCKED
FAILED
```

The orchestrator alone sets terminal task states:

```text
COMPLETE
BLOCKED
FAILED
```

`READY_FOR_NEXT_AGENT`, copy-ready user handoffs, commits, prepared trees, PRs, merges, and running workflows are not final task states.

## Git and recovery rules

- `main` is the only long-term source of truth.
- Task/domain branches are fresh and disposable.
- Stale state requires re-fetch and reconciliation before write.
- Approved operations must be repeat-safe.
- Recoverable Git conflicts require re-fetch, idempotent replay, and one retry.
- Failure of one tool is not a project blocker while another safe method remains.
- Required multi-file changes must be verified as a complete set before PR creation and must not be partially integrated into `main`.

## Release behavior

Eligible runtime/build changes merged into `main` trigger the automatic `SLF Validate and Release` workflow.

Manual workflow dispatch is fallback-only and may be requested only when automatic execution cannot be safely completed or rerun by the agent.

Documentation-only changes do not publish a userscript release.

## User-facing completion

A final response after repository approval is permitted only for `COMPLETE`, `BLOCKED`, or `FAILED`.

Every terminal implementation or governance response must explicitly state GitHub Actions mode/status and whether a Tampermonkey update is required.
