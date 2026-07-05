# SLF Control Plane Architecture

Version: 1.0.0
Status: Active
Applies to: all SLF agents, runtime, and release workflows
Source of truth: GitHub repository contracts

## 1. Overview

SLF is a multi-agent system for building, analyzing, and releasing a browser-based automation layer (Tampermonkey userscript) with controlled release flow.

The system is not a linear script pipeline. It is a controlled execution graph with runtime state, validation gates, and release integration.

## 2. Core layers

### 2.1 Governance Layer

Defines global invariants and constraints:

- main is source of truth
- releases are build artifacts
- module branches are disposable
- COMMIT APPROVED is required for implementation
- no direct editing of release artifacts

File:
- `contracts/SLF_GOVERNANCE.md`

## 2.2 Runtime Layer

Defines task lifecycle state machine:

- DISCUSSION → COMPLETE / BLOCKED / FAILED
- enforces state transitions
- prevents false completion claims

File:
- `contracts/runtime/SLF_TASK_RUNTIME.md`

## 2.3 Release Gate Layer

Validates readiness for GitHub Actions execution:

- checks main integration
- checks changed files
- checks build relevance
- controls RUN ACTIONS permission

File:
- `contracts/runtime/RELEASE_READINESS_GATE.md`

## 2.4 Orchestration Layer

Project Manager Agent:

- routes tasks to correct domain agent
- manages lifecycle coordination
- enforces runtime and release gates

File:
- `contracts/branches/project-manager.md`

## 2.5 Domain Agents

Specialized implementation agents:

- Transfer Analyzer (transfers, TM, alter, MKT)
- Team Management (team, youth, training)
- Strategy Data (live parser, tactics, recommendations)

Each agent owns a bounded context in `src/modules/*`.

## 2.6 Release Controller Layer

Core Release Agent:

- integrates approved module changes into main
- validates scope and safety
- decides release readiness state

## 2.7 Build Layer

GitHub Actions pipeline:

- builds latest userscript
- updates version metadata
- produces release artifacts

## 2.8 User Boundary Layer

User only interacts via:

- COMMIT APPROVED
- GitHub Actions run
- browser acceptance check

## 3. Execution flow

```text
User request
→ Project Manager classification
→ Domain agent implementation
→ Module branch commit
→ Core Release validation
→ main integration
→ Release Readiness Gate
→ GitHub Actions build
→ browser acceptance
→ COMPLETE
```

## 4. Runtime enforcement

All tasks must maintain runtime state from start to completion.

No step may skip state validation.

## 5. Failure modes

- BLOCKED: cannot proceed safely or verify state
- FAILED: execution failed or invalid state transition

## 6. Key principle

SLF is a controlled state machine system, not a free-form assistant pipeline.

Correctness is defined by state transitions, not by textual completion claims.
