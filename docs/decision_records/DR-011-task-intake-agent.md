# DR-011: SLF Task Intake as the Entry Stage

Status: Accepted
Date: 2026-07-20
Decision owner: SLF Project Manager / Governance
Scope: SLF task intake, specification normalization, and PM handoff

## Context

SLF tasks are often entered as quick, informal dialogue. Requiring the user to manually write a complete implementation prompt creates avoidable friction and makes task quality depend on ad hoc PM interpretation.

The project already has explicit runtime phases, an approval boundary, Issues as the backlog source of truth, same-chat orchestration, and an autonomous post-approval lifecycle. The missing element is a controlled specification stage before PM triage.

## Decision

SLF will use a project-specific Task Intake Agent as the first stage of new task handling.

The agent will:

- accept free-form user dialogue;
- preserve the original request and constraints;
- separate facts, assumptions, and open questions;
- ask only materially blocking questions;
- produce a canonical Task Brief;
- use existing `DISCUSSION` and `READY_FOR_IMPLEMENTATION` phases;
- hand the brief to the PM internally in the same chat.

Task Intake will not create Issues, modify the repository, implement code, or interpret pre-scope discussion wording as repository-write approval.

The PM remains responsible for duplicate-Issue checks, the canonical Issue, `Implementation Scope Check`, repository-write approval, implementation, PR, CI, merge, release verification, and terminal reporting.

This decision applies only to SLF. It does not create or modify a global cross-project intake agent.

## Consequences

- The user can describe tasks quickly without manually engineering prompts.
- Task specifications become more consistent and auditable.
- The original intent remains visible beside normalized requirements.
- Only blocking ambiguity delays implementation readiness.
- No new runtime phase is required.
- The user does not copy handoffs between agents.
- Approval and repository-write authority remain unchanged.

## Alternatives considered

- Keep ad hoc PM normalization: rejected because output quality depends on each conversation.
- Require the user to write structured prompts: rejected because it preserves the current friction.
- Add a separate user-facing bot and manual handoff: rejected because it conflicts with same-chat orchestration.
- Create a global intake agent immediately: deferred until the SLF-specific process is validated.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/branches/task-intake.md`
- `contracts/branches/project-manager.md`
- `docs/architecture/slf-control-plane.md`
- `docs/decision_records/DR-010-issues-as-backlog-source.md`
- GitHub Issue #65
