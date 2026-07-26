# SLF Backlog Task Creation Contract

Version: 2.0.0
Status: Superseded compatibility document
Owner: SLF Project Manager Agent

The canonical backlog intake and issue-creation rules are defined in:

- `contracts/SLF_BACKLOG_PROCESS.md`
- `contracts/branches/task-intake.md`
- `contracts/branches/project-manager.md`
- `docs/decision_records/DR-010-issues-as-backlog-source.md`
- `docs/decision_records/DR-011-task-intake-agent.md`

This document remains only to redirect older references. It must not define an alternative status model, manual user-to-agent routing flow, or Project-board source of truth.

## Compatibility rules

- GitHub Issues are the durable backlog source of truth.
- GitHub Projects are optional views and must not block intake or execution.
- Task Intake normalizes free-form requests and hands the Task Brief to the PM internally in the same chat.
- The PM performs duplicate/extension checks, prepares the canonical Issue, selects the responsible domain, and manages lifecycle transitions.
- The user is not required to copy prompts between agents or manually move Project cards.
- Creating or updating an Issue requires explicit user confirmation for that public write.
- A backlog Issue does not authorize repository implementation.
- Repository writes require a valid `Implementation Scope Check` followed by explicit approval under current governance.

For all operational details, use `contracts/SLF_BACKLOG_PROCESS.md`.
