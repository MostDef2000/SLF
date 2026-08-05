#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const nonEmptyStringArray = value => Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);

const contractPath = 'data/quality/deliberate-execution-contract-v1.json';
const fixturesPath = 'data/quality/deliberate-execution-fixtures-v1.json';
const contract = readJson(contractPath);
const fixtures = readJson(fixturesPath);
const template = read('.github/pull_request_template.md');
const workflow = read('.github/workflows/quality-integration.yml');
const policy = read('docs/quality/deliberate-execution-contract.md');
const gates = readJson('data/quality/quality-gates-v1.json');

assert.equal(contract.schema, 'slf_deliberate_execution_contract_v1');
assert.equal(contract.contractVersion, 1);
assert.equal(contract.status, 'active');
assert.equal(contract.owner, 'MostDef2000');
assert.equal(contract.privacyBoundary.disclosure, 'prohibited');
assert.equal(contract.privacyBoundary.storage, 'prohibited');
assert.ok(contract.principles.some(value => /Do not request, store, or publish hidden chain-of-thought/i.test(value)));
assert.deepEqual(Object.keys(contract.classification.modes), ['direct', 'structured', 'critical']);
assert.equal(contract.classification.defaultMode, 'structured');
assert.equal(contract.executionRules.decomposeBeforeMutation, true);
assert.equal(contract.executionRules.defineAcceptanceCriteriaBeforeMutation, true);
assert.equal(contract.executionRules.separateFactFromInference, true);
assert.equal(contract.executionRules.separateGenerationAndVerificationPasses, true);
assert.equal(contract.executionRules.stopOnFailedGate, true);
assert.equal(contract.executionRules.productionDeploymentRequiresExplicitApproval, true);
assert.equal(contract.executionRules.mergeReleaseAndDeploymentAreSeparateDecisions, true);
assert.equal(contract.evidenceRules.observableEvidenceRequiredForSuccess, true);
assert.equal(contract.evidenceRules.unsupportedClaimPolicy, 'block_success');
assert.equal(contract.deploymentBoundary.qualityGateMayAuthorizeDeployment, false);
assert.equal(contract.deploymentBoundary.qualityGateMayProveCandidateReadiness, true);
assert.equal(contract.deploymentBoundary.explicitOperationalApprovalRequired, true);
assert.ok(nonEmptyStringArray(contract.verificationProtocol.requiredQuestions));
assert.ok(nonEmptyStringArray(contract.stopConditions));

const allowedModes = new Set(contract.recordContract.allowedModes);
const allowedOutcomes = new Set(contract.recordContract.allowedOutcomes);
const allowedEvidenceKinds = new Set(contract.evidenceRules.allowedKinds);
const allowedEvidenceResults = new Set(contract.evidenceRules.allowedResults);
const forbiddenKeys = new Set(contract.privacyBoundary.forbiddenRecordKeys);

function collectForbiddenKeys(value, errors) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectForbiddenKeys(item, errors));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`privacy.forbidden_key:${key}`);
    collectForbiddenKeys(nested, errors);
  }
}

function validateEvidence(evidence, errors, prefix) {
  if (!Array.isArray(evidence)) return;
  evidence.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}.invalid_item:${index}`);
      return;
    }
    if (!allowedEvidenceKinds.has(item.kind)) errors.push(`${prefix}.invalid_kind:${index}`);
    if (!nonEmptyString(item.reference)) errors.push(`${prefix}.reference_required:${index}`);
    if (!allowedEvidenceResults.has(item.result)) errors.push(`${prefix}.invalid_result:${index}`);
  });
}

function validateVerification(items, errors, prefix) {
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}.invalid_item:${index}`);
      return;
    }
    if (!nonEmptyString(item.check)) errors.push(`${prefix}.check_required:${index}`);
    if (!allowedEvidenceResults.has(item.result)) errors.push(`${prefix}.invalid_result:${index}`);
  });
}

