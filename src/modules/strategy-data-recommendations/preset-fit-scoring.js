// Strategy Data: preset fit scoring layer
// ============================================================
// Preparatory scoring helpers only. This module does not change
// selectRawPreset(), progression guard behavior, UI, or final recommendation.

(function () {
    if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return;

    function list(value) {
        return Array.isArray(value) ? value.filter(Boolean) : [];
    }

    function hasTag(state, tag) {
        return list(state?.tags).includes(tag);
    }

    function addReason(result, delta, reason) {
        if (!reason || !delta) return;
        result.reasons.push({ delta, reason });
        result.score += delta;
    }

    RecommendationEngine.getPresetTraits = function getPresetTraits(name) {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary?.getTraits) return null;
        return TacticPresetLibrary.getTraits(name) || null;
    };

    RecommendationEngine.getTargetAttackLanes = function getTargetAttackLanes(state = {}) {
        const lanes = [];
        if (hasTag(state, 'attack_left')) lanes.push('left');
        if (hasTag(state, 'attack_right')) lanes.push('right');
        if (hasTag(state, 'center_weak')) lanes.push('center');
        return [...new Set(lanes)];
    };

    RecommendationEngine.scorePresetDirectionFit = function scorePresetDirectionFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const presetLanes = list(traits?.attackLanes);
        const targetLanes = this.getTargetAttackLanes(state);

        if (!presetLanes.length || !targetLanes.length) return result;

        const matches = targetLanes.filter(lane => presetLanes.includes(lane));
        if (matches.length) {
            addReason(result, matches.length * 2, `направление пресета совпадает с целевой зоной: ${matches.join(', ')}`);
        } else {
            addReason(result, -2, `направление пресета (${presetLanes.join(', ')}) не совпадает с целевой зоной (${targetLanes.join(', ')})`);
        }

        return result;
    };

    RecommendationEngine.scorePresetCrossFit = function scorePresetCrossFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const avoids = list(traits?.avoids);
        const strengths = list(traits?.strengths);
        const ownCrossBad = hasTag(state, 'own_open_play_crosses_bad') || hasTag(state, 'own_crosses_bad_total');
        const wideOrCross = strengths.some(x => /cross|wide|wing/i.test(String(x))) || String(traits?.build || '').includes('wide');

        if (ownCrossBad && avoids.includes('own_crosses_bad')) addReason(result, 2, 'пресет явно избегает плохих кроссов');
        if (ownCrossBad && wideOrCross && !avoids.includes('own_crosses_bad')) addReason(result, -3, 'кроссы/ширина конфликтуют с плохими кроссами');
        if (hasTag(state, 'opponent_crosses_dangerous') && avoids.includes('opponent_crosses_dangerous')) addReason(result, 1, 'пресет учитывает риск опасных кроссов соперника');

        return result;
    };

    RecommendationEngine.scorePresetRiskFit = function scorePresetRiskFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const risk = String(traits?.risk || 'medium');
        const tempo = String(traits?.tempo || 'medium');
        const press = String(traits?.press || 'medium');
        const highRisk = /high/.test(risk) || /high/.test(tempo) || /high/.test(press);
        const lowRisk = /low/.test(risk);
        const minute = Number(state?.minute || 0);
        const scoreState = state?.score?.state || 'unknown';

        if (hasTag(state, 'high_bad_actions') && highRisk) addReason(result, -3, 'высокий риск/темп/прессинг конфликтует с высоким браком');
        if (hasTag(state, 'high_bad_actions') && lowRisk) addReason(result, 2, 'низкий риск подходит при высоком браке');
        if (hasTag(state, 'low_bad_actions') && highRisk && scoreState === 'losing') addReason(result, 1, 'низкий брак позволяет поднять риск при необходимости гола');
        if (hasTag(state, 'press_fatigue_risk') && /high/.test(press)) addReason(result, -4, 'высокий прессинг конфликтует с fatigue risk');
        if (scoreState === 'winning' && minute >= 70 && highRisk) addReason(result, -2, 'поздно ведём — высокий риск нежелателен');
        if (scoreState === 'losing' && minute >= 80 && highRisk) addReason(result, 2, 'поздно проигрываем — высокий риск допустим');

        return result;
    };

    RecommendationEngine.scorePresetStrengthFit = function scorePresetStrengthFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const build = String(traits?.build || '');
        const requires = list(traits?.requires);
        const avoids = list(traits?.avoids);
        const strengthMode = state?.strengthContext?.mode || 'unknown';
        const highPressOrChaos = /press|chaos|gegen/i.test(build) || /high/.test(String(traits?.press || ''));
        const controlOrCompact = /control|compact|low_block|counter/.test(build);

        if (strengthMode === 'advantage' && /control|positional|box/.test(build)) addReason(result, 2, 'преимущество силы можно конвертировать в контроль/позиционную атаку');
        if (strengthMode === 'advantage' && requires.includes('need_stability')) addReason(result, 1, 'пресет стабилизирует игру при преимуществе силы');
        if (strengthMode === 'disadvantage' && highPressOrChaos && !requires.includes('emergency_need_goal')) addReason(result, -3, 'недостаток силы плохо сочетается с высоким прессингом/хаосом');
        if (strengthMode === 'disadvantage' && controlOrCompact) addReason(result, 2, 'недостаток силы поддерживает компактный/контрольный план');
        if (hasTag(state, 'opponent_high_press') && requires.includes('passing_quality') && hasTag(state, 'high_bad_actions')) addReason(result, -2, 'bait/release требует паса, но брак высокий');
        if (hasTag(state, 'opponent_low_block') && avoids.includes('center_closed')) addReason(result, -1, 'пресет избегает закрытого центра против низкого блока');

        return result;
    };

    RecommendationEngine.scorePresetFit = function scorePresetFit(name, state = {}) {
        const traits = this.getPresetTraits(name);
        const result = {
            name,
            score: 0,
            traitsFound: !!traits,
            reasons: [],
            parts: {}
        };

        if (!traits) {
            result.reasons.push({ delta: 0, reason: 'structured traits missing' });
            return result;
        }

        const parts = {
            direction: this.scorePresetDirectionFit(traits, state),
            cross: this.scorePresetCrossFit(traits, state),
            risk: this.scorePresetRiskFit(traits, state),
            strength: this.scorePresetStrengthFit(traits, state)
        };

        Object.entries(parts).forEach(([key, part]) => {
            result.parts[key] = part;
            result.score += Number(part.score || 0);
            part.reasons.forEach(reason => result.reasons.push(Object.assign({ part: key }, reason)));
        });

        return result;
    };

    RecommendationEngine.explainPresetFitScore = function explainPresetFitScore(fit) {
        if (!fit?.traitsFound) return [`${fit?.name || 'preset'}: traits missing.`];
        const sign = fit.score > 0 ? '+' : '';
        const rows = [`${fit.name}: fit score ${sign}${fit.score}.`];
        fit.reasons.slice(0, 6).forEach(item => {
            const delta = item.delta > 0 ? `+${item.delta}` : String(item.delta);
            rows.push(`${delta}: ${item.reason}.`);
        });
        return rows;
    };
}());
