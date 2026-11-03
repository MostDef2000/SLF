# 381 — Tasks and acceptance trace

- [x] Add `tactical-knowledge-pack.js` (loader + validator + sync `get()`, anonymous GET, 24h TTL cache).
- [x] Replace the registry `evidenceAdjustment` noop with the knowledgeAssessment adapter (+3 seed prior, non-stacking, clamp ±5, dormant evidence delta).
- [x] Add the escaped provenance line to the compact coach block (displayed preset, none-variant fallback).
- [x] Register the module in `bundle-order.json` (entry, count 92, audit record, registry requires) and `manual-match-symbol-review-v1.json`.
- [x] Wire `node --check` + `node tools/test-tactical-knowledge-pack.mjs` into the `runtime-tactics` CI job.
- [x] Record the supersession of the 325 noop reservation for labeled seed priors only (cohort/evidence requirements stay for outcome evidence).
- [x] Test worker: `tools/test-tactical-knowledge-pack.mjs` (validation matrix, registry seam, cache/expiry, failure paths) — landed and green in this tree.
- [x] Validate full changed-file scope and the verification suite (local: bundle-order, inventory sync, tactic regressions, decision-linkage, loader tests — all green).
- [ ] Canonical CI green on the final head (PR gate — orchestrator).

## Definition of done
Seed priors flow pack → registry → `boundedEvidenceAdjustment` with bounded, labeled, non-stacking influence; provenance renders in the compact coach block; withdrawal works via an empty pack; no automatic tactic application, no outcome-evidence claims, no generated-artifact or VPS changes.

## Dormant future contract (not implemented)
Outcome-evidence cells may later feed `evidenceDelta` only when: cohort-qualified (n ≥ 30 per cell), generator-version/clean-cohort qualified, and the association is bounded and directionally stable. Until then `n` stays `null` and `KNOWLEDGE_EVIDENCE_DELTA` stays 0.
