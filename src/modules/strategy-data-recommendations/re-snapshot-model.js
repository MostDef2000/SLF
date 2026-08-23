// Re Snapshot Model
// Extracted verbatim from recommendation-engine.js (stage 4 refactor).
// Assigned onto the RecommendationEngine facade; behaviour unchanged.

if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
    RecommendationEngine.stage4ReSnapshotModelApplied = true;

    Object.assign(RecommendationEngine, {
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

    });
}
