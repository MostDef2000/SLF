// Coach Mode v1 Policy Guard
// ============================================================
// Final intermediate coaching layer for on-demand tactical hints.
//
// Contract:
// - no explanations in UI output;
// - no new presets;
// - suppress obvious anti-patterns;
// - apply simple match phase policy;
// - require sufficient signal strength unless emergency/protect conditions apply.

(function coachModeV1Policy() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__coachModeV1Applied) return;

    const SAFE_CONTROL = 'Pep_BoxControl_bal2';
    const STRUCTURE_CONTROL = 'Arteta_Control433_bal3';
    const PRESS_COOLDOWN = 'Pep_PressCooldown_bal2';
    const COMPACT_COUNTER = 'Compact_Counter_def3';
    const COMPACT_PROTECT = 'Simeone_Compact442_def4';
    const CONTROLLED_PUSH = 'Pep_ControlledPush_att3';

    const HIGH_PRESS_PRESETS = new Set([
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5'
    ]);

    const CENTER_PRESETS = new Set([
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3'
    ]);

    const CROSS_WIDTH_PRESETS = new Set([
        'Conte_WingbackWidth_bal4',
        'Nagelsmann_WidePress_att4'
    ]);

    const AGGRESSIVE_POSSESSION_PRESETS = new Set([
        'Pep_TwoThreeFive_att3',
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5'
    ]);

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function contextOf(result) {
        return result?.moment?.context || {};
    }

    function phaseOf(minute) {
        const m = Number(minute || 0);
        if (m <= 30) return 'caution';
        if (m <= 55) return 'correction';
        if (m <= 70) return 'first_active_change';
        if (m <= 80) return 'risk_or_protect';
        return 'emergency';
    }

    function countTrue(values) {
        return values.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    }

    function signalStrength(c) {
        if (c.lateNeedGoal || (c.protectLead && c.minute >= 80) || c.highBadActions || c.pressFatigueRisk) return 5;

        return countTrue([
            c.needGoal,
            c.underPressure,
            c.attackingMomentum,
            c.opponentHighPress,
            c.opponentLowBlock,
            c.centerWeak,
            c.centerClosed,
            c.wideQuality,
            c.spaceBehind,
            c.weakSideAvailable,
            c.transitionThreat,
            c.ownCrossesBad,
            c.opponentCrossesDangerous
        ]);
    }

    function allowedFallback(preset, c, phase) {
        if (c.pressFatigueRisk) return PRESS_COOLDOWN;
        if (c.highBadActions) return SAFE_CONTROL;
        if (c.protectLead) return phase === 'emergency' ? 'Simeone_LowBlock_def5' : COMPACT_PROTECT;
        if (c.underPressure || c.transitionThreat) return COMPACT_COUNTER;
        if (c.needGoal) return CONTROLLED_PUSH;
        return STRUCTURE_CONTROL;
    }

    function violatesAntiPattern(preset, c, phase) {
        if (!preset) return true;

        if (c.highBadActions && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (c.pressFatigueRisk && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (c.pressFatigueRisk && preset === 'Pep_TwoThreeFive_att3') return true;

        if (c.needGoal && phase !== 'emergency' && preset === 'Simeone_LowBlock_def5') return true;
        if (c.needGoal && preset === COMPACT_PROTECT && !c.underPressure) return true;

        if (c.centerClosed && CENTER_PRESETS.has(preset)) return true;
        if (c.ownCrossesBad && CROSS_WIDTH_PRESETS.has(preset)) return true;
        if (c.transitionThreat && AGGRESSIVE_POSSESSION_PRESETS.has(preset) && !c.lateNeedGoal) return true;

        if (c.protectLead && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (phase === 'caution' && HIGH_PRESS_PRESETS.has(preset) && !c.underPressure) return true;
        if (phase === 'caution' && preset === 'Bielsa_ChaosPress_att5') return true;

        return false;
    }

    function belowConfidenceThreshold(result, c, phase) {
        if (phase === 'emergency') return false;
        if (c.highBadActions || c.pressFatigueRisk || c.protectLead || c.needGoal) return false;
        return signalStrength(c) < 2;
    }

    function applyCoachPolicy(result) {
        if (!result?.action) return result;

        const c = contextOf(result);
        const phase = phaseOf(c.minute ?? result?.moment?.minute);
        const candidatePreset = result.action.preset;
        let nextPreset = candidatePreset;

        if (belowConfidenceThreshold(result, c, phase)) {
            nextPreset = allowedFallback(candidatePreset, c, phase);
        }

        if (violatesAntiPattern(nextPreset, c, phase)) {
            nextPreset = allowedFallback(nextPreset, c, phase);
        }

        result.action = Object.assign({}, result.action, {
            preset: nextPreset,
            coachMode: 'v1',
            matchPhase: phase,
            confidence: signalStrength(c),
            rawPreset: result.action.rawPreset || candidatePreset
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithCoachModePolicy(snapshot, context = {}) {
        return applyCoachPolicy(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.toPlanRows = function toCoachHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__coachModeV1Applied = true;

    if (typeof window !== 'undefined') {
        window.SLFCoachModeV1 = {
            phaseOf,
            signalStrength
        };
    }
})();
