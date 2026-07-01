# SLF Governance

Version: 1.1.0
Status: Active
Applies to: all SLF agents and release workflows
Source of truth: GitHub repository contracts

## 1. Main source of truth

`main` is the only long-term source of truth after a release.

For new implementation work, the editable implementation source of truth is:

1. `main/src/**`; or
2. a module branch freshly reset or recreated from current `main` and verified.

`releases/latest.user.js` is not an editable implementation source. It is a built Tampermonkey artifact.

Agents must not use memory, stale module branch contents, or `releases/latest.user.js` as the source for implementation work.

## 2. Disposable module branches

Module branches are disposable working branches, not long-term source-of-truth branches.

This applies to:

- `team-management`
- `transfer-analyzer`
- `strategy-data-recommendations`

After all of the following are true:

1. Core Release integrated approved module changes into `main`;
2. GitHub Actions `Build latest SLF release` succeeded;
3. browser acceptance check is done;

then the module branch may be deleted and recreated from current `main`, or reset to current `main`.

Old module branch history should not be preserved just in case when everything needed is already in `main`.

Archive old branches only when unreleased work exists or the user explicitly asks for an archive.

## 3. Branch Freshness Check

Before any module agent starts implementation, it must perform a Branch Freshness Check.

Required output:

```text
Branch Freshness Check:
- Current main SHA:
- Module branch:
- Module branch HEAD SHA:
- merge-base(module branch, main):
- Is merge-base equal to current main SHA: YES/NO
- Unreleased diff vs main: YES/NO
- Safe to implement from this branch: YES/NO
```

Rules:

- If the module branch is not fresh from current `main`, do not implement.
- If the module branch has unreleased diff vs `main`, do not implement until the diff is explicitly classified as approved active work.
- If the task is new and no active unreleased work exists, reset or recreate the module branch from current `main` first.
- Agents must read target source files from `main/src/**` or from the verified fresh module branch.
- Agents must not use old module branch contents as source of truth after those changes have been integrated into `main`.

## 4. Core Release handoff safety

Core Release must not accept a module handoff from a stale branch unless the handoff explicitly provides an approved active diff or approved range and the changed files match that diff/range.

Before integrating a module handoff, Core Release must verify:

- approved commit or approved range exists;
- declared changed files match actual changed files;
- source branch freshness or approved active diff/range is clear;
- release artifacts were not modified by the module branch;
- version was not bumped by the module branch;
- only approved files are integrated.

If branch freshness is unclear and no approved active diff/range is provided, Core Release must return BLOCKED or FAILED rather than integrating.

## 5. Reset/recreate policy

Preferred simple lifecycle:

```text
module task starts
→ module branch is fresh from current main
→ agent commits approved change in module branch
→ Core Release integrates approved files into main
→ GitHub Actions builds latest release
→ browser acceptance check passes
→ module branch may be reset/recreated from current main
```

Do not store long-term work in module branches. Use GitHub issues, approved commits/ranges, copy-ready handoffs, and `main` as durable records.

## 6. Actions rule

Governance-only contract changes do not require GitHub Actions.

Run Actions only when a verified source/tooling integration on `main` affects runtime source, release tooling, or the latest release build inputs.

## 7. Permanent decision records

Permanent project decisions must be documented in `docs/decision_records/` when they change future agent behavior.

Use a decision record for durable rules such as:

- source-of-truth priority;
- release model;
- branch lifecycle;
- cross-module ownership;
- security/secret handling;
- release gate policy.

Do not create decision records for routine implementation details, one-off fixes, or temporary debugging notes.

Every decision record must include:

```text
Status:
Date:
Decision:
Scope:
Consequences:
Related contracts:
```

When a decision conflicts with older chat context, the repository decision record and active contracts win.

## 8. Standard module handoff block

After a completed module implementation task, the module agent must return a handoff block that Core Release can copy without interpretation.

Required format:

```text
COPY-READY MESSAGE FOR CORE RELEASE AGENT

Module:
Source branch:
Approved commit:
Changed files:
- ...
Summary:
- ...
Integration notes:
- ...
Acceptance checks:
- ...
Safety checks:
- Release files changed by module: NO
- Version bumped by module: NO
- Out-of-scope files changed: NO
- Secrets/tokens committed: NO
Knowledge/API sources used:
- ... / NONE
Cache/schema/storage impact:
- ... / NONE
Bundle-order/module-registry impact:
- ... / NONE
Core Release instruction:
- Integrate only the approved files listed above.
- Do not invent or rewrite business logic.
- Do not use releases/latest.user.js as source.
```

If a field is not relevant, use `NONE`. Do not omit required fields.

## 9. Review gate verdict standard

Review and release gate agents must end with exactly one verdict:

```text
APPROVED FOR RELEASE
CHANGES REQUIRED
BLOCKED
```

### APPROVED FOR RELEASE

Use only when:

- approved scope matches the implementation;
- changed files are in scope;
- no secrets/tokens are introduced;
- release artifacts and version files were not modified by module agents;
- required checks passed or the missing checks are explicitly non-blocking.

### CHANGES REQUIRED

Use when:

- the implementation is generally in scope but needs correction before release;
- tests/checks fail due to fixable implementation issues;
- output format, handoff, or acceptance evidence is incomplete but recoverable.

### BLOCKED

Use when:

- required source/API/context is unavailable;
- branch freshness or approved commit cannot be verified;
- the requested change would violate branch contracts;
- the operation requires credentials/secrets that are not safely available;
- a tool/platform limitation prevents safe completion.

A review verdict must include:

```text
Verdict:
Reason:
Scope checked:
Changed files checked:
Checks/evidence:
Required next action:
```

Do not use ambiguous final states such as `looks good`, `probably okay`, `not complete`, or `waiting`.
