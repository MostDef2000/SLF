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
- `releases/**`
- `data/version.json`
- `CHANGELOG.md`
- `tools/**`
- stable reusable `.github/workflows/**` only

## Integration rule

`core-release` may integrate only an explicitly requested module release manifest.

It must not invent module business logic, reinterpret module requirements, merge unrequested branches, change module behavior without a module release manifest, or change branch contracts during ordinary release work.

Baseline import exception: when the user explicitly requests a no-functional-change canonical baseline import, `core-release` may import the supplied monolithic baseline and split it into `src/**` only as a structural baseline without changing business logic.

## Required final release outputs

Every final userscript release must update:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_<version>.user.js`
- `CHANGELOG.md`
- `data/version.json`

Every non-baseline final release must increment userscript `@version`.

Baseline imports may preserve the source baseline version when the user explicitly requests a no-functional-change canonical baseline import.

A baseline/release run is complete only when the repository default branch contains all required final release outputs for the target version.

## Preferred release process

1. Take only an approved module release manifest.
2. Integrate only approved files into `src/**` and the bundled userscript.
3. Bump patch version.
4. Update:
   - `releases/latest.user.js`
   - `releases/latest.meta.js`
   - `releases/SLF_<version>.user.js`
   - `data/version.json`
   - `CHANGELOG.md`
5. Commit the release directly to `main` unless the user explicitly requests another target branch.
6. Report release commit hash and validation result.

## Workflow policy

Do not create one-off GitHub workflows for individual releases.

Allowed workflow use:

- stable reusable workflows/tools only;
- no version-specific release workflows such as `core-release-4.4.73-team-management.yml`;
- workflows may support validation, builds, source splitting, or generic release automation, but must not encode a single module release/version as a bespoke workflow.

If the GitHub connector cannot directly upload large release files, prefer stable reusable tooling or a one-time documented bootstrap fallback. Do not keep obsolete one-off release workflows in the repository.

## GitHub write rule

When writing GitHub files:

- create missing files with `create_file`;
- update existing files with `fetch_file` + `update_file` using `sha`;
- delete obsolete files with `fetch_file` + `delete_file` using `sha`;
- never stop and ask the user to manually upload a generated zip unless GitHub write access is unavailable.

## Completion gate

Do not call a baseline or release complete until the default branch contains all required final release outputs.

For baseline `4.4.72`, verify that `main` contains:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_4_4_72.user.js`
- `data/version.json`
- `CHANGELOG.md`

For non-baseline releases, verify that `main` contains:

- `releases/latest.user.js` with the new `@version`;
- `releases/latest.meta.js` with the new `@version`;
- `releases/SLF_<version>.user.js`;
- `data/version.json` with the new version and manifest reference;
- `CHANGELOG.md` entry for the new version.

## Failure handling

- If GitHub write access is unavailable, report the exact write failure and provide the prepared artifact as a fallback.
- If large-file upload fails, do not create a one-off release workflow; use stable reusable tooling or a documented one-time bootstrap fallback.
- If validation fails, report the failed check and do not label the release complete.
- Never label a partial GitHub state as a completed final release.

## Tampermonkey channel

Use raw GitHub URLs for latest.meta.js and latest.user.js on the repository default branch unless the user explicitly requests another Git branch. Keep `@name` and `@namespace` stable unless the user explicitly requests migration.
