#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));

const codeowners = read('.github/CODEOWNERS');
const template = read('.github/pull_request_template.md');
const ciSource = read('.github/workflows/quality-integration.yml');
const releaseSource = read('.github/workflows/build-latest-release.yml');
const maintenanceSource = read('.github/workflows/quality-governance.yml');
const gates = readJson('data/quality/quality-gates-v1.json');
const inventory = readJson('data/quality/workflow-inventory-v1.json');
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

for (const invariant of [
  'name: SLF CI',
  'permissions:\n  contents: read',
  'static-contract-security:',
  'runtime-tactics:',
  'property-fuzz-reliability:',
  'browser-e2e:',
  'release-deployment-evidence:',
  'ci:\n    if: always()',
  'Require every CI domain to pass'
]) {
  assert.ok(ciSource.includes(invariant), `canonical CI missing invariant: ${invariant}`);
}
assert.equal(/pull_request:\s*\n\s+paths:/.test(ciSource), false, 'canonical CI must not use pull-request path filters');
assert.match(releaseSource, /^name:\s*SLF Release\s*$/m);
assert.match(releaseSource, /workflow_dispatch:/);
assert.match(releaseSource, /source_commit:/);
assert.match(releaseSource, /release_required/);
assert.match(maintenanceSource, /^name:\s*SLF Maintenance\s*$/m);
assert.match(maintenanceSource, /schedule:/);
assert.equal(/pull_request:\s*$/.test(maintenanceSource), false, 'maintenance must not duplicate pull-request CI');

assert.equal(gates.schema, 'slf_quality_gate_rollout_v1');
assert.equal(gates.repository, 'MostDef2000/SLF');
assert.equal(gates.defaultBranch, 'main');
assert.ok(['consolidated_ci_pending_verification', 'consolidated_ci_verified_settings_not_enforced', 'consolidated_ci_enforced'].includes(gates.state), `unexpected rollout state: ${gates.state}`);
assert.equal(gates.roadmapIssue, 160);
assert.equal(gates.currentIssue, 233);
assert.equal(gates.reviewModel, 'single_maintainer_owner_acceptance_with_compensating_controls');
assert.equal(gates.prerequisitesIntegrated, true);
assert.equal(gates.workflowLifecyclePolicy, 'contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md');
assert.equal(gates.workflowInventory, 'data/quality/workflow-inventory-v1.json');
assert.equal(gates.enforcementPlan.strategy, 'single_required_ci_context');
assert.equal(gates.enforcementPlan.aggregateWorkflow, '.github/workflows/quality-integration.yml');
assert.equal(gates.enforcementPlan.aggregateContext, 'SLF CI / ci');
assert.deepEqual(gates.enforcementPlan.ciStatePolicy.allowedToMerge, ['SUCCESS']);
assert.deepEqual(gates.enforcementPlan.ciStatePolicy.blockedFromMerge, ['PENDING', 'FAILED', 'UNKNOWN']);
assert.equal(gates.aggregateVerification.workflow, 'SLF CI');
assert.equal(gates.aggregateVerification.context, 'SLF CI / ci');
assert.deepEqual(gates.aggregateVerification.domains, [
  'static-contract-security',
  'runtime-tactics',
  'property-fuzz-reliability',
  'browser-e2e',
  'release-deployment-evidence'
]);
if (gates.aggregateVerification.result === 'success') {
  assert.ok(Number.isInteger(gates.aggregateVerification.sourcePullRequest));
  assert.ok(Number.isInteger(gates.aggregateVerification.runId));
  assert.ok(Number.isInteger(gates.aggregateVerification.jobId));
  assert.match(gates.aggregateVerification.verifiedAt || '', /^\d{4}-\d{2}-\d{2}$/);
} else {
  assert.equal(gates.aggregateVerification.result, 'pending');
}
assert.equal(gates.branchProtectionTarget.requirePullRequest, true);
assert.equal(gates.branchProtectionTarget.requiredApprovals, 0);
assert.equal(gates.branchProtectionTarget.requireCodeOwnerReview, false);
assert.equal(gates.branchProtectionTarget.requireConversationResolution, true);
assert.equal(gates.branchProtectionTarget.requireAggregateStatusCheck, true);
assert.equal(gates.branchProtectionTarget.requiredStatusContext, 'SLF CI / ci');
assert.equal(gates.branchProtectionTarget.allowAdminBypass, false);
assert.match(gates.branchProtectionTarget.singleMaintainerException, /No independent reviewer is currently available/);
assert.equal(gates.productionDeploymentImplied, false);

assert.equal(inventory.schema, 'slf_workflow_inventory_v1');
assert.equal(inventory.maxPermanentWorkflows, 3);
assert.equal(inventory.canonicalRequiredContext, 'SLF CI / ci');
assert.equal(inventory.workflows.length, 3);
assert.deepEqual(new Set(inventory.workflows.map(item => item.role)), new Set(['CI', 'RELEASE', 'MAINTENANCE']));
assert.equal(gates.componentWorkflows.length, 3);
assert.deepEqual(new Set(gates.componentWorkflows.map(item => item.role)), new Set(['CI', 'RELEASE', 'MAINTENANCE']));

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
  if (risk.status !== 'closed') assert.ok(risk.reviewBy >= today, `${risk.id} risk review expired on ${risk.reviewBy}`);
  if (risk.status === 'closed') assert.ok(risk.closureEvidence, `${risk.id} closed without evidence`);
  if (risk.status === 'accepted' && (risk.severity === 'high' || risk.severity === 'critical')) {
    assert.ok(risk.acceptance && risk.acceptance.length > 20, `${risk.id} accepted high risk lacks explicit acceptance`);
  }
}
assert.ok(ids.has('QR-007'), 'risk register must track unavailable independent review');

const serialized = JSON.stringify({ gates, inventory, register });
for (const pattern of [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i
]) {
  assert.equal(pattern.test(serialized), false, 'governance data contains a possible secret');
}

console.log(`[quality-governance] passed owners=${requiredOwnership.size} workflows=${inventory.workflows.length} risks=${ids.size} date=${today} state=${gates.state} context=${gates.enforcementPlan.aggregateContext}`);
