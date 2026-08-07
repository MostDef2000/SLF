import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const activePresets = [
  'Arteta_Control433_bal3',
  'Pep_BoxControl_bal2',
  'Pep_PressCooldown_bal2',
  'Compact_Counter_def3',
  'Pep_ControlledPush_att3',
  'Pep_TwoThreeFive_att3',
  'Conte_WingbackWidth_bal4',
  'Klopp_Gegenpress_att4',
  'Simeone_Compact442_def4',
  'Simeone_LowBlock_def5',
  'Bielsa_ChaosPress_att5'
];

const recommendationEngine = {
  compactPlan() {
    return '<div><div><b>Действие:</b> Pep</div><div><b>Кандидаты:</b> A · B · C</div></div>';
  },
  selectRawPreset() {
    return { name: 'Arteta_Control433_bal3' };
  }
};

const context = {
  console,
  window: {
    SLFActivePresetRegistry: { active: activePresets.slice(), removed: [], ladders: {} }
  },
  location: { pathname: '/noop.php', search: '' },
  localStorage: {
    getItem(key) {
      return key === 'slf:tactics:risk-appetite' ? 'bold' : null;
    },
    setItem() {}
  },
  setInterval(callback) {
    callback();
    return 1;
  },
  clearInterval() {},
  setTimeout(callback) {
    callback();
    return 1;
  },
  clearTimeout() {},
  BASE_PRESETS: Object.fromEntries(activePresets.map(name => [name, { priority: [] }])),
  TacticPresetLibrary: {
    meta: Object.fromEntries(activePresets.map(name => [name, {}])),
    traits: Object.fromEntries(activePresets.map(name => [name, {}])),
    schemeStates: {},
    presetSchemeState: {}
  },
  RecommendationEngine: recommendationEngine
};
context.globalThis = context;
vm.createContext(context);

const root = new URL('../', import.meta.url);
const source = relative => fs.readFileSync(new URL(relative, root), 'utf8');
vm.runInContext(source('src/modules/strategy-data-recommendations/current-action-hint-engine.js'), context, {
  filename: 'current-action-hint-engine.js'
});
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-library-panel.js'), context, {
  filename: 'tactic-preset-library-panel.js'
});
const panel = vm.runInContext('TacticPresetLibraryPanel', context);
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-direction-policy.js'), context, {
  filename: 'tactic-preset-direction-policy.js'
});

const engine = context.window.SLFCurrentActionHintEngine;
const policy = context.window.SLFTacticDirectionPolicy;
assert.ok(engine, 'rule engine must be exposed');
assert.equal(policy.version, '5.61-situation-v6');
assert.equal(policy.autoApply, false);
assert.equal(engine.ACTIVE_PRESETS.length, 11);
assert.equal(engine.schema, 'slf_rule_decision_v6_pressure_response');
assert.equal(source('src/modules/tactics-presets/tactic-preset-direction-policy.js').includes('eval('), false, 'direction policy must not bypass dependency/security audit with eval');

function baseSignals(overrides = {}) {
  return {
    gameId: 'scenario',
    minute: 30,
    generationWindowIndex: 3,
    scoreState: 'draw',
    scoreDiff: 0,
    signals: [],
    attackNeed: 20,
    controlNeed: 25,
    pressureRisk: 25,
    preservationNeed: 10,
    widthOpportunity: 10,
    pressingOpportunity: 45,
    pressingCost: 25,
    pressingResponse: 50,
    defensiveStability: 60,
    strengthAdvantage: 10,
    strengthDisadvantage: 0,
    strengthGap: 10,
    myPowerDropPct: 0,
    ownRedCard: false,
    opponentRedCard: false,
    highBadActions: false,
    lowBadActions: true,
    pressFatigueRisk: false,
    transitionThreat: false,
    underPressure: false,
    attackingMomentum: false,
    ownCrossesBad: false,
    opponentCrossesDangerous: false,
    gameMode: 'active_control',
    completeness: 1,
    riskAppetite: 'bold',
    myXg: 0.4,
    oppXg: 0.35,
    myXT: 0.35,
    oppXT: 0.3,
    myShots: 5,
    oppShots: 4,
    myPossession: 51,
    oppPossession: 49,
    myPressVector: 2,
    oppPressVector: 2,
    myDefVector: 2,
    oppDefVector: 2,
    myXgDelta: 0,
    oppXgDelta: 0,
    myShotsDelta: 0,
    oppShotsDelta: 0,
    ...overrides
  };
}

function enrich(signals) {
  return Object.assign(signals, policy.derivePressureResponseContext(signals));
}

function select(overrides) {
  const signals = enrich(baseSignals(overrides));
  signals.situationKey = policy.classifySituation(signals);
  if (signals.situationKey === 'siege_lock') signals.mandatoryReassessmentWindow = signals.generationWindowIndex + 1;
  const runtime = { lastDecision: null, detectedPreset: '', detectedPresetSinceWindow: null };
  return engine.PresetRuleScorer.run(engine, signals, runtime, '').action.preset;
}

