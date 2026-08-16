// Active Tactical Preset Registry
// ============================================================
// Canonical source of truth for the generator 5.61 tactical suite.

(function activeTacticalPresetRegistry() {
    'use strict';

    const SUITE_VERSION='slf_tactic_suite_561_v7';
    const RECOMMENDATION_SCHEMA='slf_rule_decision_v7_tactical_suite';
    const DEFAULT_RISK_APPETITE='standard';
    const ACTIVE_PRESET_NAMES=[
        'Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Compact_Counter_def3',
        'Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4','Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'
    ];
    const REMOVED_PRESET_NAMES=[
        'Mourinho_WeakSide_def3','Henta_Hold_def3','Pep_StandardControl_bal3','Xabi_VerticalBox_att3','Xabi_BoxMidfield_bal3',
        'DeZerbi_BaitPress_bal3','DeZerbi_Release_att4','Klopp_WideTrap_att4','Henta_LeftTrap_att3','Henta_RightTrap_att3',
        'Henta_WideTrap_att3','Henta_CounterTrap_att4','Henta_CentralTrap_att3','Nagelsmann_WidePress_att4'
    ];
    const ACTIVE=new Set(['standard',...ACTIVE_PRESET_NAMES]);

    const PRESETS={
        Arteta_Control433_bal3:{def_line:'2',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'2',build_long:'1',build_fast:'2',style:'3',pass_risk:'3',dribble:'2',cross:'2',corner:'1',shot:'2',priority:[]},
        Pep_BoxControl_bal2:{def_line:'2',press_line:'2',def_width:'2',press_intense:'2',build_type:'2',build_temp:'1',build_long:'1',build_fast:'2',style:'3',pass_risk:'2',dribble:'2',cross:'1',corner:'1',shot:'2',priority:[]},
        Pep_PressCooldown_bal2:{def_line:'1',press_line:'2',def_width:'3',press_intense:'1',build_type:'1',build_temp:'2',build_long:'4',build_fast:'2',style:'2',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[]},
        Compact_Counter_def3:{def_line:'1',press_line:'1',def_width:'2',press_intense:'2',build_type:'1',build_temp:'3',build_long:'4',build_fast:'4',style:'3',pass_risk:'2',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[]},
        Pep_ControlledPush_att3:{def_line:'3',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'3',build_long:'1',build_fast:'4',style:'4',pass_risk:'4',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[]},
        Pep_TwoThreeFive_att3:{def_line:'4',press_line:'4',def_width:'4',press_intense:'4',build_type:'2',build_temp:'2',build_long:'1',build_fast:'3',style:'5',pass_risk:'4',dribble:'3',cross:'2',corner:'1',shot:'4',priority:[]},
        Conte_WingbackWidth_bal4:{def_line:'2',press_line:'2',def_width:'5',press_intense:'3',build_type:'3',build_temp:'2',build_long:'3',build_fast:'3',style:'4',pass_risk:'3',dribble:'4',cross:'5',corner:'1',shot:'2',priority:['left','right']},
        Klopp_Gegenpress_att4:{def_line:'4',press_line:'5',def_width:'3',press_intense:'5',build_type:'3',build_temp:'3',build_long:'2',build_fast:'5',style:'5',pass_risk:'4',dribble:'4',cross:'3',corner:'1',shot:'4',priority:[]},
        Simeone_Compact442_def4:{def_line:'1',press_line:'2',def_width:'1',press_intense:'4',build_type:'1',build_temp:'1',build_long:'3',build_fast:'2',style:'1',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[]},
        Simeone_LowBlock_def5:{def_line:'1',press_line:'1',def_width:'1',press_intense:'1',build_type:'1',build_temp:'1',build_long:'5',build_fast:'2',style:'1',pass_risk:'1',dribble:'1',cross:'1',corner:'1',shot:'1',priority:[]},
        Bielsa_ChaosPress_att5:{def_line:'5',press_line:'5',def_width:'5',press_intense:'5',build_type:'3',build_temp:'3',build_long:'4',build_fast:'5',style:'5',pass_risk:'5',dribble:'5',cross:'5',corner:'1',shot:'5',priority:[]}
    };
    const LABELS={
        standard:'Стандартная 4-2-3-1_att1', Arteta_Control433_bal3:'Arteta Structural Control 4-3-3_neutr',
        Pep_BoxControl_bal2:'Guardiola Press-Resistant Control 4-1-2-2-1_neutr', Pep_PressCooldown_bal2:'Guardiola Press Cooldown 4-1-4-1_def1',
        Compact_Counter_def3:'Mourinho Compact Counter 4-4-1-1_neutr', Pep_ControlledPush_att3:'Guardiola Controlled Push 4-2-3-1_att1',
        Pep_TwoThreeFive_att3:'Guardiola Positional Attack 3-2-5_att2', Conte_WingbackWidth_bal4:'Conte Wingback Width 3-4-3_att1',
        Klopp_Gegenpress_att4:'Klopp Gegenpress 4-2-4_att2', Simeone_Compact442_def4:'Simeone Compact 4-4-2_def2',
        Simeone_LowBlock_def5:'Simeone Low Block 5-4-1_def2', Bielsa_ChaosPress_att5:'Bielsa Chaos Press 3-3-4_att2'
    };
    const FORMATIONS={
        Arteta_Control433_bal3:['gk','ld','cd1','cd3','rd','cm1','dm2','cm3','lw','st2','rw'],
        Pep_BoxControl_bal2:['gk','ld','cd1','cd3','rd','dm2','cm1','cm3','am1','am2','st2'],
        Pep_PressCooldown_bal2:['gk','ld','cd1','cd3','rd','dm2','lm','cm2','cm3','rm','st2'],
        Compact_Counter_def3:['gk','ld','cd1','cd3','rd','lm','dm2','cm2','rm','am2','st2'],
        Pep_ControlledPush_att3:['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am2','rw','st2'],
        Pep_TwoThreeFive_att3:['gk','cd1','cd2','cd3','dm2','cm2','lw','am1','st1','am2','rw'],
        Conte_WingbackWidth_bal4:['gk','cd1','cd2','cd3','lb','dm2','cm2','rb','lw','st2','rw'],
        Klopp_Gegenpress_att4:['gk','ld','cd1','cd3','rd','dm2','cm2','lw','st1','st2','rw'],
        Simeone_Compact442_def4:['gk','ld','cd1','cd3','rd','lm','cm2','dm2','rm','st1','st2'],
        Simeone_LowBlock_def5:['gk','lb','cd1','cd2','cd3','rb','lm','dm2','cm2','rm','st2'],
        Bielsa_ChaosPress_att5:['gk','cd1','cd2','cd3','lm','dm2','rm','lw','st1','st2','rw']
    };
    const DISPLAY_META={
        standard:{trainer:'',formation:'4-2-3-1',style:'4',suffix:'_att1'}, Arteta_Control433_bal3:{trainer:'Arteta',formation:'4-3-3',style:'3',suffix:'_neutr'},
        Pep_BoxControl_bal2:{trainer:'Guardiola',formation:'4-1-2-2-1',style:'3',suffix:'_neutr'}, Pep_PressCooldown_bal2:{trainer:'Guardiola',formation:'4-1-4-1',style:'2',suffix:'_def1'},
        Compact_Counter_def3:{trainer:'Mourinho',formation:'4-4-1-1',style:'3',suffix:'_neutr'}, Pep_ControlledPush_att3:{trainer:'Guardiola',formation:'4-2-3-1',style:'4',suffix:'_att1'},
        Pep_TwoThreeFive_att3:{trainer:'Guardiola',formation:'3-2-5',style:'5',suffix:'_att2'}, Conte_WingbackWidth_bal4:{trainer:'Conte',formation:'3-4-3',style:'4',suffix:'_att1'},
        Klopp_Gegenpress_att4:{trainer:'Klopp',formation:'4-2-4',style:'5',suffix:'_att2'}, Simeone_Compact442_def4:{trainer:'Simeone',formation:'4-4-2',style:'1',suffix:'_def2'},
        Simeone_LowBlock_def5:{trainer:'Simeone',formation:'5-4-1',style:'1',suffix:'_def2'}, Bielsa_ChaosPress_att5:{trainer:'Bielsa',formation:'3-3-4',style:'5',suffix:'_att2'}
    };
    const STYLE_GROUPS=[{style:'5',label:'Атака+ · _att2',suffix:'_att2'},{style:'4',label:'Атака · _att1',suffix:'_att1'},{style:'3',label:'Обычный · _neutr',suffix:'_neutr'},{style:'2',label:'Защита · _def1',suffix:'_def1'},{style:'1',label:'Защ+ · _def2',suffix:'_def2'}];
    const DISPLAY_ORDER=Object.keys(DISPLAY_META).sort((a,b)=>Number(DISPLAY_META[b].style)-Number(DISPLAY_META[a].style)||(a==='standard'?-1:b==='standard'?1:String(DISPLAY_META[a].trainer).localeCompare(String(DISPLAY_META[b].trainer),'en')||String(LABELS[a]).localeCompare(String(LABELS[b]),'en')));
    const META={
        Arteta_Control433_bal3:{group:'balance',rank:3,role:'stable_control',title:LABELS.Arteta_Control433_bal3,idea:'структурный контроль 4-3-3',use:'базовый план равного матча и возврат к устойчивой структуре',risk:'не для позднего форсирования'},
        Pep_BoxControl_bal2:{group:'balance',rank:2,role:'pressure_escape',title:LABELS.Pep_BoxControl_bal2,idea:'press-resistant контроль',use:'выход из давления без прямой контратаки и reset после брака',risk:'медленный для поздней погони'},
        Pep_PressCooldown_bal2:{group:'balance',rank:2,role:'press_cooldown',title:LABELS.Pep_PressCooldown_bal2,idea:'снизить цену прессинга',use:'fatigue, рост брака/фолов или падение силы',risk:'не для позднего проигрыша'},
        Compact_Counter_def3:{group:'defensive',rank:3,role:'counter_outlet',title:LABELS.Compact_Counter_def3,idea:'компактность плюс быстрый подтверждённый выход',use:'только при counterExitAvailable/spaceBehindPress/cleanFirstPass',risk:'без outlet возвращает давление; historical evidence требует осторожности'},
        Pep_ControlledPush_att3:{group:'attack',rank:3,role:'controlled_chase',title:LABELS.Pep_ControlledPush_att3,idea:'первая ступень усиления атаки',use:'нужен гол при сохранённой структуре',risk:'высокий брак увеличит потери'},
        Pep_TwoThreeFive_att3:{group:'attack',rank:4,role:'positional_siege',title:LABELS.Pep_TwoThreeFive_att3,idea:'позиционный дожим 3-2-5',use:'атакующий momentum и контролируемые переходы',risk:'опасен при counter threat'},
        Conte_WingbackWidth_bal4:{group:'balance',rank:4,role:'width_attack',title:LABELS.Conte_WingbackWidth_bal4,idea:'максимальная ширина',use:'центр закрыт, фланги дают качество',risk:'пустые подачи при слабых флангах'},
        Klopp_Gegenpress_att4:{group:'attack',rank:4,role:'late_high_pressure',title:LABELS.Klopp_Gegenpress_att4,idea:'поздний high-pressure 4-2-4',use:'проигрываем поздно при приемлемой физике и браке',risk:'дорог по силе и фолам'},
        Simeone_Compact442_def4:{group:'defensive',rank:4,role:'protect_lead',title:LABELS.Simeone_Compact442_def4,idea:'компактный 4-4-2',use:'защита позднего преимущества',risk:'раннее применение режет атаку'},
        Simeone_LowBlock_def5:{group:'defensive',rank:5,role:'emergency_lock',title:LABELS.Simeone_LowBlock_def5,idea:'временный 5-4-1 lock',use:'критическая осада без выхода или очень поздняя защита',risk:'обязательная переоценка следующего окна'},
        Bielsa_ChaosPress_att5:{group:'attack',rank:5,role:'final_all_in',title:LABELS.Bielsa_ChaosPress_att5,idea:'финальный all-in',use:'последнее окно проигрываемого матча',risk:'может разрушить оборону'}
    };
    const TRAITS={
        Arteta_Control433_bal3:{attackLanes:['center','left','right'],build:'structural_control',tempo:'medium',press:'medium_high',risk:'medium',requires:[],avoids:['late_emergency_chase']},
        Pep_BoxControl_bal2:{attackLanes:['center'],build:'press_resistant_control',tempo:'low',press:'medium_low',risk:'low',requires:['pressure_without_counter_exit'],avoids:['urgent_chase']},
        Pep_PressCooldown_bal2:{attackLanes:['center','right'],build:'cooldown_outlet',tempo:'low',press:'low',risk:'low',requires:['press_fatigue'],avoids:['late_emergency_chase']},
        Compact_Counter_def3:{attackLanes:['left','right'],build:'direct_counter',tempo:'high',press:'low',risk:'medium',requires:['confirmed_counter_exit'],avoids:['counter_exit_blocked']},
        Pep_ControlledPush_att3:{attackLanes:['center','left','right'],build:'controlled_push',tempo:'high',press:'medium_high',risk:'high',requires:['need_goal_or_attack_need'],avoids:['very_high_bad_actions']},
        Pep_TwoThreeFive_att3:{attackLanes:['center','left','right'],build:'positional_siege_325',tempo:'medium_high',press:'high',risk:'very_high',requires:['attacking_momentum','transition_control'],avoids:['transition_threat','press_fatigue']},
        Conte_WingbackWidth_bal4:{attackLanes:['left','right'],build:'maximum_width',tempo:'medium_high',press:'medium',risk:'high',requires:['wide_quality','center_closed'],avoids:['own_crosses_bad','opponent_crosses_dangerous']},
        Klopp_Gegenpress_att4:{attackLanes:['left','right','center'],build:'gegenpress_424',tempo:'very_high',press:'very_high',risk:'very_high',requires:['late_need_goal','fitness'],avoids:['press_fatigue','high_bad_actions','transition_threat']},
        Simeone_Compact442_def4:{attackLanes:['left','right'],build:'compact442',tempo:'low',press:'high_local',risk:'low',requires:['protect_lead'],avoids:['urgent_chase']},
        Simeone_LowBlock_def5:{attackLanes:[],build:'temporary_emergency_lock',tempo:'very_low',press:'very_low',risk:'very_low',requires:['mandatory_reassessment_next_window'],avoids:['permanent_losing_state']},
        Bielsa_ChaosPress_att5:{attackLanes:['left','center','right'],build:'final_all_in',tempo:'maximum',press:'maximum',risk:'maximum',requires:['emergency_need_goal'],avoids:['early_match','press_fatigue','high_bad_actions']}
    };
    const SCHEME_STATES={arteta_control:'4-3-3 structural control',box_control:'4-1-2-2-1 press-resistant control',press_cooldown:'4-1-4-1 cooldown outlet',compact_counter:'4-4-1-1 direct counter',controlled_push:'4-2-3-1 controlled push',positional_325:'3-2-5 positional siege',wingback_width:'3-4-3 wingback width',gegenpress_424:'4-2-4 gegenpress',compact_442:'4-4-2 compact',low_block_541:'5-4-1 emergency lock',chaos_334:'3-3-4 final all-in'};
    const PRESET_SCHEME_STATE={Arteta_Control433_bal3:'arteta_control',Pep_BoxControl_bal2:'box_control',Pep_PressCooldown_bal2:'press_cooldown',Compact_Counter_def3:'compact_counter',Pep_ControlledPush_att3:'controlled_push',Pep_TwoThreeFive_att3:'positional_325',Conte_WingbackWidth_bal4:'wingback_width',Klopp_Gegenpress_att4:'gegenpress_424',Simeone_Compact442_def4:'compact_442',Simeone_LowBlock_def5:'low_block_541',Bielsa_ChaosPress_att5:'chaos_334'};
    const LADDERS={defensive:['Arteta_Control433_bal3','Simeone_Compact442_def4','Simeone_LowBlock_def5','Pep_PressCooldown_bal2'],balance:['Pep_BoxControl_bal2','Arteta_Control433_bal3','Compact_Counter_def3','Conte_WingbackWidth_bal4'],attack:['Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5']};
    const AUDIT={primary:['Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Pep_ControlledPush_att3'],conditional:['Compact_Counter_def3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Simeone_Compact442_def4'],restricted:['Klopp_Gegenpress_att4'],emergency:['Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'],removed:REMOVED_PRESET_NAMES.slice(),needsMoreData:[],experimental:[],blocked:[]};

    const clonePresets=map=>Object.fromEntries(Object.entries(map).map(([name,p])=>[name,Object.assign({},p,{priority:(p.priority||[]).slice()})]));
    const cloneTraits=map=>Object.fromEntries(Object.entries(map).map(([name,t])=>[name,Object.assign({},t,{attackLanes:(t.attackLanes||[]).slice(),requires:(t.requires||[]).slice(),avoids:(t.avoids||[]).slice()})]));
    const removeInactive=map=>{if(!map||typeof map!=='object')return;Object.keys(map).forEach(key=>{if(!ACTIVE.has(key))delete map[key];});};
    removeInactive(typeof BASE_PRESETS!=='undefined'?BASE_PRESETS:null); removeInactive(typeof BASE_LABELS!=='undefined'?BASE_LABELS:null);
    if(typeof BASE_PRESETS!=='undefined')Object.assign(BASE_PRESETS,clonePresets(PRESETS));
    if(typeof BASE_LABELS!=='undefined')Object.assign(BASE_LABELS,LABELS);
    if(typeof TacticPresetLibrary!=='undefined'&&TacticPresetLibrary){TacticPresetLibrary.meta=Object.assign({},META);TacticPresetLibrary.traits=cloneTraits(TRAITS);TacticPresetLibrary.schemeStates=Object.assign({},SCHEME_STATES);TacticPresetLibrary.presetSchemeState=Object.assign({},PRESET_SCHEME_STATE);}
    if(typeof RecommendationEngine!=='undefined'&&RecommendationEngine)RecommendationEngine.getPresetLadder=group=>(LADDERS[group]||[]).slice();
    if(typeof CurrentActionHintEngine!=='undefined'&&CurrentActionHintEngine)CurrentActionHintEngine.PRESET_AUDIT_TIER=Object.fromEntries(Object.entries(AUDIT).map(([k,v])=>[k,Array.isArray(v)?v.slice():v]));

    window.SLFActivePresetRegistry={suiteVersion:SUITE_VERSION,recommendationSchema:RECOMMENDATION_SCHEMA,generatorVersion:'5.61',defaultRiskAppetite:DEFAULT_RISK_APPETITE,active:ACTIVE_PRESET_NAMES.slice(),removed:REMOVED_PRESET_NAMES.slice(),presets:clonePresets(PRESETS),labels:Object.assign({},LABELS),meta:Object.assign({},META),traits:cloneTraits(TRAITS),formations:Object.fromEntries(Object.entries(FORMATIONS).map(([n,p])=>[n,p.slice()])),schemeStates:Object.assign({},SCHEME_STATES),presetSchemeState:Object.assign({},PRESET_SCHEME_STATE),ladders:Object.fromEntries(Object.entries(LADDERS).map(([k,v])=>[k,v.slice()])),displayMeta:Object.assign({},DISPLAY_META),displayOrder:DISPLAY_ORDER.slice(),styleGroups:STYLE_GROUPS.map(x=>Object.assign({},x)),auditTier:AUDIT,fallbackPolicy:'5.61-tactical-suite-v7'};
})();