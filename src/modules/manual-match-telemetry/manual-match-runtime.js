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
            tacticalLab: cloneForStorage(legacy.tacticalLab || null),
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
                tacticalLab: hasOwn(extra, 'tacticalLab')
                    ? cloneForStorage(extra.tacticalLab)
                    : cloneForStorage(existing.tacticalLab || null),
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
            STATE.manualChangeTimer = setTimeout(async () => {
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
                if (STATE.tacticalLabRuntime?.isActive?.()) {
                    try {
                        await STATE.tacticalLabRuntime.closeActive('user_selected_manual', snapshot, {
                            nextTacticSource: 'manual',
                            nextTacticFingerprint: snapshot?.tacticTelemetry?.currentTacticFingerprint || null
                        });
                    } catch (_) {}
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

// Tactical Lab v1: blind black-box challenger assignment and telemetry.
// Experiments are intentionally separate from the production preset registry.
(function installTacticalLabV1() {
    'use strict';

    if (STATE.tacticalLabRuntime?.schema === 'slf_tactical_lab_runtime_v1') return;

    const POPULATION_VERSION = 'slf_tactical_lab_561_p01';
    const POPULATION_CODE = 'P01';
    const GENOME_VERSION = 'slf_tactical_genome_v1';
    const POPULATION_SIZE = 64;
    const PANEL_ID = 'slf-tactical-lab-panel';
    const BUTTON_ID = 'slf-tactical-lab-apply';
    const STATUS_ID = 'slf-tactical-lab-status';
    const DETAIL_ID = 'slf-tactical-lab-detail';
    const MAX_OUTBOX = 8;
    const productionIds = [
        'Arteta_Control433_bal3','Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Compact_Counter_def3',
        'Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4','Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'
    ];
    const seedPresets = {
        Arteta_Control433_bal3:{def_line:'2',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'2',build_long:'1',build_fast:'2',style:'3',pass_risk:'3',dribble:'2',cross:'2',corner:'1',shot:'2',priority:[]},
        Pep_BoxControl_bal2:{def_line:'2',press_line:'2',def_width:'2',press_intense:'2',build_type:'2',build_temp:'1',build_long:'1',build_fast:'2',style:'3',pass_risk:'2',dribble:'2',cross:'1',corner:'1',shot:'2',priority:[]},
        Pep_PressCooldown_bal2:{def_line:'1',press_line:'2',def_width:'3',press_intense:'1',build_type:'1',build_temp:'2',build_long:'4',build_fast:'2',style:'2',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[]},
        Compact_Counter_def3:{def_line:'1',press_line:'1',def_width:'2',press_intense:'2',build_type:'1',build_temp:'3',build_long:'4',build_fast:'4',style:'3',pass_risk:'2',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[]},
        Pep_ControlledPush_att3:{def_line:'3',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'3',build_long:'1',build_fast:'4',style:'4',pass_risk:'4',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[]},
        Pep_TwoThreeFive_att3:{def_line:'4',press_line:'4',def_width:'4',press_intense:'4',build_type:'2',build_temp:'2',build_long:'1',build_fast:'3',style:'5',pass_risk:'4',dribble:'3',cross:'2',corner:'1',shot:'4',priority:[]},
        Conte_WingbackWidth_bal4:{def_line:'2',press_line:'2',def_width:'5',press_intense:'3',build_type:'3',build_temp:'2',build_long:'3',build_fast:'3',style:'4',pass_risk:'3',dribble:'4',cross:'5',corner:'1',shot:'2',priority:['left','right']},
        Klopp_Gegenpress_att4:{def_line:'4',press_line:'5',def_width:'3',press_intense:'5',build_type:'3',build_temp:'3',build_long:'2',build_fast:'5',style:'5',pass_risk:'4',dribble:'4',cross:'3',corner:'1',shot:'4',priority:[]},
        Simeone_Compact442_def4:{def_line:'1',press_line:'2',def_width:'1',press_intense:'4',build_type:'1',build_temp:'1',build_long:'3',build_fast:'2',style:'1',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[]},
        Simeone_LowBlock_def5:{def_line:'1',press_line:'1',def_width:'1',press_intense:'1',build_type:'1',build_temp:'1',build_long:'5',build_fast:'2',style:'1',pass_risk:'1',dribble:'1',cross:'1',corner:'1',shot:'1',priority:[]},
        Bielsa_ChaosPress_att5:{def_line:'5',press_line:'5',def_width:'5',press_intense:'5',build_type:'3',build_temp:'3',build_long:'4',build_fast:'5',style:'5',pass_risk:'5',dribble:'5',cross:'5',corner:'1',shot:'5',priority:[]}
    };
    const seedFormations = {
        Arteta_Control433_bal3:['gk','ld','cd1','cd3','rd','cm1','dm2','cm3','lw','st2','rw'],
        Pep_BoxControl_bal2:['gk','ld','cd1','cd3','rd','dm2','cm1','cm3','am1','am2','st2'],
        Pep_PressCooldown_bal2:['gk','ld','cd1','cd3','rd','dm2','lm','cm2','cm3','rm','st2'],
        Compact_Counter_def3:['gk','ld','cd1','cd3','rd','lm','dm2','cm2','rm','am2','st2'],
        Pep_ControlledPush_att3:['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am2','rw','st2'],
        Pep_TwoThreeFive_att3:['gk','cd1','cd2','cd3','dm2','cm2','lw','am1','st1','am2','rw'],
        Conte_WingbackWidth_bal4:['gk','cd1','cd2','cd3','lb','dm2','cm2','rb','lw','st2','rw'],
        Klopp_Gegenpress_att4:['gk','ld','cd1','cd3','rd','dm2','cm2','lw','st1','st2','rw'],
        Simeone_Compact442_def4:['gk','ld','cd1','cd3','rd','lm','cm2','dm2','rm','st1','st2'],
        Simeone_LowBlock_def5:['gk','lb','cd1','cd2','cd3','rb','lm','dm2','cm2','rm','st2'],
        Bielsa_ChaosPress_att5:['gk','cd1','cd2','cd3','lm','dm2','rm','lw','st1','st2','rw']
    };
    const ranges = {
        def_line:['1','2','3','4','5'], press_line:['1','2','3','4','5'], def_width:['1','2','3','4','5'], press_intense:['1','2','3','4','5'],
        build_type:['1','2','3'], build_temp:['1','2','3'], build_long:['1','2','3','4','5'], build_fast:['1','2','3','4','5'],
        style:['1','2','3','4','5'], pass_risk:['1','2','3','4','5'], dribble:['1','2','3','4','5'], cross:['1','2','3','4','5'],
        corner:['1'], shot:['1','2','3','4','5']
    };
    const controlKeys = Object.keys(ranges);
    let cachedState = null;
    let cachedGameId = '';
    let flushPromise = null;
    let uiTimer = null;

    const clone = value => {
        if (value == null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
    };
    const hash32 = text => {
        let value = 2166136261;
        const input = String(text || '');
        for (let index = 0; index < input.length; index += 1) {
            value ^= input.charCodeAt(index);
            value = Math.imul(value, 16777619);
        }
        return value >>> 0;
    };
    const hashHex = text => hash32(text).toString(16).padStart(8, '0');
    const makeRng = seed => {
        let state = hash32(seed) || 0x9e3779b9;
        return () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
    };
    const normalizePriority = value => (Array.isArray(value) ? value : value ? [value] : []).map(String).sort();
    const tacticFingerprint = tactic => controlKeys.concat(['priority'])
        .map(key => `${key}:${JSON.stringify(key === 'priority' ? normalizePriority(tactic?.[key]) : String(tactic?.[key] ?? ''))}`)
        .join('|');
    const genomeFingerprint = (controls, formation) => `tlab1-${hashHex(`${tacticFingerprint(controls)}|formation:${(formation || []).join(',')}`)}`;
    const mutationDistance = (before, after) => {
        const keys = controlKeys.concat(['priority']);
        const changed = keys.filter(key => JSON.stringify(key === 'priority' ? normalizePriority(before?.[key]) : before?.[key]) !== JSON.stringify(key === 'priority' ? normalizePriority(after?.[key]) : after?.[key])).length;
        return Number((changed / keys.length).toFixed(3));
    };
    const priorityFor = index => {
        const options = [[],['left'],['center'],['right'],['left','right'],['left','center'],['center','right']];
        return options[index % options.length].slice();
    };
    const makeExperiment = (index, origin, controls, formation, parentExperimentId = null, distance = null) => ({
        experimentId: `EXP-561-P01-${String(index + 1).padStart(4, '0')}`,
        populationVersion: POPULATION_VERSION,
        generation: 1,
        genomeVersion: GENOME_VERSION,
        origin,
        parentExperimentId,
        mutationDistance: distance,
        controls: clone(controls),
        formation: clone(formation),
        tacticFingerprint: tacticFingerprint(controls),
        genomeFingerprint: genomeFingerprint(controls, formation)
    });

    function buildPopulation() {
        const result = [];
        const mutableKeys = controlKeys.filter(key => key !== 'corner');

        for (let index = 0; index < 16; index += 1) {
            const seedId = productionIds[index % productionIds.length];
            const controls = clone(seedPresets[seedId]);
            for (let step = 0; step < 3; step += 1) {
                const key = mutableKeys[(index * 3 + step * 5) % mutableKeys.length];
                const values = ranges[key];
                const currentIndex = Math.max(0, values.indexOf(String(controls[key])));
                const shift = ((index + step) % 2 === 0 ? 1 : -1);
                controls[key] = values[(currentIndex + shift + values.length) % values.length];
            }
            if (index % 4 === 3) controls.priority = priorityFor(index);
            result.push(makeExperiment(index, 'production_mutation', controls, seedFormations[seedId], seedId, mutationDistance(seedPresets[seedId], controls)));
        }

        for (let local = 0; local < 16; local += 1) {
            const index = 16 + local;
            const controls = {};
            controlKeys.forEach((key, keyIndex) => {
                const values = ranges[key];
                controls[key] = values[(local * 2 + keyIndex * 3) % values.length];
            });
            controls.priority = priorityFor(local + 2);
            const seedId = productionIds[(local * 5 + 2) % productionIds.length];
            result.push(makeExperiment(index, 'orthogonal', controls, seedFormations[seedId], null, 1));
        }

        for (let local = 0; local < 16; local += 1) {
            const index = 32 + local;
            const rng = makeRng(`${POPULATION_VERSION}|random|${local}`);
            const controls = {};
            controlKeys.forEach(key => {
                const values = ranges[key];
                controls[key] = values[Math.floor(rng() * values.length) % values.length];
            });
            controls.priority = priorityFor(Math.floor(rng() * 100));
            const seedId = productionIds[Math.floor(rng() * productionIds.length) % productionIds.length];
            result.push(makeExperiment(index, 'deterministic_random', controls, seedFormations[seedId], null, 1));
        }

        for (let local = 0; local < 16; local += 1) {
            const index = 48 + local;
            const controls = {};
            controlKeys.forEach((key, keyIndex) => {
                const values = ranges[key];
                if (values.length === 1) controls[key] = values[0];
                else controls[key] = ((local + keyIndex) % 2 === 0) ? values[0] : values[values.length - 1];
            });
            controls.priority = priorityFor(local + 4);
            const seedId = productionIds[(local * 7 + 1) % productionIds.length];
            result.push(makeExperiment(index, 'extreme', controls, seedFormations[seedId], null, 1));
        }

        return result;
    }

    const population = buildPopulation();
    const populationById = new Map(population.map(item => [item.experimentId, item]));

    function getGameId(snapshot = null) {
        return String(snapshot?.gameId || MatchStateParser.getGameId() || '');
    }

    function isOwned(snapshot) {
        return !!snapshot?.gameId && !!snapshot?.myTeam && snapshot.matchOwnership !== 'foreign';
    }

    function emptyState(gameId) {
        return {
            schema: 'slf_tactical_lab_state_v1',
            gameId,
            populationVersion: POPULATION_VERSION,
            assignment: null,
            assignmentRecorded: false,
            activation: null,
            completed: null,
            outbox: [],
            lastError: null
        };
    }

    function loadState(gameId) {
        gameId = String(gameId || '');
        if (!gameId) return null;
        if (cachedState && cachedGameId === gameId) return cachedState;
        const stored = SnapshotEngine.loadManualState?.(gameId)?.tacticalLab || null;
        const state = stored && stored.schema === 'slf_tactical_lab_state_v1' && String(stored.gameId || '') === gameId
            ? stored
            : emptyState(gameId);
        state.outbox = Array.isArray(state.outbox) ? state.outbox.slice(-MAX_OUTBOX) : [];
        cachedGameId = gameId;
        cachedState = state;
        return state;
    }

    function persistState(state) {
        if (!state?.gameId) return null;
        cachedGameId = String(state.gameId);
        cachedState = state;
        return SnapshotEngine.persistManualState?.({ tacticalLab: state }) || null;
    }

    function recordKey(record) {
        return String(record?.eventKey || record?.effectKey || '');
    }

    function queueRecord(state, collection, record, label) {
        const key = recordKey(record);
        if (!state || !key) return;
        const current = Array.isArray(state.outbox) ? state.outbox : [];
        state.outbox = current.filter(item => item?.key !== key);
        state.outbox.push({ key, collection, label, record: clone(record), queuedAt: Date.now() });
        state.outbox = state.outbox.slice(-MAX_OUTBOX);
        persistState(state);
        void flushOutbox(state);
    }

    async function flushOutbox(state) {
        if (flushPromise || !state?.outbox?.length) return flushPromise;
        flushPromise = (async () => {
            const pending = state.outbox.slice();
            for (const item of pending) {
                try {
                    await Api.postAppend(item.collection, item.record, item.label || 'tactical lab telemetry');
                    state.outbox = state.outbox.filter(row => row?.key !== item.key);
                    persistState(state);
                } catch (_) {
                    break;
                }
            }
        })().finally(() => { flushPromise = null; });
        return flushPromise;
    }

    function selectExperiment(gameId) {
        const index = hash32(`${POPULATION_VERSION}|${gameId}`) % population.length;
        return population[index];
    }

    function buildAssignment(gameId) {
        const experiment = selectExperiment(gameId);
        return {
            assignmentId: `tactical_lab_assignment|${gameId}|${experiment.experimentId}`,
            experimentId: experiment.experimentId,
            populationVersion: POPULATION_VERSION,
            genomeFingerprint: experiment.genomeFingerprint,
            assignedAt: Date.now()
        };
    }

    function scoreContext(snapshot) {
        const score = snapshot?.score || {};
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        const isHome = Number(teams[0]) === Number(snapshot?.myTeam);
        const home = Number(score.home);
        const away = Number(score.away);
        if (!Number.isFinite(home) || !Number.isFinite(away) || !snapshot?.myTeam) {
            return { scoreState:'unknown', scoreDiff:null, homeAway: snapshot?.myTeam ? (isHome ? 'home' : 'away') : 'unknown' };
        }
        const myGoals = isHome ? home : away;
        const oppGoals = isHome ? away : home;
        return {
            scoreState: myGoals > oppGoals ? 'winning' : myGoals < oppGoals ? 'losing' : 'draw',
            scoreDiff: myGoals - oppGoals,
            homeAway: isHome ? 'home' : 'away'
        };
    }

    function teamStats(snapshot, own = true) {
        if (!snapshot?.myTeam || !Array.isArray(snapshot?.stats)) return null;
        const row = snapshot.stats.find(item => own
            ? Number(item?.teamId) === Number(snapshot.myTeam)
            : Number(item?.teamId) !== Number(snapshot.myTeam));
        return row?.stats || null;
    }

    function buildMetrics(snapshot) {
        const my = teamStats(snapshot, true) || {};
        const opp = teamStats(snapshot, false) || {};
        const xt = typeof RecommendationEngine !== 'undefined' && RecommendationEngine?.getXTForMyTeam
            ? RecommendationEngine.getXTForMyTeam(snapshot)
            : { myXT:0, oppXT:0 };
        return {
            myXG:Number(my.xG || 0), oppXG:Number(opp.xG || 0),
            myShots:Number(my.shots || 0), oppShots:Number(opp.shots || 0),
            myBadActionsPct:Number(my.badActionsPct || 0), oppBadActionsPct:Number(opp.badActionsPct || 0),
            myPower:Number(my.power || 0), oppPower:Number(opp.power || 0),
            myDefVector:Number(my.defVector || 0), oppDefVector:Number(opp.defVector || 0),
            myPressVector:Number(my.pressVector || 0), oppPressVector:Number(opp.pressVector || 0),
            myXT:Number(xt?.myXT || 0), oppXT:Number(xt?.oppXT || 0)
        };
    }

    function metricDelta(before, after) {
        const delta = {};
        Object.keys(before || {}).forEach(key => { delta[key] = Number((Number(after?.[key] || 0) - Number(before?.[key] || 0)).toFixed(4)); });
        return delta;
    }

    function compactRecommendation(snapshot) {
        const raw = snapshot?.ruleDecision || STATE.lastRuleDecision || null;
        const compact = EventTracker.compactRuleDecision(raw);
        const candidates = Array.isArray(raw?.candidates) ? raw.candidates.filter(item => !item?.vetoed) : [];
        const runnerUp = raw?.runnerUp || candidates.find(item => item?.preset && item.preset !== raw?.action?.preset) || null;
        return compact ? {
            presetId: compact.action?.preset || null,
            situationKey: raw?.situationKey || compact.action?.decision || null,
            confidence: clone(raw?.confidence || compact.confidence || null),
            runnerUp: runnerUp ? { preset:runnerUp.preset || null, score:Number(runnerUp.score || 0) } : null,
            margin: Number(raw?.margin ?? compact.margin ?? 0),
            riskAppetite: compact.riskAppetite || compact.action?.riskAppetite || null
        } : null;
    }

    function strengthBucket(gap) {
        if (!Number.isFinite(gap)) return 'unknown';
        if (gap <= -10) return 'much_weaker';
        if (gap < -3) return 'weaker';
        if (gap <= 3) return 'even';
        if (gap < 10) return 'stronger';
        return 'much_stronger';
    }

    function buildContext(snapshot) {
        const my = teamStats(snapshot, true) || {};
        const opp = teamStats(snapshot, false) || {};
        const score = scoreContext(snapshot);
        const gap = Number(my.power || 0) - Number(opp.power || 0);
        const decision = snapshot?.ruleDecision || STATE.lastRuleDecision || null;
        const decisionContext = decision?.moment?.context || {};
        const transitions = Array.isArray(snapshot?.tacticTelemetry?.transitions) ? snapshot.tacticTelemetry.transitions : [];
        const latestTransition = transitions.length ? transitions[transitions.length - 1] : null;
        const currentFingerprint = snapshot?.tacticTelemetry?.currentTacticFingerprint || tacticFingerprint(snapshot?.currentTactic || {});
        const currentPreset = snapshot?.tacticTelemetry?.currentPreset || null;
        const minute = Number.isFinite(Number(snapshot?.minute)) ? Number(snapshot.minute) : null;
        const transitionMinute = Number.isFinite(Number(latestTransition?.minute)) ? Number(latestTransition.minute) : null;
        const pressureRisk = Number(decisionContext.pressureRisk || 0);
        const underPressure = decisionContext.underPressure === true || pressureRisk >= 70;
        return {
            minute,
            bucket: snapshot?.bucket || null,
            score: clone(snapshot?.score || null),
            scoreState: score.scoreState,
            scoreDiff: score.scoreDiff,
            homeAway: score.homeAway,
            strengthGap: Number.isFinite(gap) ? Number(gap.toFixed(2)) : null,
            strengthBucket: strengthBucket(gap),
            previous: {
                phaseId: `observed_phase|${snapshot?.gameId || ''}|${latestTransition?.ts || 0}|${hashHex(currentFingerprint)}`,
                phaseSequence: Number(snapshot?.tacticTelemetry?.transitionCount || transitions.length || 0),
                phaseDuration: minute != null && transitionMinute != null ? Math.max(0, minute - transitionMinute) : null,
                presetId: currentPreset,
                tacticSource: currentPreset ? 'production' : 'manual',
                tacticFingerprint: currentFingerprint
            },
            state: {
                pressureState: underPressure ? 'high' : pressureRisk >= 40 ? 'medium' : 'normal',
                pressureRisk,
                attackNeed: Number(decisionContext.attackNeed || 0),
                powerDropPct: Number(decisionContext.myPowerDropPct || 0),
                badActionsPct: Number(my.badActionsPct || 0),
                possession: Number(my.possession ?? my.pos ?? 0)
            },
            productionRecommendation: compactRecommendation(snapshot)
        };
    }

    function assignmentRecord(snapshot, state, experiment) {
        const ts = Date.now();
        return {
            ts,
            recordType: 'preset_event',
            schemaVersion: 4,
            parserVersion: 'tactical_lab_v1_assignment',
            eventKey: `tactical_lab_assignment|${state.gameId}|${state.assignment.assignmentId}`,
            type: 'tactical_lab_assignment',
            gameId: state.gameId,
            minute: snapshot?.minute ?? null,
            bucket: snapshot?.bucket || null,
            presetName: experiment.experimentId,
            tacticTelemetry: snapshot?.tacticTelemetry || null,
            tacticalLab: {
                schema: 'slf_tactical_lab_assignment_v1',
                assignmentId: state.assignment.assignmentId,
                experimentId: experiment.experimentId,
                populationVersion: POPULATION_VERSION,
                genomeVersion: GENOME_VERSION,
                genomeFingerprint: experiment.genomeFingerprint,
                blind: true,
                offered: true,
                activated: false,
                offerContext: buildContext(snapshot)
            },
            source: { page:'game', trigger:'tactical_lab_offer', collectedAt:ts, scriptVersion:SLF_VERSION_INFO.scriptVersion }
        };
    }

    function activationRecord(snapshot, state, experiment, activation) {
        const ts = Date.now();
        return {
            ts,
            recordType: 'preset_event',
            schemaVersion: 4,
            parserVersion: 'tactical_lab_v1_activation',
            eventKey: activation.eventKey,
            type: 'tactical_lab_activation',
            gameId: state.gameId,
            minute: activation.startedAtMinute,
            bucket: snapshot?.bucket || null,
            presetName: experiment.experimentId,
            tactic: clone(experiment.controls),
            ruleDecision: EventTracker.compactRuleDecision(snapshot?.ruleDecision || STATE.lastRuleDecision || null),
            tacticTelemetry: snapshot?.tacticTelemetry || null,
            tacticalLab: {
                schema: 'slf_tactical_lab_activation_v1',
                assignmentId: state.assignment.assignmentId,
                activationId: activation.activationId,
                experimentId: experiment.experimentId,
                populationVersion: POPULATION_VERSION,
                generation: experiment.generation,
                genomeVersion: GENOME_VERSION,
                genomeFingerprint: experiment.genomeFingerprint,
                tacticFingerprint: experiment.tacticFingerprint,
                origin: experiment.origin,
                parentExperimentId: experiment.parentExperimentId,
                mutationDistance: experiment.mutationDistance,
                formation: clone(experiment.formation),
                blind: true,
                entryContext: clone(activation.entryContext)
            },
            source: { page:'game', trigger:'tactical_lab_apply', collectedAt:ts, scriptVersion:SLF_VERSION_INFO.scriptVersion }
        };
    }

    function effectRecord(snapshot, state, experiment, activation, reason, nextContext) {
        const ts = Date.now();
        const exitContext = buildContext(snapshot);
        exitContext.next = {
            presetId: nextContext?.nextPresetId || exitContext.previous?.presetId || null,
            tacticSource: nextContext?.nextTacticSource || 'unknown',
            tacticFingerprint: nextContext?.nextTacticFingerprint || exitContext.previous?.tacticFingerprint || null
        };
        const endMinute = Number.isFinite(Number(snapshot?.minute)) ? Number(snapshot.minute) : null;
        const duration = activation.startedAtMinute != null && endMinute != null ? Math.max(0, endMinute - activation.startedAtMinute) : null;
        return {
            ts,
            recordType: 'preset_effect',
            schemaVersion: 4,
            parserVersion: 'tactical_lab_v1_effect',
            effectKey: `tactical_lab_effect|${state.gameId}|${state.assignment.assignmentId}`,
            gameId: state.gameId,
            presetName: experiment.experimentId,
            eventType: 'tactical_lab',
            fromMinute: activation.startedAtMinute,
            toMinute: endMinute,
            fromBucket: activation.entryContext?.bucket || null,
            toBucket: snapshot?.bucket || null,
            tacticContext: {
                appliedPreset: experiment.experimentId,
                appliedTactic: clone(experiment.controls),
                currentTacticAfter: clone(snapshot?.currentTactic || null)
            },
            decisionContext: clone(activation.entryContext?.productionRecommendation || null),
            tacticTelemetry: snapshot?.tacticTelemetry || null,
            delta: metricDelta(activation.baselineMetrics || {}, buildMetrics(snapshot)),
            tacticalLab: {
                schema: 'slf_tactical_lab_effect_v1',
                assignmentId: state.assignment.assignmentId,
                activationId: activation.activationId,
                experimentId: experiment.experimentId,
                populationVersion: POPULATION_VERSION,
                genomeVersion: GENOME_VERSION,
                genomeFingerprint: experiment.genomeFingerprint,
                tacticFingerprint: experiment.tacticFingerprint,
                entryContext: clone(activation.entryContext),
                exitContext,
                exitReason: reason,
                durationMinutes: duration,
                completed: reason === 'match_finished'
            },
            source: { page:'game', trigger:'tactical_lab_exit', collectedAt:ts, scriptVersion:SLF_VERSION_INFO.scriptVersion }
        };
    }

    async function ensureAssignment(snapshot = null) {
        snapshot = snapshot || SnapshotEngine.build();
        if (!isOwned(snapshot) || snapshot.status === 'finished') return null;
        const gameId = getGameId(snapshot);
        const state = loadState(gameId);
        if (!state.assignment || state.assignment.populationVersion !== POPULATION_VERSION || !populationById.has(state.assignment.experimentId)) {
            state.assignment = buildAssignment(gameId);
            state.assignmentRecorded = false;
            state.activation = null;
            state.completed = null;
            state.lastError = null;
        }
        if (!state.assignmentRecorded) {
            state.assignmentRecorded = true;
            persistState(state);
            const experiment = populationById.get(state.assignment.experimentId);
            queueRecord(state, CONFIG.COLLECTIONS.PRESET_EVENTS, assignmentRecord(snapshot, state, experiment), 'tactical lab assignment');
        } else {
            persistState(state);
            void flushOutbox(state);
        }
        return state;
    }

    async function activate() {
        const snapshot = SnapshotEngine.build();
        if (!isOwned(snapshot) || snapshot.status === 'finished') return { ok:false, reason:'Матч недоступен для Tactical Lab.' };
        const state = await ensureAssignment(snapshot);
        if (!state?.assignment) return { ok:false, reason:'Эксперимент ещё не назначен.' };
        if (state.activation || state.completed) return { ok:false, reason:'Эксперимент уже использован в этом матче.' };
        const experiment = populationById.get(state.assignment.experimentId);
        const bridge = STATE.tacticControlBridge;
        if (!experiment || !bridge) return { ok:false, reason:'Механизм применения тактики ещё не готов.' };
        const formationReady = bridge.validateFormation?.(experiment.formation);
        if (!formationReady?.ok) return { ok:false, reason:formationReady?.reason || 'Расстановка недоступна.' };

        state.lastError = null;
        persistState(state);
        const entryContext = buildContext(snapshot);
        const baselineMetrics = buildMetrics(snapshot);
        const controls = await bridge.applyTacticObject(experiment.controls, {
            source: `tactical_lab:${experiment.experimentId}`,
            strict: true
        });
        if (!controls?.ok) {
            state.lastError = `Не удалось применить controls: ${(controls?.failures || []).concat(controls?.mismatches || []).join(', ') || 'unknown'}`;
            persistState(state);
            renderUI();
            return { ok:false, reason:state.lastError };
        }
        const formation = bridge.applyFormation(experiment.formation);
        if (!formation?.ok) {
            state.lastError = formation?.reason || 'Не удалось применить экспериментальную расстановку.';
            persistState(state);
            renderUI();
            return { ok:false, reason:state.lastError };
        }
        const save = bridge.saveLiveLineup();
        if (!save?.ok) {
            state.lastError = save?.reason || 'Не удалось сохранить экспериментальную расстановку.';
            persistState(state);
            renderUI();
            return { ok:false, reason:state.lastError };
        }
        if (!bridge.formationMatches(experiment.formation)) {
            state.lastError = 'После сохранения расстановка не совпала с experimental genome.';
            persistState(state);
            renderUI();
            return { ok:false, reason:state.lastError };
        }

        STATE.tacticTransitionSourceHint = { source:'tactical_lab', expiresAt:Date.now() + 10 * 60 * 1000 };
        const after = SnapshotEngine.build();
        const activationId = `tactical_lab_activation|${state.gameId}|${state.assignment.assignmentId}`;
        state.activation = {
            status: 'active',
            activationId,
            eventKey: `tactical_lab_activation_event|${state.gameId}|${state.assignment.assignmentId}`,
            experimentId: experiment.experimentId,
            startedAtTs: Date.now(),
            startedAtMinute: Number.isFinite(Number(snapshot.minute)) ? Number(snapshot.minute) : null,
            entryContext,
            baselineMetrics
        };
        persistState(state);
        queueRecord(state, CONFIG.COLLECTIONS.PRESET_EVENTS, activationRecord(after, state, experiment, state.activation), 'tactical lab activation');
        renderUI();
        return { ok:true, experimentId:experiment.experimentId };
    }

    async function closeActive(reason, snapshot = null, nextContext = {}) {
        snapshot = snapshot || SnapshotEngine.build();
        const gameId = getGameId(snapshot);
        const state = loadState(gameId);
        const activation = state?.activation;
        if (!activation || activation.status !== 'active') return null;
        const experiment = populationById.get(activation.experimentId || state.assignment?.experimentId);
        if (!experiment) return null;
        activation.status = 'closing';
        persistState(state);
        const effect = effectRecord(snapshot, state, experiment, activation, reason || 'tactic_changed', nextContext || {});
        queueRecord(state, CONFIG.COLLECTIONS.PRESET_EFFECTS, effect, 'tactical lab effect');
        state.completed = {
            experimentId: experiment.experimentId,
            activationId: activation.activationId,
            fromMinute: activation.startedAtMinute,
            toMinute: effect.toMinute,
            durationMinutes: effect.tacticalLab?.durationMinutes ?? null,
            exitReason: effect.tacticalLab?.exitReason || reason || 'tactic_changed',
            effectKey: effect.effectKey,
            completedAt: Date.now()
        };
        state.activation = null;
        persistState(state);
        renderUI();
        return effect;
    }

    function isActive() {
        const gameId = String(MatchStateParser.getGameId() || '');
        return !!loadState(gameId)?.activation && loadState(gameId)?.activation?.status === 'active';
    }

    function assignedExperiment(state) {
        return populationById.get(state?.assignment?.experimentId || '') || null;
    }

    function productionRecommendationText() {
        const node = document.getElementById('slf-parser-recommendation');
        return String(node?.textContent || '').trim();
    }

    function renderUI() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const gameId = String(MatchStateParser.getGameId() || '');
        const state = loadState(gameId);
        const experiment = assignedExperiment(state);
        const status = document.getElementById(STATUS_ID);
        const detail = document.getElementById(DETAIL_ID);
        const button = document.getElementById(BUTTON_ID);
        if (!status || !detail || !button || !experiment) return;

        panel.dataset.experimentId = experiment.experimentId;
        panel.dataset.populationVersion = POPULATION_VERSION;
        const shortId = experiment.experimentId.replace('EXP-561-P01-', 'EXP-');
        if (state.activation?.status === 'active') {
            const start = state.activation.startedAtMinute;
            let exposure = null;
            try {
                const current = SnapshotEngine.build();
                exposure = start != null && Number.isFinite(Number(current?.minute)) ? Math.max(0, Number(current.minute) - Number(start)) : null;
            } catch (_) {}
            status.textContent = `● ${shortId} ACTIVE${start != null ? ` · с ${start}'` : ''}${exposure != null ? ` · exposure ${exposure}m` : ''}`;
            status.style.color = '#43f58c';
            const recommendation = productionRecommendationText();
            detail.textContent = recommendation ? `Production Advisor остаётся активным: ${recommendation}` : 'Production Advisor продолжает работать параллельно.';
            button.disabled = true;
            button.textContent = 'Эксперимент активен';
            return;
        }
        if (state.completed) {
            status.textContent = `${shortId} протестирован`;
            status.style.color = '#aeb6cf';
            detail.textContent = `${state.completed.fromMinute ?? '?'}' → ${state.completed.toMinute ?? '?'}' · exposure ${state.completed.durationMinutes ?? '?'}m · ${state.completed.exitReason}`;
            button.disabled = true;
            button.textContent = 'Тест завершён';
            return;
        }
        status.textContent = `${shortId} · blind challenger · Population ${POPULATION_CODE}`;
        status.style.color = '#ffd76a';
        detail.textContent = state.lastError || 'Параметры и схема скрыты до окончания матча. Один клик применит controls + formation и сохранит расстановку.';
        const ready = STATE.tacticControlBridge?.validateFormation?.(experiment.formation)?.ok;
        button.disabled = !ready;
        button.textContent = ready ? 'Применить эксперимент' : 'Поле загружается…';
    }

    async function mountUI() {
        if (!location.pathname.includes('/game.php')) return false;
        let snapshot;
        try { snapshot = SnapshotEngine.build(); } catch (_) { return false; }
        if (!isOwned(snapshot)) return false;
        let state = loadState(getGameId(snapshot));
        if (snapshot.status !== 'finished') state = await ensureAssignment(snapshot);
        if (!state?.assignment) return false;

        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            const anchor = document.getElementById('slf-live-lineup-preset-panel')
                || document.getElementById('slf-match-parser-panel')
                || document.querySelector('.control_field_1');
            if (!anchor?.parentNode) return false;
            panel = document.createElement('section');
            panel.id = PANEL_ID;
            panel.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;margin:0 0 10px;padding:9px 10px;box-sizing:border-box;background:#171b29;border:1px solid #6f5c20;border-radius:10px;color:#eef1f8;font-family:Arial,sans-serif;font-size:12px;';
            const title = document.createElement('strong');
            title.textContent = 'Tactical Lab';
            title.style.cssText = 'color:#ffd76a;white-space:nowrap;';
            const status = document.createElement('span');
            status.id = STATUS_ID;
            status.style.cssText = 'font-weight:600;';
            const button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = 'Применить эксперимент';
            button.style.cssText = 'padding:6px 10px;border:1px solid #8b7328;border-radius:8px;background:#2b2718;color:#ffe18a;cursor:pointer;font-weight:600;';
            button.addEventListener('click', async () => {
                if (button.disabled) return;
                button.disabled = true;
                button.textContent = 'Применяю…';
                const result = await activate();
                if (!result?.ok) {
                    const currentState = loadState(String(MatchStateParser.getGameId() || ''));
                    currentState.lastError = result?.reason || currentState.lastError || 'Не удалось применить эксперимент.';
                    persistState(currentState);
                }
                renderUI();
            });
            const detail = document.createElement('span');
            detail.id = DETAIL_ID;
            detail.style.cssText = 'flex:1 1 100%;color:#aeb6cf;font-size:10px;line-height:1.3;';
            panel.append(title, status, button, detail);
            anchor.parentNode.insertBefore(panel, anchor.nextSibling);
        }
        renderUI();
        return true;
    }

    async function monitor() {
        if (!location.pathname.includes('/game.php')) return;
        await mountUI();
        const gameId = String(MatchStateParser.getGameId() || '');
        const state = loadState(gameId);
        if (state?.outbox?.length) void flushOutbox(state);
        if (!state?.activation || state.activation.status !== 'active') {
            renderUI();
            return;
        }
        let snapshot;
        try { snapshot = SnapshotEngine.build(); } catch (_) { return; }
        if (snapshot.status === 'finished') {
            await closeActive('match_finished', snapshot, { nextTacticSource:'finished' });
            return;
        }
        const experiment = assignedExperiment(state);
        if (!experiment) return;
        const actualFingerprint = tacticFingerprint(getCurrentTactic());
        if (actualFingerprint !== experiment.tacticFingerprint && (!STATE.suppressManualWatcherUntil || Date.now() >= STATE.suppressManualWatcherUntil)) {
            await closeActive('tactic_changed', snapshot, { nextTacticSource:'manual', nextTacticFingerprint:actualFingerprint });
            return;
        }
        if (STATE.tacticControlBridge?.formationMatches && !STATE.tacticControlBridge.formationMatches(experiment.formation)) {
            await closeActive('formation_changed', snapshot, { nextTacticSource:'manual_formation' });
            return;
        }
        renderUI();
    }

    const guardedSendResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
    SnapshotEngine.sendMatchResult = function sendMatchResultWithTacticalLab(snapshot) {
        const close = isActive() ? closeActive('match_finished', snapshot, { nextTacticSource:'finished' }) : Promise.resolve(null);
        return Promise.resolve(close).then(() => guardedSendResult(snapshot));
    };

    const TacticalLabRuntime = {
        schema: 'slf_tactical_lab_runtime_v1',
        populationVersion: POPULATION_VERSION,
        populationSize: POPULATION_SIZE,
        getPopulation() { return clone(population); },
        getAssignment(gameId) { return clone(loadState(String(gameId || MatchStateParser.getGameId() || ''))?.assignment || null); },
        assignForGame(gameId) { return clone(buildAssignment(String(gameId || ''))); },
        ensureAssignment,
        activate,
        closeActive,
        isActive,
        mountUI,
        flushOutbox() {
            const state = loadState(String(MatchStateParser.getGameId() || ''));
            return flushOutbox(state);
        }
    };
    STATE.tacticalLabRuntime = TacticalLabRuntime;

    const start = () => {
        void monitor();
        if (!uiTimer) uiTimer = setInterval(() => { void monitor(); }, 1000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
    else setTimeout(start, 0);
})();
