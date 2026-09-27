# Plan: Tactical data-quality linkage

Issue: #252

## Implementation

1. Harden `MatchStateParser.readScore()` with strict numeric parsing and a score-board-only fallback.
2. Add exact production preset recognition to tactical telemetry using the canonical active built-in preset map already present in `BASE_PRESETS`.
3. Extend Tactical Lab aggregation with wall-clock exposure and explicit result-resolution diagnostics.
4. Extend preset evidence/outcome aggregation with privacy-safe invalid-result reason counts.
5. Update dependency metadata, regressions, and audit documentation.

## Risk controls

- Score fallback accepts only exactly two standalone integer values inside the score board.
- Production preset recognition is exact full-control fingerprint equality; multiple matches resolve to unknown.
- Existing legacy duration/result fields are not removed.
- P03 and production tactic definitions are not edited.

## Verification

- Node tactical telemetry regression.
- Python Tactical Lab exporter regression.
- Python preset evidence exporter regression.
- Browser exact-userscript regression.
- Canonical `SLF CI / ci` on final PR head.
- Fresh base/head/scope comparison before merge.
- Release provenance verification after merge because runtime source changes.
