# Plan — Tactics 2026 revision (#405)

Order is serial (shared worktree); review gates between stages.

1. **Evidence matrix** (`docs/audit/preset-vector-revision-2026-11.md`)
   - 13 presets × 15 fields; per cell: current value, relevant 2026 claims (id+year+short quote), semantic compatibility verdict, directional evidence, decision, rationale.
   - Per-preset header records: «numeric values unchanged, not validated; retune gate unmet (41/60 linked)».
   - Source: claims digest (278 lines) + full claim texts (directional advice lives in `claim`, not only `quote`).
2. **Engine semantic fixes** (`src/modules/strategy-data-recommendations/**`, `src/modules/tactics-presets/**`)
   - Audit each user-facing explanation and entry-condition string against R2; fix only with a cited claim.
   - `preset-fit-scoring.js` chaos heuristic: no behavior change (verdict: no direct mechanism conflict); document the open question in the matrix instead.
3. **P04 + transition** (`src/modules/tactics-presets/tactical-lab-v1.js`)
   - P04 population definition (genome ids, parameters, pre-registered endpoints per hypothesis).
   - Switch gating: P03 must be terminal for affected assignments; pinning; legacy resolvability; attribution.
4. **Pack** (exporter contour)
   - Case content for gap topics; schema extension fail-closed; separate PR via exporter-rag lane.
5. **Tests** (`tests/**`)
   - Transition suite (reload/pinning/attribution), seam contract suite, acceptance cases for R2 fixes.
6. **Review** — independent reviewer (different model family) on the full diff; orchestrator diff inspection.
7. **PR → CI → merge to `release` → userscript artifacts**; exporter PR separately if R4 surfaces.

## Verification commands

- `node --test tests/` (repo convention — confirm exact runner in tasks)
- `node tests/test-tactic-suite-*.mjs` for preset suite invariants
- Lint/typecheck per repo config if present.
