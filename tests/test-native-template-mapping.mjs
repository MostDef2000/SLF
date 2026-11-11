#!/usr/bin/env node
// #409 wave 1: NativeTemplateMapping — the strict 17-key mapping between
// plugin preset vectors (14 decimal-string controls + priority array) and
// native site template data (17 numeric fields incl. priority_l/c/r).
// Proves: exact key surface/domains, numeric-string coercion, rejection
// classes, all 8 priority combinations, [] <-> 0/0/0 round-trip, unknown
// priority member rejection, incomplete-vector rejection, item normalization.
// No network, no page: the mapping is pure.
// (Values crossing the vm realm are JSON-cloned: cross-realm prototypes
// would fail deepStrictEqual even on identical content.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
    path.join(root, 'src/modules/tactics-presets/native-template-api.js'),
    'utf8'
);

const context = {
    console: { warn: () => {}, log: () => {}, error: () => {} },
    Date, JSON, Promise, setTimeout, clearTimeout,
    location: { pathname: '/team4.php?action=tactic' }
};
context.unsafeWindow = context;
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
    `${source}\n;globalThis.__M = NativeTemplateMapping;`,
    context,
    { filename: 'native-template-api.js' }
);
const raw = context.__M;
const clone = value => JSON.parse(JSON.stringify(value));
const M = {
    CONTROL_DOMAINS: clone(raw.CONTROL_DOMAINS),
    CONTROL_KEYS: clone(raw.CONTROL_KEYS),
    PRIORITY_DIRECTIONS: clone(raw.PRIORITY_DIRECTIONS),
    SITE_DATA_KEYS: clone(raw.SITE_DATA_KEYS),
    siteDataToPluginVector: d => clone(raw.siteDataToPluginVector(d)),
    pluginVectorToSiteData: v => clone(raw.pluginVectorToSiteData(v)),
    pluginVectorsEqual: (a, b) => raw.pluginVectorsEqual(a, b),
    siteItemToInventoryItem: r => clone(raw.siteItemToInventoryItem(r))
};

// ---- 1. Exact 17-key surface ------------------------------------------------
const EXPECTED_CONTROLS = [
    'def_line', 'press_line', 'def_width', 'press_intense',
    'build_type', 'build_temp', 'build_long', 'build_fast',
    'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
];
const EXPECTED_DOMAINS = {
    def_line: [1, 3], press_line: [1, 3], def_width: [1, 3],
    press_intense: [1, 5], build_type: [1, 3], build_temp: [1, 3],
    build_long: [1, 3], build_fast: [1, 3], style: [1, 5],
    pass_risk: [1, 5], dribble: [1, 5], cross: [1, 3],
    corner: [1, 2], shot: [1, 3]
};

assert.deepEqual(M.CONTROL_DOMAINS, EXPECTED_DOMAINS, 'control domains must match the verified site domains');
assert.deepEqual(M.CONTROL_KEYS, EXPECTED_CONTROLS, '14 control keys in canonical order');
assert.deepEqual(M.PRIORITY_DIRECTIONS, ['left', 'center', 'right'], 'priority directions');
assert.deepEqual(
    M.SITE_DATA_KEYS,
    EXPECTED_CONTROLS.concat(['priority_l', 'priority_c', 'priority_r']),
    'site data is exactly the 14 controls + 3 priority bits (17 keys)'
);
assert.equal(M.SITE_DATA_KEYS.length, 17, '17 site data keys');

// ---- 2. site -> plugin: valid data, coercion --------------------------------
const fullSiteData = {
    def_line: 2, press_line: 3, def_width: 1, press_intense: 4,
    build_type: 1, build_temp: 2, build_long: 3, build_fast: 1,
    style: 5, pass_risk: 2, dribble: 5, cross: 1, corner: 2, shot: 3,
    priority_l: 1, priority_c: 0, priority_r: 1
};
const toVector = M.siteDataToPluginVector(fullSiteData);
assert.equal(toVector.ok, true, `valid site data must convert: ${toVector.message || ''}`);
for (const key of EXPECTED_CONTROLS) {
    assert.equal(typeof toVector.data[key], 'string', `plugin vector control ${key} must be a decimal string`);
}
assert.equal(toVector.data.def_line, '2');
assert.equal(toVector.data.press_intense, '4');
assert.deepEqual(toVector.data.priority, ['left', 'right'], 'priority bits 1/0/1 -> [left, right]');

// Numeric strings coerce (the page embeds strings; numbers must work too).
const stringSiteData = { ...fullSiteData, def_line: '2', press_intense: '4', priority_r: '1' };
const coerced = M.siteDataToPluginVector(stringSiteData);
assert.equal(coerced.ok, true, `numeric strings must coerce: ${coerced.message || ''}`);
assert.deepEqual(coerced.data, toVector.data, 'string and number forms produce the same vector');

