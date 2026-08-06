// Generator 5.61 Situation-Diverse Rule-Scored Tactical Policy
// ============================================================
// Keeps tactic application manual while selecting one deterministic tactic
// whose profile is tied to the current match situation.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.version === '5.61-situation-v4') return;

    const REMOVED_PRESETS = new Set(['Xabi_BoxMidfield_bal3']);
    const NEUTRAL_PRIORITY_PRESETS = [
        'standard', 'Arteta_Control433_bal3', 'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2', 'Compact_Counter_def3',
        'Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3',
        'Klopp_Gegenpress_att4', 'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5', 'Bielsa_ChaosPress_att5'
    ];
    const DIRECTION_OVERRIDES = Object.fromEntries(NEUTRAL_PRIORITY_PRESETS.map(name => [name, []]));
    DIRECTION_OVERRIDES.Conte_WingbackWidth_bal4 = ['left', 'right'];

    const RISK_APPETITES = {
        conservative: { attackBonus: 0, pressBonus: 0, kloppMinute: 78, bielsaMinute: 86, explorationPct: 0, marginRelax: 0 },
        standard: { attackBonus: 2, pressBonus: 2, kloppMinute: 74, bielsaMinute: 84, explorationPct: 0, marginRelax: 0 },
        bold: { attackBonus: 4, pressBonus: 4, kloppMinute: 66, bielsaMinute: 80, explorationPct: 0, marginRelax: 0 },
        experimental: { attackBonus: 6, pressBonus: 6, kloppMinute: 60, bielsaMinute: 76, explorationPct: 0, marginRelax: 0 }
    };
    const DEFAULT_RISK_APPETITE = 'bold';

    const RETUNED_SIGNATURES = {
        Arteta_Control433_bal3: { def_line:'2',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'2',build_long:'1',build_fast:'2',style:'3',pass_risk:'3',dribble:'2',cross:'2',shot:'2' },
        Pep_BoxControl_bal2: { def_line:'2',press_line:'1',def_width:'1',press_intense:'1',build_type:'2',build_temp:'1',build_long:'1',build_fast:'1',style:'2',pass_risk:'1',dribble:'1',cross:'1',shot:'1' },
        Pep_PressCooldown_bal2: { def_line:'1',press_line:'2',def_width:'3',press_intense:'1',build_type:'1',build_temp:'2',build_long:'3',build_fast:'2',style:'2',pass_risk:'2',dribble:'1',cross:'2',shot:'1' },
        Compact_Counter_def3: { def_line:'1',press_line:'1',def_width:'2',press_intense:'2',build_type:'1',build_temp:'3',build_long:'5',build_fast:'5',style:'3',pass_risk:'3',dribble:'4',cross:'2',shot:'3' },
        Pep_ControlledPush_att3: { def_line:'3',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'3',build_long:'1',build_fast:'4',style:'4',pass_risk:'4',dribble:'3',cross:'2',shot:'3' },
        Pep_TwoThreeFive_att3: { def_line:'4',press_line:'4',def_width:'4',press_intense:'4',build_type:'2',build_temp:'2',build_long:'1',build_fast:'3',style:'5',pass_risk:'5',dribble:'4',cross:'2',shot:'4' },
        Conte_WingbackWidth_bal4: { def_line:'2',press_line:'2',def_width:'5',press_intense:'3',build_type:'3',build_temp:'2',build_long:'3',build_fast:'3',style:'4',pass_risk:'3',dribble:'4',cross:'5',shot:'2' },
        Klopp_Gegenpress_att4: { def_line:'4',press_line:'5',def_width:'3',press_intense:'5',build_type:'3',build_temp:'3',build_long:'2',build_fast:'5',style:'5',pass_risk:'4',dribble:'4',cross:'3',shot:'4' },
        Simeone_Compact442_def4: { def_line:'1',press_line:'2',def_width:'1',press_intense:'4',build_type:'1',build_temp:'1',build_long:'3',build_fast:'2',style:'1',pass_risk:'2',dribble:'1',cross:'2',shot:'1' },
        Simeone_LowBlock_def5: { def_line:'1',press_line:'1',def_width:'1',press_intense:'1',build_type:'1',build_temp:'1',build_long:'5',build_fast:'1',style:'1',pass_risk:'1',dribble:'1',cross:'1',shot:'1' },
        Bielsa_ChaosPress_att5: { def_line:'5',press_line:'5',def_width:'5',press_intense:'5',build_type:'3',build_temp:'3',build_long:'4',build_fast:'5',style:'5',pass_risk:'5',dribble:'5',cross:'5',shot:'5' }
    };

    function normalizeRiskAppetite(value) {
        const key = String(value || '').toLowerCase();
        return RISK_APPETITES[key] ? key : DEFAULT_RISK_APPETITE;
    }

    function resolveRiskAppetite(snapshot, context) {
        const explicit = context?.riskAppetite || snapshot?.riskAppetite;
        if (explicit) return normalizeRiskAppetite(explicit);
        try { return normalizeRiskAppetite(localStorage.getItem('slf:tactics:risk-appetite')); }
        catch (_) { return DEFAULT_RISK_APPETITE; }
    }

    function finite(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function bounded(value, min = 0, max = 100) {
        return Math.max(min, Math.min(max, finite(value)));
    }

    function copy(value) { return Array.isArray(value) ? value.slice() : []; }

    function hasSignal(signals, name) {
        return Array.isArray(signals?.signals) && signals.signals.includes(name);
    }

    function removePresetFromMap(map) {
        if (!map || typeof map !== 'object') return;
        REMOVED_PRESETS.forEach(name => delete map[name]);
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        removePresetFromMap(BASE_PRESETS);
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, priority]) => {
            if (BASE_PRESETS[name]) BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name], { priority: copy(priority) });
        });
    }

    function patchLibrary() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;
        ['meta', 'traits', 'schemeStates', 'presetSchemeState'].forEach(key => removePresetFromMap(TacticPresetLibrary[key]));
        Object.entries(DIRECTION_OVERRIDES).forEach(([name, attackLanes]) => {
            if (TacticPresetLibrary.traits?.[name]) {
                TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], { attackLanes: copy(attackLanes) });
            }
        });
    }

    function classifySituation(signals = {}) {
        const appetite = normalizeRiskAppetite(signals.riskAppetite);
        const policy = RISK_APPETITES[appetite];
        const attackUnder = hasSignal(signals, 'generator_attack_underperforming');
        const attackWorking = hasSignal(signals, 'generator_attack_working');
        const defenseUnder = hasSignal(signals, 'generator_defense_underperforming');
        const defenseWorking = hasSignal(signals, 'generator_defense_working');

        if (signals.scoreState === 'winning' && signals.minute >= 82 && signals.pressureRisk >= 60) return 'late_emergency_lock';
        if (signals.scoreState === 'losing' && signals.minute >= policy.bielsaMinute && signals.attackNeed >= 78) return 'final_desperation';
        if (signals.scoreState === 'losing' && signals.minute >= policy.kloppMinute && signals.attackNeed >= 58) return 'late_chase';
        if (signals.pressFatigueRisk || signals.pressingCost >= 62 || signals.myPowerDropPct >= 4) return 'press_cooldown';
        if (signals.scoreState === 'winning' && signals.minute >= 65 && signals.pressureRisk >= 45) return 'protect_lead';
        if (signals.widthOpportunity >= 55 && !signals.ownCrossesBad && !signals.opponentCrossesDangerous && !signals.underPressure) return 'safe_width';
        if (signals.underPressure || signals.transitionThreat || signals.strengthGap <= -25) return 'compact_counter';
        if (attackUnder && defenseWorking && signals.attackNeed < 75) return 'controlled_push';
        if (defenseUnder && attackUnder) return 'control_reset';
        if (signals.highBadActions || signals.controlNeed >= 65) return 'control_reset';
        if (signals.strengthGap >= 35 && signals.pressureRisk < 48 && !signals.highBadActions && (signals.attackingMomentum || attackWorking)) return 'positional_squeeze';
        if (signals.attackNeed >= 40 && signals.attackNeed < 70 && !signals.highBadActions) return 'controlled_push';
        if (signals.minute <= 35 && signals.pressureRisk < 50 && signals.attackNeed < 45) return 'balanced_structure';
        return 'active_control';
    }

    function situationAffinity(name, signals = {}) {
        const situation = signals.situationKey || classifySituation(signals);
        const map = {
            balanced_structure: 'Arteta_Control433_bal3',
            active_control: 'Arteta_Control433_bal3',
            control_reset: 'Pep_BoxControl_bal2',
            press_cooldown: 'Pep_PressCooldown_bal2',
            compact_counter: 'Compact_Counter_def3',
            controlled_push: 'Pep_ControlledPush_att3',
            positional_squeeze: 'Pep_TwoThreeFive_att3',
            safe_width: 'Conte_WingbackWidth_bal4',
            late_chase: 'Klopp_Gegenpress_att4',
            protect_lead: 'Simeone_Compact442_def4',
            late_emergency_lock: 'Simeone_LowBlock_def5',
            final_desperation: 'Bielsa_ChaosPress_att5'
        };
        const preferred = map[situation] || 'Arteta_Control433_bal3';
        let delta = name === preferred ? 28 : 0;

        const familyConflicts = {
            control_reset: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5'],
            press_cooldown: ['Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5'],
            compact_counter: ['Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4', 'Klopp_Gegenpress_att4'],
            controlled_push: ['Pep_BoxControl_bal2', 'Bielsa_ChaosPress_att5'],
            positional_squeeze: ['Pep_BoxControl_bal2', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
            safe_width: ['Pep_BoxControl_bal2', 'Simeone_LowBlock_def5'],
            protect_lead: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5'],
            late_emergency_lock: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5'],
            late_chase: ['Pep_BoxControl_bal2', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
            final_desperation: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5']
        };
        if ((familyConflicts[situation] || []).includes(name)) delta -= 14;

        return {
            situation,
            preferred,
            delta,
            reason: name === preferred ? `соответствие сценарию: ${situation}` : ''
        };
    }

    function patchRuleEngine() {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        const scorer = engine?.PresetRuleScorer;
        if (!engine || !scorer || scorer.__situationDiversityPolicyInstalled) return;

        engine.schema = 'slf_rule_decision_v5_situation_diverse';
        engine.TACTIC_SIGNATURES = Object.fromEntries(Object.entries(RETUNED_SIGNATURES).map(([name, signature]) => [name, Object.assign({}, signature)]));

        const originalBuild = engine.MatchDecisionSignals.build.bind(engine.MatchDecisionSignals);
        engine.MatchDecisionSignals.build = function buildSituationSignals(owner, snapshot, context = {}, runtime = null) {
            const signals = originalBuild(owner, snapshot, context, runtime);
            signals.riskAppetite = resolveRiskAppetite(snapshot, context);
            signals.riskPolicy = Object.assign({}, RISK_APPETITES[signals.riskAppetite]);

            const rawStrengthAdvantage = finite(signals.strengthAdvantage);
            const cappedStrengthAdvantage = Math.min(rawStrengthAdvantage, 32);
            const duplicateStrength = Math.max(0, rawStrengthAdvantage - cappedStrengthAdvantage);
            signals.rawStrengthAdvantage = rawStrengthAdvantage;
            signals.strengthAdvantage = cappedStrengthAdvantage;
            signals.pressingOpportunity = bounded(finite(signals.pressingOpportunity) - duplicateStrength * 0.35);

            if (
                signals.gameMode === 'front_foot_squeeze' &&
                !signals.attackingMomentum &&
                !hasSignal(signals, 'generator_attack_working') &&
                signals.attackNeed < 45
            ) {
                signals.gameMode = 'active_control';
            }

            signals.situationKey = classifySituation(signals);
            return signals;
        };

        const originalHardVeto = scorer.hardVeto.bind(scorer);
        scorer.hardVeto = function hardVetoSituation(name, signals = {}) {
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            const original = originalHardVeto(name, signals);
            const reasons = (original.reasons || []).filter(reason => {
                if (name === 'Klopp_Gegenpress_att4' && reason.includes('Klopp разрешён только')) return false;
                if (name === 'Bielsa_ChaosPress_att5' && reason.includes('Bielsa разрешён только')) return false;
                return true;
            });
            const pressSafe = !signals.ownRedCard && !signals.highBadActions && !signals.pressFatigueRisk && signals.myPowerDropPct < 5;
            if (name === 'Klopp_Gegenpress_att4' && !(signals.scoreState !== 'winning' && signals.minute >= policy.kloppMinute && signals.attackNeed >= 45 && pressSafe && (!signals.transitionThreat || signals.minute >= 82))) {
                reasons.push(`Klopp требует appetite=${appetite}, минуту ${policy.kloppMinute}+ и безопасную цену прессинга`);
            }
            if (name === 'Bielsa_ChaosPress_att5' && !(signals.scoreState === 'losing' && signals.minute >= policy.bielsaMinute && signals.attackNeed >= 72 && signals.lowBadActions && pressSafe && (!signals.transitionThreat || signals.minute >= 86))) {
                reasons.push(`Bielsa требует appetite=${appetite}, проигрыш и минуту ${policy.bielsaMinute}+`);
            }
            return { vetoed: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
        };

        const originalScoreOne = scorer.scoreOne.bind(scorer);
        scorer.scoreOne = function scoreOneSituation(owner, name, signals) {
            const result = originalScoreOne(owner, name, signals);
            if (result.vetoed) return result;
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            const affinity = situationAffinity(name, signals);
            let bonus = affinity.delta;

            if (['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4'].includes(name)) bonus += policy.attackBonus;
            if (name === 'Klopp_Gegenpress_att4') bonus += policy.attackBonus + policy.pressBonus;
            if (name === 'Bielsa_ChaosPress_att5') bonus += policy.attackBonus + policy.pressBonus + 2;
            if (name === 'Compact_Counter_def3' && signals.strengthGap < 0 && signals.attackNeed >= 35) bonus += Math.round(policy.attackBonus * 0.5);
            if (name === 'Pep_BoxControl_bal2' && appetite !== 'conservative' && !signals.highBadActions && affinity.situation !== 'control_reset') bonus -= 4;

            result.score = owner.round(result.score + bonus);
            result.rawScore = owner.round(result.rawScore + bonus);
            result.parts.riskAppetite = bonus - affinity.delta;
            result.parts.situationFit = affinity.delta;
            result.situationKey = affinity.situation;
            if (affinity.reason) result.reasons.unshift({ key: 'situationFit', delta: affinity.delta, reason: affinity.reason });
            if (bonus - affinity.delta) result.reasons.unshift({ key: 'riskAppetite', delta: bonus - affinity.delta, reason: `профиль смелости: ${appetite}` });
            return result;
        };

        const originalRun = scorer.run.bind(scorer);
        scorer.run = function runSituation(owner, signals, runtime, detectedPreset) {
            const decision = originalRun(owner, signals, runtime, detectedPreset);
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            decision.schema = 'slf_preset_rule_score_v3_situation_diverse';
            decision.riskAppetite = appetite;
            decision.situationKey = signals.situationKey || classifySituation(signals);
            decision.exploration = {
                eligible: false,
                applied: false,
                threshold: 0,
                policy: 'disabled_deterministic_situation_selection'
            };
            decision.action.riskAppetite = appetite;
            decision.action.situationKey = decision.situationKey;
            return decision;
        };

        scorer.__boldPolicyInstalled = true;
        scorer.__situationDiversityPolicyInstalled = true;
    }

    function stripCandidateBlock(html) {
        return String(html || '').replace(
            /\s*<div[^>]*>\s*<b>Кандидаты:<\/b>[\s\S]*?<\/div>/i,
            ''
        );
    }

    function patchSingleTacticRendering() {
        if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return false;
        if (RecommendationEngine.__singleTacticCoachModePatched) return true;
        if (typeof RecommendationEngine.compactPlan !== 'function') return false;

        const originalCompactPlan = RecommendationEngine.compactPlan.bind(RecommendationEngine);
        RecommendationEngine.compactPlan = function compactSingleTacticPlan() {
            return stripCandidateBlock(originalCompactPlan(...arguments));
        };
        RecommendationEngine.__singleTacticCoachModePatched = true;
        return true;
    }

    function scheduleSingleTacticRenderingPatch() {
        if (patchSingleTacticRendering()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (patchSingleTacticRendering() || attempts >= 40) clearInterval(timer);
        }, 50);
    }

    function evaluateRuleDecision(snapshot = {}, state = {}) {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        if (!engine?.evaluate) return null;
        return engine.evaluate(snapshot, state);
    }

    function selectEvidencePreset(state = {}, snapshot = {}) {
        const decision = evaluateRuleDecision(snapshot, state);
        if (decision?.action?.preset && !REMOVED_PRESETS.has(decision.action.preset)) {
            return { name: decision.action.preset, reason: decision.action.reason, ruleDecision: decision, progressionAction: decision.action.guardType || 'rule_scored' };
        }
        return { name: 'Arteta_Control433_bal3', reason: '5.61 fallback: структурный контроль', progressionAction: 'rule_fallback' };
    }

    function patchActiveRegistry() {
        const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
        if (!registry) return;
        registry.active = (registry.active || []).filter(name => !REMOVED_PRESETS.has(name));
        registry.removed = Array.from(new Set([...(registry.removed || []), ...REMOVED_PRESETS]));
        registry.choosePreset = (state = {}, snapshot = {}) => selectEvidencePreset(state, snapshot);
        registry.ruleDecisionSchema = 'slf_rule_decision_v5_situation_diverse';
        registry.riskAppetites = Object.assign({}, RISK_APPETITES);
        registry.defaultRiskAppetite = DEFAULT_RISK_APPETITE;
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__generator561SituationRuleScorerApplied) return;
        RecommendationEngine.selectRawPreset = function selectGenerator561ScoredPreset(snapshot, state = {}) {
            const candidate = selectEvidencePreset(state, snapshot || {});
            if (snapshot && candidate?.ruleDecision) snapshot.ruleDecision = candidate.ruleDecision;
            return REMOVED_PRESETS.has(candidate?.name) ? { name: 'Arteta_Control433_bal3', reason: 'removed preset guard', progressionAction: 'removed_preset_guard' } : candidate;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561BoldRuleScorerApplied = true;
        RecommendationEngine.__generator561SituationRuleScorerApplied = true;
    }

    function applyPolicy() {
        patchBasePresets();
        patchLibrary();
        patchRuleEngine();
        patchActiveRegistry();
        patchRecommendationSelection();
        scheduleSingleTacticRenderingPatch();
    }

    applyPolicy();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            version: '5.61-situation-v4',
            generatorVersion: '5.61',
            autoApply: false,
            removedPresets: Array.from(REMOVED_PRESETS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            riskAppetites: Object.assign({}, RISK_APPETITES),
            defaultRiskAppetite: DEFAULT_RISK_APPETITE,
            normalizeRiskAppetite,
            classifySituation,
            situationAffinity,
            selectEvidencePreset,
            evaluateRuleDecision,
            stripCandidateBlock,
            refresh() { applyPolicy(); return true; }
        };
    }
})();
