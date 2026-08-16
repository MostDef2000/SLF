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

const retired = ['Mourinho_WeakSide_def3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3'];
const context = {
  console,
  window: {},
  location: { pathname: '/noop.php', search: '' },
  localStorage: { getItem() { return null; }, setItem() {} },
  setInterval(callback) { callback(); return 1; },
  clearInterval() {},
  setTimeout(callback) { callback(); return 1; },
  clearTimeout() {},
  BASE_PRESETS: Object.assign(
    { standard: { style: '4', priority: [] } },
    Object.fromEntries(activePresets.map(name => [name, { style: '3', priority: [] }])),
    Object.fromEntries(retired.map(name => [name, { style: '3', priority: [] }]))
  ),
  BASE_LABELS: Object.assign(
    { standard: 'standard' },
    Object.fromEntries([...activePresets, ...retired].map(name => [name, name]))
  ),
  TacticPresetLibrary: {
    meta: {},
    traits: {},
    schemeStates: {},
    presetSchemeState: {},
    getSchemeForPreset(name) {
      const state = this.presetSchemeState[name] || 'base_balance';
      return this.schemeStates[state] || this.schemeStates.base_balance || '';
    },
    getTraits(name) { return this.traits[name] || null; },
    getGroup(name) { return this.meta[name]?.group || 'custom'; },
    getRank(name) { return Number(this.meta[name]?.rank || 0); }
  },
  STATE: { presetProgression: null },
  TacticalUrgencyModel: {
    classify() { return { allowPreset: true, overrideProgressionGuard: false, level: 'normal' }; }
  },
  RecommendationEngine: {
    selectRawPreset() { return { name: 'Arteta_Control433_bal3', reason: 'stub' }; },
    getPresetTitle(name) { return context.BASE_LABELS[name] || name; },
    getPresetScheme(name) { return context.TacticPresetLibrary.getSchemeForPreset(name); },
    getPresetGroup(name) { return context.TacticPresetLibrary.getGroup(name); },
    getPresetRank(name) { return context.TacticPresetLibrary.getRank(name); },
    getConcisePresetAction(name) { return `apply ${name}`; },
    shouldRecommendSchemeChange() { return { show: false, reason: '' }; },
    hasStrongPostApplyFailure() { return false; }
  }
};
context.globalThis = context;
vm.createContext(context);

const root = new URL('../', import.meta.url);
const source = relative => fs.readFileSync(new URL(relative, root), 'utf8');

vm.runInContext(source('src/modules/strategy-data-recommendations/current-action-hint-engine.js'), context, { filename: 'current-action-hint-engine.js' });
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-library-panel.js'), context, { filename: 'tactic-preset-library-panel.js' });
vm.runInContext(source('src/modules/tactics-presets/active-preset-registry.js'), context, { filename: 'active-preset-registry.js' });
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-direction-policy.js'), context, { filename: 'tactic-preset-direction-policy.js' });

const engine = context.window.SLFCurrentActionHintEngine;
const registry = context.window.SLFActivePresetRegistry;
const policy = context.window.SLFTacticDirectionPolicy;
const panel = vm.runInContext('TacticPresetLibraryPanel', context);
const recommendation = context.RecommendationEngine;

assert.ok(registry, 'active tactical registry must exist');
assert.equal(registry.suiteVersion, 'slf_tactic_suite_561_v7');
assert.equal(registry.recommendationSchema, 'slf_rule_decision_v7_tactical_suite');
assert.equal(registry.defaultRiskAppetite, 'standard');
assert.equal(registry.fallbackPolicy, '5.61-tactical-suite-v7');
assert.deepEqual(Array.from(registry.active), activePresets);
assert.equal(new Set(registry.active).size, 11);
assert.equal(Object.keys(registry.presets).length, 11);
assert.equal(Object.keys(registry.formations).length, 11);
assert.equal(Object.keys(registry.meta).length, 11);
assert.equal(Object.keys(registry.traits).length, 11);

