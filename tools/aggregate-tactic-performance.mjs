#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const inputDir = option('--input', '.');
const contractPath = option('--contract', 'data/tactics/tactic-evaluation-contract-v1.json');
const outputPath = option('--output', 'tactic-performance-report.json');
const markdownPath = option('--markdown', outputPath.replace(/\.json$/i, '.md'));
const now = new Date(option('--now', new Date().toISOString()));

function fail(message) {
  console.error(`[tactic-aggregator] ${message}`);
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
function loadCollection(names) {
  for (const name of names) {
    const file = path.join(inputDir, name);
    if (fs.existsSync(file)) return { name, rows: rows(readJson(file)) };
  }
  return { name: null, rows: [] };
}
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}
function scoreState(score, myTeam, teams) {
  if (!score || !Array.isArray(teams) || teams.length < 2 || myTeam == null) return 'unknown';
  const home = number(score.home, NaN);
  const away = number(score.away, NaN);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return 'unknown';
  const mine = Number(teams[0]) === Number(myTeam) ? home : away;
  const theirs = Number(teams[0]) === Number(myTeam) ? away : home;
  return mine > theirs ? 'winning' : mine < theirs ? 'losing' : 'drawing';
}
function bucket(value, definitions, fallback = 'unknown') {
  const n = number(value, NaN);
  if (!Number.isFinite(n)) return fallback;
  return definitions.find(item => (item.min == null || n >= item.min) && (item.max == null || n <= item.max))?.id || fallback;
}
function decayWeight(ts, halfLifeDays) {
  const date = new Date(number(ts) || ts || 0);
  if (Number.isNaN(date.getTime())) return 1;
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86400000);
  return 0.5 ** (ageDays / Math.max(1, halfLifeDays));
}
function teamStats(snapshot, teamId) {
  return snapshot?.stats?.find(item => Number(item.teamId) === Number(teamId))?.stats || {};
}
function opponentStats(snapshot, teamId) {
  return snapshot?.stats?.find(item => Number(item.teamId) !== Number(teamId))?.stats || {};
}
function hasNumber(value) { return Number.isFinite(Number(value)); }
function metricAvailability(effect) {
  const delta = effect?.delta || {};
  return {
    xGDifference: hasNumber(delta.myXG) && hasNumber(delta.oppXG),
    shotDifference: hasNumber(delta.myShots) && hasNumber(delta.oppShots),
    xTAdvantage: hasNumber(delta.myXT) && hasNumber(delta.oppXT),
    badActionsDelta: hasNumber(delta.myBadActionsPct),
    strengthGapDelta: hasNumber(delta.strengthGap),
    powerDropPct: hasNumber(delta.myPowerDropPct),
    resultPoints: false,
    goalDifference: false,
    resultVsExpected: false,
    shotsOnTargetDifference: false,
    transitionThreatConceded: false,
    cardsAfterSwitch: false,
    injuriesAfterSwitch: false
  };
}
function derivePhaseRow(effect, contract) {
  const before = effect.before || {};
  const after = effect.after || {};
  const telemetry = effect.tacticTelemetry || after.tacticTelemetry || before.tacticTelemetry || {};
  const myTeam = after.myTeam ?? before.myTeam;
  const beforeMy = teamStats(before, myTeam);
  const beforeOpp = opponentStats(before, myTeam);
  const delta = effect.delta || {};
  const duration = Math.max(1, number(effect.toMinute) - number(effect.fromMinute));
  const strengthGap = number(beforeMy.power) - number(beforeOpp.power);
  const beforeState = scoreState(before.score, myTeam, before.teams);
  const afterState = scoreState(after.score, myTeam, after.teams);
  const availability = metricAvailability(effect);
  const xgDiff = number(delta.myXG) - number(delta.oppXG);
  const shotDiff = number(delta.myShots) - number(delta.oppShots);
  const xtDiff = number(delta.myXT) - number(delta.oppXT);
  const powerCost = Math.max(0, number(delta.myPowerDropPct));
  const leadHeld = beforeState === 'winning' && afterState === 'winning' ? 1 : 0;
  const leadLost = beforeState === 'winning' && afterState !== 'winning' ? 1 : 0;
  const comeback = beforeState === 'losing' && afterState === 'winning' ? 1 : 0;
  const equalizer = beforeState === 'losing' && afterState === 'drawing' ? 1 : 0;
  const weights = contract.outcomes;
  const effectScore =
    (availability.xGDifference ? xgDiff * weights.chanceCreation.xGDifference : 0) +
    (availability.shotDifference ? shotDiff * weights.chanceCreation.shotDifference : 0) +
    (availability.xTAdvantage ? xtDiff * weights.chanceCreation.xTAdvantage : 0) +
    (availability.badActionsDelta ? number(delta.myBadActionsPct) * weights.control.badActionsDelta : 0) +
    (availability.strengthGapDelta ? number(delta.strengthGap) * weights.control.strengthGapDelta / 100 : 0) +
    leadHeld * weights.gameState.leadHeld + leadLost * weights.gameState.leadLost +
    comeback * weights.gameState.comebackAchieved + equalizer * weights.gameState.equalizerCreated +
    (availability.powerDropPct ? powerCost * weights.cost.powerDropPct : 0);
  const decision = effect.decisionContext || telemetry.latestDecision || {};
  const presetId = effect.presetName || telemetry.currentPreset || decision.action?.preset || 'unknown';
  const fingerprint = telemetry.currentTacticFingerprint || telemetry.transitions?.at?.(-1)?.tacticFingerprint || 'unknown';
  const completenessFields = [presetId !== 'unknown', fingerprint !== 'unknown', myTeam != null, before.score, after.score, beforeMy.power != null, beforeOpp.power != null, duration >= 1];
  const completeness = completenessFields.filter(Boolean).length / completenessFields.length;
  return {
    unit: 'tactical_phase', gameId: effect.gameId || before.gameId || after.gameId || 'unknown',
    ts: effect.ts || after.ts || before.ts || Date.now(), presetId, tacticFingerprint: fingerprint,
    libraryVersion: telemetry.libraryVersion || 'unknown', recommendationSchema: telemetry.recommendationSchema || decision.schema || 'unknown',
    riskAppetite: telemetry.riskAppetite || decision.riskAppetite || 'unknown', explorationApplied: !!(decision.exploration?.applied || decision.action?.exploration),
    homeAway: Array.isArray(before.teams) && Number(before.teams[0]) === Number(myTeam) ? 'home' : 'away',
    strengthGap, strengthGapBucket: bucket(strengthGap, contract.normalization.strengthGapBuckets),
    scoreStateAtStart: beforeState, scoreStateAtEnd: afterState, minuteBucket: bucket(effect.fromMinute, contract.normalization.minuteBuckets),
    durationMinutes: duration, completeness: round(completeness),
    eligible: duration >= contract.eligibility.minimumPhaseMinutes && completeness >= contract.eligibility.minimumCompleteness,
    metricAvailability: availability,
    metrics: {
      riskAdjustedEffectScore: round(effectScore),
      xgDifferencePer30: availability.xGDifference ? round(xgDiff * 30 / duration) : null,
      shotDifferencePer30: availability.shotDifference ? round(shotDiff * 30 / duration) : null,
      xTAdvantagePer30: availability.xTAdvantage ? round(xtDiff * 30 / duration) : null,
      powerCostPer30: availability.powerDropPct ? round(powerCost * 30 / duration) : null,
      leadHeld, leadLost, comebackAchieved: comeback, equalizerCreated: equalizer
    }
  };
}
function groupKey(row) {
  return [row.presetId, row.tacticFingerprint, row.riskAppetite, row.strengthGapBucket, row.scoreStateAtStart, row.minuteBucket, row.explorationApplied ? 'explore' : 'normal'].join('|');
}
function confidenceStatus(samples, effectiveSamples, contract) {
  const effective = contract.confidence.effectiveSamples || {};
  const qualifies = (rawKey, effectiveKey) => samples >= contract.confidence[rawKey] && effectiveSamples >= number(effective[effectiveKey], contract.confidence[rawKey]);
  if (qualifies('minimumSamplesForAutomaticPolicyChange', 'minimumForAutomaticPolicyChange')) return 'policy_candidate';
  if (qualifies('minimumSamplesForPromotion', 'minimumForPromotion')) return 'promotion_candidate';
  if (qualifies('minimumSamplesForRanking', 'minimumForRanking')) return 'provisional';
  return 'observation_only';
}
function aggregate(phaseRows, contract) {
  const groups = new Map();
  for (const row of phaseRows) {
    if (!row.eligible) continue;
    const key = groupKey(row);
    const weight = decayWeight(row.ts, contract.confidence.oldMatchHalfLifeDays);
    if (!groups.has(key)) groups.set(key, { rows: [], weight: 0 });
    groups.get(key).rows.push({ row, weight });
    groups.get(key).weight += weight;
  }
  return [...groups.values()].map(group => {
    const first = group.rows[0].row;
    const weighted = metric => {
      const usable = group.rows.filter(item => item.row.metrics[metric] != null);
      const total = usable.reduce((sum, item) => sum + item.weight, 0);
      return usable.length && total > 0 ? usable.reduce((sum, item) => sum + number(item.row.metrics[metric]) * item.weight, 0) / total : null;
    };
    const samples = group.rows.length;
    const effectiveSamples = round(group.weight);
    const metric = name => weighted(name) == null ? null : round(weighted(name));
    return {
      presetId: first.presetId, tacticFingerprint: first.tacticFingerprint, libraryVersion: first.libraryVersion,
      recommendationSchema: first.recommendationSchema, riskAppetite: first.riskAppetite,
      strengthGapBucket: first.strengthGapBucket, scoreStateAtStart: first.scoreStateAtStart,
      minuteBucket: first.minuteBucket, explorationApplied: first.explorationApplied,
      samples, effectiveSamples, confidenceStatus: confidenceStatus(samples, effectiveSamples, contract),
      metrics: {
        riskAdjustedEffectScore: metric('riskAdjustedEffectScore'), xgDifferencePer30: metric('xgDifferencePer30'),
        shotDifferencePer30: metric('shotDifferencePer30'), xTAdvantagePer30: metric('xTAdvantagePer30'),
        powerCostPer30: metric('powerCostPer30'), leadHoldRate: metric('leadHeld'), leadLossRate: metric('leadLost'),
        comebackRate: metric('comebackAchieved'), equalizerRate: metric('equalizerCreated')
      }
    };
  }).sort((a, b) => b.metrics.riskAdjustedEffectScore - a.metrics.riskAdjustedEffectScore || b.samples - a.samples);
}
function markdown(report) {
  const lines = ['# Tactic performance report', '', `Generated: ${report.generatedAt}`, `Source: ${report.sources.presetEffectsFile || 'none'}`,
    `Eligible phases: ${report.summary.eligiblePhases} / ${report.summary.totalPhases}`, '',
    'This report implements only the metrics listed in `metricImplementation.implemented`. Missing metrics are not silently treated as observed zeroes.', '',
    '| # | Preset | Risk | Context | Samples | Effective | Score | xGD/30 | Power cost/30 | Status |',
    '|---:|---|---|---|---:|---:|---:|---:|---:|---|'];
  report.rankings.forEach((row, index) => lines.push(`| ${index + 1} | ${row.presetId} | ${row.riskAppetite} | ${row.strengthGapBucket}/${row.scoreStateAtStart}/${row.minuteBucket}${row.explorationApplied ? '/explore' : ''} | ${row.samples} | ${row.effectiveSamples} | ${row.metrics.riskAdjustedEffectScore} | ${row.metrics.xgDifferencePer30 ?? 'n/a'} | ${row.metrics.powerCostPer30 ?? 'n/a'} | ${row.confidenceStatus} |`));
  return `${lines.join('\n')}\n`;
}

