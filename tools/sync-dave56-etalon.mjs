#!/usr/bin/env node

// Canonical mirror generator/validator for the Dave 5.6 etalon tables
// (SLF issue #348). Derives data/tactics/dave56-etalon-v1.json
// deterministically from src/modules/strategy-data-recommendations/
// dave56-etalon-data.js, so the runtime data module and the checked-in
// versioned mirror cannot drift silently.
//
// Modes:
//   (default | --check)  validate the mirror file against the data-module-derived mirror
//   --write              regenerate data/tactics/dave56-etalon-v1.json
//
// Data invariants are validated in BOTH modes before comparing/writing.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(root, 'src/modules/strategy-data-recommendations/dave56-etalon-data.js');
const MAPPING_PATH = path.join(root, 'src/modules/strategy-data-recommendations/dave56-etalon-mapping.js');
const MIRROR_PATH = path.join(root, 'data/tactics/dave56-etalon-v1.json');
const GENERATED_FROM = 'src/modules/strategy-data-recommendations/dave56-etalon-data.js';
const EXPECTED_SCHEMA = 'slf_dave56_etalon_v1';

const write = process.argv.includes('--write');
const unknownArgs = process.argv.slice(2).filter(arg => !['--check', '--write'].includes(arg));
if (unknownArgs.length) {
  console.error(`[dave56-etalon] FAIL: unknown argument(s): ${unknownArgs.join(', ')} (usage: node tools/sync-dave56-etalon.mjs [--check|--write])`);
  process.exit(1);
}

function fail(message) {
  console.error(`[dave56-etalon] FAIL: ${message}`);
  process.exit(1);
}

// Minimal window stub (same pattern as tools/sync-active-preset-inventory.mjs):
// both new modules are IIFE-style with typeof-guarded window exports, so a
// bare sandbox is enough to install SLFDave56EtalonData + SLFDave56EtalonMapping.
function loadEtalonModules() {
  const sandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', querySelector: () => null, defaultView: null }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(DATA_PATH, 'utf8'), sandbox, { filename: DATA_PATH });
  vm.runInContext(fs.readFileSync(MAPPING_PATH, 'utf8'), sandbox, { filename: MAPPING_PATH });
  const data = sandbox.window.SLFDave56EtalonData;
  const mapping = sandbox.window.SLFDave56EtalonMapping;
  if (!data || typeof data !== 'object') fail(`${GENERATED_FROM} did not install window.SLFDave56EtalonData`);
  if (data.schema !== EXPECTED_SCHEMA) fail(`data schema '${data.schema}' !== '${EXPECTED_SCHEMA}'`);
  if (!mapping || typeof mapping.pickVector !== 'function') fail('dave56-etalon-mapping.js did not install window.SLFDave56EtalonMapping.pickVector');
  return { data, mapping };
}

