#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-match-runtime.js'), 'utf8');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); writes.push(key); },
    removeItem(key) { values.delete(key); },
    read(key) { return values.has(key) ? JSON.parse(values.get(key)) : null; },
    has(key) { return values.has(key); },
    writes
  };
}

function createHarness(initialStorage = {}) {
  const localStorage = createStorage(initialStorage);
  const context = {
    console, Object, Array, Set, Symbol, Date, Error, Promise, String, Number, JSON,
    setTimeout, clearTimeout, setInterval, clearInterval, localStorage,
    document: { readyState: 'complete', body: { addEventListener() {} }, addEventListener() {} },
    location: { pathname: '/other.php', href: 'https://sublime.example/game.php?id=game-1' },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: { COLLECTIONS: { PRESET_EFFECTS: 'preset_effects_v2', PRESET_EVENTS: 'preset_events_v2' } },
    STATE: {
      pendingPresetEvent: null,
      pendingEffectRetry: false,
      recommendationFreeze: null,
      presetProgression: null,
      lastRecommendationHtml: null,
      lastRecommendationMeta: null,
      lastRuleDecision: null,
      tacticWatcherStarted: false,
      suppressManualWatcherUntil: 0,
      lastManualTactic: null,
      manualChangeTimer: null
    },
    MatchStateParser: {
      getGameId() { return 'game-1'; },
      getGenerationWindow(minute) { return { index: 1, label: '01-15', effectiveMinute: minute }; }
    },
    MatchTimingModel: { getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; } },
    SnapshotEngine: {
      __runtimeTelemetryIntegrityInstalled: false,
      build() { return { gameId: 'game-1', status: 'live', minute: 10, bucket: '01-15', myTeam: 1, tacticTelemetry: { transitions: [] } }; },
      sendMatchResult(snapshot) { return Promise.resolve(snapshot); }
    },
    EventTracker: {
      buildPresetEffect(snapshot) {
        const pending = context.STATE.pendingPresetEvent;
        if (!pending) return null;
        context.STATE.pendingPresetEvent = null;
        return { gameId: snapshot.gameId, effectKey: 'unstable' };
      },
      diffTactic() { return {}; },
      compactRuleDecision() { return null; }
    },
    Api: { postAppend() { return Promise.resolve({ status: 200 }); } },
    applyPresetAsync: async () => true,
    getCurrentTactic: () => ({ def_line: '1' })
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'manual-match-runtime.js' });
  return { context, localStorage };
}

const legacyKey = 'slf_live_parser_state_v2:game-1';
const manualKey = 'slf_manual_match_state_v1:game-1';
const legacyPending = { gameId: 'game-1', eventKey: 'legacy-event' };
const legacyRecord = {
  schema: 'slf_live_parser_state_v2',
  gameId: 'game-1',
  pendingPresetEvent: legacyPending,
  pendingEffectRetry: true,
  recommendationFreeze: { gameId: 'game-1', targetBucket: '16-30' },
  lastRecommendationHtml: '<div>legacy</div>',
  lastRecommendationMeta: { source: 'manual_hint_button' }
};
const harness = createHarness({ [legacyKey]: JSON.stringify(legacyRecord) });

assert.equal(typeof harness.context.SnapshotEngine.persistManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.loadManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.clearManualState, 'function');
assert.equal(harness.context.SnapshotEngine.persistLiveState, undefined);
assert.equal(harness.context.SnapshotEngine.loadLiveState, undefined);
assert.equal(harness.context.SnapshotEngine.clearLiveState, undefined);

const migrated = harness.context.SnapshotEngine.loadManualState('game-1');
assert.equal(migrated.schema, 'slf_manual_match_state_v1');
assert.equal(migrated.pendingPresetEvent.eventKey, 'legacy-event');
assert.ok(harness.localStorage.has(manualKey), 'legacy state was not migrated');
assert.ok(harness.localStorage.has(legacyKey), 'read-only fallback must not delete the old key during load');

const writesBeforePersist = harness.localStorage.writes.filter(key => key === legacyKey).length;
harness.context.STATE.pendingPresetEvent = { gameId: 'game-1', eventKey: 'next-event' };
harness.context.STATE.recommendationFreeze = { gameId: 'game-1', targetBucket: '31-45' };
const persisted = harness.context.SnapshotEngine.persistManualState({ pendingEffectRetry: false });
assert.equal(persisted.pendingPresetEvent.eventKey, 'next-event');
assert.equal(harness.localStorage.read(manualKey).pendingPresetEvent.eventKey, 'next-event');
assert.equal(harness.localStorage.read(legacyKey).pendingPresetEvent.eventKey, 'legacy-event');
assert.equal(
  harness.localStorage.writes.filter(key => key === legacyKey).length,
  writesBeforePersist,
  'manual persistence must never write the legacy key'
);

assert.equal(harness.context.SnapshotEngine.loadManualState('game-1').pendingPresetEvent.eventKey, 'next-event');
harness.context.SnapshotEngine.clearManualState('game-1');
assert.equal(harness.localStorage.has(manualKey), false);
assert.equal(harness.localStorage.has(legacyKey), false);

console.log('[manual-match-state-sunset-test] passed');
