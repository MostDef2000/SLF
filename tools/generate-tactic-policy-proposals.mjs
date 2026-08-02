#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const input = option('--input', 'var/tactics/reports/latest/tactic-performance-report.json');
const output = option('--output', 'var/tactics/reports/latest/tactic-policy-proposals.json');
const markdown = option('--markdown', output.replace(/\.json$/i, '.md'));

function fail(message) {
  console.error(`[tactic-proposals] ${message}`);
  process.exit(1);
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}
if (!fs.existsSync(input)) fail(`missing report: ${input}`);
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
const rankings = Array.isArray(report.rankings) ? report.rankings : [];
const eligible = rankings.filter(row => ['promotion_candidate', 'policy_candidate'].includes(row.confidenceStatus));

const proposals = eligible.map(row => {
  const score = Number(row.metrics?.riskAdjustedEffectScore || 0);
  const powerCost = Number(row.metrics?.powerCostPer30 || 0);
  const leadLoss = Number(row.metrics?.leadLossRate || 0);
  let action = 'investigate';
  const reasons = [];
  if (score >= 1 && powerCost <= 5 && leadLoss <= 0.35) {
    action = 'consider_promotion';
    reasons.push('positive risk-adjusted effect with bounded physical and lead-loss cost');
  } else if (score <= -1 || powerCost >= 10 || leadLoss >= 0.6) {
    action = 'consider_demotion';
    reasons.push('negative effect or excessive cost under a statistically eligible sample');
  } else {
    reasons.push('sample is eligible but evidence is mixed');
  }
  return {
    action,
    presetId: row.presetId,
    tacticFingerprint: row.tacticFingerprint,
    riskAppetite: row.riskAppetite,
    context: {
      strengthGapBucket: row.strengthGapBucket,
      scoreStateAtStart: row.scoreStateAtStart,
      minuteBucket: row.minuteBucket,
      explorationApplied: row.explorationApplied
    },
    samples: row.samples,
    effectiveSamples: row.effectiveSamples,
    confidenceStatus: row.confidenceStatus,
    metrics: row.metrics,
    reasons,
    requiresHumanApproval: true
  };
});

const payload = {
  schema: 'slf_tactic_policy_proposals_v1',
  generatedAt: new Date().toISOString(),
  sourceReportSchema: report.schema || null,
  advisoryOnly: true,
  proposals
};
write(output, `${JSON.stringify(payload, null, 2)}\n`);
const lines = ['# Tactic policy proposals', '', 'Advisory only. No runtime policy is changed automatically.', '', '| Action | Preset | Samples | Score | Context |', '|---|---|---:|---:|---|'];
for (const item of proposals) {
  lines.push(`| ${item.action} | ${item.presetId} | ${item.samples} | ${item.metrics?.riskAdjustedEffectScore ?? 0} | ${item.context.scoreStateAtStart}/${item.context.minuteBucket}/${item.riskAppetite} |`);
}
if (!proposals.length) lines.push('| none | — | 0 | — | insufficient eligible evidence |');
write(markdown, `${lines.join('\n')}\n`);
console.log(`[tactic-proposals] ${proposals.length} advisory proposals`);
