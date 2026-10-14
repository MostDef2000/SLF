#!/usr/bin/env node
// SLF issue #348 — Dave 5.6 etalon word→ordinal mapping contract.
// Pins the mapping decisions verified with the implementation:
//   - per-domain word→ordinal tables (live-verified control domains);
//   - conservative slash-pair resolution = MIN ordinal on the domain's
//     defensive axis (Обычный/атака→Обычный=3, Средняя/высокая→Средняя,
//     Низкий/средний→Низкий, Широкая/средняя→средняя); alternate = MAX;
//   - unknown word → null + flag (omitted from the vector);
//   - clamping to the inclusive domain of each control;
//   - lane resolution: «фланги»→[left,right], «фланг + центр»→
//     [left,center,right], «центр»→[center], «все направления»→omit,
//     ambiguous pairs/«по силе команд»→null + ambiguous flag;
//   - pickVector composition for d5/b5 (press_intense 2, style 1 = Защ+).
// vm harness loads ONLY the data + mapping modules (same pattern as
// tools/sync-dave56-etalon.mjs and tools/test-tactic-bridge-v10.mjs).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const sandbox = {
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const rel of [
  'src/modules/strategy-data-recommendations/dave56-etalon-data.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-mapping.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
}

const data = sandbox.window.SLFDave56EtalonData;
const mapping = sandbox.window.SLFDave56EtalonMapping;
assert.ok(data && mapping, 'data + mapping modules installed window globals');
assert.equal(mapping.schema, 'slf_dave56_etalon_v1', 'mapping binds to the v1 etalon schema');

// --- (1) word→ordinal per domain (live-verified tables) ----------------------
const EXPECTED_WORD_MAP = {
  def_line: { 'низкая': 1, 'средняя': 2, 'высокая': 3 },
  press_line: { 'низкая': 1, 'низкий': 1, 'средняя': 2, 'средний': 2, 'высокая': 3, 'высокий': 3 },
  def_width: { 'узкая': 1, 'средняя': 2, 'широкая': 3 },
  press_intense: { 'мин': 1, 'низкая': 2, 'средняя': 3, 'высокая': 4, 'макс': 5 },
  build_type: { 'выносы': 1, 'смешанный': 2, 'позиционный': 3 },
  build_temp: { 'низкий': 1, 'средний': 2, 'высокий': 3 },
  build_long: { 'редко': 1, 'умеренно': 2, 'часто': 3 },
  build_fast: { 'редко': 1, 'умеренно': 2, 'часто': 3 },
  style: { 'защ+': 1, 'защита+': 1, 'защита': 2, 'обычный': 3, 'атака': 4, 'атака+': 5 }
};
jeq(data.wordMap, EXPECTED_WORD_MAP, 'wordMap tables are pinned');
for (const [key, words] of Object.entries(EXPECTED_WORD_MAP)) {
  for (const [word, ordinal] of Object.entries(words)) {
    assert.equal(mapping.lookupWord(key, word), ordinal, `lookupWord(${key}, ${word})`);
    assert.equal(mapping.lookupWord(key, `  ${word.toUpperCase()} `), ordinal, `lookupWord normalizes case/whitespace: ${key}:${word}`);
  }
}
// Style axis 1…5 (ЗАЩ+=1 … АТАКА+=5; control domains verified live).
assert.equal(mapping.lookupWord('style', 'Защ+'), 1);
assert.equal(mapping.lookupWord('style', 'АТАКА+'), 5);

// --- (2) unknown word → null -------------------------------------------------
assert.equal(mapping.lookupWord('def_line', 'турбо'), null, 'unknown word is null, never a guess');
assert.equal(mapping.lookupWord('no_such_domain', 'средняя'), null, 'unknown control key is null');
assert.equal(mapping.lookupWord('def_line', ''), null, 'empty word is null');

// --- (3) clamp to the inclusive domains --------------------------------------
jeq(data.domains, {
  def_line: [1, 3], press_line: [1, 3], def_width: [1, 3], press_intense: [1, 5],
  build_type: [1, 3], build_temp: [1, 3], build_long: [1, 3], build_fast: [1, 3], style: [1, 5]
}, 'live-verified control domains (def_line/press_line/def_width 1-3, press_intense 1-5, build_* 1-3, style 1-5)');
assert.equal(mapping.clamp('def_line', 9), 3, 'clamp to domain max');
assert.equal(mapping.clamp('style', -2), 1, 'clamp to domain min');
assert.equal(mapping.clamp('press_intense', 4.6), 5, 'clamp rounds into the domain');
assert.equal(mapping.clamp('build_temp', 2.4), 2, 'rounds to nearest ordinal');
assert.equal(mapping.clamp('def_line', 'abc'), null, 'non-finite input is not clamped, it is rejected');
assert.equal(mapping.clamp('unknown_domain', 2), null, 'unknown domain clamps to null');