// Whitespace-tolerant numeric strings and leading zeros normalize.
const padded = M.siteDataToPluginVector({ ...fullSiteData, def_line: ' 2 ', corner: '02' });
assert.equal(padded.ok, true, 'trimmed numeric strings coerce');
assert.equal(padded.data.def_line, '2');
assert.equal(padded.data.corner, '2', 'leading zeros normalize to canonical decimal');

// ---- 3. All 8 priority combinations, both directions ------------------------
for (const l of [0, 1]) for (const c of [0, 1]) for (const r of [0, 1]) {
    const site = { ...fullSiteData, priority_l: l, priority_c: c, priority_r: r };
    const res = M.siteDataToPluginVector(site);
    assert.equal(res.ok, true, `bits ${l}${c}${r} must convert`);
    const expected = [l ? 'left' : null, c ? 'center' : null, r ? 'right' : null].filter(Boolean);
    assert.deepEqual(res.data.priority, expected, `bits ${l}${c}${r} -> ${JSON.stringify(expected)}`);

    const back = M.pluginVectorToSiteData(res.data);
    assert.equal(back.ok, true, `priority ${JSON.stringify(expected)} must convert back`);
    assert.equal(back.siteData.priority_l, l, `round-trip priority_l for bits ${l}${c}${r}`);
    assert.equal(back.siteData.priority_c, c, `round-trip priority_c for bits ${l}${c}${r}`);
    assert.equal(back.siteData.priority_r, r, `round-trip priority_r for bits ${l}${c}${r}`);
}

// ---- 4. [] <-> 0/0/0 (never expanded, never "disable attacks") --------------
const emptyPriority = M.pluginVectorToSiteData({ ...toVector.data, priority: [] });
assert.equal(emptyPriority.ok, true);
assert.equal(emptyPriority.siteData.priority_l, 0, '[] -> priority_l 0');
assert.equal(emptyPriority.siteData.priority_c, 0, '[] -> priority_c 0');
assert.equal(emptyPriority.siteData.priority_r, 0, '[] -> priority_r 0');
assert.deepEqual(
    M.siteDataToPluginVector(emptyPriority.siteData).data.priority,
    [],
    '0/0/0 -> [] (empty stays empty)'
);

// ---- 5. Rejection classes: site data ----------------------------------------
const rejectsSite = (data, code, label) => {
    const res = M.siteDataToPluginVector(data);
    assert.equal(res.ok, false, `${label} must be rejected`);
    assert.equal(res.code, code, `${label} must be rejected as ${code}, got ${res.code}: ${res.message}`);
};

const validCopy = () => ({ ...fullSiteData });

rejectsSite(null, 'malformed_vector', 'null data');
rejectsSite(undefined, 'malformed_vector', 'undefined data');
rejectsSite([fullSiteData], 'malformed_vector', 'array data');
rejectsSite('x', 'malformed_vector', 'string data');
for (const key of EXPECTED_CONTROLS.concat(['priority_l', 'priority_c', 'priority_r'])) {
    const missing = validCopy();
    delete missing[key];
    rejectsSite(missing, 'malformed_vector', `data missing ${key}`);
}
// Incomplete priority bits are malformed, NOT zero.
const noBits = validCopy();
delete noBits.priority_c;
rejectsSite(noBits, 'malformed_vector', 'missing priority bit is malformed, not zero');

// Value-level rejections on one representative control (def_line 1..3).
for (const bad of [null, undefined, true, false, NaN, 2.5, '2.5', 'abc', '', '  ', '+2', '0x2']) {
    rejectsSite({ ...fullSiteData, def_line: bad }, 'invalid_value', `def_line=${String(bad)}`);
}
rejectsSite({ ...fullSiteData, def_line: 0 }, 'out_of_range', 'def_line 0 below 1..3');
rejectsSite({ ...fullSiteData, def_line: 4 }, 'out_of_range', 'def_line 4 above 1..3');
rejectsSite({ ...fullSiteData, style: 0 }, 'out_of_range', 'style 0 below 1..5');
rejectsSite({ ...fullSiteData, style: 6 }, 'out_of_range', 'style 6 above 1..5');
rejectsSite({ ...fullSiteData, corner: 3 }, 'out_of_range', 'corner 3 above 1..2');
rejectsSite({ ...fullSiteData, priority_c: 2 }, 'invalid_value', 'priority bit 2');
rejectsSite({ ...fullSiteData, priority_c: 'on' }, 'invalid_value', 'priority bit "on"');
rejectsSite({ ...fullSiteData, priority_c: null }, 'invalid_value', 'priority bit null');

// ---- 6. plugin -> site: valid, incomplete, priority-member rejections -------
const pluginVector = { ...toVector.data }; // decimal strings + ['left','right']
const toSite = M.pluginVectorToSiteData(pluginVector);
assert.equal(toSite.ok, true, `valid plugin vector must convert: ${toSite.message || ''}`);
assert.equal(Object.keys(toSite.siteData).length, 17, 'site data carries exactly 17 keys');
assert.equal(toSite.siteData.def_line, 2, 'site data values are numbers');
assert.equal(toSite.siteData.priority_l, 1);
assert.equal(toSite.siteData.priority_c, 0);
assert.equal(toSite.siteData.priority_r, 1);

