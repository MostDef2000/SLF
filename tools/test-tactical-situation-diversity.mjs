import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const active = [
  'Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Compact_Counter_def3',
  'Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4',
  'Simeone_Compact442_def4','Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'
];
const retired = ['Mourinho_WeakSide_def3','Xabi_BoxMidfield_bal3','DeZerbi_BaitPress_bal3'];
const root = new URL('../', import.meta.url);
const source = path => fs.readFileSync(new URL(path, root), 'utf8');

const context = {
  console,
  window: { localStorage:{ getItem(){ return null; } } },
  localStorage: { getItem(){ return null; }, setItem(){} },
  BASE_PRESETS:Object.assign({standard:{style:'4',priority:[]}},Object.fromEntries([...active,...retired].map(name=>[name,{style:'3',priority:[]}]))),
  BASE_LABELS:Object.assign({standard:'standard'},Object.fromEntries([...active,...retired].map(name=>[name,name]))),
  TacticPresetLibrary:{meta:{},traits:{},schemeStates:{},presetSchemeState:{},getGroup(name){return this.meta[name]?.group||'custom';},getRank(name){return Number(this.meta[name]?.rank||0);}},
  RecommendationEngine:{
    getPresetLadder(){return[];}, getAdjacentPresetInFamily(_current,desired){return desired;},
    applyProgressionGuard(candidate,snapshot){
      const p=context.progression;
      if(!p||p.gameId!==snapshot.gameId||!p.lastAppliedPreset)return Object.assign({},candidate,{progressionAction:'new_baseline'});
      if(candidate.name===p.previousPreset)return {name:p.lastAppliedPreset,reason:'anti ping pong',progressionAction:'hold_against_immediate_rollback'};
      const step=this.getAdjacentPresetInFamily(p.lastAppliedPreset,candidate.name);
      return step!==candidate.name?{name:step,reason:'one step',progressionAction:'family_step'}:Object.assign({},candidate,{progressionAction:'accepted'});
    }
  },
  setInterval(fn){fn();return 1;}, clearInterval(){}, setTimeout(fn){fn();return 1;}, clearTimeout(){}
};
context.window.SLFCurrentActionHintEngine = {
  schema:'old', ACTIVE_PRESETS:active.slice(),
  run(_snapshot,ctx={}){return {schema:'old',moment:{context:Object.assign({},ctx),gameId:'g',minute:Number(ctx.minute||0)},action:{preset:'Arteta_Control433_bal3',reason:'old'},candidates:[],confidence:{level:'low',gap:0},margin:0,telemetry:{}};}
};
context.globalThis=context;
vm.createContext(context);

vm.runInContext(source('src/modules/tactics-presets/active-preset-registry.js'),context,{filename:'active-preset-registry.js'});
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-direction-policy.js'),context,{filename:'tactic-preset-direction-policy.js'});

const registry=context.window.SLFActivePresetRegistry;
const policy=context.window.SLFTacticDirectionPolicy;
const engine=context.window.SLFCurrentActionHintEngine;

