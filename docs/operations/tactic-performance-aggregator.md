# Tactic performance aggregator

## Purpose

`tools/aggregate-tactic-performance.mjs` converts exported tactical effect records into contextual, recency-weighted rankings using `data/tactics/tactic-evaluation-contract-v1.json`.

The job is standalone and uses only the Node.js standard library. The deployable VPS API baseline is stored in this repository under `vps/api/`; live deployment state, credentials and collection data remain outside Git and require separate verification.

## Input

The canonical input filename is:

- `preset_effects_v2.json`

Historical rebuilds may use these backward-compatible fallbacks:

- `preset_effects.json`
- `preset-effects.json`
- `preset_effect.json`

Canonical v2 has priority if more than one file exists. The report records the selected source filename and row count.

The file may be a JSON array or an object containing the array in `data`, `rows`, or `items`.

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

The production pipeline should be run through `tools/run-tactic-analytics-pipeline.sh` so export, quality validation, checksums and atomic publication remain one controlled operation.

## Output

The JSON report uses schema `slf_tactic_performance_report_v2` and contains:

- exact source filename and row count;
- source counts and eligibility totals;
- normalized tactical-phase rows;
- rankings grouped by preset, exact fingerprint, risk appetite, strength context, score state, minute bucket and exploration cohort;
- raw and recency-weighted effective sample counts;
- risk-adjusted effect score;
- xG, shot, xT and power-cost rates per 30 match minutes when those fields exist;
- lead-hold, lead-loss, comeback and equalizer rates;
- confidence status requiring both raw and effective sample thresholds;
- per-row metric availability;
- an implementation matrix listing implemented and currently unavailable contract metrics.

Missing source metrics are represented as unavailable, not as observed zeroes.

## Current scoring coverage

Implemented from `preset_effects_v2`:

- xG difference;
- shot difference;
- xT advantage;
- bad-actions delta;
- strength-gap delta;
- lead held/lost;
- comeback/equalizer;
- power-drop cost.

Deferred until a defined source/join contract is implemented:

- result points;
- final goal difference;
- result versus expected;
- shots on target;
- transition threat conceded;
- cards after switch;
- injuries after switch.

The report must not be described as a complete implementation of every evaluation-contract outcome until those joins and source fields are implemented and versioned.

## Confidence

Each status requires both raw observations and recency-weighted effective observations:

- ranking/provisional;
- promotion candidate;
- policy candidate.

Thresholds are stored in the evaluation contract. Old samples may still contribute, but cannot qualify a row using raw count alone after their effective weight has decayed below the configured minimum.

## Safety boundary

The report is advisory. It does not alter presets, recommendation weights, risk appetite or VPS data. `policy_candidate` is a statistical review state, not permission for automatic mutation. Promotion and policy changes require human approval.
