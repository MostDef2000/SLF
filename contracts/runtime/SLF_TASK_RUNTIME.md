# SLF Task Runtime Contract

Version: 1.6.0
Status: Active
Applies to: all SLF implementation, release, governance, fallback, and acceptance workflows
Source of truth: protected GitHub `main` for source, repository contracts, and generated `release` branch for published latest-only artifacts

## 1. Purpose

This contract defines the mandatory state machine for SLF work and prevents intermediate states from being reported as completion. The automatic lifecycle is governed by `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`; workflow topology and CI-state semantics are governed by `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`.

Terminal states are only:

```text
COMPLETE
BLOCKED
FAILED
```

## 2. Runtime phases

Allowed phases:

```text
DISCUSSION
READY_FOR_IMPLEMENTATION
IMPLEMENTING
MODULE_COMMITTED
HANDOFF_VALIDATED
PR_CI_PENDING
PR_CI_SUCCESS
PR_CI_FAILED
PR_CI_UNKNOWN
MERGE_ALLOWED
CORE_RELEASE_INTEGRATING
SOURCE_INTEGRATED
RELEASE_PENDING
RELEASE_SUCCESS
MANUAL_STEP_REQUIRED
BROWSER_ACCEPTANCE
COMPLETE
BLOCKED
FAILED
```

## 3. Core meanings

- `DISCUSSION` — scope shaping; no repository write.
- `READY_FOR_IMPLEMENTATION` — scope is clear and awaiting/holding required approval.
- `IMPLEMENTING` — approved branch changes are being applied or corrected.
- `MODULE_COMMITTED` — implementation exists on the task branch; not merge/release-ready.
- `HANDOFF_VALIDATED` — branch scope/integrity checks are complete enough to open/update PR.
- `PR_CI_PENDING` — canonical final context has not completed for the current PR head.
- `PR_CI_SUCCESS` — exact `SLF CI / ci` is successful on the current PR head.
- `PR_CI_FAILED` — canonical CI failed; inspect exact job/step/log and return to implementation for an in-scope fix.
- `PR_CI_UNKNOWN` — CI result cannot be established; fail closed and do not merge.
- `MERGE_ALLOWED` — final head is current, scope-clean, and canonical CI is successful.
- `CORE_RELEASE_INTEGRATING` — approved source is being merged.
- `SOURCE_INTEGRATED` — source/tooling files are verified on protected `main`; this is not release completion.
- `RELEASE_PENDING` — `SLF Release` is expected/running or generated `release` branch evidence is not yet updated.
- `RELEASE_SUCCESS` — generated release-branch commit/version/provenance/artifacts are verified and `main` was not advanced by publication.
- `MANUAL_STEP_REQUIRED` — one narrow platform operation cannot be performed by available tools.
- `BROWSER_ACCEPTANCE` — post-release browser/Tampermonkey acceptance is required.
- `COMPLETE` — every applicable gate is verified or explicitly not applicable.
- `BLOCKED` — a required step remains impossible after fallback evaluation and cannot be represented by one recoverable manual step.
- `FAILED` — unrecoverable implementation/integration/build validation failure within the current scope.

## 4. CI state gate

Only this transition permits merge:

```text
PR_CI_SUCCESS → MERGE_ALLOWED
```

These transitions are forbidden:

```text
PR_CI_PENDING → MERGE_ALLOWED
PR_CI_FAILED → MERGE_ALLOWED
PR_CI_UNKNOWN → MERGE_ALLOWED
```

`mergeable=true`, an empty connector lookup, or a successful non-canonical harness must never produce `PR_CI_SUCCESS`.

After any branch write following a successful run, state returns to `PR_CI_PENDING` until the canonical context succeeds again on the new head SHA.

## 5. Canonical CI evidence

A successful PR CI observation should retain:

```text
headSha
workflow = SLF CI
context = SLF CI / ci
runId
jobId when available
conclusion = success
checkedAt
```

If any of these are stale relative to current head, merge is not allowed.

## 6. Required runtime block

Maintain internally and expose when relevant:

```text
SLF Task Runtime
- Task:
- Responsible agent:
- Current phase:
- Branch:
- Current head SHA:
- Approved scope:
- Changed files:
- Canonical CI evidence:
- Core Release integration:
- main source SHA:
- release publication SHA:
- Release evidence:
- Safe user action:
- Final state:
```