assert.equal(registry.suiteVersion,'slf_tactic_suite_561_v7');
assert.equal(registry.recommendationSchema,'slf_rule_decision_v7_tactical_suite');
assert.equal(registry.defaultRiskAppetite,'standard');
assert.deepEqual(Array.from(registry.active),active);
assert.equal(new Set(registry.active).size,11);
assert.equal(Object.keys(registry.presets).length,11);
assert.equal(Object.keys(registry.formations).length,11);
assert.equal(Object.keys(registry.meta).length,11);
assert.equal(Object.keys(registry.traits).length,11);
for(const name of active){
  assert.ok(context.BASE_PRESETS[name],`${name}: controls`);
  assert.ok(context.BASE_LABELS[name],`${name}: label`);
  assert.ok(registry.meta[name]?.role,`${name}: role`);
  assert.ok(registry.traits[name],`${name}: traits`);
  assert.equal(registry.formations[name].length,11,`${name}: formation length`);
  assert.equal(new Set(registry.formations[name]).size,11,`${name}: unique formation slots`);
  assert.ok(registry.displayOrder.includes(name),`${name}: visible display order`);
}
for(const name of retired){assert.equal(context.BASE_PRESETS[name],undefined);assert.equal(context.BASE_LABELS[name],undefined);assert.ok(registry.removed.includes(name));}
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.build_long,'4');
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.build_fast,'4');
assert.equal(context.BASE_PRESETS.Compact_Counter_def3.pass_risk,'2');
assert.equal(policy.version,'5.61-tactical-suite-v7.1');
assert.equal(policy.defaultRiskAppetite,'standard');
assert.equal(policy.autoApply,false);
assert.equal(engine.schema,'slf_rule_decision_v7_tactical_suite');
assert.equal(engine.__tacticSuiteV7Installed,true);

function decide(input={}){
  const snapshot={gameId:'scenario',status:'live',tacticTelemetry:{}};
  const decision=engine.run(snapshot,Object.assign({minute:30,scoreState:'draw',score:{state:'draw'},attackNeed:20,myBad:10,lowBadActions:true,signals:[]},input));
  assert.ok(active.includes(decision.action.preset),'recommendation must exist in active UI set');
  assert.equal(snapshot.tacticTelemetry.libraryVersion,'slf_tactic_suite_561_v7');
  assert.equal(snapshot.tacticTelemetry.recommendationSchema,'slf_rule_decision_v7_tactical_suite');
  assert.equal(decision.telemetry.recommendedPreset,decision.action.preset);
  const eligible=decision.candidates.filter(item=>!item.vetoed);
  assert.ok(eligible.length>=2,'diagnostics must keep ranked eligible alternatives');
  assert.ok(new Set(eligible.map(item=>item.score)).size>=2,'candidate scores must be meaningful, not selected=100/rest=0 placeholders');
  assert.ok(decision.runnerUp?.preset,'runner-up must be explicit');
  assert.equal(decision.margin,decision.action.score-decision.runnerUp.score,'margin must match final raw ranking');
  assert.equal(decision.confidence.gap,decision.margin,'confidence gap must match v7 margin');
  return decision;
}

const scenarios=[
  ['stable',{},'Arteta_Control433_bal3','stable_control'],
  ['pressure escape',{underPressure:true,counterExitAvailable:false,signals:['under_pressure','counter_exit_blocked']},'Pep_BoxControl_bal2','pressure_escape'],
  ['counter',{underPressure:true,counterExitAvailable:true,signals:['under_pressure','counter_exit_available']},'Compact_Counter_def3','pressure_counter'],
  ['cooldown',{pressFatigueRisk:true,myPowerDropPct:5},'Pep_PressCooldown_bal2','press_cooldown'],
  ['width',{centerClosed:true,wideQuality:true,signals:['center_closed','wide_quality']},'Conte_WingbackWidth_bal4','width_attack'],
  ['protect',{minute:72,scoreState:'winning',score:{state:'winning'}},'Simeone_Compact442_def4','protect_lead'],
  ['lock',{minute:60,underPressure:true,counterExitAvailable:false,pressureRisk:90,highBadActions:true,signals:['under_pressure','sustained_siege']},'Simeone_LowBlock_def5','emergency_lock'],
  ['chase',{minute:55,scoreState:'losing',score:{state:'losing'},attackNeed:48},'Pep_ControlledPush_att3','controlled_chase'],
  ['siege',{minute:62,attackNeed:60,attackingMomentum:true},'Pep_TwoThreeFive_att3','positional_siege'],
  ['klopp',{minute:76,scoreState:'losing',score:{state:'losing'},attackNeed:80,myBad:10,lowBadActions:true},'Klopp_Gegenpress_att4','late_high_pressure'],
  ['bielsa',{minute:86,scoreState:'losing',score:{state:'losing'},attackNeed:92,myBad:10,lowBadActions:true},'Bielsa_ChaosPress_att5','final_all_in']
];
for(const [label,input,preset,situation] of scenarios){const d=decide(input);assert.equal(d.situationKey,situation,`${label}: situation`);assert.equal(d.action.preset,preset,`${label}: preset`);}

