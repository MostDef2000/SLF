// Generator 5.61 Bold Rule-Scored Tactical Policy
// ============================================================
// Keeps tactic application manual while making recommendation timing configurable.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.version === '5.61-bold-v3') return;

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
        standard: { attackBonus: 4, pressBonus: 3, kloppMinute: 74, bielsaMinute: 84, explorationPct: 0, marginRelax: 1 },
        bold: { attackBonus: 10, pressBonus: 8, kloppMinute: 66, bielsaMinute: 80, explorationPct: 10, marginRelax: 3 },
        experimental: { attackBonus: 14, pressBonus: 12, kloppMinute: 60, bielsaMinute: 76, explorationPct: 15, marginRelax: 5 }
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

    function deterministicBucket(signals) {
        const text = `${signals.gameId || 'unknown'}:${signals.generationWindowIndex || 0}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash >>> 0) % 100;
    }

    function copy(value) { return Array.isArray(value) ? value.slice() : []; }
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

    function patchRuleEngine() {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        const scorer = engine?.PresetRuleScorer;
        if (!engine || !scorer || scorer.__boldPolicyInstalled) return;

        engine.schema = 'slf_rule_decision_v4_bold';
        engine.TACTIC_SIGNATURES = Object.fromEntries(Object.entries(RETUNED_SIGNATURES).map(([name, signature]) => [name, Object.assign({}, signature)]));

        const originalBuild = engine.MatchDecisionSignals.build.bind(engine.MatchDecisionSignals);
        engine.MatchDecisionSignals.build = function buildBoldSignals(owner, snapshot, context = {}, runtime = null) {
            const signals = originalBuild(owner, snapshot, context, runtime);
            signals.riskAppetite = resolveRiskAppetite(snapshot, context);
            signals.riskPolicy = Object.assign({}, RISK_APPETITES[signals.riskAppetite]);
            signals.explorationBucket = deterministicBucket(signals);
            return signals;
        };

        const originalHardVeto = scorer.hardVeto.bind(scorer);
        scorer.hardVeto = function hardVetoBold(name, signals = {}) {
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
        scorer.scoreOne = function scoreOneBold(owner, name, signals) {
            const result = originalScoreOne(owner, name, signals);
            if (result.vetoed) return result;
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            let bonus = 0;
            if (['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4'].includes(name)) bonus += policy.attackBonus;
            if (name === 'Klopp_Gegenpress_att4') bonus += policy.attackBonus + policy.pressBonus;
            if (name === 'Bielsa_ChaosPress_att5') bonus += policy.attackBonus + policy.pressBonus + 4;
            if (name === 'Compact_Counter_def3' && signals.strengthGap < 0 && signals.attackNeed >= 35) bonus += Math.round(policy.attackBonus * 0.6);
            if (name === 'Pep_BoxControl_bal2' && appetite !== 'conservative' && !signals.highBadActions) bonus -= 5;
            if (name === 'Arteta_Control433_bal3' && appetite === 'experimental' && signals.attackNeed >= 35) bonus -= 6;
            result.score = owner.round(result.score + bonus);
            result.rawScore = owner.round(result.rawScore + bonus);
            result.parts.riskAppetite = bonus;
            if (bonus) result.reasons.unshift({ key: 'riskAppetite', delta: bonus, reason: `профиль смелости: ${appetite}` });
            return result;
        };

        const originalRun = scorer.run.bind(scorer);
        scorer.run = function runBold(owner, signals, runtime, detectedPreset) {
            const decision = originalRun(owner, signals, runtime, detectedPreset);
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            decision.schema = 'slf_preset_rule_score_v2_bold';
            decision.riskAppetite = appetite;
            decision.exploration = { eligible: false, applied: false, bucket: signals.explorationBucket, threshold: policy.explorationPct };

            const safe = policy.explorationPct > 0 && !decision.action.emergency && !signals.ownRedCard && !signals.highBadActions && !signals.pressFatigueRisk && signals.completeness >= 0.55;
            if (safe && signals.explorationBucket < policy.explorationPct) {
                const currentScore = Number(decision.action.score || 0);
                const candidate = (decision.candidates || []).find(item =>
                    !item.vetoed && item.preset !== decision.action.preset &&
                    ['Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4', 'Klopp_Gegenpress_att4'].includes(item.preset) &&
                    item.score >= currentScore - (8 + policy.marginRelax)
                );
                decision.exploration.eligible = true;
                if (candidate) {
                    decision.exploration.applied = true;
                    decision.exploration.fromPreset = decision.action.preset;
                    decision.exploration.toPreset = candidate.preset;
                    decision.action.preset = candidate.preset;
                    decision.action.presetStatus = owner.getPresetStatus(candidate.preset);
                    decision.action.score = candidate.score;
                    decision.action.reason = `controlled exploration ${appetite}: безопасная альтернатива в допустимом score gap`;
                    decision.action.guardType = 'controlled_exploration';
                    decision.action.guardReason = `bucket ${signals.explorationBucket} < ${policy.explorationPct}`;
                    decision.action.exploration = true;
                }
            }
            decision.action.riskAppetite = appetite;
            return decision;
        };

        scorer.__boldPolicyInstalled = true;
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
        registry.ruleDecisionSchema = 'slf_rule_decision_v4_bold';
        registry.riskAppetites = Object.assign({}, RISK_APPETITES);
        registry.defaultRiskAppetite = DEFAULT_RISK_APPETITE;
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__generator561BoldRuleScorerApplied) return;
        RecommendationEngine.selectRawPreset = function selectGenerator561ScoredPreset(snapshot, state = {}) {
            const candidate = selectEvidencePreset(state, snapshot || {});
            if (snapshot && candidate?.ruleDecision) snapshot.ruleDecision = candidate.ruleDecision;
            return REMOVED_PRESETS.has(candidate?.name) ? { name: 'Arteta_Control433_bal3', reason: 'removed preset guard', progressionAction: 'removed_preset_guard' } : candidate;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561BoldRuleScorerApplied = true;
    }

    function applyPolicy() {
        patchBasePresets();
        patchLibrary();
        patchRuleEngine();
        patchActiveRegistry();
        patchRecommendationSelection();
    }

    applyPolicy();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            version: '5.61-bold-v3',
            generatorVersion: '5.61',
            autoApply: false,
            removedPresets: Array.from(REMOVED_PRESETS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            riskAppetites: Object.assign({}, RISK_APPETITES),
            defaultRiskAppetite: DEFAULT_RISK_APPETITE,
            normalizeRiskAppetite,
            selectEvidencePreset,
            evaluateRuleDecision,
            refresh() { applyPolicy(); return true; }
        };
    }
})();