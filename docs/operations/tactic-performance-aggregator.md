# Tactic performance aggregator

## Purpose

`tools/aggregate-tactic-performance.mjs` converts exported tactical effect records into a risk-adjusted ranking using `data/tactics/tactic-evaluation-contract-v1.json`.

The job is standalone and uses only the Node.js standard library. It is intended for execution on the VPS after the current API collections have been exported to JSON.

## Input

Create an input directory containing one of these filenames:

- `preset_effects.json`
- `preset-effects.json`
- `preset_effect.json`

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

- source counts and eligibility totals;
- normalized tactical-phase rows;
- rankings grouped by preset, exact fingerprint, risk appetite, strength context, score state, minute bucket, and exploration cohort;
- raw and recency-weighted sample counts;
- risk-adjusted effect score;
- xG, shot, xT, and power-cost rates per 30 match minutes;
- lead-hold, lead-loss, comeback, and equalizer rates;
- confidence status based on the contract thresholds.

The Markdown report provides an operational ranking table suitable for review.

## Scheduling

Example daily cron entry:

```cron
15 4 * * * cd /srv/slf/SLF && /usr/bin/node tools/aggregate-tactic-performance.mjs --input /srv/slf/export --output /srv/slf/reports/tactic-performance-report.json --markdown /srv/slf/reports/tactic-performance-report.md >> /var/log/slf-tactic-aggregator.log 2>&1
```

The export step remains deployment-specific because the VPS database/API implementation is not stored in this repository.

## Safety boundary

The report is advisory. It does not alter presets, recommendation weights, or risk appetite. Promotion and policy changes still require human approval under the evaluation contract.
