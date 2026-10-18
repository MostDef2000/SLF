#!/usr/bin/env node
// SLF issue #348 — Dave 5.6 etalon matcher through the FULL engine chain.
// vm harness identical to the release bundle order (config + CAH chain +
// dave56 trio), same loading pattern as tools/test-tactic-fallback-hold-current.mjs.
// Pins:
//   - situation matching per block (equal→d1/b1, protect→d5/b5, comeback→d4/b4,
//     favorite→d2/b2, opponent_high_press→b6, opponent_low_block→b8);
//   - scenario precedence s2→s1→s4→s5→s3→s6 (s2 gates the s1 sweep before
//     minute 60; s4 gates s3 even with attacking_momentum);
//   - s2 minute-60 override gate (b1→b5 / d1→d5 only at/after 60');
//   - s3 caps (style≤5, build_temp≤3, build_long≤3, build_fast≤3, press_line≤3);
//   - b10 is NEVER matched (insufficient data instead);
//   - insufficient-data path: no score state → no situations, empty vectors,
//     empty applyVector;
//   - the etalon layer NEVER modifies result.action (proved by diffing the
//     same fixture run against the identical chain WITHOUT the dave56 trio);
//   - autoApply stays false everywhere.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const clone = value => JSON.parse(JSON.stringify(value));

const BASE_FILES = [
  'src/core/config.js',
  'src/modules/strategy-data-recommendations/current-action-hint-engine.js',
  'src/modules/strategy-data-recommendations/cah-value-utils.js',
  'src/modules/strategy-data-recommendations/cah-runtime-context.js',
  'src/modules/strategy-data-recommendations/cah-decision-core.js',
  'src/modules/strategy-data-recommendations/coach-hint-snapshot-context-layer.js',
  'src/modules/tactics-presets/active-preset-registry.js',
  'src/modules/tactics-presets/tactic-preset-direction-policy.js',
  'src/modules/strategy-data-recommendations/signal-noise-filter-layer.js',
  'src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js',
  'src/modules/strategy-data-recommendations/coach-mode-policy.js',
  'src/modules/strategy-data-recommendations/moment-drift-stabilizer.js'
];
const ETALON_FILES = [
  'src/modules/strategy-data-recommendations/dave56-etalon-data.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-mapping.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-layer.js'
];

function harness(files) {
  const sandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', querySelector: () => null, defaultView: null }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    files.map(rel => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n;\n'),
    sandbox,
    { filename: 'slf-348-etalon-matcher-bundle.js' }
  );
  return sandbox;
}

// Sandbox WITHOUT the dave56 trio: the untouched reference chain.
const base = harness(BASE_FILES);
const engineBase = base.window.SLFCurrentActionHintEngine;
assert.ok(engineBase, 'base chain installs the hint engine');
assert.equal(engineBase.__dave56EtalonApplied, undefined, 'base chain has no etalon layer');

// Sandbox WITH the dave56 trio: the shipped chain.
const full = harness(BASE_FILES.concat(ETALON_FILES));
const engine = full.window.SLFCurrentActionHintEngine;
assert.equal(engine.__dave56EtalonApplied, true, 'etalon layer wraps the outermost run');
assert.equal(full.window.SLFActivePresetRegistry.suiteVersion, 'slf_tactic_suite_561_v12', 'layer installs on the current v12 registry (#361 accept-list: v11 + v12)');
assert.equal(full.window.SLFDave56EtalonLayer.autoApply, false, 'etalon layer never auto-applies');
assert.equal(full.window.SLFTacticDirectionPolicy.autoApply, false, 'direction policy autoApply unchanged');

const mkSnapshot = (score, over = {}) => Object.assign({
  gameId: 'g1', myTeam: 101, teams: [101, 202], minute: 75, status: 'live',
  score,
  stats: [
    { teamId: 101, stats: { defVector: 5, pressVector: 10, xG: 0.2, possession: 45, badActionsPct: 10, fouls: 1, power: 5000 } },
    { teamId: 202, stats: { defVector: 20, pressVector: 10, xG: 0.1, possession: 55, power: 4900 } }
  ]
}, over);

// Neutral fixtures: opp defVector >= 0 (no derived 'opponent_low_block'),
// possession not in our favour (no b11 fallback), xG gap small (no derived
// momentum) — the etalon tag merge intentionally folds inner moment signals
// into matching, so fixtures control them via snapshot numbers.
const ctx = over => Object.assign({
  tags: [], minute: 30, myBad: 10, myFouls: 1, myXg: 0.2, oppXg: 0.1,
  myPossession: 45, oppPossession: 55, oppPressVector: 10, oppDefVector: 20,
  strengthContext: { known: true, mode: 'equal', bucket: 'near_equal', strengthGap: 10 }
}, over);

