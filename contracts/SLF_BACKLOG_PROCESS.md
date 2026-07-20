# SLF Backlog Intake Process

Version: 1.1.0
Status: Active
Owner: User
Primary role: SLF Project Manager Agent
Source of truth: GitHub Issues + GitHub Project board

## 1. Purpose

This document defines how raw user ideas become actionable SLF backlog tasks.

The user may write rough notes in natural language. The Project Manager Agent must preserve the original note and convert it into a structured backlog task that can later be given to the correct SLF agent.

The goal is to keep creative idea capture lightweight while making implementation controlled and traceable.

## 2. Backlog source of truth

Backlog tasks are stored as GitHub Issues.

The recommended project board is:

```text
SLF Backlog
```

The GitHub Project board should be used to view issue status, module ownership, priority, release state, and blocked tasks.

Raw notes may temporarily live in chat or external notes, but a task is not part of the actionable backlog until it is converted into a GitHub Issue.

## 3. User input format

The user may write:

```text
Идея для бэклога:
<raw text>
```

or any equivalent phrase that clearly indicates backlog capture.

The Project Manager Agent must not require the user to write a polished task. The PM agent must perform the triage.

## 4. Author note rule

The user's raw text must be preserved exactly as an Author note.

The Author note must not be rewritten, normalized, translated, or silently shortened.

The normalized task is added separately under PM summary / Problem / Expected behavior.

## 5. Backlog triage decision

For every backlog idea, the Project Manager Agent must decide one of:

```text
NEW TASK
DUPLICATE
EXTENSION
NEEDS CLARIFICATION
```

### NEW TASK

Use when the idea is not already covered by an existing issue.

### DUPLICATE

Use when an existing issue already covers the same problem and expected behavior.

The PM agent should recommend adding the Author note as a comment to the existing issue instead of creating a new issue.

### EXTENSION

Use when the idea belongs to an existing issue but adds a new acceptance check, edge case, risk, or subtask.

The PM agent should recommend either updating the existing issue or creating a linked follow-up issue.

### NEEDS CLARIFICATION

Use when the idea cannot be assigned to an agent or converted into acceptance checks without more information.

## 6. Duplicate and extension check

Before creating a new backlog task, search or inspect existing backlog issues by:

- module;
- page or feature name, such as `team4.php`, `game.php`, `transfer`, `alter.php`;
- keywords from the raw note;
- expected behavior;
- affected agent;
- likely files or runtime area;
- acceptance-check similarity.

If a likely duplicate or extension exists, do not create a new issue without telling the user.

## 7. Responsible agent

Every backlog task must specify one responsible agent:

- Team Management Agent;
- Transfer Analyzer Agent;
- Strategy Data Agent;
- Core Release Agent;
- Server/API/Security;
- Governance/Contracts.

If the task spans multiple agents, split it into separate issues or staged subtasks.

## 8. Backlog task structure

Every actionable GitHub Issue must include:

```markdown
## Author note

> Original user note, preserved verbatim.

## PM summary

Short normalized description.

## Problem

What is wrong or missing now.

## Expected behavior

What should happen.

## Responsible agent

Team Management / Transfer Analyzer / Strategy Data / Core Release / Server/API/Security / Governance.

## Scope

What may be changed.

## Out of scope

What must not be changed.

## Suggested implementation mode

DISCUSSION ONLY first.

## Acceptance checks

1.
2.
3.

## Risks

-

## Cache/schema/storage impact

Unknown / NO / YES.

## Bundle-order impact

Unknown / NO / YES.

## Changelog notes draft

User-visible/runtime changes:
-

Technical changes:
-

Storage/cache/schema impact:
-

Compatibility/safety:
-

## Agent prompt

```text
DISCUSSION ONLY.

Active Task:
...

Problem:
...

Do not commit yet.
First return root cause, implementation plan, intended changed files, risks, checks.
```
```

## 9. Recommended labels

Module labels:

```text
module:team-management
module:transfer-analyzer
module:strategy-data
module:core-release
module:server-api
module:governance
```

Type labels:

```text
type:bug
type:feature
type:refactor
type:cleanup
type:tech-debt
type:security
type:ux
```

Status labels:

```text
status:inbox
status:needs-triage
status:ready-for-agent
status:in-progress
status:ready-for-core-release
status:waiting-actions
status:browser-testing
status:done
status:blocked
```

Risk labels:

```text
risk:low
risk:medium
risk:high
```

## 10. Recommended project statuses

The GitHub Project board should use these statuses:

```text
Inbox
Needs Triage
Ready for Agent
In Progress
Ready for Core Release
Waiting Actions
Browser Testing
Done
Blocked
```

## 11. Status meaning

### Inbox

Raw idea captured, not yet fully triaged.

### Needs Triage

PM needs more details or must check duplicates/extensions.

### Ready for Agent

Issue has enough detail to send to the responsible agent in DISCUSSION ONLY mode.

### In Progress

Task has been sent to an agent or is being discussed/implemented.

### Ready for Core Release

Agent returned a valid COMPLETE handoff with approved commit or approved range.

### Waiting Actions

Core Release source integration is complete and RUN ACTIONS is YES.

### Browser Testing

Actions passed and the user must test in browser.

### Done

Browser acceptance checks passed and no follow-up is required.

### Blocked

Task needs missing information, agent fix, GitHub/tool unblock, or user decision.

## 12. Project Manager response format for backlog ideas

When the user writes a backlog idea, respond with:

```text
Backlog triage

Decision:
NEW TASK / DUPLICATE / EXTENSION / NEEDS CLARIFICATION

Author note:
<raw text verbatim>

Duplicate/extension check:
- Result:
- Related issue(s):

Normalized task:
...

Responsible agent:
...

Suggested GitHub issue title:
...

Labels:
...

Project status:
...

Issue body:
...

Next action:
Create issue / update existing issue / ask clarification
```

## 13. Agent-ready task rule

The final backlog issue must be directly usable as an input for the responsible agent.

The issue must contain an Agent prompt section that starts in DISCUSSION ONLY mode.

Implementation is not approved by the backlog issue itself. Repository writes still require the explicit phrase:

```text
COMMIT APPROVED
```

## 14. Release traceability

As tasks move through implementation and release, update the issue with:

- module approved commit or range;
- Core Release source integration commit;
- release version if known;
- GitHub Actions result;
- browser test result;
- follow-up tasks if any.

## 15. Manual fallback

If GitHub tool automation is blocked, manual GitHub UI fallback is allowed only for verified approved code.

Manual fallback files should be attached or linked in the issue if used.

## 16. Rule of thumb

One backlog task should normally map to one small commit.

If an idea is large, split it into staged tasks before implementation.
