#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/quality/maintenance-review-v1.json'), 'utf8'));
const dependabotSource = fs.readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8');
const governanceSource = fs.readFileSync(path.join(root, '.github/workflows/quality-governance.yml'), 'utf8');

function parseUtcDate(value, label) {
  assert.match(value || '', /^\d{4}-\d{2}-\d{2}$/, `${label} must use YYYY-MM-DD`);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  assert.equal(Number.isNaN(timestamp), false, `${label} is not a valid date`);
  return timestamp;
}

function dependabotBlock(ecosystem, directory) {
  const blocks = dependabotSource.split(/\n(?=  - package-ecosystem:)/);
  const block = blocks.find(candidate =>
    candidate.includes(`package-ecosystem: ${ecosystem}`) &&
    candidate.includes(`directory: ${directory}`)
  );
  assert.ok(block, `Dependabot block missing: ${ecosystem} ${directory}`);
  return block;
}

assert.equal(manifest.schema, 'slf_quality_maintenance_review_v1');
assert.equal(manifest.repository, 'MostDef2000/SLF');
assert.equal(manifest.cadence, 'quarterly');
assert.equal(manifest.owner, 'MostDef2000');
assert.ok(Number.isInteger(manifest.maximumReviewWindowDays));
assert.ok(manifest.maximumReviewWindowDays >= 80 && manifest.maximumReviewWindowDays <= 100);

const lastReviewed = parseUtcDate(manifest.lastReviewed, 'lastReviewed');
const nextReviewBy = parseUtcDate(manifest.nextReviewBy, 'nextReviewBy');
const todayText = process.env.SLF_GOVERNANCE_DATE || new Date().toISOString().slice(0, 10);
const today = parseUtcDate(todayText, 'SLF_GOVERNANCE_DATE/today');
const windowDays = Math.round((nextReviewBy - lastReviewed) / 86400000);
assert.ok(nextReviewBy > lastReviewed, 'nextReviewBy must be after lastReviewed');
assert.ok(windowDays <= manifest.maximumReviewWindowDays, `maintenance review window is ${windowDays} days`);
assert.ok(nextReviewBy >= today, `quarterly maintenance review expired on ${manifest.nextReviewBy}`);

const requiredAreas = new Set(['dependencies', 'fixtures', 'threat-model', 'control-mapping', 'accepted-risks']);
assert.ok(Array.isArray(manifest.reviewAreas));
assert.equal(manifest.reviewAreas.length, requiredAreas.size);
const seenAreas = new Set();
for (const area of manifest.reviewAreas) {
  assert.ok(requiredAreas.has(area.id), `unknown maintenance review area: ${area.id}`);
  assert.equal(seenAreas.has(area.id), false, `duplicate maintenance review area: ${area.id}`);
  seenAreas.add(area.id);
  assert.ok(Array.isArray(area.evidencePaths) && area.evidencePaths.length > 0, `${area.id} has no evidence paths`);
  for (const relativePath of area.evidencePaths) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${area.id} evidence path missing: ${relativePath}`);
  }
  assert.ok(typeof area.result === 'string' && area.result.length >= 40, `${area.id} result is not substantive`);
}
assert.deepEqual(seenAreas, requiredAreas);

assert.equal(manifest.dependencyMonitoring.schedule, 'weekly');
assert.equal(manifest.dependencyMonitoring.day, 'monday');
assert.deepEqual(manifest.dependencyMonitoring.pipDirectories, [
  '/vps/api',
  '/vps/exporter-rag',
  '/tests/browser'
]);
assert.equal(manifest.dependencyMonitoring.githubActionsDirectory, '/');

for (const directory of manifest.dependencyMonitoring.pipDirectories) {
  const block = dependabotBlock('pip', directory);
  assert.match(block, /interval:\s*weekly/, `Dependabot ${directory} must run weekly`);
  assert.match(block, /day:\s*monday/, `Dependabot ${directory} must run Monday`);
  assert.match(block, /- dependencies/, `Dependabot ${directory} missing dependencies label`);
  assert.match(block, /- security/, `Dependabot ${directory} missing security label`);
}
const actionsBlock = dependabotBlock('github-actions', manifest.dependencyMonitoring.githubActionsDirectory);
assert.match(actionsBlock, /interval:\s*weekly/, 'GitHub Actions Dependabot must run weekly');
assert.match(actionsBlock, /day:\s*monday/, 'GitHub Actions Dependabot must run Monday');

assert.equal(manifest.governanceMonitoring.workflow, '.github/workflows/quality-governance.yml');
assert.equal(manifest.governanceMonitoring.pullRequestValidation, true);
assert.equal(manifest.governanceMonitoring.manualDispatch, true);
assert.match(governanceSource, /^\s*pull_request:\s*$/m, 'governance workflow must run on pull requests');
assert.match(governanceSource, /^\s*workflow_dispatch:\s*$/m, 'governance workflow must allow manual dispatch');
assert.match(governanceSource, /^\s*schedule:\s*$/m, 'governance workflow must be scheduled');
assert.ok(
  governanceSource.includes(`cron: '${manifest.governanceMonitoring.cron}'`),
  `governance workflow missing cron ${manifest.governanceMonitoring.cron}`
);

console.log(
  `[quality-maintenance] passed: lastReviewed=${manifest.lastReviewed} nextReviewBy=${manifest.nextReviewBy} windowDays=${windowDays} areas=${seenAreas.size} dependabotSurfaces=${manifest.dependencyMonitoring.pipDirectories.length + 1}`
);
