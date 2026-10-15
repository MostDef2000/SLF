#!/usr/bin/env node
// SLF issue #350 — final tactic merge layer (v11 preset base + Dave 5.6 etalon
// overrides, single apply). Loads dave56-etalon-data/mapping + a stub engine +
// a stub v11 registry + dave56-etalon-layer + final-tactic-merge-layer in one
// vm context (same shim pattern as test-tactic-bridge-v10.mjs / the #350
// scratch smokes) and pins the merge semantics:
//   T1 insufficient etalon (ok:false / 'score_state' / empty applyVector /
//     etalon absent) → pure preset (or current) vector;
//   T2 generic-only d1/b1 → preset base byte-equal + referenceLine, no overrides;
//   T3 defense strong (d2..d12) → etalon defenseVector overrides the 4 keys,
//     buildup/style/attack/priority stay preset;
//   T4 buildup strong (b2..b12) → etalon buildupVector overrides present keys
//     (style falls back to base when the etalon omits it, e.g. b6); etalon
//     priorityLanes win over the base priority when non-empty;
//   T5 both blocks strong; T6 hold_current / stale preset name → base is
//     getCurrentTactic() + 'stale_preset_name' insufficient flag;
//   scenario details: s2 before minute 60 is not strong, s3 splits
//     press_line→defense / rest→buildup, s6 shifts style only;
//   all 14 vector values are STRING ordinals; source format
//     'merged:etalon:<ids>+presets:<preset>' | 'merged:current:<ids>';
//   result.action / result.etalon are NEVER mutated (differential vs the chain
//     without the merge module: only the finalTactic key is added);
//   window.SLFFinalTacticMergeLayer.autoApply === false; stale-registry guard
//     (suiteVersion !== v11 → layer not installed); idempotency flag;
//   exception inside computeFinalTactic → degraded {ok:false, vector:null}.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const CONTROL_KEYS = ['def_line', 'press_line', 'def_width', 'press_intense',
  'build_type', 'build_temp', 'build_long', 'build_fast', 'style',
  'pass_risk', 'dribble', 'cross', 'corner', 'shot'];