for (const name of activePresets) {
  assert.ok(context.BASE_PRESETS[name], `${name}: controls must be installed into BASE_PRESETS`);
  assert.ok(context.BASE_LABELS[name], `${name}: UI label must exist`);
  assert.ok(registry.meta[name]?.role, `${name}: tactical role must exist`);
  assert.ok(registry.traits[name], `${name}: traits must exist`);
  assert.equal(registry.formations[name].length, 11, `${name}: formation must have 11 slots`);
  assert.equal(new Set(registry.formations[name]).size, 11, `${name}: formation slots must be unique`);
  assert.ok(registry.displayOrder.includes(name), `${name}: must be visible in display order`);
}
for (const name of retired) {
  assert.equal(context.BASE_PRESETS[name], undefined, `${name}: retired preset must be removed from built-ins`);
  assert.equal(context.BASE_LABELS[name], undefined, `${name}: retired label must be removed from UI`);
  assert.ok(registry.removed.includes(name), `${name}: retired identity must remain explicit`);
}

assert.equal(context.BASE_PRESETS.Compact_Counter_def3.build_long, '4');
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.build_fast, '4');
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.pass_risk, '2');
assert.deepEqual(Array.from(registry.traits.Compact_Counter_def3.requires), ['confirmed_counter_exit']);
assert.match(context.TacticPresetLibrary.getSchemeForPreset('Pep_TwoThreeFive_att3'), /3-2-5/);
assert.match(context.TacticPresetLibrary.getSchemeForPreset('Simeone_LowBlock_def5'), /emergency lock/);
assert.deepEqual(Array.from(panel.livePresetOrder), activePresets, 'live UI order must derive from registry');
assert.deepEqual(Array.from(panel.liveFormationPositions.Klopp_Gegenpress_att4), Array.from(registry.formations.Klopp_Gegenpress_att4));

assert.ok(policy, 'direction policy must exist');
assert.equal(policy.version, '5.61-tactical-suite-v7');
assert.equal(policy.suiteVersion, registry.suiteVersion);
assert.equal(policy.recommendationSchema, registry.recommendationSchema);
assert.equal(policy.defaultRiskAppetite, 'standard');
assert.equal(policy.autoApply, false);
assert.equal(engine.schema, 'slf_rule_decision_v7_tactical_suite');
assert.equal(engine.__tacticSuiteV7Installed, true);
assert.equal(source('src/modules/tactics-presets/tactic-preset-direction-policy.js').includes('eval('), false);

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
    defensiveStability: 60,
    strengthGap: 10,
    myPowerDropPct: 0,
    ownRedCard: false,
    highBadActions: false,
    lowBadActions: true,
    pressFatigueRisk: false,
    transitionThreat: false,
    underPressure: false,
    attackingMomentum: false,
    centerClosed: false,
    wideQuality: false,
    ownCrossesBad: false,
    opponentCrossesDangerous: false,
    myBad: 10,
    riskAppetite: 'standard',
    ...overrides
  };
}

function directDecision(overrides = {}) {
  const signals = baseSignals(overrides);
  Object.assign(signals, policy.deriveSuiteContext(signals));
  signals.situationKey = policy.classifySituation(signals);
  return engine.PresetRuleScorer.run(engine, signals, { lastDecision: null, detectedPreset: '' }, '');
}

