# SLF Governance

Version: 1.0.0
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
