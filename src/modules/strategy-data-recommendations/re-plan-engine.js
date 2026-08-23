// Re Plan Engine
// Extracted verbatim from recommendation-engine.js (stage 4 refactor).
// Assigned onto the RecommendationEngine facade; behaviour unchanged.

if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
    RecommendationEngine.stage4RePlanEngineApplied = true;

    Object.assign(RecommendationEngine, {
    makeNotEnoughData(snapshot, gate) {
        const minute = this.getEffectiveMinute(snapshot);
        const window = snapshot?.generationWindow || MatchTimingModel.getWindow(minute);
        const rows = [
            gate?.reason || 'Недостаточно данных для рекомендации.',
            minute ? `Текущая минута: ${minute}.` : '',
            window?.label ? `Текущий отрезок: ${window.label}.` : '',
            'Live Parser пока только собирает метрики: счёт, xG/xT, силу на поле, подсказки генератора и детали «подробнее».'
        ];
        return this.sectionHtml('Сбор данных', rows, '#ffd76a', 3);
    },

    buildManualPlan(snapshot, my, opp, state) {
        const plan = { context: [], developer: [], preset: [], controls: [], notes: [], primaryPresetName: '' };
        const urgency = state.urgency || TacticalUrgencyModel.classify(snapshot, state);
        const decisionWindow = urgency.decisionWindow || TacticalUrgencyModel.getDecisionWindow(state.minute);

        if (urgency?.label) {
            const target = decisionWindow?.targetSegment ? ` Цель: ${decisionWindow.targetSegment}.` : '';
            const apply = decisionWindow?.applyByMinute ? ` Применить до ${decisionWindow.applyByMinute}-й.` : '';
            plan.context.push(`Уровень решения: ${urgency.label}.${target}${apply}`.trim());
            if (urgency.reason) plan.context.push(`Причина срочности: ${urgency.reason}.`);
        }

        plan.context.push(...this.makeMatchRead(snapshot, my, opp, state));

        if (state.generatorQualitySignal?.detected) {
            const signal = state.generatorQualitySignal;
            const pctText = signal.percent != null ? ` на ${signal.percent}%` : '';
            if (signal.direction === 'positive') plan.developer.push(`Игра лучше ожиданий генератора${pctText}: baseline работает, не ломать его без сильного триггера.`);
            else if (signal.direction === 'negative') plan.developer.push(`Генератор оценивает игру ниже ожиданий${pctText}: повышаем готовность к смене плана.`);
        }

        const gep = state.generatorExpectedPerformance || null;
        if (gep?.detected) {
            if (gep.summary) plan.developer.push(`Каналы генератора: ${gep.summary}.`);

            if (gep.defense?.detected) {
                const d = gep.defense;
                const valueText = d.actual != null && d.expected != null ? ` (${d.actual.toFixed(2)} xGA при ожидаемом ${d.expected.toFixed(2)} xGA)` : '';
                if (d.verdict === 'working') plan.controls.push(`Оборона работает${valueText}: не ломать линию/ширину/прессинг без radical/emergency-триггера.`);
                if (d.verdict === 'underperforming') plan.controls.push(`Оборона недобирает${valueText}: снизить риск, закрыть переходы и компактнее держать блок.`);
            }

            if (gep.attack?.detected) {
                const a = gep.attack;
                const valueText = a.actual != null && a.expected != null ? ` (${a.actual.toFixed(2)} xG при ожидаемом ${a.expected.toFixed(2)} xG)` : '';
                if (a.verdict === 'working') plan.controls.push(`Атака работает${valueText}: сохранить атакующий паттерн.`);
                if (a.verdict === 'underperforming') plan.controls.push(`Атака недобирает${valueText}: усилить продвижение/темп/риск или ширину по условиям, не ломая рабочую оборону.`);
            }
        }

        if (state.generatorDetailMetrics?.blocksCount) {
            plan.developer.push('Детали «подробнее» прочитаны из скрытых блоков; точный отрезок этих данных неизвестен, поэтому используем их только как вспомогательный сигнал.');
        }

        const own = state.ownCrossSummary;
        if (own?.total >= 2) {
            if (own.signal === 'open_play_crosses_bad') {
                plan.developer.push(`Кроссы с игры не работают: ${own.openPlay.won}/${own.openPlay.total}; не усиливать обычные навесы без нового адресата.`);
                plan.controls.push('Атака: не повышать навесы; искать низовой вход, пас между линиями или полупространства.');
            } else if (own.signal === 'crosses_bad_total') {
                plan.developer.push(`Кроссы в целом слабые: ${own.won}/${own.total}; стандарты/навесы не должны быть главным планом атаки.`);
            }
        }

        const oppCross = state.oppCrossSummary;
        if (oppCross?.total >= 2 && oppCross.winRate >= 55) {
            plan.developer.push(`Кроссы соперника опасны: ${oppCross.won}/${oppCross.total}; не раскрывать фланги без необходимости.`);
            plan.controls.push('Оборона: осторожнее с фланговой шириной и высокой линией, если соперник продолжает грузить в штрафную.');
        }

        if (state.strengthContext?.known) {
            const sign = state.strengthGap > 0 ? '+' : '';
            plan.notes.push(`Сила состава: ${state.myPower} против ${state.oppPower} (${sign}${state.strengthGap}) — ${state.strengthContext.label}; диапазоны provisional до калибровки по raw live.`);
            if (state.strengthContext.mode === 'advantage') plan.notes.push('Преимущество силы: без сильного давления не уходить в чрезмерно пассивный режим; конвертировать силу в контроль и качество атаки.');
            if (state.strengthContext.mode === 'disadvantage') plan.notes.push('Недостаток силы: осторожнее с хаотичным высоким прессингом; важнее компактность и простые выходы.');
        }

        if (state.pressFatigue?.active) {
            plan.context.push(`Цена прессинга: ${state.pressFatigue.reason}.`);
            plan.controls.push('Прессинг: снизить интенсивность/линию или перейти в контроль, если сила на поле падает и растёт брак.');
        }

        return plan;
    },

    applyDeveloperHints(snapshot, plan) {
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const controlHints = DeveloperHintParser.getControlHints(hints);
        const generatorHints = DeveloperHintParser.getGeneratorHints(hints);
        const daveNotes = typeof DaveEngineKnowledge !== 'undefined'
            ? DaveEngineKnowledge.getRelevantNotes({ tags: [] }, null, snapshot.generatorQualitySignal)
            : [];

        const existingControlKeys = new Set(this.dedupeRows(plan.controls || []).map(row =>
            String(row).toLowerCase().replace(/^подсказка движка:\s*/i, '').replace(/[.]+$/g, '').trim()
        ));
        let addedControlHints = 0;
        controlHints.forEach(hint => {
            if (!hint.control?.ui || addedControlHints >= 3) return;
            const key = String(hint.control.ui).toLowerCase().replace(/[.]+$/g, '').trim();
            if (existingControlKeys.has(key)) return;
            existingControlKeys.add(key);
            plan.controls.push(`Подсказка движка: ${hint.control.ui}.`);
            addedControlHints += 1;
        });

        generatorHints.slice(0, 2).forEach(hint => {
            const text = hint.text || '';
            if (text && !plan.developer.some(x => x.includes(text))) {
                plan.developer.push(`Генератор: ${text}.`);
            }
        });

        daveNotes.slice(0, 1).forEach(note => {
            if (note?.text) plan.notes.push(`Dave/движок: ${note.text}`);
        });
    },

    applyWeakOpponentZoneRule(playerSignals, plan) {
        const weak = playerSignals?.weakOppSkill?.[0] || null;
        if (!weak) return;

        const pos = weak.normalizedPosition || '';
        if (['DR', 'MR'].includes(pos)) plan.controls.push(`Слабая зона соперника справа (${weak.name || pos}) — можно чаще атаковать левым флангом.`);
        if (['DL', 'ML'].includes(pos)) plan.controls.push(`Слабая зона соперника слева (${weak.name || pos}) — можно чаще атаковать правым флангом.`);
        if (['DC', 'DM', 'CM'].includes(pos)) plan.controls.push(`Слабый центр соперника (${weak.name || pos}) — можно аккуратно усиливать вход через центр, если брак низкий.`);
    },

    selectRawPreset(snapshot, state) {
        const score = state.score;
        const minute = state.minute;
        const xgGap = state.oppXg - state.myXg;
        const xtGap = state.oppXT - state.myXT;
        const ownCrossBad = ['open_play_crosses_bad', 'crosses_bad_total'].includes(state.ownCrossSummary?.signal);
        const centerClosed = state.tags.includes('opponent_low_block') || state.tags.includes('own_open_play_crosses_bad');
        const attackUnder = state.generatorExpectedPerformance?.attack?.verdict === 'underperforming';
        const defenseWorking = state.generatorExpectedPerformance?.defense?.verdict === 'working';
        const defenseBad = state.generatorExpectedPerformance?.defense?.verdict === 'underperforming';
        const attackWorking = state.generatorExpectedPerformance?.attack?.verdict === 'working';

        if (state.pressFatigue?.active) {
            return { name: 'Pep_PressCooldown_bal2', reason: 'высокий прессинг начал стоить силы/брака; нужен cooldown без посадки в автобус' };
        }

        if (state.urgency?.preferControlOrCompact) {
            return { name: xgGap > 0.35 || xtGap > 0.25 ? 'Simeone_Compact442_def4' : 'Pep_BoxControl_bal2', reason: 'крупное преимущество — закрыть переходы, снизить риск и сохранить энергию' };
        }

        if (state.urgency?.level === 'emergency') {
            if (score.state === 'losing') return { name: minute >= 70 ? 'Bielsa_ChaosPress_att5' : 'Klopp_Gegenpress_att4', reason: 'экстренный сценарий по счёту/метрикам — нужна кардинальная смена давления' };
            if (defenseBad || xgGap > 0.6) return { name: 'Compact_Counter_def3', reason: 'экстренно закрыть переходы и оставить быстрый выход' };
        }

        if (score.state === 'winning' && minute >= 70) {
            if (xgGap > 0.35 || xtGap > 0.25 || state.tags.includes('opponent_crosses_dangerous')) return { name: 'Simeone_Compact442_def4', reason: 'ведём поздно, соперник создаёт давление — компактнее без полного автобуса' };
            return { name: 'Pep_BoxControl_bal2', reason: 'ведём и контролируем: убрать хаос, держать мяч и не раскрывать переходы' };
        }

        if (score.state === 'losing' && minute >= 80) {
            return { name: ownCrossBad ? 'Klopp_Gegenpress_att4' : 'Bielsa_ChaosPress_att5', reason: 'финальное окно решения — нужен рост давления до 84-й минуты' };
        }

        if (score.state === 'losing' && minute >= 55) {
            if (state.myBad >= 20) return { name: 'Pep_ControlledPush_att3', reason: 'нужен гол, но брак высокий — усиливать атаку контролируемо' };
            return { name: ownCrossBad ? 'Xabi_VerticalBox_att3' : 'Klopp_Gegenpress_att4', reason: 'проигрываем после 55-й — усилить давление, но учитывать качество кроссов/брака' };
        }

        if (defenseWorking && attackUnder) {
            if (state.tags.includes('center_weak') && state.myBad <= 16) return { name: 'Xabi_VerticalBox_att3', reason: 'оборона работает, атака недобирает, центр доступен — вертикальный box без ломки защиты' };
            if (centerClosed && !ownCrossBad) return { name: 'Conte_WingbackWidth_bal4', reason: 'оборона работает, атака недобирает, центр закрыт — аккуратно добавить ширину' };
            return { name: 'Pep_ControlledPush_att3', reason: 'оборона работает, атака недобирает — controlled push без разрушения структуры' };
        }

        if (attackWorking && defenseBad) {
            return { name: 'Compact_Counter_def3', reason: 'атака работает, но оборона недобирает — защитить переходы, не убивая угрозу' };
        }

        if (defenseBad && attackUnder) {
            return { name: 'Pep_BoxControl_bal2', reason: 'оба канала недобирают — reset через контроль и снижение хаоса' };
        }

        if (xgGap > 0.65 || xtGap > 0.55) {
            return { name: score.state === 'winning' ? 'Simeone_Compact442_def4' : 'Compact_Counter_def3', reason: 'соперник заметно опаснее по xG/xT — сначала закрыть переходы' };
        }

        if (state.myBad >= 22) {
            return { name: 'Pep_BoxControl_bal2', reason: 'высокий брак — снизить риск и стабилизировать розыгрыш' };
        }

        if (state.tags.includes('opponent_high_press')) {
            return { name: state.myBad <= 18 ? 'DeZerbi_BaitPress_bal3' : 'Henta_CounterTrap_att4', reason: 'соперник прессингует высоко — выбрать bait-розыгрыш или простой контрвыход' };
        }

        if (state.tags.includes('opponent_low_block')) {
            return { name: ownCrossBad ? 'Xabi_VerticalBox_att3' : 'Pep_TwoThreeFive_att3', reason: 'низкий блок соперника — вскрывать терпением, позиционной атакой или вертикалью без слепых навесов' };
        }

        if (state.strengthContext?.mode === 'advantage' && state.myXg <= state.oppXg + 0.2) {
            return { name: state.myBad <= 16 ? 'Xabi_BoxMidfield_bal3' : 'Pep_BoxControl_bal2', reason: 'сила выше, но качество моментов не доминирует — конвертировать силу в контроль и вход в штрафную' };
        }

        if (state.strengthContext?.mode === 'disadvantage') {
            return { name: 'Mourinho_WeakSide_def3', reason: 'по силе уступаем — компактность, слабая сторона и низкий риск важнее хаотичного прессинга' };
        }

        if (state.tags.includes('attacking_momentum') && state.myBad <= 16) {
            return { name: 'Pep_TwoThreeFive_att3', reason: 'есть атакующий momentum и низкий брак — можно дожимать позиционно' };
        }

        return { name: 'Pep_BoxControl_bal2', reason: 'без явного перекоса лучший baseline — контроль, снижение хаоса и подготовка следующего среза' };
    },

    shouldRecommendSchemeChange(snapshot, state, urgency, presetName) {
        const reasons = [];
        const score = state.score || { state: 'unknown', diff: 0 };
        const losingBy = Math.max(0, -Number(score.diff || 0));
        const winningBy = Math.max(0, Number(score.diff || 0));
        const minute = Number(state.minute || 0);
        const xgGap = state.oppXg - state.myXg;
        const xtGap = state.oppXT - state.myXT;

        if (urgency?.level === 'emergency') reasons.push('экстренный сценарий');
        if (urgency?.level === 'radical') reasons.push('кардинальное окно решения');
        if (urgency?.decisionWindow?.phase === 'final_decision') reasons.push('финальное окно 80-84');
        if (losingBy >= 3 || (minute <= 30 && losingBy >= 2)) reasons.push('счёт требует перестройки');
        if (winningBy >= 4 || (minute <= 35 && winningBy >= 3)) reasons.push('крупное преимущество — закрыть матч');
        if (xgGap >= 0.8 || xtGap >= 0.7) reasons.push('текущая структура пропускает давление');
        if (state.tags.includes('opponent_crosses_dangerous')) reasons.push('кроссы соперника опасны');
        if (state.tags.includes('opponent_low_block') && (presetName === 'Conte_WingbackWidth_bal4' || presetName === 'Klopp_WideTrap_att4')) reasons.push('центр закрыт, нужна ширина');
        if (score.state === 'winning' && minute >= 75 && xgGap > 0.25) reasons.push('поздняя защита преимущества');
        if (score.state === 'losing' && minute >= 80) reasons.push('поздний риск ради гола');
        if (state.pressFatigue?.risk === 'high') reasons.push('структура прессинга выматывает состав');

        return {
            show: reasons.length > 0,
            reason: reasons.slice(0, 2).join('; ')
        };
    },

    selectPreset(snapshot, my, opp, playerSignals, plan, state) {
        const urgency = state.urgency || TacticalUrgencyModel.classify(snapshot, state);
        if (!urgency.allowPreset) {
            plan.preset.push(urgency.reason || 'На этом этапе новая большая рекомендация не выдаётся.');
            return null;
        }

        const raw = this.selectRawPreset(snapshot, state);
        const guarded = this.applyProgressionGuard(raw, snapshot, {
            score: state.score,
            minute: state.minute,
            myXg: state.myXg,
            oppXg: state.oppXg,
            myXT: state.myXT,
            oppXT: state.oppXT,
            myBad: state.myBad,
            urgency,
            generatorQualitySignal: state.generatorQualitySignal
        });

        const name = guarded?.name || raw?.name || 'Pep_BoxControl_bal2';
        const title = this.getPresetTitle(name);
        const reason = guarded?.reason || raw?.reason || 'лучший текущий baseline по live-данным';
        plan.primaryPresetName = name;
        STATE.presetProgression = Object.assign({}, STATE.presetProgression || {}, {
            schema: 'slf_preset_progression_v1',
            gameId: snapshot.gameId,
            lastRecommendedPreset: name,
            recommendedAt: Date.now(),
            recommendedBucket: snapshot.bucket || '',
            recommendedWindowIndex: snapshot.generationWindow?.index || 0,
            family: this.getPresetGroup(name),
            rank: this.getPresetRank(name),
            lastRecommendationReason: reason,
            lastProgressionAction: guarded?.progressionAction || 'selected'
        });

        plan.preset.push(`Поставить: ${title}.`);
        plan.preset.push(`Почему: ${reason}.`);
        plan.preset.push(`Что сделать: ${this.getConcisePresetAction(name, state)}`);
        if (guarded?.progressionAction && !['accepted', 'new_baseline', 'selected'].includes(guarded.progressionAction)) {
            plan.preset.push(`Ограничитель: ${this.getProgressionActionLabel(guarded.progressionAction)}.`);
        }

        const schemeDecision = this.shouldRecommendSchemeChange(snapshot, state, urgency, name);
        const scheme = this.getPresetScheme(name);
        if (schemeDecision.show && scheme) {
            plan.preset.push(`Перестройка: ${schemeDecision.reason}.`);
            plan.preset.push(`Схема для ${title}: ${scheme}.`);
        }

        return name;
    },

    normalizePlan(plan) {
        const source = plan || {};
        const clean = Object.assign({}, source);
        ['context', 'developer', 'preset', 'controls', 'notes'].forEach(key => {
            clean[key] = this.dedupeRows(source[key] || []);
        });
        return clean;
    },

    compactPlan(plan, snapshot, primaryPresetName = '') {
        const cleanPlan = this.normalizePlan(plan);
        const blocks = [];
        blocks.push(this.sectionHtml('Контекст', cleanPlan.context || [], '#8fd3ff', 2));
        blocks.push(this.sectionHtml('Подсказки генератора', cleanPlan.developer || [], '#c8ff7a', 3));
        blocks.push(this.sectionHtml('Конкретное действие', cleanPlan.preset || [], '#75ff75', 1));
        blocks.push(this.sectionHtml('Ручные настройки', cleanPlan.controls || [], '#ffd76a', 4));
        blocks.push(this.sectionHtml('Заметки', cleanPlan.notes || [], '#ddd', 5));

        const html = blocks.filter(Boolean).join('');
        return html || this.sectionHtml('Рекомендация', ['Явной причины менять пресет нет. Играй от счёта, контроля и компактности блока.'], '#ddd', 3);
    },

    makeObserverAnalysis(snapshot) {
        const rows = [];
        const minute = this.getEffectiveMinute(snapshot);
        rows.push(`Матч смотрится без выбранной команды. Минута: ${minute || '?'}.`);
        rows.push('Live Parser собирает статистику, но тактическая рекомендация строится только для управляемой команды.');
        return this.sectionHtml('Рекомендация', rows, '#ffd76a', 3);
    },

    make(snapshot) {
        try {
            if (!snapshot || !snapshot.stats || snapshot.stats.length < 2) {
                return this.sectionHtml('Рекомендация', ['Недостаточно данных для рекомендации.'], '#ffd76a', 3);
            }

            snapshot.effectiveMinute = this.getEffectiveMinute(snapshot);
            const gate = this.hasEnoughLiveData(snapshot);
            if (!gate.ok) return this.makeNotEnoughData(snapshot, gate);

            if (!snapshot.myTeam) return this.makeObserverAnalysis(snapshot);

            const pack = this.getTeamStats(snapshot);
            if (!pack || !pack.my || !pack.opp) {
                return this.sectionHtml('Рекомендация', ['Недостаточно данных по командам.'], '#ffd76a', 3);
            }

            const my = pack.my.stats;
            const opp = pack.opp.stats;
            const playerSignals = this.getPlayerSignals(snapshot);
            const state = this.classifyState(snapshot, my, opp, playerSignals);
            state.urgency = TacticalUrgencyModel.classify(snapshot, state);
            const plan = this.buildManualPlan(snapshot, my, opp, state);

            if (snapshot.status !== 'finished') {
                this.applyDeveloperHints(snapshot, plan);
                this.applyWeakOpponentZoneRule(playerSignals, plan);
                this.selectPreset(snapshot, my, opp, playerSignals, plan, state);
            }

            return this.compactPlan(plan, snapshot, plan.primaryPresetName || '');
        } catch (error) {
            console.error('[SLF RecommendationEngine.make failed]', error);
            return this.sectionHtml('Ошибка рекомендации', [
                'Блок рекомендаций не смог построить анализ. Ошибка выведена в console.error.',
                String(error?.message || error)
            ], '#ff9090', 1);
        }
    },

    makePresetFreeze(snapshot, freeze) {
        return this.sectionHtml('Статус', [
            `Пресет применён: ${freeze.presetName}.`,
            `Ждём следующий snapshot/отрезок: ${freeze.targetBucket || '?'}.`
        ], '#ffd76a', 3);
    },

    update(snapshot) {
        const el = document.getElementById('slf-parser-recommendation');
        if (!el) return;

        try {
            const freeze = SnapshotEngine.getRecommendationFreezeStatus(snapshot);
            if (freeze.active) {
                const waitText = `Пресет применён: ${freeze.presetName}. Ждём следующий snapshot/отрезок ${freeze.targetBucket || '?'}.`;
                if (typeof UI !== 'undefined' && UI.updateParserStatus) UI.updateParserStatus(waitText);

                const preserved = STATE.lastRecommendationHtml || freeze.preservedRecommendationHtml || '';
                if (preserved && !this.isPlaceholderHtml(preserved)) {
                    el.innerHTML = preserved;
                    return;
                }
            }

            const html = this.make(snapshot);
            el.innerHTML = html;
            this.persistRenderedRecommendation(html, snapshot, { source: 'normal_render_v2' });
        } catch (error) {
            console.error('[SLF RecommendationEngine.update failed]', error);
            el.innerHTML = this.sectionHtml('Ошибка рекомендации', [
                'RecommendationEngine.update упал, чтобы не оставлять пустой placeholder.',
                String(error?.message || error)
            ], '#ff9090', 1);
        }
    }
    });
}