const CASES = [
  {
    name: 'equal-match default → d1/b1',
    snapshot: mkSnapshot({ home: 1, away: 1, diff: 0 }, { minute: 30 }),
    context: ctx({ tags: ['draw'], score: { state: 'draw', diff: 0, myGoals: 1, oppGoals: 1, known: true } }),
    check(e) {
      jeq(e.situationIds, { defense: 'd1', buildup: 'b1', scenarios: [] }, 'equal match matches d1/b1 with no scenario');
      jeq(e.defenseVector, { def_line: 2, press_line: 2, def_width: 2, press_intense: 3 });
      jeq(e.buildupVector, { build_type: 2, build_temp: 2, build_long: 2, build_fast: 2, style: 3 });
      assert.equal(e.priorityLanes, null, 'b1 «все направления» omits priority');
      assert.equal(e.priorityOmitted, true);
      jeq(e.applyVector, Object.assign({}, e.defenseVector, e.buildupVector), 'applyVector = merged, no priority key');
      assert.equal('priority' in e.applyVector, false);
      jeq(e.notes, []);
    }
  },
  {
    name: 'winning + late_protect_lead → d5/b5 + s1',
    snapshot: mkSnapshot({ home: 2, away: 1, diff: 1 }),
    context: ctx({
      tags: ['winning', 'late_protect_lead'], score: { state: 'winning', diff: 1, myGoals: 2, oppGoals: 1, known: true },
      minute: 75, oppPressVector: 5, strengthContext: { known: true, mode: 'equal', bucket: 'near_equal', strengthGap: 100 }
    }),
    check(e) {
      jeq(e.situationIds, { defense: 'd5', buildup: 'b5', scenarios: ['s1'] });
      jeq(e.defenseVector, { def_line: 1, press_line: 1, def_width: 1, press_intense: 2 });
      jeq(e.buildupVector, { build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1 });
      jeq(e.priorityLanes, ['left', 'right']);
      jeq(e.applyVector, { def_line: 1, press_line: 1, def_width: 1, press_intense: 2, build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1, priority: ['left', 'right'] });
      assert.ok(e.notes.includes('атаковать фланг, где соперник не играет'), 's1 note');
    }
  },
  {
    name: 'losing + need_goal → d4/b4',
    snapshot: mkSnapshot({ home: 0, away: 1, diff: -1 }, { minute: 70 }),
    context: ctx({
      tags: ['losing', 'need_goal'], score: { state: 'losing', diff: -1, myGoals: 0, oppGoals: 1, known: true },
      minute: 70, myXg: 0.5, oppXg: 0.2
    }),
    check(e) {
      jeq(e.situationIds, { defense: 'd4', buildup: 'b4', scenarios: [] }, 'd4/b4 without momentum tags fires no scenario');
      jeq(e.defenseVector, { def_line: 3, press_line: 3, def_width: 3, press_intense: 4 });
      jeq(e.buildupVector, { build_type: 3, build_temp: 2, build_long: 2, build_fast: 2, style: 4 });
      jeq(e.priorityLanes, ['left', 'center', 'right'], 'b4 lanes «фланг + центр»');
    }
  },
  {
    name: 'strength_advantage_clear (favourite, +2) → d2/b2',
    snapshot: mkSnapshot({ home: 2, away: 0, diff: 2 }, { minute: 30 }),
    context: ctx({
      tags: ['winning', 'strength_advantage_clear'], score: { state: 'winning', diff: 2, myGoals: 2, oppGoals: 0, known: true },
      strengthContext: { known: true, mode: 'advantage', bucket: 'clear_advantage', strengthGap: 300 }
    }),
    check(e) {
      jeq(e.situationIds, { defense: 'd2', buildup: 'b2', scenarios: [] }, 'diff 2 keeps s1/s2 silent; no other scenario matches');
      jeq(e.defenseVector, { def_line: 3, press_line: 3, def_width: 2, press_intense: 3 }, 'd2 conservative slash picks');
      jeq(e.buildupVector, { build_type: 3, build_temp: 2, build_long: 2, build_fast: 2, style: 3 }, 'b2 conservative slash picks');
      assert.equal(e.priorityLanes, null, 'b2 «все направления» omits priority');
    }
  },
  {
    name: 'opponent_high_press → b6 (style omitted)',
    snapshot: mkSnapshot({ home: 0, away: 0, diff: 0 }, { minute: 30 }),
    context: ctx({ tags: ['draw', 'opponent_high_press'], score: { state: 'draw', diff: 0, myGoals: 0, oppGoals: 0, known: true }, oppPressVector: 30 }),
    check(e) {
      assert.equal(e.situationIds.buildup, 'b6', 'opponent_high_press matches b6');
      jeq(e.buildupVector, { build_type: 2, build_temp: 2, build_long: 1, build_fast: 1 }, 'b6 style «По силе команд» is never mapped to an ordinal');
      assert.equal('style' in e.buildupVector, false);
      jeq(e.priorityLanes, ['left', 'right']);
    }
  },
  {
    name: 'opponent_low_block → b8',
    snapshot: mkSnapshot({ home: 0, away: 0, diff: 0 }, { minute: 30 }),
    context: ctx({ tags: ['draw', 'opponent_low_block'], score: { state: 'draw', diff: 0, myGoals: 0, oppGoals: 0, known: true } }),
    check(e) {
      assert.equal(e.situationIds.buildup, 'b8', 'opponent_low_block matches b8');
      jeq(e.buildupVector, { build_type: 3, build_temp: 1, build_long: 2, build_fast: 2, style: 3 });
    }
  },
  {
    name: 's2 gates s1 before minute 60 (keeps d1/b1)',
    snapshot: mkSnapshot({ home: 1, away: 0, diff: 1 }, { minute: 40 }),
    context: ctx({
      tags: ['winning', 'attacking_momentum'], score: { state: 'winning', diff: 1, myGoals: 1, oppGoals: 0, known: true },
      minute: 40, myXg: 0.8, oppXg: 0.1
    }),
    check(e) {
      jeq(e.situationIds.scenarios, ['s2'], 's2 wins the precedence over the s1 sweep even at equal strength');
      assert.equal(e.situationIds.defense, 'd1', 'before 60\' the s2 override does not fire');
      assert.equal(e.situationIds.buildup, 'b1');
      assert.ok(e.notes.includes('сначала 2-0 — потом сушка'), 's2 note present before the override window');
    }
  },
  {
    name: 's2 override at/after minute 60 → d5/b5',
    snapshot: mkSnapshot({ home: 1, away: 0, diff: 1 }, { minute: 65 }),
    context: ctx({
      tags: ['winning', 'attacking_momentum'], score: { state: 'winning', diff: 1, myGoals: 1, oppGoals: 0, known: true },
      minute: 65, myXg: 0.8, oppXg: 0.1
    }),
    check(e) {
      jeq(e.situationIds.scenarios, ['s2']);
      assert.equal(e.situationIds.defense, 'd5', 'from 60\' the s2 override replaces the d1/b1 match');
      assert.equal(e.situationIds.buildup, 'b5');
      assert.ok(e.notes.includes('сначала 2-0 — потом сушка'));
    }
  },
  {
    name: 's3 caps (style≤5, build_temp/long/fast≤3, press_line≤3)',
    snapshot: mkSnapshot({ home: 0, away: 1, diff: -1 }, { minute: 60 }),
    context: ctx({
      tags: ['losing', 'need_goal', 'attacking_momentum'], score: { state: 'losing', diff: -1, myGoals: 0, oppGoals: 1, known: true },
      minute: 60, myXg: 0.5, oppXg: 0.2, oppPressVector: 30
    }),
    check(e) {
      jeq(e.situationIds, { defense: 'd4', buildup: 'b4', scenarios: ['s3'] });
      jeq(e.defenseVector, { def_line: 3, press_line: 3, def_width: 3, press_intense: 4 }, 's3 press_line +1 is capped at 3');
      jeq(e.buildupVector, { build_type: 3, build_temp: 3, build_long: 3, build_fast: 3, style: 5 }, 's3 deltas are capped: temp/long/fast 3, style 4+1→5');
      jeq(e.priorityLanes, ['left', 'center', 'right']);
      assert.ok(e.notes.includes('атаковать его активный фланг'), 's3 note');
    }
  },
  {
    name: 's4 gates s3 (stronger + losing) late «навал»',
    snapshot: mkSnapshot({ home: 0, away: 1, diff: -1 }, { minute: 85 }),
    context: ctx({
      tags: ['losing', 'strength_advantage_clear', 'attacking_momentum'], score: { state: 'losing', diff: -1, myGoals: 0, oppGoals: 1, known: true },
      minute: 85, myXg: 0.5, oppXg: 0.2,
      strengthContext: { known: true, mode: 'advantage', bucket: 'clear_advantage', strengthGap: 300 }
    }),
    check(e) {
      jeq(e.situationIds.scenarios, ['s4'], 's4 precedes s3 in the evaluation order');
      assert.equal(e.situationIds.defense, 'd5', 's4 overrides to d5/b5');
      assert.equal(e.situationIds.buildup, 'b5');
      assert.equal(e.defenseVector.press_intense, 3, 's4 lateDelta press_intense 2+1=3');
      assert.ok(e.notes.includes('навал'), 's4 late note');
    }
  },
  {
    name: 's5 (0:0 + clear advantage) → d5/b5 «сушка»',
    snapshot: mkSnapshot({ home: 0, away: 0, diff: 0 }, { minute: 30 }),
    context: ctx({
      tags: ['draw', 'strength_advantage_clear'], score: { state: 'draw', diff: 0, myGoals: 0, oppGoals: 0, known: true },
      strengthContext: { known: true, mode: 'advantage', bucket: 'clear_advantage', strengthGap: 300 }
    }),
    check(e) {
      jeq(e.situationIds, { defense: 'd5', buildup: 'b5', scenarios: ['s5'] });
      assert.ok(e.notes.includes('сушка'), 's5 note');
    }
  },
  {
    name: 's6 (losing 0:1, low xG) → forced d1/b1 + style delta',
    snapshot: mkSnapshot({ home: 0, away: 1, diff: -1 }, { minute: 40 }),
    context: ctx({ tags: ['losing'], score: { state: 'losing', diff: -1, myGoals: 0, oppGoals: 1, known: true }, minute: 40 }),
    check(e) {
      jeq(e.situationIds.scenarios, ['s6']);
      assert.equal(e.situationIds.defense, 'd1', 's6 forces the equal-match base');
      assert.equal(e.situationIds.buildup, 'b1');
      assert.equal(e.buildupVector.style, 4, 's6 delta style 3+1=4');
    }
  },
  {
    name: 'insufficient data (no score state) → no vector, empty applyVector',
    snapshot: mkSnapshot(undefined, { minute: 10 }),
    context: { tags: [], minute: 10, score: { state: 'unknown' } },
    check(e) {
      assert.equal(e.situationIds.defense, null, 'no score state → no defense situation');
      assert.equal(e.situationIds.buildup, null);
      jeq(e.defenseVector, {});
      jeq(e.buildupVector, {});
      assert.ok(e.insufficientData.includes('score_state'), 'score_state is reported insufficient');
      jeq(Object.keys(e.applyVector), [], 'applyVector is empty → nothing to apply');
      assert.equal(e.priorityLanes, null);
    }
  }
];