const scenarios = [
  ['balanced structure', { minute: 22 }, 'Arteta_Control433_bal3'],
  ['control reset', { minute: 42, controlNeed: 72, highBadActions: true, lowBadActions: false }, 'Pep_BoxControl_bal2'],
  ['press cooldown', { minute: 58, pressingCost: 70, pressFatigueRisk: true, myPowerDropPct: 4.5 }, 'Pep_PressCooldown_bal2'],
  ['compact counter with confirmed exit', {
    minute: 50,
    strengthGap: -30,
    strengthAdvantage: 20,
    strengthDisadvantage: 80,
    pressureRisk: 58,
    underPressure: true,
    transitionThreat: true,
    myXg: 0.45,
    oppXg: 0.62,
    myXT: 0.28,
    oppXT: 0.4,
    myShots: 4,
    oppShots: 6,
    myPossession: 45,
    oppPossession: 55,
    myPressVector: 2,
    oppPressVector: 5,
    myDefVector: 2,
    oppDefVector: 4,
    signals: ['counter_exit_available'],
    gameMode: 'compact_counter_control'
  }, 'Compact_Counter_def3'],
  ['control escape under sustained siege', {
    minute: 52,
    strengthGap: -35,
    strengthAdvantage: 20,
    strengthDisadvantage: 80,
    pressureRisk: 72,
    controlNeed: 74,
    preservationNeed: 18,
    pressingOpportunity: 28,
    pressingCost: 40,
    underPressure: true,
    transitionThreat: true,
    myXg: 0.35,
    oppXg: 1.2,
    myXT: 0.2,
    oppXT: 0.8,
    myShots: 3,
    oppShots: 10,
    myPossession: 36,
    oppPossession: 64,
    myPressVector: -4,
    oppPressVector: 14,
    myDefVector: 2,
    oppDefVector: 12,
    gameMode: 'compact_counter_control'
  }, 'Pep_BoxControl_bal2'],
  ['temporary siege lock', {
    minute: 56,
    strengthGap: -45,
    strengthAdvantage: 15,
    strengthDisadvantage: 85,
    pressureRisk: 90,
    controlNeed: 85,
    underPressure: true,
    transitionThreat: true,
    highBadActions: true,
    lowBadActions: false,
    myPowerDropPct: 5.5,
    myXg: 0.25,
    oppXg: 1.4,
    myXT: 0.12,
    oppXT: 0.9,
    myShots: 2,
    oppShots: 12,
    myPossession: 32,
    oppPossession: 68,
    myPressVector: -5,
    oppPressVector: 15,
    myDefVector: 1,
    oppDefVector: 13
  }, 'Simeone_LowBlock_def5'],
  ['controlled push', { minute: 55, scoreState: 'losing', scoreDiff: -1, attackNeed: 58, signals: ['generator_attack_underperforming', 'generator_defense_working'], gameMode: 'controlled_chase' }, 'Pep_ControlledPush_att3'],
  ['positional squeeze', { minute: 49, strengthGap: 55, strengthAdvantage: 32, pressureRisk: 28, pressingOpportunity: 64, attackingMomentum: true, signals: ['generator_attack_working'], gameMode: 'front_foot_squeeze' }, 'Pep_TwoThreeFive_att3'],
  ['safe width', { minute: 54, attackNeed: 42, widthOpportunity: 78, signals: ['wide_opportunity'], gameMode: 'active_control' }, 'Conte_WingbackWidth_bal4'],
  ['late chase', { minute: 68, scoreState: 'losing', scoreDiff: -1, attackNeed: 76, pressureRisk: 38, pressingOpportunity: 70, pressingCost: 35, transitionThreat: false, underPressure: false, gameMode: 'controlled_chase' }, 'Klopp_Gegenpress_att4'],
  ['protect lead', { minute: 72, scoreState: 'winning', scoreDiff: 1, pressureRisk: 52, preservationNeed: 72, gameMode: 'emergency_lock' }, 'Simeone_Compact442_def4'],
  ['final desperation', { minute: 80, scoreState: 'losing', scoreDiff: -1, attackNeed: 94, pressureRisk: 32, pressingOpportunity: 82, pressingCost: 30, transitionThreat: false, underPressure: false, gameMode: 'controlled_chase' }, 'Bielsa_ChaosPress_att5']
];

for (const [label, signals, expected] of scenarios) {
  const selected = select(signals);
  assert.equal(selected, expected, `${label}: expected ${expected}, received ${selected}`);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.equal(select(signals), expected, `${label}: identical state must remain deterministic`);
  }
}

