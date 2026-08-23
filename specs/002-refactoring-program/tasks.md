# 002-refactoring-program — Tasks

## Definition of Done

All in-scope stages completed with exact-green-head merges, or descoped with recorded reasons. No module > 1500 lines remains among stage 1–4 targets. Every userscript-affecting stage has release verification evidence.

| # | Task | Tracked by | Acceptance evidence | Status |
|---|---|---|---|---|
| 1 | Stage 1: decompose `transfer-market-analyzer.js` (4407 → 375) | PR #267 / merge `1cee782` | verbatim 146/146; CI SUCCESS; release 4.4.314 verified | DONE |
| 2 | Stage 2: split `manual-match-runtime.js` at IIFE boundary (1270 → 951) | PR #268 / merge `333b09a` | byte-identical parts; CI SUCCESS after TDZ + harness remediation; release 4.4.315 verified | DONE |
| 3 | Stage 3: layer `tm-enrichment-layer.js` (1193 → 10) | PR #269 / merge `c9b2824` | verbatim 37/37; CI SUCCESS first run; release 4.4.316 verified | DONE |
| 4 | Stage 4: strategy/tactics cluster (~2800 → 3 facades + 9 modules) | PR #270 / merge `d239fb1` | verbatim per file; CI SUCCESS after export-tail remediation; release 4.4.317 verified | DONE |
| 5 | Stage 5: VPS Python dedup → `slf_common_utils.py` | PR #271 / merge `fabe09b` | identical-semantics helpers only; exporter unittests 5/5 OK; no deploy (DR-008 separate) | DONE |
| 6 | Stage 6: tools/tests consolidation | this row | DESCOPED — see rationale below | DESCOPED |
| 7 | Program closure: size report, residual-risk review | this feature | closure table below; no `src/**` module > 1500 lines | DONE |

## Stage 6 descope rationale

`tools/check-bundle-order.mjs` is a governance validator whose correctness is load-bearing for every future change; splitting it yields churn risk with no runtime benefit. Test harnesses were already consolidated as in-scope remediation during stages 2–4 (dual-source loading, marker lookups following moved code). Remaining duplication is small and each instance is covered by a green suite. Revisit only if a validator change is independently required.

## Closure size report (post-program)

| Module | Before | After |
|---|---|---|
| transfer-market-analyzer.js | 4407 | 375 |
| manual-match-runtime.js | 1270 | 951 |
| tm-enrichment-layer.js | 1193 | 10 |
| tactic-control-engine.js | 1019 | 148 |
| recommendation-engine.js | 974 | 5 |
| current-action-hint-engine.js | 790 | 83 |

Largest remaining module: `transfer-badge-renderer.js` (1073 lines, created in stage 1) — cohesive badge-rendering code but above the monolith threshold; candidate for a future decomposition stage. Runner-up: `manual-match-runtime.js` (951) — its v2 closure decomposition was descoped in stage 2 (shared closure bindings would require non-verbatim rewiring); revisit only when telemetry behaviour work is next touching that file.

> Correction note: an earlier revision of this table incorrectly named `manual-match-runtime.js` as the largest remaining module; the audit on 2026-08-23 found `transfer-badge-renderer.js` at 1073 lines.

## Residual risks

- Behavioural equivalence rests on verbatim-move verification plus exact-artifact/browser suites; a latent bug masked by pre-refactor ordering would surface identically post-refactor.
- VPS helper module must be deployed together with the scripts importing it (single-directory layout); deployment remains separately governed per DR-008.

## Traceability

Stages map to PRs #267–#271 and releases 4.4.314–4.4.317. Each stage checkpoint reached `COMPLETE` via exact-green-head merge and release verification.