const contract = readJson(contractPath);
if (contract.schema !== 'slf_tactic_evaluation_contract_v1') fail(`unsupported contract schema: ${contract.schema}`);
const effectsSource = loadCollection(['preset_effects_v2.json', 'preset_effects.json', 'preset-effects.json', 'preset_effect.json']);
const phases = effectsSource.rows.map(effect => derivePhaseRow(effect, contract));
const rankings = aggregate(phases, contract);
const report = {
  schema: 'slf_tactic_performance_report_v2', scoringVersion: 'partial_contract_metrics_v2', generatedAt: now.toISOString(),
  contract: { schema: contract.schema, version: contract.version },
  sources: { inputDir, presetEffectsFile: effectsSource.name, presetEffects: effectsSource.rows.length },
  metricImplementation: {
    implemented: ['xGDifference', 'shotDifference', 'xTAdvantage', 'badActionsDelta', 'strengthGapDelta', 'leadHeld', 'leadLost', 'comebackAchieved', 'equalizerCreated', 'powerDropPct'],
    notAvailableInCurrentEffectSource: ['resultPoints', 'goalDifference', 'resultVsExpected', 'shotsOnTargetDifference', 'transitionThreatConceded', 'cardsAfterSwitch', 'injuriesAfterSwitch']
  },
  summary: { totalPhases: phases.length, eligiblePhases: phases.filter(row => row.eligible).length, excludedPhases: phases.filter(row => !row.eligible).length, rankingGroups: rankings.length },
  rankings, phases
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
fs.writeFileSync(markdownPath, markdown(report), 'utf8');
console.log(`[tactic-aggregator] wrote ${outputPath} and ${markdownPath}; ${rankings.length} ranking groups from ${effectsSource.rows.length} effects (${effectsSource.name || 'no source'})`);
