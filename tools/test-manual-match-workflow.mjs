#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const eventTrackerSource = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/event-tracker.js'), 'utf8');
const runtimeIntegritySource = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-match-runtime.js'), 'utf8');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeSnapshot({
  gameId = 'game-1',
  status = 'live',
  minute = 10,
  bucket = '01-15',
  windowIndex = 1,
  myXG = 1,
  oppXG = 0.6,
  myShots = 4,
  oppShots = 2,
  myPower = 100,
  oppPower = 90,
  myDefVector = 20,
  oppDefVector = 18,
  myPressVector = 24,
  oppPressVector = 21,
  myXT = 0.4,
  oppXT = 0.2
} = {}) {
  return {
    ts: Date.now(),
    gameId,
    status,
    rawStatus: status,
    minute,
    bucket,
    generationWindow: { index: windowIndex, label: bucket, effectiveMinute: minute },
    score: { home: 0, away: 0 },
    teams: [1, 2],
    teamNames: { home: 'Mine', away: 'Opponent' },
    myTeam: 1,
    matchOwnership: 'owned',
    currentTactic: { def_line: '1', press_line: '2', priority: [] },
    developerHints: [],
    generatorQualitySignal: { schema: 'test_quality', detected: false },
    stats: [
      {
        teamId: 1,
        stats: {
          xG: myXG,
          shots: myShots,
          badActionsPct: 10,
          power: myPower,
          defVector: myDefVector,
          pressVector: myPressVector
        }
      },
      {
        teamId: 2,
        stats: {
          xG: oppXG,
          shots: oppShots,
          badActionsPct: 12,
          power: oppPower,
          defVector: oppDefVector,
          pressVector: oppPressVector
        }
      }
    ],
    xT: { myXT, oppXT },
    ruleDecision: null
  };
}

function createHarness({ effectPostFails = false, persistedPending = null } = {}) {
  const posted = [];
  const snapshotPosts = [];
  const persisted = [];
  const logs = [];
  let currentSnapshot = makeSnapshot();
  let storedPending = persistedPending;

  const localStorageData = new Map();
  if (persistedPending) {
    localStorageData.set('slf_live_parser_state_v2:game-1', JSON.stringify({
      schema: 'slf_live_parser_state_v2',
      gameId: 'game-1',
      pendingPresetEvent: clone(persistedPending)
    }));
  }

  const context = {
    console,
    Object,
    Array,
    Set,
    Map,
    Symbol,
    Date,
    Error,
    Promise,
    String,
    Number,
    JSON,
    Math,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { pathname: '/other.php', href: 'https://example.test/game.php?id=game-1' },
    document: {
      readyState: 'complete',
      body: { addEventListener() {} },
      addEventListener() {}
    },
    window: {},
    localStorage: {
      getItem(key) {
        return localStorageData.has(key) ? localStorageData.get(key) : null;
      },
      setItem(key, value) {
        localStorageData.set(key, String(value));
        if (key.startsWith('slf_manual_match_state_v2:')) {
          const parsed = JSON.parse(String(value));
          persisted.push(clone(parsed));
          storedPending = clone(parsed.pendingPresetEvent || null);
        }
      },
      removeItem(key) {
        localStorageData.delete(key);
      }
    },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: {
      COLLECTIONS: {
        MATCH_SNAPSHOTS: 'match_snapshots_v2',
        MATCH_RESULTS: 'match_results_v2',
        PRESET_EVENTS: 'preset_events_v2',
        PRESET_EFFECTS: 'preset_effects_v2'
      }
    },
    STATE: {
      pendingPresetEvent: null,
      presetProgression: null,
      lastRuleDecision: null,
      lastManualTelemetryFingerprint: null,
      suppressManualWatcherUntil: 0,
      tacticWatcherStarted: false,
      lastManualTactic: null,
      manualChangeTimer: null,
      tacticTransitionSourceHint: null,
      telemetryV2PollTimer: null
    },
    MatchStateParser: {
      getGameId() {
        return currentSnapshot.gameId;
      },
      getGenerationWindow(value) {
        return value >= 16
          ? { index: 2, label: '16-30', effectiveMinute: value }
          : { index: 1, label: '01-15', effectiveMinute: value };
      }
    },
    MatchTimingModel: {
      getWindow(value) {
        return context.MatchStateParser.getGenerationWindow(value);
      },
      getTargetWindowAfterChange() {
        return { index: 2, label: '16-30' };
      }
    },
    DeveloperHintParser: {
      getGeneratorQualitySignal() {
        return { schema: 'test_quality', detected: false };
      }
    },
    RecommendationEngine: {
      getXTForMyTeam(snapshot) {
        return {
          myXT: Number(snapshot?.xT?.myXT || 0),
          oppXT: Number(snapshot?.xT?.oppXT || 0)
        };
      }
    },
    PresetUsageTracker: { record() {} },
    PresetStorage: { getAllLabels() { return {}; } },
    UI: {
      addParserLog(message) { logs.push(String(message)); },
      updateParserStatus(message) { logs.push(String(message)); }
    },
    num(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    },
    getCurrentTactic() {
      return clone(currentSnapshot.currentTactic);
    },
    SnapshotEngine: {
      __tacticTelemetryEnvelopeInstalled: false,
      __runtimeTelemetryIntegrityInstalled: false,
      __tacticalTelemetryV2Installed: false,
      build() {
        return clone(currentSnapshot);
      },
      buildSnapshotRecord(snapshot) {
        return clone(snapshot);
      },
      sendSnapshot(snapshot) {
        snapshotPosts.push(clone(snapshot));
        return Promise.resolve({ status: 200 });
      },
      sendMatchResult(snapshot) {
        return Promise.resolve({ status: snapshot.status });
      },
      compactSnapshotForStorage(snapshot) {
        return clone(snapshot);
      },
      freezeRecommendationsAfterTacticChange() {}
    },
    Api: {
      postAppend(collection, payload, label) {
        posted.push({ collection, payload, label });
        if (collection === 'preset_effects_v2' && effectPostFails) {
          return Promise.reject(Object.assign(new Error('network'), { kind: 'network' }));
        }
        return Promise.resolve({ status: 200 });
      }
    },
    async applyPresetAsync() {
      return true;
    }
  };

  vm.createContext(context);
  vm.runInContext(
    `${eventTrackerSource}\n${runtimeIntegritySource}\nglobalThis.__EventTracker = EventTracker;`,
    context,
    { filename: 'manual-match-workflow.bundle.js' }
  );

  return {
    context,
    posted,
    snapshotPosts,
    persisted,
    logs,
    setSnapshot(snapshot) {
      currentSnapshot = clone(snapshot);
    },
    setPending(pending) {
      context.STATE.pendingPresetEvent = pending;
      storedPending = clone(pending);
    },
    getStoredPending() {
      return clone(storedPending);
    }
  };
}

