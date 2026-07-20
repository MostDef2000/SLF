// 8. Snapshot Engine
// ============================================================

const SnapshotEngine = {
    build() {
        const ids = MatchStatsParser.getAllTeamIds();
        const teamNames = MatchStatsParser.readTeamNames();
        const minuteInfo = MatchStateParser.readMinuteInfo();
        const minute = minuteInfo.effectiveMinute;
        const generationWindow = MatchStateParser.getGenerationWindow(minute);
        const visibleDeveloperHints = DeveloperHintParser.readHints();
        const generatorDetailMetrics = typeof GeneratorAdviceDetailsParser !== 'undefined'
            ? GeneratorAdviceDetailsParser.collect()
            : null;
        const detailHints = typeof GeneratorAdviceDetailsParser !== 'undefined'
            ? GeneratorAdviceDetailsParser.toDeveloperHints(generatorDetailMetrics)
            : [];
        const developerHints = [...visibleDeveloperHints, ...detailHints]
            .filter((hint, index, arr) => {
                const key = String(hint?.text || '').trim().toLowerCase();
                return key && arr.findIndex(x => String(x?.text || '').trim().toLowerCase() === key) === index;
            });
        const generatorQualitySignal = DeveloperHintParser.getGeneratorQualitySignal(developerHints);
        if (generatorDetailMetrics?.quality?.detected && !generatorQualitySignal.detected) {
            Object.assign(generatorQualitySignal, generatorDetailMetrics.quality, {
                schema: 'slf_generator_quality_signal_v1',
                confidenceBoost: Math.min(0.35, 0.12 + Math.abs(generatorDetailMetrics.quality.percent || 0) / 100),
                source: 'advice_long_quality_title'
            });
        }
        const generatorExpectedPerformance = typeof GeneratorExpectedPerformanceParser !== 'undefined'
            ? GeneratorExpectedPerformanceParser.parse(developerHints)
            : null;
        const eventsText = MatchStatsParser.readEventsText();
        const rawStatus = MatchStateParser.getStatus();

        // Some live pages do not expose the exact status text at kick-off/refresh.
        // If the page already has match data, keep the live parser active instead of waiting on "unknown".
        const hasLiveEvidence =
            minute != null ||
            ids.length >= 2 ||
            eventsText.length > 1 ||
            !!MatchStatsParser.readXT();

        const status = rawStatus === 'unknown' && hasLiveEvidence
            ? 'live'
            : rawStatus;

        return {
            ts: Date.now(),

            gameId: MatchStateParser.getGameId(),
            status,
            rawStatus,
            statusAssumedLive: rawStatus === 'unknown' && status === 'live',

            minute,
            minuteRaw: minuteInfo.rawMinute,
            baseMinute: minuteInfo.baseMinute,
            stoppageMinute: minuteInfo.stoppageMinute,
            isStoppage: minuteInfo.isStoppage,
            bucket: generationWindow.label,
            legacyBucket: MatchStateParser.getLegacyTenMinuteBucket(minute),
            generationWindow,
            timing: {
                realMatchDurationMinutes: MatchTimingModel.REAL_MATCH_MINUTES,
                officialMatchMinutes: MatchTimingModel.OFFICIAL_MATCH_MINUTES,
                realMinuteEstimate: generationWindow.realMinuteEstimate ?? null,
                model: '36_real_minutes_generation_windows_v1'
            },

            score: MatchStateParser.readScore(),
            xT: MatchStatsParser.readXT(),

            teams: ids,
            teamNames,
            myTeam: MatchStatsParser.detectMyTeamId(ids, teamNames),

            lineupRows: SquadParser.readLineupRows(),
            formation: SquadParser.readFormation(),

            shotsTable: MatchStatsParser.readShotsTable(),
            eventsText,
            developerHints,
            generatorQualitySignal,
            generatorExpectedPerformance,
            generatorDetailMetrics,
            currentTactic: getCurrentTactic(),

            stats: ids.map(id => ({
                teamId: id,
                stats: MatchStatsParser.readFullStats(id)
            }))
        };
    },

    getScoreKey(score) {
        if (!score || typeof score !== 'object') return '?:?';
        return `${score.home ?? '?'}:${score.away ?? '?'}`;
    },

    buildSnapshotKey(snapshot) {
        if (!snapshot) return `snapshot|unknown|${Date.now()}`;

        return [
            'match_snapshot',
            snapshot.gameId || '',
            snapshot.status || '',
            snapshot.minute ?? '',
            snapshot.bucket || '',
            this.getScoreKey(snapshot.score),
            (snapshot.teams || []).join('-')
        ].join('|');
    },

    buildResultKey(snapshot) {
        if (!snapshot) return `match_result|unknown|${Date.now()}`;

        return [
            'match_result',
            snapshot.gameId || '',
            'finished_match',
            this.getScoreKey(snapshot.score),
            (snapshot.teams || []).join('-')
        ].join('|');
    },

    buildSnapshotRecord(snapshot) {
        return Object.assign({}, snapshot, {
            recordType: 'match_snapshot',
            schemaVersion: 2,
            parserVersion: 'match_snapshot_append_v1',
            snapshotKey: this.buildSnapshotKey(snapshot),
            source: {
                page: 'game',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: SLF_VERSION_INFO.scriptVersion
            }
        });
    },

    sendSnapshot(snapshot) {
        console.log('[SLF SNAPSHOT]', snapshot);

        const record = this.buildSnapshotRecord(snapshot);

        Api.postAppend(
            CONFIG.COLLECTIONS.MATCH_SNAPSHOTS,
            record,
            'snapshot history'
        );

        this.sendPlayerObservations(snapshot);
    },

    getLiveStorageKey(gameId = MatchStateParser.getGameId()) {
        return `${LIVE_PARSER_STATE_PREFIX}:${gameId || 'unknown'}`;
    },

    compactSnapshotForStorage(snapshot) {
        if (!snapshot) return null;

        return {
            ts: snapshot.ts || Date.now(),
            gameId: snapshot.gameId || null,
            status: snapshot.status || null,
            rawStatus: snapshot.rawStatus || null,
            minute: snapshot.minute ?? null,
            minuteRaw: snapshot.minuteRaw || null,
            baseMinute: snapshot.baseMinute ?? null,
            bucket: snapshot.bucket || '',
            legacyBucket: snapshot.legacyBucket || '',
            generationWindow: snapshot.generationWindow || null,
            score: snapshot.score || null,
            xT: snapshot.xT || null,
            teams: Array.isArray(snapshot.teams) ? snapshot.teams : [],
            teamNames: snapshot.teamNames || {},
            myTeam: snapshot.myTeam || null,
            stats: Array.isArray(snapshot.stats) ? snapshot.stats : [],
            eventsText: Array.isArray(snapshot.eventsText) ? snapshot.eventsText.slice(0, 12) : [],
            developerHints: Array.isArray(snapshot.developerHints) ? snapshot.developerHints.slice(0, 8) : [],
            generatorQualitySignal: snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(snapshot.developerHints || []),
            generatorExpectedPerformance: snapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(snapshot.developerHints || []) : null),
            currentTactic: snapshot.currentTactic || null
        };
    },

    compactSegmentSnapshotsForStorage() {
        const result = {};
        const source = STATE.liveSegmentSnapshots || {};

        Object.keys(source).forEach(key => {
            const rows = Array.isArray(source[key]) ? source[key] : [];
            const compactRows = rows
                .slice(-4)
                .map(snapshot => this.compactSnapshotForStorage(snapshot))
                .filter(Boolean);

            if (compactRows.length) result[key] = compactRows;
        });

        return result;
    },

    persistLiveState(extra = {}) {
        const gameId = MatchStateParser.getGameId();
        if (!gameId) return;

        const payload = Object.assign({
            schema: 'slf_live_parser_state_v2',
            active: !!STATE.liveParserTimer || !!extra.active,
            gameId,
            ts: Date.now(),
            url: location.href,
            lastSavedBucket: STATE.lastSavedBucket || null,
            liveWaitStatus: STATE.liveWaitStatus || null,
            liveStartedAt: STATE.liveStartedAt || Date.now(),
            recommendationFreeze: STATE.recommendationFreeze || null,
            pendingPresetEvent: STATE.pendingPresetEvent || null,
            presetProgression: STATE.presetProgression || null,
            lastRecommendationHtml: STATE.lastRecommendationHtml || null,
            lastRecommendationMeta: STATE.lastRecommendationMeta || null,
            liveSegmentSnapshots: this.compactSegmentSnapshotsForStorage()
        }, extra || {});

        try {
            localStorage.setItem(this.getLiveStorageKey(gameId), JSON.stringify(payload));
        } catch (e) {
            try {
                delete payload.liveSegmentSnapshots;
                localStorage.setItem(this.getLiveStorageKey(gameId), JSON.stringify(payload));
            } catch (inner) {
                debugWarn('[SLF] Live parser state persist failed', inner);
            }
        }
    },

    loadLiveState(gameId = MatchStateParser.getGameId()) {
        if (!gameId) return null;

        try {
            const raw = localStorage.getItem(this.getLiveStorageKey(gameId));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || data.schema !== 'slf_live_parser_state_v2') return null;
            if (String(data.gameId) !== String(gameId)) return null;
            return data;
        } catch (e) {
            return null;
        }
    },

    clearLiveState(gameId = MatchStateParser.getGameId()) {
        if (!gameId) return;
        try {
            localStorage.removeItem(this.getLiveStorageKey(gameId));
        } catch (e) {}
    },

    freezeRecommendationsAfterTacticChange(presetName, snapshot) {
        if (!snapshot || !snapshot.gameId || snapshot.status === 'finished') return;

        const currentWindow = snapshot.generationWindow || MatchTimingModel.getWindow(snapshot.minute);
        const targetWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot.minute);
        const preservedRecommendationHtml = typeof RecommendationEngine !== 'undefined' && RecommendationEngine.captureCurrentRecommendationHtml
            ? RecommendationEngine.captureCurrentRecommendationHtml()
            : STATE.lastRecommendationHtml;
        const label = presetName || 'manual_change';

        if (preservedRecommendationHtml) {
            STATE.lastRecommendationHtml = preservedRecommendationHtml;
            STATE.lastRecommendationMeta = Object.assign({}, STATE.lastRecommendationMeta || {}, {
                preservedAt: Date.now(),
                preservedReason: 'tactic_apply_freeze',
                preservedPresetName: label,
                preservedBucket: snapshot.bucket || ''
            });
        }

        STATE.recommendationFreeze = {
            schema: 'slf_recommendation_freeze_v1',
            gameId: snapshot.gameId,
            presetName: label,
            appliedAt: Date.now(),
            fromBucket: snapshot.bucket || '',
            fromWindowIndex: currentWindow?.index || 0,
            targetBucket: targetWindow?.label || snapshot.bucket || '',
            targetWindowIndex: targetWindow?.index || currentWindow?.index || 0,
            appliedSnapshotKey: this.buildSnapshotKey(snapshot),
            preservedRecommendationHtml: STATE.lastRecommendationHtml || preservedRecommendationHtml || null
        };

        const previousProgression = STATE.presetProgression || null;
        const isKnownPreset = label && label !== 'manual_change' && TacticPresetLibrary?.meta?.[label];

        STATE.presetProgression = {
            schema: 'slf_preset_progression_v1',
            gameId: snapshot.gameId,
            lastAppliedPreset: label,
            previousPreset: previousProgression?.lastAppliedPreset || null,
            lastRecommendedPreset: previousProgression?.lastRecommendedPreset || null,
            family: isKnownPreset ? TacticPresetLibrary.getGroup(label) : 'manual',
            rank: isKnownPreset ? TacticPresetLibrary.getRank(label) : 0,
            baselineBucket: snapshot.bucket || '',
            baselineWindowIndex: currentWindow?.index || 0,
            targetBucket: targetWindow?.label || snapshot.bucket || '',
            targetWindowIndex: targetWindow?.index || currentWindow?.index || 0,
            appliedAt: Date.now(),
            status: 'applied_baseline'
        };

        const waitText = `Пресет применён: ${label}. Ждём следующий snapshot/отрезок ${STATE.recommendationFreeze.targetBucket || ''}.`;
        UI.updateParserStatus(waitText);
        UI.addParserLog(waitText);
        this.persistLiveState({ active: true });
    },

    clearRecommendationFreeze(reason = 'cleared') {
        if (!STATE.recommendationFreeze) return;
        STATE.recommendationFreeze = null;
        this.persistLiveState({ active: !!STATE.liveParserTimer, freezeClearedReason: reason });
    },

    getRecommendationFreezeStatus(snapshot) {
        const freeze = STATE.recommendationFreeze;
        if (!freeze) return { active: false };

        if (!snapshot || String(snapshot.gameId || '') !== String(freeze.gameId || '')) {
            this.clearRecommendationFreeze('game_changed');
            return { active: false };
        }

        if (snapshot.status === 'finished') {
            this.clearRecommendationFreeze('match_finished');
            return { active: false };
        }

        const currentWindow = snapshot.generationWindow || MatchTimingModel.getWindow(snapshot.minute);
        const currentIndex = currentWindow?.index || 0;
        const targetIndex = Number(freeze.targetWindowIndex || 0);
        const fromIndex = Number(freeze.fromWindowIndex || 0);
        const bucketChanged = !!freeze.fromBucket && !!snapshot.bucket && snapshot.bucket !== freeze.fromBucket;
        const reachedTarget = targetIndex > 0 && currentIndex >= targetIndex && currentIndex !== fromIndex;

        if (bucketChanged || reachedTarget) {
            this.clearRecommendationFreeze('target_segment_reached');
            return { active: false };
        }

        return {
            active: true,
            presetName: freeze.presetName || 'manual_change',
            fromBucket: freeze.fromBucket || '',
            targetBucket: freeze.targetBucket || '',
            targetWindowIndex: targetIndex,
            currentBucket: snapshot.bucket || '',
            currentWindowIndex: currentIndex
        };
    },

    autoResumeIfNeeded() {
        if (STATE.liveAutoResumeChecked) return;
        if (!location.pathname.includes('/game.php')) return;
        if (STATE.liveParserTimer) return;

        const saved = this.loadLiveState();
        if (!saved || !saved.active) return;

        const snapshot = this.build();
        if (snapshot?.status === 'finished') {
            this.clearLiveState(saved.gameId);
            return;
        }

        STATE.liveAutoResumeChecked = true;
        this.startLive({ autoResume: true, persistedState: saved });
    },

    rememberLiveSnapshot(snapshot) {
        if (!snapshot || !snapshot.gameId || !snapshot.bucket) return snapshot;

        const key = `${snapshot.gameId}|${snapshot.bucket}`;
        const list = STATE.liveSegmentSnapshots[key] || [];
        list.push(snapshot);
        STATE.liveSegmentSnapshots[key] = list.slice(-12);

        snapshot.segmentAggregate = this.buildSegmentAggregate(STATE.liveSegmentSnapshots[key], snapshot);
        return snapshot;
    },

    buildSegmentAggregate(list, snapshot) {
        const rows = Array.isArray(list) ? list.filter(Boolean) : [];
        if (!rows.length) return null;

        const first = rows[0];
        const last = rows[rows.length - 1] || snapshot;
        const myTeam = last.myTeam || snapshot?.myTeam;

        const getTeam = (snap, teamId) => snap?.stats?.find(x => Number(x.teamId) === Number(teamId))?.stats || null;
        const getOpp = (snap, teamId) => snap?.stats?.find(x => Number(x.teamId) !== Number(teamId))?.stats || null;
        const firstMy = getTeam(first, myTeam);
        const lastMy = getTeam(last, myTeam);
        const firstOpp = getOpp(first, myTeam);
        const lastOpp = getOpp(last, myTeam);

        const delta = (a, b, key) => (a && b) ? num(b[key]) - num(a[key]) : null;

        return {
            bucket: last.bucket,
            samples: rows.length,
            fromMinute: first.minute,
            toMinute: last.minute,
            my: {
                xG: delta(firstMy, lastMy, 'xG'),
                shots: delta(firstMy, lastMy, 'shots'),
                actions: delta(firstMy, lastMy, 'actions'),
                badActionsPct: lastMy ? num(lastMy.badActionsPct) : null,
                badActionsPctDelta: delta(firstMy, lastMy, 'badActionsPct'),
                power: delta(firstMy, lastMy, 'power')
            },
            opp: {
                xG: delta(firstOpp, lastOpp, 'xG'),
                shots: delta(firstOpp, lastOpp, 'shots'),
                actions: delta(firstOpp, lastOpp, 'actions'),
                badActionsPct: lastOpp ? num(lastOpp.badActionsPct) : null,
                badActionsPctDelta: delta(firstOpp, lastOpp, 'badActionsPct'),
                power: delta(firstOpp, lastOpp, 'power')
            },
            powerContext: {
                myPowerStart: firstMy ? num(firstMy.power) : null,
                myPowerEnd: lastMy ? num(lastMy.power) : null,
                oppPowerStart: firstOpp ? num(firstOpp.power) : null,
                oppPowerEnd: lastOpp ? num(lastOpp.power) : null,
                myPowerDrop: firstMy && lastMy ? num(lastMy.power) - num(firstMy.power) : null,
                oppPowerDrop: firstOpp && lastOpp ? num(lastOpp.power) - num(firstOpp.power) : null,
                strengthGapStart: firstMy && firstOpp ? num(firstMy.power) - num(firstOpp.power) : null,
                strengthGapEnd: lastMy && lastOpp ? num(lastMy.power) - num(lastOpp.power) : null,
                strengthGapDelta: firstMy && firstOpp && lastMy && lastOpp ? (num(lastMy.power) - num(lastOpp.power)) - (num(firstMy.power) - num(firstOpp.power)) : null
            }
        };
    },

    sendPlayerObservations(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.lineupRows)) return;

        const teams = snapshot.teams || [];

        const observations = snapshot.lineupRows
            .filter(player => player && player.playerId)
            .map(player => {
                const teamId =
                    player.side === 'home'
                        ? teams[0]
                        : player.side === 'away'
                            ? teams[1]
                            : null;

                return {
                    ts: Date.now(),

                    gameId: snapshot.gameId,
                    status: snapshot.status,
                    minute: snapshot.minute,
                    bucket: snapshot.bucket,

                    teamId,

                    playerId: player.playerId,
                    name: player.name,

                    side: player.side,
                    isStarter: player.isStarter,

                    currentPosition: player.normalizedPosition,
                    rawPosition: player.position,
                    possiblePositions: player.positions,
                    exactSlot: player.gridPosition || player.position || null,
                    slotSource: player.slotSource || 'lineup_rows',

                    skill: player.skill
                };
            });

        if (!observations.length) return;

        Api.post(
            CONFIG.COLLECTIONS.PLAYER_OBSERVATIONS + '?mode=append',
            observations,
            'player observations'
        );
    },

    sendMatchResult(snapshot) {
        const result = Object.assign({}, snapshot, {
            recordType: 'match_result',
            resultType: 'finished_match',
            schemaVersion: 2,
            parserVersion: 'match_result_append_v1',
            resultKey: this.buildResultKey(snapshot),
            parsedAt: Date.now(),
            source: {
                page: 'game',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: SLF_VERSION_INFO.scriptVersion
            }
        });

        Api.postAppend(
            CONFIG.COLLECTIONS.MATCH_RESULTS,
            result,
            'match result history'
        );

        this.sendPlayerObservations(snapshot);
    },

    startLive(options = {}) {
        if (STATE.liveParserTimer) {
            UI.updateParserStatus('Live parser уже запущен');

            try {
                const snapshot = this.build();
                if (snapshot) {
                    this.rememberLiveSnapshot(snapshot);
                    RecommendationEngine.update(snapshot);
                    this.persistLiveState({ active: true, refreshedWhileRunning: true });
                    UI.addParserLog('Live parser уже работал: рекомендация обновлена по текущему snapshot');
                }
            } catch (error) {
                console.error('[SLF] Failed to refresh recommendation while live parser already running', error);
                UI.addParserLog('Live parser уже работал: ошибка обновления рекомендации, см. console');
            }

            return;
        }

        const persisted = options.persistedState || null;

        STATE.lastSavedBucket = persisted?.lastSavedBucket || null;
        STATE.liveWaitStatus = persisted?.liveWaitStatus || null;
        STATE.liveStartedAt = persisted?.liveStartedAt || Date.now();
        STATE.liveSegmentSnapshots = persisted?.liveSegmentSnapshots || {};
        STATE.recommendationFreeze = persisted?.recommendationFreeze || STATE.recommendationFreeze || null;
        STATE.pendingPresetEvent = persisted?.pendingPresetEvent || STATE.pendingPresetEvent || null;
        STATE.presetProgression = persisted?.presetProgression || STATE.presetProgression || null;
        STATE.lastRecommendationHtml = persisted?.lastRecommendationHtml || STATE.lastRecommendationHtml || null;
        STATE.lastRecommendationMeta = persisted?.lastRecommendationMeta || STATE.lastRecommendationMeta || null;

        STATE.liveParserTimer = setInterval(() => {
            const snapshot = this.build();

            if (!snapshot) return;

            if (snapshot.status === 'finished') {
                UI.addParserLog('Live parser увидел завершение матча');
                this.stopLive({ reason: 'finished', clearPersisted: true });
                return;
            }

            if (snapshot.status !== 'live') {
                const waitStatus = snapshot.status || 'unknown';
                UI.updateParserStatus(`Live parser ждёт возобновления: ${waitStatus}`);

                if (STATE.liveWaitStatus !== waitStatus) {
                    STATE.liveWaitStatus = waitStatus;
                    UI.addParserLog(`Live parser не остановлен, ожидание: ${waitStatus}`);
                }

                this.persistLiveState({ active: true });
                return;
            }

            STATE.liveWaitStatus = null;
            this.rememberLiveSnapshot(snapshot);
            RecommendationEngine.update(snapshot);

            if (snapshot.bucket && snapshot.bucket !== STATE.lastSavedBucket) {
                STATE.lastSavedBucket = snapshot.bucket;

                this.sendSnapshot(snapshot);
                UI.addParserLog(`Сохранён generation snapshot: ${snapshot.bucket}`);

                const effect = EventTracker.buildPresetEffect(snapshot);

                if (effect) {
                    Api.postAppend(CONFIG.COLLECTIONS.PRESET_EFFECTS, effect, 'preset effect history');
                    UI.addParserLog(`Эффект тактики сохранён: ${effect.presetName}`);
                }
            }

            this.persistLiveState({ active: true });
        }, 15000);

        const first = this.build();
        this.rememberLiveSnapshot(first);
        RecommendationEngine.update(first);
        this.persistLiveState({ active: true });

        UI.updateParserStatus(options.autoResume ? 'Live parser восстановлен после обновления страницы' : 'Live parser запущен');
        UI.addParserLog(options.autoResume ? 'Live parser auto-resume: восстановлен run state' : 'Live parser запущен: halftime-safe, 36m real-time, generation windows');
    },

    stopLive(options = {}) {
        if (STATE.liveParserTimer) {
            clearInterval(STATE.liveParserTimer);
            STATE.liveParserTimer = null;
        }

        STATE.recommendationFreeze = null;

        if (options.clearPersisted !== false) {
            this.clearLiveState();
        } else {
            this.persistLiveState({ active: false, stopReason: options.reason || 'stopped' });
        }

        UI.updateParserStatus('Live parser остановлен');
        UI.addParserLog('Live parser остановлен');
    }
};

    // ============================================================
