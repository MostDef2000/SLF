#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const UPDATE_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js';
const DOWNLOAD_URL = 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js';

function p(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(p(rel), 'utf8'); }
function write(rel, text) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), text.endsWith('\n') ? text : text + '\n', 'utf8');
}
function parseVersion(text) {
  const match = text.match(/@version\s+([0-9]+\.[0-9]+\.[0-9]+)/) || text.match(/"scriptVersion"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/);
  return match ? match[1] : '4.4.75';
}
function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}
function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out.sort();
}
function runtimeBlock(version, final = false) {
  const begin = final ? 'BEGIN SLF FINAL RUNTIME VERSION EXPORT' : 'BEGIN SLF RUNTIME VERSION EXPORT';
  const end = final ? 'END SLF FINAL RUNTIME VERSION EXPORT' : 'END SLF RUNTIME VERSION EXPORT';
  return `\n    // ${begin}\n    var SLF_VERSION_INFO = {\n        version: '${version}',\n        scriptVersion: '${version}',\n        releaseChannel: 'github-tampermonkey',\n        updateURL: '${UPDATE_URL}',\n        downloadURL: '${DOWNLOAD_URL}'\n    };\n    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;\n    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {\n        scriptVersion: '${version}',\n        versionInfo: SLF_VERSION_INFO\n    });\n    // ${end}\n`;
}
function sourceForBundle(rel) {
  let text = read(rel).trimEnd();
  if (rel === 'src/app/bootstrap.js') {
    text = text.replace(/\n\s*\}\)\(\);\s*$/u, '');
  }
  return text;
}

const latestExisting = fs.existsSync(p('releases/latest.user.js')) ? read('releases/latest.user.js') : '';
const version = process.env.TARGET_VERSION || bumpPatch(parseVersion(latestExisting || read('src/app/userscript-header.js')));
let header = read('src/app/userscript-header.js').replace(/(@version\s+)[0-9]+\.[0-9]+\.[0-9]+/, `$1${version}`);
if (!header.includes(`@updateURL    ${UPDATE_URL}`)) throw new Error('updateURL mismatch');
if (!header.includes(`@downloadURL  ${DOWNLOAD_URL}`)) throw new Error('downloadURL mismatch');

const order = JSON.parse(read('src/app/bundle-order.json')).files || [];
const files = [];
const seen = new Set();
for (const rel of order) if (fs.existsSync(p(rel))) { files.push(rel); seen.add(rel); }
const teamExtras = jsFiles(p('src/modules/team-management')).filter(rel => !seen.has(rel) && !rel.includes('team4-alter-minutes-strict-link-hotfix.js'));
const idx = files.indexOf('src/modules/team-management/team4-player-status-helper.js');
if (idx >= 0) files.splice(idx + 1, 0, ...teamExtras); else files.push(...teamExtras);
teamExtras.forEach(rel => seen.add(rel));
for (const rel of jsFiles(p('src/modules'))) if (!seen.has(rel) && !rel.includes('team4-alter-minutes-strict-link-hotfix.js')) files.push(rel);

let body = "\n(function () {\n    'use strict';\n" + runtimeBlock(version, false);
for (const rel of files) body += `\n\n// >>> ${rel}\n${sourceForBundle(rel)}\n// <<< ${rel}\n`;
body += runtimeBlock(version, true) + '\n})();\n';
const userscript = `${header.trimEnd()}\n${body}`;

write('releases/latest.user.js', userscript);
write('releases/latest.meta.js', userscript.slice(0, userscript.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length));
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
    bundleOrder: 'src/app/bundle-order.json',
    approvedCommit: process.env.APPROVED_COMMIT || '',
    approvedFiles: (process.env.APPROVED_FILES || '').split(',').map(s => s.trim()).filter(Boolean)
  }
}, null, 2));

let changelog = fs.existsSync(p('CHANGELOG.md')) ? read('CHANGELOG.md') : '# Changelog\n';
if (!changelog.includes(`## ${version}`)) {
  const summary = process.env.RELEASE_SUMMARY || 'Latest-only userscript build from src/**.';
  const entry = `# Changelog\n\n## ${version}\n\n- ${summary}\n- Updated latest-only Tampermonkey artifacts from src/**.\n- No archive userscript file created.\n- Preserved Tampermonkey update/download URLs.\n\n`;
  changelog = changelog.startsWith('# Changelog\n') ? entry + changelog.slice('# Changelog\n'.length).replace(/^\n+/, '') : entry + '\n' + changelog;
  write('CHANGELOG.md', changelog);
}

if (userscript.includes('Team4AlterMinutesStrictLinkHotfix')) throw new Error('obsolete strict hotfix module still bundled');
if (userscript.includes('team4-alter-minutes-strict-link-hotfix.js')) throw new Error('obsolete strict hotfix bundle reference remains');
if (!userscript.includes('Team4AlterCurrentSeasonMinutesBridge')) throw new Error('Team4 alter minutes bridge missing');
if (!userscript.includes('slf_team4_current_season_minutes_v5')) throw new Error('Team4 schema v5 missing');
if (!userscript.includes('refreshTeam4AlterMinutes')) throw new Error('Team4 refresh workflow missing');
if (!userscript.includes(`scriptVersion: '${version}'`)) throw new Error('runtime version missing');
if (!userscript.includes('BEGIN SLF FINAL RUNTIME VERSION EXPORT')) throw new Error('final runtime export missing');
if (!userscript.includes(`@version      ${version}`)) throw new Error('version mismatch');
if (fs.existsSync(p(`releases/SLF_${version.replace(/\./g, '_')}.user.js`))) throw new Error('forbidden archive exists');
execFileSync('node', ['--check', 'releases/latest.user.js'], { stdio: 'inherit' });
console.log(`Built SLF ${version} latest-only from ${files.length} source files.`);
