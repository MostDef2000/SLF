# SLF Backlog Task Creation Contract

Version: 1.0.0
Status: Active
Owner: User
Primary role: SLF Project Manager Agent
Source of truth: GitHub Issues + SLF Backlog project board

## 1. Purpose

This contract defines how the SLF Project Manager Agent converts raw user ideas into backlog tasks.

The backlog is not a complex release tracker. It is a simple storage board for agent-ready task documents.

The user writes raw ideas in chat. The Project Manager Agent converts each idea into a GitHub Issue that the user can later open and send to the responsible agent.

## 2. Simple backlog flow

The process is:

```text
Raw idea in chat
→ Project Manager creates an agent-ready backlog issue
→ issue stays in Inbox
→ user starts discussing it with the responsible agent
→ user moves it to In Progress
→ task is released and checked
→ user moves it to Done
```

If the task cannot proceed, user moves it to Blocked.

## 3. Board statuses

Use only these statuses:

```text
Inbox
In Progress
Done
Blocked
```

### Inbox

The idea has been converted into an agent-ready backlog issue, but work has not started.

### In Progress

The user is discussing or implementing the task with the responsible agent.

### Done

The task has been implemented, released, and checked by the user.

### Blocked

The task cannot continue because required information, implementation, release, or user decision is missing.

## 4. Title rule

The issue title is for the user, not for agents.

It must be human-readable and explain what is inside the task.

Recommended format:

```text
[Module] What should be improved or fixed
```

Examples:

```text
[Team4] Кнопка обновить лагает и запускает лишние обновления
[Team4] Контракт игрока должен учитывать полную дату с годом
[Transfer] Текущий сезон в alter.php определяется неправильно
[Strategy] Подсказка должна появляться заранее перед финальным отрезком
[Core] Changelog должен писать смысл релиза, а не технический шаблон
```

Do not use vague titles such as:

```text
Task A
Commit 1
Fix bug
Update logic
```

## 5. Author note rule

The user's raw idea must be preserved as `Author note`.

The Author note must keep the original wording as much as possible.

The normalized agent task must be separate from the raw Author note.

## 6. Duplicate/extension check

Before creating a new issue, the Project Manager Agent should check existing backlog issues when possible.

Decision types:

```text
NEW TASK
DUPLICATE
EXTENSION
NEEDS CLARIFICATION
```

If duplicate or extension is likely, tell the user before creating a new issue.

If search is unavailable, say that duplicate check was not performed and proceed only if the user still wants the issue created.

## 7. Responsible agent

Every backlog issue must name one responsible agent:

```text
Team Management Agent
Transfer Analyzer Agent
Strategy Data Agent
Core Release Agent
Server/API/Security
Governance/Contracts
```

If the raw idea spans multiple agents, split it into separate backlog tasks.

## 8. Minimal issue body format

Every backlog issue must use this simple body format:

```markdown
## Author note

> Original user idea, preserved as written.

## Responsible agent

Team Management Agent / Transfer Analyzer Agent / Strategy Data Agent / Core Release Agent / Server/API/Security / Governance/Contracts

## Task for agent

DISCUSSION ONLY.

Active Task:
[short task name]

Problem:
[what is wrong or missing]

Expected behavior:
[what should happen]

Scope:
[what may be changed]

Out of scope:
[what must not be changed]

Do not commit yet.

First return:
- root cause
- implementation plan
- intended changed files
- risks
- checks

## Acceptance checks

1.
2.
3.

## Notes

-
```

## 9. Issue creation behavior

When the user writes:

```text
Идея для бэклога:
...
```

The Project Manager Agent should respond with:

```text
Backlog task draft

Decision:
NEW TASK / DUPLICATE / EXTENSION / NEEDS CLARIFICATION

Suggested title:
...

Responsible agent:
...

Issue body:
...

Next action:
Create issue / update existing issue / ask clarification
```

If the user confirms creation, create a GitHub Issue in `MostDef2000/SLF`.

## 10. Labels

Labels are optional in the simplified backlog.

If labels are available, use only simple module labels:

```text
module:team-management
module:transfer-analyzer
module:strategy-data
module:core-release
module:server-api
module:governance
```

Do not block issue creation if labels are not available.

## 11. GitHub Project board

The Project Manager Agent may create GitHub Issues, but may not always be able to add them directly to the GitHub Project board due to connector limitations.

After creating an issue, tell the user:

```text
Add this issue to SLF Backlog and set Status: Inbox.
```

If the GitHub Project auto-adds repository issues, no manual project action is needed.

## 12. Not an implementation approval

A backlog issue does not authorize repository writes.

The responsible agent must still start in DISCUSSION ONLY mode.

Repository writes require the explicit phrase:

```text
COMMIT APPROVED
```

## 13. Rule of thumb

One backlog issue should normally become one small implementation task or one small staged series.

If the idea is too large, split it before sending it to a module agent.
