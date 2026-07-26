// Active Tactical Preset Registry
// ============================================================
// Data-driven runtime source for the active tactical preset set.
// The library is intentionally small: one stable baseline, guarded context
// presets, controlled escalation, and two emergency endpoints.
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
        'Xabi_BoxMidfield_bal3',
        'Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5',
        'Bielsa_ChaosPress_att5'
    ];

    const ACTIVE = new Set(['standard', ...ACTIVE_PRESET_NAMES]);

    const PRESETS = {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '4', pass_risk: '3', dribble: '2', cross: '2', corner: '1', shot: '2', priority: [] },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: [] },
        Pep_PressCooldown_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: [] },
        Compact_Counter_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '4', style: '3', pass_risk: '2', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Pep_ControlledPush_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2', priority: ['left', 'right'] },
        Pep_TwoThreeFive_att3: { def_line: '2', press_line: '3', def_width: '3', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '5', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: ['left', 'right'] },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '2', build_temp: '2', build_long: '2', build_fast: '2', style: '3', pass_risk: '3', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Xabi_BoxMidfield_bal3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        Klopp_Gegenpress_att4: { def_line: '3', press_line: '4', def_width: '3', press_intense: '4', build_type: '3', build_temp: '3', build_long: '2', build_fast: '3', style: '5', pass_risk: '3', dribble: '3', cross: '3', corner: '1', shot: '3', priority: ['left', 'right'] },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '3', build_type: '2', build_temp: '1', build_long: '2', build_fast: '1', style: '2', pass_risk: '2', dribble: '1', cross: '2', corner: '1', shot: '1', priority: ['left', 'right'] },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '2', build_type: '1', build_temp: '1', build_long: '2', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['right'] },
        Bielsa_ChaosPress_att5: { def_line: '4', press_line: '5', def_width: '4', press_intense: '5', build_type: '3', build_temp: '3', build_long: '3', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '4', corner: '1', shot: '4', priority: ['left', 'right'] }
    };

    const LABELS = {
        Arteta_Control433_bal3: 'Arteta Control 4-3-3',
        Pep_BoxControl_bal2: 'Pep Box Control',
        Pep_PressCooldown_bal2: 'Pep Press Cooldown',
        Compact_Counter_def3: 'Compact Counter',
        Pep_ControlledPush_att3: 'Pep Controlled Push',
        Pep_TwoThreeFive_att3: 'Pep Positional Attack',
        Conte_WingbackWidth_bal4: 'Conte Wingback Width',
        Xabi_BoxMidfield_bal3: 'Xabi Box Midfield',
        Klopp_Gegenpress_att4: 'Klopp Gegenpress',
        Simeone_Compact442_def4: 'Simeone Compact 4-4-2',
        Simeone_LowBlock_def5: 'Simeone Low Block',
        Bielsa_ChaosPress_att5: 'Bielsa Chaos Press'
    };

    const META = {
        Arteta_Control433_bal3: { group: 'balance', rank: 3, title: LABELS.Arteta_Control433_bal3, idea: 'основной структурный контроль без принудительного направления атаки', use: 'равная игра без сильного аварийного сигнала', risk: 'может быть слишком нейтрально, когда уже нужен гол' },
        Pep_BoxControl_bal2: { group: 'balance', rank: 2, title: LABELS.Pep_BoxControl_bal2, idea: 'снизить хаос и стабилизировать владение', use: 'высокий брак, оба канала недобирают или нужен короткий reset', risk: 'может стать стерильным против активного прессинга' },
        Pep_PressCooldown_bal2: { group: 'balance', rank: 2, title: LABELS.Pep_PressCooldown_bal2, idea: 'снизить цену прессинга и вернуть структуру', use: 'растут усталость, фолы или брак после давления', risk: 'не подходит для финальной погони за голом' },
        Compact_Counter_def3: { group: 'defensive', rank: 3, title: LABELS.Compact_Counter_def3, idea: 'закрыть переходы и сохранить быстрый выход', use: 'соперник опаснее, давит или угрожает контратаками', risk: 'можно потерять устойчивое территориальное давление' },
        Pep_ControlledPush_att3: { group: 'attack', rank: 3, title: LABELS.Pep_ControlledPush_att3, idea: 'добавить продвижение без all-in прессинга', use: 'нужен гол, но структура обороны ещё работает', risk: 'при высоком браке усиление превращается в потери' },
        Pep_TwoThreeFive_att3: { group: 'attack', rank: 4, title: LABELS.Pep_TwoThreeFive_att3, idea: 'позиционно дожимать при сохранённом transition guard', use: 'есть атакующий импульс и соперник не угрожает быстрыми переходами', risk: 'увеличивает встречную активность соперника' },
        Conte_WingbackWidth_bal4: { group: 'balance', rank: 4, title: LABELS.Conte_WingbackWidth_bal4, idea: 'растянуть закрытый центр через фланги без навесного all-in', use: 'центр закрыт, фланги сильны, кроссы не проваливаются', risk: 'без качества на флангах создаёт шум и открывает переходы' },
        Xabi_BoxMidfield_bal3: { group: 'balance', rank: 3, title: LABELS.Xabi_BoxMidfield_bal3, idea: 'точечный перегруз слабого центра соперника', use: 'центр действительно доступен и брак низкий', risk: 'при закрытом центре даст стерильное владение и обрезы' },
        Klopp_Gegenpress_att4: { group: 'attack', rank: 4, title: LABELS.Klopp_Gegenpress_att4, idea: 'срочно поднять давление без перехода в полный хаос', use: 'проигрываем поздно, брак низкий, усталость и transition risk контролируются', risk: 'фолы, усталость и пространство за высокой линией' },
        Simeone_Compact442_def4: { group: 'defensive', rank: 4, title: LABELS.Simeone_Compact442_def4, idea: 'компактно защищать преимущество без полного автобуса', use: 'ведём после 70-й и давление соперника растёт', risk: 'при слишком раннем включении отдаёт инициативу' },
        Simeone_LowBlock_def5: { group: 'defensive', rank: 5, title: LABELS.Simeone_LowBlock_def5, idea: 'аварийно закрыть штрафную и пережить концовку', use: 'ведём после 80-й под тяжёлым давлением', risk: 'полностью отдаёт инициативу и выход из обороны' },
        Bielsa_ChaosPress_att5: { group: 'attack', rank: 5, title: LABELS.Bielsa_ChaosPress_att5, idea: 'последняя all-in попытка спасти матч', use: 'проигрываем после 80-й и безопасные варианты уже недостаточны', risk: 'может окончательно разрушить оборонительную структуру' }
    };

    const SCHEME_STATES = {
        standard_base: '4-2-3-1 standard / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        Arteta_Control433_bal3: '4-3-3 control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Pep_BoxControl_bal2: '4-2-2-2 box control / GK-LD-CD1-CD3-RD / DM2-CM2 / AM1-AM2 / ST1-ST2',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Compact_Counter_def3: '4-5-1 compact counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Pep_TwoThreeFive_att3: '4-2-3-1 positional / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LWB-DM2-CM2-RWB / LW-ST2-RW',
        Xabi_BoxMidfield_bal3: '3-2-4-1 box midfield / GK-CD1-CD2-CD3 / DM2-CM2 / LM-AM1-AM2-RM / ST2',
        Klopp_Gegenpress_att4: '4-3-3 gegenpress / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Simeone_LowBlock_def5: '5-4-1 low block / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Bielsa_ChaosPress_att5: '3-3-4 chaos press / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW'
    };

    const PRESET_SCHEME_STATE = Object.fromEntries(ACTIVE_PRESET_NAMES.map(name => [name, name]));
    PRESET_SCHEME_STATE.standard = 'standard_base';

    const TRAITS = {
        Arteta_Control433_bal3: { attackLanes: [], build: 'control433', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['low_noise'], avoids: ['late_emergency_chase'] },
        Pep_BoxControl_bal2: { attackLanes: [], build: 'box_control', tempo: 'low', press: 'medium_low', risk: 'low', requires: ['need_stability'], avoids: ['urgent_chase', 'opponent_high_press'] },
        Pep_PressCooldown_bal2: { attackLanes: [], build: 'cooldown', tempo: 'medium', press: 'medium_low', risk: 'low', requires: ['press_fatigue'], avoids: ['emergency_chase'] },
        Compact_Counter_def3: { attackLanes: ['left', 'right'], build: 'compact_counter', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['under_pressure'], avoids: ['sustained_positional_attack_needed'] },
        Pep_ControlledPush_att3: { attackLanes: ['left', 'right'], build: 'controlled_push', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['need_goal'], avoids: ['high_bad_actions', 'transition_threat'] },
        Pep_TwoThreeFive_att3: { attackLanes: ['left', 'right'], build: 'positional_attack', tempo: 'medium_high', press: 'medium', risk: 'medium_high', requires: ['attacking_momentum'], avoids: ['transition_threat', 'under_pressure'] },
        Conte_WingbackWidth_bal4: { attackLanes: ['left', 'right'], build: 'wingback_width', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['wide_quality'], avoids: ['own_crosses_bad', 'opponent_crosses_dangerous'] },
        Xabi_BoxMidfield_bal3: { attackLanes: ['center'], build: 'box_midfield', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['center_weak'], avoids: ['center_closed', 'high_bad_actions', 'under_pressure'] },
        Klopp_Gegenpress_att4: { attackLanes: ['left', 'right'], build: 'gegenpress', tempo: 'high', press: 'high', risk: 'high', requires: ['need_pressure'], avoids: ['press_fatigue', 'high_bad_actions', 'transition_threat'] },
        Simeone_Compact442_def4: { attackLanes: ['left', 'right'], build: 'compact442', tempo: 'low', press: 'medium', risk: 'low', requires: ['protect_lead'], avoids: ['urgent_chase'] },
        Simeone_LowBlock_def5: { attackLanes: ['right'], build: 'low_block', tempo: 'low', press: 'low', risk: 'very_low', requires: ['protect_lead_heavy_pressure'], avoids: ['need_goal'] },
        Bielsa_ChaosPress_att5: { attackLanes: ['left', 'right'], build: 'chaos_press', tempo: 'very_high', press: 'very_high', risk: 'very_high', requires: ['emergency_need_goal'], avoids: ['early_match'] }
    };

    const LADDERS = {
        defensive: ['Compact_Counter_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
        balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Arteta_Control433_bal3'],
        attack: ['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5']
    };

    const HINT_RULES = [
        { id: 'late_goal_emergency', preset: 'Bielsa_ChaosPress_att5', decision: 'all_in_attack', risk: 'high', reason: 'проигрываем после 80-й — последняя all-in попытка', when: c => c.lateNeedGoal },
        { id: 'late_protect_heavy_pressure', preset: 'Simeone_LowBlock_def5', decision: 'protect_lead', risk: 'high', reason: 'ведём после 80-й под тяжёлым давлением — закрыть штрафную', when: c => c.protectLead && c.underPressure && c.minute >= 80 },
        { id: 'protect_compact_442', preset: 'Simeone_Compact442_def4', decision: 'compact_protect', risk: 'medium', reason: 'ведём после 70-й — компактно защитить преимущество без полного автобуса', when: c => c.protectLead && c.minute >= 70 && !c.lateNeedGoal },
        { id: 'own_press_fatigue_cooldown', preset: 'Pep_PressCooldown_bal2', decision: 'cooldown_press', risk: 'low', reason: 'растёт цена прессинга — снизить интенсивность и вернуть структуру', when: c => c.pressFatigueRisk && !c.lateNeedGoal },
        { id: 'bad_actions_control_reset', preset: 'Pep_BoxControl_bal2', decision: 'stabilize_control', risk: 'low', reason: 'высокий брак — короткий контрольный reset', when: c => c.highBadActions && !c.lateNeedGoal },
        { id: 'under_pressure_counter', preset: 'Compact_Counter_def3', decision: 'defensive_reset', risk: 'medium', reason: 'соперник опаснее или угрожает переходами — закрыть зоны и сохранить быстрый выход', when: c => (c.underPressure || c.transitionThreat || c.opponentHighPress) && !c.lateNeedGoal },
        { id: 'center_closed_wide_quality', preset: 'Conte_WingbackWidth_bal4', decision: 'use_width', risk: 'medium', reason: 'центр закрыт, но ширина доступна — растянуть блок без навесного all-in', when: c => c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous && !c.underPressure },
        { id: 'center_weak_box_midfield', preset: 'Xabi_BoxMidfield_bal3', decision: 'attack_center', risk: 'medium', reason: 'центр соперника слаб и брак низкий — точечно перегрузить середину', when: c => c.centerWeak && !c.centerClosed && !c.highBadActions && !c.underPressure },
        { id: 'urgent_pressure_not_all_in', preset: 'Klopp_Gegenpress_att4', decision: 'urgent_pressure', risk: 'high', reason: 'после 70-й нужен срочный рост давления, но all-in ещё не требуется', when: c => c.needGoal && c.minute >= 70 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat },
        { id: 'attacking_momentum_positional', preset: 'Pep_TwoThreeFive_att3', decision: 'maintain_pressure', risk: 'medium', reason: 'есть атакующий импульс — дожимать позиционно при безопасных переходах', when: c => c.attackingMomentum && !c.underPressure && !c.transitionThreat },
        { id: 'need_goal_controlled_push', preset: 'Pep_ControlledPush_att3', decision: 'increase_attack', risk: 'medium', reason: 'нужен гол — добавить продвижение без all-in и высокого прессинга', when: c => c.needGoal && !c.underPressure && !c.highBadActions && !c.pressFatigueRisk },
        { id: 'standard_control_low_noise', preset: 'Arteta_Control433_bal3', decision: 'standard_control', risk: 'low', reason: 'нет сильного аварийного сигнала — держать структурный контроль', when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum },
        { id: 'safe_default_control', preset: 'Pep_BoxControl_bal2', decision: 'hold_control', risk: 'low', reason: 'нет надёжного сигнала для более рискованной смены — стабилизировать игру', when: () => true }
    ];

    function choosePreset(state = {}) {
        const tags = Array.isArray(state.tags) ? state.tags : [];
        const has = tag => tags.includes(tag);
        const scoreState = state.score?.state || 'unknown';
        const minute = Number(state.minute || 0);
        const myBad = Number(state.myBad || 0);
        const xgGap = Number(state.oppXg || 0) - Number(state.myXg || 0);
        const xtGap = Number(state.oppXT || 0) - Number(state.myXT || 0);
        const underPressure = has('under_pressure') || xgGap > 0.45 || xtGap > 0.25;
        const transitionThreat = has('transition_threat') || xgGap > 0.65 || xtGap > 0.45;
        const needGoal = scoreState === 'losing' && minute >= 55;
        const lateNeedGoal = scoreState === 'losing' && minute >= 80;
        const protectLead = scoreState === 'winning' && minute >= 70;
        const pressFatigue = state.pressFatigue?.active || has('press_fatigue_risk');
        const highBad = myBad >= 20 || has('high_bad_actions');
        const lowBad = myBad > 0 && myBad <= 16 || has('low_bad_actions');
        const ownCrossBad = has('own_open_play_crosses_bad') || has('own_crosses_bad_total');
        const wideQuality = has('attack_left') || has('attack_right') || has('wide_quality');
        const centerWeak = has('center_weak');
        const centerClosed = has('opponent_low_block') || has('center_closed');
        const opponentCrossesDangerous = has('opponent_crosses_dangerous');
        const attackingMomentum = has('attacking_momentum');

        if (lateNeedGoal) return { name: 'Bielsa_ChaosPress_att5', reason: 'проигрываем после 80-й — безопасные варианты уже недостаточны' };
        if (protectLead && underPressure && minute >= 80) return { name: 'Simeone_LowBlock_def5', reason: 'ведём поздно под тяжёлым давлением — аварийно закрыть штрафную' };
        if (protectLead) return { name: underPressure || opponentCrossesDangerous ? 'Simeone_Compact442_def4' : 'Pep_BoxControl_bal2', reason: underPressure || opponentCrossesDangerous ? 'защитить преимущество компактным блоком без полного автобуса' : 'сохранить преимущество через контроль и низкий риск' };
        if (pressFatigue) return { name: 'Pep_PressCooldown_bal2', reason: 'цена прессинга растёт — снизить интенсивность и вернуть структуру' };
        if (highBad) return { name: 'Pep_BoxControl_bal2', reason: 'высокий брак — сначала стабилизировать розыгрыш' };
        if (transitionThreat || underPressure) return { name: 'Compact_Counter_def3', reason: 'соперник опаснее по текущим метрикам — закрыть переходы и сохранить быстрый выход' };
        if (centerClosed && wideQuality && !ownCrossBad && !opponentCrossesDangerous) return { name: 'Conte_WingbackWidth_bal4', reason: 'центр закрыт, а фланги доступны — растянуть блок контролируемой шириной' };
        if (centerWeak && lowBad) return { name: 'Xabi_BoxMidfield_bal3', reason: 'центр соперника слаб и брак низкий — точечный перегруз середины' };
        if (needGoal && minute >= 70 && lowBad) return { name: 'Klopp_Gegenpress_att4', reason: 'после 70-й нужен срочный рост давления, но ещё не all-in' };
        if (attackingMomentum && !transitionThreat) return { name: 'Pep_TwoThreeFive_att3', reason: 'есть атакующий импульс — дожимать позиционно при контролируемых переходах' };
        if (needGoal) return { name: 'Pep_ControlledPush_att3', reason: 'нужен гол — добавить продвижение без all-in прессинга' };
        return { name: 'Arteta_Control433_bal3', reason: 'спокойный матч без сильного отрицательного сигнала — структурный контроль является лучшим baseline' };
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

    if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine) {
        CurrentActionHintEngine.PRESET_AUDIT_TIER = {
            primary: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3', 'Pep_TwoThreeFive_att3', 'Pep_PressCooldown_bal2'],
            conditional: ['Pep_ControlledPush_att3', 'Conte_WingbackWidth_bal4', 'Xabi_BoxMidfield_bal3', 'Simeone_Compact442_def4'],
            restricted: ['Klopp_Gegenpress_att4'],
            emergency: ['Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'],
            removed: ['Mourinho_WeakSide_def3', 'Xabi_VerticalBox_att3', 'DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Nagelsmann_WidePress_att4', 'Henta_LeftTrap_att3'],
            needsMoreData: [],
            experimental: [],
            blocked: []
        };
        CurrentActionHintEngine.HINT_RULES = HINT_RULES.slice();
    }

    if (typeof window !== 'undefined') {
        window.SLFActivePresetRegistry = {
            active: ACTIVE_PRESET_NAMES.slice(),
            removed: ['Mourinho_WeakSide_def3', 'Xabi_VerticalBox_att3', 'DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Nagelsmann_WidePress_att4', 'Henta_LeftTrap_att3'],
            labels: Object.assign({}, LABELS),
            ladders: Object.assign({}, LADDERS),
            choosePreset
        };
    }
})();
