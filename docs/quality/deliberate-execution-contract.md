# SLF Deliberate Execution Contract

## Purpose

This contract turns the informal instruction “think step by step” into a reviewable engineering control.

The objective is not to collect verbose reasoning. The objective is to require proportionate decomposition, canonical scope approval, explicit assumptions, observable evidence, a separate verification pass, stop conditions, and residual-risk reporting before an agent or maintainer claims that work is complete.

Do not request, store, or publish hidden chain-of-thought or private scratchpad content. Internal deliberation is not an audit artifact. The auditable outputs are the classification, plan, material assumptions, acceptance criteria, approved scope, repository approval, observable evidence, verification results, decision summary, and residual risks.

The machine-readable source of truth is [`data/quality/deliberate-execution-contract-v1.json`](../../data/quality/deliberate-execution-contract-v1.json).

## Canonical scope approval boundary

Every repository mutation requires a prior `Implementation Scope Check` written in plain behavioural language.

Before approval, the agent must not expose code, diffs, selectors, commands, implementation recipes, or speculative patches unless the user explicitly asks for technical detail.

The only repository-write approval phrase is:

```text
commit approved
```

The approval is valid only after the current scope check and persists for the exact approved scope through implementation, commit, pull request, CI, merge, automatic release when applicable, verification, and terminal reporting.

A new scope check and new approval are required for behavioural expansion, changed files outside the approved set, destructive or irreversible operations, new secret or credential handling, storage/schema/migration expansion, behaviour redesign after validation failure, or a separately governed production operation.

Before presenting scope, the agent must reread from current `main`:

- `contracts/SLF_GOVERNANCE.md`;
- `contracts/branches/project-manager.md`;
- `contracts/runtime/SLF_TASK_RUNTIME.md`;
- the relevant domain contract under `contracts/branches/`.

## Reasoning modes

### Direct

Use direct mode only for mechanical, unambiguous, low-risk work such as a read-only lookup, formatting change, or isolated documentation correction.

Required output:

- task;
- classification reason;
- repository-mutation flag;
- acceptance criteria;
- outcome;
- decision summary.

A direct repository mutation still requires approved scope and canonical repository approval.

Any mutation with a material assumption, branching decision, external dependency, or non-trivial test requirement must escalate to structured mode.

### Structured

Structured mode is the default for source changes, refactors, defect analysis, user-interface changes, and normal test or workflow changes.

Required output:

- task and classification reason;
- repository-mutation flag;
- approved scope and repository approval when mutation occurs;
- ordered plan before mutation;
- material assumptions;
- acceptance criteria;
- observable evidence;
- verification results;
- outcome and decision summary;
- residual risks.

The record must separate facts from assumptions and inferences. A success outcome requires at least one successful observable evidence item.

### Critical

Critical mode is mandatory for authentication, authorization, security controls, persisted data, migrations, release generation, provenance, deployment, rollback, destructive actions, and production mutation.

In addition to structured-mode artifacts, critical mode requires:

- alternatives, including a no-change option where applicable;
- adversarial or negative verification;
- explicit stop conditions;
- rollback availability, procedure, and verification;
- operational approval requirement, status, and accountable authority.

Repository approval and operational approval are separate controls. `commit approved` authorizes only the approved repository scope. A quality gate does not authorize deployment. It may prove that a fixed candidate is ready to be considered for a separately approved operational action.

## Execution sequence

1. Reread current governance, PM, runtime, and relevant domain contracts from `main`.
2. Classify the task as direct, structured, or critical.
3. Define acceptance criteria before changing state.
4. Present a behavioural `Implementation Scope Check` without unsolicited implementation detail.
5. Require the exact phrase `commit approved` before repository mutation.
6. Decompose the task into minimal, observable steps.
7. Record material assumptions and distinguish them from verified facts.
8. Prefer reversible steps before irreversible ones.
9. Produce the smallest solution that satisfies the approved scope.
10. Run a separate verification pass intended to disprove the solution.
11. Stop when a required gate fails, evidence is unavailable, approval is absent, scope diverges, or rollback requirements are not met.
12. Report only the decision summary, evidence, verification results, and residual risks.

