# SLF Decision Records

Status: Active
Purpose: keep only durable project decisions that agents must preserve across chats and module tasks.

Decision Records are not task notes. Use them only when a decision changes or preserves long-term project rules.

## Active records

| ID | Title | Status |
|---|---|---|
| DR-001 | Knowledge source priority | Active |
| DR-002 | Latest-only release model | Active |
| DR-003 | Module branch integration model | Active |
| DR-004 | API token handling | Superseded by DR-007 |
| DR-005 | Standard module handoff | Active |
| DR-006 | Review gate verdicts | Active |
| DR-007 | Public API client-key boundary | Active |
| DR-008 | VPS source-control and deployment model | Proposed |

## When to create a new DR

Create a new DR only for durable rules such as:

- release model changes;
- branch/module ownership changes;
- API/data source priority changes;
- security/secrets handling rules;
- governance/process changes that affect multiple agents.

Do not create a DR for ordinary bug fixes, UI tweaks, parser adjustments, or one-off implementation choices. Those belong in the task/handoff report.
