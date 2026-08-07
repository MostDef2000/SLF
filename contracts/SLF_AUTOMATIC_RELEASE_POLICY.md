# SLF Automatic Release Policy

Version: 1.3.0
Status: Active
Applies to: Project Manager, domain agents, Core Release, runtime state, release gate, GitHub Actions, and Tampermonkey user handoff
Source of truth: GitHub repository contracts and `.github/workflows/build-latest-release.yml`

## 1. Purpose and priority

This policy defines the default end-to-end lifecycle after explicit repository-write approval. It supersedes older wording that requires routine manual GitHub Actions execution or treats an unobserved CI result as permission to continue.

Where this policy conflicts with older wording in Governance, Project Manager, Core Release, Task Runtime, Release Readiness, or architecture docs, this policy and `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md` have priority for CI/release lifecycle behavior.

## 2. Approval boundary

Repository writes are authorized only by the exact lowercase phrase:

```text
commit approved
```

and only after the current Implementation Scope Check. Approval persists for the exact approved scope through implementation, PR, CI fixes that preserve behavior, merge, automatic release, verification, and narrow tool fallbacks.

A new approval is required only for scope expansion, destructive action, secret/credential handling outside the approved scope, storage/schema migration beyond scope, or behavior redesign.

## 3. Automatic continuation

After approval, the PM must continue until one terminal state is reached:

```text
COMPLETE
BLOCKED
FAILED
```

Intermediate states are progress only. Waiting for CI, mergeability, workflow start, or release publication is not a terminal response.

## 4. Canonical PR CI gate

The only canonical pull-request merge context is:

```text
SLF CI / ci
```

CI state is one of `PENDING`, `SUCCESS`, `FAILED`, `UNKNOWN`.

Only `SUCCESS` allows merge. `PENDING`, `FAILED`, and `UNKNOWN` are fail-closed. In particular:

- `mergeable=true` is not CI evidence;
- an empty connector workflow/status lookup is not evidence that CI is absent;
- a green specialist/custom harness is not a substitute for the canonical context;
- a speculative CI fix must not be merged without the final canonical context succeeding on the final PR head.

When a CI failure is observable, inspect the exact failed job/step/log before changing implementation. A custom local harness may supplement but not replace the failing canonical command.

## 5. Post-write integrity

Before a PR is made ready for merge:

1. fetch complete written files from the branch;
2. verify expected structure and file endings;
3. run available syntax and canonical static checks;
4. compare branch against current `main`;
5. verify all changed files remain in approved scope;
6. verify generated release outputs were not manually edited.

Sequential branch commits are permitted when connector limitations prevent an atomic tree commit, but the complete branch diff must be verified before merge and the final integration should use squash when appropriate.

## 6. Dependency and security integrity

Dynamic execution or name-obfuscation must never be used to bypass dependency, ownership, security, or bundle audits. This includes `eval`, `Function`, string indirection, and alias tricks intended to hide a cross-module dependency.

A real cross-module dependency must either be declared in the canonical dependency audit or moved to the module that owns that behavior.

## 7. Automatic release applicability

A userscript release is required after approved changes reach `main` when they affect:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `tools/validate-release-provenance.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts/docs/governance alone do not publish a userscript unless a release-affecting file is changed in the same task.

Generated release-only commits must not recursively start a release.

## 8. Canonical release workflow

The canonical workflow is:

```text
SLF Release
```

It does not duplicate pull-request validation. On an eligible push to `main`, it validates the exact current main source commit, calculates the cumulative unpublished diff from the previous release manifest commit, builds and verifies latest-only artifacts, and commits the generated outputs.

## 9. Manual publish fallback

`workflow_dispatch` is fallback-only, but it must be a real publication path, not a validation-only approximation.

A manual run:

- is pinned to the exact current `main` source commit via optional `source_commit` input;
- fails if the requested commit is not current `main`;
- executes the same source validation, build, provenance validation, and publication path as automatic release;
- is idempotent: if current `main` is already the published release commit, it exits successfully without creating another version.

The agent must dispatch or rerun with available tools before asking the user to press `Run workflow`.

## 10. Release verification hierarchy

A release is complete only after verifying, in order:

1. `data/version.json` on `main` contains the new `scriptVersion`;
2. `build.approvedCommit` equals the merged source commit;
3. `build.approvedFiles` represents the cumulative unpublished source diff;
4. `releases/latest.user.js` has the same version;
5. `releases/latest.meta.js` has the same version;
6. a release commit for that version exists on `main`;
7. generated update/download URLs remain canonical;
8. no archive userscript was created.

Workflow-run lookup is supplemental. An empty lookup never proves the push workflow did not run.

## 11. Manual fallback state

A user manual step is allowed only when the required platform operation cannot be performed by the connected tools and no safe automated fallback remains. The state must be `MANUAL_STEP_REQUIRED`, with one consolidated UI instruction and a verification criterion.

For release recovery the required block is:

```text
Manual fallback
- Reason:
- Workflow: SLF Release
- Required branch: main
- Source commit:
- Exact GitHub UI path:
- Expected result:
```

Normal successful work must not instruct the user to press `Run workflow`.

## 12. Runtime semantics

Normal path:

```text
IMPLEMENTING
→ PR_CI_PENDING
→ PR_CI_SUCCESS
→ MERGE_ALLOWED
→ SOURCE_INTEGRATED
→ RELEASE_PENDING
→ RELEASE_SUCCESS
→ COMPLETE
```

Forbidden transitions:

```text
PR_CI_PENDING → MERGE_ALLOWED
PR_CI_FAILED → MERGE_ALLOWED
PR_CI_UNKNOWN → MERGE_ALLOWED
```

Manual fallback is represented separately as `MANUAL_STEP_REQUIRED`.

## 13. Completion rule

An approved runtime/build task is not `COMPLETE` until:

- implementation is integrated into `main`;
- canonical PR CI succeeded on the final head;
- the release commit exists when required;
- version/provenance/artifact checks match;
- the final Tampermonkey instruction is returned.

## 14. Mandatory final handoff

Every final implementation/release response must explicitly state:

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

## 15. Capability fallback

Before the first repository write, verify a safe path for complete reads/writes, branch updates, post-write validation, PR creation, CI inspection, merge, and release verification.

Repository-write fallback order:

1. GitHub connector/Contents API;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step;
6. `BLOCKED` only after no safe path remains.

Existing protected/secret-bearing ranges must not be displayed or unintentionally replaced.

## 16. Workflow lifecycle

The active Actions topology is governed by `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md` and `data/quality/workflow-inventory-v1.json`. Completed migration workflows are deleted; their run history may remain visible in the GitHub Actions sidebar.

## 17. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
