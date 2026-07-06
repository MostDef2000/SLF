// SLF On-Demand Stage 2 Hint Engine
// ============================================================
// This replaces live/drift-based logic with a STRICT on-demand model.
// It is executed ONLY when user presses "Подсказка" button.
//
// No history, no drift, no memory, no live parser assumptions.
// Pure snapshot evaluation.

const CurrentActionHintEngine = {
    schema: 'slf_current_action_hint_v1',

    clamp(value, min = 0, max = 1) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    },

    num(v, f = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : f;
    },

    getMinute(snapshot) {
        return this.num(snapshot?.minute ?? snapshot?.baseMinute ?? 0);
    },

    classify(snapshot, context = {}) {
        const minute = this.getMinute(snapshot);
        const score = snapshot?.scoreState || context.scoreState || 'unknown';

        const myXg = this.num(snapshot?.myXg);
        const oppXg = this.num(snapshot?.oppXg);
        const myXT = this.num(snapshot?.myXT);
        const oppXT = this.num(snapshot?.oppXT);

        const oppPress = this.num(snapshot?.oppPress);
        const oppDef = this.num(snapshot?.oppDef);

        const signals = [];
        const reasons = [];

        const add = (s, r) => {
            signals.push(s);
            reasons.push(r);
        };

        if (score === 'losing' && minute >= 55) {
            add('need_goal', 'проигрываем после 55-й минуты');
        }

        if (score === 'losing' && minute >= 80) {
            add('late_need_goal', 'финальная фаза, нужен риск');
        }

        if (oppXg > myXg + 0.4 || oppXT > myXT + 0.2) {
            add('under_pressure', 'соперник опаснее по xG/xT');
        }

        if (myXg > oppXg + 0.3 || myXT > oppXT + 0.2) {
            add('attacking_momentum', 'есть атакующий импульс');
        }

        if (oppPress > 65) {
            add('opponent_high_press', 'высокий прессинг соперника');
        }

        if (oppDef > 0 && oppDef < 45) {
            add('opponent_low_block', 'низкий блок соперника');
        }

        if (!signals.length) {
            add('balanced_control', 'нет сильного сигнала');
        }

        return { minute, score, signals, reasons };
    },

    decide(classification) {
        const s = new Set(classification.signals);

        let preset = 'Pep_BoxControl_bal2';
        let decision = 'hold';
        let risk = 'low';
        let reason = 'нет сигнала для изменения';

        if (s.has('late_need_goal')) {
            preset = 'Bielsa_ChaosPress_att5';
            decision = 'all_in_attack';
            risk = 'high';
            reason = 'финальная фаза требует риска';
        } else if (s.has('need_goal') && !s.has('under_pressure')) {
            preset = 'Pep_ControlledPush_att3';
            decision = 'increase_attack';
            risk = 'medium';
            reason = 'нужен гол, можно усиливать';
        } else if (s.has('under_pressure') && s.has('opponent_high_press')) {
            preset = 'Compact_Counter_def3';
            decision = 'stabilize_and_counter';
            risk = 'medium';
            reason = 'соперник давит прессингом';
        } else if (s.has('under_pressure')) {
            preset = 'Simeone_Compact442_def4';
            decision = 'stabilize';
            risk = 'medium';
            reason = 'соперник опаснее';
        } else if (s.has('opponent_low_block') && s.has('attacking_momentum')) {
            preset = 'Pep_TwoThreeFive_att3';
            decision = 'break_low_block';
            risk = 'medium';
            reason = 'вскрытие низкого блока';
        } else if (s.has('attacking_momentum')) {
            preset = 'Pep_ControlledPush_att3';
            decision = 'maintain_pressure';
            risk = 'low';
            reason = 'есть атакующий импульс';
        }

        return { preset, decision, risk, reason };
    },

    run(snapshot, context = {}) {
        if (!snapshot) return null;

        const classification = this.classify(snapshot, context);
        const action = this.decide(classification);

        return {
            schema: this.schema,
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
            `Reason: ${result.action.reason}`
        ];
    }
};

if (typeof window !== 'undefined') {
    window.SLFCurrentActionHintEngine = CurrentActionHintEngine;
}
