// 9.6 Generator expected-performance and strength context
// ============================================================

const GeneratorExpectedPerformanceParser = {
    parseNumber(value) {
        const n = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    },

    emptyChannel(name) {
        return {
            channel: name,
            detected: false,
            actual: null,
            expected: null,
            delta: null,
            ratio: null,
            verdict: 'unknown',
            text: ''
        };
    },

    classifyAttack(actual, expected, rawText = '') {
        const t = String(rawText || '').toLowerCase();
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) {
            if (t.includes('ожидает') && t.includes('атак')) return 'underperforming';
            if (t.includes('доволен') && t.includes('атак')) return 'working';
            return 'unknown';
        }

        const ratio = actual / expected;
        if (ratio < 0.75 || (t.includes('ожидает') && t.includes('атак'))) return 'underperforming';
        if (ratio >= 0.9 || (t.includes('доволен') && t.includes('атак'))) return 'working';
        return 'neutral';
    },

    classifyDefense(actual, expected, rawText = '') {
        const t = String(rawText || '').toLowerCase();
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) {
            if (t.includes('ожидает') && (t.includes('оборон') || t.includes('защит'))) return 'underperforming';
            if (t.includes('доволен') && (t.includes('оборон') || t.includes('защит'))) return 'working';
            return 'unknown';
        }

        const ratio = actual / expected;
        if (ratio <= 0.75 || (t.includes('доволен') && (t.includes('оборон') || t.includes('защит')))) return 'working';
        if (ratio > 1.25 || (t.includes('ожидает') && (t.includes('оборон') || t.includes('защит')))) return 'underperforming';
        return 'neutral';
    },

    makeChannel(name, actual, expected, verdict, text) {
        const ratio = Number.isFinite(actual) && Number.isFinite(expected) && expected > 0 ? actual / expected : null;
        const delta = Number.isFinite(actual) && Number.isFinite(expected) ? actual - expected : null;

        return {
            channel: name,
            detected: true,
            actual: Number.isFinite(actual) ? actual : null,
            expected: Number.isFinite(expected) ? expected : null,
            delta: Number.isFinite(delta) ? Number(delta.toFixed(3)) : null,
            ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
            verdict,
            text: String(text || '').trim()
        };
    },

    parse(hints) {
        const rows = Array.isArray(hints) ? hints : [];
        const texts = rows.map(h => h?.text || String(h || '')).filter(Boolean);
        let attack = this.emptyChannel('attack');
        let defense = this.emptyChannel('defense');

        texts.forEach(text => {
            const raw = String(text || '').replace(/&quot;/g, '"');
            const lower = raw.toLowerCase();

            const attackMatch = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*xG\s*при\s*ожидаемом\s*([0-9]+(?:[.,][0-9]+)?)\s*xG/i);
            if (attackMatch && (lower.includes('атак') || lower.includes('xg'))) {
                const actual = this.parseNumber(attackMatch[1]);
                const expected = this.parseNumber(attackMatch[2]);
                attack = this.makeChannel('attack', actual, expected, this.classifyAttack(actual, expected, raw), raw);
            } else if (!attack.detected && lower.includes('генератор') && lower.includes('атак')) {
                attack = this.makeChannel('attack', null, null, this.classifyAttack(null, null, raw), raw);
            }

            const defenseMatch = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*xGA\s*при\s*ожидаемом\s*([0-9]+(?:[.,][0-9]+)?)\s*xGA/i);
            if (defenseMatch && (lower.includes('оборон') || lower.includes('защит') || lower.includes('xga'))) {
                const actual = this.parseNumber(defenseMatch[1]);
                const expected = this.parseNumber(defenseMatch[2]);
                defense = this.makeChannel('defense', actual, expected, this.classifyDefense(actual, expected, raw), raw);
            } else if (!defense.detected && lower.includes('генератор') && (lower.includes('оборон') || lower.includes('защит'))) {
                defense = this.makeChannel('defense', null, null, this.classifyDefense(null, null, raw), raw);
            }
        });

        const detected = attack.detected || defense.detected;
        let matrix = 'unknown';
        if (detected) {
            const a = attack.verdict;
            const d = defense.verdict;
            if (d === 'working' && a === 'underperforming') matrix = 'defense_good_attack_bad';
            else if (d === 'underperforming' && a === 'working') matrix = 'attack_good_defense_bad';
            else if (d === 'working' && a === 'working') matrix = 'both_good';
            else if (d === 'underperforming' && a === 'underperforming') matrix = 'both_bad';
            else if (a === 'underperforming') matrix = 'attack_bad';
            else if (d === 'underperforming') matrix = 'defense_bad';
            else if (a === 'working' || d === 'working') matrix = 'one_channel_good';
        }

        return {
            schema: 'slf_generator_expected_performance_v1',
            detected,
            attack,
            defense,
            matrix,
            summary: this.getSummary({ attack, defense, matrix })
        };
    },

    getSummary(result) {
        if (!result || result.matrix === 'unknown') return '';
        const parts = [];
        if (result.defense?.verdict === 'working') parts.push('Оборона работает: не ломать защитную структуру');
        if (result.defense?.verdict === 'underperforming') parts.push('Оборона недобирает: снизить риск и закрыть переходы');
        if (result.attack?.verdict === 'working') parts.push('Атака работает: сохранить атакующий паттерн');
        if (result.attack?.verdict === 'underperforming') parts.push('Атака недобирает: усилить продвижение и вход в штрафную');
        return parts.join('; ');
    }
};