// --- (4) slash pairs: conservative = MIN ordinal, alternate = MAX ------------
// d2 def_width «Широкая / средняя» →保守 Средняя=2 / alternate Широкая=3.
const d2cons = mapping.mapWords(data.defense.d2, 'defense', { conservative: true });
assert.equal(d2cons.vector.def_width, 2, 'conservative Широкая/средняя → средняя=2');
assert.equal(d2cons.vector.press_intense, 3, 'conservative Средняя/высокая → Средняя=3');
jeq(d2cons.unknownWords, [], 'resolvable pairs are not flagged');
const d2alt = mapping.mapWords(data.defense.d2, 'defense', { conservative: false });
assert.equal(d2alt.vector.def_width, 3, 'alternate Широкая/средняя → Широкая=3');
assert.equal(d2alt.vector.press_intense, 4, 'alternate Средняя/высокая → высокая=4');
// d3 press_line «Низкий / средний» → Низкий=1 / средний=2.
assert.equal(mapping.mapWords(data.defense.d3, 'defense').vector.press_line, 1, 'conservative Низкий/средний → Низкий=1');
assert.equal(mapping.mapWords(data.defense.d3, 'defense', { conservative: false }).vector.press_line, 2, 'alternate Низкий/средний → средний=2');
// b2 style «Обычный / атака» → Обычный=3 / атака=4.
assert.equal(mapping.mapWords(data.buildup.b2, 'buildup').vector.style, 3, 'conservative Обычный/атака → Обычный=3');
assert.equal(mapping.mapWords(data.buildup.b2, 'buildup', { conservative: false }).vector.style, 4, 'alternate Обычный/атака → атака=4');
// d5 press_intense «Средняя / низкая» → Низкая=2 (min wins regardless of word order).
assert.equal(mapping.mapWords(data.defense.d5, 'defense').vector.press_intense, 2, 'conservative picks MIN even when the aggressive word is listed first');
// resolved pair metadata keeps both candidate words for the alternate view.
jeq(d2cons.resolved.def_width, { preferred: 2, alternateWords: ['Широкая', 'средняя'] }, 'resolved pair exposes preferred ordinal + both words');

// --- (5) mapWords unknown handling ------------------------------------------
const synth = mapping.mapWords({ words: { def_line: ['Гипер'], press_line: ['Средний'] } }, 'defense');
jeq(synth.vector, { press_line: 2 }, 'unknown word is omitted from the vector');
jeq(synth.unknownWords, ['def_line:Гипер'], 'unknown word is flagged key:words');
const mixedPair = mapping.mapWords({ words: { def_width: ['Турбо', 'Средняя'] } }, 'defense');
assert.equal(mixedPair.vector.def_width, 2, 'pair with one unresolvable word resolves the known word');
jeq(mixedPair.unknownWords, [], 'resolved pair with a skipped word is not flagged');
const deadPair = mapping.mapWords({ words: { def_width: ['Турбо', 'Мега'] } }, 'defense');
assert.equal(deadPair.vector.def_width, undefined, 'pair with no resolvable word yields no ordinal');
jeq(deadPair.unknownWords, ['def_width:Турбо/Мега'], 'unresolvable pair is flagged');
jeq(mapping.mapWords(null, 'defense'), { vector: {}, resolved: {}, unknownWords: [] }, 'null situation maps to empty');
jeq(mapping.mapWords({ id: 'x', label: 'no words' }, 'defense').vector, {}, 'situation without words maps to empty');

// --- (6) resolveLanes ---------------------------------------------------------
jeq(mapping.resolveLanes('фланги'), { defined: true, lanes: ['left', 'right'], ambiguous: false }, '«фланги» → [left,right]');
jeq(mapping.resolveLanes(' Фланги '), { defined: true, lanes: ['left', 'right'], ambiguous: false }, 'lane words normalize case/whitespace');
jeq(mapping.resolveLanes('фланг + центр'), { defined: true, lanes: ['left', 'center', 'right'], ambiguous: false }, '«фланг + центр» → all three');
jeq(mapping.resolveLanes('центр'), { defined: true, lanes: ['center'], ambiguous: false }, '«центр» → [center]');
jeq(mapping.resolveLanes('все направления'), { defined: false, lanes: null, ambiguous: false }, '«все направления» omits priority entirely (all enabled), not ambiguous');
jeq(mapping.resolveLanes('по силе команд'), { defined: false, lanes: null, ambiguous: true }, '«по силе команд» is ambiguous → null + flag');
jeq(mapping.resolveLanes('фланги / фланг+центр'), { defined: false, lanes: null, ambiguous: true }, 'slash-pair lane word is ambiguous');
jeq(mapping.resolveLanes('все направления / центр'), { defined: false, lanes: null, ambiguous: true }, '«все направления / центр» is ambiguous');
jeq(mapping.resolveLanes('левый фланг'), { defined: false, lanes: null, ambiguous: true }, 'unknown lane word is ambiguous, never guessed');
jeq(mapping.resolveLanes(''), { defined: false, lanes: null, ambiguous: false }, 'empty lane word omits priority');
jeq(mapping.resolveLanes(null), { defined: false, lanes: null, ambiguous: false }, 'null lane word omits priority');

