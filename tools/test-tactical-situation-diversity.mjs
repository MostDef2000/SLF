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
    SLFActivePresetRegistry: { active: activePresets.slice(), removed: [] }
  },
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
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-direction-policy.js'), context, {
  filename: 'tactic-preset-direction-policy.js'
});

const engine = context.window.SLFCurrentActionHintEngine;
const policy = context.window.SLFTacticDirectionPolicy;
assert.ok(engine, 'rule engine must be exposed');
assert.equal(policy.version, '5.61-situation-v5');
assert.equal(engine.ACTIVE_PRESETS.length, 11);

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
  return Object.assign(signals, policy.deriveCounterTransitionContext(signals));
}

function select(overrides) {
  const signals = enrich(baseSignals(overrides));
  signals.situationKey = policy.classifySituation(signals);
  const runtime = { lastDecision: null, detectedPreset: '', detectedPresetSinceWindow: null };
  return engine.PresetRuleScorer.run(engine, signals, runtime, '').action.preset;
}

const scenarios = [
  ['balanced structure', { minute: 22 }, 'Arteta_Control433_bal3'],
  ['control reset', { minute: 42, controlNeed: 72, highBadActions: true, lowBadActions: false }, 'Pep_BoxControl_bal2'],
  ['press cooldown', { minute: 58, pressingCost: 70, pressFatigueRisk: true, myPowerDropPct: 4.5 }, 'Pep_PressCooldown_bal2'],
  ['compact counter with confirmed exit', {
    minute: 50,
    strengthGap: -55,
    strengthAdvantage: 0,
    strengthDisadvantage: 55,
    pressureRisk: 68,
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
    signals: ['counter_exit_available'],
    gameMode: 'compact_counter_control'
  }, 'Compact_Counter_def3'],
  ['pressure escape under sustained siege', {
    minute: 52,
    strengthGap: -35,
    strengthAdvantage: 30,
    strengthDisadvantage: 70,
    pressureRisk: 82,
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
  ['controlled push', { minute: 61, attackNeed: 58, signals: ['generator_attack_underperforming', 'generator_defense_working'], gameMode: 'controlled_chase' }, 'Pep_ControlledPush_att3'],
  ['positional squeeze', { minute: 49, strengthGap: 85, strengthAdvantage: 32, pressureRisk: 28, pressingOpportunity: 64, attackingMomentum: true, signals: ['generator_attack_working'], gameMode: 'front_foot_squeeze' }, 'Pep_TwoThreeFive_att3'],
  ['safe width', { minute: 54, attackNeed: 42, widthOpportunity: 78, signals: ['wide_opportunity'], gameMode: 'active_control' }, 'Conte_WingbackWidth_bal4'],
  ['late chase', { minute: 74, scoreState: 'losing', scoreDiff: -1, attackNeed: 76, pressureRisk: 38, pressingOpportunity: 70, pressingCost: 35, gameMode: 'controlled_chase' }, 'Klopp_Gegenpress_att4'],
  ['protect lead', { minute: 72, scoreState: 'winning', scoreDiff: 1, pressureRisk: 52, preservationNeed: 72, gameMode: 'emergency_lock' }, 'Simeone_Compact442_def4'],
  ['late emergency lock', { minute: 86, scoreState: 'winning', scoreDiff: 1, pressureRisk: 72, preservationNeed: 92, gameMode: 'emergency_lock' }, 'Simeone_LowBlock_def5'],
  ['final desperation', { minute: 88, scoreState: 'losing', scoreDiff: -1, attackNeed: 94, pressureRisk: 32, pressingOpportunity: 82, pressingCost: 30, gameMode: 'controlled_chase' }, 'Bielsa_ChaosPress_att5']
];

for (const [label, signals, expected] of scenarios) {
  const selected = select(signals);
  assert.equal(selected, expected, `${label}: expected ${expected}, received ${selected}`);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.equal(select(signals), expected, `${label}: identical state must remain deterministic`);
  }
}

const siegeSignals = enrich(baseSignals(scenarios.find(([label]) => label === 'pressure escape under sustained siege')[1]));
assert.equal(siegeSignals.opponentAttackDominance, true);
assert.equal(siegeSignals.opponentHighAttackVectors, true);
assert.equal(siegeSignals.sustainedSiege, true);
assert.equal(siegeSignals.counterExitAvailable, false);
const siegeCounterVeto = engine.PresetRuleScorer.hardVeto('Compact_Counter_def3', siegeSignals);
assert.equal(siegeCounterVeto.vetoed, true);
assert.ok(siegeCounterVeto.reasons.some(reason => reason.includes('непрерывная осада')));

const exitSignals = enrich(baseSignals(scenarios.find(([label]) => label === 'compact counter with confirmed exit')[1]));
assert.equal(exitSignals.sustainedSiege, false);
assert.equal(exitSignals.counterExitAvailable, true);
assert.equal(engine.PresetRuleScorer.hardVeto('Compact_Counter_def3', exitSignals).vetoed, false);

const rendered = context.RecommendationEngine.compactPlan({}, {}, '');
assert.match(rendered, /Действие:/);
assert.doesNotMatch(rendered, /Кандидаты:/);

const distinct = new Set(scenarios.map(([, signals]) => select(signals)));
assert.equal(distinct.size, 11, 'the scenario matrix must exercise all 11 active tactics');

console.log(`[tactical-situation-diversity] passed scenarios=${scenarios.length} distinct=${distinct.size}`);
