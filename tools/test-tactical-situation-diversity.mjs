import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// #335: one user-locked XI, twelve tactical modes, no formation switching.
// #361: v12 adds the thirteenth mode — a pressing lead option.
const active=[
 'Emery_BalancedBase_v11','Mourinho_CleanCounter_v11','Guardiola_PressEscape_v11',
 'Arteta_SafePossession_v11','Guardiola_PressCooldown_v11','Guardiola_ControlledPush_v11',
 'Guardiola_PositionalSiege_v11','Conte_WideChannels_v11','Klopp_LateGegenpress_v11',
 'Simeone_CompactLead_v11','Simeone_EmergencyBlock_v11','Allegri_LeadOutlet_v11',
 'Flick_LeadPressHold_v12'
];
const retiredActive=['Compact_Counter_def3','Bielsa_ChaosPress_att5'];
const retired=['Mourinho_WeakSide_def3','Xabi_BoxMidfield_bal3','DeZerbi_BaitPress_bal3'];
const oldV10=[
 'Emery_BalancedControl4231_neutr','Mourinho_CompactCounter4411_neutr',
 'Pep_BoxControl_bal2','Arteta_Control433_bal3','Pep_PressCooldown_bal2',
 'Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4',
 'Klopp_Gegenpress_att4','Simeone_Compact442_def4','Simeone_LowBlock_def5',
 'Allegri_LeadManagement4141_def1'
];
const oldGeneric=['MidBlock_Control4231_neutr','MidBlock_Counter4411_neutr','Lead_Outlet4141_def1'];
const oldIds=[...oldV10,...oldGeneric];
const seededSystem=[...active,...oldIds,...retiredActive,...retired];
const root=new URL('../',import.meta.url);
const source=path=>fs.readFileSync(new URL(path,root),'utf8');
const context={
 console,window:{localStorage:{getItem(){return null;}}},
 localStorage:{getItem(){return null;},setItem(){}},
 BASE_PRESETS:Object.assign({standard:{style:'4',priority:[]}},Object.fromEntries(seededSystem.map(id=>[id,{style:'3',priority:[]}]))),
 BASE_LABELS:Object.assign({standard:'standard'},Object.fromEntries(seededSystem.map(id=>[id,id]))),
 TacticPresetLibrary:{meta:{},traits:{},schemeStates:{},presetSchemeState:{},getGroup(id){return this.meta[id]?.group||'custom';},getRank(id){return Number(this.meta[id]?.rank||0)}},
 RecommendationEngine:{
  getPresetLadder(){return[];},getAdjacentPresetInFamily(_current,desired){return desired;},
  applyProgressionGuard(candidate,snapshot){
   const p=context.progression;
   if(!p||p.gameId!==snapshot.gameId||!p.lastAppliedPreset)return {...candidate,progressionAction:'new_baseline'};
   if(candidate.name===p.previousPreset)return{name:p.lastAppliedPreset,reason:'anti ping pong',progressionAction:'hold_against_immediate_rollback'};
   const step=this.getAdjacentPresetInFamily(p.lastAppliedPreset,candidate.name);
   return step!==candidate.name?{name:step,reason:'one step',progressionAction:'family_step'}:{...candidate,progressionAction:'accepted'};
  }
 },
 setInterval(fn){fn();return 1;},clearInterval(){},setTimeout(fn){fn();return 1;},clearTimeout(){}
};
context.window.SLFCurrentActionHintEngine={
 schema:'old',ACTIVE_PRESETS:active.slice(),
 run(_snapshot,ctx={}){return{schema:'old',moment:{context:{...ctx},gameId:'g',minute:Number(ctx.minute||0)},action:{preset:'Emery_BalancedBase_v11',reason:'old'},candidates:[],confidence:{level:'low',gap:0},margin:0,telemetry:{}};}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source('src/modules/tactics-presets/active-preset-registry.js'),context,{filename:'active-preset-registry.js'});