// --- (7) pickVector composition ----------------------------------------------
const d5b5 = mapping.pickVector({ defense: 'd5', buildup: 'b5' }, { conservative: true });
jeq(d5b5.defenseVector, { def_line: 1, press_line: 1, def_width: 1, press_intense: 2 }, 'd5 conservative vector');
jeq(d5b5.buildupVector, { build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1 }, 'b5 conservative vector');
assert.equal(d5b5.defenseVector.press_intense, 2, 'd5/b5 → press_intense 2');
assert.equal(d5b5.buildupVector.style, 1, 'd5/b5 → style 1 (Защ+)');
jeq(d5b5.priorityLanes, ['left', 'right'], 'b5 lanes «фланги»');
assert.equal(d5b5.priorityDefined, true);
jeq(d5b5.mergedVector, Object.assign({}, d5b5.defenseVector, d5b5.buildupVector), 'merged = defense ⊎ buildup');
jeq(d5b5.labels, { defense: 'd5 Нужно удержать', buildup: 'b5 Нужно удержать' }, 'labels carry id + situation name');
jeq(d5b5.unknownWords, [], 'd5/b5 fully resolves');
const d5b5alt = mapping.pickVector({ defense: 'd5', buildup: 'b5' }, { conservative: false });
assert.equal(d5b5alt.defenseVector.press_intense, 3, 'alternate d5 press_intense → 3');
assert.equal(d5b5alt.buildupVector.style, 2, 'alternate b5 style Защита/защита+ → 2');
const b2d2alt = mapping.pickVector({ defense: 'd2', buildup: 'b2' }, { conservative: false });
assert.equal(b2d2alt.defenseVector.def_width, 3, 'alternate d2 def_width → Широкая=3');
assert.equal(b2d2alt.buildupVector.build_fast, 3, 'alternate b2 build_fast → часто=3');
assert.equal(b2d2alt.buildupVector.style, 4, 'alternate b2 style → атака=4');
const b2d2cons = mapping.pickVector({ defense: 'd2', buildup: 'b2' }, { conservative: true });
assert.equal(b2d2cons.defenseVector.def_width, 2, 'conservative d2 def_width → средняя=2');
assert.equal(b2d2cons.buildupVector.build_fast, 2, 'conservative b2 build_fast → умеренно=2');
assert.equal(b2d2cons.buildupVector.style, 3, 'conservative b2 style → обычный=3');

// b6 style «По силе команд» is the documented unknown: omitted + flagged.
const b6 = mapping.pickVector({ buildup: 'b6' });
jeq(Object.keys(b6.buildupVector), ['build_type', 'build_temp', 'build_long', 'build_fast'], 'b6 omits style entirely');
assert.ok(b6.unknownWords.includes('style:По силе команд'), 'b6 unknown style is flagged');
jeq(b6.priorityLanes, ['left', 'right'], 'b6 lanes «фланги»');

// lane-less situations omit priority; null ids produce empty picks.
const b1 = mapping.pickVector({ buildup: 'b1' });
assert.equal(b1.priorityLanes, null, '«все направления» → no lane array');
assert.equal(b1.priorityDefined, false);
const empty = mapping.pickVector({ defense: null, buildup: null });
jeq(empty.defenseVector, {}, 'null defense id → empty vector');
jeq(empty.buildupVector, {}, 'null buildup id → empty vector');
jeq(empty.labels, { defense: null, buildup: null }, 'null ids have no labels');
assert.equal(empty.priorityLanes, null);
assert.equal(empty.priorityDefined, false);

// b10 is representable at the mapping level (the LAYER never matches it —
// pinned in test-dave56-etalon-matcher.mjs).
const b10 = mapping.pickVector({ buildup: 'b10' });
assert.equal(b10.buildupVector.build_type, 1, 'b10 Выносы=1');
assert.equal(b10.buildupVector.style, 2, 'b10 conservative style Обычный/защита → защита=2');

console.log('dave56 etalon mapping: word→ordinal, conservative/alternate pairs, clamping, lanes, pickVector: OK');
