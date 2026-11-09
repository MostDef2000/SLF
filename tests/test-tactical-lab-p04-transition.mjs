#!/usr/bin/env node
// P04 transition (issue #405 R3): Tactical Lab population switch P03 -> P04.
// Asserts real behavior of the real tactical-lab-v1.js module (vm-realm load in
// bundle order, Map-backed localStorage — same harness pattern as
// tools/test-tactical-decision-linkage.mjs; no mocks of the code under test).
// Coverage:
//   T1  population identity: version/code P04, 6 experiments, ids
//       EXP-561-P04-0001..0006, generation 3, weights 35/35/10/10/5/5 (sum 100).
//   T2  one-factor-at-a-time genomes: each hypothesis arm differs from the
//       hard-coded P04 base in exactly one control; both controls are exact
//       base repeats.
//   T3  in-flight P03 preservation: ensureAssignment must NOT replace a P03
//       assignment (activation/completed survive) and experimentFor must
//       resolve it from the kept P03 population.
//   T4  P02 preservation regression.
//   T5  fresh game draws a P04 assignment (deterministic hash + weights).
//   T6  legacy P03 builder resolves all 6 P03 experiments (validation_repeat
//       of the P02 parents, weights unchanged, distance 0).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const SOURCES = {
  config: 'src/core/config.js',
  snapshotEngine: 'src/modules/manual-match-telemetry/snapshot-engine.js',
  eventTracker: 'src/modules/manual-match-telemetry/event-tracker.js',
  integrity: 'src/modules/manual-match-telemetry/manual-state-integrity.js',
  runtime: 'src/modules/manual-match-telemetry/manual-match-runtime.js',
  tacticalLab: 'src/modules/tactics-presets/tactical-lab-v1.js'
};

const P02_VERSION = 'slf_tactical_lab_561_p02';
const P03_VERSION = 'slf_tactical_lab_561_p03';
const P04_VERSION = 'slf_tactical_lab_561_p04';
// P03_SELECTION parents/weights (must stay pinned for legacy resolution).
const P03_PARENTS = ['EXP-561-P02-0012', 'EXP-561-P02-0018', 'EXP-561-P02-0040', 'EXP-561-P02-0058', 'EXP-561-P02-0011', 'EXP-561-P02-0055'];
const P03_WEIGHTS = [35, 35, 10, 10, 5, 5];
const P04_WEIGHTS = [35, 35, 10, 10, 5, 5];

// Hard-coded P04 base (Emery_BalancedBase_v11 vector at base 823c82f) — the
// test pins the exact genomes, it does not read the live registry.
const P04_BASE = {
  def_line: '2', press_line: '2', def_width: '2', press_intense: '2',
  build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
  style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1',
  shot: '2', priority: []
};
const P04_EXPECTED = [
  { code: 'press_roles', weight: 35, varied: 'press_intense', value: '3' },
  { code: 'line_transition', weight: 35, varied: 'press_line', value: '3' },
  { code: 'aerial_cross', weight: 10, varied: 'cross', value: '3' },
  { code: 'center_pass_risk', weight: 10, varied: 'pass_risk', value: '3' },
  { code: 'control_base_a', weight: 5, varied: null, value: null },
  { code: 'control_base_b', weight: 5, varied: null, value: null }
];

const clone = value => JSON.parse(JSON.stringify(value));

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

