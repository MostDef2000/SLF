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

## Integration rule

`core-release` may integrate only an explicitly requested module release manifest.

It must not invent module business logic, reinterpret module requirements, merge unrequested branches, change module behavior without a module release manifest, or change branch contracts during ordinary release work.

## Required final release outputs

Every final userscript release must update:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_<version>.user.js`
- `CHANGELOG.md`
- optionally `data/version.json`

Every final release must increment userscript `@version`.

Baseline imports may preserve the source baseline version when the user explicitly requests a no-functional-change canonical baseline import.

## GitHub write rule

When writing GitHub files:

- create missing files with `create_file`;
- update existing files with `fetch_file` + `update_file` using `sha`;
- never stop and ask the user to manually upload a generated zip unless GitHub write access is unavailable.

## Tampermonkey channel

Use raw GitHub URLs for latest.meta.js and latest.user.js on the repository default branch unless the user explicitly requests another Git branch. Keep `@name` and `@namespace` stable unless the user explicitly requests migration.
