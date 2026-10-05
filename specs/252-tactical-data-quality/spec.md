# Spec: Tactical data-quality linkage

Issue: #252
Status: Approved implementation
Base: dba05d6739c0ccde80276c4ea3361f6fa2f3e30d

## Problem

Current tactical telemetry contains useful volume but too many records lose score state, exact production preset identity, high-resolution Tactical Lab exposure, or a resolvable finished-match outcome. Historical records must remain untouched.

## Required behavior

- Read the live/final score from the score-board structure without inventing zero values when score text is absent.
- Preserve the legacy score-board parser and add a conservative structural fallback only when exactly two score values are present.
- Attribute a production preset only when the observed tactical controls exactly match one of the eleven active built-in production preset control objects.
- Preserve non-production explicit preset labels and historical data compatibility.
- Export Tactical Lab wall-clock exposure from `elapsedWallClockMs` while preserving legacy game-minute exposure.
- Distinguish a linked finished-result record from a finished result whose owned-team outcome can actually be resolved.
- Report privacy-safe unresolved-result reasons in Tactical Lab and match-outcome quality summaries.
- Keep P03 assignment weights and all production preset controls unchanged.

## Non-functional requirements

- No destructive data migration.
- No secrets or raw game IDs in derived public reports.
- No fuzzy preset matching.
- No automatic experiment promotion.
- Backward-compatible report fields remain present.
- Runtime and exporter regressions cover new behavior.

## Follow-up: finished-result score recovery (2026-10-05)

Status: Approved implementation
Base: 67755f2a576130a3c5156e67297acb1f8f4d684d
Target release: 4.4.330

### Evidence

The current 2026-10-04 RAG export contains 329 `match_results_v2` rows, but only 44 are outcome-resolvable; 285 are invalid because the score is missing. Tactical Lab links 85 finished results to activated experiments, yet resolves 0 outcomes because all linked results have `missing_or_invalid_score`. Fresh result rows exist from 4.4.328 and 4.4.329, so this is an active evidence blocker rather than a historical-only defect.

### Required behavior

- Preserve the legacy `.score_board` parser.
- Support the FM2026 host score representation used by current design surfaces: a compact `.fm-score` value such as `2-1`.
- Restrict the FM2026 fallback to the match surface.
- Accept only one unambiguous score pair and fail closed when multiple score-looking nodes exist.
- Never synthesize a zero score from missing or malformed content.
- Finished `match_results_v2` records must carry the parsed final score and a result key containing that score.

### Non-functional requirements

- No P03 population or weights change.
- No production preset or Production Advisor change.
- No API, VPS, storage, schema, or historical-data rewrite.
- No automatic Tactical Lab promotion/evolution.
- Exact-artifact browser regression must exercise FM2026 finished-score parsing and ambiguity rejection.
