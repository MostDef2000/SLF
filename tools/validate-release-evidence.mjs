#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidenceDir = path.resolve(root, process.env.SLF_EVIDENCE_DIR || 'artifacts/release-evidence');
const evidencePath = path.join(evidenceDir, 'release-evidence.json');
const sbomPath = path.join(evidenceDir, 'sbom.spdx.json');
const sumsPath = path.join(evidenceDir, 'SHA256SUMS');

const readJsonFile = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const sha256File = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const evidence = readJsonFile(evidencePath);
const sbom = readJsonFile(sbomPath);
const manifest = readJsonFile(path.join(root, 'data/version.json'));
const bundleOrder = readJsonFile(path.join(root, 'src/app/bundle-order.json'));
const userscriptHeader = fs.readFileSync(path.join(root, 'src/app/userscript-header.js'), 'utf8');
const userscriptRequireUrls = [...userscriptHeader.matchAll(/^\/\/\s*@require\s+(\S+)\s*$/gm)]
  .map(match => match[1])
  .sort();

assert.equal(evidence.schema, 'slf_release_evidence_v1');
assert.equal(evidence.scriptVersion, manifest.scriptVersion);
assert.equal(evidence.releaseChannel, manifest.releaseChannel);
assert.match(evidence.validationRevision, /^[0-9a-f]{40}$/);
assert.equal(evidence.approvedBaseCommit, manifest.build.approvedBaseCommit);
assert.equal(evidence.approvedCommit, manifest.build.approvedCommit);
assert.deepEqual(evidence.approvedFiles, manifest.build.approvedFiles);
assert.equal(evidence.bundleManifestSha256, manifest.build.bundleManifestSha256);
assert.equal(evidence.bundleFileCount, manifest.build.bundleFileCount);
assert.equal(evidence.deterministicRebuildVerified, true);
assert.equal(evidence.secretsIncluded, false);
assert.equal(evidence.deploymentBoundary.repositoryDeploymentExecuted, false);
assert.equal(evidence.deploymentBoundary.productionVerificationExecuted, false);
assert.equal(evidence.deploymentBoundary.requiredVerifier, 'vps/ops/verify_api_deployment.py');

function validateFileEntries(entries, label) {
  assert.ok(Array.isArray(entries) && entries.length > 0, `${label} must not be empty`);
  const paths = new Set();
  for (const entry of entries) {
    assert.equal(typeof entry.path, 'string');
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(entry.bytes) && entry.bytes >= 0);
    assert.equal(paths.has(entry.path), false, `${label} duplicate path: ${entry.path}`);
    paths.add(entry.path);
    const absolute = path.join(root, entry.path);
    assert.ok(fs.existsSync(absolute), `${label} missing repository file: ${entry.path}`);
    assert.equal(sha256File(absolute), entry.sha256, `${label} hash mismatch: ${entry.path}`);
    assert.equal(fs.statSync(absolute).size, entry.bytes, `${label} size mismatch: ${entry.path}`);
  }
  return paths;
}

const releasePaths = validateFileEntries(evidence.releaseFiles, 'releaseFiles');
const buildPaths = validateFileEntries(evidence.buildFiles, 'buildFiles');
const deploymentPaths = validateFileEntries(evidence.deploymentFiles, 'deploymentFiles');
const sourcePaths = validateFileEntries(evidence.sourceModules, 'sourceModules');

for (const required of [
  'releases/latest.user.js',
  'releases/latest.meta.js',
  'data/version.json',
  'CHANGELOG.md',
  'src/app/bundle-order.json'
]) assert.ok(releasePaths.has(required), `release evidence missing ${required}`);

for (const required of [
  'tools/build-latest-userscript.mjs',
  'tools/check-bundle-order.mjs',
  'tools/validate-release-provenance.mjs'
]) assert.ok(buildPaths.has(required), `build evidence missing ${required}`);

for (const required of [
  'vps/api/server.py',
  'vps/api/requirements.txt',
  'vps/ops/slf-server.service',
  'vps/ops/deploy-code.sh',
  'vps/ops/rollback-code.sh',
  'vps/ops/verify_api_deployment.py'
]) assert.ok(deploymentPaths.has(required), `deployment evidence missing ${required}`);

assert.equal(sourcePaths.size, bundleOrder.files.length);
assert.equal(sourcePaths.size, manifest.build.bundleFileCount);
for (const modulePath of bundleOrder.files) {
  assert.ok(sourcePaths.has(modulePath), `source evidence missing module ${modulePath}`);
}

assert.equal(evidence.sbom.format, 'SPDX');
assert.equal(evidence.sbom.version, '2.3');
assert.equal(evidence.sbom.path, 'sbom.spdx.json');
assert.equal(sbom.spdxVersion, 'SPDX-2.3');
assert.equal(sbom.dataLicense, 'CC0-1.0');
assert.equal(sbom.SPDXID, 'SPDXRef-DOCUMENT');
assert.match(sbom.documentNamespace, /^https:\/\/github\.com\/MostDef2000\/SLF\/releases\/evidence\//);
assert.ok(Array.isArray(sbom.packages));
assert.equal(sbom.packages.length, evidence.sbom.directDependencyCount);
assert.deepEqual(sbom.documentDescribes, sbom.packages.map(item => item.SPDXID));

const packageIds = new Set();
for (const item of sbom.packages) {
  assert.equal(typeof item.name, 'string');
  assert.ok(item.name.length > 0);
  assert.match(item.SPDXID, /^SPDXRef-Package-/);
  assert.equal(packageIds.has(item.SPDXID), false, `duplicate SPDX id: ${item.SPDXID}`);
  packageIds.add(item.SPDXID);
  assert.equal(item.filesAnalyzed, false);
  assert.equal(item.licenseConcluded, 'NOASSERTION');
}
for (const requiredName of ['Flask', 'flask-cors', 'gunicorn']) {
  assert.ok(sbom.packages.some(item => item.name.toLowerCase() === requiredName.toLowerCase()), `SBOM missing ${requiredName}`);
}

const sbomUserscriptUrls = sbom.packages
  .map(item => item.downloadLocation)
  .filter(value => value && value !== 'NOASSERTION')
  .sort();
assert.deepEqual(
  sbomUserscriptUrls,
  userscriptRequireUrls,
  'SBOM userscript URL dependencies must exactly match source @require directives'
);
assert.equal(
  sbom.packages.some(item => item.name.toLowerCase() === 'jquery'),
  userscriptRequireUrls.some(url => /jquery/i.test(url)),
  'SBOM jQuery component must match the actual userscript requirement'
);

const sums = fs.readFileSync(sumsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
assert.equal(sums.length, 2);
for (const line of sums) {
  const match = line.match(/^([0-9a-f]{64})  (release-evidence\.json|sbom\.spdx\.json)$/);
  assert.ok(match, `invalid SHA256SUMS line: ${line}`);
  assert.equal(sha256File(path.join(evidenceDir, match[2])), match[1], `bundle checksum mismatch: ${match[2]}`);
}

const serialized = [
  fs.readFileSync(evidencePath, 'utf8'),
  fs.readFileSync(sbomPath, 'utf8')
].join('\n');
for (const pattern of [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i
]) {
  assert.equal(pattern.test(serialized), false, 'evidence bundle contains a possible secret');
}

console.log(
  `[release-evidence-validation] passed: version=${evidence.scriptVersion} modules=${sourcePaths.size} dependencies=${sbom.packages.length} userscriptRequires=${userscriptRequireUrls.length}`
);
