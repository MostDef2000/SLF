# SLF Agent System Specification

Version: 2.0.0
Status: Active compatibility contract
Source of truth: active SLF governance, automatic release, runtime, Project Manager, Core Release, release-gate, and domain contracts

## Purpose

This document describes the SLF multi-role operating model: authority boundaries, routing, handoffs, approval, file ownership, release responsibilities, and completion semantics.

It is a compatibility specification. It does not override higher-priority active contracts and does not define product behavior.

## Contract priority

Apply this order when wording differs:

1. `contracts/SLF_GOVERNANCE.md`;
2. `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
3. `contracts/runtime/SLF_TASK_RUNTIME.md` and `contracts/runtime/RELEASE_READINESS_GATE.md`;
4. `contracts/branches/task-intake.md`, `project-manager.md`, and `core-release.md`;
5. the relevant domain contract;
6. this document and older compatibility documents only where they do not conflict with the active set.

## Core model

SLF operates as a controlled same-chat delivery pipeline:

```text
User request
→ Task Intake normalization
→ Project Manager scope and routing
→ approved domain implementation
→ post-write integrity and review
→ Core Release integration
→ PR and CI
→ merge into main
→ automatic release when applicable
→ release/browser verification
→ terminal state
```

Roles are internal execution phases. The user must not normally choose agents, copy handoffs, merge PRs, or run GitHub Actions.

## Approval model

Repository writes require an explicit approval phrase accepted by active governance and issued after the Project Manager presents an `Implementation Scope Check`.

Approval is attached to the exact task, intended behavior, file set, and scope. It persists through branch creation, implementation, commits, PR, CI, merge, automatic release, and verification.

Additional approval is required only for scope expansion, destructive action, unapproved protected-file changes, secrets or credentials, behavior redesign after validation failure, or a non-recoverable platform/permission blocker.

## Agent topology and authority

### Task Intake

Purpose:

- preserve the original request and material clarifications;
- separate facts, assumptions, and open questions;
- produce the canonical Task Brief;
- decide `DISCUSSION` or `READY_FOR_IMPLEMENTATION` at the specification level.

Forbidden:

- repository writes;
- Issue, branch, commit, PR, merge, or release operations;
- treating ordinary discussion as approval.

### Project Manager / Orchestrator

Purpose:

- validate Task Intake;
- check duplicate/open/closed Issues;
- classify and stage work;
- emit the `Implementation Scope Check`;
- own approval progression, routing, branch freshness, handoff validation, PR/CI/merge, release verification, and final state.

The PM may operationally act as the responsible domain agent and Core Release agent in the same chat while obeying each role's contract.

### Domain Implementation Agent

Purpose:

- implement only the approved behavior in the responsible domain on a fresh disposable branch;
- change only approved source and test files;
- provide an internal technical report and PM/Core Release handoff.

Forbidden:

- editing release artifacts;
- bumping versions;
- changing unrelated modules or governance;
- merging to `main` independently;
- silently expanding scope or redesigning behavior.

### Review / Integrity Gate

Purpose:

- re-fetch and verify complete written files;
- check structure, endings, syntax, changed-file scope, secrets/config risk, runtime risk, and release applicability;
- return a release verdict consistent with active governance.

The active release verdicts are:

```text
APPROVED FOR RELEASE
CHANGES REQUIRED
BLOCKED
```

Review is not a terminal system state.

### Core Release

Purpose:

- validate the exact approved commit/range and handoff;
- reconcile with current `main`;
- create/update the PR;
- validate CI and branch freshness;
- merge when safe;
- verify automatic release and the published version;
- return the final Tampermonkey decision.

Forbidden:

- inventing business logic;
- manually editing generated release artifacts;
- stopping at prepared tree, commit, PR, merge, or running workflow;
- instructing routine manual Actions execution.

### GitHub Actions

The canonical workflow is `SLF Validate and Release`.

On pull requests it validates only. On eligible pushes/merges to `main` it validates source, builds latest-only artifacts, validates outputs, and commits generated release files.

Manual dispatch is fallback-only.

## Source and ownership model

```text
Implementation source:      main/src/** or a verified fresh task branch
Governance source:          contracts/**
Generated release outputs:  releases/latest.user.js
                            releases/latest.meta.js
                            data/version.json
                            CHANGELOG.md
```

`main` is the only long-term source of truth after integration. Task/domain branches are disposable. Generated release files are never editable implementation source.

Typical ownership:

| Path | Primary authority | Rule |
|---|---|---|
| `contracts/**` | Project Manager | Governance scope only |
| `src/modules/**` | Responsible domain agent | Approved domain scope only |
| `src/app/bundle-order.json` | Domain agent + Core Release | Only when required and approved |
| `tools/**` | PM/Core Release tooling task | Explicit approved scope |
| `.github/workflows/**` | PM/Core Release tooling task | Explicit approved scope |
| release outputs | GitHub Actions | Generated only |

## Handoff model

Cross-role handoffs are internal control artifacts in the same chat. The user must not normally copy or reformat them.

A domain handoff must identify:

```text
Module
Source branch
Approved commit/range
Changed files
Summary
User-visible/runtime behavior
Acceptance checks
Safety checks
Knowledge/data sources
Cache/schema/storage impact
Bundle-order impact
Core Release instruction
```

The Project Manager validates the handoff before Core Release integration.

## Executor results and terminal states

Internal executors may return:

```text
READY_FOR_ROUTING
BLOCKED
FAILED
```

`READY_FOR_ROUTING` is an internal transition signal. `READY_FOR_NEXT_AGENT` is not a final system state.

Only the Project Manager/orchestrator may set terminal states:

```text
COMPLETE
BLOCKED
FAILED
```

Commits, handoffs, prepared trees, PRs, merges, and workflow-running phases are intermediate.

## Git recovery and capability rules

- Read current state before write.
- Use a fresh disposable branch from current `main`.
- Re-fetch before resolving stale SHA or branch advancement.
- Re-apply approved operations idempotently and retry recoverable conflicts once.
- Use the first safe available execution method; one tool failure is not a project blocker.
- Determine the write strategy for the complete required file set before the first partial write.
- Do not integrate incomplete runtime wiring into `main`.
- Do not expose secrets or replace protected files from partial content.

Agent-level `BLOCKED` routes to safe recovery when possible. Terminal `BLOCKED` requires evidence that no agent-executable path or narrow recoverable manual step remains.

## Release applicability

Automatic userscript release is required only when merged changes affect the runtime/build trigger set defined by `SLF_AUTOMATIC_RELEASE_POLICY.md`.

Contracts, architecture documents, decision records, Issues, and other documentation-only changes do not publish a userscript version.

## Completion semantics

Runtime work is `COMPLETE` only after:

- implementation is committed and verified;
- PR validation succeeds;
- approved source is merged and verified on `main`;
- automatic release succeeds when applicable;
- release commit and version are verified;
- browser acceptance is completed, deferred, or not applicable;
- GitHub Actions and Tampermonkey user actions are explicit.

Documentation-only work is `COMPLETE` after approved files are merged and verified on `main`, with release marked not required.
