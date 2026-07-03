# SLF Git Conflict Strategy

## Purpose

This document defines the Git conflict prevention and recovery strategy for SLF.

It exists to prevent:

- stale SHA conflicts;
- unsafe parallel writes;
- branch drift;
- partial integration states;
- accidental overwrite of `main`;
- inconsistent runtime wiring;
- release artifact/source confusion.

This is a governance document. It does not define product behavior or runtime logic.

## Core principle

SLF Git operations must be deterministic, scoped, and recoverable.

The standard write model is:

```text
read latest state -> apply approved scoped change -> validate -> write atomically -> verify
```

No agent may write to GitHub based on stale assumptions when the latest state can be re-fetched.

## Source of truth

`main` is the only long-term source of truth.

Module branches are temporary implementation branches.

Release artifacts are build outputs, not source files.

```text
Source of implementation truth:
src/**

Source of governance truth:
contracts/**

Source of release output:
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

## Branch model

### main

`main` is authoritative after every completed integration.

All final release/build operations must target `main`.

### module branches

Module branches are disposable and must be considered stale after successful Core Release integration.

A module branch must not be reused for new work unless it is recreated or refreshed from current `main`.

### governance changes

Governance changes should be committed directly to `main` only by Project Manager Agent after explicit approval.

Governance changes normally do not require userscript release build.

## Path ownership

| Path | Primary owner | Write rule |
|---|---|---|
| `contracts/**` | Project Manager Agent | Governance only |
| `src/modules/**` | Module Implementation Agent | Approved module scope only |
| `src/app/bundle-order.json` | Module Agent / Core Release | Only when required for runtime wiring |
| `src/app/module-registry.json` | Module Agent / Core Release | Only when required for runtime wiring |
| `tools/**` | Project Manager / Core Release tooling task | Explicit approval required |
| `.github/workflows/**` | Project Manager / Core Release tooling task | Explicit approval required |
| `releases/latest.user.js` | Build Workflow / Core Release | Build output only |
| `releases/latest.meta.js` | Build Workflow / Core Release | Build output only |
| `data/version.json` | Build Workflow / Core Release | Version metadata only |
| `CHANGELOG.md` | Build Workflow / Core Release | Release notes only |

## Write authority rules

### Project Manager Agent

May write:

```text
contracts/**
```

May write only with explicit approval:

```text
README.md
docs/**
tools/**
.github/workflows/**
```

Must not write by default:

```text
src/**
releases/**
data/version.json
CHANGELOG.md
```

### Module Implementation Agent

May write only approved module/source paths.

Typical allowed paths:

```text
src/modules/<module>/**
src/app/bundle-order.json        # only if explicitly required
src/app/module-registry.json     # only if explicitly required
```

Must not write:

```text
contracts/**
releases/**
data/version.json
CHANGELOG.md
```

### Core Release Agent

May write approved source integration to `main`.

May coordinate release output generation.

Must not invent module logic.

Must not use release artifacts as implementation source.

### GitHub Actions Build Workflow

May write:

```text
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

Must not write:

```text
src/**
contracts/**
```

## Pre-write requirements

Before any GitHub write, the agent must know:

```text
Target repository:
Target branch:
Target path(s):
Current file SHA or current main state:
Approved scope:
Expected changed files:
Forbidden paths:
```

For multi-file changes, the agent must identify:

```text
Required file set:
- ...

Atomicity:
- all files must be committed together: YES/NO
- partial commit allowed: YES/NO
```

## Stale SHA / 409 conflict rule

If GitHub write fails due to:

- stale SHA;
- 409 conflict;
- file changed after read;
- branch advanced after read;
- expected SHA mismatch;

the agent must not ask the user to retry immediately.

Required recovery:

```text
1. Re-fetch latest target file or latest main state.
2. Re-apply the same approved patch idempotently.
3. Retry the write once.
4. Continue if successful.
```

Only after this retry fails may the agent return `BLOCKED`.

## Idempotent patch rule

Every patch must be repeat-safe.

A repeat-safe patch means:

- no duplicate imports;
- no duplicate bundle-order entries;
- no duplicate bootstrap mounts;
- no duplicate module-registry entries;
- no duplicate changelog entry for the same release;
- no repeated deletion errors treated as fatal when the intended file is already absent.

Before adding a line or entry, check whether it already exists.

Before deleting a reference, check whether it exists.

Before claiming success, re-read the target state.

## Atomicity rule

Changes must be atomic when runtime correctness depends on multiple files.

Atomic file sets include:

```text
new module file + bundle-order wiring
deleted module file + bundle-order cleanup
module consolidation + obsolete file removal + bundle-order cleanup
runtime source change + required registry/bootstrap wiring
release build output + version.json + changelog
```

Core Release must not advance `main` with partial runtime wiring.

If atomic write is unavailable in the current environment, return `BLOCKED` before writing any part of the file set.

## Sequential write rule

Sequential single-file writes are allowed only when:

- each file can stand independently;
- intermediate repository state is safe;
- failed later writes do not leave broken runtime wiring.

Sequential writes are not allowed for required runtime wiring sets.

## Conflict classification

### Recoverable conflict

Examples:

- stale SHA;
- target file changed after read;
- branch advanced;
- same patch already partly applied.

Required behavior:

```text
re-fetch -> re-apply idempotently -> retry once -> continue
```

### Structural conflict

Examples:

- expected file moved;
- expected anchor removed;
- bundle-order structure changed;
- bootstrap entrypoint pattern changed;
- approved handoff no longer matches latest `main`.

Required behavior:

```text
return BLOCKED with exact mismatch and required next action
```

### Safety conflict

Examples:

- unapproved file would be changed;
- release artifact would be edited as source;
- unrelated module would be overwritten;
- destructive cleanup was not approved.

Required behavior:

```text
return FAILED or BLOCKED depending on whether the scope is invalid or input is missing
```

## Parallel agent strategy

Agents may work in parallel only when their writable paths do not overlap.

Safe parallel examples:

```text
Project Manager edits contracts/**
Module Agent edits src/modules/team/**
Another Module Agent edits src/modules/strategy/**
```

Unsafe parallel examples:

```text
Two agents edit src/app/bundle-order.json
Two agents edit the same module file
Module Agent edits source while Core Release integrates the same branch
Core Release and Build Workflow both edit release artifacts manually
```

When shared files are involved, work must be serialized.

Shared files include:

```text
src/app/bundle-order.json
src/app/module-registry.json
src/bootstrap.js
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
contracts/SLF_AGENT_SYSTEM_SPEC.md
contracts/branches/core-release.md
```

## Bundle-order conflict strategy

`src/app/bundle-order.json` is a shared runtime wiring file.

Before modifying it, the agent must verify:

- target module file exists or will exist in the same atomic commit;
- deleted module references are removed;
- no duplicate entries exist;
- order is preserved unless order change is explicitly approved;
- JSON remains valid.

If two approved changes both touch `bundle-order.json`, Core Release must merge both idempotently or block with exact conflict.

## Bootstrap conflict strategy

Bootstrap/app entrypoint files are shared runtime wiring files.

Before modifying bootstrap wiring, the agent must verify:

- imported module exists;
- mounted module exists;
- mount is not duplicated;
- deleted module is not referenced;
- entrypoint order change is intentional.

If bootstrap structure no longer matches expected anchor, return `BLOCKED`.

## Release artifact conflict strategy

Release artifacts must be generated, not hand-edited.

Protected release outputs:

```text
releases/latest.user.js
releases/latest.meta.js
data/version.json
CHANGELOG.md
```

Rules:

- Module Agents must never edit them.
- Project Manager Agent must not edit them by default.
- Core Release must not use `latest.user.js` as source.
- Build Workflow must generate them from approved source and release notes.
- No version-specific archive userscript may be created.

## Changelog conflict strategy

`CHANGELOG.md` must describe actual approved module/runtime changes.

Do not add generic entries such as:

```text
Updated latest userscript artifacts.
Preserved Tampermonkey URLs.
No archive file created.
```

These are validation facts, not changelog content.

If two releases target the same version, Core Release or Build Workflow must block unless the target version is explicitly approved and release notes are reconciled.

## Version conflict strategy

`data/version.json` must be synchronized with:

```text
releases/latest.user.js @version
releases/latest.meta.js @version
runtime SLF.scriptVersion
CHANGELOG.md latest entry
```

Version bump must happen only when runtime behavior or release tooling changes require userscript update detection.

Docs/contracts-only changes must not bump userscript version.

## Main advancement rule

A commit is not integrated until `main` points to it.

Forbidden final states:

```text
commit created but main not advanced
tree prepared
patch applied
source integration incomplete
```

After creating an integration commit, Core Release must immediately attempt to advance `main`.

If advancing `main` fails due to recoverable conflict, apply the stale SHA / conflict recovery rule.

## Verification after write

After every successful write, the agent must re-read the changed path(s) or relevant `main` state.

Verification must confirm:

- expected file exists;
- expected content is present;
- forbidden files were not changed;
- runtime wiring is consistent when applicable;
- final state is safe.

Do not claim success based only on a write response.

## Forbidden operations

Agents must not:

- force-push `main`;
- overwrite `main` with stale state;
- manually edit build artifacts as implementation source;
- create partial runtime wiring;
- apply unapproved file changes;
- delete files outside approved scope;
- resolve semantic code conflicts by guessing product behavior;
- reuse stale branch state after release;
- treat GitHub write failure as final without required retry/reconcile behavior.

## Required BLOCKED output for Git conflicts

When blocking on Git conflict, output:

```text
Final State:
- BLOCKED

Conflict type:
- stale SHA / structural conflict / safety conflict / missing source / permission issue

Completed steps:
Blocked step:
Affected files:
Latest known main commit:
Retry attempted: YES/NO
Why automatic recovery is unsafe:
Required next action:
Continuation command:
```

## Required FAILED output for unsafe conflicts

When failing due to scope or safety violation, output:

```text
Final State:
- FAILED

Failed rule:
Evidence:
Affected files:
Why this cannot be auto-reconciled:
Required correction:
Recommended next agent:
```

## Strategy summary

SLF avoids Git conflicts by enforcing:

- strict path ownership;
- latest-state reads before writes;
- idempotent patches;
- atomic multi-file commits;
- automatic one-time retry for deterministic conflicts;
- clear BLOCKED/FAILED outputs for non-deterministic conflicts;
- source/release separation;
- `main` as the only long-term source of truth.

END OF STRATEGY
