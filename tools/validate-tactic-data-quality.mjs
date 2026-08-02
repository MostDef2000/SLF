#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const inputDir = option('--input', 'var/tactics/export');
const output = option('--output', path.join(inputDir, 'quality-report.json'));

function load(name) {
  const file = path.join(inputDir, name);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.rows) ? value.rows : [];
}
function ratio(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : 0;
}
function round(value) { return Math.round(value * 1000) / 1000; }
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

const specs = {
  matchResults: 'match_results_v2.json',
  presetEvents: 'preset_events_v2.json',
  presetEffects: 'preset_effects_v2.json',
  snapshots: 'match_snapshots_v2.json'
};
const rows = Object.fromEntries(Object.entries(specs).map(([key, file]) => [key, load(file)]));
const errors = [];
const warnings = [];
for (const [key, value] of Object.entries(rows)) {
  if (value === null) errors.push(`missing_collection:${key}`);
}
const effects = rows.presetEffects || [];
const results = rows.matchResults || [];
const checks = {
  matchResultsCount: results.length,
  presetEffectsCount: effects.length,
  resultGameIdCoverage: round(ratio(results, row => row?.gameId != null)),
  effectGameIdCoverage: round(ratio(effects, row => row?.gameId != null)),
  telemetryCoverage: round(ratio(effects, row => row?.tacticTelemetry)),
  fingerprintCoverage: round(ratio(effects, row => row?.tacticTelemetry?.currentTacticFingerprint || row?.tacticTelemetry?.transitions?.some?.(item => item?.tacticFingerprint))),
  decisionCoverage: round(ratio(effects, row => row?.decisionContext || row?.tacticTelemetry?.latestDecision)),
  deltaCoverage: round(ratio(effects, row => row?.delta && typeof row.delta === 'object'))
};
if (effects.length === 0) warnings.push('no_preset_effects');
if (checks.effectGameIdCoverage < 0.95 && effects.length) errors.push('low_effect_game_id_coverage');
if (checks.deltaCoverage < 0.9 && effects.length) errors.push('low_delta_coverage');
if (checks.telemetryCoverage < 0.55 && effects.length) warnings.push('low_telemetry_coverage');
if (checks.fingerprintCoverage < 0.55 && effects.length) warnings.push('low_fingerprint_coverage');
if (checks.decisionCoverage < 0.55 && effects.length) warnings.push('low_decision_coverage');

const report = {
  schema: 'slf_tactic_data_quality_v1',
  generatedAt: new Date().toISOString(),
  status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
  checks,
  errors,
  warnings
};
write(output, report);
console.log(`[tactic-quality] ${report.status}`);
if (errors.length) process.exit(1);
