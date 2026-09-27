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
