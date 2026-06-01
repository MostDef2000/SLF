// 9.5 Developer Hint Parser
// ============================================================

const DeveloperHintParser = {
    readHints() {
        const clone = document.body.cloneNode(true);

        [
            '#slf-match-parser-panel',
            '#slf-data-page',
            '#slf-tactics-dropdown',
            '#slf-save-dialog'
        ].forEach(selector => {
            clone.querySelectorAll(selector).forEach(el => el.remove());
        });

        const text = clone.innerText || '';

        const rawLines = text
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);

        const hintLines = rawLines.filter(line => {
            const t = line.toLowerCase();

            if (t.includes('ход матча:')) return false;
            if (t.includes('сейчас пресет:')) return false;
            if (t.includes('идея:')) return false;
            if (t.includes('использовать:')) return false;
            if (t.includes('риск:')) return false;
            if (t.includes('мануал по счёту')) return false;
            if (t.includes('live parser')) return false;
            if (t.includes('рекомендуемый пресет')) return false;

            return (
                line.includes('[Клопп]') ||
                line.includes('[Симеоне]') ||
                line.includes('[Жозе]') ||
                line.includes('Генератор') ||
                line.includes('Вектор обороны') ||
                line.includes('Оценка кроссов') ||
                line.includes('Точность') ||
                line.includes('игроки устали') ||
                line.includes('Приоритет') ||
                line.includes('Выбор К') ||
                line.includes('диагональные передачи') ||
                line.includes('атаку по центру') ||
                line.includes('дальних ударов') ||
                this.isExplicitBetterThanExpectedText(line) ||
                t.includes('ниже ожидан') ||
                t.includes('хуже ожидан') ||
                t.includes('генератор ожидает')
            );
        });

        const unique = [...new Set(
            hintLines.map(line => line.replace(/\s*подробнее\s*$/i, '').trim())
        )];

        return unique
            .filter(Boolean)
            .map(text => ({
                text,
                type: this.classify(text),
                control: this.toControlSignal(text),
                weight: this.getWeight(text)
            }));
    },

    classify(text) {
        const t = text.toLowerCase();

        if (this.isGeneratorQualityText(t)) {
            return 'generator_quality';
        }

        if (
            t.includes('отключите') ||
            t.includes('попробуйте убрать') ||
            t.includes('увеличьте') ||
            t.includes('приоритет') ||
            t.includes('логичный выбор')
        ) {
            return 'control';
        }

        if (t.includes('генератор ожидает')) {
            return 'generator_feedback';
        }

        if (
            t.includes('устали') ||
            t.includes('замены')
        ) {
            return 'player_condition';
        }

        return 'info';
    },

    getWeight(text) {
        const t = text.toLowerCase();

        if (this.isGeneratorQualityText(t)) return 6;
        if (t.includes('генератор')) return 5;
        if (t.includes('[клопп]') || t.includes('[симеоне]') || t.includes('[жозе]')) return 4;
        if (t.includes('устали')) return 4;
        if (t.includes('отключите') || t.includes('увеличьте') || t.includes('убрать')) return 3;

        return 1;
    },

    toControlSignal(text) {
        const t = text.toLowerCase();

        if (t.includes('отключите атаку по центру')) {
            return {
                area: 'priority',
                action: 'disable_center',
                ui: 'Управление → Приоритет атак: убрать центр'
            };
        }

        if (t.includes('убрать диагональные передачи')) {
            return {
                area: 'build',
                action: 'reduce_diagonal',
                ui: 'Управление → Построение атаки: убрать/снизить диагональные передачи'
            };
        }

        if (t.includes('дальних ударов') && t.includes('умеренно')) {
            return {
                area: 'attack',
                action: 'shots_moderate',
                ui: 'Управление → Атака: дальние удары = умеренно'
            };
        }

        if (t.includes('логичный выбор обоих флангов')) {
            return {
                area: 'priority',
                action: 'both_flanks',
                ui: 'Управление → Приоритет атак: оба фланга'
            };
        }

        if (t.includes('устали') || t.includes('замены')) {
            return {
                area: 'subs',
                action: 'prepare_subs',
                ui: 'Проверь замены: игроки устали'
            };
        }

        return null;
    },

    isExplicitBetterThanExpectedText(text) {
        const t = String(text || '').toLowerCase().replace(',', '.');
        return /(?:\+\s*\d+(?:\.\d+)?\s*%\s*)?(?:вы\s+)?(?:играете|играем|проводим(?:\s+матч)?|проводит(?:\s+матч)?)\s+лучше/.test(t) ||
            /(?:вы\s+)?(?:играете|играем|проводим(?:\s+матч)?)\s+лучше\s+(?:ожид|генератор)/.test(t) ||
            /лучше\s+ожидан[^\d+]*(?:\+\s*\d+(?:\.\d+)?\s*%)/.test(t);
    },

    isGeneratorQualityText(text) {
        const t = String(text || '').toLowerCase();

        return (
            this.isExplicitBetterThanExpectedText(t) ||
            t.includes('ниже ожидан') ||
            t.includes('хуже ожидан')
        );
    },

    parsePercent(text) {
        const raw = String(text || '').replace(',', '.');
        const m = raw.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
        if (!m) return null;
        const value = Number(m[1]);
        return Number.isFinite(value) ? value : null;
    },

    parseGeneratorQualitySignal(hints) {
        const rows = Array.isArray(hints) ? hints : [];
        const candidates = rows.filter(h => h && (h.type === 'generator_quality' || this.isGeneratorQualityText(h.text || h)));

        if (!candidates.length) {
            return {
                detected: false,
                direction: 'neutral',
                confidenceBoost: 0,
                percent: null,
                text: '',
                explicitBetterThanExpected: false
            };
        }

        const text = candidates.map(h => h.text || String(h || '')).join(' | ');
        const lower = text.toLowerCase();
        const percent = this.parsePercent(text);
        const explicitBetterThanExpected = this.isExplicitBetterThanExpectedText(text);
        let direction = 'neutral';

        if (explicitBetterThanExpected) {
            direction = 'positive';
        }

        if (
            lower.includes('хуже') ||
            lower.includes('ниже ожид') ||
            (percent != null && percent < 0 && !explicitBetterThanExpected)
        ) {
            direction = 'negative';
        }

        const confidenceBoost = direction === 'positive'
            ? Math.min(0.35, 0.12 + Math.abs(percent || 0) / 100)
            : direction === 'negative'
                ? -Math.min(0.35, 0.12 + Math.abs(percent || 0) / 100)
                : 0.05;

        return {
            schema: 'slf_generator_quality_signal_v1',
            detected: direction !== 'neutral',
            direction,
            confidenceBoost: Number(confidenceBoost.toFixed(2)),
            percent,
            text,
            explicitBetterThanExpected,
            source: explicitBetterThanExpected ? 'explicit_generator_better_text' : 'pep_generator_hint'
        };
    },

    getGeneratorQualitySignal(hints) {
        return this.parseGeneratorQualitySignal(hints);
    },

    getControlHints(hints) {
        return hints.filter(h => h.type === 'control' && h.control);
    },

    getGeneratorHints(hints) {
        return hints.filter(h => h.type === 'generator_feedback' || h.type === 'generator_quality');
    }
};



// ============================================================