// Stub v11 registry presets — STRING ordinals, same shape as the real
// active-preset-registry (only Conte carries a non-empty priority).
const CONTE = { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '3', build_temp: '2', build_long: '2', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] };
const EMERY = { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '2', build_fast: '2', style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2', priority: [] };

const DEFAULT_ACTION = { preset: 'Conte_WideChannels_v11', rawPreset: 'Conte_WideChannels_v11', score: 1.5, decision: 'active_control', ruleId: 'x', reason: 'test', libraryVersion: 'slf_tactic_suite_561_v11' };

function makeSandbox({ currentTactic = null, withEtalonLayer = true, withMergeLayer = true, withRegistry = true, suiteVersion = 'slf_tactic_suite_561_v11', action = DEFAULT_ACTION } = {}) {
  const sandbox = {
    console,
    setTimeout,
    getCurrentTactic: currentTactic ? () => JSON.parse(JSON.stringify(currentTactic)) : undefined,
    window: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (withEtalonLayer) {
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-data.js'), sandbox, { filename: 'dave56-etalon-data.js' });
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-mapping.js'), sandbox, { filename: 'dave56-etalon-mapping.js' });
  }
  vm.runInContext('globalThis.CurrentActionHintEngine = { run: function () { return { action: this.__stubAction, moment: { signals: [] } }; } };', sandbox, { filename: 'engine-stub.js' });
  vm.runInContext(`globalThis.CurrentActionHintEngine.__stubAction = ${JSON.stringify(action)};`, sandbox);
  if (withRegistry) {
    vm.runInContext(`globalThis.window.SLFActivePresetRegistry = { suiteVersion: ${JSON.stringify(suiteVersion)}, presets: { Conte_WideChannels_v11: ${JSON.stringify(CONTE)}, Emery_BalancedBase_v11: ${JSON.stringify(EMERY)} } };`, sandbox);
  }
  if (withEtalonLayer) {
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-layer.js'), sandbox, { filename: 'dave56-etalon-layer.js' });
  }
  if (withMergeLayer) {
    vm.runInContext(read('src/modules/strategy-data-recommendations/final-tactic-merge-layer.js'), sandbox, { filename: 'final-tactic-merge-layer.js' });
  }
  return sandbox;
}

const baseSnapshot = { gameId: 'g1', myTeam: 1, teams: [1, 2], stats: [{ teamId: 1, stats: { defVector: 0, pressVector: 0 } }] };
const ctx = extra => Object.assign({
  score: { state: 'draw', diff: 0, myGoals: 0, oppGoals: 0 },
  minute: 30,
  tags: [],
  myFouls: 0,
  myXg: 1.0,
  oppXg: 1.0,
  myBad: 0,
  myPossession: 50,
  oppPossession: 50
}, extra);

// Run the real wrapped chain and assert the stub action object is untouched.
function run(sandbox, snapshot, context) {
  const actionBefore = JSON.parse(JSON.stringify(sandbox.CurrentActionHintEngine.__stubAction));
  const result = sandbox.CurrentActionHintEngine.run(snapshot, context);
  jeq(sandbox.CurrentActionHintEngine.__stubAction, actionBefore, 'result.action never mutated by the merge wrapper');
  return result;
}

// Synthetic etalon in the exact dave56-etalon-layer result shape
// (defense/buildup vectors carry NUMBER ordinals, like the real layer).
function synthEtalon(over = {}) {
  return Object.assign({
    schema: 'slf_dave56_etalon_v1',
    source: 'dave56_etalon',
    ok: true,
    situationIds: { defense: 'd1', buildup: 'b1', scenarios: [] },
    ids: ['d1', 'b1'],
    labels: {},
    defenseVector: {},
    buildupVector: {},
    mergedVector: {},
    applyVector: { def_line: 1 },
    priorityLanes: null,
    priorityOmitted: true,
    insufficientData: [],
    scenarios: [],
    notes: []
  }, over);
}

function computeDirect(sandbox, result) {
  return sandbox.window.SLFFinalTacticMergeLayer.computeFinalTactic(baseSnapshot, ctx({}), result);
}

// ============================================================================
// T1 — insufficient etalon → pure preset/current, no overrides, no reference
// ============================================================================

// T1a: etalon.ok === false → pure preset vector, exception flag survives.
{
  const s = makeSandbox();
  const ft = computeDirect(s, {
    action: { preset: 'Conte_WideChannels_v11' },
    etalon: synthEtalon({ ok: false, error: 'etalon_computation_failed', applyVector: null, ids: [], insufficientData: ['exception'], defenseVector: null, buildupVector: null })
  });
  jeq(ft.vector, CONTE, 'T1a vector is the pure preset');
  assert.ok(ft.insufficientData.includes('exception'), 'T1a keeps the etalon exception flag');
  jeq(ft.etalonIds, [], 'T1a no etalon ids');
  jeq(ft.overrides, { defense: 'preset', buildup: 'preset', style: 'preset', attack: 'preset', priority: 'preset' }, 'T1a nothing is overridden');
  assert.equal(ft.strong.defense, false);
  assert.equal(ft.strong.buildup, false);
  assert.equal(ft.referenceLine, null, 'T1a no reference line for an insufficient etalon');
  assert.equal(ft.source, 'merged:etalon:+presets:Conte_WideChannels_v11', 'T1a empty-ids source keeps the literal two-form shape');
  console.log('T1a ok: etalon.ok=false → pure preset');
}

// T1b: insufficientData carries 'score_state' → pure preset even when the
// situation ids would look strong.
{
  const s = makeSandbox();
  const ft = computeDirect(s, {
    action: { preset: 'Conte_WideChannels_v11' },
    etalon: synthEtalon({
      situationIds: { defense: 'd5', buildup: 'b5', scenarios: [] }, ids: ['d5', 'b5'],
      defenseVector: { def_line: 1, press_line: 1, def_width: 1, press_intense: 2 },
      buildupVector: { build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1 },
      applyVector: { def_line: 1 }, priorityLanes: ['left', 'right'], priorityOmitted: false,
      insufficientData: ['score_state']
    })
  });
  jeq(ft.vector, CONTE, 'T1b score_state forces the pure preset (no d5/b5 override)');
  assert.equal(ft.referenceLine, null, 'T1b no reference line either');
  assert.ok(ft.insufficientData.includes('score_state'));
  console.log('T1b ok: score_state → pure preset');
}

// T1c: empty applyVector → pure preset.
{
  const s = makeSandbox();
  const ft = computeDirect(s, {
    action: { preset: 'Conte_WideChannels_v11' },
    etalon: synthEtalon({ applyVector: {}, ids: [] })
  });
  jeq(ft.vector, CONTE, 'T1c empty applyVector → pure preset');
  jeq(ft.overrides.style, 'preset');
  console.log('T1c ok: empty applyVector → pure preset');
}

// T1d: etalon absent (layer not installed) → etalon_layer_absent flag.
{
  const s = makeSandbox();
  const ft = computeDirect(s, { action: { preset: 'Conte_WideChannels_v11' }, etalon: null });
  jeq(ft.vector, CONTE, 'T1d vector is the pure preset');
  assert.ok(ft.insufficientData.includes('etalon_layer_absent'), 'T1d labels the absent etalon layer');
  console.log('T1d ok: etalon absent → etalon_layer_absent');
}

// T1e: full chain without a score state → pure preset through the wrapper.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, { minute: 30 });
  const ft = r.finalTactic;
  jeq(ft.vector, CONTE, 'T1e chain without score → pure preset vector');
  assert.ok(ft.insufficientData.includes('score_state'));
  jeq(ft.etalonIds, [], 'T1e no ids minted');
  assert.equal(ft.referenceLine, null);
  console.log('T1e ok: chain no-score → pure preset');
}

// T1f: exception inside computeFinalTactic → degraded shape via the wrapper.
{
  const s = makeSandbox({ withEtalonLayer: false });
  const explodingResult = {
    action: { preset: 'Conte_WideChannels_v11' },
    etalon: {
      schema: 'slf_dave56_etalon_v1', source: 'dave56_etalon', ok: true,
      ids: ['d5', 'b1'], insufficientData: [], scenarios: [],
      applyVector: { def_line: 1 },
      get situationIds() { throw new Error('synthetic explosion'); }
    }
  };
  // The direct computation propagates the error…
  assert.throws(
    () => s.window.SLFFinalTacticMergeLayer.computeFinalTactic(baseSnapshot, ctx({}), explodingResult),
    /synthetic explosion/,
    'computeFinalTactic itself propagates exceptions'
  );
  // …while the installed wrapper converts them into the degraded shape:
  // a fresh context whose inner engine returns an exploding etalon result.
  const s5 = { console, setTimeout, window: {} };
  s5.globalThis = s5;
  vm.createContext(s5);
  vm.runInContext(`globalThis.window.SLFActivePresetRegistry = { suiteVersion: 'slf_tactic_suite_561_v11', presets: { Conte_WideChannels_v11: ${JSON.stringify(CONTE)} } };`, s5);
  vm.runInContext('globalThis.CurrentActionHintEngine = { run: function () { return { action: { preset: "Conte_WideChannels_v11" }, etalon: { ok: true, applyVector: { def_line: 1 }, ids: [], insufficientData: [], scenarios: [], get situationIds() { throw new Error("synthetic explosion"); } } }; } };', s5);
  vm.runInContext(read('src/modules/strategy-data-recommendations/final-tactic-merge-layer.js'), s5, { filename: 'final-tactic-merge-layer.js' });
  const r5 = s5.CurrentActionHintEngine.run(baseSnapshot, ctx({}));
  assert.equal(r5.finalTactic.ok, false, 'degraded finalTactic has ok:false');
  assert.equal(r5.finalTactic.vector, null, 'degraded finalTactic carries vector:null');
  assert.equal(r5.finalTactic.source, 'final_tactic_merge', 'degraded source names the layer');
  assert.equal(r5.finalTactic.error, 'final_tactic_computation_failed');
  jeq(r5.finalTactic.insufficientData, ['exception'], 'degraded flags the exception');
  console.log('T1f ok: wrapper exception → degraded {ok:false, vector:null}');
}

// ============================================================================
// T2 — generic-only d1/b1: preset base byte-equal + referenceLine
// ============================================================================
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({}));
  const ft = r.finalTactic;
  assert.equal(ft.schema, 'slf_final_tactic_v1');
  assert.equal(ft.base, 'preset:Conte_WideChannels_v11');
  jeq(ft.vector, CONTE, 'T2 vector is byte-equal to the preset (all 14 strings + priority)');
  assert.equal(ft.strong.defense, false);
  assert.equal(ft.strong.buildup, false);
  jeq(ft.overrides, { defense: 'preset', buildup: 'preset', style: 'preset', attack: 'preset', priority: 'preset' }, 'T2 every group stays preset');
  assert.ok(ft.referenceLine && ft.referenceLine.includes('d1/b1'), 'T2 reference line names d1/b1');
  assert.equal(ft.referenceLine, 'Эталон: d1/b1 — равный матч, применён пресет', 'T2 reference line exact wording');
  assert.equal(ft.source, 'merged:etalon:d1+b1+presets:Conte_WideChannels_v11', 'T2 source format');
  console.log('T2 ok:', ft.referenceLine);
}

