# SLF Minimal Confirmation Policy

Version: 2.1.0
Status: Active
Applies to: all SLF agents
Source of truth: GitHub repository contracts

## 1. Purpose

This policy minimizes unnecessary confirmation prompts while preserving scope, safety, security, and repository-write boundaries.

It must be read together with `contracts/SLF_SCOPE_APPROVAL_POLICY.md`, which defines the canonical user-facing approval phrase and pre-approval communication boundary.

## 2. Default rule

Agents ask for the minimum number of confirmations required to complete approved work safely. Related actions should be presented and approved as one batch whenever possible.

Do not ask for separate confirmation for each file edit, verification step, tree creation, commit, branch ref update, PR action, merge, or release check when those actions are already within an explicitly approved scope.

## 3. Batch approval pattern

For multi-item repository work:

1. reread the current governance, PM, runtime, and relevant domain contracts from `main`;
2. inspect current repository state;
3. prepare a complete proposed batch;
4. present the exact behavioural scope, changed files or file categories, out-of-scope areas, risks, checks, and release impact;
5. obtain the exact approval phrase `commit approved`;
6. execute the approved lifecycle without per-step prompts;
7. report completion, skipped items, blockers, and evidence.

Approval does not cover scope expansion.

## 4. Backlog and public GitHub writes

Creating or updating Issues, comments, labels, or other public backlog state requires explicit user confirmation for the stated batch.

After confirmation, the PM may perform all listed backlog writes without asking once per Issue. Ambiguous, unsafe, or likely duplicate items should be isolated while safe approved items continue.

Issue-only approval does not authorize repository file writes unless the separate repository `Implementation Scope Check` and canonical `commit approved` boundary have been completed.

## 5. Repository implementation rule

Repository work starts in `DISCUSSION` mode.

Before writes, the responsible agent must present a current `Implementation Scope Check` covering:

- intended changed files or file categories;
- behavioral scope;
- out-of-scope areas;
- risks;
- verification plan;
- release impact.

The scope check must use ordinary product language. Do not show code, diffs, selectors, commands, implementation recipes, or speculative patches unless the user explicitly requests technical detail.

The only valid repository-write approval phrase is:

```text
commit approved
```

It is valid only after the current scope check. `делай`, `продолжай`, `внедряй`, `готовь ветку`, `делай реализацию`, uppercase variants, silence, and pre-scope discussion do not authorize repository writes.

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

Stop, present a new `Implementation Scope Check`, and request a new `commit approved` before:

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
- a required permission or platform capability is unavailable after safe fallback evaluation;
- the task cannot be completed safely without an unapproved destructive or security-sensitive step;
- validation establishes that the implementation is not releasable.

Do not treat an intermediate commit, handoff, PR, merge, running workflow, or generated artifact as a terminal state.

## 10. No silent or inferred approval

Silence is not approval. Satisfaction with the proposed behavior is not approval. Pre-scope discussion language does not authorize repository writes. The exact canonical phrase must follow the current scope presentation.

## 11. Reporting requirement

After execution, report:

- completed items;
- skipped items;
- blocked or failed items and exact reasons;
- branch, commits, PR, CI, merge, and release evidence as applicable;
- terminal state;
- any remaining user action.

Do not return hypothetical implementation code when the approved workflow requires actual repository execution.
