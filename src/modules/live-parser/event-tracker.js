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
                riskAppetite: decision.riskAppetite || decision.action.riskAppetite || null,
                action: {
                    preset: decision.action.preset || null,
                    decision: decision.action.decision || null,
                    risk: decision.action.risk || null,
                    score: Number(decision.action.score || 0),
                    reason: decision.action.reason || '',
                    guardType: decision.action.guardType || null,
                    guardReason: decision.action.guardReason || '',
                    emergency: !!decision.action.emergency,
                    exploration: !!decision.action.exploration
                },
                confidence: decision.confidence || null,
                margin: Number(decision.margin || 0),
                exploration: decision.exploration || null,
                signals: decision.moment?.context || null,
                candidates: (decision.candidates || []).map(item => ({
                    preset: item.preset,
                    score: Number(item.score || 0),
                    rawScore: Number(item.rawScore || 0),
                    vetoed: !!item.vetoed,
                    vetoReasons: Array.isArray(item.vetoReasons) ? item.vetoReasons.slice() : []
                })),
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
                schemaVersion: 3,
                parserVersion: 'preset_event_generation_v4_tactic_telemetry',
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
                tacticTelemetry: beforeSnapshot?.tacticTelemetry || null,
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
                schemaVersion: 3,
                parserVersion: 'preset_effect_generation_v4_tactic_telemetry',
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
                tacticTelemetry: afterSnapshot.tacticTelemetry || pending.tacticTelemetry || null,
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
                    before: { myDefense: num(beforeMy.defVector), myPressing: num(beforeMy.pressVector), oppDefense: num(beforeOpp.defVector), oppPressing: num(beforeOpp.pressVector) },
                    after: { myDefense: num(afterMy.defVector), myPressing: num(afterMy.pressVector), oppDefense: num(afterOpp.defVector), oppPressing: num(afterOpp.pressVector) }
                },
                varianceContext: {
                    model: 'variance_tracking_v3_tactic_telemetry',
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
                    schema: 'slf_preset_effect_score_v3_tactic_telemetry',
                    presetName: effect.presetName,
                    effectScore: Number(effectScore.toFixed(2)),
                    fromBucket: effect.fromBucket,
                    toBucket: effect.toBucket,
                    toWindowIndex: afterWindow?.index || 0,
                    delta: effect.delta,
                    vectorContext: effect.vectorContext,
                    decisionContext: effect.decisionContext,
                    tacticTelemetry: effect.tacticTelemetry,
                    generatorQualitySignal: afterQualitySignal,
                    evaluatedAt: Date.now()
                };
                SnapshotEngine.persistManualState();
            }

            STATE.pendingPresetEvent = null;
            return effect;
        },

        getManualTelemetryFingerprint(snapshot) {
            const score = snapshot?.score || {};
            const my = this.findTeamStats(snapshot, snapshot?.myTeam) || {};
            const opp = snapshot?.stats?.find(x => Number(x.teamId) !== Number(snapshot?.myTeam))?.stats || {};
            return [snapshot?.gameId || '', snapshot?.status || '', snapshot?.minute ?? '', snapshot?.bucket || '', score.home ?? '', score.away ?? '', snapshot?.myTeam || '', my.power ?? '', opp.power ?? '', my.defVector ?? '', my.pressVector ?? '', opp.defVector ?? '', opp.pressVector ?? '', snapshot?.ruleDecision?.action?.preset || ''].join('|');
        },

        submitManualTelemetry(snapshot, generatorVersion = '') {
            if (!snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return;
            const effect = this.buildPresetEffect(snapshot);
            if (effect) {
                effect.source = Object.assign({}, effect.source || {}, { page: 'game', collectedAt: Date.now(), generatorVersion: generatorVersion || snapshot.generatorVersion || null, trigger: 'manual_hint_button' });
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
            const keys = new Set([...Object.keys(oldTactic || {}), ...Object.keys(newTactic || {})]);
            keys.forEach(key => {
                const oldVal = JSON.stringify(oldTactic?.[key] ?? null);
                const newVal = JSON.stringify(newTactic?.[key] ?? null);
                if (oldVal !== newVal) diff[key] = { from: oldTactic?.[key] ?? null, to: newTactic?.[key] ?? null };
            });
            return diff;
        },

    };

    (function installTacticTelemetryEnvelope() {
        if (SnapshotEngine.__tacticTelemetryEnvelopeInstalled) return;
        const sessions = new Map();
        const maxTransitions = 40;
        const clone = value => {
            if (value == null) return null;
            try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
        };
        const fingerprint = tactic => {
            if (!tactic || typeof tactic !== 'object') return '';
            const keys = ['def_line','press_line','def_width','press_intense','build_type','build_temp','build_long','build_fast','style','pass_risk','dribble','cross','corner','shot','priority'];
            return keys.map(key => `${key}:${JSON.stringify(tactic[key] ?? null)}`).join('|');
        };
        const detectPreset = tactic => {
            const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
            const signatures = engine?.TACTIC_SIGNATURES || {};
            return Object.keys(signatures).find(name => engine.tacticMatches(signatures[name], tactic)) || null;
        };
        const getSession = snapshot => {
            const gameId = String(snapshot?.gameId || 'unknown');
            if (!sessions.has(gameId)) sessions.set(gameId, { initialTactic: null, initialPreset: null, lastFingerprint: '', lastPreset: null, transitions: [] });
            if (sessions.size > 8) sessions.delete(sessions.keys().next().value);
            return sessions.get(gameId);
        };
        const enrich = (snapshot, source) => {
            if (!snapshot || typeof snapshot !== 'object') return snapshot;
            const session = getSession(snapshot);
            const currentFingerprint = fingerprint(snapshot.currentTactic);
            const currentPreset = detectPreset(snapshot.currentTactic);
            if (!session.initialTactic && snapshot.currentTactic) {
                session.initialTactic = clone(snapshot.currentTactic);
                session.initialPreset = currentPreset;
            }
            if (currentFingerprint && currentFingerprint !== session.lastFingerprint) {
                session.transitions.push({
                    ts: Date.now(),
                    minute: snapshot.minute ?? null,
                    bucket: snapshot.bucket || null,
                    score: clone(snapshot.score),
                    source,
                    fromPreset: session.lastPreset,
                    toPreset: currentPreset,
                    tactic: clone(snapshot.currentTactic),
                    tacticFingerprint: currentFingerprint,
                    recommendation: EventTracker.compactRuleDecision(snapshot.ruleDecision || STATE.lastRuleDecision || null)
                });
                session.transitions = session.transitions.slice(-maxTransitions);
                session.lastFingerprint = currentFingerprint;
                session.lastPreset = currentPreset;
            }
            const decision = EventTracker.compactRuleDecision(snapshot.ruleDecision || STATE.lastRuleDecision || null);
            let riskAppetite = decision?.riskAppetite || decision?.action?.riskAppetite || null;
            try { riskAppetite = riskAppetite || localStorage.getItem('slf:tactics:risk-appetite'); } catch (_) {}
            snapshot.tacticTelemetry = {
                schema: 'slf_tactic_telemetry_v1',
                libraryVersion: 'active_presets_v2_bold_policy_v3',
                recommendationSchema: decision?.schema || null,
                riskAppetite: riskAppetite || 'bold',
                currentPreset,
                currentTactic: clone(snapshot.currentTactic),
                currentTacticFingerprint: currentFingerprint,
                initialPreset: session.initialPreset,
                initialTactic: clone(session.initialTactic),
                transitionCount: session.transitions.length,
                transitions: clone(session.transitions) || [],
                latestDecision: decision,
                activePresetIds: Array.isArray(window.SLFActivePresetRegistry?.active) ? window.SLFActivePresetRegistry.active.slice() : [],
                capturedAt: Date.now()
            };
            return snapshot;
        };

        const originalBuild = SnapshotEngine.build.bind(SnapshotEngine);
        SnapshotEngine.build = function buildWithTacticTelemetry() { return enrich(originalBuild(), 'snapshot_build'); };
        const originalBuildSnapshotRecord = SnapshotEngine.buildSnapshotRecord.bind(SnapshotEngine);
        SnapshotEngine.buildSnapshotRecord = function buildSnapshotRecordWithTacticTelemetry(snapshot) { return originalBuildSnapshotRecord(enrich(snapshot, 'match_snapshot')); };
        const originalSendMatchResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
        SnapshotEngine.sendMatchResult = function sendMatchResultWithTacticTelemetry(snapshot) { return originalSendMatchResult(enrich(snapshot, 'match_result')); };
        const originalCompactSnapshot = SnapshotEngine.compactSnapshotForStorage.bind(SnapshotEngine);
        SnapshotEngine.compactSnapshotForStorage = function compactSnapshotWithTacticTelemetry(snapshot) {
            const compact = originalCompactSnapshot(enrich(snapshot, 'live_state'));
            if (compact) compact.tacticTelemetry = clone(snapshot.tacticTelemetry);
            return compact;
        };
        SnapshotEngine.__tacticTelemetryEnvelopeInstalled = true;
    })();

    SnapshotEngine.submitManualTelemetry = function submitManualTelemetry(snapshot, generatorVersion = '') {
        return EventTracker.submitManualTelemetry(snapshot, generatorVersion);
    };
    // ============================================================