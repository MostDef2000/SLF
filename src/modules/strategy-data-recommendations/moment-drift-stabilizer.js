// Moment Drift Stabilizer
// ============================================================
// Tactical Suite v7 centralizes one-step progression and anti-ping-pong.
// This late compatibility layer therefore records drift state only and never
// substitutes another preset after the central decision.

(function momentDriftStabilizer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__momentDriftStabilizerApplied) return;

    const HOLD_MINUTES = 6;
    let stableState = null;
    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function remember(result) {
        if (!result?.action) return result;
        const context = result?.moment?.context || {};
        stableState = {
            gameId:String(result?.moment?.gameId || context.gameId || 'unknown'),
            score:String(result?.moment?.score || context.scoreState || 'unknown'),
            minute:Number(result?.moment?.minute ?? context.minute ?? 0),
            ts:Date.now(),
            preset:result.action.preset
        };
        result.action = Object.assign({}, result.action, {
            stabilized:false,
            driftOwner:CurrentActionHintEngine.__tacticSuiteV7Installed ? 'tactical_suite_v7_progression' : 'legacy',
            rawPreset:result.action.rawPreset || result.action.preset
        });
        return result;
    }

    CurrentActionHintEngine.run = function runWithDriftMetadata(snapshot, context = {}) {
        return remember(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.toPlanRows = function toHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__momentDriftStabilizerApplied = true;
    CurrentActionHintEngine.__momentDriftSuiteV7Passive = !!CurrentActionHintEngine.__tacticSuiteV7Installed;

    if (typeof window !== 'undefined') {
        window.SLFMomentDriftStabilizer = {
            holdMinutes:HOLD_MINUTES,
            selectionOwner:'tactical_suite_v7',
            getState:() => stableState ? Object.assign({}, stableState) : null,
            reset:() => { stableState = null; }
        };
    }
})();