// ============================================================================
// T3 — defense strong only: 4 defense keys overridden, rest preset
// ============================================================================

// T3a direct synthetic d5 over the Emery base (priority [] vs lanes defined).
{
  const s = makeSandbox();
  const ft = computeDirect(s, {
    action: { preset: 'Emery_BalancedBase_v11' },
    etalon: synthEtalon({
      situationIds: { defense: 'd5', buildup: 'b1', scenarios: [] }, ids: ['d5', 'b1'],
      defenseVector: { def_line: 2, press_line: 3, def_width: 1, press_intense: 4 },
      buildupVector: { build_type: 5, build_temp: 5, build_long: 5, build_fast: 5, style: 5 },
      applyVector: { def_line: 2, build_type: 5 },
      priorityLanes: ['left', 'right'], priorityOmitted: false
    })
  });
  assert.equal(ft.vector.def_line, '2');
  assert.equal(ft.vector.press_line, '3');
  assert.equal(ft.vector.def_width, '1');
  assert.equal(ft.vector.press_intense, '4');
  jeq(ft.vector, { ...EMERY, def_line: '2', press_line: '3', def_width: '1', press_intense: '4' }, 'T3a buildup/style/attack/priority all come from the preset');
  assert.equal(ft.vector.build_type, '2', 'T3a weak buildup block: etalon b1 values never leak');
  assert.equal(ft.vector.priority.join('+'), '', 'T3a lanes defined but buildup not strong → base priority survives');
  jeq(ft.overrides, { defense: 'etalon:d5', buildup: 'preset', style: 'preset', attack: 'preset', priority: 'preset' }, 'T3a only defense provenance flips to the etalon');
  assert.equal(ft.strong.defense, true);
  assert.equal(ft.strong.buildup, false);
  assert.equal(ft.referenceLine, null);
  assert.equal(ft.source, 'merged:etalon:d5+b1+presets:Emery_BalancedBase_v11');
  console.log('T3a ok: d5-only → defense overridden');
}

