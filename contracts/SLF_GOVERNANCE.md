# SLF Governance

Version: 2.6.0
Status: Active
Applies to: all SLF agents, implementation workflows, release workflows, and user handoffs
Source of truth: GitHub repository contracts

## 1. Contract priority

All agents must follow:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`;
- `contracts/branches/task-intake.md` for new-task normalization;
- `contracts/branches/project-manager.md` for orchestration;
- the relevant domain branch contract;
- runtime and release-gate contracts.

`SLF_SCOPE_APPROVAL_POLICY.md` overrides older approval wording. `SLF_AUTOMATIC_RELEASE_POLICY.md` and `SLF_WORKFLOW_LIFECYCLE_POLICY.md` override older workflow names, routine manual Actions instructions, and ambiguous CI-state handling.

## 2. Source of truth and bootstrap

`main` is the only long-term source of truth after integration. Editable implementation source is `main/src/**` or a fresh task branch from current `main`.

Generated outputs are not editable implementation source:

- `releases/latest.user.js`;
- `releases/latest.meta.js`;
- `data/version.json`;
- `CHANGELOG.md`.

Before a new implementation scope, reread current `main` versions of Governance, Project Manager, Task Runtime, and the relevant domain contract. Do not implement from stale branch state, generated artifacts, memory, or stale chat summaries.

## 3. Approval boundary

Before repository writes, present an `Implementation Scope Check` describing intended behavior, file categories, exclusions, risks, verification, and release impact in plain language. Before approval, the PM must not provide code, diffs, selectors, commands, implementation recipes, or speculative patches unless the user explicitly requests technical discussion under the scope policy.

The only phrase that authorizes repository writes is:

```text
commit approved
```

No other phrase authorizes repository writes. It must be the exact lowercase phrase shown above and applies only to the approved scope.

After approval, the PM owns the full deterministic safe lifecycle inside the approved scope:

```text
implementation
→ branch verification
→ pull request
→ canonical CI
→ merge
→ automatic release when applicable
→ release verification
→ Tampermonkey instruction
```

No separate confirmation is required for normal PR creation, CI-preserving fixes, merge after green CI, or automatic release. New approval is required only for scope expansion, behavior redesign, destructive action, new secret handling, unapproved storage/schema migration, or other separately governed production work.

## 4. Disposable branches and freshness

Task branches are disposable. Before implementation verify current `main`, branch head, merge-base, unreleased diff, and safety to proceed. Do not implement from a stale branch. Before merge, confirm the final branch is not behind `main` or reconcile and rerun canonical CI.

Sequential connector commits are acceptable on an isolated task branch when an atomic Git Data tree is unavailable, but the complete changed-file set must be verified before merge. Prefer squash integration for a clean `main` source commit.

Placeholder/noop repository writes used only to route tools are prohibited.

## 5. Domain boundaries

Domain agents may edit only approved files/categories. They must not manually edit generated release artifacts, bump versions, publish the common userscript, introduce secrets, or expand behavior beyond scope.

The PM may operationally switch between domain and Core Release roles in one chat while obeying each relevant contract.

## 6. Canonical pull-request CI

The single canonical merge context is:

```text
SLF CI / ci
```

CI states are `PENDING`, `SUCCESS`, `FAILED`, and `UNKNOWN`. Only `SUCCESS` permits merge.

The following are not sufficient evidence:

- `mergeable=true`;
- an empty workflow/status lookup;
- a green custom harness;
- a green specialist job when the final canonical context is not successful;
- a previous-head successful run after the branch changed.

`UNKNOWN` is fail-closed. If connector visibility is incomplete, use another observable Actions surface or remain pending. Never reinterpret absence of evidence as “CI not configured”.

On failure, inspect the exact failed canonical job/step/log before modifying source whenever that evidence is accessible. A custom harness supplements but never replaces the canonical gate.

## 7. Audit and security integrity

Never use dynamic execution or symbol-obfuscation to evade repository audits. `eval`, `Function`, string indirection, or alias tricks must not be introduced to hide a cross-module dependency.

A dependency must be declared in the canonical dependency audit or behavior must be moved to the correct owner module.

Every active workflow YAML must be registered by `data/quality/workflow-inventory-v1.json` and pass `tools/validate-workflow-inventory.mjs`.

## 8. Active Actions topology

The permanent workflow budget is three:

1. `SLF CI` — pull-request quality gate;
2. `SLF Release` — automatic/main and manual-fallback latest-only publication;
3. `SLF Maintenance` — scheduled/manual governance maintenance.

Completed migration or temporary workflow YAML must be removed. Historical names/runs may remain visible in the GitHub Actions sidebar and are audit history, not active orchestration.

## 9. Automatic release

A userscript release is required after approved changes reach `main` when they affect:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `tools/validate-release-provenance.mjs`;
- `.github/workflows/build-latest-release.yml`.

The canonical workflow is `SLF Release`.

Automatic eligible push is the normal path. Manual `workflow_dispatch` is fallback-only but must publish through the same validation/build/provenance path, pinned to the exact current `main` source commit. If that commit is already published, manual dispatch must be an idempotent no-op.

## 10. Release artifacts and versions

A runtime-visible change is not released until a new generated release commit exists on `main`. Generated outputs must never be edited manually or used as implementation source. Version-specific archive userscripts are forbidden.

Release completion requires matching:

- `data/version.json` version and `build.approvedCommit`;
- `releases/latest.user.js` version;
- `releases/latest.meta.js` version;
- release commit on `main`;
- canonical update/download URLs.

Never claim publication before release-commit evidence exists.

## 11. Release verification and workflow observability

Post-merge verification prioritizes repository state: version manifest, `approvedCommit`, userscript/meta version, then release commit. Workflow metadata is supplemental; an empty push-run lookup never proves no release ran.

Generated release-only commits must not recursively create another userscript version.

## 12. Runtime states

Normal lifecycle:

```text
DISCUSSION
→ READY_FOR_IMPLEMENTATION
→ IMPLEMENTING
→ PR_CI_PENDING
→ PR_CI_SUCCESS
→ MERGE_ALLOWED
→ SOURCE_INTEGRATED
→ RELEASE_PENDING
→ RELEASE_SUCCESS
→ BROWSER_ACCEPTANCE or COMPLETE
```

Forbidden transitions:

```text
PR_CI_PENDING → MERGE_ALLOWED
PR_CI_FAILED → MERGE_ALLOWED
PR_CI_UNKNOWN → MERGE_ALLOWED
```

`MANUAL_STEP_REQUIRED` is reserved for a genuinely unavailable platform capability after all safe automated fallbacks are exhausted.

Valid terminal states are only `COMPLETE`, `BLOCKED`, and `FAILED`.

## 13. Capability-aware execution

Before the first integration write, confirm a safe path for complete reads/writes, branch updates, post-write validation, PR creation, CI inspection, merge, and release verification.

Fallback order:

1. connected GitHub API/Contents operations;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. one consolidated GitHub UI manual step;
6. `BLOCKED` only when no safe path remains.

Tool-specific failure, waiting, or empty workflow lookup is not a task-level blocker while another safe method remains.

## 14. Manual platform step

When a platform setting such as branch protection is not exposed by connected tools, provide one narrow manual instruction only after the exact target status context has been observed. Verify the result before resuming merge. Do not ask the user to perform routine repository edits or Actions runs that the agent can execute.

## 15. Tampermonkey handoff

Every final implementation/release/governance response must explicitly state:

```text
GitHub Actions
- Mode: AUTOMATIC / NOT REQUIRED / MANUAL FALLBACK
- Status: NOT STARTED / RUNNING / SUCCESS / FAILED / NOT APPLICABLE
- User action: NONE / exact fallback action

Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

A new verified runtime release means `Required: YES`. Governance-only work means `NO`. Pending/failed release means `NOT YET`.

## 16. Security and system invariants

- Never commit credentials, passwords, private tokens, or secret-bearing debug output.
- `SLF_API_TOKEN` remains outside Git, generated artifacts, logs, chat, issues, PRs, and command history.
- The API must fail closed when the bearer token is missing or empty.
- The shared bearer token is not strong per-user authorization.
- HTTPS remains a separate transport-security requirement.
- VPS is source of truth for live/exported data; Drive is a mirror and RAG is derived/rebuildable.
- Userscript runtime may use only approved sanitized runtime data.
- Transfer Analyzer must not regain persistent player memory/cache without explicit architecture approval.

## 17. Durable decisions

Durable changes to future agent behavior must be recorded in `docs/decision_records/` with status, date, decision, scope, consequences, and related contracts. Active repository contracts and decision records override stale chat context.

## 18. Review verdicts and terminal rule

Review/release gates end with one verdict: `APPROVED FOR RELEASE`, `CHANGES REQUIRED`, or `BLOCKED`.

Do not use ambiguous final wording. Evidence determines completion, and runtime work is not `COMPLETE` until implementation, green final-head canonical CI, main integration, required release, release verification, and Tampermonkey instruction are complete.
