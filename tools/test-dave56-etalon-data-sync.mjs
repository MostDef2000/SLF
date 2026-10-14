#!/usr/bin/env node
// SLF issue #348 — Dave 5.6 etalon data + canonical mirror sync contract.
//   - tools/sync-dave56-etalon.mjs --check must exit 0 (spawned, not imported,
//     so the real CLI contract is exercised);
//   - the runtime data module must carry schema 'slf_dave56_etalon_v1' with
//     exactly 12 defense + 12 buildup situations + 6 scenarios;
//   - the checked-in mirror data/tactics/dave56-etalon-v1.json must exist,
//     parse, and carry the same etalon tables as the runtime module.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// --- (a) the sync validator exits 0 in --check mode ---------------------------
const run = spawnSync(process.execPath, [path.join(root, 'tools/sync-dave56-etalon.mjs'), '--check'], {
  cwd: root,
  encoding: 'utf8'
});
assert.equal(run.status, 0, `sync-dave56-etalon --check must pass; stderr: ${run.stderr}`);
assert.match(run.stdout, /\[dave56-etalon\] ok: data\/tactics\/dave56-etalon-v1\.json in sync/, 'sync tool reports the mirror as in sync');
assert.match(run.stdout, /24 situations, 6 scenarios/, 'sync tool counts 24 situations + 6 scenarios');

// --- (b) runtime data module schema + tables ----------------------------------
const sandbox = {
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'src/modules/strategy-data-recommendations/dave56-etalon-data.js'), 'utf8'),
  sandbox,
  { filename: 'dave56-etalon-data.js' }
);
const data = sandbox.window.SLFDave56EtalonData;
assert.ok(data, 'data module installs window.SLFDave56EtalonData');
assert.equal(data.schema, 'slf_dave56_etalon_v1', 'data module schema is pinned');

jeq(Object.keys(data.defense), ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'd12'], 'exactly 12 defense situations d1..d12');
jeq(Object.keys(data.buildup), ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11', 'b12'], 'exactly 12 buildup situations b1..b12');
jeq(Object.keys(data.scenarios), ['s1', 's2', 's3', 's4', 's5', 's6'], 'exactly 6 score-play scenarios s1..s6');
assert.equal(Object.keys(data.defense).length, 12);
assert.equal(Object.keys(data.buildup).length, 12);
assert.equal(Object.keys(data.scenarios).length, 6);

jeq(data.controlOrder, {
  defense: ['def_line', 'press_line', 'def_width', 'press_intense'],
  buildup: ['build_type', 'build_temp', 'build_long', 'build_fast', 'style']
}, 'canonical control order per block (etalon never touches pass_risk/dribble/cross/corner/shot)');

for (const [block, keys] of [['defense', data.controlOrder.defense], ['buildup', data.controlOrder.buildup]]) {
  for (const [id, situation] of Object.entries(data[block])) {
    assert.equal(situation.id, id, `${block}.${id}: id field matches the key`);
    assert.ok(typeof situation.label === 'string' && situation.label.length > 0, `${block}.${id}: label present`);
    assert.ok(situation.words && typeof situation.words === 'object', `${block}.${id}: words present`);
    for (const [key, words] of Object.entries(situation.words)) {
      assert.ok(keys.includes(key), `${block}.${id}: word key '${key}' must be in the canonical control order`);
      assert.ok(Array.isArray(words) && words.length >= 1 && words.length <= 2, `${block}.${id}.${key}: slot holds 1-2 words (slash pair = one slot)`);
    }
  }
}
for (const id of Object.keys(data.buildup)) {
  assert.ok(typeof data.buildup[id].lanes === 'string' && data.buildup[id].lanes.trim(), `buildup.${id}: lane word present`);
}

// Scenario references and calibration constants (provisional markers).
assert.equal(data.scenarios.s1.override.defense, 'd5', 's1 overrides to d5');
assert.equal(data.scenarios.s1.override.buildup, 'b5', 's1 overrides to b5');
assert.equal(data.scenarios.s2.overrideMinute, 60, 's2 gates the сушка override at minute 60');
assert.equal(data.scenarios.s2.override.defense, 'd5');
assert.equal(data.scenarios.s2.override.buildup, 'b5');
assert.equal(data.scenarios.s4.lateMinute, 80, 's4 late «навал» threshold');
assert.equal(data.scenarios.s5.override.buildup, 'b5');
jeq(data.scenarios.s6.forceBase, { defense: 'd1', buildup: 'b1' }, 's6 forces the equal-match base before its style delta');
assert.ok(data.calibration && typeof data.calibration === 'object', 'calibration constants present');
assert.equal(data.provenance.provisional, true, 'provenance marks the tables provisional pending match evidence');

// --- (c) canonical mirror JSON -------------------------------------------------
const mirrorPath = path.join(root, 'data/tactics/dave56-etalon-v1.json');
assert.ok(fs.existsSync(mirrorPath), 'mirror data/tactics/dave56-etalon-v1.json exists');
const mirror = JSON.parse(fs.readFileSync(mirrorPath, 'utf8'));
assert.equal(mirror.schema, 'slf_dave56_etalon_v1', 'mirror schema matches the runtime schema');
assert.equal(mirror.generatedFrom, 'src/modules/strategy-data-recommendations/dave56-etalon-data.js', 'mirror names its generator source');
assert.equal(mirror.generator, 'tools/sync-dave56-etalon.mjs', 'mirror names its generator tool');
assert.equal(Object.keys(mirror.etalon.defense).length, 12, 'mirror carries 12 defense situations');
assert.equal(Object.keys(mirror.etalon.buildup).length, 12, 'mirror carries 12 buildup situations');
assert.equal(Object.keys(mirror.etalon.scenarios).length, 6, 'mirror carries 6 scenarios');
jeq(mirror.etalon.defense, data.defense, 'mirror defense tables equal the runtime module');
jeq(mirror.etalon.buildup, data.buildup, 'mirror buildup tables equal the runtime module');
jeq(mirror.etalon.scenarios, data.scenarios, 'mirror scenarios equal the runtime module');
jeq(mirror.etalon.wordMap, data.wordMap, 'mirror wordMap equals the runtime module');
jeq(mirror.etalon.domains, data.domains, 'mirror domains equal the runtime module');
jeq(mirror.etalon.laneWords, data.laneWords, 'mirror laneWords equal the runtime module');

console.log('dave56 etalon data + mirror sync contract: OK');
