// Generator 5.61 Tactical Evidence Policy
// ============================================================
// Conservative runtime policy based on the official 5.61 rule pack and the
// current mixed-history preset evidence. Historical aggregates are not treated
// as a clean post-5.61 cohort; high-risk choices remain guarded until the
// exporter reports enough stable-5.61 effects.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.version === '5.61-evidence-v1') return;

    const REMOVED_PRESETS = new Set(['Xabi_BoxMidfield_bal3']);
    const NEUTRAL_PRIORITY_PRESETS = [
        'standard',
        'Arteta_Control433_bal3',
        'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2',
        'Compact_Counter_def3',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5',
        'Bielsa_ChaosPress_att5'
    ];

    const DIRECTION_OVERRIDES = Object.fromEntries(NEUTRAL_PRIORITY_PRESETS.map(name => [name, []]));
    DIRECTION_OVERRIDES.Conte_WingbackWidth_bal4 = ['left', 'right'];

    function copy(value) {
        return Array.isArray(value) ? value.slice() : [];
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function tagsOf(state = {}) {
        if (Array.isArray(state.tags)) return state.tags;
        if (Array.isArray(state.signals)) return state.signals;
        return [];
    }

    function hasTag(state, tag) {
        return tagsOf(state).includes(tag) || state?.[tag] === true;
    }

    function scoreStateOf(state = {}) {
        return state?.score?.state || state.scoreState || 'unknown';
    }

    function isPressFatigue(state = {}) {
        return !!state.pressFatigue?.active || hasTag(state, 'press_fatigue_risk');
    }

    function isHighBad(state = {}) {
        return number(state.myBad, 0) >= 20 || hasTag(state, 'high_bad_actions');
    }

    function isLowBad(state = {}) {
        const bad = number(state.myBad, 0);
        return hasTag(state, 'low_bad_actions') || bad > 0 && bad <= 16;
    }

    function isUnderPressure(state = {}) {
        const xgGap = number(state.oppXg, 0) - number(state.myXg, 0);
        const xtGap = number(state.oppXT, 0) - number(state.myXT, 0);
        return xgGap > 0.45 || xtGap > 0.25 || hasTag(state, 'under_pressure') || hasTag(state, 'transition_threat');
    }

    function hasVerifiedWideOpportunity(state = {}) {
        const wideSignal = hasTag(state, 'wide_quality') || hasTag(state, 'wide_advantage') || hasTag(state, 'attack_left') || hasTag(state, 'attack_right');
        const weakFullback = hasTag(state, 'opponent_flank_weak') || hasTag(state, 'weak_side_available');
        const cardPressure = hasTag(state, 'opponent_fullback_yellow') || hasTag(state, 'opponent_wide_defender_booked');
        const observedMomentum = hasTag(state, 'attacking_momentum');
        const crossesBad = hasTag(state, 'own_open_play_crosses_bad') || hasTag(state, 'own_crosses_bad_total');
        const crossesDangerous = hasTag(state, 'opponent_crosses_dangerous');
        return wideSignal && (weakFullback || cardPressure || observedMomentum) && !crossesBad && !crossesDangerous && !isUnderPressure(state);
    }

    function selectEvidencePreset(state = {}) {
        const minute = number(state.minute, 0);
        const scoreState = scoreStateOf(state);
        const needGoal = scoreState === 'losing' && minute >= 55 || hasTag(state, 'need_goal');
        const protectLead = scoreState === 'winning' && minute >= 70 || hasTag(state, 'late_protect_lead');
        const transitionThreat = isUnderPressure(state);
        const highBad = isHighBad(state);
        const lowBad = isLowBad(state);
        const fatigue = isPressFatigue(state);
        const attackingMomentum = hasTag(state, 'attacking_momentum');
        const centerClosed = hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block');

        if (protectLead && minute >= 82 && transitionThreat) {
            return { name: 'Simeone_LowBlock_def5', reason: '5.61 policy: поздно ведём под тяжёлым давлением — аварийный низкий блок' };
        }
        if (protectLead) {
            return {
                name: transitionThreat || hasTag(state, 'opponent_crosses_dangerous') ? 'Simeone_Compact442_def4' : 'Pep_BoxControl_bal2',
                reason: transitionThreat ? '5.61 policy: защитить преимущество компактной структурой' : '5.61 policy: сохранить преимущество через контроль и низкий риск'
            };
        }
        if (fatigue) {
            if (needGoal && minute >= 75) {
                return {
                    name: lowBad ? 'Pep_TwoThreeFive_att3' : 'Pep_ControlledPush_att3',
                    reason: '5.61 policy: нужен гол, но цена прессинга высока — атаковать без автоматического gegenpress/chaos'
                };
            }
            return { name: 'Pep_PressCooldown_bal2', reason: '5.61 policy: снизить цену прессинга и восстановить структуру' };
        }
        if (highBad) {
            return { name: 'Pep_BoxControl_bal2', reason: '5.61 policy: высокий брак — сначала стабилизировать розыгрыш' };
        }
        if (transitionThreat) {
            return { name: 'Compact_Counter_def3', reason: '5.61 policy: соперник опаснее — закрыть переходы и сохранить быстрый выход' };
        }
        if (needGoal && minute >= 86 && lowBad) {
            return { name: 'Bielsa_ChaosPress_att5', reason: '5.61 policy: только финальное emergency-окно допускает chaos press' };
        }
        if (needGoal && minute >= 78 && lowBad) {
            return { name: 'Klopp_Gegenpress_att4', reason: '5.61 policy: поздняя погоня допускает gegenpress только при низком браке и без fatigue/transition risk' };
        }
        if (needGoal || attackingMomentum) {
            return {
                name: lowBad || attackingMomentum ? 'Pep_TwoThreeFive_att3' : 'Pep_ControlledPush_att3',
                reason: lowBad || attackingMomentum
                    ? 'наблюдаемая выборка лучше поддерживает контролируемую позиционную атаку, чем ранний высокий прессинг'
                    : 'нужен гол, но качество розыгрыша не позволяет сразу повышать прессинг'
            };
        }
        if (centerClosed && hasVerifiedWideOpportunity(state)) {
            return { name: 'Conte_WingbackWidth_bal4', reason: '5.61 policy: ширина подтверждена не только закрытым центром, но и фактическим преимуществом на фланге' };
        }
        return { name: 'Arteta_Control433_bal3', reason: '5.61 policy: структурный контроль является нейтральным baseline' };
    }

    function removePresetFromMap(map) {
        if (!map || typeof map !== 'object') return;
        REMOVED_PRESETS.forEach(name => delete map[name]);
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        removePresetFromMap(BASE_PRESETS);
        if (typeof BASE_LABELS !== 'undefined') removePresetFromMap(BASE_LABELS);
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, priority]) => {
            if (!BASE_PRESETS[name]) return;
            BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name], { priority: copy(priority) });
        });
    }

    function patchLibrary() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;
        ['meta', 'traits', 'schemeStates', 'presetSchemeState'].forEach(key => removePresetFromMap(TacticPresetLibrary[key]));
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, attackLanes]) => {
            if (!TacticPresetLibrary.traits?.[name]) return;
            TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], { attackLanes: copy(attackLanes) });
        });
    }

    function patchPresetStorage() {
        if (typeof PresetStorage === 'undefined' || PresetStorage.__generator561FilterApplied) return;
        ['getAllPresets', 'getAllLabels'].forEach(method => {
            if (typeof PresetStorage[method] !== 'function') return;
            const original = PresetStorage[method].bind(PresetStorage);
            PresetStorage[method] = function filteredGenerator561Storage() {
                const value = Object.assign({}, original.apply(PresetStorage, arguments) || {});
                removePresetFromMap(value);
                return value;
            };
        });
        PresetStorage.__generator561FilterApplied = true;
    }

    function patchActiveRegistry() {
        const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
        if (!registry) return;
        registry.active = (registry.active || []).filter(name => !REMOVED_PRESETS.has(name));
        registry.removed = Array.from(new Set([...(registry.removed || []), ...REMOVED_PRESETS]));
        registry.choosePreset = selectEvidencePreset;
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__generator561SelectionApplied) return;
        RecommendationEngine.selectRawPreset = function selectGenerator561Preset(snapshot, state = {}) {
            const candidate = selectEvidencePreset(state);
            const fused = this.applyPresetDecisionFusion ? this.applyPresetDecisionFusion(candidate, state) : candidate;
            return REMOVED_PRESETS.has(fused?.name) ? candidate : fused;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
    }

    function patchHintRules() {
        if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
        CurrentActionHintEngine.PRESET_AUDIT_TIER = {
            primary: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3', 'Pep_TwoThreeFive_att3', 'Pep_PressCooldown_bal2'],
            conditional: ['Pep_ControlledPush_att3', 'Conte_WingbackWidth_bal4', 'Simeone_Compact442_def4'],
            restricted: ['Klopp_Gegenpress_att4'],
            emergency: ['Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'],
            removed: ['Mourinho_WeakSide_def3', 'Xabi_VerticalBox_att3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Nagelsmann_WidePress_att4', 'Henta_LeftTrap_att3'],
            needsMoreData: [], experimental: [], blocked: []
        };
        CurrentActionHintEngine.HINT_RULES = [
            { id: 'late_goal_emergency_561', preset: 'Bielsa_ChaosPress_att5', decision: 'all_in_attack', risk: 'high', reason: 'после 86-й проигрываем и безопасные варианты недостаточны — финальный all-in', when: c => c.lateNeedGoal && c.minute >= 86 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat },
            { id: 'late_protect_heavy_pressure_561', preset: 'Simeone_LowBlock_def5', decision: 'protect_lead', risk: 'high', reason: 'после 82-й ведём под тяжёлым давлением — закрыть штрафную', when: c => c.protectLead && c.underPressure && c.minute >= 82 },
            { id: 'protect_compact_442_561', preset: 'Simeone_Compact442_def4', decision: 'compact_protect', risk: 'medium', reason: 'ведём поздно — компактно защитить преимущество', when: c => c.protectLead && c.minute >= 70 },
            { id: 'own_press_fatigue_cooldown_561', preset: 'Pep_PressCooldown_bal2', decision: 'cooldown_press', risk: 'low', reason: 'растёт цена прессинга — снизить интенсивность и вернуть структуру', when: c => c.pressFatigueRisk && !c.needGoal },
            { id: 'bad_actions_control_reset_561', preset: 'Pep_BoxControl_bal2', decision: 'stabilize_control', risk: 'low', reason: 'высокий брак — сначала стабилизировать розыгрыш', when: c => c.highBadActions },
            { id: 'under_pressure_counter_561', preset: 'Compact_Counter_def3', decision: 'defensive_reset', risk: 'medium', reason: 'соперник опаснее — закрыть переходы и сохранить быстрый выход', when: c => c.underPressure || c.transitionThreat },
            { id: 'verified_width_561', preset: 'Conte_WingbackWidth_bal4', decision: 'use_width', risk: 'medium', reason: 'фланг подтверждён как преимущество; одного закрытого центра после 5.61 недостаточно', when: c => c.centerClosed && c.wideQuality && (c.weakSideAvailable || c.attackingMomentum) && !c.ownCrossesBad && !c.opponentCrossesDangerous && !c.underPressure },
            { id: 'late_gegenpress_561', preset: 'Klopp_Gegenpress_att4', decision: 'urgent_pressure', risk: 'high', reason: 'после 78-й нужен гол; высокий прессинг допустим только при низком браке и без fatigue/transition risk', when: c => c.needGoal && c.minute >= 78 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat },
            { id: 'positional_attack_561', preset: 'Pep_TwoThreeFive_att3', decision: 'controlled_attack', risk: 'medium', reason: 'лучший наблюдаемый атакующий баланс — позиционно дожимать без раннего all-in прессинга', when: c => (c.needGoal || c.attackingMomentum) && c.lowBadActions && !c.underPressure && !c.transitionThreat },
            { id: 'controlled_push_561', preset: 'Pep_ControlledPush_att3', decision: 'increase_attack', risk: 'medium', reason: 'нужен гол, но качество розыгрыша не позволяет сразу повышать прессинг', when: c => c.needGoal && !c.underPressure && !c.pressFatigueRisk },
            { id: 'standard_control_561', preset: 'Arteta_Control433_bal3', decision: 'standard_control', risk: 'low', reason: 'нет сильного отрицательного сигнала — держать структурный контроль', when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum },
            { id: 'safe_default_561', preset: 'Pep_BoxControl_bal2', decision: 'hold_control', risk: 'low', reason: 'нет надёжного сигнала для более рискованной смены — стабилизировать игру', when: () => true }
        ];
    }

    function applyPolicy() {
        patchBasePresets();
        patchLibrary();
        patchPresetStorage();
        patchActiveRegistry();
        patchRecommendationSelection();
        patchHintRules();
    }

    applyPolicy();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            version: '5.61-evidence-v1',
            generatorVersion: '5.61',
            removedPresets: Array.from(REMOVED_PRESETS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            hasVerifiedWideOpportunity,
            selectEvidencePreset,
            refresh() { applyPolicy(); return true; }
        };
    }
})();
