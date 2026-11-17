#!/usr/bin/env node
// #456: a production preset apply must close the Tactical Lab experiment only
// after the apply is confirmed (variant A). A failed apply keeps the activation
// honest: preflight failure / verified rollback -> still active; unverified
// rollback or unexpected lineup mutation -> indeterminate (never completed).
//
// The real modules load in one vm realm (same pattern as
// tests/test-tactical-lab-p04-transition.mjs): config, snapshot-engine,
// event-tracker, tactic-control-engine, manual-state-integrity,
// manual-match-runtime, tactical-lab-v1. Only the browser DOM, the tactic
// bridge result and the preset storage read are stubbed — the apply-ordering
// code, the lab state machine and the runtime wrappers are the code under test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const SOURCES = {
  config: 'src/core/config.js',
  snapshotEngine: 'src/modules/manual-match-telemetry/snapshot-engine.js',
  eventTracker: 'src/modules/manual-match-telemetry/event-tracker.js',
  engine: 'src/modules/tactics-presets/tactic-control-engine.js',
  integrity: 'src/modules/manual-match-telemetry/manual-state-integrity.js',
  runtime: 'src/modules/manual-match-telemetry/manual-match-runtime.js',
  lab: 'src/modules/tactics-presets/tactical-lab-v1.js'
};

const clone = value => JSON.parse(JSON.stringify(value));

const CURRENT_VECTOR = {
  def_line: '2', press_line: '2', def_width: '2', press_intense: '2',
  build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
  style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1',
  shot: '2', priority: []
};
const PRODUCTION_VECTOR = {
  ...CURRENT_VECTOR,
  def_line: '3', press_line: '3', style: '4', pass_risk: '3'
};
const PRESET_NAME = 'TestProductionPreset';
const PREVIOUS_PRESET = 'PriorProductionPreset';
const PREVIOUS_FINGERPRINT = 'fp-prior-production';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function element(id) {
  return { id, dataset: {}, style: {}, textContent: '', disabled: false };
}

const localStorage = createStorage();
const elements = new Map();
const domElement = id => {
  if (!elements.has(id)) elements.set(id, element(id));
  return elements.get(id);
};
// The lab panel is mounted by renderUI; pre-create the four nodes it queries.
['slf-tactical-lab-panel', 'slf-tactical-lab-status', 'slf-tactical-lab-detail', 'slf-tactical-lab-apply']
  .forEach(domElement);

let labTemplate = null;
const context = {
  console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean,
  // The lab boots via setTimeout(boot, 0); run it synchronously.
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
  localStorage,
  document: {
    readyState: 'complete',
    addEventListener() {},
    head: { appendChild() {} },
    body: { addEventListener() {} },
    defaultView: { localStorage },
    getElementById(id) { return elements.get(String(id)) || null; },
    querySelector(selector) { return String(selector).includes('.tc-seg') ? {} : null; },
    querySelectorAll() { return []; },
    createElement() { return element(''); }
  },
  location: { pathname: '/other.php', href: 'https://sublime.example/other.php' },
  SLF_VERSION_INFO: { scriptVersion: 'test' },
  MatchStateParser: {
    getGameId() { return String(labTemplate?.gameId || ''); },
    getGenerationWindow() { return { index: 2, label: '16-30' }; }
  },
  MatchTimingModel: {
    getWindow() { return { index: 2, label: '16-30' }; },
    getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; }
  },
  Api: {
    postAppend() { return Promise.resolve({ status: 200 }); },
    post() { return Promise.resolve({ status: 200 }); }
  },
  UI: { addParserLog() {}, updateParserStatus() {}, updateLastPresetBox() {} },
  TacticPresetLibrary: { meta: {}, getGroup() { return 'manual'; }, getRank() { return 0; } },
  PresetStorage: {
    resolvePresetId(name) { return name; },
    getAllPresets() { return { [PRESET_NAME]: clone(PRODUCTION_VECTOR) }; },
    getAllLabels() { return { [PRESET_NAME]: 'Test Production Preset' }; },
    loadCustom() { return {}; },
    readScopedNativeCache() { return null; }
  },
  normalizePresets(data) { return data; }
};
context.window = {};
context.globalThis = context;
vm.createContext(context);

function load(rel, exportLine = '') {
  vm.runInContext(`${read(rel)}\n${exportLine}`, context, { filename: path.basename(rel) });
}

