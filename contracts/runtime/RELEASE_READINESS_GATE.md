# SLF Release Readiness Gate

Version: 1.1.0
Status: Active
Applies to: all SLF release workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The Release Readiness Gate defines the final validation layer before SLF enters automatic release execution.

Its purpose is to prevent premature or unsafe publication when source integration or build state is incomplete.

The automatic lifecycle is governed by `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`.

## 2. Gate definition

A runtime/build-affecting change is eligible for automatic release only if all conditions are satisfied:

```text
Release Readiness Gate
- Source files committed to main: YES
- Changed files verified on main: YES
- Runtime/build-affecting files changed: YES
- Release artifacts already rebuilt for this change: NO
- AUTOMATIC RELEASE: YES
- Safe to continue now: YES
```

## 3. Conditions

### Source files committed to main

All approved changes must be present in `main`.

### Changed files verified on main

The exact approved files must exist in `main` and match the validated implementation.

### Runtime/build-affecting files changed

At least one of the following must be impacted:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

Governance, contracts, architecture documents, and decision records alone do not require a userscript release.

### Release artifacts already rebuilt

If latest release artifacts already reflect the approved change, a second release must not be triggered.

## 4. Decision rules

### AUTOMATIC RELEASE = YES

Only when:

- source is fully integrated into `main`;
- runtime/build-affecting changes exist;
- release artifacts are not yet updated for the change;
- unified workflow execution is available.

The PM/Core Release must continue without asking the user to press `Run workflow`.

### AUTOMATIC RELEASE = NO

If any required condition is false.

### MANUAL FALLBACK = YES

Only when:

- automatic workflow did not start;
- automatic workflow failed for a recoverable infrastructure reason;
- the agent cannot safely dispatch or rerun it;
- exact manual steps are provided.

## 5. Evidence requirement

The agent must verify:

- commit presence on `main`;
- changed-file list match;
- build relevance;
- automatic workflow start;
- workflow result;
- release commit;
- published version.

A green PR validation alone is not evidence that the release was published.

## 6. Safe user instruction rule

Normal successful path:

```text
User action: NONE
```

The user may be instructed to run GitHub Actions only in manual fallback state.

## 7. Tampermonkey decision gate

After release execution, report:

```text
Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

Rules:

- New runtime release verified: `YES`.
- Docs/contracts-only task: `NO`.
- Release pending or failed: `NOT YET`.

## 8. Failure modes

If automatic release readiness or result cannot be verified:

```text
BLOCKED
Reason: Cannot verify automatic release lifecycle
Next action: exact manual fallback or recovery step
```

## 9. Relationship to other contracts

- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
