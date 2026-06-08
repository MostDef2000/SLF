# Branch Contract: core-release

## Role

Integration-only agent/workflow role for shared core and final bundled userscript releases.

`core-release` is an agent/workflow role, not necessarily a Git branch. Final Tampermonkey release files are published to the repository default branch unless the user explicitly requests another Git branch.

## Current SLF workflow

Discussion -> module branch commit -> COPY-READY MESSAGE FOR CORE RELEASE AGENT -> Core Release updates latest release files directly.

## Shared governance policies

Core Release must follow:

- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/SLF_GOVERNANCE.md`

When shared governance conflicts with older local wording, the stricter safety rule applies. Confirmation requests must be batched whenever safe.

## Module branch lifecycle safety

`main` is the long-term source of truth after release. Module branches are disposable working branches, not long-term storage.

Core Release must not accept a module handoff from a stale module branch unless the handoff explicitly provides an approved active diff or approved range and the changed files match that diff/range.

Before accepting a module handoff, Core Release must verify:

- approved commit or approved range exists;
- declared changed files match actual changed files;
- source branch freshness or approved active diff/range is clear;
- release artifacts were not modified by the module branch;
- version was not bumped by the module branch;
- only approved files are integrated.

If branch freshness is unclear and no approved active diff/range is provided, Core Release must return BLOCKED or FAILED rather than integrating.

Core Release must not use `releases/latest.user.js` as editable implementation source. It is a built Tampermonkey artifact, not source of truth.

After successful Core Release integration, successful GitHub Actions release build, and browser acceptance check, a module branch may be reset or recreated from current `main` according to `contracts/SLF_GOVERNANCE.md`.

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

## Multi-file atomic integration rule

If a runtime/source task requires multiple files to be complete and loadable, Core Release must commit the full required file set atomically.

A required file set includes:

- new runtime source files;
- bundle-order wiring;
- module-registry wiring if relevant;
- bootstrap/app wiring if relevant;
- any required companion config file.

Core Release must not advance `main` with only part of the required file set.

Before writing, Core Release must identify:

```text
Required file set:
- ...

