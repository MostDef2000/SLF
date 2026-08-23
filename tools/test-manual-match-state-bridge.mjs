#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const integritySource = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-state-integrity.js'), 'utf8');
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
    console, Object, Array, Set, Symbol, Date, Error, Promise, String, Number, JSON, Math,
    setTimeout, clearTimeout, setInterval, clearInterval, localStorage,
    document: { readyState: 'complete', body: { addEventListener() {} }, addEventListener() {} },
    location: { pathname: '/other.php', href: 'https://sublime.example/game.php?id=game-1' },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: {
      COLLECTIONS: {
        MATCH_SNAPSHOTS: 'match_snapshots_v2',
        MATCH_RESULTS: 'match_results_v2',
        PRESET_EFFECTS: 'preset_effects_v2',
        PRESET_EVENTS: 'preset_events_v2'
      }
    },
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
      manualChangeTimer: null,
      telemetryV2PollTimer: null
    },
    MatchStateParser: {
      getGameId() { return 'game-1'; },
      getGenerationWindow(minute) { return { index: 1, label: '01-15', effectiveMinute: minute }; }
    },
    MatchTimingModel: { getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; } },
    SnapshotEngine: {
      __runtimeTelemetryIntegrityInstalled: false,
      __tacticalTelemetryV2Installed: false,
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
  vm.runInContext(integritySource, context, { filename: 'manual-state-integrity.js' });
  vm.runInContext(source, context, { filename: 'manual-match-runtime.js' });
  return { context, localStorage };
}

const liveLegacyKey = 'slf_live_parser_state_v2:game-1';
const v1Key = 'slf_manual_match_state_v1:game-1';
const v2Key = 'slf_manual_match_state_v2:game-1';
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
const harness = createHarness({ [liveLegacyKey]: JSON.stringify(legacyRecord) });

assert.equal(typeof harness.context.SnapshotEngine.persistManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.loadManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.clearManualState, 'function');
assert.equal(harness.context.SnapshotEngine.persistLiveState, undefined);
assert.equal(harness.context.SnapshotEngine.loadLiveState, undefined);
assert.equal(harness.context.SnapshotEngine.clearLiveState, undefined);

const migrated = harness.context.SnapshotEngine.loadManualState('game-1');
assert.equal(migrated.schema, 'slf_manual_match_state_v2');
assert.equal(migrated.pendingPresetEvent.eventKey, 'legacy-event');
assert.equal(migrated.sessionId, 'match-session|game-1');
assert.ok(harness.localStorage.has(v2Key), 'legacy state was not migrated to v2');
assert.ok(harness.localStorage.has(v1Key), 'v1 bridge should be created while reading the old live state');
assert.ok(harness.localStorage.has(liveLegacyKey), 'migration load must not destructively delete legacy state');

const v1WritesBeforePersist = harness.localStorage.writes.filter(key => key === v1Key).length;
const liveWritesBeforePersist = harness.localStorage.writes.filter(key => key === liveLegacyKey).length;
harness.context.STATE.pendingPresetEvent = { gameId: 'game-1', eventKey: 'next-event' };
harness.context.STATE.recommendationFreeze = { gameId: 'game-1', targetBucket: '31-45' };
const persisted = harness.context.SnapshotEngine.persistManualState({ pendingEffectRetry: false });
assert.equal(persisted.schema, 'slf_manual_match_state_v2');
assert.equal(persisted.pendingPresetEvent.eventKey, 'next-event');
assert.equal(harness.localStorage.read(v2Key).pendingPresetEvent.eventKey, 'next-event');
assert.equal(harness.localStorage.read(v1Key).pendingPresetEvent.eventKey, 'legacy-event');
assert.equal(harness.localStorage.read(liveLegacyKey).pendingPresetEvent.eventKey, 'legacy-event');
assert.equal(
  harness.localStorage.writes.filter(key => key === v1Key).length,
  v1WritesBeforePersist,
  'v2 persistence must not keep writing the superseded v1 key'
);
assert.equal(
  harness.localStorage.writes.filter(key => key === liveLegacyKey).length,
  liveWritesBeforePersist,
  'v2 persistence must never write the old live key'
);

assert.equal(harness.context.SnapshotEngine.loadManualState('game-1').pendingPresetEvent.eventKey, 'next-event');
harness.context.SnapshotEngine.clearManualState('game-1');
assert.equal(harness.localStorage.has(v2Key), false);
assert.equal(harness.localStorage.has(v1Key), false);
assert.equal(harness.localStorage.has(liveLegacyKey), false);

console.log('[manual-match-state-v2-bridge-test] passed');
