# Tactic performance aggregator

## Purpose

`tools/aggregate-tactic-performance.mjs` converts exported tactical effect records into a risk-adjusted ranking using `data/tactics/tactic-evaluation-contract-v1.json`.

The job is standalone and uses only the Node.js standard library. It is intended for execution on the VPS after the current API collections have been exported to JSON.

## Input

The canonical input filename is:

- `preset_effects_v2.json`

Legacy filenames remain supported for historical rebuilds, in this fallback order:

- `preset_effects.json`
- `preset-effects.json`
- `preset_effect.json`

When more than one file is present, `preset_effects_v2.json` always takes precedence. The selected filename is recorded in `sources.presetEffectsFile` in the JSON report and in the Markdown report header.

The file may be a JSON array or an object containing the array in `data`, `rows`, or `items`.

The aggregator consumes the additive fields introduced by the tactical telemetry stage, while retaining fallbacks for older `preset_effect` rows.

## Run

```bash
node tools/aggregate-tactic-performance.mjs \
  --input /srv/slf/export \
  --contract data/tactics/tactic-evaluation-contract-v1.json \
  --output /srv/slf/reports/tactic-performance-report.json \
  --markdown /srv/slf/reports/tactic-performance-report.md
```

For deterministic testing or historical rebuilds, pass an explicit timestamp:

```bash
--now 2026-08-02T00:00:00.000Z
```

## Output

The JSON report uses schema `slf_tactic_performance_report_v1` and contains:

- selected source filename and source counts;
- normalized tactical-phase rows;
- rankings grouped by preset, exact fingerprint, risk appetite, strength context, score state, minute bucket, and exploration cohort;
- raw and recency-weighted sample counts;
- risk-adjusted effect score;
- xG, shot, xT, and power-cost rates per 30 match minutes;
- lead-hold, lead-loss, comeback, and equalizer rates;
- confidence status based on the contract thresholds.

The Markdown report provides an operational ranking table suitable for review.

## Scheduling

The preferred production entrypoint is the full pipeline:

```cron
15 4 * * * cd /srv/slf/SLF && SLF_TACTIC_STATE_DIR=/srv/slf/tactic-analytics /usr/bin/bash tools/run-tactic-analytics-pipeline.sh >> /var/log/slf-tactic-analytics.log 2>&1
```

The deployable VPS API source is stored under `vps/api`. Live data, credentials, environment values, cron state and the deployed revision remain VPS operational state and are not inferred from the repository.

## Safety boundary

The report is advisory. It does not alter presets, recommendation weights, or risk appetite. Promotion and policy changes still require human approval under the evaluation contract.
