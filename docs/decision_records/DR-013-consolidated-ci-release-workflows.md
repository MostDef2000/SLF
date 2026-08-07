# DR-013 — Consolidated CI and release workflows

Status: Active
Date: 2026-08-07

## Decision

SLF uses exactly three permanent GitHub Actions workflow roles:

- `SLF CI` — the single pull-request merge gate with required context `SLF CI / ci`;
- `SLF Release` — automatic latest-only publication from exact current `main` source to the generated `release` branch, plus an idempotent current-main-pinned manual fallback;
- `SLF Maintenance` — scheduled/manual governance and workflow lifecycle review.

Completed migration workflows and duplicate standalone PR workflows are removed from the active default-branch workflow set. Their regression tests remain inside canonical CI when still relevant.

CI state is fail-closed: only an explicitly observed successful canonical context on the final PR head permits merge. `mergeable=true`, an empty workflow lookup, a stale run, or a custom harness is not merge authorization.

Cross-module dependency/security failures must be fixed by declared ownership/dependencies, never by dynamic execution or identifier-obfuscation intended to bypass audits.

`main` is protected source state. Generated latest-only artifacts are published on branch `release`; generated publication does not push to `main` and therefore does not require a GitHub Actions bypass in the `main` ruleset.

## Protected-main handoff

The release-branch migration used one transitional publication so existing Tampermonkey installations that still polled `main/releases/latest.meta.js` could receive metadata that points to `release/releases/latest.meta.js` and `release/releases/latest.user.js`.

After that handoff, the canonical publication state is the `release` branch manifest and artifacts. Historical generated files remaining on `main` are compatibility snapshots, not the release source of truth.

The latest-only `release` branch may be updated with `--force-with-lease` only when its exact previously observed ref still matches. This generated-branch exception never applies to `main`.

## Scope

This decision affects repository workflow topology, CI merge semantics, release publication location, release fallback behavior, workflow lifecycle governance, and all agents that integrate source into `main`.

It does not change VPS deployment policy, production data, API/storage schemas, or the latest-only artifact model established by DR-002.

## Consequences

- The Actions sidebar becomes operationally simpler for new runs; GitHub may retain historical names/runs from deleted workflows.
- Pull-request checks no longer duplicate the same tests across many workflow files.
- Manual release recovery runs the real publication path rather than validation-only logic.
- Workflow sprawl is prevented by a machine-readable three-workflow budget.
- Branch protection can require only `SLF CI / ci` under the single-maintainer model with an empty publication bypass list.
- `SLF Release` reads prior version/provenance from `release`, validates exact current `main`, and publishes generated state only to `release`.
- Tampermonkey update/download URLs point to the generated `release` branch.
- If branch-protection settings are unavailable through connected tools, applying that platform setting remains one narrow manual step after release-branch publication is verified.

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
