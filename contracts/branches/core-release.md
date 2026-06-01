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
3. Update the bundled userscript through the stable latest-only builder.
4. Bump patch version.
5. Update only:
   - `releases/latest.user.js`
   - `releases/latest.meta.js`
   - `data/version.json`
   - `CHANGELOG.md`
6. Preserve Tampermonkey update/download URLs.
7. Commit release outputs directly to `main` when validation passes.

## Same-turn source integration rule

A prepared Git tree is an internal implementation detail. A prepared tree is not a completed task.

When a valid module handoff is approved and a tree is prepared successfully, Core Release must continue in the same turn:

1. Create the commit from the prepared tree.
2. Advance `main` to that commit.
3. Verify the changed files on `main`.
4. Report the source integration commit hash.
5. Return the Manual Build Action block.

Do not stop at:

- tree prepared;
- commit still missing;
- `main` not advanced yet.

Do not ask for additional user confirmation between:

- approved commit verification;
- tree preparation;
- source integration commit creation;
- `main` ref update.

User approval is already provided by:

- the module COPY-READY MESSAGE;
- this Core Release contract.

Stop before writing only if:

- the approved commit cannot be verified;
- changed files differ from the handoff;
- requested paths are out of scope;
- the operation would modify release artifacts manually;
- the operation would modify unapproved files;
- the operation would delete or overwrite unrelated files;
- a GitHub write operation fails.

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

## Full release gate

Before publishing any `releases/latest.user.js` release, Core Release must run the full release gate:

1. Verify the approved source commit changed only the files declared in the copy-ready handoff.
2. Verify every changed JavaScript source file passes:
   - `node --check <file>`
3. Build `releases/latest.user.js` using the stable latest-only builder.
4. Run:
   - `node --check releases/latest.user.js`
5. Validate:
   - `releases/latest.user.js` `@version`;
   - `releases/latest.meta.js` `@version`;
   - `data/version.json` `scriptVersion`;
   - runtime `SLF.scriptVersion`;
   - `@updateURL` is preserved;
   - `@downloadURL` is preserved;
   - no archive file is created;
   - no unapproved module files changed.
6. If build fails:
   - do not publish a partial release;
   - report the exact failing file and line when available;
   - distinguish source bug from builder bug.
7. Never advance schema/cache validators ahead of approved source. Validator must derive schema markers from source or from an explicit module handoff.

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

## Manual Build Action field

After every task, Core Release must explicitly report whether the user should manually run:

`Actions -> Build latest SLF release -> Run workflow -> main`

Every final response must include:

Manual Build Action:
- RUN ACTIONS: YES/NO
- Reason:
- Safe to run now: YES/NO
- Required branch: main
- Required workflow: Build latest SLF release

Decision rules:

1. Say `RUN ACTIONS: YES` only if:
   - a commit was created on `main`; and
   - that commit changed runtime source or release tooling, such as:
     - `src/**`
     - `tools/build-latest-userscript.mjs`
     - `tools/smoke-latest-userscript.mjs`
     - `.github/workflows/build-latest-release.yml`
     - `src/app/bundle-order.json`
     - `src/app/module-registry.json`

2. Say `RUN ACTIONS: NO` if:
   - no commit was created;
   - only read-only audit was performed;
   - only contracts/docs were changed;
   - only operating rules were updated;
   - only release artifacts were inspected;
   - source integration failed or was not verified;
   - repository write was interrupted;
   - the changed files are unrelated to userscript runtime/build output.

3. If `RUN ACTIONS: YES`, also report:
   - exact commit hash to build from;
   - changed files;
   - expected next version;
   - what validation should pass.

4. If `RUN ACTIONS: NO`, also report:
   - what is still missing before Actions should be run.

Never tell the user to run Actions unless the source/tooling commit is already present on `main` and verified.

Never claim a release is published until GitHub Actions has produced and committed the release artifacts.

## Final output requirements

Final source/tool integration output must include:

Source Integration:
- status: COMPLETE / NOT COMPLETE
- commit hash:
- changed files:
- verification:

Manual Build Action:
- RUN ACTIONS: YES/NO
- Reason:
- Safe to run now: YES/NO
- Required branch: main
- Required workflow: Build latest SLF release
- Build from commit:

Final release output must include:

- release commit hash;
- new version;
- changed files;
- validation result;
- `latest.user.js` updated;
- `latest.meta.js` updated;
- version bumped;
- no archive file created;
- Tampermonkey update channel preserved;
- Manual Build Action field.

## Tampermonkey channel

Preserve the exact updateURL and downloadURL above for all releases unless the user explicitly authorizes a release-channel migration.
