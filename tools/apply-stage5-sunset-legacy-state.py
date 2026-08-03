#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count != expected:
        raise RuntimeError(f'{path}: expected {expected} occurrence(s), found {count}: {old!r}')
    write(path, content.replace(old, new))


def remove_range(path: str, start: str, end: str) -> None:
    content = read(path)
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f'{path}: start marker not found: {start!r}')
    end_index = content.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f'{path}: end marker not found: {end!r}')
    write(path, content[:start_index] + content[end_index:])


config_path = 'src/core/config.js'
snapshot_path = 'src/modules/manual-match-telemetry/snapshot-engine.js'
runtime_path = 'src/modules/manual-match-telemetry/manual-match-runtime.js'

replace_exact(config_path, 'const LIVE_PARSER_STATE_PREFIX = "slf_live_parser_state_v2";\n', '')

remove_range(
    snapshot_path,
    '    getLiveStorageKey(gameId = MatchStateParser.getGameId()) {\n',
    '    freezeRecommendationsAfterTacticChange(presetName, snapshot) {\n',
)

replace_exact(
    runtime_path,
    """    const originalPersistLiveState = typeof SnapshotEngine.persistLiveState === 'function'\n        ? SnapshotEngine.persistLiveState.bind(SnapshotEngine)\n        : null;\n    const originalLoadLiveState = typeof SnapshotEngine.loadLiveState === 'function'\n        ? SnapshotEngine.loadLiveState.bind(SnapshotEngine)\n        : null;\n    const originalClearLiveState = typeof SnapshotEngine.clearLiveState === 'function'\n        ? SnapshotEngine.clearLiveState.bind(SnapshotEngine)\n        : null;\n""",
    '',
)
replace_exact(
    runtime_path,
    """        load(gameId = null, legacyState = null) {\n            gameId = resolveGameId(gameId);\n            if (!gameId) return null;\n\n            const stored = readStoredState(manualStatePrefix, gameId);\n            if (stored?.schema === manualStateSchema) return stored;\n\n            const legacy = legacyState || readStoredState(legacyStatePrefix, gameId);\n""",
    """        load(gameId = null) {\n            gameId = resolveGameId(gameId);\n            if (!gameId) return null;\n\n            const stored = readStoredState(manualStatePrefix, gameId);\n            if (stored?.schema === manualStateSchema) return stored;\n\n            const legacy = readStoredState(legacyStatePrefix, gameId);\n""",
)
replace_exact(
    runtime_path,
    """        clear(gameId = null) {\n            gameId = resolveGameId(gameId);\n            if (!gameId || typeof localStorage === 'undefined') return;\n            try {\n                localStorage.removeItem(this.getStorageKey(gameId));\n            } catch (_) {}\n        }\n""",
    """        clear(gameId = null) {\n            gameId = resolveGameId(gameId);\n            if (!gameId || typeof localStorage === 'undefined') return;\n            try {\n                localStorage.removeItem(this.getStorageKey(gameId));\n                localStorage.removeItem(getStateKey(legacyStatePrefix, gameId));\n            } catch (_) {}\n        }\n""",
)
replace_exact(
    runtime_path,
    """    SnapshotEngine.manualMatchState = ManualMatchState;\n    SnapshotEngine.persistManualState = function persistManualState(extra = {}) {\n        if (originalPersistLiveState) originalPersistLiveState(extra);\n        return ManualMatchState.persist(extra);\n    };\n    SnapshotEngine.loadManualState = function loadManualState(gameId = null) {\n        gameId = resolveGameId(gameId);\n        const legacy = originalLoadLiveState ? originalLoadLiveState(gameId) : null;\n        return ManualMatchState.load(gameId, legacy);\n    };\n    SnapshotEngine.clearManualState = function clearManualState(gameId = null) {\n        gameId = resolveGameId(gameId);\n        if (originalClearLiveState) originalClearLiveState(gameId);\n        ManualMatchState.clear(gameId);\n    };\n\n    SnapshotEngine.persistLiveState = function persistLiveStateCompatibilityBridge(extra = {}) {\n        return SnapshotEngine.persistManualState(extra);\n    };\n    SnapshotEngine.loadLiveState = function loadLiveStateCompatibilityBridge(gameId = null) {\n        gameId = resolveGameId(gameId);\n        const legacy = originalLoadLiveState ? originalLoadLiveState(gameId) : null;\n        const manual = ManualMatchState.load(gameId, legacy);\n        if (!manual) return legacy;\n        if (!legacy) return manual;\n\n        return Object.assign({}, legacy, manual, {\n            schema: legacy.schema || manual.schema,\n            active: !!legacy.active,\n            gameId: manual.gameId || legacy.gameId\n        });\n    };\n    SnapshotEngine.clearLiveState = function clearLiveStateCompatibilityBridge(gameId = null) {\n        gameId = resolveGameId(gameId);\n        SnapshotEngine.clearManualState(gameId);\n    };\n\n""",
    """    SnapshotEngine.manualMatchState = ManualMatchState;\n    SnapshotEngine.persistManualState = function persistManualState(extra = {}) {\n        return ManualMatchState.persist(extra);\n    };\n    SnapshotEngine.loadManualState = function loadManualState(gameId = null) {\n        return ManualMatchState.load(resolveGameId(gameId));\n    };\n    SnapshotEngine.clearManualState = function clearManualState(gameId = null) {\n        ManualMatchState.clear(resolveGameId(gameId));\n    };\n\n""",
)