## Generation pass

The generation pass produces the proposed change or decision. It must remain inside the declared and approved scope and preserve unrelated contracts.

For repository changes, this normally means:

- inspect the current source and real boundary contracts;
- identify the smallest affected surface;
- verify that actual changed files match the approved list or categories;
- write a minimal diff;
- add or update permanent regression evidence;
- avoid changing API, storage, release, or deployment boundaries unless those changes are explicitly in scope.

## Verification pass

The verification pass is separate from solution generation and attempts to find a counterexample.

At minimum, ask:

- Was the current governance, PM, runtime, and relevant domain contract reread from `main`?
- Was `Implementation Scope Check` presented before repository mutation?
- Was the exact phrase `commit approved` used?
- Was unsolicited technical implementation detail kept out of the pre-approval user boundary?
- Do actual changed files and behaviour remain inside the approved scope?
- Which assumptions could be false?
- Which evidence is missing, synthetic, stale, or indirect?
- Could a fixture pass while the production DOM or runtime fails?
- Is the exact candidate artifact being tested rather than an older published artifact?
- Are negative and boundary cases covered?
- Are facts, assumptions, and inferences separated?
- Could the action be irreversible, destructive, or production-affecting?
- Is rollback available and verified where required?

A failed verification may not be converted into success by weakening the oracle. The behavioural contract must be intentionally changed and reviewed, or the task remains partial, blocked, or failed.

## Evidence model

Allowed evidence kinds are:

- test;
- workflow;
- artifact;
- diff;
- runtime observation;
- contract;
- manual owner acceptance.

Each evidence item records a reference and one of these results:

- `success`;
- `failure`;
- `not_run`;
- `not_applicable`.

A success claim is blocked when observable evidence is absent or any required verification failed.

Workflow completion alone is not proof of deployment. Merge, release publication, deployment, and post-deploy verification remain separate decisions and evidence sets.

## Stop conditions

Execution stops instead of improvising around a control when:

- a required quality gate fails;
- the exact candidate artifact cannot be identified;
- a repository mutation lacks prior scope and canonical approval evidence;
- actual changed files or behaviour exceed the approved scope;
- a critical assumption cannot be verified;
- explicit authorization or production approval is absent;
- rollback is required but unavailable or unverified;
- evidence contradicts the proposed success claim.

The resulting outcome must be recorded as `partial`, `blocked`, or `failed`, with the missing evidence or decision identified.

## Pull-request integration

The pull-request template requires a `Scope approval` section containing:

- repository-mutation status;
- approved behavioural scope;
- approved changed files;
- out-of-scope areas;
- scope-check evidence;
- exact canonical approval phrase;
- pre-approval technical-detail status;
- contract-bootstrap evidence.

The `Deliberate execution` section continues to require:

- reasoning mode;
- classification reason;
- plan;
- material assumptions;
- acceptance criteria;
- counterexample or adversarial check;
- expected evidence;
- stop conditions;
- residual risks.

This is a structured decision record, not a request for hidden reasoning.

## Automated enforcement

`tools/test-deliberate-execution-contract.mjs` validates:

- the versioned contract;
- positive and negative execution-record fixtures;
- canonical `commit approved` enforcement for every repository mutation;
- behavioural scope and changed-file evidence;
- pre-approval technical-disclosure restrictions;
- current-contract bootstrap evidence;
- the privacy boundary against chain-of-thought fields;
- success-evidence and verification invariants;
- critical operational approval and rollback requirements;
- pull-request template fields;
- aggregate-workflow integration;
- registration in the quality-gate manifest.

The validator runs in the `static-contract-security` domain of the always-running aggregate quality gate.

## Deployment boundary

Quality gate does not authorize deployment.

Before production mutation, critical mode requires explicit operational approval, a fixed artifact or revision, rollback evidence, and a post-deploy verification plan. Deployment remains incomplete until the production revision, health, changed-path smoke test, and rollback readiness are verified.
