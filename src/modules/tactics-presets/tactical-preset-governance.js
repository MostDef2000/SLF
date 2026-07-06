// Tactical Preset Governance
// ============================================================
// Runtime source-of-truth overlay for active tactical presets.
//
// Goals:
// - keep only Henta_LeftTrap_att3 from Henta variants;
// - keep every active preset on a unique scheme state;
// - add field situations for every active preset so the on-demand hint
//   engine can recommend each scheme when its context appears.

(function tacticalPresetGovernance() {
    'use strict';

    const KEEP_HENTA = 'Henta_LeftTrap_att3';
    const REMOVED_HENTA = [
        'Henta_Hold_def3',
        'Henta_RightTrap_att3',
        'Henta_WideTrap_att3',
        'Henta_CounterTrap_att4',
        'Henta_CentralTrap_att3'
    ];

    function isRemovedHenta(name) {
        return REMOVED_HENTA.includes(name) || (String(name || '').startsWith('Henta_') && name !== KEEP_HENTA);
    }

    function stripRemovedHenta(map) {
        if (!map || typeof map !== 'object') return map;
        Object.keys(map).forEach(key => {
            if (isRemovedHenta(key)) delete map[key];
        });
        return map;
    }

    function hasSignal(c, signal) {
        return Array.isArray(c?.signals) && c.signals.includes(signal);
    }

    function anySignal(c, signals) {
        return signals.some(signal => hasSignal(c, signal));
    }

    const UNIQUE_SCHEMES = {
        standard_base: '4-2-3-1 standard / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        Simeone_LowBlock_def5: '5-4-1 low block / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Mourinho_WeakSide_def3: '4-1-4-1 weak side / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Pep_StandardControl_bal3: '4-3-3 control / GK-LD-CD1-CD3-RD / CM2-DM2-CM3 / LW-ST2-RW',
        Xabi_BoxMidfield_bal3: '3-2-4-1 box midfield / GK-CD1-CD2-CD3 / DM2-CM2 / LM-AM1-AM2-RM / ST2',
        Pep_BoxControl_bal2: '4-2-2-2 box control / GK-LD-CD1-CD3-RD / DM2-CM2 / AM1-AM2 / ST1-ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Xabi_VerticalBox_att3: '3-4-2-1 vertical box / GK-CD1-CD2-CD3 / LM-DM2-CM2-RM / AM1-AM2 / ST2',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Compact_Counter_def3: '4-5-1 compact counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        DeZerbi_BaitPress_bal3: '4-2-4 bait press / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LWB-DM2-CM2-RWB / LW-ST2-RW',
        Klopp_Gegenpress_att4: '4-3-3 gegenpress / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Bielsa_ChaosPress_att5: '3-3-4 chaos press / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW',
        Pep_TwoThreeFive_att3: '2-3-5 positional attack / GK-CD1-CD3 / LD-DM2-RD / LW-AM1-ST2-AM2-RW',
        DeZerbi_Release_att4: '3-2-2-3 release / GK-CD1-CD2-CD3 / DM2-CM2 / AM1-AM2 / LW-ST2-RW',
        Klopp_WideTrap_att4: '4-2-4 wide trap / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Henta_LeftTrap_att3: '4-5-1 left trap / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2'
    };

    const PRESET_SCHEME_STATE = {
        standard: 'standard_base',
        Simeone_LowBlock_def5: 'Simeone_LowBlock_def5',
        Simeone_Compact442_def4: 'Simeone_Compact442_def4',
        Mourinho_WeakSide_def3: 'Mourinho_WeakSide_def3',
        Pep_StandardControl_bal3: 'Pep_StandardControl_bal3',
        Xabi_BoxMidfield_bal3: 'Xabi_BoxMidfield_bal3',
        Pep_BoxControl_bal2: 'Pep_BoxControl_bal2',
        Pep_ControlledPush_att3: 'Pep_ControlledPush_att3',
        Xabi_VerticalBox_att3: 'Xabi_VerticalBox_att3',
        Pep_PressCooldown_bal2: 'Pep_PressCooldown_bal2',
        Compact_Counter_def3: 'Compact_Counter_def3',
        DeZerbi_BaitPress_bal3: 'DeZerbi_BaitPress_bal3',
        Conte_WingbackWidth_bal4: 'Conte_WingbackWidth_bal4',
        Klopp_Gegenpress_att4: 'Klopp_Gegenpress_att4',
        Bielsa_ChaosPress_att5: 'Bielsa_ChaosPress_att5',
        Pep_TwoThreeFive_att3: 'Pep_TwoThreeFive_att3',
        DeZerbi_Release_att4: 'DeZerbi_Release_att4',
        Klopp_WideTrap_att4: 'Klopp_WideTrap_att4',
        Henta_LeftTrap_att3: 'Henta_LeftTrap_att3'
    };

    const FIELD_SITUATIONS = {
        Simeone_LowBlock_def5: ['winning_80_plus', 'protect_lead', 'heavy_pressure'],
        Simeone_Compact442_def4: ['winning_70_plus', 'under_pressure', 'need_compact_shape'],
        Mourinho_WeakSide_def3: ['opponent_pressure', 'space_behind', 'weak_side_available'],
        Pep_StandardControl_bal3: ['draw_or_unknown', 'low_noise', 'no_strong_signal'],
        Xabi_BoxMidfield_bal3: ['center_weak', 'midfield_quality', 'low_bad_actions'],
        Pep_BoxControl_bal2: ['high_bad_actions', 'need_stability', 'safe_control'],
        Pep_ControlledPush_att3: ['need_goal_55_79', 'not_under_pressure', 'defense_working'],
        Xabi_VerticalBox_att3: ['center_available', 'vertical_entry', 'attack_underperforming'],
        Pep_PressCooldown_bal2: ['press_fatigue', 'rising_bad_actions', 'cooldown_needed'],
        Compact_Counter_def3: ['under_pressure', 'transition_threat', 'opponent_high_press'],
        DeZerbi_BaitPress_bal3: ['opponent_high_press', 'passing_quality', 'draw_press'],
        Conte_WingbackWidth_bal4: ['center_closed', 'wide_quality', 'flank_access'],
        Klopp_Gegenpress_att4: ['need_goal_70_plus', 'need_pressure', 'no_fatigue'],
        Bielsa_ChaosPress_att5: ['losing_80_plus', 'emergency_need_goal'],
        Pep_TwoThreeFive_att3: ['attacking_momentum', 'low_block_sterile', 'territorial_pressure'],
        DeZerbi_Release_att4: ['opponent_high_line', 'space_behind', 'release_after_bait'],
        Klopp_WideTrap_att4: ['center_closed', 'wide_advantage', 'urgent_wide_pressure'],
        Henta_LeftTrap_att3: ['opponent_right_weak', 'own_left_strong', 'left_lane_attack']
    };

    function applyTacticLibraryGovernance() {
        stripRemovedHenta(typeof BASE_PRESETS !== 'undefined' ? BASE_PRESETS : null);
        stripRemovedHenta(typeof BASE_LABELS !== 'undefined' ? BASE_LABELS : null);
        stripRemovedHenta(typeof DEFAULT_CUSTOM_PRESETS !== 'undefined' ? DEFAULT_CUSTOM_PRESETS : null);

        if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
            stripRemovedHenta(TacticPresetLibrary.meta);
            stripRemovedHenta(TacticPresetLibrary.presetSchemeState);
            stripRemovedHenta(TacticPresetLibrary.traits);

            TacticPresetLibrary.schemeStates = Object.assign({}, UNIQUE_SCHEMES);
            TacticPresetLibrary.presetSchemeState = Object.assign({}, PRESET_SCHEME_STATE);
            TacticPresetLibrary.fieldSituations = Object.assign({}, FIELD_SITUATIONS);

            const originalGetSchemeForPreset = TacticPresetLibrary.getSchemeForPreset?.bind(TacticPresetLibrary);
            TacticPresetLibrary.getSchemeForPreset = function getGovernedSchemeForPreset(name) {
                const state = this.presetSchemeState?.[name] || 'standard_base';
                return this.schemeStates?.[state] || UNIQUE_SCHEMES.standard_base || originalGetSchemeForPreset?.(name) || '';
            };

            TacticPresetLibrary.getFieldSituations = function getFieldSituations(name) {
                return this.fieldSituations?.[name] || [];
            };
        }
    }

    function applyPresetStorageGovernance() {
        if (typeof PresetStorage === 'undefined' || !PresetStorage || PresetStorage.__tacticalGovernanceApplied) return;

        const wrapReturningMap = name => {
            const original = PresetStorage[name]?.bind(PresetStorage);
            if (!original) return;
            PresetStorage[name] = function governedMapMethod() {
                const result = original.apply(PresetStorage, arguments) || {};
                return stripRemovedHenta(Object.assign({}, result));
            };
        };

        const originalSaveLocalOnly = PresetStorage.saveLocalOnly?.bind(PresetStorage);
        if (originalSaveLocalOnly) {
            PresetStorage.saveLocalOnly = function saveLocalOnlyGoverned(customPresets) {
                return originalSaveLocalOnly(stripRemovedHenta(Object.assign({}, customPresets || {})));
            };
        }

        wrapReturningMap('loadLocalRaw');
        wrapReturningMap('loadCustom');
        wrapReturningMap('getAllPresets');
        wrapReturningMap('getAllLabels');

        PresetStorage.__tacticalGovernanceApplied = true;
    }

    function applyRecommendationGovernance() {
        if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine && !RecommendationEngine.__tacticalGovernanceApplied) {
            const originalGetPresetLadder = RecommendationEngine.getPresetLadder?.bind(RecommendationEngine);
            RecommendationEngine.getPresetLadder = function getGovernedPresetLadder(group) {
                const ladders = {
                    defensive: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
                    balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Pep_StandardControl_bal3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'Conte_WingbackWidth_bal4'],
                    attack: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'DeZerbi_Release_att4', 'Klopp_WideTrap_att4', 'Bielsa_ChaosPress_att5'],
                    henta: ['Henta_LeftTrap_att3']
                };
                return (ladders[group] || originalGetPresetLadder?.(group) || []).filter(name => !isRemovedHenta(name));
            };
            RecommendationEngine.__tacticalGovernanceApplied = true;
        }

        if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine && !CurrentActionHintEngine.__tacticalGovernanceApplied) {
            CurrentActionHintEngine.PRESET_AUDIT_TIER = {
                primary: [
                    'Pep_BoxControl_bal2',
                    'Pep_StandardControl_bal3',
                    'Compact_Counter_def3',
                    'Pep_TwoThreeFive_att3',
                    'Conte_WingbackWidth_bal4',
                    'Pep_PressCooldown_bal2',
                    'Simeone_Compact442_def4',
                    'Mourinho_WeakSide_def3',
                    'Xabi_BoxMidfield_bal3',
                    'DeZerbi_BaitPress_bal3'
                ],
                restricted: [
                    'Pep_ControlledPush_att3',
                    'Xabi_VerticalBox_att3',
                    'Klopp_Gegenpress_att4',
                    'DeZerbi_Release_att4',
                    'Klopp_WideTrap_att4',
                    'Henta_LeftTrap_att3'
                ],
                emergency: [
                    'Bielsa_ChaosPress_att5',
                    'Simeone_LowBlock_def5'
                ],
                needsMoreData: [],
                experimental: [],
                blocked: []
            };

            CurrentActionHintEngine.HINT_RULES = [
                { id: 'late_goal_emergency', preset: 'Bielsa_ChaosPress_att5', decision: 'all_in_attack', risk: 'high', reason: 'проигрываем в финальной фазе — нужен emergency all-in', when: c => c.lateNeedGoal },
                { id: 'late_protect_low_block', preset: 'Simeone_LowBlock_def5', decision: 'protect_lead', risk: 'high', reason: 'ведём поздно под давлением — пережить отрезок низким блоком', when: c => c.protectLead && c.underPressure && c.minute >= 80 },
                { id: 'protect_compact_442', preset: 'Simeone_Compact442_def4', decision: 'compact_protect', risk: 'medium', reason: 'ведём после 70-й, но полный автобус ещё не нужен', when: c => c.protectLead && !c.lateNeedGoal },
                { id: 'henta_left_trap', preset: 'Henta_LeftTrap_att3', decision: 'left_lane_trap', risk: 'medium', reason: 'левый фланг подходит для Henta Left Trap', when: c => anySignal(c, ['opponent_right_weak', 'own_left_strong', 'left_lane_attack']) && !c.underPressure },
                { id: 'dezerbi_bait_high_press', preset: 'DeZerbi_BaitPress_bal3', decision: 'bait_press', risk: 'medium', reason: 'соперник высоко прессингует, можно вытянуть линии', when: c => c.opponentHighPress && !c.highBadActions && !c.underPressure },
                { id: 'mourinho_weak_side', preset: 'Mourinho_WeakSide_def3', decision: 'attack_weak_side', risk: 'medium', reason: 'соперник давит, есть слабая сторона или пространство за линией', when: c => c.underPressure && anySignal(c, ['space_behind', 'weak_side_available', 'opponent_flank_weak']) && !c.lateNeedGoal },
                { id: 'compact_counter_pressure', preset: 'Compact_Counter_def3', decision: 'stabilize_and_counter', risk: 'medium', reason: 'соперник опасен в переходах — закрыть структуру и оставить быстрый выход', when: c => c.underPressure && (c.transitionThreat || c.opponentHighPress) && !c.lateNeedGoal },
                { id: 'press_cooldown', preset: 'Pep_PressCooldown_bal2', decision: 'cooldown_press', risk: 'low', reason: 'растёт цена прессинга или брак — нужен cooldown', when: c => c.pressFatigueRisk && !c.lateNeedGoal },
                { id: 'box_control_bad_actions', preset: 'Pep_BoxControl_bal2', decision: 'stabilize_control', risk: 'low', reason: 'высокий брак — сначала вернуть контроль', when: c => c.highBadActions && !c.lateNeedGoal },
                { id: 'conte_width_center_closed', preset: 'Conte_WingbackWidth_bal4', decision: 'use_width', risk: 'medium', reason: 'центр закрыт, ширина доступна — растянуть блок через фланги', when: c => c.opponentLowBlock && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous },
                { id: 'klopp_wide_trap', preset: 'Klopp_WideTrap_att4', decision: 'wide_pressure', risk: 'high', reason: 'центр закрыт, нужна срочная фланговая агрессия', when: c => c.centerClosed && c.wideQuality && c.needGoal && !c.pressFatigueRisk },
                { id: 'two_three_five_momentum', preset: 'Pep_TwoThreeFive_att3', decision: 'maintain_pressure', risk: 'medium', reason: 'есть атакующий импульс — дожимать позиционно', when: c => c.attackingMomentum && !c.underPressure && !c.transitionThreat },
                { id: 'dezerbi_release_space', preset: 'DeZerbi_Release_att4', decision: 'release_space', risk: 'high', reason: 'есть пространство за линией соперника — выпускать атаку быстрее', when: c => anySignal(c, ['opponent_high_line', 'space_behind', 'release_space']) && !c.highBadActions },
                { id: 'klopp_urgent_pressure', preset: 'Klopp_Gegenpress_att4', decision: 'urgent_pressure', risk: 'high', reason: 'нужен срочный рост давления, но ещё не all-in', when: c => c.needGoal && c.minute >= 70 && !c.highBadActions && !c.pressFatigueRisk },
                { id: 'controlled_push_need_goal', preset: 'Pep_ControlledPush_att3', decision: 'increase_attack', risk: 'medium', reason: 'нужен гол без all-in — усилить атаку контролируемо', when: c => c.needGoal && !c.underPressure && !c.highBadActions },
                { id: 'xabi_vertical_center', preset: 'Xabi_VerticalBox_att3', decision: 'vertical_center_entry', risk: 'medium', reason: 'центр доступен и нужен более вертикальный вход между линиями', when: c => c.centerWeak && c.attackingMomentum && !c.centerClosed && !c.highBadActions },
                { id: 'xabi_box_midfield', preset: 'Xabi_BoxMidfield_bal3', decision: 'attack_center', risk: 'medium', reason: 'центр соперника доступен — перегрузить середину', when: c => c.centerWeak && !c.centerClosed && !c.highBadActions },
                { id: 'pep_standard_control', preset: 'Pep_StandardControl_bal3', decision: 'standard_control', risk: 'low', reason: 'игра без сильного сигнала — стандартный контроль вместо риска', when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum },
                { id: 'safe_default_box_control', preset: 'Pep_BoxControl_bal2', decision: 'hold_control', risk: 'low', reason: 'нет валидного условия для рискованной смены — безопасный контроль', when: () => true }
            ];

            CurrentActionHintEngine.__tacticalGovernanceApplied = true;
        }
    }

    function cleanupLocalStorage() {
        try {
            if (typeof localStorage === 'undefined' || typeof CONFIG === 'undefined' || !CONFIG?.STORAGE_KEY) return;
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const cleaned = stripRemovedHenta(Object.assign({}, parsed || {}));
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cleaned));
        } catch (e) {}
    }

    applyTacticLibraryGovernance();
    applyPresetStorageGovernance();
    applyRecommendationGovernance();
    cleanupLocalStorage();
})();