load(SOURCES.config, ';globalThis.__STATE = STATE;');
load(SOURCES.snapshotEngine, ';globalThis.__SnapshotEngine = SnapshotEngine;');
load(SOURCES.eventTracker, ';globalThis.__EventTracker = EventTracker;');
load(SOURCES.engine);
// The realm-scope binding the production dropdown / hint button call.
const engineApplyPreset = context.applyPresetAsync;
assert.equal(typeof engineApplyPreset, 'function', 'engine exposes applyPresetAsync to the bundle scope');
load(SOURCES.integrity);
load(SOURCES.runtime);
load(SOURCES.lab);

const engine = context.__SnapshotEngine;
const STATE = context.__STATE;
const runtime = STATE.tacticalLabRuntime;
assert.ok(runtime, 'tactical lab runtime installed at boot');

// Deterministic snapshot source (the lab and the apply path both read it).
engine.build = function buildDeterministic() { return clone(labTemplate); };
// Keep lifecycle events queued in the outbox (no network in this realm).
engine.sendSnapshot = async function sendSnapshotOffline() { throw new Error('offline-test-realm'); };
// Pre-apply DOM readback is a stub: this test covers apply ordering, not DOM clicks.
context.getCurrentTactic = () => clone(labTemplate.currentTactic);
context.findTacticControl = () => ({});
// The runtime/integrity wrappers reassigned the shared binding — call that one,
// exactly like the dropdown / hint button do.
const applyPreset = context.applyPresetAsync;
assert.equal(typeof applyPreset, 'function', 'shared apply binding stays callable after runtime wrappers');
assert.notEqual(applyPreset, engineApplyPreset, 'runtime wrappers own the shared binding, as in the bundle');

let bridgeResult = { ok: true, failures: [], mismatches: [], rolledBack: false, tactic: clone(CURRENT_VECTOR) };
STATE.tacticControlBridge = {
  applyTacticObject: async () => clone(bridgeResult),
  inspectFixedLineup: () => null
};

function readLabState(gameId) {
  return engine.loadManualState(gameId)?.tacticalLab || null;
}
function outboxEvents(gameId) {
  return (readLabState(gameId)?.outbox || []).map(item => item?.event).filter(Boolean);
}
function exitEvents(gameId) {
  return outboxEvents(gameId).filter(event => event.kind === 'exit');
}

function startGame(gameId) {
  labTemplate = {
    gameId,
    status: 'live',
    minute: 30,
    bucket: '16-30',
    score: { home: 1, away: 0 },
    teams: [1, 2],
    myTeam: 1,
    matchOwnership: 'owned',
    currentTactic: clone(CURRENT_VECTOR),
    tacticTelemetry: {
      currentPreset: PREVIOUS_PRESET,
      currentTacticFingerprint: PREVIOUS_FINGERPRINT,
      transitionCount: 1,
      transitions: [{ minute: 20 }]
    },
    stats: [
      { teamId: 1, stats: { power: 100, badActionsPct: 10, possession: 55, defVector: 2, pressVector: 3 } },
      { teamId: 2, stats: { power: 98, badActionsPct: 11, possession: 45, defVector: 2, pressVector: 2 } }
    ]
  };
  context.location.pathname = '/game.php';
  STATE.lastTacticApplyFailure = null;
}

async function activateLab(gameId) {
  startGame(gameId);
  bridgeResult = { ok: true, failures: [], mismatches: [], rolledBack: false, tactic: clone(CURRENT_VECTOR) };
  const activated = await runtime.activate();
  assert.equal(activated.ok, true, `lab activates for ${gameId}: ${activated.reason || ''}`);
  const state = readLabState(gameId);
  assert.equal(state?.activation?.status, 'active', `${gameId}: activation is active before the preset apply`);
  return state;
}

// ---------------------------------------------------------------------------
// 1. Preflight failure -> false, the lab stays active, nothing is completed.
//    RED on base_sha: base closed the activation BEFORE the apply, so the lab
//    was already `completed` here and could not be resumed.
// ---------------------------------------------------------------------------
{
  const gameId = 'game-preflight-failed';
  await activateLab(gameId);
  bridgeResult = {
    ok: false,
    reason: 'preflight_failed',
    failures: ['press_line:missing_dom_input'],
    mismatches: [],
    rolledBack: false,
    tactic: clone(CURRENT_VECTOR)
  };
  const result = await applyPreset(PRESET_NAME);
  assert.equal(result, false, 'preflight failure returns false');
  const state = readLabState(gameId);
  assert.equal(state.activation?.status, 'active', 'preflight failure leaves the activation active (no indeterminate claim)');
  assert.equal(state.completed, null, 'preflight failure creates no completed experiment');
  assert.equal(exitEvents(gameId).length, 0, 'preflight failure emits no lab exit event');
  assert.equal(
    outboxEvents(gameId).some(event => event.extra?.exitReason === 'user_selected_production'),
    false,
    'preflight failure never reports a user_selected_production exit'
  );
  assert.equal(runtime.isActive(), true, 'runtime still reports the lab experiment as resumable');
  console.log('[lab-apply-order] 1 preflight failure keeps the lab active: ok');
}

