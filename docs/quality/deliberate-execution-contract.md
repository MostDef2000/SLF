# SLF Deliberate Execution Contract

## Purpose

This contract turns the informal instruction “think step by step” into a reviewable engineering control.

The objective is not to collect verbose reasoning. The objective is to require proportionate decomposition, explicit assumptions, observable evidence, a separate verification pass, stop conditions, and residual-risk reporting before an agent or maintainer claims that work is complete.

Do not request, store, or publish hidden chain-of-thought or private scratchpad content. Internal deliberation is not an audit artifact. The auditable outputs are the classification, plan, material assumptions, acceptance criteria, observable evidence, verification results, decision summary, and residual risks.

The machine-readable source of truth is [`data/quality/deliberate-execution-contract-v1.json`](../../data/quality/deliberate-execution-contract-v1.json).

## Reasoning modes

### Direct

Use direct mode only for mechanical, unambiguous, low-risk work such as a read-only lookup, formatting change, or isolated documentation correction.

Required output:

- task;
- classification reason;
- acceptance criteria;
- outcome;
- decision summary.

Any mutation with a material assumption, branching decision, external dependency, or non-trivial test requirement must escalate to structured mode.

### Structured

Structured mode is the default for source changes, refactors, defect analysis, user-interface changes, and normal test or workflow changes.

Required output:

- task and classification reason;
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
- approval requirement, status, and accountable authority.

A quality gate does not authorize deployment. It may prove that a fixed candidate is ready to be considered for a separately approved operational action.

## Execution sequence

1. Classify the task as direct, structured, or critical.
2. Define acceptance criteria before changing state.
3. Decompose the task into minimal, observable steps.
4. Record material assumptions and distinguish them from verified facts.
5. Prefer reversible steps before irreversible ones.
6. Produce the smallest solution that satisfies the contract.
7. Run a separate verification pass intended to disprove the solution.
8. Stop when a required gate fails, evidence is unavailable, approval is absent, or rollback requirements are not met.
9. Report only the decision summary, evidence, verification results, and residual risks.

## Generation pass

The generation pass produces the proposed change or decision. It must remain inside the declared scope and preserve unrelated contracts.

For repository changes, this normally means:

- inspect the current source and real boundary contracts;
- identify the smallest affected surface;
- write a minimal diff;
- add or update permanent regression evidence;
- avoid changing API, storage, release, or deployment boundaries unless those changes are explicitly in scope.

## Verification pass

The verification pass is separate from solution generation and attempts to find a counterexample.

At minimum, ask:

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
- a critical assumption cannot be verified;
- explicit authorization or production approval is absent;
- rollback is required but unavailable or unverified;
- evidence contradicts the proposed success claim.

The resulting outcome must be recorded as `partial`, `blocked`, or `failed`, with the missing evidence or decision identified.

## Pull-request integration

The pull-request template requires a `Deliberate execution` section containing:

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
- the privacy boundary against chain-of-thought fields;
- success-evidence and verification invariants;
- critical approval and rollback requirements;
- pull-request template fields;
- aggregate-workflow integration;
- registration in the quality-gate manifest.

The validator runs in the `static-contract-security` domain of the always-running aggregate quality gate.

## Deployment boundary

Quality gate does not authorize deployment.

Before production mutation, critical mode requires explicit operational approval, a fixed artifact or revision, rollback evidence, and a post-deploy verification plan. Deployment remains incomplete until the production revision, health, changed-path smoke test, and rollback readiness are verified.
