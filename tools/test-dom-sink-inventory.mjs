#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverDomSinks } from './inventory-dom-sinks.mjs';

const root = process.cwd();
const inventoryPath = path.join(root, 'data/quality/dom-sink-inventory-v1.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const discovered = discoverDomSinks(root);
const allowedClassifications = new Set([
  'clear-only',
  'static-template',
  'escaped-template',
  'normalized-storage-template',
  'constrained-values-template',
  'detached-html-parser'
]);

assert.equal(inventory.schema, 'slf_dom_sink_inventory_v1');
assert.equal(inventory.risk, 'QR-005');
assert.equal(inventory.policy.unregisteredSinkBlocksCI, true);
assert.equal(inventory.policy.staleEntryBlocksCI, true);
assert.equal(inventory.policy.duplicateEntryBlocksCI, true);
assert.equal(inventory.policy.liveUntrustedTextRequiresExecutableEvidence, true);
assert.equal(inventory.policy.detachedParserMustNotAttachSourceDocument, true);
assert.ok(Array.isArray(inventory.requiredEvidence) && inventory.requiredEvidence.length >= 3);
for (const evidencePath of inventory.requiredEvidence) {
  assert.ok(fs.existsSync(path.join(root, evidencePath)), `missing required DOM sink evidence: ${evidencePath}`);
}

assert.equal(inventory.expectedSinkCount, discovered.length, 'expectedSinkCount does not match source discovery');
assert.ok(Array.isArray(inventory.entries));
assert.equal(inventory.entries.length, discovered.length, 'inventory entry count does not match source discovery');

const entryById = new Map();
for (const entry of inventory.entries) {
  assert.equal(typeof entry.id, 'string');
  assert.equal(entryById.has(entry.id), false, `duplicate inventory entry: ${entry.id}`);
  assert.ok(allowedClassifications.has(entry.classification), `${entry.id} has invalid classification`);
  assert.ok(typeof entry.provenance === 'string' && entry.provenance.length >= 8, `${entry.id} missing provenance`);
  assert.ok(typeof entry.control === 'string' && entry.control.length >= 12, `${entry.id} missing control`);
  assert.ok(typeof entry.evidence === 'string' && entry.evidence.length >= 8, `${entry.id} missing evidence`);
  entryById.set(entry.id, entry);
}

const discoveredIds = discovered.map(item => item.id);
const registeredIds = [...entryById.keys()].sort();
assert.deepEqual(registeredIds, [...discoveredIds].sort(), 'DOM sink registry has unregistered or stale entries');

for (const sink of discovered) {
  const entry = entryById.get(sink.id);
  assert.ok(entry, `unregistered DOM sink: ${sink.id}`);

  if (entry.classification === 'clear-only') {
    assert.match(sink.source, /\.innerHTML\s*=\s*['"]{2}\s*;/, `${sink.id} clear-only source is not an empty assignment`);
  }

  if (entry.classification === 'detached-html-parser') {
    assert.equal(sink.type, 'dom-parser-html-call', `${sink.id} detached parser classification used for a live sink`);
    assert.match(sink.source, /new\s+DOMParser\s*\(\)\.parseFromString/, `${sink.id} is not an explicit detached DOMParser call`);
  } else {
    assert.notEqual(sink.type, 'dom-parser-html-call', `${sink.id} DOMParser sink lacks detached classification`);
  }

  if (entry.classification === 'normalized-storage-template') {
    assert.ok(entry.evidence.includes('test-preset-name-xss-boundary.mjs'));
    assert.ok(entry.evidence.includes('test_dom_xss_preset_names.py'));
  }

  if (entry.classification === 'escaped-template' && /page text|match snapshot/i.test(entry.provenance)) {
    assert.ok(entry.evidence.includes('test_dom_xss_page_text.py'), `${sink.id} page-text sink lacks executable evidence`);
  }
}

const counts = {};
for (const entry of inventory.entries) counts[entry.classification] = (counts[entry.classification] || 0) + 1;
assert.equal(counts['detached-html-parser'], 10, 'detached parser count changed without review');
assert.equal(counts['clear-only'], 5, 'clear-only sink count changed without review');
assert.equal(counts['normalized-storage-template'], 1, 'normalized storage sink count changed without review');

console.log(`[dom-sink-registry] passed: sinks=${discovered.length} classes=${JSON.stringify(counts)}`);
