// 10. Recommendation Engine
// ============================================================

const RecommendationEngine = {
    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    getSectionKey(title) {
        const t = String(title || '').toLowerCase();
        if (t.includes('конкрет')) return 'action';
        if (t.includes('контекст')) return 'context';
        if (t.includes('генератор')) return 'generator';
        if (t.includes('ручн')) return 'controls';
        if (t.includes('замет')) return 'notes';
        if (t.includes('статус')) return 'status';
        if (t.includes('сбор')) return 'collect';
        if (t.includes('ошибка')) return 'error';
        return 'misc_' + t.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 24);
    },

    getDefaultSectionOpen(title) {
        const t = String(title || '').toLowerCase();
        // Main tactical action stays visible. Error blocks also stay visible so failures are not hidden.
        return t.includes('конкрет') || t.includes('ошибка');
    },

    getStoredSectionOpen(title) {
        const key = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${key}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === '1') return true;
            if (stored === '0') return false;
        } catch (e) {}
        return this.getDefaultSectionOpen(title);
    },

    dedupeRows(rows) {
        const list = (Array.isArray(rows) ? rows : [rows])
            .filter(x => x !== null && x !== undefined && String(x).trim() !== '')
            .map(x => String(x).trim());

        const seen = new Set();
        const result = [];

        list.forEach(row => {
            const key = row
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/^[^:]+:\s*/, '')
                .replace(/[.。]+$/g, '')
                .trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            result.push(row);
        });

        return result;
    },

    sectionHtml(title, rows, color = '#ddd', priority = 3) {
        const list = this.dedupeRows(rows);

        if (!list.length) return '';

        const safeTitle = this.escapeHtml(title);
        const safeRows = list.map(row => `<div style="margin:2px 0;line-height:1.35;">${this.escapeHtml(row)}</div>`).join('');
        const sectionKey = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${sectionKey}`;
        const openAttr = this.getStoredSectionOpen(title) ? ' open' : '';
        const countText = list.length > 1 ? ` <span style="opacity:.65;font-weight:normal;">(${list.length})</span>` : '';
        const toggleJs = `try{localStorage.setItem('${storageKey}',this.open?'1':'0')}catch(e){}`;

        return `
            <details${openAttr} data-slf-rec-priority="${priority}" data-slf-rec-section="${sectionKey}" ontoggle="${toggleJs}" style="margin:5px 0;padding:0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;">
                <summary style="cursor:pointer;list-style:none;padding:7px 9px;font-weight:bold;color:${color};text-align:center;user-select:none;">
                    <span style="float:left;opacity:.65;font-weight:normal;">▸</span>${safeTitle}${countText}
                </summary>
                <div style="padding:0 9px 7px 9px;">${safeRows}</div>
            </details>
        `;
    },

    getTeamStats(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.stats) || snapshot.stats.length < 2) return null;

        if (!snapshot.myTeam) {
            return { my: null, opp: null, a: snapshot.stats[0], b: snapshot.stats[1] };
        }

        const my = snapshot.stats.find(x => Number(x.teamId) === Number(snapshot.myTeam));
        const opp = snapshot.stats.find(x => Number(x.teamId) !== Number(snapshot.myTeam));

        if (!my || !opp) return null;
        return { my, opp };
    },

    getScoreState(snapshot) {
        const score = snapshot?.score;
        const teams = snapshot?.teams || [];
        const myTeam = snapshot?.myTeam;

        if (!score || !myTeam || teams.length < 2) {
            return { known: false, diff: 0, state: 'unknown', myGoals: 0, oppGoals: 0 };
        }

        const isHome = Number(teams[0]) === Number(myTeam);
        const myGoals = isHome ? num(score.home) : num(score.away);
        const oppGoals = isHome ? num(score.away) : num(score.home);
        const diff = myGoals - oppGoals;

        return {
            known: true,
            myGoals,
            oppGoals,
            diff,
            state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
        };
    },

    getXTForMyTeam(snapshot) {
        if (!snapshot?.xT || !snapshot?.myTeam || !Array.isArray(snapshot.teams)) {
            return { myXT: 0, oppXT: 0 };
        }

        const isHome = Number(snapshot.teams[0]) === Number(snapshot.myTeam);
        return {
            myXT: isHome ? num(snapshot.xT.home) : num(snapshot.xT.away),
            oppXT: isHome ? num(snapshot.xT.away) : num(snapshot.xT.home)
        };
    },

    parseMinuteFromEventText(text) {
        const raw = String(text || '').trim();
        const m = raw.match(/^['’`\s]*(\d{1,3})(?:\+(\d{1,2}))?\b/);
        if (!m) return null;

        const base = Number(m[1]);
        if (!Number.isFinite(base) || base <= 0) return null;
        return Math.max(1, Math.min(base, 90));
    },

    getLatestEventMinute(snapshot) {
        const events = Array.isArray(snapshot?.eventsText) ? snapshot.eventsText : [];
        const minutes = events
            .map(text => this.parseMinuteFromEventText(text))
            .filter(x => Number.isFinite(x) && x > 0);

        return minutes.length ? Math.max(...minutes) : null;
    },

    getEffectiveMinute(snapshot) {
        const explicit = Number(snapshot?.minute);
        if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, 90);

        const baseMinute = Number(snapshot?.baseMinute);
        if (Number.isFinite(baseMinute) && baseMinute > 0) return Math.min(baseMinute, 90);

        const eventMinute = this.getLatestEventMinute(snapshot);
        if (Number.isFinite(eventMinute) && eventMinute > 0) return eventMinute;

        const windowFrom = Number(snapshot?.generationWindow?.from);
        if (Number.isFinite(windowFrom) && windowFrom > 1) return windowFrom;

        const bucket = String(snapshot?.bucket || '');
        const bucketMatch = bucket.match(/(\d{1,3})/);
        if (bucketMatch) {
            const bucketMinute = Number(bucketMatch[1]);
            if (Number.isFinite(bucketMinute) && bucketMinute > 1) return Math.min(bucketMinute, 90);
        }

        return 0;
    },

    getPlayerSignals(snapshot) {
        const rows = Array.isArray(snapshot?.lineupRows) ? snapshot.lineupRows : [];
        const teams = snapshot?.teams || [];
        const myTeam = snapshot?.myTeam;
        const mySide = myTeam && Number(teams[0]) === Number(myTeam) ? 'home' : 'away';
        const oppSide = mySide === 'home' ? 'away' : 'home';

        const isStarter = p => p && p.isStarter && p.side !== 'sub' && p.normalizedPosition && p.normalizedPosition !== 'SUB';
        const oppRows = rows.filter(p => isStarter(p) && p.side === oppSide);
        const weakOppSkill = oppRows
            .filter(p => p.displayMetricMode === 'skill' && p.skill != null)
            .sort((a, b) => a.skill - b.skill)
            .slice(0, 2);

        return { weakOppSkill };
    },

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

    hasEnoughLiveData(snapshot) {
        const minute = this.getEffectiveMinute(snapshot);
        if (!snapshot || !Array.isArray(snapshot.stats) || snapshot.stats.length < 2) {
            return { ok: false, phase: 'no_stats', reason: 'Недостаточно статистики команд для рекомендации.' };
        }

        if (snapshot.status === 'finished') return { ok: true, phase: 'finished' };

        if (!Number.isFinite(minute) || minute <= 0) {
            return { ok: false, phase: 'unknown_minute', reason: 'Ждём первую валидную минуту матча.' };
        }

        if (minute < 15) {
            return {
                ok: false,
                phase: 'collect',
                reason: 'Сбор данных до первого generation-среза. Первая рекомендация появится с 15-й минуты для окна 16-30.'
            };
        }

        return { ok: true, phase: 'ready' };
    },

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

    classifyState(snapshot, my, opp, playerSignals = {}) {
        const minute = this.getEffectiveMinute(snapshot);
        const score = this.getScoreState(snapshot);
        const xt = this.getXTForMyTeam(snapshot);
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const myXg = num(my?.xG);
        const oppXg = num(opp?.xG);
        const myPossession = num(my?.possession);
        const oppPossession = num(opp?.possession);
        const myBad = num(my?.badActionsPct ?? my?.defective);
        const myFouls = num(my?.fouls ?? my?.['-7']);
        const myPower = num(my?.power);
        const oppPower = num(opp?.power);
        const oppPressVector = num(opp?.pressVector ?? opp?.press_height);
        const oppDefVector = num(opp?.defVector ?? opp?.def_height);
        const strengthContext = typeof StrengthContextModel !== 'undefined'
            ? StrengthContextModel.getPowerContext(myPower, oppPower)
            : { known: false, strengthGap: null, label: '', mode: 'unknown', bucket: 'unknown' };
        const generatorQualitySignal = snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(hints);
        const generatorExpectedPerformance = snapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(hints) : null);
        const generatorDetailMetrics = snapshot.generatorDetailMetrics || null;
        const ownCrossSummary = generatorDetailMetrics?.crosses?.own?.summary || null;
        const oppCrossSummary = generatorDetailMetrics?.crosses?.opponent?.summary || null;
        const pressFatigue = typeof StrengthContextModel !== 'undefined'
            ? StrengthContextModel.assessPressFatigue(snapshot, { minute, myXg, oppXg, myXT: xt.myXT, oppXT: xt.oppXT, myFouls, myBad })
            : { active: false, risk: 'low' };

        const tags = [];
        const add = tag => { if (tag && !tags.includes(tag)) tags.push(tag); };

        if (score.state === 'winning') add('winning');
        if (score.state === 'losing') add('losing');
        if (score.state === 'draw') add('draw');
        if (score.state === 'winning' && minute >= 70) add('late_protect_lead');
        if (score.state === 'losing' && minute >= 55) add('need_goal');
        if (score.state === 'losing' && minute >= 80) add('late_need_goal');
        if (oppXg > myXg + 0.45 || xt.oppXT > xt.myXT + 0.25) add('under_pressure');
        if (myXg > oppXg + 0.35 || xt.myXT > xt.oppXT + 0.2) add('attacking_momentum');
        if (myBad >= 20) add('high_bad_actions');
        if (myBad <= 13 && myBad > 0) add('low_bad_actions');
        if (oppPressVector >= 65) add('opponent_high_press');
        if (oppDefVector > 0 && oppDefVector <= 45) add('opponent_low_block');
        if (generatorQualitySignal?.detected && generatorQualitySignal.direction === 'positive') add('generator_quality_positive');
        if (generatorQualitySignal?.detected && generatorQualitySignal.direction === 'negative') add('generator_quality_negative');
        if (generatorExpectedPerformance?.defense?.verdict === 'working') add('generator_defense_working');
        if (generatorExpectedPerformance?.defense?.verdict === 'underperforming') add('generator_defense_underperforming');
        if (generatorExpectedPerformance?.attack?.verdict === 'working') add('generator_attack_working');
        if (generatorExpectedPerformance?.attack?.verdict === 'underperforming') add('generator_attack_underperforming');
        if (ownCrossSummary?.signal === 'open_play_crosses_bad') add('own_open_play_crosses_bad');
        if (ownCrossSummary?.signal === 'crosses_bad_total') add('own_crosses_bad_total');
        if (oppCrossSummary?.winRate != null && oppCrossSummary.winRate >= 55 && oppCrossSummary.total >= 2) add('opponent_crosses_dangerous');
        if (strengthContext.mode === 'advantage') add(strengthContext.bucket === 'huge_advantage' || strengthContext.bucket === 'clear_advantage' ? 'strength_advantage_clear' : 'strength_advantage_slight');
        if (strengthContext.mode === 'disadvantage') add(strengthContext.bucket === 'huge_disadvantage' || strengthContext.bucket === 'clear_disadvantage' ? 'strength_disadvantage_clear' : 'strength_disadvantage_slight');
        if (pressFatigue.active) add('press_fatigue_risk');

        const weakOpp = playerSignals?.weakOppSkill?.[0] || null;
        const weakPos = weakOpp?.normalizedPosition || null;
        if (['DR', 'MR'].includes(weakPos)) add('attack_left');
        if (['DL', 'ML'].includes(weakPos)) add('attack_right');
        if (['DC', 'DM', 'CM'].includes(weakPos)) add('center_weak');
        if (!tags.length) add('base_balance');

        return {
            score,
            minute,
            myXT: xt.myXT,
            oppXT: xt.oppXT,
            myXg,
            oppXg,
            myPossession,
            oppPossession,
            myBad,
            myFouls,
            myPower,
            oppPower,
            strengthGap: strengthContext.strengthGap,
            strengthContext,
            pressFatigue,
            oppPressVector,
            oppDefVector,
            generatorQualitySignal,
            generatorExpectedPerformance,
            generatorDetailMetrics,
            ownCrossSummary,
            oppCrossSummary,
            tags,
            primary: tags[0] || 'base_balance'
        };
    },

    makeMatchRead(snapshot, my, opp, state) {
        const rows = [];
        const score = state.score || { state: 'unknown', diff: 0 };
        const minute = state.minute;

        if (score.state === 'winning') rows.push(`Ход матча: ведём ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else if (score.state === 'losing') rows.push(`Ход матча: проигрываем ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else if (score.state === 'draw') rows.push(`Ход матча: ничья ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else rows.push(`Ход матча: ${minute || '?'}-я минута.`);

        if (state.myXg > state.oppXg + 0.4) rows.push(`По xG мы опаснее: ${state.myXg.toFixed(2)} против ${state.oppXg.toFixed(2)}.`);
        else if (state.oppXg > state.myXg + 0.4) rows.push(`По xG соперник опаснее: ${state.oppXg.toFixed(2)} против ${state.myXg.toFixed(2)}.`);
        else rows.push(`По xG матч близкий: ${state.myXg.toFixed(2)} против ${state.oppXg.toFixed(2)}.`);

        if (state.myXT > state.oppXT + 0.2) rows.push('По xT мы лучше продвигаем атаки.');
        else if (state.oppXT > state.myXT + 0.2) rows.push('По xT соперник опаснее продвигает атаки.');

        if (state.strengthContext?.known) {
            const sign = state.strengthGap > 0 ? '+' : '';
            rows.push(`Сила на поле: ${state.myPower} / ${state.oppPower} (${sign}${state.strengthGap}) — ${state.strengthContext.label}.`);
        }

        if (state.myBad >= 20) rows.push('Брак высокий — сначала нужна структура, а не хаос.');
        else if (state.myBad > 0 && state.myBad <= 13) rows.push('Брак низкий — можно аккуратно повышать качество продвижения.');

        return rows.slice(0, 6);
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

    isPlaceholderHtml(html) {
        const clean = String(html || '').toLowerCase();
        return !clean ||
            clean.includes('рекомендация появится после snapshot') ||
            clean.includes('рекомендация отложена') ||
            clean.includes('live parser уже запущен');
    },

    captureCurrentRecommendationHtml() {
        const el = document.getElementById('slf-parser-recommendation');
        const html = el ? String(el.innerHTML || '').trim() : '';

        if (!this.isPlaceholderHtml(html)) {
            STATE.lastRecommendationHtml = html;
            STATE.lastRecommendationMeta = Object.assign({}, STATE.lastRecommendationMeta || {}, {
                capturedAt: Date.now(),
                gameId: MatchStateParser.getGameId(),
                source: 'capture_current_recommendation_html'
            });
            return html;
        }

        return STATE.lastRecommendationHtml || '';
    },

    persistRenderedRecommendation(html, snapshot, meta = {}) {
        if (this.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = Object.assign({
            schema: 'slf_last_recommendation_render_v2',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null
        }, meta || {});

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.persistManualState) {
            SnapshotEngine.persistManualState();
        }
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
};
    // ============================================================
