#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slf-tactic-pipeline-'));
const input = path.join(temp, 'export');
const output = path.join(temp, 'report');
fs.mkdirSync(input, { recursive: true });
fs.mkdirSync(output, { recursive: true });

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

for (const name of ['match_results_v2.json', 'preset_events_v2.json', 'match_snapshots_v2.json']) {
  fs.writeFileSync(path.join(input, name), '[]\n');
}
fs.writeFileSync(path.join(input, 'preset_effects_v2.json'), `${JSON.stringify([effect], null, 2)}\n`);
fs.writeFileSync(path.join(input, 'preset_effects.json'), `${JSON.stringify([effect], null, 2)}\n`);

execFileSync(process.execPath, [path.join(root, 'tools/validate-tactic-data-quality.mjs'), '--input', input, '--output', path.join(output, 'quality.json')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'tools/aggregate-tactic-performance.mjs'), '--input', input, '--contract', path.join(root, 'data/tactics/tactic-evaluation-contract-v1.json'), '--output', path.join(output, 'performance.json'), '--markdown', path.join(output, 'performance.md'), '--now', '2026-08-02T00:00:00.000Z'], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'tools/generate-tactic-policy-proposals.mjs'), '--input', path.join(output, 'performance.json'), '--output', path.join(output, 'proposals.json'), '--markdown', path.join(output, 'proposals.md')], { stdio: 'inherit' });

const quality = JSON.parse(fs.readFileSync(path.join(output, 'quality.json'), 'utf8'));
const performance = JSON.parse(fs.readFileSync(path.join(output, 'performance.json'), 'utf8'));
if (quality.status === 'failed') throw new Error('quality gate failed fixture');
if (!Array.isArray(performance.rankings)) throw new Error('aggregator did not produce rankings');
console.log('[tactic-pipeline-test] passed');
