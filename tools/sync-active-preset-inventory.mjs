#!/usr/bin/env node

// Canonical inventory generator/validator for the generator 5.61 tactical suite v12
// (SLF issue #325, extended by #361). Derives data/tactics/active-preset-inventory-v3.json
// deterministically from src/modules/tactics-presets/active-preset-registry.js,
// closing the registry<->inventory drift class from issue #252.
//
// Modes:
//   (default | --check)  validate the inventory file against the registry-derived inventory
//   --write              regenerate data/tactics/active-preset-inventory-v3.json
//
// Registry invariants are validated in BOTH modes before comparing/writing.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(root, 'src/modules/tactics-presets/active-preset-registry.js');
const INVENTORY_PATH = path.join(root, 'data/tactics/active-preset-inventory-v3.json');
const GENERATED_FROM = 'src/modules/tactics-presets/active-preset-registry.js';
const EXPECTED_SCHEMA = 'slf_active_preset_inventory_v3';
const EXPECTED_SUITE_VERSION = 'slf_tactic_suite_561_v12';
const NATIVE_CONTRACT_PATH = path.join(root, 'data/tactics/tactical-lab-contract-v1.json');
const nativeDomains = JSON.parse(fs.readFileSync(NATIVE_CONTRACT_PATH, 'utf8')).population.nativeControlDomains;

const write = process.argv.includes('--write');
const unknownArgs = process.argv.slice(2).filter(arg => !['--check', '--write'].includes(arg));
if (unknownArgs.length) {
  console.error(`[active-preset-inventory] FAIL: unknown argument(s): ${unknownArgs.join(', ')} (usage: node tools/sync-active-preset-inventory.mjs [--check|--write])`);
  process.exit(1);
}

function fail(message) {
  console.error(`[active-preset-inventory] FAIL: ${message}`);
  process.exit(1);
}

function loadRegistry() {
  const code = fs.readFileSync(REGISTRY_PATH, 'utf8');
  // Minimal window stub (mirrors .tmp/slf-v10-smoke.js): the registry IIFE is typeof-guarded
  // for BASE_PRESETS/BASE_LABELS/TacticPresetLibrary/RecommendationEngine/
  // CurrentActionHintEngine, so a bare sandbox is enough to install the registry export.
  const sandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', querySelector: () => null, defaultView: null }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: REGISTRY_PATH });
  const registry = sandbox.window.SLFActivePresetRegistry;
  if (!registry || typeof registry !== 'object') {
    fail(`${GENERATED_FROM} did not install window.SLFActivePresetRegistry`);
  }
  if (registry.suiteVersion !== EXPECTED_SUITE_VERSION) {
    fail(`registry suiteVersion '${registry.suiteVersion}' !== '${EXPECTED_SUITE_VERSION}'; this tool is v12-bound`);
  }
  return registry;
}

// Plain-JSON deep equality (registry values are JSON data only; key order is not significant).
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