const controlEscapeSignals = enrich(baseSignals(scenarios.find(([label]) => label === 'control escape under sustained siege')[1]));
controlEscapeSignals.situationKey = policy.classifySituation(controlEscapeSignals);
assert.equal(controlEscapeSignals.sustainedSiege, true);
assert.equal(controlEscapeSignals.counterExitAvailable, false);
assert.equal(controlEscapeSignals.emergencyLockRequired, false);
assert.equal(controlEscapeSignals.situationKey, 'pressure_escape');
assert.equal(engine.PresetRuleScorer.hardVeto('Compact_Counter_def3', controlEscapeSignals).vetoed, true);

const exitSignals = enrich(baseSignals(scenarios.find(([label]) => label === 'compact counter with confirmed exit')[1]));
exitSignals.situationKey = policy.classifySituation(exitSignals);
assert.equal(exitSignals.sustainedSiege, false);
assert.equal(exitSignals.counterExitAvailable, true);
assert.equal(exitSignals.situationKey, 'compact_counter');
assert.equal(engine.PresetRuleScorer.hardVeto('Compact_Counter_def3', exitSignals).vetoed, false);

const siegeSignals = enrich(baseSignals(scenarios.find(([label]) => label === 'temporary siege lock')[1]));
siegeSignals.situationKey = policy.classifySituation(siegeSignals);
siegeSignals.mandatoryReassessmentWindow = siegeSignals.generationWindowIndex + 1;
assert.equal(siegeSignals.emergencyLockRequired, true);
assert.equal(siegeSignals.situationKey, 'siege_lock');
assert.equal(engine.PresetRuleScorer.hardVeto('Simeone_LowBlock_def5', siegeSignals).vetoed, false);
const lockDecision = engine.PresetRuleScorer.run(engine, siegeSignals, { lastDecision: null }, '');
assert.equal(lockDecision.action.preset, 'Simeone_LowBlock_def5');
assert.equal(lockDecision.action.mandatoryReassessment, true);
assert.equal(lockDecision.action.reassessAtWindow, siegeSignals.generationWindowIndex + 1);

const lateLossUnderSiege = { ...siegeSignals, scoreState: 'losing', minute: 80, attackNeed: 92, transitionThreat: false };
assert.equal(policy.classifySituation(lateLossUnderSiege), 'final_desperation', 'late deficit must outrank passive lock');

const inactionSignals = enrich(baseSignals({
  scoreState: 'losing', scoreDiff: -1, minute: 56, generationWindowIndex: 6,
  attackNeed: 68, pressureRisk: 61, underPressure: false, transitionThreat: false,
  oppXgDelta: 0.12, myXgDelta: 0, oppShotsDelta: 1, myShotsDelta: 0
}));
inactionSignals.situationKey = 'active_control';
inactionSignals.pressureResponse = 'none';
const inactionRuntime = {
  lastDecision: {
    action: { preset: 'Pep_BoxControl_bal2' },
    telemetry: { observation: { generationWindowIndex: 5 } }
  },
  detectedPreset: '',
  detectedPresetSinceWindow: null
};
const inactionDecision = engine.PresetRuleScorer.run(engine, inactionSignals, inactionRuntime, '');
assert.equal(inactionDecision.action.guardType, 'inaction_penalty');
assert.equal(inactionDecision.inactionPenalty.applied, true);
assert.ok(['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4'].includes(inactionDecision.action.preset));

for (const [name, positions] of Object.entries(policy.formations)) {
  assert.equal(positions.length, 11, `${name}: formation must contain eleven positions`);
  assert.equal(new Set(positions).size, 11, `${name}: formation positions must be unique`);
  assert.deepEqual(Array.from(panel.liveFormationPositions[name]), Array.from(positions));
}
assert.notDeepEqual(Array.from(policy.formations.Pep_TwoThreeFive_att3), Array.from(policy.formations.Pep_ControlledPush_att3));
assert.notDeepEqual(Array.from(policy.formations.Klopp_Gegenpress_att4), Array.from(policy.formations.Arteta_Control433_bal3));
assert.match(context.TacticPresetLibrary.schemeStates.Pep_TwoThreeFive_att3, /3-2-5/);
assert.match(context.TacticPresetLibrary.schemeStates.Klopp_Gegenpress_att4, /4-2-4/);
assert.equal(context.BASE_PRESETS.Pep_BoxControl_bal2.build_fast, '2');
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.priority.length, 0);

const rendered = context.RecommendationEngine.compactPlan({}, {}, '');
assert.match(rendered, /Действие:/);
assert.doesNotMatch(rendered, /Кандидаты:/);

const distinct = new Set(scenarios.map(([, signals]) => select(signals)));
assert.equal(distinct.size, 11, 'the scenario matrix must exercise all 11 active tactics');

console.log(`[tactical-situation-diversity] passed scenarios=${scenarios.length} distinct=${distinct.size} policy=${policy.version}`);
