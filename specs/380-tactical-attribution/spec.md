# 380 — Exact tactical attribution and clean comparisons

## Approved outcome
Recognize a named active v11/v12 preset only when observed controls match all 14 controls plus normalized priority. Exclude unattributed or conflicting records from per-preset comparisons while keeping source events, effects, and match results for audit and general match outcomes.

## Evidence
2026-10-20 read-only export: 122/123 finished matches missing finalPreset, 447/651 analyzed events unknown and 360/460 analyzed effects unknown. Unknown historical matches cannot be retrospectively named without exact evidence.

## Invariants
- A recommendation, alias or partial legacy signature is not proof a tactic was applied.
- Manual, modified, incomplete, unknown or ambiguous vectors remain unattributed.
- Provenance for original records stays unchanged and no database row is deleted.
- Known-name phase attribution is observation, not independent game-server adoption.
- `game_confirmed` and eligibility for ranking remain fail-closed (#342); #252 auto-retune stays blocked.
- No live game action, schema migration, VPS deployment, or generated release modification.

## Acceptance
Only exact unique active catalog matches populate `tacticTelemetry.currentPreset`. Per-preset event, effect and period/context tables omit unknown, manual and explicitly conflicting identity records, with comparable/exclusion counts. Overall W/D/L and original source counts are preserved. JS/Python regressions and exact green SLF CI required.
