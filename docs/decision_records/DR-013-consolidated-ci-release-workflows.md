# DR-013 — Consolidated CI and release workflows

Status: Active
Date: 2026-08-07

## Decision

SLF uses exactly three permanent GitHub Actions workflow roles:

- `SLF CI` — the single pull-request merge gate with required context `SLF CI / ci`;
- `SLF Release` — automatic latest-only publication on eligible `main` changes plus an idempotent current-main-pinned manual publish fallback;
- `SLF Maintenance` — scheduled/manual governance and workflow lifecycle review.

Completed migration workflows and duplicate standalone PR workflows are removed from the active default-branch workflow set. Their regression tests remain inside canonical CI when still relevant.

CI state is fail-closed: only an explicitly observed successful canonical context on the final PR head permits merge. `mergeable=true`, an empty workflow lookup, a stale run, or a custom harness is not merge authorization.

Cross-module dependency/security failures must be fixed by declared ownership/dependencies, never by dynamic execution or identifier-obfuscation intended to bypass audits.

## Scope

This decision affects repository workflow topology, CI merge semantics, release fallback behavior, workflow lifecycle governance, and all agents that integrate source into `main`.

It does not change VPS deployment policy, production data, API/storage schemas, or the latest-only artifact model established by DR-002.

## Consequences

- The Actions sidebar becomes operationally simpler for new runs; GitHub may retain historical names/runs from deleted workflows.
- Pull-request checks no longer duplicate the same tests across many workflow files.
- Manual release recovery runs the real publication path rather than validation-only logic.
- Workflow sprawl is prevented by a machine-readable three-workflow budget.
- Branch protection should require only `SLF CI / ci` under the single-maintainer model.
- If branch-protection settings are unavailable through connected tools, applying that platform setting is one narrow manual step after the new context is observed green.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
- `data/quality/workflow-inventory-v1.json`
- `data/quality/quality-gates-v1.json`

Related issue: #233
