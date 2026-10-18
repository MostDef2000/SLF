// Generator 5.61 Tactical Suite v12 Recommendation Policy
// ============================================================
// The active registry owns tactic data/UI identity. This layer makes the
// registry decision canonical for Coach Mode, progression and telemetry.
// v12 adds the lead_press_hold situation (#361): a pressing lead option
// (Flick_LeadPressHold_v12) for holding a one-goal lead against an opponent
// pressing above plan (opponent press vector >= +20%), with hard gates on the
// 60–85 minute window and a dribble guard for lead situations. v11 guarantees
// stand: no implicit preset fallbacks — when no eligible candidate exists the
// decision is hold_current, a hardcoded preset is never injected.

(function tacticPresetDirectionPolicy() {
    'use strict';

    const VERSION = '5.61-tactical-suite-v12.0';
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
    if (!registry || !engine || window.SLFTacticDirectionPolicy?.version === VERSION) return;

    // v12 install guard: the policy only installs on a registry that carries the v12 suite
    // identity. SUITE must NOT be derived before this check, otherwise a stale v11 registry
    // would satisfy a self-referential comparison and silently install a mixed stack.
    const EXPECTED_SUITE = 'slf_tactic_suite_561_v12';
    if (registry.suiteVersion !== EXPECTED_SUITE) return;
    const SUITE = registry.suiteVersion;
    const SCHEMA = registry.recommendationSchema;
    const ACTIVE = Array.isArray(registry.active) ? registry.active.slice() : [];
    const ACTIVE_SET = new Set(ACTIVE);
    const DEFAULT_RISK = registry.defaultRiskAppetite || 'standard';

    const STEP = {"Arteta_SafePossession_v11":["Emery_BalancedBase_v11"],"Guardiola_PressEscape_v11":["Emery_BalancedBase_v11","Mourinho_CleanCounter_v11","Guardiola_PressCooldown_v11"],"Guardiola_PressCooldown_v11":["Guardiola_PressEscape_v11","Emery_BalancedBase_v11","Allegri_LeadOutlet_v11"],"Guardiola_ControlledPush_v11":["Guardiola_PositionalSiege_v11","Conte_WideChannels_v11"],"Guardiola_PositionalSiege_v11":["Guardiola_ControlledPush_v11","Conte_WideChannels_v11","Klopp_LateGegenpress_v11"],"Conte_WideChannels_v11":["Guardiola_ControlledPush_v11","Guardiola_PositionalSiege_v11","Emery_BalancedBase_v11"],"Klopp_LateGegenpress_v11":["Guardiola_PositionalSiege_v11","Guardiola_ControlledPush_v11"],"Simeone_CompactLead_v11":["Allegri_LeadOutlet_v11","Simeone_EmergencyBlock_v11","Flick_LeadPressHold_v12"],"Simeone_EmergencyBlock_v11":["Simeone_CompactLead_v11","Allegri_LeadOutlet_v11"],"Emery_BalancedBase_v11":["Arteta_SafePossession_v11","Guardiola_PressEscape_v11","Mourinho_CleanCounter_v11","Allegri_LeadOutlet_v11","Guardiola_ControlledPush_v11","Conte_WideChannels_v11"],"Mourinho_CleanCounter_v11":["Emery_BalancedBase_v11","Guardiola_PressEscape_v11","Guardiola_ControlledPush_v11"],"Allegri_LeadOutlet_v11":["Simeone_CompactLead_v11","Emery_BalancedBase_v11","Guardiola_PressCooldown_v11","Flick_LeadPressHold_v12"],"Flick_LeadPressHold_v12":["Allegri_LeadOutlet_v11","Simeone_CompactLead_v11"]};

    const SCORE_BY_SITUATION = {"default_start":{"Emery_BalancedBase_v11":85,"Guardiola_PressEscape_v11":30},"pressure_escape":{"Guardiola_PressEscape_v11":82,"Emery_BalancedBase_v11":48,"Guardiola_PressCooldown_v11":25},"pressure_counter":{"Mourinho_CleanCounter_v11":85,"Guardiola_PressEscape_v11":46,"Emery_BalancedBase_v11":40},"press_cooldown":{"Guardiola_PressCooldown_v11":80,"Guardiola_PressEscape_v11":42,"Emery_BalancedBase_v11":35},"controlled_chase":{"Guardiola_ControlledPush_v11":75,"Emery_BalancedBase_v11":30,"Guardiola_PositionalSiege_v11":20},"positional_siege":{"Guardiola_PositionalSiege_v11":77,"Guardiola_ControlledPush_v11":49,"Conte_WideChannels_v11":33},"width_attack":{"Conte_WideChannels_v11":78,"Guardiola_ControlledPush_v11":38,"Guardiola_PositionalSiege_v11":25},"late_high_pressure":{"Klopp_LateGegenpress_v11":80,"Guardiola_ControlledPush_v11":55,"Guardiola_PositionalSiege_v11":44},"protect_lead":{"Simeone_CompactLead_v11":78,"Allegri_LeadOutlet_v11":68,"Emery_BalancedBase_v11":30},"protect_lead_with_outlet":{"Allegri_LeadOutlet_v11":86,"Simeone_CompactLead_v11":48,"Emery_BalancedBase_v11":35},"emergency_lock":{"Simeone_EmergencyBlock_v11":85,"Allegri_LeadOutlet_v11":44,"Simeone_CompactLead_v11":42},"lead_press_hold":{"Flick_LeadPressHold_v12":80,"Allegri_LeadOutlet_v11":45,"Simeone_CompactLead_v11":35,"Emery_BalancedBase_v11":30}};

    // Old stored progression IDs must resolve to the same v10 tactical vector.
    // Only aliases are mapped; unknown/custom names are never promoted.
    const resolvePresetId = name => registry.resolvePresetId ? registry.resolvePresetId(name) : name;

    function has(context, key) {
        return Array.isArray(context?.signals) && context.signals.includes(key)
            || Array.isArray(context?.tags) && context.tags.includes(key);
    }

    function normalizedContext(context = {}) {
        const scoreState = context.score?.state || context.scoreState || 'unknown';
        const minute = Number(context.minute || 0);
        // Positive scoreDiff = we lead (getScoreDiff convention); 0 when unknown.
        const scoreDiff = Number(context.scoreDiff ?? context.score?.diff ?? 0);
        const myBad = Number(context.myBad || context.myBadActionsPct || 0);
        const drop = Number(context.myPowerDropPct || 0);
        const underPressure = context.underPressure === true || has(context, 'under_pressure') || has(context, 'transition_threat') || has(context, 'opponent_high_press');
        const counterExitAvailable = context.counterExitAvailable === true || has(context, 'counter_exit_available') || has(context, 'space_behind_press') || has(context, 'clean_first_pass');
        const counterExitBlocked = context.counterExitAvailable === false || context.counterExitBlocked === true || has(context, 'counter_exit_blocked') || has(context, 'first_pass_trapped') || has(context, 'sustained_siege');
        const pressFatigueRisk = context.pressFatigueRisk === true || context.pressFatigue?.active === true || has(context, 'press_fatigue_risk') || drop >= 4;
        const highBadActions = context.highBadActions === true || has(context, 'high_bad_actions') || myBad >= 20;
        const lowBadActions = context.lowBadActions === true || has(context, 'low_bad_actions') || (myBad > 0 && myBad <= 16);
        const transitionThreat = context.transitionThreat === true || has(context, 'transition_threat');
        const centerClosed = context.centerClosed === true || has(context, 'center_closed') || has(context, 'opponent_low_block');
        const wideQuality = context.wideQuality === true || has(context, 'wide_quality') || has(context, 'attack_left') || has(context, 'attack_right');
        const ownCrossesBad = context.ownCrossesBad === true || has(context, 'own_open_play_crosses_bad') || has(context, 'own_crosses_bad_total');
        const opponentCrossesDangerous = context.opponentCrossesDangerous === true || has(context, 'opponent_crosses_dangerous');
        const attackingMomentum = context.attackingMomentum === true || has(context, 'attacking_momentum');
        const attackNeed = Number(context.attackNeed || 0);
        const pressureRisk = Number(context.pressureRisk || 0);
        // #361 context contract: opponentPressVector is the opponent's pressing
        // vector percentage read from the match page stats table. Production
        // mapping: match-stats-parser.js reads the native `press_height` column
        // into team.pressVector; cah-runtime-context exposes it to this policy as
        // moment.context.oppPressVector (alias oppPress from the coach-hint
        // snapshot layer). Direct callers may pass opponentPressVector explicitly.
        const opponentPressVector = Number(context.opponentPressVector ?? context.oppPressVector ?? context.oppPress ?? 0);
        const emergencyLockRequired = underPressure && !counterExitAvailable && (context.ownRedCard || highBadActions || drop >= 5 || pressureRisk >= 82 || has(context, 'sustained_siege'));
        return Object.assign({}, context, {
            scoreState, minute, scoreDiff, myBad, myPowerDropPct:drop, underPressure,
            counterExitAvailable, counterExitBlocked, pressFatigueRisk,
            highBadActions, lowBadActions, transitionThreat, centerClosed,
            wideQuality, ownCrossesBad, opponentCrossesDangerous,
            attackingMomentum, attackNeed, pressureRisk, opponentPressVector, emergencyLockRequired
        });
    }

    function classify(context = {}) {
        const c = normalizedContext(context);
        if (c.emergencyLockRequired || (c.scoreState === 'winning' && c.minute >= 84 && c.underPressure && c.pressureRisk >= 55)) return 'emergency_lock';
        if (c.pressFatigueRisk && !(c.scoreState === 'losing' && c.minute >= 70)) return 'press_cooldown';
        // v12 (#361): ведём счёт против соперника, прессингующего выше плана
        // (вектор прессинга соперника >= +20%) — активное прессующее удержание
        // вместо пассивного блока, окно 60–85 минут.
        if (c.scoreState === 'winning' && c.minute >= 60 && c.minute <= 85 && c.opponentPressVector >= 20) return 'lead_press_hold';
        if (c.scoreState === 'winning' && c.minute >= 65) {
            return c.counterExitAvailable && !c.counterExitBlocked && !c.highBadActions
                ? 'protect_lead_with_outlet' : 'protect_lead';
        }
        // Never choose counter from pressure alone: the clean first pass
        // must be explicitly observable, and pressure/fatigue vetoes apply.
        if (c.underPressure) {
            if (c.counterExitAvailable && !c.counterExitBlocked && !c.highBadActions && !c.pressFatigueRisk)
                return 'pressure_counter';
            return 'pressure_escape';
        }
        if (c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous) return 'width_attack';
        if (c.scoreState === 'losing' && c.minute >= 72 && c.attackNeed >= 65 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat) return 'late_high_pressure';
        if ((c.attackingMomentum || c.attackNeed >= 58) && c.minute >= 55 && !c.transitionThreat && !c.highBadActions && !c.pressFatigueRisk) return 'positional_siege';
        if ((c.scoreState === 'losing' && c.minute >= 45) || c.attackNeed >= 38) return 'controlled_chase';
        const strengthGap = Number(c.strengthGap ?? c.myStrengthGap ?? 0);
        if (c.transitionThreat || (Number.isFinite(strengthGap) && strengthGap <= -8) || has(c, 'opponent_stronger')) return 'pressure_escape';
        return 'default_start';
    }

    function currentRisk() {
        try {
            const value = window.localStorage?.getItem('slf:tactics:risk-appetite');
            return ['conservative','standard','bold','experimental'].includes(value) ? value : DEFAULT_RISK;
        } catch (_) {
            return DEFAULT_RISK;
        }
    }

    function hardVeto(name, context = {}) {
        name = resolvePresetId(name);
        const c = normalizedContext(context);
        const situation = classify(c);
        const reasons = [];
        if (!ACTIVE_SET.has(name)) reasons.push('preset отсутствует в active registry');
        if (name === 'Arteta_SafePossession_v11') reasons.push('Arteta только ручная диагностика; нельзя рекомендовать автоматически');
        if (name === 'Simeone_EmergencyBlock_v11' && situation !== 'emergency_lock') reasons.push('Low Block только временный emergency lock');
        if (name === 'Mourinho_CleanCounter_v11' && (!c.underPressure || !c.counterExitAvailable || c.counterExitBlocked || c.highBadActions || c.pressFatigueRisk)) reasons.push('Контратака только с подтверждённым чистым выходом');
        if (name === 'Allegri_LeadOutlet_v11' && (c.scoreState !== 'winning' || !c.counterExitAvailable || c.counterExitBlocked || c.highBadActions)) reasons.push('Удержание с выходом только при преимуществе и доступном первом пасе');
        if (name === 'Simeone_CompactLead_v11' && c.scoreState === 'losing') reasons.push('Compact Lead запрещён при проигрыше');
        if (name === 'Guardiola_PressCooldown_v11' && c.scoreState === 'losing' && c.minute >= 70 && c.attackNeed >= 55) reasons.push('поздний проигрыш требует продвижения, а не cooldown');
        if (name === 'Guardiola_PositionalSiege_v11' && (c.transitionThreat || c.underPressure || c.pressFatigueRisk || c.highBadActions)) reasons.push('Positional Siege запрещён при transition threat/fatigue/браке');
        if (name === 'Klopp_LateGegenpress_v11' && !['late_high_pressure'].includes(situation)) reasons.push('Klopp только поздняя погоня');
        if (name === 'Klopp_LateGegenpress_v11' && (c.pressFatigueRisk || c.highBadActions || c.ownRedCard || c.myPowerDropPct >= 5)) reasons.push('дорогой прессинг запрещён по fatigue/браку/удалению');
        if (c.scoreState === 'winning' && c.minute >= 70 && ['Klopp_LateGegenpress_v11','Guardiola_PositionalSiege_v11'].includes(name)) reasons.push('позднее преимущество не требует high/all-in риска');
        // v12 (#361) — (a) Lead Press Hold: только при удержании преимущества
        // в окне 60–85 минут против соперника, прессингующего выше плана
        // (вектор прессинга соперника >= +20%).
        if (name === 'Flick_LeadPressHold_v12' && !(c.scoreState === 'winning' && c.minute >= 60 && c.minute <= 85 && c.opponentPressVector >= 20)) reasons.push('прессующее удержание только при преимуществе в окне 60–85 минут против вектора прессинга соперника ≥ +20%');
        // v12 (#361) — (b) Compact Lead против прессинга выше плана: глубокий блок
        // отдаёт территорию и опасен со стандартов. Остаётся валиден после 85-й,
        // при преимуществе в два и более гола и в emergency_lock.
        if (name === 'Simeone_CompactLead_v11' && situation !== 'emergency_lock' && c.scoreState === 'winning' && c.scoreDiff <= 1 && c.minute >= 60 && c.minute <= 85 && c.opponentPressVector >= 20) reasons.push('против прессинга выше плана компактный блок отдаёт территорию и опасен со стандартов');
        // v12 (#361) — (c) dribble guard: в ситуациях удержания пресеты с
        // дриблингом ≤1 не удерживают мяч против высокого прессинга.
        const dribbleValue = Number(registry.presets?.[name]?.dribble);
        if (['lead_press_hold','protect_lead','protect_lead_with_outlet'].includes(situation) && Number.isFinite(dribbleValue) && dribbleValue <= 1) reasons.push('в ситуациях удержания дриблинг ≤1 отдаёт мяч и территорию');
        return { vetoed:reasons.length > 0, reasons };
    }

    function riskDelta(name, appetite) {
        const high = ['Guardiola_PositionalSiege_v11','Klopp_LateGegenpress_v11'].includes(name);
        const attack = ['Guardiola_ControlledPush_v11','Guardiola_PositionalSiege_v11','Conte_WideChannels_v11','Klopp_LateGegenpress_v11'].includes(name);
        if (appetite === 'conservative') return high ? -8 : attack ? -3 : 0;
        if (appetite === 'bold') return high ? 4 : attack ? 2 : 0;
        if (appetite === 'experimental') return high ? 7 : attack ? 4 : 0;
        return 0;
    }

    function scoreCandidate(name, context = {}, situation = classify(context)) {
        name = resolvePresetId(name);
        const c = normalizedContext(context);
        const veto = hardVeto(name, c);
        if (veto.vetoed) {
            return { preset:name, score:-999, rawScore:-999, vetoed:true, vetoReasons:veto.reasons, reasons:[], parts:{rulePrior:0,contextFit:0,riskAdjustment:0,boundedEvidenceAdjustment:0} };
        }

        const situationFit = Number(SCORE_BY_SITUATION[situation]?.[name] || 0);
        const appetite = currentRisk();
        const riskAppetite = riskDelta(name, appetite);
        const boundedEvidenceAdjustment = Number(registry.evidenceAdjustment?.({ preset:name, situation, context:c }) || 0);
        const score = situationFit + riskAppetite + boundedEvidenceAdjustment;
        const reasons = [];
        if (situationFit) reasons.push({ key:'rulePrior', delta:situationFit, reason:`роль совпадает с ситуацией ${situation}` });
        if (riskAppetite) reasons.push({ key:'riskAdjustment', delta:riskAppetite, reason:`профиль риска ${appetite}` });
        if (boundedEvidenceAdjustment) reasons.push({ key:'boundedEvidenceAdjustment', delta:boundedEvidenceAdjustment, reason:'ограниченная evidence-поправка (issue #325)' });
        return {
            preset:name,
            score,
            rawScore:score,
            vetoed:false,
            vetoReasons:[],
            reasons,
            parts:{ rulePrior:situationFit, contextFit:0, riskAdjustment:riskAppetite, boundedEvidenceAdjustment }
        };
    }

    function rank(context = {}) {
        const c = normalizedContext(context);
        const situation = classify(c);
        const all = ACTIVE.map(name => scoreCandidate(name, c, situation));
        const eligible = all.filter(item => !item.vetoed && item.parts.rulePrior > 0)
            .sort((a, b) => b.score - a.score || a.preset.localeCompare(b.preset));
        return { context:c, situation, all, eligible };
    }

    function choose(context = {}) {
        const ranked = rank(context);
        // v11: no implicit preset fallback — без безопасного кандидата решение hold_current.
        if (!ranked.eligible[0]) {
            return {
                name:null,
                situation:ranked.situation,
                reason:'Нет безопасной рекомендации — оставить текущую тактику',
                selected:null,
                runnerUp:ranked.eligible[0]||null,
                margin:0,
                confidence:'low',
                hold:true,
                fallbackReason:'no_eligible_candidate',
                candidates:ranked.all
            };
        }
        const selected = ranked.eligible[0];
        const runnerUp = ranked.eligible[1] || null;
        const margin = runnerUp ? selected.score - runnerUp.score : selected.score;
        return {
            name:selected.preset,
            situation:ranked.situation,
            reason:`${ranked.situation}: ${registry.meta?.[selected.preset]?.use || 'tactical suite v11'}`,
            selected,
            runnerUp,
            margin,
            confidence:margin >= 25 ? 'high' : margin >= 12 ? 'medium' : 'low',
            candidates:ranked.all
        };
    }

    function shortestStep(from, to) {
        from = resolvePresetId(from);
        to = resolvePresetId(to);
        if (!from || !to || from === to || !STEP[from] || !STEP[to]) return to;
        const queue = [[from]];
        const seen = new Set([from]);
        while (queue.length) {
            const path = queue.shift();
            const node = path[path.length - 1];
            for (const next of STEP[node] || []) {
                if (seen.has(next) || (next === 'Arteta_SafePossession_v11' && to !== next)) continue;
                const candidate = path.concat(next);
                if (next === to) return candidate[1] || to;
                seen.add(next);
                queue.push(candidate);
            }
        }
        return to;
    }

    function stamp(snapshot, decision, name) {
        if (!snapshot || typeof snapshot !== 'object') return;
        snapshot.ruleDecision = decision || snapshot.ruleDecision || null;
        snapshot.tacticTelemetry = Object.assign({}, snapshot.tacticTelemetry || {}, {
            libraryVersion:SUITE,
            recommendationSchema:SCHEMA,
            riskAppetite:currentRisk(),
            recommendedPreset:name || (decision?.action?.preset && ACTIVE_SET.has(decision.action.preset) ? decision.action.preset : null)
        });
    }

    const originalRun = engine.run.bind(engine);
    engine.run = function runTacticalSuiteV11(snapshot, context = {}) {
        const result = originalRun(snapshot, context) || {};
        const mergedContext = Object.assign({}, result?.moment?.context || {}, context);
        const selected = choose(mergedContext);
        result.schema = SCHEMA;
        result.situationKey = selected.situation;
        result.libraryVersion = SUITE;
        result.riskAppetite = currentRisk();
        result.margin = selected.margin;
        result.confidence = Object.assign({}, result.confidence || {}, { level:selected.confidence, gap:selected.margin });
        result.runnerUp = selected.runnerUp ? { preset:selected.runnerUp.preset, score:selected.runnerUp.score } : null;
        if (selected.hold) {
            // v11: без production fallback — держим текущую тактику, пресет не подставляем.
            result.action = {
                preset:null,
                rawPreset:null,
                decision:'hold_current',
                ruleId:'suite_v11_hold_current',
                reason:selected.reason,
                fallbackReason:'no_eligible_candidate',
                guardType:'hold_current',
                guardReason:'no production preset fallback is allowed',
                score:0,
                riskAppetite:result.riskAppetite,
                libraryVersion:SUITE,
                recommendationSchema:SCHEMA
            };
        } else {
            result.action = Object.assign({}, result.action || {}, {
                preset:selected.name,
                rawPreset:selected.name,
                score:selected.selected.score,
                decision:selected.situation,
                ruleId:`suite_v11_${selected.situation}`,
                reason:selected.reason,
                riskAppetite:result.riskAppetite,
                libraryVersion:SUITE,
                recommendationSchema:SCHEMA,
                guardType:'suite_v11_selection',
                guardReason:'central tactical suite v11 ranking'
            });
        }
        result.candidates = selected.candidates.slice().sort((a, b) => {
            if (a.vetoed !== b.vetoed) return a.vetoed ? 1 : -1;
            return b.score - a.score || a.preset.localeCompare(b.preset);
        });
        result.vetoedPresets = Object.fromEntries(result.candidates.filter(item => item.vetoed).map(item => [item.preset, item.vetoReasons]));
        result.telemetry = Object.assign({}, result.telemetry || {}, {
            recommendedPreset:selected.hold ? null : selected.name,
            libraryVersion:SUITE,
            recommendationSchema:SCHEMA,
            riskAppetite:result.riskAppetite
        });
        if (selected.hold) result.telemetry.recommendationState = 'fallback_hold';
        stamp(snapshot, result, selected.hold ? null : selected.name);
        return result;
    };

    engine.schema = SCHEMA;
    engine.ACTIVE_PRESETS = ACTIVE.slice();
    engine.__tacticSuiteV7Installed = true;
    engine.__tacticSuiteV8Installed = true;
    engine.__tacticSuiteV11Installed = true;
    engine.__generator561RuleScorerApplied = true;
    engine.__generator561PressureResponseApplied = true;

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
        const originalGuard = typeof RecommendationEngine.applyProgressionGuard === 'function' ? RecommendationEngine.applyProgressionGuard : null;
        RecommendationEngine.getPresetLadder = group => (registry.ladders?.[group] || []).slice();
        RecommendationEngine.getAdjacentPresetInFamily = (current, desired) => {
            const step = shortestStep(current, desired);
            return ACTIVE_SET.has(step) ? step : desired;
        };
        RecommendationEngine.selectRawPreset = function selectSuiteV11(snapshot, state = {}) {
            const decision = window.SLFCurrentActionHintEngine?.run ? window.SLFCurrentActionHintEngine.run(snapshot || {}, state || {}) : null;
            // v11: no implicit preset fallback — невалидное/отсутствующее решение означает hold_current.
            const preset = resolvePresetId(decision?.action?.preset);
            if (decision?.action && preset !== decision.action.preset) decision.action.preset = preset;
            if (!decision || !ACTIVE_SET.has(preset)) {
                stamp(snapshot, decision, null);
                return { name:null, reason:'hold_current: no valid suite decision', ruleDecision:decision, progressionAction:'hold_current', fallbackReason:decision ? 'invalid_preset' : 'no_decision' };
            }
            stamp(snapshot, decision, preset);
            return { name:preset, reason:decision.action.reason || 'tactical suite v11', ruleDecision:decision, progressionAction:'suite_v11_scored' };
        };
        if (originalGuard) RecommendationEngine.applyProgressionGuard = function applySuiteV11Guard(candidate, snapshot, context = {}) {
            if (candidate?.name) {
                const canonical = resolvePresetId(candidate.name);
                if (canonical !== candidate.name) candidate = Object.assign({}, candidate, { name:canonical });
            }
            if (!candidate?.name || !ACTIVE_SET.has(candidate.name) || !snapshot || snapshot.status === 'finished') return candidate;
            const targetPreset = candidate.name;
            let guarded = ['Simeone_EmergencyBlock_v11'].includes(candidate.name) || context?.urgency?.overrideProgressionGuard === true
                ? Object.assign({}, candidate, { progressionAction:'emergency_override' })
                : (originalGuard.call(this, candidate, snapshot, context) || candidate);
            if (!ACTIVE_SET.has(guarded?.name)) guarded = candidate;
            if (snapshot?.ruleDecision?.action) {
                snapshot.ruleDecision.action.rawPreset = targetPreset;
                snapshot.ruleDecision.action.preset = guarded.name;
                snapshot.ruleDecision.action.reason = guarded.reason || candidate.reason;
                snapshot.ruleDecision.action.guardType = guarded.progressionAction || 'selected';
                snapshot.ruleDecision.action.guardReason = guarded.reason || candidate.reason;
                snapshot.ruleDecision.action.libraryVersion = SUITE;
                snapshot.ruleDecision.action.recommendationSchema = SCHEMA;
                snapshot.ruleDecision.telemetry = Object.assign({}, snapshot.ruleDecision.telemetry || {}, { recommendedPreset:guarded.name });
            }
            stamp(snapshot, snapshot?.ruleDecision || candidate.ruleDecision, guarded.name);
            return guarded;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561PressureResponseApplied = true;
        RecommendationEngine.__tacticSuiteV7Installed = true;
        RecommendationEngine.__tacticSuiteV8Installed = true;
        RecommendationEngine.__tacticSuiteV11Installed = true;
    }

    if (typeof BASE_PRESETS !== 'undefined' && BASE_PRESETS) {
        Object.entries(registry.presets || {}).forEach(([name, preset]) => {
            BASE_PRESETS[name] = Object.assign({}, preset, { priority:(preset.priority || []).slice() });
        });
    }
    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        TacticPresetLibrary.meta = Object.assign({}, registry.meta || {});
        TacticPresetLibrary.traits = Object.assign({}, registry.traits || {});
        TacticPresetLibrary.schemeStates = Object.assign({}, registry.schemeStates || {});
        TacticPresetLibrary.presetSchemeState = Object.assign({}, registry.presetSchemeState || {});
    }

    registry.ruleDecisionSchema = SCHEMA;
    registry.defaultRiskAppetite = DEFAULT_RISK;
    window.SLFTacticDirectionPolicy = {
        version:VERSION,
        suiteVersion:SUITE,
        recommendationSchema:SCHEMA,
        generatorVersion:'5.61',
        autoApply:false,
        activePresets:ACTIVE.slice(),
        defaultRiskAppetite:DEFAULT_RISK,
        deriveSuiteContext:normalizedContext,
        classifySituation:classify,
        hardVeto,
        scoreCandidate,
        rank,
        shortestStep,
        preferredPreset:situation => {
            const scores = SCORE_BY_SITUATION[situation] || {};
            // v11: no implicit preset fallback — пустая таблица означает null.
            return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        },
        evaluate:(snapshot={}, context={}) => window.SLFCurrentActionHintEngine?.run ? window.SLFCurrentActionHintEngine.run(snapshot, context) : null
    };
})();