# Update dependency manifest after deleting the global legacy prefix and snapshot storage helpers.
manifest_path = ROOT / 'src/app/bundle-order.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
modules = {entry['file']: entry for entry in manifest['dependencyAudit']['modules']}
config = modules['src/core/config.js']
config['declares'] = [name for name in config.get('declares', []) if name != 'LIVE_PARSER_STATE_PREFIX']
config['public'] = [name for name in config.get('public', []) if name != 'LIVE_PARSER_STATE_PREFIX']
snapshot = modules['src/modules/manual-match-telemetry/snapshot-engine.js']
for requirement in snapshot.get('requires', []):
    if requirement.get('file') == 'src/core/config.js':
        requirement['symbols'] = [name for name in requirement.get('symbols', []) if name != 'LIVE_PARSER_STATE_PREFIX']
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Replace bridge regression with the sunset contract.
state_test = r'''#!/usr/bin/env node
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
'''
write('tools/test-manual-match-state-bridge.mjs', state_test)

runtime_test = r'''#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-match-runtime.js'), 'utf8');

function createHarness({ pathname = '/other.php', ownMatch = true, effectPostFails = true, persistedPending = null } = {}) {
  const posted = [];
  const listeners = {};
  const storage = new Map();
  if (persistedPending) {
    storage.set('slf_live_parser_state_v2:game-1', JSON.stringify({
      schema: 'slf_live_parser_state_v2', gameId: 'game-1', pendingPresetEvent: persistedPending
    }));
  }
  const persisted = [];
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      storage.set(key, String(value));
      if (key.startsWith('slf_manual_match_state_v1:')) persisted.push(JSON.parse(String(value)));
    },
    removeItem(key) { storage.delete(key); }
  };
  let tactic = { def_line: '1' };
  let buildStatus = 'live';
  let buildCount = 0;
  const document = {
    readyState: 'complete',
    body: { addEventListener(type, listener) { listeners[type] = listener; } },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
  const context = {
    console, Object, Array, Set, Symbol, Date, Error, Promise, String, Number, JSON,
    setTimeout, clearTimeout, setInterval, clearInterval, localStorage, document,
    location: { pathname, href: `https://slf.fm${pathname}` },
    SLF_VERSION_INFO: { scriptVersion: 'test' },
    CONFIG: { COLLECTIONS: { PRESET_EVENTS: 'preset_events_v2', PRESET_EFFECTS: 'preset_effects_v2' } },
    STATE: {
      pendingPresetEvent: null,
      lastRuleDecision: null,
      suppressManualWatcherUntil: 0,
      tacticWatcherStarted: false,
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
      build() {
        buildCount += 1;
        return {
          gameId: 'game-1', status: buildStatus, minute: 10, bucket: '01-15',
          myTeam: ownMatch ? 1 : null, matchOwnership: ownMatch ? 'owned' : 'foreign',
          ruleDecision: null,
          tacticTelemetry: { transitions: [{ source: 'snapshot_build', tacticFingerprint: `fp-${buildCount}` }] }
        };
      },
      sendMatchResult(snapshot) { return Promise.resolve({ status: snapshot.status }); }
    },
    EventTracker: {
      buildPresetEffect(snapshot) {
        const pending = context.STATE.pendingPresetEvent;
        if (!pending) return null;
        context.STATE.pendingPresetEvent = null;
        return { recordType: 'preset_effect', gameId: snapshot.gameId, effectKey: `unstable-${Date.now()}` };
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
        if (collection === 'preset_effects_v2' && effectPostFails) {
          return Promise.reject(Object.assign(new Error('network'), { kind: 'network' }));
        }
        return Promise.resolve({ status: 200 });
      }
    },
    async applyPresetAsync() { return true; },
    getCurrentTactic() { return { ...tactic }; }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'manual-match-runtime.js' });
  return {
    context, posted, persisted, listeners,
    getManualState() {
      const raw = storage.get('slf_manual_match_state_v1:game-1');
      return raw ? JSON.parse(raw) : null;
    },
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
  assert.equal(harness.context.SnapshotEngine.build().tacticTelemetry.transitions[0].source, 'preset_apply');

  const pending = { gameId: 'game-1', eventKey: 'event-1' };
  harness.context.STATE.pendingPresetEvent = pending;
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.equal(effect.effectKey, 'preset_effect|game-1|event-1');
  await assert.rejects(
    harness.context.Api.postAppend('preset_effects_v2', effect, 'effect'),
    error => error?.kind === 'network'
  );
  assert.equal(harness.context.STATE.pendingPresetEvent, pending);
  assert.equal(harness.getManualState().pendingEffectRetry, true);
}

{
  const pending = { gameId: 'game-1', eventKey: 'persisted-event' };
  const harness = createHarness({ effectPostFails: false, persistedPending: pending });
  const effect = harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' });
  assert.ok(effect, 'persisted legacy pending event was not restored');
  assert.equal(effect.effectKey, 'preset_effect|game-1|persisted-event');
  await harness.context.Api.postAppend('preset_effects_v2', effect, 'effect');
  assert.equal(harness.getManualState().pendingPresetEvent, null);
  assert.equal(harness.getManualState().pendingEffectRetry, false);
  assert.equal(harness.getManualState().consumedPresetEventKey, 'persisted-event');
}

{
  const harness = createHarness({
    effectPostFails: false,
    persistedPending: { gameId: 'other-game', eventKey: 'wrong-game' }
  });
  assert.equal(harness.context.EventTracker.buildPresetEffect({ gameId: 'game-1' }), null);
}

{
  const harness = createHarness({ pathname: '/game.php', ownMatch: true });
  assert.equal(harness.context.STATE.tacticWatcherStarted, true);
  assert.equal(typeof harness.listeners.change, 'function');
  harness.setTactic({ def_line: '2' });
  harness.listeners.change({ target: { name: 'def_line', matches: selector => selector.includes('input[type="radio"]') } });
  await new Promise(resolve => setTimeout(resolve, 650));
  const eventPost = harness.posted.find(item => item.collection === 'preset_events_v2');
  assert.ok(eventPost, 'manual tactic event was not posted');
  assert.equal(eventPost.payload.type, 'manual_change');
  assert.equal(eventPost.payload.source.trigger, 'manual_tactic_control');
  assert.equal(harness.context.STATE.pendingPresetEvent.eventKey, eventPost.payload.eventKey);
  assert.equal(eventPost.payload.tacticTelemetry.transitions.at(-1).source, 'manual_change');
}

console.log('[manual-match-runtime-test] passed');
'''
write('tools/test-manual-match-runtime.mjs', runtime_test)

