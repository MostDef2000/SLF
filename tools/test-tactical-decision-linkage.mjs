#!/usr/bin/env node
// data-linkage v1: client-side decision-linkage telemetry.
// Asserts real behavior against the real modules (vm-realm load in bundle
// order, Map-backed localStorage) — every assertion fails if the
// implementation is reverted:
//   1. EventTracker.recordLastRuleDecision — durable last-decision-per-game
//      record: persist through the manual-state envelope, signature dedup,
//      bounded signature cache, moment.gameId guard.
//   2. installTacticTelemetryEnvelope enrich() hook — snapshot builds persist
//      the current production decision per game (once per decision identity).
//   3. SnapshotEngine.finalPresetAttribution — preset attribution resolution
//      (memory progression -> persisted envelope copy -> usage tracker),
//      gameId guards, generatorVersion precedence, match_result integration.
//   4. Tactical Lab activation — persisted-decision fallback with linkage
//      fields, live advisor path, unchanged absence shape.
// Records are read back through the real SnapshotEngine.loadManualState
// envelope and the real PresetUsageTracker storage contract — never through
// mocks of the code under test.
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

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function rawDecision(overrides = {}) {
  const { moment: momentOverrides, ...rest } = overrides;
  return {
    schema: 'slf_rule_decision_v11_tactical_suite',
    mode: 'button_on_demand_scored_rules',
    generatedAt: Date.now(),
    moment: {
      gameId: 'game-1',
      minute: 25,
      score: { state: 'draw' },
      signals: [],
      reasons: [],
      context: {},
      ...momentOverrides
    },
    action: { preset: 'Guardiola_ControlledPush_v11', decision: 'controlled_chase', score: 61, reason: 'нужен гол' },
    confidence: { level: 'medium', gap: 12 },
    margin: 12,
    candidates: [{ preset: 'Guardiola_ControlledPush_v11', score: 61, rawScore: 61, vetoed: false, vetoReasons: [] }],
    vetoedPresets: {},
    ...rest
  };
}

const clone = value => JSON.parse(JSON.stringify(value));

const TACTIC = {
  def_line: '2', press_line: '2', def_width: '2', press_intense: '2',
  build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
  style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1',
  shot: '2', priority: []
};

// ---------------------------------------------------------------------------
// Shared telemetry stack: config -> snapshot-engine -> event-tracker ->
// manual-state-integrity -> manual-match-runtime (bundle order), real
// PresetUsageTracker, Map-backed localStorage, stub timers, non-game pathname
// (keeps the runtime auto-poll dormant).
// ---------------------------------------------------------------------------
function createTelemetryHarness({ gameId }) {
  const localStorage = createStorage();
  const posted = [];
  const context = {
    console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    localStorage,
    document: {
      readyState: 'complete',
      addEventListener() {},
      body: { addEventListener() {} },
      querySelector() { return null; }
    },
    location: { pathname: '/other.php', href: 'https://sublime.example/other.php' },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    MatchStateParser: { getGameId() { return gameId; } },
    MatchTimingModel: {
      getWindow() { return { index: 1, label: '01-15' }; },
      getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; }
    },
    Api: {
      postAppend(collection, payload) { posted.push({ collection, payload }); return Promise.resolve({ status: 200 }); },
      post() { return Promise.resolve({ status: 200 }); }
    },
    UI: { addParserLog() {}, updateParserStatus() {}, updateLastPresetBox() {} },
    getCurrentTactic() { return {}; },
    applyPresetAsync: async () => true
  };
  context.window = {};
  context.globalThis = context;
  vm.createContext(context);
  // Bundle order (src/app/bundle-order.json): config(1) -> snapshot-engine(13)
  // -> event-tracker(14) -> integrity(46) -> runtime(47). Top-level const in a
  // vm script is a global lexical binding, not a context property — expose
  // handles for the assertions.
  vm.runInContext(`${read(SOURCES.config)}\n;globalThis.__STATE = STATE;`, context, { filename: 'config.js' });
  vm.runInContext(read(SOURCES.snapshotEngine), context, { filename: 'snapshot-engine.js' });
  vm.runInContext(`${read(SOURCES.eventTracker)}\n;globalThis.__EventTracker = EventTracker;`, context, { filename: 'event-tracker.js' });
  vm.runInContext(read(SOURCES.integrity), context, { filename: 'manual-state-integrity.js' });
  vm.runInContext(`${read(SOURCES.runtime)}\n;globalThis.__SnapshotEngine = SnapshotEngine;`, context, { filename: 'manual-match-runtime.js' });
  return {
    context,
    localStorage,
    posted,
    engine: context.__SnapshotEngine,
    eventTracker: context.__EventTracker,
    state: context.__STATE
  };
}

