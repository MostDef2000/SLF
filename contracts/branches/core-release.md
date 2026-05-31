# Branch Contract: core-release

## Role

Integration-only agent/workflow role for shared core and final bundled userscript releases.

`core-release` is an agent/workflow role, not necessarily a Git branch. Final Tampermonkey release files are published to the repository default branch unless the user explicitly requests another Git branch.

## Scope

This role owns shared core helpers, app bootstrap, module registry, contracts, validation tooling, GitHub release files, and the final bundled userscript.

## Allowed areas

- `src/core/**`
- `src/app/**`
- `contracts/**`
- `module-releases/**`
- `releases/latest.user.js`
- `releases/latest.meta.js`
- existing historical `releases/SLF_<version>.user.js` files only
- `data/version.json`
- `CHANGELOG.md`
- `tools/**`
- stable reusable `.github/workflows/**` only

## Default release mode

A valid module release manifest or copy-ready release handoff from Project Coordinator is explicit authorization to publish.

Do not ask for additional confirmation before GitHub writes, commits, release artifact updates, or workflow execution when the release handoff is valid and in scope.

Core release must:

1. Integrate only approved files from the provided commit.
2. Do not invent, reinterpret, or alter module business logic.
3. Use reusable release tooling/workflow only.
4. Do not create version-specific one-off workflows.
5. Bump patch version.
6. Update only:
   - `releases/latest.user.js`
   - `releases/latest.meta.js`
   - `data/version.json`
   - `CHANGELOG.md`
7. Do not create new per-version archive userscript files such as `releases/SLF_<version>.user.js`.
8. Preserve Tampermonkey update/download URLs.
9. Commit release outputs directly to `main` when validation passes.

Existing archive files may remain for history, including:

- `releases/SLF_4_4_72.user.js`
- `releases/SLF_4_4_73.user.js`
- `releases/SLF_4_4_74.user.js`

From now on, do not create additional archive userscript files.

## Confirmation exceptions

Ask for confirmation only if:

- manifest is incomplete;
- branch or commit cannot be verified;
- requested change is out of contract;
- validation fails;
- destructive action is required.

## Integration rule

`core-release` may integrate only an explicitly requested module release manifest or copy-ready release handoff.

## Release validation mandatory checks

Every release must preserve exactly:

@updateURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js

@downloadURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js

Validation must fail if either URL is removed, modified, or points anywhere other than the GitHub raw latest release channel.

Validation must also confirm:

- `releases/latest.user.js` has the new `@version`;
- `releases/latest.meta.js` has the new `@version`;
- no new `releases/SLF_<version>.user.js` archive file is created;
- `data/version.json` has the new version and manifest reference;
- `CHANGELOG.md` has the new version entry;
- runtime `SLF.scriptVersion` and `SLF.versionInfo` expose the current release version;
- no unapproved module files changed.

## Workflow policy

Do not create one-off GitHub workflows for individual releases.
Use only stable reusable workflows/tools.

## Completion gate

Do not call a release complete until required release outputs exist and validation passes.

## Final output requirements

Final release output must include:

- release commit hash;
- new version;
- changed files;
- validation result;
- `latest.user.js` updated;
- `latest.meta.js` updated;
- version bumped;
- no archive file created;
- Tampermonkey update channel preserved.

## Tampermonkey channel

Preserve the exact updateURL and downloadURL above for all releases unless the user explicitly authorizes a release-channel migration.
