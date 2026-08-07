# SLF Workflow Lifecycle Policy

Version: 1.0.0
Status: Active
Applies to: `.github/workflows/**`, CI/release governance, temporary migrations

## 1. Purpose

Keep the GitHub Actions surface small, deterministic, and auditable. Workflow YAML is orchestration, not a permanent archive of completed migrations.

## 2. Permanent workflow budget

SLF has exactly three permanent workflow roles:

1. `CI` — one always-created pull-request quality context.
2. `RELEASE` — source validation and latest-only publication after eligible changes reach `main`, with an idempotent manual fallback.
3. `MAINTENANCE` — scheduled/manual governance and lifecycle review.

The permanent workflow budget is three files. Dependabot configuration is not a workflow and is outside this budget.

## 3. Lifecycle classes

Every workflow file must be registered in `data/quality/workflow-inventory-v1.json` as one of:

- `PERMANENT` — one of the three roles above;
- `TEMPORARY` — bounded operational helper with an expiry date and cleanup condition;
- `MIGRATION` — one-time migration orchestration with an expiry date and cleanup condition.

Temporary and migration workflows must include an owner, source issue/PR, `createdAt`, `expiresAt`, and `cleanupCondition`. An expired entry blocks CI.

## 4. No duplicate orchestration

A regression command that is required for normal pull requests belongs in the canonical CI workflow. It must not also run from a standalone pull-request workflow unless the inventory records a time-bounded exception and explains why duplication is necessary.

Completed migration orchestration must be deleted. Its underlying tests and validators remain in the repository when they still protect an active contract.

## 5. Canonical contexts

The only repository-required pull-request status target is:

```text
SLF CI / ci
```

`mergeable=true`, an empty status lookup, or a successful non-canonical workflow is not equivalent to this context.

## 6. CI state semantics

CI status is one of:

```text
PENDING
SUCCESS
FAILED
UNKNOWN
```

Only `SUCCESS` permits merge. `UNKNOWN` is fail-closed and must never be interpreted as “CI is not configured”. If connector visibility is incomplete, inspect another GitHub Actions surface or keep the task pending; do not merge from absence of evidence.

## 7. Canonical reproduction before fixes

Before changing source in response to a CI failure, reproduce or inspect the exact failing canonical command/step whenever evidence is accessible. Custom harnesses supplement but do not replace canonical gates.

Dynamic execution or name-obfuscation (`eval`, `Function`, string indirection, alias tricks) must not be used to bypass dependency, security, ownership, or bundle audits. Cross-module dependencies must be declared or moved to the owning module.

## 8. Release fallback

The release workflow must support both:

- automatic eligible push to `main`;
- manual `workflow_dispatch` pinned to the current `main` source commit.

Manual dispatch must execute the same validation/build/publication path, not a validation-only approximation. Re-running an already published source commit must be an idempotent no-op.

## 9. Enforcement

`tools/validate-workflow-inventory.mjs` must verify:

- every active workflow YAML is registered;
- every registered path exists;
- permanent roles are exactly `CI`, `RELEASE`, `MAINTENANCE`;
- permanent workflow count does not exceed three;
- temporary/migration entries are not expired;
- the canonical CI workflow is unfiltered at pull-request level;
- the release workflow exposes both push and manual-dispatch publication paths;
- maintenance owns the scheduled governance trigger.

The validator runs in canonical CI and scheduled maintenance.

## 10. Historical workflow names

GitHub may continue showing historical workflow names/runs in the Actions sidebar after their YAML files are deleted. Repository lifecycle enforcement concerns active files on the default branch; historical run records are retained as audit evidence.
