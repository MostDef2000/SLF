# SLF Release Readiness Gate

Version: 1.0.0
Status: Active
Applies to: all SLF release workflows
Source of truth: GitHub repository contracts

## 1. Purpose

The Release Readiness Gate defines the final validation layer before a user is allowed to run GitHub Actions for SLF release builds.

Its purpose is to prevent premature or unsafe release execution when source integration or build state is incomplete.

## 2. Gate definition

A release is eligible for Actions only if ALL conditions are satisfied:

```text
Release Readiness Gate
- Source files committed to main: YES
- Changed files verified on main: YES
- Runtime/build-affecting files changed: YES
- Release artifacts already rebuilt for this change: NO
- RUN ACTIONS: YES
- Safe to run now: YES
```

## 3. Conditions

### Source files committed to main

All approved changes must be present in `main` branch.

### Changed files verified on main

The exact files from the approved module handoff must exist in `main`.

### Runtime/build-affecting files changed

At least one of the following must be impacted:

- `src/**`
- `src/app/bundle-order.json`
- `src/app/module-registry.json`
- build tooling or release workflow

If only documentation or governance changes are made, Actions are not required.

### Release artifacts already rebuilt

If latest release artifacts already reflect the change, Actions must NOT be triggered again.

## 4. Decision rules

### RUN ACTIONS = YES

Only when:

- source is fully integrated into `main`
- runtime/build-affecting changes exist
- release artifacts are not yet updated for this change

### RUN ACTIONS = NO

If any of the above is false.

## 5. Evidence requirement

The agent must not rely on assumptions.

It must verify:

- commit presence on `main`
- changed file list match
- build relevance

## 6. Safe user instruction rule

The system must not instruct the user to run GitHub Actions unless:

- `RUN ACTIONS = YES`
- `Safe to run now = YES`

## 7. Failure modes

If verification is impossible:

```text
BLOCKED
Reason: Cannot verify release readiness
Next action: manual GitHub check required
```

## 8. Relationship to other contracts

This contract is referenced by:

- `contracts/SLF_GOVERNANCE.md`
- `contracts/branches/project-manager.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
