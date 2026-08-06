#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/modules/tactics-presets/preset-storage.js', 'utf8');
const storage = new Map();
const apiCalls = [];
const context = vm.createContext({
  console,
  CONFIG: { STORAGE_KEY: 'slf_custom_presets', COLLECTIONS: { TACTICS: 'tactics' } },
  BASE_PRESETS: {},
  BASE_LABELS: {},
  DEFAULT_CUSTOM_PRESETS: {},
  debugWarn() {},
  Api: {
    post(path, payload) {
      apiCalls.push({ path, payload });
      return Promise.resolve({});
    },
    get(_collection, onSuccess) {
      onSuccess({});
      return Promise.resolve({});
    }
  },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  }
});

vm.runInContext(
  `${source}\nglobalThis.__presetStorageTest = { normalizePresets, PresetStorage };`,
  context,
  { filename: 'preset-storage.js' }
);

const { normalizePresets, PresetStorage } = context.__presetStorageTest;
const tactic = { def_line: 2, priority: 'attack' };
const maliciousName = `  </option><img id="slf-xss-probe" src=x onerror="globalThis.__slfXss=1">\u0000  `;
const normalized = normalizePresets({
  [maliciousName]: tactic,
  'safe\nname': tactic,
  'A<B': tactic,
  'A＜B': { def_line: 3 },
  ['x'.repeat(200)]: tactic,
  empty: { notATactic: true }
});

const names = Object.keys(normalized);
assert.equal(names.length, 4, names);
for (const name of names) {
  assert.equal(/[&<>"'`\u0000-\u001f\u007f]/.test(name), false, `unsafe preset name survived: ${name}`);
  assert.equal(name, name.trim());
  assert.ok(name.length > 0 && name.length <= 120, name.length);
}
assert.ok(names.some(name => name.includes('＜/option＞＜img')));
assert.ok(names.includes('safe name'));
assert.ok(names.includes('A＜B'));
assert.equal(normalized['A＜B'].def_line, '2', 'first normalized collision must win deterministically');
assert.ok(names.includes('x'.repeat(120)));

storage.set('slf_custom_presets', JSON.stringify({ [maliciousName]: tactic }));
const loaded = PresetStorage.loadLocalRaw();
assert.equal(Object.keys(loaded).length, 1);
const rewrittenText = storage.get('slf_custom_presets');
const rewritten = JSON.parse(rewrittenText);
assert.deepEqual(Object.keys(rewritten), Object.keys(loaded));
assert.equal(rewrittenText.includes('<img'), false);
assert.equal(rewrittenText.includes('onerror="'), false);
assert.equal(rewrittenText.includes('onerror=＂'), true, 'plain text content should be retained with non-markup quotes');
assert.equal(Object.keys(rewritten)[0].includes('<'), false);

PresetStorage.saveCustom({ [maliciousName]: tactic });
await new Promise(resolve => setTimeout(resolve, 0));
assert.ok(apiCalls.some(call => call.path === 'tactics?mode=merge'));
const merge = apiCalls.find(call => call.path === 'tactics?mode=merge');
assert.equal(Object.keys(merge.payload)[0].includes('<'), false);

console.log(`[preset-name-xss-boundary] passed: names=${names.length} storageRewrite=true apiMerge=true`);
