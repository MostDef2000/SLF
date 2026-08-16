#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slf-tactic-pipeline-'));
const input = path.join(temp, 'export');
const output = path.join(temp, 'report');
fs.mkdirSync(input, { recursive: true });
fs.mkdirSync(output, { recursive: true });

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function run(script, args = []) {
  execFileSync(process.execPath, [path.join(root, 'tools', script), ...args], { stdio: 'inherit' });
}
function runFailure(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'tools', script), ...args], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${script} was expected to fail`);
  return result;
}
function canonicalCollections(dir, effects) {
  writeJson(path.join(dir, 'match_results_v2.json'), []);
  writeJson(path.join(dir, 'preset_events_v2.json'), []);
  writeJson(path.join(dir, 'preset_effects_v2.json'), effects);
  writeJson(path.join(dir, 'match_snapshots_v2.json'), []);
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
  effectKey: 'fixture-effect-1',
  delta: { myXG: 0.9, oppXG: 0.2, myShots: 5, oppShots: 2, myXT: 0.8, oppXT: 0.2, myBadActionsPct: -1, strengthGap: -20, myPowerDropPct: 3.33 },
  decisionContext: { schema: 'slf_rule_decision_v3', riskAppetite: 'bold', action: { preset: 'Klopp_Gegenpress_att4' }, exploration: { applied: false } },
  tacticTelemetry: { libraryVersion: 'active_presets_v2_bold_policy_v3', recommendationSchema: 'slf_rule_decision_v3', riskAppetite: 'bold', currentPreset: 'Klopp_Gegenpress_att4', currentTacticFingerprint: 'fixture-fingerprint' }
};

canonicalCollections(input, [effect]);
run('validate-tactic-data-quality.mjs', ['--input', input, '--output', path.join(output, 'quality.json')]);
run('aggregate-tactic-performance.mjs', ['--input', input, '--contract', path.join(root, 'data/tactics/tactic-evaluation-contract-v1.json'), '--output', path.join(output, 'performance.json'), '--markdown', path.join(output, 'performance.md'), '--now', '2026-08-02T00:00:00.000Z']);
run('generate-tactic-policy-proposals.mjs', ['--input', path.join(output, 'performance.json'), '--output', path.join(output, 'proposals.json'), '--markdown', path.join(output, 'proposals.md')]);

const quality = JSON.parse(fs.readFileSync(path.join(output, 'quality.json'), 'utf8'));
const performance = JSON.parse(fs.readFileSync(path.join(output, 'performance.json'), 'utf8'));
assert.notEqual(quality.status, 'failed');
assert.equal(quality.checks.presetEffectsCount, 1);
assert.equal(performance.sources.presetEffectsFile, 'preset_effects_v2.json');
assert.equal(performance.sources.presetEffects, 1);
assert.equal(performance.summary.totalPhases, 1);
assert.equal(performance.summary.eligiblePhases, 1);
assert.equal(performance.rankings.length, 1);
assert.equal(performance.rankings[0].presetId, 'Klopp_Gegenpress_att4');
assert.equal(performance.rankings[0].tacticFingerprint, 'fixture-fingerprint');
assert.ok(Number.isFinite(performance.rankings[0].metrics.riskAdjustedEffectScore));
assert.match(fs.readFileSync(path.join(output, 'performance.md'), 'utf8'), /Klopp_Gegenpress_att4/);

const emptyDir = path.join(temp, 'empty');
canonicalCollections(emptyDir, []);
const emptyFailure = runFailure('validate-tactic-data-quality.mjs', ['--input', emptyDir, '--output', path.join(temp, 'empty-quality.json')]);
assert.match(`${emptyFailure.stdout}${emptyFailure.stderr}`, /failed/);
run('validate-tactic-data-quality.mjs', ['--input', emptyDir, '--output', path.join(temp, 'empty-allowed.json'), '--allow-empty']);
const emptyAllowed = JSON.parse(fs.readFileSync(path.join(temp, 'empty-allowed.json'), 'utf8'));
assert.equal(emptyAllowed.status, 'warning');
assert.ok(emptyAllowed.warnings.includes('no_preset_effects_allowed_explicitly'));

const missingDir = path.join(temp, 'missing');
fs.mkdirSync(missingDir, { recursive: true });
writeJson(path.join(missingDir, 'preset_effects_v2.json'), [effect]);
runFailure('validate-tactic-data-quality.mjs', ['--input', missingDir, '--output', path.join(temp, 'missing-quality.json')]);

const corruptDir = path.join(temp, 'corrupt');
canonicalCollections(corruptDir, [effect]);
fs.writeFileSync(path.join(corruptDir, 'preset_effects_v2.json'), '{invalid\n', 'utf8');
runFailure('validate-tactic-data-quality.mjs', ['--input', corruptDir, '--output', path.join(temp, 'corrupt-quality.json')]);

const duplicateDir = path.join(temp, 'duplicates');
canonicalCollections(duplicateDir, [effect, effect]);
run('validate-tactic-data-quality.mjs', ['--input', duplicateDir, '--output', path.join(temp, 'duplicate-quality.json')]);
const duplicateQuality = JSON.parse(fs.readFileSync(path.join(temp, 'duplicate-quality.json'), 'utf8'));
assert.equal(duplicateQuality.checks.duplicateKeys.presetEffects, 1);

const python = process.env.PYTHON || 'python3';
execFileSync(python, [path.join(root, 'vps', 'exporter-rag', 'test_slf_preset_evidence_561.py')], { stdio: 'inherit' });
execFileSync(python, [path.join(root, 'vps', 'exporter-rag', 'test_slf_tactical_lab_v1.py')], { stdio: 'inherit' });

console.log('[tactic-pipeline-test] passed canonical, empty, missing, corrupt, duplicate, exporter telemetry and Tactical Lab scenarios');