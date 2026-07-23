# SLF Orchestration Loop

Version: 2.0.0
Status: Active compatibility contract
Source of truth: `contracts/SLF_GOVERNANCE.md` and `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`

## Purpose

This document defines the orchestration loop in compact form. It does not override the active governance, Project Manager, runtime, Core Release, or domain contracts.

## Principle

Agents are stateless executors. The Project Manager acts as the orchestrator and owns routing, state transitions, retries, recovery, integration, release verification, and the final task state.

The user submits the task once, provides repository-write approval after the `Implementation Scope Check`, performs browser acceptance when requested, and updates Tampermonkey only when explicitly instructed.

The user must not normally choose internal agents, copy handoffs, merge pull requests, or run GitHub Actions.

## Canonical loop

```text
Task Intake
→ canonical Task Brief
→ PM triage and duplicate review
→ Implementation Scope Check
→ repository-write approval
→ fresh disposable task/domain branch
→ domain implementation
→ post-write integrity verification
→ internal PM/Core Release handoff
→ pull request
→ CI validation
→ merge into main
→ automatic release when applicable
→ release commit/version verification
→ browser acceptance when applicable
→ COMPLETE
```

## Executor results and system states

Domain and release executors may return internally:

```text
READY_FOR_ROUTING
BLOCKED
FAILED
```

`READY_FOR_ROUTING` is an internal routing result, not a final user-facing task state.

Only the orchestrator may set a terminal task state:

```text
COMPLETE
BLOCKED
FAILED
```

Intermediate commits, prepared trees, pull requests, merges, workflow runs, and handoffs are not terminal states.

## Continuation rule

After repository-write approval, the orchestrator must repeatedly execute the next deterministic safe transition until a terminal state is reached.

It must not stop and wait for another user message between branch creation, implementation, verification, PR creation, CI, merge, automatic release, and release verification.

A new approval is required only for scope expansion, destructive action, an unapproved protected-file change, secrets or credentials, behavior redesign after validation failure, or a non-recoverable platform/permission blocker.

## Recovery rule

For a recoverable Git or context problem:

```text
re-fetch current main and target state
→ re-apply the approved operation idempotently
→ retry once
→ continue from the last verified safe state
```

Agent-level `BLOCKED` first routes to recovery when recovery is safe. System-level `BLOCKED` is terminal only after the blocker-evidence gate in the active governance and runtime contracts is satisfied.

Waiting for CI, mergeability, an automatic workflow trigger, or release publication is not a blocker.

## Release rule

Runtime/build-affecting changes use the automatic `SLF Validate and Release` workflow after merge to `main`.

Manual workflow dispatch is fallback-only. Documentation-only changes do not publish a userscript version.

## Completion rule

Runtime work is `COMPLETE` only when source is verified on `main`, required CI succeeds, the automatic release commit and version are verified, and the Tampermonkey/browser instruction is explicit.

Documentation-only work is `COMPLETE` after the approved files are merged and verified on `main`, with release marked not required.
