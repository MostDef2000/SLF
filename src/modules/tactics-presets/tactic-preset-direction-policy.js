// Tactic Preset Direction Policy
// ============================================================
// Runtime overlay for attack direction policy.
//
// Contract:
// - do not touch src/core/config.js;
// - center attack is not a default direction;
// - center attack remains available only for explicit central-overload presets;
// - patch canonical preset runtime values and recommendation selection guards.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.applied) return;

    const CENTER_EXCEPTIONS = new Set([
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3',
        'Henta_CentralTrap_att3'
    ]);

    const DIRECTION_OVERRIDES = {
        standard: [],
        Arteta_Control433_bal3: [],
        Pep_StandardControl_bal3: [],
        Pep_BoxControl_bal2: [],
        Pep_ControlledPush_att3: ['left', 'right'],
        Pep_TwoThreeFive_att3: ['left', 'right'],
        Pep_PressCooldown_bal2: [],
        DeZerbi_BaitPress_bal3: [],
        DeZerbi_Release_att4: ['right'],
        Bielsa_ChaosPress_att5: ['left', 'right']
    };

    const TRAIT_DIRECTION_OVERRIDES = {
        standard: [],
        Arteta_Control433_bal3: [],
        Pep_StandardControl_bal3: [],
        Pep_BoxControl_bal2: [],
        Pep_ControlledPush_att3: ['left', 'right'],
        Pep_TwoThreeFive_att3: ['left', 'right'],
        Pep_PressCooldown_bal2: [],
        DeZerbi_BaitPress_bal3: [],
        DeZerbi_Release_att4: ['right'],
        Bielsa_ChaosPress_att5: ['left', 'right']
    };

    const META_PATCHES = {
        Arteta_Control433_bal3: {
            idea: 'позиционный контроль без принудительной атаки по центру; финальная треть сама подтягивает центр, поэтому стартовое направление нейтральное',
            risk: 'если нужен быстрый гол, может быть слишком нейтрально'
        },
        Pep_StandardControl_bal3: {
            idea: 'стандартный контроль без заданного центрального коридора: растягиваем поле, а вход в центр оставляем по ситуации',
            risk: 'может быть слишком нейтрально, если соперник отдаёт явный слабый центр'
        },
        Pep_BoxControl_bal2: {
            idea: 'снизить хаос и держать безопасный контроль без форсирования центральной воронки',
            risk: 'может стать стерильным, если нет флангового/полуфлангового выхода'
        },
        Pep_ControlledPush_att3: {
            idea: 'усилить атаку через ширину/полуфланги без all-in и без принудительного центра',
            risk: 'при браке усиление превратится в потери'
        },
        Pep_TwoThreeFive_att3: {
            idea: 'позиционно дожимать через широкое присутствие и полуфланги, не забивая атаку заранее в центр',
            risk: 'опасно против быстрых контратак'
        },
        DeZerbi_BaitPress_bal3: {
            idea: 'заманить прессинг и раскрыть линии без обязательного входа через центр',
            risk: 'слабая первая линия может привезти момент'
        },
        DeZerbi_Release_att4: {
            idea: 'быстро выпускать атаку за прессинг, преимущественно через свободный фланг/полуфланг',
            risk: 'если пространства нет, риск паса пустой'
        },
        Xabi_BoxMidfield_bal3: {
            idea: 'central-overload только при явной слабости центра соперника и низком браке; не использовать как default control',
            risk: 'если центр не слабый, появится стерильное владение и обрезы в плотной зоне'
        },
        Xabi_VerticalBox_att3: {
            idea: 'вертикальный central-overload как исключение: бить в слабый центр, а не просто держать мяч по центру',
            risk: 'при закрытом центре или давлении соперника вертикальность даст брак'
        }
    };

    function copy(value) {
        return Array.isArray(value) ? value.slice() : [];
    }

    function tagsOf(state = {}) {
        if (Array.isArray(state.tags)) return state.tags;
        if (Array.isArray(state.signals)) return state.signals;
        return [];
    }

    function hasTag(state, tag) {
        return tagsOf(state).includes(tag) || !!state?.[tag];
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function priorityOfPreset(name) {
        if (typeof BASE_PRESETS !== 'undefined' && BASE_PRESETS?.[name]) {
            return copy(BASE_PRESETS[name].priority);
        }
        return copy(DIRECTION_OVERRIDES[name]);
    }

    function hasCenterDirection(name) {
        return priorityOfPreset(name).includes('center') || (TacticPresetLibrary?.traits?.[name]?.attackLanes || []).includes('center');
    }

    function hasCenterExceptionContext(state = {}) {
        const myBad = number(state.myBad, 0);
        const centerWeak = hasTag(state, 'center_weak') || !!state.centerWeak;
        const centerAvailable = hasTag(state, 'center_available') || !!state.centerAvailable;
        const lowBadActions = hasTag(state, 'low_bad_actions') || myBad > 0 && myBad <= 16;
        const centerClosed = hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || !!state.centerClosed;
        const underPressure = hasTag(state, 'under_pressure') || hasTag(state, 'transition_threat') || !!state.underPressure || !!state.transitionThreat;
        const highBadActions = hasTag(state, 'high_bad_actions') || !!state.highBadActions || myBad >= 20;
        const sterileCenter = hasCenterOveruseSymptoms(state);

        return (centerWeak || centerAvailable) && lowBadActions && !centerClosed && !underPressure && !highBadActions && !sterileCenter;
    }

    function hasCenterOveruseSymptoms(state = {}) {
        const minute = number(state.minute, 0);
        const myPossession = number(state.myPossession, 0);
        const myXg = number(state.myXg, 0);
        const oppXg = number(state.oppXg, 0);
        const myXT = number(state.myXT, 0);
        const oppXT = number(state.oppXT, 0);
        const shotsGap = number(state.oppShots, 0) - number(state.myShots, 0);

        if (minute >= 25 && myPossession >= 52 && myXg <= oppXg + 0.1) return true;
        if (minute >= 35 && myXT < oppXT - 0.15) return true;
        if (minute >= 45 && shotsGap >= 3 && myXg <= oppXg + 0.2) return true;
        return false;
    }

    function isCenterOveruse(name, state = {}) {
        if (!name || !hasCenterDirection(name)) return false;
        if (!CENTER_EXCEPTIONS.has(name)) return true;
        return !hasCenterExceptionContext(state);
    }

    function selectNonCenterAlternative(name, state = {}) {
        const scoreState = state?.score?.state || state.scoreState || '';
        const minute = number(state.minute, 0);
        const myBad = number(state.myBad, 0);
        const xgGap = number(state.oppXg, 0) - number(state.myXg, 0);
        const xtGap = number(state.oppXT, 0) - number(state.myXT, 0);

        if (hasTag(state, 'press_fatigue_risk') || state.pressFatigue?.active) return 'Pep_PressCooldown_bal2';
        if (myBad >= 22 || hasTag(state, 'high_bad_actions')) return 'Pep_PressCooldown_bal2';
        if (xgGap > 0.55 || xtGap > 0.45 || hasTag(state, 'transition_threat') || hasTag(state, 'under_pressure')) return 'Compact_Counter_def3';
        if (scoreState === 'winning' && minute >= 70) return 'Simeone_Compact442_def4';
        if (scoreState === 'losing' && minute >= 80) return 'Klopp_Gegenpress_att4';
        if (hasTag(state, 'opponent_high_press') || hasTag(state, 'space_behind')) return 'DeZerbi_Release_att4';
        if (hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || hasTag(state, 'wide_quality')) return 'Conte_WingbackWidth_bal4';
        if (scoreState === 'losing' || hasTag(state, 'need_goal') || hasTag(state, 'attacking_momentum')) return 'Pep_ControlledPush_att3';
        if (state.strengthContext?.mode === 'disadvantage') return 'Mourinho_WeakSide_def3';
        if (hasCenterOveruseSymptoms(state)) return 'Pep_ControlledPush_att3';

        return 'Arteta_Control433_bal3';
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;

        Object.entries(DIRECTION_OVERRIDES).forEach(([name, priority]) => {
            if (!BASE_PRESETS[name]) return;
            BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name], {
                priority: copy(priority)
            });
        });
    }

    function patchLibraryTraits() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;

        if (TacticPresetLibrary.traits) {
            Object.entries(TRAIT_DIRECTION_OVERRIDES).forEach(([name, attackLanes]) => {
                if (!TacticPresetLibrary.traits[name]) return;
                TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], {
                    attackLanes: copy(attackLanes)
                });
            });
        }

        if (TacticPresetLibrary.meta) {
            Object.entries(META_PATCHES).forEach(([name, patch]) => {
                if (!TacticPresetLibrary.meta[name]) return;
                TacticPresetLibrary.meta[name] = Object.assign({}, TacticPresetLibrary.meta[name], patch);
            });
        }
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return;
        if (RecommendationEngine.__directionPolicySelectRawPresetApplied) return;
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const originalSelectRawPreset = RecommendationEngine.selectRawPreset;

        RecommendationEngine.selectRawPreset = function selectRawPresetWithDirectionPolicy(snapshot, state = {}) {
            const candidate = originalSelectRawPreset.apply(this, arguments);
            const candidateName = candidate?.name || '';

            if (!isCenterOveruse(candidateName, state)) return candidate;

            const alternative = selectNonCenterAlternative(candidateName, state);
            return Object.assign({}, candidate || {}, {
                name: alternative,
                directionPolicyRedirect: true,
                rawCenterPreset: candidateName,
                reason: `${candidate?.reason || 'выбран center preset'}; center direction guard: атака по центру только для явного central-overload, поэтому выбран нецентральный план`
            });
        };

        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
    }

    patchBasePresets();
    patchLibraryTraits();
    patchRecommendationSelection();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            centerExceptions: Array.from(CENTER_EXCEPTIONS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            hasCenterDirection,
            hasCenterExceptionContext,
            hasCenterOveruseSymptoms,
            isCenterOveruse,
            selectNonCenterAlternative,
            refresh() {
                patchBasePresets();
                patchLibraryTraits();
                return true;
            }
        };
    }
})();
