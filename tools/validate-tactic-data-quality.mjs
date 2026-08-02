#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = name => args.includes(name);
const inputDir = option('--input', 'var/tactics/export');
const output = option('--output', path.join(inputDir, 'quality-report.json'));
const allowEmpty = hasFlag('--allow-empty');

function load(name) {
  const file = path.join(inputDir, name);
  if (!fs.existsSync(file)) return { status: 'missing', rows: null, error: null };
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : Array.isArray(value?.rows) ? value.rows : null;
    if (!data) return { status: 'malformed', rows: null, error: 'collection_payload_is_not_an_array' };
    return { status: 'valid', rows: data, error: null };
  } catch (error) {
    return { status: 'corrupt', rows: null, error: String(error.message || error) };
  }
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
function duplicateCount(rows, key) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const value = row?.[key];
    if (!value) continue;
    if (seen.has(String(value))) duplicates += 1;
    else seen.add(String(value));
  }
  return duplicates;
}

const specs = {
  matchResults: { file: 'match_results_v2.json', key: 'resultKey' },
  presetEvents: { file: 'preset_events_v2.json', key: 'eventKey' },
  presetEffects: { file: 'preset_effects_v2.json', key: 'effectKey' },
  snapshots: { file: 'match_snapshots_v2.json', key: 'snapshotKey' }
};
const loaded = Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, load(spec.file)]));
const errors = [];
const warnings = [];
for (const [key, value] of Object.entries(loaded)) {
  if (value.status === 'missing') errors.push(`missing_collection:${key}`);
  if (value.status === 'malformed') errors.push(`malformed_collection:${key}`);
  if (value.status === 'corrupt') errors.push(`corrupt_collection:${key}`);
}
const rows = Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, value.rows || []]));
const effects = rows.presetEffects;
const results = rows.matchResults;
const checks = {
  allowEmpty,
  collectionStatus: Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, { status: value.status, error: value.error }])),
  matchResultsCount: results.length,
  presetEventsCount: rows.presetEvents.length,
  presetEffectsCount: effects.length,
  snapshotsCount: rows.snapshots.length,
  resultGameIdCoverage: round(ratio(results, row => row?.gameId != null)),
  effectGameIdCoverage: round(ratio(effects, row => row?.gameId != null)),
  telemetryCoverage: round(ratio(effects, row => row?.tacticTelemetry)),
  fingerprintCoverage: round(ratio(effects, row => row?.tacticTelemetry?.currentTacticFingerprint || row?.tacticTelemetry?.transitions?.some?.(item => item?.tacticFingerprint))),
  decisionCoverage: round(ratio(effects, row => row?.decisionContext || row?.tacticTelemetry?.latestDecision)),
  deltaCoverage: round(ratio(effects, row => row?.delta && typeof row.delta === 'object')),
  duplicateKeys: Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, duplicateCount(rows[key], spec.key)])),
  missingUniqueKeys: Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, rows[key].filter(row => !row?.[spec.key]).length]))
};
if (effects.length === 0) {
  if (allowEmpty) warnings.push('no_preset_effects_allowed_explicitly');
  else errors.push('no_preset_effects');
}
if (checks.effectGameIdCoverage < 0.95 && effects.length) errors.push('low_effect_game_id_coverage');
if (checks.deltaCoverage < 0.9 && effects.length) errors.push('low_delta_coverage');
if (checks.telemetryCoverage < 0.55 && effects.length) warnings.push('low_telemetry_coverage');
if (checks.fingerprintCoverage < 0.55 && effects.length) warnings.push('low_fingerprint_coverage');
if (checks.decisionCoverage < 0.55 && effects.length) warnings.push('low_decision_coverage');
for (const [key, count] of Object.entries(checks.duplicateKeys)) {
  if (count > 0) warnings.push(`duplicate_keys:${key}:${count}`);
}
for (const [key, count] of Object.entries(checks.missingUniqueKeys)) {
  if (count > 0) warnings.push(`missing_unique_keys:${key}:${count}`);
}

const report = {
  schema: 'slf_tactic_data_quality_v2',
  generatedAt: new Date().toISOString(),
  status: errors.length ? 'failed' : warnings.length ? 'warning' : 'passed',
  checks,
  errors,
  warnings
};
write(output, report);
console.log(`[tactic-quality] ${report.status}`);
if (errors.length) process.exit(1);
