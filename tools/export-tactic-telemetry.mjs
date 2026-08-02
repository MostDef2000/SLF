#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const baseUrl = option('--base-url', process.env.SLF_API_URL || 'https://slf-api.mostdef.ru');
const outputDir = option('--output', 'var/tactics/export');
const token = process.env.SLF_API_TOKEN || '';
const collections = ['match_results_v2', 'preset_events_v2', 'preset_effects_v2', 'match_snapshots_v2'];

function fail(message) {
  console.error(`[tactic-export] ${message}`);
  process.exit(1);
}

if (!token) fail('SLF_API_TOKEN is required');

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.items)) return value.items;
  if (value && typeof value === 'object' && Object.keys(value).length) return [value];
  return [];
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
}

async function fetchCollection(collection) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/${collection}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`${collection}: HTTP ${response.status}`);
  const payload = await response.json();
  return { collection, rows: normalizeRows(payload), payloadType: Array.isArray(payload) ? 'array' : typeof payload };
}

const startedAt = new Date().toISOString();
const results = [];
for (const collection of collections) {
  try {
    const result = await fetchCollection(collection);
    results.push({ collection, ok: true, count: result.rows.length, payloadType: result.payloadType });
    const file = path.join(outputDir, `${collection}.json`);
    atomicWrite(file, `${JSON.stringify(result.rows, null, 2)}\n`);
    console.log(`[tactic-export] ${collection}: ${result.rows.length}`);
  } catch (error) {
    results.push({ collection, ok: false, count: 0, error: String(error.message || error) });
  }
}

const manifest = {
  schema: 'slf_tactic_export_manifest_v1',
  startedAt,
  completedAt: new Date().toISOString(),
  baseUrl,
  collections: results
};
atomicWrite(path.join(outputDir, 'export-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const failures = results.filter(item => !item.ok);
if (failures.length) fail(`failed collections: ${failures.map(item => item.collection).join(', ')}`);
