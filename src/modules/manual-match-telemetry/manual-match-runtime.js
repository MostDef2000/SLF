// Runtime telemetry integrity and result submission guards
// ============================================================

(function installRuntimeTelemetryIntegrity() {
    'use strict';

    if (SnapshotEngine.__runtimeTelemetryIntegrityInstalled) return;
    SnapshotEngine.__runtimeTelemetryIntegrityInstalled = true;

    const pendingEffectEvent = Symbol('slfPendingEffectEvent');
    const manualStateSchema = 'slf_manual_match_state_v1';
    const manualStatePrefix = 'slf_manual_match_state_v1';
    const legacyStatePrefix = 'slf_live_parser_state_v2';
    const tacticalInputNames = new Set([
        'def_line', 'press_line', 'def_width', 'press_intense',
        'build_type', 'build_temp', 'build_long', 'build_fast',
        'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
    ]);

    function hasOwn(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    function cloneForStorage(value) {
        if (value == null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
    }

    function resolveGameId(gameId = null) {
        if (gameId) return gameId;
        return typeof MatchStateParser?.getGameId === 'function' ? MatchStateParser.getGameId() : null;
    }

    function getStateKey(prefix, gameId) {
        return `${prefix}:${gameId || 'unknown'}`;
    }

    function readStoredState(prefix, gameId) {
        if (!gameId || typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(getStateKey(prefix, gameId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || String(parsed.gameId || '') !== String(gameId)) return null;
            return parsed;
        } catch (_) { return null; }
    }

    function normalizeLegacyManualState(legacy, gameId) {
        if (!legacy || legacy.schema !== 'slf_live_parser_state_v2') return null;
        if (String(legacy.gameId || '') !== String(gameId || '')) return null;
        return {
            schema: manualStateSchema,
            gameId: legacy.gameId,
            ts: Number(legacy.ts || Date.now()),
            url: legacy.url || '',
            pendingPresetEvent: cloneForStorage(legacy.pendingPresetEvent || null),
            pendingEffectRetry: !!legacy.pendingEffectRetry,
            consumedPresetEventKey: legacy.consumedPresetEventKey || null,
            manualTacticEventPending: !!legacy.manualTacticEventPending,
            recommendationFreeze: cloneForStorage(legacy.recommendationFreeze || null),
            presetProgression: cloneForStorage(legacy.presetProgression || null),
            lastRecommendationHtml: legacy.lastRecommendationHtml || null,
            lastRecommendationMeta: cloneForStorage(legacy.lastRecommendationMeta || null),
            migratedFrom: legacy.schema || 'slf_live_parser_state_v2'
        };
    }

    const ManualMatchState = {
        getStorageKey(gameId = null) {
            return getStateKey(manualStatePrefix, resolveGameId(gameId));
        },
        load(gameId = null) {
            gameId = resolveGameId(gameId);
            if (!gameId) return null;
            const stored = readStoredState(manualStatePrefix, gameId);
            if (stored?.schema === manualStateSchema) return stored;
            const legacy = readStoredState(legacyStatePrefix, gameId);
            const migrated = normalizeLegacyManualState(legacy, gameId);
            if (!migrated) return null;
            if (typeof localStorage !== 'undefined') {
                try { localStorage.setItem(this.getStorageKey(gameId), JSON.stringify(migrated)); } catch (_) {}
            }
            return readStoredState(manualStatePrefix, gameId) || migrated;
        },
        persist(extra = {}, options = {}) {
            if (typeof localStorage === 'undefined') return null;
            const gameId = resolveGameId(options.gameId);
            if (!gameId) return null;
            const existing = options.existing || readStoredState(manualStatePrefix, gameId) || {};
            const stateValue = (key, fallback = null) => hasOwn(STATE, key)
                ? cloneForStorage(STATE[key])
                : cloneForStorage(existing[key] ?? fallback);
            const pendingPresetEvent = hasOwn(extra, 'pendingPresetEvent')
                ? cloneForStorage(extra.pendingPresetEvent)
                : stateValue('pendingPresetEvent');
            const pendingEventChanged = !!pendingPresetEvent?.eventKey
                && String(pendingPresetEvent.eventKey) !== String(existing.pendingPresetEvent?.eventKey || '');
            const payload = {
                schema: manualStateSchema,
                gameId,
                ts: Date.now(),
                url: typeof location !== 'undefined' ? (location.href || '') : '',
                pendingPresetEvent,
                pendingEffectRetry: hasOwn(extra, 'pendingEffectRetry')
                    ? !!extra.pendingEffectRetry
                    : (pendingEventChanged ? false : !!existing.pendingEffectRetry),
                consumedPresetEventKey: hasOwn(extra, 'consumedPresetEventKey')
                    ? (extra.consumedPresetEventKey || null)
                    : (existing.consumedPresetEventKey || null),
                manualTacticEventPending: hasOwn(extra, 'manualTacticEventPending')
                    ? !!extra.manualTacticEventPending
                    : (pendingPresetEvent ? !!existing.manualTacticEventPending : false),
                recommendationFreeze: stateValue('recommendationFreeze'),
                presetProgression: stateValue('presetProgression'),
                lastRecommendationHtml: stateValue('lastRecommendationHtml'),
                lastRecommendationMeta: stateValue('lastRecommendationMeta'),
                migratedFrom: existing.migratedFrom || null
            };
            try {
                localStorage.setItem(this.getStorageKey(gameId), JSON.stringify(payload));
                return payload;
            } catch (_) { return null; }
        },
        clear(gameId = null) {
            gameId = resolveGameId(gameId);
            if (!gameId || typeof localStorage === 'undefined') return;
            try {
                localStorage.removeItem(this.getStorageKey(gameId));
                localStorage.removeItem(getStateKey(legacyStatePrefix, gameId));
            } catch (_) {}
        }
    };

    SnapshotEngine.manualMatchState = ManualMatchState;
    SnapshotEngine.persistManualState = function persistManualState(extra = {}) { return ManualMatchState.persist(extra); };
    SnapshotEngine.loadManualState = function loadManualState(gameId = null) { return ManualMatchState.load(resolveGameId(gameId)); };
    SnapshotEngine.clearManualState = function clearManualState(gameId = null) { ManualMatchState.clear(resolveGameId(gameId)); };

    function setTransitionSourceHint(source, ttlMs = 5000) {
        STATE.tacticTransitionSourceHint = { source, expiresAt: Date.now() + ttlMs };
    }

    function consumeTransitionSourceHint() {
        const hint = STATE.tacticTransitionSourceHint;
        if (!hint) return null;
        if (Number(hint.expiresAt || 0) < Date.now()) {
            STATE.tacticTransitionSourceHint = null;
            return null;
        }
        STATE.tacticTransitionSourceHint = null;
        return hint.source || null;
    }

    function normalizeTransitionSources(snapshot, hintedSource = null) {
        const transitions = snapshot?.tacticTelemetry?.transitions;
        if (!Array.isArray(transitions)) return snapshot;
        const sourceMap = {
            snapshot_build: 'snapshot_observation',
            match_snapshot: 'snapshot_upload',
            match_result: 'finished_result',
            live_state: 'live_state'
        };
        transitions.forEach((transition, index) => {
            if (!transition || typeof transition !== 'object') return;
            transition.source = sourceMap[transition.source] || transition.source || 'snapshot_observation';
            if (hintedSource && index === transitions.length - 1) transition.source = hintedSource;
        });
        return snapshot;
    }

    function restorePersistedPendingPresetEvent(afterSnapshot) {
        if (STATE.pendingPresetEvent || !afterSnapshot?.gameId) return null;
        if (typeof SnapshotEngine.loadManualState !== 'function') return null;
        const persisted = SnapshotEngine.loadManualState(afterSnapshot.gameId);
        const pending = persisted?.pendingPresetEvent || null;
        if (!pending) return null;
        if (String(pending.gameId || '') !== String(afterSnapshot.gameId || '')) return null;
        STATE.pendingPresetEvent = pending;
        return pending;
    }

    function getDeterministicEffectKey(effect, pending) {
        if (!effect || !pending?.eventKey) return effect?.effectKey;
        return ['preset_effect', effect.gameId || pending.gameId || '', pending.eventKey].join('|');
    }

    const originalBuild = SnapshotEngine.build.bind(SnapshotEngine);
    SnapshotEngine.build = function buildWithNormalizedTransitionSource() {
        const hint = consumeTransitionSourceHint();
        return normalizeTransitionSources(originalBuild(), hint);
    };

    const originalSendMatchResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
    SnapshotEngine.sendMatchResult = function sendFinishedMatchResult(snapshot) {
        if (!snapshot || snapshot.status !== 'finished') {
            const error = new Error('Match result can be sent only after the match is finished');
            error.name = 'SLFMatchStateError';
            error.kind = 'invalid_match_state';
            return Promise.reject(error);
        }
        return originalSendMatchResult(snapshot);
    };

    const originalBuildPresetEffect = EventTracker.buildPresetEffect.bind(EventTracker);
    EventTracker.buildPresetEffect = function buildRecoverablePresetEffect(afterSnapshot) {
        restorePersistedPendingPresetEvent(afterSnapshot);
        const pending = STATE.pendingPresetEvent || null;
        const effect = originalBuildPresetEffect(afterSnapshot);
        if (effect && pending) {
            effect.effectKey = getDeterministicEffectKey(effect, pending);
            Object.defineProperty(effect, pendingEffectEvent, { value: pending, enumerable: false, configurable: false });
        }
        return effect;
    };

    const originalPostAppend = Api.postAppend.bind(Api);
    Api.postAppend = function postAppendWithPendingEffectRecovery(collection, payload, label) {
        const recoverable = collection === CONFIG.COLLECTIONS.PRESET_EFFECTS ? payload?.[pendingEffectEvent] || null : null;
        const request = originalPostAppend(collection, payload, label);
        if (!recoverable) return request;
        return request.then(result => {
            if (!STATE.pendingPresetEvent) {
                SnapshotEngine.persistManualState({ pendingPresetEvent: null, pendingEffectRetry: false, consumedPresetEventKey: recoverable.eventKey || null });
            }
            return result;
        }).catch(error => {
            if (!STATE.pendingPresetEvent) {
                STATE.pendingPresetEvent = recoverable;
                SnapshotEngine.persistManualState({ pendingEffectRetry: true });
            }
            throw error;
        });
    };

    const originalApplyPresetAsync = applyPresetAsync;
    applyPresetAsync = async function applyPresetWithTransitionSource() {
        const result = await originalApplyPresetAsync.apply(this, arguments);
        if (result) setTransitionSourceHint('preset_apply', 10 * 60 * 1000);
        return result;
    };

    function isTacticalInput(element) {
        if (!element?.name || !element.matches('input[type="radio"], input[type="checkbox"]')) return false;
        return tacticalInputNames.has(element.name) || element.name.startsWith('priority_');
    }

    function installManualWatcher() {
        if (STATE.tacticWatcherStarted) return true;
        if (!location.pathname.includes('/game.php') || !document.body) return false;
        const initialSnapshot = SnapshotEngine.build();
        if (!initialSnapshot?.myTeam || initialSnapshot.matchOwnership === 'foreign') return false;
        STATE.tacticWatcherStarted = true;
        STATE.lastManualTactic = getCurrentTactic();
        document.body.addEventListener('change', event => {
            const element = event.target;
            if (!isTacticalInput(element)) return;
            if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) return;
            clearTimeout(STATE.manualChangeTimer);
            STATE.manualChangeTimer = setTimeout(() => {
                if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) return;
                const current = getCurrentTactic();
                const changed = EventTracker.diffTactic(STATE.lastManualTactic, current);
                if (!Object.keys(changed).length) return;
                setTransitionSourceHint('manual_change');
                const snapshot = SnapshotEngine.build();
                if (!snapshot?.myTeam || snapshot.matchOwnership === 'foreign' || snapshot.status === 'finished') {
                    STATE.lastManualTactic = current;
                    return;
                }
                snapshot.ruleDecision = snapshot.ruleDecision || STATE.lastRuleDecision || null;
                const ts = Date.now();
                const generationWindow = snapshot.generationWindow || MatchStateParser.getGenerationWindow(snapshot.minute);
                const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot.minute);
                const eventRecord = {
                    ts,
                    recordType: 'preset_event',
                    schemaVersion: 3,
                    parserVersion: 'manual_tactic_event_generation_v5_telemetry_only',
                    eventKey: ['manual_tactic_event', snapshot.gameId || '', snapshot.minute ?? '', snapshot.bucket || '', ts].join('|'),
                    type: 'manual_change',
                    gameId: snapshot.gameId,
                    minute: snapshot.minute,
                    bucket: snapshot.bucket,
                    generationWindow,
                    targetGenerationWindow,
                    targetBucket: targetGenerationWindow?.label || snapshot.bucket,
                    timingModel: 'generation_windows_v1_last_change_before_next_window',
                    myTeam: snapshot.myTeam,
                    changed,
                    tactic: current,
                    ruleDecision: EventTracker.compactRuleDecision(snapshot.ruleDecision),
                    tacticTelemetry: snapshot.tacticTelemetry || null,
                    beforeSnapshot: snapshot,
                    snapshot,
                    source: { page: 'game', trigger: 'manual_tactic_control', collectedAt: ts, scriptVersion: SLF_VERSION_INFO.scriptVersion }
                };
                STATE.pendingPresetEvent = eventRecord;
                SnapshotEngine.persistManualState({ manualTacticEventPending: true });
                void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, eventRecord, 'manual tactic event history').catch(() => {});
                STATE.lastManualTactic = current;
            }, 500);
        }, true);
        return true;
    }

    function scheduleManualWatcher() {
        if (!location.pathname.includes('/game.php')) return;
        if (installManualWatcher()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (installManualWatcher() || attempts >= 120 || !location.pathname.includes('/game.php')) clearInterval(timer);
        }, 500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleManualWatcher, { once: true });
    else scheduleManualWatcher();
})();

