// Tactic Preset Direction Policy
// ============================================================
// Center attack is never a default direction. The only active center-only
// preset is Xabi Box Midfield, and it requires a weak/open center plus low
// bad-action pressure.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.applied) return;

    const CENTER_EXCEPTIONS = new Set(['Xabi_BoxMidfield_bal3']);

    const DIRECTION_OVERRIDES = {
        standard: [],
        Arteta_Control433_bal3: [],
        Pep_BoxControl_bal2: [],
        Pep_PressCooldown_bal2: [],
        Compact_Counter_def3: ['left', 'right'],
        Pep_ControlledPush_att3: ['left', 'right'],
        Pep_TwoThreeFive_att3: ['left', 'right'],
        Conte_WingbackWidth_bal4: ['left', 'right'],
        Xabi_BoxMidfield_bal3: ['center'],
        Klopp_Gegenpress_att4: ['left', 'right'],
        Simeone_Compact442_def4: ['left', 'right'],
        Simeone_LowBlock_def5: ['right'],
        Bielsa_ChaosPress_att5: ['left', 'right']
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

    function hasCenterExceptionContext(state = {}) {
        const myBad = number(state.myBad, 0);
        const centerWeak = hasTag(state, 'center_weak') || !!state.centerWeak;
        const centerAvailable = hasTag(state, 'center_available') || !!state.centerAvailable;
        const lowBadActions = hasTag(state, 'low_bad_actions') || myBad > 0 && myBad <= 16;
        const centerClosed = hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || !!state.centerClosed;
        const underPressure = hasTag(state, 'under_pressure') || hasTag(state, 'transition_threat') || !!state.underPressure || !!state.transitionThreat;
        const highBadActions = hasTag(state, 'high_bad_actions') || !!state.highBadActions || myBad >= 20;

        return (centerWeak || centerAvailable) && lowBadActions && !centerClosed && !underPressure && !highBadActions && !hasCenterOveruseSymptoms(state);
    }

    function isCenterOveruse(name, state = {}) {
        if (!name || !hasCenterDirection(name)) return false;
        if (!CENTER_EXCEPTIONS.has(name)) return true;
        return !hasCenterExceptionContext(state);
    }

    function selectNonCenterAlternative(state = {}) {
        const scoreState = state?.score?.state || state.scoreState || '';
        const minute = number(state.minute, 0);
        const myBad = number(state.myBad, 0);
        const xgGap = number(state.oppXg, 0) - number(state.myXg, 0);
        const xtGap = number(state.oppXT, 0) - number(state.myXT, 0);

        if (hasTag(state, 'press_fatigue_risk') || state.pressFatigue?.active) return 'Pep_PressCooldown_bal2';
        if (myBad >= 20 || hasTag(state, 'high_bad_actions')) return 'Pep_BoxControl_bal2';
        if (xgGap > 0.45 || xtGap > 0.25 || hasTag(state, 'transition_threat') || hasTag(state, 'under_pressure')) return 'Compact_Counter_def3';
        if (scoreState === 'winning' && minute >= 70) return 'Simeone_Compact442_def4';
        if (scoreState === 'losing' && minute >= 80) return 'Bielsa_ChaosPress_att5';
        if (hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || hasTag(state, 'wide_quality')) return 'Conte_WingbackWidth_bal4';
        if (scoreState === 'losing' || hasTag(state, 'need_goal') || hasTag(state, 'attacking_momentum')) return 'Pep_ControlledPush_att3';
        return 'Arteta_Control433_bal3';
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, priority]) => {
            if (!BASE_PRESETS[name]) return;
            BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name], { priority: copy(priority) });
        });
    }

    function patchLibraryTraits() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary?.traits) return;
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, attackLanes]) => {
            if (!TacticPresetLibrary.traits[name]) return;
            TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], {
                attackLanes: copy(attackLanes)
            });
        });
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

            const alternative = selectNonCenterAlternative(state);
            return Object.assign({}, candidate || {}, {
                name: alternative,
                directionPolicyRedirect: true,
                rawCenterPreset: candidateName,
                reason: `${candidate?.reason || 'выбран центральный пресет'}; center guard: центральный перегруз не подтверждён, поэтому выбран безопасный нецентральный план`
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