const StrengthContextModel = {
    classifyGap(gap) {
        const value = Number(gap || 0);
        if (value >= 400) return { bucket: 'huge_advantage', label: 'мы намного сильнее', mode: 'advantage' };
        if (value >= 250) return { bucket: 'clear_advantage', label: 'мы явно сильнее', mode: 'advantage' };
        if (value >= 120) return { bucket: 'slight_advantage', label: 'мы немного сильнее', mode: 'advantage' };
        if (value <= -400) return { bucket: 'huge_disadvantage', label: 'мы намного слабее', mode: 'disadvantage' };
        if (value <= -250) return { bucket: 'clear_disadvantage', label: 'мы явно слабее', mode: 'disadvantage' };
        if (value <= -120) return { bucket: 'slight_disadvantage', label: 'мы немного слабее', mode: 'disadvantage' };
        return { bucket: 'near_equal', label: 'силы примерно равны', mode: 'equal' };
    },

    getPowerContext(myPower, oppPower) {
        const my = Number(myPower || 0);
        const opp = Number(oppPower || 0);
        const known = Number.isFinite(my) && Number.isFinite(opp) && my > 0 && opp > 0;
        const strengthGap = known ? my - opp : 0;
        const bucket = this.classifyGap(strengthGap);

        return {
            schema: 'slf_strength_context_v1_provisional_ranges',
            known,
            myPower: known ? my : null,
            oppPower: known ? opp : null,
            strengthGap: known ? strengthGap : null,
            bucket: bucket.bucket,
            label: bucket.label,
            mode: bucket.mode,
            rangesAreProvisional: true
        };
    },

    assessPressFatigue(snapshot, state) {
        const tactic = snapshot?.currentTactic || {};
        const pressIntense = Number(tactic.press_intense || 0);
        const pressLine = Number(tactic.press_line || 0);
        const highPress = pressIntense >= 4 || pressLine >= 4;
        const ag = snapshot?.segmentAggregate || null;
        const powerCtx = ag?.powerContext || null;
        const myPowerDrop = Number(powerCtx?.myPowerDrop || 0);
        const badDelta = Number(ag?.my?.badActionsPctDelta || 0);
        const fouls = Number(state?.myFouls || 0);
        const minute = Number(state?.minute || snapshot?.minute || 0);
        const oppPressure = Number(state?.oppXT || 0) > Number(state?.myXT || 0) + 0.25 || Number(state?.oppXg || 0) > Number(state?.myXg || 0) + 0.45;

        const active = highPress && (
            minute >= 60 ||
            myPowerDrop <= -35 ||
            badDelta >= 3 ||
            fouls >= 12 ||
            oppPressure
        );

        let risk = 'low';
        if (active && (myPowerDrop <= -60 || (oppPressure && badDelta >= 3) || fouls >= 14)) risk = 'high';
        else if (active) risk = 'medium';

        const reason = active
            ? `высокая нагрузка прессинга: press_intense=${pressIntense || '?'}, press_line=${pressLine || '?'}, Δpower=${Number.isFinite(myPowerDrop) ? myPowerDrop : '?'}, брак Δ=${Number.isFinite(badDelta) ? badDelta : '?'}`
            : '';

        return {
            schema: 'slf_press_fatigue_model_v1',
            highPress,
            active,
            risk,
            myPowerDrop: Number.isFinite(myPowerDrop) ? myPowerDrop : null,
            reason
        };
    }
};

// ============================================================
