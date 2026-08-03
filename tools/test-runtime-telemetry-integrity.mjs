#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/modules/live-parser/runtime-telemetry-integrity.js'), 'utf8');

function createHarness({
  pathname = '/other.php',
  ownMatch = true,
  effectPostFails = true,
  persistedPending = null
} = {}) {
  const posted = [];
  const persisted = [];
  const listeners = {};
  let tactic = { def_line: '1' };
  let buildStatus = 'live';
  let buildCount = 0;
  let storedPending = persistedPending;

  const document = {
    readyState: 'complete',
    body: {
      addEventListener(type, listener) {
        listeners[type] = listener;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  };

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
    document,
    location: { pathname },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: {
      COLLECTIONS: {
        PRESET_EVENTS: 'preset_events_v2',
        PRESET_EFFECTS: 'preset_effects_v2'
      }
    },
    STATE: {
      pendingPresetEvent: null,
      liveParserTimer: null,
      lastRuleDecision: null,
      suppressManualWatcherUntil: 0,
      tacticWatcherStarted: false,
      lastManualTactic: null,
      manualChangeTimer: null
    },
    MatchStateParser: {
      getGameId() {
        return 'game-1';
      },
      getGenerationWindow(minute) {
        return { index: 1, label: '01-15', effectiveMinute: minute };
      }
    },
    MatchTimingModel: {
      getTargetWindowAfterChange() {
        return { index: 2, label: '16-30' };
      }
    },
    SnapshotEngine: {
      __runtimeTelemetryIntegrityInstalled: false,
      build() {
        buildCount += 1;
        return {
          gameId: 'game-1',
          status: buildStatus,
          minute: 10,
          bucket: '01-15',
          myTeam: ownMatch ? 1 : null,
          matchOwnership: ownMatch ? 'owned' : 'foreign',
          ruleDecision: null,
          tacticTelemetry: {
            transitions: [{ source: 'snapshot_build', tacticFingerprint: `fp-${buildCount}` }]
          }
        };
      },
      sendMatchResult(snapshot) {
        return Promise.resolve({ status: snapshot.status });
      },
      loadLiveState(gameId) {
        if (!storedPending) return null;
        return {
          schema: 'slf_live_parser_state_v2',
          gameId,
          pendingPresetEvent: storedPending
        };
      },
      persistLiveState(value) {
        persisted.push(value);
        if (Object.prototype.hasOwnProperty.call(value, 'pendingPresetEvent')) {
          storedPending = value.pendingPresetEvent;
        } else if (context.STATE.pendingPresetEvent) {
          storedPending = context.STATE.pendingPresetEvent;
        }
      }
    },
    EventTracker: {
      buildPresetEffect(snapshot) {
        const pending = context.STATE.pendingPresetEvent;
        if (!pending) return null;
        context.STATE.pendingPresetEvent = null;
        return {
          recordType: 'preset_effect',
          gameId: snapshot.gameId,
          effectKey: `unstable-${Date.now()}`
        };
      },
      diffTactic(oldTactic, newTactic) {
        return JSON.stringify(oldTactic) === JSON.stringify(newTactic)
          ? {}
          : { def_line: { from: oldTactic?.def_line, to: newTactic?.def_line } };
      },
      compactRuleDecision() {
        return null;
      }
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
    },
    getCurrentTactic() {
      return { ...tactic };
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'runtime-telemetry-integrity.js' });

  return {
    context,
    posted,
    persisted,
    listeners,
    getStoredPending() { return storedPending; },
    setTactic(value) { tactic = { ...value }; },
    setBuildStatus(value) { buildStatus = value; }
  };
}

{
  const harness = createHarness();
  const snapshot = harness.context.SnapshotEngine.build();
  assert.equal(snapshot.tacticTelemetry.transitions[0].source, 'snapshot_observation');

  await assert.rejects(
    harness.context.SnapshotEngine.sendMatchResult({ status: 'live' }),
    error => error?.kind === 'invalid_match_state'
  );
  await harness.context.SnapshotEngine.sendMatchResult({ status: 'finished' });

  await harness.context.applyPresetAsync('preset');
  const presetSnapshot = harness.context.SnapshotEngine.build();
  assert.equal(presetSnapshot.tacticTelemetry.transitions[0].source, 'preset_apply');

  const pending = { gameId: 'game-1', eventKey: 'event-1' };
  harness.context.STATE.pendingPresetEvent = pending;
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.equal(effect.effectKey, 'preset_effect|game-1|event-1');
  assert.equal(harness.context.STATE.pendingPresetEvent, null);
  await assert.rejects(
    harness.context.Api.postAppend('preset_effects_v2', effect, 'effect'),
    error => error?.kind === 'network'
  );
  assert.equal(harness.context.STATE.pendingPresetEvent, pending);
  assert.equal(harness.persisted.at(-1).pendingEffectRetry, true);
}

{
  const pending = { gameId: 'game-1', eventKey: 'persisted-event' };
  const harness = createHarness({ effectPostFails: false, persistedPending: pending });
  assert.equal(harness.context.STATE.pendingPresetEvent, null);

  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.ok(effect, 'persisted pending event was not restored');
  assert.equal(effect.effectKey, 'preset_effect|game-1|persisted-event');
  assert.equal(harness.context.STATE.pendingPresetEvent, null);

  await harness.context.Api.postAppend('preset_effects_v2', effect, 'effect');
  assert.equal(harness.persisted.at(-1).pendingPresetEvent, null);
  assert.equal(harness.persisted.at(-1).pendingEffectRetry, false);
  assert.equal(harness.persisted.at(-1).consumedPresetEventKey, 'persisted-event');
  assert.equal(harness.getStoredPending(), null);
}

{
  const harness = createHarness({
    effectPostFails: false,
    persistedPending: { gameId: 'other-game', eventKey: 'wrong-game' }
  });
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.equal(effect, null);
  assert.equal(harness.context.STATE.pendingPresetEvent, null);
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: true });
  assert.equal(harness.context.STATE.tacticWatcherStarted, true);
  assert.equal(typeof harness.listeners.change, 'function');

  harness.setTactic({ def_line: '2' });
  harness.listeners.change({
    target: {
      name: 'def_line',
      matches(selector) {
        return selector.includes('input[type="radio"]');
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 650));

  const eventPost = harness.posted.find(item => item.collection === 'preset_events_v2');
  assert.ok(eventPost, 'manual tactic event was not posted');
  assert.equal(eventPost.payload.type, 'manual_change');
  assert.equal(eventPost.payload.source.trigger, 'manual_tactic_control');
  assert.equal(harness.context.STATE.pendingPresetEvent.eventKey, eventPost.payload.eventKey);
  assert.equal(eventPost.payload.tacticTelemetry.transitions.at(-1).source, 'manual_change');
}

console.log('[runtime-telemetry-integrity-test] passed');