// Invariants validated in BOTH modes, before comparing/writing (issue #325).
function validateRegistryInvariants(registry) {
  const errors = [];
  const active = registry.active || [];
  const presets = registry.presets || {};
  const roleContracts = registry.roleContracts || {};
  const situations = registry.situations || [];
  const retired = new Set(registry.retiredActive || []);
  const removed = new Set(registry.removed || []);

  if (active.length !== Object.keys(roleContracts).length) {
    errors.push(`active.length (${active.length}) !== roleContracts key count (${Object.keys(roleContracts).length})`);
  }
  if (active.length !== Object.keys(presets).length) {
    errors.push(`active.length (${active.length}) !== presets key count (${Object.keys(presets).length})`);
  }
  for (const id of active) {
    if (retired.has(id)) errors.push(`retired preset still active: ${id}`);
    if (removed.has(id)) errors.push(`removed preset still active: ${id}`);
  }
  for (const id of Object.keys(presets)) {
    if (retired.has(id)) errors.push(`retired preset present in presets: ${id}`);
    if (removed.has(id)) errors.push(`removed preset present in presets: ${id}`);
  }
  for (const id of active) {
    const contract = roleContracts[id];
    if (!contract) { errors.push(`active preset without roleContract: ${id}`); continue; }
    if (!presets[id]) { errors.push(`active preset without controls: ${id}`); continue; }
    if (!deepEqual(contract.controls, presets[id])) {
      errors.push(`roleContracts[${id}].controls do not deep-equal registry.presets[${id}]`);
    }
  }
  if (active.length !== 13) errors.push(`v12 must have exactly 13 active production presets; got ${active.length}`);
  if (active.includes('Bielsa_ChaosPress_att5') || Object.keys(presets).includes('Bielsa_ChaosPress_att5'))
    errors.push('Bielsa is LAB-only, never production-recommendable');
  for (const id of active) {
    const controls = presets[id];
    const formation = registry.formations?.[id];
    if (!Array.isArray(formation) || formation.length !== 11
        || new Set(formation).size !== 11 || !formation.includes('gk'))
        errors.push(`${id}: expected 11 distinct positions including GK`);
    for (const [field, allowed] of Object.entries(nativeDomains)) {
      if (field === 'priority') continue; // Multi-select lanes are checked below.
      const value = controls?.[field];
      if (!allowed.includes(String(value ?? ''))) errors.push(`${id}.${field}: invalid native value ${JSON.stringify(value)}`);
    }
    const priority = controls?.priority;
    if (!Array.isArray(priority) || new Set(priority).size !== priority.length
        || priority.some(key => !nativeDomains.priority.includes(key)))
        errors.push(`${id}: invalid priority lanes`);
  }
  // #335: every mode describes exactly one 11-player formation.
  // The only allowed user-selected pre-match difference is RW vs RM.
  const fixed = registry.fixedLineupProfile;
  const expectedRW = ['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am1','rw','st2'];
  const expectedRM = expectedRW.map(position => position === 'rw' ? 'rm' : position);
  if (!fixed || fixed.id !== 'fixed_4231_cd1_cd3_rw_or_rm')
    errors.push('missing canonical fixed-lineup v12 profile');
  if (!deepEqual(fixed?.canonicalPositions, expectedRW))
    errors.push('fixed profile: canonical positions must use CD1/CD3, not CD2');
  if (!deepEqual(fixed?.formationVariants?.rw, expectedRW)
      || !deepEqual(fixed?.formationVariants?.rm, expectedRM))
    errors.push('fixed profile must support exact RW and RM alternatives');
  if (!deepEqual(fixed?.rightWingAlternatives, ['rw','rm']))
    errors.push('fixed profile right wing alternatives must be rw/rm');
  if (fixed?.presetSwitchChangesFormation !== false)
    errors.push('a tactical mode must not change formation');
  for (const id of active) {
    if (!deepEqual(registry.formations?.[id], expectedRW))
      errors.push(`${id}: tactical modes must share identical fixed canonical formation`);
    if (registry.roleContracts?.[id]?.fixedLineupProfileId !== fixed?.id)
      errors.push(`${id}: missing same fixed-lineup contract`);
  }
  if (registry.defaultPresetId !== 'Emery_BalancedBase_v11')
    errors.push('v12 start mode must be Emery, not Arteta');
  if (registry.roleContracts?.Arteta_SafePossession_v11?.manualOnly !== true)
    errors.push('Arteta diagnostic must be manual-only');
  if ((registry.auditTier?.manualOnly || []).includes('Arteta_SafePossession_v11') !== true)
    errors.push('Arteta diagnostic missing manual-only audit tier');

  const covered = new Set();
  for (const id of active) {
    const contract = roleContracts[id];
    if (!contract) continue;
    if (!situations.includes(contract.primarySituation)) {
      errors.push(`roleContracts[${id}].primarySituation '${contract.primarySituation}' is not in registry.situations`);
    }
    for (const situation of contract.allowedSituations || []) {
      if (!situations.includes(situation)) {
        errors.push(`roleContracts[${id}].allowedSituations contains unknown situation '${situation}'`);
      }
    }
    if (contract.fallbackEligible !== false) {
      errors.push(`roleContracts[${id}].fallbackEligible must be false, got ${JSON.stringify(contract.fallbackEligible)}`);
    }
    covered.add(contract.primarySituation);
    for (const situation of contract.allowedSituations || []) covered.add(situation);
  }
  for (const situation of situations) {
    if (!covered.has(situation)) {
      errors.push(`situation '${situation}' is not covered by any active preset (primarySituation or allowedSituations)`);
    }
  }
  if (errors.length) {
    console.error(`[active-preset-inventory] FAIL: ${errors.length} registry invariant violation(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
}

function byId(a, b) {
  return a.localeCompare(b, 'en');
}

// Unweighted Manhattan distance over the 14 controlFields (numeric values; priority excluded).
function manhattanDistance(controlFields, controlsA, controlsB) {
  return controlFields.reduce(
    (sum, field) => sum + Math.abs(Number(controlsA[field]) - Number(controlsB[field])),
    0
  );
}

function buildInventory(registry) {
  const active = registry.active;
  const controlFields = registry.controlFields;

  const presets = {};
  for (const id of active) {
    const contract = registry.roleContracts[id];
    const controls = registry.presets[id];
    presets[id] = {
      controls: Object.assign({}, controls, { priority: (controls.priority || []).slice() }),
      role: contract.role,
      riskClass: contract.riskClass,
      primarySituation: contract.primarySituation,
      allowedSituations: contract.allowedSituations.slice(),
      fallbackEligible: contract.fallbackEligible
    };
  }

  const pairwiseDistances = {};
  for (const idA of active) {
    pairwiseDistances[idA] = {};
    for (const idB of active) {
      pairwiseDistances[idA][idB] = manhattanDistance(controlFields, registry.presets[idA], registry.presets[idB]);
    }
  }

  const nearestPairs = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const [idA, idB] = [active[i], active[j]].sort(byId);
      nearestPairs.push({ pair: [idA, idB], distance: pairwiseDistances[active[i]][active[j]] });
    }
  }
  nearestPairs.sort((a, b) => a.distance - b.distance || byId(a.pair[0], b.pair[0]) || byId(a.pair[1], b.pair[1]));

  // Deterministic document: no timestamps, stable key order (presets/roleContracts follow registry.active).
  return {
    schema: EXPECTED_SCHEMA,
    suiteVersion: registry.suiteVersion,
    recommendationSchema: registry.recommendationSchema,
    generatorVersion: registry.generatorVersion,
    generatedFrom: GENERATED_FROM,
    fallbackPolicy: registry.fallbackPolicy,
    inventorySchema: registry.inventorySchema,
    presetCount: active.length,
    defaultPresetId: registry.defaultPresetId,
    fixedLineupProfile: registry.fixedLineupProfile,
    controlFields: controlFields.slice(),
    situations: registry.situations.slice(),
    retiredActive: registry.retiredActive.slice(),
    presets,
    formations: registry.formations,
    roleContracts: Object.fromEntries(active.map(id => [id, registry.roleContracts[id]])),
    distanceMetric: { name: 'unweighted_manhattan', fields: controlFields.slice() },
    pairwiseDistances,
    nearestPairs
  };
}

const compact = value => JSON.stringify(value) ?? String(value);

// Concise field-level diff (path: expected vs actual), leaf paths only.
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

const registry = loadRegistry();
validateRegistryInvariants(registry);
const inventory = buildInventory(registry);
const minDistance = inventory.nearestPairs.length ? inventory.nearestPairs[0].distance : null;

if (write) {
  fs.writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2) + '\n');
  console.log(`[active-preset-inventory] wrote data/tactics/active-preset-inventory-v3.json (presetCount=${inventory.presetCount}, minDistance=${minDistance})`);
  process.exit(0);
}

let fileRaw = null;
try {
  fileRaw = fs.readFileSync(INVENTORY_PATH, 'utf8');
} catch {
  fail(`inventory file missing: data/tactics/active-preset-inventory-v3.json (run with --write to generate)`);
}
let fileDoc;
try {
  fileDoc = JSON.parse(fileRaw);
} catch (error) {
  fail(`inventory file is not valid JSON: ${error.message}`);
}

const diffs = [];
collectDiffs(inventory, fileDoc, '', diffs);
if (diffs.length) {
  console.error(`[active-preset-inventory] FAIL: data/tactics/active-preset-inventory-v3.json out of sync with ${GENERATED_FROM} (${diffs.length} differing fields):`);
  for (const line of diffs.slice(0, 20)) console.error(`  ${line}`);
  if (diffs.length > 20) console.error(`  ... and ${diffs.length - 20} more differing fields`);
  process.exit(1);
}
const expectedText = JSON.stringify(inventory, null, 2) + '\n';
if (fileRaw !== expectedText) {
  fail('inventory content matches but bytes differ (expected 2-space JSON indent with trailing newline); run with --write to normalize');
}
console.log(`[active-preset-inventory] ok: data/tactics/active-preset-inventory-v3.json in sync with ${GENERATED_FROM} (presetCount=${inventory.presetCount}, minDistance=${minDistance})`);