// FNV-1a 32-bit replica of the lab's hash32 — pins the selection hash inputs
// (population version + gameId) without importing module internals.
function hash32(text) {
  let value = 2166136261;
  for (const char of String(text || '')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function expectedP04ExperimentId(gameId) {
  const bucket = hash32(`${P04_VERSION}|${gameId}`) % 100;
  let cumulative = 0;
  for (let index = 0; index < P04_WEIGHTS.length; index += 1) {
    cumulative += P04_WEIGHTS[index];
    if (bucket < cumulative) return `EXP-561-P04-${String(index + 1).padStart(4, '0')}`;
  }
  return `EXP-561-P04-${String(P04_WEIGHTS.length).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Harness (mirrors tools/test-tactical-decision-linkage.mjs Harness B).
// ---------------------------------------------------------------------------
const labStorage = createStorage();
let labGameId = 'game-boot';
let labTemplate = {
  gameId: 'game-boot',
  status: 'live',
  minute: 30,
  bucket: '16-30',
  score: { home: 1, away: 0 },
  teams: [1, 2],
  myTeam: 1,
  matchOwnership: 'owned',
  currentTactic: clone(P04_BASE),
  stats: [
    { teamId: 1, stats: { power: 100, badActionsPct: 10, possession: 55, defVector: 2, pressVector: 3 } },
    { teamId: 2, stats: { power: 98, badActionsPct: 11, possession: 45, defVector: 2, pressVector: 2 } }
  ]
};
const labContext = {
  console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean,
  // Tactical Lab boots via setTimeout(boot, 0) — run it synchronously so
  // STATE.tacticalLabRuntime exists right after the sources load.
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
  localStorage: labStorage,
  document: {
    readyState: 'complete',
    addEventListener() {},
    body: { addEventListener() {} },
    defaultView: null,
    getElementById() { return null; },
    querySelector(selector) { return String(selector).includes('.tc-seg') ? {} : null; },
    createElement() { return { style: {}, dataset: {}, append() {}, addEventListener() {} }; }
  },
  location: { pathname: '/other.php', href: 'https://sublime.example/other.php' },
  SLF_VERSION_INFO: { scriptVersion: 'test' },
  MatchStateParser: { getGameId() { return labGameId; } },
  MatchTimingModel: {
    getWindow() { return { index: 2, label: '16-30' }; },
    getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; }
  },
  Api: {
    postAppend() { return Promise.resolve({ status: 200 }); },
    post() { return Promise.resolve({ status: 200 }); }
  },
  UI: { addParserLog() {}, updateParserStatus() {}, updateLastPresetBox() {} },
  // Bundle globals from tactic-control-engine.js (not loaded in this realm).
  findTacticControl() { return {}; },
  hasLegacyPriorityInputs() { return false; },
  getCurrentTactic() { return clone(labTemplate.currentTactic || {}); },
  applyPresetAsync: async () => true
};
// The lab reads localStorage through document.defaultView (storage()).
labContext.document.defaultView = { localStorage: labStorage };
labContext.window = {};
labContext.globalThis = labContext;
vm.createContext(labContext);
vm.runInContext(`${read(SOURCES.config)}\n;globalThis.__STATE = STATE;`, labContext, { filename: 'config.js' });
vm.runInContext(read(SOURCES.snapshotEngine), labContext, { filename: 'snapshot-engine.js' });
vm.runInContext(`${read(SOURCES.eventTracker)}\n;globalThis.__EventTracker = EventTracker;`, labContext, { filename: 'event-tracker.js' });
vm.runInContext(read(SOURCES.integrity), labContext, { filename: 'manual-state-integrity.js' });
vm.runInContext(`${read(SOURCES.runtime)}\n;globalThis.__SnapshotEngine = SnapshotEngine;`, labContext, { filename: 'manual-match-runtime.js' });
vm.runInContext(read(SOURCES.tacticalLab), labContext, { filename: 'tactical-lab-v1.js' });
// Deterministic parser-free snapshot source for the lab flows.
labContext.__SnapshotEngine.build = function buildDeterministic() {
  return clone(labTemplate);
};
// Keep lifecycle events queued in the outbox (no network in this realm) so the
// tests can assert attribution metadata off the real event path.
labContext.__SnapshotEngine.sendSnapshot = async function sendSnapshotOffline() {
  throw new Error('offline-test-realm');
};
const engine = labContext.__SnapshotEngine;
const state = labContext.__STATE;
const runtime = state.tacticalLabRuntime;
assert.ok(runtime, 'tactical lab runtime installed at boot');
const appliedControls = [];
state.tacticControlBridge = {
  applyTacticObject: async controls => {
    appliedControls.push(clone(controls));
    return { ok: true };
  }
};

// ---------------------------------------------------------------------------
// Helpers over the real persisted envelope.
// ---------------------------------------------------------------------------
function storageKeyFor(gameId) {
  const derived = engine.manualMatchState?.getStorageKey?.(gameId);
  return String(derived || `slf_manual_match_state_v1:${gameId}`);
}
function seedLabState(gameId, labState) {
  // Envelope schema must match the real runtime's v2 manual-state envelope
  // (manual-match-runtime.js STATE_PREFIX) or the integrity layer disregards it.
  const envelope = { schema: 'slf_manual_match_state_v2', gameId, ts: Date.now(), tacticalLab: labState };
  labStorage.setItem(storageKeyFor(gameId), JSON.stringify(envelope));
}
function labStateFixture(gameId, populationVersion, experimentId, overrides = {}) {
  return {
    schema: 'slf_tactical_lab_state_v1',
    gameId,
    populationVersion,
    assignment: {
      assignmentId: `tactical_lab_assignment|${gameId}|${experimentId}`,
      experimentId,
      populationVersion,
      genomeFingerprint: 'tlab1-seeded',
      parentExperimentId: null,
      selectionWeightPct: null,
      assignedAt: 1700000000000
    },
    activation: null,
    completed: null,
    outbox: [],
    lastError: null,
    ...overrides
  };
}
function readLabState(gameId) {
  return engine.loadManualState(gameId)?.tacticalLab || null;
}
function activationEvent(gameId) {
  const outbox = readLabState(gameId)?.outbox || [];
  return outbox.find(item => item?.event?.kind === 'activation')?.event || null;
}
async function flushMicrotasks() {
  await new Promise(resolve => setImmediate(resolve));
}
function useGame(gameId) {
  labGameId = gameId;
  labTemplate = { ...labTemplate, gameId };
}

// ---------------------------------------------------------------------------
// T1: population identity — P04, 6 experiments, ids, generation, weights.
// ---------------------------------------------------------------------------
{
  const population = runtime.getPopulation();
  assert.equal(runtime.populationVersion, P04_VERSION, 'runtime exposes the P04 population version');
  assert.equal(runtime.populationSize, 6, 'population size stays 6');
  assert.equal(population.length, 6, 'P04 population has 6 experiments');
  assert.deepEqual(
    population.map(item => item.experimentId),
    ['EXP-561-P04-0001', 'EXP-561-P04-0002', 'EXP-561-P04-0003', 'EXP-561-P04-0004', 'EXP-561-P04-0005', 'EXP-561-P04-0006'],
    'experiment ids are EXP-561-P04-0001..0006 in selection order'
  );
  population.forEach(item => {
    assert.equal(item.populationVersion, P04_VERSION, 'every experiment carries the P04 population version');
    assert.equal(item.generation, 3, 'P04 is generation 3 (P02=1, P03=2)');
    assert.equal(item.parentExperimentId, null, 'P04 arms are hypothesis-driven, not parent repeats');
  });
  const weights = population.map(item => item.selectionWeightPct);
  assert.deepEqual(weights, P04_WEIGHTS, 'weights are 35/35/10/10/5/5 in selection order');
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 100, 'weights sum to 100');
  console.log('[p04-transition] T1 population identity: ok');
}

// ---------------------------------------------------------------------------
// T2: one-factor-at-a-time genomes; controls are exact base repeats.
// ---------------------------------------------------------------------------
{
  const population = runtime.getPopulation();
  const diffKeys = (controls, base) => Object.keys(base)
    .filter(key => JSON.stringify(controls[key]) !== JSON.stringify(base[key]));
  population.forEach((item, index) => {
    const expected = P04_EXPECTED[index];
    assert.equal(item.origin, `hypothesis_factor:${expected.code}`, `arm ${index + 1} encodes its hypothesis code in origin`);
    const varied = diffKeys(item.controls, P04_BASE);
    assert.deepEqual(
      varied,
      expected.varied ? [expected.varied] : [],
      `arm ${index + 1} (${expected.code}) differs from the P04 base in exactly one control`
    );
    if (expected.varied) {
      assert.equal(item.controls[expected.varied], expected.value, `arm ${index + 1} varies ${expected.varied} to '${expected.value}'`);
    }
    const expectedControls = { ...P04_BASE };
    if (expected.varied) expectedControls[expected.varied] = expected.value;
    assert.deepEqual(item.controls, expectedControls, `arm ${index + 1} controls match the specified genome exactly`);
  });
  assert.equal(
    population[4].genomeFingerprint,
    population[5].genomeFingerprint,
    'both controls are exact repeats (identical genome fingerprints)'
  );
  assert.deepEqual(population[4].controls, P04_BASE, 'control_base_a is the exact P04 base');
  assert.deepEqual(population[5].controls, P04_BASE, 'control_base_b is the exact P04 base');
  ['press_intense', 'press_line', 'cross', 'pass_risk'].forEach(key => {
    assert.equal(P04_BASE[key], '2', `sanity: P04 base ${key} is '2'`);
  });
  console.log('[p04-transition] T2 one-factor genomes: ok');
}

// ---------------------------------------------------------------------------
// T3: in-flight P03 preservation + P03 resolution.
// ---------------------------------------------------------------------------
{
  // (a) ensureAssignment must NOT replace a P03 assignment; activation and
  // completed fields survive untouched.
  const gameId = 'game-p03-inflight';
  useGame(gameId);
  const seeded = labStateFixture(gameId, P03_VERSION, 'EXP-561-P03-0003', {
    activation: {
      status: 'active',
      activationId: `tactical_lab_activation|${gameId}|tactical_lab_assignment|${gameId}|EXP-561-P03-0003`,
      experimentId: 'EXP-561-P03-0003',
      startedAtTs: 1700000000001,
      startedAtMinute: 12
    },
    completed: { experimentId: 'EXP-561-P03-0003', exitReason: 'prior_checkpoint' }
  });
  seedLabState(gameId, seeded);
  const before = clone(readLabState(gameId));
  const result = await runtime.activate();
  assert.equal(result.ok, false, 'in-flight P03 game is not re-assigned');
  assert.equal(result.reason, 'Эксперимент уже использован в этом матче.', 'P03 activation/completed still block re-use');
  const after = readLabState(gameId);
  assert.equal(after.populationVersion, P03_VERSION, 'state populationVersion stays P03');
  assert.equal(after.assignment.experimentId, 'EXP-561-P03-0003', 'assignment experimentId unchanged');
  assert.equal(after.assignment.populationVersion, P03_VERSION, 'assignment populationVersion stays P03');
  assert.equal(after.assignment.assignedAt, 1700000000000, 'assignment was not replaced (assignedAt unchanged)');
  assert.deepEqual(after.activation, before.activation, 'activation field survives the transition');
  assert.deepEqual(after.completed, before.completed, 'completed field survives the transition');

  // (b) experimentFor resolves the P03 assignment from the kept P03 population.
  const resolveGameId = 'game-p03-resolve';
  useGame(resolveGameId);
  seedLabState(resolveGameId, labStateFixture(resolveGameId, P03_VERSION, 'EXP-561-P03-0001'));
  const resolved = await runtime.activate();
  assert.equal(resolved.ok, true, `P03 assignment resolves for activation: ${resolved.reason || ''}`);
  assert.equal(resolved.experimentId, 'EXP-561-P03-0001', 'resolved experiment is the seeded P03 experiment');
  const event = activationEvent(resolveGameId);
  assert.ok(event, 'activation lifecycle event queued');
  assert.equal(event.experimentId, 'EXP-561-P03-0001', 'event attributes the P03 experiment');
  assert.equal(event.populationVersion, P03_VERSION, 'event carries the P03 population version');
  assert.equal(event.extra.origin, 'validation_repeat', 'P03 arm keeps its validation_repeat origin');
  assert.equal(event.extra.parentExperimentId, P03_PARENTS[0], 'P03 arm keeps its P02 parent link');
  assert.equal(event.extra.selectionWeightPct, P03_WEIGHTS[0], 'P03 arm keeps its selection weight');
  assert.equal(event.extra.mutationDistance, 0, 'P03 arm is a distance-0 repeat');
  assert.equal(readLabState(resolveGameId).assignment.populationVersion, P03_VERSION, 'assignment not rewritten by activation');
  console.log('[p04-transition] T3 P03 in-flight preservation + resolution: ok');
}

// ---------------------------------------------------------------------------
// T4: P02 preservation regression.
// ---------------------------------------------------------------------------
{
  const gameId = 'game-p02-inflight';
  useGame(gameId);
  seedLabState(gameId, labStateFixture(gameId, P02_VERSION, 'EXP-561-P02-0012'));
  const result = await runtime.activate();
  assert.equal(result.ok, true, `P02 assignment still resolves: ${result.reason || ''}`);
  assert.equal(result.experimentId, 'EXP-561-P02-0012', 'resolved experiment is the seeded P02 experiment');
  assert.equal(readLabState(gameId).assignment.populationVersion, P02_VERSION, 'P02 assignment not replaced');
  const event = activationEvent(gameId);
  assert.ok(event, 'P02 activation lifecycle event queued');
  assert.equal(event.populationVersion, P02_VERSION, 'P02 event carries the P02 population version');
  assert.equal(event.extra.origin, 'production_mutation', 'P02-0012 is a production_mutation genome');
  globalThis.__p02ParentControls = clone(appliedControls[appliedControls.length - 1]);
  globalThis.__p02ParentGenomeFingerprint = event.genomeFingerprint;
  console.log('[p04-transition] T4 P02 preservation regression: ok');
}

// ---------------------------------------------------------------------------
// T5: fresh game draws a deterministic P04 assignment.
// ---------------------------------------------------------------------------
{
  const gameId = 'game-fresh-p04';
  useGame(gameId);
  labContext.location.pathname = '/game.php';
  try {
    const mounted = await runtime.mountUI();
    assert.equal(mounted, false, 'panel DOM absent -> mountUI returns false after ensuring the assignment');
  } finally {
    labContext.location.pathname = '/other.php';
  }
  const assignment = runtime.getAssignment(gameId);
  assert.ok(assignment, 'fresh game received an assignment');
  assert.equal(assignment.populationVersion, P04_VERSION, 'fresh-game assignment is P04');
  const expectedId = expectedP04ExperimentId(gameId);
  assert.equal(assignment.experimentId, expectedId, `selection hash + P04 weights predict ${expectedId}`);
  const population = runtime.getPopulation();
  const selected = population.find(item => item.experimentId === assignment.experimentId);
  assert.ok(selected, 'assigned experiment exists in the P04 population');
  assert.equal(assignment.selectionWeightPct, selected.selectionWeightPct, 'assignment carries the experiment weight');
  assert.equal(readLabState(gameId).populationVersion, P04_VERSION, 'persisted state populationVersion is P04');
  console.log('[p04-transition] T5 fresh game P04 assignment: ok');
}

// ---------------------------------------------------------------------------
// T6: legacy P03 builder resolves all 6 P03 experiments.
// ---------------------------------------------------------------------------
{
  for (let index = 0; index < 6; index += 1) {
    const experimentId = `EXP-561-P03-${String(index + 1).padStart(4, '0')}`;
    const gameId = `game-p03-arm-${index + 1}`;
    useGame(gameId);
    seedLabState(gameId, labStateFixture(gameId, P03_VERSION, experimentId));
    const result = await runtime.activate();
    assert.equal(result.ok, true, `P03 arm ${index + 1} resolves: ${result.reason || ''}`);
    assert.equal(result.experimentId, experimentId, `P03 arm ${index + 1} activates its own experiment id`);
    await flushMicrotasks();
    const event = activationEvent(gameId);
    assert.ok(event, `P03 arm ${index + 1} queued an activation event`);
    assert.equal(event.experimentId, experimentId, `P03 arm ${index + 1} event attributes the right experiment`);
    assert.equal(event.populationVersion, P03_VERSION, `P03 arm ${index + 1} event carries the P03 version`);
    assert.equal(event.extra.origin, 'validation_repeat', `P03 arm ${index + 1} is a validation_repeat`);
    assert.equal(event.extra.parentExperimentId, P03_PARENTS[index], `P03 arm ${index + 1} parent is ${P03_PARENTS[index]}`);
    assert.equal(event.extra.selectionWeightPct, P03_WEIGHTS[index], `P03 arm ${index + 1} weight unchanged (${P03_WEIGHTS[index]})`);
    assert.equal(event.extra.mutationDistance, 0, `P03 arm ${index + 1} is a distance-0 repeat`);
    if (index === 0) {
      assert.deepEqual(
        appliedControls[appliedControls.length - 1],
        globalThis.__p02ParentControls,
        'P03-0001 controls are an exact repeat of its P02 parent controls'
      );
      assert.equal(
        event.genomeFingerprint,
        globalThis.__p02ParentGenomeFingerprint,
        'P03-0001 genome fingerprint equals its P02 parent fingerprint'
      );
    }
  }
  console.log('[p04-transition] T6 legacy P03 builder resolution: ok');
}

console.log('[tactical-lab-p04-transition-test] passed');