function validateRecord(record) {
  const errors = [];
  collectForbiddenKeys(record, errors);

  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['record.object_required'];
  if (record.schema !== contract.recordContract.schema) errors.push('record.schema_invalid');
  if (!nonEmptyString(record.task)) errors.push('record.task_required');
  if (!allowedModes.has(record.mode)) errors.push('record.mode_invalid');
  if (!nonEmptyString(record.classificationReason)) errors.push('record.classification_reason_required');
  if (!nonEmptyStringArray(record.acceptanceCriteria)) errors.push('record.acceptance_criteria_required');
  if (!allowedOutcomes.has(record.outcome)) errors.push('record.outcome_invalid');
  if (!nonEmptyString(record.decisionSummary)) errors.push('record.decision_summary_required');

  if (record.mode === 'structured' || record.mode === 'critical') {
    const prefix = record.mode;
    if (!nonEmptyStringArray(record.plan)) errors.push(`${prefix}.plan_required`);
    if (!Array.isArray(record.assumptions)) errors.push(`${prefix}.assumptions_required`);
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) errors.push(`${prefix}.evidence_required`);
    if (!Array.isArray(record.verification) || record.verification.length === 0) errors.push(`${prefix}.verification_required`);
    if (!Array.isArray(record.residualRisks)) errors.push(`${prefix}.residual_risks_required`);
    validateEvidence(record.evidence, errors, `${prefix}.evidence`);
    validateVerification(record.verification, errors, `${prefix}.verification`);
  }

  if (record.mode === 'critical') {
    if (!nonEmptyStringArray(record.alternatives)) errors.push('critical.alternatives_required');
    if (!Array.isArray(record.adversarialVerification) || record.adversarialVerification.length === 0) {
      errors.push('critical.adversarial_verification_required');
    }
    validateVerification(record.adversarialVerification, errors, 'critical.adversarial_verification');
    if (!nonEmptyStringArray(record.stopConditions)) errors.push('critical.stop_conditions_required');

    const rollback = record.rollback;
    if (!rollback || typeof rollback !== 'object' || typeof rollback.available !== 'boolean' ||
        !nonEmptyString(rollback.procedure) || !nonEmptyString(rollback.verification)) {
      errors.push('critical.rollback_required');
    }

    const approval = record.approval;
    if (!approval || typeof approval !== 'object' || typeof approval.required !== 'boolean' ||
        !nonEmptyString(approval.status) || !nonEmptyString(approval.authority)) {
      errors.push('critical.approval_required');
    } else if (approval.required && record.outcome === 'success' && approval.status !== 'approved') {
      errors.push('critical.approval_not_approved');
    }
  }

  if (record.outcome === 'success') {
    if ((record.mode === 'structured' || record.mode === 'critical') &&
        (!Array.isArray(record.evidence) || !record.evidence.some(item => item?.result === 'success'))) {
      errors.push('success.observable_evidence_required');
    }
    const verificationItems = [
      ...(Array.isArray(record.verification) ? record.verification : []),
      ...(Array.isArray(record.adversarialVerification) ? record.adversarialVerification : [])
    ];
    if (verificationItems.some(item => item?.result === 'failure')) errors.push('success.verification_must_pass');
    if (Array.isArray(record.evidence) && record.evidence.some(item => item?.result === 'failure')) {
      if (!errors.includes('success.verification_must_pass')) errors.push('success.verification_must_pass');
    }
  }

  return [...new Set(errors)].sort();
}

assert.equal(fixtures.schema, 'slf_deliberate_execution_fixtures_v1');
assert.equal(fixtures.contract, contractPath);
assert.ok(Array.isArray(fixtures.validRecords) && fixtures.validRecords.length >= 3);
assert.ok(Array.isArray(fixtures.invalidRecords) && fixtures.invalidRecords.length >= 4);

for (const fixture of fixtures.validRecords) {
  const errors = validateRecord(fixture.record);
  assert.deepEqual(errors, [], `valid fixture failed: ${fixture.name}\n${errors.join('\n')}`);
}

for (const fixture of fixtures.invalidRecords) {
  const actual = validateRecord(fixture.record);
  const expected = [...fixture.expectedErrors].sort();
  assert.deepEqual(actual, expected, `invalid fixture mismatch: ${fixture.name}`);
}

for (const heading of [
  '## Deliberate execution',
  'Reasoning mode: direct / structured / critical',
  'Material assumptions:',
  'Counterexample or adversarial check:',
  'Stop conditions:',
  'Residual risks:'
]) {
  assert.ok(template.includes(heading), `PR template missing deliberate-execution field: ${heading}`);
}
for (const invariant of [
  'No hidden chain-of-thought or private scratchpad is included',
  'Facts, assumptions, and inferences are separated',
  'Success claims are backed by observable evidence'
]) {
  assert.ok(template.includes(invariant), `PR template missing deliberate-execution invariant: ${invariant}`);
}

for (const invariant of [
  'node --check tools/test-deliberate-execution-contract.mjs',
  "data/quality/deliberate-execution-contract-v1.json",
  "data/quality/deliberate-execution-fixtures-v1.json",
  'node tools/test-deliberate-execution-contract.mjs'
]) {
  assert.ok(workflow.includes(invariant), `aggregate workflow missing deliberate-execution invariant: ${invariant}`);
}

for (const invariant of [
  '# SLF Deliberate Execution Contract',
  'Do not request, store, or publish hidden chain-of-thought',
  'Generation pass',
  'Verification pass',
  'Quality gate does not authorize deployment'
]) {
  assert.ok(policy.includes(invariant), `deliberate execution policy missing invariant: ${invariant}`);
}

assert.equal(gates.deliberateExecutionContract.schema, contract.schema);
assert.equal(gates.deliberateExecutionContract.path, contractPath);
assert.equal(gates.deliberateExecutionContract.fixtures, fixturesPath);
assert.equal(gates.deliberateExecutionContract.validator, 'tools/test-deliberate-execution-contract.mjs');
assert.equal(gates.deliberateExecutionContract.aggregateDomain, 'static-contract-security');
assert.equal(gates.deliberateExecutionContract.hiddenChainOfThoughtRequiredInEvidence, false);
assert.equal(gates.deliberateExecutionContract.observableEvidenceRequired, true);
assert.equal(gates.deliberateExecutionContract.explicitDeploymentApprovalRequired, true);

console.log(
  `[deliberate-execution] passed: modes=${allowedModes.size} valid=${fixtures.validRecords.length} invalid=${fixtures.invalidRecords.length} aggregate=${gates.deliberateExecutionContract.aggregateDomain}`
);
