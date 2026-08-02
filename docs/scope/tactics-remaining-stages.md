# Remaining tactics delivery scope

## Objective

Complete the operational loop after tactic retuning, recommendation v3, telemetry, evaluation contract and the standalone performance aggregator.

## Stage 7 — VPS export

- Export `match_results_v2`, `preset_events_v2`, `preset_effects_v2` and `match_snapshots_v2` through the canonical `/api/<collection>` endpoints.
- Use bearer authentication from `SLF_API_TOKEN`.
- Write atomic JSON files and an export manifest.
- Never print or persist the token.

## Stage 8 — Quality gate

- Validate collection availability, row counts, game identity, telemetry coverage, fingerprint coverage and decision-context coverage.
- Distinguish warnings from blocking failures.
- Refuse report publication when required collections are absent or malformed.

## Stage 9 — Reporting pipeline

- Run export, aggregation and quality validation in one lock-protected process.
- Store timestamped reports and update `latest` only after all gates pass.
- Retain source exports for reproducible historical rebuilds.

## Stage 10 — Policy proposals

- Convert statistically eligible ranking rows into advisory promotion, demotion or investigation proposals.
- Require contract sample thresholds and exact tactic fingerprints.
- Never edit presets, recommendation weights or runtime files automatically.

## Stage 11 — Verification and operations

- Add a deterministic smoke test with synthetic telemetry.
- Add GitHub Actions checks for script syntax and the end-to-end fixture.
- Document cron, environment, retention, rollback and failure handling.

## Done criteria

- One command executes the full pipeline.
- Exports are atomic and versioned.
- Invalid or incomplete data blocks publication.
- JSON and Markdown performance reports are generated.
- Advisory policy proposals are generated separately from reports.
- `latest` points only to a successfully validated run.
- No browser runtime, generated release artifact or active policy is changed by this package.
