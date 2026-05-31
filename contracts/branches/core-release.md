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
- `.github/workflows/**`

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
- optionally `data/version.json`

Every final release must increment userscript `@version`.

Baseline imports may preserve the source baseline version when the user explicitly requests a no-functional-change canonical baseline import.

A baseline/release run is complete only when the repository default branch contains all required final release outputs for the target version.

For baseline `4.4.72`, completion requires all of these files in `main`:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_4_4_72.user.js`
- `data/version.json`
- `CHANGELOG.md`

If any required file is missing, the baseline/release is incomplete.

## Release runbook

### 1. Determine target branch

- Treat `core-release` as the agent/workflow role.
- Publish final Tampermonkey release files to the repository default branch, currently `main`, unless the user explicitly requests another Git branch.
- Do not assume a Git branch named `core-release` exists.

### 2. Validate input

For ordinary module releases:

- require an explicitly named module release manifest under `module-releases/<branch>/<release-id>.json`;
- integrate only the requested manifest;
- do not pull changes from unnamed branches.

For canonical baseline imports:

- require the user-supplied baseline userscript file;
- preserve the baseline version if the user requested no functional changes;
- split the monolith into `src/**` structurally only;
- keep the generated `releases/latest.user.js` functionally identical to the supplied baseline except for explicitly requested release-channel metadata.

### 3. Preferred direct write flow

When writing GitHub files:

- create missing files with `create_file`;
- update existing files with `fetch_file` + `update_file` using `sha`;
- never stop and ask the user to manually upload a generated zip unless GitHub write access is unavailable.

Directly write all required outputs when possible:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_<version>.user.js`
- `data/version.json`
- `CHANGELOG.md`
- `src/**`
- `tools/**` when needed
- `.github/workflows/**` when needed

### 4. Build-based fallback flow

If a large `releases/latest.user.js` or archive userscript cannot be written through the GitHub connector directly, do not stop at a local zip.

Switch to build-based flow and write the smaller source/build files instead:

- `src/**`
- `tools/build-userscript.mjs`
- `.github/workflows/build-release.yml`
- `data/version.json`
- `CHANGELOG.md`
- `releases/latest.meta.js`

The build script must:

- read module/source files from `src/**` in deterministic bundle order;
- generate `releases/latest.user.js`;
- generate `releases/SLF_<version>.user.js`;
- generate or verify `releases/latest.meta.js`;
- preserve the Tampermonkey metadata block;
- preserve business logic exactly unless the user explicitly requested changes;
- run `node --check` on generated userscripts.

The GitHub Actions workflow must:

- run on `workflow_dispatch` and on pushes that change `src/**`, `tools/build-userscript.mjs`, `.github/workflows/build-release.yml`, or `data/version.json`;
- execute `node tools/build-userscript.mjs`;
- run `node --check releases/latest.user.js`;
- run `node --check releases/SLF_<version>.user.js` when the versioned archive exists;
- commit generated `releases/latest.user.js`, `releases/latest.meta.js`, and `releases/SLF_<version>.user.js` back to the repository default branch using GitHub Actions permissions.

### 5. Completion gate

Do not call a baseline or release complete until the default branch contains all required final release outputs.

For baseline `4.4.72`, verify that `main` contains:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_4_4_72.user.js`
- `data/version.json`
- `CHANGELOG.md`

If direct upload failed but build-based flow was configured, report the release as pending GitHub Actions generation until those generated release files exist in `main`.

### 6. Failure handling

- If GitHub write access is unavailable, report the exact write failure and provide the prepared artifact as a fallback.
- If only large-file upload fails, do not ask for manual zip upload; configure build-based flow.
- If GitHub Actions cannot be configured, report that the release is blocked and list the missing files.
- Never label a partial GitHub state as a completed final release.

## Tampermonkey channel

Use raw GitHub URLs for latest.meta.js and latest.user.js on the repository default branch unless the user explicitly requests another Git branch. Keep `@name` and `@namespace` stable unless the user explicitly requests migration.
