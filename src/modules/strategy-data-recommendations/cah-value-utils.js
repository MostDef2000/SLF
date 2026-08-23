// Cah Value Utils
// Extracted verbatim from current-action-hint-engine.js (stage 4 refactor).
// Assigned onto the CurrentActionHintEngine facade; behaviour unchanged.

if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine) {
    CurrentActionHintEngine.stage4CahValueUtilsApplied = true;

    Object.assign(CurrentActionHintEngine, {
    num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    },

    clamp(value, min = 0, max = 100) {
        return Math.max(min, Math.min(max, this.num(value)));
    },

    round(value, digits = 2) {
        const factor = 10 ** digits;
        return Math.round(this.num(value) * factor) / factor;
    },

    bool(value) {
        return value === true || value === 'true' || value === 1 || value === '1';
    },

    getMetric(snapshot, context, key, aliases = []) {
        const keys = [key, ...aliases];
        for (const source of [context || {}, snapshot || {}]) {
            for (const name of keys) {
                if (source?.[name] !== undefined && source?.[name] !== null) return source[name];
            }
        }
        return undefined;
    },

    hasSignal(signals, names) {
        const list = Array.isArray(names) ? names : [names];
        return list.some(name => signals.includes(name));
    },

    getScoreState(snapshot, context = {}) {
        const state = context?.score?.state || context?.scoreState;
        if (state) return String(state);

        const score = snapshot?.score;
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const myTeam = snapshot?.myTeam;
        if (!score || !myTeam || teams.length < 2) return 'unknown';

        const home = this.num(score.home);
        const away = this.num(score.away);
        const diff = Number(teams[0]) === Number(myTeam) ? home - away : away - home;
        return diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw';
    },

    getScoreDiff(snapshot, context = {}) {
        if (Number.isFinite(Number(context?.score?.diff))) return Number(context.score.diff);
        const score = snapshot?.score;
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const myTeam = snapshot?.myTeam;
        if (!score || !myTeam || teams.length < 2) return 0;
        const home = this.num(score.home);
        const away = this.num(score.away);
        return Number(teams[0]) === Number(myTeam) ? home - away : away - home;
    },

    getTeamPack(snapshot, context = {}) {
        if (context?.myStats && context?.oppStats) {
            return { my: context.myStats, opp: context.oppStats };
        }

        const stats = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
        const myTeam = snapshot?.myTeam;
        if (!myTeam || stats.length < 2) return { my: {}, opp: {} };

        const my = stats.find(item => Number(item?.teamId) === Number(myTeam))?.stats || {};
        const opp = stats.find(item => Number(item?.teamId) !== Number(myTeam))?.stats || {};
        return { my, opp };
    },

    getXT(snapshot, context = {}) {
        if (Number.isFinite(Number(context?.myXT)) || Number.isFinite(Number(context?.oppXT))) {
            return { my: this.num(context.myXT), opp: this.num(context.oppXT) };
        }

        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const myTeam = snapshot?.myTeam;
        const xt = snapshot?.xT;
        if (!xt || !myTeam || teams.length < 2) return { my: 0, opp: 0 };
        const home = Number(teams[0]) === Number(myTeam);
        return { my: this.num(home ? xt.home : xt.away), opp: this.num(home ? xt.away : xt.home) };
    },

    });
}
