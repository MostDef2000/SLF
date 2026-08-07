#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const inventory = JSON.parse(read('data/quality/workflow-inventory-v1.json'));
const workflowsDir = path.join(root, '.github/workflows');
const activePaths = fs.readdirSync(workflowsDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name))
  .map(entry => `.github/workflows/${entry.name}`)
  .sort();

assert.equal(inventory.schema, 'slf_workflow_inventory_v1');
assert.equal(inventory.repository, 'MostDef2000/SLF');
assert.equal(inventory.defaultBranch, 'main');
assert.equal(inventory.maxPermanentWorkflows, 3);
assert.equal(inventory.canonicalRequiredContext, 'SLF CI / ci');
assert.ok(Array.isArray(inventory.workflows));

const registeredPaths = inventory.workflows.map(item => item.path).sort();
assert.deepEqual(activePaths, registeredPaths, `active workflow files must exactly match inventory\nactive=${activePaths.join(',')}\nregistered=${registeredPaths.join(',')}`);

const permanent = inventory.workflows.filter(item => item.classification === 'PERMANENT');
assert.ok(permanent.length <= inventory.maxPermanentWorkflows, 'permanent workflow budget exceeded');
assert.equal(permanent.length, 3, 'SLF requires exactly CI, RELEASE and MAINTENANCE permanent workflows');
assert.deepEqual(new Set(permanent.map(item => item.role)), new Set(['CI', 'RELEASE', 'MAINTENANCE']));

const names = new Set();
for (const item of inventory.workflows) {
  assert.ok(item.path.startsWith('.github/workflows/'));
  assert.match(item.path, /\.ya?ml$/i);
  assert.ok(item.name && item.owner && item.purpose);
  assert.equal(names.has(item.name), false, `duplicate workflow name: ${item.name}`);
  names.add(item.name);
  assert.ok(['PERMANENT', 'TEMPORARY', 'MIGRATION'].includes(item.classification), `invalid classification: ${item.classification}`);
  assert.ok(fs.existsSync(path.join(root, item.path)), `registered workflow missing: ${item.path}`);
  if (item.classification !== 'PERMANENT') {
    assert.ok(Number.isInteger(item.sourceIssue) || Number.isInteger(item.sourcePullRequest), `${item.path} missing source issue/PR`);
    assert.match(item.createdAt || '', /^\d{4}-\d{2}-\d{2}$/);
    assert.match(item.expiresAt || '', /^\d{4}-\d{2}-\d{2}$/);
    assert.ok((item.cleanupCondition || '').length > 10, `${item.path} missing cleanup condition`);
    const today = process.env.SLF_WORKFLOW_DATE || new Date().toISOString().slice(0, 10);
    assert.ok(item.expiresAt >= today, `${item.path} expired on ${item.expiresAt}`);
  }
}

const ci = permanent.find(item => item.role === 'CI');
const release = permanent.find(item => item.role === 'RELEASE');
const maintenance = permanent.find(item => item.role === 'MAINTENANCE');
assert.equal(ci.requiredContext, inventory.canonicalRequiredContext);

const ciSource = read(ci.path);
assert.match(ciSource, /^name:\s*SLF CI\s*$/m);
assert.match(ciSource, /^\s*pull_request:\s*$/m);
assert.equal(/pull_request:\s*\n\s+paths:/.test(ciSource), false, 'canonical CI must not use pull-request path filters');
assert.match(ciSource, /^\s*workflow_dispatch:\s*$/m);
assert.match(ciSource, /^\s*ci:\s*$/m);
assert.match(ciSource, /Require every CI domain to pass/);

const releaseSource = read(release.path);
assert.match(releaseSource, /^name:\s*SLF Release\s*$/m);
assert.match(releaseSource, /^\s*push:\s*$/m);
assert.match(releaseSource, /^\s*workflow_dispatch:\s*$/m);
assert.match(releaseSource, /source_commit:/);
assert.match(releaseSource, /contents:\s*write/);
assert.match(releaseSource, /release_required/);
assert.equal(/pull_request:\s*$/.test(releaseSource), false, 'release workflow must not duplicate PR validation');

const maintenanceSource = read(maintenance.path);
assert.match(maintenanceSource, /^name:\s*SLF Maintenance\s*$/m);
assert.match(maintenanceSource, /^\s*schedule:\s*$/m);
assert.match(maintenanceSource, /^\s*workflow_dispatch:\s*$/m);
assert.equal(/pull_request:\s*$/.test(maintenanceSource), false, 'maintenance must not duplicate canonical PR CI');

console.log(`[workflow-inventory] passed active=${activePaths.length} permanent=${permanent.length} context=${inventory.canonicalRequiredContext}`);
