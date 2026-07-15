# SLF Task Runtime Contract

Version: 1.3.0
Status: Active
Applies to: all SLF implementation, release, governance, fallback, and acceptance workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The SLF Task Runtime Contract defines the mandatory state model for SLF work.

Its purpose is to prevent ambiguous completion claims such as `готово`, `ready`, or `done` when only an intermediate phase is complete.

Every implementation/release workflow must expose or maintain a runtime state until it reaches one of the terminal states:

```text
COMPLETE
BLOCKED
FAILED
```

The automatic release lifecycle is defined by `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md` and takes priority over older manual-Actions wording.

## 2. Runtime phases

Allowed phases:

```text
DISCUSSION
READY_FOR_IMPLEMENTATION
IMPLEMENTING
MODULE_COMMITTED
HANDOFF_VALIDATED
CORE_RELEASE_INTEGRATING
SOURCE_INTEGRATED
MANUAL_STEP_REQUIRED
ACTIONS_REQUIRED
ACTIONS_RUNNING
ACTIONS_COMPLETED
BROWSER_ACCEPTANCE
COMPLETE
BLOCKED
FAILED
```

## 3. Phase meanings

### DISCUSSION

The task is being shaped. No repository write is allowed.

### READY_FOR_IMPLEMENTATION

Scope is clear and the task is ready for implementation after required approval.

### IMPLEMENTING

The responsible module agent is actively applying the approved change.

### MODULE_COMMITTED

Approved implementation exists in the module branch.

This is not release-ready.

### HANDOFF_VALIDATED

The module output was validated by Project Manager / release gate checks and is eligible for Core Release.

### CORE_RELEASE_INTEGRATING

Core Release is applying the approved source changes into `main`.

### SOURCE_INTEGRATED

Approved source/tooling files are verified on `main`.

This does not mean the Tampermonkey release artifact is updated.

For runtime/build-affecting changes, the normal next phase is `ACTIONS_RUNNING` because the unified workflow starts automatically after the change reaches `main`.

### ACTIONS_REQUIRED

Manual GitHub Actions execution is required from the user.

This is a fallback-only phase. It may be used only when automatic execution did not start or cannot be safely re-run by the agent.

### ACTIONS_RUNNING

The automatic or fallback GitHub Actions workflow is running. The safe user action is to wait.

### ACTIONS_COMPLETED

GitHub Actions completed and release artifacts were produced and committed.

The agent must verify the release commit and published version before moving forward.

### BROWSER_ACCEPTANCE

The change needs browser/Tampermonkey validation after Actions completed.

### COMPLETE

The task lifecycle is complete. Required implementation, source integration, automatic release build, release verification, and acceptance gates are complete or explicitly not required.

The final response must state whether the user needs to update the Tampermonkey script.

### BLOCKED

A safe required step cannot be completed. The agent must provide the exact next safe manual action.

### FAILED

The task failed due to implementation, integration, build, or validation failure. The agent must provide the failure reason and recovery path.

## 4. Required runtime block

For implementation/release tasks, the agent must maintain this block internally and include it in user-facing status when relevant:

```text
SLF Task Runtime
- Task:
- Responsible agent:
- Current phase:
- Branch:
- Approved commit/range:
- Changed files:
- Module implementation:
- Core Release integration:
- main updated:
- Actions needed:
- Safe user action:
- Final state:
```

## 5. Transition rules

- `MODULE_COMMITTED` must not be treated as release-ready.
- `SOURCE_INTEGRATED` must not be treated as released.
- After approved runtime/build changes reach `main`, transition to `ACTIONS_RUNNING` automatically when the unified workflow starts.
- `ACTIONS_REQUIRED` is reserved for manual fallback only.
- `COMPLETE` requires all required gates to be complete or explicitly not applicable.
- Any blocked transition must move the task to `BLOCKED` and include a precise safe manual fallback.
- Any failed transition must move the task to `FAILED` and include evidence and recovery guidance.

## 6. User-action rules

The agent must not tell the user to:

- manually run GitHub Actions during the normal automatic path;
- treat a module branch commit as released;
- manually copy handoffs between agents when same-chat continuation is available;
- trust unstated assumptions instead of runtime evidence.

After `COMMIT APPROVED`, the PM must continue through branch, PR, CI, merge, automatic release, and release verification unless blocked by a defined safety condition.

## 7. Terminal response gate

After repository-write approval, the agent must not send a final response while the task is in a non-terminal phase.

Allowed final states are only:

```text
COMPLETE
BLOCKED
FAILED
```

Intermediate phases may be reported only as progress updates. After such an update, execution must continue automatically in the same task lifecycle.

Waiting for CI, mergeability calculation, an automatic release trigger, or release publication is not itself a blocker.

## 8. Automatic continuation loop