// ---------------------------------------------------------------------------
// 2. Confirmed success -> exactly one user_selected_production completion with
//    the pre-apply snapshot context (previous preset/fingerprint preserved,
//    next fingerprint explicit).
// ---------------------------------------------------------------------------
{
  const gameId = 'game-confirmed-success';
  await activateLab(gameId);
  bridgeResult = {
    ok: true,
    failures: [],
    mismatches: [],
    rolledBack: false,
    applicationStatus: 'ui_readback_confirmed',
    tactic: clone(PRODUCTION_VECTOR)
  };
  const result = await applyPreset(PRESET_NAME);
  assert.equal(result, true, 'confirmed apply returns true');
  const state = readLabState(gameId);
  assert.equal(state.activation, null, 'confirmed success clears the activation');
  assert.equal(state.completed?.exitReason, 'user_selected_production', 'lab closes with the production-preset exit reason');
  assert.ok(state.completed?.exitContext?.previous, 'exit context carries the pre-apply snapshot context');
  assert.equal(state.completed.exitContext.previous.presetId, PREVIOUS_PRESET, 'previous preset id preserved from the pre-apply snapshot');
  assert.equal(state.completed.exitContext.previous.tacticFingerprint, PREVIOUS_FINGERPRINT, 'previous tactic fingerprint preserved');
  assert.equal(state.completed.exitContext.next.presetId, PRESET_NAME, 'next preset id is the applied production preset');
  assert.equal(state.completed.exitContext.next.tacticSource, 'production', 'next tactic source is production');
  const expectedNextFingerprint = engine.telemetryV2.tacticFingerprint(PRODUCTION_VECTOR);
  assert.equal(
    state.completed.exitContext.next.tacticFingerprint,
    expectedNextFingerprint,
    'next tactic fingerprint is the applied preset vector fingerprint (explicit, not guessed)'
  );
  const exits = exitEvents(gameId);
  assert.equal(exits.length, 1, 'exactly one lab exit event');
  assert.equal(exits[0].kind, 'exit');
  assert.equal(exits[0].extra?.exitReason, 'user_selected_production', 'the exit event carries the production-preset reason');
  console.log('[lab-apply-order] 2 confirmed success closes once with pre-apply context: ok');
}

// ---------------------------------------------------------------------------
// 3. Unverified rollback -> honest indeterminate activation + indeterminate UI.
//    RED on base_sha: base never marked indeterminacy (it closed the lab before
//    the apply at all), so neither the status nor the UI branch existed.
// ---------------------------------------------------------------------------
{
  const gameId = 'game-unverified-rollback';
  await activateLab(gameId);
  bridgeResult = {
    ok: false,
    reason: 'rollback_unverified',
    failures: ['press_line'],
    mismatches: ['def_line'],
    rolledBack: false,
    tactic: clone(CURRENT_VECTOR)
  };
  const result = await applyPreset(PRESET_NAME);
  assert.equal(result, false, 'unverified rollback returns false');
  const state = readLabState(gameId);
  assert.equal(state.activation?.status, 'indeterminate', 'unverified rollback marks the activation indeterminate');
  assert.equal(state.activation.indeterminateReason, 'rollback_unverified', 'indeterminate reason is recorded');
  assert.equal(state.activation.failure?.reason, 'rollback_unverified', 'the failure record is attached to the activation');
  assert.equal(state.completed, null, 'indeterminate is not a fabricated completion');
  assert.equal(exitEvents(gameId).length, 0, 'indeterminate emits no lab exit event');

  const statusText = elements.get('slf-tactical-lab-status').textContent;
  const detailText = elements.get('slf-tactical-lab-detail').textContent;
  assert.match(statusText, /не подтверждено/, 'indeterminate UI says the tactic state is unconfirmed');
  assert.doesNotMatch(statusText, /активен/i, 'indeterminate UI never claims the experiment is active');
  assert.match(detailText, /rollback_unverified/, 'indeterminate UI shows the honest reason');
  assert.equal(elements.get('slf-tactical-lab-apply').textContent, 'Тест прерван', 'indeterminate UI disables the button as interrupted');

  // A later checkpoint must not turn indeterminacy into a normal completion.
  labTemplate.currentTactic = { ...CURRENT_VECTOR, shot: '3' };
  const checkpointed = await runtime.checkpoint('explicit_checkpoint');
  assert.equal(checkpointed.active, false);
  assert.equal(checkpointed.indeterminate, true, 'checkpoint reports the indeterminate activation');
  const afterCheckpoint = readLabState(gameId);
  assert.equal(afterCheckpoint.activation?.status, 'indeterminate', 'fingerprint mismatch keeps the activation indeterminate');
  assert.equal(afterCheckpoint.completed, null, 'checkpoint never fabricates a completion for an indeterminate activation');
  assert.ok(afterCheckpoint.activation.lastObservedFingerprint, 'checkpoint records the observed fingerprint honestly');
  console.log('[lab-apply-order] 3 unverified rollback leaves an honest indeterminate activation: ok');
}

