# DR-010: GitHub Issues as Backlog Source of Truth

Status: Accepted
Date: 2026-07-16
Decision owner: SLF Project Manager / Governance
Scope: Project management workflow and task tracking

## Context

SLF previously used GitHub Project as a task board. During PM operation it became unclear whether the backlog source was Project cards or repository Issues.

The project should keep task history, ownership, discussion, and implementation context in a durable place that does not depend on a temporary board view.

## Decision

GitHub Issues in `MostDef2000/SLF` are the single source of truth for the SLF backlog.

Rules:

- New backlog tasks are created as Issues.
- Task discussion, acceptance criteria, and implementation notes live in Issues.
- Completed tasks remain as closed Issues for history.
- GitHub Projects may be used as optional views, filters, and planning boards.
- Project status and metadata must not replace or contradict the Issue record.
- Agents must not create Project-only backlog items unless explicitly requested.

## Consequences

- Issue history is the permanent task archive.
- Project deletion or reconfiguration does not remove backlog history.
- PM reports reference Issues as task identifiers.
- Project board automation is optional and must not block issue intake or execution.

## Related

- `contracts/SLF_BACKLOG_PROCESS.md`
- `contracts/branches/project-manager.md`
- `docs/decision_records/DR-011-task-intake-agent.md`
