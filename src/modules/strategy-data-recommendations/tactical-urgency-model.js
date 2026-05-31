// 9.8 Tactical urgency / radicality model
// ============================================================

const TacticalUrgencyModel = {
    getMinuteUrgency(minute) {
        const m = Number(minute || 0);
        if (!Number.isFinite(m) || m < 15) return 0;
        if (m < 30) return 1;
        if (m < 45) return 2;
        if (m < 60) return 3;
        if (m < 75) return 4;
        if (m < 80) return 5;
        if (m < 85) return 6;
        return 2;
    },

    getDecisionWindow(minute) {
        const m = Number(minute || 0);

        if (!Number.isFinite(m) || m < 15) {
            return {
                phase: 'collect',
                label: 'Сбор данных',
                sourceSegment: '01-15',
                targetSegment: '16-30',
                applyByMinute: 15
            };
        }

        if (m < 30) return { phase: 'decision', label: 'Окно решения', sourceSegment: '01-15', targetSegment: '16-30', applyByMinute: 15 };
        if (m < 45) return { phase: 'decision', label: 'Окно решения', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 60) return { phase: 'decision', label: 'Окно решения', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 75) return { phase: 'decision', label: 'Окно решения', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 80) return { phase: 'late', label: 'Позднее окно решения', sourceSegment: '61-75', targetSegment: '76-85', applyByMinute: 75 };
        if (m < 85) return { phase: 'final_decision', label: 'Финальное окно решения', sourceSegment: '76-80', targetSegment: '86-90', applyByMinute: 84 };
        return { phase: 'too_late_big_change', label: 'Поздний статус', sourceSegment: '86-90', targetSegment: '86-90', applyByMinute: 84 };
    },

    classify(snapshot, state) {
        const minute = Number(state?.minute || 0);
        const score = state?.score || { diff: 0, state: 'unknown' };
        const losingBy = Math.max(0, -Number(score.diff || 0));
        const winningBy = Math.max(0, Number(score.diff || 0));
        const xgGap = Number(state?.oppXg || 0) - Number(state?.myXg || 0);
        const xtGap = Number(state?.oppXT || 0) - Number(state?.myXT || 0);
        const myBad = Number(state?.myBad || 0);
        const decisionWindow = this.getDecisionWindow(minute);
        const minuteUrgency = this.getMinuteUrgency(minute);
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const hintText = hints.map(h => h.text || '').join(' ').toLowerCase();
        const criticalCondition = /устали|травм|замен|красн|удален|удалён/.test(hintText);

        if (!Number.isFinite(minute) || minute < 15) {
            return {
                level: 'collect',
                label: 'Сбор данных',
                uiLabel: 'Сбор данных',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'до первого generation-среза пресет не предлагается'
            };
        }

        if (minute >= 85) {
            return {
                level: 'late_status',
                label: 'Поздний статус: большие изменения уже поздно',
                uiLabel: 'Поздний статус',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'финальную смену нужно было применять до 84-й минуты'
            };
        }

        const emergency =
            losingBy >= 3 ||
            (minute <= 30 && losingBy >= 2) ||
            xgGap >= 1.2 ||
            xtGap >= 1.5 ||
            myBad >= 28 ||
            criticalCondition;

        const hugeLead = winningBy >= 4 || (minute <= 35 && winningBy >= 3);

        if (emergency) {
            const reasons = [];
            if (losingBy >= 3) reasons.push(`проигрываем ${losingBy} мяча`);
            if (minute <= 30 && losingBy >= 2) reasons.push(`ранний провал по счёту: -${losingBy} к ${minute}-й`);
            if (xgGap >= 1.2) reasons.push(`провал по xG: ${xgGap.toFixed(2)}`);
            if (xtGap >= 1.5) reasons.push(`провал по xT: ${xtGap.toFixed(2)}`);
            if (myBad >= 28) reasons.push(`критический брак: ${myBad.toFixed(0)}%`);
            if (criticalCondition) reasons.push('критический сигнал по состоянию/карточкам из подсказок');

            return {
                level: 'emergency',
                label: 'Экстренная смена',
                uiLabel: 'Экстренная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: true,
                decisionWindow,
                reason: reasons.join('; ') || 'матч вышел из штатного сценария'
            };
        }

        if (hugeLead) {
            return {
                level: 'radical',
                label: 'Кардинальная смена: закрыть матч',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                preferControlOrCompact: true,
                decisionWindow,
                reason: `крупное преимущество +${winningBy}: цель — контроль, энергия и защита переходов`
            };
        }

        if (minuteUrgency >= 6) {
            return {
                level: 'radical',
                label: 'Финальное окно решения: применить до 84-й',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'последнее окно для изменения картины игры на 86-90'
            };
        }

        if (minuteUrgency >= 4) {
            return {
                level: 'medium_late',
                label: 'Поздняя перестройка',
                uiLabel: 'Средняя перестройка',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'времени меньше, допустима более решительная смена роли матча'
            };
        }

        if (minuteUrgency >= 2) {
            return {
                level: 'medium',
                label: 'Средняя перестройка',
                uiLabel: 'Средняя перестройка',
                allowPreset: true,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'корректируем структуру без резкого прыжка между семействами'
            };
        }

        return {
            level: 'soft',
            label: 'Мягкая корректировка',
            uiLabel: 'Мягкая корректировка',
            allowPreset: true,
            allowFamilyChange: false,
            overrideProgressionGuard: false,
            decisionWindow,
            reason: 'ранний этап: только аккуратная настройка, если нет экстренного триггера'
        };
    }
};

// ============================================================