const scenarios = [
  ['stable control', {}, 'Arteta_Control433_bal3', 'stable_control'],
  ['pressure escape', { underPressure: true, pressureRisk: 65, signals: ['under_pressure','counter_exit_blocked'], counterExitAvailable: false }, 'Pep_BoxControl_bal2', 'pressure_escape'],
  ['confirmed counter outlet', { underPressure: true, pressureRisk: 62, signals: ['under_pressure','counter_exit_available'], counterExitAvailable: true }, 'Compact_Counter_def3', 'pressure_counter'],
  ['press cooldown', { pressFatigueRisk: true, myPowerDropPct: 4.5 }, 'Pep_PressCooldown_bal2', 'press_cooldown'],
  ['width attack', { centerClosed: true, wideQuality: true, signals: ['center_closed','wide_quality'] }, 'Conte_WingbackWidth_bal4', 'width_attack'],
  ['protect lead', { minute: 72, scoreState: 'winning', pressureRisk: 30 }, 'Simeone_Compact442_def4', 'protect_lead'],
  ['emergency lock', { minute: 58, underPressure: true, pressureRisk: 90, highBadActions: true, lowBadActions: false, counterExitAvailable: false, signals: ['under_pressure','sustained_siege','counter_exit_blocked'] }, 'Simeone_LowBlock_def5', 'emergency_lock'],
  ['controlled chase', { minute: 55, scoreState: 'losing', attackNeed: 48 }, 'Pep_ControlledPush_att3', 'controlled_chase'],
  ['positional siege', { minute: 62, scoreState: 'draw', attackNeed: 60, attackingMomentum: true }, 'Pep_TwoThreeFive_att3', 'positional_siege'],
  ['late high pressure', { minute: 76, scoreState: 'losing', attackNeed: 80, myBad: 10, lowBadActions: true }, 'Klopp_Gegenpress_att4', 'late_high_pressure'],
  ['final all in', { minute: 86, scoreState: 'losing', attackNeed: 92, myBad: 10, lowBadActions: true }, 'Bielsa_ChaosPress_att5', 'final_all_in']
];

for (const [label, input, expectedPreset, expectedSituation] of scenarios) {
  const decision = directDecision(input);
  assert.equal(decision.situationKey, expectedSituation, `${label}: situation`);
  assert.equal(decision.action.preset, expectedPreset, `${label}: preset`);
  assert.ok(activePresets.includes(decision.action.preset), `${label}: recommendation must be visible in UI`);
}

const noOutlet = baseSignals({
  underPressure: true,
  strengthGap: -80,
  strengthDisadvantage: 95,
  counterExitAvailable: false,
  signals: ['under_pressure','counter_exit_blocked']
});
Object.assign(noOutlet, policy.deriveSuiteContext(noOutlet));
noOutlet.situationKey = policy.classifySituation(noOutlet);
assert.equal(policy.hardVeto('Compact_Counter_def3', noOutlet).vetoed, true, 'team weakness must never unlock Compact Counter without outlet');
assert.equal(directDecision(noOutlet).action.preset, 'Pep_BoxControl_bal2');

const winningLate = baseSignals({ minute: 78, scoreState: 'winning', attackNeed: 0 });
Object.assign(winningLate, policy.deriveSuiteContext(winningLate));
winningLate.situationKey = policy.classifySituation(winningLate);
assert.equal(policy.hardVeto('Klopp_Gegenpress_att4', winningLate).vetoed, true);
assert.equal(policy.hardVeto('Bielsa_ChaosPress_att5', winningLate).vetoed, true);

const lateLosingFatigue = directDecision({ minute: 78, scoreState: 'losing', attackNeed: 80, pressFatigueRisk: true, myPowerDropPct: 5.5, myBad: 12, lowBadActions: true });
assert.notEqual(lateLosingFatigue.action.preset, 'Pep_PressCooldown_bal2', 'late loss must not recommend defensive cooldown');
assert.notEqual(lateLosingFatigue.action.preset, 'Klopp_Gegenpress_att4', 'fatigue must block Klopp');
assert.notEqual(lateLosingFatigue.action.preset, 'Bielsa_ChaosPress_att5', 'fatigue must block Bielsa');

context.STATE.presetProgression = {
  gameId: 'route-game',
  lastAppliedPreset: 'Arteta_Control433_bal3',
  previousPreset: '',
  lastScoreState: 'losing'
};
let guarded = recommendation.applyProgressionGuard(
  { name: 'Klopp_Gegenpress_att4', reason: 'late pressure' },
  { gameId: 'route-game', status: 'live' },
  { score: { state: 'losing' }, urgency: { overrideProgressionGuard: false } }
);
assert.equal(guarded.name, 'Pep_ControlledPush_att3', 'normal escalation must move only one graph step');
assert.equal(guarded.progressionAction, 'route_step');

