# Tactic analytics pipeline runbook

## Boundary

The repository contains the deployable analytics tools and the deployable Flask API baseline. A repository merge does not prove that either component is deployed on the VPS. Live JSON data, credentials, service environment, cron state and generated reports remain VPS-owned operational state.

The analytics pipeline is advisory only. It does not edit browser runtime sources, active presets, recommendation weights or VPS tactical collections.

## Environment

Required:

```bash
export SLF_API_TOKEN='...'
```

Optional:

```bash
export SLF_API_URL='https://slf-api.mostdef.ru'
export SLF_TACTIC_STATE_DIR='/srv/slf/tactic-analytics'
export SLF_TACTIC_RETENTION_DAYS='90'
```

The token is read from the environment only. The exporter does not write it to manifests, reports or logs.

## Full run

```bash
bash tools/run-tactic-analytics-pipeline.sh
```

The pipeline obtains an exclusive `flock`, exports the four canonical v2 collections, runs the quality gate, builds JSON and Markdown performance reports, generates advisory policy proposals, verifies report checksums and publishes an immutable run through an atomic `reports/latest` symlink replacement.

A failed export, failed quality gate, failed aggregation, checksum failure or proposal failure occurs before the pointer switch and leaves the previous `latest` target intact.

## Output layout

```text
var/tactics/
  pipeline.lock
  runs/<UTC run id>/
    export/
      export-manifest.json
      match_results_v2.json
      preset_events_v2.json
      preset_effects_v2.json
      match_snapshots_v2.json
    report/
      quality-report.json
      tactic-performance-report.json
      tactic-performance-report.md
      tactic-policy-proposals.json
      tactic-policy-proposals.md
      report-checksums.sha256
      run-manifest.json
  reports/
    runs/<UTC run id>/
      ...immutable published report files...
    latest -> runs/<UTC run id>
```

`run-manifest.json` records the run ID, repository commit when available, source counts, contract version, report checksums and publication time. It contains no token or authorization data.

## Cron

```cron
15 4 * * * cd /srv/slf/SLF && SLF_TACTIC_STATE_DIR=/srv/slf/tactic-analytics /usr/bin/bash tools/run-tactic-analytics-pipeline.sh >> /var/log/slf-tactic-analytics.log 2>&1
```

Store `SLF_API_TOKEN` in the service environment or a root-readable environment file, not in the crontab or repository.

## Quality policy

Publication is blocked when:

- a required canonical collection file is missing;
- a collection file is malformed or contains invalid JSON;
- `preset_effects_v2.json` is empty in production mode;
- effect `gameId` coverage is below 95%;
- effect delta coverage is below 90%.

Low telemetry, fingerprint or decision coverage remains a warning to allow explicit migration from older records. Duplicate and missing unique keys are reported as warnings so operators can measure historical data quality before any separate migration.

Empty effects are allowed only for deterministic bootstrap/testing with the explicit `--allow-empty` quality flag. The production runner does not use this flag.

## Aggregation contract

The aggregator reads `preset_effects_v2.json` first and retains legacy filename fallbacks for historical rebuilds. The report records the exact source filename.

The current scoring implementation is a documented subset of `slf_tactic_evaluation_contract_v1`. Missing source metrics are reported as unavailable and are not silently represented as observed zeroes. Confidence requires both raw and recency-weighted effective sample thresholds.

## Policy proposals

`generate-tactic-policy-proposals.mjs` only considers ranking rows marked `promotion_candidate` or `policy_candidate`. Its output is advisory and contains `requiresHumanApproval: true`. It never writes to runtime sources, presets, recommendation weights or VPS collections.

## Verification

```bash
node tools/test-tactic-analytics-pipeline.mjs
python -m unittest vps/api/test_server.py -v
```

The deterministic analytics test covers canonical filenames, a valid effect, empty data, missing collections, corrupt JSON and duplicate keys. The API tests cover authorization, atomic replacement failure, concurrent append preservation, tactical idempotency and collection health statistics.

GitHub Actions runs syntax checks and both test suites for relevant changes.

## Rollback

Published reports are immutable under `reports/runs/<run id>`. Rollback is an atomic replacement of `reports/latest` with a symlink to a known-good run. Do not copy files over the active target and do not remove the current target before the replacement symlink is ready.

No browser deployment rollback is required for analytics-only changes. API code rollback remains a separate operational action under `vps/ops/README.md` and does not roll back live data.
