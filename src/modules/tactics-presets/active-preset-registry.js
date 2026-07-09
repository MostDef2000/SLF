// Active Tactical Preset Registry
// ============================================================
// Single runtime source for the active tactical preset set.
// Henta is not a separate subsystem here: only Henta_LeftTrap_att3
// remains as one normal preset in the common preset library.
// build_temp means verticality of ball progression, not passing speed:
// 1 = patient/horizontal, 2 = moderate, 3 = active verticality,
// 4 = release/direct progression, 5 = emergency rush.

(function activeTacticalPresetRegistry() {
    'use strict';

    const ACTIVE_PRESET_NAMES = [
        'Arteta_Control433_bal3',
        'Simeone_LowBlock_def5',
        'Simeone_Compact442_def4',
        'Mourinho_WeakSide_def3',
        'Pep_BoxControl_bal2',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Pep_PressCooldown_bal2',
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3',
        'DeZerbi_BaitPress_bal3',
        'DeZerbi_Release_att4',
        'Conte_WingbackWidth_bal4',
        'Compact_Counter_def3',
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5',
        'Henta_LeftTrap_att3'
    ];

    const ACTIVE = new Set(['standard', ...ACTIVE_PRESET_NAMES]);

    const PRESETS = {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '4', pass_risk: '3', dribble: '2', cross: '2', corner: '1', shot: '2', priority: ['center', 'right'] },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '2', build_type: '1', build_temp: '1', build_long: '2', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['right'] },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '3', build_type: '2', build_temp: '1', build_long: '2', build_fast: '1', style: '2', pass_risk: '2', dribble: '1', cross: '2', corner: '1', shot: '1', priority: ['left', 'right'] },
        Mourinho_WeakSide_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '3', style: '2', pass_risk: '2', dribble: '2', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['center'] },
        Pep_ControlledPush_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2', priority: ['center'] },
        Pep_TwoThreeFive_att3: { def_line: '3', press_line: '3', def_width: '3', press_intense: '4', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '5', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: ['center'] },
        Pep_PressCooldown_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['center', 'right'] },
        Xabi_BoxMidfield_bal3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        Xabi_VerticalBox_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '2', build_fast: '3', style: '4', pass_risk: '4', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        DeZerbi_BaitPress_bal3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '1', build_temp: '1', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        DeZerbi_Release_att4: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '1', build_temp: '4', build_long: '2', build_fast: '4', style: '4', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: ['center', 'right'] },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '2', build_temp: '2', build_long: '2', build_fast: '3', style: '3', pass_risk: '3', dribble: '3', cross: '4', corner: '1', shot: '2', priority: ['left', 'right'] },
        Compact_Counter_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '4', style: '3', pass_risk: '2', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Klopp_Gegenpress_att4: { def_line: '3', press_line: '4', def_width: '3', press_intense: '5', build_type: '3', build_temp: '4', build_long: '2', build_fast: '4', style: '5', pass_risk: '4', dribble: '4', cross: '3', corner: '1', shot: '3', priority: ['left', 'right'] },
        Nagelsmann_WidePress_att4: { def_line: '3', press_line: '4', def_width: '4', press_intense: '5', build_type: '3', build_temp: '4', build_long: '2', build_fast: '4', style: '5', pass_risk: '4', dribble: '4', cross: '4', corner: '1', shot: '3', priority: ['left', 'right'] },
        Bielsa_ChaosPress_att5: { def_line: '4', press_line: '5', def_width: '4', press_intense: '5', build_type: '3', build_temp: '5', build_long: '3', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '4', corner: '1', shot: '4', priority: ['left', 'center', 'right'] },
        Henta_LeftTrap_att3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '4', build_type: '1', build_temp: '2', build_long: '3', build_fast: '3', style: '3', pass_risk: '2', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left'] }
    };

    const LABELS = {
        Arteta_Control433_bal3: 'Arteta Control 4-3-3',
        Simeone_LowBlock_def5: 'Simeone Low Block',
        Simeone_Compact442_def4: 'Simeone Compact 4-4-2',
        Mourinho_WeakSide_def3: 'Mourinho Weak Side',
        Pep_BoxControl_bal2: 'Pep Box Control',
        Pep_ControlledPush_att3: 'Pep Controlled Push',
        Pep_TwoThreeFive_att3: 'Pep Positional Attack',
        Pep_PressCooldown_bal2: 'Pep Press Cooldown',
        Xabi_BoxMidfield_bal3: 'Xabi Box Midfield',
        Xabi_VerticalBox_att3: 'Xabi Vertical Box',
        DeZerbi_BaitPress_bal3: 'De Zerbi Bait Press',
        DeZerbi_Release_att4: 'De Zerbi Release',
        Conte_WingbackWidth_bal4: 'Conte Wingback Width',
        Compact_Counter_def3: 'Compact Counter',
        Klopp_Gegenpress_att4: 'Klopp Gegenpress',
        Nagelsmann_WidePress_att4: 'Nagelsmann Wide Press',
        Bielsa_ChaosPress_att5: 'Bielsa Chaos Press',
        Henta_LeftTrap_att3: 'Henta Left Trap'
    };

    const META = {
        Arteta_Control433_bal3: { group: 'balance', rank: 3, title: 'Arteta Control 4-3-3', idea: 'позиционный контроль с более высокой структурой, чем safe box-control', use: 'равная игра, нужен контроль без ухода в пассивность', risk: 'может быть нейтрально, если нужен быстрый гол' },
        Simeone_LowBlock_def5: { group: 'defensive', rank: 5, title: 'Simeone Low Block', idea: 'максимально низкий и компактный блок', use: 'ведём поздно, соперник давит, нужно пережить отрезок', risk: 'можно полностью отдать инициативу' },
        Simeone_Compact442_def4: { group: 'defensive', rank: 4, title: 'Simeone Compact 4-4-2', idea: 'компактная защита без полного автобуса', use: 'ведём или нас прижимают, но нужен выход через фланги', risk: 'давление может накопиться, если не выходить из блока' },
        Mourinho_WeakSide_def3: { group: 'defensive', rank: 3, title: 'Mourinho Weak Side', idea: 'низкий/средний блок и быстрый выход в слабую сторону', use: 'соперник давит и оставляет слабый фланг или пространство', risk: 'без первого паса контратаки сорвутся' },
        Pep_BoxControl_bal2: { group: 'balance', rank: 2, title: 'Pep Box Control', idea: 'снизить хаос и держать безопасный контроль', use: 'высокий брак, нужно стабилизировать игру', risk: 'против высокого прессинга можно застрять' },
        Pep_ControlledPush_att3: { group: 'attack', rank: 3, title: 'Pep Controlled Push', idea: 'усилить атаку без all-in', use: 'нужен гол, но нас не давят', risk: 'при браке усиление превратится в потери' },
        Pep_TwoThreeFive_att3: { group: 'attack', rank: 3, title: 'Pep Positional Attack', idea: 'позиционно дожимать и держать территорию', use: 'есть attacking momentum и transition guard', risk: 'опасно против быстрых контратак' },
        Pep_PressCooldown_bal2: { group: 'balance', rank: 2, title: 'Pep Press Cooldown', idea: 'снизить цену прессинга и вернуть структуру', use: 'растёт усталость/брак/цена прессинга', risk: 'может не хватить давления при срочном голе' },
        Xabi_BoxMidfield_bal3: { group: 'balance', rank: 3, title: 'Xabi Box Midfield', idea: 'перегруз центра и контроль переходов', use: 'центр доступен, брак низкий, нужна середина', risk: 'при закрытом центре игра упрётся в блок' },
        Xabi_VerticalBox_att3: { group: 'attack', rank: 3, title: 'Xabi Vertical Box', idea: 'вертикальный вход между линиями через центр', use: 'центр доступен и нужен более быстрый вход', risk: 'против прессинга и брака даст потери' },
        DeZerbi_BaitPress_bal3: { group: 'balance', rank: 3, title: 'De Zerbi Bait Press', idea: 'заманить высокий прессинг и раскрыть линии', use: 'соперник высоко прессингует, у нас есть качество паса', risk: 'слабая первая линия может привезти момент' },
        DeZerbi_Release_att4: { group: 'attack', rank: 4, title: 'De Zerbi Release', idea: 'вертикально выпускать атаку за прессинг', use: 'есть пространство за линией соперника', risk: 'если пространства нет, риск паса пустой' },
        Conte_WingbackWidth_bal4: { group: 'balance', rank: 4, title: 'Conte Wingback Width', idea: 'растянуть блок через фланги/wingbacks', use: 'центр закрыт, ширина доступна', risk: 'слабые фланги дадут навесной шум' },
        Compact_Counter_def3: { group: 'defensive', rank: 3, title: 'Compact Counter', idea: 'закрыть переходы и оставить быстрый выход', use: 'нас давят или опасны переходы', risk: 'можно потерять устойчивое давление' },
        Klopp_Gegenpress_att4: { group: 'attack', rank: 4, title: 'Klopp Gegenpress', idea: 'высокое давление и быстрый возврат мяча', use: 'нужен срочный прессинг, но ещё не all-in', risk: 'усталость, фолы, пространство за спиной' },
        Nagelsmann_WidePress_att4: { group: 'attack', rank: 4, title: 'Nagelsmann Wide Press', idea: 'широкий прессинг и атака через фланги', use: 'центр закрыт, но есть wide advantage', risk: 'без флангового качества станет предсказуемо' },
        Bielsa_ChaosPress_att5: { group: 'attack', rank: 5, title: 'Bielsa Chaos Press', idea: 'максимальная вертикальность и давление ради спасения', use: '80+ минута, проигрываем, нужна последняя попытка', risk: 'может развалить оборону' },
        Henta_LeftTrap_att3: { group: 'henta', rank: 3, title: 'Henta Left Trap', idea: 'низкий блок, агрессивный отбор и левофланговая ловушка', use: 'слабый правый фланг соперника или сильный левый фланг у нас', risk: 'перекос влево может стать читаемым' }
    };

    const SCHEME_STATES = {
        standard_base: '4-2-3-1 standard / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        Arteta_Control433_bal3: '4-3-3 control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Simeone_LowBlock_def5: '5-4-1 low block / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Mourinho_WeakSide_def3: '4-1-4-1 weak side / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Pep_BoxControl_bal2: '4-2-2-2 box control / GK-LD-CD1-CD3-RD / DM2-CM2 / AM1-AM2 / ST1-ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Pep_TwoThreeFive_att3: '2-3-5 positional / GK-CD1-CD3 / LD-DM2-RD / LW-AM1-ST2-AM2-RW',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Xabi_BoxMidfield_bal3: '3-2-4-1 box midfield / GK-CD1-CD2-CD3 / DM2-CM2 / LM-AM1-AM2-RM / ST2',
        Xabi_VerticalBox_att3: '3-4-2-1 vertical box / GK-CD1-CD2-CD3 / LM-DM2-CM2-RM / AM1-AM2 / ST2',
        DeZerbi_BaitPress_bal3: '4-2-4 bait press / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        DeZerbi_Release_att4: '3-2-2-3 release / GK-CD1-CD2-CD3 / DM2-CM2 / AM1-AM2 / LW-ST2-RW',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LWB-DM2-CM2-RWB / LW-ST2-RW',
        Compact_Counter_def3: '4-5-1 compact counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        Klopp_Gegenpress_att4: '4-3-3 gegenpress / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Nagelsmann_WidePress_att4: '4-2-4 wide press / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Bielsa_ChaosPress_att5: '3-3-4 chaos press / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW',
        Henta_LeftTrap_att3: '4-5-1 left trap / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2'
    };

    const PRESET_SCHEME_STATE = Object.fromEntries(ACTIVE_PRESET_NAMES.map(name => [name, name]));
    PRESET_SCHEME_STATE.standard = 'standard_base';

    const TRAITS = {
        Arteta_Control433_bal3: { attackLanes: ['center', 'right'], build: 'control433', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['low_noise'], avoids: ['late_emergency_chase'] },
        Simeone_LowBlock_def5: { attackLanes: ['right'], build: 'low_block', tempo: 'low', press: 'low', risk: 'very_low', requires: ['protect_lead'], avoids: ['need_goal'] },
        Simeone_Compact442_def4: { attackLanes: ['left', 'right'], build: 'compact442', tempo: 'low', press: 'medium', risk: 'low', requires: ['defensive_stability'], avoids: ['urgent_chase'] },
        Mourinho_WeakSide_def3: { attackLanes: ['left', 'right'], build: 'weak_side_counter', tempo: 'medium', press: 'medium', risk: 'low_medium', requires: ['space_behind_or_weak_side'], avoids: ['no_outlet'] },
        Pep_BoxControl_bal2: { attackLanes: ['center'], build: 'box_control', tempo: 'low', press: 'medium_low', risk: 'low', requires: ['need_stability'], avoids: ['urgent_chase'] },
        Pep_ControlledPush_att3: { attackLanes: ['center'], build: 'controlled_push', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['need_goal'], avoids: ['high_bad_actions'] },
        Pep_TwoThreeFive_att3: { attackLanes: ['center'], build: 'positional_attack', tempo: 'medium_high', press: 'medium_high', risk: 'medium_high', requires: ['attacking_momentum'], avoids: ['transition_threat'] },
        Pep_PressCooldown_bal2: { attackLanes: ['center', 'right'], build: 'cooldown', tempo: 'medium', press: 'medium_low', risk: 'low', requires: ['press_fatigue'], avoids: ['emergency_chase'] },
        Xabi_BoxMidfield_bal3: { attackLanes: ['center'], build: 'box_midfield', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['center_weak'], avoids: ['center_closed'] },
        Xabi_VerticalBox_att3: { attackLanes: ['center'], build: 'vertical_box', tempo: 'medium_high', press: 'medium', risk: 'medium_high', requires: ['center_available'], avoids: ['high_bad_actions'] },
        DeZerbi_BaitPress_bal3: { attackLanes: ['center'], build: 'bait_press', tempo: 'low_medium', press: 'medium_low', risk: 'medium', requires: ['opponent_high_press'], avoids: ['high_bad_actions'] },
        DeZerbi_Release_att4: { attackLanes: ['center', 'right'], build: 'release_space', tempo: 'high', press: 'medium_high', risk: 'high', requires: ['space_behind'], avoids: ['no_space_behind'] },
        Conte_WingbackWidth_bal4: { attackLanes: ['left', 'right'], build: 'wingback_width', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['wide_quality'], avoids: ['own_crosses_bad'] },
        Compact_Counter_def3: { attackLanes: ['left', 'right'], build: 'compact_counter', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['under_pressure'], avoids: ['sustained_positional_attack_needed'] },
        Klopp_Gegenpress_att4: { attackLanes: ['left', 'right'], build: 'gegenpress', tempo: 'high', press: 'high', risk: 'high', requires: ['need_pressure'], avoids: ['press_fatigue'] },
        Nagelsmann_WidePress_att4: { attackLanes: ['left', 'right'], build: 'wide_press', tempo: 'high', press: 'high', risk: 'high', requires: ['wide_advantage'], avoids: ['weak_flanks'] },
        Bielsa_ChaosPress_att5: { attackLanes: ['left', 'center', 'right'], build: 'chaos_press', tempo: 'very_high', press: 'very_high', risk: 'very_high', requires: ['emergency_need_goal'], avoids: ['early_match'] },
        Henta_LeftTrap_att3: { attackLanes: ['left'], build: 'left_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['left_lane_attack'], avoids: ['left_lane_blocked'] }
    };

    const LADDERS = {
        defensive: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
        balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Arteta_Control433_bal3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'Conte_WingbackWidth_bal4'],
        attack: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'DeZerbi_Release_att4', 'Bielsa_ChaosPress_att5'],
        henta: ['Henta_LeftTrap_att3']
    };

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
    }

    if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine) {
        CurrentActionHintEngine.PRESET_AUDIT_TIER = {
            primary: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4', 'Pep_PressCooldown_bal2', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3'],
            restricted: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'DeZerbi_Release_att4', 'Henta_LeftTrap_att3'],
            emergency: ['Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'],
            needsMoreData: [],
            experimental: [],
            blocked: []
        };
    }

    if (typeof window !== 'undefined') {
        window.SLFActivePresetRegistry = { active: ACTIVE_PRESET_NAMES.slice(), labels: Object.assign({}, LABELS), ladders: Object.assign({}, LADDERS) };
    }
})();