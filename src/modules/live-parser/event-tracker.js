    // 9. Event / Effect Tracking
    // ============================================================

    const EventTracker = {
        findTeamStats(snapshot, teamId) {
            return snapshot?.stats?.find(x => Number(x.teamId) === Number(teamId))?.stats || null;
        },

        compactRuleDecision(decision) {
            if (!decision?.action) return null;
            return {
                schema: decision.schema || 'slf_rule_decision_v3',
                generatedAt: decision.generatedAt || Date.now(),
                mode: decision.mode || null,
                action: {
                    preset: decision.action.preset || null,
                    decision: decision.action.decision || null,
                    score: Number(decision.action.score || 0),
                    reason: decision.action.reason || '',
                    guardType: decision.action.guardType || null,
                    guardReason: decision.action.guardReason || '',
                    emergency: !!decision.action.emergency
                },
                confidence: decision.confidence || null,
                margin: Number(decision.margin || 0),
                signals: decision.moment?.context || null,
                candidateScores: Object.fromEntries((decision.candidates || []).map(item => [item.preset, item.score])),
                vetoedPresets: decision.vetoedPresets || {}
            };
        },

        savePresetEvent(name, preset, beforeSnapshot) {
            const ts = Date.now();
            const generationWindow = beforeSnapshot?.generationWindow || MatchStateParser.getGenerationWindow(beforeSnapshot?.minute);
            const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(beforeSnapshot?.minute);
            const ruleDecision = this.compactRuleDecision(beforeSnapshot?.ruleDecision || STATE.lastRuleDecision || null);
            const event = {
                ts,
                recordType: 'preset_event',
                schemaVersion: 2,
                parserVersion: 'preset_event_generation_v3_rule_decision',
                eventKey: ['preset_event', MatchStateParser.getGameId(), beforeSnapshot.minute ?? '', beforeSnapshot.bucket || '', name || '', ts].join('|'),
                type: 'preset',
                gameId: MatchStateParser.getGameId(),
                minute: beforeSnapshot.minute,
                bucket: beforeSnapshot.bucket,
                generationWindow,
                targetGenerationWindow,
                targetBucket: targetGenerationWindow?.label || beforeSnapshot.bucket,
                timingModel: 'generation_windows_v1_last_change_before_next_window',
                presetName: name,
                tactic: preset,
                ruleDecision,
                beforeSnapshot
            };

            STATE.pendingPresetEvent = event;
            PresetUsageTracker.record(name, {
                gameId: event.gameId,
                minute: event.minute,
                bucket: event.bucket,
                source: 'preset_apply'
            });

            SnapshotEngine.freezeRecommendationsAfterTacticChange(name, beforeSnapshot);
            void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'preset event history').catch(() => {});
            UI.addParserLog(`Пресет применён: ${PresetStorage.getAllLabels()[name] || TacticPresetLibrary?.meta?.[name]?.title || name}`);
        },

        buildPresetEffect(afterSnapshot) {
            const pending = STATE.pendingPresetEvent;

            if (!pending || !afterSnapshot) return null;
            if (String(pending.gameId || '') !== String(afterSnapshot.gameId || '')) return null;
            if (!afterSnapshot.myTeam) return null;

            const before = pending.beforeSnapshot;
            const pendingWindow = pending.generationWindow || before?.generationWindow || MatchTimingModel.getWindow(before?.minute);
            const targetWindow = pending.targetGenerationWindow || MatchTimingModel.getTargetWindowAfterChange(before?.minute);
            const afterWindow = afterSnapshot.generationWindow || MatchTimingModel.getWindow(afterSnapshot.minute);

            if (!afterWindow || !targetWindow) return null;
            if ((afterWindow.index || 0) < (targetWindow.index || 0)) return null;
            if ((afterWindow.index || 0) === (pendingWindow.index || 0)) return null;

            const myTeam = afterSnapshot.myTeam;
            const beforeMy = this.findTeamStats(before, myTeam);
            const beforeOpp = before?.stats?.find(x => Number(x.teamId) !== Number(myTeam))?.stats;
            const afterMy = this.findTeamStats(afterSnapshot, myTeam);
            const afterOpp = afterSnapshot?.stats?.find(x => Number(x.teamId) !== Number(myTeam))?.stats;

            if (!beforeMy || !beforeOpp || !afterMy || !afterOpp) return null;

            const beforeQualitySignal = before.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(before.developerHints || []);
            const afterQualitySignal = afterSnapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(afterSnapshot.developerHints || []);
            const beforeExpectedPerformance = before.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(before.developerHints || []) : null);
            const afterExpectedPerformance = afterSnapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(afterSnapshot.developerHints || []) : null);
            const beforeXT = RecommendationEngine.getXTForMyTeam(before);
            const afterXT = RecommendationEngine.getXTForMyTeam(afterSnapshot);
            const beforePower = num(beforeMy.power);
            const afterPower = num(afterMy.power);
            const beforeOppPower = num(beforeOpp.power);
            const afterOppPower = num(afterOpp.power);
            const myPowerDropPct = beforePower > 0 ? ((beforePower - afterPower) / beforePower) * 100 : 0;
            const oppPowerDropPct = beforeOppPower > 0 ? ((beforeOppPower - afterOppPower) / beforeOppPower) * 100 : 0;
            const ts = Date.now();
            const ruleDecision = pending.ruleDecision || this.compactRuleDecision(before.ruleDecision || STATE.lastRuleDecision || null);
            const effect = {
                ts,
                recordType: 'preset_effect',
                schemaVersion: 2,
                parserVersion: 'preset_effect_generation_v3_rule_decision',
                effectKey: ['preset_effect', afterSnapshot.gameId || '', pending.presetName || pending.type || 'manual_change', before.bucket || '', afterSnapshot.bucket || '', ts].join('|'),
                gameId: afterSnapshot.gameId,
                presetName: pending.presetName || pending.type || 'manual_change',
                eventType: pending.type || 'preset',
                fromMinute: before.minute,
                toMinute: afterSnapshot.minute,
                fromBucket: before.bucket,
                toBucket: afterSnapshot.bucket,
                fromGenerationWindow: pendingWindow,
                targetGenerationWindow: targetWindow,
                toGenerationWindow: afterWindow,
                timingModel: 'generation_windows_v1_last_change_before_next_window',
                before,
                after: afterSnapshot,
                tacticContext: {
                    appliedPreset: pending.presetName || pending.type || 'manual_change',
                    appliedTactic: pending.tactic || before.currentTactic || null,
                    currentTacticAfter: afterSnapshot.currentTactic || null
                },
                decisionContext: ruleDecision,
                delta: {
                    myXG: num(afterMy.xG) - num(beforeMy.xG),
                    oppXG: num(afterOpp.xG) - num(beforeOpp.xG),
                    myShots: num(afterMy.shots) - num(beforeMy.shots),
                    oppShots: num(afterOpp.shots) - num(beforeOpp.shots),
                    myBadActionsPct: num(afterMy.badActionsPct) - num(beforeMy.badActionsPct),
                    oppBadActionsPct: num(afterOpp.badActionsPct) - num(beforeOpp.badActionsPct),
                    myPower: afterPower - beforePower,
                    oppPower: afterOppPower - beforeOppPower,
                    myPowerDropPct: Number(myPowerDropPct.toFixed(2)),
                    oppPowerDropPct: Number(oppPowerDropPct.toFixed(2)),
                    strengthGap: (afterPower - afterOppPower) - (beforePower - beforeOppPower),
                    myDefVector: num(afterMy.defVector) - num(beforeMy.defVector),
                    oppDefVector: num(afterOpp.defVector) - num(beforeOpp.defVector),
                    myPressVector: num(afterMy.pressVector) - num(beforeMy.pressVector),
                    oppPressVector: num(afterOpp.pressVector) - num(beforeOpp.pressVector),
                    myXT: afterXT.myXT - beforeXT.myXT,
                    oppXT: afterXT.oppXT - beforeXT.oppXT
                },
                vectorContext: {
                    before: {
                        myDefense: num(beforeMy.defVector),
                        myPressing: num(beforeMy.pressVector),
                        oppDefense: num(beforeOpp.defVector),
                        oppPressing: num(beforeOpp.pressVector)
                    },
                    after: {
                        myDefense: num(afterMy.defVector),
                        myPressing: num(afterMy.pressVector),
                        oppDefense: num(afterOpp.defVector),
                        oppPressing: num(afterOpp.pressVector)
                    }
                },
                varianceContext: {
                    model: 'variance_tracking_v2_rule_decision',
                    scoreBefore: before.score || null,
                    scoreAfter: afterSnapshot.score || null,
                    strengthGap: beforePower - beforeOppPower,
                    homeAway: Array.isArray(before.teams) && Number(before.teams[0]) === Number(myTeam) ? 'home' : 'away',
                    beforeDeveloperHints: Array.isArray(before.developerHints) ? before.developerHints.slice(0, 8) : [],
                    afterDeveloperHints: Array.isArray(afterSnapshot.developerHints) ? afterSnapshot.developerHints.slice(0, 8) : [],
                    beforeGeneratorQualitySignal: beforeQualitySignal,
                    afterGeneratorQualitySignal: afterQualitySignal,
                    beforeExpectedPerformance,
                    afterExpectedPerformance,
                    beforeGeneratorDetailMetrics: before.generatorDetailMetrics || null,
                    afterGeneratorDetailMetrics: afterSnapshot.generatorDetailMetrics || null,
                    strengthContext: {
                        myPowerBefore: beforePower,
                        myPowerAfter: afterPower,
                        oppPowerBefore: beforeOppPower,
                        oppPowerAfter: afterOppPower,
                        strengthGapBefore: beforePower - beforeOppPower,
                        strengthGapAfter: afterPower - afterOppPower,
                        myPowerDropPct: Number(myPowerDropPct.toFixed(2)),
                        oppPowerDropPct: Number(oppPowerDropPct.toFixed(2))
                    }
                },
                generatorQualitySignal: afterQualitySignal,
                generatorExpectedPerformance: afterExpectedPerformance,
                generatorDetailMetrics: afterSnapshot.generatorDetailMetrics || null
            };

            if (STATE.presetProgression && String(STATE.presetProgression.gameId || '') === String(afterSnapshot.gameId || '')) {
                const effectScore =
                    (Number(effect.delta.myXG || 0) * 4) -
                    (Number(effect.delta.oppXG || 0) * 5) +
                    (Number(effect.delta.myShots || 0) * 0.5) -
                    (Number(effect.delta.oppShots || 0) * 0.5) -
                    (Number(effect.delta.myBadActionsPct || 0) * 0.3);

                STATE.presetProgression.lastEffect = {
                    schema: 'slf_preset_effect_score_v2',
                    presetName: effect.presetName,
                    effectScore: Number(effectScore.toFixed(2)),
                    fromBucket: effect.fromBucket,
                    toBucket: effect.toBucket,
                    toWindowIndex: afterWindow?.index || 0,
                    delta: effect.delta,
                    vectorContext: effect.vectorContext,
                    decisionContext: effect.decisionContext,
                    generatorQualitySignal: afterQualitySignal,
                    evaluatedAt: Date.now()
                };

                SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });
            }

            STATE.pendingPresetEvent = null;
            return effect;
        },

        getManualTelemetryFingerprint(snapshot) {
            const score = snapshot?.score || {};
            const my = this.findTeamStats(snapshot, snapshot?.myTeam) || {};
            const opp = snapshot?.stats?.find(x => Number(x.teamId) !== Number(snapshot?.myTeam))?.stats || {};
            return [
                snapshot?.gameId || '',
                snapshot?.status || '',
                snapshot?.minute ?? '',
                snapshot?.bucket || '',
                score.home ?? '',
                score.away ?? '',
                snapshot?.myTeam || '',
                my.power ?? '',
                opp.power ?? '',
                my.defVector ?? '',
                my.pressVector ?? '',
                opp.defVector ?? '',
                opp.pressVector ?? '',
                snapshot?.ruleDecision?.action?.preset || ''
            ].join('|');
        },

        submitManualTelemetry(snapshot, generatorVersion = '') {
            if (!snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return;

            const effect = this.buildPresetEffect(snapshot);
            if (effect) {
                effect.source = Object.assign({}, effect.source || {}, {
                    page: 'game',
                    collectedAt: Date.now(),
                    generatorVersion: generatorVersion || snapshot.generatorVersion || null,
                    trigger: 'manual_hint_button'
                });
                void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EFFECTS, effect, 'preset effect history')
                    .then(() => UI.addParserLog(`Эффект пресета сохранён: ${effect.presetName || 'unknown'}`))
                    .catch(error => UI.addParserLog(`Эффект пресета: ошибка ${error?.kind || 'unknown'}`));
            }

            if (snapshot.status === 'finished') return;
            const fingerprint = this.getManualTelemetryFingerprint(snapshot);
            if (STATE.lastManualTelemetryFingerprint === fingerprint) return;
            STATE.lastManualTelemetryFingerprint = fingerprint;

            snapshot.generatorVersion = generatorVersion || snapshot.generatorVersion || null;
            snapshot.recommendationSource = 'manual_hint_button';
            snapshot.ruleDecision = snapshot.ruleDecision || STATE.lastRuleDecision || null;
            void SnapshotEngine.sendSnapshot(snapshot)
                .then(() => UI.addParserLog(`Snapshot ${snapshot.generatorVersion || ''} сохранён`.trim()))
                .catch(error => UI.addParserLog(`Snapshot: ошибка ${error?.kind || 'unknown'}`));
        },

        diffTactic(oldTactic, newTactic) {
            const diff = {};
            const keys = new Set([
                ...Object.keys(oldTactic || {}),
                ...Object.keys(newTactic || {})
            ]);

            keys.forEach(key => {
                const oldVal = JSON.stringify(oldTactic?.[key] ?? null);
                const newVal = JSON.stringify(newTactic?.[key] ?? null);
                if (oldVal !== newVal) {
                    diff[key] = {
                        from: oldTactic?.[key] ?? null,
                        to: newTactic?.[key] ?? null
                    };
                }
            });

            return diff;
        },

        startManualTacticWatcher() {
            if (STATE.tacticWatcherStarted) return;
            if (!location.pathname.includes('/game.php')) return;

            const ids = MatchStatsParser.getAllTeamIds();
            if (!MatchStatsParser.detectMyTeamId(ids, MatchStatsParser.readTeamNames())) return;

            STATE.tacticWatcherStarted = true;
            STATE.lastManualTactic = getCurrentTactic();

            document.body.addEventListener('change', e => {
                const el = e.target;
                if (!el || !el.name) return;

                const isTacticInput =
                    el.matches('input[type="radio"], input[type="checkbox"]') &&
                    (
                        el.name === 'def_line' ||
                        el.name === 'press_line' ||
                        el.name === 'def_width' ||
                        el.name === 'press_intense' ||
                        el.name === 'build_type' ||
                        el.name === 'build_temp' ||
                        el.name === 'build_long' ||
                        el.name === 'build_fast' ||
                        el.name === 'style' ||
                        el.name === 'pass_risk' ||
                        el.name === 'dribble' ||
                        el.name === 'cross' ||
                        el.name === 'corner' ||
                        el.name === 'shot' ||
                        el.name.startsWith('priority_')
                    );

                if (!isTacticInput) return;
                if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) return;

                clearTimeout(STATE.manualChangeTimer);
                STATE.manualChangeTimer = setTimeout(() => {
                    if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) return;

                    const current = getCurrentTactic();
                    const changed = this.diffTactic(STATE.lastManualTactic, current);
                    if (!Object.keys(changed).length) return;

                    const snapshot = SnapshotEngine.build();
                    snapshot.ruleDecision = snapshot.ruleDecision || STATE.lastRuleDecision || null;
                    const ts = Date.now();
                    const generationWindow = snapshot?.generationWindow || MatchStateParser.getGenerationWindow(snapshot?.minute);
                    const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot?.minute);
                    const event = {
                        ts,
                        recordType: 'preset_event',
                        schemaVersion: 2,
                        parserVersion: 'manual_tactic_event_generation_v3_rule_decision',
                        eventKey: ['manual_tactic_event', MatchStateParser.getGameId(), snapshot.minute ?? '', snapshot.bucket || '', ts].join('|'),
                        type: 'manual_change',
                        gameId: MatchStateParser.getGameId(),
                        minute: snapshot.minute,
                        bucket: snapshot.bucket,
                        generationWindow,
                        targetGenerationWindow,
                        targetBucket: targetGenerationWindow?.label || snapshot.bucket,
                        timingModel: 'generation_windows_v1_last_change_before_next_window',
                        myTeam: snapshot.myTeam,
                        changed,
                        tactic: current,
                        ruleDecision: this.compactRuleDecision(snapshot.ruleDecision),
                        beforeSnapshot: snapshot,
                        snapshot
                    };

                    STATE.pendingPresetEvent = event;
                    SnapshotEngine.freezeRecommendationsAfterTacticChange('manual_change', snapshot);
                    void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'manual tactic event history')
                        .then(() => UI.addParserLog('Ручное изменение тактики сохранено'))
                        .catch(error => UI.addParserLog(`Ошибка сохранения изменения тактики: ${error?.kind || 'unknown'}`));

                    STATE.lastManualTactic = current;
                }, 500);
            }, true);

            UI.addParserLog('Manual tactic watcher активен');
        }
    };

    SnapshotEngine.submitManualTelemetry = function submitManualTelemetry(snapshot, generatorVersion = '') {
        return EventTracker.submitManualTelemetry(snapshot, generatorVersion);
    };
    // ============================================================
