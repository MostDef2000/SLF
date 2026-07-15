# DR-003: Capability-Aware Autonomous Execution

Status: Accepted  
Date: 2026-07-15  
Decision owner: SLF Project Manager / Governance  
Scope: All SLF implementation, integration, release, governance, and fallback workflows

## Context

The SLF control-plane contracts require an approved task to continue through
implementation, pull request, validation, merge, release, and verification
without repeated user confirmations.

In practice, tasks could still fragment into multiple chat turns because:

- execution capabilities were discovered only after partial writes;
- approval persistence across tool changes was not explicit;
- a single unavailable connector operation could be misclassified as `BLOCKED`;
- there was no general non-terminal phase for a narrow manual repository step;
- manual fallback instructions could be split across multiple user messages;
- intermediate status responses could terminate execution prematurely;
- empty workflow lookup results could be mistaken for failed publication.

## Decision

SLF adopts capability-aware autonomous execution.

Before the first repository write, the responsible agent must verify an
end-to-end execution path for the complete approved scope.

Repository-write approval persists across:

- interruptions;
- retries;
- connector changes;
- GitHub Contents API;
- Git Data API;
- local git;
- authenticated `gh`;
- GitHub UI fallback;
- continuation in later messages.

Repository writes use this fallback ladder:

1. connector-native or Contents API write;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step;
6. `BLOCKED` only when no safe recovery path remains.

`MANUAL_STEP_REQUIRED` is introduced as a non-terminal phase for one narrowly
defined user action.

The agent must resume automatic execution after verifying that manual step.

`BLOCKED` requires evidence that:

- the operation is required;
- the failure is real;
- the primary path was attempted;
- safe fallback paths were evaluated;
- no executable agent path remains;
- a manual step cannot recover the lifecycle;
- an exact recovery action exists.

Workflow-run lookup is supplemental. Release completion is determined by
repository artifacts and version evidence.

## Consequences

Positive consequences:

- fewer intermediate user actions;
- fewer repeated approval requests;
- earlier detection of execution limitations;
- less partial repository state;
- clearer distinction between a tool limitation and a project blocker;
- automatic continuation after manual recovery;
- less noisy user-facing status.

Tradeoffs:

- agents must perform a capability preflight before writing;
- agents must maintain more internal runtime state;
- fallback selection becomes an explicit responsibility;
- manual packages must be complete and independently verifiable.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
- `docs/architecture/slf-control-plane.md`