const noOutlet={underPressure:true,counterExitAvailable:false,signals:['under_pressure','counter_exit_blocked'],strengthGap:-100};
assert.equal(policy.hardVeto('Compact_Counter_def3',noOutlet).vetoed,true);
assert.equal(decide(noOutlet).action.preset,'Pep_BoxControl_bal2');
const winLate={minute:78,scoreState:'winning',score:{state:'winning'}};
assert.equal(policy.hardVeto('Klopp_Gegenpress_att4',winLate).vetoed,true);
assert.equal(policy.hardVeto('Bielsa_ChaosPress_att5',winLate).vetoed,true);
const tired=decide({minute:78,scoreState:'losing',score:{state:'losing'},attackNeed:80,pressFatigueRisk:true,myPowerDropPct:6,myBad:12,lowBadActions:true});
assert.notEqual(tired.action.preset,'Pep_PressCooldown_bal2');
assert.notEqual(tired.action.preset,'Klopp_Gegenpress_att4');
assert.notEqual(tired.action.preset,'Bielsa_ChaosPress_att5');

context.progression={gameId:'route',lastAppliedPreset:'Arteta_Control433_bal3',previousPreset:'',lastScoreState:'losing'};
let snap={gameId:'route',status:'live',ruleDecision:{action:{preset:'Klopp_Gegenpress_att4'},telemetry:{}}};
let guarded=context.RecommendationEngine.applyProgressionGuard({name:'Klopp_Gegenpress_att4',reason:'late'},snap,{score:{state:'losing'},urgency:{overrideProgressionGuard:false}});
assert.equal(guarded.name,'Pep_ControlledPush_att3');
assert.equal(snap.ruleDecision.action.rawPreset,'Klopp_Gegenpress_att4');
assert.equal(snap.ruleDecision.action.preset,'Pep_ControlledPush_att3');
assert.equal(snap.ruleDecision.telemetry.recommendedPreset,'Pep_ControlledPush_att3');
context.progression={gameId:'route',lastAppliedPreset:'Pep_ControlledPush_att3',previousPreset:'Arteta_Control433_bal3'};
guarded=context.RecommendationEngine.applyProgressionGuard({name:'Arteta_Control433_bal3',reason:'rollback'},{gameId:'route',status:'live',ruleDecision:{action:{preset:'Arteta_Control433_bal3'},telemetry:{}}},{urgency:{overrideProgressionGuard:false}});
assert.equal(guarded.name,'Pep_ControlledPush_att3');
context.progression={gameId:'route',lastAppliedPreset:'Arteta_Control433_bal3',previousPreset:''};
guarded=context.RecommendationEngine.applyProgressionGuard({name:'Simeone_LowBlock_def5',reason:'emergency'},{gameId:'route',status:'live',ruleDecision:{action:{preset:'Simeone_LowBlock_def5'},telemetry:{}}},{urgency:{overrideProgressionGuard:false}});
assert.equal(guarded.name,'Simeone_LowBlock_def5');
assert.equal(guarded.progressionAction,'emergency_override');

for(const file of ['coach-mode-policy.js','adaptive-opponent-style-layer.js','moment-drift-stabilizer.js']){
  const text=source(`src/modules/strategy-data-recommendations/${file}`);
  assert.equal(/candidateFromStyle|nextPreset\s*=\s*allowedFallback|stableState\.action/.test(text),false,`${file}: must be advisory only`);
}

