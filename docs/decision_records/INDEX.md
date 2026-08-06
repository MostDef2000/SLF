# SLF Decision Records

Status: Active
Purpose: keep only durable project decisions that agents must preserve across chats and module tasks.

Decision Records are not task notes. Use them only when a decision changes or preserves long-term project rules.

## Records

| ID | Title | Status |
|---|---|---|
| DR-001 | Knowledge source priority | Active |
| DR-002 | Latest-only release model | Active |
| DR-003 | Capability-aware autonomous execution | Active |
| DR-004 | Loop engineering release hardening | Active |
| DR-005 | Standard module handoff | Active |
| DR-006 | Review gate verdicts | Active |
| DR-007 | Public API client-key boundary | Superseded by DR-009 |
| DR-008 | VPS source-control and deployment model | Proposed |
| DR-009 | Private VPS API bearer credential | Active |
| DR-010 | GitHub Issues as backlog source of truth | Active |
| DR-011 | SLF Task Intake as the entry stage | Active |
| DR-012 | Canonical scope approval boundary | Active |

## Numbering rule

Each DR identifier is unique. Renaming or replacing a record must not reuse an existing identifier. Historical records remain listed with their final status.

## When to create a new DR

Create a new DR only for durable rules such as:

- release model changes;
- branch/module ownership changes;
- API/data source priority changes;
- security/secrets handling rules;
- governance/process changes that affect multiple agents.

Do not create a DR for ordinary bug fixes, UI tweaks, parser adjustments, or one-off implementation choices. Those belong in the task/handoff report.
