# Quality governance rollout

## Current state

The prerequisite quality pull requests are integrated into `main` with explicit repository-owner acceptance. An independent reviewer was not available, so the repository must not describe those merges as independently reviewed.

Governance remains `prepared_not_enforced` until an always-running aggregate workflow exists on `main`, its exact check context is observed, and GitHub branch protection is applied and verified separately.

## Review model

SLF currently operates as a single-maintainer repository.

The accepted review model is:

- the repository owner explicitly accepts each change;
- automated quality gates are mandatory evidence, not a substitute claim for independent review;
- critical unreviewed assumptions are recorded in `data/quality/accepted-risks-v1.json`;
- failures, skipped checks, and production gaps must remain visible;
- no PR may claim independent review unless another qualified person actually performed it.

If an independent reviewer becomes available, critical-path changes should use that reviewer and the single-maintainer risk should be reassessed.

## Why component checks are not required directly

Most component workflows use path filters to avoid unnecessary work. GitHub can leave a required check pending when its workflow is skipped by a path filter. Requiring every component workflow directly would therefore risk blocking unrelated pull requests indefinitely.

The enforcement target is one always-running aggregate workflow:

```text
Quality integration gate / quality-integration
```

The aggregate workflow is added only after all prerequisite quality tools and workflows exist on `main`.

## Rollout sequence

Completed:

1. Owner-approved and merged the quality policy PR #159.
2. Owner-approved and merged exact-artifact validation PR #163.
3. Owner-approved and merged versioned contracts PR #164.
4. Owner-approved and merged security automation PR #165.
5. Owner-approved and merged browser E2E PR #166.
6. Owner-approved and merged property, fuzz, mutation, and reliability PR #167.
7. Owner-approved and merged release and deployment evidence PR #168.

Remaining:

8. Merge the governance package with the single-maintainer risk recorded.
9. Add an always-running aggregate workflow that invokes the integrated checks.
10. Observe the exact successful check context in GitHub.
11. Change `data/quality/quality-gates-v1.json` from `prepared_not_enforced` to a verified ready state.
12. Apply branch protection or a repository ruleset with separate owner approval.
13. Verify protection with a disposable pull request before treating enforcement as complete.

## Target branch protection

The target configuration for the current single-maintainer model is:

- pull requests required for `main`;
- zero required approvals while no independent reviewer exists;
- CODEOWNER review routing retained, but CODEOWNER approval not required;
- conversations resolved before merge;
- the always-running aggregate check required;
- force pushes blocked;
- branch deletion blocked;
- administrator bypass disabled unless a separately documented emergency process is adopted.

This avoids a permanently unmergeable repository while preserving review evidence, mandatory CI, and protected history.

Repository settings are not deployable source code. A committed manifest describes intent but does not prove that GitHub settings were applied.

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