Atomicity:
- all files must be committed together: YES/NO
- partial commit allowed: YES/NO
```

Partial commit is allowed only if the user explicitly requested a staged incomplete source state.

For new runtime files, do not create the file on `main` unless it is also wired into bundle-order/module-registry/bootstrap in the same commit when required for runtime loading.

Implementation requirement:
For multi-file source changes, prefer Git tree/blob commit flow over sequential contents API writes:

1. read current `main`;
2. create/update all required blobs;
3. create one tree;
4. create one commit;
5. advance `main`;
6. verify every required file on `main`.

If atomic multi-file write is not possible in the current environment, return BLOCKED before writing any file.

## Mandatory source/tool integration completion gate

Every source/tool integration task may end only in one of three final states:

1. COMPLETE
2. BLOCKED
3. FAILED

### COMPLETE

COMPLETE means:

- approved source/tool files were integrated into `main`;
- source integration commit exists;
- `main` points to that commit;
- changed files were verified on `main`;
- Manual Build Action block was returned.

### BLOCKED

BLOCKED means:

- Core Release attempted the required write operation;
- GitHub/API/tooling blocked the operation;
- no further safe write can be attempted in the current turn;
- exact next action is provided.

If `update_ref` fails due to a transient GitHub/tool issue, retry once in the same turn. If retry fails, final state must be BLOCKED, not NOT COMPLETE.

### FAILED

FAILED means:

- verification failed;
- approved commit/range does not match handoff;
- changed files are out of scope;
- operation would modify unapproved files;
- operation would violate release policy.

### Forbidden final states

Never end a task in any of these states unless the final state is explicitly BLOCKED with the required blocked-task details:

- tree prepared;
- commit created but `main` not advanced;
- waiting for user confirmation after tree creation;
- waiting for user confirmation after commit creation;
- source integration not complete but no blocker;
- RUN ACTIONS: NO only because the agent stopped early.

### Mandatory completion loop

After approved commit/range is verified, Core Release must execute the full sequence in the same turn:

1. Build integration tree.
2. Create integration commit.
3. Fast-forward `main` to the integration commit.
4. Re-read `main`.
5. Verify changed files on `main`.
6. Return final Source Integration + Manual Build Action block.

If a tree is created successfully, immediately create the commit.
If a commit is created successfully, immediately update `main`.
If `update_ref` fails due to transient GitHub/tool issue, retry once in the same turn.
If retry fails, final state must be BLOCKED, not NOT COMPLETE.

### Prepared tree rule

A prepared tree is internal state only.

Never report a prepared tree as the main result unless final state is BLOCKED.
Never ask the user to approve creating a commit from a prepared tree.

### Created commit rule

A created commit that is not on `main` is not source integration.

If this happens, Core Release must immediately attempt to fast-forward `main`.
Never stop after commit creation unless `update_ref` is blocked.

### Stop-before-writing rule

Only stop before writing if:

- approved commit/range cannot be verified;
- changed files differ from handoff;
- requested paths are out of scope;
- operation would modify release artifacts manually;
- operation would modify unapproved files;
- operation would delete/overwrite unrelated files;
- GitHub/tooling returns a hard blocker.

### Continuation command for BLOCKED state

If BLOCKED, include a ready-to-send continuation command in this exact style:

Continuation command:
Core Release Agent, continue blocked task. Fast-forward main to <commit>. Do not create a new tree. Do not create a new commit. Do not modify files. Verify main and return Manual Build Action block.

## Changelog policy

`CHANGELOG.md` must record the actual approved module/runtime logic, not generic build mechanics.

For every release produced by `Build latest SLF release`, the changelog entry must include:

- version;
- module name;
- source branch;
- approved commit;
- changed files;
- user-visible/runtime behavior changes;
- cache/schema/storage key impact;
- bundle-order/module-registry impact when relevant;
- safety notes only when relevant.

The changelog entry must be derived from the approved Core Release handoff / COPY-READY MESSAGE, especially:

- Summary;
- Integration notes;
- Acceptance checks;
- Cache/schema/storage keys changed;
- Bundle-order/module-registry changes needed.

Do not fill changelog entries with generic release-policy boilerplate such as:

- `Updated latest-only Tampermonkey artifacts from src/**`;
- `No archive userscript file created`;
- `Preserved Tampermonkey update/download URLs`.

Those are release validation checks, not changelog content.

Core Release must provide structured release notes to the manual workflow through `release_notes_json` when running `Actions -> Build latest SLF release`.

If no release notes are provided, the builder must use the explicit fallback text `No module release notes provided.` and must not invent business logic or reuse stale previous notes.

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

## Release completion gate

Do not call a userscript release complete until required release outputs exist and validation passes.

Never claim release published until GitHub Actions has produced and committed release artifacts.

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
- Build from commit:

Decision rules:

1. Say `RUN ACTIONS: YES` only if:
   - final state is COMPLETE;
   - `main` points to the source/tool integration commit;
   - changed files on `main` are verified;
   - changed files affect runtime source or release tooling, such as:
     - `src/**`
     - `tools/build-latest-userscript.mjs`
     - `tools/smoke-latest-userscript.mjs`
     - `.github/workflows/build-latest-release.yml`
     - `src/app/bundle-order.json`
     - `src/app/module-registry.json`.

2. Say `RUN ACTIONS: NO` if:
   - final state is BLOCKED;
   - final state is FAILED;
   - no source/tooling commit was created;
   - only docs/contracts were changed and no runtime/build release is pending;
   - only read-only audit was performed;
   - only release artifacts were inspected.

3. If `RUN ACTIONS: YES`, also report:
   - exact commit hash to build from;
   - changed files;
   - expected next version when known;
   - what validation should pass.

4. If `RUN ACTIONS: NO`, also report:
   - what is still missing before Actions should be run.

Never tell the user to run Actions unless the source/tooling commit is already present on `main` and verified.

Never claim a release is published until GitHub Actions has produced and committed the release artifacts.

## Manual Actions input block

When Core Release returns:

```text
Manual Build Action:
- RUN ACTIONS: YES
```

it must also provide a copy-ready GitHub Actions input block for:

1. Approved source/tool integration commit
2. Comma-separated approved files
3. Structured release notes JSON
4. Optional explicit target version

Required format:

Actions Input:

Approved source/tool integration commit:
```text
<commit_sha>
```

Comma-separated approved files:
```text
<file1>,<file2>,<file3>
```

Structured release notes JSON:
```json
{"module":"...","source_branch":"...","approved_commit":"...","changed_files":["..."],"user_visible_changes":["..."],"technical_changes":["..."],"storage_cache_schema_impact":"...","bundle_order_module_registry_impact":"...","safety_notes":["..."]}
```

Optional explicit target version:
```text
leave empty
```

Rules:

- The approved commit must match the source/tool integration commit on `main`.
- The approved files must match the verified changed files.
- The release notes JSON must describe the actual user-visible/runtime/technical change, not generic build mechanics.
- Optional explicit target version should normally be `leave empty`.
- If `RUN ACTIONS: NO`, do not provide Actions inputs unless the user explicitly asks for a future/manual draft.

## Final output requirements

Every task must end with this final response shape:

Final State:
- COMPLETE / BLOCKED / FAILED
- Reason:

Source Integration:
- status: COMPLETE / NOT COMPLETE
- commit hash:
- main advanced: YES/NO
- main commit after operation:
- changed files:
- verification:

If BLOCKED:
- completed steps:
- blocked step:
- exact error:
- retry attempted: YES/NO
- exact next instruction for user:
- Continuation command:

Manual Build Action:
- RUN ACTIONS: YES/NO
- Reason:
- Safe to run now: YES/NO
- Required branch: main
- Required workflow: Build latest SLF release
- Build from commit:

If RUN ACTIONS: YES, also include the `Actions Input` block defined above.

Final release output must additionally include:

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
