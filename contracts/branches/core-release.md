# Branch Contract: core-release

## Role

Integration-only branch for shared core and final bundled userscript releases.

## Scope

This branch owns shared core helpers, app bootstrap, module registry, contracts, validation tooling, GitHub release files, and the final bundled userscript.

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

## Tampermonkey channel

Use raw GitHub URLs for latest.meta.js and latest.user.js. Keep `@name` and `@namespace` stable unless the user explicitly requests migration.
