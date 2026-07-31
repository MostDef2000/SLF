// Generator 5.61 Rule-Scored Tactical Policy
// ============================================================
// Keeps the active preset set and direction policy conservative, while routing
// recommendation selection through CurrentActionHintEngine's scored rule model.
// Tactics remain manual: this module only selects and explains a recommendation.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.version === '5.61-rule-score-v2') return;

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

    function removePresetFromMap(map) {
        if (!map || typeof map !== 'object') return;
        REMOVED_PRESETS.forEach(name => delete map[name]);
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        removePresetFromMap(BASE_PRESETS);
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
            TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], {
                attackLanes: copy(attackLanes)
            });
        });
    }

    function getActiveRegistry() {
        return typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    }

    function evaluateRuleDecision(snapshot = {}, state = {}) {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        if (!engine?.evaluate) return null;
        return engine.evaluate(snapshot, state);
    }

    function selectEvidencePreset(state = {}, snapshot = {}) {
        const decision = evaluateRuleDecision(snapshot, state);
        if (decision?.action?.preset && !REMOVED_PRESETS.has(decision.action.preset)) {
            return {
                name: decision.action.preset,
                reason: decision.action.reason,
                ruleDecision: decision,
                progressionAction: decision.action.guardType || 'rule_scored'
            };
        }

        return {
            name: 'Arteta_Control433_bal3',
            reason: '5.61 fallback: структурный контроль является нейтральным baseline',
            progressionAction: 'rule_fallback'
        };
    }

    function patchActiveRegistry() {
        const registry = getActiveRegistry();
        if (!registry) return;
        registry.active = (registry.active || []).filter(name => !REMOVED_PRESETS.has(name));
        registry.removed = Array.from(new Set([...(registry.removed || []), ...REMOVED_PRESETS]));
        registry.choosePreset = function chooseScoredPreset(state = {}, snapshot = {}) {
            return selectEvidencePreset(state, snapshot);
        };
        registry.ruleDecisionSchema = 'slf_rule_decision_v3';
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__generator561RuleScorerApplied) return;

        RecommendationEngine.selectRawPreset = function selectGenerator561ScoredPreset(snapshot, state = {}) {
            const candidate = selectEvidencePreset(state, snapshot || {});
            if (snapshot && candidate?.ruleDecision) snapshot.ruleDecision = candidate.ruleDecision;
            return REMOVED_PRESETS.has(candidate?.name)
                ? { name: 'Arteta_Control433_bal3', reason: 'removed preset guard', progressionAction: 'removed_preset_guard' }
                : candidate;
        };

        if (typeof RecommendationEngine.applyProgressionGuard === 'function') {
            const originalProgressionGuard = RecommendationEngine.applyProgressionGuard;
            RecommendationEngine.applyProgressionGuard = function applyRuleScorerProgressionGuard(candidate, snapshot, context = {}) {
                if (candidate?.ruleDecision) {
                    return Object.assign({}, candidate, {
                        progressionAction: candidate.ruleDecision.action?.guardType || candidate.progressionAction || 'rule_scored'
                    });
                }
                return originalProgressionGuard.call(this, candidate, snapshot, context);
            };
        }

        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
    }

    function applyPolicy() {
        patchBasePresets();
        patchLibrary();
        patchActiveRegistry();
        patchRecommendationSelection();
    }

    applyPolicy();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            version: '5.61-rule-score-v2',
            generatorVersion: '5.61',
            autoApply: false,
            removedPresets: Array.from(REMOVED_PRESETS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            selectEvidencePreset,
            evaluateRuleDecision,
            refresh() {
                applyPolicy();
                return true;
            }
        };
    }
})();