## 7. Automatic continuation

After exact `commit approved`, continue through every deterministic safe transition without waiting for another user message:

```text
implementation
→ integrity verification
→ PR
→ canonical CI
→ in-scope CI fixes if required
→ merge source to main
→ automatic publication to release when applicable
→ release verification
→ final handoff
```

Waiting for CI, mergeability, release trigger, or release artifacts is not `BLOCKED`.

## 8. Post-write integrity

After repository writes and before merge readiness:

1. fetch complete changed files from the task branch;
2. verify structure/endings and no truncation;
3. validate changed executable syntax when tooling is available;
4. run relevant canonical static gates;
5. compare branch to current `main`;
6. confirm changed files remain in approved scope;
7. confirm generated release outputs were not manually edited.

A failure returns to `IMPLEMENTING`.

Placeholder/noop repository writes are prohibited.

## 9. CI failure handling

On `PR_CI_FAILED`, use the exact failed canonical job/step/log when accessible before applying a fix. Do not infer a root cause solely from a custom harness if canonical evidence exists.

A fix that preserves approved behavior remains within the current approval. A behavior redesign requires new scope approval.

Dynamic execution or symbol-obfuscation is not a valid CI fix for dependency/security audits.

## 10. Release transitions

For runtime/build-affecting changes:

```text
SOURCE_INTEGRATED
→ RELEASE_PENDING
→ RELEASE_SUCCESS
→ COMPLETE or BROWSER_ACCEPTANCE
```

Canonical release verification prioritizes repository evidence on `release` while retaining source evidence on `main`:

1. merged source SHA remains the current expected `main` source commit;
2. generated publication did not push another commit to `main`;
3. `release/data/version.json` has the expected new version;
4. `release` manifest `build.approvedCommit` equals merged source SHA;
5. `release` manifest `build.approvedBaseCommit` equals the previous published source SHA;
6. `build.approvedFiles` is the coherent unpublished source range excluding generated outputs;
7. `release/releases/latest.user.js` has the same version;
8. `release/releases/latest.meta.js` has the same version and canonical release-branch URLs;
9. matching generated release commit exists on `release`;
10. `release/data/release-evidence.json` records the published artifact digests for the version.

Historical generated snapshots on `main` are not publication evidence after the release-branch handoff.

Push-workflow lookup is supplemental and an empty result does not imply the release did not run.

## 11. Protected-main invariant

`main` is source-only under normal operation. Generated publication belongs to `release` and must not require a GitHub Actions bypass for `main`.

A desired `main` ruleset may therefore require pull requests and `SLF CI / ci`, require conversation resolution, and block deletion/force pushes with an empty publication bypass list.

If a future release implementation requires a direct generated push to `main`, runtime must return to `DISCUSSION`/scope review rather than weakening branch protection silently.

## 12. Manual step semantics

`MANUAL_STEP_REQUIRED` is non-terminal and permitted only when one specific platform operation is unavailable to connected tools after safe fallbacks are exhausted, such as repository branch-protection settings.

The instruction must include exact UI location, exact setting/value, verification criterion, and no unrelated manual work. After user completion, verify state and continue under the existing approval.

It must not be used for ordinary CI waiting, PR creation, merge, release waiting, or repository edits that the agent can perform.

## 13. Capability fallback

Changing execution mechanism does not invalidate approval. Safe fallbacks include connector/Contents operations, Git Data API, local git, authenticated `gh`, and finally one consolidated GitHub UI step.

Enter `BLOCKED` only after the required operation failed, evidence exists, safe fallbacks were evaluated, no agent-executable path remains, and the issue cannot be recovered as `MANUAL_STEP_REQUIRED`.

## 14. User-action rules

Do not ask the user to manually run normal GitHub Actions, merge routine PRs, copy handoffs between agents, or trust unstated assumptions. The PM/Core Release owns those transitions when tools allow them.

The user may be asked to save/verify a `main` ruleset only when the connector exposes no settings mutation endpoint.

## 15. Final response gate

After repository-write approval, no final response is permitted in a non-terminal phase. Progress updates are allowed, but execution continues immediately.

## 16. Tampermonkey handoff

Every terminal implementation/release response states:

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

Never instruct an update before generated `release` commit/version/provenance are verified.

## 17. Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`
- `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/branches/core-release.md`
- `contracts/runtime/RELEASE_READINESS_GATE.md`