// ===========================================================================
// Harness A: recorder + enrich hook + finalPresetAttribution + match_result.
// ===========================================================================
{
  const { context, posted, engine, eventTracker, state, localStorage } = createTelemetryHarness({ gameId: 'game-1' });

  // --- 1. recordLastRuleDecision -------------------------------------------
  // (a) persists through SnapshotEngine.persistManualState and returns the record.
  const decision = rawDecision({ moment: { gameId: 'game-rec', minute: 25 } });
  const record = eventTracker.recordLastRuleDecision('game-rec', decision);
  assert.ok(record, 'recorder returns the persisted record');
  assert.equal(record.schema, 'slf_last_rule_decision_record_v1');
  assert.equal(record.gameId, 'game-rec');
  assert.equal(record.decidedAt, decision.generatedAt);
  assert.equal(record.decidedMinute, 25);
  assert.equal(record.decision.action.preset, 'Guardiola_ControlledPush_v11');
  const stored = engine.loadManualState('game-rec');
  assert.equal(stored?.lastRuleDecisionRecord?.schema, 'slf_last_rule_decision_record_v1', 'record persisted via SnapshotEngine.persistManualState');
  assert.equal(stored?.lastRuleDecisionRecord?.decision?.action?.preset, 'Guardiola_ControlledPush_v11');

  // (b) signature dedup: the identical decision is not persisted twice.
  assert.equal(eventTracker.recordLastRuleDecision('game-rec', decision), null, 'same decision signature -> null, no second write');
  const nextDecision = rawDecision({ generatedAt: decision.generatedAt + 1000, moment: { gameId: 'game-rec', minute: 26 } });
  const nextRecord = eventTracker.recordLastRuleDecision('game-rec', nextDecision);
  assert.ok(nextRecord, 'a new decision identity is persisted');
  assert.equal(
    engine.loadManualState('game-rec')?.lastRuleDecisionRecord?.decision?.generatedAt,
    nextRecord.decidedAt,
    'the newer decision replaced the stored one'
  );

  // (c) bounded signature cache: many games never grow the map unbounded.
  for (let index = 0; index < 12; index += 1) {
    const burstGameId = `game-burst-${index}`;
    const burstRecord = eventTracker.recordLastRuleDecision(burstGameId, rawDecision({
      generatedAt: 1700000000000 + index,
      moment: { gameId: burstGameId, minute: 10 + index }
    }));
    assert.ok(burstRecord, `burst record ${index} persisted`);
  }
  assert.ok(
    eventTracker.lastDecisionRecordSignatures.size <= 9,
    `signature cache stays bounded (size=${eventTracker.lastDecisionRecordSignatures.size})`
  );

  // (d) gameId guard: a decision stamped for another match is never attributed.
  const foreign = rawDecision({ moment: { gameId: 'game-other', minute: 10 } });
  assert.equal(eventTracker.recordLastRuleDecision('game-guard', foreign), null, 'moment.gameId mismatch -> null');
  assert.equal(engine.loadManualState('game-guard')?.lastRuleDecisionRecord ?? null, null, 'no record persisted on gameId mismatch');

  // --- 2. enrich() hook ------------------------------------------------------
  const enrichSnapshot = {
    gameId: 'game-enrich',
    status: 'live',
    minute: 30,
    bucket: '16-30',
    score: { home: 0, away: 0 },
    teams: [1, 2],
    myTeam: 1,
    currentTactic: clone(TACTIC),
    stats: [
      { teamId: 1, stats: { power: 100, badActionsPct: 10 } },
      { teamId: 2, stats: { power: 98, badActionsPct: 11 } }
    ],
    ruleDecision: rawDecision({ moment: { gameId: 'game-enrich', minute: 28 } })
  };
  let decisionPersists = 0;
  const targetPersist = engine.persistManualState;
  engine.persistManualState = function countedPersistManualState(extra = {}) {
    if (extra && Object.hasOwn(extra, 'lastRuleDecisionRecord')) decisionPersists += 1;
    return targetPersist(extra);
  };
  engine.buildSnapshotRecord(clone(enrichSnapshot));
  const enrichRecord = engine.loadManualState('game-enrich')?.lastRuleDecisionRecord;
  assert.ok(enrichRecord, 'a snapshot build carrying a rule decision persists the decision record');
  assert.equal(enrichRecord.gameId, 'game-enrich');
  assert.equal(enrichRecord.decidedMinute, 28, 'decidedMinute comes from the raw decision moment');
  assert.equal(enrichRecord.decision.action.preset, 'Guardiola_ControlledPush_v11');
  assert.equal(decisionPersists, 1, 'exactly one decision persist for the first observation');
  const persistsAfterFirst = decisionPersists;
  engine.buildSnapshotRecord(clone(enrichSnapshot));
  assert.equal(decisionPersists, persistsAfterFirst, 'signature dedup: the identical decision is not persisted again');

  // Memory fallback (STATE.lastRuleDecision) reaches the recorder too — but a
  // decision belonging to another game must never be attributed to this match.
  state.lastRuleDecision = rawDecision({ moment: { gameId: 'game-other', minute: 10 } });
  engine.buildSnapshotRecord(clone({ ...enrichSnapshot, ruleDecision: undefined }));
  assert.equal(
    engine.loadManualState('game-enrich')?.lastRuleDecisionRecord?.decision?.action?.preset,
    'Guardiola_ControlledPush_v11',
    'foreign-game memory decision did not overwrite the game record'
  );
  assert.equal(decisionPersists, persistsAfterFirst, 'the rejected foreign decision caused no persist');
  delete state.lastRuleDecision;

  // --- 3. finalPresetAttribution --------------------------------------------
  // finalPresetAttribution returns objects built in the vm realm; JSON-clone
  // them into the host realm so deepStrictEqual compares values, not realms.
  const attributionOf = (gameId, snapshot) => clone(engine.finalPresetAttribution(gameId, snapshot));
  // (a) memory presetProgression path.
  state.presetProgression = {
    schema: 'slf_preset_progression_v1',
    gameId: 'game-att',
    lastAppliedPreset: 'Simeone_CompactLead_v11',
    appliedAt: 1700000000000
  };
  assert.deepEqual(
    attributionOf('game-att', {}),
    { lastAppliedPreset: 'Simeone_CompactLead_v11', lastAppliedPresetAt: 1700000000000, lastAppliedPresetSource: 'preset_progression', generatorVersion: null },
    'memory presetProgression resolves the attribution'
  );

  // (b) persisted envelope copy (survives page reloads — STATE is empty).
  state.presetProgression = null;
  engine.persistManualState({
    gameId: 'game-att2',
    presetProgression: { schema: 'slf_preset_progression_v1', gameId: 'game-att2', lastAppliedPreset: 'Conte_WideChannels_v11', appliedAt: 1700000001000 }
  });
  assert.deepEqual(
    attributionOf('game-att2', {}),
    { lastAppliedPreset: 'Conte_WideChannels_v11', lastAppliedPresetAt: 1700000001000, lastAppliedPresetSource: 'preset_progression', generatorVersion: null },
    'the persisted envelope copy of presetProgression resolves after reload'
  );

  // (c) durable usage-tracker fallback (real PresetUsageTracker storage key).
  localStorage.setItem('slf_last_selected_preset_v1', JSON.stringify({
    ts: 1700000002000, presetName: 'Klopp_LateGegenpress_v11', gameId: 'game-att3', minute: 80, bucket: '76-90', source: 'preset_apply'
  }));
  assert.deepEqual(
    attributionOf('game-att3', {}),
    { lastAppliedPreset: 'Klopp_LateGegenpress_v11', lastAppliedPresetAt: 1700000002000, lastAppliedPresetSource: 'usage_tracker', generatorVersion: null },
    'usage tracker is the fallback attribution source'
  );

  // (d) gameId mismatch on every source -> null fields (never attribute
  // another match's preset).
  state.presetProgression = { schema: 'slf_preset_progression_v1', gameId: 'game-att3', lastAppliedPreset: 'Conte_WideChannels_v11', appliedAt: 5 };
  assert.deepEqual(
    attributionOf('game-unrelated', {}),
    { lastAppliedPreset: null, lastAppliedPresetAt: null, lastAppliedPresetSource: null, generatorVersion: null },
    'gameId mismatch on every source -> null attribution fields'
  );

  // (e) generatorVersion: snapshot value wins, then the registry declaration,
  // else null — never an invented version string.
  assert.equal(
    engine.finalPresetAttribution('game-unrelated', { generatorVersion: '5.61-manual' }).generatorVersion,
    '5.61-manual',
    'snapshot generatorVersion wins'
  );
  context.window.SLFActivePresetRegistry = { generatorVersion: '5.61' };
  assert.equal(engine.finalPresetAttribution('game-unrelated', {}).generatorVersion, '5.61', 'registry generatorVersion is the fallback');
  context.window.SLFActivePresetRegistry = null;
  assert.equal(engine.finalPresetAttribution('game-unrelated', {}).generatorVersion, null, 'no source -> null, no invented version');

  // (f) sendMatchResult integration: the match_result row carries the fields.
  state.presetProgression = { schema: 'slf_preset_progression_v1', gameId: 'game-result', lastAppliedPreset: 'Simeone_CompactLead_v11', appliedAt: 1700000003000 };
  context.window.SLFActivePresetRegistry = { generatorVersion: '5.61' };
  await engine.sendMatchResult({
    gameId: 'game-result',
    status: 'finished',
    minute: 90,
    bucket: '76-90',
    score: { home: 2, away: 1 },
    teams: [1, 2],
    myTeam: 1,
    currentTactic: clone(TACTIC),
    lineupRows: []
  });
  const resultRow = posted.find(item => item.collection === 'match_results_v2');
  assert.ok(resultRow, 'match_result posted');
  assert.equal(resultRow.payload.recordType, 'match_result');
  assert.equal(resultRow.payload.gameId, 'game-result');
  assert.equal(resultRow.payload.lastAppliedPreset, 'Simeone_CompactLead_v11', 'match_result carries lastAppliedPreset');
  assert.equal(resultRow.payload.lastAppliedPresetAt, 1700000003000);
  assert.equal(resultRow.payload.lastAppliedPresetSource, 'preset_progression');
  assert.equal(resultRow.payload.generatorVersion, '5.61', 'match_result carries the declared generator version');

  // Additive-only: with no attribution sources the keys exist but stay null —
  // legacy rows without the fields remain valid, absence semantics unchanged.
  context.window.SLFActivePresetRegistry = null;
  await engine.sendMatchResult({
    gameId: 'game-bare',
    status: 'finished',
    score: { home: 0, away: 0 },
    teams: [1, 2],
    myTeam: 1,
    currentTactic: clone(TACTIC),
    lineupRows: []
  });
  const bareRow = posted.filter(item => item.collection === 'match_results_v2').at(-1).payload;
  assert.equal(bareRow.gameId, 'game-bare');
  assert.equal(bareRow.lastAppliedPreset, null);
  assert.equal(bareRow.lastAppliedPresetAt, null);
  assert.equal(bareRow.lastAppliedPresetSource, null);
  assert.equal(bareRow.generatorVersion, null);
  assert.ok(Object.hasOwn(bareRow, 'lastAppliedPreset'), 'attribution keys are always present on new rows');
}