// --- run every case through BOTH chains; etalon must never touch action ------
for (const testCase of CASES) {
  const baseResult = engineBase.run(clone(testCase.snapshot), clone(testCase.context));
  const result = engine.run(clone(testCase.snapshot), clone(testCase.context));
  assert.ok(result.etalon, `${testCase.name}: result.etalon computed`);
  assert.equal(result.etalon.source, 'dave56_etalon');
  assert.equal(result.etalon.schema, 'slf_dave56_etalon_v1');
  assert.equal(result.etalon.conservative, true, 'layer always picks the conservative resolution');
  // THE hard invariant: result.action is byte-identical to the same chain
  // without the etalon trio (no mutation, no added keys, same shape).
  jeq(result.action, baseResult.action, `${testCase.name}: result.action untouched by the etalon layer`);
  jeq(
    Object.keys(result).filter(key => key !== 'etalon').sort(),
    Object.keys(baseResult).sort(),
    `${testCase.name}: etalon layer adds only the result.etalon key`
  );
  // b10 is never matched anywhere; it is reported as insufficient data.
  assert.notEqual(result.etalon.situationIds.buildup, 'b10', `${testCase.name}: b10 is never matched`);
  assert.ok(result.etalon.insufficientData.includes('b10_lane_play'), `${testCase.name}: b10 reported as insufficient data`);
  testCase.check(result.etalon);
}

// The etalon object never aliases the action object (no shared mutation path).
const probe = engine.run(clone(CASES[1].snapshot), clone(CASES[1].context));
assert.notEqual(probe.etalon, probe.action);
assert.equal(probe.etalon.action, undefined, 'etalon does not carry an action');

console.log(`dave56 etalon matcher: ${CASES.length} engine-chain cases + action-identity diff vs base chain: OK`);
