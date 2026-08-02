#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slf-tactic-pipeline-'));

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runNode(script, args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { encoding: 'utf8' });
  if (result.status !== expectedStatus) {
    throw new Error(`${script} exited ${result.status}, expected ${expectedStatus}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

function createCollections(input, effects) {
  for (const name of ['match_results_v2.json', 'preset_events_v2.json', 'match_snapshots_v2.json']) {
    writeJson(path.join(input, name), []);
  }
  writeJson(path.join(input, 'preset_effects_v2.json'), effects);
}

const before = {
  gameId: 'fixture-1', myTeam: 1, teams: [1, 2], minute: 60,
  score: { home: 0, away: 1 },
  stats: [
    { teamId: 1, stats: { power: 1800, xG: 0.5, shots: 4, badActionsPct: 10 } },
    { teamId: 2, stats: { power: 1800, xG: 0.8, shots: 5, badActionsPct: 9 } }
  ]
};
const after = {
  gameId: 'fixture-1', myTeam: 1, teams: [1, 2], minute: 75,
  score: { home: 1, away: 1 },
  stats: [
    { teamId: 1, stats: { power: 1740, xG: 1.4, shots: 9, badActionsPct: 9 } },
    { teamId: 2, stats: { power: 1760, xG: 1.0, shots: 7, badActionsPct: 10 } }
  ]
};
const effect = {
  gameId: 'fixture-1', ts: Date.parse('2026-08-01T00:00:00Z'), presetName: 'Klopp_Gegenpress_att4',
  fromMinute: 60, toMinute: 75, before, after,
  delta: { myXG: 0.9, oppXG: 0.2, myShots: 5, oppShots: 2, myXT: 0.8, oppXT: 0.2, myBadActionsPct: -1, strengthGap: -20, myPowerDropPct: 3.33 },
  decisionContext: { schema: 'slf_rule_decision_v3', riskAppetite: 'bold', action: { preset: 'Klopp_Gegenpress_att4' }, exploration: { applied: false } },
  tacticTelemetry: { libraryVersion: 'active_presets_v2_bold_policy_v3', recommendationSchema: 'slf_rule_decision_v3', riskAppetite: 'bold', currentPreset: 'Klopp_Gegenpress_att4', currentTacticFingerprint: 'fixture-fingerprint' }
};

const positiveInput = path.join(temp, 'positive', 'export');
const positiveOutput = path.join(temp, 'positive', 'report');
createCollections(positiveInput, [effect]);
runNode('tools/validate-tactic-data-quality.mjs', ['--input', positiveInput, '--output', path.join(positiveOutput, 'quality.json')]);
runNode('tools/aggregate-tactic-performance.mjs', ['--input', positiveInput, '--contract', path.join(root, 'data/tactics/tactic-evaluation-contract-v1.json'), '--output', path.join(positiveOutput, 'performance.json'), '--markdown', path.join(positiveOutput, 'performance.md'), '--now', '2026-08-02T00:00:00.000Z']);
runNode('tools/generate-tactic-policy-proposals.mjs', ['--input', path.join(positiveOutput, 'performance.json'), '--output', path.join(positiveOutput, 'proposals.json'), '--markdown', path.join(positiveOutput, 'proposals.md')]);

const quality = JSON.parse(fs.readFileSync(path.join(positiveOutput, 'quality.json'), 'utf8'));
const performance = JSON.parse(fs.readFileSync(path.join(positiveOutput, 'performance.json'), 'utf8'));
const markdown = fs.readFileSync(path.join(positiveOutput, 'performance.md'), 'utf8');
if (quality.status !== 'passed') throw new Error(`expected passed quality, got ${quality.status}`);
if (performance.sources.presetEffectsFile !== 'preset_effects_v2.json') throw new Error('canonical effects file was not selected');
if (performance.sources.presetEffects !== 1) throw new Error('canonical effect count mismatch');
if (performance.summary.totalPhases !== 1 || performance.summary.eligiblePhases !== 1) throw new Error('fixture phase was not eligible');
if (performance.rankings.length !== 1) throw new Error('expected one ranking group');
if (performance.rankings[0].presetId !== 'Klopp_Gegenpress_att4') throw new Error('preset mismatch');
if (performance.rankings[0].tacticFingerprint !== 'fixture-fingerprint') throw new Error('fingerprint mismatch');
if (!Number.isFinite(performance.rankings[0].metrics.riskAdjustedEffectScore)) throw new Error('invalid effect score');
if (!markdown.includes('Klopp_Gegenpress_att4')) throw new Error('markdown omitted fixture preset');

const priorityInput = path.join(temp, 'priority', 'export');
const priorityOutput = path.join(temp, 'priority', 'report.json');
createCollections(priorityInput, [effect]);
writeJson(path.join(priorityInput, 'preset_effects.json'), []);
runNode('tools/aggregate-tactic-performance.mjs', ['--input', priorityInput, '--contract', path.join(root, 'data/tactics/tactic-evaluation-contract-v1.json'), '--output', priorityOutput, '--markdown', path.join(temp, 'priority', 'report.md'), '--now', '2026-08-02T00:00:00.000Z']);
const priorityReport = JSON.parse(fs.readFileSync(priorityOutput, 'utf8'));
if (priorityReport.sources.presetEffectsFile !== 'preset_effects_v2.json' || priorityReport.sources.presetEffects !== 1) {
  throw new Error('legacy alias took precedence over canonical effects');
}

const emptyInput = path.join(temp, 'empty', 'export');
const emptyQuality = path.join(temp, 'empty', 'quality.json');
createCollections(emptyInput, []);
runNode('tools/validate-tactic-data-quality.mjs', ['--input', emptyInput, '--output', emptyQuality], 1);
const emptyReport = JSON.parse(fs.readFileSync(emptyQuality, 'utf8'));
if (!emptyReport.errors.includes('no_preset_effects')) throw new Error('empty effects were not blocked');
runNode('tools/validate-tactic-data-quality.mjs', ['--input', emptyInput, '--output', path.join(temp, 'empty', 'bootstrap-quality.json'), '--allow-empty']);

const missingInput = path.join(temp, 'missing', 'export');
fs.mkdirSync(missingInput, { recursive: true });
writeJson(path.join(missingInput, 'preset_effects_v2.json'), [effect]);
runNode('tools/validate-tactic-data-quality.mjs', ['--input', missingInput, '--output', path.join(temp, 'missing', 'quality.json')], 1);

const lowCoverageInput = path.join(temp, 'coverage', 'export');
createCollections(lowCoverageInput, [{ ...effect, gameId: null, delta: null }]);
runNode('tools/validate-tactic-data-quality.mjs', ['--input', lowCoverageInput, '--output', path.join(temp, 'coverage', 'quality.json')], 1);
const coverageReport = JSON.parse(fs.readFileSync(path.join(temp, 'coverage', 'quality.json'), 'utf8'));
if (!coverageReport.errors.includes('low_effect_game_id_coverage') || !coverageReport.errors.includes('low_delta_coverage')) {
  throw new Error('coverage failures were not blocked');
}

console.log('[tactic-pipeline-test] passed');
