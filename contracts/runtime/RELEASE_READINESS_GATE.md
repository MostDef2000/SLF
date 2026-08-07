# SLF Release Readiness Gate

Version: 1.3.0
Status: Active
Applies to: all SLF release workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The Release Readiness Gate is the final validation boundary before latest-only userscript publication. It prevents publication when source integration, canonical PR CI, release provenance, or generated-branch state is incomplete.

The automatic lifecycle is governed by `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`; workflow topology is governed by `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`.

## 2. Gate definition

A runtime/build-affecting change is eligible for publication only when:

```text
Release Readiness Gate
- Final PR head canonical CI: SUCCESS
- Source files committed to protected main: YES
- Changed files verified on main: YES
- Runtime/build/release-affecting files changed: YES
- Current release branch manifest loaded: YES
- Release artifacts already built for this source commit: NO
- Exact release source commit equals current main: YES
- Expected release ref is current: YES
- Safe to continue now: YES
```

## 3. Canonical PR prerequisite

Before source merge, exact `SLF CI / ci` must have concluded `success` on the final PR head SHA.

`PENDING`, `FAILED`, and `UNKNOWN` do not satisfy release readiness and cannot be converted into merge permission by `mergeable=true`, custom harnesses, or empty connector lookups.

## 4. Release applicability

Publication is required when the integrated unpublished source diff affects:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `tools/validate-release-provenance.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts/governance/docs alone do not require a userscript version unless one of the release-affecting paths above is also changed in the unpublished source range.

## 5. Exact source and published baseline

`SLF Release` must publish only the exact current `main` source commit. A manual `source_commit` request that does not equal current `main` must fail closed.

The canonical prior publication state is read from `release/data/version.json`:

- `scriptVersion` is the previous published version;
- `build.approvedCommit` is the previous published source SHA on `main`.

The previous published source SHA must be an ancestor of current `main`.

The cumulative unpublished source file set is calculated between that previous approved source SHA and current `main`, excluding generated release outputs:

- `CHANGELOG.md`;
- `data/version.json`;
- `releases/latest.user.js`;
- `releases/latest.meta.js`.

This preserves provenance after generated publication is moved off `main` and prevents historical generated snapshots on `main` from contaminating the next approved source range.

## 6. Idempotency

If current `main` source SHA already equals the `release` manifest `build.approvedCommit`, release dispatch exits successfully without creating another version.

If the net unpublished source range contains no release-affecting file, publication is not required.

Generated release-only commits occur on `release`, not `main`, and do not recursively trigger publication.

## 7. Validation before publication

Before generated artifacts are committed, the release workflow must run relevant source gates including:

- bundle/dependency order;
- security boundaries;
- tactical situation regression when applicable;
- workflow inventory/governance validation;
- deterministic build/rebuild;
- release provenance validation;
- exact userscript artifact boundary.

The build restores prior release-only changelog history from the current `release` branch before adding the next version entry.

Generated release artifacts are produced only by workflow/build tooling and are never edited manually.

## 8. Publication safety

Before updating `release`, the workflow must re-fetch both branches and verify:

- `main` still equals the exact source SHA validated for publication;
- `release` still equals the exact prior release ref used during provenance resolution.

If either moved, publication fails closed.

The generated `release` branch may be updated using `--force-with-lease` because it is latest-only generated state. The expected old ref is mandatory.

No generated publication step may push to `main` or require a branch-protection bypass for `main`.

## 9. Evidence requirement

A successful release requires verification of:

- merged source commit remains on `main`;
- generated publication did not advance `main`;
- `release/data/version.json` contains the new version;
- `release` manifest `build.approvedCommit` equals the merged source commit;
- `build.approvedBaseCommit` equals the previous published source SHA;
- coherent cumulative `build.approvedFiles` excluding generated outputs;
- matching version in `release/releases/latest.user.js` and `release/releases/latest.meta.js`;
- generated release commit exists on `release`;
- canonical update/download URLs point to the `release` branch;
- no archive userscript.

A green PR alone is not publication evidence. Workflow metadata is supplemental to repository artifact evidence.

Historical generated files on `main` are compatibility snapshots after the handoff and are not the canonical release evidence source.

## 10. Manual fallback

Manual `workflow_dispatch` is fallback-only, but it executes the real publish path. The agent must use available rerun/dispatch tools before involving the user.

A user manual step is permitted only when the platform operation cannot be executed through available tools; the instruction must identify:

- workflow `SLF Release`;
- source branch `main`;
- publication branch `release`;
- exact current main source commit;
- UI path;
- expected new `release` manifest/commit.

## 11. Protected-main gate

The release architecture must remain compatible with a `main` ruleset that:

- requires pull requests;
- requires `SLF CI / ci`;
- requires conversation resolution;
- blocks deletion;
- blocks force pushes;
- uses no GitHub Actions bypass for publication.

A release implementation that requires weakening these protections does not satisfy readiness.

## 12. Tampermonkey gate

After publication report:

```text
Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

A verified new runtime release means `YES`. Release pending/failed means `NOT YET`. Docs/governance-only task with no release means `NO`.

Tampermonkey canonical update/download endpoints are the generated `release` branch latest artifacts.

## 13. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
