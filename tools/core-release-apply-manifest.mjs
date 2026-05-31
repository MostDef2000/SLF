#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const manifestPath = process.env.RELEASE_MANIFEST || process.argv[2];
if (!manifestPath) throw new Error('RELEASE_MANIFEST path is required');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestPath), 'utf8'));
const latestPath = path.join(ROOT, 'releases/latest.user.js');
const metaPath = path.join(ROOT, 'releases/latest.meta.js');
const modulePath = manifest.changedFiles?.[0];
if (!modulePath) throw new Error('manifest.changedFiles[0] is required');

const updateURL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js';
const downloadURL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js';
const moduleCode = execFileSync('git', ['show', `${manifest.commit}:${modulePath}`], { encoding: 'utf8' }).trimEnd() + '\n';
fs.mkdirSync(path.dirname(path.join(ROOT, modulePath)), { recursive: true });
fs.writeFileSync(path.join(ROOT, modulePath), moduleCode, 'utf8');

let userscript = fs.readFileSync(latestPath, 'utf8');
const from = manifest.fromVersion;
const to = manifest.toVersion;
const archivePath = `releases/SLF_${to.replace(/\./g, '_')}.user.js`;

userscript = userscript.replace(new RegExp(`(@version\\s+)${from.replace(/\./g, '\\.')}\\b`), `$1${to}`);
userscript = userscript.replace(/SLF\.scriptVersion\s*=\s*["'][^"']+["'];?/g, '');
userscript = userscript.replace(/const\s+SLF_VERSION_INFO\s*=\s*\{[\s\S]*?\};\n/g, '');
userscript = userscript.replace(/const\s+SLF_RUNTIME_TARGET\s*=\s*[^;]+;\n/g, '');
userscript = userscript.replace(/var\s+SLF_VERSION_INFO\s*=\s*\{[\s\S]*?\};\n/g, '');
userscript = userscript.replace(/var\s+SLF_RUNTIME_TARGET\s*=\s*[^;]+;\n/g, '');
userscript = userscript.replace(/\/\/ BEGIN SLF RUNTIME VERSION EXPORT[\s\S]*?\/\/ END SLF RUNTIME VERSION EXPORT\n/g, '');
userscript = userscript.replace(/\/\/ BEGIN SLF FINAL RUNTIME VERSION EXPORT[\s\S]*?\/\/ END SLF FINAL RUNTIME VERSION EXPORT\n/g, '');
userscript = userscript.replace(/\/\/ BEGIN SLF CORE RELEASE [\s\S]*?team-management current-season minutes bridge[\s\S]*?\/\/ END SLF CORE RELEASE [^\n]*team-management current-season minutes bridge\n/g, '');

function runtimeBlock(kind) {
  const begin = kind === 'final' ? 'BEGIN SLF FINAL RUNTIME VERSION EXPORT' : 'BEGIN SLF RUNTIME VERSION EXPORT';
  const end = kind === 'final' ? 'END SLF FINAL RUNTIME VERSION EXPORT' : 'END SLF RUNTIME VERSION EXPORT';
  return `\n    // ${begin}\n    var SLF_VERSION_INFO = {\n        version: '${to}',\n        scriptVersion: '${to}',\n        releaseChannel: 'github-tampermonkey',\n        updateURL: '${updateURL}',\n        downloadURL: '${downloadURL}'\n    };\n    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;\n    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {\n        scriptVersion: '${to}',\n        versionInfo: SLF_VERSION_INFO\n    });\n    // ${end}\n`;
}

const useStrictNeedle = "(function () {\n    'use strict';\n";
if (!userscript.includes(useStrictNeedle)) throw new Error('Could not locate userscript IIFE start');
userscript = userscript.replace(useStrictNeedle, useStrictNeedle + runtimeBlock('early'));

const bridgeBlock = `\n\n    // BEGIN SLF CORE RELEASE ${to}: team-management current-season minutes bridge\n${moduleCode}\n    // END SLF CORE RELEASE ${to}: team-management current-season minutes bridge\n`;
const closeIndex = userscript.lastIndexOf('\n})();');
if (closeIndex < 0) throw new Error('Could not locate final IIFE close');
userscript = userscript.slice(0, closeIndex) + bridgeBlock + runtimeBlock('final') + userscript.slice(closeIndex);

if (!userscript.includes(`@version      ${to}`)) throw new Error('Header version not updated');
if (!userscript.includes(`@updateURL    ${updateURL}`)) throw new Error('updateURL missing or changed');
if (!userscript.includes(`@downloadURL  ${downloadURL}`)) throw new Error('downloadURL missing or changed');
if (!userscript.includes('slf_team4_real_minutes_cache_v1')) throw new Error('Team4 minutes cache key missing from bundle');
if (!userscript.includes('findCachedEntryForData')) throw new Error('Team4 bridge linking logic missing from bundle');
if (!userscript.includes('hydrateTeam4Minutes')) throw new Error('Team4 bridge hydration logic missing from bundle');
if (!userscript.includes(`scriptVersion: '${to}'`)) throw new Error('runtime scriptVersion missing');
if (!userscript.includes('BEGIN SLF FINAL RUNTIME VERSION EXPORT')) throw new Error('final runtime version export missing');

fs.writeFileSync(latestPath, userscript, 'utf8');
fs.writeFileSync(path.join(ROOT, archivePath), userscript, 'utf8');
const metaEnd = userscript.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
fs.writeFileSync(metaPath, userscript.slice(0, metaEnd) + '\n', 'utf8');

const versionJson = {
  scriptVersion: to,
  releaseChannel: 'github-tampermonkey',
  archive: archivePath,
  latestMetaJs: 'releases/latest.meta.js',
  latestUserJs: 'releases/latest.user.js',
  status: `release_${to.replace(/\./g, '_')}_published`,
  moduleRelease: manifest
};
fs.writeFileSync(path.join(ROOT, 'data/version.json'), JSON.stringify(versionJson, null, 2) + '\n', 'utf8');

const changelogPath = path.join(ROOT, 'CHANGELOG.md');
let changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n';
if (!changelog.includes(`## ${to}`)) {
  const entry = `# Changelog\n\n## ${to}\n\n- Integrated approved Team Management module release from \`${manifest.commit}\`.\n- Fixed Team4 tooltip linking for alter current-season minutes.\n- Added early and final runtime version exports so \`SLF.scriptVersion\` and \`SLF.versionInfo\` report \`${to}\`.\n- Preserved Tampermonkey update/download URLs.\n\n`;
  changelog = changelog.startsWith('# Changelog\n')
    ? entry + changelog.slice('# Changelog\n'.length).replace(/^\n+/, '')
    : entry + '\n' + changelog;
  fs.writeFileSync(changelogPath, changelog, 'utf8');
}

execFileSync('node', ['--check', 'releases/latest.user.js'], { stdio: 'inherit' });
execFileSync('node', ['--check', archivePath], { stdio: 'inherit' });
execFileSync('node', ['--check', modulePath], { stdio: 'inherit' });
console.log(`Core release ${to} generated from ${manifest.module} ${manifest.commit}`);
