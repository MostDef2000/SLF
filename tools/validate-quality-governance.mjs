#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));

const codeowners = read('.github/CODEOWNERS');
const template = read('.github/pull_request_template.md');
const gates = readJson('data/quality/quality-gates-v1.json');
const register = readJson('data/quality/accepted-risks-v1.json');

const requiredOwnership = new Map([
  ['*', '@MostDef2000'],
  ['/.github/', '@MostDef2000'],
  ['/releases/', '@MostDef2000'],
  ['/data/version.json', '@MostDef2000'],
  ['/src/app/bundle-order.json', '@MostDef2000'],
  ['/src/app/userscript-header.js', '@MostDef2000'],
  ['/src/core/api.js', '@MostDef2000'],
  ['/src/core/token-storage.js', '@MostDef2000'],
  ['/src/modules/manual-match-telemetry/', '@MostDef2000'],
  ['/vps/api/', '@MostDef2000'],
  ['/vps/ops/', '@MostDef2000'],
  ['/data/contracts/', '@MostDef2000'],
  ['/data/quality/', '@MostDef2000'],
  ['/docs/quality/', '@MostDef2000'],
  ['/docs/security/', '@MostDef2000'],
  ['/docs/release/', '@MostDef2000']
]);

const ownership = new Map();
for (const rawLine of codeowners.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const [pattern, ...owners] = line.split(/\s+/);
  assert.ok(pattern && owners.length > 0, `invalid CODEOWNERS line: ${rawLine}`);
  ownership.set(pattern, owners.join(' '));
}
for (const [pattern, expectedOwner] of requiredOwnership) {
  assert.equal(ownership.get(pattern), expectedOwner, `CODEOWNERS missing ${pattern} ${expectedOwner}`);
}

for (const heading of [
  '## Change summary',
  '## Requirement and risk',
  '## Test design',
  '## Validation evidence',
  '## Compatibility and migration',
  '## Security review',
  '## Release and deployment',
  '## Owner review'
]) {
  assert.ok(template.includes(heading), `PR template missing ${heading}`);
}
for (const invariant of [
  'Exact generated artifact was tested',
  'Independent reviewer available',
  'Repository owner reviewed the test oracle and expected failures',
  'Critical-path work without an independent reviewer is covered by an accepted risk',
  'Any accepted risk has an owner and review date',
  'Rollback command and verification'
]) {
  assert.ok(template.includes(invariant), `PR template missing invariant: ${invariant}`);
}
assert.ok(template.includes('Do not mark a change as independently reviewed'), 'PR template must prohibit false independent-review claims');

assert.equal(gates.schema, 'slf_quality_gate_rollout_v1');
assert.equal(gates.repository, 'MostDef2000/SLF');
assert.equal(gates.defaultBranch, 'main');
assert.equal(gates.state, 'prepared_not_enforced');
assert.match(gates.reason, /owner-approved and merged/i);
assert.equal(gates.roadmapIssue, 160);
assert.equal(gates.reviewModel, 'single_maintainer_owner_acceptance_with_compensating_controls');
assert.equal(gates.prerequisitesIntegrated, true);
assert.deepEqual(gates.prerequisitePullRequests, [159, 163, 164, 165, 166, 167, 168]);
assert.equal(gates.enforcementPlan.strategy, 'always_run_aggregate_check');
assert.equal(gates.enforcementPlan.aggregateContext, 'Quality integration gate / quality-integration');
assert.ok(gates.enforcementPlan.applyOnlyAfter.length >= 4);
assert.equal(gates.branchProtectionTarget.requirePullRequest, true);
assert.equal(gates.branchProtectionTarget.requiredApprovals, 0);
assert.equal(gates.branchProtectionTarget.requireCodeOwnerReview, false);
assert.equal(gates.branchProtectionTarget.requireConversationResolution, true);
assert.equal(gates.branchProtectionTarget.requireAggregateStatusCheck, true);
assert.equal(gates.branchProtectionTarget.allowAdminBypass, false);
assert.match(gates.branchProtectionTarget.singleMaintainerException, /No independent reviewer is currently available/);
assert.equal(gates.productionDeploymentImplied, false);
assert.match(gates.connectorLimitation, /does not expose branch-protection or ruleset mutation actions/);

