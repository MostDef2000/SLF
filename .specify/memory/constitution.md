# SLF SDD Constitution

Version: 1.0.0
Status: Active
Ratified: 2026-08-22

This constitution configures the SDD artifact layer for SLF. Canonical delivery/authorization remains in SLF governance contracts (`contracts/SLF_GOVERNANCE.md`, `contracts/SLF_SCOPE_APPROVAL_POLICY.md`, runtime contracts).

## I. Product outcome before implementation
Every significant userscript/VPS change starts from observable user-facing outcome and protected boundaries before implementation details.

## II. Specifications are durable product intent
`specs/<feature>/spec.md` records WHAT/WHY. GitHub Issues remain canonical backlog, source authorization and audit history.

## III. Plans explain architecture and decisions
`plan.md` records HOW, affected contours (userscript / VPS), compatibility, decisions/rejected alternatives and validation. Accepted runtime architecture differences are written back.

## IV. Tasks are executable and bounded
`tasks.md` records bounded delivery work and completion gates. Material scope change uses normal source authorization via `commit approved`.

## V. Runtime reality feeds SDD
Release verification results, Tampermonkey channel evidence and VPS operational discoveries update active feature artifacts. Historical Issues/PRs are never rewritten to hide prior assumptions.

## VI. Simplicity
Prefer the smallest operable architecture satisfying the outcome and compatibility boundaries.

## VII. Governance authority
SDD tooling does not grant source/merge/release authority. New source work uses the visible Implementation Scope Check followed by exact `commit approved`. Releases follow `contracts/SLF_AUTOMATIC_RELEASE_POLICY.md`.

## VIII. Traceability
A significant PR links exactly one feature spec. Required `spec.md`, `plan.md`, `tasks.md` are kept consistent by review. Docs/spec-only maintenance may remain lightweight.

## IX. Feature identity
The canonical feature identifier is the full directory name `NNN-feature-slug`. Numeric prefixes are sequencing aids; duplicate numeric prefixes for new features are prohibited.

## X. Automation without hidden state
Required product decisions live in GitHub artifacts, not only agent memory/chat.

## XI. Delivery quality without parallel process
For linked significant work, the same canonical feature directory owns the delivery-quality artifacts: NFR assessment in `spec.md`; risk profile, risk-based test design and correct-course check in `plan.md`; acceptance traceability and Definition of Done in `tasks.md`.

Full risk profiling is mandatory only when the change derives a high-risk trigger. Low-risk work may explicitly use `Risk profile: NOT REQUIRED`. NFR `PASS` requires a measurable target and evidence method. Test design uses `unit`, `integration`, `end-to-end`, `runtime-manual` with `P0-P3`. Every acceptance criterion is traceable to a task and evidence path.

Quality verdicts are `PASS`, `CONCERNS`, `FAIL`, `WAIVED`. `FAIL` blocks PR admission. A waiver never bypasses governance hard gates.

## Standard lifecycle

```text
Issue + Implementation Scope Check
-> spec / plan / tasks
-> commit approved
-> implementation + delivery-quality artifacts
-> canonical CI (quality-governance, quality-integration)
-> exact-green-head merge into main
-> automatic release evaluation (SLF_AUTOMATIC_RELEASE_POLICY)
-> release verification on the protected release branch
-> release feedback written back
```
