# Quality governance rollout

## Current state

The repository governance package is prepared but not enforced.

Component quality changes are reviewed through independent draft pull requests. Until those changes are merged into `main`, the repository must not claim that the corresponding checks are available as permanent branch-protection controls.

## Why component checks are not required directly

Most component workflows use path filters to avoid unnecessary work. GitHub can leave a required check pending when its workflow is skipped by a path filter. Requiring every component workflow directly would therefore risk blocking unrelated pull requests indefinitely.

The enforcement target is one always-running aggregate workflow:

```text
Quality integration gate / quality-integration
```

That aggregate is created only after all prerequisite quality tools and workflows exist on `main`.

## Merge sequence

1. Human-review and merge the policy PR.
2. Human-review and merge exact-artifact validation.
3. Human-review and merge versioned contracts.
4. Human-review and merge security automation.
5. Human-review and merge browser E2E.
6. Human-review and merge property, fuzz, mutation, and reliability checks.
7. Human-review and merge release and deployment evidence.
8. Rebase or recreate the governance PR from the resulting `main`.
9. Add an always-running aggregate workflow that invokes the integrated checks.
10. Observe the exact successful check context in GitHub.
11. Change `data/quality/quality-gates-v1.json` from `prepared_not_enforced` to a reviewed ready state.
12. Apply branch protection or a repository ruleset with separate owner approval.
13. Verify protection with a disposable pull request before treating enforcement as complete.

## Target branch protection

The target configuration is:

- pull requests required for `main`;
- at least one approval;
- CODEOWNER review required;
- stale approvals dismissed after new commits;
- conversations resolved before merge;
- the always-running aggregate check required;
- force pushes blocked;
- branch deletion blocked;
- administrator bypass disabled unless a separately documented emergency process is adopted.

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

CODEOWNER assignment establishes review routing. It does not establish reviewer independence when the owner also authored the change. Critical changes still require a reviewer who independently evaluates the test oracle and risk.

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

Emergency hotfixes still require:

- smallest viable change;
- permanent regression test;
- exact-artifact validation where applicable;
- documented temporary risk acceptance;
- independent follow-up review.

Branch-protection bypass, if ever used, must be treated as a security event and recorded with the exact commit, reason, approver, validation evidence, and follow-up action.
