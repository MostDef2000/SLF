// Moment Drift Stabilizer
// ============================================================
// Stabilizes button-generated tactical hints so the recommendation
// does not jump on every noisy snapshot.
//
// Contract:
// - in-memory only;
// - no localStorage;
// - no explanation layer;
// - emergency/protect-lead states can override the hold window;
// - explicit manual hint clicks recompute immediately.

(function momentDriftStabilizer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__momentDriftStabilizerApplied) return;

    const HOLD_MINUTES = 6;
    const HOLD_MS = 6 * 60 * 1000;
    const HARD_OVERRIDE_RULES = new Set([
        'late_goal_emergency',
        'late_protect_heavy_pressure',
        'own_press_fatigue_cooldown',
        'bad_actions_control_reset'
    ]);

    let stableState = null;

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function getContext(result) {
        return result?.moment?.context || {};
    }

    function getMinute(result) {
        return Number(result?.moment?.minute ?? getContext(result).minute ?? 0) || 0;
    }

    function getScore(result) {
        return String(result?.moment?.score ?? getContext(result).scoreState ?? 'unknown');
    }

    function getGameId(result) {
        return String(result?.moment?.gameId ?? getContext(result).gameId ?? 'unknown');
    }

    function isManualHint(result) {
        const context = getContext(result);
        return !!(
            context.manualHintRequest ||
            context.coachHintSnapshotContext?.active ||
            result?.action?.snapshotContextBridge
        );
    }

    function isHardOverride(result) {
        const action = result?.action || {};
        const context = getContext(result);

        if (HARD_OVERRIDE_RULES.has(action.ruleId)) return true;
        if (action.presetStatus === 'emergency') return true;
        if (context.lateNeedGoal) return true;
        if (context.protectLead && context.underPressure && Number(context.minute || 0) >= 80) return true;

        return false;
    }

    function shouldReset(result) {
        if (!stableState) return true;

        const minute = getMinute(result);
        const score = getScore(result);
        const gameId = getGameId(result);

        if (stableState.gameId !== gameId) return true;
        if (stableState.score !== score) return true;
        if (minute < stableState.minute) return true;

        return false;
    }

    function remember(result) {
        if (!result?.action) return result;

        stableState = {
            gameId: getGameId(result),
            score: getScore(result),
            minute: getMinute(result),
            ts: Date.now(),
            action: Object.assign({}, result.action, {
                stabilized: false,
                rawPreset: result.action.rawPreset || result.action.preset
            })
        };

        result.action = Object.assign({}, stableState.action);
        return result;
    }

    function stabilize(result) {
        if (!result?.action) return result;

        if (isManualHint(result)) {
            return remember(result);
        }

        if (shouldReset(result) || isHardOverride(result)) {
            return remember(result);
        }

        const candidate = Object.assign({}, result.action);
        const minute = getMinute(result);
        const now = Date.now();

        if (stableState.action?.preset === candidate.preset) {
            stableState.minute = minute;
            stableState.ts = now;
            stableState.score = getScore(result);
            stableState.action = Object.assign({}, candidate, {
                stabilized: false,
                rawPreset: candidate.rawPreset || candidate.preset
            });
            result.action = Object.assign({}, stableState.action);
            return result;
        }

        const elapsedMinutes = Math.max(0, minute - Number(stableState.minute || 0));
        const elapsedMs = now - Number(stableState.ts || 0);
        const expired = elapsedMinutes >= HOLD_MINUTES || elapsedMs >= HOLD_MS;

        if (expired) {
            return remember(result);
        }

        result.action = Object.assign({}, stableState.action, {
            stabilized: true,
            rawPreset: candidate.preset,
            rawRuleId: candidate.ruleId
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithMomentDriftStabilizer(snapshot, context = {}) {
        return stabilize(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.toPlanRows = function toHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__momentDriftStabilizerApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFMomentDriftStabilizer = {
            holdMinutes: HOLD_MINUTES,
            getState: () => stableState ? Object.assign({}, stableState) : null,
            reset: () => { stableState = null; }
        };
    }
})();
