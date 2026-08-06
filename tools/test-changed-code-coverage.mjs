#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const manifestPath = path.join(root, 'data/quality/changed-code-coverage-v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bundleOrder = JSON.parse(fs.readFileSync(path.join(root, 'src/app/bundle-order.json'), 'utf8'));

function compilePatterns(values, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} must not be empty`);
  return values.map((value, index) => {
    assert.equal(typeof value, 'string', `${label}[${index}] must be a string`);
    try {
      return new RegExp(value);
    } catch (error) {
      throw new Error(`${label}[${index}] is not a valid regular expression: ${error.message}`);
    }
  });
}

function gitLines(args) {
  const output = execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

function normalizeFile(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesAny(file, patterns) {
  return patterns.some(pattern => pattern.test(file));
}

assert.equal(manifest.schema, 'slf_changed_code_evidence_coverage_v1');
assert.equal(manifest.coverageKind, 'source_to_executable_evidence');
assert.equal(manifest.statementCoverageClaimed, false);
assert.equal(manifest.branchCoverageClaimed, false);
assert.equal(manifest.repository, 'MostDef2000/SLF');
assert.ok(manifest.ratchet.minimumRegisteredBundleModules >= 56, 'bundle module ratchet cannot fall below the reviewed 56-module baseline');
assert.equal(manifest.ratchet.maximumUnmappedCriticalFiles, 0);
assert.equal(manifest.ratchet.requiredChangedCriticalFileCoveragePercent, 100);
assert.ok(manifest.ratchet.minimumEvidenceRules >= 8);

const criticalPatterns = compilePatterns(manifest.criticalFilePatterns, 'criticalFilePatterns');
assert.ok(Array.isArray(manifest.evidenceRules));
assert.ok(manifest.evidenceRules.length >= manifest.ratchet.minimumEvidenceRules, 'evidence rule count fell below the ratchet');

const ruleIds = new Set();
const rules = manifest.evidenceRules.map((rule, ruleIndex) => {
  assert.match(rule.id || '', /^[a-z0-9][a-z0-9-]+$/, `invalid evidence rule id at index ${ruleIndex}`);
  assert.equal(ruleIds.has(rule.id), false, `duplicate evidence rule id: ${rule.id}`);
  ruleIds.add(rule.id);
  const patterns = compilePatterns(rule.filePatterns, `${rule.id}.filePatterns`);
  assert.ok(Array.isArray(rule.evidencePaths) && rule.evidencePaths.length > 0, `${rule.id} has no evidence paths`);
  for (const relativePath of rule.evidencePaths) {
    assert.equal(typeof relativePath, 'string');
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${rule.id} evidence path does not exist: ${relativePath}`);
  }
  assert.ok(Array.isArray(rule.workflowCommands) && rule.workflowCommands.length > 0, `${rule.id} has no workflow commands`);
  for (const item of rule.workflowCommands) {
    assert.equal(typeof item.workflow, 'string');
    assert.equal(typeof item.contains, 'string');
    const workflowPath = path.join(root, item.workflow);
    assert.ok(fs.existsSync(workflowPath), `${rule.id} workflow does not exist: ${item.workflow}`);
    const workflowSource = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(workflowSource.includes(item.contains), `${rule.id} workflow command missing from ${item.workflow}: ${item.contains}`);
  }
  return { ...rule, patterns };
});

assert.ok(Array.isArray(manifest.exceptions));
const today = process.env.SLF_GOVERNANCE_DATE || new Date().toISOString().slice(0, 10);
const exceptions = new Map();
for (const exception of manifest.exceptions) {
  assert.equal(typeof exception.path, 'string');
  assert.equal(exceptions.has(exception.path), false, `duplicate coverage exception: ${exception.path}`);
  assert.match(exception.reviewBy || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(exception.reviewBy >= today, `coverage exception expired: ${exception.path} on ${exception.reviewBy}`);
  assert.ok(typeof exception.reason === 'string' && exception.reason.length >= 20, `coverage exception lacks reason: ${exception.path}`);
  exceptions.set(exception.path, exception);
}

const trackedFiles = gitLines(['ls-files']).map(normalizeFile);
const criticalFiles = trackedFiles.filter(file => matchesAny(file, criticalPatterns));
assert.ok(criticalFiles.length > 0, 'no critical files matched the coverage scope');

function matchingRuleIds(file) {
  return rules.filter(rule => matchesAny(file, rule.patterns)).map(rule => rule.id);
}

const unmapped = [];
for (const file of criticalFiles) {
  const mapped = matchingRuleIds(file);
  if (mapped.length === 0 && !exceptions.has(file)) unmapped.push(file);
}
assert.equal(
  unmapped.length,
  manifest.ratchet.maximumUnmappedCriticalFiles,
  `unmapped critical files:\n${unmapped.join('\n')}`
);

assert.ok(Array.isArray(bundleOrder.files));
assert.ok(
  bundleOrder.files.length >= manifest.ratchet.minimumRegisteredBundleModules,
  `bundle module count ${bundleOrder.files.length} fell below ratchet ${manifest.ratchet.minimumRegisteredBundleModules}`
);
for (const file of bundleOrder.files) {
  assert.ok(trackedFiles.includes(file), `bundle module is not tracked: ${file}`);
  assert.ok(matchesAny(file, criticalPatterns), `bundle module is outside critical scope: ${file}`);
  assert.ok(matchingRuleIds(file).length > 0, `bundle module has no executable evidence rule: ${file}`);
}

const base = String(process.env.SLF_COVERAGE_BASE || '').trim();
let changedCritical = [];
if (base) {
  assert.match(base, /^[0-9a-f]{7,40}$/i, 'SLF_COVERAGE_BASE must be a Git SHA');
  const changedFiles = gitLines(['diff', '--name-only', `${base}...HEAD`]).map(normalizeFile);
  changedCritical = changedFiles.filter(file => matchesAny(file, criticalPatterns));
  const changedUnmapped = changedCritical.filter(file => matchingRuleIds(file).length === 0 && !exceptions.has(file));
  const mappedCount = changedCritical.length - changedUnmapped.length;
  const percent = changedCritical.length === 0 ? 100 : (mappedCount / changedCritical.length) * 100;
  assert.equal(
    percent,
    manifest.ratchet.requiredChangedCriticalFileCoveragePercent,
    `changed critical file coverage ${percent.toFixed(2)}%; unmapped:\n${changedUnmapped.join('\n')}`
  );
}

const ruleCoverage = Object.fromEntries(rules.map(rule => [rule.id, criticalFiles.filter(file => matchesAny(file, rule.patterns)).length]));
for (const [ruleId, count] of Object.entries(ruleCoverage)) {
  assert.ok(count > 0, `evidence rule matches no critical files: ${ruleId}`);
}

console.log(
  `[changed-code-evidence] passed: coverageKind=${manifest.coverageKind} critical=${criticalFiles.length} unmapped=${unmapped.length} bundleModules=${bundleOrder.files.length} changedCritical=${changedCritical.length} rules=${rules.length}`
);