async function flush() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

{
  const harness = createHarness();
  const first = makeSnapshot({ minute: 10, bucket: '01-15', windowIndex: 1 });
  harness.setSnapshot(first);

  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();
  assert.equal(harness.snapshotPosts.length, 1);
  assert.equal(harness.snapshotPosts[0].recommendationSource, 'manual_hint_button');
  assert.equal(harness.snapshotPosts[0].generatorVersion, 'manual-regression-v1');

  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();
  assert.equal(harness.snapshotPosts.length, 1, 'duplicate manual snapshot was not suppressed');

  harness.setSnapshot(makeSnapshot({ minute: 20, bucket: '16-30', windowIndex: 2, myPower: 101 }));
  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();
  assert.equal(harness.snapshotPosts.length, 2, 'changed manual snapshot was not submitted');
}

{
  const harness = createHarness({ effectPostFails: false });
  const before = makeSnapshot({ minute: 10, bucket: '01-15', windowIndex: 1 });
  const after = makeSnapshot({
    minute: 20,
    bucket: '16-30',
    windowIndex: 2,
    myXG: 1.4,
    oppXG: 0.7,
    myShots: 6,
    oppShots: 3,
    myPower: 102,
    oppPower: 88,
    myXT: 0.6,
    oppXT: 0.25
  });
  const pending = {
    ts: Date.now(),
    recordType: 'preset_event',
    eventKey: 'preset_event|game-1|10|01-15|test',
    type: 'preset',
    gameId: 'game-1',
    minute: 10,
    bucket: '01-15',
    generationWindow: before.generationWindow,
    targetGenerationWindow: { index: 2, label: '16-30' },
    presetName: 'test_preset',
    tactic: before.currentTactic,
    beforeSnapshot: before
  };

  harness.setPending(pending);
  harness.setSnapshot(after);
  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();

  const effectPost = harness.posted.find(item => item.collection === 'preset_effects_v2');
  assert.ok(effectPost, 'manual hint did not submit a preset effect');
  assert.equal(
    effectPost.payload.effectKey,
    'preset_effect|game-1|preset_event|game-1|10|01-15|test'
  );
  assert.equal(effectPost.payload.source.trigger, 'manual_hint_button');
  assert.equal(harness.context.STATE.pendingPresetEvent, null);
  assert.equal(harness.persisted.at(-1).schema, 'slf_manual_match_state_v2');
  assert.equal(harness.persisted.at(-1).pendingPresetEvent, null);
  assert.equal(harness.persisted.at(-1).consumedPresetEventKey, pending.eventKey);
  assert.equal(harness.snapshotPosts.length, 1, 'manual hint should also submit the after snapshot');
}

{
  const harness = createHarness({ effectPostFails: true });
  const before = makeSnapshot({ minute: 10, bucket: '01-15', windowIndex: 1 });
  const after = makeSnapshot({ minute: 20, bucket: '16-30', windowIndex: 2, myXG: 1.2 });
  const pending = {
    eventKey: 'preset_event|game-1|retry',
    type: 'preset',
    gameId: 'game-1',
    minute: 10,
    bucket: '01-15',
    generationWindow: before.generationWindow,
    targetGenerationWindow: { index: 2, label: '16-30' },
    presetName: 'retry_preset',
    beforeSnapshot: before
  };

  harness.setPending(pending);
  harness.setSnapshot(after);
  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();

  assert.equal(harness.context.STATE.pendingPresetEvent.eventKey, pending.eventKey);
  assert.equal(harness.getStoredPending().eventKey, pending.eventKey);
  assert.equal(harness.persisted.at(-1).schema, 'slf_manual_match_state_v2');
  assert.equal(harness.persisted.at(-1).pendingEffectRetry, true);
  assert.ok(
    harness.persisted.at(-1).outbox.some(item => item.collection === 'preset_effects_v2'),
    'failed effect should be retained in the v2 outbox'
  );
}

{
  const harness = createHarness();
  harness.setSnapshot(makeSnapshot({ status: 'finished', minute: 90, bucket: '85-90', windowIndex: 6 }));
  harness.context.SnapshotEngine.submitManualTelemetry(
    harness.context.SnapshotEngine.build(),
    'manual-regression-v1'
  );
  await flush();
  assert.equal(harness.snapshotPosts.length, 0, 'finished match must not submit a manual snapshot');

  await assert.rejects(
    harness.context.SnapshotEngine.sendMatchResult({ status: 'live' }),
    error => error?.kind === 'invalid_match_state'
  );
  await harness.context.SnapshotEngine.sendMatchResult({ status: 'finished' });
}

console.log('[manual-match-workflow-test] passed');
