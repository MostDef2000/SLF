# SLF Minimal Confirmation Policy

Version: 2.0.0
Status: Active
Applies to: all SLF agents
Source of truth: GitHub repository contracts

## 1. Purpose

This policy minimizes unnecessary confirmation prompts while preserving scope, safety, security, and repository-write boundaries.

## 2. Default rule

Agents ask for the minimum number of confirmations required to complete approved work safely. Related actions should be presented and approved as one batch whenever possible.

Do not ask for separate confirmation for each file edit, verification step, tree creation, commit, branch ref update, PR action, or release check when those actions are already within an explicitly approved scope.

## 3. Batch approval pattern

For multi-item work:

1. inspect current state;
2. prepare a complete proposed batch;
3. present the exact implementation scope, changed files, risks, and checks;
4. obtain one valid approval;
5. execute the approved lifecycle without per-step prompts;
6. report completion, skipped items, blockers, and evidence.

Approval does not cover scope expansion.

## 4. Backlog and public GitHub writes

Creating or updating Issues, comments, labels, or other public backlog state requires explicit user confirmation for the stated batch.

After confirmation, the PM may perform all listed backlog writes without asking once per Issue. Ambiguous, unsafe, or likely duplicate items should be isolated while safe approved items continue.

## 5. Repository implementation rule

Repository work starts in `DISCUSSION` mode.

Before writes, the responsible agent must present a current `Implementation Scope Check` covering:

- intended changed files;
- behavioral scope;
- out-of-scope areas;
- risks;
- verification plan;
- release impact.

A valid explicit approval accepted by the current governance contracts authorizes the complete in-scope lifecycle. The exact phrase `COMMIT APPROVED` remains the safest canonical form.

## 6. Post-approval lifecycle

After valid approval, proceed without repeated confirmation through the applicable sequence:

1. recheck current `main`;
2. create a fresh disposable task branch;
3. implement only the approved scope;
4. run integrity and validation checks;
5. create the implementation commit or commits;
6. open or update the PR;
7. inspect CI;
8. merge when the active contracts and checks permit it;
9. verify automatic release behavior when the change is release-eligible;
10. verify generated artifacts and provide the required browser/Tampermonkey instructions;
11. report a terminal state.

`workflow_dispatch` or a manual build action is a fallback only. It is not the normal completion path for an eligible merge to `main`.

## 7. Core Release rule

Core Release must not ask for confirmation between already authorized integration, PR, CI, merge, and automatic-release verification steps.

Generated release artifacts are never edited as implementation source. Source changes must originate from approved editable source and be assembled by the current deterministic release workflow.

## 8. New approval required

Stop and request new approval before:

- expanding the approved file or behavioral scope;
- destructive actions not included in the approved scope;
- changing protected or unapproved files;
- exposing, storing, moving, or rotating secrets and credentials;
- changing cache/schema/storage keys or migrations beyond the approved plan;
- redesigning behavior beyond the approved task;
- performing operational VPS deployment, restart, cron changes, token rotation, exporter/RAG deployment or rebuild, or Drive synchronization unless separately approved;
- taking any action the user explicitly reserved for later confirmation.

## 9. Stop conditions

Return `BLOCKED` or `FAILED`, or request a decision, when:

- scope is materially unclear;
- actual changed files no longer match the approved scope;
- the approved commit/range cannot be verified;
- a required permission or platform capability is unavailable;
- the task cannot be completed safely without an unapproved destructive or security-sensitive step;
- validation establishes that the implementation is not releasable.

Do not treat an intermediate commit, handoff, PR, merge, running workflow, or generated artifact as a terminal state.

## 10. No silent approval

Silence is not approval. Pre-scope discussion language does not authorize repository writes. Approval must be explicit and must follow the current scope presentation.

## 11. Reporting requirement

After execution, report:

- completed items;
- skipped items;
- blocked or failed items and exact reasons;
- branch, commits, PR, CI, merge, and release evidence as applicable;
- terminal state;
- any remaining user action.
