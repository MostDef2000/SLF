// Adaptive Opponent Style Layer
// ============================================================
// Opponent-style memory is advisory metadata only. Tactical Suite v7 owns
// selection and eligibility, so this layer must never swap the selected preset.

(function adaptiveOpponentStyleLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__adaptiveOpponentStyleApplied) return;

    const STABLE_THRESHOLD = 3;
    const HISTORY_LIMIT = 8;
    const styleMemory = new Map();
    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function contextOf(result) {
        return result?.moment?.context || {};
    }

    function hasSignal(context, name) {
        return Array.isArray(context?.signals) && context.signals.includes(name);
    }

    function detectSampleStyles(context = {}) {
        const styles = [];
        const add = value => { if (value && !styles.includes(value)) styles.push(value); };
        if (context.opponentHighPress || hasSignal(context, 'opponent_high_press')) add('high_press_team');
        if (context.centerClosed || hasSignal(context, 'opponent_low_block') || hasSignal(context, 'center_closed')) add('low_block_team');
        if (context.transitionThreat || hasSignal(context, 'transition_threat')) add('counter_attack_team');
        if (context.opponentCrossesDangerous || hasSignal(context, 'opponent_crosses_dangerous')) add('wide_cross_team');
        if (context.centerClosed || hasSignal(context, 'center_closed')) add('center_compact_team');
        if (context.underPressure && context.attackingMomentum) add('open_game');
        if (Number(context.oppXT || 0) > Number(context.myXT || 0) + 0.15 && !context.opponentHighPress && !context.transitionThreat) add('possession_team');
        return styles;
    }

    function remember(gameId, minute, styles) {
        const key = String(gameId || 'unknown');
        if (!styleMemory.has(key)) styleMemory.set(key, []);
        const samples = styleMemory.get(key);
        if (samples.length && Number(minute || 0) < Number(samples[samples.length - 1].minute || 0)) samples.splice(0, samples.length);
        samples.push({ minute:Number(minute || 0), styles:styles.slice(), ts:Date.now() });
        while (samples.length > HISTORY_LIMIT) samples.shift();
        if (styleMemory.size > 6) Array.from(styleMemory.keys()).slice(0, styleMemory.size - 6).forEach(old => styleMemory.delete(old));
        return samples;
    }

    function stableStyles(samples) {
        const counts = {};
        samples.forEach(sample => sample.styles.forEach(style => { counts[style] = Number(counts[style] || 0) + 1; }));
        return Object.entries(counts).filter(([, count]) => count >= STABLE_THRESHOLD).sort((a, b) => b[1] - a[1]).map(([style]) => style);
    }

    CurrentActionHintEngine.run = function runWithOpponentStyleMetadata(snapshot, context = {}) {
        const result = originalRun(snapshot, context);
        if (!result?.action) return result;
        const c = contextOf(result);
        const samples = remember(result?.moment?.gameId || c.gameId, result?.moment?.minute ?? c.minute, detectSampleStyles(c));
        result.action = Object.assign({}, result.action, {
            adaptiveCoach:'suite_v7_advisory',
            opponentStyles:stableStyles(samples),
            rawPreset:result.action.rawPreset || result.action.preset
        });
        return result;
    };

    CurrentActionHintEngine.__adaptiveOpponentStyleApplied = true;
    CurrentActionHintEngine.__adaptiveOpponentStyleSuiteV7Passive = !!CurrentActionHintEngine.__tacticSuiteV7Installed;

    if (typeof window !== 'undefined') {
        window.SLFAdaptiveOpponentStyleLayer = {
            selectionOwner:'tactical_suite_v7',
            getMemory:() => Array.from(styleMemory.entries()).map(([gameId, samples]) => ({ gameId, samples:samples.slice() }))
        };
    }
})();