const tacticalLabContract=JSON.parse(source('data/tactics/tactical-lab-contract-v1.json'));
const tacticControlEngine=source('src/modules/tactics-presets/tactic-control-engine.js');
const tacticalLabRuntime=tacticControlEngine;
const strategyDataUi=source('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js');
assert.equal(tacticalLabContract.schema,'slf_tactical_lab_contract_v1');
assert.equal(tacticalLabContract.population.populationVersion,'slf_tactical_lab_561_p02');
assert.equal(tacticalLabContract.population.supersedesPopulationVersion,'slf_tactical_lab_561_p01');
assert.equal(tacticalLabContract.population.genomeScope,'tactical_controls_only');
assert.equal(tacticalLabContract.population.size,64);
assert.deepEqual(tacticalLabContract.population.groups,{production_mutation:16,orthogonal:16,deterministic_random:16,extreme:16});
assert.deepEqual(tacticalLabContract.population.nativeControlDomains,{
  def_line:['1','2','3'], press_line:['1','2','3'], def_width:['1','2','3'], press_intense:['1','2','3','4','5'],
  build_type:['1','2','3'], build_temp:['1','2','3'], build_long:['1','2','3'], build_fast:['1','2','3'],
  style:['1','2','3','4','5'], pass_risk:['1','2','3','4','5'], dribble:['1','2','3','4','5'], cross:['1','2','3'],
  corner:['1','2'], shot:['1','2','3'], priority:['left','center','right']
});
assert.equal(tacticalLabContract.assignment.activationMinuteRestricted,false);
assert.equal(tacticalLabContract.assignment.onePerMatch,true);
assert.equal(tacticalLabContract.assignment.rerollAllowed,false);
assert.equal(tacticalLabContract.assignment.oneSuccessfulActivationPerMatch,true);
assert.equal(tacticalLabContract.productionBoundary.productionRegistryOwnsExperiments,false);
assert.equal(tacticalLabContract.productionBoundary.productionRecommenderMayReturnExperiment,false);
assert.equal(tacticalLabContract.application.requiresExplicitUserClick,true);
assert.equal(tacticalLabContract.application.backgroundAutoApply,false);
assert.equal(tacticalLabContract.application.backgroundMonitoring,false);
assert.equal(tacticalLabContract.application.checkpointModel,'explicit_user_actions_only');
assert.equal(tacticalLabContract.application.singleClickAppliesControls,true);
assert.equal(tacticalLabContract.application.singleClickAppliesFormation,false);
assert.equal(tacticalLabContract.application.singleClickUsesNativeLineupSave,false);
assert.equal(tacticalLabContract.application.lineupMutationAllowed,false);
assert.equal(tacticalLabContract.application.failedControlApplicationCountsAsActivation,false);
assert.deepEqual(tacticalLabContract.checkpointing,{
  backgroundPolling:false,
  manualHint:true,
  finishedParse:true,
  productionPresetSelection:true,
  manualControlChangesObservedAtNextCheckpoint:true
});
assert.equal(tacticalLabContract.ui.surface,'inside_parser_recommendation');
assert.equal(tacticalLabContract.ui.separateLineupCard,false);
assert.equal(tacticalLabContract.deferredIssue,252);
assert.match(tacticalLabRuntime,/POPULATION_SIZE\s*=\s*64/);
for(const origin of ['production_mutation','orthogonal','deterministic_random','extreme']) assert.match(tacticalLabRuntime,new RegExp(`'${origin}'`));
assert.equal(/Math\.random/.test(tacticalLabRuntime),false,'Tactical Lab population/assignment must be deterministic');
assert.match(tacticalLabRuntime,/slf_tactical_lab_561_p02/);
assert.match(tacticalLabRuntime,/EXP-561-\$\{POPULATION_CODE\}-/);
assert.equal(/EXP-561-P01-/.test(tacticalLabRuntime),false,'superseded P01 identities must not be generated by the runtime');
assert.match(tacticalLabRuntime,/normalizeLabControls/,'production seeds must be normalized into native domains');
assert.match(tacticalLabRuntime,/controlsAvailable/,'activation must preflight exact native control availability');
assert.match(tacticalLabRuntime,/tactical_lab_rollback/,'failed strict apply must restore the pre-experiment controls');
assert.match(tacticalLabRuntime,/tactical_controls_only/,'activation telemetry must declare controls-only scope');
assert.match(tacticalLabRuntime,/recommendation\.appendChild\(panel\)/,'Lab UI must be embedded inside the parser recommendation surface');
assert.equal(/bridge\.applyFormation\(experiment\.formation\)/.test(tacticalLabRuntime),false,'Lab activation must not apply a formation');
assert.equal(/bridge\.saveLiveLineup\(\)/.test(tacticalLabRuntime),false,'Lab activation must not save the lineup');
assert.equal(/formationMatches\(experiment\.formation\)/.test(tacticalLabRuntime),false,'Lab monitoring must not depend on formation');
assert.equal(/formation_changed/.test(tacticalLabRuntime),false,'formation changes must not terminate a controls-only Lab phase');
assert.equal(/monitorTimer/.test(tacticalLabRuntime),false,'Tactical Lab must not retain a recurring monitor timer');
assert.equal(/async function monitor\s*\(/.test(tacticalLabRuntime),false,'Tactical Lab must not poll active experiments');
assert.equal(/SnapshotEngine\.build\(\)\?\.minute/.test(tacticalLabRuntime),false,'active Lab UI must not build snapshots to update exposure');
assert.match(tacticalLabRuntime,/async function checkpoint\(source = 'explicit_checkpoint', snapshot = null\)/,'Lab must expose an explicit checkpoint path');
assert.match(tacticalLabRuntime,/tactic_changed_checkpoint/,'manual divergence must be attributed at an explicit checkpoint');
assert.match(tacticalLabRuntime,/await checkpoint\('finished_parse', snapshot\)/,'finished parse must be the terminal Lab checkpoint');
assert.match(strategyDataUi,/await STATE\.tacticalLabRuntime\.checkpoint\('manual_hint', snapshot\)/,'manual hint must checkpoint the active experiment');
assert.match(strategyDataUi,/await STATE\.tacticalLabRuntime\.mountUI\(snapshot\)/,'manual hint must remount the Lab row after replacing recommendation HTML');
assert.match(tacticalLabRuntime,/tactical_lab_assignment/);
assert.match(tacticalLabRuntime,/tactical_lab_activation/);
assert.match(tacticalLabRuntime,/queueLifecycle\(state,'exit'/);
assert.match(tacticalLabRuntime,/STATE\.tacticalLabRuntime/);
assert.match(tacticalLabRuntime,/\.tacticalLab\s*=/,'durable manual state envelope must retain Tactical Lab state');
assert.match(tacticalLabRuntime,/startedAtMinute/,'entry minute must be retained');
assert.match(tacticalLabRuntime,/productionRecommendation/,'production recommendation context must be retained');
assert.match(tacticControlEngine,/STATE\.tacticControlBridge/);
assert.match(tacticControlEngine,/applyTacticObject/);
assert.match(tacticControlEngine,/tacticalLabEvent/,'lab lifecycle events must travel in tagged tactical snapshots');
assert.match(tacticControlEngine,/sendPlayerObservationsWithoutLabEventFanout/,'lab lifecycle snapshots must not fan out player observations');
assert.equal(/\bApi\b/.test(tacticalLabRuntime),false,'Tactical Lab must reuse declared telemetry boundaries instead of adding a hidden API dependency');
assert.equal(/EXP-561-P02-/.test(source('src/modules/tactics-presets/active-preset-registry.js')),false,'experimental identities must not enter production registry');

console.log('tactical suite v7 + Tactical Lab v1 P02 explicit-checkpoint contracts: OK');
