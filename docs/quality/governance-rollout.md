# Quality governance rollout

## Current state

The prerequisite quality pull requests are integrated into `main` with explicit repository-owner acceptance. An independent reviewer was not available, so the repository must not describe those merges as independently reviewed.

The always-running aggregate workflow was exercised on PR #175. All four domain jobs and the final context completed successfully:

```text
Quality integration gate / quality-integration
```

Repository state is therefore `aggregate_verified_settings_not_enforced`. GitHub branch protection has not been applied or verified.

## Review model

SLF currently operates as a single-maintainer repository.

The accepted review model is:

- the repository owner explicitly accepts each change;
- automated quality gates are mandatory evidence, not a substitute claim for independent review;
- critical unreviewed assumptions are recorded in `data/quality/accepted-risks-v1.json`;
- failures, skipped checks, and production gaps must remain visible;
- no PR may claim independent review unless another qualified person actually performed it.

If an independent reviewer becomes available, critical-path changes should use that reviewer and the single-maintainer risk should be reassessed.

## Aggregate quality context

Most component workflows use path filters to avoid unnecessary work. GitHub can leave a required check pending when its workflow is skipped by a path filter. Requiring every component workflow directly would therefore risk blocking unrelated pull requests indefinitely.

`.github/workflows/quality-integration.yml` runs on every pull request and `main` push. It executes four independent domains:

1. exact artifact, versioned contracts, security boundaries, governance, and adversarial API tests;
2. property, fuzz, mutation, recovery, and reliability tests;
3. exact userscript execution in Chromium fixtures;
4. deterministic release rebuild and deployment evidence validation.

The final `quality-integration` job uses `if: always()` and fails unless every domain concludes `success`.

Verification evidence recorded in `data/quality/quality-gates-v1.json`:

- PR: `#175`;
- workflow run: `30884950897`;
- final job: `91914145283`;
- result: `success`;
- verified: `2026-08-04`.

## Rollout sequence

Completed:

1. Owner-approved and merged the quality policy PR #159.
2. Owner-approved and merged exact-artifact validation PR #163.
3. Owner-approved and merged versioned contracts PR #164.
4. Owner-approved and merged security automation PR #165.
5. Owner-approved and merged browser E2E PR #166.
6. Owner-approved and merged property, fuzz, mutation, and reliability PR #167.
7. Owner-approved and merged release and deployment evidence PR #168.
8. Owner-approved and merged governance PR #169 with single-maintainer risk `QR-007` recorded.
9. Added the always-running aggregate workflow in PR #175.
10. Observed the exact successful aggregate context on the PR merge-ref.

Remaining:

11. Merge PR #175 so the aggregate workflow exists on `main`.
12. Apply branch protection or a repository ruleset with separate owner approval.
13. Verify protection with a disposable pull request before treating enforcement as complete.

## Target branch protection

The target configuration for the current single-maintainer model is:

- pull requests required for `main`;
- zero required approvals while no independent reviewer exists;
- CODEOWNER review routing retained, but CODEOWNER approval not required;
- conversations resolved before merge;
- `Quality integration gate / quality-integration` required;
- force pushes blocked;
- branch deletion blocked;
- administrator bypass disabled unless a separately documented emergency process is adopted.

This avoids a permanently unmergeable repository while preserving owner accountability, mandatory CI, and protected history.

Repository settings are not deployable source code. A committed manifest and successful workflow do not prove that GitHub settings were applied.

## Critical path ownership

CODEOWNERS covers:

- workflows and repository automation;
- generated releases and release metadata;
- bundle order and userscript header;
- authentication and API transport;
- manual telemetry and persistence;
- VPS API and deployment tooling;
- contracts, quality budgets, security, and release policy.

CODEOWNER assignment identifies accountability and future review routing. It does not establish reviewer independence when the owner also authored the change.

## Risk review

`data/quality/accepted-risks-v1.json` is merge-blocking governance data. Every open or accepted risk requires:

- accountable owner;
- affected trust boundary;
- consequence;
- compensating controls;
- target remediation;
- review date.

The scheduled governance workflow fails when a risk review date expires. Closing a risk requires evidence rather than deletion from the register.

## Emergency changes

Emergency hotfixes require:

- the smallest viable change;
- a permanent regression test;
- exact-artifact validation where applicable;
- explicit owner acceptance;
- documented temporary risk acceptance;
- post-merge verification and rollback evidence.

Branch-protection bypass, if ever used, must be treated as a security event and recorded with the exact commit, reason, owner, validation evidence, and follow-up action.
