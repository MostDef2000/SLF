// Active Tactical Preset Registry
// ============================================================
// Canonical data source for the 11 active tactical presets.
// The direction policy may score and guard these presets later in the bundle,
// but preset values, scheme descriptions, traits and fallback ladders must not
// contradict that policy.
// build_temp means verticality of ball progression, not passing speed:
// 1 = patient/horizontal, 2 = moderate, 3 = high/direct verticality.

(function activeTacticalPresetRegistry() {
    'use strict';

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

    const PRESETS = {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '2', corner: '1', shot: '2', priority: [] },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '2', cross: '1', corner: '1', shot: '2', priority: [] },
        Pep_PressCooldown_bal2: { def_line: '1', press_line: '2', def_width: '3', press_intense: '1', build_type: '1', build_temp: '2', build_long: '4', build_fast: '2', style: '2', pass_risk: '2', dribble: '1', cross: '2', corner: '1', shot: '1', priority: [] },
        Compact_Counter_def3: { def_line: '1', press_line: '1', def_width: '2', press_intense: '2', build_type: '1', build_temp: '3', build_long: '5', build_fast: '5', style: '3', pass_risk: '3', dribble: '4', cross: '2', corner: '1', shot: '3', priority: [] },
        Pep_ControlledPush_att3: { def_line: '3', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '4', style: '4', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: [] },
        Pep_TwoThreeFive_att3: { def_line: '4', press_line: '4', def_width: '4', press_intense: '4', build_type: '2', build_temp: '2', build_long: '1', build_fast: '3', style: '5', pass_risk: '5', dribble: '4', cross: '2', corner: '1', shot: '4', priority: [] },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '5', press_intense: '3', build_type: '3', build_temp: '2', build_long: '3', build_fast: '3', style: '4', pass_risk: '3', dribble: '4', cross: '5', corner: '1', shot: '2', priority: ['left', 'right'] },
        Klopp_Gegenpress_att4: { def_line: '4', press_line: '5', def_width: '3', press_intense: '5', build_type: '3', build_temp: '3', build_long: '2', build_fast: '5', style: '5', pass_risk: '4', dribble: '4', cross: '3', corner: '1', shot: '4', priority: [] },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '4', build_type: '1', build_temp: '1', build_long: '3', build_fast: '2', style: '1', pass_risk: '2', dribble: '1', cross: '2', corner: '1', shot: '1', priority: [] },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '1', build_type: '1', build_temp: '1', build_long: '5', build_fast: '2', style: '1', pass_risk: '1', dribble: '1', cross: '1', corner: '1', shot: '1', priority: [] },
        Bielsa_ChaosPress_att5: { def_line: '5', press_line: '5', def_width: '5', press_intense: '5', build_type: '3', build_temp: '3', build_long: '4', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '5', corner: '1', shot: '5', priority: [] }
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

    const STYLE_GROUPS = [
        { style: '5', label: 'Атака+ · _att2', suffix: '_att2' },
        { style: '4', label: 'Атака · _att1', suffix: '_att1' },
        { style: '3', label: 'Обычный · _neutr', suffix: '_neutr' },
        { style: '2', label: 'Защита · _def1', suffix: '_def1' },
        { style: '1', label: 'Защ+ · _def2', suffix: '_def2' }
    ];

    const DISPLAY_META = {
        standard: { trainer: '', formation: '4-2-3-1', style: '4', suffix: '_att1' },
        Arteta_Control433_bal3: { trainer: 'Arteta', formation: '4-3-3', style: '3', suffix: '_neutr' },
        Pep_BoxControl_bal2: { trainer: 'Guardiola', formation: '4-1-2-2-1', style: '3', suffix: '_neutr' },
        Pep_PressCooldown_bal2: { trainer: 'Guardiola', formation: '4-1-4-1', style: '2', suffix: '_def1' },
        Compact_Counter_def3: { trainer: 'Mourinho', formation: '4-4-1-1', style: '3', suffix: '_neutr' },
        Pep_ControlledPush_att3: { trainer: 'Guardiola', formation: '4-2-3-1', style: '4', suffix: '_att1' },
        Pep_TwoThreeFive_att3: { trainer: 'Guardiola', formation: '3-2-5', style: '5', suffix: '_att2' },
        Conte_WingbackWidth_bal4: { trainer: 'Conte', formation: '3-4-3', style: '4', suffix: '_att1' },
        Klopp_Gegenpress_att4: { trainer: 'Klopp', formation: '4-2-4', style: '5', suffix: '_att2' },
        Simeone_Compact442_def4: { trainer: 'Simeone', formation: '4-4-2', style: '1', suffix: '_def2' },
        Simeone_LowBlock_def5: { trainer: 'Simeone', formation: '5-4-1', style: '1', suffix: '_def2' },
        Bielsa_ChaosPress_att5: { trainer: 'Bielsa', formation: '3-3-4', style: '5', suffix: '_att2' }
    };

    const DISPLAY_ORDER = Object.keys(DISPLAY_META).sort((a, b) => {
        const ma = DISPLAY_META[a];
        const mb = DISPLAY_META[b];
        const styleDiff = Number(mb.style) - Number(ma.style);
        if (styleDiff) return styleDiff;
        if (a === 'standard') return -1;
        if (b === 'standard') return 1;
        const trainerDiff = String(ma.trainer).localeCompare(String(mb.trainer), 'en', { sensitivity: 'base' });
        if (trainerDiff) return trainerDiff;
        return String(LABELS[a]).localeCompare(String(LABELS[b]), 'en', { sensitivity: 'base' });
    });

    const META = {
        Arteta_Control433_bal3: { group: 'balance', rank: 3, title: LABELS.Arteta_Control433_bal3, idea: 'структурный контроль с умеренным прессингом и ограниченным риском', use: 'равная игра без сильного аварийного сигнала', risk: 'не даёт резкого роста давления, когда уже нужен гол' },
        Pep_BoxControl_bal2: { group: 'balance', rank: 2, title: LABELS.Pep_BoxControl_bal2, idea: 'разбить прессинг короткими опорами и сохранить продвижение без стерильного отказа от атаки', use: 'осада или высокий прессинг без подтверждённого выхода в прямую контратаку', risk: 'при полном разрушении структуры требуется временный emergency lock' },
        Pep_PressCooldown_bal2: { group: 'balance', rank: 2, title: LABELS.Pep_PressCooldown_bal2, idea: 'снизить цену прессинга, опустить интенсивность и получить более длинный безопасный outlet', use: 'усталость, фолы, падение силы или ухудшение эффективности высокого давления', risk: 'отдаёт территорию и не подходит для финальной погони' },
        Compact_Counter_def3: { group: 'defensive', rank: 3, title: LABELS.Compact_Counter_def3, idea: 'компактно встретить и максимально быстро атаковать пространство за прессингом', use: 'только когда подтверждён первый выход, свободная зона или чистая передача из-под давления', risk: 'без outlet превращает длинную передачу в повторную волну давления' },
        Pep_ControlledPush_att3: { group: 'attack', rank: 3, title: LABELS.Pep_ControlledPush_att3, idea: 'поднять линию и ускорить продвижение без полного all-in прессинга', use: 'нужен гол, но оборонительная структура ещё сохраняется', risk: 'при высоком браке ускорение превращается в серию потерь' },
        Pep_TwoThreeFive_att3: { group: 'attack', rank: 4, title: LABELS.Pep_TwoThreeFive_att3, idea: 'зафиксировать соперника структурой 3-2-5 и пятью высокими каналами атаки', use: 'есть атакующий импульс и переходы соперника контролируются', risk: 'оставляет пространство за первой линией и требует качественного владения' },
        Conte_WingbackWidth_bal4: { group: 'balance', rank: 4, title: LABELS.Conte_WingbackWidth_bal4, idea: 'растянуть блок до максимальной ширины и доставлять мяч через сильные фланги', use: 'центр закрыт, фланги сильны и навесы дают качество', risk: 'без сильных крайних игроков раскрывает полуфланги и создаёт пустые подачи' },
        Klopp_Gegenpress_att4: { group: 'attack', rank: 4, title: LABELS.Klopp_Gegenpress_att4, idea: 'перейти к 4-2-4 с почти максимальным темпом и давлением после потери', use: 'нужен срочный рост давления при достаточной физике и низком браке', risk: 'резко увеличивает усталость, фолы и пространство за линией' },
        Simeone_Compact442_def4: { group: 'defensive', rank: 4, title: LABELS.Simeone_Compact442_def4, idea: 'низкий узкий 4-4-2 с жёстким локальным прессингом и редкими выходами', use: 'защита преимущества под устойчивым давлением', risk: 'слишком рано отдаёт инициативу и ограничивает создание моментов' },
        Simeone_LowBlock_def5: { group: 'defensive', rank: 5, title: LABELS.Simeone_LowBlock_def5, idea: 'временный полный lock штрафной с длинным освобождением опасной зоны', use: 'критическая осада, удаление, падение силы или позднее удержание; только на один цикл', risk: 'обязательная переоценка в следующем окне; не использовать как постоянную стратегию при проигрыше' },
        Bielsa_ChaosPress_att5: { group: 'attack', rank: 5, title: LABELS.Bielsa_ChaosPress_att5, idea: 'максимальная линия, ширина, прессинг, темп и риск ради одного последнего шанса', use: 'проигрываем поздно и более безопасные ступени атаки уже недостаточны', risk: 'может окончательно разрушить оборонительную структуру и увеличить разницу в счёте' }
    };

    const SCHEME_STATES = {
        standard_base: '4-2-3-1 standard / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        Arteta_Control433_bal3: '4-3-3 structural control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Pep_BoxControl_bal2: '4-1-2-2-1 press-resistant control / GK-LD-CD1-CD3-RD / DM2 / CM1-CM3 / AM1-AM2 / ST2',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown outlet / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Compact_Counter_def3: '4-4-1-1 direct counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-RM / AM2 / ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Pep_TwoThreeFive_att3: '3-2-5 positional siege / GK-CD1-CD2-CD3 / DM2-CM2 / LW-AM1-ST1-AM2-RW',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LB-DM2-CM2-RB / LW-ST2-RW',
        Klopp_Gegenpress_att4: '4-2-4 gegenpress / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Simeone_LowBlock_def5: '5-4-1 emergency lock / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Bielsa_ChaosPress_att5: '3-3-4 final all-in / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW'
    };

    const PRESET_SCHEME_STATE = Object.fromEntries(ACTIVE_PRESET_NAMES.map(name => [name, name]));
    PRESET_SCHEME_STATE.standard = 'standard_base';

    const TRAITS = {
        Arteta_Control433_bal3: { attackLanes: [], build: 'structural_control', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['low_noise'], avoids: ['late_emergency_chase'] },
        Pep_BoxControl_bal2: { attackLanes: [], build: 'press_resistant_control', tempo: 'low', press: 'medium_low', risk: 'low', requires: ['pressure_without_counter_exit'], avoids: ['urgent_chase'] },
        Pep_PressCooldown_bal2: { attackLanes: [], build: 'cooldown_outlet', tempo: 'low', press: 'low', risk: 'low', requires: ['press_fatigue'], avoids: ['emergency_chase'] },
        Compact_Counter_def3: { attackLanes: [], build: 'direct_counter', tempo: 'very_high', press: 'low', risk: 'medium_high', requires: ['confirmed_counter_exit'], avoids: ['sustained_siege'] },
        Pep_ControlledPush_att3: { attackLanes: [], build: 'controlled_push', tempo: 'high', press: 'medium_high', risk: 'high', requires: ['need_goal'], avoids: ['high_bad_actions', 'transition_threat'] },
        Pep_TwoThreeFive_att3: { attackLanes: [], build: 'positional_siege_325', tempo: 'medium_high', press: 'high', risk: 'very_high', requires: ['attacking_momentum'], avoids: ['transition_threat', 'under_pressure'] },
        Conte_WingbackWidth_bal4: { attackLanes: ['left', 'right'], build: 'maximum_width', tempo: 'medium_high', press: 'medium', risk: 'high', requires: ['wide_quality'], avoids: ['own_crosses_bad', 'opponent_crosses_dangerous'] },
        Klopp_Gegenpress_att4: { attackLanes: [], build: 'gegenpress_424', tempo: 'very_high', press: 'very_high', risk: 'very_high', requires: ['need_pressure'], avoids: ['press_fatigue', 'high_bad_actions'] },
        Simeone_Compact442_def4: { attackLanes: [], build: 'compact442', tempo: 'low', press: 'high_local', risk: 'low', requires: ['protect_lead'], avoids: ['urgent_chase'] },
        Simeone_LowBlock_def5: { attackLanes: [], build: 'temporary_emergency_lock', tempo: 'very_low', press: 'very_low', risk: 'very_low', requires: ['mandatory_reassessment_next_window'], avoids: ['permanent_losing_state'] },
        Bielsa_ChaosPress_att5: { attackLanes: [], build: 'final_all_in', tempo: 'maximum', press: 'maximum', risk: 'maximum', requires: ['emergency_need_goal'], avoids: ['early_match'] }
    };

    const LADDERS = {
        defensive: ['Arteta_Control433_bal3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5', 'Pep_PressCooldown_bal2'],
        balance: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3'],
        attack: ['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5']
    };

    const HINT_RULES = [
        { id: 'late_goal_emergency', preset: 'Bielsa_ChaosPress_att5', decision: 'all_in_attack', risk: 'high', reason: 'проигрываем поздно — последняя all-in попытка', when: c => c.lateNeedGoal },
        { id: 'temporary_siege_lock', preset: 'Simeone_LowBlock_def5', decision: 'temporary_siege_lock', risk: 'high', reason: 'критическая осада без выхода — временно закрыть штрафную и переоценить следующий цикл', when: c => c.emergencyLockRequired || (c.underPressure && c.counterExitAvailable === false && (c.highBadActions || c.ownRedCard || Number(c.myPowerDropPct || 0) >= 5 || Number(c.pressureRisk || 0) >= 82)) },
        { id: 'late_protect_heavy_pressure', preset: 'Simeone_LowBlock_def5', decision: 'protect_lead', risk: 'high', reason: 'ведём после 80-й под тяжёлым давлением — аварийно закрыть штрафную', when: c => c.protectLead && c.underPressure && c.minute >= 80 },
        { id: 'own_press_fatigue_cooldown', preset: 'Pep_PressCooldown_bal2', decision: 'cooldown_press', risk: 'low', reason: 'растёт цена прессинга — снизить интенсивность и вернуть структуру', when: c => c.pressFatigueRisk && !c.lateNeedGoal },
        { id: 'protect_compact_442', preset: 'Simeone_Compact442_def4', decision: 'compact_protect', risk: 'medium', reason: 'ведём после 70-й — компактно защитить преимущество без полного автобуса', when: c => c.protectLead && c.minute >= 70 && !c.lateNeedGoal },
        { id: 'pressure_direct_counter', preset: 'Compact_Counter_def3', decision: 'direct_counter_exit', risk: 'medium', reason: 'давление соперника, но подтверждён первый выход — атаковать пространство за прессингом', when: c => (c.underPressure || c.transitionThreat || c.opponentHighPress) && c.counterExitAvailable === true && !c.lateNeedGoal },
        { id: 'pressure_control_escape', preset: 'Pep_BoxControl_bal2', decision: 'control_escape', risk: 'low', reason: 'давление соперника без подтверждённого outlet — разбить прессинг через контроль', when: c => (c.underPressure || c.transitionThreat || c.opponentHighPress) && c.counterExitAvailable === false && !c.lateNeedGoal },
        { id: 'bad_actions_control_reset', preset: 'Pep_BoxControl_bal2', decision: 'stabilize_control', risk: 'low', reason: 'высокий брак — короткий контрольный reset', when: c => c.highBadActions && !c.lateNeedGoal },
        { id: 'center_closed_wide_quality', preset: 'Conte_WingbackWidth_bal4', decision: 'use_width', risk: 'medium', reason: 'центр закрыт, но ширина доступна — растянуть блок без навесного all-in', when: c => c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous && !c.underPressure },
        { id: 'urgent_pressure_not_all_in', preset: 'Klopp_Gegenpress_att4', decision: 'urgent_pressure', risk: 'high', reason: 'нужен срочный рост давления, но all-in ещё не требуется', when: c => c.needGoal && c.minute >= 62 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat },
        { id: 'attacking_momentum_positional', preset: 'Pep_TwoThreeFive_att3', decision: 'maintain_pressure', risk: 'medium', reason: 'есть атакующий импульс — перейти к позиционной структуре 3-2-5', when: c => c.attackingMomentum && !c.underPressure && !c.transitionThreat },
        { id: 'need_goal_controlled_push', preset: 'Pep_ControlledPush_att3', decision: 'increase_attack', risk: 'medium', reason: 'нужен гол — добавить продвижение без all-in прессинга', when: c => c.needGoal && !c.underPressure && !c.highBadActions && !c.pressFatigueRisk },
        { id: 'standard_control_low_noise', preset: 'Arteta_Control433_bal3', decision: 'standard_control', risk: 'low', reason: 'нет сильного аварийного сигнала — держать структурный контроль', when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum },
        { id: 'safe_default_control', preset: 'Arteta_Control433_bal3', decision: 'hold_structure', risk: 'low', reason: 'нет надёжного сигнала для смены — сохранить структурный baseline', when: () => true }
    ];

    const DEFAULT_AUDIT_TIER = {
        primary: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3', 'Pep_TwoThreeFive_att3', 'Pep_PressCooldown_bal2'],
        conditional: ['Pep_ControlledPush_att3', 'Conte_WingbackWidth_bal4', 'Simeone_Compact442_def4'],
        restricted: ['Klopp_Gegenpress_att4'],
        emergency: ['Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'],
        removed: REMOVED_PRESET_NAMES.slice(),
        needsMoreData: [],
        experimental: [],
        blocked: []
    };

    function applyHintPolicy(auditTier = DEFAULT_AUDIT_TIER, rules = HINT_RULES) {
        if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return false;
        CurrentActionHintEngine.PRESET_AUDIT_TIER = Object.assign({}, auditTier, {
            primary: (auditTier.primary || []).slice(),
            conditional: (auditTier.conditional || []).slice(),
            restricted: (auditTier.restricted || []).slice(),
            emergency: (auditTier.emergency || []).slice(),
            removed: (auditTier.removed || []).slice(),
            needsMoreData: (auditTier.needsMoreData || []).slice(),
            experimental: (auditTier.experimental || []).slice(),
            blocked: (auditTier.blocked || []).slice()
        });
        CurrentActionHintEngine.HINT_RULES = (Array.isArray(rules) ? rules : []).slice();
        return true;
    }

    function choosePreset(state = {}) {
        const tags = Array.isArray(state.tags) ? state.tags : [];
        const has = tag => tags.includes(tag);
        const scoreState = state.score?.state || 'unknown';
        const minute = Number(state.minute || 0);
        const attackNeed = Number(state.attackNeed || 0);
        const myBad = Number(state.myBad || 0);
        const myPowerDropPct = Number(state.myPowerDropPct || 0);
        const xgGap = Number(state.oppXg || 0) - Number(state.myXg || 0);
        const xtGap = Number(state.oppXT || 0) - Number(state.myXT || 0);
        const underPressure = has('under_pressure') || xgGap > 0.45 || xtGap > 0.25;
        const transitionThreat = has('transition_threat') || xgGap > 0.65 || xtGap > 0.45;
        const counterExitAvailable = state.counterExitAvailable === true || has('counter_exit_available') || has('space_behind_press') || has('clean_first_pass');
        const counterExitBlocked = state.counterExitAvailable === false || has('counter_exit_blocked') || has('first_pass_trapped') || has('isolated_forward') || has('sustained_siege');
        const needGoal = scoreState === 'losing' && minute >= 45;
        const lateNeedGoal = scoreState === 'losing' && minute >= 78;
        const protectLead = scoreState === 'winning' && minute >= 65;
        const pressFatigue = state.pressFatigue?.active || has('press_fatigue_risk') || myPowerDropPct >= 4;
        const highBad = myBad >= 20 || has('high_bad_actions');
        const lowBad = myBad <= 16 || has('low_bad_actions');
        const ownCrossBad = has('own_open_play_crosses_bad') || has('own_crosses_bad_total');
        const wideQuality = has('attack_left') || has('attack_right') || has('wide_quality');
        const centerClosed = has('opponent_low_block') || has('center_closed');
        const opponentCrossesDangerous = has('opponent_crosses_dangerous');
        const attackingMomentum = has('attacking_momentum');
        const emergencyLockRequired = Boolean(
            underPressure && !counterExitAvailable &&
            (has('sustained_siege') || state.ownRedCard || highBad || myPowerDropPct >= 5 || Number(state.pressureRisk || 0) >= 82)
        );

        if (lateNeedGoal && attackNeed >= 72) return { name: 'Bielsa_ChaosPress_att5', reason: 'проигрываем поздно — безопасные ступени атаки уже недостаточны' };
        if (emergencyLockRequired) return { name: 'Simeone_LowBlock_def5', reason: 'критическая осада без подтверждённого выхода — временный lock на один цикл с обязательной переоценкой' };
        if (pressFatigue && !lateNeedGoal) return { name: 'Pep_PressCooldown_bal2', reason: 'цена прессинга растёт — снизить интенсивность и вернуть структуру' };
        if (protectLead && underPressure && minute >= 82) return { name: 'Simeone_LowBlock_def5', reason: 'ведём поздно под тяжёлым давлением — аварийно закрыть штрафную на один цикл' };
        if (protectLead) return { name: underPressure || opponentCrossesDangerous ? 'Simeone_Compact442_def4' : 'Arteta_Control433_bal3', reason: underPressure || opponentCrossesDangerous ? 'защитить преимущество компактным 4-4-2 без полного автобуса' : 'сохранить преимущество через структурный контроль' };
        if (centerClosed && wideQuality && !ownCrossBad && !opponentCrossesDangerous && !underPressure) return { name: 'Conte_WingbackWidth_bal4', reason: 'центр закрыт, а фланги доступны — растянуть блок контролируемой шириной' };
        if (underPressure || transitionThreat) {
            if (counterExitAvailable && !counterExitBlocked) return { name: 'Compact_Counter_def3', reason: 'подтверждён первый выход из-под давления — атаковать пространство за прессингом' };
            return { name: 'Pep_BoxControl_bal2', reason: 'давление без подтверждённого outlet — разбить прессинг через контроль' };
        }
        if (needGoal && minute >= 62 && attackNeed >= 52 && lowBad && !pressFatigue) return { name: 'Klopp_Gegenpress_att4', reason: 'нужен срочный рост давления — перейти к 4-2-4 gegenpress' };
        if (attackingMomentum && !transitionThreat) return { name: 'Pep_TwoThreeFive_att3', reason: 'есть атакующий импульс — дожимать позиционной структурой 3-2-5' };
        if (needGoal || attackNeed >= 38) return { name: 'Pep_ControlledPush_att3', reason: 'нужен более ранний рост атаки без all-in прессинга' };
        return { name: 'Arteta_Control433_bal3', reason: 'спокойный матч без сильного отрицательного сигнала — структурный контроль является baseline' };
    }

    const removeInactiveKeys = map => {
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(key => {
            if (!ACTIVE.has(key)) delete map[key];
        });
    };

    removeInactiveKeys(typeof BASE_PRESETS !== 'undefined' ? BASE_PRESETS : null);
    removeInactiveKeys(typeof BASE_LABELS !== 'undefined' ? BASE_LABELS : null);
    if (typeof BASE_PRESETS !== 'undefined') Object.assign(BASE_PRESETS, PRESETS);
    if (typeof BASE_LABELS !== 'undefined') Object.assign(BASE_LABELS, LABELS);

    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        TacticPresetLibrary.meta = Object.assign({}, META);
        TacticPresetLibrary.schemeStates = Object.assign({}, SCHEME_STATES);
        TacticPresetLibrary.presetSchemeState = Object.assign({}, PRESET_SCHEME_STATE);
        TacticPresetLibrary.traits = Object.assign({}, TRAITS);
    }

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
        RecommendationEngine.getPresetLadder = function getActivePresetLadder(group) {
            return (LADDERS[group] || []).slice();
        };
        RecommendationEngine.selectRawPreset = function selectDataDrivenPreset(snapshot, state = {}) {
            const candidate = choosePreset(state);
            return this.applyPresetDecisionFusion ? this.applyPresetDecisionFusion(candidate, state) : candidate;
        };
    }

    applyHintPolicy();

    if (typeof window !== 'undefined') {
        window.SLFActivePresetRegistry = {
            active: ACTIVE_PRESET_NAMES.slice(),
            removed: REMOVED_PRESET_NAMES.slice(),
            presets: Object.fromEntries(Object.entries(PRESETS).map(([name, preset]) => [name, Object.assign({}, preset, { priority: (preset.priority || []).slice() })])),
            labels: Object.assign({}, LABELS),
            meta: Object.fromEntries(Object.entries(META).map(([name, meta]) => [name, Object.assign({}, meta)])),
            schemeStates: Object.assign({}, SCHEME_STATES),
            presetSchemeState: Object.assign({}, PRESET_SCHEME_STATE),
            traits: Object.fromEntries(Object.entries(TRAITS).map(([name, traits]) => [name, Object.assign({}, traits, { attackLanes: (traits.attackLanes || []).slice(), requires: (traits.requires || []).slice(), avoids: (traits.avoids || []).slice() })])),
            ladders: Object.fromEntries(Object.entries(LADDERS).map(([group, names]) => [group, names.slice()])),
            displayMeta: Object.fromEntries(Object.entries(DISPLAY_META).map(([name, meta]) => [name, Object.assign({}, meta)])),
            displayOrder: DISPLAY_ORDER.slice(),
            styleGroups: STYLE_GROUPS.map(group => Object.assign({}, group)),
            fallbackPolicy: '5.61-pressure-response-v6-aligned',
            choosePreset,
            applyHintPolicy
        };
    }
})();
