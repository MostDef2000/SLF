# Branch Contract: core-release

## Role

Integration-only agent/workflow role for shared core and final bundled userscript releases.

`core-release` is an agent/workflow role, not necessarily a Git branch. Final Tampermonkey release files are published to the repository default branch unless the user explicitly requests another Git branch.

## Current SLF workflow

Discussion -> module branch commit -> COPY-READY MESSAGE FOR CORE RELEASE AGENT -> Core Release updates latest release files directly.

## Module agent rule

Module agents must:

- commit only inside their own branch/scope;
- not touch release files;
- not bump version;
- not publish common userscript;
- return a COPY-READY MESSAGE FOR CORE RELEASE AGENT.

## Core Release scope

Core Release owns final GitHub/Tampermonkey release-channel updates only.

Allowed release outputs:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `data/version.json`
- `CHANGELOG.md`

Existing historical archive userscripts may remain, but Core Release must not create new per-version archive userscript files.

## Default release mode

A valid copy-ready release handoff is explicit authorization to publish.

Do not ask for additional confirmation before GitHub writes, commits, or release artifact updates when the handoff is valid and in scope.

Core Release must:

1. Integrate only approved files from the provided commit.
2. Do not invent, reinterpret, or alter module business logic.
3. Update the bundled userscript directly.
4. Bump patch version.
5. Update only:
   - `releases/latest.user.js`
   - `releases/latest.meta.js`
   - `data/version.json`
   - `CHANGELOG.md`
6. Preserve Tampermonkey update/download URLs.
7. Commit release outputs directly to `main` when validation passes.

## Consolidation rule

Do not preserve temporary hotfix layering.

If a module release explicitly consolidates multiple files into a single file, Core Release must:

- integrate the consolidated file;
- remove obsolete files listed in the release handoff;
- bundle only the consolidated implementation;
- remove obsolete bundle references;
- not keep legacy hotfix files in `src/**`;
- not preserve temporary compatibility layers unless explicitly requested.

## Forbidden release mechanisms

Do not use:

- `module-releases/`;
- manifest release flow;
- reusable manifest workflow;
- `tools/core-release-apply-manifest.mjs`;
- version-specific one-off workflows;
- per-version archive files like `releases/SLF_<version>.user.js`.

## Confirmation exceptions

Ask for confirmation only if:

- copy-ready handoff is incomplete;
- branch or commit cannot be verified;
- requested change is out of contract;
- validation fails;
- destructive action is required.

## Release validation mandatory checks

Every release must preserve exactly:

@updateURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js

@downloadURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js

Validation must fail if either URL is removed, modified, or points anywhere other than the GitHub raw latest release channel.

Validation must also confirm:

- `releases/latest.user.js` has the new `@version`;
- `releases/latest.meta.js` has the new `@version`;
- no new `releases/SLF_<version>.user.js` archive file is created;
- `data/version.json` has the new version and approved handoff reference;
- `CHANGELOG.md` has the new version entry;
- runtime `SLF.scriptVersion` and `SLF.versionInfo` expose the current release version;
- no unapproved module files changed;
- consolidated releases do not leave obsolete hotfix files or obsolete bundle references behind.

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
