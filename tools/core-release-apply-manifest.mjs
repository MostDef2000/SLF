#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const manifestPath = process.env.RELEASE_MANIFEST || process.argv[2];
if (!manifestPath) throw new Error('RELEASE_MANIFEST path is required');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath), 'utf8'));
const changedFiles = Array.isArray(manifest.changedFiles) ? manifest.changedFiles : [];
if (!changedFiles.length) throw new Error('manifest.changedFiles is required');

const latestPath = path.join(ROOT, 'releases/latest.user.js');
const metaPath = path.join(ROOT, 'releases/latest.meta.js');
const updateURL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js';
const downloadURL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js';
const from = manifest.fromVersion;
const to = manifest.toVersion;
if (!from || !to) throw new Error('manifest.fromVersion and manifest.toVersion are required');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readApprovedFile(filePath) {
  return execFileSync('git', ['show', `${manifest.commit}:${filePath}`], { encoding: 'utf8' }).trimEnd() + '\n';
}

function writeApprovedSource(filePath, code) {
  const target = path.join(ROOT, filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, code, 'utf8');
}

function runtimeBlock(kind) {
  const begin = kind === 'final' ? 'BEGIN SLF FINAL RUNTIME VERSION EXPORT' : 'BEGIN SLF RUNTIME VERSION EXPORT';
  const end = kind === 'final' ? 'END SLF FINAL RUNTIME VERSION EXPORT' : 'END SLF RUNTIME VERSION EXPORT';
  return `\n    // ${begin}\n    var SLF_VERSION_INFO = {\n        version: '${to}',\n        scriptVersion: '${to}',\n        releaseChannel: 'github-tampermonkey',\n        updateURL: '${updateURL}',\n        downloadURL: '${downloadURL}'\n    };\n    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;\n    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {\n        scriptVersion: '${to}',\n        versionInfo: SLF_VERSION_INFO\n    });\n    // ${end}\n`;
}

function moduleBlock(filePath, code) {
  return `\n\n    // BEGIN SLF MODULE: ${filePath}\n${code}\n    // END SLF MODULE: ${filePath}\n`;
}

function removePriorModuleBlock(userscript, filePath) {
  const pattern = new RegExp(`\\n\\n    // BEGIN SLF MODULE: ${escapeRegExp(filePath)}[\\s\\S]*?    // END SLF MODULE: ${escapeRegExp(filePath)}\\n`, 'g');
  return userscript.replace(pattern, '');
}

function insertBeforeFinalExportOrClose(userscript, block) {
  const finalExportIndex = userscript.lastIndexOf('\n    // BEGIN SLF FINAL RUNTIME VERSION EXPORT');
  if (finalExportIndex >= 0) return userscript.slice(0, finalExportIndex) + block + userscript.slice(finalExportIndex);
  const closeIndex = userscript.lastIndexOf('\n})();');
  if (closeIndex < 0) throw new Error('Could not locate final IIFE close');
  return userscript.slice(0, closeIndex) + block + userscript.slice(closeIndex);
}

function findTeam4BridgeEnd(userscript) {
  const explicitModuleEnd = '    // END SLF MODULE: src/modules/team-management/team4-alter-current-season-minutes-fix.js\n';
  const explicitIndex = userscript.indexOf(explicitModuleEnd);
  if (explicitIndex >= 0) return explicitIndex + explicitModuleEnd.length;

  const legacyEndPattern = /\n\s*\/\/ END SLF CORE RELEASE [^\n]*team-management current-season minutes bridge\n/;
  const legacyMatch = userscript.match(legacyEndPattern);
  if (legacyMatch && typeof legacyMatch.index === 'number') return legacyMatch.index + legacyMatch[0].length;

  const symbolIndex = userscript.indexOf('const Team4AlterCurrentSeasonMinutesBridge = (() => {');
  if (symbolIndex < 0) return -1;
  const startCall = userscript.indexOf('Team4AlterCurrentSeasonMinutesBridge.start();', symbolIndex);
  if (startCall < 0) return -1;
  const lineEnd = userscript.indexOf('\n', startCall);
  return lineEnd >= 0 ? lineEnd + 1 : startCall + 'Team4AlterCurrentSeasonMinutesBridge.start();'.length;
}

function insertModule(userscript, filePath, code) {
  const block = moduleBlock(filePath, code);
  if (filePath.endsWith('team4-alter-minutes-strict-link-hotfix.js')) {
    const bridgeEnd = findTeam4BridgeEnd(userscript);
    if (bridgeEnd >= 0) return userscript.slice(0, bridgeEnd) + block + userscript.slice(bridgeEnd);
  }
  return insertBeforeFinalExportOrClose(userscript, block);
}

