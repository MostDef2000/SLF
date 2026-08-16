// Coach Mode Policy Compatibility Layer
// ============================================================
// Tactical Suite v7 owns preset selection. This late layer may annotate
// coach-phase metadata, but it must never replace the v7 selected preset.

(function coachModeV1Policy() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__coachModeV1Applied) return;

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function phaseOf(minute) {
        const m = Number(minute || 0);
        if (m <= 30) return 'caution';
        if (m <= 55) return 'correction';
        if (m <= 70) return 'first_active_change';
        if (m <= 80) return 'risk_or_protect';
        return 'emergency';
    }

    function signalStrength(context = {}) {
        if (context.lateNeedGoal || context.emergencyLockRequired || (context.protectLead && context.minute >= 80)) return 5;
        return [
            context.needGoal,
            context.underPressure,
            context.attackingMomentum,
            context.opponentHighPress,
            context.centerClosed,
            context.wideQuality,
            context.transitionThreat,
            context.pressFatigueRisk,
            context.highBadActions
        ].filter(Boolean).length;
    }

    CurrentActionHintEngine.run = function runWithCoachMetadata(snapshot, context = {}) {
        const result = originalRun(snapshot, context);
        if (!result?.action) return result;
        const c = result?.moment?.context || {};
        result.action = Object.assign({}, result.action, {
            coachMode: CurrentActionHintEngine.__tacticSuiteV7Installed ? 'suite_v7' : 'legacy_compat',
            matchPhase: phaseOf(c.minute ?? result?.moment?.minute),
            coachSignalStrength: signalStrength(c),
            rawPreset: result.action.rawPreset || result.action.preset
        });
        return result;
    };

    CurrentActionHintEngine.toPlanRows = function toCoachHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__coachModeV1Applied = true;
    CurrentActionHintEngine.__coachModeSuiteV7Passive = !!CurrentActionHintEngine.__tacticSuiteV7Installed;

    if (typeof window !== 'undefined') {
        window.SLFCoachModeV1 = { phaseOf, signalStrength, selectionOwner:'tactical_suite_v7' };
    }
})();