// SLF Rule-Based Match Decision Engine
// ============================================================
// Button-only tactical recommendation policy.
//
// Contract:
// - runs only after the user requests a hint;
// - evaluates every active preset, not the first matching rule;
// - keeps emergency rules as hard overrides;
// - never applies a tactic automatically;
// - keeps short in-memory match history for power/vector deltas and hysteresis;
// - exposes candidate scores, vetoes, confidence and explanations for telemetry.

const CurrentActionHintEngine = {
    schema: 'slf_rule_decision_v3',
    mode: 'button_on_demand_scored_rules',

    ACTIVE_PRESETS: [
        'Arteta_Control433_bal3',
        'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2',
        'Compact_Counter_def3',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Conte_WingbackWidth_bal4',
        'Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5',
        'Bielsa_ChaosPress_att5'
    ],

    PRESET_AUDIT_TIER: {
        primary: [
            'Arteta_Control433_bal3',
            'Pep_BoxControl_bal2',
            'Pep_PressCooldown_bal2',
            'Compact_Counter_def3',
            'Pep_TwoThreeFive_att3'
        ],
        conditional: [
            'Pep_ControlledPush_att3',
            'Conte_WingbackWidth_bal4',
            'Simeone_Compact442_def4'
        ],
        restricted: ['Klopp_Gegenpress_att4'],
        emergency: ['Simeone_LowBlock_def5', 'Bielsa_ChaosPress_att5'],
        removed: [
            'Mourinho_WeakSide_def3',
            'Xabi_VerticalBox_att3',
            'Xabi_BoxMidfield_bal3',
            'DeZerbi_BaitPress_bal3',
            'DeZerbi_Release_att4',
            'Nagelsmann_WidePress_att4',
            'Henta_LeftTrap_att3'
        ],
        needsMoreData: [],
        experimental: [],
        blocked: []
    },

    HINT_RULES: [],
    runtimeByGame: new Map(),

    TACTIC_SIGNATURES: {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '4', pass_risk: '3', dribble: '2', cross: '2', shot: '2' },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' },
        Pep_PressCooldown_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' },
        Compact_Counter_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '4', style: '3', pass_risk: '2', dribble: '3', cross: '3', shot: '2' },
        Pep_ControlledPush_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '2', shot: '2' },
        Pep_TwoThreeFive_att3: { def_line: '2', press_line: '3', def_width: '3', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '5', pass_risk: '4', dribble: '3', cross: '2', shot: '3' },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '2', build_temp: '2', build_long: '2', build_fast: '2', style: '3', pass_risk: '3', dribble: '3', cross: '3', shot: '2' },
        Klopp_Gegenpress_att4: { def_line: '3', press_line: '4', def_width: '3', press_intense: '4', build_type: '3', build_temp: '3', build_long: '2', build_fast: '3', style: '5', pass_risk: '3', dribble: '3', cross: '3', shot: '3' },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '3', build_type: '2', build_temp: '1', build_long: '2', build_fast: '1', style: '2', pass_risk: '2', dribble: '1', cross: '2', shot: '1' },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '2', build_type: '1', build_temp: '1', build_long: '2', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', shot: '1' },
        Bielsa_ChaosPress_att5: { def_line: '4', press_line: '5', def_width: '4', press_intense: '5', build_type: '3', build_temp: '3', build_long: '3', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '4', shot: '4' }
    },

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

    getGameRuntime(gameId) {
        const key = String(gameId || 'unknown');
        if (!this.runtimeByGame.has(key)) {
            this.runtimeByGame.set(key, {
                gameId: key,
                baselinePower: null,
                previousObservation: null,
                lastDecision: null,
                detectedPreset: '',
                detectedPresetSinceWindow: null
            });
        }

        if (this.runtimeByGame.size > 8) {
            const keys = Array.from(this.runtimeByGame.keys());
            keys.slice(0, this.runtimeByGame.size - 8).forEach(oldKey => this.runtimeByGame.delete(oldKey));
        }

        return this.runtimeByGame.get(key);
    },

    tacticMatches(signature, tactic) {
        if (!signature || !tactic) return false;
        return Object.entries(signature).every(([key, value]) => String(tactic?.[key] ?? '') === String(value));
    },

    detectCurrentPreset(snapshot, runtime) {
        const tactic = snapshot?.currentTactic;
        if (tactic) {
            for (const name of this.ACTIVE_PRESETS) {
                if (this.tacticMatches(this.TACTIC_SIGNATURES[name], tactic)) return name;
            }
        }
        return runtime?.detectedPreset || runtime?.lastDecision?.action?.preset || '';
    },

    getPresetStatus(preset) {
        for (const [status, names] of Object.entries(this.PRESET_AUDIT_TIER)) {
            if (Array.isArray(names) && names.includes(preset)) return status;
        }
        return 'unknown';
    },

    isPresetAllowed(preset, context = {}) {
        const decision = this.PresetRuleScorer.hardVeto(preset, context);
        return !decision.vetoed;
    },

    MatchDecisionSignals: {
        build(engine, snapshot, context = {}, runtime = null) {
            const pack = engine.getTeamPack(snapshot, context);
            const my = pack.my || {};
            const opp = pack.opp || {};
            const xt = engine.getXT(snapshot, context);
            const signals = Array.isArray(context?.signals)
                ? context.signals.slice()
                : Array.isArray(snapshot?.signals)
                    ? snapshot.signals.slice()
                    : Array.isArray(context?.tags)
                        ? context.tags.slice()
                        : [];
            const minute = engine.num(engine.getMetric(snapshot, context, 'minute', ['effectiveMinute', 'baseMinute']), 0);
            const scoreState = engine.getScoreState(snapshot, context);
            const scoreDiff = engine.getScoreDiff(snapshot, context);
            const generationWindowIndex = engine.num(snapshot?.generationWindow?.index, Math.max(0, Math.floor(minute / 10)));

            const myXg = engine.num(context?.myXg ?? context?.myXG ?? my.xG);
            const oppXg = engine.num(context?.oppXg ?? context?.oppXG ?? opp.xG);
            const myXT = engine.num(context?.myXT ?? xt.my);
            const oppXT = engine.num(context?.oppXT ?? xt.opp);
            const myBad = engine.num(context?.myBad ?? context?.myBadActionsPct ?? my.badActionsPct);
            const oppBad = engine.num(context?.oppBad ?? opp.badActionsPct);
            const myShots = engine.num(context?.myShots ?? my.shots);
            const oppShots = engine.num(context?.oppShots ?? opp.shots);
            const myPossession = engine.num(context?.myPossession ?? my.possession);
            const oppPossession = engine.num(context?.oppPossession ?? opp.possession);
            const myPower = engine.num(context?.myPower ?? my.power);
            const oppPower = engine.num(context?.oppPower ?? opp.power);
            const myDefVector = engine.num(context?.myDefVector ?? my.defVector);
            const oppDefVector = engine.num(context?.oppDefVector ?? opp.defVector);
            const myPressVector = engine.num(context?.myPressVector ?? context?.myPress ?? my.pressVector);
            const oppPressVector = engine.num(context?.oppPressVector ?? context?.oppPress ?? opp.pressVector);
            const myFouls = engine.num(context?.myFouls ?? my.fouls);

            if (runtime && (!runtime.baselinePower || minute <= 5)) {
                runtime.baselinePower = { my: myPower || null, opp: oppPower || null, minute };
            }

            const previous = runtime?.previousObservation || null;
            const baseline = runtime?.baselinePower || null;
            const myPowerDelta = previous ? myPower - engine.num(previous.myPower) : 0;
            const oppPowerDelta = previous ? oppPower - engine.num(previous.oppPower) : 0;
            const myXgDelta = previous ? myXg - engine.num(previous.myXg) : 0;
            const oppXgDelta = previous ? oppXg - engine.num(previous.oppXg) : 0;
            const myShotsDelta = previous ? myShots - engine.num(previous.myShots) : 0;
            const oppShotsDelta = previous ? oppShots - engine.num(previous.oppShots) : 0;
            const myBadDelta = previous ? myBad - engine.num(previous.myBad) : 0;
            const oppBadDelta = previous ? oppBad - engine.num(previous.oppBad) : 0;
            const strengthGap = myPower - oppPower;
            const previousGap = previous ? engine.num(previous.strengthGap) : strengthGap;
            const strengthGapDelta = strengthGap - previousGap;
            const myPowerDropPct = baseline?.my > 0 ? Math.max(0, (baseline.my - myPower) / baseline.my * 100) : 0;
            const oppPowerDropPct = baseline?.opp > 0 ? Math.max(0, (baseline.opp - oppPower) / baseline.opp * 100) : 0;
            const myDefVectorDelta = previous ? myDefVector - engine.num(previous.myDefVector) : 0;
            const oppDefVectorDelta = previous ? oppDefVector - engine.num(previous.oppDefVector) : 0;
            const myPressVectorDelta = previous ? myPressVector - engine.num(previous.myPressVector) : 0;
            const oppPressVectorDelta = previous ? oppPressVector - engine.num(previous.oppPressVector) : 0;

            const underPressure =
                oppXg > myXg + 0.4 ||
                oppXT > myXT + 0.2 ||
                oppShots > myShots + 3 ||
                engine.hasSignal(signals, ['under_pressure', 'transition_threat', 'opponent_fast_counter_threat']);
            const attackingMomentum =
                myXg > oppXg + 0.3 ||
                myXT > oppXT + 0.2 ||
                myShots > oppShots + 3 ||
                engine.hasSignal(signals, ['attacking_momentum']);
            const transitionThreat = engine.bool(context?.transitionThreat) || engine.hasSignal(signals, ['transition_threat', 'opponent_fast_counter_threat']) || (oppXT > myXT + 0.35 && oppShots >= myShots);
            const centerClosed = engine.bool(context?.centerClosed) || engine.hasSignal(signals, ['center_closed', 'opponent_low_block']);
            const wideQuality = engine.bool(context?.wideQuality) || engine.hasSignal(signals, ['wide_quality', 'wide_advantage', 'attack_left', 'attack_right']);
            const weakSideAvailable = engine.bool(context?.weakSideAvailable) || engine.hasSignal(signals, ['weak_side_available', 'opponent_flank_weak']);
            const ownCrossesBad = engine.bool(context?.ownCrossesBad) || engine.hasSignal(signals, ['own_open_play_crosses_bad', 'own_crosses_bad_total']);
            const opponentCrossesDangerous = engine.bool(context?.opponentCrossesDangerous) || engine.hasSignal(signals, ['opponent_crosses_dangerous']);
            const ownRedCard = engine.bool(context?.ownRedCard) || engine.hasSignal(signals, ['own_red_card', 'playing_with_ten']);
            const opponentRedCard = engine.bool(context?.opponentRedCard) || engine.hasSignal(signals, ['opponent_red_card', 'opponent_with_ten']);
            const highBadActions = myBad >= 20 || engine.hasSignal(signals, ['high_bad_actions']);
            const lowBadActions = myBad > 0 && myBad <= 16 || engine.hasSignal(signals, ['low_bad_actions']);
            const pressFatigueRisk =
                engine.bool(context?.pressFatigueRisk) ||
                engine.bool(context?.pressFatigue?.active) ||
                engine.hasSignal(signals, ['press_fatigue_risk', 'own_press_fatigue', 'press_cost_high']) ||
                myPowerDropPct >= 3.5 ||
                (myPowerDelta < -25 && myPowerDelta < oppPowerDelta - 10);

            const strengthAdvantage = engine.clamp(50 + strengthGap / 8);
            const strengthDisadvantage = 100 - strengthAdvantage;
            const attackNeed = engine.clamp(
                (scoreState === 'losing' ? 38 : scoreState === 'draw' && minute >= 65 ? 12 : 0) +
                Math.max(0, -scoreDiff - 1) * 15 +
                Math.max(0, minute - 50) * (scoreState === 'losing' ? 0.9 : 0.15) +
                Math.max(0, oppXg - myXg) * 14
            );
            const controlNeed = engine.clamp(
                myBad * 2 +
                myPowerDropPct * 8 +
                (scoreState === 'winning' ? Math.max(0, minute - 55) * 0.8 : 0) +
                (transitionThreat ? 18 : 0) +
                (ownRedCard ? 25 : 0)
            );
            const pressureRisk = engine.clamp(
                Math.max(0, oppXg - myXg) * 28 +
                Math.max(0, oppXT - myXT) * 36 +
                Math.max(0, oppShots - myShots) * 3 +
                Math.max(0, oppPressVector - myPressVector) * 0.55 +
                Math.max(0, -strengthGap) / 5 +
                (transitionThreat ? 24 : 0)
            );
            const preservationNeed = engine.clamp(
                (scoreState === 'winning' ? 20 + Math.max(0, minute - 55) * 1.2 + Math.max(0, scoreDiff - 1) * 8 : 0) +
                pressureRisk * 0.35 +
                myPowerDropPct * 6 +
                (ownRedCard ? 30 : 0)
            );
            const widthOpportunity = engine.clamp(
                (centerClosed ? 32 : 0) +
                (wideQuality ? 34 : 0) +
                (weakSideAvailable ? 22 : 0) +
                (attackingMomentum ? 10 : 0) -
                (ownCrossesBad ? 45 : 0) -
                (opponentCrossesDangerous ? 20 : 0) -
                (underPressure ? 20 : 0)
            );

            // Vector signs are stored as raw game signals. Until post-5.61 evidence establishes
            // their direction semantics, effectiveness is inferred from coupled match outcomes;
            // vector movement only confirms that the tactical state actually changed.
            const vectorResponseMagnitude = Math.abs(myPressVectorDelta) + Math.abs(myDefVectorDelta) * 0.5;
            const pressingResponse = engine.clamp(
                50 +
                (myXgDelta - oppXgDelta) * 42 +
                (myShotsDelta - oppShotsDelta) * 3 +
                oppBadDelta * 0.8 -
                myBadDelta * 0.6 +
                Math.min(12, vectorResponseMagnitude * 0.45)
            );
            const defensiveStability = engine.clamp(
                55 -
                Math.max(0, oppXgDelta - myXgDelta) * 36 -
                Math.max(0, oppShotsDelta - myShotsDelta) * 3 -
                Math.max(0, oppXT - myXT) * 20 -
                (transitionThreat ? 18 : 0)
            );
            const pressingCost = engine.clamp(
                myPowerDropPct * 12 +
                Math.max(0, -myPowerDelta) * 0.45 +
                myBad * 1.35 +
                Math.max(0, -myDefVectorDelta) * 0.8 +
                myFouls * 1.2
            );
            const pressingOpportunity = engine.clamp(
                strengthAdvantage * 0.35 +
                (100 - pressureRisk) * 0.2 +
                (100 - pressingCost) * 0.25 +
                (opponentRedCard ? 18 : 0) +
                (minute <= 65 ? 12 : 0) +
                (lowBadActions ? 10 : 0) +
                (attackingMomentum ? 12 : 0) +
                (previous ? (pressingResponse - 50) * 0.2 : 0)
            );

            let gameMode = 'active_control';
            if (scoreState === 'winning' && minute >= 82 && (pressureRisk >= 60 || ownRedCard || myPowerDropPct >= 4.5)) gameMode = 'emergency_lock';
            else if ((strengthGap < -40 || underPressure) && scoreState !== 'losing') gameMode = 'compact_counter_control';
            else if (strengthGap >= 35 && minute <= 65 && pressingOpportunity >= 62 && scoreState !== 'winning') gameMode = 'front_foot_squeeze';
            else if (scoreState === 'losing' && attackNeed >= 65) gameMode = 'controlled_chase';

            return {
                schema: 'slf_match_decision_signals_v1',
                gameId: snapshot?.gameId || context?.gameId || 'unknown',
                minute,
                generationWindowIndex,
                scoreState,
                scoreDiff,
                signals,
                myXg,
                oppXg,
                myXT,
                oppXT,
                myShots,
                oppShots,
                myPossession,
                oppPossession,
                myBad,
                oppBad,
                myPower,
                oppPower,
                strengthGap,
                strengthGapDelta,
                myPowerDelta,
                oppPowerDelta,
                myXgDelta: engine.round(myXgDelta, 3),
                oppXgDelta: engine.round(oppXgDelta, 3),
                myShotsDelta,
                oppShotsDelta,
                myBadDelta: engine.round(myBadDelta),
                oppBadDelta: engine.round(oppBadDelta),
                myPowerDropPct: engine.round(myPowerDropPct),
                oppPowerDropPct: engine.round(oppPowerDropPct),
                myDefVector,
                oppDefVector,
                myPressVector,
                oppPressVector,
                myDefVectorDelta,
                oppDefVectorDelta,
                myPressVectorDelta,
                oppPressVectorDelta,
                underPressure,
                attackingMomentum,
                transitionThreat,
                centerClosed,
                wideQuality,
                weakSideAvailable,
                ownCrossesBad,
                opponentCrossesDangerous,
                ownRedCard,
                opponentRedCard,
                highBadActions,
                lowBadActions,
                pressFatigueRisk,
                attackNeed: engine.round(attackNeed),
                controlNeed: engine.round(controlNeed),
                pressureRisk: engine.round(pressureRisk),
                preservationNeed: engine.round(preservationNeed),
                widthOpportunity: engine.round(widthOpportunity),
                vectorResponseMagnitude: engine.round(vectorResponseMagnitude),
                pressingResponse: engine.round(pressingResponse),
                defensiveStability: engine.round(defensiveStability),
                pressingCost: engine.round(pressingCost),
                pressingOpportunity: engine.round(pressingOpportunity),
                strengthAdvantage: engine.round(strengthAdvantage),
                strengthDisadvantage: engine.round(strengthDisadvantage),
                gameMode,
                completeness: engine.round([
                    myPower > 0, oppPower > 0, minute > 0, scoreState !== 'unknown',
                    Number.isFinite(myXg), Number.isFinite(oppXg),
                    Number.isFinite(myDefVector), Number.isFinite(myPressVector)
                ].filter(Boolean).length / 8, 3)
            };
        }
    },

    PresetRuleScorer: {
        PROFILES: {
            Arteta_Control433_bal3: { base: 18, attack: 0.10, control: 0.35, pressureRisk: -0.08, preservation: 0.10, pressOpportunity: 0.10, pressCost: -0.08, strengthAdvantage: 0.08 },
            Pep_BoxControl_bal2: { base: 15, attack: -0.05, control: 0.52, pressureRisk: 0.13, preservation: 0.22, pressOpportunity: -0.08, pressCost: 0.22, strengthAdvantage: 0.02 },
            Pep_PressCooldown_bal2: { base: 8, attack: -0.12, control: 0.45, pressureRisk: 0.08, preservation: 0.15, pressOpportunity: -0.22, pressCost: 0.55, strengthAdvantage: 0.00 },
            Compact_Counter_def3: { base: 7, attack: 0.04, control: 0.12, pressureRisk: 0.46, preservation: 0.22, pressOpportunity: -0.08, pressCost: 0.14, strengthAdvantage: -0.08 },
            Pep_ControlledPush_att3: { base: 5, attack: 0.48, control: -0.08, pressureRisk: -0.18, preservation: -0.16, pressOpportunity: 0.18, pressCost: -0.12, strengthAdvantage: 0.12 },
            Pep_TwoThreeFive_att3: { base: 6, attack: 0.56, control: -0.04, pressureRisk: -0.28, preservation: -0.20, pressOpportunity: 0.26, pressCost: -0.18, strengthAdvantage: 0.18 },
            Conte_WingbackWidth_bal4: { base: 2, attack: 0.22, control: 0.02, pressureRisk: -0.18, preservation: -0.08, pressOpportunity: 0.08, pressCost: -0.10, strengthAdvantage: 0.08, width: 0.55 },
            Klopp_Gegenpress_att4: { base: -8, attack: 0.66, control: -0.25, pressureRisk: -0.42, preservation: -0.35, pressOpportunity: 0.55, pressCost: -0.48, strengthAdvantage: 0.16 },
            Simeone_Compact442_def4: { base: 2, attack: -0.20, control: 0.18, pressureRisk: 0.45, preservation: 0.58, pressOpportunity: -0.18, pressCost: 0.15, strengthAdvantage: -0.08 },
            Simeone_LowBlock_def5: { base: -20, attack: -0.48, control: 0.08, pressureRisk: 0.42, preservation: 0.78, pressOpportunity: -0.35, pressCost: 0.16, strengthAdvantage: -0.16 },
            Bielsa_ChaosPress_att5: { base: -30, attack: 0.90, control: -0.55, pressureRisk: -0.70, preservation: -0.70, pressOpportunity: 0.70, pressCost: -0.75, strengthAdvantage: 0.12 }
        },

        hardVeto(name, s = {}) {
            const reasons = [];
            const add = reason => { if (reason && !reasons.includes(reason)) reasons.push(reason); };
            const losing = s.scoreState === 'losing';
            const winning = s.scoreState === 'winning';
            const pressPreset = ['Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5'].includes(name);

            if (s.ownRedCard && pressPreset) add('удаление у нашей команды запрещает all-in прессинг');
            if (pressPreset && s.myPowerDropPct >= 5) add('падение силы состава 5%+ запрещает дорогой прессинг');
            if (pressPreset && s.highBadActions) add('высокий брак запрещает высокий прессинг');
            if (pressPreset && s.transitionThreat && s.minute < 86) add('угроза переходов запрещает высокий прессинг до emergency-окна');

            if (name === 'Bielsa_ChaosPress_att5' && !(losing && s.minute >= 86 && s.lowBadActions && !s.pressFatigueRisk)) {
                add('Bielsa разрешён только после 86-й при проигрыше, низком браке и приемлемой цене прессинга');
            }
            if (name === 'Klopp_Gegenpress_att4' && !(losing && s.minute >= 78 && s.lowBadActions && !s.pressFatigueRisk)) {
                add('Klopp разрешён только в поздней погоне после 78-й при низком браке');
            }
            if (name === 'Simeone_LowBlock_def5' && !(winning && s.minute >= 82 && (s.pressureRisk >= 55 || s.ownRedCard || s.myPowerDropPct >= 4))) {
                add('низкий блок разрешён только для позднего удержания под реальной угрозой');
            }
            if (name === 'Simeone_Compact442_def4' && !(winning && s.minute >= 65 || s.strengthGap < -35 && s.underPressure)) {
                add('компактный 4-4-2 нужен для удержания или явного силового/игрового давления');
            }
            if (name === 'Conte_WingbackWidth_bal4' && (s.widthOpportunity < 55 || s.ownCrossesBad || s.opponentCrossesDangerous || s.underPressure)) {
                add('нет подтверждённого безопасного преимущества ширины');
            }
            if (name === 'Pep_TwoThreeFive_att3' && (s.myBad >= 22 || s.pressureRisk >= 72 || s.myPowerDropPct >= 4.5)) {
                add('позиционная атака слишком рискованна при браке, давлении или падении силы');
            }
            if (name === 'Pep_ControlledPush_att3' && (s.myBad >= 26 || s.myPowerDropPct >= 6)) {
                add('даже controlled push запрещён при критическом браке/падении силы');
            }
            if (name === 'Pep_PressCooldown_bal2' && losing && s.minute >= 78 && s.attackNeed >= 70) {
                add('cooldown не должен заменять атаку в финальной погоне');
            }
            if (name === 'Compact_Counter_def3' && winning && s.minute >= 82 && s.pressureRisk < 35 && s.strengthGap > 30) {
                add('при спокойном преимуществе сильной команды контратака слишком пассивна');
            }

            return { vetoed: reasons.length > 0, reasons };
        },

        scoreOne(engine, name, s) {
            const profile = this.PROFILES[name];
            const veto = this.hardVeto(name, s);
            const reasons = [];
            const parts = {};
            const add = (key, value, reason) => {
                const delta = engine.round(value);
                if (!delta) return;
                parts[key] = engine.round((parts[key] || 0) + delta);
                reasons.push({ key, delta, reason });
            };

            if (!profile) return { preset: name, score: -999, vetoed: true, vetoReasons: ['нет экспертного профиля'], reasons, parts };

            let score = profile.base;
            const apply = (key, signal, weight, reason) => {
                const delta = engine.num(signal) * engine.num(weight);
                score += delta;
                add(key, delta, reason);
            };

            apply('attackNeed', s.attackNeed, profile.attack, 'соответствие необходимости гола/давления');
            apply('controlNeed', s.controlNeed, profile.control, 'соответствие потребности в контроле');
            apply('pressureRisk', s.pressureRisk, profile.pressureRisk, 'реакция на давление и переходный риск');
            apply('preservationNeed', s.preservationNeed, profile.preservation, 'соответствие удержанию результата');
            apply('pressingOpportunity', s.pressingOpportunity, profile.pressOpportunity, 'выгода активного прессинга');
            apply('pressingCost', s.pressingCost, profile.pressCost, 'стоимость прессинга по силе/браку/структуре');
            apply('strengthAdvantage', s.strengthAdvantage, profile.strengthAdvantage, 'соответствие текущему преимуществу силы');
            if (profile.width) apply('widthOpportunity', s.widthOpportunity, profile.width, 'подтверждённая возможность игры через ширину');

            if (name === 'Arteta_Control433_bal3' && s.gameMode === 'active_control') add('mode', 12, 'нейтральный structural baseline');
            if (name === 'Pep_BoxControl_bal2' && s.highBadActions) add('mode', 18, 'высокий брак требует reset');
            if (name === 'Pep_PressCooldown_bal2' && s.pressFatigueRisk) add('mode', 24, 'падение силы/эффективности прессинга требует cooldown');
            if (name === 'Compact_Counter_def3' && s.gameMode === 'compact_counter_control') add('mode', 18, 'слабее или под давлением — компактность и выход');
            if (name === 'Pep_ControlledPush_att3' && s.gameMode === 'controlled_chase') add('mode', 14, 'контролируемое усиление атаки');
            if (name === 'Pep_TwoThreeFive_att3' && (s.gameMode === 'front_foot_squeeze' || s.attackingMomentum)) add('mode', 18, 'позиционное зажатие слабого/отступающего соперника');
            if (name === 'Simeone_Compact442_def4' && s.gameMode === 'emergency_lock') add('mode', 16, 'позднее компактное удержание');
            if (name === 'Simeone_LowBlock_def5' && s.gameMode === 'emergency_lock') add('mode', 25, 'аварийно закрыть штрафную');

            score += Object.values(parts).reduce((sum, value) => sum + value, 0) - reasons
                .filter(item => ['attackNeed', 'controlNeed', 'pressureRisk', 'preservationNeed', 'pressingOpportunity', 'pressingCost', 'strengthAdvantage', 'widthOpportunity'].includes(item.key))
                .reduce((sum, item) => sum + item.delta, 0);

            const finalScore = veto.vetoed ? -999 : engine.round(score);
            return {
                preset: name,
                score: finalScore,
                rawScore: engine.round(score),
                vetoed: veto.vetoed,
                vetoReasons: veto.reasons,
                reasons: reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8),
                parts
            };
        },

        emergencyOverride(s, candidates) {
            const available = name => candidates.find(item => item.preset === name && !item.vetoed);
            if (s.ownRedCard && s.scoreState === 'winning') {
                return available(s.minute >= 82 ? 'Simeone_LowBlock_def5' : 'Simeone_Compact442_def4') || available('Pep_BoxControl_bal2');
            }
            if (s.scoreState === 'winning' && s.minute >= 85 && (s.pressureRisk >= 65 || s.myPowerDropPct >= 5)) {
                return available('Simeone_LowBlock_def5') || available('Simeone_Compact442_def4');
            }
            if (s.scoreState === 'losing' && s.minute >= 86) {
                return available('Bielsa_ChaosPress_att5') || available('Klopp_Gegenpress_att4') || available('Pep_TwoThreeFive_att3') || available('Pep_ControlledPush_att3');
            }
            return null;
        },

        confidence(engine, top, second, s) {
            const gap = top && second ? top.score - second.score : 0;
            const completeness = engine.num(s.completeness);
            const conflict = s.attackNeed >= 55 && s.preservationNeed >= 55 || s.pressingOpportunity >= 60 && s.pressingCost >= 60;
            let level = 'low';
            if (gap >= 18 && completeness >= 0.75 && !conflict) level = 'high';
            else if (gap >= 8 && completeness >= 0.55) level = 'medium';
            return { level, gap: engine.round(gap), completeness, conflict };
        },

        applyHysteresis(engine, ranked, signals, runtime, detectedPreset, emergency) {
            const top = ranked[0] || null;
            if (!top || emergency) return { selected: emergency || top, guardType: emergency ? 'emergency_override' : 'top_score', guardReason: emergency ? 'жёсткий emergency override' : 'лучший итоговый балл' };

            const currentName = detectedPreset || runtime?.lastDecision?.action?.preset || '';
            const current = ranked.find(item => item.preset === currentName && !item.vetoed) || null;
            if (!current || current.preset === top.preset) return { selected: top, guardType: 'top_score', guardReason: 'лучший итоговый балл' };

            const currentWindow = signals.generationWindowIndex;
            const since = runtime?.detectedPresetSinceWindow;
            const heldWindows = Number.isFinite(Number(since)) ? Math.max(0, currentWindow - Number(since)) : 99;
            const recentRecommendationWindow = runtime?.lastDecision?.telemetry?.observation?.generationWindowIndex;
            const recommendationCooldown = Number.isFinite(Number(recentRecommendationWindow)) && currentWindow - Number(recentRecommendationWindow) < 1;
            const requiredMargin = heldWindows < 2 ? 15 : recommendationCooldown ? 14 : 12;
            const margin = top.score - current.score;

            if (margin < requiredMargin) {
                return {
                    selected: current,
                    guardType: heldWindows < 2 ? 'minimum_hold' : recommendationCooldown ? 'cooldown' : 'hysteresis',
                    guardReason: `оставляем текущий пресет: преимущество кандидата ${engine.round(margin)} ниже порога ${requiredMargin}`,
                    requiredMargin,
                    actualMargin: engine.round(margin),
                    heldWindows
                };
            }

            return {
                selected: top,
                guardType: 'margin_passed',
                guardReason: `смена оправдана: преимущество ${engine.round(margin)} превышает порог ${requiredMargin}`,
                requiredMargin,
                actualMargin: engine.round(margin),
                heldWindows
            };
        },

        run(engine, signals, runtime, detectedPreset) {
            const candidates = engine.ACTIVE_PRESETS.map(name => this.scoreOne(engine, name, signals));
            const ranked = candidates
                .filter(item => !item.vetoed)
                .sort((a, b) => b.score - a.score || a.preset.localeCompare(b.preset));
            const emergency = this.emergencyOverride(signals, candidates);
            const guard = this.applyHysteresis(engine, ranked, signals, runtime, detectedPreset, emergency);
            const selected = guard.selected || ranked[0] || candidates.find(item => item.preset === 'Arteta_Control433_bal3');
            const second = ranked.find(item => item.preset !== selected?.preset) || null;
            const confidence = this.confidence(engine, selected, second, signals);
            const positiveReasons = (selected?.reasons || []).filter(item => item.delta > 0).slice(0, 3);
            const negativeReasons = (selected?.reasons || []).filter(item => item.delta < 0).slice(0, 2);
            const reasonParts = positiveReasons.map(item => item.reason);
            if (guard.guardType !== 'top_score') reasonParts.push(guard.guardReason);

            return {
                schema: 'slf_preset_rule_score_v1',
                action: {
                    preset: selected?.preset || 'Arteta_Control433_bal3',
                    presetStatus: engine.getPresetStatus(selected?.preset),
                    decision: signals.gameMode,
                    risk: ['Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'].includes(selected?.preset) ? 'high' : 'medium',
                    score: selected?.score ?? 0,
                    reason: reasonParts.join('; ') || 'наиболее устойчивый экспертный балл по текущему состоянию',
                    reasons: positiveReasons,
                    cautions: negativeReasons,
                    guardType: guard.guardType,
                    guardReason: guard.guardReason,
                    emergency: !!emergency
                },
                confidence,
                margin: confidence.gap,
                candidates: candidates
                    .slice()
                    .sort((a, b) => {
                        if (a.vetoed !== b.vetoed) return a.vetoed ? 1 : -1;
                        return b.score - a.score;
                    })
                    .map(item => ({
                        preset: item.preset,
                        score: item.score,
                        rawScore: item.rawScore,
                        vetoed: item.vetoed,
                        vetoReasons: item.vetoReasons,
                        reasons: item.reasons.slice(0, 4),
                        parts: item.parts
                    })),
                vetoedPresets: Object.fromEntries(candidates.filter(item => item.vetoed).map(item => [item.preset, item.vetoReasons])),
                guard
            };
        }
    },

    classify(snapshot, context = {}) {
        const gameId = snapshot?.gameId || context?.gameId || 'unknown';
        const runtime = this.getGameRuntime(gameId);
        const decisionSignals = this.MatchDecisionSignals.build(this, snapshot, context, runtime);
        const reasons = [];
        const signalNames = [];
        const add = (name, reason) => {
            if (name && !signalNames.includes(name)) signalNames.push(name);
            if (reason && !reasons.includes(reason)) reasons.push(reason);
        };

        if (decisionSignals.attackNeed >= 55) add('need_goal', 'высокая потребность в голе');
        if (decisionSignals.preservationNeed >= 55) add('protect_lead', 'нужно снижать риск и удерживать результат');
        if (decisionSignals.pressureRisk >= 55) add('under_pressure', 'давление/переходная угроза соперника высоки');
        if (decisionSignals.pressingOpportunity >= 60) add('pressing_opportunity', 'есть условия для активного давления');
        if (decisionSignals.pressingCost >= 55) add('press_cost_high', 'прессинг дорого обходится по силе/браку/структуре');
        if (decisionSignals.widthOpportunity >= 55) add('wide_opportunity', 'фланговое преимущество подтверждено');
        if (decisionSignals.highBadActions) add('high_bad_actions', 'высокий процент брака');
        if (!signalNames.length) add('balanced_control', 'нет сильного аварийного сигнала');

        return {
            gameId: String(gameId),
            minute: decisionSignals.minute,
            score: decisionSignals.scoreState,
            signals: signalNames,
            reasons,
            context: decisionSignals,
            runtime
        };
    },

    decide(classification) {
        const runtime = classification?.runtime || this.getGameRuntime(classification?.gameId || 'unknown');
        const signals = classification?.context || {};
        const detectedPreset = runtime?.detectedPreset || runtime?.lastDecision?.action?.preset || '';
        return this.PresetRuleScorer.run(this, signals, runtime, detectedPreset);
    },

    evaluate(snapshot, context = {}) {
        if (!snapshot && !context) return null;

        const classification = this.classify(snapshot || {}, context || {});
        const runtime = classification.runtime;
        const detectedPreset = this.detectCurrentPreset(snapshot || {}, runtime);
        if (detectedPreset !== runtime.detectedPreset) {
            runtime.detectedPreset = detectedPreset;
            runtime.detectedPresetSinceWindow = classification.context.generationWindowIndex;
        }

        const scored = this.PresetRuleScorer.run(this, classification.context, runtime, detectedPreset);
        const result = {
            schema: this.schema,
            mode: this.mode,
            moment: {
                gameId: classification.gameId,
                minute: classification.minute,
                score: classification.score,
                signals: classification.signals,
                reasons: classification.reasons,
                context: classification.context
            },
            action: scored.action,
            confidence: scored.confidence,
            margin: scored.margin,
            candidates: scored.candidates,
            vetoedPresets: scored.vetoedPresets,
            guard: scored.guard,
            telemetry: {
                schema: 'slf_rule_decision_telemetry_v1',
                observation: classification.context,
                currentPreset: detectedPreset || null,
                recommendedPreset: scored.action.preset,
                recommendedScore: scored.action.score,
                confidence: scored.confidence,
                margin: scored.margin,
                candidateScores: Object.fromEntries(scored.candidates.map(item => [item.preset, item.score])),
                vetoedPresets: scored.vetoedPresets,
                generatedAt: Date.now()
            },
            generatedAt: Date.now()
        };

        runtime.previousObservation = Object.assign({}, classification.context);
        runtime.lastDecision = result;
        return result;
    },

    run(snapshot, context = {}) {
        return this.evaluate(snapshot, context);
    },

    getLastDecision(gameId) {
        return this.getGameRuntime(gameId).lastDecision || null;
    },

    toPlanRows(result) {
        if (!result) return [];
        const topCandidates = (result.candidates || []).filter(item => !item.vetoed).slice(0, 3);
        const candidateText = topCandidates.map(item => `${item.preset} ${item.score >= 0 ? '+' : ''}${item.score}`).join(' · ');
        const confidence = result.confidence?.level || 'low';
        return [
            `Режим: ${result.action?.decision || result.moment?.context?.gameMode || 'active_control'}`,
            `Рекомендация: ${result.action?.preset || 'Arteta_Control433_bal3'} (${result.action?.score ?? 0})`,
            `Уверенность: ${confidence}; разрыв ${result.margin ?? 0}`,
            `Причина: ${result.action?.reason || 'экспертный score'}`,
            candidateText ? `Кандидаты: ${candidateText}` : ''
        ].filter(Boolean);
    }
};

if (typeof window !== 'undefined') {
    window.SLFCurrentActionHintEngine = CurrentActionHintEngine;
    window.SLFMatchDecisionSignals = CurrentActionHintEngine.MatchDecisionSignals;
    window.SLFPresetRuleScorer = CurrentActionHintEngine.PresetRuleScorer;
}
