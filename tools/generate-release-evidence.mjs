#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';

const root = process.cwd();
const outputDir = path.resolve(root, process.env.SLF_EVIDENCE_DIR || 'artifacts/release-evidence');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function hashFile(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  return {
    path: relativePath,
    sha256: sha256Bytes(bytes),
    bytes: bytes.length
  };
}

function gitRevision() {
  if (process.env.GITHUB_SHA && /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA)) {
    return process.env.GITHUB_SHA.toLowerCase();
  }
  return childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).trim().toLowerCase();
}

function parseRequirements(relativePath, ecosystem) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  return read(relativePath)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const match = line.match(/^([A-Za-z0-9_.-]+)==([^\s;]+)$/);
      return {
        ecosystem,
        sourceFile: relativePath,
        name: match ? match[1] : line,
        version: match ? match[2] : 'NOASSERTION',
        requirement: line
      };
    });
}

function parseUserscriptRequires() {
  const source = read('src/app/userscript-header.js');
  return [...source.matchAll(/^\/\/\s*@require\s+(\S+)\s*$/gm)].map(match => {
    const url = match[1];
    const jquery = url.match(/jquery-([0-9.]+)\.min\.js/);
    return {
      ecosystem: 'userscript-url',
      sourceFile: 'src/app/userscript-header.js',
      name: jquery ? 'jquery' : url,
      version: jquery ? jquery[1] : 'NOASSERTION',
      requirement: url,
      downloadLocation: url
    };
  });
}

function spdxId(value, index) {
  const normalized = String(value).replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `SPDXRef-Package-${normalized || 'dependency'}-${index + 1}`;
}

const manifest = readJson('data/version.json');
const bundleOrder = readJson('src/app/bundle-order.json');
const validationRevision = gitRevision();
const deterministicRebuildVerified = process.env.SLF_DETERMINISTIC_REBUILD_VERIFIED === 'true';
if (!deterministicRebuildVerified) {
  throw new Error('SLF_DETERMINISTIC_REBUILD_VERIFIED=true is required after a successful rebuild comparison');
}

const releaseFiles = [
  'releases/latest.user.js',
  'releases/latest.meta.js',
  'data/version.json',
  'CHANGELOG.md',
  'src/app/bundle-order.json'
].map(hashFile);

const buildFiles = [
  'tools/build-latest-userscript.mjs',
  'tools/check-bundle-order.mjs',
  'tools/validate-release-provenance.mjs'
].map(hashFile);

const deploymentFiles = [
  'vps/api/server.py',
  'vps/api/requirements.txt',
  'vps/ops/slf-server.service',
  'vps/ops/deploy-code.sh',
  'vps/ops/rollback-code.sh',
  'vps/ops/verify_api_deployment.py'
].map(hashFile);

const sourceModules = bundleOrder.files.map(hashFile);
const dependencies = [
  ...parseRequirements('vps/api/requirements.txt', 'pypi'),
  ...parseRequirements('vps/exporter-rag/requirements.txt', 'pypi'),
  ...parseUserscriptRequires()
];

const evidence = {
  schema: 'slf_release_evidence_v1',
  scriptVersion: manifest.scriptVersion,
  releaseChannel: manifest.releaseChannel,
  validationRevision,
  approvedBaseCommit: manifest.build.approvedBaseCommit,
  approvedCommit: manifest.build.approvedCommit,
  approvedFiles: manifest.build.approvedFiles,
  sourceBranch: manifest.build.sourceBranch,
  bundleManifestSha256: manifest.build.bundleManifestSha256,
  bundleFileCount: manifest.build.bundleFileCount,
  deterministicRebuildVerified,
  releaseFiles,
  buildFiles,
  sourceModules,
  deploymentFiles,
  sbom: {
    format: 'SPDX',
    version: '2.3',
    path: 'sbom.spdx.json',
    directDependencyCount: dependencies.length,
    scope: 'direct declared dependencies and userscript @require URLs'
  },
  deploymentBoundary: {
    repositoryDeploymentExecuted: false,
    productionVerificationExecuted: false,
    requiredVerifier: 'vps/ops/verify_api_deployment.py',
    deployedCommitMarker: 'DEPLOYED_GIT_COMMIT',
    note: 'CI evidence is not proof that a VPS deployment or production verification occurred.'
  },
  secretsIncluded: false
};

const created = new Date().toISOString();
const documentNamespace = `https://github.com/MostDef2000/SLF/releases/evidence/${validationRevision}/${manifest.scriptVersion}`;
const packages = dependencies.map((dependency, index) => ({
  name: dependency.name,
  SPDXID: spdxId(dependency.name, index),
  versionInfo: dependency.version,
  downloadLocation: dependency.downloadLocation || 'NOASSERTION',
  filesAnalyzed: false,
  licenseConcluded: 'NOASSERTION',
  licenseDeclared: 'NOASSERTION',
  copyrightText: 'NOASSERTION',
  externalRefs: dependency.ecosystem === 'pypi'
    ? [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: `pkg:pypi/${dependency.name}@${dependency.version}` }]
    : [],
  annotations: [{
    annotationDate: created,
    annotationType: 'OTHER',
    annotator: 'Tool: SLF release evidence generator',
    comment: `Declared by ${dependency.sourceFile}: ${dependency.requirement}`
  }]
}));

const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `SLF-${manifest.scriptVersion}-direct-dependencies`,
  documentNamespace,
  creationInfo: {
    created,
    creators: ['Tool: SLF release evidence generator']
  },
  documentDescribes: packages.map(item => item.SPDXID),
  packages
};

fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(outputDir, 'release-evidence.json');
const sbomPath = path.join(outputDir, 'sbom.spdx.json');
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');

const bundleFiles = [evidencePath, sbomPath].map(filePath => ({
  name: path.basename(filePath),
  sha256: sha256Bytes(fs.readFileSync(filePath))
}));
fs.writeFileSync(
  path.join(outputDir, 'SHA256SUMS'),
  bundleFiles.map(item => `${item.sha256}  ${item.name}`).join('\n') + '\n',
  'utf8'
);

console.log(
  `[release-evidence] generated version=${manifest.scriptVersion} modules=${sourceModules.length} dependencies=${dependencies.length} output=${path.relative(root, outputDir)}`
);
