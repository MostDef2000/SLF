// Active Tactical Preset Registry
// ============================================================
// Canonical source of truth for the generator 5.61 tactical suite.
// UI, recommendation policy, telemetry and tactic application must derive
// active preset identity, controls, formation and display metadata from here.

(function activeTacticalPresetRegistry() {
    'use strict';

    const SUITE_VERSION = 'slf_tactic_suite_561_v7';
    const RECOMMENDATION_SCHEMA = 'slf_rule_decision_v7_tactical_suite';
    const DEFAULT_RISK_APPETITE = 'standard';

    const ACTIVE_PRESET_NAMES = [
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

    const REMOVED_PRESET_NAMES = [
        'Mourinho_WeakSide_def3',
        'Henta_Hold_def3',
        'Pep_StandardControl_bal3',
        'Xabi_VerticalBox_att3',
        'Xabi_BoxMidfield_bal3',
        'DeZerbi_BaitPress_bal3',
        'DeZerbi_Release_att4',
        'Klopp_WideTrap_att4',
        'Henta_LeftTrap_att3',
        'Henta_RightTrap_att3',
        'Henta_WideTrap_att3',
        'Henta_CounterTrap_att4',
        'Henta_CentralTrap_att3',
        'Nagelsmann_WidePress_att4'
    ];

    const ACTIVE = new Set(['standard', ...ACTIVE_PRESET_NAMES]);

    // build_temp is progression verticality, not raw passing speed:
    // 1 patient/horizontal, 2 moderate, 3 direct/vertical.
    const PRESETS = {
        Arteta_Control433_bal3: { def_line:'2', press_line:'3', def_width:'2', press_intense:'3', build_type:'2', build_temp:'2', build_long:'1', build_fast:'2', style:'3', pass_risk:'3', dribble:'2', cross:'2', corner:'1', shot:'2', priority:[] },
        Pep_BoxControl_bal2: { def_line:'2', press_line:'2', def_width:'2', press_intense:'2', build_type:'2', build_temp:'1', build_long:'1', build_fast:'2', style:'3', pass_risk:'2', dribble:'2', cross:'1', corner:'1', shot:'2', priority:[] },
        Pep_PressCooldown_bal2: { def_line:'1', press_line:'2', def_width:'3', press_intense:'1', build_type:'1', build_temp:'2', build_long:'4', build_fast:'2', style:'2', pass_risk:'2', dribble:'1', cross:'2', corner:'1', shot:'1', priority:[] },
        Compact_Counter_def3: { def_line:'1', press_line:'1', def_width:'2', press_intense:'2', build_type:'1', build_temp:'3', build_long:'4', build_fast:'4', style:'3', pass_risk:'2', dribble:'3', cross:'2', corner:'1', shot:'3', priority:[] },
        Pep_ControlledPush_att3: { def_line:'3', press_line:'3', def_width:'2', press_intense:'3', build_type:'2', build_temp:'3', build_long:'1', build_fast:'4', style:'4', pass_risk:'4', dribble:'3', cross:'2', corner:'1', shot:'3', priority:[] },
        Pep_TwoThreeFive_att3: { def_line:'4', press_line:'4', def_width:'4', press_intense:'4', build_type:'2', build_temp:'2', build_long:'1', build_fast:'3', style:'5', pass_risk:'4', dribble:'3', cross:'2', corner:'1', shot:'4', priority:[] },
        Conte_WingbackWidth_bal4: { def_line:'2', press_line:'2', def_width:'5', press_intense:'3', build_type:'3', build_temp:'2', build_long:'3', build_fast:'3', style:'4', pass_risk:'3', dribble:'4', cross:'5', corner:'1', shot:'2', priority:['left','right'] },
        Klopp_Gegenpress_att4: { def_line:'4', press_line:'5', def_width:'3', press_intense:'5', build_type:'3', build_temp:'3', build_long:'2', build_fast:'5', style:'5', pass_risk:'4', dribble:'4', cross:'3', corner:'1', shot:'4', priority:[] },
        Simeone_Compact442_def4: { def_line:'1', press_line:'2', def_width:'1', press_intense:'4', build_type:'1', build_temp:'1', build_long:'3', build_fast:'2', style:'1', pass_risk:'2', dribble:'1', cross:'2', corner:'1', shot:'1', priority:[] },
        Simeone_LowBlock_def5: { def_line:'1', press_line:'1', def_width:'1', press_intense:'1', build_type:'1', build_temp:'1', build_long:'5', build_fast:'2', style:'1', pass_risk:'1', dribble:'1', cross:'1', corner:'1', shot:'1', priority:[] },
        Bielsa_ChaosPress_att5: { def_line:'5', press_line:'5', def_width:'5', press_intense:'5', build_type:'3', build_temp:'3', build_long:'4', build_fast:'5', style:'5', pass_risk:'5', dribble:'5', cross:'5', corner:'1', shot:'5', priority:[] }
    };

    const LABELS = {
        standard: 'Стандартная 4-2-3-1_att1',
        Arteta_Control433_bal3: 'Arteta Structural Control 4-3-3_neutr',
        Pep_BoxControl_bal2: 'Guardiola Press-Resistant Control 4-1-2-2-1_neutr',
        Pep_PressCooldown_bal2: 'Guardiola Press Cooldown 4-1-4-1_def1',
        Compact_Counter_def3: 'Mourinho Compact Counter 4-4-1-1_neutr',
        Pep_ControlledPush_att3: 'Guardiola Controlled Push 4-2-3-1_att1',
        Pep_TwoThreeFive_att3: 'Guardiola Positional Attack 3-2-5_att2',
        Conte_WingbackWidth_bal4: 'Conte Wingback Width 3-4-3_att1',
        Klopp_Gegenpress_att4: 'Klopp Gegenpress 4-2-4_att2',
        Simeone_Compact442_def4: 'Simeone Compact 4-4-2_def2',
        Simeone_LowBlock_def5: 'Simeone Low Block 5-4-1_def2',
        Bielsa_ChaosPress_att5: 'Bielsa Chaos Press 3-3-4_att2'
    };

    const FORMATIONS = {
        Arteta_Control433_bal3: ['gk','ld','cd1','cd3','rd','cm1','dm2','cm3','lw','st2','rw'],
        Pep_BoxControl_bal2: ['gk','ld','cd1','cd3','rd','dm2','cm1','cm3','am1','am2','st2'],
        Pep_PressCooldown_bal2: ['gk','ld','cd1','cd3','rd','dm2','lm','cm2','cm3','rm','st2'],
        Compact_Counter_def3: ['gk','ld','cd1','cd3','rd','lm','dm2','cm2','rm','am2','st2'],
        Pep_ControlledPush_att3: ['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am2','rw','st2'],
        Pep_TwoThreeFive_att3: ['gk','cd1','cd2','cd3','dm2','cm2','lw','am1','st1','am2','rw'],
        Conte_WingbackWidth_bal4: ['gk','cd1','cd2','cd3','lb','dm2','cm2','rb','lw','st2','rw'],
        Klopp_Gegenpress_att4: ['gk','ld','cd1','cd3','rd','dm2','cm2','lw','st1','st2','rw'],
        Simeone_Compact442_def4: ['gk','ld','cd1','cd3','rd','lm','cm2','dm2','rm','st1','st2'],
        Simeone_LowBlock_def5: ['gk','lb','cd1','cd2','cd3','rb','lm','dm2','cm2','rm','st2'],
        Bielsa_ChaosPress_att5: ['gk','cd1','cd2','cd3','lm','dm2','rm','lw','st1','st2','rw']
    };

    const STYLE_GROUPS = [
        { style:'5', label:'Атака+ · _att2', suffix:'_att2' },
        { style:'4', label:'Атака · _att1', suffix:'_att1' },
        { style:'3', label:'Обычный · _neutr', suffix:'_neutr' },
        { style:'2', label:'Защита · _def1', suffix:'_def1' },
        { style:'1', label:'Защ+ · _def2', suffix:'_def2' }
    ];

    const DISPLAY_META = {
        standard: { trainer:'', formation:'4-2-3-1', style:'4', suffix:'_att1' },
        Arteta_Control433_bal3: { trainer:'Arteta', formation:'4-3-3', style:'3', suffix:'_neutr' },
        Pep_BoxControl_bal2: { trainer:'Guardiola', formation:'4-1-2-2-1', style:'3', suffix:'_neutr' },
        Pep_PressCooldown_bal2: { trainer:'Guardiola', formation:'4-1-4-1', style:'2', suffix:'_def1' },
        Compact_Counter_def3: { trainer:'Mourinho', formation:'4-4-1-1', style:'3', suffix:'_neutr' },
        Pep_ControlledPush_att3: { trainer:'Guardiola', formation:'4-2-3-1', style:'4', suffix:'_att1' },
        Pep_TwoThreeFive_att3: { trainer:'Guardiola', formation:'3-2-5', style:'5', suffix:'_att2' },
        Conte_WingbackWidth_bal4: { trainer:'Conte', formation:'3-4-3', style:'4', suffix:'_att1' },
        Klopp_Gegenpress_att4: { trainer:'Klopp', formation:'4-2-4', style:'5', suffix:'_att2' },
        Simeone_Compact442_def4: { trainer:'Simeone', formation:'4-4-2', style:'1', suffix:'_def2' },
        Simeone_LowBlock_def5: { trainer:'Simeone', formation:'5-4-1', style:'1', suffix:'_def2' },
        Bielsa_ChaosPress_att5: { trainer:'Bielsa', formation:'3-3-4', style:'5', suffix:'_att2' }
    };

    const DISPLAY_ORDER = Object.keys(DISPLAY_META).sort((a, b) => {
        const ma = DISPLAY_META[a];
        const mb = DISPLAY_META[b];
        const styleDiff = Number(mb.style) - Number(ma.style);
        if (styleDiff) return styleDiff;
        if (a === 'standard') return -1;
        if (b === 'standard') return 1;
        const trainerDiff = String(ma.trainer).localeCompare(String(mb.trainer), 'en', { sensitivity:'base' });
        if (trainerDiff) return trainerDiff;
        return String(LABELS[a]).localeCompare(String(LABELS[b]), 'en', { sensitivity:'base' });
    });

    const META = {
        Arteta_Control433_bal3: { group:'balance', rank:3, role:'stable_control', title:LABELS.Arteta_Control433_bal3, idea:'структурный контроль 4-3-3 с умеренным прессингом', use:'базовый план равного матча и возврат к устойчивой структуре', risk:'не предназначен для позднего форсирования гола' },
        Pep_BoxControl_bal2: { group:'balance', rank:2, role:'pressure_escape', title:LABELS.Pep_BoxControl_bal2, idea:'короткий press-resistant контроль с дополнительными опорами', use:'выход из давления без подтверждённой прямой контратаки и reset после брака', risk:'может быть слишком медленным при поздней погоне' },
        Pep_PressCooldown_bal2: { group:'balance', rank:2, role:'press_cooldown', title:LABELS.Pep_PressCooldown_bal2, idea:'снизить цену прессинга и вернуть физическую/позиционную устойчивость', use:'fatigue, рост брака/фолов или заметное падение силы', risk:'отдаёт инициативу и не должен быть поздним ответом при проигрыше' },
        Compact_Counter_def3: { group:'defensive', rank:3, role:'counter_outlet', title:LABELS.Compact_Counter_def3, idea:'компактно пережить давление и быстро использовать подтверждённый свободный выход', use:'только при counterExitAvailable/spaceBehindPress/cleanFirstPass', risk:'без реального outlet возвращает мяч сопернику; legacy evidence требует осторожности' },
        Pep_ControlledPush_att3: { group:'attack', rank:3, role:'controlled_chase', title:LABELS.Pep_ControlledPush_att3, idea:'первая ступень усиления атаки без полного all-in', use:'нужен гол, но структура и качество действий ещё позволяют контролируемое повышение риска', risk:'при высоком браке ускорение увеличит потери' },
        Pep_TwoThreeFive_att3: { group:'attack', rank:4, role:'positional_siege', title:LABELS.Pep_TwoThreeFive_att3, idea:'позиционный дожим 3-2-5 с пятью высокими каналами', use:'есть атакующий momentum и переходы соперника контролируются', risk:'опасен при counter threat и требует качественного владения' },
        Conte_WingbackWidth_bal4: { group:'balance', rank:4, role:'width_attack', title:LABELS.Conte_WingbackWidth_bal4, idea:'максимальная ширина через wingbacks/крайних', use:'центр закрыт, фланги дают качество и кроссы не являются плохим каналом', risk:'слабые фланги дают пустые подачи и открывают полуфланги' },
        Klopp_Gegenpress_att4: { group:'attack', rank:4, role:'late_high_pressure', title:LABELS.Klopp_Gegenpress_att4, idea:'поздний контролируемый high-pressure 4-2-4', use:'проигрываем поздно, брак низкий, физика позволяет и переходы не критичны', risk:'дорог по силе, фолам и пространству за линией' },
        Simeone_Compact442_def4: { group:'defensive', rank:4, role:'protect_lead', title:LABELS.Simeone_Compact442_def4, idea:'компактный 4-4-2 для защиты преимущества без полного автобуса', use:'ведём после 65–70-й и нужно снизить transition risk', risk:'слишком раннее применение режет собственную атаку' },
        Simeone_LowBlock_def5: { group:'defensive', rank:5, role:'emergency_lock', title:LABELS.Simeone_LowBlock_def5, idea:'временный 5-4-1 emergency lock штрафной', use:'критическая осада без выхода либо очень поздняя защита преимущества', risk:'только временный режим с обязательной переоценкой следующего окна' },
        Bielsa_ChaosPress_att5: { group:'attack', rank:5, role:'final_all_in', title:LABELS.Bielsa_ChaosPress_att5, idea:'финальный all-in с максимальным давлением', use:'последнее окно проигрываемого матча при приемлемой физике и низком браке', risk:'может полностью разрушить оборонительную структуру' }
    };

    const TRAITS = {
        Arteta_Control433_bal3: { attackLanes:['center','left','right'], build:'structural_control', tempo:'medium', press:'medium_high', risk:'medium', strengths:['structure','balanced_progression'], requires:[], avoids:['late_emergency_chase'] },
        Pep_BoxControl_bal2: { attackLanes:['center'], build:'press_resistant_control', tempo:'low', press:'medium_low', risk:'low', strengths:['safe_possession','pressure_escape'], requires:['pressure_without_counter_exit'], avoids:['urgent_chase'] },
        Pep_PressCooldown_bal2: { attackLanes:['center','right'], build:'cooldown_outlet', tempo:'low', press:'low', risk:'low', strengths:['fatigue_control','restore_structure'], requires:['press_fatigue'], avoids:['late_emergency_chase'] },
        Compact_Counter_def3: { attackLanes:['left','right'], build:'direct_counter', tempo:'high', press:'low', risk:'medium', strengths:['compactness','fast_outlet'], requires:['confirmed_counter_exit'], avoids:['counter_exit_blocked','sustained_positional_attack'] },
        Pep_ControlledPush_att3: { attackLanes:['center','left','right'], build:'controlled_push', tempo:'high', press:'medium_high', risk:'high', strengths:['controlled_pressure'], requires:['need_goal_or_attack_need'], avoids:['very_high_bad_actions'] },
        Pep_TwoThreeFive_att3: { attackLanes:['center','left','right'], build:'positional_siege_325', tempo:'medium_high', press:'high', risk:'very_high', strengths:['territorial_pressure','five_lane_attack'], requires:['attacking_momentum','transition_control'], avoids:['transition_threat','press_fatigue'] },
        Conte_WingbackWidth_bal4: { attackLanes:['left','right'], build:'maximum_width', tempo:'medium_high', press:'medium', risk:'high', strengths:['width','wingback_overload'], requires:['wide_quality','center_closed'], avoids:['own_crosses_bad','opponent_crosses_dangerous'] },
        Klopp_Gegenpress_att4: { attackLanes:['left','right','center'], build:'gegenpress_424', tempo:'very_high', press:'very_high', risk:'very_high', strengths:['counterpress','late_pressure'], requires:['late_need_goal','fitness'], avoids:['press_fatigue','high_bad_actions','transition_threat'] },
        Simeone_Compact442_def4: { attackLanes:['left','right'], build:'compact442', tempo:'low', press:'high_local', risk:'low', strengths:['protect_lead','compactness'], requires:['protect_lead'], avoids:['urgent_chase'] },
        Simeone_LowBlock_def5: { attackLanes:[], build:'temporary_emergency_lock', tempo:'very_low', press:'very_low', risk:'very_low', strengths:['survive_siege'], requires:['mandatory_reassessment_next_window'], avoids:['permanent_losing_state'] },
        Bielsa_ChaosPress_att5: { attackLanes:['left','center','right'], build:'final_all_in', tempo:'maximum', press:'maximum', risk:'maximum', strengths:['final_pressure'], requires:['emergency_need_goal'], avoids:['early_match','press_fatigue','high_bad_actions'] }
    };

    const SCHEME_STATES = {
        base_balance: '4-3-3 structural control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        arteta_control: '4-3-3 structural control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        box_control: '4-1-2-2-1 press-resistant control / GK-LD-CD1-CD3-RD / DM2 / CM1-CM3 / AM1-AM2 / ST2',
        press_cooldown: '4-1-4-1 cooldown outlet / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        compact_counter: '4-4-1-1 direct counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-RM / AM2 / ST2',
        controlled_push: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        positional_325: '3-2-5 positional siege / GK-CD1-CD2-CD3 / DM2-CM2 / LW-AM1-ST1-AM2-RW',
        wingback_width: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LB-DM2-CM2-RB / LW-ST2-RW',
        gegenpress_424: '4-2-4 gegenpress / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        compact_442: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        low_block_541: '5-4-1 emergency lock / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        chaos_334: '3-3-4 final all-in / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW'
    };

    const PRESET_SCHEME_STATE = {
        Arteta_Control433_bal3:'arteta_control',
        Pep_BoxControl_bal2:'box_control',
        Pep_PressCooldown_bal2:'press_cooldown',
        Compact_Counter_def3:'compact_counter',
        Pep_ControlledPush_att3:'controlled_push',
        Pep_TwoThreeFive_att3:'positional_325',
        Conte_WingbackWidth_bal4:'wingback_width',
        Klopp_Gegenpress_att4:'gegenpress_424',
        Simeone_Compact442_def4:'compact_442',
        Simeone_LowBlock_def5:'low_block_541',
        Bielsa_ChaosPress_att5:'chaos_334'
    };

    const LADDERS = {
        defensive: ['Arteta_Control433_bal3','Simeone_Compact442_def4','Simeone_LowBlock_def5','Pep_PressCooldown_bal2'],
        balance: ['Pep_BoxControl_bal2','Arteta_Control433_bal3','Compact_Counter_def3','Conte_WingbackWidth_bal4'],
        attack: ['Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
        chase: ['Arteta_Control433_bal3','Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
        protect: ['Arteta_Control433_bal3','Simeone_Compact442_def4','Simeone_LowBlock_def5'],
        pressure: ['Arteta_Control433_bal3','Pep_BoxControl_bal2','Compact_Counter_def3'],
        recovery: ['Klopp_Gegenpress_att4','Pep_TwoThreeFive_att3','Pep_ControlledPush_att3','Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2']
    };

    const DEFAULT_AUDIT_TIER = {
        primary: ['Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Pep_ControlledPush_att3'],
        conditional: ['Compact_Counter_def3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Simeone_Compact442_def4'],
        restricted: ['Klopp_Gegenpress_att4'],
        emergency: ['Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'],
        removed: REMOVED_PRESET_NAMES.slice(),
        needsMoreData: [],
        experimental: [],
        blocked: []
    };

    const HINT_RULES = [
        { id:'final_all_in', preset:'Bielsa_ChaosPress_att5', decision:'final_all_in', risk:'high', reason:'последнее окно проигрываемого матча', when:c => c.scoreState === 'losing' && c.minute >= 84 },
        { id:'emergency_lock', preset:'Simeone_LowBlock_def5', decision:'emergency_lock', risk:'high', reason:'критическая осада без выхода', when:c => c.emergencyLockRequired === true },
        { id:'press_cooldown', preset:'Pep_PressCooldown_bal2', decision:'press_cooldown', risk:'low', reason:'цена прессинга стала слишком высокой', when:c => c.pressFatigueRisk === true },
        { id:'protect_lead', preset:'Simeone_Compact442_def4', decision:'protect_lead', risk:'medium', reason:'поздняя защита преимущества', when:c => c.scoreState === 'winning' && c.minute >= 65 },
        { id:'counter_outlet', preset:'Compact_Counter_def3', decision:'pressure_counter', risk:'medium', reason:'подтверждён выход за прессинг', when:c => c.counterExitAvailable === true },
        { id:'pressure_escape', preset:'Pep_BoxControl_bal2', decision:'pressure_escape', risk:'low', reason:'давление без подтверждённого outlet', when:c => c.underPressure === true },
        { id:'controlled_chase', preset:'Pep_ControlledPush_att3', decision:'controlled_chase', risk:'medium', reason:'нужен гол без all-in', when:c => c.scoreState === 'losing' && c.minute >= 45 },
        { id:'stable_control', preset:'Arteta_Control433_bal3', decision:'stable_control', risk:'low', reason:'устойчивый baseline', when:() => true }
    ];

    function clonePresetMap(map) {
        return Object.fromEntries(Object.entries(map).map(([name, preset]) => [name, Object.assign({}, preset, { priority:(preset.priority || []).slice() })]));
    }

    function cloneTraits(map) {
        return Object.fromEntries(Object.entries(map).map(([name, traits]) => [name, Object.assign({}, traits, {
            attackLanes:(traits.attackLanes || []).slice(),
            strengths:(traits.strengths || []).slice(),
            requires:(traits.requires || []).slice(),
            avoids:(traits.avoids || []).slice()
        })]));
    }

    function removeInactiveKeys(map) {
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(key => {
            if (!ACTIVE.has(key)) delete map[key];
        });
    }

    function applyHintPolicy(auditTier = DEFAULT_AUDIT_TIER, rules = HINT_RULES) {
        if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return false;
        CurrentActionHintEngine.PRESET_AUDIT_TIER = Object.fromEntries(Object.entries(auditTier).map(([key, names]) => [key, Array.isArray(names) ? names.slice() : names]));
        CurrentActionHintEngine.HINT_RULES = (Array.isArray(rules) ? rules : []).slice();
        return true;
    }

    function hasTag(state, name) {
        return Array.isArray(state?.tags) && state.tags.includes(name)
            || Array.isArray(state?.signals) && state.signals.includes(name);
    }

    function choosePreset(state = {}) {
        const scoreState = state?.score?.state || state?.scoreState || 'unknown';
        const minute = Number(state.minute || 0);
        const attackNeed = Number(state.attackNeed || 0);
        const pressureRisk = Number(state.pressureRisk || 0);
        const myBad = Number(state.myBad || state.myBadActionsPct || 0);
        const myPowerDropPct = Number(state.myPowerDropPct || 0);
        const underPressure = state.underPressure === true || hasTag(state, 'under_pressure') || hasTag(state, 'transition_threat');
        const transitionThreat = state.transitionThreat === true || hasTag(state, 'transition_threat');
        const counterExitAvailable = state.counterExitAvailable === true || hasTag(state, 'counter_exit_available') || hasTag(state, 'space_behind_press') || hasTag(state, 'clean_first_pass');
        const counterExitBlocked = state.counterExitAvailable === false || state.counterExitBlocked === true || hasTag(state, 'counter_exit_blocked') || hasTag(state, 'first_pass_trapped') || hasTag(state, 'isolated_forward') || hasTag(state, 'sustained_siege');
        const pressFatigueRisk = state.pressFatigueRisk === true || state.pressFatigue?.active === true || hasTag(state, 'press_fatigue_risk') || myPowerDropPct >= 4;
        const highBadActions = state.highBadActions === true || hasTag(state, 'high_bad_actions') || myBad >= 20;
        const lowBadActions = state.lowBadActions === true || hasTag(state, 'low_bad_actions') || (myBad > 0 && myBad <= 16);
        const attackingMomentum = state.attackingMomentum === true || hasTag(state, 'attacking_momentum');
        const centerClosed = state.centerClosed === true || hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block');
        const wideQuality = state.wideQuality === true || hasTag(state, 'wide_quality') || hasTag(state, 'attack_left') || hasTag(state, 'attack_right');
        const ownCrossesBad = state.ownCrossesBad === true || hasTag(state, 'own_open_play_crosses_bad') || hasTag(state, 'own_crosses_bad_total');
        const opponentCrossesDangerous = state.opponentCrossesDangerous === true || hasTag(state, 'opponent_crosses_dangerous');
        const emergencyLock = underPressure && !counterExitAvailable && (state.ownRedCard || highBadActions || myPowerDropPct >= 5 || pressureRisk >= 82 || hasTag(state, 'sustained_siege'));

        if (scoreState === 'losing' && minute >= 84 && attackNeed >= 75 && lowBadActions && !pressFatigueRisk) return { name:'Bielsa_ChaosPress_att5', reason:'последнее окно — all-in разрешён' };
        if (emergencyLock) return { name:'Simeone_LowBlock_def5', reason:'критическая осада без подтверждённого выхода — временный emergency lock' };
        if (pressFatigueRisk && !(scoreState === 'losing' && minute >= 70)) return { name:'Pep_PressCooldown_bal2', reason:'снизить цену прессинга и восстановить структуру' };
        if (scoreState === 'winning' && minute >= 65) {
            if (minute >= 84 && underPressure) return { name:'Simeone_LowBlock_def5', reason:'очень поздняя тяжёлая защита преимущества — временный lock' };
            return { name:underPressure || opponentCrossesDangerous ? 'Simeone_Compact442_def4' : 'Arteta_Control433_bal3', reason:'защитить преимущество без лишней эскалации риска' };
        }
        if ((underPressure || transitionThreat || hasTag(state, 'opponent_high_press'))) {
            if (counterExitAvailable && !counterExitBlocked) return { name:'Compact_Counter_def3', reason:'есть подтверждённый outlet за прессинг' };
            return { name:'Pep_BoxControl_bal2', reason:'давление без подтверждённого outlet — выход через контроль' };
        }
        if (centerClosed && wideQuality && !ownCrossesBad && !opponentCrossesDangerous) return { name:'Conte_WingbackWidth_bal4', reason:'центр закрыт, ширина подтверждена' };
        if (scoreState === 'losing' && minute >= 72 && attackNeed >= 65 && lowBadActions && !pressFatigueRisk && !transitionThreat) return { name:'Klopp_Gegenpress_att4', reason:'поздняя контролируемая эскалация давления' };
        if ((attackingMomentum || attackNeed >= 58) && minute >= 55 && !transitionThreat && !highBadActions && !pressFatigueRisk) return { name:'Pep_TwoThreeFive_att3', reason:'позиционный дожим при контролируемых переходах' };
        if (scoreState === 'losing' && minute >= 45 || attackNeed >= 38) return { name:'Pep_ControlledPush_att3', reason:'первая ступень контролируемой погони' };
        return { name:'Arteta_Control433_bal3', reason:'устойчивый структурный baseline' };
    }

    removeInactiveKeys(typeof BASE_PRESETS !== 'undefined' ? BASE_PRESETS : null);
    removeInactiveKeys(typeof BASE_LABELS !== 'undefined' ? BASE_LABELS : null);
    if (typeof BASE_PRESETS !== 'undefined') Object.assign(BASE_PRESETS, clonePresetMap(PRESETS));
    if (typeof BASE_LABELS !== 'undefined') Object.assign(BASE_LABELS, LABELS);

    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        TacticPresetLibrary.meta = Object.assign({}, META);
        TacticPresetLibrary.schemeStates = Object.assign({}, SCHEME_STATES);
        TacticPresetLibrary.presetSchemeState = Object.assign({}, PRESET_SCHEME_STATE);
        TacticPresetLibrary.traits = cloneTraits(TRAITS);
    }

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
        RecommendationEngine.getPresetLadder = function getActivePresetLadder(group) {
            return (LADDERS[group] || []).slice();
        };
    }

    applyHintPolicy();

    if (typeof window !== 'undefined') {
        window.SLFActivePresetRegistry = {
            suiteVersion: SUITE_VERSION,
            recommendationSchema: RECOMMENDATION_SCHEMA,
            generatorVersion: '5.61',
            defaultRiskAppetite: DEFAULT_RISK_APPETITE,
            active: ACTIVE_PRESET_NAMES.slice(),
            removed: REMOVED_PRESET_NAMES.slice(),
            presets: clonePresetMap(PRESETS),
            labels: Object.assign({}, LABELS),
            meta: Object.fromEntries(Object.entries(META).map(([name, meta]) => [name, Object.assign({}, meta)])),
            traits: cloneTraits(TRAITS),
            formations: Object.fromEntries(Object.entries(FORMATIONS).map(([name, positions]) => [name, positions.slice()])),
            schemeStates: Object.assign({}, SCHEME_STATES),
            presetSchemeState: Object.assign({}, PRESET_SCHEME_STATE),
            ladders: Object.fromEntries(Object.entries(LADDERS).map(([name, names]) => [name, names.slice()])),
            displayMeta: Object.fromEntries(Object.entries(DISPLAY_META).map(([name, meta]) => [name, Object.assign({}, meta)])),
            displayOrder: DISPLAY_ORDER.slice(),
            styleGroups: STYLE_GROUPS.map(group => Object.assign({}, group)),
            auditTier: Object.fromEntries(Object.entries(DEFAULT_AUDIT_TIER).map(([key, names]) => [key, Array.isArray(names) ? names.slice() : names])),
            fallbackPolicy: '5.61-tactical-suite-v7',
            choosePreset,
            applyHintPolicy
        };
    }
})();