// T3b full chain: myDefVector 25 → d6, buildup stays b1.
{
  const s = makeSandbox();
  const snap = JSON.parse(JSON.stringify(baseSnapshot));
  snap.stats[0].stats.defVector = 25;
  const r = run(s, snap, ctx({}));
  const ft = r.finalTactic;
  assert.equal(r.etalon.situationIds.defense, 'd6');
  assert.equal(ft.strong.defense, true);
  assert.equal(ft.strong.buildup, false);
  assert.equal(ft.overrides.defense, 'etalon:d6');
  assert.equal(ft.overrides.buildup, 'preset');
  assert.equal(ft.overrides.priority, 'preset');
  for (const key of ['def_line', 'press_line', 'def_width', 'press_intense']) {
    assert.equal(ft.vector[key], String(r.etalon.defenseVector[key]), `T3b ${key} from the etalon defenseVector as STRING`);
  }
  assert.equal(ft.vector.build_type, '3', 'T3b buildup from preset');
  assert.equal(ft.vector.style, '4', 'T3b style from preset');
  jeq(ft.vector.priority, ['left', 'right'], 'T3b preset priority survives');
  assert.equal(ft.source, 'merged:etalon:d6+b1+presets:Conte_WideChannels_v11');
  console.log('T3b ok: chain d6 → defense overridden');
}

