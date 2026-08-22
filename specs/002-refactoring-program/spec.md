# 002-refactoring-program — Spec

Status: Active
Feature ID: `002-refactoring-program`

## WHAT / WHY

SLF carries structural debt concentrated in a few oversized modules while the rest of the codebase is already well-partitioned (56 modules with a machine-checked dependency audit). This program reduces module size and coupling **without any behaviour change**, so that future feature work, review and testing operate on cohesive units.

The program is durable delivery intent: each stage becomes its own canonical Issue → Implementation Scope Check → `commit approved` → bounded PR. This spec does not authorize any source change by itself.

## Goals

1. Decompose oversized modules into cohesive units under existing domain ownership rules (`contracts/branches/**`).
2. Keep the public symbol surface stable (`TransferMarketAnalyzer`, `RecommendationEngine`, etc.).
3. Keep every intermediate state releasable: canonical CI green on exact heads, dependency audit consistent.

## Non-goals / protected boundaries

- No renaming of public symbols or storage keys.
- No change to persistence formats (`localStorage`, VPS payloads, telemetry envelopes).
- No change to recommendation logic, ranking policies or coach-mode policy semantics.
- Transfer Analyzer must not regain persistent player memory/cache (Governance §16 invariant).
- Generated artifacts (`releases/*`, `data/version.json`, `data/release-evidence.json`, `CHANGELOG.md`) are never hand-edited.
- No new external dependencies; no `eval`/`Function` indirection (Governance §7).

## NFR assessment

| NFR | Target | Evidence method | Status |
|---|---|---|---|
| Behaviour preservation | 0 behavioural diffs per stage | exact-artifact tests, browser e2e, security boundary suites green | PENDING per stage |
| Dependency audit integrity | `bundle-order.json` + audit updated in same PR as any file split | `tools/check-bundle-order.mjs` SUCCESS | PENDING per stage |
| Module size reduction | no module > 1500 lines after stages 1–4 | line count report in each stage PR | PENDING |
| Release safety | each userscript stage publishes via automatic policy only | release verification per stage | PENDING |

## Acceptance criteria

1. All six stages completed or explicitly descoped with recorded reasons.
2. After stages 1–4: no `src/**` module exceeds 1500 lines; public symbols unchanged.
3. After stage 5: shared helpers deduplicated across `vps/exporter-rag/**`; deploy verified per DR-008.
4. Every stage merged through exact-green-head canonical CI with its own authorization receipt.
