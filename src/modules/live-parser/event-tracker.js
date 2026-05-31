    // 9. Event / Effect Tracking
    // ============================================================

    const EventTracker = {
        findTeamStats(snapshot, teamId) {
            return snapshot?.stats?.find(x => x.teamId === teamId)?.stats || null;
        },

        savePresetEvent(name, preset, beforeSnapshot) {
            const ts = Date.now();
            const generationWindow = beforeSnapshot?.generationWindow || MatchStateParser.getGenerationWindow(beforeSnapshot?.minute);
            const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(beforeSnapshot?.minute);
            const event = {
                ts,
                recordType: 'preset_event',
                schemaVersion: 2,
                parserVersion: 'preset_event_generation_v2',
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
            Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'preset event history');
            UI.addParserLog(`Пресет применён: ${PresetStorage.getAllLabels()[name] || TacticPresetLibrary?.meta?.[name]?.title || name}`);
        },

        buildPresetEffect(afterSnapshot) {
            const pending = STATE.pendingPresetEvent;

            if (!pending || !afterSnapshot) return null;
            if (pending.gameId !== afterSnapshot.gameId) return null;
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
            const beforeOpp = before.stats.find(x => x.teamId !== myTeam)?.stats;

            const afterMy = this.findTeamStats(afterSnapshot, myTeam);
            const afterOpp = afterSnapshot.stats.find(x => x.teamId !== myTeam)?.stats;

            if (!beforeMy || !beforeOpp || !afterMy || !afterOpp) return null;

            const beforeQualitySignal = before.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(before.developerHints || []);
            const afterQualitySignal = afterSnapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(afterSnapshot.developerHints || []);
            const beforeExpectedPerformance = before.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(before.developerHints || []) : null);
            const afterExpectedPerformance = afterSnapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(afterSnapshot.developerHints || []) : null);
            const ts = Date.now();
            const effect = {
                ts,
                recordType: 'preset_effect',
                schemaVersion: 2,
                parserVersion: 'preset_effect_generation_v2',
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
                delta: {
                    myXG: num(afterMy.xG) - num(beforeMy.xG),
                    oppXG: num(afterOpp.xG) - num(beforeOpp.xG),
                    myShots: num(afterMy.shots) - num(beforeMy.shots),
                    oppShots: num(afterOpp.shots) - num(beforeOpp.shots),
                    myBadActionsPct: num(afterMy.badActionsPct) - num(beforeMy.badActionsPct),
                    myPower: num(afterMy.power) - num(beforeMy.power),
                    oppPower: num(afterOpp.power) - num(beforeOpp.power),
                    strengthGap: (num(afterMy.power) - num(afterOpp.power)) - (num(beforeMy.power) - num(beforeOpp.power)),
                    myXT: RecommendationEngine.getXTForMyTeam(afterSnapshot).myXT - RecommendationEngine.getXTForMyTeam(before).myXT,
                    oppXT: RecommendationEngine.getXTForMyTeam(afterSnapshot).oppXT - RecommendationEngine.getXTForMyTeam(before).oppXT
                },
                varianceContext: {
                    model: 'variance_tracking_v1_not_rigging_assumption',
                    scoreBefore: before.score || null,
                    scoreAfter: afterSnapshot.score || null,
                    strengthGap: num(beforeMy.power) - num(beforeOpp.power),
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
                        myPowerBefore: num(beforeMy.power),
                        myPowerAfter: num(afterMy.power),
                        oppPowerBefore: num(beforeOpp.power),
                        oppPowerAfter: num(afterOpp.power),
                        strengthGapBefore: num(beforeMy.power) - num(beforeOpp.power),
                        strengthGapAfter: num(afterMy.power) - num(afterOpp.power)
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
                    schema: 'slf_preset_effect_score_v1',
                    presetName: effect.presetName,
                    effectScore: Number(effectScore.toFixed(2)),
                    fromBucket: effect.fromBucket,
                    toBucket: effect.toBucket,
                    toWindowIndex: afterWindow?.index || 0,
                    delta: effect.delta,
                    generatorQualitySignal: afterQualitySignal,
                    evaluatedAt: Date.now()
                };

                SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });
            }

            STATE.pendingPresetEvent = null;
            return effect;
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

                if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) {
                    return;
                }

                clearTimeout(STATE.manualChangeTimer);

                STATE.manualChangeTimer = setTimeout(() => {
                    if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) {
                        return;
                    }

                    const current = getCurrentTactic();
                    const changed = this.diffTactic(STATE.lastManualTactic, current);

                    if (!Object.keys(changed).length) return;

                    const snapshot = SnapshotEngine.build();

                    const ts = Date.now();
                    const generationWindow = snapshot?.generationWindow || MatchStateParser.getGenerationWindow(snapshot?.minute);
                    const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot?.minute);
                    const event = {
                        ts,
                        recordType: 'preset_event',
                        schemaVersion: 2,
                        parserVersion: 'manual_tactic_event_generation_v2',
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
                        beforeSnapshot: snapshot,
                        snapshot
                    };

                    STATE.pendingPresetEvent = event;
                    SnapshotEngine.freezeRecommendationsAfterTacticChange('manual_change', snapshot);
                    Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'manual tactic event history');
                    UI.addParserLog('Ручное изменение тактики сохранено');

                    STATE.lastManualTactic = current;
                }, 500);
            }, true);

            UI.addParserLog('Manual tactic watcher активен');
        }
    };
    // ============================================================
