// Strategy Data: preset fit scoring and decision fusion
// ============================================================

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
        if (matches.length) addReason(result, matches.length * 2, `направление пресета совпадает с целевой зоной: ${matches.join(', ')}`);
        else addReason(result, -2, `направление пресета (${presetLanes.join(', ')}) не совпадает с целевой зоной (${targetLanes.join(', ')})`);

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
        const result = { name, score: 0, traitsFound: !!traits, reasons: [], parts: {} };

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

    function groupOf(name) {
        return TacticPresetLibrary?.getGroup ? TacticPresetLibrary.getGroup(name) : TacticPresetLibrary?.meta?.[name]?.group || 'custom';
    }

    function isHighProfile(name) {
        const traits = RecommendationEngine.getPresetTraits(name);
        return /high|very_high/.test(`${traits?.risk || ''} ${traits?.tempo || ''} ${traits?.press || ''}`);
    }

    RecommendationEngine.getPresetFusionCandidateNames = function getPresetFusionCandidateNames(rawCandidate, state = {}) {
        const names = [rawCandidate?.name];
        names.push(...(this.getPresetLadder ? this.getPresetLadder(groupOf(rawCandidate?.name)) : []));

        if (hasTag(state, 'attack_left')) names.push('Henta_LeftTrap_att3', 'Klopp_WideTrap_att4', 'Conte_WingbackWidth_bal4', 'Mourinho_WeakSide_def3');
        if (hasTag(state, 'attack_right')) names.push('Henta_RightTrap_att3', 'Klopp_WideTrap_att4', 'Conte_WingbackWidth_bal4', 'Mourinho_WeakSide_def3');
        if (hasTag(state, 'center_weak')) names.push('Xabi_VerticalBox_att3', 'Xabi_BoxMidfield_bal3', 'Henta_CentralTrap_att3', 'Pep_ControlledPush_att3');
        if (hasTag(state, 'opponent_high_press')) names.push('DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Henta_CounterTrap_att4', 'Pep_PressCooldown_bal2');
        if (hasTag(state, 'opponent_low_block')) names.push('Pep_TwoThreeFive_att3', 'Xabi_VerticalBox_att3', 'Conte_WingbackWidth_bal4');
        if (hasTag(state, 'press_fatigue_risk') || hasTag(state, 'high_bad_actions')) names.push('Pep_PressCooldown_bal2', 'Pep_BoxControl_bal2', 'Compact_Counter_def3');

        if (state?.strengthContext?.mode === 'disadvantage') names.push('Mourinho_WeakSide_def3', 'Compact_Counter_def3', 'Pep_BoxControl_bal2');
        if (state?.strengthContext?.mode === 'advantage') names.push('Xabi_BoxMidfield_bal3', 'Pep_TwoThreeFive_att3', 'Pep_ControlledPush_att3');

        const scoreState = state?.score?.state || 'unknown';
        const minute = Number(state?.minute || 0);
        if (scoreState === 'losing' && minute >= 55) names.push('Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Klopp_Gegenpress_att4', 'DeZerbi_Release_att4');
        if (scoreState === 'losing' && minute >= 80) names.push('Bielsa_ChaosPress_att5');
        if (scoreState === 'winning' && minute >= 70) names.push('Pep_BoxControl_bal2', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5');

        return [...new Set(names.filter(Boolean))].filter(name => !!TacticPresetLibrary?.meta?.[name]);
    };

    RecommendationEngine.rankPresetFusionCandidates = function rankPresetFusionCandidates(rawCandidate, state = {}) {
        return this.getPresetFusionCandidateNames(rawCandidate, state)
            .map(name => this.scorePresetFit(name, state))
            .filter(fit => fit?.traitsFound)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.name === rawCandidate?.name) return -1;
                if (b.name === rawCandidate?.name) return 1;
                return 0;
            });
    };

    RecommendationEngine.shouldApplyPresetFusion = function shouldApplyPresetFusion(rawFit, bestFit, rawCandidate, state = {}) {
        if (!rawCandidate?.name || !bestFit?.name || bestFit.name === rawCandidate.name) return false;
        const diff = Number(bestFit.score || 0) - Number(rawFit.score || 0);
        const urgent = ['emergency', 'radical'].includes(state?.urgency?.level || '');
        if (diff < (urgent ? 5 : 3)) return false;
        if (Number(bestFit.score || 0) < 2) return false;

        const scoreState = state?.score?.state || 'unknown';
        const minute = Number(state?.minute || 0);
        if (scoreState === 'winning' && minute >= 70 && isHighProfile(bestFit.name)) return false;
        if ((hasTag(state, 'press_fatigue_risk') || hasTag(state, 'high_bad_actions')) && isHighProfile(bestFit.name)) return false;
        if (scoreState === 'losing' && minute >= 80 && groupOf(rawCandidate.name) === 'attack' && groupOf(bestFit.name) !== 'attack' && diff < 6) return false;
        return true;
    };

    RecommendationEngine.applyPresetDecisionFusion = function applyPresetDecisionFusion(rawCandidate, state = {}) {
        if (!rawCandidate?.name || !this.scorePresetFit) return rawCandidate;
        const ranked = this.rankPresetFusionCandidates(rawCandidate, state);
        const rawFit = ranked.find(item => item.name === rawCandidate.name) || this.scorePresetFit(rawCandidate.name, state);
        const bestFit = ranked[0] || rawFit;

        if (!this.shouldApplyPresetFusion(rawFit, bestFit, rawCandidate, state)) {
            return Object.assign({}, rawCandidate, { fusion: { applied: false, rawFit, bestFit, ranked: ranked.slice(0, 5) } });
        }

        const diff = Number(bestFit.score || 0) - Number(rawFit.score || 0);
        const positives = bestFit.reasons.filter(item => Number(item.delta || 0) > 0).slice(0, 2).map(item => item.reason);
        const suffix = positives.length ? ` ${positives.join('; ')}` : '';
        return {
            name: bestFit.name,
            reason: `${rawCandidate.reason || 'базовый выбор'}; fusion: ${this.getPresetTitle ? this.getPresetTitle(bestFit.name) : bestFit.name} лучше совпадает с контекстом по score ${bestFit.score} против ${rawFit.score} (${diff >= 0 ? '+' : ''}${diff}).${suffix}`,
            fusion: { applied: true, originalName: rawCandidate.name, rawFit, bestFit, ranked: ranked.slice(0, 5) }
        };
    };

    if (typeof RecommendationEngine.selectRawPreset === 'function' && !RecommendationEngine.selectRawPreset.__slfFusionWrapped) {
        const originalSelectRawPreset = RecommendationEngine.selectRawPreset;
        const wrapped = function selectRawPresetWithDecisionFusion(snapshot, state) {
            const rawCandidate = originalSelectRawPreset.call(this, snapshot, state);
            return this.applyPresetDecisionFusion(rawCandidate, state || {});
        };
        wrapped.__slfFusionWrapped = true;
        RecommendationEngine.selectRawPreset = wrapped;
    }
}());
