// Signal Noise Filter Layer
// ============================================================
// Stage 2.4 guard for tactical hints.
// Filters short-lived signal spikes before CurrentActionHintEngine
// makes an on-demand recommendation.
//
// Contract:
// - in-memory only;
// - no localStorage;
// - no UI explanation layer;
// - score/minute emergency logic remains unfiltered;
// - stable signals require repeat confirmation across recent samples.

(function signalNoiseFilterLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__signalNoiseFilterApplied) return;

    const HISTORY_LIMIT = 4;
    const MIN_CONFIRMATIONS = 2;

    const ALWAYS_KEEP_SIGNALS = new Set([
        'need_goal',
        'late_need_goal',
        'protect_lead',
        'press_fatigue_risk',
        'own_press_fatigue',
        'press_cost_high',
        'high_bad_actions'
    ]);

    const NOISY_SIGNALS = new Set([
        'attacking_momentum',
        'under_pressure',
        'opponent_high_press',
        'own_high_press',
        'intensive_pressing',
        'pressing_player',
        'player_pressing',
        'center_weak',
        'center_available',
        'center_closed',
        'wide_quality',
        'wide_advantage',
        'attack_left',
        'attack_right',
        'space_behind',
        'opponent_high_line',
        'release_space',
        'weak_side_available',
        'opponent_flank_weak',
        'opponent_low_block',
        'transition_threat',
        'opponent_fast_counter_threat',
        'opponent_crosses_dangerous',
        'own_crosses_bad_total',
        'own_open_play_crosses_bad'
    ]);

    const metricKeys = [
        'myXg', 'myXG', 'oppXg', 'oppXG',
        'myXT', 'oppXT',
        'myBad', 'badActionsPct', 'myBadActionsPct',
        'oppPress', 'oppPressVector', 'opponentPress', 'opponentPressing',
        'myPress', 'myPressVector', 'ownPress', 'ownPressVector',
        'oppDef', 'oppDefVector'
    ];

    const historyByGame = new Map();
    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function getMetric(source, keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
            if (source && source[key] !== undefined && source[key] !== null) return source[key];
        }
        return undefined;
    }

    function getGameId(snapshot, context) {
        return String(
            getMetric(context, ['gameId', 'matchId', 'id']) ||
            getMetric(snapshot, ['gameId', 'matchId', 'id']) ||
            'unknown'
        );
    }

    function getMinute(snapshot, context) {
        return Number(
            getMetric(context, ['minute', 'baseMinute', 'effectiveMinute']) ??
            getMetric(snapshot, ['minute', 'baseMinute', 'effectiveMinute']) ??
            0
        ) || 0;
    }

    function collectSignals(snapshot, context) {
        const result = [];
        const add = value => {
            if (!value) return;
            const key = String(value);
            if (!result.includes(key)) result.push(key);
        };

        const contextSignals = Array.isArray(context?.signals) ? context.signals : [];
        const snapshotSignals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];

        contextSignals.forEach(add);
        snapshotSignals.forEach(add);

        return result;
    }

    function getHistory(gameId) {
        if (!historyByGame.has(gameId)) historyByGame.set(gameId, []);
        return historyByGame.get(gameId);
    }

    function trimHistoryMap() {
        if (historyByGame.size <= 6) return;
        const keys = Array.from(historyByGame.keys());
        keys.slice(0, Math.max(0, keys.length - 6)).forEach(key => historyByGame.delete(key));
    }

    function extractMetrics(snapshot, context) {
        const metrics = {};

        metricKeys.forEach(key => {
            const value = getMetric(context, key) ?? getMetric(snapshot, key);
            const n = num(value);
            if (n !== null) metrics[key] = n;
        });

        return metrics;
    }

    function rememberSample(gameId, minute, signals, metrics) {
        const history = getHistory(gameId);

        if (history.length && minute < Number(history[history.length - 1].minute || 0)) {
            history.splice(0, history.length);
        }

        history.push({ minute, signals: signals.slice(), metrics: Object.assign({}, metrics), ts: Date.now() });

        while (history.length > HISTORY_LIMIT) history.shift();
        trimHistoryMap();

        return history;
    }

    function countSignal(history, signal) {
        return history.reduce((count, sample) => count + (sample.signals.includes(signal) ? 1 : 0), 0);
    }

    function isStableSignal(signal, history) {
        if (ALWAYS_KEEP_SIGNALS.has(signal)) return true;
        if (!NOISY_SIGNALS.has(signal)) return true;
        return countSignal(history, signal) >= MIN_CONFIRMATIONS;
    }

    function averageMetric(history, key, fallback) {
        const values = history
            .map(sample => num(sample.metrics?.[key]))
            .filter(value => value !== null);

        if (values.length < 2) return fallback;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function smoothMetrics(snapshot, context, history) {
        const smoothed = {};

        metricKeys.forEach(key => {
            const raw = num(getMetric(context, key) ?? getMetric(snapshot, key));
            if (raw === null) return;

            const avg = averageMetric(history, key, raw);
            const maxJump = key.toLowerCase().includes('bad') ? 8 : 0.35;

            if (Math.abs(raw - avg) > maxJump && history.length >= 2) {
                smoothed[key] = avg;
            }
        });

        return smoothed;
    }

    function cloneWithFilteredSignals(source, filteredSignals, smoothedMetrics) {
        if (!source || typeof source !== 'object') return source;

        const clone = Object.assign({}, source);

        if (Array.isArray(source.signals)) {
            clone.signals = filteredSignals.slice();
        }

        Object.entries(smoothedMetrics).forEach(([key, value]) => {
            if (clone[key] !== undefined) clone[key] = value;
        });

        return clone;
    }

    function filterInput(snapshot, context) {
        const gameId = getGameId(snapshot, context || {});
        const minute = getMinute(snapshot, context || {});
        const signals = collectSignals(snapshot, context || {});
        const metrics = extractMetrics(snapshot, context || {});
        const history = rememberSample(gameId, minute, signals, metrics);

        const filteredSignals = signals.filter(signal => isStableSignal(signal, history));
        const smoothedMetrics = smoothMetrics(snapshot, context || {}, history);

        const nextSnapshot = cloneWithFilteredSignals(snapshot, filteredSignals, smoothedMetrics);
        const nextContext = cloneWithFilteredSignals(context || {}, filteredSignals, smoothedMetrics) || {};

        if (Array.isArray(context?.signals) || filteredSignals.length) nextContext.signals = filteredSignals.slice();
        if (Array.isArray(snapshot?.signals) && nextSnapshot) nextSnapshot.signals = filteredSignals.slice();

        nextContext.signalNoiseFilter = {
            active: true,
            gameId,
            minute,
            rawSignals: signals,
            filteredSignals
        };

        return { snapshot: nextSnapshot, context: nextContext };
    }

    CurrentActionHintEngine.run = function runWithSignalNoiseFilter(snapshot, context = {}) {
        const filtered = filterInput(snapshot, context);
        return originalRun(filtered.snapshot, filtered.context);
    };

    CurrentActionHintEngine.__signalNoiseFilterApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFSignalNoiseFilterLayer = {
            getHistory: () => Array.from(historyByGame.entries()).map(([gameId, samples]) => ({ gameId, samples: samples.slice() }))
        };
    }
})();