// ============================================================================
// T4 — buildup strong: present keys + lanes
// ============================================================================

// T4a full chain: opponent_high_press → b6 (its vector omits style).
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ tags: ['opponent_high_press'] }));
  const ft = r.finalTactic;
  assert.equal(r.etalon.situationIds.buildup, 'b6');
  assert.equal(ft.strong.defense, false);
  assert.equal(ft.strong.buildup, true);
  assert.equal(Object.prototype.hasOwnProperty.call(r.etalon.buildupVector, 'style'), false, 'b6 etalon vector really omits style');
  for (const key of ['build_type', 'build_temp', 'build_long', 'build_fast']) {
    assert.equal(ft.vector[key], String(r.etalon.buildupVector[key]), `T4a ${key} from the etalon buildupVector`);
  }
  assert.equal(ft.vector.style, '4', 'T4a style falls back to the preset when the etalon omits it');
  assert.equal(ft.overrides.style, 'preset', 'T4a style provenance stays preset');
  assert.equal(ft.overrides.buildup, 'etalon:b6');
  assert.equal(ft.overrides.defense, 'preset');
  assert.equal(ft.vector.def_line, '2', 'T4a defense stays preset');
  console.log('T4a ok: b6 → buildup overridden, style falls back to preset');
}

// T4b direct synthetic b5: lanes ['left','right'] win over the preset [].
{
  const s = makeSandbox();
  const ft = computeDirect(s, {
    action: { preset: 'Emery_BalancedBase_v11' },
    etalon: synthEtalon({
      situationIds: { defense: 'd1', buildup: 'b5', scenarios: [] }, ids: ['d1', 'b5'],
      buildupVector: { build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1 },
      defenseVector: { def_line: 5, press_line: 5, def_width: 5, press_intense: 5 },
      applyVector: { build_type: 1 },
      priorityLanes: ['left', 'right'], priorityOmitted: false
    })
  });
  jeq(ft.vector.priority, ['left', 'right'], 'T4b etalon lanes win over the preset priority []');
  assert.equal(ft.overrides.priority, 'etalon:b5');
  assert.equal(ft.overrides.buildup, 'etalon:b5');
  assert.equal(ft.overrides.style, 'etalon:b5');
  assert.equal(ft.vector.style, '1', 'T4b style overridden when the etalon supplies it');
  assert.equal(ft.vector.def_line, '2', 'T4b weak defense keeps the preset value (d1 vector never leaks)');
  assert.equal(ft.overrides.defense, 'preset', 'T4b defense provenance preset');
  assert.equal(ft.source, 'merged:etalon:d1+b5+presets:Emery_BalancedBase_v11');
  console.log('T4b ok: b5 lanes win over preset []');
}