context.STATE.presetProgression = {
  gameId: 'route-game',
  lastAppliedPreset: 'Pep_ControlledPush_att3',
  previousPreset: 'Arteta_Control433_bal3',
  lastScoreState: 'losing'
};
guarded = recommendation.applyProgressionGuard(
  { name: 'Arteta_Control433_bal3', reason: 'rollback' },
  { gameId: 'route-game', status: 'live' },
  { score: { state: 'losing' }, urgency: { overrideProgressionGuard: false } }
);
assert.equal(guarded.name, 'Pep_ControlledPush_att3', 'anti-ping-pong must block immediate rollback');

context.STATE.presetProgression = {
  gameId: 'route-game',
  lastAppliedPreset: 'Arteta_Control433_bal3',
  previousPreset: '',
  lastScoreState: 'winning'
};
guarded = recommendation.applyProgressionGuard(
  { name: 'Simeone_LowBlock_def5', reason: 'emergency' },
  { gameId: 'route-game', status: 'live' },
  { score: { state: 'winning' }, urgency: { overrideProgressionGuard: false } }
);
assert.equal(guarded.name, 'Simeone_LowBlock_def5', 'emergency lock may bypass one-step route');
assert.equal(guarded.progressionAction, 'emergency_override');

context.STATE.presetProgression = {
  gameId: 'render-game',
  lastAppliedPreset: 'Arteta_Control433_bal3',
  previousPreset: '',
  lastScoreState: 'losing'
};
const snapshot = {
  gameId: 'render-game',
  status: 'live',
  minute: 76,
  generationWindow: { index: 7 },
  currentTactic: context.BASE_PRESETS.Arteta_Control433_bal3,
  tacticTelemetry: {}
};
const state = {
  minute: 76,
  score: { state: 'losing', diff: -1 },
  myXg: 0.7,
  oppXg: 0.9,
  myXT: 0.4,
  oppXT: 0.45,
  myBad: 10,
  myPower: 100,
  oppPower: 100,
  strengthGap: 0,
  pressFatigue: { active: false },
  tags: ['low_bad_actions'],
  urgency: { allowPreset: true, overrideProgressionGuard: false, level: 'normal' }
};
const plan = { preset: [], primaryPresetName: '' };
const finalName = recommendation.selectPreset(snapshot, {}, {}, {}, plan, state);
assert.equal(finalName, 'Pep_ControlledPush_att3', 'UI recommendation must show the guarded one-step result');
assert.equal(plan.primaryPresetName, finalName);
assert.equal(snapshot.ruleDecision.action.preset, finalName, 'ruleDecision must be rewritten to final guarded UI preset');
assert.equal(snapshot.ruleDecision.telemetry.recommendedPreset, finalName, 'telemetry must match final UI preset');
assert.equal(snapshot.tacticTelemetry.libraryVersion, 'slf_tactic_suite_561_v7');
assert.equal(snapshot.tacticTelemetry.recommendationSchema, 'slf_rule_decision_v7_tactical_suite');
assert.equal(snapshot.tacticTelemetry.riskAppetite, 'standard');

assert.equal(source('src/modules/strategy-data-recommendations/coach-mode-policy.js').includes('nextPreset = allowedFallback'), false, 'late coach layer must not replace v7 selection');
assert.equal(source('src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js').includes('candidateFromStyle'), false, 'adaptive layer must not replace v7 selection');
assert.equal(source('src/modules/strategy-data-recommendations/moment-drift-stabilizer.js').includes('stableState.action'), false, 'drift layer must not replace v7 selection');

console.log('tactical suite v7 registry, UI identity, eligibility, progression and recommendation scenarios: OK');