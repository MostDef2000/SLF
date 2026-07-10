# DR-002 — Latest-only automatic release model

Status: Active
Date: 2026-07-10
Decision: SLF uses a latest-only release model with automatic publication after approved runtime/build changes reach `main`.
Scope: release generation, Project Manager orchestration, Core Release integration, GitHub Actions, and Tampermonkey user handoff.

## Context

SLF publishes one current Tampermonkey install/update target. Historical state is preserved by git, not by versioned userscript archives.

The previous operating model required the user to manually run GitHub Actions after source integration. SLF now uses one unified workflow that validates Pull Requests and automatically publishes after eligible changes reach `main`.

## Decision

Canonical generated release artifacts are:

- `releases/latest.user.js`;
- `releases/latest.meta.js`;
- `data/version.json`;
- `CHANGELOG.md`.

The canonical workflow is:

```text
SLF Validate and Release
```

Behavior:

- Pull Request: validate only;
- eligible push/merge to `main`: validate, build, verify, and commit release artifacts automatically;
- manual `workflow_dispatch`: fallback/recovery only.

`COMMIT APPROVED` authorizes the PM to continue through branch commit, PR, CI, merge, automatic release, and release verification without separate routine confirmations.

Automatic publication is limited to changes in:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts, architecture documents, decision records, and other documentation-only changes do not publish a new userscript version.

## Consequences

- Users no longer normally press `Run workflow`.
- PM/Core Release must monitor and verify automatic publication.
- Manual Actions instructions are fallback-only.
- Module agents still do not edit generated release artifacts or bump versions.
- Archive-style release flows remain forbidden without a new decision record.
- Every final response must explicitly state whether the user must update the Tampermonkey script and which version was published.
- A runtime task is not complete until the release commit/version and Tampermonkey handoff are verified.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/branches/project-manager.md`;
- `contracts/branches/core-release.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- `contracts/runtime/RELEASE_READINESS_GATE.md`;
- `docs/architecture/slf-control-plane.md`.
