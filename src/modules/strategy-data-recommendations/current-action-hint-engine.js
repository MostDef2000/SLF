// SLF On-Demand Stage 2 Hint Engine
// ============================================================
// Button-only tactical hint policy.
//
// Contract:
// - executed only after user presses "Подсказка";
// - no live parser loop;
// - no drift/history/adaptation model;
// - no localStorage;
// - no RAG corpus in browser;
// - one current-state action only.

const CurrentActionHintEngine = {
    schema: 'slf_current_action_hint_v2',

    // Source: docs/audit/tactical-preset-rag-audit.md + active preset registry.
    // RAG press note: "Прессинг Игрок" is treated as a pressure/pressing signal,
    // not as a separate per-player tactical subsystem.
    PRESET_AUDIT_TIER: {
        primary: [
            'Pep_BoxControl_bal2',
            'Arteta_Control433_bal3',
            'Compact_Counter_def3',
            'Pep_TwoThreeFive_att3',
            'Conte_WingbackWidth_bal4',
            'Pep_PressCooldown_bal2',
            'Xabi_BoxMidfield_bal3',
            'DeZerbi_BaitPress_bal3'
        ],
        restricted: [
            'Pep_ControlledPush_att3',
            'Xabi_VerticalBox_att3',
            'Mourinho_WeakSide_def3',
            'Simeone_Compact442_def4',
            'Klopp_Gegenpress_att4',
            'Nagelsmann_WidePress_att4',
            'DeZerbi_Release_att4',
            'Henta_LeftTrap_att3'
        ],
        emergency: [
            'Bielsa_ChaosPress_att5',
            'Simeone_LowBlock_def5'
        ],
        needsMoreData: [],
        experimental: [],
        blocked: []
    },

    HINT_RULES: [
        {
            id: 'late_goal_emergency',
            preset: 'Bielsa_ChaosPress_att5',
            decision: 'all_in_attack',
            risk: 'high',
            reason: 'проигрываем в финальной фазе — только emergency all-in',
            when: c => c.lateNeedGoal
        },
        {
            id: 'late_protect_heavy_pressure',
            preset: 'Simeone_LowBlock_def5',
            decision: 'protect_lead',
            risk: 'high',
            reason: 'ведём поздно и соперник давит — пережить отрезок низким блоком',
            when: c => c.protectLead && c.underPressure && c.minute >= 80
        },
        {
            id: 'protect_compact_442',
            preset: 'Simeone_Compact442_def4',
            decision: 'compact_protect',
            risk: 'medium',
            reason: 'ведём, но полный низкий блок ещё не обязателен — компактная защита',
            when: c => c.protectLead && c.minute < 80 && !c.lateNeedGoal
        },
        {
            id: 'own_press_fatigue_cooldown',
            preset: 'Pep_PressCooldown_bal2',
            decision: 'cooldown_press',
            risk: 'low',
            reason: 'растёт цена собственного прессинга — снизить интенсивность и вернуть структуру',
            when: c => c.pressFatigueRisk && !c.lateNeedGoal
        },
        {
            id: 'bad_actions_control_reset',
            preset: 'Pep_BoxControl_bal2',
            decision: 'stabilize_control',
            risk: 'low',
            reason: 'высокий брак — сначала стабилизировать розыгрыш',
            when: c => c.highBadActions && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_release_space',
            preset: 'DeZerbi_Release_att4',
            decision: 'release_after_press',
            risk: 'high',
            reason: 'соперник прессингует, но есть пространство за линией — быстрее выпускать атаку',
            when: c => c.opponentHighPress && c.spaceBehind && !c.highBadActions && !c.pressFatigueRisk && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_bait',
            preset: 'DeZerbi_BaitPress_bal3',
            decision: 'bait_press',
            risk: 'medium',
            reason: 'соперник высоко прессингует, а брак низкий — можно выманить прессинг',
            when: c => c.opponentHighPress && c.lowBadActions && !c.underPressure && !c.transitionThreat && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_compact_counter',
            preset: 'Compact_Counter_def3',
            decision: 'stabilize_and_counter',
            risk: 'medium',
            reason: 'соперник прессингует и давит — не держать автобусом мяч, закрыться и выйти быстро',
            when: c => c.opponentHighPress && c.underPressure && !c.lateNeedGoal
        },
        {
            id: 'under_pressure_counter',
            preset: 'Compact_Counter_def3',
            decision: 'defensive_reset',
            risk: 'medium',
            reason: 'соперник опаснее по текущим метрикам — нужен defensive reset с выходом в контратаку',
            when: c => c.underPressure && (c.transitionThreat || !c.opponentHighPress) && !c.lateNeedGoal
        },
        {
            id: 'weak_side_under_pressure',
            preset: 'Mourinho_WeakSide_def3',
            decision: 'attack_weak_side',
            risk: 'medium',
            reason: 'соперник давит, но есть слабая сторона или пространство для выхода',
            when: c => c.underPressure && (c.spaceBehind || c.weakSideAvailable) && !c.highBadActions && !c.lateNeedGoal
        },
        {
            id: 'center_closed_wide_quality',
            preset: 'Conte_WingbackWidth_bal4',
            decision: 'use_width',
            risk: 'medium',
            reason: 'центр закрыт, но ширина доступна — растянуть блок через фланги',
            when: c => c.opponentLowBlock && c.wideQuality && !c.needGoal && !c.ownCrossesBad && !c.opponentCrossesDangerous
        },
        {
            id: 'urgent_wide_press',
            preset: 'Nagelsmann_WidePress_att4',
            decision: 'wide_pressure',
            risk: 'high',
            reason: 'нужен гол, центр закрыт, фланги доступны — широкий прессинг вместо хаоса',
            when: c => c.needGoal && c.minute >= 65 && c.centerClosed && c.wideQuality && !c.highBadActions && !c.pressFatigueRisk
        },
        {
            id: 'urgent_pressure_not_all_in',
            preset: 'Klopp_Gegenpress_att4',
            decision: 'urgent_pressure',
            risk: 'high',
            reason: 'нужен срочный рост давления, но guard допускает высокий прессинг',
            when: c => c.needGoal && c.minute >= 70 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat
        },
        {
            id: 'attacking_momentum_positional',
            preset: 'Pep_TwoThreeFive_att3',
            decision: 'maintain_pressure',
            risk: 'medium',
            reason: 'есть атакующий импульс — дожимать позиционно с transition guard',
            when: c => c.attackingMomentum && !c.underPressure && !c.transitionThreat
        },
        {
            id: 'need_goal_controlled_push',
            preset: 'Pep_ControlledPush_att3',
            decision: 'increase_attack',
            risk: 'medium',
            reason: 'нужен гол, но без all-in и без лишнего прессинг-риска',
            when: c => c.needGoal && !c.underPressure && !c.highBadActions && !c.pressFatigueRisk
        },
        {
            id: 'center_vertical_entry',
            preset: 'Xabi_VerticalBox_att3',
            decision: 'vertical_center_entry',
            risk: 'medium',
            reason: 'центр доступен и нужен более быстрый вертикальный вход',
            when: c => c.centerWeak && c.attackingMomentum && !c.centerClosed && !c.highBadActions
        },
        {
            id: 'center_weak_box_midfield',
            preset: 'Xabi_BoxMidfield_bal3',
            decision: 'attack_center',
            risk: 'medium',
            reason: 'центр соперника доступен — можно перегрузить середину',
            when: c => c.centerWeak && !c.centerClosed && !c.highBadActions
        },
        {
            id: 'standard_control_low_noise',
            preset: 'Arteta_Control433_bal3',
            decision: 'standard_control',
            risk: 'low',
            reason: 'игра без сильного аварийного сигнала — базовый контроль через структуру',
            when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum
        },
        {
            id: 'safe_default_control',
            preset: 'Pep_BoxControl_bal2',
            decision: 'hold_control',
            risk: 'low',
            reason: 'нет сильного сигнала для рискованной смены — держать безопасный контроль',
            when: () => true
        }
    ],

    num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    },

    bool(value) {
        return value === true || value === 'true' || value === 1 || value === '1';
    },

    getMetric(snapshot, context, key, aliases = []) {
        const sources = [snapshot || {}, context || {}];
        const keys = [key, ...aliases];
        for (const source of sources) {
            for (const name of keys) {
                if (source?.[name] !== undefined && source?.[name] !== null) return source[name];
            }
        }
        return undefined;
    },

    getMinute(snapshot, context = {}) {
        return this.num(this.getMetric(snapshot, context, 'minute', ['baseMinute', 'effectiveMinute']), 0);
    },

    getScoreState(snapshot, context = {}) {
        const explicit = this.getMetric(snapshot, context, 'scoreState');
        if (explicit) return String(explicit);

        const score = snapshot?.score || context?.score;
        if (!score || score.diff === undefined) return 'unknown';
        if (Number(score.diff) > 0) return 'winning';
        if (Number(score.diff) < 0) return 'losing';
        return 'draw';
    },

    hasAny(values) {
        return (Array.isArray(values) ? values : [values]).some(Boolean);
    },

    hasSignal(signals, names) {
        const list = Array.isArray(names) ? names : [names];
        return list.some(name => signals.includes(name));
    },

    buildContext(snapshot, context = {}) {
        const minute = this.getMinute(snapshot, context);
        const scoreState = this.getScoreState(snapshot, context);
        const myXg = this.num(this.getMetric(snapshot, context, 'myXg', ['myXG']));
        const oppXg = this.num(this.getMetric(snapshot, context, 'oppXg', ['oppXG']));
        const myXT = this.num(this.getMetric(snapshot, context, 'myXT'));
        const oppXT = this.num(this.getMetric(snapshot, context, 'oppXT'));
        const myBad = this.num(this.getMetric(snapshot, context, 'myBad', ['badActionsPct', 'myBadActionsPct']));
        const oppPress = this.num(this.getMetric(snapshot, context, 'oppPress', ['oppPressVector', 'opponentPress', 'opponentPressing']));
        const myPress = this.num(this.getMetric(snapshot, context, 'myPress', ['myPressVector', 'ownPress', 'ownPressVector', 'pressingPlayer', 'playerPressing', 'pressing_player', 'player_pressing']));
        const oppDef = this.num(this.getMetric(snapshot, context, 'oppDef', ['oppDefVector']));
        const signals = Array.isArray(context.signals)
            ? context.signals
            : Array.isArray(snapshot?.signals)
                ? snapshot.signals
                : [];

        const ownCrossesBad = this.bool(this.getMetric(snapshot, context, 'ownCrossesBad')) || this.hasSignal(signals, ['own_crosses_bad_total', 'own_open_play_crosses_bad']);
        const opponentCrossesDangerous = this.bool(this.getMetric(snapshot, context, 'opponentCrossesDangerous')) || this.hasSignal(signals, ['opponent_crosses_dangerous']);
        const pressFatigueRisk = this.bool(this.getMetric(snapshot, context, 'pressFatigueRisk')) || this.hasSignal(signals, ['press_fatigue_risk', 'own_press_fatigue', 'press_cost_high']);
        const wideQuality = this.bool(this.getMetric(snapshot, context, 'wideQuality')) || this.hasSignal(signals, ['wide_quality', 'attack_left', 'attack_right', 'wide_advantage']);
        const centerWeak = this.bool(this.getMetric(snapshot, context, 'centerWeak')) || this.hasSignal(signals, ['center_weak', 'center_available']);
        const centerClosed = this.bool(this.getMetric(snapshot, context, 'centerClosed')) || this.hasSignal(signals, ['center_closed']);
        const transitionThreat = this.bool(this.getMetric(snapshot, context, 'transitionThreat')) || this.hasSignal(signals, ['opponent_fast_counter_threat', 'transition_threat']);
        const spaceBehind = this.bool(this.getMetric(snapshot, context, 'spaceBehind')) || this.hasSignal(signals, ['space_behind', 'opponent_high_line', 'release_space']);
        const weakSideAvailable = this.bool(this.getMetric(snapshot, context, 'weakSideAvailable')) || this.hasSignal(signals, ['weak_side_available', 'opponent_flank_weak']);
        const ownHighPress = myPress > 65 || this.hasSignal(signals, ['own_high_press', 'intensive_pressing', 'pressing_player', 'player_pressing']);
        const opponentHighPress = oppPress > 65 || this.hasSignal(signals, ['opponent_high_press']);
        const highBadActions = myBad >= 20 || this.hasSignal(signals, ['high_bad_actions']);

        return {
            minute,
            scoreState,
            myXg,
            oppXg,
            myXT,
            oppXT,
            myBad,
            myPress,
            oppPress,
            oppDef,
            signals,
            needGoal: scoreState === 'losing' && minute >= 55,
            lateNeedGoal: scoreState === 'losing' && minute >= 80,
            protectLead: scoreState === 'winning' && minute >= 70,
            underPressure: oppXg > myXg + 0.4 || oppXT > myXT + 0.2 || this.hasSignal(signals, ['under_pressure']),
            attackingMomentum: myXg > oppXg + 0.3 || myXT > oppXT + 0.2 || this.hasSignal(signals, ['attacking_momentum']),
            highBadActions,
            lowBadActions: !highBadActions && myBad < 12,
            ownHighPress,
            opponentHighPress,
            opponentLowBlock: (oppDef > 0 && oppDef < 45) || this.hasSignal(signals, ['opponent_low_block']),
            ownCrossesBad,
            opponentCrossesDangerous,
            pressFatigueRisk,
            wideQuality,
            centerWeak,
            centerClosed,
            transitionThreat,
            spaceBehind,
            weakSideAvailable
        };
    },

    getPresetStatus(preset) {
        for (const [status, names] of Object.entries(this.PRESET_AUDIT_TIER)) {
            if (names.includes(preset)) return status;
        }
        return 'unknown';
    },

    isPresetAllowed(preset, c) {
        const status = this.getPresetStatus(preset);
        if (status === 'blocked' || status === 'experimental' || status === 'needsMoreData') return false;
        if (status === 'emergency') return c.lateNeedGoal || (c.protectLead && c.underPressure && c.minute >= 80);
        return status === 'primary' || status === 'restricted';
    },

    classify(snapshot, context = {}) {
        const c = this.buildContext(snapshot, context);
        const signals = [];
        const reasons = [];
        const add = (signal, reason) => {
            if (!signals.includes(signal)) signals.push(signal);
            if (reason && !reasons.includes(reason)) reasons.push(reason);
        };

        if (c.needGoal) add('need_goal', 'проигрываем после 55-й минуты');
        if (c.lateNeedGoal) add('late_need_goal', 'финальная фаза, нужен риск');
        if (c.protectLead) add('protect_lead', 'ведём после 70-й минуты');
        if (c.underPressure) add('under_pressure', 'соперник опаснее по xG/xT или давлению');
        if (c.attackingMomentum) add('attacking_momentum', 'есть атакующий импульс');
        if (c.highBadActions) add('high_bad_actions', 'высокий процент брака');
        if (c.lowBadActions) add('low_bad_actions', 'низкий процент брака');
        if (c.ownHighPress) add('own_high_press', 'собственный прессинг активен');
        if (c.opponentHighPress) add('opponent_high_press', 'высокий прессинг соперника');
        if (c.opponentLowBlock) add('opponent_low_block', 'низкий блок соперника');
        if (c.pressFatigueRisk) add('press_fatigue_risk', 'растёт цена прессинга');
        if (c.spaceBehind) add('space_behind', 'есть пространство за линией');
        if (c.weakSideAvailable) add('weak_side_available', 'есть слабая сторона соперника');
        if (c.centerWeak) add('center_weak', 'центр соперника доступен');
        if (c.centerClosed) add('center_closed', 'центр закрыт');
        if (c.wideQuality) add('wide_quality', 'ширина/фланги доступны');
        if (c.ownCrossesBad) add('own_crosses_bad', 'кроссы/фланговая доставка не работают');
        if (c.opponentCrossesDangerous) add('opponent_crosses_dangerous', 'кроссы соперника опасны');
        if (!signals.length) add('balanced_control', 'нет сильного сигнала');

        return {
            minute: c.minute,
            score: c.scoreState,
            signals,
            reasons,
            context: c
        };
    },

    decide(classification) {
        const c = classification?.context || {};
        const rule = this.HINT_RULES.find(item => item.when(c) && this.isPresetAllowed(item.preset, c)) || this.HINT_RULES[this.HINT_RULES.length - 1];
        const presetStatus = this.getPresetStatus(rule.preset);

        return {
            preset: rule.preset,
            presetStatus,
            ruleId: rule.id,
            decision: rule.decision,
            risk: rule.risk,
            reason: rule.reason
        };
    },

    run(snapshot, context = {}) {
        if (!snapshot) return null;

        const classification = this.classify(snapshot, context);
        const action = this.decide(classification);

        return {
            schema: this.schema,
            mode: 'button_on_demand_current_state_only',
            moment: classification,
            action,
            generatedAt: Date.now()
        };
    },

    toPlanRows(result) {
        if (!result) return [];
        return [
            `Moment: ${result.moment.signals.join(', ')}`,
            `Decision: ${result.action.decision} → ${result.action.preset}`,
            `Tier: ${result.action.presetStatus}; rule: ${result.action.ruleId}`,
            `Reason: ${result.action.reason}`
        ];
    }
};

if (typeof window !== 'undefined') {
    window.SLFCurrentActionHintEngine = CurrentActionHintEngine;
}
