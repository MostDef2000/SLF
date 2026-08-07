# Branch Contract: core-release

Version: 3.3.0
Status: Active
Role: Core Release Orchestrator

## 1. Purpose

Core Release is the deterministic Git-safe executor for approved SLF changes. It owns intake validation, reconciliation with current `main`, PR validation, canonical CI evidence, merge, automatic release verification, published version verification, and final Tampermonkey instruction.

Core Release does not redesign business logic or expand approved scope.

## 2. Governing contracts

Core Release follows:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- `contracts/runtime/RELEASE_READINESS_GATE.md`.

Workflow Lifecycle and Automatic Release policies override stale workflow names and routine manual Actions wording.

## 3. Approval persistence

Exact `commit approved` after scope check authorizes the complete deterministic release lifecycle for that scope. No separate confirmation is required for PR creation, behavior-preserving CI fixes, merge after green CI, automatic release, or verification.

New approval is required only for scope expansion, destructive action, new secret handling, unapproved protected-path changes, storage/schema migration beyond scope, or behavior redesign.

## 4. Source and artifact rules

- `main` is long-term source of truth.
- Task branches are disposable.
- Generated release outputs are never editable source:
  - `releases/latest.user.js`;
  - `releases/latest.meta.js`;
  - `data/version.json`;
  - `CHANGELOG.md`.
- Module agents do not bump versions or create archive userscripts.

## 5. Mandatory intake and integrity

Before PR readiness verify:

- approved commit/range or branch head exists;
- complete changed-file list is inside scope;
- branch is based on/reconciled with current `main`;
- generated release files were not manually changed;
- no unauthorized secret/protected data was introduced;
- required bundle/dependency ownership changes are included;
- changed executable syntax and relevant canonical static checks pass where available.

Sequential branch commits are allowed when connector limitations prevent an atomic tree commit, but the whole branch diff must be verified before merge and squash integration is preferred.

Placeholder/noop commits are prohibited.

## 6. Canonical CI gate

The only canonical merge context is:

```text
SLF CI / ci
```

The exact current PR head SHA must have a successful canonical run. Merge is prohibited while state is `PENDING`, `FAILED`, or `UNKNOWN`.

The following never substitute for canonical success:

- `mergeable=true`;
- empty workflow/status lookup;
- success on a previous head;
- custom/local harness success;
- a green specialist job without the final `ci` job.

After any branch write, prior CI evidence is stale and state returns to pending.

## 7. CI failure repair

When canonical CI fails and logs are accessible:

1. inspect the exact failed job;
2. inspect failed step/log;
3. identify the canonical command that failed;
4. apply the smallest in-scope behavior-preserving fix;
5. rerun/wait for canonical CI on the new head.

Do not merge a speculative fix before final-head CI succeeds.

Dynamic execution or identifier obfuscation is not a valid dependency/security fix. Cross-module dependencies must be declared or moved to the owning module.

## 8. Merge authorization

Core Release may enter `MERGE_ALLOWED` only when:

- current PR head is known;
- branch is not behind/reconciliation is complete;
- exact changed-file scope is still approved;
- `SLF CI / ci` conclusion is `success` on that head;
- no unresolved required review thread or known blocking condition remains.

Then merge using the repository-supported method, preferring squash for branch histories containing sequential connector commits.

## 9. Automatic release applicability

A release is required when integrated changes affect the runtime/build/release paths defined by `SLF_AUTOMATIC_RELEASE_POLICY.md` and Release Readiness Gate, including `src/**` and the release workflow itself.

Governance/docs-only changes do not publish unless a release-affecting path is changed in the same task.

## 10. Canonical release workflow

Publication belongs only to:

```text
SLF Release
```

Normal path is eligible push to `main`. Manual `workflow_dispatch` is fallback-only but must execute the same publish path, pinned to exact current `main`, and must be idempotent when already published.

Core Release should dispatch/rerun with available tools before asking for a manual GitHub UI run.

## 11. Release verification

Runtime publication is complete only after verifying:

- merged source commit exists on `main`;
- new `data/version.json` version exists;
- `build.approvedCommit` equals the merged source SHA;
- cumulative `build.approvedFiles` is coherent;
- `releases/latest.user.js` version matches;
- `releases/latest.meta.js` version matches;
- release commit exists on `main`;
- update/download URLs remain canonical;
- no forbidden archive file exists.

Workflow-run metadata is supplemental. An empty push-run lookup never proves no release occurred.

## 12. Manual platform step

`MANUAL_STEP_REQUIRED` is permitted only when an exact platform operation is unavailable through connected tools and no safe automated fallback remains. Give one consolidated UI instruction and verification criterion, then resume automatically after user completion under the same approval.

Branch-protection/ruleset configuration is such a platform step when the connector exposes no settings mutation endpoint.

## 13. Capability fallback

Before integration, confirm safe capability for complete reads/writes, branch update, PR, CI jobs/logs, merge, and release verification.

Fallback order:

1. connected GitHub API/Contents;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated UI step;
6. `BLOCKED` only after no safe path remains.

A tool-specific failure, waiting state, or empty lookup is not a blocker while another safe method remains.

## 14. Runtime path

Normal runtime path:

```text
HANDOFF_VALIDATED
→ PR_CI_PENDING
→ PR_CI_SUCCESS
→ MERGE_ALLOWED
→ CORE_RELEASE_INTEGRATING
→ SOURCE_INTEGRATED
→ RELEASE_PENDING
→ RELEASE_SUCCESS
→ BROWSER_ACCEPTANCE or COMPLETE
```

Forbidden:

```text
PR_CI_PENDING → MERGE_ALLOWED
PR_CI_FAILED → MERGE_ALLOWED
PR_CI_UNKNOWN → MERGE_ALLOWED
```

Terminal states are `COMPLETE`, `BLOCKED`, or `FAILED`.

## 15. Final response requirements

Every terminal response includes:

```text
Final State
- COMPLETE / BLOCKED / FAILED
- Reason:

Source Integration
- status:
- commit hash:
- main advanced: YES/NO
- changed files:
- verification:

GitHub Actions
- Mode: AUTOMATIC / NOT REQUIRED / MANUAL FALLBACK
- Status: NOT STARTED / RUNNING / SUCCESS / FAILED / NOT APPLICABLE
- User action: NONE / exact fallback action

Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

Never claim release success without release-commit evidence and never stop at an intermediate commit/PR/CI state when the lifecycle can continue.
