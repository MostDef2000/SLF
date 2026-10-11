# Implementation plan — #327

Status: approved intent, staged execution.

## Risk profile

HIGH: multi-contour userscript/VPS, destructive historical result cleanup, attribution and long-lived data integrity. P0 checks cover loss of valid results, false confirmed state, duplicate keys, leaked secret, checksum bypass and rejected append.

## Implementation strategy

- **PR A (first):** source `vps/exporter-rag/`, manifest final-stage byte hashing and fail-closed verifier after all producers and before Drive synchronization. Unit-level fixtures for stage overwrite/poisoned/missing/path escape. Finalizer operates on present declared files only.
- **PR B:** inspect runtime input readback and actual native apply semantics; add application-aware change events and snapshots, stable sequence keys, idempotent durable outbox, own-match-only; preserve selected-preset-vs-actual-tactic distinction. Unit/integration/browser fixture.
- **PR C:** guarded source-side physical invalid-result purge (not broad timestamp purge), v9 eligibility/readiness and analytics join accuracy. Dry-run before protected production operation. Verify count before/after and do not change valid score rows.

## Protected boundaries

Changes only to `vps/exporter-rag/**`, `vps/ops/**`, `src/modules/manual-match-telemetry/**`, `src/modules/tactics-presets/**`, related tests and these SDD documents. No generated release artifacts or secrets. VPS deploy/production deletion requires separate ops consent and access; source PR does not equate to production mutation.

## Correct-course gates

- Compare before/after exporter manifest for all file paths at final write stage.
- Reconcile source branch with current protected main before merging; require exact-head CI.
- Validate applied state with native committed readback, never infer confirmation from form selection.
- If game UI does not expose confirmation, persist `applied_unverified` and exclude phase-effect attribution; disclose observable limits.
- Never claim effectiveness ranking from unlinked or legacy rows.
