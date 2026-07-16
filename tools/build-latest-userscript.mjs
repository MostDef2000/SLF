#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MANIFEST_PATH = 'src/app/bundle-order.json';
const UPDATE_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js';
const DOWNLOAD_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js';

const p = rel => path.join(ROOT, rel);
const read = rel => fs.readFileSync(p(rel), 'utf8');
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const clean = value => String(value ?? '').replace(/\r/g, '').trim();

function write(rel, text) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function git(...args) {
  return clean(execFileSync('git', args, { encoding: 'utf8' }));
}

function parseVersion(text) {
  const match = text.match(/@version\s+([0-9]+\.[0-9]+\.[0-9]+)/)
    || text.match(/"scriptVersion"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/);
  if (!match) throw new Error('Unable to resolve current script version');
  return match[1];
}

function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Invalid version: ${version}`);
  parts[2] += 1;
  return parts.join('.');
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(/[\n,]+/).map(item => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
}

function assertSha(name, value) {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${name} must be a full commit SHA`);
  return value.toLowerCase();
}

function assertExactPaths(name, values) {
  if (!values.length) throw new Error(`${name} must not be empty`);
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicate paths`);
  for (const rel of values) {
    if (!rel || rel.includes('*') || rel.includes('\\') || path.isAbsolute(rel) || rel.split('/').includes('..')) {
      throw new Error(`${name} contains an unsafe or non-exact path: ${rel}`);
    }
  }
  return values;
}

function resolveProvenance() {
  const approvedCommit = assertSha('APPROVED_COMMIT', clean(process.env.APPROVED_COMMIT) || git('rev-parse', 'HEAD'));
  const approvedBaseCommit = assertSha(
    'APPROVED_BASE_COMMIT',
    clean(process.env.APPROVED_BASE_COMMIT) || git('rev-parse', `${approvedCommit}^`)
  );
  const fallback = git('diff', '--name-only', approvedBaseCommit, approvedCommit);
  const approvedFiles = assertExactPaths('APPROVED_FILES', asArray(process.env.APPROVED_FILES || fallback));
  return { approvedCommit, approvedBaseCommit, approvedFiles };
}

function loadReleaseNotes(provenance) {
  const raw = clean(process.env.RELEASE_NOTES_JSON);
  if (!raw) {
    return {
      provided: false,
      moduleName: 'Automatic latest-only build',
      behaviorChanges: ['Built deterministic latest-only artifacts from the approved source commit.'],
      cacheSchemaStorageKeysChanged: 'NO',
      existingKeysPreserved: [],
      bundleOrderModuleRegistryChangesNeeded: 'NO',
      safetyNotes: ['Generated artifacts are workflow outputs and must not be edited manually.']
    };
  }
  let notes;
  try { notes = JSON.parse(raw); } catch (error) { throw new Error(`RELEASE_NOTES_JSON is invalid: ${error.message}`); }
  if (notes.approvedCommit && clean(notes.approvedCommit).toLowerCase() !== provenance.approvedCommit) {
    throw new Error('Release notes approvedCommit does not match APPROVED_COMMIT');
  }
  if (notes.approvedBaseCommit && clean(notes.approvedBaseCommit).toLowerCase() !== provenance.approvedBaseCommit) {
    throw new Error('Release notes approvedBaseCommit does not match APPROVED_BASE_COMMIT');
  }
  if (notes.changedFiles) {
    const noted = asArray(notes.changedFiles).sort();
    const actual = [...provenance.approvedFiles].sort();
    if (JSON.stringify(noted) !== JSON.stringify(actual)) throw new Error('Release notes changedFiles do not match APPROVED_FILES');
  }
  const behaviorChanges = [
    ...asArray(notes.userVisibleChanges),
    ...asArray(notes.runtimeBehaviorChanges),
    ...asArray(notes.behaviorChanges),
    ...asArray(notes.summary)
  ];
  return {
    provided: true,
    moduleName: clean(notes.moduleName || notes.module || 'Module change'),
    behaviorChanges: behaviorChanges.length ? behaviorChanges : ['Built deterministic latest-only artifacts.'],
    cacheSchemaStorageKeysChanged: clean(notes.cacheSchemaStorageKeysChanged || notes.cacheSchemaStorageChanged || 'NO'),
    existingKeysPreserved: asArray(notes.existingKeysPreserved || notes.existingKeys || notes.storageKeysPreserved),
    bundleOrderModuleRegistryChangesNeeded: clean(notes.bundleOrderModuleRegistryChangesNeeded || notes.bundleOrderChangesNeeded || 'NO'),
    safetyNotes: asArray(notes.safetyNotes)
  };
}

function loadBundleManifest() {
  const raw = read(MANIFEST_PATH);
  const manifest = JSON.parse(raw);
  if (manifest.schema !== 'slf_bundle_order_v1') throw new Error(`Unsupported bundle manifest schema: ${manifest.schema}`);
  const files = assertExactPaths('bundle manifest files', Array.isArray(manifest.files) ? manifest.files : []);
  for (const rel of files) {
    if (!rel.startsWith('src/') || !rel.endsWith('.js')) throw new Error(`Invalid runtime path: ${rel}`);
    if (!fs.existsSync(p(rel))) throw new Error(`Bundle source is missing: ${rel}`);
  }
  return { files, hash: sha256(raw) };
}

function runtimeBlock(version, final = false) {
  const marker = final ? 'FINAL ' : '';
  return `
    // BEGIN SLF ${marker}RUNTIME VERSION EXPORT
    var SLF_VERSION_INFO = {
        version: '${version}',
        scriptVersion: '${version}',
        releaseChannel: 'github-tampermonkey',
        updateURL: '${UPDATE_URL}',
        downloadURL: '${DOWNLOAD_URL}'
    };
    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {
        scriptVersion: '${version}',
        versionInfo: SLF_VERSION_INFO
    });
    // END SLF ${marker}RUNTIME VERSION EXPORT