After repository-write approval, the responsible agent must repeatedly perform the next deterministic safe transition until a terminal state is reached.

The agent must not wait for another user message between:

- branch creation;
- implementation;
- post-write verification;
- pull request creation;
- CI completion;
- merge;
- automatic release;
- release verification.

A new confirmation is required only for scope expansion, destructive action, secrets, protected-file changes, behavior redesign, or a non-recoverable permission/platform blocker.

## 9. Post-write integrity gate

After every repository file write and before opening or updating a pull request, the agent must:

1. fetch the complete written file from the branch;
2. verify that it is not truncated;
3. verify required structural markers and expected ending;
4. validate syntax for changed executable files;
5. compare the branch against `main`;
6. confirm that changed files match the approved scope.

A failed integrity check returns the task to `IMPLEMENTING`. It must not advance to `HANDOFF_VALIDATED`.

## 10. Release verification hierarchy

Post-merge release verification must use this priority:

1. `data/version.json` exists on `main`;
2. `scriptVersion` is the expected new version;
3. `build.approvedCommit` matches the merged source commit;
4. `releases/latest.user.js` contains the same version;
5. a release commit exists for that version.

Workflow-run lookup is supplemental and must not be the sole source of truth because connector queries may omit push-triggered runs.

## 11. Tampermonkey handoff

Every completed implementation/release response must include:

```text
GitHub Actions
- Mode: AUTOMATIC / NOT REQUIRED / MANUAL FALLBACK
- Status: NOT STARTED / RUNNING / SUCCESS / FAILED / NOT APPLICABLE
- User action: NONE / exact fallback action

Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

Rules:

- A newer runtime release published successfully: `Required: YES`.
- Governance/docs-only task: `Required: NO`.
- Release running or failed: `Required: NOT YET`.
- Never tell the user to update before the release commit and version are verified.

## 12. Status wording rule

The agent must not use broad completion wording such as `готово`, `done`, `release-ready`, or `released` unless the runtime state supports it.

Preferred wording:

```text
Phase: MODULE_COMMITTED
Safe user action: none
Next action: Core Release integration by the PM
```

```text
Phase: ACTIONS_RUNNING
Safe user action: wait
```

```text
Phase: COMPLETE
Safe user action: follow the explicit Tampermonkey update instruction
```

## 13. Relationship to other contracts

This contract is referenced by:

- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`

- ## 14. Capability-aware continuation

This section extends the runtime state model and has priority where earlier
wording is incomplete.

### 14.1 MANUAL_STEP_REQUIRED

`MANUAL_STEP_REQUIRED` is a non-terminal phase used when one narrowly defined
user action is required because no available agent execution method can safely
perform that exact operation.

It must not be used for:

- routine approval;
- PR creation;
- CI waiting;
- mergeability calculation;
- normal merge;
- automatic release waiting;
- release verification that the agent can perform.

A valid manual-step instruction must include:

- exact branch;
- exact file paths;
- exact edit or operation;
- expected commit destination;
- verification criteria.

All known required manual edits must be consolidated into one instruction.

After the user reports completion, the responsible agent must:

1. verify the repository state;
2. confirm the changed-file scope;
3. resume from the next deterministic phase;
4. continue until a terminal state;
5. not request repository approval again for the unchanged scope.

### 14.2 Approval Persistence

Approval remains attached to the runtime task and exact approved scope until a
terminal state is reached.

Changing the execution mechanism does not invalidate approval.

This includes transitions between:

- connector writes;
- Git Data API writes;
- local git;
- `gh`;
- GitHub UI manual steps.

### 14.3 Blocker Evidence Gate

The runtime may enter `BLOCKED` only when all conditions below are satisfied:

1. the failed operation is required;
2. the failure is reproducible or supported by concrete error evidence;
3. the primary execution method was attempted;
4. at least one safe fallback was attempted when available;
5. no deterministic agent-executable path remains;
6. the issue cannot be represented as `MANUAL_STEP_REQUIRED`;
7. the response contains the exact minimum recovery action.

The following are not blockers:

- waiting for CI;
- waiting for mergeability calculation;
- waiting for an automatic workflow trigger;
- waiting for release artifacts;
- one unavailable connector method when another safe method exists;
- an empty push-workflow lookup when artifact verification remains available.

### 14.4 Automatic Continuation After Manual Steps

A manual step pauses only the unavailable operation. It does not terminate the
task lifecycle.

The next user message confirming completion must be treated as a continuation
signal, not a new task or new approval request.

### 14.5 Status Emission

The full runtime block must be maintained internally.

Intermediate user-facing messages should be omitted when the user requests
terminal-only reporting.

When intermediate reporting is necessary, it must be concise and execution must
continue immediately afterward.

After repository approval, a final response is permitted only for:

- `COMPLETE`;
- `BLOCKED` after passing the Blocker Evidence Gate;
- `FAILED`.
