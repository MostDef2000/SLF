# DR-002 — Latest-only release model

Status: Active
Date: 2026-06-25
Decision: SLF publishes and integrates release artifacts through the latest-only release model.
Scope: release generation, Core Release integration, GitHub Actions release build, user-facing install artifacts.

## Context

SLF release flow is optimized for a current install target rather than archive management. Historical source history is preserved by git. Runtime install/update should point to the current release artifacts.

## Decision

The canonical generated release artifacts are:

- `releases/latest.user.js`
- `releases/latest.meta.js`

SLF does not require a module-release archive or versioned release artifact folder as part of the standard process.

Core Release integrates approved module work to `main`. Runtime/source changes require the latest release build workflow after integration. Contract-only or documentation-only changes do not require a userscript release build.

## Consequences

- Core Release must clearly state whether GitHub Actions must be run.
- Module agents do not generate final release artifacts directly.
- Archive-style release flows should not be reintroduced without a new decision record.
- Userscript install/update should depend on the latest generated artifacts.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/core-release.md`
