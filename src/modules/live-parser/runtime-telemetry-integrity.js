// Runtime telemetry integrity and result submission guards
// ============================================================

(function installRuntimeTelemetryIntegrity() {
    'use strict';

    if (SnapshotEngine.__runtimeTelemetryIntegrityInstalled) return;
    SnapshotEngine.__runtimeTelemetryIntegrityInstalled = true;

    const pendingEffectEvent = Symbol('slfPendingEffectEvent');
    const tacticalInputNames = new Set([
        'def_line', 'press_line', 'def_width', 'press_intense',
        'build_type', 'build_temp', 'build_long', 'build_fast',
        'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
    ]);

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
        const pending = STATE.pendingPresetEvent || null;
        const effect = originalBuildPresetEffect(afterSnapshot);
        if (effect && pending) {
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
        return originalPostAppend(collection, payload, label).catch(error => {
            if (
                recoverable &&
                (!STATE.pendingPresetEvent || String(STATE.pendingPresetEvent.gameId || '') === String(recoverable.gameId || ''))
            ) {
                STATE.pendingPresetEvent = recoverable;
                SnapshotEngine.persistLiveState({
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
                SnapshotEngine.persistLiveState({
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