// ============================================================================
// T5 — both blocks strong
// ============================================================================
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ score: { state: 'winning', diff: 2 }, tags: ['strength_advantage_clear'], strengthContext: { known: true, mode: 'advantage' } }));
  const ft = r.finalTactic;
  jeq(r.etalon.situationIds.scenarios, [], 'T5 winning-by-2 carries no score-play scenario');
  assert.equal(r.etalon.situationIds.defense, 'd2');
  assert.equal(r.etalon.situationIds.buildup, 'b2');
  assert.equal(ft.strong.defense, true);
  assert.equal(ft.strong.buildup, true);
  assert.equal(ft.overrides.defense, 'etalon:d2');
  assert.equal(ft.overrides.buildup, 'etalon:b2');
  assert.equal(ft.overrides.style, 'etalon:b2');
  for (const key of ['def_line', 'press_line', 'def_width', 'press_intense']) {
    assert.equal(ft.vector[key], String(r.etalon.defenseVector[key]), `T5 ${key} from etalon defense`);
  }
  for (const key of ['build_type', 'build_temp', 'build_long', 'build_fast', 'style']) {
    assert.equal(ft.vector[key], String(r.etalon.buildupVector[key]), `T5 ${key} from etalon buildup`);
  }
  for (const key of ['pass_risk', 'dribble', 'cross', 'corner', 'shot']) {
    assert.equal(ft.vector[key], CONTE[key], `T5 attack ${key} stays preset`);
  }
  assert.equal(r.etalon.priorityLanes, null, 'T5 b2 lanes omitted');
  jeq(ft.vector.priority, ['left', 'right'], 'T5 preset priority survives when lanes are omitted');
  assert.equal(ft.overrides.priority, 'preset');
  assert.equal(ft.source, 'merged:etalon:d2+b2+presets:Conte_WideChannels_v11');
  // String-domain pin for the whole merged vector.
  for (const key of CONTROL_KEYS) {
    assert.equal(typeof ft.vector[key], 'string', `T5 vector.${key} is a STRING ordinal`);
  }
  assert.ok(Array.isArray(ft.vector.priority) && ft.vector.priority.every(lane => typeof lane === 'string'), 'T5 priority is an array of strings');
  console.log('T5 ok: d2+b2 both strong, string domain pinned');
}

// ============================================================================
// T6 — hold_current / stale preset name → base is getCurrentTactic()
// ============================================================================
{
  const currentTactic = { def_line: '1', press_line: '1', def_width: '1', press_intense: '1', build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['center'] };
  const s = makeSandbox({ currentTactic });
  s.CurrentActionHintEngine.__stubAction = { preset: null, rawPreset: null, decision: 'hold_current', ruleId: 'suite_v11_hold_current', reason: 'no valid suite decision', libraryVersion: 'slf_tactic_suite_561_v11' };
  const snap = JSON.parse(JSON.stringify(baseSnapshot));
  snap.stats[0].stats.defVector = 25; // d6 strong
  const r = run(s, snap, ctx({}));
  const ft = r.finalTactic;
  assert.equal(ft.base, 'current_tactic');
  assert.equal(ft.presetId, null);
  assert.equal(ft.source, 'merged:current:d6+b1', 'T6 hold_current source: merged:current:<ids>');
  assert.equal(ft.vector.def_line, String(r.etalon.defenseVector.def_line), 'T6 etalon defense overrides the current base');
  assert.equal(ft.vector.build_type, '1', 'T6 current tactic fills the weak buildup block');
  jeq(ft.vector.priority, ['center'], 'T6 current priority survives');
  assert.equal(ft.overrides.defense, 'etalon:d6');
  assert.equal(ft.overrides.buildup, 'current');
  assert.equal(ft.overrides.attack, 'current');
  assert.equal(ft.overrides.priority, 'current');
  assert.ok(ft.deltaVsCurrent.some(item => item.key === 'def_line'), 'T6 delta vs current contains the overridden key');
  console.log('T6 ok: hold_current base = getCurrentTactic()');
}

// T6b: stale preset name (not in the registry) → current base + flag.
{
  const currentTactic = { def_line: '4', press_line: '4', def_width: '4', press_intense: '4', build_type: '4', build_temp: '4', build_long: '4', build_fast: '4', style: '4', pass_risk: '4', dribble: '4', cross: '4', corner: '2', shot: '4', priority: [] };
  const s = makeSandbox({ currentTactic });
  const ft = computeDirect(s, { action: { preset: 'Ghost_Removed_v11' }, etalon: null });
  assert.equal(ft.base, 'current_tactic', 'T6b unknown preset name falls back to the current tactic');
  assert.equal(ft.presetId, null);
  assert.ok(ft.insufficientData.includes('stale_preset_name'), 'T6b flags stale_preset_name');
  assert.equal(ft.vector.def_line, '4', 'T6b vector is the current tactic (normalized strings)');
  assert.equal(ft.source, 'merged:current:', 'T6b empty ids → merged:current: with no id list');
  console.log('T6b ok: stale preset name → current base + flag');
}

// ============================================================================
// Scenario strength details — s2 pre-60 vs ≥60, s3 split, s6 style-only
// ============================================================================

