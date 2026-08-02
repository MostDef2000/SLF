#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slf-match-outcomes-'));
const reportPath = path.join(temp, 'report.json');
const resultsPath = path.join(temp, 'match_results_v2.json');

const report = {
  schema: 'slf_tactic_performance_report_v2',
  phases: [
    { gameId: 'game-1', presetId: 'Preset_A' },
    { gameId: 'game-2', presetId: 'Preset_B' }
  ],
  metricImplementation: {
    implemented: ['xGDifference'],
    notAvailableInCurrentEffectSource: ['resultPoints', 'goalDifference', 'resultVsExpected', 'cardsAfterSwitch']
  }
};
const results = [
  {
    gameId: 'game-1',
    myTeam: 10,
    teams: [10, 20],
    score: { home: 2, away: 1 },
    parsedAt: 100,
    tacticTelemetry: {
      initialPreset: 'Preset_A',
      currentPreset: 'Preset_C',
      currentTacticFingerprint: 'fp-final',
      riskAppetite: 'bold',
      libraryVersion: 'lib-v1',
      recommendationSchema: 'decision-v3'
    },
    generatorExpectedPerformance: {
      attack: { actual: 1.8, expected: 1.4 },
      defense: { actual: 0.8, expected: 1.0 }
    }
  },
  {
    gameId: 'game-3',
    myTeam: 20,
    teams: [10, 20],
    score: { home: 0, away: 0 }
  },
  {
    gameId: 'invalid',
    score: { home: 1, away: 0 }
  }
];
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

execFileSync(process.execPath, [
  path.join(root, 'tools/enrich-tactic-match-outcomes.mjs'),
  '--report', reportPath,
  '--results', resultsPath,
  '--output', reportPath
], { stdio: 'inherit' });

const enriched = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(enriched.matchOutcomes.length, 2);
assert.equal(enriched.matchOutcomes[0].points, 3);
assert.equal(enriched.matchOutcomes[0].goalDifference, 1);
assert.equal(enriched.matchOutcomes[0].resultVsExpected, 0.6);
assert.equal(enriched.matchOutcomes[0].resultVsExpectedModel, 'generator_xg_channel_delta_v1');
assert.equal(enriched.matchOutcomes[1].points, 1);
assert.equal(enriched.matchOutcomeSummary.sourceRows, 3);
assert.equal(enriched.matchOutcomeSummary.validOutcomes, 2);
assert.equal(enriched.matchOutcomeSummary.phaseGames, 2);
assert.equal(enriched.matchOutcomeSummary.joinedPhaseGames, 1);
assert.equal(enriched.matchOutcomeSummary.phaseGameJoinCoverage, 0.5);
assert.equal(enriched.matchOutcomeSummary.resultVsExpectedCoverage, 0.5);
assert.match(enriched.matchOutcomeSummary.attributionPolicy, /not copied/);
assert.ok(enriched.metricImplementation.implemented.includes('resultPoints'));
assert.ok(enriched.metricImplementation.implemented.includes('goalDifference'));
assert.ok(enriched.metricImplementation.implemented.includes('resultVsExpected'));
assert.ok(enriched.metricImplementation.notAvailableInCurrentEffectSource.includes('cardsAfterSwitch'));
assert.ok(!enriched.metricImplementation.notAvailableInCurrentEffectSource.includes('resultPoints'));

console.log('[tactic-match-outcomes-test] passed');