// Tactical telemetry v2: durable match session, canonical phases and bounded automatic capture.
// ============================================================

(function installTacticalTelemetryV2() {
    'use strict';

    if (SnapshotEngine.__tacticalTelemetryV2Installed) return;
    SnapshotEngine.__tacticalTelemetryV2Installed = true;

    const STATE_SCHEMA = 'slf_manual_match_state_v2';
    const STATE_PREFIX = 'slf_manual_match_state_v2';
    const LEGACY_STATE_PREFIX = 'slf_manual_match_state_v1';
    const OUTBOX_LIMIT = 12;
    const MIN_PHASE_MINUTES = 5;
    const MIN_PHASE_COMPLETENESS = 0.55;
    const AUTO_POLL_MS = 15000;
    const TACTIC_KEYS = [
        'def_line', 'press_line', 'def_width', 'press_intense',
        'build_type', 'build_temp', 'build_long', 'build_fast',
        'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot', 'priority'
    ];

    const legacyStateApi = SnapshotEngine.manualMatchState;
    const buildBeforeV2 = SnapshotEngine.build.bind(SnapshotEngine);
    const postAppendBeforeV2 = Api.postAppend.bind(Api);
    const applyPresetBeforeV2 = applyPresetAsync;

    function clone(value) {
        if (value == null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
    }

    function cloneWithSymbols(value) {
        const result = clone(value) || {};
        if (!value || typeof value !== 'object') return result;
        Object.getOwnPropertySymbols(value).forEach(symbol => {
            const descriptor = Object.getOwnPropertyDescriptor(value, symbol);
            if (descriptor) Object.defineProperty(result, symbol, descriptor);
        });
        return result;
    }

    function hasOwn(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    function storageKey(gameId) {
        return `${STATE_PREFIX}:${gameId || 'unknown'}`;
    }

    function legacyStorageKey(gameId) {
        return `${LEGACY_STATE_PREFIX}:${gameId || 'unknown'}`;
    }

    function resolveGameId(gameId = null) {
        if (gameId) return String(gameId);
        return String(typeof MatchStateParser?.getGameId === 'function' ? MatchStateParser.getGameId() || '' : '');
    }

    function readState(gameId) {
        if (!gameId || typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(storageKey(gameId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.schema === STATE_SCHEMA && String(parsed.gameId || '') === String(gameId) ? parsed : null;
        } catch (_) { return null; }
    }

    function migrateState(gameId) {
        if (!gameId) return null;
        const legacy = legacyStateApi?.load?.(gameId) || null;
        if (!legacy) return null;
        return {
            schema: STATE_SCHEMA,
            gameId: String(gameId),
            sessionId: `match-session|${gameId}`,
            ts: Number(legacy.ts || Date.now()),
            url: legacy.url || '',
            phaseSequence: 0,
            openPhase: null,
            lastClosedPhaseId: null,
            pendingPhaseStart: null,
            lastSnapshotKey: null,
            lastAutoSnapshotWindow: null,
            lastObservedScoreState: null,
            lastObservedTacticFingerprint: null,
            lastResultKey: null,
            outbox: [],
            pendingPresetEvent: clone(legacy.pendingPresetEvent || null),
            pendingEffectRetry: !!legacy.pendingEffectRetry,
            consumedPresetEventKey: legacy.consumedPresetEventKey || null,
            manualTacticEventPending: !!legacy.manualTacticEventPending,
            recommendationFreeze: clone(legacy.recommendationFreeze || null),
            presetProgression: clone(legacy.presetProgression || null),
            lastRecommendationHtml: legacy.lastRecommendationHtml || null,
            lastRecommendationMeta: clone(legacy.lastRecommendationMeta || null),
            migratedFrom: legacy.schema || LEGACY_STATE_PREFIX
        };
    }

    function writeState(payload) {
        if (!payload?.gameId || typeof localStorage === 'undefined') return null;
        try {
            localStorage.setItem(storageKey(payload.gameId), JSON.stringify(payload));
            return payload;
        } catch (_) { return null; }
    }

    function getState(gameId = null) {
        gameId = resolveGameId(gameId);
        if (!gameId) return null;
        const stored = readState(gameId);
        if (stored) return stored;
        const migrated = migrateState(gameId) || {
            schema: STATE_SCHEMA,
            gameId,
            sessionId: `match-session|${gameId}`,
            ts: Date.now(),
            url: typeof location !== 'undefined' ? location.href || '' : '',
            phaseSequence: 0,
            openPhase: null,
            lastClosedPhaseId: null,
            pendingPhaseStart: null,
            lastSnapshotKey: null,
            lastAutoSnapshotWindow: null,
            lastObservedScoreState: null,
            lastObservedTacticFingerprint: null,
            lastResultKey: null,
            outbox: [],
            pendingPresetEvent: null,
            pendingEffectRetry: false,
            consumedPresetEventKey: null,
            manualTacticEventPending: false,
            recommendationFreeze: null,
            presetProgression: null,
            lastRecommendationHtml: null,
            lastRecommendationMeta: null,
            migratedFrom: null
        };
        return writeState(migrated) || migrated;
    }

    function persistState(extra = {}, options = {}) {
        const gameId = resolveGameId(options.gameId || extra.gameId || null);
        if (!gameId) return null;
        const existing = options.existing || getState(gameId) || {};
        const payload = Object.assign({}, existing, clone(extra) || {}, {
            schema: STATE_SCHEMA,
            gameId,
            sessionId: existing.sessionId || `match-session|${gameId}`,
            ts: Date.now(),
            url: typeof location !== 'undefined' ? location.href || existing.url || '' : existing.url || ''
        });
        const carryFromRuntime = ['pendingPresetEvent', 'recommendationFreeze', 'presetProgression', 'lastRecommendationHtml', 'lastRecommendationMeta'];
        carryFromRuntime.forEach(key => {
            if (!hasOwn(extra, key) && hasOwn(STATE, key)) payload[key] = clone(STATE[key]);
        });
        if (!Array.isArray(payload.outbox)) payload.outbox = [];
        payload.outbox = payload.outbox.slice(-OUTBOX_LIMIT);
        return writeState(payload);
    }

    const TelemetryState = {
        getStorageKey(gameId = null) { return storageKey(resolveGameId(gameId)); },
        load(gameId = null) { return getState(gameId); },
        persist(extra = {}, options = {}) { return persistState(extra, options); },
        clear(gameId = null) {
            gameId = resolveGameId(gameId);
            if (!gameId || typeof localStorage === 'undefined') return;
            try {
                localStorage.removeItem(storageKey(gameId));
                localStorage.removeItem(legacyStorageKey(gameId));
            } catch (_) {}
            legacyStateApi?.clear?.(gameId);
        }
    };

    SnapshotEngine.manualMatchState = TelemetryState;
    SnapshotEngine.persistManualState = function persistManualStateV2(extra = {}) { return TelemetryState.persist(extra); };
    SnapshotEngine.loadManualState = function loadManualStateV2(gameId = null) { return TelemetryState.load(gameId); };
    SnapshotEngine.clearManualState = function clearManualStateV2(gameId = null) { TelemetryState.clear(gameId); };

    function finite(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizedPriority(value) {
        const list = Array.isArray(value) ? value : value == null ? [] : [value];
        return list.map(item => String(item)).sort();
    }

    function tacticFingerprint(tactic) {
        if (!tactic || typeof tactic !== 'object') return '';
        return TACTIC_KEYS.map(key => {
            const value = key === 'priority' ? normalizedPriority(tactic[key]) : tactic[key] ?? null;
            return `${key}:${JSON.stringify(value)}`;
        }).join('|');
    }

    function canonicalPresetId(snapshot, fallback = null) {
        const observed = snapshot?.tacticTelemetry?.currentPreset;
        if (observed) return String(observed);
        if (fallback) return String(fallback);
        return 'unknown';
    }

    function scoreState(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const myTeam = finite(snapshot?.myTeam);
        const home = finite(snapshot?.score?.home);
        const away = finite(snapshot?.score?.away);
        if (teams.length < 2 || myTeam == null || home == null || away == null) return 'unknown';
        const isHome = finite(teams[0]) === myTeam;
        const mine = isHome ? home : away;
        const opponent = isHome ? away : home;
        return mine > opponent ? 'winning' : mine < opponent ? 'losing' : 'draw';
    }

    function homeAway(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const myTeam = finite(snapshot?.myTeam);
        if (teams.length < 2 || myTeam == null) return 'unknown';
        if (finite(teams[0]) === myTeam) return 'home';
        if (finite(teams[1]) === myTeam) return 'away';
        return 'unknown';
    }

    function teamStats(snapshot, mine = true) {
        const rows = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
        const myTeam = finite(snapshot?.myTeam);
        if (myTeam == null) return null;
        const row = rows.find(item => mine ? finite(item?.teamId) === myTeam : finite(item?.teamId) !== myTeam);
        return row?.stats || null;
    }

    function strengthGap(snapshot) {
        const mine = finite(teamStats(snapshot, true)?.power);
        const opponent = finite(teamStats(snapshot, false)?.power);
        return mine == null || opponent == null ? null : mine - opponent;
    }

    function strengthGapBucket(value) {
        if (value == null) return 'unknown';
        if (value <= -151) return 'much_weaker';
        if (value <= -51) return 'weaker';
        if (value <= 50) return 'even';
        if (value <= 150) return 'stronger';
        return 'much_stronger';
    }

    function generatorVersion(snapshot) {
        const candidates = [
            snapshot?.generatorVersion,
            snapshot?.generatorDetailMetrics?.generatorVersion,
            snapshot?.generatorDetailMetrics?.version,
            snapshot?.generatorExpectedPerformance?.generatorVersion,
            snapshot?.generatorExpectedPerformance?.version
        ];
        const value = candidates.find(item => item != null && String(item).trim());
        return value == null ? 'unknown' : String(value);
    }

    function contextCompleteness(snapshot, presetId) {
        const required = {
            gameId: snapshot?.gameId,
            myTeam: snapshot?.myTeam,
            minute: snapshot?.minute,
            score: snapshot?.score && finite(snapshot.score.home) != null && finite(snapshot.score.away) != null,
            currentTactic: snapshot?.currentTactic && tacticFingerprint(snapshot.currentTactic),
            teamStats: !!teamStats(snapshot, true) && !!teamStats(snapshot, false),
            presetId: presetId && presetId !== 'unknown',
            scriptVersion: typeof SLF_VERSION_INFO !== 'undefined' ? SLF_VERSION_INFO.scriptVersion : null,
            generatorVersion: generatorVersion(snapshot) !== 'unknown'
        };
        const missingFields = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
        return { value: (Object.keys(required).length - missingFields.length) / Object.keys(required).length, missingFields };
    }

    function telemetryContext(snapshot, fallbackPreset = null) {
        const presetId = canonicalPresetId(snapshot, fallbackPreset);
        const gap = strengthGap(snapshot);
        const completeness = contextCompleteness(snapshot, presetId);
        const decision = snapshot?.ruleDecision || STATE.lastRuleDecision || null;
        const riskAppetite = snapshot?.tacticTelemetry?.riskAppetite || decision?.riskAppetite || decision?.action?.riskAppetite || null;
        return {
            schema: 'slf_telemetry_context_v2',
            gameId: String(snapshot?.gameId || ''),
            sessionId: `match-session|${snapshot?.gameId || ''}`,
            scriptVersion: typeof SLF_VERSION_INFO !== 'undefined' ? SLF_VERSION_INFO.scriptVersion : 'unknown',
            generatorVersion: generatorVersion(snapshot),
            libraryVersion: snapshot?.tacticTelemetry?.libraryVersion || null,
            recommendationSchema: snapshot?.tacticTelemetry?.recommendationSchema || decision?.schema || null,
            riskAppetite: riskAppetite || 'unknown',
            myTeam: snapshot?.myTeam ?? null,
            homeAway: homeAway(snapshot),
            minute: snapshot?.minute ?? null,
            generationWindow: clone(snapshot?.generationWindow || null),
            score: clone(snapshot?.score || null),
            scoreState: scoreState(snapshot),
            strengthGap: gap,
            strengthGapBucket: strengthGapBucket(gap),
            presetId,
            tacticFingerprint: tacticFingerprint(snapshot?.currentTactic),
            recommendationPreset: decision?.action?.preset || null,
            explorationApplied: !!decision?.action?.exploration,
            completeness: Number(completeness.value.toFixed(3)),
            missingFields: completeness.missingFields,
            capturedAt: Date.now()
        };
    }

    function compactStats(snapshot) {
        const mine = teamStats(snapshot, true) || {};
        const opponent = teamStats(snapshot, false) || {};
        const pick = source => ({
            xG: finite(source.xG),
            shots: finite(source.shots),
            badActionsPct: finite(source.badActionsPct),
            power: finite(source.power),
            defVector: finite(source.defVector),
            pressVector: finite(source.pressVector)
        });
        return { my: pick(mine), opponent: pick(opponent) };
    }

    function compactSnapshot(snapshot, fallbackPreset = null) {
        const context = telemetryContext(snapshot, fallbackPreset);
        return {
            ts: snapshot?.ts || Date.now(),
            minute: snapshot?.minute ?? null,
            bucket: snapshot?.bucket || null,
            generationWindow: clone(snapshot?.generationWindow || null),
            score: clone(snapshot?.score || null),
            scoreState: context.scoreState,
            homeAway: context.homeAway,
            strengthGap: context.strengthGap,
            strengthGapBucket: context.strengthGapBucket,
            presetId: context.presetId,
            tacticFingerprint: context.tacticFingerprint,
            tactic: clone(snapshot?.currentTactic || null),
            stats: compactStats(snapshot),
            generatorExpectedPerformance: clone(snapshot?.generatorExpectedPerformance || null),
            completeness: context.completeness,
            missingFields: context.missingFields.slice()
        };
    }

    function makePhaseId(gameId, sequence, fingerprint) {
        let hash = 2166136261;
        const text = `${gameId}|${sequence}|${fingerprint}`;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `phase|${gameId}|${sequence}|${(hash >>> 0).toString(16)}`;
    }

    function phaseDelta(start, end) {
        const diff = (a, b) => a == null || b == null ? null : Number((b - a).toFixed(4));
        const startStats = start?.stats || {};
        const endStats = end?.stats || {};
        const myXG = diff(startStats.my?.xG, endStats.my?.xG);
        const oppXG = diff(startStats.opponent?.xG, endStats.opponent?.xG);
        const myShots = diff(startStats.my?.shots, endStats.my?.shots);
        const oppShots = diff(startStats.opponent?.shots, endStats.opponent?.shots);
        return {
            myXG,
            oppXG,
            xGDifference: myXG == null || oppXG == null ? null : Number((myXG - oppXG).toFixed(4)),
            myShots,
            oppShots,
            shotDifference: myShots == null || oppShots == null ? null : Number((myShots - oppShots).toFixed(4)),
            myBadActionsPct: diff(startStats.my?.badActionsPct, endStats.my?.badActionsPct),
            oppBadActionsPct: diff(startStats.opponent?.badActionsPct, endStats.opponent?.badActionsPct),
            myPower: diff(startStats.my?.power, endStats.my?.power),
            oppPower: diff(startStats.opponent?.power, endStats.opponent?.power),
            strengthGap: diff(start?.strengthGap, end?.strengthGap),
            myDefVector: diff(startStats.my?.defVector, endStats.my?.defVector),
            oppDefVector: diff(startStats.opponent?.defVector, endStats.opponent?.defVector),
            myPressVector: diff(startStats.my?.pressVector, endStats.my?.pressVector),
            oppPressVector: diff(startStats.opponent?.pressVector, endStats.opponent?.pressVector)
        };
    }

    function phaseEligibility(phase, endSnapshot) {
        const startMinute = finite(phase?.start?.minute);
        const endMinute = finite(endSnapshot?.minute);
        const duration = startMinute == null || endMinute == null ? null : Math.max(0, endMinute - startMinute);
        const completeness = Math.min(finite(phase?.start?.completeness) ?? 0, finite(endSnapshot?.completeness) ?? 0);
        const reasons = [];
        if (duration == null || duration < MIN_PHASE_MINUTES) reasons.push('phase_too_short');
        if (completeness < MIN_PHASE_COMPLETENESS) reasons.push('insufficient_completeness');
        return { durationMinutes: duration, completeness: Number(completeness.toFixed(3)), eligibleForRanking: reasons.length === 0, reasons };
    }

    function outboxKey(collection, payload) {
        return String(payload?.effectKey || payload?.eventKey || payload?.resultKey || payload?.snapshotKey || `${collection}|${payload?.gameId || ''}|${payload?.ts || ''}`);
    }

    function compactOutboxPayload(collection, payload) {
        const copy = cloneWithSymbols(payload);
        if (collection === CONFIG.COLLECTIONS.MATCH_SNAPSHOTS) {
            delete copy.lineupRows;
            delete copy.shotsTable;
            delete copy.eventsText;
            delete copy.developerHints;
            if (!copy.source) copy.source = {};
            copy.source.outboxCompacted = true;
        }
        return copy;
    }

    function queueOutbox(collection, payload, label, error = null) {
        const gameId = String(payload?.gameId || payload?.telemetryContext?.gameId || resolveGameId());
        if (!gameId) return;
        const state = getState(gameId);
        if (!state) return;
        const key = outboxKey(collection, payload);
        const outbox = Array.isArray(state.outbox) ? state.outbox.slice() : [];
        const existingIndex = outbox.findIndex(item => item?.key === key && item?.collection === collection);
        const item = {
            key,
            collection,
            label: label || 'telemetry retry',
            payload: compactOutboxPayload(collection, payload),
            attempts: existingIndex >= 0 ? Number(outbox[existingIndex].attempts || 0) + 1 : 1,
            firstQueuedAt: existingIndex >= 0 ? outbox[existingIndex].firstQueuedAt : Date.now(),
            lastQueuedAt: Date.now(),
            lastErrorKind: error?.kind || error?.name || 'unknown'
        };
        if (existingIndex >= 0) outbox.splice(existingIndex, 1, item);
        else outbox.push(item);
        persistState({ outbox: outbox.slice(-OUTBOX_LIMIT) }, { gameId, existing: state });
    }

    function removeOutboxItem(gameId, collection, key) {
        const state = getState(gameId);
        if (!state) return;
        const outbox = (state.outbox || []).filter(item => !(item?.collection === collection && item?.key === key));
        if (outbox.length !== (state.outbox || []).length) persistState({ outbox }, { gameId, existing: state });
    }

    function attachCorrelation(collection, payload) {
        if (!payload || typeof payload !== 'object') return payload;
        const gameId = String(payload.gameId || payload.telemetryContext?.gameId || resolveGameId());
        if (!gameId) return payload;
        const state = getState(gameId);
        if (!state) return payload;
        const snapshot = payload.beforeSnapshot || payload.snapshot || payload.before || payload.after || null;
        const fallbackPreset = payload.presetName || payload.tacticTelemetry?.currentPreset || null;
        if (!payload.telemetryContext && snapshot) payload.telemetryContext = telemetryContext(snapshot, fallbackPreset);
        payload.sessionId = payload.sessionId || state.sessionId || `match-session|${gameId}`;

        if (collection === CONFIG.COLLECTIONS.PRESET_EVENTS) {
            const eventFingerprint = tacticFingerprint(payload.tactic || snapshot?.currentTactic);
            let phaseId = state.openPhase?.phaseId || null;
            if (eventFingerprint && eventFingerprint !== state.openPhase?.tacticFingerprint) {
                const sequence = Number(state.phaseSequence || 0) + 1;
                phaseId = makePhaseId(gameId, sequence, eventFingerprint);
                persistState({
                    pendingPhaseStart: {
                        phaseId,
                        sequence,
                        tacticFingerprint: eventFingerprint,
                        presetId: payload.presetName || 'unknown',
                        source: payload.type === 'manual_change' ? 'manual_change' : 'preset_apply'
                    }
                }, { gameId, existing: state });
            }
            payload.phaseId = payload.phaseId || phaseId;
        }
        if (collection === CONFIG.COLLECTIONS.PRESET_EFFECTS) {
            payload.phaseId = payload.phaseId || state.openPhase?.phaseId || state.lastClosedPhaseId || null;
        }
        return payload;
    }

    function compactTelemetryEnvelope(value) {
        if (!value || typeof value !== 'object') return null;
        return {
            schema: value.schema || null,
            libraryVersion: value.libraryVersion || null,
            recommendationSchema: value.recommendationSchema || null,
            riskAppetite: value.riskAppetite || null,
            currentPreset: value.currentPreset || null,
            currentTacticFingerprint: value.currentTacticFingerprint || null,
            initialPreset: value.initialPreset || null,
            transitionCount: Number(value.transitionCount || 0),
            latestDecision: clone(value.latestDecision || null)
        };
    }

    function compactTransportRecord(collection, payload) {
        if (!payload || typeof payload !== 'object') return payload;
        attachCorrelation(collection, payload);
        if (collection === CONFIG.COLLECTIONS.PRESET_EVENTS) {
            const copy = cloneWithSymbols(payload);
            const snapshot = payload.beforeSnapshot || payload.snapshot || null;
            copy.schemaVersion = Math.max(4, Number(copy.schemaVersion || 0));
            copy.parserVersion = copy.type === 'tactical_phase_start' ? 'tactical_phase_start_v4' : 'preset_event_phase_link_v4';
            copy.phaseStart = snapshot ? compactSnapshot(snapshot, copy.presetName || null) : copy.phaseStart || null;
            copy.tacticTelemetry = compactTelemetryEnvelope(payload.tacticTelemetry);
            delete copy.beforeSnapshot;
            delete copy.snapshot;
            return copy;
        }
        if (collection === CONFIG.COLLECTIONS.PRESET_EFFECTS) {
            const copy = cloneWithSymbols(payload);
            copy.schemaVersion = Math.max(4, Number(copy.schemaVersion || 0));
            copy.parserVersion = copy.eventType === 'tactical_phase' ? 'tactical_phase_effect_v4' : 'preset_effect_phase_link_v4';
            copy.phaseStart = copy.phaseStart || (payload.before ? compactSnapshot(payload.before, copy.presetName || null) : null);
            copy.phaseEnd = copy.phaseEnd || (payload.after ? compactSnapshot(payload.after, copy.presetName || null) : null);
            copy.tacticTelemetry = compactTelemetryEnvelope(payload.tacticTelemetry);
            delete copy.before;
            delete copy.after;
            return copy;
        }
        return payload;
    }

    Api.postAppend = function postAppendWithTelemetryOutbox(collection, payload, label) {
        const tracked = [
            CONFIG.COLLECTIONS.MATCH_SNAPSHOTS,
            CONFIG.COLLECTIONS.MATCH_RESULTS,
            CONFIG.COLLECTIONS.PRESET_EVENTS,
            CONFIG.COLLECTIONS.PRESET_EFFECTS
        ].filter(Boolean);
        if (!tracked.includes(collection)) return postAppendBeforeV2(collection, payload, label);
        const transportPayload = compactTransportRecord(collection, payload);
        const gameId = String(transportPayload?.gameId || transportPayload?.telemetryContext?.gameId || resolveGameId());
        const key = outboxKey(collection, transportPayload);
        return postAppendBeforeV2(collection, transportPayload, label).then(result => {
            if (gameId) removeOutboxItem(gameId, collection, key);
            return result;
        }).catch(error => {
            queueOutbox(collection, transportPayload, label, error);
            throw error;
        });
    };

    async function flushOutbox(gameId = null) {
        gameId = resolveGameId(gameId);
        const state = getState(gameId);
        if (!state?.outbox?.length) return { attempted: 0, delivered: 0 };
        let delivered = 0;
        const pending = state.outbox.slice();
        for (const item of pending) {
            try {
                await postAppendBeforeV2(item.collection, item.payload, item.label || 'telemetry retry');
                removeOutboxItem(gameId, item.collection, item.key);
                delivered += 1;
            } catch (error) {
                queueOutbox(item.collection, item.payload, item.label, error);
                break;
            }
        }
        return { attempted: pending.length, delivered };
    }

    function phaseStartEvent(phase, snapshot) {
        return {
            ts: Date.now(),
            recordType: 'preset_event',
            schemaVersion: 4,
            parserVersion: 'tactical_phase_start_v4',
            eventKey: `tactical_phase_event|${phase.gameId}|${phase.phaseId}`,
            type: 'tactical_phase_start',
            eventType: 'tactical_phase_start',
            gameId: phase.gameId,
            sessionId: phase.sessionId,
            phaseId: phase.phaseId,
            phaseSequence: phase.sequence,
            minute: phase.start.minute,
            bucket: phase.start.bucket,
            presetName: phase.presetId,
            tactic: clone(phase.tactic),
            tacticFingerprint: phase.tacticFingerprint,
            transitionSource: phase.source,
            telemetryContext: telemetryContext(snapshot, phase.presetId),
            phaseStart: clone(phase.start),
            source: {
                page: 'game',
                trigger: 'tactical_phase_start',
                collectedAt: Date.now(),
                scriptVersion: typeof SLF_VERSION_INFO !== 'undefined' ? SLF_VERSION_INFO.scriptVersion : 'unknown'
            }
        };
    }

    function startPhase(snapshot, source = 'snapshot_observation') {
        const gameId = String(snapshot?.gameId || resolveGameId());
        if (!gameId || !snapshot?.currentTactic) return null;
        const state = getState(gameId);
        if (!state) return null;
        const fingerprint = tacticFingerprint(snapshot.currentTactic);
        if (!fingerprint) return null;
        const pending = state.pendingPhaseStart;
        const sequence = pending?.tacticFingerprint === fingerprint
            ? Number(pending.sequence || Number(state.phaseSequence || 0) + 1)
            : Number(state.phaseSequence || 0) + 1;
        const presetId = canonicalPresetId(snapshot, pending?.tacticFingerprint === fingerprint ? pending.presetId : null);
        const phaseId = pending?.tacticFingerprint === fingerprint && pending?.phaseId
            ? pending.phaseId
            : makePhaseId(gameId, sequence, fingerprint);
        const phase = {
            schema: 'slf_tactical_phase_v1',
            gameId,
            sessionId: state.sessionId || `match-session|${gameId}`,
            phaseId,
            sequence,
            presetId,
            tacticFingerprint: fingerprint,
            tactic: clone(snapshot.currentTactic),
            source: pending?.tacticFingerprint === fingerprint ? pending.source || source : source,
            startedAt: Date.now(),
            start: compactSnapshot(snapshot, presetId)
        };
        persistState({
            phaseSequence: sequence,
            openPhase: phase,
            pendingPhaseStart: null,
            lastObservedTacticFingerprint: fingerprint,
            lastObservedScoreState: scoreState(snapshot)
        }, { gameId, existing: state });
        void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, phaseStartEvent(phase, snapshot), 'tactical phase start').catch(() => {});
        return phase;
    }

    function buildPhaseEffect(phase, snapshot, reason) {
        const end = compactSnapshot(snapshot, phase.presetId);
        const eligibility = phaseEligibility(phase, end);
        return {
            ts: Date.now(),
            recordType: 'preset_effect',
            schemaVersion: 4,
            parserVersion: 'tactical_phase_effect_v4',
            effectKey: `tactical_phase_effect|${phase.gameId}|${phase.phaseId}`,
            eventType: 'tactical_phase',
            gameId: phase.gameId,
            sessionId: phase.sessionId,
            phaseId: phase.phaseId,
            phaseSequence: phase.sequence,
            presetName: phase.presetId,
            tacticContext: {
                appliedPreset: phase.presetId,
                appliedTactic: clone(phase.tactic),
                tacticFingerprint: phase.tacticFingerprint,
                transitionSource: phase.source,
                closeReason: reason
            },
            telemetryContext: telemetryContext(snapshot, phase.presetId),
            phaseStart: clone(phase.start),
            phaseEnd: end,
            fromMinute: phase.start.minute,
            toMinute: end.minute,
            fromBucket: phase.start.bucket,
            toBucket: end.bucket,
            delta: phaseDelta(phase.start, end),
            eligibility,
            source: {
                page: 'game',
                trigger: `tactical_phase_close:${reason}`,
                collectedAt: Date.now(),
                scriptVersion: typeof SLF_VERSION_INFO !== 'undefined' ? SLF_VERSION_INFO.scriptVersion : 'unknown'
            }
        };
    }

    function closePhase(snapshot, reason = 'tactic_change') {
        const gameId = String(snapshot?.gameId || resolveGameId());
        const state = getState(gameId);
        const phase = state?.openPhase || null;
        if (!state || !phase) return null;
        const effect = buildPhaseEffect(phase, snapshot, reason);
        persistState({ openPhase: null, lastClosedPhaseId: phase.phaseId }, { gameId, existing: state });
        void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EFFECTS, effect, 'tactical phase effect').catch(() => {});
        return effect;
    }

    function reconcilePhase(snapshot) {
        if (!snapshot?.gameId || !snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return { changed: false, phase: null };
        const gameId = String(snapshot.gameId);
        let state = getState(gameId);
        if (!state) return { changed: false, phase: null };
        const fingerprint = tacticFingerprint(snapshot.currentTactic);
        let changed = false;
        let phase = state.openPhase || null;

        if (snapshot.status === 'finished') {
            if (phase) {
                closePhase(snapshot, 'match_finished');
                changed = true;
            }
            return { changed, phase: null };
        }

        if (!fingerprint) return { changed: false, phase };
        if (!phase) {
            phase = startPhase(snapshot, 'initial_observation');
            changed = !!phase;
        } else if (phase.tacticFingerprint !== fingerprint) {
            closePhase(snapshot, 'tactic_change');
            phase = startPhase(snapshot, 'tactic_change');
            changed = true;
        } else {
            const currentPreset = canonicalPresetId(snapshot, phase.presetId);
            if (phase.presetId === 'unknown' && currentPreset !== 'unknown') {
                phase.presetId = currentPreset;
                persistState({ openPhase: phase }, { gameId, existing: getState(gameId) });
            }
        }
        state = getState(gameId);
        return { changed, phase: state?.openPhase || phase };
    }

    function maybeScheduleAutoCapture(snapshot, phaseChanged) {
        if (!snapshot?.gameId || !snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return;
        const state = getState(snapshot.gameId);
        if (!state) return;
        const windowKey = String(snapshot?.generationWindow?.index ?? snapshot?.bucket ?? 'unknown');
        const stateNow = scoreState(snapshot);
        const fingerprint = tacticFingerprint(snapshot.currentTactic);
        let trigger = null;
        if (!state.lastSnapshotKey) trigger = 'initial';
        else if (phaseChanged || (fingerprint && fingerprint !== state.lastObservedTacticFingerprint)) trigger = 'tactic_change';
        else if (state.lastObservedScoreState && stateNow !== 'unknown' && stateNow !== state.lastObservedScoreState) trigger = 'score_state_change';
        else if (state.lastAutoSnapshotWindow && windowKey !== state.lastAutoSnapshotWindow) trigger = 'generation_window';
        else if (snapshot.status === 'finished') trigger = 'finished';

        persistState({
            lastObservedScoreState: stateNow,
            lastObservedTacticFingerprint: fingerprint || state.lastObservedTacticFingerprint
        }, { gameId: snapshot.gameId, existing: getState(snapshot.gameId) });

        if (!trigger) return;
        setTimeout(() => {
            void captureSnapshot(snapshot, trigger).catch(() => {});
        }, 0);
    }

    SnapshotEngine.build = function buildWithTacticalPhaseV2() {
        const snapshot = buildBeforeV2();
        if (!snapshot || !location.pathname.includes('/game.php')) return snapshot;
        if (!snapshot.myTeam || snapshot.matchOwnership === 'foreign') return snapshot;
        const phaseResult = reconcilePhase(snapshot);
        const state = getState(snapshot.gameId);
        const context = telemetryContext(snapshot, state?.openPhase?.presetId || null);
        snapshot.telemetryContext = context;
        snapshot.tacticalPhase = state?.openPhase ? {
            schema: 'slf_tactical_phase_ref_v1',
            sessionId: state.openPhase.sessionId,
            phaseId: state.openPhase.phaseId,
            sequence: state.openPhase.sequence,
            presetId: state.openPhase.presetId,
            tacticFingerprint: state.openPhase.tacticFingerprint,
            startedAt: state.openPhase.startedAt
        } : null;
        maybeScheduleAutoCapture(snapshot, phaseResult.changed);
        return snapshot;
    };

    async function captureSnapshot(snapshot, trigger) {
        if (!snapshot?.gameId || !snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return null;
        const state = getState(snapshot.gameId);
        if (!state) return null;
        if (snapshot.status === 'finished') return captureFinishedResult(snapshot, trigger);
        const record = SnapshotEngine.buildSnapshotRecord(snapshot);
        record.telemetryContext = record.telemetryContext || telemetryContext(snapshot, state.openPhase?.presetId || null);
        record.tacticalPhase = clone(snapshot.tacticalPhase || null);
        record.source = Object.assign({}, record.source || {}, {
            trigger: `auto_telemetry_v2:${trigger}`,
            automatic: true,
            playerObservationsIncluded: false
        });
        const windowKey = String(snapshot?.generationWindow?.index ?? snapshot?.bucket ?? 'unknown');
        await Api.postAppend(CONFIG.COLLECTIONS.MATCH_SNAPSHOTS, record, 'automatic tactical snapshot');
        persistState({
            lastSnapshotKey: record.snapshotKey || `${snapshot.gameId}|${snapshot.minute}|${snapshot.bucket}`,
            lastAutoSnapshotWindow: windowKey,
            lastObservedScoreState: scoreState(snapshot),
            lastObservedTacticFingerprint: tacticFingerprint(snapshot.currentTactic)
        }, { gameId: snapshot.gameId, existing: getState(snapshot.gameId) });
        return record;
    }

    async function captureFinishedResult(snapshot, trigger = 'finished') {
        if (!snapshot?.gameId || !snapshot?.myTeam || snapshot.matchOwnership === 'foreign' || snapshot.status !== 'finished') return null;
        const state = getState(snapshot.gameId);
        if (!state) return null;
        const resultKey = SnapshotEngine.buildResultKey ? SnapshotEngine.buildResultKey(snapshot) : `match_result|${snapshot.gameId}|finished`;
        if (state.lastResultKey === resultKey) return null;
        try {
            const result = await SnapshotEngine.sendMatchResult(snapshot);
            persistState({ lastResultKey: resultKey }, { gameId: snapshot.gameId, existing: getState(snapshot.gameId) });
            return result;
        } catch (error) {
            const updated = getState(snapshot.gameId);
            if (updated?.outbox?.some(item => item.key === resultKey)) {
                persistState({ lastResultKey: resultKey }, { gameId: snapshot.gameId, existing: updated });
            }
            throw error;
        }
    }

    applyPresetAsync = async function applyPresetWithTacticalPhaseV2() {
        const result = await applyPresetBeforeV2.apply(this, arguments);
        if (result && location.pathname.includes('/game.php')) {
            setTimeout(() => {
                try { SnapshotEngine.build(); } catch (_) {}
            }, 0);
        }
        return result;
    };

    async function pollAutomaticTelemetry() {
        if (!location.pathname.includes('/game.php')) return false;
        let snapshot;
        try { snapshot = SnapshotEngine.build(); } catch (_) { return false; }
        if (!snapshot?.myTeam || snapshot.matchOwnership === 'foreign') return false;
        if (snapshot.status === 'finished') {
            try { await captureFinishedResult(snapshot, 'poll_finished'); } catch (_) {}
            return true;
        }
        try { await flushOutbox(snapshot.gameId); } catch (_) {}
        return true;
    }

    function scheduleAutomaticTelemetry() {
        if (!location.pathname.includes('/game.php')) return;
        let attempts = 0;
        const bootstrap = setInterval(() => {
            attempts += 1;
            void pollAutomaticTelemetry().then(started => {
                if (!started && attempts < 120 && location.pathname.includes('/game.php')) return;
                clearInterval(bootstrap);
                if (!started || !location.pathname.includes('/game.php')) return;
                if (STATE.telemetryV2PollTimer) clearInterval(STATE.telemetryV2PollTimer);
                STATE.telemetryV2PollTimer = setInterval(() => { void pollAutomaticTelemetry(); }, AUTO_POLL_MS);
            });
        }, 1000);
        void pollAutomaticTelemetry().then(started => {
            if (!started) return;
            clearInterval(bootstrap);
            if (STATE.telemetryV2PollTimer) clearInterval(STATE.telemetryV2PollTimer);
            STATE.telemetryV2PollTimer = setInterval(() => { void pollAutomaticTelemetry(); }, AUTO_POLL_MS);
        });
    }

    SnapshotEngine.telemetryV2 = {
        schema: 'slf_tactical_telemetry_runtime_v2',
        stateSchema: STATE_SCHEMA,
        tacticFingerprint,
        scoreState,
        telemetryContext,
        compactSnapshot,
        reconcilePhase,
        closePhase,
        captureSnapshot,
        captureFinishedResult,
        flushOutbox,
        getState
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleAutomaticTelemetry, { once: true });
    else scheduleAutomaticTelemetry();
})();

// ============================================================
