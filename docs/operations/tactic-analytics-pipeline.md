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

The pipeline obtains an exclusive `flock`, exports the four canonical v2 collections, runs the quality gate, builds JSON and Markdown performance reports, generates advisory policy proposals and only then publishes `reports/latest`.

The canonical effects contract is `preset_effects_v2.json`. Legacy effects filenames are accepted by the standalone aggregator only for historical rebuilds; the production exporter and quality gate use the canonical v2 filename.

A failed export, failed quality gate or failed aggregation must not publish the failed run.

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

Production publication is blocked when:

- any required canonical collection file is missing;
- `preset_effects_v2.json` contains no effects;
- effect `gameId` coverage is below 95%;
- effect delta coverage is below 90%.

Low telemetry, fingerprint or decision coverage is reported as a warning to allow migration from older records.

An empty effects dataset is permitted only for an explicit bootstrap/test invocation:

```bash
node tools/validate-tactic-data-quality.mjs --input <dir> --output <report> --allow-empty
```

The production pipeline and cron command do not use `--allow-empty`.

## Policy proposals

`generate-tactic-policy-proposals.mjs` only considers ranking rows marked `promotion_candidate` or `policy_candidate`. Its output is advisory and contains `requiresHumanApproval: true`. It never writes to runtime sources, presets, recommendation weights or VPS collections.

## Verification

```bash
node tools/test-tactic-analytics-pipeline.mjs
```

The deterministic suite validates canonical-only input, canonical-over-legacy priority, positive aggregation, empty production rejection, explicit bootstrap allowance, missing collections and blocking coverage thresholds. GitHub Actions runs syntax checks and this suite for relevant changes.

## Repository and VPS boundary

The repository contains deployable VPS API and analytics source. The VPS remains authoritative for live data, credentials, environment, cron configuration, logs and the currently deployed revision. A repository merge does not itself prove or perform VPS deployment.

## Rollback

Reports are immutable under `runs/<run id>`. Publication and rollback semantics are governed by `tools/run-tactic-analytics-pipeline.sh`; operators must verify the actual filesystem mechanism before claiming an atomic switch. No browser deployment rollback is required because this pipeline does not modify the userscript.
