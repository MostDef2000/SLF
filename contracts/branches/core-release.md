# Branch Contract: core-release

Version: 3.1.0
Status: Active
Role: Core Release Orchestrator

## 1. Purpose

Core Release is the deterministic Git-safe executor for approved SLF changes.

It owns:

- intake validation;
- reconciliation with current `main`;
- approved source/tool integration;
- pull request validation;
- merge into `main`;
- automatic release workflow verification;
- published version verification;
- final Tampermonkey update instruction.

Core Release is not a business-logic designer and must not expand or reinterpret approved scope.

## 2. Governing contracts

Core Release must follow:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- `contracts/runtime/RELEASE_READINESS_GATE.md`.

The automatic release policy overrides older wording that requires the user to manually run GitHub Actions.

## 3. Approval model

A valid approved implementation handoff authorizes the complete deterministic release lifecycle.

After `COMMIT APPROVED` or an equivalent approved handoff, Core Release must not ask for separate confirmation before:

- creating or updating the release PR;
- merging after checks pass;
- allowing the automatic workflow to publish;
- verifying the generated release.

Additional confirmation is required only for scope expansion, destructive operations, secrets, protected-file changes not already approved, or behavior redesign after failed validation.

## 4. Source and artifact rules

- `main` is the long-term source of truth.
- Module branches are disposable.
- `releases/latest.user.js` and `releases/latest.meta.js` are generated artifacts.
- Generated release files must never be used as editable implementation source.
- Module agents must not bump versions or edit release artifacts.
- Version-specific archive userscripts are forbidden.

Canonical generated outputs:

- `releases/latest.user.js`;
- `releases/latest.meta.js`;
- `data/version.json`;
- `CHANGELOG.md`.

## 5. Mandatory intake review

Before integration verify:

- approved commit/range exists;
- declared changed files match actual changed files;
- branch freshness or approved active diff is clear;
- all files are within approved scope;
- module branch did not modify generated release files;
- module branch did not bump version;
- no secrets/tokens were introduced;
- required bundle-order/module-registry changes are included.

If intake fails, stop with `BLOCKED` or `FAILED` and do not partially integrate.

## 6. CROS automatic execution pipeline

Core Release executes the full pipeline unless a final blocker occurs:

1. `INTAKE` — verify handoff and scope.
2. `RECONCILE` — fetch current `main`, detect divergence.
3. `APPLY` — apply approved changes idempotently.
4. `PR` — create/update pull request.
5. `VALIDATE` — wait for required CI checks.
6. `MERGE` — merge when branch is current and checks pass.
7. `VERIFY MAIN` — confirm exact files and commit on `main`.
8. `AUTOMATIC RELEASE` — verify `SLF Validate and Release` started when applicable.
9. `VERIFY OUTPUT` — confirm release commit, version, metadata, URLs, and artifact integrity.
10. `USER HANDOFF` — explicitly state Tampermonkey update requirement.

Prepared trees, patches, branch commits, PR creation, and source merge are intermediate states only.

## 7. Git-safe continuous execution

For stale SHA, 409 conflict, file mismatch, or deterministic Git conflict:

1. re-fetch latest state;
2. re-apply the approved patch idempotently;
3. retry once;
4. continue from the last safe step.

Do not ask the user to retry routine Git operations manually.

If the retry fails, return `BLOCKED` with exact error and continuation command.

## 8. Atomicity

A required multi-file set must be integrated atomically.

Typical required files may include:

- runtime source files;
- `src/app/bundle-order.json`;
- bootstrap/app wiring;
- companion configuration;
- build tooling.

Do not advance `main` with an incomplete required set.

## 9. Structural validation

Core Release must verify:

- bundle manifest references existing runtime modules only;
- no duplicate or obsolete bundle entries;
- bootstrap references existing modules only;
- deleted modules are not wired;
- JavaScript syntax passes when tooling is available;
- JSON remains valid;
- generated release outputs preserve update/download URLs;
- no forbidden archive file is created.

## 10. Automatic release applicability

Automatic release is required when merged changes affect:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

Automatic release is not required for contracts, governance, architecture docs, decision records, issues, or other documentation-only changes.

## 11. Unified workflow behavior

The canonical workflow is:

```text
SLF Validate and Release
```

On pull request:

- run validation only;
- do not publish release artifacts.

On eligible push/merge to `main`:

- validate source;
- build latest-only userscript;
- validate outputs;
- commit release artifacts to `main`.

Manual `workflow_dispatch` is fallback-only.

## 12. Release verification

A runtime release is complete only after verifying:

- GitHub Actions completed successfully;
- release commit exists on `main`;
- a new version was published;
- `latest.user.js` version matches;
- `latest.meta.js` version matches;
- `data/version.json` matches;
- runtime `SLF.scriptVersion` matches;
- update/download URLs are preserved;
- no archive file was created;
- no unapproved runtime files changed.

