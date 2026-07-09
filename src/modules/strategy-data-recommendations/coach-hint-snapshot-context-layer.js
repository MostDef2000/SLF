// Coach Hint Snapshot Context Layer
// ============================================================
// Bridges raw SnapshotEngine output into CurrentActionHintEngine flat metrics.
//
// Contract:
// - no UI explanation layer;
// - no localStorage;
// - no preset selection on its own;
// - only enriches manual/current hint input with gameId, score state, xG/xT,
//   team stats and derived tactical signals.

(function coachHintSnapshotContextLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__coachHintSnapshotContextApplied) return;

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function hasValue(value) {
        return value !== undefined && value !== null && value !== '';
    }

    function findStat(snapshot, teamId) {
        const rows = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
        const id = Number(teamId);
        return rows.find(row => Number(row?.teamId) === id)?.stats || null;
    }

    function getTeamContext(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams.map(Number).filter(Boolean) : [];
        const myTeam = Number(snapshot?.myTeam || 0) || null;
        const myIndex = teams.findIndex(id => Number(id) === Number(myTeam));
        const safeMyIndex = myIndex >= 0 ? myIndex : 0;
        const oppIndex = safeMyIndex === 0 ? 1 : 0;
        const myId = teams[safeMyIndex] || myTeam || null;
        const oppId = teams[oppIndex] || null;

        return {
            teams,
            myTeam: myId,
            oppTeam: oppId,
            mySide: safeMyIndex === 0 ? 'home' : 'away',
            oppSide: safeMyIndex === 0 ? 'away' : 'home',
            myStats: findStat(snapshot, myId),
            oppStats: findStat(snapshot, oppId)
        };
    }

    function deriveMinute(snapshot, context) {
        const explicit = context?.minute ?? snapshot?.minute ?? snapshot?.baseMinute ?? snapshot?.effectiveMinute;
        if (hasValue(explicit)) return num(explicit, 0);
        if (snapshot?.status === 'finished') return 90;
        return 0;
    }

    function deriveScoreState(snapshot, teamCtx) {
        const score = snapshot?.score || {};
        if (hasValue(score.diff)) {
            const diff = num(score.diff, 0);
            return {
                diff,
                state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
            };
        }

        if (!hasValue(score.home) || !hasValue(score.away)) {
            return { diff: 0, state: 'unknown' };
        }

        const home = num(score.home, 0);
        const away = num(score.away, 0);
        const diff = teamCtx.mySide === 'away' ? away - home : home - away;

        return {
            diff,
            state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
        };
    }

    function readXT(snapshot, side) {
        const xT = snapshot?.xT || {};
        return num(xT?.[side], 0);
    }

    function addSignal(signals, signal) {
        if (signal && !signals.includes(signal)) signals.push(signal);
    }

    function hintTextList(snapshot) {
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        return hints
            .map(hint => String(hint?.text || hint || '').toLowerCase())
            .filter(Boolean);
    }

    function deriveHintSignals(snapshot, signals) {
        const texts = hintTextList(snapshot);
        const has = pattern => texts.some(text => pattern.test(text));

        if (has(/устал|требуются замены|замен/)) addSignal(signals, 'press_fatigue_risk');
        if (has(/повысить интенсивность прессинга|высокий прессинг|прессинг/)) addSignal(signals, 'own_high_press');
        if (has(/опустите прессинг|снизить прессинг/)) addSignal(signals, 'press_fatigue_risk');
        if (has(/фланг|lw|rw|lm|rm|край/)) addSignal(signals, 'wide_quality');
        if (has(/атака по центру|центр закрыт|отключите атаку по центру/)) addSignal(signals, 'center_closed');
        if (has(/контратак|обрез|быстр/)) addSignal(signals, 'transition_threat');
        if (has(/кросс|навес/)) addSignal(signals, 'wide_quality');
        if (has(/ж[её]лт|карточ/)) addSignal(signals, 'opponent_cards_available');
    }

    function deriveSignals(snapshot, context, metrics) {
        const signals = [];
        const rawSignals = [];

        if (Array.isArray(context?.signals)) rawSignals.push(...context.signals);
        if (Array.isArray(snapshot?.signals)) rawSignals.push(...snapshot.signals);
        rawSignals.forEach(signal => addSignal(signals, String(signal)));

        if (metrics.needGoal) addSignal(signals, 'need_goal');
        if (metrics.lateNeedGoal) addSignal(signals, 'late_need_goal');
        if (metrics.protectLead) addSignal(signals, 'protect_lead');
        if (metrics.underPressure) addSignal(signals, 'under_pressure');
        if (metrics.attackingMomentum) addSignal(signals, 'attacking_momentum');
        if (metrics.highBadActions) addSignal(signals, 'high_bad_actions');
        if (metrics.myPress > 18) addSignal(signals, 'own_high_press');
        if (metrics.oppPress > 18) addSignal(signals, 'opponent_high_press');
        if (metrics.oppPress > metrics.myPress + 14) addSignal(signals, 'opponent_high_press');
        if (metrics.oppXg > metrics.myXg + 0.65 && metrics.oppXT >= metrics.myXT) addSignal(signals, 'transition_threat');
        if (metrics.oppDef < -15) addSignal(signals, 'opponent_low_block');
        if (metrics.myXT > metrics.oppXT + 0.18) addSignal(signals, 'wide_quality');
        if (metrics.myXg < 0.35 && metrics.oppXg < 0.35 && metrics.minute >= 25) addSignal(signals, 'center_closed');

        deriveHintSignals(snapshot, signals);

        return signals;
    }

    function deriveContext(snapshot, context = {}) {
        const teamCtx = getTeamContext(snapshot || {});
        const score = deriveScoreState(snapshot || {}, teamCtx);
        const minute = deriveMinute(snapshot || {}, context || {});
        const myStats = teamCtx.myStats || {};
        const oppStats = teamCtx.oppStats || {};

        const myXg = hasValue(context.myXg) ? num(context.myXg) : num(myStats.xG, 0);
        const oppXg = hasValue(context.oppXg) ? num(context.oppXg) : num(oppStats.xG, 0);
        const myXT = hasValue(context.myXT) ? num(context.myXT) : readXT(snapshot, teamCtx.mySide);
        const oppXT = hasValue(context.oppXT) ? num(context.oppXT) : readXT(snapshot, teamCtx.oppSide);
        const myBad = hasValue(context.myBad) ? num(context.myBad) : num(myStats.badActionsPct, 0);
        const oppBad = num(oppStats.badActionsPct, 0);
        const myPress = hasValue(context.myPress) ? num(context.myPress) : num(myStats.pressVector, 0);
        const oppPress = hasValue(context.oppPress) ? num(context.oppPress) : num(oppStats.pressVector, 0);
        const myDef = num(myStats.defVector, 0);
        const oppDef = hasValue(context.oppDef) ? num(context.oppDef) : num(oppStats.defVector, 0);
        const myPossession = num(myStats.possession, 0);
        const oppPossession = num(oppStats.possession, 0);
        const myShots = num(myStats.shots, 0);
        const oppShots = num(oppStats.shots, 0);
        const myPower = num(myStats.power, 0);
        const oppPower = num(oppStats.power, 0);

        const needGoal = score.state === 'losing' && minute >= 55;
        const lateNeedGoal = score.state === 'losing' && minute >= 80;
        const protectLead = score.state === 'winning' && minute >= 70;
        const underPressure = oppXg > myXg + 0.4 || oppXT > myXT + 0.2 || oppShots > myShots + 4;
        const attackingMomentum = myXg > oppXg + 0.3 || myXT > oppXT + 0.2 || myShots > oppShots + 4;
        const highBadActions = myBad >= 20;

        const metrics = {
            minute,
            scoreState: score.state,
            myXg,
            oppXg,
            myXT,
            oppXT,
            myBad,
            oppBad,
            myPress,
            oppPress,
            myDef,
            oppDef,
            myPossession,
            oppPossession,
            myShots,
            oppShots,
            myPower,
            oppPower,
            needGoal,
            lateNeedGoal,
            protectLead,
            underPressure,
            attackingMomentum,
            highBadActions
        };

        const signals = deriveSignals(snapshot || {}, context || {}, metrics);
        const manualHintRequest = !!(
            snapshot?.manualRecommendationRefresh ||
            snapshot?.recommendationSource === 'manual' ||
            context?.manualHintRequest
        );

        return Object.assign({}, context || {}, metrics, {
            gameId: String(snapshot?.gameId || context?.gameId || 'unknown'),
            matchStatus: snapshot?.status || context?.matchStatus || 'unknown',
            scoreState: score.state,
            score: Object.assign({}, snapshot?.score || {}, { diff: score.diff }),
            teamSide: teamCtx.mySide,
            myTeam: teamCtx.myTeam,
            oppTeam: teamCtx.oppTeam,
            signals,
            manualHintRequest,
            coachHintSnapshotContext: {
                active: true,
                source: 'snapshot_stats_bridge',
                myTeam: teamCtx.myTeam,
                oppTeam: teamCtx.oppTeam,
                mySide: teamCtx.mySide,
                scoreState: score.state,
                signalCount: signals.length
            }
        });
    }

    function cloneSnapshot(snapshot, enrichedContext) {
        if (!snapshot || typeof snapshot !== 'object') return snapshot;
        const clone = Object.assign({}, snapshot);

        clone.gameId = enrichedContext.gameId;
        clone.minute = enrichedContext.minute;
        clone.score = Object.assign({}, snapshot.score || {}, { diff: enrichedContext.score.diff });
        clone.scoreState = enrichedContext.scoreState;
        clone.signals = enrichedContext.signals.slice();
        clone.myXg = enrichedContext.myXg;
        clone.oppXg = enrichedContext.oppXg;
        clone.myXT = enrichedContext.myXT;
        clone.oppXT = enrichedContext.oppXT;
        clone.myBad = enrichedContext.myBad;
        clone.myPress = enrichedContext.myPress;
        clone.oppPress = enrichedContext.oppPress;
        clone.oppDef = enrichedContext.oppDef;
        clone.manualHintRequest = enrichedContext.manualHintRequest;

        return clone;
    }

    CurrentActionHintEngine.run = function runWithCoachHintSnapshotContext(snapshot, context = {}) {
        const enrichedContext = deriveContext(snapshot, context || {});
        const enrichedSnapshot = cloneSnapshot(snapshot, enrichedContext);
        const result = originalRun(enrichedSnapshot, enrichedContext);

        if (result?.moment) {
            result.moment.gameId = enrichedContext.gameId;
            result.moment.score = enrichedContext.scoreState;
            result.moment.context = Object.assign({}, result.moment.context || {}, {
                gameId: enrichedContext.gameId,
                matchStatus: enrichedContext.matchStatus,
                manualHintRequest: enrichedContext.manualHintRequest,
                coachHintSnapshotContext: enrichedContext.coachHintSnapshotContext,
                myPower: enrichedContext.myPower,
                oppPower: enrichedContext.oppPower,
                myPossession: enrichedContext.myPossession,
                oppPossession: enrichedContext.oppPossession,
                myShots: enrichedContext.myShots,
                oppShots: enrichedContext.oppShots
            });
        }

        if (result?.action) {
            result.action.snapshotContextBridge = true;
        }

        if (typeof window !== 'undefined') {
            window.SLFLastCoachHintContext = {
                gameId: enrichedContext.gameId,
                minute: enrichedContext.minute,
                scoreState: enrichedContext.scoreState,
                signals: enrichedContext.signals.slice(),
                metrics: {
                    myXg: enrichedContext.myXg,
                    oppXg: enrichedContext.oppXg,
                    myXT: enrichedContext.myXT,
                    oppXT: enrichedContext.oppXT,
                    myBad: enrichedContext.myBad,
                    myPress: enrichedContext.myPress,
                    oppPress: enrichedContext.oppPress
                }
            };
        }

        return result;
    };

    CurrentActionHintEngine.__coachHintSnapshotContextApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFCoachHintSnapshotContextLayer = {
            deriveContext
        };
    }
})();
