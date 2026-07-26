# SLF Backlog Intake Process

Version: 2.0.0
Status: Active
Owner: User
Primary role: SLF Project Manager Agent
Source of truth: GitHub Issues

## 1. Purpose

This document defines how free-form user ideas become durable, agent-ready SLF backlog tasks without requiring the user to prepare prompts, select agents, or manage internal handoffs.

## 2. Source of truth

GitHub Issues in `MostDef2000/SLF` are the durable backlog source of truth.

GitHub Projects may be used as optional views, filters, and planning boards. Project fields or cards must not replace, contradict, or block the Issue record.

Raw notes may temporarily live in chat or external notes. A task enters the durable backlog only after the user explicitly confirms creating or updating the relevant Issue.

## 3. Intake and routing flow

```text
Free-form user request
→ Task Intake preserves intent and prepares a Task Brief
→ PM checks duplicates and extensions
→ PM selects the responsible domain
→ user confirms Issue creation/update when a public backlog write is needed
→ PM manages same-chat discussion and Implementation Scope Check
→ explicit repository-write approval
→ implementation, PR, CI, merge, release verification
→ terminal state and Issue update
```

The user is not required to copy prompts between agents or manually move Project cards.

## 4. Author note

The user's original wording must be preserved verbatim as `Author note`. Normalized requirements are added separately and must not silently replace the original request.

## 5. Triage decision

For each backlog idea, the PM returns one of:

```text
NEW TASK
DUPLICATE
EXTENSION
NEEDS CLARIFICATION
```

- `NEW TASK`: no existing Issue covers the same problem and expected behavior.
- `DUPLICATE`: an existing Issue already covers the request; add the Author note only after user confirmation.
- `EXTENSION`: the request adds an acceptance check, edge case, risk, or follow-up to an existing Issue.
- `NEEDS CLARIFICATION`: materially blocking information is missing.

Before creating an Issue, inspect existing Issues by module, page/feature, keywords, expected behavior, affected domain, likely files, and acceptance-check similarity.

## 6. Responsible domains

Every actionable Issue names one primary responsible domain:

- Team Management;
- Transfer Analyzer;
- Strategy Data Recommendations;
- Core Release;
- Server/API Operations;
- Knowledge Export/RAG;
- Governance/Contracts.

Split cross-domain work into staged tasks when one atomic scope cannot be assigned safely.

## 7. Canonical Issue body

```markdown
## Author note

> Original user note, preserved verbatim.

## PM summary

Short normalized description.

## Problem

What is wrong or missing now.

## Expected behavior

What should happen.

## Responsible domain

One primary domain.

## Scope

What may be changed.

## Out of scope

What must not be changed.

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

## Agent task

DISCUSSION ONLY.

Active Task:
...

Do not modify the repository yet.
First return root cause, implementation plan, intended changed files, risks, and checks.
```

## 8. Labels and lifecycle statuses

Recommended status labels:

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

Meaning:

- `Inbox`: captured but not fully triaged.
- `Needs Triage`: duplicate check, scope, or blocking detail is unresolved.
- `Ready for Agent`: the Issue is agent-ready in DISCUSSION mode.
- `In Progress`: discussion or implementation is active.
- `Ready for Core Release`: a valid implementation handoff is ready for integration.
- `Waiting Actions`: source integration is complete and automated checks/release are pending.
- `Browser Testing`: repository checks passed and user-facing verification remains.
- `Done`: implementation, release, and required verification are complete.
- `Blocked`: progress requires missing evidence, a fix, permission, or user decision.

A Project board may mirror these statuses, but the Issue remains authoritative.

## 9. Approval boundaries

Creating or updating an Issue is a public GitHub write and requires explicit user confirmation for that action.

An Issue or backlog status does not authorize repository implementation. Repository writes require:

1. a current `Implementation Scope Check`;
2. explicit approval accepted by the active governance contracts.

Approval persists only within the exact approved scope.

## 10. Release traceability

As work progresses, keep the Issue updated with relevant evidence:

- approved implementation commit or range;
- integration commit or PR;
- CI result;
- release version when applicable;
- browser verification result;
- terminal state;
- follow-up tasks.

## 11. Rule of thumb

One backlog Issue should normally map to one small implementation task or a clearly staged series. Split broad ideas before implementation when that improves ownership, verification, or rollback safety.
