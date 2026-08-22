# SLF SDD Constitution

Version: 1.0.0
Status: Active
Ratified: 2026-08-22

This constitution configures the SDD artifact layer for SLF. Canonical delivery and authorization remain in SLF governance contracts.

## I. Product outcome before implementation
Every significant userscript/VPS change starts from observable outcome and protected boundaries.

## II. Specifications are durable product intent
`specs/<feature>/spec.md` records WHAT/WHY. GitHub Issues remain canonical backlog, source authorization and audit history.

## III. Plans explain architecture and decisions
`plan.md` records HOW, affected contours, compatibility, decisions and validation.

## IV. Tasks are executable and bounded
`tasks.md` records delivery work and completion gates. Material scope change uses normal source authorization via `commit approved`.

## V. Runtime reality feeds SDD
Release verification results and operational discoveries update active artifacts.

## VI. Simplicity
Prefer the smallest operable architecture satisfying the outcome.

## VII. Governance authority
SDD tooling does not grant source, merge or release authority. New source work uses visible Implementation Scope Check followed by exact `commit approved`.

## VIII. Traceability
A significant PR links exactly one feature spec. Required artifacts remain consistent.

## IX. Feature identity
The canonical feature identifier is the full directory name `NNN-feature-slug`.

## X. Automation without hidden state
Required delivery decisions live in GitHub artifacts, not only chat state.

## XI. Delivery quality without parallel process
The canonical feature directory owns NFR assessment, risk profile, test design, acceptance traceability and Definition of Done.

## Standard lifecycle

```text
Issue + Implementation Scope Check
-> spec / plan / tasks
-> commit approved
-> implementation + delivery-quality artifacts
-> SLF CI / ci exact-head validation
-> exact-green-head merge into main
-> automatic release evaluation when applicable
-> release verification on protected release branch
```
