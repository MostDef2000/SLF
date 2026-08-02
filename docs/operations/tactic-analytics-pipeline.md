# Tactic analytics pipeline runbook

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

The token is read from the environment only. The exporter does not write it to manifests or logs.

## Full run

```bash
bash tools/run-tactic-analytics-pipeline.sh
```

The pipeline obtains an exclusive `flock`, exports the four canonical v2 collections, runs the quality gate, builds JSON and Markdown performance reports, generates advisory policy proposals and then atomically replaces `reports/latest`.

A failed export, failed quality gate or failed aggregation leaves the previous `latest` report intact.

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
  reports/latest/
```

## Cron

```cron
15 4 * * * cd /srv/slf/SLF && SLF_TACTIC_STATE_DIR=/srv/slf/tactic-analytics /usr/bin/bash tools/run-tactic-analytics-pipeline.sh >> /var/log/slf-tactic-analytics.log 2>&1
```

Store `SLF_API_TOKEN` in the service environment or a root-readable environment file, not in the crontab or repository.

## Quality policy

Publication is blocked when required collection files are missing, effect `gameId` coverage falls below 95%, or effect delta coverage falls below 90%. Low telemetry, fingerprint or decision coverage is reported as a warning to allow migration from older records.

## Policy proposals

`generate-tactic-policy-proposals.mjs` only considers ranking rows marked `promotion_candidate` or `policy_candidate`. Its output is advisory and contains `requiresHumanApproval: true`. It never writes to runtime sources, presets, recommendation weights or VPS collections.

## Verification

```bash
node tools/test-tactic-analytics-pipeline.mjs
```

The deterministic fixture validates the quality gate, performance aggregation and proposal generation. GitHub Actions runs syntax checks and this smoke test for relevant changes.

## Rollback

Reports are immutable under `runs/<run id>`. To roll back the published report, copy a known-good run's `report` directory to a temporary directory and atomically replace `reports/latest`. No browser deployment rollback is required because this pipeline does not modify the userscript.
