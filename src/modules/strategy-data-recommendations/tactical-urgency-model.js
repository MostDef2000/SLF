// 9.8 Tactical urgency / radicality model
// ============================================================

const TacticalUrgencyModel = {
    getMinuteUrgency(minute) {
        const m = Number(minute || 0);
        if (!Number.isFinite(m) || m < 10) return 0;
        if (m < 25) return 1;
        if (m < 40) return 2;
        if (m < 55) return 3;
        if (m < 70) return 4;
        if (m < 80) return 5;
        if (m < 85) return 6;
        return 7;
    },

    getDecisionWindow(minute) {
        const m = Number(minute || 0);

        if (!Number.isFinite(m) || m < 10) {
            return {
                phase: 'collect',
                label: 'Сбор данных',
                sourceSegment: '01-15',
                targetSegment: '16-30',
                applyByMinute: 15
            };
        }

        if (m < 15) return { phase: 'pre_decision', label: 'Предварительное окно решения', sourceSegment: '01-15', targetSegment: '16-30', applyByMinute: 15 };
        if (m < 25) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 30) return { phase: 'decision', label: 'Окно решения', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 40) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 45) return { phase: 'decision', label: 'Окно решения', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 55) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 60) return { phase: 'decision', label: 'Окно решения', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 70) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '61-75', targetSegment: '76-84', applyByMinute: 75 };
        if (m < 75) return { phase: 'decision', label: 'Окно решения', sourceSegment: '61-75', targetSegment: '76-84', applyByMinute: 75 };
        if (m < 80) return { phase: 'late', label: 'Позднее окно решения', sourceSegment: '76-84', targetSegment: '85-90', applyByMinute: 85 };
        if (m < 85) return { phase: 'final_decision', label: 'Финальное окно решения', sourceSegment: '76-84', targetSegment: '85-90', applyByMinute: 85 };
        return { phase: 'final_segment', label: 'Финальный отрезок', sourceSegment: '85-90', targetSegment: '85-90', applyByMinute: 90 };
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

        if (!Number.isFinite(minute) || minute < 10) {
            return {
                level: 'collect',
                label: 'Сбор данных',
                uiLabel: 'Сбор данных',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'до 10-й минуты собираем базу для первого предрешения'
            };
        }

        const emergency =
            losingBy >= 3 ||
            (minute <= 30 && losingBy >= 2) ||
            (minute >= 85 && score.state === 'losing') ||
            xgGap >= 1.2 ||
            xtGap >= 1.5 ||
            myBad >= 28 ||
            criticalCondition;

        const hugeLead = winningBy >= 4 || (minute <= 35 && winningBy >= 3);

        if (emergency) {
            const reasons = [];
            if (losingBy >= 3) reasons.push(`проигрываем ${losingBy} мяча`);
            if (minute <= 30 && losingBy >= 2) reasons.push(`ранний провал по счёту: -${losingBy} к ${minute}-й`);
            if (minute >= 85 && score.state === 'losing') reasons.push('финальный отрезок 85-90: нужен риск ради гола');
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

        if (minuteUrgency >= 7) {
            return {
                level: 'final_segment',
                label: 'Финальный отрезок 85-90',
                uiLabel: 'Финальный отрезок',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: score.state === 'losing',
                decisionWindow,
                reason: 'последний отрезок: держим заранее выбранный план, но разрешаем срочную коррекцию по счёту/давлению'
            };
        }

        if (minuteUrgency >= 6) {
            return {
                level: 'radical',
                label: 'Финальное окно решения: подготовить 85-90',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'последнее окно до 85-й минуты для решения на 85-90'
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
