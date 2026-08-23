// Re Preset Family
// Extracted verbatim from recommendation-engine.js (stage 4 refactor).
// Assigned onto the RecommendationEngine facade; behaviour unchanged.

if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
    RecommendationEngine.stage4RePresetFamilyApplied = true;

    Object.assign(RecommendationEngine, {
    getPresetTitle(name) {
        const labels = typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        return labels[name] || TacticPresetLibrary?.meta?.[name]?.title || name || '';
    },

    getPresetScheme(name) {
        return TacticPresetLibrary?.getSchemeForPreset ? TacticPresetLibrary.getSchemeForPreset(name) : '';
    },

    getPresetGroup(name) {
        return TacticPresetLibrary?.getGroup ? TacticPresetLibrary.getGroup(name) : TacticPresetLibrary?.meta?.[name]?.group || 'custom';
    },

    getPresetRank(name) {
        return TacticPresetLibrary?.getRank ? TacticPresetLibrary.getRank(name) : Number(TacticPresetLibrary?.meta?.[name]?.rank || 0);
    },

    getPresetLadder(group) {
        const ladders = {
            defensive: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3', 'Henta_Hold_def3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
            balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Pep_StandardControl_bal3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'Conte_WingbackWidth_bal4'],
            attack: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'DeZerbi_Release_att4', 'Klopp_WideTrap_att4', 'Bielsa_ChaosPress_att5'],
            henta: ['Henta_CentralTrap_att3', 'Henta_LeftTrap_att3', 'Henta_RightTrap_att3', 'Henta_WideTrap_att3', 'Henta_CounterTrap_att4']
        };

        return ladders[group] || [];
    },

    getAdjacentPresetInFamily(currentName, desiredName, group) {
        const ladder = this.getPresetLadder(group);
        if (!ladder.length) return desiredName;

        const currentIndex = ladder.indexOf(currentName);
        const desiredIndex = ladder.indexOf(desiredName);
        if (currentIndex < 0 || desiredIndex < 0) return desiredName;
        if (Math.abs(desiredIndex - currentIndex) <= 1) return desiredName;

        return ladder[currentIndex + Math.sign(desiredIndex - currentIndex)] || desiredName;
    },

    getPostApplyEffectSignal(progression) {
        const effect = progression?.lastEffect || null;
        if (!effect || !Number.isFinite(Number(effect.effectScore))) {
            return { known: false, score: 0, verdict: 'unknown' };
        }

        const score = Number(effect.effectScore);
        return {
            known: true,
            score,
            verdict: score >= 1.5 ? 'good' : score <= -3 ? 'bad_critical' : score <= -1.25 ? 'bad' : 'neutral',
            effect
        };
    },

    hasStrongPostApplyFailure(snapshot, context = {}) {
        const progression = STATE.presetProgression || null;
        const effect = this.getPostApplyEffectSignal(progression);
        if (effect.verdict === 'bad_critical') return true;
        if (effect.verdict === 'bad') return true;

        const score = context.score || this.getScoreState(snapshot);
        const minute = Number(context.minute ?? this.getEffectiveMinute(snapshot));
        const myXg = Number(context.myXg || 0);
        const oppXg = Number(context.oppXg || 0);
        const myXT = Number(context.myXT || 0);
        const oppXT = Number(context.oppXT || 0);
        const myBad = Number(context.myBad || 0);

        if (score.state === 'losing' && minute >= 70 && oppXg > myXg + 0.4) return true;
        if (oppXg > myXg + 0.8 || oppXT > myXT + 0.6) return true;
        if (myBad >= 26) return true;
        return false;
    },

    applyProgressionGuard(candidate, snapshot, context = {}) {
        if (!candidate?.name || !snapshot || snapshot.status === 'finished') return candidate;

        const progression = STATE.presetProgression || null;
        const lastApplied = progression?.lastAppliedPreset || '';
        if (!lastApplied || lastApplied === 'manual_change' || !TacticPresetLibrary?.meta?.[lastApplied]) {
            return Object.assign({}, candidate, { progressionAction: 'new_baseline' });
        }

        if (String(progression.gameId || '') !== String(snapshot.gameId || '')) {
            return Object.assign({}, candidate, { progressionAction: 'new_game' });
        }

        const urgency = context.urgency || {};
        if (urgency.overrideProgressionGuard) {
            return Object.assign({}, candidate, { progressionAction: 'emergency_override' });
        }

        const qualitySignal = context.generatorQualitySignal || snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(snapshot.developerHints || []);
        const qualityPositive = qualitySignal?.detected && qualitySignal.direction === 'positive';
        const strongFailure = this.hasStrongPostApplyFailure(snapshot, context);
        const currentGroup = progression.family || this.getPresetGroup(lastApplied);
        const candidateGroup = this.getPresetGroup(candidate.name);
        const previousPreset = progression.previousPreset || '';
        const allowFamilyChange = urgency.allowFamilyChange === true;

        if (qualityPositive && candidate.name !== lastApplied && !strongFailure) {
            return {
                name: lastApplied,
                reason: 'генератор оценивает игру лучше ожиданий — текущий baseline не ломаем до сильного отрицательного сигнала',
                progressionAction: 'hold_positive_generator_quality'
            };
        }

        if (previousPreset && candidate.name === previousPreset && !strongFailure) {
            return {
                name: lastApplied,
                reason: 'анти-ping-pong: предыдущий пресет не возвращаем в соседнем окне без явного провала',
                progressionAction: 'hold_against_immediate_rollback'
            };
        }

        if (candidate.name === lastApplied) {
            return Object.assign({}, candidate, { progressionAction: 'hold_current' });
        }

        if (candidateGroup !== currentGroup && !allowFamilyChange && !strongFailure) {
            const adjacent = this.getAdjacentPresetInFamily(lastApplied, candidate.name, currentGroup);
            if (adjacent && adjacent !== candidate.name && adjacent !== lastApplied) {
                return {
                    name: adjacent,
                    reason: `пошаговая корректировка от текущего baseline ${this.getPresetTitle(lastApplied)} вместо резкой смены семейства`,
                    progressionAction: 'family_step'
                };
            }

            return {
                name: lastApplied,
                reason: 'сигнал недостаточно сильный для смены семейства пресетов; держим применённый baseline',
                progressionAction: 'hold_family_change_blocked'
            };
        }

        if (candidateGroup === currentGroup) {
            const adjacent = this.getAdjacentPresetInFamily(lastApplied, candidate.name, currentGroup);
            if (adjacent && adjacent !== candidate.name) {
                return {
                    name: adjacent,
                    reason: `усиливаем/смягчаем текущий baseline пошагово: ${this.getPresetTitle(lastApplied)} → ${this.getPresetTitle(adjacent)}`,
                    progressionAction: 'adjacent_step'
                };
            }
        }

        return Object.assign({}, candidate, { progressionAction: 'accepted' });
    },

    getConcisePresetAction(name, state = {}) {
        const actions = {
            Pep_BoxControl_bal2: 'Держать мяч, снизить темп/риск, не раскрывать переходы.',
            Pep_ControlledPush_att3: 'Поднять продвижение и темп на один шаг без ломки обороны.',
            Xabi_VerticalBox_att3: 'Искать вертикальный вход через центр/полупространства, без слепых навесов.',
            Pep_PressCooldown_bal2: 'Сбросить интенсивность прессинга и вернуть контроль.',
            Compact_Counter_def3: 'Закрыть переходы и оставить быстрый выход в свободную зону.',
            Simeone_Compact442_def4: 'Сжать блок, убрать лишний риск, не садиться в полный автобус.',
            Simeone_LowBlock_def5: 'Максимально закрыть штрафную и пережить концовку.',
            Mourinho_WeakSide_def3: 'Компактно обороняться и выходить через слабую сторону.',
            Conte_WingbackWidth_bal4: 'Дать ширину, но не превращать атаку в навесной шум.',
            Klopp_Gegenpress_att4: 'Поднять давление и темп, контролируя усталость/фолы.',
            Bielsa_ChaosPress_att5: 'All-in давление только когда уже нужен риск ради гола.',
            Pep_TwoThreeFive_att3: 'Дожимать позиционно: выше присутствие, но без хаоса.',
            DeZerbi_BaitPress_bal3: 'Заманить прессинг и выпускать мяч между линиями.',
            DeZerbi_Release_att4: 'Быстрее выпускать атаку за высокую линию соперника.',
            Klopp_WideTrap_att4: 'Обойти закрытый центр через оба фланга и прессинг.',
            Henta_CounterTrap_att4: 'Низко отбирать и резко выходить в контратаку.',
            Henta_WideTrap_att3: 'Упростить выход через фланги без форсирования центра.',
            Henta_CentralTrap_att3: 'Давить слабый центр только при низком браке.',
            Henta_LeftTrap_att3: 'Перегрузить левый фланг как главную зону выхода.',
            Henta_RightTrap_att3: 'Перегрузить правый фланг как главную зону выхода.',
            Henta_Hold_def3: 'Удерживать компактность с активным отбором без лишнего риска.'
        };

        return actions[name] || TacticPresetLibrary?.meta?.[name]?.idea || 'Поменять настройки по текущему состоянию матча.';
    },

    getProgressionActionLabel(action) {
        const map = {
            emergency_override: 'аварийный override anti-ping-pong',
            hold_positive_generator_quality: 'держим baseline: генератор подтверждает качество игры',
            hold_against_immediate_rollback: 'не откатываемся сразу к прошлому пресету',
            hold_family_change_blocked: 'сигнал слабый для смены семейства',
            family_step: 'пошаговая смена вместо резкого прыжка',
            adjacent_step: 'пошаговое усиление/смягчение',
            hold_current: 'оставить текущий baseline'
        };
        return map[action] || action;
    },

    });
}