vm.runInContext(source('src/modules/tactics-presets/tactic-preset-direction-policy.js'),context,{filename:'tactic-preset-direction-policy.js'});
const registry=context.window.SLFActivePresetRegistry;
const policy=context.window.SLFTacticDirectionPolicy;
const engine=context.window.SLFCurrentActionHintEngine;
assert.equal(registry.suiteVersion,'slf_tactic_suite_561_v12');
assert.equal(registry.recommendationSchema,'slf_rule_decision_v11_tactical_suite');
assert.equal(registry.defaultRiskAppetite,'standard');
assert.equal(registry.fallbackPolicy,'5.61-tactical-suite-v12-hold-current');
assert.equal(registry.defaultPresetId,'Emery_BalancedBase_v11');
assert.deepEqual([...registry.active],active);
assert.equal(active.length,13);
assert.equal(new Set(active).size,13);
assert.equal(Object.keys(registry.presets).length,13);
assert.equal(Object.keys(registry.roleContracts).length,13);
assert.equal(Object.keys(registry.formations).length,13);
assert.equal(Object.keys(registry.labels).length,14);
assert.equal(Object.keys(registry.displayMeta).length,14);
assert.deepEqual([...registry.retiredActive],retiredActive);
for(const id of oldIds.concat(retiredActive,retired)){
 assert.equal(context.BASE_PRESETS[id],undefined,`${id}: old built-in absent from BASE_PRESETS`);
 assert.equal(context.BASE_LABELS[id],undefined,`${id}: old built-in absent from BASE_LABELS`);
 assert.ok(registry.removed.includes(id),`${id}: old name hidden`);
}
const registrySource=source('src/modules/tactics-presets/active-preset-registry.js');
assert.match(registrySource,/HISTORICAL_COMPACT_COUNTER/);
assert.ok(registrySource.includes("preset:{def_line:'1',press_line:'1',def_width:'2',press_intense:'2',build_type:'1',build_temp:'3',build_long:'4',build_fast:'4',style:'3',pass_risk:'2',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[]}"),'historical Compact Counter unchanged');
const native=JSON.parse(source('data/tactics/tactical-lab-contract-v1.json')).population.nativeControlDomains;
const keys=['def_line','press_line','def_width','press_intense','build_type','build_temp','build_long','build_fast','style','pass_risk','dribble','cross','corner','shot'];
const table={
 Emery_BalancedBase_v11:'2 2 2 2 2 2 2 2 3 2 2 2 1 2',
 Mourinho_CleanCounter_v11:'1 2 2 2 1 3 3 3 3 2 2 2 1 2',
 Guardiola_PressEscape_v11:'2 2 2 2 2 1 1 2 3 2 1 1 1 2',
 Arteta_SafePossession_v11:'2 2 2 2 2 2 1 2 3 2 2 2 1 2',
 Guardiola_PressCooldown_v11:'1 2 2 1 1 2 2 2 2 1 1 1 1 1',
 Guardiola_ControlledPush_v11:'2 3 2 3 2 3 2 3 4 3 3 2 1 3',
 Guardiola_PositionalSiege_v11:'3 3 3 4 2 2 2 3 5 4 3 3 1 3',
 Conte_WideChannels_v11:'2 2 3 3 3 2 2 3 4 3 3 3 1 2',
 Klopp_LateGegenpress_v11:'3 3 2 4 3 3 2 3 4 3 3 3 1 3',
 Simeone_CompactLead_v11:'1 2 1 2 1 2 2 2 2 2 1 2 1 1',
 Simeone_EmergencyBlock_v11:'1 1 1 1 1 1 2 1 1 1 1 1 1 1',
 Allegri_LeadOutlet_v11:'2 2 2 1 2 2 2 2 2 1 1 2 1 1',
 Flick_LeadPressHold_v12:'2 2 2 3 2 1 2 2 3 2 2 2 1 2'
};
const rw=['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am1','rw','st2'];
const rm=rw.map(p=>p==='rw'?'rm':p);
assert.deepEqual(JSON.parse(JSON.stringify(registry.fixedLineupProfile.canonicalPositions)),rw);
assert.deepEqual(JSON.parse(JSON.stringify(registry.fixedLineupProfile.formationVariants.rw)),rw);
assert.deepEqual(JSON.parse(JSON.stringify(registry.fixedLineupProfile.formationVariants.rm)),rm);
assert.equal(registry.fixedLineupProfile.presetSwitchChangesFormation,false);
assert.equal(registry.fixedLineupProfile.rightWingLock,'user_pre_match_selection');
assert.ok(!rw.includes('cd2'));
for(const id of active){
 const v=table[id].split(' ');
 const expected=Object.fromEntries(keys.map((k,i)=>[k,v[i]]));
 expected.priority=id==='Conte_WideChannels_v11'?['left','right']:[];
 assert.deepEqual(JSON.parse(JSON.stringify(registry.presets[id])),expected,`${id}: frozen owner-approved v11 vector`);
 for(const [key,allowed] of Object.entries(native)){
  if(key!=='priority')assert.ok(allowed.includes(expected[key]),`${id}.${key}: native domain`);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(registry.formations[id])),rw,`${id}: same 11 slots`);
 assert.deepEqual(JSON.parse(JSON.stringify(registry.roleContracts[id].formation)),rw,`${id}: role formation`);
 assert.deepEqual(JSON.parse(JSON.stringify(registry.roleContracts[id].controls)),expected,`${id}: role vector`);
 assert.equal(registry.roleContracts[id].fixedLineupProfileId,'fixed_4231_cd1_cd3_rw_or_rm');
 assert.ok(registry.situations.includes(registry.meta[id].role),`${id}: role included`);
 assert.ok(registry.displayOrder.includes(id),`${id}: visible in active UI`);
 assert.equal(registry.roleContracts[id].fallbackEligible,false);
 assert.match(registry.labels[id],/Emery|Mourinho|Guardiola|Arteta|Conte|Klopp|Simeone|Allegri|Flick/);
 assert.ok(!/3-2-5|4-4-2|5-4-1|4-3-3/.test(registry.labels[id]),`${id}: label is mode not formation`);
}
assert.equal(registry.roleContracts.Arteta_SafePossession_v11.manualOnly,true);
assert.equal(policy.hardVeto('Arteta_SafePossession_v11',{}).vetoed,true);
assert.equal(registry.auditTier.manualOnly[0],'Arteta_SafePossession_v11');
assert.equal(registry.situations.length,13);
assert.equal(registry.evidenceAdjustment(),0,'never fabricate causal evidence');
assert.equal(policy.version,'5.61-tactical-suite-v12.0');
assert.equal(policy.suiteVersion,'slf_tactic_suite_561_v12');
assert.equal(policy.recommendationSchema,'slf_rule_decision_v11_tactical_suite');
assert.equal(policy.autoApply,false);
assert.equal(engine.__tacticSuiteV11Installed,true);
assert.equal(context.RecommendationEngine.__tacticSuiteV11Installed,true);
assert.deepEqual(Object.keys(policy.scoreCandidate('Emery_BalancedBase_v11',{}).parts),['rulePrior','contextFit','riskAdjustment','boundedEvidenceAdjustment']);
assert.equal(policy.preferredPreset('possession_control'),null,'Arteta is never an automatic preference');
for(const [historical,current] of Object.entries(registry.legacyAliases)){
 assert.equal(registry.resolvePresetId(historical),current);
 assert.equal(policy.scoreCandidate(historical,{}).preset,current);
 assert.ok(!registry.active.includes(historical));
}
function decide(input={}){
 const snapshot={gameId:'scenario',status:'live',tacticTelemetry:{}};
 const d=engine.run(snapshot,{minute:30,scoreState:'draw',score:{state:'draw'},attackNeed:20,myBad:10,lowBadActions:true,signals:[],...input});
 assert.ok(active.includes(d.action.preset),`eligible v11 preset: ${d.action.preset}`);
 assert.notEqual(d.action.preset,'Arteta_SafePossession_v11','diagnostic never auto');
 assert.equal(snapshot.tacticTelemetry.libraryVersion,'slf_tactic_suite_561_v12');
 assert.equal(snapshot.tacticTelemetry.recommendationSchema,'slf_rule_decision_v11_tactical_suite');
 assert.equal(d.confidence.gap,d.margin,'score margin, not calibrated win rate');
 return d;
}
const scenarios=[
 ['start',{},'Emery_BalancedBase_v11','default_start'],
 ['stronger opponent',{strengthGap:-15},'Guardiola_PressEscape_v11','pressure_escape'],
 ['pressure/no outlet',{underPressure:true,counterExitAvailable:false,signals:['under_pressure','counter_exit_blocked']},'Guardiola_PressEscape_v11','pressure_escape'],
 ['pressure/clean outlet',{underPressure:true,counterExitAvailable:true,signals:['under_pressure','counter_exit_available']},'Mourinho_CleanCounter_v11','pressure_counter'],
 ['cooldown',{pressFatigueRisk:true,myPowerDropPct:5},'Guardiola_PressCooldown_v11','press_cooldown'],
 ['wide',{centerClosed:true,wideQuality:true},'Conte_WideChannels_v11','width_attack'],
 // #361 dribble guard: Simeone/Allegri (dribble 1) are vetoed in lead situations;
 // Emery (dribble 2) is the remaining safe lead candidate vs baseline press.
 ['lead',{minute:72,scoreState:'winning',score:{state:'winning'}},'Emery_BalancedBase_v11','protect_lead'],
 ['lead outlet',{minute:72,scoreState:'winning',score:{state:'winning'},counterExitAvailable:true},'Emery_BalancedBase_v11','protect_lead_with_outlet'],
 // #361 lead_press_hold: winning in the 60-85 window vs opponent pressing above plan.
 ['lead press hold',{minute:72,scoreState:'winning',score:{state:'winning'},oppPressVector:25},'Flick_LeadPressHold_v12','lead_press_hold'],
 ['emergency',{minute:60,underPressure:true,counterExitAvailable:false,pressureRisk:90,highBadActions:true,signals:['under_pressure','sustained_siege']},'Simeone_EmergencyBlock_v11','emergency_lock'],
 ['chase',{minute:55,scoreState:'losing',score:{state:'losing'},attackNeed:48},'Guardiola_ControlledPush_v11','controlled_chase'],
 ['siege',{minute:62,attackNeed:60,attackingMomentum:true},'Guardiola_PositionalSiege_v11','positional_siege'],
 ['late chase',{minute:86,scoreState:'losing',score:{state:'losing'},attackNeed:92,myBad:10,lowBadActions:true},'Klopp_LateGegenpress_v11','late_high_pressure']
];
for(const [label,input,id,situation] of scenarios){
 const d=decide(input);
 assert.equal(d.situationKey,situation,`${label}: situation`);
 assert.equal(d.action.preset,id,`${label}: mode`);
}
assert.equal(policy.hardVeto('Mourinho_CleanCounter_v11',{underPressure:true,counterExitAvailable:false}).vetoed,true);
assert.equal(policy.hardVeto('Mourinho_CleanCounter_v11',{underPressure:true,counterExitAvailable:true,counterExitBlocked:true}).vetoed,true);
assert.equal(policy.hardVeto('Klopp_LateGegenpress_v11',{minute:20,scoreState:'draw'}).vetoed,true);
assert.equal(policy.hardVeto('Simeone_EmergencyBlock_v11',{minute:20,scoreState:'draw'}).vetoed,true);
assert.equal(policy.preferredPreset('final_all_in'),null);
assert.equal(policy.preferredPreset('default_start'),'Emery_BalancedBase_v11');
assert.equal(policy.preferredPreset('pressure_counter'),'Mourinho_CleanCounter_v11');
assert.equal(policy.preferredPreset('lead_press_hold'),'Flick_LeadPressHold_v12');
const engineSource=source('src/modules/tactics-presets/tactic-control-engine.js');
const panelSource=source('src/modules/tactics-presets/tactic-preset-library-panel.js');
assert.equal(/tacticControlBridge\.(applyFormation|saveLiveLineup)\s*\(/.test(engineSource),false,'switching mode cannot change/save formation');
assert.equal(/data-slf-formation-preset/.test(panelSource),false,'mode UI must not offer per-mode formation change');
assert.match(panelSource,/CD1/);
assert.match(panelSource,/RW\/RM/);
context.progression={gameId:'route',lastAppliedPreset:'Emery_BalancedBase_v11',previousPreset:''};
let snap={gameId:'route',status:'live',ruleDecision:{action:{preset:'Klopp_LateGegenpress_v11'},telemetry:{}}};
let guarded=context.RecommendationEngine.applyProgressionGuard({name:'Klopp_LateGegenpress_v11',reason:'late'},snap,{score:{state:'losing'},urgency:{overrideProgressionGuard:false}});
assert.equal(guarded.name,'Guardiola_ControlledPush_v11');
context.progression={gameId:'route',lastAppliedPreset:'Emery_BalancedBase_v11',previousPreset:''};
guarded=context.RecommendationEngine.applyProgressionGuard({name:'Simeone_EmergencyBlock_v11',reason:'emergency'}, {gameId:'route',status:'live',ruleDecision:{action:{preset:'Simeone_EmergencyBlock_v11'},telemetry:{}}},{urgency:{overrideProgressionGuard:false}});
assert.equal(guarded.name,'Simeone_EmergencyBlock_v11');
assert.equal(guarded.progressionAction,'emergency_override');

for(const file of ['coach-mode-policy.js','adaptive-opponent-style-layer.js','moment-drift-stabilizer.js']){
  const text=source(`src/modules/strategy-data-recommendations/${file}`);
  assert.equal(/candidateFromStyle|nextPreset\s*=\s*allowedFallback|stableState\.action/.test(text),false,`${file}: must be advisory only`);
}

const tacticalLabContract=JSON.parse(source('data/tactics/tactical-lab-contract-v1.json'));
const tacticControlEngine=['tactic-control-engine.js','tactic-control-bridge.js','tactical-lab-v1.js'].map(f=>source(`src/modules/tactics-presets/${f}`)).join('\n');
const tacticalLabRuntime=tacticControlEngine;
const strategyDataUi=source('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js');
assert.equal(tacticalLabContract.schema,'slf_tactical_lab_contract_v1');
assert.equal(tacticalLabContract.population.populationVersion,'slf_tactical_lab_561_p03');
assert.equal(tacticalLabContract.population.supersedesPopulationVersion,'slf_tactical_lab_561_p02');
assert.equal(tacticalLabContract.population.parentPopulationVersion,'slf_tactical_lab_561_p02');
assert.equal(tacticalLabContract.population.genomeScope,'tactical_controls_only');
assert.equal(tacticalLabContract.population.size,6);
assert.deepEqual(tacticalLabContract.population.groups,{validation_repeat:6});
assert.deepEqual(tacticalLabContract.population.selectionWeightsPct,{
  'EXP-561-P02-0012':35,
  'EXP-561-P02-0018':35,
  'EXP-561-P02-0040':10,
  'EXP-561-P02-0058':10,
  'EXP-561-P02-0011':5,
  'EXP-561-P02-0055':5
});
assert.equal(Object.values(tacticalLabContract.population.selectionWeightsPct).reduce((sum,value)=>sum+value,0),100);
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
assert.deepEqual(tacticalLabContract.assignment.preservedAssignmentPopulationVersions,['slf_tactical_lab_561_p02']);
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
assert.equal(tacticalLabContract.telemetry.activationRecommendationPolicy,'score_exact_activation_snapshot_when_available');
assert.equal(tacticalLabContract.telemetry.legacyDurationMinutesPreserved,true);
assert.equal(tacticalLabContract.telemetry.highResolutionExposureField,'elapsedWallClockMs');
assert.equal(tacticalLabContract.telemetry.missingMetricDeltaPolicy,'null_when_either_endpoint_unavailable');
assert.ok(tacticalLabContract.telemetry.exitContext.includes('elapsedWallClockMs'));
assert.equal(tacticalLabContract.ui.surface,'inside_parser_recommendation');
assert.equal(tacticalLabContract.ui.separateLineupCard,false);
assert.equal(tacticalLabContract.deferredIssue,252);
assert.match(tacticalLabRuntime,/POPULATION_SIZE\s*=\s*6/);
assert.match(tacticalLabRuntime,/LEGACY_P02_VERSION\s*=\s*'slf_tactical_lab_561_p02'/);
assert.match(tacticalLabRuntime,/slf_tactical_lab_561_p03/);
assert.match(tacticalLabRuntime,/buildP02Population/,'P02 generator must remain available to reproduce exact validation parents and finish existing P02 assignments');
assert.match(tacticalLabRuntime,/preserveLegacyP02Assignment/,'existing P02 assignments must not be silently rerolled into P03');
for(const id of ['EXP-561-P02-0012','EXP-561-P02-0018','EXP-561-P02-0040','EXP-561-P02-0058','EXP-561-P02-0011','EXP-561-P02-0055']) assert.match(tacticalLabRuntime,new RegExp(id));
assert.match(tacticalLabRuntime,/selectionWeightPct/,'P03 assignment weights must be explicit in runtime population metadata');
for(const origin of ['production_mutation','orthogonal','deterministic_random','extreme']) assert.match(tacticalLabRuntime,new RegExp(`'${origin}'`));
assert.equal(/Math\.random/.test(tacticalLabRuntime),false,'Tactical Lab population/assignment must be deterministic');
assert.match(tacticalLabRuntime,/EXP-561-\$\{populationCode\}-/);
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
assert.match(tacticalLabRuntime,/captureActivationProductionDecision/,'activation must score the exact snapshot instead of relying on stale recommendation state');
assert.match(tacticalLabRuntime,/document\.defaultView\?\.SLFCurrentActionHintEngine/,'activation baseline must use the public exact-snapshot Production Advisor scorer');
assert.equal(/\bRecommendationEngine\b/.test(tacticalLabRuntime),false,'Tactical Lab evidence capture must not add an undeclared direct RecommendationEngine dependency');
assert.match(tacticalLabRuntime,/elapsedWallClockMs/,'completed phases must retain high-resolution wall-clock exposure');
assert.match(tacticalLabRuntime,/completedAt - Number\(activation\.startedAtTs\)/,'wall-clock exposure must be derived from the persisted activation timestamp');
assert.match(tacticalLabRuntime,/start == null \|\| end == null \? null/,'metric deltas must remain unavailable when either endpoint is missing');
assert.equal(/Number\(after\?\.\[key\] \|\| 0\)/.test(tacticalLabRuntime),false,'missing metric endpoints must not be coerced to zero');
assert.match(tacticalLabRuntime,/productionRecommendation/,'production recommendation context must be retained');
assert.match(tacticControlEngine,/STATE\.tacticControlBridge/);
assert.match(tacticControlEngine,/applyTacticObject/);
assert.match(tacticControlEngine,/tacticalLabEvent/,'lab lifecycle events must travel in tagged tactical snapshots');
assert.match(tacticControlEngine,/sendPlayerObservationsWithoutLabEventFanout/,'lab lifecycle snapshots must not fan out player observations');
assert.equal(/\bApi\b/.test(tacticalLabRuntime),false,'Tactical Lab must reuse declared telemetry boundaries instead of adding a hidden API dependency');
assert.equal(/EXP-561-P02-/.test(registrySource),false,'P02 experimental identities must not enter production registry');
assert.equal(/EXP-561-P03-/.test(registrySource),false,'P03 experimental identities must not enter production registry');

// Registry<->inventory sync: the diversity run also enforces the canonical
// inventory is in sync with the registry (belt-and-suspenders with the
// dedicated CI step in quality-integration.yml).
const bridgeOut=execFileSync(process.execPath,['tools/test-tactic-bridge-v10.mjs'],{cwd:fileURLToPath(root),encoding:'utf8'});
assert.match(bridgeOut,/v10 tactic bridge native preflight and rollback: OK/);
assert.match(bridgeOut,/v11 RW\/RM fixed lineup read-only control application: OK/);

const aliasOut=execFileSync(process.execPath,['tools/test-coach-preset-aliases.mjs'],{cwd:fileURLToPath(root),encoding:'utf8'});
assert.match(aliasOut,/coach preset alias migration: OK/,'old saved v10 names remain readable and cannot re-enter active dropdown');

const syncOut=execFileSync(process.execPath,['tools/sync-active-preset-inventory.mjs','--check'],{cwd:fileURLToPath(root),encoding:'utf8'});
assert.match(syncOut,/ok: .*active-preset-inventory-v3\.json in sync/,'active-preset inventory must be in sync with the registry');

console.log('tactical suite v12 fixed lineup + Tactical Lab v1 P03 validation contracts: OK');
