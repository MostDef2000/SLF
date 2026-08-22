# SLF Specifications

Status: Active

This directory is the durable Spec-Driven Development layer for SLF.

## Source-of-truth hierarchy

- `contracts/**`: HOW work is authorized, merged, released and accepted (`SLF_GOVERNANCE.md`, `SLF_SCOPE_APPROVAL_POLICY.md`, `SLF_AUTOMATIC_RELEASE_POLICY.md`, `runtime/SLF_TASK_RUNTIME.md`, `runtime/RELEASE_READINESS_GATE.md`).
- GitHub Issue: canonical backlog, source authorization, delivery checkpoint and audit history.
- `specs/<feature>/spec.md`: WHAT/WHY plus measurable NFR targets/evidence status.
- `plan.md`: HOW/decisions/contours (userscript / VPS) plus risk profile, test design and correct-course impact.
- `tasks.md`: bounded execution, acceptance traceability and Definition of Done.
- source code: implementation (`src/**`, `vps/**`, `tools/**`, `tests/**`).
- protected `release` branch: published latest-only Tampermonkey artifacts; generated outputs are never editable source.

For recovery semantics, distinguish **Repository/product truth**, **Delivery-control truth**, and **Transient interaction state**. `main` supplies repository/product truth. The canonical Issue supplies durable delivery-control truth, including machine-readable `SLF Delivery Checkpoint v2`. Initial source admission still requires the complete visible Implementation Scope Check immediately followed by exact `commit approved`; a durable receipt can only resume the same exact admitted scope and cannot create new authority.

Synchronous orchestration uses `ACTIVE`, nonterminal `WAITING_EXTERNAL`, or `TERMINAL` as session disposition.

## Feature identifiers

Use `NNN-feature-slug`. The full directory name is canonical; the number is only a sequence prefix. Duplicate numeric prefixes for new features are prohibited.

## Normal flow

```text
Issue / evidence recovery
-> existing valid checkpoint: bounded Resume Probe
   OR new/materially invalidated task: Delivery Orchestrator + Task Intake
-> visible Implementation Scope Check when fresh source authorization is required
-> commit approved
-> durable authorization receipt + SLF Delivery Checkpoint v2
-> spec / plan / tasks + delivery-quality artifacts
-> implementation + tests (tools/test-*.mjs, tools/test-*.py, tests/browser)
-> PR linked to the feature spec with risk/quality disposition
-> canonical CI -> exact-green-head merge into main
-> automatic release evaluation -> release verification
```