# Strengthen legacy boundary assertions.
boundary_path = 'tools/test-legacy-live-parser-boundary.mjs'
boundary = read(boundary_path)
marker = "console.log('[legacy-live-parser-boundary-test] passed');"
extra = """assert.doesNotMatch(configSource, /LIVE_PARSER_STATE_PREFIX/);\nassert.doesNotMatch(snapshotEngine, /persistLiveState|loadLiveState|clearLiveState|getLiveStorageKey/);\nassert.doesNotMatch(runtimeIntegrity, /persistLiveState|loadLiveState|clearLiveState|originalPersistLiveState|originalLoadLiveState|originalClearLiveState/);\nassert.match(runtimeIntegrity, /legacyStatePrefix = 'slf_live_parser_state_v2'/);\n\n"""
if marker not in boundary:
    raise RuntimeError('legacy boundary completion marker not found')
write(boundary_path, boundary.replace(marker, extra + marker))

# Update machine-readable audit.
review_path = ROOT / 'data/audit/manual-match-symbol-review-v1.json'
review = json.loads(review_path.read_text(encoding='utf-8'))
removed_names = {
    'LIVE_PARSER_STATE_PREFIX',
    'SnapshotEngine.persistLiveState',
    'SnapshotEngine.loadLiveState',
}
removed_entries = [item for item in review['symbols'] if item['symbol'] in removed_names]
if {item['symbol'] for item in removed_entries} != removed_names:
    missing = removed_names - {item['symbol'] for item in removed_entries}
    raise RuntimeError(f'missing Stage 5 audit entries: {sorted(missing)}')
