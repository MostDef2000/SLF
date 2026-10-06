#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const sourcePath = path.join(root, 'src/modules/manual-match-telemetry/event-tracker.js');
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
        test_preset: { def_line: '2', press_line: '3' },
        // Full v9 control signature so the "user leaves B" scenario detects
        // Pep_BoxControl_bal2 as the current preset after application.
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' }
      },
      tacticMatches(signature, tactic) {
        return Object.entries(signature).every(([key, value]) => tactic?.[key] === value);
      }
    },
    SLFActivePresetRegistry: {
      active: ['test_preset', 'Pep_BoxControl_bal2'],
      suiteVersion: 'slf_tactic_suite_561_v9',
      recommendationSchema: 'slf_rule_decision_v9_tactical_suite',
      defaultRiskAppetite: 'bold'
    }
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

assert.equal(
  typeof context.SnapshotEngine.compactSnapshotForStorage,
  'undefined',
  'telemetry initialization must not recreate or require legacy snapshot storage'
);
assert.equal(
  source.includes('SnapshotEngine.compactSnapshotForStorage.bind'),
  false,
  'event tracker must not bind the removed compactSnapshotForStorage API'
);

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

// --- issue #325 acceptance: v9 recommendation application states (single-writer) ---
// v8 event-tracker had no resolveRecommendationState, no recommendation fields on
// effects, and enrich() REPLACED tacticTelemetry (dropping recommendedPreset and
// stamping the legacy libraryVersion) — every assertion below fails on v8.
const presetA = 'Arteta_Control433_bal3';
const presetB = 'Pep_BoxControl_bal2';
const tacticB = { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' };
const ruleA = {
  schema: 'slf_rule_decision_v9_tactical_suite',
  mode: 'button_on_demand_scored_rules',
  generatedAt: Date.now(),
  action: { preset: presetA, decision: 'stable_control', ruleId: 'suite_v9_stable_control', score: 68, reason: 'stable_control', guardType: 'suite_v9_selection' },
  confidence: { level: 'high', gap: 34 },
  margin: 34,
  moment: { context: {} }
};
const ruleHold = {
  schema: 'slf_rule_decision_v9_tactical_suite',
  mode: 'button_on_demand_scored_rules',
  generatedAt: Date.now(),
  action: { preset: null, rawPreset: null, decision: 'hold_current', ruleId: 'suite_v9_hold_current', score: 0, reason: 'Нет безопасной рекомендации — оставить текущую тактику', fallbackReason: 'no_eligible_candidate', guardType: 'hold_current', guardReason: 'no production preset fallback is allowed' },
  confidence: { level: 'low', gap: 0 },
  margin: 0,
  moment: { context: {} }
};

// (a) recommend A / user leaves B / phase closes -> recommended_not_applied.
snapshotTemplate = {
  ...snapshotTemplate,
  minute: 10,
  bucket: '01-15',
  generationWindow: { index: 1, label: '01-15' },
  score: { home: 0, away: 0 },
  stats: stats(0.5, 0.4),
  currentTactic: { def_line: '2', press_line: '3', priority: ['left'] },
  ruleDecision: ruleA
};
const beforeA = context.SnapshotEngine.build();
assert.equal(beforeA.tacticTelemetry.recommendedPreset, presetA, 'enrich stamps recommendedPreset from the rule decision');
assert.equal(beforeA.tacticTelemetry.libraryVersion, 'slf_tactic_suite_561_v9');

context.__EventTracker.savePresetEvent(presetB, tacticB, beforeA);
const pendingA = context.STATE.pendingPresetEvent;
assert.ok(pendingA, 'savePresetEvent queued the pending event');
assert.equal(pendingA.presetName, presetB);
assert.equal(pendingA.applicationSource, 'preset_apply', 'preset application source is explicit on the row');
assert.equal(pendingA.recommendedPreset, presetA, 'event row carries the recommendation side');
assert.equal(pendingA.actualPreset, presetB, 'event row carries the applied side');
assert.equal(pendingA.recommendationState, 'recommended_not_applied', 'event row state');

snapshotTemplate = {
  ...snapshotTemplate,
  minute: 20,
  bucket: '16-30',
  generationWindow: { index: 2, label: '16-30' },
  score: { home: 1, away: 0 },
  stats: stats(1.1, 0.6),
  currentTactic: tacticB,
  ruleDecision: ruleA
};
const afterA = context.SnapshotEngine.build();
const effectA = context.__EventTracker.buildPresetEffect(afterA);
assert.ok(effectA, 'expected a preset effect for the recommended-not-applied case');
assert.equal(effectA.recommendedPreset, presetA, 'effect root: recommended side');
assert.equal(effectA.actualPreset, presetB, 'effect root: applied side');
assert.equal(effectA.recommendationState, 'recommended_not_applied', 'effect root state');
assert.equal(effectA.tacticContext.recommendedPreset, presetA, 'tacticContext: recommended side');
assert.equal(effectA.tacticContext.actualPreset, presetB, 'tacticContext: applied side');
assert.equal(effectA.tacticContext.recommendationState, 'recommended_not_applied', 'tacticContext state');
assert.equal(effectA.applicationSource, 'preset_apply');
assert.equal(effectA.decisionContext.action.preset, presetA, 'decision context retains the recommended side');
assert.equal(effectA.ruleId, 'suite_v9_stable_control');

// (a, merge) enrich() MERGE: a snapshot that already carries telemetry keeps its
// recommendation fields even when the current build has no rule decision.
const merged = context.SnapshotEngine.buildSnapshotRecord({
  gameId: 'game-1',
  status: 'live',
  minute: 20,
  bucket: '16-30',
  generationWindow: { index: 2, label: '16-30' },
  score: { home: 1, away: 0 },
  teams: [1, 2],
  myTeam: 1,
  currentTactic: tacticB,
  stats: stats(1.1, 0.6),
  developerHints: [],
  tacticTelemetry: { recommendedPreset: presetA, rawRecommendedPreset: presetA, libraryVersion: 'slf_tactic_suite_561_v9' }
});
assert.equal(merged.tacticTelemetry.recommendedPreset, presetA, 'merge keeps the prior recommendedPreset (not clobbered)');
assert.equal(merged.tacticTelemetry.rawRecommendedPreset, presetA, 'merge keeps the prior raw recommendedPreset');
assert.equal(merged.tacticTelemetry.libraryVersion, 'slf_tactic_suite_561_v9', 'libraryVersion survives the merge (v8 replaced it with the legacy constant)');
assert.equal(merged.tacticTelemetry.recommendationSchema, 'slf_rule_decision_v9_tactical_suite', 'registry recommendationSchema through the merge');
assert.equal(merged.tacticTelemetry.actualPreset, presetB, 'actualPreset tracks the current tactic');
assert.equal(merged.tacticTelemetry.currentPreset, presetB, 'currentPreset detects the applied tactic');

// (b) no valid recommendation (hold) / actual B -> fallback_hold, never a preset name.
snapshotTemplate = {
  ...snapshotTemplate,
  minute: 10,
  bucket: '01-15',
  generationWindow: { index: 1, label: '01-15' },
  score: { home: 1, away: 0 },
  stats: stats(1.1, 0.6),
  currentTactic: tacticB,
  ruleDecision: ruleHold
};
const beforeB = context.SnapshotEngine.build();
assert.equal(beforeB.tacticTelemetry.recommendedPreset, null, 'hold decision stamps null recommendedPreset (no fallback name)');
context.__EventTracker.savePresetEvent(presetB, tacticB, beforeB);
const pendingB = context.STATE.pendingPresetEvent;
assert.equal(pendingB.recommendedPreset, null, 'hold: event row has no recommended side');
assert.equal(pendingB.actualPreset, presetB);
assert.equal(pendingB.recommendationState, 'fallback_hold', 'hold: event row state');

snapshotTemplate = {
  ...snapshotTemplate,
  minute: 20,
  bucket: '16-30',
  generationWindow: { index: 2, label: '16-30' },
  ruleDecision: ruleHold
};
const afterB = context.SnapshotEngine.build();
const effectB = context.__EventTracker.buildPresetEffect(afterB);
assert.ok(effectB, 'expected a preset effect for the hold case');
assert.equal(effectB.recommendationState, 'fallback_hold', 'effect root state');
assert.equal(effectB.tacticContext.recommendationState, 'fallback_hold', 'tacticContext state');
assert.equal(effectB.recommendedPreset, null, 'hold: no recommended side is fabricated');
assert.notEqual(effectB.recommendedPreset, presetA, 'recommendedPreset must NEVER fall back to a preset name (v8 injected Arteta)');
assert.equal(effectB.actualPreset, presetB);
assert.equal(effectB.fallbackReason, 'no_eligible_candidate');

// (c) manual_override: no rule decision at all, but a preset was applied anyway.
snapshotTemplate = {
  ...snapshotTemplate,
  minute: 10,
  bucket: '01-15',
  generationWindow: { index: 1, label: '01-15' },
  score: { home: 1, away: 0 },
  stats: stats(1.1, 0.6),
  currentTactic: tacticB,
  ruleDecision: null
};
const beforeC = context.SnapshotEngine.build();
assert.equal(beforeC.tacticTelemetry.recommendedPreset, null, 'no rule decision -> no recommendedPreset');
context.STATE.pendingPresetEvent = {
  gameId: 'game-1',
  type: 'manual_change',
  presetName: presetB,
  tactic: tacticB,
  beforeSnapshot: beforeC,
  generationWindow: { index: 1, label: '01-15' },
  targetGenerationWindow: { index: 2, label: '16-30' },
  tacticTelemetry: beforeC.tacticTelemetry
};
snapshotTemplate = { ...snapshotTemplate, minute: 20, bucket: '16-30', generationWindow: { index: 2, label: '16-30' } };
const afterC = context.SnapshotEngine.build();
const effectC = context.__EventTracker.buildPresetEffect(afterC);
assert.ok(effectC, 'expected a preset effect for the manual override case');
assert.equal(effectC.applicationSource, 'manual_change');
assert.equal(effectC.recommendedPreset, null);
assert.equal(effectC.actualPreset, presetB);
assert.equal(effectC.recommendationState, 'manual_override', 'effect root state');
assert.equal(effectC.tacticContext.recommendationState, 'manual_override', 'tacticContext state');

// (c2) lab_override: a Tactical Lab application source wins over every other state.
assert.equal(
  context.__EventTracker.resolveRecommendationState('tactical_lab:EXP-561-P01-0001', { preset: presetA }, 'recommended_not_applied', presetA, presetB),
  'lab_override',
  'tactical_lab apply source classifies as lab_override regardless of the recommendation sides'
);
assert.equal(
  context.__EventTracker.resolveRecommendationState('preset_apply', { preset: null }, null, null, presetB),
  'fallback_hold',
  'null-preset action classifies as fallback_hold'
);
assert.equal(
  context.__EventTracker.resolveRecommendationState('preset_apply', null, null, null, null),
  null,
  'no recommendation and no application -> null state (unknown_legacy is read-time only, never written client-side)'
);
context.STATE.pendingPresetEvent = {
  gameId: 'game-1',
  type: 'preset',
  presetName: presetB,
  tactic: tacticB,
  beforeSnapshot: beforeA,
  generationWindow: { index: 1, label: '01-15' },
  targetGenerationWindow: { index: 2, label: '16-30' },
  applicationSource: 'tactical_lab:EXP-561-P01-0001',
  tacticTelemetry: beforeA.tacticTelemetry,
  ruleDecision: pendingA.ruleDecision
};
const effectLab = context.__EventTracker.buildPresetEffect(afterA);
assert.ok(effectLab, 'expected a preset effect for the lab override case');
assert.equal(effectLab.applicationSource, 'tactical_lab:EXP-561-P01-0001');
assert.equal(effectLab.recommendationState, 'lab_override', 'effect root state');
assert.equal(effectLab.tacticContext.recommendationState, 'lab_override', 'tacticContext state');

for (const marker of [
  'function installTacticTelemetryEnvelope',
  'SnapshotEngine.build = function buildWithTacticTelemetry()',
  'currentTacticFingerprint: currentFingerprint',
  'tacticTelemetry: afterSnapshot.tacticTelemetry || pending.tacticTelemetry || null',
  '// >>> src/modules/manual-match-telemetry/event-tracker.js',
  '// >>> src/modules/manual-match-telemetry/manual-match-runtime.js'
]) {
  assert.ok(release.includes(marker), `published userscript is missing: ${marker}`);
}

console.log('[tactic-telemetry-envelope-test] passed');
