#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const integritySource = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-state-integrity.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-match-runtime.js'), 'utf8');

function createHarness({
  pathname = '/other.php',
  ownMatch = true,
  effectPostFails = true,
  persistedPending = null,
  persistedV2 = null,
  failedCollections = []
} = {}) {
  const posted = [];
  const listeners = {};
  const storage = new Map();
  if (persistedPending) {
    storage.set('slf_live_parser_state_v2:game-1', JSON.stringify({
      schema: 'slf_live_parser_state_v2', gameId: 'game-1', pendingPresetEvent: persistedPending
    }));
  }
  if (persistedV2) storage.set('slf_manual_match_state_v2:game-1', JSON.stringify(persistedV2));
  const persisted = [];
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      storage.set(key, String(value));
      if (key.startsWith('slf_manual_match_state_v2:')) persisted.push(JSON.parse(String(value)));
    },
    removeItem(key) { storage.delete(key); }
  };
  let tactic = { def_line: '1', press_line: '1', priority: [] };
  let buildStatus = 'live';
  let minute = 10;
  let score = { home: 0, away: 0 };
  let buildCount = 0;
  let failSet = new Set(failedCollections);
  let playerObservationCalls = 0;
  const intervals = [];
  const wrappedSetInterval = (fn, ms) => {
    const id = setInterval(fn, ms);
    if (typeof id.unref === 'function') id.unref();
    intervals.push(id);
    return id;
  };
  const document = {
    readyState: 'complete',
    body: { addEventListener(type, listener) { listeners[type] = listener; } },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  const context = {
    console, Object, Array, Set, Symbol, Date, Error, Promise, String, Number, JSON, Math,
    setTimeout, clearTimeout, setInterval: wrappedSetInterval, clearInterval,
    localStorage, document,
    location: { pathname, href: `https://slf.fm${pathname}` },
    SLF_VERSION_INFO: { scriptVersion: '9.9.9-test' },
    CONFIG: { COLLECTIONS: {
      MATCH_SNAPSHOTS: 'match_snapshots_v2', MATCH_RESULTS: 'match_results_v2',
      PRESET_EVENTS: 'preset_events_v2', PRESET_EFFECTS: 'preset_effects_v2'
    } },
    STATE: {
      pendingPresetEvent: null,
      lastRuleDecision: null,
      suppressManualWatcherUntil: 0,
      tacticWatcherStarted: false,
      lastManualTactic: null,
      manualChangeTimer: null,
      telemetryV2PollTimer: null
    },
    MatchStateParser: {
      getGameId() { return 'game-1'; },
      getGenerationWindow(value) { return { index: value < 16 ? 1 : 2, label: value < 16 ? '01-15' : '16-30', effectiveMinute: value }; }
    },
    MatchTimingModel: { getTargetWindowAfterChange() { return { index: 2, label: '16-30' }; } },
    SnapshotEngine: {
      __runtimeTelemetryIntegrityInstalled: false,
      __tacticalTelemetryV2Installed: false,
      build() {
        buildCount += 1;
        const current = { ...tactic, priority: [...(tactic.priority || [])] };
        return {
          ts: Date.now(),
          gameId: 'game-1', status: buildStatus, minute, bucket: minute < 16 ? '01-15' : '16-30',
          generationWindow: { index: minute < 16 ? 1 : 2, label: minute < 16 ? '01-15' : '16-30', effectiveMinute: minute },
          score: { ...score }, teams: [1, 2],
          myTeam: ownMatch ? 1 : null, matchOwnership: ownMatch ? 'owned' : 'foreign',
          currentTactic: current,
          stats: ownMatch ? [
            { teamId: 1, stats: { xG: 0.2 + buildCount * 0.05, shots: buildCount, badActionsPct: 10, power: 100, defVector: 1, pressVector: 2 } },
            { teamId: 2, stats: { xG: 0.1 + buildCount * 0.02, shots: Math.max(0, buildCount - 1), badActionsPct: 12, power: 95, defVector: 1, pressVector: 1 } }
          ] : [],
          ruleDecision: null,
          tacticTelemetry: {
            schema: 'slf_tactic_telemetry_v1', libraryVersion: 'active_presets_v2_bold_policy_v3',
            recommendationSchema: 'slf_rule_decision_v3', riskAppetite: 'bold',
            currentPreset: current.def_line === '1' ? 'Preset_A' : 'Preset_B',
            transitions: [{ source: 'snapshot_build', tacticFingerprint: `fp-${buildCount}` }]
          }
        };
      },
      buildSnapshotRecord(snapshot) {
        return { ...snapshot, recordType: 'match_snapshot', schemaVersion: 2, snapshotKey: `snapshot|${snapshot.gameId}|${snapshot.minute}|${snapshot.score.home}:${snapshot.score.away}`, source: { page: 'game', scriptVersion: '9.9.9-test' } };
      },
      buildResultKey(snapshot) { return `match_result|${snapshot.gameId}|finished|${snapshot.score.home}:${snapshot.score.away}`; },
      sendMatchResult(snapshot) {
        const result = { ...snapshot, recordType: 'match_result', resultType: 'finished_match', resultKey: this.buildResultKey(snapshot), source: { page: 'game', scriptVersion: '9.9.9-test' } };
        playerObservationCalls += 1;
        return context.Api.postAppend('match_results_v2', result, 'match result');
      }
    },
    EventTracker: {
      buildPresetEffect(snapshot) {
        const pending = context.STATE.pendingPresetEvent;
        if (!pending) return null;
        context.STATE.pendingPresetEvent = null;
        return { recordType: 'preset_effect', gameId: snapshot.gameId, effectKey: `unstable-${Date.now()}`, before: pending.beforeSnapshot || null, after: snapshot };
      },
      diffTactic(oldTactic, newTactic) {
        return JSON.stringify(oldTactic) === JSON.stringify(newTactic)
          ? {}
          : { def_line: { from: oldTactic?.def_line, to: newTactic?.def_line } };
      },
      compactRuleDecision() { return null; }
    },
    Api: {
      postAppend(collection, payload, label) {
        posted.push({ collection, payload, label });
        if ((collection === 'preset_effects_v2' && effectPostFails && payload.eventType !== 'tactical_phase') || failSet.has(collection)) {
          return Promise.reject(Object.assign(new Error('network'), { kind: 'network' }));
        }
        return Promise.resolve({ status: 200 });
      }
    },
    async applyPresetAsync() { tactic = { def_line: '2', press_line: '1', priority: [] }; return true; },
    getCurrentTactic() { return { ...tactic, priority: [...(tactic.priority || [])] }; }
  };
  vm.createContext(context);
  vm.runInContext(integritySource, context, { filename: 'manual-state-integrity.js' });
  vm.runInContext(source, context, { filename: 'manual-match-runtime.js' });
  return {
    context, posted, persisted, listeners,
    getManualState() {
      const raw = storage.get('slf_manual_match_state_v2:game-1');
      return raw ? JSON.parse(raw) : null;
    },
    setTactic(value) { tactic = { ...value, priority: [...(value.priority || [])] }; },
    setBuildStatus(value) { buildStatus = value; },
    setMinute(value) { minute = value; },
    setScore(value) { score = { ...value }; },
    setFailedCollections(values) { failSet = new Set(values); },
    getPlayerObservationCalls() { return playerObservationCalls; },
    cleanup() { intervals.forEach(clearInterval); }
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
  await harness.context.SnapshotEngine.sendMatchResult({ status: 'finished', gameId: 'game-1', score: { home: 1, away: 0 } });
  await harness.context.applyPresetAsync('preset');
  assert.equal(harness.context.SnapshotEngine.build().tacticTelemetry.transitions[0].source, 'preset_apply');

  const pending = { gameId: 'game-1', eventKey: 'event-1', beforeSnapshot: snapshot };
  harness.context.STATE.pendingPresetEvent = pending;
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.equal(effect.effectKey, 'preset_effect|game-1|event-1');
  await assert.rejects(
    harness.context.Api.postAppend('preset_effects_v2', effect, 'effect'),
    error => error?.kind === 'network'
  );
  assert.equal(harness.context.STATE.pendingPresetEvent, pending);
  assert.equal(harness.getManualState().pendingEffectRetry, true);
  harness.cleanup();
}

{
  const pending = { gameId: 'game-1', eventKey: 'persisted-event' };
  const harness = createHarness({ effectPostFails: false, persistedPending: pending });
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.ok(effect, 'persisted legacy pending event was not restored');
  assert.equal(effect.effectKey, 'preset_effect|game-1|persisted-event');
  await harness.context.Api.postAppend('preset_effects_v2', effect, 'effect');
  assert.equal(harness.getManualState().schema, 'slf_manual_match_state_v2');
  assert.equal(harness.getManualState().pendingPresetEvent, null);
  assert.equal(harness.getManualState().pendingEffectRetry, false);
  assert.equal(harness.getManualState().consumedPresetEventKey, 'persisted-event');
  harness.cleanup();
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: true, effectPostFails: false });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(harness.context.STATE.tacticWatcherStarted, true);
  assert.equal(typeof harness.listeners.change, 'function');
  const phaseEvent = harness.posted.find(item => item.collection === 'preset_events_v2' && item.payload.type === 'tactical_phase_start');
  assert.ok(phaseEvent, 'initial tactical phase event was not posted');
  assert.equal(phaseEvent.payload.schemaVersion, 4);
  assert.ok(phaseEvent.payload.phaseId);
  const autoSnapshot = harness.posted.find(item => item.collection === 'match_snapshots_v2');
  assert.ok(autoSnapshot, 'automatic initial snapshot was not posted');
  assert.equal(autoSnapshot.payload.source.playerObservationsIncluded, false);
  assert.equal(autoSnapshot.payload.telemetryContext.scoreState, 'draw');
  assert.equal(harness.getManualState().schema, 'slf_manual_match_state_v2');
  assert.ok(harness.getManualState().openPhase?.phaseId);
  assert.equal(harness.getPlayerObservationCalls(), 0, 'automatic snapshots must not emit player observations');

  harness.setTactic({ def_line: '2', press_line: '1', priority: [] });
  harness.listeners.change({ target: { name: 'def_line', matches: selector => selector.includes('input[type="radio"]') } });
  await new Promise(resolve => setTimeout(resolve, 700));
  const manualEvent = harness.posted.find(item => item.collection === 'preset_events_v2' && item.payload.type === 'manual_change');
  assert.ok(manualEvent, 'manual tactic event was not posted');
  assert.equal(manualEvent.payload.schemaVersion, 4);
  assert.ok(manualEvent.payload.phaseId);
  assert.equal(manualEvent.payload.source.trigger, 'manual_tactic_control');
  assert.equal(manualEvent.payload.source.scriptVersion, '9.9.9-test');
  assert.equal('beforeSnapshot' in manualEvent.payload, false);
  assert.equal('snapshot' in manualEvent.payload, false);
  assert.equal(manualEvent.payload.tacticTelemetry.transitions, undefined);

  const phaseEffect = harness.posted.find(item => item.collection === 'preset_effects_v2' && item.payload.eventType === 'tactical_phase');
  assert.ok(phaseEffect, 'previous tactical phase was not closed on tactic change');
  assert.match(phaseEffect.payload.effectKey, /^tactical_phase_effect\|game-1\|phase\|/);
  assert.equal(phaseEffect.payload.eligibility.eligibleForRanking, false, 'zero-minute phase must not rank');
  harness.cleanup();
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: false, effectPostFails: false });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(harness.posted.some(item => item.collection === 'match_snapshots_v2'), false);
  assert.equal(harness.posted.some(item => item.payload?.type === 'tactical_phase_start'), false);
  harness.cleanup();
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: true, effectPostFails: false, failedCollections: ['match_snapshots_v2'] });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.ok(harness.getManualState().outbox.some(item => item.collection === 'match_snapshots_v2'), 'failed automatic snapshot was not queued');
  harness.setFailedCollections([]);
  const flushed = await harness.context.SnapshotEngine.telemetryV2.flushOutbox('game-1');
  assert.ok(flushed.delivered >= 1);
  assert.equal(harness.getManualState().outbox.some(item => item.collection === 'match_snapshots_v2'), false);
  harness.cleanup();
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: true, effectPostFails: false });
  await new Promise(resolve => setTimeout(resolve, 40));
  harness.setMinute(20);
  harness.setScore({ home: 1, away: 0 });
  harness.context.SnapshotEngine.build();
  await new Promise(resolve => setTimeout(resolve, 40));
  const scoreSnapshot = harness.posted.filter(item => item.collection === 'match_snapshots_v2').at(-1);
  assert.equal(scoreSnapshot.payload.telemetryContext.scoreState, 'winning');
  harness.setBuildStatus('finished');
  harness.context.SnapshotEngine.build();
  await new Promise(resolve => setTimeout(resolve, 40));
  const resultPosts = harness.posted.filter(item => item.collection === 'match_results_v2');
  assert.ok(resultPosts.length >= 1, 'finished own match was not submitted automatically');
  assert.equal(harness.getManualState().openPhase, null, 'finished match must close the open phase');
  harness.cleanup();
}

console.log('[manual-match-runtime-test] passed');
