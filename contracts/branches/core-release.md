# Branch Contract: core-release

Version: 3.4.0
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

Workflow Lifecycle and Automatic Release policies override stale workflow names, routine manual Actions wording, and legacy generated-release commits on `main`.

## 3. Approval persistence

Exact `commit approved` after scope check authorizes the complete deterministic release lifecycle for that scope. No separate confirmation is required for PR creation, behavior-preserving CI fixes, merge after green CI, automatic release, or verification.

New approval is required only for scope expansion, destructive action, new secret handling, unapproved protected-path changes, storage/schema migration beyond scope, or behavior redesign.

## 4. Source and artifact rules

- `main` is the protected long-term source of truth.
- Task branches are disposable.
- `release` is generated latest-only publication state, not editable source.
- Generated release outputs are never editable source:
  - `releases/latest.user.js`;
  - `releases/latest.meta.js`;
  - `data/version.json`;
  - `CHANGELOG.md`.
- After the protected-main handoff, canonical generated outputs are verified on `release`; historical copies on `main` are compatibility snapshots only.
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

Governance/docs-only changes do not publish unless a release-affecting path is changed in the same unpublished source range.

## 10. Canonical release workflow

Publication belongs only to:

```text
SLF Release
```

Normal trigger is an eligible push to protected `main`. The workflow validates the exact current `main` source SHA, derives prior version/provenance from the generated `release` branch, builds deterministic latest-only outputs, then updates `release` only.

Generated publication must not push to `main` and must not require a `main` ruleset bypass.

Manual `workflow_dispatch` is fallback-only but must execute the same publication path, pinned to exact current `main`, using the expected current `release` ref and failing closed on stale source or stale release state.

Core Release should dispatch/rerun with available tools before asking for a manual GitHub UI run.

## 11. Release branch safety

`release` is explicitly generated and latest-only. `SLF Release` may update it with `--force-with-lease` only when the branch still equals the ref observed at provenance resolution.

This exception does not apply to `main`. Force pushes, direct generated pushes, and workflow bypasses on `main` remain prohibited.

The published release commit may be based on the exact current source commit while containing changes only in the four generated release outputs.

## 12. Release verification

Runtime publication is complete only after verifying:

- merged source commit remains on `main`;
- release publication did not advance `main`;
- new `data/version.json` version exists on `release`;
- `release` manifest `build.approvedCommit` equals the merged source SHA;
- `build.approvedBaseCommit` equals the previous published source SHA;
- cumulative `build.approvedFiles` is coherent and excludes generated outputs;
- `releases/latest.user.js` version on `release` matches;
- `releases/latest.meta.js` version on `release` matches;
- generated release commit exists on `release`;
- update/download URLs point to the canonical `release` branch;
- no forbidden archive file exists.

Workflow-run metadata is supplemental. An empty push-run lookup never proves no release occurred.

## 13. Protected-main platform rule

The desired `main` ruleset is:

- pull request required;
- canonical required status `SLF CI / ci`;
- conversation resolution required;
- branch deletion blocked;
- force pushes blocked;
- no GitHub Actions bypass required for release publication.

If connected tools cannot mutate rulesets, configuration is one narrow `MANUAL_STEP_REQUIRED`. Do not weaken the rule to accommodate generated releases; generated publication belongs on `release`.

## 14. Manual platform step

`MANUAL_STEP_REQUIRED` is permitted only when an exact platform operation is unavailable through connected tools and no safe automated fallback remains. Give one consolidated UI instruction and verification criterion, then resume automatically after user completion under the same approval.

Branch-protection/ruleset configuration is such a platform step when the connector exposes no settings mutation endpoint.

## 15. Capability fallback

Before integration, confirm safe capability for complete reads/writes, branch update, PR, CI jobs/logs, merge, and release verification.

Fallback order:

1. connected GitHub API/Contents;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated UI step;
6. `BLOCKED` only after no safe path remains.

A tool-specific failure, waiting state, or empty lookup is not a blocker while another safe method remains.

## 16. Runtime path

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

## 17. Final response requirements

Every terminal response includes:

```text
Final State
- COMPLETE / BLOCKED / FAILED
- Reason:

Source Integration
- status:
- commit hash:
- main advanced by generated release: YES/NO
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

Never claim release success without generated `release`-branch commit evidence and never stop at an intermediate commit/PR/CI state when the lifecycle can continue.
