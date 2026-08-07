# SLF Automatic Release Policy

Version: 1.4.0
Status: Active
Applies to: Project Manager, domain agents, Core Release, runtime state, release gate, GitHub Actions, Tampermonkey handoff, and protected-main governance
Source of truth: GitHub repository contracts and `.github/workflows/build-latest-release.yml`

## 1. Purpose and priority

This policy defines the default end-to-end lifecycle after explicit repository-write approval. It supersedes older wording that requires routine manual GitHub Actions execution, treats an unobserved CI result as permission to continue, or publishes generated release commits directly to protected `main`.

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

Placeholder/noop repository writes are prohibited.

## 6. Dependency and security integrity

Dynamic execution or name-obfuscation must never be used to bypass dependency, ownership, security, or bundle audits. This includes `eval`, `Function`, string indirection, and alias tricks intended to hide a cross-module dependency.

A real cross-module dependency must either be declared in the canonical dependency audit or moved to the module that owns that behavior.

## 7. Automatic release applicability

A userscript release is required after approved changes reach `main` when the unpublished source diff affects:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `tools/validate-release-provenance.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts/docs/governance alone do not publish a userscript unless a release-affecting file is changed in the same unpublished source range.

Generated release-only commits must not recursively start a release.

## 8. Source branch and publication branch

`main` is the protected source-of-truth branch. Approved source reaches `main` only through the normal PR lifecycle and canonical `SLF CI / ci` gate.

Generated latest-only publication belongs to the dedicated branch:

```text
release
```

The `release` branch is generated state, not editable source. Its canonical generated outputs are:

- `releases/latest.user.js`;
- `releases/latest.meta.js`;
- `data/version.json`;
- `CHANGELOG.md`.

After the protected-main handoff, `SLF Release` must never push generated release commits to `main`.

Because the project is latest-only, the workflow may replace the generated `release` branch tip with `--force-with-lease`. Force updates are permitted only for this generated branch and only when the expected previous release ref still matches. Force pushes to `main` remain prohibited.

Historical generated files that remain in `main` are compatibility snapshots from the handoff and are not the canonical published state after the branch split.

## 9. Canonical release workflow

The canonical workflow is:

```text
SLF Release
```

On an eligible push to `main`, it must:

1. pin the exact current `main` source SHA;
2. fetch the current `release` branch manifest;
3. use `release/data/version.json` as the published version/provenance baseline;
4. verify the previous `build.approvedCommit` is an ancestor of current `main`;
5. calculate the unpublished source diff while excluding generated release outputs;
6. run source/security/governance gates;
7. build the next deterministic latest-only version;
8. validate exact release provenance and artifact boundaries;
9. re-check that both `main` and the expected `release` ref have not advanced;
10. publish one generated release commit to `release` only.

A stale source or stale release ref fails closed.

## 10. Version and changelog continuity

The next published version is derived from the canonical manifest on `release`, not from the historical manifest snapshot on `main`.

The release build must preserve prior release-only changelog history from the current `release` branch before adding the next version entry.

`build.approvedCommit` records the exact source SHA on `main`. `build.approvedBaseCommit` records the previous published source SHA. `build.approvedFiles` records the net unpublished reviewed source scope between those source SHAs, excluding generated release outputs.

## 11. Manual publish fallback

`workflow_dispatch` is fallback-only, but it must execute the real publication path, not a validation-only approximation.

A manual run:

- is pinned to the exact current `main` source commit via optional `source_commit` input;
- fails if the requested commit is not current `main`;
- uses the current `release` manifest/ref as its publication baseline;
- executes the same source validation, deterministic build, provenance validation, stale-ref checks, and release-branch publication as the automatic path;
- is idempotent when the current `main` source SHA already equals the `release` manifest `build.approvedCommit`.

The agent must dispatch or rerun with available tools before asking the user to press `Run workflow`.

## 12. Protected-main invariant

Normal release operation must require no GitHub Actions bypass for `main`.

A `main` ruleset may therefore require pull requests and `SLF CI / ci`, block deletion and force pushes, and keep the bypass list empty. If a future release design again requires a direct workflow push to `main`, that is a release-architecture change requiring explicit scope review rather than a request to weaken branch protection.

## 13. Release verification hierarchy

A release is complete only after verifying, in order:

1. the merged source commit remains on `main` and `main` was not advanced by release publication;
2. `data/version.json` on `release` contains the new `scriptVersion`;
3. `release` manifest `build.approvedCommit` equals the merged source commit;
4. `build.approvedBaseCommit` equals the previous published source commit;
5. `build.approvedFiles` represents the cumulative unpublished source diff and excludes generated release outputs;
6. `releases/latest.user.js` on `release` has the same version;
7. `releases/latest.meta.js` on `release` has the same version;
8. a generated release commit for that version exists on `release`;
9. generated update/download URLs point to the canonical `release` branch;
10. no archive userscript was created.

Workflow-run lookup is supplemental. An empty lookup never proves the push workflow did not run.

## 14. Manual fallback state

A user manual step is allowed only when the required platform operation cannot be performed by the connected tools and no safe automated fallback remains. The state must be `MANUAL_STEP_REQUIRED`, with one consolidated UI instruction and a verification criterion.

For release recovery the required block is:

```text
Manual fallback
- Reason:
- Workflow: SLF Release
- Source branch: main
- Publication branch: release
- Source commit:
- Exact GitHub UI path:
- Expected result:
```

Normal successful work must not instruct the user to press `Run workflow`.

## 15. Runtime semantics

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

## 16. Completion rule

An approved runtime/build task is not `COMPLETE` until:

- implementation is integrated into protected `main`;
- canonical PR CI succeeded on the final head;
- the generated release commit exists on `release` when required;
- version/provenance/artifact checks match;
- `main` was not modified by generated publication;
- the final Tampermonkey instruction is returned.

## 17. Mandatory final handoff

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

## 18. Capability fallback

Before the first repository write, verify a safe path for complete reads/writes, branch updates, post-write validation, PR creation, CI inspection, merge, and release verification.

Repository-write fallback order:

1. GitHub connector/Contents API;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step;
6. `BLOCKED` only after no safe path remains.

Existing protected/secret-bearing ranges must not be displayed or unintentionally replaced.

## 19. Workflow lifecycle

The active Actions topology is governed by `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md` and `data/quality/workflow-inventory-v1.json`. Completed migration workflows are deleted; their run history may remain visible in the GitHub Actions sidebar.

## 20. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
