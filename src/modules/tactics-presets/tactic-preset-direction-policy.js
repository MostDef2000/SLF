// Generator 5.61 Tactical Suite v7 Recommendation Policy
// ============================================================
// The active registry owns tactic data/UI identity. This layer makes the
// registry decision canonical for Coach Mode, progression and telemetry.

(function tacticPresetDirectionPolicy() {
    'use strict';

    const VERSION = '5.61-tactical-suite-v7';
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
    if (!registry || !engine || window.SLFTacticDirectionPolicy?.version === VERSION) return;

    const SUITE = registry.suiteVersion || 'slf_tactic_suite_561_v7';
    const SCHEMA = registry.recommendationSchema || 'slf_rule_decision_v7_tactical_suite';
    const ACTIVE = Array.isArray(registry.active) ? registry.active.slice() : [];
    const ACTIVE_SET = new Set(ACTIVE);
    const DEFAULT_RISK = registry.defaultRiskAppetite || 'standard';
    const STEP = {
        Arteta_Control433_bal3:['Pep_BoxControl_bal2','Pep_ControlledPush_att3','Simeone_Compact442_def4','Conte_WingbackWidth_bal4'],
        Pep_BoxControl_bal2:['Arteta_Control433_bal3','Pep_PressCooldown_bal2','Compact_Counter_def3'],
        Pep_PressCooldown_bal2:['Pep_BoxControl_bal2','Arteta_Control433_bal3'],
        Compact_Counter_def3:['Pep_BoxControl_bal2','Arteta_Control433_bal3'],
        Pep_ControlledPush_att3:['Arteta_Control433_bal3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4'],
        Pep_TwoThreeFive_att3:['Pep_ControlledPush_att3','Klopp_Gegenpress_att4','Conte_WingbackWidth_bal4'],
        Conte_WingbackWidth_bal4:['Arteta_Control433_bal3','Pep_ControlledPush_att3','Pep_TwoThreeFive_att3'],
        Klopp_Gegenpress_att4:['Pep_TwoThreeFive_att3','Bielsa_ChaosPress_att5'],
        Bielsa_ChaosPress_att5:['Klopp_Gegenpress_att4'],
        Simeone_Compact442_def4:['Arteta_Control433_bal3','Simeone_LowBlock_def5'],
        Simeone_LowBlock_def5:['Simeone_Compact442_def4']
    };

    function has(context, key) {
        return Array.isArray(context?.signals) && context.signals.includes(key)
            || Array.isArray(context?.tags) && context.tags.includes(key);
    }

    function normalizedContext(context = {}) {
        const scoreState = context.score?.state || context.scoreState || 'unknown';
        const minute = Number(context.minute || 0);
        const myBad = Number(context.myBad || context.myBadActionsPct || 0);
        const drop = Number(context.myPowerDropPct || 0);
        const underPressure = context.underPressure === true || has(context, 'under_pressure') || has(context, 'transition_threat') || has(context, 'opponent_high_press');
        const counterExitAvailable = context.counterExitAvailable === true || has(context, 'counter_exit_available') || has(context, 'space_behind_press') || has(context, 'clean_first_pass');
        const counterExitBlocked = context.counterExitAvailable === false || context.counterExitBlocked === true || has(context, 'counter_exit_blocked') || has(context, 'first_pass_trapped') || has(context, 'sustained_siege');
        const pressFatigueRisk = context.pressFatigueRisk === true || context.pressFatigue?.active === true || has(context, 'press_fatigue_risk') || drop >= 4;
        const highBadActions = context.highBadActions === true || has(context, 'high_bad_actions') || myBad >= 20;
        const lowBadActions = context.lowBadActions === true || has(context, 'low_bad_actions') || (myBad > 0 && myBad <= 16);
        const transitionThreat = context.transitionThreat === true || has(context, 'transition_threat');
        const centerClosed = context.centerClosed === true || has(context, 'center_closed') || has(context, 'opponent_low_block');
        const wideQuality = context.wideQuality === true || has(context, 'wide_quality') || has(context, 'attack_left') || has(context, 'attack_right');
        const ownCrossesBad = context.ownCrossesBad === true || has(context, 'own_open_play_crosses_bad') || has(context, 'own_crosses_bad_total');
        const opponentCrossesDangerous = context.opponentCrossesDangerous === true || has(context, 'opponent_crosses_dangerous');
        const attackingMomentum = context.attackingMomentum === true || has(context, 'attacking_momentum');
        const attackNeed = Number(context.attackNeed || 0);
        const pressureRisk = Number(context.pressureRisk || 0);
        const emergencyLockRequired = underPressure && !counterExitAvailable && (context.ownRedCard || highBadActions || drop >= 5 || pressureRisk >= 82 || has(context, 'sustained_siege'));
        return Object.assign({}, context, { scoreState,minute,myBad,myPowerDropPct:drop,underPressure,counterExitAvailable,counterExitBlocked,pressFatigueRisk,highBadActions,lowBadActions,transitionThreat,centerClosed,wideQuality,ownCrossesBad,opponentCrossesDangerous,attackingMomentum,attackNeed,pressureRisk,emergencyLockRequired });
    }

    function classify(context = {}) {
        const c = normalizedContext(context);
        if (c.scoreState === 'losing' && c.minute >= 84 && c.attackNeed >= 75 && c.lowBadActions && !c.pressFatigueRisk) return 'final_all_in';
        if (c.emergencyLockRequired || (c.scoreState === 'winning' && c.minute >= 84 && c.underPressure && c.pressureRisk >= 55)) return 'emergency_lock';
        if (c.pressFatigueRisk && !(c.scoreState === 'losing' && c.minute >= 70)) return 'press_cooldown';
        if (c.scoreState === 'winning' && c.minute >= 65) return 'protect_lead';
        if (c.underPressure) return c.counterExitAvailable && !c.counterExitBlocked ? 'pressure_counter' : 'pressure_escape';
        if (c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous) return 'width_attack';
        if (c.scoreState === 'losing' && c.minute >= 72 && c.attackNeed >= 65 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat) return 'late_high_pressure';
        if ((c.attackingMomentum || c.attackNeed >= 58) && c.minute >= 55 && !c.transitionThreat && !c.highBadActions && !c.pressFatigueRisk) return 'positional_siege';
        if ((c.scoreState === 'losing' && c.minute >= 45) || c.attackNeed >= 38) return 'controlled_chase';
        return 'stable_control';
    }

    const PREFERRED = {
        stable_control:'Arteta_Control433_bal3', pressure_escape:'Pep_BoxControl_bal2', pressure_counter:'Compact_Counter_def3',
        press_cooldown:'Pep_PressCooldown_bal2', controlled_chase:'Pep_ControlledPush_att3', positional_siege:'Pep_TwoThreeFive_att3',
        width_attack:'Conte_WingbackWidth_bal4', protect_lead:'Simeone_Compact442_def4', emergency_lock:'Simeone_LowBlock_def5',
        late_high_pressure:'Klopp_Gegenpress_att4', final_all_in:'Bielsa_ChaosPress_att5'
    };

    function hardVeto(name, context = {}) {
        const c = normalizedContext(context), situation = classify(c), reasons = [];
        if (!ACTIVE_SET.has(name)) reasons.push('preset отсутствует в active registry');
        if (name === 'Compact_Counter_def3' && !(c.counterExitAvailable && !c.counterExitBlocked)) reasons.push('Compact Counter требует подтверждённый outlet; слабость команды не является основанием');
        if (name === 'Simeone_LowBlock_def5' && situation !== 'emergency_lock') reasons.push('Low Block только временный emergency lock');
        if (name === 'Simeone_Compact442_def4' && c.scoreState === 'losing') reasons.push('защитный 4-4-2 запрещён при проигрыше');
        if (name === 'Pep_PressCooldown_bal2' && c.scoreState === 'losing' && c.minute >= 70 && c.attackNeed >= 55) reasons.push('поздний проигрыш требует продвижения, а не cooldown');
        if (name === 'Pep_TwoThreeFive_att3' && (c.transitionThreat || c.underPressure || c.pressFatigueRisk || c.highBadActions)) reasons.push('3-2-5 запрещён при transition threat/fatigue/браке');
        if (name === 'Klopp_Gegenpress_att4' && !['late_high_pressure','final_all_in'].includes(situation)) reasons.push('Klopp только поздняя погоня');
        if (name === 'Bielsa_ChaosPress_att5' && situation !== 'final_all_in') reasons.push('Bielsa только финальный all-in');
        if (['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'].includes(name) && (c.pressFatigueRisk || c.highBadActions || c.ownRedCard || c.myPowerDropPct >= 5)) reasons.push('дорогой прессинг запрещён по fatigue/браку/удалению');
        if (c.scoreState === 'winning' && c.minute >= 70 && ['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5','Pep_TwoThreeFive_att3'].includes(name)) reasons.push('позднее преимущество не требует high/all-in риска');
        return { vetoed:reasons.length > 0, reasons };
    }

    function choose(context = {}, snapshot = {}) {
        const c = normalizedContext(context), situation = classify(c);
        let name = PREFERRED[situation] || 'Arteta_Control433_bal3';
        if (hardVeto(name, c).vetoed) name = registry.choosePreset?.(c, snapshot)?.name || 'Arteta_Control433_bal3';
        if (!ACTIVE_SET.has(name) || hardVeto(name, c).vetoed) name = situation === 'pressure_escape' ? 'Pep_BoxControl_bal2' : 'Arteta_Control433_bal3';
        return { name, situation, reason:`${situation}: ${registry.meta?.[name]?.use || 'tactical suite v7'}` };
    }

    function shortestStep(from, to) {
        if (!from || !to || from === to || !STEP[from] || !STEP[to]) return to;
        const queue = [[from]], seen = new Set([from]);
        while (queue.length) {
            const path = queue.shift(), node = path[path.length - 1];
            for (const next of STEP[node] || []) {
                if (seen.has(next)) continue;
                const candidate = path.concat(next);
                if (next === to) return candidate[1] || to;
                seen.add(next); queue.push(candidate);
            }
        }
        return to;
    }

    function currentRisk() {
        try {
            const value = window.localStorage?.getItem('slf:tactics:risk-appetite');
            return ['conservative','standard','bold','experimental'].includes(value) ? value : DEFAULT_RISK;
        } catch (_) { return DEFAULT_RISK; }
    }

    function stamp(snapshot, decision, name) {
        if (!snapshot || typeof snapshot !== 'object') return;
        snapshot.ruleDecision = decision || snapshot.ruleDecision || null;
        snapshot.tacticTelemetry = Object.assign({}, snapshot.tacticTelemetry || {}, {
            libraryVersion:SUITE,
            recommendationSchema:SCHEMA,
            riskAppetite:currentRisk(),
            recommendedPreset:name || decision?.action?.preset || null
        });
    }

    const originalRun = engine.run.bind(engine);
    engine.run = function runTacticalSuiteV7(snapshot, context = {}) {
        const result = originalRun(snapshot, context) || {};
        const c = normalizedContext(Object.assign({}, result?.moment?.context || {}, context));
        const selected = choose(c, snapshot);
        const candidates = ACTIVE.map(name => {
            const veto = hardVeto(name, c);
            return { preset:name, score:name === selected.name ? 100 : 0, rawScore:name === selected.name ? 100 : 0, vetoed:veto.vetoed, vetoReasons:veto.reasons, reasons:[], parts:{} };
        });
        result.schema = SCHEMA;
        result.situationKey = selected.situation;
        result.libraryVersion = SUITE;
        result.riskAppetite = currentRisk();
        result.action = Object.assign({}, result.action || {}, {
            preset:selected.name,
            decision:selected.situation,
            ruleId:`suite_v7_${selected.situation}`,
            reason:selected.reason,
            riskAppetite:result.riskAppetite,
            libraryVersion:SUITE,
            recommendationSchema:SCHEMA,
            guardType:'suite_v7_selection',
            guardReason:'central tactical suite v7 decision'
        });
        result.candidates = candidates;
        result.vetoedPresets = Object.fromEntries(candidates.filter(item => item.vetoed).map(item => [item.preset,item.vetoReasons]));
        stamp(snapshot, result, selected.name);
        return result;
    };
    engine.schema = SCHEMA;
    engine.ACTIVE_PRESETS = ACTIVE.slice();
    engine.__tacticSuiteV7Installed = true;
    engine.__generator561RuleScorerApplied = true;
    engine.__generator561PressureResponseApplied = true;

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
        const originalGuard = typeof RecommendationEngine.applyProgressionGuard === 'function' ? RecommendationEngine.applyProgressionGuard : null;
        RecommendationEngine.getPresetLadder = group => (registry.ladders?.[group] || []).slice();
        RecommendationEngine.getAdjacentPresetInFamily = (current, desired) => {
            const step = shortestStep(current, desired);
            return ACTIVE_SET.has(step) ? step : desired;
        };
        RecommendationEngine.selectRawPreset = function selectSuiteV7(snapshot, state = {}) {
            const decision = window.SLFCurrentActionHintEngine?.run ? window.SLFCurrentActionHintEngine.run(snapshot || {}, state || {}) : null;
            const name = ACTIVE_SET.has(decision?.action?.preset) ? decision.action.preset : 'Arteta_Control433_bal3';
            stamp(snapshot, decision, name);
            return { name, reason:decision?.action?.reason || 'tactical suite v7 fallback', ruleDecision:decision, progressionAction:'suite_v7_scored' };
        };
        if (originalGuard) RecommendationEngine.applyProgressionGuard = function applySuiteV7Guard(candidate, snapshot, context = {}) {
            if (!candidate?.name || !ACTIVE_SET.has(candidate.name) || !snapshot || snapshot.status === 'finished') return candidate;
            let guarded = ['Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'].includes(candidate.name) || context?.urgency?.overrideProgressionGuard === true
                ? Object.assign({}, candidate, { progressionAction:'emergency_override' })
                : (originalGuard.call(this, candidate, snapshot, context) || candidate);
            if (!ACTIVE_SET.has(guarded?.name)) guarded = candidate;
            if (snapshot?.ruleDecision?.action) {
                snapshot.ruleDecision.action.preset = guarded.name;
                snapshot.ruleDecision.action.reason = guarded.reason || candidate.reason;
                snapshot.ruleDecision.action.guardType = guarded.progressionAction || 'selected';
                snapshot.ruleDecision.action.guardReason = guarded.reason || candidate.reason;
                snapshot.ruleDecision.action.libraryVersion = SUITE;
                snapshot.ruleDecision.action.recommendationSchema = SCHEMA;
                if (snapshot.ruleDecision.telemetry) snapshot.ruleDecision.telemetry.recommendedPreset = guarded.name;
            }
            stamp(snapshot, snapshot?.ruleDecision || candidate.ruleDecision, guarded.name);
            return guarded;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561PressureResponseApplied = true;
        RecommendationEngine.__tacticSuiteV7Installed = true;
    }

    if (typeof BASE_PRESETS !== 'undefined' && BASE_PRESETS) {
        Object.entries(registry.presets || {}).forEach(([name,preset]) => { BASE_PRESETS[name] = Object.assign({}, preset, { priority:(preset.priority || []).slice() }); });
    }
    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        TacticPresetLibrary.meta = Object.assign({}, registry.meta || {});
        TacticPresetLibrary.traits = Object.assign({}, registry.traits || {});
        TacticPresetLibrary.schemeStates = Object.assign({}, registry.schemeStates || {});
        TacticPresetLibrary.presetSchemeState = Object.assign({}, registry.presetSchemeState || {});
    }

    registry.ruleDecisionSchema = SCHEMA;
    registry.defaultRiskAppetite = DEFAULT_RISK;
    window.SLFTacticDirectionPolicy = {
        version:VERSION, suiteVersion:SUITE, recommendationSchema:SCHEMA, generatorVersion:'5.61', autoApply:false,
        activePresets:ACTIVE.slice(), defaultRiskAppetite:DEFAULT_RISK,
        deriveSuiteContext:normalizedContext, classifySituation:classify, hardVeto, shortestStep,
        preferredPreset:situation => PREFERRED[situation] || 'Arteta_Control433_bal3',
        evaluate:(snapshot={},context={}) => window.SLFCurrentActionHintEngine?.run ? window.SLFCurrentActionHintEngine.run(snapshot,context) : null
    };
})();