// ===========================================================================
// Harness B: Tactical Lab activation decision linkage.
// ===========================================================================
{
  const labStorage = createStorage();
  let labGameId = 'game-absent';
  let labTemplate = {
    gameId: 'game-absent',
    status: 'live',
    minute: 30,
    bucket: '16-30',
    score: { home: 1, away: 0 },
    teams: [1, 2],
    myTeam: 1,
    matchOwnership: 'owned',
    currentTactic: clone(TACTIC),
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
  // Deterministic parser-free snapshot source for the lab activation flow.
  labContext.__SnapshotEngine.build = function buildDeterministic() {
    return clone(labTemplate);
  };
  const engine = labContext.__SnapshotEngine;
  const eventTracker = labContext.__EventTracker;
  const state = labContext.__STATE;
  const runtime = state.tacticalLabRuntime;
  assert.ok(runtime, 'tactical lab runtime installed at boot');
  state.tacticControlBridge = { applyTacticObject: async () => ({ ok: true }) };

  // (a) absence: no advisor, no snapshot decision, no persisted record.
  const absent = await runtime.activate();
  assert.equal(absent.ok, true, `absence scenario activated: ${absent.reason || ''}`);
  const absentContext = engine.loadManualState('game-absent')?.tacticalLab?.activation?.entryContext;
  assert.ok(absentContext, 'absence activation persisted an entry context');
  assert.equal(absentContext.productionRecommendation, null, 'absence keeps productionRecommendation null (never a dict of nulls)');
  assert.deepEqual(
    Object.keys(absentContext).sort(),
    ['bucket', 'homeAway', 'minute', 'previous', 'productionRecommendation', 'score', 'scoreDiff', 'scoreState', 'state', 'strengthBucket', 'strengthGap'],
    'entry-context key set is unchanged when no decision is available'
  );

  // (b) persisted fallback: activation after a reload — no advisor, no
  // snapshot.ruleDecision, only the recorder's persisted decision.
  labGameId = 'game-persisted';
  labTemplate = { ...labTemplate, gameId: 'game-persisted' };
  const persistedDecision = rawDecision({
    generatedAt: Date.now() - 30 * 60 * 1000,
    moment: { gameId: 'game-persisted', minute: 25 }
  });
  const storedRecord = eventTracker.recordLastRuleDecision('game-persisted', persistedDecision);
  assert.ok(storedRecord, 'recorder persisted the decision for the lab fallback');
  const persistedActivation = await runtime.activate();
  assert.equal(persistedActivation.ok, true, `persisted scenario activated: ${persistedActivation.reason || ''}`);
  const persistedRecommendation = engine.loadManualState('game-persisted')?.tacticalLab?.activation?.entryContext?.productionRecommendation;
  assert.ok(persistedRecommendation, 'persisted fallback produced a productionRecommendation');
  assert.equal(persistedRecommendation.presetId, 'Guardiola_ControlledPush_v11', 'productionRecommendation is based on the persisted record.decision');
  assert.equal(persistedRecommendation.decisionSource, 'persisted');
  assert.equal(persistedRecommendation.decidedAt, storedRecord.decidedAt);
  assert.equal(persistedRecommendation.decidedMinute, 25);
  assert.equal(
    persistedRecommendation.decisionAgeMinutes,
    Math.round((Date.now() - storedRecord.decidedAt) / 60000),
    'decisionAgeMinutes = activationTime - decidedAt (rounded)'
  );
  assert.deepEqual(
    Object.keys(persistedRecommendation).sort(),
    ['confidence', 'decidedAt', 'decidedMinute', 'decisionAgeMinutes', 'decisionSource', 'margin', 'presetId', 'riskAppetite', 'runnerUp', 'situationKey'],
    'linkage fields are additive on the legacy productionRecommendation shape'
  );

  // (c) live path: the advisor scores the exact activation snapshot.
  labGameId = 'game-live';
  labTemplate = { ...labTemplate, gameId: 'game-live' };
  const liveGeneratedAt = Date.now() - 15 * 60 * 1000;
  labContext.document.defaultView.SLFCurrentActionHintEngine = {
    run() {
      return rawDecision({
        generatedAt: liveGeneratedAt,
        moment: { gameId: 'game-live', minute: 30, score: { state: 'losing' } },
        action: { preset: 'Klopp_LateGegenpress_v11', decision: 'late_high_pressure', score: 61, reason: 'поздний прессинг' }
      });
    }
  };
  const live = await runtime.activate();
  assert.equal(live.ok, true, `live scenario activated: ${live.reason || ''}`);
  const liveRecommendation = engine.loadManualState('game-live')?.tacticalLab?.activation?.entryContext?.productionRecommendation;
  assert.equal(liveRecommendation.presetId, 'Klopp_LateGegenpress_v11');
  assert.equal(liveRecommendation.decisionSource, 'live', 'advisor-scored decision is live');
  assert.equal(liveRecommendation.decidedAt, liveGeneratedAt);
  assert.equal(liveRecommendation.decidedMinute, 30);
  assert.equal(liveRecommendation.decisionAgeMinutes, Math.round((Date.now() - liveGeneratedAt) / 60000));
}

console.log('[tactical-decision-linkage-test] passed');
