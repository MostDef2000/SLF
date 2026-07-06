// Stage 2.2: Moment Drift & Adaptation Engine
// ============================================================
// Detects how the live moment is changing across adjacent snapshots and
// produces a compact adaptation read for the current match.
//
// Contract boundaries:
// - no ML training;
// - no simulation engine;
// - no external API calls;
// - no backend writes;
// - no persistent cross-match cache;
// - localStorage memory is per-game and compact.

const MomentDriftAdaptationEngine = {
    schema: 'slf_moment_drift_adaptation_v1',
    storageKeyPrefix: 'slf_moment_drift_adaptation',
    maxHistory: 8,

    clamp(value, min = 0, max = 1) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    },

    num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    },

    getStorageKey(gameId) {
        return `${this.storageKeyPrefix}:${gameId || 'unknown'}`;
    },

    loadHistory(gameId) {
        try {
            const raw = localStorage.getItem(this.getStorageKey(gameId));
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed.filter(Boolean).slice(-this.maxHistory) : [];
        } catch (e) {
            return [];
        }
    },

    saveHistory(gameId, history) {
        try {
            const compact = (Array.isArray(history) ? history : [])
                .filter(Boolean)
                .slice(-this.maxHistory);
            localStorage.setItem(this.getStorageKey(gameId), JSON.stringify(compact));
        } catch (e) {
            // Do not let storage limits break runtime recommendations.
        }
    },

    compactPoint(snapshot, inference, action) {
        const metrics = inference?.metrics || {};
        return {
            schema: 'slf_moment_drift_point_v1',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || inference?.gameId || '',
            bucket: snapshot?.bucket || inference?.bucket || '',
            minute: this.num(inference?.minute ?? snapshot?.minute, 0),
            moment: inference?.moment || '',
            priority: this.num(inference?.priority, 0),
            confidence: this.num(inference?.confidence, 0),
            signals: Array.isArray(inference?.signals) ? inference.signals.slice(0, 12) : [],
            actionDecision: action?.decision || '',
            actionPreset: action?.preset || '',
            risk: action?.risk || '',
            metrics: {
                myXg: this.num(metrics.myXg, 0),
                oppXg: this.num(metrics.oppXg, 0),
                myXT: this.num(metrics.myXT, 0),
                oppXT: this.num(metrics.oppXT, 0),
                myBad: this.num(metrics.myBad, 0),
                strengthGap: this.num(metrics.strengthGap, 0),
                oppPress: this.num(metrics.oppPress, 0),
                oppDef: this.num(metrics.oppDef, 0),
                scoreDiff: this.num(metrics.scoreDiff, 0)
            }
        };
    },

    delta(current, previous, path) {
        const get = (obj, keys) => keys.reduce((acc, key) => acc && acc[key] != null ? acc[key] : null, obj);
        const keys = String(path || '').split('.').filter(Boolean);
        return this.num(get(current, keys), 0) - this.num(get(previous, keys), 0);
    },

    getTrend(current, previous) {
        if (!current || !previous) {
            return {
                direction: 'first_sample',
                score: 0,
                reasons: ['первый live inference sample для этого матча'],
                deltas: {}
            };
        }

        const deltas = {
            xgBalance: this.delta(current, previous, 'metrics.myXg') - this.delta(current, previous, 'metrics.oppXg'),
            xtBalance: this.delta(current, previous, 'metrics.myXT') - this.delta(current, previous, 'metrics.oppXT'),
            badActions: this.delta(current, previous, 'metrics.myBad'),
            strengthGap: this.delta(current, previous, 'metrics.strengthGap'),
            oppPress: this.delta(current, previous, 'metrics.oppPress'),
            priority: this.delta(current, previous, 'priority'),
            scoreDiff: this.delta(current, previous, 'metrics.scoreDiff')
        };

        const reasons = [];
        let score = 0;

        if (deltas.xgBalance >= 0.25) { score += 2; reasons.push('баланс xG улучшился'); }
        if (deltas.xgBalance <= -0.25) { score -= 2; reasons.push('баланс xG ухудшился'); }
        if (deltas.xtBalance >= 0.18) { score += 1.5; reasons.push('баланс xT улучшился'); }
        if (deltas.xtBalance <= -0.18) { score -= 1.5; reasons.push('баланс xT ухудшился'); }
        if (deltas.badActions <= -3) { score += 1; reasons.push('брак снижается'); }
        if (deltas.badActions >= 3) { score -= 1; reasons.push('брак растёт'); }
        if (deltas.strengthGap <= -8) { score -= 0.75; reasons.push('силовой контекст ухудшается'); }
        if (deltas.strengthGap >= 8) { score += 0.75; reasons.push('силовой контекст улучшается'); }
        if (deltas.priority >= 2) { score -= 1.25; reasons.push('приоритет момента резко вырос'); }
        if (deltas.scoreDiff > 0) { score += 2; reasons.push('счёт улучшился'); }
        if (deltas.scoreDiff < 0) { score -= 2; reasons.push('счёт ухудшился'); }

        let direction = 'stable';
        if (score >= 2) direction = 'improving';
        else if (score <= -2) direction = 'worsening';
        else if (score > 0.5) direction = 'slightly_improving';
        else if (score < -0.5) direction = 'slightly_worsening';

        return {
            direction,
            score: Number(score.toFixed(2)),
            reasons: reasons.length ? reasons : ['значимого drift между срезами нет'],
            deltas
        };
    },

    detectOpponentAdaptation(history, current) {
        const rows = [...(history || []), current].filter(Boolean).slice(-4);
        if (rows.length < 3) {
            return {
                detected: false,
                type: 'insufficient_history',
                reason: 'нужно минимум 3 live inference samples',
                confidence: 0.2
            };
        }

        const signalCounts = {};
        rows.forEach(row => {
            (row.signals || []).forEach(signal => {
                signalCounts[signal] = (signalCounts[signal] || 0) + 1;
            });
        });

        const repeated = Object.entries(signalCounts)
            .filter(([, count]) => count >= 3)
            .map(([signal]) => signal);

        if (repeated.includes('opponent_high_press')) {
            return {
                detected: true,
                type: 'repeated_high_press',
                reason: 'соперник несколько срезов подряд держит высокий прессинг',
                counter: 'использовать bait/release за линию прессинга, не повышать лишний риск в центре',
                confidence: 0.68
            };
        }

        if (repeated.includes('opponent_low_block')) {
            return {
                detected: true,
                type: 'repeated_low_block',
                reason: 'соперник стабильно садится низко',
                counter: 'терпеливо вскрывать через ширину/полупространства, не спамить слепые навесы',
                confidence: 0.64
            };
        }

        if (repeated.includes('under_pressure')) {
            return {
                detected: true,
                type: 'sustained_pressure',
                reason: 'давление соперника повторяется несколько срезов подряд',
                counter: 'стабилизировать структуру и закрыть переходы до следующего окна',
                confidence: 0.7
            };
        }

        if (repeated.includes('attacking_momentum')) {
            return {
                detected: true,
                type: 'sustained_own_momentum',
                reason: 'наш атакующий momentum держится несколько срезов',
                counter: 'можно поддержать текущий plan без резкой смены семейства',
                confidence: 0.58
            };
        }

        return {
            detected: false,
            type: 'no_clear_adaptation',
            reason: 'повторяющийся паттерн соперника пока не выделен',
            confidence: 0.35
        };
    },

    detectPresetDrift(history, current) {
        const previous = (history || []).slice(-1)[0] || null;
        if (!previous) {
            return {
                status: 'unknown',
                reason: 'нет предыдущего live action для сравнения',
                confidence: 0.25
            };
        }

        const samePreset = previous.actionPreset && current.actionPreset && previous.actionPreset === current.actionPreset;
        const riskUp = this.riskRank(current.risk) > this.riskRank(previous.risk);
        const priorityUp = current.priority - previous.priority >= 2;
        const worseBalance = (current.metrics.myXg - current.metrics.oppXg) < (previous.metrics.myXg - previous.metrics.oppXg) - 0.3;

        if (samePreset && (riskUp || priorityUp || worseBalance)) {
            return {
                status: 'decay_warning',
                reason: 'текущий preset/план держится, но live moment ухудшается',
                confidence: 0.63
            };
        }

        if (samePreset) {
            return {
                status: 'hold_ok',
                reason: 'preset не менялся и явного ухудшения нет',
                confidence: 0.54
            };
        }

        return {
            status: 'changed',
            reason: `live action изменился: ${previous.actionPreset || '?'} → ${current.actionPreset || '?'}`,
            confidence: 0.58
        };
    },

    riskRank(risk) {
        const map = { low: 1, medium: 2, high: 3, critical: 4 };
        return map[String(risk || '').toLowerCase()] || 0;
    },

    buildDecision(trend, adaptation, presetDrift, action) {
        if (presetDrift.status === 'decay_warning') {
            return {
                decision: 'recheck_current_plan',
                reason: presetDrift.reason,
                nextActionBias: 'allow_family_change_if_next_snapshot_confirms',
                risk: 'high'
            };
        }

        if (trend.direction === 'worsening') {
            return {
                decision: 'adapt_now_or_next_snapshot',
                reason: trend.reasons[0] || 'момент ухудшается',
                nextActionBias: adaptation?.counter || action?.reason || 'снизить риск и стабилизировать структуру',
                risk: 'high'
            };
        }

        if (adaptation.detected && adaptation.type !== 'sustained_own_momentum') {
            return {
                decision: 'counter_detected_pattern',
                reason: adaptation.reason,
                nextActionBias: adaptation.counter,
                risk: 'medium'
            };
        }

        if (trend.direction === 'improving' || adaptation.type === 'sustained_own_momentum') {
            return {
                decision: 'hold_or_small_step',
                reason: trend.reasons[0] || adaptation.reason || 'момент улучшается',
                nextActionBias: 'не ломать baseline без сильного отрицательного сигнала',
                risk: 'low'
            };
        }

        return {
            decision: 'monitor_next_window',
            reason: 'drift нейтральный, продолжить наблюдение до следующего snapshot',
            nextActionBias: action?.reason || 'держать текущую логику решения',
            risk: action?.risk || 'low'
        };
    },

    evaluate(snapshot, inference, action) {
        if (!snapshot || !inference) return null;

        const gameId = snapshot.gameId || inference.gameId || '';
        const history = this.loadHistory(gameId);
        const current = this.compactPoint(snapshot, inference, action || {});
        const previous = history.slice(-1)[0] || null;
        const trend = this.getTrend(current, previous);
        const adaptation = this.detectOpponentAdaptation(history, current);
        const presetDrift = this.detectPresetDrift(history, current);
        const decision = this.buildDecision(trend, adaptation, presetDrift, action || {});

        const result = {
            schema: this.schema,
            gameId,
            bucket: current.bucket,
            minute: current.minute,
            generatedAt: Date.now(),
            trend,
            adaptation,
            presetDrift,
            decision,
            historySize: history.length + 1,
            source: 'local_live_moment_history'
        };

        this.saveHistory(gameId, [...history, current]);
        return result;
    },

    toPlanRows(result) {
        if (!result) return [];
        const rows = [];
        if (result.trend) rows.push(`Drift: ${result.trend.direction} (${result.trend.reasons?.[0] || 'без явного изменения'}).`);
        if (result.adaptation?.detected) rows.push(`Adaptation: ${result.adaptation.reason}. Контр-идея: ${result.adaptation.counter}.`);
        if (result.presetDrift?.status === 'decay_warning') rows.push(`Preset drift: ${result.presetDrift.reason}.`);
        if (result.decision) rows.push(`Next bias: ${result.decision.decision} — ${result.decision.nextActionBias}.`);
        return rows;
    }
};

if (typeof window !== 'undefined') {
    window.SLFMomentDriftAdaptationEngine = MomentDriftAdaptationEngine;
}
