#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const sourcePath = path.join(root, 'src/modules/live-parser/event-tracker.js');
const releasePath = path.join(root, 'releases/latest.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const release = fs.readFileSync(releasePath, 'utf8');

let snapshotTemplate = null;
const clone = value => JSON.parse(JSON.stringify(value));

const context = {
  console,
  Object,
  Array,
  Map,
  Set,
  Date,
  JSON,
  String,
  Number,
  Promise,
  setTimeout,
  clearTimeout,
  location: { href: 'https://slf.fm/game.php?id=game-1', pathname: '/game.php' },
  document: { body: null },
  localStorage: {
    getItem(key) {
      return key === 'slf:tactics:risk-appetite' ? 'bold' : null;
    }
  },
  window: {
    SLFCurrentActionHintEngine: {
      TACTIC_SIGNATURES: {
        test_preset: { def_line: '2', press_line: '3' }
      },
      tacticMatches(signature, tactic) {
        return Object.entries(signature).every(([key, value]) => tactic?.[key] === value);
      }
    },
    SLFActivePresetRegistry: { active: ['test_preset'] }
  },
  STATE: {
    pendingPresetEvent: null,
    lastRuleDecision: null,
    presetProgression: null,
    suppressManualWatcherUntil: 0,
    tacticWatcherStarted: false,
    lastManualTactic: null,
    manualChangeTimer: null
  },
  CONFIG: {
    COLLECTIONS: {
      PRESET_EVENTS: 'preset_events_v2',
      PRESET_EFFECTS: 'preset_effects_v2'
    }
  },
  SLF_VERSION_INFO: { scriptVersion: 'test' },
  MatchStateParser: {
    getGameId() {
      return 'game-1';
    },
    getGenerationWindow(minute) {
      return minute >= 16
        ? { index: 2, label: '16-30' }
        : { index: 1, label: '01-15' };
    }
  },
  MatchTimingModel: {
    getWindow(minute) {
      return minute >= 16
        ? { index: 2, label: '16-30' }
        : { index: 1, label: '01-15' };
    },
    getTargetWindowAfterChange() {
      return { index: 2, label: '16-30' };
    }
  },
  DeveloperHintParser: {
    getGeneratorQualitySignal() {
      return { detected: false };
    }
  },
  GeneratorExpectedPerformanceParser: {
    parse() {
      return null;
    }
  },
  RecommendationEngine: {
    getXTForMyTeam() {
      return { myXT: 0, oppXT: 0 };
    }
  },
  SnapshotEngine: {
    build() {
      return clone(snapshotTemplate);
    },
    buildSnapshotRecord(snapshot) {
      return { ...snapshot };
    },
    sendMatchResult(snapshot) {
      return Promise.resolve(snapshot);
    },
    compactSnapshotForStorage(snapshot) {
      return { ...snapshot };
    },
    persistLiveState() {},
    freezeRecommendationsAfterTacticChange() {}
  },
  PresetUsageTracker: { record() {} },
  PresetStorage: { getAllLabels() { return {}; } },
  TacticPresetLibrary: { meta: {} },
  Api: { postAppend() { return Promise.resolve({ status: 200 }); } },
  UI: { addParserLog() {} },
  getCurrentTactic() {
    return clone(snapshotTemplate?.currentTactic || {});
  },
  num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
};

vm.createContext(context);
vm.runInContext(`${source}\n;globalThis.__EventTracker = EventTracker;`, context, {
  filename: 'event-tracker.js'
});

function stats(myXG, oppXG) {
  return [
    {
      teamId: 1,
      stats: {
        xG: myXG,
        shots: myXG * 4,
        badActionsPct: 10,
        power: 100,
        defVector: 2,
        pressVector: 3
      }
    },
    {
      teamId: 2,
      stats: {
        xG: oppXG,
        shots: oppXG * 4,
        badActionsPct: 11,
        power: 95,
        defVector: 2,
        pressVector: 2
      }
    }
  ];
}

snapshotTemplate = {
  gameId: 'game-1',
  status: 'live',
  minute: 10,
  bucket: '01-15',
  generationWindow: { index: 1, label: '01-15' },
  score: { home: 0, away: 0 },
  teams: [1, 2],
  myTeam: 1,
  currentTactic: {
    def_line: '2',
    press_line: '3',
    priority: ['left']
  },
  stats: stats(0.5, 0.4),
  developerHints: []
};

const before = context.SnapshotEngine.build();
assert.equal(before.tacticTelemetry.schema, 'slf_tactic_telemetry_v1');
assert.equal(before.tacticTelemetry.currentPreset, 'test_preset');
assert.ok(before.tacticTelemetry.currentTacticFingerprint);
assert.equal(before.tacticTelemetry.transitions.length, 1);
assert.equal(
  before.tacticTelemetry.transitions[0].tacticFingerprint,
  before.tacticTelemetry.currentTacticFingerprint
);

snapshotTemplate = {
  ...snapshotTemplate,
  minute: 20,
  bucket: '16-30',
  generationWindow: { index: 2, label: '16-30' },
  score: { home: 1, away: 0 },
  stats: stats(1.1, 0.6)
};
const after = context.SnapshotEngine.build();

context.STATE.pendingPresetEvent = {
  gameId: 'game-1',
  type: 'preset',
  presetName: 'test_preset',
  tactic: before.currentTactic,
  tacticTelemetry: before.tacticTelemetry,
  beforeSnapshot: before,
  generationWindow: before.generationWindow,
  targetGenerationWindow: { index: 2, label: '16-30' }
};

const effect = context.__EventTracker.buildPresetEffect(after);
assert.ok(effect, 'expected a preset effect');
assert.equal(effect.tacticTelemetry.schema, 'slf_tactic_telemetry_v1');
assert.ok(effect.tacticTelemetry.currentTacticFingerprint);
assert.equal(
  effect.tacticTelemetry.currentTacticFingerprint,
  after.tacticTelemetry.currentTacticFingerprint
);

const beforeWithoutTelemetry = {
  ...clone(before),
  tacticTelemetry: undefined
};
const afterWithoutTelemetry = {
  ...clone(after),
  tacticTelemetry: undefined
};
context.STATE.pendingPresetEvent = {
  gameId: 'game-1',
  type: 'manual_change',
  tactic: beforeWithoutTelemetry.currentTactic,
  beforeSnapshot: beforeWithoutTelemetry,
  generationWindow: beforeWithoutTelemetry.generationWindow,
  targetGenerationWindow: { index: 2, label: '16-30' }
};
const effectWithoutTelemetry = context.__EventTracker.buildPresetEffect(afterWithoutTelemetry);
assert.ok(effectWithoutTelemetry, 'expected a fallback preset effect');
assert.equal(effectWithoutTelemetry.tacticTelemetry, null);

for (const marker of [
  'function installTacticTelemetryEnvelope',
  'SnapshotEngine.build = function buildWithTacticTelemetry()',
  'currentTacticFingerprint: currentFingerprint',
  'tacticTelemetry: afterSnapshot.tacticTelemetry || pending.tacticTelemetry || null',
  '// >>> src/modules/live-parser/event-tracker.js',
  '// >>> src/modules/live-parser/runtime-telemetry-integrity.js'
]) {
  assert.ok(release.includes(marker), `published userscript is missing: ${marker}`);
}

console.log('[tactic-telemetry-envelope-test] passed');
