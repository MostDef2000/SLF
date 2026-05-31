#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'releases/latest.user.js');
const OUT = path.join(ROOT, 'src');

const text = fs.readFileSync(SOURCE, 'utf8');
const lines = text.split(/\r?\n/);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFile(relPath, content) {
  const filePath = path.join(ROOT, relPath);
  ensureDir(filePath);
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : content + '\n', 'utf8');
}

function slug(value) {
  return String(value || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'section';
}

function detectHeader(line) {
  const m = String(line).match(/^\s*\/\/\s*((?:\d+(?:\.\d+)?|\d+\.x))\.??\s+(.+?)\s*$/i);
  if (!m) return null;
  return { number: m[1], title: m[2].trim(), raw: line };
}

function routeSection(header, index) {
  const key = `${header.number} ${header.title}`.toLowerCase();
  const title = header.title.toLowerCase();

  if (key.includes('0.') || title.includes('domain helpers')) return 'src/core/domain.js';
  if (title.includes('config') && !title.includes('transfer')) return 'src/core/config.js';
  if (title.includes('transfer analyzer config')) return 'src/modules/transfer-analyzer/config.js';
  if (title.includes('dom') || title.includes('ui mount')) return 'src/core/dom-utils.js';
  if (title.includes('vps api')) return 'src/core/api.js';
  if (title.includes('preset storage')) return 'src/modules/tactics-presets/preset-storage.js';
  if (title.includes('tactic control')) return 'src/modules/tactics-presets/tactic-control-engine.js';
  if (title.includes('match state')) return 'src/modules/live-parser/match-state-parser.js';
  if (title.includes('match stats')) return 'src/modules/live-parser/match-stats-parser.js';
  if (title.includes('lineup') || title.includes('squad')) return 'src/modules/live-parser/squad-parser.js';
  if (title.includes('snapshot')) return 'src/modules/live-parser/snapshot-engine.js';
  if (title.includes('event') || title.includes('effect')) return 'src/modules/live-parser/event-tracker.js';
  if (title.includes('developer hint')) return 'src/modules/strategy-data-recommendations/developer-hint-parser.js';
  if (title.includes('hidden generator advice')) return 'src/modules/strategy-data-recommendations/generator-advice-details-parser.js';
  if (title.includes('expected-performance') || title.includes('strength context')) return 'src/modules/strategy-data-recommendations/generator-expected-performance-and-strength-context.js';
  if (title.includes('dave')) return 'src/modules/strategy-data-recommendations/dave-engine-knowledge.js';
  if (title.includes('tactic preset library')) return 'src/modules/tactics-presets/tactic-preset-library.js';
  if (title.includes('tactical urgency')) return 'src/modules/strategy-data-recommendations/tactical-urgency-model.js';
  if (title.includes('recommendation engine')) return 'src/modules/strategy-data-recommendations/recommendation-engine.js';
  if (title.includes('ui layer')) return 'src/app/ui-layer.js';
  if (title.includes('transfer') || title.includes('market') || title.includes('tm ') || title.includes('slf alter')) return `src/modules/transfer-analyzer/${slug(header.title)}.js`;
  if (title.includes('youth') || title.includes('team4') || title.includes('loan') || title.includes('training') || title.includes('career') || title.includes('status')) return `src/modules/team-management/${slug(header.title)}.js`;
  if (title.includes('bootstrap') || title.includes('init')) return 'src/app/bootstrap.js';
  return `src/modules/uncategorized/${String(index).padStart(3, '0')}-${slug(header.title)}.js`;
}

const metaEndIndex = lines.findIndex(line => line.trim() === '// ==/UserScript==');
if (metaEndIndex < 0) throw new Error('Userscript metadata end marker not found');
const metaBlock = lines.slice(0, metaEndIndex + 1).join('\n');
writeFile('src/app/userscript-header.js', metaBlock);

const sectionStarts = [];
for (let i = metaEndIndex + 1; i < lines.length; i += 1) {
  const header = detectHeader(lines[i]);
  if (header) sectionStarts.push({ index: i, header });
}

if (!sectionStarts.length) throw new Error('No numbered section headers found');

const preamble = lines.slice(metaEndIndex + 1, sectionStarts[0].index).join('\n').trim();
if (preamble) writeFile('src/app/bootstrap-preamble.js', preamble);

const bundleOrder = [];
const moduleRegistry = {};
const appendBuckets = new Map();

for (let n = 0; n < sectionStarts.length; n += 1) {
  const start = sectionStarts[n];
  const end = n + 1 < sectionStarts.length ? sectionStarts[n + 1].index : lines.length;
  const content = lines.slice(start.index, end).join('\n').trimEnd();
  const rel = routeSection(start.header, n);
  const old = appendBuckets.get(rel) || [];
  old.push(content);
  appendBuckets.set(rel, old);
  if (!bundleOrder.includes(rel)) bundleOrder.push(rel);

  const bucket = rel.includes('/transfer-analyzer/') ? 'transfer-analyzer'
    : rel.includes('/team-management/') ? 'team-management'
    : rel.includes('/live-parser/') ? 'strategy-data-recommendations/live-parser'
    : rel.includes('/tactics-presets/') ? 'strategy-data-recommendations/tactics-presets'
    : rel.includes('/strategy-data-recommendations/') ? 'strategy-data-recommendations'
    : rel.includes('/core/') ? 'core'
    : rel.includes('/app/') ? 'app'
    : 'uncategorized';
  moduleRegistry[rel] = { bucket, sourceSection: `${start.header.number} ${start.header.title}` };
}

for (const [rel, chunks] of appendBuckets.entries()) {
  writeFile(rel, chunks.join('\n\n'));
}

writeFile('src/app/bundle-order.json', JSON.stringify({
  schema: 'slf_bundle_order_v1',
  baseline: '4.4.72',
  source: 'releases/latest.user.js',
  note: 'Structural split only. Do not infer business logic changes from file boundaries.',
  files: bundleOrder
}, null, 2));

writeFile('src/app/module-registry.json', JSON.stringify({
  schema: 'slf_module_registry_v1',
  baseline: '4.4.72',
  source: 'releases/latest.user.js',
  modules: moduleRegistry
}, null, 2));

writeFile('src/README.md', `# SLF source baseline 4.4.72\n\nThis directory was generated from \`releases/latest.user.js\` as a structural-only canonical baseline split.\n\nNo module business logic was changed. File boundaries follow \`contracts/**\` ownership rules and are intended for future branch-scoped development.\n`);

console.log(`Wrote ${appendBuckets.size + 4} source files from ${sectionStarts.length} sections.`);