const rejectsVector = (vector, code, label) => {
    const res = M.pluginVectorToSiteData(vector);
    assert.equal(res.ok, false, `${label} must be rejected`);
    assert.equal(res.code, code, `${label} must be rejected as ${code}, got ${res.code}`);
};

// Incomplete vectors are rejected on write (getCurrentTactic can produce them
// on partial pages) — never silently zero-filled.
for (const key of EXPECTED_CONTROLS) {
    const incomplete = { ...pluginVector };
    delete incomplete[key];
    rejectsVector(incomplete, 'incomplete_vector', `vector missing ${key}`);
}
rejectsVector({ ...pluginVector, priority: undefined }, 'incomplete_vector', 'vector without priority array');
rejectsVector({ ...pluginVector, priority: 'left' }, 'incomplete_vector', 'string instead of priority array');
rejectsVector(null, 'malformed_vector', 'null vector');
rejectsVector([pluginVector], 'malformed_vector', 'array vector');
rejectsVector({ ...pluginVector, priority: ['up'] }, 'invalid_priority', 'unknown priority member');
rejectsVector({ ...pluginVector, priority: ['left', 'left'] }, 'invalid_priority', 'duplicate priority member');
rejectsVector({ ...pluginVector, def_line: 9 }, 'out_of_range', 'out-of-domain control');
rejectsVector({ ...pluginVector, def_line: null }, 'invalid_value', 'null control');

// ---- 7. pluginVectorsEqual --------------------------------------------------
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector }), true, 'identical vectors equal');
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector, def_line: 2 }), true, 'string vs number form equal');
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector, shot: '1' }), false, 'differing control not equal');
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector, priority: ['right', 'left'] }), true, 'priority order-insensitive');
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector, priority: ['left'] }), false, 'differing priority not equal');
assert.equal(raw.pluginVectorsEqual(pluginVector, { ...pluginVector, priority: [] }), false, 'empty vs non-empty priority not equal');
assert.equal(raw.pluginVectorsEqual(null, pluginVector), false, 'null operand not equal');

// ---- 8. siteItemToInventoryItem ---------------------------------------------
const rawItem = {
    id: 5143, user_id: 6945, name: 'Press machine',
    data: fullSiteData, time: 1760000000, order: 2,
    share_token: 'tok', share_url: 'https://x/share'
};
const item = raw.siteItemToInventoryItem(rawItem);
assert.equal(item.ok, true, `valid item must parse: ${item.message || ''}`);
const inv = clone(item.item);
assert.equal(inv.id, '5143', 'id normalized to string');
assert.equal(inv.userId, '6945', 'user_id normalized to string');
assert.equal(inv.name, 'Press machine');
assert.equal(inv.time, '1760000000', 'time normalized to string');
assert.equal(inv.order, 2);
assert.equal(inv.data.def_line, '2');
assert.deepEqual(inv.data.priority, ['left', 'right']);
assert.equal(inv.share_token, undefined, 'share_token never carried into inventory items');
assert.equal(inv.share_url, undefined, 'share_url never carried into inventory items');

const rejectsItem = (r, code, label) => {
    const res = raw.siteItemToInventoryItem(r);
    assert.equal(res.ok, false, `${label} must be rejected`);
    assert.equal(res.code, code, `${label} must be rejected as ${code}, got ${res.code}`);
};
rejectsItem(null, 'malformed_item', 'null item');
rejectsItem('x', 'malformed_item', 'non-object item');
rejectsItem({ ...rawItem, id: '' }, 'malformed_item', 'missing id');
rejectsItem({ ...rawItem, name: '' }, 'malformed_item', 'empty name');
rejectsItem({ ...rawItem, name: '   ' }, 'malformed_item', 'whitespace name');
rejectsItem({ ...rawItem, data: { ...fullSiteData, shot: 9 } }, 'out_of_range', 'item with out-of-range control');
rejectsItem({ ...rawItem, data: (() => { const d = { ...fullSiteData }; delete d.priority_r; return d; })() }, 'malformed_vector', 'item missing priority bit');

// Malformed, not zero: a missing bit never becomes a zero-valued vector.
const missingBit = raw.siteItemToInventoryItem({ ...rawItem, data: (() => { const d = { ...fullSiteData }; delete d.priority_r; return d; })() });
assert.equal(missingBit.ok, false);
assert.match(missingBit.message, /priority_r/, 'rejection message names the missing bit');

console.log('OK: NativeTemplateMapping 17-key mapping, domains, coercion, 8 priority combos, []<->0/0/0 and rejection classes all verified');
