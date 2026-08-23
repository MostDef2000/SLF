#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = 'data/contracts/slf-contracts-v1.schema.json';
const fixturesPath = 'data/contracts/fixtures-v1.json';
const policyPath = 'data/contracts/contract-policy-v1.json';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

const rootSchema = readJson(schemaPath);
const fixtures = readJson(fixturesPath);
const policy = readJson(policyPath);

function typeMatches(value, expected) {
  switch (expected) {
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: throw new Error(`unsupported schema type: ${expected}`);
  }
}

function resolveRef(ref) {
  const prefix = '#/$defs/';
  assert.ok(ref.startsWith(prefix), `only local $defs references are supported: ${ref}`);
  const name = ref.slice(prefix.length);
  const resolved = rootSchema.$defs?.[name];
  assert.ok(resolved, `unresolved schema reference: ${ref}`);
  return resolved;
}

function validate(value, schema, currentPath = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.$ref) return validate(value, resolveRef(schema.$ref), currentPath);

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some(expected => typeMatches(value, expected))) {
      errors.push(`${currentPath}: expected ${expectedTypes.join('|')}`);
      return errors;
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    errors.push(`${currentPath}: expected constant ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(item => item === value)) {
    errors.push(`${currentPath}: expected one of ${schema.enum.map(item => JSON.stringify(item)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push(`${currentPath}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`${currentPath}: does not match ${schema.pattern}`);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value) && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${currentPath}: less than minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${currentPath}: fewer than ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(item, schema.items, `${currentPath}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        errors.push(`${currentPath}.${required}: required property is missing`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validate(value[key], childSchema, `${currentPath}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${currentPath}.${key}: additional property is not allowed`);
        }
      }
    }
  }

  return errors;
}

function contractSchema(name) {
  const schema = rootSchema.$defs?.[name];
  assert.ok(schema, `unknown contract ${name}`);
  return schema;
}

assert.equal(rootSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(fixtures.contractSchema, schemaPath);
assert.equal(policy.contractSchema, schemaPath);
assert.equal(policy.fixtures, fixturesPath);

const requiredContracts = [
  'matchSnapshot',
  'matchResult',
  'presetEvent',
  'presetEffect',
  'manualMatchState',
  'appendResponse',
  'analysisResponse',
  'releaseManifest'
];
for (const contract of requiredContracts) contractSchema(contract);

for (const fixture of fixtures.positive || []) {
  const errors = validate(fixture.data, contractSchema(fixture.contract));
  assert.deepEqual(errors, [], `positive fixture failed: ${fixture.name}\n${errors.join('\n')}`);
}

for (const fixture of fixtures.negative || []) {
  const errors = validate(fixture.data, contractSchema(fixture.contract));
  assert.ok(errors.length > 0, `negative fixture unexpectedly passed: ${fixture.name}`);
}

const versionManifest = readJson('data/version.json');
const versionErrors = validate(versionManifest, contractSchema('releaseManifest'));
assert.deepEqual(versionErrors, [], `data/version.json violates releaseManifest\n${versionErrors.join('\n')}`);
assert.equal(
  versionManifest.status,
  `release_${versionManifest.scriptVersion.replace(/\./g, '_')}_published`,
  'release status must be derived from scriptVersion'
);

const invalidReleaseManifest = { ...versionManifest, archiveCreated: true };
assert.ok(
  validate(invalidReleaseManifest, contractSchema('releaseManifest')).length > 0,
  'release contract must reject archiveCreated=true for latest-only publication'
);

const snapshotSource = read('src/modules/manual-match-telemetry/snapshot-engine.js');
const eventSource = read('src/modules/manual-match-telemetry/event-tracker.js');
const runtimeSource = read('src/modules/manual-match-telemetry/manual-match-runtime.js');
const integritySource = read('src/modules/manual-match-telemetry/manual-state-integrity.js');
const serverSource = read('vps/api/server.py');

for (const marker of [
  "recordType: 'match_snapshot'",
  'schemaVersion: 2',
  "parserVersion: 'match_snapshot_append_v1'",
  'snapshotKey: this.buildSnapshotKey(snapshot)',
  "recordType: 'match_result'",
  "resultType: 'finished_match'",
  'resultKey: this.buildResultKey(snapshot)'
]) {
  assert.ok(snapshotSource.includes(marker), `snapshot engine is missing contract marker: ${marker}`);
}

for (const marker of [
  "recordType: 'preset_event'",
  'schemaVersion: 3',
  "recordType: 'preset_effect'",
  "parserVersion: 'preset_effect_generation_v4_tactic_telemetry'"
]) {
  assert.ok(eventSource.includes(marker), `event tracker is missing contract marker: ${marker}`);
}

for (const marker of [
  "const manualStateSchema = 'slf_manual_match_state_v1'",
  "const legacyStatePrefix = 'slf_live_parser_state_v2'"
]) {
  assert.ok(integritySource.includes(marker), `manual state integrity is missing contract marker: ${marker}`);
}

for (const marker of [
  "'preset_effect'"
]) {
  assert.ok(runtimeSource.includes(marker), `manual runtime is missing contract marker: ${marker}`);
}

for (const marker of [
  'pending.eventKey'
]) {
  assert.ok(integritySource.includes(marker), `manual state integrity is missing contract marker: ${marker}`);
}

for (const [collection, spec] of Object.entries(policy.recordContracts || {})) {
  assert.ok(
    serverSource.includes(`"${collection}": "${spec.uniqueKey}"`),
    `server tactical key mapping is missing ${collection} -> ${spec.uniqueKey}`
  );
}
assert.ok(serverSource.includes('missing_unique_key += 1'), 'server must count tactical records without unique keys');
assert.ok(serverSource.includes('"missingUniqueKey": missing_unique_key'), 'append response must report missingUniqueKey');
assert.equal(policy.compatibility.missingTacticalUniqueKey.mode, 'accept_and_report');
assert.equal(policy.compatibility.missingTacticalUniqueKey.clientContractAllowsMissingKey, false);
assert.equal(policy.manualState.activeSchema, 'slf_manual_match_state_v1');
assert.equal(policy.manualState.legacyReadOnlySchema, 'slf_live_parser_state_v2');
assert.equal(policy.manualState.writesLegacy, false);

// Governance regression guard: obsolete workflow names and runtime phases must
// never reappear in active contracts after the compatibility-contract cleanup.
const obsoleteWorkflowNames = ['SLF Validate and Release'];
const obsoletePhases = ['ACTIONS_REQUIRED', 'ACTIONS_RUNNING', 'ACTIONS_COMPLETED'];
const contractFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.md')) contractFiles.push(full);
  }
})(path.join(root, 'contracts'));
for (const file of contractFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const name of obsoleteWorkflowNames) {
    assert.equal(
      content.includes(name),
      false,
      `${path.relative(root, file)} references obsolete workflow name: ${name}`
    );
  }
  for (const phase of obsoletePhases) {
    assert.equal(
      content.includes(phase),
      false,
      `${path.relative(root, file)} references obsolete runtime phase: ${phase}`
    );
  }
}

console.log(
  `[versioned-contracts] passed: contracts=${requiredContracts.length} positive=${fixtures.positive.length} negative=${fixtures.negative.length} contractFiles=${contractFiles.length}`
);