review['symbols'] = [item for item in review['symbols'] if item['symbol'] not in removed_names]
review.setdefault('removedSymbols', []).extend([
    {
        'symbol': item['symbol'],
        'removedInStage': 5,
        'trackingIssue': 151,
        'reason': 'Legacy state write and compatibility API removed after published transition release 4.4.260.',
    }
    for item in removed_entries
])
review['stage5'] = {
    'issue': 151,
    'status': 'implemented',
    'publishedTransitionVersion': '4.4.260',
    'exitCriterion': 'Only the new manual-state key is written; legacy state is read-only migration input and compatibility APIs are absent.',
}
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

contract_path = ROOT / 'data/audit/manual-state-envelope-v1.json'
contract = json.loads(contract_path.read_text(encoding='utf-8'))
contract['legacyCompatibility'].update({
    'readFallback': True,
    'migrateOnRead': True,
    'dualWrite': False,
    'writeLegacy': False,
    'deleteLegacyOnMigration': False,
    'clearBothKeys': True,
    'publishedTransitionVersion': '4.4.260',
    'status': 'read_only_fallback',
})
contract['compatibilityApi'] = []
contract['legacyCompatibility']['removedApi'] = [
    'SnapshotEngine.persistLiveState',
    'SnapshotEngine.loadLiveState',
    'SnapshotEngine.clearLiveState',
]
contract['stage5'] = {
    'status': 'implemented',
    'trackingIssue': 151,
    'publishedTransitionVersion': '4.4.260',
}
contract['nextRemovalGate'] = [
    'Verify one production manual event-to-effect path on the post-sunset published userscript.',
    'Decide whether the read-only legacy fallback can be removed in the final audit PR.',
]
contract_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

write(
    'docs/audit/legacy-live-parser-stage5-2026-08-03.md',
    """# Legacy live-parser removal — Stage 5\n\nTracking issue: #151.\n\n## Release gate\n\nPublished userscript `4.4.260` contains the manual-state envelope and renamed manual telemetry layout. It contains neither `startLive` nor `liveParserTimer`.\n\n## Removed\n\n- writes to `slf_live_parser_state_v2:<gameId>`;\n- global `LIVE_PARSER_STATE_PREFIX`;\n- `SnapshotEngine.persistLiveState`;\n- `SnapshotEngine.loadLiveState`;\n- `SnapshotEngine.clearLiveState`;\n- legacy storage helpers from the snapshot engine.\n\n## Retained\n\nA read-only fallback for `slf_live_parser_state_v2:<gameId>` remains inside the manual-state loader. A valid old record is copied to `slf_manual_match_state_v1:<gameId>`. `clearManualState()` deletes both keys.\n\n## Exit criterion\n\nThe active runtime writes only the manual-state key and exposes only manual-state APIs.\n""",
)

print('[stage5-sunset-legacy-state] applied')
