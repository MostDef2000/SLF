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
    const originalPersistLiveState = typeof SnapshotEngine.persistLiveState === 'function'
        ? SnapshotEngine.persistLiveState.bind(SnapshotEngine)
        : null;
    const originalLoadLiveState = typeof SnapshotEngine.loadLiveState === 'function'
        ? SnapshotEngine.loadLiveState.bind(SnapshotEngine)
        : null;
    const originalClearLiveState = typeof SnapshotEngine.clearLiveState === 'function'
        ? SnapshotEngine.clearLiveState.bind(SnapshotEngine)
        : null;
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
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return null;
        }
    }

    function resolveGameId(gameId = null) {
        if (gameId) return gameId;
        return typeof MatchStateParser?.getGameId === 'function'
            ? MatchStateParser.getGameId()
            : null;
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
        } catch (_) {
            return null;
        }
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

        load(gameId = null, legacyState = null) {
            gameId = resolveGameId(gameId);
            if (!gameId) return null;

            const stored = readStoredState(manualStatePrefix, gameId);
            if (stored?.schema === manualStateSchema) return stored;

            const legacy = legacyState || readStoredState(legacyStatePrefix, gameId);
            const migrated = normalizeLegacyManualState(legacy, gameId);
            if (!migrated) return null;

            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(this.getStorageKey(gameId), JSON.stringify(migrated));
                } catch (_) {}
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
            } catch (_) {
                return null;
            }
        },

        clear(gameId = null) {
            gameId = resolveGameId(gameId);
            if (!gameId || typeof localStorage === 'undefined') return;
            try {
                localStorage.removeItem(this.getStorageKey(gameId));
            } catch (_) {}
        }
    };

    SnapshotEngine.manualMatchState = ManualMatchState;
    SnapshotEngine.persistManualState = function persistManualState(extra = {}) {
        if (originalPersistLiveState) originalPersistLiveState(extra);
        return ManualMatchState.persist(extra);
    };
    SnapshotEngine.loadManualState = function loadManualState(gameId = null) {
        gameId = resolveGameId(gameId);
        const legacy = originalLoadLiveState ? originalLoadLiveState(gameId) : null;
        return ManualMatchState.load(gameId, legacy);
    };
    SnapshotEngine.clearManualState = function clearManualState(gameId = null) {
        gameId = resolveGameId(gameId);
        if (originalClearLiveState) originalClearLiveState(gameId);
        ManualMatchState.clear(gameId);
    };

    SnapshotEngine.persistLiveState = function persistLiveStateCompatibilityBridge(extra = {}) {
        return SnapshotEngine.persistManualState(extra);
    };
    SnapshotEngine.loadLiveState = function loadLiveStateCompatibilityBridge(gameId = null) {
        gameId = resolveGameId(gameId);
        const legacy = originalLoadLiveState ? originalLoadLiveState(gameId) : null;
        const manual = ManualMatchState.load(gameId, legacy);
        if (!manual) return legacy;
        if (!legacy) return manual;

        return Object.assign({}, legacy, manual, {
            schema: legacy.schema || manual.schema,
            active: !!legacy.active,
            gameId: manual.gameId || legacy.gameId
        });
    };
    SnapshotEngine.clearLiveState = function clearLiveStateCompatibilityBridge(gameId = null) {
        gameId = resolveGameId(gameId);
        SnapshotEngine.clearManualState(gameId);
    };

    function setTransitionSourceHint(source, ttlMs = 5000) {
        STATE.tacticTransitionSourceHint = {
            source,
            expiresAt: Date.now() + ttlMs
        };
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
        return [
            'preset_effect',
            effect.gameId || pending.gameId || '',
            pending.eventKey
        ].join('|');
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
            Object.defineProperty(effect, pendingEffectEvent, {
                value: pending,
                enumerable: false,
                configurable: false
            });
        }
        return effect;
    };

    const originalPostAppend = Api.postAppend.bind(Api);
    Api.postAppend = function postAppendWithPendingEffectRecovery(collection, payload, label) {
        const recoverable = collection === CONFIG.COLLECTIONS.PRESET_EFFECTS
            ? payload?.[pendingEffectEvent] || null
            : null;
        const request = originalPostAppend(collection, payload, label);
        if (!recoverable) return request;

        return request.then(result => {
            if (!STATE.pendingPresetEvent) {
                SnapshotEngine.persistManualState({
                    active: !!STATE.liveParserTimer,
                    pendingPresetEvent: null,
                    pendingEffectRetry: false,
                    consumedPresetEventKey: recoverable.eventKey || null
                });
            }
            return result;
        }).catch(error => {
            if (!STATE.pendingPresetEvent) {
                STATE.pendingPresetEvent = recoverable;
                SnapshotEngine.persistManualState({
                    active: !!STATE.liveParserTimer,
                    pendingEffectRetry: true
                });
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
                    source: {
                        page: 'game',
                        trigger: 'manual_tactic_control',
                        collectedAt: ts,
                        scriptVersion: SLF_VERSION_INFO.scriptVersion
                    }
                };

                STATE.pendingPresetEvent = eventRecord;
                SnapshotEngine.persistManualState({
                    active: !!STATE.liveParserTimer,
                    manualTacticEventPending: true
                });
                void Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, eventRecord, 'manual tactic event history')
                    .catch(() => {});
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
            if (installManualWatcher() || attempts >= 120 || !location.pathname.includes('/game.php')) {
                clearInterval(timer);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleManualWatcher, { once: true });
    } else {
        scheduleManualWatcher();
    }
})();

// ============================================================
