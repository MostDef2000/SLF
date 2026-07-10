# SLF Control Plane Architecture

Version: 2.0.0
Status: Active
Applies to: all SLF agents, runtime, integration, release, and Tampermonkey handoff workflows
Source of truth: GitHub repository contracts

## 1. Overview

SLF is a controlled multi-agent delivery system for a Tampermonkey userscript.

The system is a stateful execution graph with approval boundaries, branch isolation, CI gates, automatic release, and explicit user handoff.

## 2. Core layers

### 2.1 Governance Layer

Defines global invariants:

- `main` is source of truth;
- generated release files are artifacts;
- module branches are disposable;
- `COMMIT APPROVED` is required before repository writes;
- automatic release is the default after approved runtime changes reach `main`;
- manual Actions execution is fallback-only.

Contracts:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`.

### 2.2 Runtime Layer

Defines task lifecycle and completion semantics.

Normal runtime flow:

```text
DISCUSSION
→ READY_FOR_IMPLEMENTATION
→ IMPLEMENTING
→ MODULE_COMMITTED
→ HANDOFF_VALIDATED
→ CORE_RELEASE_INTEGRATING
→ SOURCE_INTEGRATED
→ ACTIONS_RUNNING
→ ACTIONS_COMPLETED
→ BROWSER_ACCEPTANCE or COMPLETE
```

`ACTIONS_REQUIRED` exists only for manual fallback.

Contract:

- `contracts/runtime/SLF_TASK_RUNTIME.md`.

### 2.3 Release Gate Layer

Validates:

- exact source integration on `main`;
- changed-file scope;
- release applicability;
- automatic workflow execution;
- release commit and version;
- Tampermonkey update decision.

Contract:

- `contracts/runtime/RELEASE_READINESS_GATE.md`.

### 2.4 Orchestration Layer

Project Manager Agent:

- classifies tasks;
- routes work to the responsible domain agent;
- owns approval-state progression;
- validates handoffs;
- creates PRs;
- monitors CI;
- merges safe approved changes;
- monitors automatic release;
- reports Tampermonkey action.

Contract:

- `contracts/branches/project-manager.md`.

### 2.5 Domain Agent Layer

Specialized implementation contexts:

- Transfer Analyzer;
- Team Management;
- Strategy Data Recommendations.

Domain agents implement only inside approved scope and do not publish final release artifacts.

### 2.6 Core Release Layer

Core Release:

- verifies approved commits/ranges;
- reconciles against current `main`;
- integrates approved source/tool changes;
- validates PR and branch freshness;
- merges when safe;
- verifies automatic release output;
- returns the final Tampermonkey update decision.

Contract:

- `contracts/branches/core-release.md`.

### 2.7 Build and Release Layer

Canonical workflow:

```text
SLF Validate and Release
```

Pull request mode:

- validate source and bundle manifest;
- publish nothing.

Eligible `main` push mode:

- validate;
- build latest-only userscript;
- validate artifacts;
- commit release outputs to `main`.

Manual dispatch remains available only for fallback/recovery.

### 2.8 User Boundary Layer

The user normally performs only:

- task definition;
- one repository-write approval (`COMMIT APPROVED` or equivalent);
- browser acceptance when requested;
- Tampermonkey update when explicitly instructed.

The user does not normally:

- choose internal agents;
- copy handoffs;
- merge PRs;
- run GitHub Actions manually;
- decide whether a script update is required.

## 3. End-to-end execution flow

```text
User request
→ PM scope and readiness
→ COMMIT APPROVED
→ Domain implementation
→ Branch commit
→ Pull Request
→ CI validation
→ Merge into main
→ Automatic SLF Validate and Release
→ Release commit/version verification
→ Tampermonkey update instruction
→ Browser acceptance when required
→ COMPLETE
```

## 4. Approval semantics

`COMMIT APPROVED` authorizes all deterministic safe steps inside the approved scope:

- implementation;
- branch commits;
- PR creation;
- CI wait;
- merge;
- automatic release;
- release verification.

A new confirmation is required only for scope expansion, destructive action, protected-file permission, secrets, or behavior redesign.

## 5. Release trigger boundary

Automatic release is triggered only by runtime/build-affecting changes:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts, architecture documents, decision records, and other documentation-only changes do not publish userscript versions.

## 6. Final user handoff

Every completed task must state:

```text
GitHub Actions
- Mode: AUTOMATIC / NOT REQUIRED / MANUAL FALLBACK
- Status:
- User action:

Tampermonkey update
- Required: YES / NO / NOT YET
- Published version:
- User action:
```

The user must never infer whether updating the installed script is necessary.

## 7. Failure modes

- `BLOCKED`: a required safe transition cannot be completed; exact fallback is provided.
- `FAILED`: implementation, integration, CI, build, or artifact verification failed.
- Manual Actions is used only when automatic execution cannot be completed or safely retried by the agent.

## 8. Key principle

SLF correctness is defined by verified state transitions and release evidence, not by conversational claims.
