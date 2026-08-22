# 002-refactoring-program — Tasks

## Definition of Done

All in-scope stages completed with exact-green-head merges, or descoped with recorded reasons. No module > 1500 lines remains among stage 1–4 targets. Every userscript-affecting stage has release verification evidence.

| # | Task | Tracked by | Acceptance evidence | Status |
|---|---|---|---|---|
| 1 | Stage 1: decompose `transfer-market-analyzer.js` | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS, dependency audit consistent, release verified | PENDING |
| 2 | Stage 2: split `manual-match-runtime.js` | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS, release verified | PENDING |
| 3 | Stage 3: layer `tm-enrichment-layer.js` | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS, release verified | PENDING |
| 4 | Stage 4: strategy/tactics cluster splits | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS, release verified | PENDING |
| 5 | Stage 5: VPS Python dedup + helper module | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS, deploy verified per DR-008 | PENDING |
| 6 | Stage 6: tools/tests consolidation | Issue `<TBD>` / PR `<TBD>` | CI SUCCESS | PENDING |
| 7 | Program closure: size report, residual-risk review | this feature | no `src/**` module > 1500 lines; verdicts recorded | PENDING |

## Traceability

Each task row is updated with its canonical Issue and PR numbers when the stage starts. Stage completion requires the linked checkpoint v2 to reach `COMPLETE`.
