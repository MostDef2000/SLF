#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const reportPath = option('--report', 'tactic-performance-report.json');
const resultsPath = option('--results', 'match_results_v2.json');
const outputPath = option('--output', reportPath);

function fail(message) {
  console.error(`[tactic-match-outcomes] ${message}`);
  process.exit(1);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot read ${file}: ${error.message}`); }
}
function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function scoreForTeam(result) {
  const teams = Array.isArray(result?.teams) ? result.teams : [];
  const myTeam = result?.myTeam;
  const home = finite(result?.score?.home);
  const away = finite(result?.score?.away);
  if (teams.length < 2 || myTeam == null || home == null || away == null) return null;
  const isHome = Number(teams[0]) === Number(myTeam);
  return {
    myGoals: isHome ? home : away,
    opponentGoals: isHome ? away : home,
    homeAway: isHome ? 'home' : 'away'
  };
}
function resultVsExpected(result) {
  const expected = result?.generatorExpectedPerformance;
  const attackActual = finite(expected?.attack?.actual);
  const attackExpected = finite(expected?.attack?.expected);
  const defenseActual = finite(expected?.defense?.actual);
  const defenseExpected = finite(expected?.defense?.expected);
  if ([attackActual, attackExpected, defenseActual, defenseExpected].some(value => value == null)) return null;
  return round((attackActual - attackExpected) - (defenseActual - defenseExpected));
}
function matchOutcome(result) {
  const score = scoreForTeam(result);
  if (!score) return null;
  const goalDifference = score.myGoals - score.opponentGoals;
  const points = goalDifference > 0 ? 3 : goalDifference < 0 ? 0 : 1;
  const telemetry = result?.tacticTelemetry || {};
  return {
    unit: 'match',
    gameId: String(result.gameId || ''),
    ts: result.parsedAt || result.ts || result?.source?.collectedAt || null,
    homeAway: score.homeAway,
    myGoals: score.myGoals,
    opponentGoals: score.opponentGoals,
    points,
    goalDifference,
    resultVsExpected: resultVsExpected(result),
    resultVsExpectedModel: 'generator_xg_channel_delta_v1',
    initialPreset: telemetry.initialPreset || null,
    finalPreset: telemetry.currentPreset || null,
    finalTacticFingerprint: telemetry.currentTacticFingerprint || null,
    riskAppetite: telemetry.riskAppetite || null,
    libraryVersion: telemetry.libraryVersion || null,
    recommendationSchema: telemetry.recommendationSchema || null
  };
}

const report = readJson(reportPath);
const results = rows(readJson(resultsPath));
const outcomes = results.map(matchOutcome).filter(Boolean);
const uniqueResultGames = new Set(outcomes.map(row => row.gameId).filter(Boolean));
const phaseGames = new Set((report.phases || []).map(row => String(row.gameId || '')).filter(Boolean));
const joinedPhaseGames = [...phaseGames].filter(gameId => uniqueResultGames.has(gameId));
const completeExpected = outcomes.filter(row => row.resultVsExpected != null).length;

report.matchOutcomes = outcomes;
report.matchOutcomeSummary = {
  sourceFile: path.basename(resultsPath),
  sourceRows: results.length,
  validOutcomes: outcomes.length,
  uniqueResultGames: uniqueResultGames.size,
  phaseGames: phaseGames.size,
  joinedPhaseGames: joinedPhaseGames.length,
  phaseGameJoinCoverage: phaseGames.size ? round(joinedPhaseGames.length / phaseGames.size) : null,
  resultVsExpectedCoverage: outcomes.length ? round(completeExpected / outcomes.length) : null,
  attributionPolicy: 'match outcomes are reported separately and are not copied into every tactical phase score'
};
report.metricImplementation = report.metricImplementation || {};
const implemented = new Set(report.metricImplementation.implemented || []);
implemented.add('resultPoints');
implemented.add('goalDifference');
implemented.add('resultVsExpected');
report.metricImplementation.implemented = [...implemented];
report.metricImplementation.resultVsExpectedModel = 'generator_xg_channel_delta_v1';
report.metricImplementation.notAvailableInCurrentEffectSource = (report.metricImplementation.notAvailableInCurrentEffectSource || [])
  .filter(name => !['resultPoints', 'goalDifference', 'resultVsExpected'].includes(name));

const temp = `${outputPath}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temp, outputPath);
console.log(`[tactic-match-outcomes] joined ${outcomes.length} valid match outcomes from ${results.length} result rows`);
