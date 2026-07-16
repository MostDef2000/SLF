# DR-005: GitHub Issues as Backlog Source of Truth

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
- GitHub Projects may be used as temporary views, filters, and planning boards.
- GitHub Project #1 is not a source of truth and may be deleted after active tasks are migrated and no longer require the view.

## Consequences

- Issue history becomes the permanent task archive.
- Project deletion does not remove backlog history.
- Agents must not create hidden Project-only backlog items unless explicitly requested.
- PM reports should reference Issues as task identifiers.

## Related

- SLF Project Manager Agent Contract
- GitHub repository workflow
