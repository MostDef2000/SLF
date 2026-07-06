// Stage 2.1: Live Moment Inference Layer
// ============================================================
// Rule-based, deterministic live tactical inference overlay.
//
// Contract boundaries:
// - no external API calls;
// - no persistent player-state cache;
// - no full RAG corpus in browser;
// - no simulation / top-3 planner;
// - produces one current moment read and one action recommendation.

const LiveMomentInferenceLayer = {
    schema: 'slf_live_moment_inference_v1',
    storageKeyPrefix: 'slf_live_moment_inference',

    clamp(value, min = 0, max = 1) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    },

    getStorageKey(snapshot) {
        const gameId = snapshot?.gameId || (typeof MatchStateParser !== 'undefined' ? MatchStateParser.getGameId() : 'unknown');
        return `${this.storageKeyPrefix}:${gameId || 'unknown'}`;
    },

    getMinute(snapshot) {
        if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine.getEffectiveMinute) {
            return RecommendationEngine.getEffectiveMinute(snapshot);
        }

        const minute = Number(snapshot?.minute ?? snapshot?.baseMinute ?? 0);
        return Number.isFinite(minute) ? Math.max(0, Math.min(90, minute)) : 0;
    },

    getScoreState(snapshot) {
        if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine.getScoreState) {
            return RecommendationEngine.getScoreState(snapshot);
        }

        return { known: false, diff: 0, state: 'unknown', myGoals: 0, oppGoals: 0 };
    },

    getTeamStats(snapshot) {
        if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine.getTeamStats) {
            const pack = RecommendationEngine.getTeamStats(snapshot);
            return {
                my: pack?.my?.stats || null,
                opp: pack?.opp?.stats || null
            };
        }

        return { my: null, opp: null };
    },

    getXT(snapshot) {
        if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine.getXTForMyTeam) {
            return RecommendationEngine.getXTForMyTeam(snapshot);
        }

        return { myXT: 0, oppXT: 0 };
    },

    buildSignals(snapshot, state = {}) {
        const minute = state.minute ?? this.getMinute(snapshot);
        const score = state.score || this.getScoreState(snapshot);
        const stats = this.getTeamStats(snapshot);
        const my = stats.my || {};
        const opp = stats.opp || {};
        const xt = this.getXT(snapshot);
        const signals = [];
        const reasons = [];

        const add = (signal, reason, weight = 1) => {
            if (!signal || signals.some(item => item.signal === signal)) return;
            signals.push({ signal, reason, weight });
            reasons.push(reason);
        };

        const myXg = num(my.xG);
        const oppXg = num(opp.xG);
        const myBad = num(my.badActionsPct ?? my.defective);
        const oppPress = num(opp.pressVector ?? opp.press_height);
        const oppDef = num(opp.defVector ?? opp.def_height);
        const myPower = num(my.power);
        const oppPower = num(opp.power);
        const strengthGap = myPower - oppPower;

        if (!minute || minute < 15) add('collect_data', 'идёт сбор данных до первого валидного tactical window', 0.4);
        if (score.state === 'winning' && minute >= 70) add('protect_lead', 'ведём после 70-й минуты', 1.1);
        if (score.state === 'losing' && minute >= 55) add('need_goal', 'проигрываем после 55-й минуты', 1.15);
        if (score.state === 'losing' && minute >= 80) add('late_need_goal', 'финальное окно: нужен гол', 1.35);
        if (oppXg > myXg + 0.45 || xt.oppXT > xt.myXT + 0.25) add('under_pressure', 'соперник опаснее по xG/xT', 1.2);
        if (myXg > oppXg + 0.35 || xt.myXT > xt.oppXT + 0.2) add('attacking_momentum', 'у нас лучше атакующий импульс по xG/xT', 1.0);
        if (myBad >= 20) add('high_bad_actions', 'высокий процент брака', 1.0);
        if (oppPress >= 65) add('opponent_high_press', 'соперник высоко прессингует', 0.85);
        if (oppDef > 0 && oppDef <= 45) add('opponent_low_block', 'соперник низко обороняется', 0.85);
        if (strengthGap >= 20) add('strength_advantage', 'у нас заметное преимущество силы на поле', 0.75);
        if (strengthGap <= -20) add('strength_disadvantage', 'мы уступаем по силе на поле', 0.85);

        const quality = snapshot?.generatorQualitySignal || null;
        if (quality?.detected && quality.direction === 'positive') {
            add('generator_quality_positive', 'генератор подтверждает качество текущего baseline', 0.8);
        }
        if (quality?.detected && quality.direction === 'negative') {
            add('generator_quality_negative', 'генератор показывает ухудшение качества игры', 1.0);
        }

        const gep = snapshot?.generatorExpectedPerformance || null;
        if (gep?.defense?.verdict === 'underperforming') add('generator_defense_underperforming', 'оборона хуже ожиданий генератора', 1.1);
        if (gep?.attack?.verdict === 'underperforming') add('generator_attack_underperforming', 'атака хуже ожиданий генератора', 1.0);
        if (gep?.defense?.verdict === 'working') add('generator_defense_working', 'оборона работает по генератору', 0.7);
        if (gep?.attack?.verdict === 'working') add('generator_attack_working', 'атака работает по генератору', 0.7);

        if (!signals.length) add('balanced_control', 'нет сильного триггера для резкой смены', 0.5);

        return {
            signals,
            reasons,
            metrics: {
                minute,
                scoreState: score.state,
                scoreDiff: score.diff,
                myXg,
                oppXg,
                myXT: xt.myXT,
                oppXT: xt.oppXT,
                myBad,
                myPower,
                oppPower,
                strengthGap,
                oppPress,
                oppDef
            }
        };
    },

    classify(snapshot, state = {}) {
        const minute = state.minute ?? this.getMinute(snapshot);
        const signalPack = this.buildSignals(snapshot, state);
        const signalNames = signalPack.signals.map(item => item.signal);
        const s = new Set(signalNames);
        let moment = 'balanced_control';
        let priority = 2;
        let label = 'Контроль';

        if (s.has('collect_data')) {
            moment = 'collect_data';
            priority = 1;
            label = 'Сбор данных';
        } else if (s.has('late_need_goal')) {
            moment = 'late_need_goal';
            priority = 5;
            label = 'Финальный риск ради гола';
        } else if (s.has('protect_lead') && s.has('under_pressure')) {
            moment = 'protect_lead_under_pressure';
            priority = 5;
            label = 'Защита преимущества под давлением';
        } else if (s.has('need_goal')) {
            moment = 'need_goal';
            priority = 4;
            label = 'Нужно усиливать атаку';
        } else if (s.has('under_pressure') && s.has('high_bad_actions')) {
            moment = 'stabilize_under_pressure';
            priority = 5;
            label = 'Стабилизация под давлением';
        } else if (s.has('under_pressure')) {
            moment = 'under_pressure';
            priority = 4;
            label = 'Соперник давит';
        } else if (s.has('attacking_momentum')) {
            moment = 'attacking_momentum';
            priority = 3;
            label = 'Атакующий импульс';
        } else if (s.has('opponent_high_press')) {
            moment = 'counter_high_press';
            priority = 3;
            label = 'Контр-окно против прессинга';
        } else if (s.has('opponent_low_block')) {
            moment = 'break_low_block';
            priority = 3;
            label = 'Вскрытие низкого блока';
        }

        const signalWeight = signalPack.signals.reduce((sum, item) => sum + Number(item.weight || 0), 0);
        const metricPresence = Object.values(signalPack.metrics).filter(value => Number.isFinite(Number(value)) && Number(value) !== 0).length;
        const confidence = this.clamp(0.32 + signalWeight * 0.07 + Math.min(metricPresence, 6) * 0.035);

        return {
            schema: this.schema,
            gameId: snapshot?.gameId || '',
            bucket: snapshot?.bucket || '',
            generationWindow: snapshot?.generationWindow || null,
            minute,
            moment,
            label,
            priority,
            confidence: Number(confidence.toFixed(3)),
            signals: signalNames,
            reasons: signalPack.reasons.slice(0, 6),
            metrics: signalPack.metrics,
            reviewAgain: this.getReviewWindow(snapshot, moment, priority),
            source: 'live_snapshot_rule_inference'
        };
    },

    getReviewWindow(snapshot, moment, priority) {
        const next = snapshot?.generationWindow?.next?.label || '';
        if (moment === 'collect_data') return next ? `первый tactical window: ${next}` : 'когда появятся валидные live-метрики';
        if (priority >= 5) return 'следующий snapshot или резкое изменение xG/xT/счёта';
        if (next) return `следующий generation window: ${next}`;
        return 'следующий generation snapshot';
    },

    selectAction(inference, currentPresetName = '') {
        const s = new Set(inference?.signals || []);
        let preset = 'Pep_BoxControl_bal2';
        let decision = 'balanced_control';
        let reason = 'нет сильного аварийного сигнала';
        let risk = 'low';

        if (s.has('collect_data')) {
            preset = currentPresetName || 'hold_current';
            decision = 'collect_more_data';
            reason = 'до первого tactical window не делать резких изменений';
            risk = 'low';
        } else if (s.has('late_need_goal')) {
            preset = 'Bielsa_ChaosPress_att5';
            decision = 'late_goal_push';
            reason = 'финальное окно требует риска ради гола';
            risk = 'high';
        } else if (s.has('protect_lead') && s.has('under_pressure')) {
            preset = 'Simeone_Compact442_def4';
            decision = 'protect_under_pressure';
            reason = 'ведём, но соперник создаёт давление';
            risk = 'medium';
        } else if (s.has('need_goal') && !s.has('under_pressure')) {
            preset = s.has('high_bad_actions') ? 'Pep_ControlledPush_att3' : 'Klopp_Gegenpress_att4';
            decision = 'step_up_attack';
            reason = 'нужен гол, усиливаем давление с учётом брака';
            risk = 'medium';
        } else if (s.has('under_pressure') && s.has('high_bad_actions')) {
            preset = 'Henta_Hold_def3';
            decision = 'stabilize_errors';
            reason = 'давление соперника плюс высокий брак требуют стабилизации';
            risk = 'high';
        } else if (s.has('under_pressure')) {
            preset = 'Compact_Counter_def3';
            decision = 'absorb_and_counter';
            reason = 'сначала закрыть переходы и оставить быстрый выход';
            risk = 'medium';
        } else if (s.has('opponent_high_press')) {
            preset = 'DeZerbi_BaitPress_bal3';
            decision = 'counter_high_press';
            reason = 'использовать пространство за высоким прессингом';
            risk = 'medium';
        } else if (s.has('opponent_low_block') && s.has('attacking_momentum')) {
            preset = 'Pep_TwoThreeFive_att3';
            decision = 'break_low_block';
            reason = 'есть импульс против низкого блока';
            risk = 'medium';
        } else if (s.has('generator_quality_positive') && currentPresetName) {
            preset = currentPresetName;
            decision = 'hold_positive_baseline';
            reason = 'генератор подтверждает качество текущего baseline';
            risk = 'low';
        }

        return {
            schema: 'slf_live_moment_action_v1',
            preset,
            decision,
            reason,
            risk,
            confidence: inference?.confidence || 0,
            reviewAgain: inference?.reviewAgain || 'следующий snapshot'
        };
    },

    remember(snapshot, inference, action) {
        if (!snapshot?.gameId || snapshot.status === 'finished') return;

        const payload = {
            schema: 'slf_live_moment_memory_v1',
            savedAt: Date.now(),
            gameId: snapshot.gameId,
            bucket: snapshot.bucket || '',
            minute: inference?.minute ?? null,
            inference,
            action
        };

        try {
            localStorage.setItem(this.getStorageKey(snapshot), JSON.stringify(payload));
        } catch (e) {
            // Runtime must not fail because of localStorage limits.
        }
    },

    infer(snapshot, currentPresetName = '', state = {}) {
        if (!snapshot) return null;
        const inference = this.classify(snapshot, state);
        const action = this.selectAction(inference, currentPresetName);
        this.remember(snapshot, inference, action);
        return { inference, action };
    },

    toPlanRows(result) {
        if (!result?.inference || !result?.action) return [];
        const inference = result.inference;
        const action = result.action;
        return [
            `Момент: ${inference.label} (${inference.moment}), уверенность ${Math.round((inference.confidence || 0) * 100)}%.`,
            `Live action: ${action.decision} → ${action.preset}.`,
            `Почему: ${action.reason}.`,
            `Пересмотреть: ${action.reviewAgain}.`
        ];
    }
};

if (typeof window !== 'undefined') {
    window.SLFLiveMomentInferenceLayer = LiveMomentInferenceLayer;
}