`;
}

function sourceForBundle(rel) {
  let text = read(rel).trimEnd();
  if (rel === 'src/app/bootstrap.js') text = text.replace(/\n\s*\}\)\(\);\s*$/u, '');
  return text;
}

function formatChangelog(version, provenance, notes) {
  const lines = ['# Changelog', '', `## ${version}`, '', `### ${notes.moduleName}`];
  notes.behaviorChanges.forEach(item => lines.push(`- ${item}`));
  lines.push('', 'Changed files:');
  provenance.approvedFiles.forEach(file => lines.push(`- ${file}`));
  lines.push('', 'Approved base commit:', `- ${provenance.approvedBaseCommit}`);
  lines.push('', 'Approved commit:', `- ${provenance.approvedCommit}`);
  lines.push('', 'Compatibility / storage:');
  lines.push(`- Cache/schema/storage keys changed: ${notes.cacheSchemaStorageKeysChanged}`);
  if (notes.existingKeysPreserved.length) lines.push(`- Existing keys preserved: ${notes.existingKeysPreserved.join(', ')}`);
  lines.push(`- Bundle-order/module-registry changes needed: ${notes.bundleOrderModuleRegistryChangesNeeded}`);
  if (notes.safetyNotes.length) {
    lines.push('', 'Safety notes:');
    notes.safetyNotes.forEach(note => lines.push(`- ${note}`));
  }
  lines.push('', '');
  return lines.join('\n');
}

const provenance = resolveProvenance();
const notes = loadReleaseNotes(provenance);
const bundle = loadBundleManifest();
const latestExisting = fs.existsSync(p('releases/latest.user.js')) ? read('releases/latest.user.js') : read('src/app/userscript-header.js');
const version = clean(process.env.TARGET_VERSION) || bumpPatch(parseVersion(latestExisting));
let header = read('src/app/userscript-header.js').replace(/(@version\s+)[0-9]+\.[0-9]+\.[0-9]+/, `$1${version}`);
if (!header.includes(`@updateURL    ${UPDATE_URL}`)) throw new Error('updateURL mismatch');
if (!header.includes(`@downloadURL  ${DOWNLOAD_URL}`)) throw new Error('downloadURL mismatch');

let body = "\n(function () {\n    'use strict';\n" + runtimeBlock(version);
for (const rel of bundle.files) body += `\n\n// >>> ${rel}\n${sourceForBundle(rel)}\n// <<< ${rel}\n`;
body += runtimeBlock(version, true) + '\n})();\n';
const userscript = `${header.trimEnd()}\n${body}`;
const metadataEnd = userscript.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
if (metadataEnd < '// ==/UserScript=='.length) throw new Error('Userscript metadata terminator missing');

write('releases/latest.user.js', userscript);
write('releases/latest.meta.js', userscript.slice(0, metadataEnd));
write('data/version.json', JSON.stringify({
  schema: 'slf_version_manifest_v3_latest_only_build_from_src',
  scriptVersion: version,
  releaseChannel: 'github-tampermonkey',
  latestOnly: true,
  archiveCreated: false,
  latestMetaJs: 'releases/latest.meta.js',
  latestUserJs: 'releases/latest.user.js',
  status: `release_${version.replace(/\./g, '_')}_published`,
  build: {
    source: 'src/**',
    assembly: 'manifest-only',
    bundleOrder: MANIFEST_PATH,
    bundleManifestSha256: bundle.hash,
    bundleFileCount: bundle.files.length,
    approvedBaseCommit: provenance.approvedBaseCommit,
    approvedCommit: provenance.approvedCommit,
    approvedFiles: provenance.approvedFiles,
    sourceBranch: clean(process.env.SOURCE_BRANCH || ''),
    releaseNotesProvided: notes.provided,
    releaseNotesModule: notes.moduleName
  }
}, null, 2));

let changelog = fs.existsSync(p('CHANGELOG.md')) ? read('CHANGELOG.md') : '# Changelog\n';
if (!changelog.includes(`## ${version}`)) {
  const entry = formatChangelog(version, provenance, notes);
  changelog = changelog.startsWith('# Changelog\n')
    ? entry + changelog.slice('# Changelog\n'.length).replace(/^\n+/, '')
    : `${entry}\n${changelog}`;
  write('CHANGELOG.md', changelog);
}

if (!userscript.includes(`scriptVersion: '${version}'`)) throw new Error('runtime version missing');
if (!userscript.includes('BEGIN SLF FINAL RUNTIME VERSION EXPORT')) throw new Error('final runtime export missing');
if (!userscript.includes(`@version      ${version}`)) throw new Error('userscript version mismatch');
if (fs.existsSync(p(`releases/SLF_${version.replace(/\./g, '_')}.user.js`))) throw new Error('forbidden version archive exists');
execFileSync('node', ['--check', 'releases/latest.user.js'], { stdio: 'inherit' });
console.log(`Built SLF ${version} latest-only from ${bundle.files.length} manifest-registered source files.`);
