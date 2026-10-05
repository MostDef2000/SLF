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

## Follow-up plan: finished-result score recovery

1. Extend `MatchStateParser.readScore()` after the existing legacy parser with one FM2026 fallback scoped to `.match_content .fm-score`.
2. Parse only a complete `N-N`, `N:N`, en-dash, or em-dash score pair with one- or two-digit sides.
3. Return a score only when exactly one FM2026 candidate is valid; multiple candidates remain unresolved.
4. Replace the finished-match browser fixture's legacy score board with the FM2026 compact score representation.
5. Require the finished-result payload and `resultKey` to retain the parsed score.
6. Verify branch scope, canonical `SLF CI / ci`, exact-green-head merge, and automatic userscript publication.

### Correct-course / risk check

The production evidence proves missing final scores but does not expose raw production DOM. Repository FM2026 fixtures establish `.fm-score` as a current host score class. The implementation therefore adds only that evidenced compatibility path and does not introduce broad `[class*=score]` or page-wide numeric scraping. If canonical/browser evidence contradicts this assumption, the task returns to implementation rather than widening selectors speculatively.