// Plain-JSON deep equality (key order is not significant).
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length
      && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function validateInvariants(data, mapping) {
  const errors = [];
  const defenseIds = Object.keys(data.defense || {});
  const buildupIds = Object.keys(data.buildup || {});
  const scenarioIds = Object.keys(data.scenarios || {});

  if (defenseIds.length !== 12 || !['d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'].every(id => defenseIds.includes(id))) {
    errors.push(`defense must contain exactly d1..d12, got [${defenseIds.join(',')}]`);
  }
  if (buildupIds.length !== 12 || !['b1','b2','b3','b4','b5','b6','b7','b8','b9','b10','b11','b12'].every(id => buildupIds.includes(id))) {
    errors.push(`buildup must contain exactly b1..b12, got [${buildupIds.join(',')}]`);
  }
  if (scenarioIds.length !== 6 || !['s1','s2','s3','s4','s5','s6'].every(id => scenarioIds.includes(id))) {
    errors.push(`scenarios must contain exactly s1..s6, got [${scenarioIds.join(',')}]`);
  }

  const defenseKeys = data.controlOrder?.defense || [];
  const buildupKeys = data.controlOrder?.buildup || [];
  if (defenseKeys.join(',') !== 'def_line,press_line,def_width,press_intense') {
    errors.push(`controlOrder.defense must be the canonical 4 keys, got [${defenseKeys.join(',')}]`);
  }
  if (buildupKeys.join(',') !== 'build_type,build_temp,build_long,build_fast,style') {
    errors.push(`controlOrder.buildup must be the canonical 5 keys, got [${buildupKeys.join(',')}]`);
  }

  // Every etalon word of every situation must resolve to an in-domain ordinal.
  // Slash-pair slots ([conservative, alternate]) resolve conservatively; the
  // only allowed unknown is b6 style «По силе команд» (documented omission).
  const allowedUnknown = new Set(['b6:style:По силе команд']);
  const seenUnknown = new Set();
  const checkBlock = (block, ids, keys) => {
    for (const id of ids) {
      const situation = data[block]?.[id];
      if (!situation?.words) { errors.push(`${block}.${id}: missing words`); continue; }
      if (!situation.label) errors.push(`${block}.${id}: missing label`);
      for (const key of keys) {
        const words = situation.words[key];
        if (!Array.isArray(words) || words.length < 1 || words.length > 2) {
          errors.push(`${block}.${id}.${key}: slot must hold 1-2 words`);
          continue;
        }
        const resolved = words.map(word => mapping.lookupWord(key, word));
        if (resolved.some(value => value === null || value === undefined)) {
          if (!allowedUnknown.has(`${id}:${key}:${words.join('/')}`)) {
            errors.push(`${block}.${id}.${key}: unresolved word(s) [${words.join('/')}]`);
          } else {
            seenUnknown.add(`${id}:${key}:${words.join('/')}`);
          }
          continue;
        }
        const domain = data.domains?.[key];
        if (!domain || resolved.some(value => value < domain[0] || value > domain[1])) {
          errors.push(`${block}.${id}.${key}: ordinal(s) [${resolved.join(',')}] out of domain`);
        }
      }
    }
  };
  checkBlock('defense', defenseIds, defenseKeys);
  checkBlock('buildup', buildupIds, buildupKeys);
  if (seenUnknown.size !== allowedUnknown.size) {
    errors.push('documented unknown word b6:style:По силе команд not observed in data');
  }

  // Lane words must resolve to an unambiguous checkbox set or be listed ambiguous.
  const laneWords = data.laneWords || {};
  const ambiguous = new Set(data.ambiguousLaneWords || []);
  for (const id of buildupIds) {
    const word = String(data.buildup[id]?.lanes || '').trim().toLowerCase();
    const known = Object.prototype.hasOwnProperty.call(laneWords, word) || ambiguous.has(word);
    if (!known) errors.push(`buildup.${id}.lanes: unresolved lane word '${word}'`);
  }
  for (const [word, lanes] of Object.entries(laneWords)) {
    if (lanes !== null && (!Array.isArray(lanes) || lanes.some(lane => !['left', 'center', 'right'].includes(lane)))) {
      errors.push(`laneWords.${word}: invalid lane set`);
    }
  }

  // Every pickVector must produce a non-empty vector per matched situation
  // (b6 legitimately omits style) and consistent merged vectors.
  for (const id of defenseIds) {
    const picked = mapping.pickVector({ defense: id, buildup: null }, { conservative: true });
    if (!Object.keys(picked.defenseVector).length) errors.push(`defense.${id}: pickVector produced an empty defense vector`);
  }
  for (const id of buildupIds) {
    const picked = mapping.pickVector({ defense: null, buildup: id }, { conservative: true });
    const expectedKeys = buildupKeys.filter(key => !(id === 'b6' && key === 'style'));
    if (Object.keys(picked.buildupVector).sort().join(',') !== [...expectedKeys].sort().join(',')) {
      errors.push(`buildup.${id}: pickVector keys [${Object.keys(picked.buildupVector).join(',')}] !== expected [${expectedKeys.join(',')}]`);
    }
  }

  // Scenario references must exist; delta keys must be etalon controls.
  const validControls = new Set([...defenseKeys, ...buildupKeys]);
  for (const [id, scenario] of Object.entries(data.scenarios || {})) {
    for (const ref of [scenario.override?.defense, scenario.forceBase?.defense]) {
      if (ref && !data.defense?.[ref]) errors.push(`scenario ${id}: unknown defense reference '${ref}'`);
    }
    for (const ref of [scenario.override?.buildup, scenario.forceBase?.buildup]) {
      if (ref && !data.buildup?.[ref]) errors.push(`scenario ${id}: unknown buildup reference '${ref}'`);
    }
    for (const key of Object.keys({ ...(scenario.delta || {}), ...(scenario.lateDelta || {}) })) {
      if (!validControls.has(key)) errors.push(`scenario ${id}: delta key '${key}' is not an etalon control`);
    }
  }

  // Provenance must be present.
  const provenance = data.provenance || {};
  for (const field of ['source', 'transcribedFrom', 'transcribedAt', 'controlDomainsVerifiedAt', 'provisional']) {
    if (provenance[field] === undefined) errors.push(`provenance.${field} missing`);
  }

  // Calibration constants must be present.
  const calibration = data.calibration || {};
  for (const key of ['intensityThresholds', 'aggressionPerPoint', 'ycDefender', 'foulsNormPerMatch', 'foulRateReduceMin',
    'crossesWidthSignalPerMatch', 'vectorCompassPct', 'neighborOptionPhysicsPct', 'stylePressurePct',
    'styleDefenseAttackPct', 'busPoints', 'busMin', 'pressRatioFormula']) {
    if (calibration[key] === undefined) errors.push(`calibration.${key} missing`);
  }

  if (errors.length) {
    console.error(`[dave56-etalon] FAIL: ${errors.length} data invariant violation(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

// Deterministic document: no timestamps, stable key order (defense/buildup/
// scenarios follow module insertion order d1..d12 / b1..b12 / s1..s6).
function buildMirror(data) {
  return {
    schema: EXPECTED_SCHEMA,
    generatedFrom: GENERATED_FROM,
    generator: 'tools/sync-dave56-etalon.mjs',
    provenance: data.provenance,
    etalon: {
      controlOrder: data.controlOrder,
      wordMap: data.wordMap,
      domains: data.domains,
      laneWords: data.laneWords,
      ambiguousLaneWords: data.ambiguousLaneWords,
      defense: data.defense,
      buildup: data.buildup,
      scenarios: data.scenarios,
      calibration: data.calibration
    }
  };
}

const compact = value => JSON.stringify(value) ?? String(value);

function collectDiffs(expected, actual, prefix, out) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const expectedList = Array.isArray(expected) ? expected : [];
    const actualList = Array.isArray(actual) ? actual : [];
    for (let index = 0; index < Math.max(expectedList.length, actualList.length); index += 1) {
      const childPath = `${prefix}[${index}]`;
      if (index >= expectedList.length) out.push(`${childPath}: expected <none> | actual ${compact(actualList[index])}`);
      else if (index >= actualList.length) out.push(`${childPath}: expected ${compact(expectedList[index])} | actual <none>`);
      else collectDiffs(expectedList[index], actualList[index], childPath, out);
    }
    return;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(expected, key)) out.push(`${childPath}: expected <none> | actual ${compact(actual[key])}`);
      else if (!Object.prototype.hasOwnProperty.call(actual, key)) out.push(`${childPath}: expected ${compact(expected[key])} | actual <none>`);
      else collectDiffs(expected[key], actual[key], childPath, out);
    }
    return;
  }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    out.push(`${prefix}: expected ${compact(expected)} | actual ${compact(actual)}`);
  }
}

const { data, mapping } = loadEtalonModules();
validateInvariants(data, mapping);
const mirror = buildMirror(data);
const situationCount = Object.keys(data.defense).length + Object.keys(data.buildup).length;
const scenarioCount = Object.keys(data.scenarios).length;

if (write) {
  fs.writeFileSync(MIRROR_PATH, JSON.stringify(mirror, null, 2) + '\n');
  console.log(`[dave56-etalon] wrote data/tactics/dave56-etalon-v1.json (${situationCount} situations, ${scenarioCount} scenarios, schema=${EXPECTED_SCHEMA})`);
  process.exit(0);
}

let fileRaw = null;
try {
  fileRaw = fs.readFileSync(MIRROR_PATH, 'utf8');
} catch {
  fail(`mirror file missing: data/tactics/dave56-etalon-v1.json (run with --write to generate)`);
}
let fileDoc;
try {
  fileDoc = JSON.parse(fileRaw);
} catch (error) {
  fail(`mirror file is not valid JSON: ${error.message}`);
}

const diffs = [];
collectDiffs(mirror, fileDoc, '', diffs);
if (diffs.length) {
  console.error(`[dave56-etalon] FAIL: data/tactics/dave56-etalon-v1.json out of sync with ${GENERATED_FROM} (${diffs.length} differing fields):`);
  for (const line of diffs.slice(0, 20)) console.error(`  ${line}`);
  if (diffs.length > 20) console.error(`  ... and ${diffs.length - 20} more differing fields`);
  process.exit(1);
}
const expectedText = JSON.stringify(mirror, null, 2) + '\n';
if (fileRaw !== expectedText) {
  fail('mirror content matches but bytes differ (expected 2-space JSON indent with trailing newline); run with --write to normalize');
}
console.log(`[dave56-etalon] ok: data/tactics/dave56-etalon-v1.json in sync with ${GENERATED_FROM} (${situationCount} situations, ${scenarioCount} scenarios)`);
