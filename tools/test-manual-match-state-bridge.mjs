#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/modules/live-parser/runtime-telemetry-integrity.js'), 'utf8');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    read(key) { return values.has(key) ? JSON.parse(values.get(key)) : null; },
    has(key) { return values.has(key); }
  };
}

function createHarness(initialStorage = {}) {
  const localStorage = createStorage(initialStorage);
  const context = {
    console,
    Object,
    Array,
    Set,
    Symbol,
    Date,
    Error,
    Promise,
    String,
    Number,
    JSON,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage,
    document: {
      readyState: 'complete',
      body: { addEventListener() {} },
      addEventListener() {}
    },
    location: { pathname: '/other.php', href: 'https://sublime.example/game.php?id=game-1' },
    LIVE_PARSER_STATE_PREFIX: 'slf_live_parser_state_v2',
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: { COLLECTIONS: { PRESET_EFFECTS: 'preset_effects_v2', PRESET_EVENTS: 'preset_events_v2' } },
    STATE: {
      liveParserTimer: null,
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
    MatchTimingModel: {
      getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; }
    },
    SnapshotEngine: {
      __runtimeTelemetryIntegrityInstalled: false,
      build() {
        return {
          gameId: 'game-1', status: 'live', minute: 10, bucket: '01-15', myTeam: 1,
          tacticTelemetry: { transitions: [] }
        };
      },
      sendMatchResult(snapshot) { return Promise.resolve(snapshot); },
      persistLiveState(extra = {}) {
        const key = 'slf_live_parser_state_v2:game-1';
        const previous = localStorage.read(key) || {};
        localStorage.setItem(key, JSON.stringify({
          ...previous,
          schema: 'slf_live_parser_state_v2',
          gameId: 'game-1',
          active: !!extra.active,
          pendingPresetEvent: Object.prototype.hasOwnProperty.call(extra, 'pendingPresetEvent')
            ? extra.pendingPresetEvent
            : context.STATE.pendingPresetEvent,
          recommendationFreeze: context.STATE.recommendationFreeze,
          presetProgression: context.STATE.presetProgression,
          lastRecommendationHtml: context.STATE.lastRecommendationHtml,
          lastRecommendationMeta: context.STATE.lastRecommendationMeta,
          ...extra
        }));
      },
      loadLiveState(gameId) {
        const value = localStorage.read(`slf_live_parser_state_v2:${gameId}`);
        return value?.schema === 'slf_live_parser_state_v2' ? value : null;
      },
      clearLiveState(gameId) {
        localStorage.removeItem(`slf_live_parser_state_v2:${gameId}`);
      }
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
    getCurrentTactic: () => ({ def_line: '1' }),
    debugWarn() {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'runtime-telemetry-integrity.js' });
  return { context, localStorage };
}

const legacyPending = { gameId: 'game-1', eventKey: 'legacy-event' };
const legacyKey = 'slf_live_parser_state_v2:game-1';
const manualKey = 'slf_manual_match_state_v1:game-1';
const harness = createHarness({
  [legacyKey]: JSON.stringify({
    schema: 'slf_live_parser_state_v2',
    gameId: 'game-1',
    active: true,
    pendingPresetEvent: legacyPending,
    pendingEffectRetry: true,
    recommendationFreeze: { gameId: 'game-1', targetBucket: '16-30' },
    lastRecommendationHtml: '<div>legacy</div>',
    lastRecommendationMeta: { source: 'manual_hint_button' }
  })
});

assert.equal(typeof harness.context.SnapshotEngine.persistManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.loadManualState, 'function');
assert.equal(typeof harness.context.SnapshotEngine.clearManualState, 'function');

const migrated = harness.context.SnapshotEngine.loadManualState('game-1');
assert.equal(migrated.schema, 'slf_manual_match_state_v1');
assert.equal(migrated.pendingPresetEvent.eventKey, 'legacy-event');
assert.equal(migrated.pendingEffectRetry, true);
assert.equal(migrated.lastRecommendationMeta.source, 'manual_hint_button');
assert.ok(harness.localStorage.has(manualKey), 'legacy state was not migrated to the manual key');
assert.ok(harness.localStorage.has(legacyKey), 'legacy key must remain during migration');

const compatibility = harness.context.SnapshotEngine.loadLiveState('game-1');
assert.equal(compatibility.schema, 'slf_live_parser_state_v2');
assert.equal(compatibility.active, true);
assert.equal(compatibility.pendingPresetEvent.eventKey, 'legacy-event');

const nextPending = { gameId: 'game-1', eventKey: 'next-event' };
harness.context.STATE.pendingPresetEvent = nextPending;
harness.context.STATE.recommendationFreeze = { gameId: 'game-1', targetBucket: '31-45' };
harness.context.STATE.presetProgression = { gameId: 'game-1', lastAppliedPreset: 'preset-a' };
harness.context.STATE.lastRecommendationHtml = '<div>current</div>';
harness.context.STATE.lastRecommendationMeta = { source: 'manual_hint_button', minute: 31 };

const persisted = harness.context.SnapshotEngine.persistManualState({
  active: false,
  pendingEffectRetry: false,
  consumedPresetEventKey: 'legacy-event',
  manualTacticEventPending: true
});

assert.equal(persisted.schema, 'slf_manual_match_state_v1');
assert.equal(persisted.pendingPresetEvent.eventKey, 'next-event');
assert.equal(persisted.consumedPresetEventKey, 'legacy-event');
assert.equal(persisted.manualTacticEventPending, true);
assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'active'), false);
assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'lastSavedBucket'), false);

const newRecord = harness.localStorage.read(manualKey);
const legacyRecord = harness.localStorage.read(legacyKey);
assert.equal(newRecord.pendingPresetEvent.eventKey, 'next-event');
assert.equal(legacyRecord.pendingPresetEvent.eventKey, 'next-event');
assert.equal(legacyRecord.schema, 'slf_live_parser_state_v2');

legacyRecord.pendingPresetEvent = { gameId: 'game-1', eventKey: 'stale-legacy' };
harness.localStorage.setItem(legacyKey, JSON.stringify(legacyRecord));
assert.equal(
  harness.context.SnapshotEngine.loadManualState('game-1').pendingPresetEvent.eventKey,
  'next-event',
  'new manual state must take precedence over stale legacy state'
);

harness.context.SnapshotEngine.clearManualState('game-1');
assert.equal(harness.localStorage.has(manualKey), false);
assert.equal(harness.localStorage.has(legacyKey), false);

console.log('[manual-match-state-bridge-test] passed');
