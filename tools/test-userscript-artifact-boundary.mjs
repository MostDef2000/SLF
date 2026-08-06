#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const versionPath = 'data/version.json';
const bundleOrderPath = 'src/app/bundle-order.json';
const metaPath = 'releases/latest.meta.js';
const userPath = 'releases/latest.user.js';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parseJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function countOccurrences(source, needle) {
  let count = 0;
  let cursor = 0;

  while (true) {
    const index = source.indexOf(needle, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

function extractUserscriptVersion(source, relativePath) {
  const match = source.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
  assert.ok(match, `${relativePath} must declare a userscript @version`);
  return match[1];
}

function extractRequireUrls(source) {
  return [...source.matchAll(/^\/\/\s*@require\s+(\S+)\s*$/gm)].map(match => match[1]);
}

function assertSha(value, label) {
  assert.match(value || '', /^[0-9a-f]{40}$/i, `${label} must be a 40-character Git SHA`);
}

const manifest = parseJson(versionPath);
const bundleOrder = parseJson(bundleOrderPath);
const metaSource = read(metaPath);
const userSource = read(userPath);

assert.doesNotThrow(
  () => new vm.Script(userSource, { filename: userPath }),
  `${userPath} must be valid JavaScript`
);

assert.equal(manifest.latestMetaJs, metaPath, 'version manifest must point to the canonical metadata artifact');
assert.equal(manifest.latestUserJs, userPath, 'version manifest must point to the canonical userscript artifact');
assert.equal(manifest.latestOnly, true, 'release manifest must remain latest-only');
assert.equal(manifest.archiveCreated, false, 'latest-only releases must not claim an archive was created');
assert.equal(manifest.releaseChannel, 'github-tampermonkey', 'unexpected release channel');
assert.equal(manifest.build?.source, 'src/**', 'release source boundary must remain src/**');
assert.equal(manifest.build?.assembly, 'manifest-only', 'release assembly must remain manifest-only');
assert.equal(manifest.build?.bundleOrder, bundleOrderPath, 'release manifest must identify the canonical bundle order');
assertSha(manifest.build?.approvedBaseCommit, 'build.approvedBaseCommit');
assertSha(manifest.build?.approvedCommit, 'build.approvedCommit');
assert.match(
  manifest.build?.bundleManifestSha256 || '',
  /^[0-9a-f]{64}$/i,
  'build.bundleManifestSha256 must be a SHA-256 digest'
);
assert.ok(
  Array.isArray(manifest.build?.approvedFiles) && manifest.build.approvedFiles.length > 0,
  'build.approvedFiles must contain the reviewed source scope'
);

const expectedStatus = `release_${manifest.scriptVersion.replace(/\./g, '_')}_published`;
assert.equal(manifest.status, expectedStatus, 'release status must match scriptVersion');

const metaVersion = extractUserscriptVersion(metaSource, metaPath);
const userVersion = extractUserscriptVersion(userSource, userPath);
assert.equal(metaVersion, manifest.scriptVersion, 'metadata artifact version must match data/version.json');
assert.equal(userVersion, manifest.scriptVersion, 'userscript artifact version must match data/version.json');

const metaRequires = extractRequireUrls(metaSource);
const userRequires = extractRequireUrls(userSource);
assert.deepEqual(metaRequires, [], 'metadata artifact must not declare external @require dependencies');
assert.deepEqual(userRequires, [], 'userscript artifact must not declare external @require dependencies');
assert.equal(userSource.includes('code.jquery.com'), false, 'userscript artifact must not reference the removed jQuery CDN');
assert.equal(metaSource.includes('code.jquery.com'), false, 'metadata artifact must not reference the removed jQuery CDN');

const runtimeVersions = [...userSource.matchAll(/scriptVersion:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
assert.ok(runtimeVersions.length >= 2, 'userscript must expose both initial and final runtime version metadata');
for (const runtimeVersion of runtimeVersions) {
  assert.equal(runtimeVersion, manifest.scriptVersion, 'runtime scriptVersion must match release manifest');
}

assert.ok(Array.isArray(bundleOrder.files), 'bundle order must define a files array');
assert.ok(bundleOrder.files.length > 0, 'bundle order must not be empty');
assert.equal(new Set(bundleOrder.files).size, bundleOrder.files.length, 'bundle order must not contain duplicate module paths');

const expectedModuleCount = bundleOrder.dependencyAudit?.expectedModuleCount ?? bundleOrder.files.length;
assert.equal(bundleOrder.files.length, expectedModuleCount, 'bundle order file count must match dependency audit');
assert.equal(manifest.build?.bundleFileCount, bundleOrder.files.length, 'release manifest bundle count must match bundle order');
assert.equal(bundleOrder.files.at(-1), 'src/app/bootstrap.js', 'bootstrap must remain the final bundled source module');

let previousMarkerPosition = -1;
for (const file of bundleOrder.files) {
  const marker = `// >>> ${file}`;
  const markerCount = countOccurrences(userSource, marker);
  assert.equal(markerCount, 1, `${userPath} must contain exactly one marker for ${file}`);

  const markerPosition = userSource.indexOf(marker);
  assert.ok(markerPosition > previousMarkerPosition, `${file} is out of bundle order in ${userPath}`);
  previousMarkerPosition = markerPosition;
}

const startupNeedle = 'App.start();';
assert.equal(countOccurrences(userSource, startupNeedle), 1, 'userscript must invoke App.start() exactly once');

const bootstrapMarkerPosition = userSource.indexOf('// >>> src/app/bootstrap.js');
const startupPosition = userSource.indexOf(startupNeedle);
const finalVersionExportPosition = userSource.indexOf('// BEGIN SLF FINAL RUNTIME VERSION EXPORT');

assert.ok(startupPosition > bootstrapMarkerPosition, 'App.start() must occur inside or after the final bootstrap module');
assert.ok(finalVersionExportPosition > startupPosition, 'final runtime version export must occur after App.start()');

const prohibitedLegacyCapabilities = [
  'SnapshotEngine.compactSnapshotForStorage.bind',
  'function persistLiveState',
  'function startLive',
  'liveParserTimer'
];

for (const capability of prohibitedLegacyCapabilities) {
  assert.equal(
    userSource.includes(capability),
    false,
    `published userscript reintroduced prohibited legacy capability: ${capability}`
  );
}

console.log(
  `[userscript-artifact-boundary] passed: version=${manifest.scriptVersion} modules=${bundleOrder.files.length} externalRequires=${userRequires.length}`
);
