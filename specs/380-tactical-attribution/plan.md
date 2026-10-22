# 380 — Implementation and validation

## Implementation
- Align event-tracker with the active v11/v12 vector catalog, including priority and incomplete-vector rejection.
- Keep the manual runtime observed preset in sync with the exact built-in match; do not advance server acceptance status.
- Separate analyzed source record counts from comparable per-preset samples. Quarantine unknown/manual/conflicting identities from descriptive comparison tables and readiness cohorts.
- Add edge-case regressions without modifying source storage.

## NFR assessment
**Correctness: high** — false attribution would pollute later recommendations. **Safety: high** — must not convert readback to `game_confirmed`. **Data retention: required** — raw history, result scores and counts must remain. **Release: userscript** — automatic release from protected `main` after exact green head; exporter source update is not VPS deployment.

## Risk-based verification
Exact match, priority permutation, corner mismatch, missing shot, duplicate catalog vector, A→B→A telemetry; unknown/manual/inconsistent analytical records; unchanged global match outcomes; no auto promotion. Run canonical `SLF CI / ci`; merge only with success and fresh base/head.

## Correct-course
If CI fails, inspect the failing job/step/log and make only behavior-preserving in-scope corrections before another CI run.