// ---------------------------------------------------------------------------
// 4. Manual dropdown shared-path success -> the lab still closes. The manual
//    dropdown and the hint button both call the same bundle binding
//    (src/app/ui-layer.js: `await applyPresetAsync(select.value)`), so this
//    pins the regression: a successful apply through that binding completes
//    the lab exactly like the LLM path.
// ---------------------------------------------------------------------------
{
  const uiLayerSource = read('src/app/ui-layer.js');
  assert.equal(
    (uiLayerSource.match(/await applyPresetAsync\(select\.value\);/g) || []).length,
    2,
    'dropdown change + apply button both call the shared applyPresetAsync binding'
  );
  const gameId = 'game-dropdown-success';
  await activateLab(gameId);
  bridgeResult = {
    ok: true,
    failures: [],
    mismatches: [],
    rolledBack: false,
    applicationStatus: 'ui_readback_confirmed',
    tactic: clone(PRODUCTION_VECTOR)
  };
  const select = { value: PRESET_NAME };
  const result = await applyPreset(select.value);
  assert.equal(result, true, 'dropdown-path apply succeeds');
  const state = readLabState(gameId);
  assert.equal(state.completed?.exitReason, 'user_selected_production', 'dropdown-path success still closes the lab');
  assert.equal(state.activation, null, 'dropdown-path success clears the activation');
  console.log('[lab-apply-order] 4 dropdown shared-path success closes the lab: ok');
}

// ---------------------------------------------------------------------------
// 5. Indeterminate -> later confirmed success -> the lab closes normally.
//    RED before closeActive accepted indeterminate activations: closeActive
//    returned null, so the lab stayed «ПРЕРВАН» forever with no completed
//    record and no exit event even after a successful apply.
// ---------------------------------------------------------------------------
{
  const gameId = 'game-indeterminate-then-success';
  await activateLab(gameId);
  bridgeResult = {
    ok: false,
    reason: 'rollback_unverified',
    failures: ['press_line'],
    mismatches: [],
    rolledBack: false,
    tactic: clone(CURRENT_VECTOR)
  };
  assert.equal(await applyPreset(PRESET_NAME), false, 'the unverified apply still fails');
  const afterFailure = readLabState(gameId);
  assert.equal(afterFailure.activation?.status, 'indeterminate', 'lab is indeterminate after the unverified rollback');
  assert.equal(afterFailure.completed, null, 'the unverified rollback did not fabricate a completion');
  assert.equal(exitEvents(gameId).length, 0, 'the unverified rollback did not close the lab');

  bridgeResult = {
    ok: true,
    failures: [],
    mismatches: [],
    rolledBack: false,
    applicationStatus: 'ui_readback_confirmed',
    tactic: clone(PRODUCTION_VECTOR)
  };
  const result = await applyPreset(PRESET_NAME);
  assert.equal(result, true, 'the later confirmed apply succeeds');
  const state = readLabState(gameId);
  assert.equal(state.activation, null, 'a confirmed apply closes the indeterminate activation');
  assert.equal(state.completed?.exitReason, 'user_selected_production', 'indeterminate resolves as a normal production completion');
  const exits = exitEvents(gameId);
  assert.equal(exits.length, 1, 'exactly one exit event is queued for the resolved test');
  assert.equal(exits[0].extra?.exitReason, 'user_selected_production', 'the exit event carries the production reason');
  console.log('[lab-apply-order] 5 confirmed success resolves an indeterminate activation: ok');
}

console.log('[lab-apply-order-test] passed');
