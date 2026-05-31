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

## Preferred release process

1. Take only an approved module release manifest.
2. Integrate only approved files into `src/**` and the bundled userscript.
3. Bump patch version.
4. Update release artifacts.
5. Commit the release directly to `main`.
6. Report release commit hash and validation result.

## Release validation (mandatory)

Every release must preserve exactly:

@updateURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js

@downloadURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js

Validation must fail if either URL is removed, modified, or points anywhere other than the GitHub raw latest release channel.

## Workflow policy

Do not create one-off GitHub workflows for individual releases.
Use only stable reusable workflows/tools.

## Completion gate

Do not call a release complete until required release outputs exist and validation passes.

## Tampermonkey channel

Preserve the exact updateURL and downloadURL above for all releases unless the user explicitly authorizes a release-channel migration.