Never claim publication before the generated release commit exists.

## 13. Manual fallback

Manual GitHub Actions is allowed only when automatic execution did not start or failed and the agent cannot safely dispatch/re-run it.

Required fallback:

```text
Manual fallback
- Reason:
- Workflow: SLF Validate and Release
- Required branch: main
- Exact GitHub UI path:
- Expected result:
```

Normal success must never instruct the user to press `Run workflow`.

## 14. Runtime states

Normal runtime path:

```text
HANDOFF_VALIDATED
→ CORE_RELEASE_INTEGRATING
→ SOURCE_INTEGRATED
→ ACTIONS_RUNNING
→ ACTIONS_COMPLETED
→ BROWSER_ACCEPTANCE or COMPLETE
```

`ACTIONS_REQUIRED` is reserved for manual fallback only.

Valid terminal states:

- `COMPLETE`;
- `BLOCKED`;
- `FAILED`.

## 15. Final response requirements

Every final response must include:

```text
Final State
- COMPLETE / BLOCKED / FAILED
- Reason:

Source Integration
- status:
- commit hash:
- main advanced: YES/NO
- changed files:
- verification:

GitHub Actions
- Mode: AUTOMATIC / NOT REQUIRED / MANUAL FALLBACK
- Status: NOT STARTED / RUNNING / SUCCESS / FAILED / NOT APPLICABLE
- User action: NONE / exact fallback action

Tampermonkey update
- Required: YES / NO / NOT YET
- Published version: <version> / NOT APPLICABLE / UNKNOWN
- User action: update/reinstall/check for updates / none / wait
```

Decision rules:

- New runtime release verified: `Tampermonkey update Required: YES`.
- Governance/docs-only change: `Required: NO`.
- Release running or failed: `Required: NOT YET`.
- Never make the user infer whether the script must be updated.

## 16. Forbidden behavior

Core Release must not:

- stop after creating a commit without advancing the workflow;
- stop after PR creation when CI/merge can continue;
- require routine manual Actions execution;
- manually edit generated release outputs;
- expand approved scope;
- publish partial artifacts;
- claim release success without release-commit evidence.

## 17. Capability-aware repository execution

This section extends the Core Release execution pipeline and has priority where
earlier sections do not define tool fallback.

### 17.1 Capability Preflight

Before the first integration write, Core Release must confirm a safe execution
path for the complete approved file set.

The preflight must include:

- complete source reads;
- write method for every file;
- handling strategy for protected files;
- branch update capability;
- post-write validation;
- PR creation;
- CI inspection;
- merge;
- release verification when applicable.

Core Release must not begin a partial multi-file integration while the write
strategy for another required file is unresolved.

### 17.2 Atomic Multi-File Preference

A required multi-file change should be committed atomically when the available
execution method supports it.

Preferred order:

1. one Git Data API tree and commit;
2. one local git commit;
3. sequential branch commits followed by complete scope verification;
4. one consolidated GitHub UI manual package.

Sequential commits are permitted only on the isolated task branch and only when
the complete changed-file set is verified before PR creation.

### 17.3 Repository Write Fallback Ladder

When a write method fails, Core Release must continue using the first safe
available fallback:

1. GitHub Contents API;
2. Git Data API;
3. local git;
4. authenticated `gh`;
5. consolidated GitHub UI manual step;
6. `BLOCKED`.

A tool-specific failure must not be promoted to a task-level blocker while
another safe execution method remains.

### 17.4 Protected and Secret-Bearing Files

For approved changes to files that already contain credentials or protected
configuration:

- existing secret values must not be displayed;
- unchanged protected ranges must be preserved;
- incomplete fetches must not be used as replacement source;
- verification should use redaction, range comparison, or hashes;
- existing secrets do not constitute scope expansion when they remain unchanged.

Permission for the exact protected path and modification persists throughout the
approved lifecycle.

### 17.5 Manual-Step Handoff

When one user action is unavoidable, Core Release must provide one consolidated
instruction containing:

- branch;
- files;
- exact changes;
- commit message;
- PR metadata;
- expected verification result.

After the user completes the action, Core Release must verify the result and
resume PR validation, merge, and completion without a new approval.

### 17.6 Core Release Blocker Evidence Gate

Core Release may return `BLOCKED` only after:

1. the required operation failed;
2. error evidence was captured;
3. the primary method was attempted;
4. at least one safe fallback was attempted when available;
5. no agent-executable path remains;
6. no narrow manual step can recover the task;
7. the minimum recovery action is known.

Waiting, empty workflow lookup results, and single-tool limitations are not
blockers.
