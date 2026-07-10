# SLF Automatic Release Policy

Version: 1.0.0
Status: Active
Applies to: Project Manager, domain agents, Core Release, runtime state, release gate, GitHub Actions, and Tampermonkey user handoff
Source of truth: GitHub repository contracts and `.github/workflows/build-latest-release.yml`

## 1. Purpose

This policy defines the default end-to-end lifecycle after explicit repository-write approval.

It supersedes older contract wording that requires the user to manually run GitHub Actions after source integration.

Where this policy conflicts with older wording in:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/branches/project-manager.md`;
- `contracts/branches/core-release.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- `contracts/runtime/RELEASE_READINESS_GATE.md`;
- `docs/architecture/slf-control-plane.md`;

the automatic lifecycle defined here has priority.

## 2. Approval boundary

The following phrases authorize repository writes for the approved scope:

- `COMMIT APPROVED`;
- `commit approved`;
- `делай`;
- `внедряй`;
- `готовь ветку`;
- `делай реализацию`.

After approval, the PM owns continuation through all deterministic safe phases without requesting separate confirmations for each step.

The approved lifecycle is:

```text
implementation
→ branch commit
→ pull request
→ CI validation
→ merge into main
→ automatic validate-and-release workflow
→ release commit/version verification
→ Tampermonkey update instruction
```

Separate confirmation is required only when:

- scope must expand;
- destructive or irreversible action appears;
- changed files no longer match the approved scope;
- secrets or credentials are required;
- validation fails and the fix changes approved behavior;
- a non-recoverable platform or permission blocker remains.

## 3. Automatic release rule

For approved runtime/build-affecting changes, the PM/Core Release must:

1. create or refresh a branch from current `main`;
2. implement only the approved scope;
3. create a pull request;
4. wait for required validation;
5. merge when checks pass and branch freshness remains safe;
6. verify that `SLF Validate and Release` starts automatically on `main`;
7. verify the release commit and published version;
8. report the final Tampermonkey action.

The user must not be told to manually press `Run workflow` during the normal successful path.

## 4. Manual fallback

Manual GitHub Actions execution is fallback-only.

It is permitted only when:

- automatic release did not start;
- automatic release was cancelled or failed for a recoverable infrastructure reason;
- the agent cannot safely re-run or dispatch the workflow with available tools;
- the user explicitly asks for a manual rerun.

Fallback state must be `BLOCKED` or `MANUAL FALLBACK`, with an exact UI path and reason.

## 5. Workflow trigger scope

Automatic release on `main` must be limited to runtime/build-affecting files:

- `src/**`;
- `tools/check-bundle-order.mjs`;
- `tools/build-latest-userscript.mjs`;
- `.github/workflows/build-latest-release.yml`.

Contracts, architecture documents, decision records, issues, and other documentation-only changes must not publish a new userscript version.

Generated release-only commits must not recursively start another release.

## 6. Runtime semantics

`ACTIONS_REQUIRED` is no longer the normal user action after source integration.

Normal automatic phases are:

```text
SOURCE_INTEGRATED
→ ACTIONS_RUNNING
→ ACTIONS_COMPLETED
→ BROWSER_ACCEPTANCE or COMPLETE
```

`ACTIONS_REQUIRED` is reserved for manual fallback when automatic execution is unavailable and user action is genuinely required.

## 7. Mandatory final user handoff

Every completed SLF implementation/release response must explicitly state both release automation status and Tampermonkey action.

Required format:

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

Decision rules:

- Runtime-visible change and a newer release was published:
  - `Required: YES`;
  - state the exact published version;
  - instruct the user to update/check for updates in Tampermonkey.
- Governance/docs-only change:
  - `Required: NO`;
  - `Published version: NOT APPLICABLE`;
  - `User action: none`.
- Release still running or failed:
  - `Required: NOT YET`;
  - do not tell the user to update until a release commit is verified.
- Release artifacts already contained the approved change before the task:
  - `Required: NO`, unless a newer version must still be installed in the browser.

## 8. Completion rule

An approved runtime task is not `COMPLETE` until all applicable steps are verified:

- implementation committed;
- PR validated;
- merged into `main`;
- automatic release succeeded;
- release commit/version verified;
- Tampermonkey update instruction returned.

Governance/docs-only tasks may complete without a userscript release.

## 9. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
- `docs/architecture/slf-control-plane.md`
- `docs/decision_records/DR-002-latest-only-release-model.md`