// s2 before minute 60: no block replacement → T2-like reference line only.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ score: { state: 'winning', diff: 1 }, tags: ['attacking_momentum'], minute: 30 }));
  const ft = r.finalTactic;
  jeq(r.etalon.situationIds.scenarios, ['s2']);
  assert.equal(r.etalon.situationIds.defense, 'd1', 's2 pre-60 keeps the default ids');
  assert.equal(ft.strong.scenario, 's2');
  assert.equal(ft.strong.defense, false);
  assert.equal(ft.strong.buildup, false);
  jeq(ft.vector, CONTE, 's2 pre-60 vector stays the pure preset');
  assert.ok(ft.referenceLine, 's2 pre-60 renders the T2 reference line');
  console.log('s2 pre-60 ok: T2-like, no override');
}

// s2 at/after minute 60: blocks replaced (d5/b5) → full override.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ score: { state: 'winning', diff: 1 }, tags: ['attacking_momentum'], minute: 65 }));
  const ft = r.finalTactic;
  assert.equal(r.etalon.situationIds.defense, 'd5');
  assert.equal(ft.strong.defense, true);
  assert.equal(ft.strong.buildup, true);
  assert.equal(ft.strong.scenario, 's2');
  assert.equal(ft.overrides.defense, 'etalon:d5');
  assert.equal(ft.overrides.buildup, 'etalon:b5');
  assert.equal(ft.referenceLine, null, 's2 ≥60 is not generic-only');
  console.log('s2 >=60 ok: strong override');
}

// s3: delta splits press_line→defense, the rest→buildup.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ score: { state: 'losing', diff: -1 }, tags: ['attacking_momentum'] }));
  const ft = r.finalTactic;
  jeq(r.etalon.situationIds.scenarios, ['s3']);
  assert.equal(ft.strong.defense, true, 's3 makes defense strong via press_line');
  assert.equal(ft.strong.buildup, true, 's3 makes buildup strong via its delta keys');
  assert.equal(ft.vector.press_line, String(r.etalon.defenseVector.press_line), 's3 press_line from the etalon defense block');
  assert.equal(ft.vector.def_line, '2', 's3 def_line stays preset (the delta does not shift it)');
  assert.equal(ft.vector.style, String(r.etalon.buildupVector.style), 's3 style from the etalon buildup block');
  assert.equal(ft.vector.build_temp, String(r.etalon.buildupVector.build_temp));
  assert.equal(ft.overrides.defense, 'etalon:d1', 's3 provenance names the base ids');
  assert.equal(ft.overrides.buildup, 'etalon:b1');
  console.log('s3 ok: press_line→defense, rest→buildup');
}

// s6: only style shifts; defense stays preset.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ score: { state: 'losing', diff: -1 }, myXg: 0.2, oppXg: 0.3 }));
  const ft = r.finalTactic;
  jeq(r.etalon.situationIds.scenarios, ['s6']);
  assert.equal(ft.strong.defense, false, 's6 does not strengthen defense');
  assert.equal(ft.strong.buildup, true, 's6 strengthens buildup via the style delta');
  assert.equal(ft.vector.style, String(r.etalon.buildupVector.style), 's6 style from the etalon');
  assert.equal(ft.overrides.buildup, 'etalon:b1');
  assert.equal(ft.overrides.style, 'etalon:b1');
  assert.equal(ft.overrides.defense, 'preset');
  assert.equal(ft.vector.build_type, '3', 's6 shifts style only — other buildup keys stay preset');
  assert.equal(ft.vector.def_line, '2', 's6 defense stays preset');
  jeq(ft.vector.priority, ['left', 'right'], 's6: b1 lanes omitted → preset priority survives');
  console.log('s6 ok: style-only shift');
}

