# SLF Release Readiness Gate

Version: 1.2.0
Status: Active
Applies to: all SLF release workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The Release Readiness Gate is the final validation boundary before latest-only userscript publication. It prevents publication when source integration, canonical PR CI, or release provenance is incomplete.

The automatic lifecycle is governed by `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`; workflow topology is governed by `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`.

## 2. Gate definition

A runtime/build-affecting change is eligible for publication only when:

```text
Release Readiness Gate
- Final PR head canonical CI: SUCCESS
- Source files committed to main: YES
- Changed files verified on main: YES
- Runtime/build/release-affecting files changed: YES
- Release artifacts already rebuilt for this source commit: NO
- Exact release source commit equals current main: YES
- Safe to continue now: YES
```

## 3. Canonical PR prerequisite

Before source merge, exact `SLF CI / ci` must have concluded `success` on the final PR head SHA.

`PENDING`, `FAILED`, and `UNKNOWN` do not satisfy release readiness and cannot be converted into merge permission by `mergeable=true`, custom harnesses, or empty connector lookups.

## 4. Release applicability

Publication is required when the integrated unpublished diff affects:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `tools/validate-release-provenance.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts/governance/docs alone do not require a userscript version unless one of the release-affecting paths above is also changed.

## 5. Exact source commit

`SLF Release` must publish only the exact current `main` source commit. A manual `source_commit` request that does not equal current `main` must fail closed.

The cumulative unpublished file set is calculated from the most recent commit that changed `data/version.json` through the current source commit. This prevents a failed prior release from silently omitting earlier unpublished source changes.

## 6. Idempotency

If current `main` is already the published release commit, or no unpublished file diff exists, release dispatch must exit successfully without creating another version.

Generated release-only commits must not recursively trigger another publication.

## 7. Validation before publication

Before generated artifacts are committed, the release workflow must run relevant source gates including:

- bundle/dependency order;
- security boundaries;
- tactical situation regression when applicable;
- workflow inventory/governance validation;
- deterministic build/rebuild;
- release provenance validation;
- exact userscript artifact boundary.

Generated release artifacts are produced only by workflow/build tooling and are never edited manually.

## 8. Evidence requirement

A successful release requires verification of:

- merged source commit on `main`;
- exact changed-file scope on `main`;
- `data/version.json` new version;
- `build.approvedCommit` equal to merged source commit;
- coherent cumulative `build.approvedFiles`;
- matching version in `latest.user.js` and `latest.meta.js`;
- release commit on `main`;
- canonical update/download URLs;
- no archive userscript.

A green PR alone is not publication evidence. Workflow metadata is supplemental to repository artifact evidence.

## 9. Manual fallback

Manual `workflow_dispatch` is fallback-only, but it executes the real publish path. The agent must use available rerun/dispatch tools before involving the user.

A user manual step is permitted only when the platform operation cannot be executed through available tools; the instruction must identify `SLF Release`, branch `main`, exact source commit, UI path, and expected new manifest/release commit.

## 10. Tampermonkey gate

After publication report:

```text
Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

A verified new runtime release means `YES`. Release pending/failed means `NOT YET`. Docs/governance-only task with no release means `NO`.

## 11. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
