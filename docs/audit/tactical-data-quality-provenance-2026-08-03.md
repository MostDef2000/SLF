# Tactical data-quality provenance — 2026-08-03

## Scope

This note classifies the production warnings observed in analytics run `20260803T004139Z` without rewriting canonical data or changing tactical behavior.

## Bounded production evidence

The authenticated API verification reported:

- `preset_effects_v2`: 3 rows;
- effect timestamps from `2026-08-02T08:09:52.060Z` through `2026-08-02T08:16:12.364Z`;
- `telemetryCoverage`: `0`;
- `fingerprintCoverage`: `0`;
- `match_results_v2`: 2 duplicate keys;
- `match_snapshots_v2`: 1 duplicate key;
- no missing unique keys in the four canonical collections.

No raw records, credentials or authorization values are included here.

## Telemetry and fingerprint classification

Release `4.4.254`, which contains the tactic telemetry envelope in `releases/latest.user.js`, was published at `2026-08-02T10:58:37Z`.

All three current production effect rows predate that publication by more than two hours. Therefore the observed zero telemetry and fingerprint coverage is classified as **historical pre-release data**, not evidence that the current `4.4.254` source path is dropping those fields.

Current repository and published-release contracts contain:

- the `installTacticTelemetryEnvelope` wrapper;
- `SnapshotEngine.build()` enrichment;
- deterministic `currentTacticFingerprint` generation;
- transition history with per-transition fingerprints;
- effect propagation through `afterSnapshot.tacticTelemetry || pending.tacticTelemetry || null`;
- runtime integrity normalization and pending-effect retry recovery.

A new record produced by the currently published userscript is required before production coverage can validate the deployed browser runtime.

## Duplicate-key classification

The current API implements append-time idempotency for:

- `snapshotKey` in `match_snapshots_v2`;
- `resultKey` in `match_results_v2`;
- `eventKey` in `preset_events_v2`;
- `effectKey` in `preset_effects_v2`.

The hardened API was deployed after the duplicate rows already existed. Existing duplicates are therefore classified as **historical pre-idempotency records** unless a new post-deployment duplicate is observed.

The current browser keys are deterministic for the same logical record:

- result identity uses game ID, finished state, score and teams;
- snapshot identity uses game ID, status, minute, generation bucket, score and teams.

The API skips an incoming record when its canonical key already exists. Historical rows remain unchanged by design.

## Required regression protection

Repository validation must prove:

1. the modular telemetry envelope enriches snapshots and effects;
2. the published userscript contains the same telemetry contract;
3. effect fallback preserves pending-event telemetry;
4. absent source telemetry remains `null` at the effect layer;
5. client result and snapshot keys are stable across retry-only metadata changes;
6. different snapshot buckets remain distinct;
7. API idempotency covers all four tactical collections.

## Production closure criteria

After the next owned match using userscript `4.4.254` or newer:

- rerun authenticated API verification;
- confirm at least one new effect row has `tacticTelemetry`;
- confirm a current or transition tactic fingerprint exists;
- confirm duplicate-key counts did not increase;
- rerun canonical analytics and record bounded evidence.

Do not delete or rewrite historical duplicates as part of this verification.
