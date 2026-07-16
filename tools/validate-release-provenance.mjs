#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MANIFEST_PATH = 'src/app/bundle-order.json';
const UPDATE_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js';
const DOWNLOAD_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js';
const read = rel => fs.readFileSync(rel, 'utf8');
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const expectedCommit = (process.env.EXPECTED_APPROVED_COMMIT || '').trim().toLowerCase();
const expectedBase = (process.env.EXPECTED_APPROVED_BASE_COMMIT || '').trim().toLowerCase();
const expectedFiles = (process.env.EXPECTED_APPROVED_FILES || '').split('\n').map(value => value.trim()).filter(Boolean);

function fail(message) {
  console.error(`[release-provenance] ${message}`);
  process.exit(1);
}
function assertSha(name, value) {
  if (!/^[0-9a-f]{40}$/.test(value)) fail(`${name} must be a full commit SHA`);
}
function assertExactFiles(name, files) {
  if (!Array.isArray(files) || !files.length) fail(`${name} missing`);
  if (new Set(files).size !== files.length) fail(`${name} contains duplicates`);
  for (const rel of files) {
    if (typeof rel !== 'string' || rel.includes('*') || rel.includes('\\') || path.isAbsolute(rel) || rel.split('/').includes('..')) {
      fail(`${name} contains unsafe or non-exact path: ${rel}`);
    }
  }
}
function versionFromMetadata(text, name) {
  const match = text.match(/@version\s+([0-9]+\.[0-9]+\.[0-9]+)/);
  if (!match) fail(`${name} @version missing`);
  return match[1];
}

const versionManifest = JSON.parse(read('data/version.json'));
const bundleRaw = read(MANIFEST_PATH);
const bundleManifest = JSON.parse(bundleRaw);
const user = read('releases/latest.user.js');
const meta = read('releases/latest.meta.js');
const changelog = read('CHANGELOG.md');
const build = versionManifest.build;

if (!build) fail('build metadata missing');
assertSha('approvedCommit', build.approvedCommit);
assertSha('approvedBaseCommit', build.approvedBaseCommit);
assertExactFiles('approvedFiles', build.approvedFiles);
if (expectedCommit && build.approvedCommit !== expectedCommit) fail(`approvedCommit mismatch: expected ${expectedCommit}, got ${build.approvedCommit}`);
if (expectedBase && build.approvedBaseCommit !== expectedBase) fail(`approvedBaseCommit mismatch: expected ${expectedBase}, got ${build.approvedBaseCommit}`);
if (expectedFiles.length) {
  assertExactFiles('EXPECTED_APPROVED_FILES', expectedFiles);
  const expected = [...expectedFiles].sort();
  const actual = [...build.approvedFiles].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) fail(`approvedFiles mismatch\nexpected: ${expected.join(', ')}\nactual: ${actual.join(', ')}`);
}

if (versionManifest.latestOnly !== true) fail('latestOnly must be true');
if (versionManifest.archiveCreated !== false) fail('archiveCreated must be false');
if (build.source !== 'src/**') fail('build.source mismatch');
if (build.assembly !== 'manifest-only') fail('build.assembly must be manifest-only');
if (build.bundleOrder !== MANIFEST_PATH) fail('bundleOrder path mismatch');
if (bundleManifest.schema !== 'slf_bundle_order_v1') fail('bundle manifest schema mismatch');
if (!Array.isArray(bundleManifest.files) || !bundleManifest.files.length) fail('bundle manifest files missing');
if (build.bundleFileCount !== bundleManifest.files.length) fail('bundleFileCount mismatch');
if (build.bundleManifestSha256 !== sha256(bundleRaw)) fail('bundleManifestSha256 mismatch');

const version = versionManifest.scriptVersion;
if (versionFromMetadata(user, 'latest.user.js') !== version) fail('latest.user.js version mismatch');
if (versionFromMetadata(meta, 'latest.meta.js') !== version) fail('latest.meta.js version mismatch');
if (!user.includes(`scriptVersion: '${version}'`)) fail('runtime version mismatch');
if (!user.includes('BEGIN SLF FINAL RUNTIME VERSION EXPORT')) fail('final runtime export missing');
if (!meta.trimEnd().endsWith('// ==/UserScript==')) fail('latest.meta.js contains runtime content');
for (const [name, text] of [['latest.user.js', user], ['latest.meta.js', meta]]) {
  if (!text.includes(`@updateURL    ${UPDATE_URL}`)) fail(`${name} updateURL mismatch`);
  if (!text.includes(`@downloadURL  ${DOWNLOAD_URL}`)) fail(`${name} downloadURL mismatch`);
}
if (!changelog.includes(`## ${version}`)) fail('changelog version entry missing');
if (!changelog.includes(build.approvedBaseCommit)) fail('changelog approvedBaseCommit missing');
if (!changelog.includes(build.approvedCommit)) fail('changelog approvedCommit missing');
for (const file of build.approvedFiles) if (!changelog.includes(`- ${file}`)) fail(`changelog approved file missing: ${file}`);
if (fs.existsSync(`releases/SLF_${version.replace(/\./g, '_')}.user.js`)) fail('forbidden version archive exists');

console.log(`[release-provenance] OK: ${version} from ${build.approvedCommit}`);
