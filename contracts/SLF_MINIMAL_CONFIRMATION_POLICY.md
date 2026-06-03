# SLF Minimal Confirmation Policy

Version: 1.0.0
Status: Active
Applies to: all SLF agents
Source of truth: GitHub repository contracts

## 1. Purpose

This policy defines how SLF agents should reduce unnecessary confirmation requests while preserving safety.

The user wants agents to minimize repeated prompts and avoid asking for confirmation for every small step.

Agents must batch related decisions whenever it is safe to do so.

## 2. Default rule

Agents should ask for the minimum number of confirmations required to complete the task safely.

Do not ask for separate confirmation for every issue, file, planning note, verification step, tree creation, commit creation, ref update, or comment when the user has already approved the batch or the action is already authorized by contract.

Prefer one batch approval over many single-item approvals.

## 3. Batch approval pattern

For multi-item work, agents should:

1. inspect the current state;
2. prepare a complete proposed batch;
3. show the user the full list of intended changes/actions;
4. ask one approval question for the entire batch;
5. after approval, execute the full batch without asking per item;
6. report what was completed and what, if anything, was blocked.

Example:

```text
I will add PM planning comments to issues #1, #2, #19, #13, #15, and #20.
Confirm once to apply this full batch.
```

After the user confirms, the agent should not ask again for each individual issue.

## 4. Backlog planning rule

When ranking backlog issues or adding PM planning comments, the Project Manager Agent should prepare the proposed ranking first and request one confirmation for the whole batch.

After confirmation, it may add comments or issue metadata to all approved issues without asking again per issue.

If a task is ambiguous, unsafe, or likely a duplicate, isolate that item and continue the safe part of the batch when possible.

## 5. Core Release rule

Core Release must not ask for confirmation between already-authorized integration steps.

When a valid module COPY-READY handoff or approved source/range is verified, Core Release should proceed through the full authorized sequence:

1. verify approved commit/range;
2. prepare integration tree;
3. create integration commit;
4. advance `main`;
5. verify files on `main`;
6. return Manual Build Action.

Do not ask separate confirmations for tree creation, commit creation, or ref update if the handoff is valid and in scope.

## 6. Module agent rule

Module agents default to DISCUSSION ONLY.

They must not write repository changes unless the user gives the exact phrase:

```text
COMMIT APPROVED
```

After `COMMIT APPROVED`, the module agent should complete the approved implementation task without asking repeated confirmation for each internal edit, unless a stop condition is reached.

## 7. Required confirmation cases

Agents must still ask for confirmation before:

- repository writes when no valid `COMMIT APPROVED` or equivalent authorized handoff exists;
- destructive actions;
- deleting files;
- changing release workflow behavior;
- exposing, storing, or moving secrets/API keys;
- changing cache/schema/storage keys or migrations beyond the approved plan;
- changing files outside the agent scope;
- expanding business logic beyond the approved task;
- running or recommending a release when source integration is incomplete;
- any action where the user explicitly asked to confirm first.

## 8. Stop conditions

Agents must stop and ask or return BLOCKED/FAILED when:

- scope is unclear;
- approved files do not match actual changed files;
- commit/range cannot be verified;
- GitHub/tool safety blocks a write;
- the operation would modify unapproved files;
- a destructive or security-sensitive step is required;
- the task cannot be completed safely in the current turn.

## 9. No silent approval

Minimizing confirmations does not mean assuming approval.

Silence is not approval.

For repository writes and other gated actions, approval must be explicit.

## 10. Reporting requirement

After executing a batch, agents should report:

- completed items;
- skipped items;
- blocked items;
- exact reason for each blocked item;
- whether any further user action is required.

## 11. Practical guidance

Good behavior:

```text
I found 12 backlog issues. I propose applying PM planning comments to 10 of them and skipping 2 duplicates. Confirm once to apply this batch.
```

Bad behavior:

```text
Should I comment issue #1?
Should I comment issue #2?
Should I comment issue #3?
```

Good behavior:

```text
The approved handoff is valid. I will integrate the approved files, advance main, verify, and return RUN ACTIONS status.
```

Bad behavior:

```text
Tree prepared. Should I create the commit?
Commit created. Should I advance main?
```
