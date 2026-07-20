# SLF Governance

Version: 2.3.0
Status: Active
Applies to: all SLF agents, implementation workflows, release workflows, and user handoffs
Source of truth: GitHub repository contracts

## 1. Contract priority

All agents must follow:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/branches/task-intake.md` for new-task normalization;
- `contracts/branches/project-manager.md` for orchestration;
- the relevant domain branch contract;
- runtime and release-gate contracts.

`contracts/SLF_AUTOMATIC_RELEASE_POLICY.md` overrides older wording that requires routine manual GitHub Actions execution.

## 2. Main source of truth

`main` is the only long-term source of truth after integration.

Editable implementation source is:

1. `main/src/**`; or
2. a fresh task branch created from current `main` and verified.

`releases/latest.user.js` and `releases/latest.meta.js` are generated Tampermonkey artifacts, not editable implementation source.

Agents must not implement from memory, stale branches, or generated release files.

## 3. Approval boundary

Repository writes require explicit approval through one of:

- `COMMIT APPROVED`;
- `commit approved`;
- `делай`;
- `внедряй`;
- `готовь ветку`;
- `делай реализацию`.

These approval phrases authorize repository writes only after the PM has emitted an `Implementation Scope Check` for the exact task, file set, scope, and intended behavior. Earlier intake or discussion wording must not be treated as repository-write approval.

Before implementation writes, the responsible agent must emit:

```text
Implementation Scope Check
```

After approval, the PM is authorized to execute the full deterministic safe lifecycle inside the approved scope:

```text
implementation
→ branch commit
→ pull request
→ CI validation
→ merge into main
→ automatic release
→ release verification
→ Tampermonkey update instruction
```

No separate confirmation is required before PR creation, merge, or automatic release.

A new confirmation is required only for:

- scope expansion;
- destructive action;
- protected-file permission not already granted;
- secrets or credentials;
- behavior redesign after validation failure;
- non-recoverable ambiguous conflict.

## 4. Disposable task branches

Task/module branches are disposable working branches, not long-term storage.

Before implementation, perform a Branch Freshness Check:

```text
Branch Freshness Check
- Current main SHA:
- Module branch:
- Module branch HEAD SHA:
- merge-base(module branch, main):
- Is merge-base equal to current main SHA: YES/NO
- Unreleased diff vs main: YES/NO
- Safe to implement from this branch: YES/NO
```

Rules:

- Do not implement from a stale branch.
- If no approved active diff exists, recreate the branch from current `main`.
- Before merge, verify the branch is not behind `main`.
- After integration and release, the branch may be deleted or recreated.

## 5. Domain branch boundaries

Domain agents must:

- edit only approved files inside their branch scope;
- not edit release artifacts;
- not bump version;
- not publish the common userscript;
- not add secrets, tokens, passwords, or credentials;
- provide an internal handoff for PM/Core Release validation.

The PM may operationally switch into domain-agent and Core Release roles in the same chat, while obeying each contract.

## 6. Same-chat orchestration

Default flow:

```text
Task Intake normalization
→ canonical Task Brief
→ Project Manager triage
→ domain implementation after approval
→ internal handoff
→ PM validation
→ Core Release integration
→ PR and CI
→ merge
→ automatic release
→ release verification
→ final user handoff
```

The user must not be asked to copy handoffs, choose agents, merge PRs, or manually run Actions when the system can continue safely.

## 7. Core Release handoff safety

Before integration, verify:

- approved commit/range exists;
- changed files match the handoff;
- branch freshness or approved active diff is clear;
- all changed files are in scope;
- release artifacts were not modified by the module branch;
- version was not bumped by the module branch;
- no secrets were introduced;
- required bundle-order changes are included.

If verification fails, return `BLOCKED` or `FAILED` and do not partially integrate.

## 8. Automatic release rule

Automatic release is required after approved changes reach `main` when they affect:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

The canonical workflow is:

```text
SLF Validate and Release
```

On Pull Request:

- validate only;
- do not publish.

On eligible push/merge to `main`:

- validate source;
- build latest-only userscript;
- validate outputs;
- commit generated release artifacts to `main`.

The PM/Core Release must monitor and verify this process automatically.

## 9. Documentation-only rule

Contracts, governance, architecture documents, decision records, issues, and documentation-only changes do not require a userscript release unless the release workflow itself changes in the same task.

Documentation-only changes must not produce empty userscript versions.

## 10. Version and artifact rule

A runtime-visible change is not released until GitHub Actions has produced and committed a newer userscript version.

Canonical release artifacts:

- `releases/latest.user.js`;
- `releases/latest.meta.js`;
- `data/version.json`;
- `CHANGELOG.md`.

Forbidden:

- manual editing of generated release artifacts;
- version-specific archive userscripts such as `releases/SLF_<version>.user.js`;
- using generated userscript as source;
- claiming publication before the release commit exists.

## 11. Manual Actions fallback

Manual `workflow_dispatch` is fallback-only.

It may be requested only when:

- automatic workflow did not start;
- automatic workflow failed for a recoverable infrastructure reason;
- the agent cannot safely rerun or dispatch it;
- the user explicitly requests a manual rerun.

Required fallback block:

```text
Manual fallback
- Reason:
- Workflow: SLF Validate and Release
- Required branch: main
- Exact GitHub UI path:
- Expected result:
```

Normal successful work must not instruct the user to press `Run workflow`.

## 12. Runtime model

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

Normal automatic path:

```text
SOURCE_INTEGRATED
→ ACTIONS_RUNNING
→ ACTIONS_COMPLETED
→ BROWSER_ACCEPTANCE or COMPLETE
```

`ACTIONS_REQUIRED` is reserved for manual fallback only.

`COMPLETE` for runtime work requires implementation, merge, automatic release, release version verification, and final Tampermonkey instruction.

## 13. Tampermonkey handoff

Every final implementation/release/governance response must include:

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

Decision rules:

- New runtime release verified: `Required: YES` and state the exact version.
- Governance/docs-only change: `Required: NO`.
- Release pending or failed: `Required: NOT YET`.
- Never make the user infer whether the installed script must be updated.

## 14. Permanent decisions

Durable changes to future agent behavior must be recorded in `docs/decision_records/`.

Decision records must include:

```text
Status:
Date:
Decision:
Scope:
Consequences:
Related contracts:
```

Repository contracts and active decision records override stale chat context.

## 15. Review verdicts

Review/release gate agents must end with exactly one verdict:

```text
APPROVED FOR RELEASE
CHANGES REQUIRED
BLOCKED
```

A release may be approved only when scope, changed files, safety, and required checks are verified.

## 16. Security and system invariants

- Never commit secrets, tokens, passwords, or credentials.
- VPS is source of truth for live/exported data.
- Google Drive is a mirror only.
- RAG artifacts are derived and rebuildable.
- Userscript runtime may use only approved sanitized runtime data.
- Transfer Analyzer must not regain persistent player memory/cache without explicit architecture approval.

## 17. Final-state rule

Valid terminal states are:

- `COMPLETE`;
- `BLOCKED`;
- `FAILED`.

Do not use ambiguous final wording such as `almost done`, `probably ready`, or `waiting`.

Evidence, not narrative, determines completion.

## 18. Capability-aware execution governance

These rules are permanent governance requirements for all SLF agents.

### 18.1 Approval Persistence

Repository-write approval is attached to the exact task scope, file set, and
intended behavior.

It remains valid until:

- `COMPLETE`;
- `BLOCKED`;
- `FAILED`;
- explicit user cancellation;
- approved scope expansion requiring new consent.

Approval is not invalidated by interruptions, tool changes, retries, manual
fallback steps, or continuation in a later message.

### 18.2 Protected-File Permission Persistence

Permission granted for a protected file remains valid for:

- the exact task;
- the exact file path;
- the declared modification;
- the complete approved lifecycle.

Existing secrets or credentials inside that file do not require the user to
reveal them when the approved operation preserves them unchanged.

Agents must not display secret values and must not replace protected files from
partial or truncated content.

### 18.3 Capability Gate

Before the first repository write, the responsible agent must verify an
end-to-end path for the complete approved lifecycle.

For multi-file work, the agent must know how every required file will be safely
written before the first partial write.

### 18.4 Execution Method Governance

Approved execution methods, in priority order, are:

1. connector-native repository operations;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step.

A lower-priority method may be used immediately when a higher-priority method is
unsafe or unavailable.

### 18.5 Manual Step Governance

`MANUAL_STEP_REQUIRED` is a non-terminal recovery phase.

A manual instruction must be:

- narrow;
- exact;
- consolidated;
- inside the approved scope;
- independently verifiable.

After completion, the responsible agent must verify and resume the lifecycle
without a new approval.

### 18.6 Blocker Evidence Governance

An agent may declare `BLOCKED` only when:

- a required operation cannot be completed;
- the failure has evidence;
- primary and safe fallback methods were evaluated;
- no agent-executable method remains;
- a narrow manual step cannot recover the lifecycle;
- an exact recovery action is provided.

A limitation of one tool is not a project blocker.

### 18.7 User Communication Governance

The user should normally receive:

1. one scope/approval boundary;
2. one manual package only when unavoidable;
3. one terminal result.

Intermediate operational messages must be omitted when the user requests
terminal-only reporting.

Internal runtime tracking must continue even when intermediate status is not
shown.

## 19. SLF Task Intake governance

All new SLF requests enter through the project-specific Task Intake stage unless the user has already supplied a complete canonical Task Brief.

Task Intake must:

- accept fast, free-form user dialogue;
- preserve the original request and material clarifications;
- separate facts, assumptions, and open questions;
- ask only questions whose answers would materially change behavior, scope, safety, data handling, or acceptance criteria;
- produce the canonical Task Brief defined by `contracts/branches/task-intake.md`;
- remain in `DISCUSSION` until the brief is sufficiently defined;
- hand the brief to the PM internally in the same chat;
- use `READY_FOR_IMPLEMENTATION` when the specification is ready for the PM approval gate.

Task Intake must not create Issues, branches, files, commits, pull requests, or implementation changes. It must not introduce a new runtime phase and must not silently expand the user's request.

The PM remains responsible for duplicate-Issue checks, Issue creation or update, `Implementation Scope Check`, repository-write approval, implementation orchestration, PR/CI/merge, and release verification.
