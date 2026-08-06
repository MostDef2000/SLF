# DR-012: Canonical Scope Approval Boundary

Status: Accepted
Date: 2026-08-06
Decision owner: SLF Project Manager / Repository Owner
Scope: all SLF repository implementation workflows and user-facing development interaction

## Context

SLF already required an `Implementation Scope Check` before repository writes and already used a same-chat autonomous lifecycle after approval.

However, several active contracts accepted multiple approval phrases such as `делай` and `внедряй`, while the machine-readable deliberate-execution contract required approval evidence only for critical work. The contracts also did not explicitly prohibit unsolicited code, diffs, selectors, commands, or implementation recipes before the user approved the behavioural scope.

This allowed an agent to switch from scope discussion into technical consultation, provide speculative code instead of implementing, or treat general continuation language as repository-write approval.

## Decision

SLF adopts one canonical repository-write approval boundary.

Before any repository mutation, the responsible agent must:

1. reread the current governance, PM, runtime, and relevant domain contract from `main`;
2. present `Implementation Scope Check` in plain behavioural language;
3. avoid code, diffs, selectors, commands, implementation recipes, and speculative patches unless the user explicitly requests technical detail;
4. wait for the exact phrase `commit approved`.

No other phrase authorizes repository writes.

After `commit approved`, approval persists for the exact approved scope through implementation, branch commit, pull request, CI, merge, automatic release when applicable, release verification, and terminal reporting.

A new scope check and new approval are required only when the behavioural or changed-file scope expands, a destructive or irreversible operation appears, secret/storage/schema/migration handling expands, validation requires behaviour redesign, or a separately governed production operation is introduced.

The machine-readable deliberate-execution contract, fixtures, validator, quality-gate manifest, and pull-request template must enforce this boundary for every repository mutation, including direct, structured, and critical work.

## Scope

This decision governs:

- repository source, tooling, workflow, contract, and documentation mutations;
- pre-approval user communication;
- approval evidence in deliberate-execution records and pull requests;
- approval persistence through the deterministic lifecycle.

Issue-only and discussion-only actions remain governed by their own explicit confirmation rules and do not authorize repository file writes.

## Consequences

Positive consequences:

- the user reviews product behaviour rather than implementation mechanics;
- approval cannot be inferred from casual continuation language;
- agents stop returning hypothetical code when repository execution is available;
- structured UI and source changes carry approval evidence, not only critical work;
- contract bootstrap reduces drift from stale chat memory;
- one approval remains sufficient for the full in-scope lifecycle.

Tradeoffs:

- older convenience phrases no longer authorize repository writes;
- pull requests must record scope and approval evidence;
- machine fixtures and validators become stricter;
- agents must distinguish repository approval from separate operational production approval.

## Related contracts

- `contracts/SLF_GOVERNANCE.md`
- `contracts/SLF_SCOPE_APPROVAL_POLICY.md`
- `contracts/SLF_MINIMAL_CONFIRMATION_POLICY.md`
- `contracts/branches/project-manager.md`
- `contracts/runtime/SLF_TASK_RUNTIME.md`
- `data/quality/deliberate-execution-contract-v1.json`
- `tools/test-deliberate-execution-contract.mjs`
- `.github/pull_request_template.md`
