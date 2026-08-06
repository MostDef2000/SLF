# Changed-code evidence coverage and maintenance ratchets

## Coverage model

SLF spans browser userscript JavaScript, Flask/Python, shell deployment tooling, generated artifacts, GitHub Actions and policy data. A single statement-coverage percentage would not describe whether a critical change is exercised by the correct runtime or control.

The repository therefore uses **source-to-executable-evidence coverage**.

This policy does **not** claim JavaScript or Python statement coverage and does **not** claim branch coverage.

`data/quality/changed-code-coverage-v1.json` defines:

- the production and governance-critical file scope;
- evidence rules that map files to existing tests and workflows;
- required workflow command strings;
- a minimum registered bundle-module ratchet;
- zero allowed unmapped critical files;
- 100% required mapping for changed critical files;
- an expiring exception mechanism, empty by default.

`tools/test-changed-code-coverage.mjs` validates the full repository map on every run. When `SLF_COVERAGE_BASE` is present, it also evaluates `git diff <base>...HEAD` and requires every changed critical file to have at least one executable evidence rule.

The validator verifies that evidence files exist and that the declared workflows still execute the declared commands. A documentation-only statement that a file is tested is insufficient.

## Critical scope

The scope includes:

- all userscript source modules and bundle metadata;
- VPS API, operations and exporter/RAG code;
- workflows, CODEOWNERS, PR template and Dependabot configuration;
- versioned contracts, risk/control data and release metadata;
- critical build, release, governance, security and API test tooling;
- exact browser fixtures and harnesses;
- quality, security and release policy documentation.

Every module in `src/app/bundle-order.json` must be tracked, critical and mapped. The reviewed baseline cannot fall below 56 registered modules. A future module-count increase may raise the ratchet; lowering it requires an explicit reviewed change.

## Pull-request behavior

`Quality governance` checks out full Git history and passes the pull-request base SHA through `SLF_COVERAGE_BASE`.

The output reports:

- total critical files;
- unmapped critical files;
- registered bundle modules;
- changed critical files;
- evidence rule count;
- the coverage kind.

The always-running `Quality integration gate` invokes the same governance validator and verifies the complete map even when a base SHA is not supplied.

## Dependency monitoring

`.github/dependabot.yml` performs weekly Monday checks for:

- Python dependencies in `/vps/api`;
- Python dependencies in `/vps/exporter-rag`;
- Python dependencies in `/tests/browser`;
- GitHub Actions in the repository root.

The maintenance validator checks the ecosystems, directories, cadence and security/dependency labels. Removing a monitored dependency surface or changing the cadence fails governance.

## Quarterly maintenance record

`data/quality/maintenance-review-v1.json` records:

- the last review date;
- the next mandatory review deadline;
- a maximum review window of 100 days;
- accountable owner;
- evidence and result for dependencies, fixtures, threat model, control mapping and accepted risks;
- expected Dependabot and governance schedules.

`tools/test-quality-maintenance.mjs` fails after `nextReviewBy`. Updating only the date is insufficient because every required review area must retain substantive results and valid evidence paths.

The current review was recorded on August 6, 2026, with the next review due by November 4, 2026.

## Exceptions

Coverage exceptions must identify an exact path, a substantive reason and a non-expired review date. The default and expected state is an empty exception list.

Exceptions do not convert missing tests into successful coverage. They only make a temporary gap visible and expiring.

## Relationship to branch protection

These checks create and validate the repository-side evidence. They do not apply GitHub branch protection.

Issue #219 defines the separate settings action required to enforce `Quality integration gate / quality-integration` on `main`. Until that settings change is applied and independently read back, risk `QR-006` remains open.

## Rollback

Revert the implementation PR. Do not remove the coverage or maintenance validators while retaining claims that Stage 7 maintenance is enforced.
