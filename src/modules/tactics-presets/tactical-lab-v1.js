// Tactical Lab v1 scheduler (deferred boot)
// Extracted verbatim from tactic-control-engine.js (stage 4 refactor).

    // Tactical Lab v1 is installed after the synchronous bundle has defined
    // match parsing, telemetry and the production recommendation stack.
    (function scheduleTacticalLabV1() {
        const POPULATION_VERSION = 'slf_tactical_lab_561_p02';
        const POPULATION_CODE = 'P02';
        const GENOME_VERSION = 'slf_tactical_genome_v1';
        const POPULATION_SIZE = 64;
        const PANEL_ID = 'slf-tactical-lab-panel';
        const BUTTON_ID = 'slf-tactical-lab-apply';
        const STATUS_ID = 'slf-tactical-lab-status';
        const DETAIL_ID = 'slf-tactical-lab-detail';
        const MAX_OUTBOX = 6;
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
        const ranges = {
            def_line:['1','2','3'], press_line:['1','2','3'], def_width:['1','2','3'], press_intense:['1','2','3','4','5'],
            build_type:['1','2','3'], build_temp:['1','2','3'], build_long:['1','2','3'], build_fast:['1','2','3'],
            style:['1','2','3','4','5'], pass_risk:['1','2','3','4','5'], dribble:['1','2','3','4','5'], cross:['1','2','3'],
            corner:['1','2'], shot:['1','2','3']
        };
        const priorityValues = new Set(['left','center','right']);
        const labControlKeys = Object.keys(ranges);
        let population = null;
        let cachedState = null;
        let cachedGameId = '';
        let flushPromise = null;
        let telemetryWrapped = false;
        let persistWrapped = false;

        const clone = value => {
            if (value == null) return value;
            try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
        };
        const hash32 = text => {
            let value = 2166136261;
            for (const char of String(text || '')) {
                value ^= char.charCodeAt(0);
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
        const normalizePriority = value => (Array.isArray(value) ? value : value ? [value] : [])
            .map(String)
            .filter(item => priorityValues.has(item))
            .sort();
        const nearestAllowedValue = (key, value) => {
            const values = ranges[key] || [];
            const requested = String(value ?? '');
            if (values.includes(requested)) return requested;
            if (!values.length) return requested;
            const numeric = Number(requested);
            if (!Number.isFinite(numeric)) return values[Math.floor((values.length - 1) / 2)];
            return values.reduce((best, candidate) =>
                Math.abs(Number(candidate) - numeric) < Math.abs(Number(best) - numeric) ? candidate : best
            , values[0]);
        };
        const normalizeLabControls = controls => {
            const normalized = {};
            labControlKeys.forEach(key => { normalized[key] = nearestAllowedValue(key, controls?.[key]); });
            normalized.priority = normalizePriority(controls?.priority);
            return normalized;
        };
        const tacticFingerprint = tactic => labControlKeys.concat(['priority'])
            .map(key => `${key}:${JSON.stringify(key === 'priority' ? normalizePriority(tactic?.[key]) : String(tactic?.[key] ?? ''))}`)
            .join('|');
        const genomeFingerprint = controls => `tlab1-${hashHex(tacticFingerprint(controls))}`;
        const mutationDistance = (before, after) => {
            const keys = labControlKeys.concat(['priority']);
            const changed = keys.filter(key => JSON.stringify(key === 'priority' ? normalizePriority(before?.[key]) : before?.[key]) !== JSON.stringify(key === 'priority' ? normalizePriority(after?.[key]) : after?.[key])).length;
            return Number((changed / keys.length).toFixed(3));
        };
        const priorityFor = index => {
            const options = [[],['left'],['center'],['right'],['left','right'],['left','center'],['center','right']];
            return options[index % options.length].slice();
        };
        const makeExperiment = (index, origin, controls, parentExperimentId = null, distance = null) => {
            const normalizedControls = normalizeLabControls(controls);
            return {
                experimentId: `EXP-561-${POPULATION_CODE}-${String(index + 1).padStart(4, '0')}`,
                populationVersion: POPULATION_VERSION,
                generation: 1,
                genomeVersion: GENOME_VERSION,
                origin,
                parentExperimentId,
                mutationDistance: distance,
                controls: normalizedControls,
                tacticFingerprint: tacticFingerprint(normalizedControls),
                genomeFingerprint: genomeFingerprint(normalizedControls)
            };
        };

        function buildPopulation() {
            const result = [];
            const mutableKeys = labControlKeys.filter(key => key !== 'corner');
            for (let index = 0; index < 16; index += 1) {
                const seedId = productionIds[index % productionIds.length];
                const baseline = normalizeLabControls(seedPresets[seedId]);
                const controls = clone(baseline);
                for (let step = 0; step < 3; step += 1) {
                    const key = mutableKeys[(index * 3 + step * 5) % mutableKeys.length];
                    const values = ranges[key];
                    const currentIndex = Math.max(0, values.indexOf(String(controls[key])));
                    const shift = ((index + step) % 2 === 0 ? 1 : -1);
                    controls[key] = values[(currentIndex + shift + values.length) % values.length];
                }
                if (index % 4 === 3) controls.priority = priorityFor(index);
                result.push(makeExperiment(index, 'production_mutation', controls, seedId, mutationDistance(baseline, controls)));
            }
            for (let local = 0; local < 16; local += 1) {
                const index = 16 + local;
                const controls = {};
                labControlKeys.forEach((key, keyIndex) => {
                    const values = ranges[key];
                    controls[key] = values[(local * 2 + keyIndex * 3) % values.length];
                });
                controls.priority = priorityFor(local + 2);
                result.push(makeExperiment(index, 'orthogonal', controls, null, 1));
            }
            for (let local = 0; local < 16; local += 1) {
                const index = 32 + local;
                const rng = makeRng(`${POPULATION_VERSION}|random|${local}`);
                const controls = {};
                labControlKeys.forEach(key => {
                    const values = ranges[key];
                    controls[key] = values[Math.floor(rng() * values.length) % values.length];
                });
                controls.priority = priorityFor(Math.floor(rng() * 100));
                result.push(makeExperiment(index, 'deterministic_random', controls, null, 1));
            }
            for (let local = 0; local < 16; local += 1) {
                const index = 48 + local;
                const controls = {};
                labControlKeys.forEach((key, keyIndex) => {
                    const values = ranges[key];
                    controls[key] = values.length === 1 ? values[0] : ((local + keyIndex) % 2 === 0 ? values[0] : values[values.length - 1]);
                });
                controls.priority = priorityFor(local + 4);
                result.push(makeExperiment(index, 'extreme', controls, null, 1));
            }
            return result;
        }

        function storage() {
            try { return document.defaultView?.localStorage || null; } catch (_) { return null; }
        }
        function getGameId(snapshot = null) {
            return String(snapshot?.gameId || MatchStateParser.getGameId() || '');
        }
        function stateStorageKey(gameId) {
            try {
                const key = SnapshotEngine.manualMatchState?.getStorageKey?.(gameId);
                if (key) return String(key);
            } catch (_) {}
            return `slf_manual_match_state_v1:${gameId}`;
        }
        function emptyState(gameId) {
            return {
                schema:'slf_tactical_lab_state_v1',
                gameId,
                populationVersion:POPULATION_VERSION,
                assignment:null,
                activation:null,
                completed:null,
                outbox:[],
                lastError:null
            };
        }
        function readStoredLabState(gameId) {
            const store = storage();
            if (!store || !gameId) return null;
            try {
                const envelope = JSON.parse(store.getItem(stateStorageKey(gameId)) || 'null');
                const lab = envelope?.tacticalLab;
                return lab?.schema === 'slf_tactical_lab_state_v1' && String(lab.gameId || '') === String(gameId) ? lab : null;
            } catch (_) { return null; }
        }
        function loadState(gameId) {
            gameId = String(gameId || '');
            if (!gameId) return null;
            if (cachedState && cachedGameId === gameId) return cachedState;
            const state = readStoredLabState(gameId) || emptyState(gameId);
            state.outbox = Array.isArray(state.outbox) ? state.outbox.slice(-MAX_OUTBOX) : [];
            cachedGameId = gameId;
            cachedState = state;
            return state;
        }
        function persistState(state) {
            if (!state?.gameId) return null;
            cachedGameId = String(state.gameId);
            cachedState = state;
            const store = storage();
            if (!store) return state;
            const key = stateStorageKey(state.gameId);
            try {
                let envelope = JSON.parse(store.getItem(key) || 'null');
                if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
                    if (typeof SnapshotEngine.persistManualState === 'function') SnapshotEngine.persistManualState({});
                    envelope = JSON.parse(store.getItem(key) || 'null');
                }
                if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
                    envelope = { schema:'slf_manual_match_state_v1', gameId:state.gameId, ts:Date.now() };
                }
                envelope.tacticalLab = clone(state);
                envelope.ts = Date.now();
                store.setItem(key, JSON.stringify(envelope));
            } catch (_) {}
            return state;
        }
        function installPersistBridge() {
            if (persistWrapped || typeof SnapshotEngine.persistManualState !== 'function') return;
            persistWrapped = true;
            const originalPersist = SnapshotEngine.persistManualState.bind(SnapshotEngine);
            SnapshotEngine.persistManualState = function persistManualStateWithTacticalLab(extra = {}) {
                const result = originalPersist(extra);
                const gameId = String(MatchStateParser.getGameId() || cachedGameId || '');
                const state = gameId ? (cachedGameId === gameId ? cachedState : readStoredLabState(gameId)) : null;
                if (state) persistState(state);
                return result;
            };
        }

        function selectExperiment(gameId) {
            const items = population || (population = buildPopulation());
            return items[hash32(`${POPULATION_VERSION}|${gameId}`) % items.length];
        }
        function ensureAssignment(snapshot) {
            const gameId = getGameId(snapshot);
            const state = loadState(gameId);
            if (!state) return null;
            const selected = selectExperiment(gameId);
            if (!state.assignment || state.assignment.populationVersion !== POPULATION_VERSION) {
                state.populationVersion = POPULATION_VERSION;
                state.assignment = {
                    assignmentId:`tactical_lab_assignment|${gameId}|${selected.experimentId}`,
                    experimentId:selected.experimentId,
                    populationVersion:POPULATION_VERSION,
                    genomeFingerprint:selected.genomeFingerprint,
                    assignedAt:Date.now()
                };
                state.activation = null;
                state.completed = null;
                state.lastError = null;
            }
            persistState(state);
            return state;
        }
        function experimentFor(state) {
            const items = population || (population = buildPopulation());
            return items.find(item => item.experimentId === state?.assignment?.experimentId) || null;
        }
        function isOwnedLive(snapshot) {
            return !!snapshot?.gameId && !!snapshot?.myTeam && snapshot.status !== 'finished';
        }
        function scoreContext(snapshot) {
            const score = snapshot?.score || {};
            const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
            const isHome = Number(teams[0]) === Number(snapshot?.myTeam);
            const home = Number(score.home);
            const away = Number(score.away);
            if (!Number.isFinite(home) || !Number.isFinite(away) || !snapshot?.myTeam) {
                return {scoreState:'unknown',scoreDiff:null,homeAway:snapshot?.myTeam?(isHome?'home':'away'):'unknown'};
            }
            const myGoals = isHome ? home : away;
            const oppGoals = isHome ? away : home;
            return {scoreState:myGoals>oppGoals?'winning':myGoals<oppGoals?'losing':'draw',scoreDiff:myGoals-oppGoals,homeAway:isHome?'home':'away'};
        }
        function teamStats(snapshot, own) {
            if (!snapshot?.myTeam || !Array.isArray(snapshot?.stats)) return null;
            return snapshot.stats.find(item => own
                ? Number(item?.teamId) === Number(snapshot.myTeam)
                : Number(item?.teamId) !== Number(snapshot.myTeam))?.stats || null;
        }
        function metrics(snapshot) {
            const my = teamStats(snapshot, true) || {};
            const opp = teamStats(snapshot, false) || {};
            return {
                myXG:Number(my.xG || 0),oppXG:Number(opp.xG || 0),myShots:Number(my.shots || 0),oppShots:Number(opp.shots || 0),
                myBadActionsPct:Number(my.badActionsPct || 0),oppBadActionsPct:Number(opp.badActionsPct || 0),
                myPower:Number(my.power || 0),oppPower:Number(opp.power || 0),
                myDefVector:Number(my.defVector || 0),oppDefVector:Number(opp.defVector || 0),
                myPressVector:Number(my.pressVector || 0),oppPressVector:Number(opp.pressVector || 0)
            };
        }
        function metricDelta(before, after) {
            return Object.fromEntries(Object.keys(before || {}).map(key => [key,Number((Number(after?.[key] || 0)-Number(before?.[key] || 0)).toFixed(4))]));
        }
        function productionRecommendation() {
            const decision = STATE.lastRuleDecision || null;
            const compact = EventTracker.compactRuleDecision?.(decision) || null;
            const runnerUp = decision?.runnerUp || (decision?.candidates || []).find(item => !item?.vetoed && item?.preset !== decision?.action?.preset) || null;
            return compact ? {
                presetId:compact.action?.preset || null,
                situationKey:decision?.situationKey || compact.action?.decision || null,
                confidence:clone(decision?.confidence || compact.confidence || null),
                runnerUp:runnerUp?{preset:runnerUp.preset||null,score:Number(runnerUp.score||0)}:null,
                margin:Number(decision?.margin ?? compact.margin ?? 0),
                riskAppetite:compact.riskAppetite || null
            } : null;
        }
        function buildContext(snapshot) {
            const my = teamStats(snapshot, true) || {};
            const opp = teamStats(snapshot, false) || {};
            const score = scoreContext(snapshot);
            const gap = Number(my.power || 0) - Number(opp.power || 0);
            const decisionContext = STATE.lastRuleDecision?.moment?.context || {};
            const transitions = Array.isArray(snapshot?.tacticTelemetry?.transitions) ? snapshot.tacticTelemetry.transitions : [];
            const latest = transitions[transitions.length - 1] || null;
            const minute = Number.isFinite(Number(snapshot?.minute)) ? Number(snapshot.minute) : null;
            const transitionMinute = Number.isFinite(Number(latest?.minute)) ? Number(latest.minute) : null;
            const currentFingerprint = snapshot?.tacticTelemetry?.currentTacticFingerprint || tacticFingerprint(snapshot?.currentTactic || {});
            const currentPreset = snapshot?.tacticTelemetry?.currentPreset || null;
            return {
                minute,bucket:snapshot?.bucket||null,score:clone(snapshot?.score||null),scoreState:score.scoreState,scoreDiff:score.scoreDiff,homeAway:score.homeAway,
                strengthGap:Number.isFinite(gap)?Number(gap.toFixed(2)):null,
                strengthBucket:gap<=-10?'much_weaker':gap<-3?'weaker':gap<=3?'even':gap<10?'stronger':'much_stronger',
                previous:{
                    phaseSequence:Number(snapshot?.tacticTelemetry?.transitionCount || transitions.length || 0),
                    phaseDuration:minute!=null&&transitionMinute!=null?Math.max(0,minute-transitionMinute):null,
                    presetId:currentPreset,
                    tacticSource:currentPreset?'production':'manual',
                    tacticFingerprint:currentFingerprint
                },
                state:{
                    pressureRisk:Number(decisionContext.pressureRisk||0),
                    attackNeed:Number(decisionContext.attackNeed||0),
                    powerDropPct:Number(decisionContext.myPowerDropPct||0),
                    badActionsPct:Number(my.badActionsPct||0),
                    possession:Number(my.possession ?? my.pos ?? 0)
                },
                productionRecommendation:productionRecommendation()
            };
        }
        function publicState(state) {
            if (!state) return null;
            return {
                schema:'slf_tactical_lab_match_v1',
                populationVersion:POPULATION_VERSION,
                assignment:clone(state.assignment),
                activation:clone(state.activation),
                completed:clone(state.completed),
                offered:true,
                activated:!!state.activation || !!state.completed
            };
        }
        function lifecycleEvent(state, kind, context, extra) {
            const experiment = experimentFor(state);
            return {
                schema:'slf_tactical_lab_event_v1',
                eventKey:`tactical_lab_${kind}|${state.gameId}|${state.assignment?.assignmentId || ''}`,
                kind,
                assignmentId:state.assignment?.assignmentId || null,
                experimentId:experiment?.experimentId || null,
                populationVersion:POPULATION_VERSION,
                genomeVersion:GENOME_VERSION,
                genomeFingerprint:experiment?.genomeFingerprint || null,
                blind:true,
                context:clone(context),
                extra:clone(extra || null),
                recordedAt:Date.now()
            };
        }
        function queueLifecycle(state, kind, context, extra) {
            if (!state?.assignment) return;
            const event = lifecycleEvent(state, kind, context, extra);
            state.outbox = (Array.isArray(state.outbox) ? state.outbox : []).filter(item => item?.eventKey !== event.eventKey);
            state.outbox.push({eventKey:event.eventKey,event});
            state.outbox = state.outbox.slice(-MAX_OUTBOX);
            persistState(state);
            void flushOutbox(state);
        }
        async function flushOutbox(state) {
            if (flushPromise || !state?.outbox?.length || typeof SnapshotEngine.sendSnapshot !== 'function') return flushPromise;
            flushPromise = (async () => {
                for (const item of state.outbox.slice()) {
                    try {
                        const snapshot = SnapshotEngine.build();
                        if (!snapshot?.myTeam || String(snapshot.gameId || '') !== String(state.gameId || '')) break;
                        snapshot.tacticalLabEvent = clone(item.event);
                        snapshot.tacticalLab = publicState(state);
                        await SnapshotEngine.sendSnapshot(snapshot);
                        state.outbox = state.outbox.filter(row => row?.eventKey !== item.eventKey);
                        persistState(state);
                    } catch (_) { break; }
                }
            })().finally(() => { flushPromise = null; });
            return flushPromise;
        }

        function installTelemetryBridge() {
            if (telemetryWrapped || typeof SnapshotEngine.buildSnapshotKey !== 'function') return;
            telemetryWrapped = true;
            const originalKey = SnapshotEngine.buildSnapshotKey.bind(SnapshotEngine);
            SnapshotEngine.buildSnapshotKey = function buildSnapshotKeyWithTacticalLab(snapshot) {
                const base = originalKey(snapshot);
                return snapshot?.tacticalLabEvent?.eventKey ? `${base}|${snapshot.tacticalLabEvent.eventKey}` : base;
            };
            if (typeof SnapshotEngine.sendPlayerObservations === 'function') {
                const originalPlayers = SnapshotEngine.sendPlayerObservations.bind(SnapshotEngine);
                SnapshotEngine.sendPlayerObservations = function sendPlayerObservationsWithoutLabEventFanout(snapshot) {
                    if (snapshot?.tacticalLabEvent) return Promise.resolve(null);
                    return originalPlayers(snapshot);
                };
            }
            if (typeof SnapshotEngine.buildSnapshotRecord === 'function') {
                const originalRecord = SnapshotEngine.buildSnapshotRecord.bind(SnapshotEngine);
                SnapshotEngine.buildSnapshotRecord = function buildSnapshotRecordWithTacticalLab(snapshot) {
                    const record = originalRecord(snapshot);
                    const gameId = getGameId(snapshot);
                    const state = gameId ? loadState(gameId) : null;
                    if (state?.assignment) record.tacticalLab = clone(snapshot?.tacticalLab || publicState(state));
                    if (snapshot?.tacticalLabEvent) record.tacticalLabEvent = clone(snapshot.tacticalLabEvent);
                    return record;
                };
            }
            if (typeof SnapshotEngine.sendMatchResult === 'function') {
                const originalResult = SnapshotEngine.sendMatchResult.bind(SnapshotEngine);
                SnapshotEngine.sendMatchResult = async function sendMatchResultWithTacticalLab(snapshot) {
                    const gameId = getGameId(snapshot);
                    const state = gameId ? loadState(gameId) : null;
                    if (state?.activation?.status === 'active' && snapshot?.status === 'finished') {
                        await checkpoint('finished_parse', snapshot);
                    }
                    const finalState = gameId ? loadState(gameId) : null;
                    if (finalState?.assignment) snapshot.tacticalLab = publicState(finalState);
                    return originalResult(snapshot);
                };
            }
        }

        function controlsAvailable(controls) {
            if (!controls || typeof controls !== 'object') return false;
            for (const key of labControlKeys) {
                const value = String(controls[key] ?? '');
                if (!(ranges[key] || []).includes(value)) return false;
                if (!document.querySelector(`input[name="${key}"][value="${value}"]`)) return false;
            }
            for (const value of normalizePriority(controls.priority)) {
                const suffix = value === 'left' ? 'l' : value === 'center' ? 'c' : value === 'right' ? 'r' : '';
                if (!suffix || !document.querySelector(`input[name="priority_${suffix}"]`)) return false;
            }
            return true;
        }

        async function activate() {
            const snapshot = SnapshotEngine.build();
            if (!isOwnedLive(snapshot)) return {ok:false,reason:'Матч недоступен для Tactical Lab.'};
            const state = ensureAssignment(snapshot);
            if (!state?.assignment) return {ok:false,reason:'Эксперимент ещё не назначен.'};
            if (state.activation || state.completed) return {ok:false,reason:'Эксперимент уже использован в этом матче.'};
            const experiment = experimentFor(state);
            const bridge = STATE.tacticControlBridge;
            if (!experiment || !bridge) return {ok:false,reason:'Механизм применения тактики ещё не готов.'};
            if (!controlsAvailable(experiment.controls)) return {ok:false,reason:'Точные native controls эксперимента ещё недоступны на странице.'};

            const entryContext = buildContext(snapshot);
            const baselineMetrics = metrics(snapshot);
            const beforeTactic = getCurrentTactic();
            const applied = await bridge.applyTacticObject(experiment.controls,{source:`tactical_lab:${experiment.experimentId}`,strict:true});
            if (!applied?.ok) {
                await bridge.applyTacticObject(beforeTactic,{source:`tactical_lab_rollback:${experiment.experimentId}`,strict:false});
                const failedKeys = [...new Set([...(applied?.failures || []), ...(applied?.mismatches || [])])];
                state.lastError = `Controls не применились: ${failedKeys.join(', ') || 'unknown'}`;
                persistState(state);
                renderUI();
                return {ok:false,reason:state.lastError};
            }

            state.activation = {
                status:'active',
                activationId:`tactical_lab_activation|${state.gameId}|${state.assignment.assignmentId}`,
                experimentId:experiment.experimentId,
                startedAtTs:Date.now(),
                startedAtMinute:Number.isFinite(Number(snapshot.minute))?Number(snapshot.minute):null,
                entryContext,
                baselineMetrics
            };
            state.lastError = null;
            persistState(state);
            queueLifecycle(state,'activation',entryContext,{
                tacticFingerprint:experiment.tacticFingerprint,
                genomeFingerprint:experiment.genomeFingerprint,
                origin:experiment.origin,
                parentExperimentId:experiment.parentExperimentId,
                mutationDistance:experiment.mutationDistance,
                applicationScope:'tactical_controls_only'
            });
            renderUI();
            return {ok:true,experimentId:experiment.experimentId};
        }

        async function closeActive(reason, snapshot = null, next = {}) {
            snapshot = snapshot || SnapshotEngine.build();
            const state = loadState(getGameId(snapshot));
            if (!state?.activation || state.activation.status !== 'active') return null;
            const experiment = experimentFor(state);
            if (!experiment) return null;
            const activation = clone(state.activation);
            const exitContext = buildContext(snapshot);
            exitContext.next = {
                presetId:next?.nextPresetId || exitContext.previous?.presetId || null,
                tacticSource:next?.nextTacticSource || 'unknown',
                tacticFingerprint:next?.nextTacticFingerprint || exitContext.previous?.tacticFingerprint || null
            };
            const endMinute = Number.isFinite(Number(snapshot?.minute)) ? Number(snapshot.minute) : null;
            const duration = activation.startedAtMinute != null && endMinute != null ? Math.max(0,endMinute-activation.startedAtMinute) : null;
            const delta = metricDelta(activation.baselineMetrics || {},metrics(snapshot));
            state.completed = {
                experimentId:experiment.experimentId,
                activationId:activation.activationId,
                fromMinute:activation.startedAtMinute,
                toMinute:endMinute,
                durationMinutes:duration,
                exitReason:reason || 'tactic_changed',
                entryContext:clone(activation.entryContext),
                exitContext:clone(exitContext),
                delta,
                completedAt:Date.now()
            };
            state.activation = null;
            persistState(state);
            queueLifecycle(state,'exit',exitContext,{durationMinutes:duration,exitReason:state.completed.exitReason,delta,entryContext:activation.entryContext});
            renderUI();
            return clone(state.completed);
        }

        function isActive() {
            const state = loadState(String(MatchStateParser.getGameId() || ''));
            return state?.activation?.status === 'active';
        }
        async function checkpoint(source = 'explicit_checkpoint', snapshot = null) {
            snapshot = snapshot || SnapshotEngine.build();
            const state = loadState(getGameId(snapshot));
            if (!state?.assignment) return {active:false,completed:null};
            if (state.outbox?.length) void flushOutbox(state);
            if (!state?.activation || state.activation.status !== 'active') {
                renderUI();
                return {active:false,completed:clone(state.completed || null)};
            }
            const experiment = experimentFor(state);
            if (!experiment) return {active:true,completed:null};

            const actual = tacticFingerprint(getCurrentTactic());
            if (actual !== experiment.tacticFingerprint) {
                const completed = await closeActive('tactic_changed_checkpoint', snapshot, {
                    nextTacticSource:String(source || 'explicit_checkpoint'),
                    nextTacticFingerprint:actual
                });
                return {active:false,completed};
            }
            if (snapshot?.status === 'finished') {
                const completed = await closeActive('match_finished', snapshot, {nextTacticSource:'finished'});
                return {active:false,completed};
            }

            renderUI();
            return {active:true,completed:null};
        }
        function renderUI() {
            const panel = document.getElementById(PANEL_ID);
            if (!panel) return;
            const state = loadState(String(MatchStateParser.getGameId() || ''));
            const experiment = experimentFor(state);
            const status = document.getElementById(STATUS_ID);
            const detail = document.getElementById(DETAIL_ID);
            const button = document.getElementById(BUTTON_ID);
            if (!state || !experiment || !status || !detail || !button) return;
            const shortId = experiment.experimentId.replace(`EXP-561-${POPULATION_CODE}-`,'EXP-');
            panel.dataset.experimentId = experiment.experimentId;
            panel.dataset.populationVersion = POPULATION_VERSION;
            if (state.activation?.status === 'active') {
                status.textContent = `● ${shortId} ACTIVE${state.activation.startedAtMinute!=null?` · применён на ${state.activation.startedAtMinute}'`:''}`;
                status.style.color = '#43f58c';
                detail.textContent = 'Эксперимент применён. Следующая проверка — только по ↻ Подсказка, выбору production preset или финальному парсингу.';
                button.disabled = true;
                button.textContent = 'Эксперимент активен';
            } else if (state.completed) {
                status.textContent = `${shortId} протестирован`;
                status.style.color = '#aeb6cf';
                detail.textContent = `${state.completed.fromMinute ?? '?'}' → ${state.completed.toMinute ?? '?'}' · exposure ${state.completed.durationMinutes ?? '?'}m · ${state.completed.exitReason}`;
                button.disabled = true;
                button.textContent = 'Тест завершён';
            } else {
                status.textContent = `${shortId} · blind challenger · Population ${POPULATION_CODE}`;
                status.style.color = '#ffd76a';
                detail.textContent = state.lastError || 'Параметры скрыты. Один клик применит только tactical controls; расстановка игроков не меняется.';
                const ready = !!STATE.tacticControlBridge && controlsAvailable(experiment.controls);
                button.disabled = !ready;
                button.textContent = ready ? 'Применить эксперимент' : 'Тактика загружается…';
            }
        }
        async function mountUI(snapshot = null) {
            if (!location.pathname.includes('/game.php')) return false;
            if (!snapshot) {
                try { snapshot = SnapshotEngine.build(); } catch (_) { return false; }
            }
            if (!isOwnedLive(snapshot)) return false;
            const state = ensureAssignment(snapshot);
            if (!state?.assignment) return false;
            const recommendation = document.getElementById('slf-parser-recommendation');
            const fallback = document.getElementById('slf-match-parser-panel') || document.querySelector('.control_field_1');
            if (!recommendation && !fallback) return false;
            let panel = document.getElementById(PANEL_ID);
            if (!panel) {
                panel = document.createElement('section');
                panel.id = PANEL_ID;
                panel.style.cssText = 'display:flex;align-items:center;gap:7px;flex-wrap:wrap;width:100%;margin:7px 0 0;padding:7px 9px;box-sizing:border-box;background:#141824;border-top:1px solid #6f5c20;border-radius:6px;color:#eef1f8;font-family:Arial,sans-serif;font-size:11px;';
                const title = document.createElement('strong');
                title.textContent = 'Tactical Lab';
                title.style.cssText = 'color:#ffd76a;white-space:nowrap;';
                const status = document.createElement('span'); status.id = STATUS_ID; status.style.cssText = 'font-weight:600;';
                const button = document.createElement('button'); button.id = BUTTON_ID; button.type = 'button'; button.textContent = 'Применить эксперимент';
                button.style.cssText = 'padding:5px 9px;border:1px solid #8b7328;border-radius:7px;background:#2b2718;color:#ffe18a;cursor:pointer;font-weight:600;';
                button.addEventListener('click',async()=>{
                    if (button.disabled) return;
                    button.disabled = true; button.textContent = 'Применяю…';
                    const result = await activate();
                    if (!result?.ok) {
                        const current = loadState(String(MatchStateParser.getGameId() || ''));
                        if (current) { current.lastError = result?.reason || current.lastError || 'Не удалось применить эксперимент.'; persistState(current); }
                    }
                    renderUI();
                });
                const detail = document.createElement('span'); detail.id = DETAIL_ID; detail.style.cssText = 'flex:1 1 100%;color:#aeb6cf;font-size:10px;line-height:1.3;';
                panel.append(title,status,button,detail);
                if (recommendation) recommendation.appendChild(panel);
                else if (fallback?.parentNode) fallback.parentNode.insertBefore(panel,fallback.nextSibling);
            } else if (recommendation && panel.parentElement !== recommendation) {
                recommendation.appendChild(panel);
            }
            renderUI();
            return true;
        }

        function install() {
            if (STATE.tacticalLabRuntime?.schema === 'slf_tactical_lab_runtime_v1' && STATE.tacticalLabRuntime?.populationVersion === POPULATION_VERSION) return true;
            if (typeof SnapshotEngine === 'undefined' || typeof EventTracker === 'undefined' || typeof MatchStateParser === 'undefined') return false;
            population = buildPopulation();
            installPersistBridge();
            installTelemetryBridge();
            STATE.tacticalLabRuntime = {
                schema:'slf_tactical_lab_runtime_v1',
                populationVersion:POPULATION_VERSION,
                populationSize:POPULATION_SIZE,
                getPopulation(){return clone(population);},
                getAssignment(gameId){return clone(loadState(String(gameId||MatchStateParser.getGameId()||''))?.assignment||null);},
                assignForGame(gameId){const experiment=selectExperiment(String(gameId||''));return {experimentId:experiment.experimentId,genomeFingerprint:experiment.genomeFingerprint};},
                activate,closeActive,checkpoint,isActive,mountUI,
                flushOutbox(){return flushOutbox(loadState(String(MatchStateParser.getGameId()||'')));}
            };
            void mountUI();
            const state = loadState(String(MatchStateParser.getGameId() || ''));
            if (state?.outbox?.length) void flushOutbox(state);
            return true;
        }

        const boot = () => {
            if (install()) return;
            let attempts = 0;
            const timer = setInterval(()=>{
                attempts += 1;
                if (install() || attempts >= 40) clearInterval(timer);
            },100);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
        else setTimeout(boot,0);
    })();