let userscript = fs.readFileSync(latestPath, 'utf8');
userscript = userscript.replace(new RegExp(`(@version\\s+)${escapeRegExp(from)}\\b`), `$1${to}`);
userscript = userscript.replace(/SLF\.scriptVersion\s*=\s*["'][^"']+["'];?/g, '');
userscript = userscript.replace(/const\s+SLF_VERSION_INFO\s*=\s*\{[\s\S]*?\};\n/g, '');
userscript = userscript.replace(/const\s+SLF_RUNTIME_TARGET\s*=\s*[^;]+;\n/g, '');
userscript = userscript.replace(/var\s+SLF_VERSION_INFO\s*=\s*\{[\s\S]*?\};\n/g, '');
userscript = userscript.replace(/var\s+SLF_RUNTIME_TARGET\s*=\s*[^;]+;\n/g, '');
userscript = userscript.replace(/\/\/ BEGIN SLF RUNTIME VERSION EXPORT[\s\S]*?\/\/ END SLF RUNTIME VERSION EXPORT\n/g, '');
userscript = userscript.replace(/\/\/ BEGIN SLF FINAL RUNTIME VERSION EXPORT[\s\S]*?\/\/ END SLF FINAL RUNTIME VERSION EXPORT\n/g, '');

const useStrictNeedle = "(function () {\n    'use strict';\n";
if (!userscript.includes(useStrictNeedle)) throw new Error('Could not locate userscript IIFE start');
userscript = userscript.replace(useStrictNeedle, useStrictNeedle + runtimeBlock('early'));

for (const filePath of changedFiles) {
  const code = readApprovedFile(filePath);
  writeApprovedSource(filePath, code);
  userscript = removePriorModuleBlock(userscript, filePath);
  userscript = insertModule(userscript, filePath, code);
}

const closeIndex = userscript.lastIndexOf('\n})();');
if (closeIndex < 0) throw new Error('Could not locate final IIFE close');
userscript = userscript.slice(0, closeIndex) + runtimeBlock('final') + userscript.slice(closeIndex);

if (!userscript.includes(`@version      ${to}`)) throw new Error('Header version not updated');
if (!userscript.includes(`@updateURL    ${updateURL}`)) throw new Error('updateURL missing or changed');
if (!userscript.includes(`@downloadURL  ${downloadURL}`)) throw new Error('downloadURL missing or changed');
if (!userscript.includes(`scriptVersion: '${to}'`)) throw new Error('runtime scriptVersion missing');
if (!userscript.includes('BEGIN SLF FINAL RUNTIME VERSION EXPORT')) throw new Error('final runtime version export missing');

for (const filePath of changedFiles) {
  if (!userscript.includes(`BEGIN SLF MODULE: ${filePath}`)) throw new Error(`module block missing for ${filePath}`);
}

if (changedFiles.some(filePath => filePath.includes('team4-alter-minutes-strict-link-hotfix.js'))) {
  const bridgeIndex = userscript.indexOf('Team4AlterCurrentSeasonMinutesBridge');
  const hotfixIndex = userscript.indexOf('Team4AlterMinutesStrictLinkHotfix');
  if (bridgeIndex < 0 || hotfixIndex < 0 || hotfixIndex < bridgeIndex) throw new Error('strict hotfix must be bundled after current-season minutes bridge');
  if (!userscript.includes('Team4AlterMinutesStrictLinkHotfix')) throw new Error('strict hotfix runtime code missing from bundle');
}

fs.writeFileSync(latestPath, userscript, 'utf8');
const metaEnd = userscript.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
fs.writeFileSync(metaPath, userscript.slice(0, metaEnd) + '\n', 'utf8');

const versionJson = {
  schema: 'slf_version_manifest_v2_latest_only',
  scriptVersion: to,
  releaseChannel: 'github-tampermonkey',
  latestOnly: true,
  archiveCreated: false,
  latestMetaJs: 'releases/latest.meta.js',
  latestUserJs: 'releases/latest.user.js',
  status: `release_${to.replace(/\./g, '_')}_published`,
  moduleRelease: manifest
};
fs.writeFileSync(path.join(ROOT, 'data/version.json'), JSON.stringify(versionJson, null, 2) + '\n', 'utf8');

const changelogPath = path.join(ROOT, 'CHANGELOG.md');
let changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n';
if (!changelog.includes(`## ${to}`)) {
  const entry = `# Changelog\n\n## ${to}\n\n- Integrated approved ${manifest.module} module release from \`${manifest.commit}\`.\n- Updated latest-only Tampermonkey release artifacts.\n- No per-version archive userscript file created.\n- Preserved Tampermonkey update/download URLs.\n\n`;
  changelog = changelog.startsWith('# Changelog\n')
    ? entry + changelog.slice('# Changelog\n'.length).replace(/^\n+/, '')
    : entry + '\n' + changelog;
  fs.writeFileSync(changelogPath, changelog, 'utf8');
}

execFileSync('node', ['--check', 'releases/latest.user.js'], { stdio: 'inherit' });
for (const filePath of changedFiles) execFileSync('node', ['--check', filePath], { stdio: 'inherit' });
console.log(`Core release ${to} generated from ${manifest.module} ${manifest.commit}; latest-only artifacts updated; no archive created.`);