// ============================================================================
// Differential identity — the merge layer only ADDS result.finalTactic
// ============================================================================
{
  const without = makeSandbox({ withMergeLayer: false });
  const withMerge = makeSandbox({ withMergeLayer: true });
  const mkSnap = () => JSON.parse(JSON.stringify(baseSnapshot));
  const context = ctx({ tags: ['opponent_high_press'] });
  const resultA = run(without, mkSnap(), JSON.parse(JSON.stringify(context)));
  const resultB = run(withMerge, mkSnap(), JSON.parse(JSON.stringify(context)));
  assert.equal(resultA.finalTactic, undefined, 'chain without the merge module has no finalTactic');
  jeq(resultA.action, resultB.action, 'result.action is byte-identical with/without the merge layer');
  jeq(resultA.etalon, resultB.etalon, 'result.etalon is byte-identical with/without the merge layer');
  const keysA = Object.keys(resultA).sort();
  const keysB = Object.keys(resultB).sort();
  jeq(keysB, [...keysA, 'finalTactic'].sort(), 'the merge layer adds ONLY the finalTactic key');
  console.log('identity ok: action/etalon untouched, only finalTactic added');
}

// ============================================================================
// Source format + normalization guards
// ============================================================================

// Source strings: merged:etalon:<ids>+presets:<preset> / merged:current:<ids>.
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ tags: ['opponent_high_press'] }));
  assert.match(r.finalTactic.source, /^merged:etalon:d1\+b6\+presets:Conte_WideChannels_v11$/, 'T4 source format pin');
  console.log('source format ok:', r.finalTactic.source);
}

// String domain on a chain-computed merged vector (etalon numbers → strings).
{
  const s = makeSandbox();
  const r = run(s, baseSnapshot, ctx({ tags: ['opponent_high_press'] }));
  for (const key of CONTROL_KEYS) {
    assert.equal(typeof r.finalTactic.vector[key], 'string', `vector.${key} is a STRING even when the etalon supplied a number`);
  }
  console.log('string domain ok: 14/14 values are strings');
}

// No preset and no readable current tactic → finalTactic is null.
{
  const s = makeSandbox({ currentTactic: null });
  s.CurrentActionHintEngine.__stubAction = { preset: null, decision: 'hold_current', reason: 'no valid suite decision' };
  const r = run(s, baseSnapshot, ctx({}));
  assert.equal(r.finalTactic, null, 'no preset + no getCurrentTactic → null finalTactic (never a fake recommendation)');
  console.log('null finalTactic ok: no base available');
}

// ============================================================================
// Exposure, idempotency, stale-registry guard
// ============================================================================
{
  const s = makeSandbox();
  assert.equal(s.CurrentActionHintEngine.__finalTacticMergeApplied, true, 'idempotency flag set');
  const layer = s.window.SLFFinalTacticMergeLayer;
  assert.equal(layer.autoApply, false, 'window.SLFFinalTacticMergeLayer.autoApply === false — the button is the only trigger');
  assert.equal(layer.version, 'slf_final_tactic_v1');
  assert.equal(typeof layer.computeFinalTactic, 'function', 'computeFinalTactic exposed for the panel/contract tests');
  // Loading the module a second time must be a no-op (flag guard).
  vm.runInContext(read('src/modules/strategy-data-recommendations/final-tactic-merge-layer.js'), s, { filename: 'final-tactic-merge-layer-again.js' });
  assert.equal(s.window.SLFFinalTacticMergeLayer, layer, 'double install keeps the same exported object');
  const r = run(s, baseSnapshot, ctx({}));
  assert.equal(r.finalTactic.schema, 'slf_final_tactic_v1', 'single wrapper still produces the merged recommendation');
  console.log('exposure + idempotency ok');
}

{
  const stale = makeSandbox({ suiteVersion: 'slf_tactic_suite_561_v10' });
  assert.equal(stale.window.SLFFinalTacticMergeLayer, undefined, 'stale registry suiteVersion → merge layer not installed');
  assert.equal(stale.CurrentActionHintEngine.__finalTacticMergeApplied, undefined);
  const r = stale.CurrentActionHintEngine.run(baseSnapshot, ctx({}));
  assert.equal(r.finalTactic, undefined, 'no finalTactic on a stale registry');
  const noRegistry = makeSandbox({ withRegistry: false });
  assert.equal(noRegistry.window.SLFFinalTacticMergeLayer, undefined, 'absent registry → merge layer not installed');
  console.log('stale-registry guard ok');
}

console.log('final tactic merge: T1-T6 + s2/s3/s6 + priority table + identity + string domain + guards: OK');