const workflowNames = new Set();
for (const workflow of gates.componentWorkflows) {
  assert.equal(typeof workflow.workflow, 'string');
  assert.equal(workflowNames.has(workflow.workflow), false, `duplicate workflow name: ${workflow.workflow}`);
  workflowNames.add(workflow.workflow);
  assert.ok(workflow.purpose.length > 10);
  if (!workflow.existing) {
    assert.ok(Number.isInteger(workflow.sourcePullRequest), `${workflow.workflow} missing sourcePullRequest`);
    assert.ok(gates.prerequisitePullRequests.includes(workflow.sourcePullRequest));
  }
}
for (const expected of [
  'Userscript exact artifact boundary',
  'Versioned data and API contracts',
  'Security boundaries and adversarial API',
  'Exact userscript browser E2E',
  'Property fuzz mutation and reliability',
  'Release and deployment evidence'
]) {
  assert.ok(workflowNames.has(expected), `rollout manifest missing workflow: ${expected}`);
}

assert.equal(register.schema, 'slf_accepted_risks_v1');
assert.equal(register.generatedForRoadmapIssue, 160);
assert.equal(register.policy.highSeverityRequiresExplicitHumanAcceptance, true);
assert.equal(register.policy.independentReviewUnavailableAccepted, true);
assert.equal(register.policy.approvalModel, 'repository_owner_acceptance');
assert.equal(register.policy.expiredRiskBlocksGovernanceCheck, true);
assert.ok(Array.isArray(register.risks) && register.risks.length > 0);

const nowOverride = process.env.SLF_GOVERNANCE_DATE;
const today = nowOverride || new Date().toISOString().slice(0, 10);
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
const ids = new Set();
const allowedSeverity = new Set(['low', 'medium', 'high', 'critical']);
const allowedStatus = new Set(['open', 'accepted', 'mitigated', 'closed']);
for (const risk of register.risks) {
  assert.match(risk.id, /^QR-[0-9]{3}$/);
  assert.equal(ids.has(risk.id), false, `duplicate risk ID: ${risk.id}`);
  ids.add(risk.id);
  assert.ok(risk.title.length > 10, `${risk.id} title is too short`);
  assert.ok(allowedStatus.has(risk.status), `${risk.id} invalid status`);
  assert.ok(allowedSeverity.has(risk.severity), `${risk.id} invalid severity`);
  assert.equal(risk.owner, 'MostDef2000', `${risk.id} has no accountable owner`);
  assert.ok(risk.boundary.length > 3, `${risk.id} missing boundary`);
  assert.ok(risk.consequence.length > 20, `${risk.id} missing consequence`);
  assert.ok(Array.isArray(risk.compensatingControls) && risk.compensatingControls.length > 0, `${risk.id} missing controls`);
  assert.ok(risk.target.length > 20, `${risk.id} missing target`);
  assert.match(risk.reviewBy, /^\d{4}-\d{2}-\d{2}$/);
  if (risk.status !== 'closed') {
    assert.ok(risk.reviewBy >= today, `${risk.id} risk review expired on ${risk.reviewBy}`);
  }
  if (risk.status === 'closed') {
    assert.ok(risk.closureEvidence, `${risk.id} closed without evidence`);
  }
  if (risk.severity === 'high' || risk.severity === 'critical') {
    assert.equal(register.policy.highSeverityRequiresExplicitHumanAcceptance, true);
  }
  if (risk.status === 'accepted' && (risk.severity === 'high' || risk.severity === 'critical')) {
    assert.ok(risk.acceptance && risk.acceptance.length > 20, `${risk.id} accepted high risk lacks explicit acceptance`);
  }
}
assert.ok(ids.has('QR-007'), 'risk register must track unavailable independent review');

const serialized = JSON.stringify({ gates, register });
for (const pattern of [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i
]) {
  assert.equal(pattern.test(serialized), false, 'governance data contains a possible secret');
}

console.log(
  `[quality-governance] passed: owners=${requiredOwnership.size} workflows=${workflowNames.size} risks=${ids.size} date=${today} state=${gates.state} reviewModel=${gates.reviewModel}`
);
