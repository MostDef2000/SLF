// Generator 5.61 Tactical Suite v7 Recommendation Policy
// ============================================================
// One deterministic tactical decision owner for the active registry.
// The registry owns tactic data/UI identity; this layer owns eligibility,
// scoring, progression and recommendation telemetry. It never auto-applies.

(function tacticPresetDirectionPolicy() {
    'use strict';

    const POLICY_VERSION = '5.61-tactical-suite-v7';
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    if (!registry || window.SLFTacticDirectionPolicy?.version === POLICY_VERSION) return;
    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;

    const SUITE_VERSION = registry.suiteVersion || 'slf_tactic_suite_561_v7';
    const RECOMMENDATION_SCHEMA = registry.recommendationSchema || 'slf_rule_decision_v7_tactical_suite';
    const ACTIVE_PRESETS = Array.isArray(registry.active) ? registry.active.slice() : [];
    const ACTIVE_SET = new Set(ACTIVE_PRESETS);
    const REMOVED_SET = new Set(Array.isArray(registry.removed) ? registry.removed : []);
    const DEFAULT_RISK_APPETITE = registry.defaultRiskAppetite || 'standard';
    const TACTIC_KEYS = [
        'def_line','press_line','def_width','press_intense','build_type','build_temp',
        'build_long','build_fast','style','pass_risk','dribble','cross','shot'
    ];

    const RISK_APPETITES = {
        conservative: { attackBonus:-4, highPressBonus:-8, emergencyBonus:-4 },
        standard: { attackBonus:0, highPressBonus:0, emergencyBonus:0 },
        bold: { attackBonus:3, highPressBonus:2, emergencyBonus:1 },
        experimental: { attackBonus:5, highPressBonus:4, emergencyBonus:3 }
    };

    const SITUATION_PREFS = {
        stable_control: {
            Arteta_Control433_bal3: 42,
            Pep_BoxControl_bal2: 18,
            Pep_ControlledPush_att3: 6
        },
        pressure_escape: {
            Pep_BoxControl_bal2: 48,
            Arteta_Control433_bal3: 14,
            Pep_PressCooldown_bal2: 10
        },
        pressure_counter: {
            Compact_Counter_def3: 46,
            Pep_BoxControl_bal2: 17,
            Arteta_Control433_bal3: 8
        },
        press_cooldown: {
            Pep_PressCooldown_bal2: 50,
            Pep_BoxControl_bal2: 22,
            Arteta_Control433_bal3: 12
        },
        controlled_chase: {
            Pep_ControlledPush_att3: 48,
            Pep_TwoThreeFive_att3: 20,
            Arteta_Control433_bal3: 5
        },
        positional_siege: {
            Pep_TwoThreeFive_att3: 48,
            Pep_ControlledPush_att3: 24,
            Conte_WingbackWidth_bal4: 12
        },
        width_attack: {
            Conte_WingbackWidth_bal4: 50,
            Pep_ControlledPush_att3: 18,
            Pep_TwoThreeFive_att3: 12
        },
        protect_lead: {
            Simeone_Compact442_def4: 48,
            Arteta_Control433_bal3: 26,
            Pep_PressCooldown_bal2: 10
        },
        emergency_lock: {
            Simeone_LowBlock_def5: 60,
            Simeone_Compact442_def4: 20,
            Pep_BoxControl_bal2: 8
        },
        late_high_pressure: {
            Klopp_Gegenpress_att4: 54,
            Pep_ControlledPush_att3: 28,
            Pep_TwoThreeFive_att3: 22
        },
        final_all_in: {
            Bielsa_ChaosPress_att5: 64,
            Klopp_Gegenpress_att4: 30,
            Pep_ControlledPush_att3: 18
        }
    };

    const SITUATION_REASONS = {
        stable_control: 'нет сильного сигнала для риска — держим структурный baseline',
        pressure_escape: 'давление без подтверждённого outlet — нужен press-resistant выход через контроль',
        pressure_counter: 'подтверждён безопасный первый выход за прессинг — разрешена контратака',
        press_cooldown: 'цена прессинга выросла — сначала восстанавливаем структуру и физику',
        controlled_chase: 'нужен гол — первая ступень усиления без all-in',
        positional_siege: 'атакующий momentum и контролируемые переходы позволяют позиционный дожим',
        width_attack: 'центр закрыт, но подтверждена качественная ширина',
        protect_lead: 'позднее преимущество — снижаем transition risk без полного автобуса',
        emergency_lock: 'критическая осада без выхода — временный emergency lock на один цикл',
        late_high_pressure: 'поздняя погоня при приемлемой цене прессинга — можно поднять давление',
        final_all_in: 'последнее окно проигрываемого матча — разрешён финальный all-in'
    };

    const STEP_GRAPH = {
        Arteta_Control433_bal3: ['Pep_BoxControl_bal2','Pep_ControlledPush_att3','Simeone_Compact442_def4','Conte_WingbackWidth_bal4'],
        Pep_BoxControl_bal2: ['Arteta_Control433_bal3','Pep_PressCooldown_bal2','Compact_Counter_def3'],
        Pep_PressCooldown_bal2: ['Pep_BoxControl_bal2','Arteta_Control433_bal3'],
        Compact_Counter_def3: ['Pep_BoxControl_bal2','Arteta_Control433_bal3'],
        Pep_ControlledPush_att3: ['Arteta_Control433_bal3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4'],
        Pep_TwoThreeFive_att3: ['Pep_ControlledPush_att3','Klopp_Gegenpress_att4','Conte_WingbackWidth_bal4'],
        Conte_WingbackWidth_bal4: ['Arteta_Control433_bal3','Pep_ControlledPush_att3','Pep_TwoThreeFive_att3'],
        Klopp_Gegenpress_att4: ['Pep_TwoThreeFive_att3','Bielsa_ChaosPress_att5'],
        Bielsa_ChaosPress_att5: ['Klopp_Gegenpress_att4'],
        Simeone_Compact442_def4: ['Arteta_Control433_bal3','Simeone_LowBlock_def5'],
        Simeone_LowBlock_def5: ['Simeone_Compact442_def4']
    };

    function finite(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clamp(value, min = 0, max = 100) {
        return Math.max(min, Math.min(max, finite(value)));
    }

    function round(value, digits = 2) {
        const factor = 10 ** digits;
        return Math.round(finite(value) * factor) / factor;
    }

    function hasSignal(signals, name) {
        return Array.isArray(signals?.signals) && signals.signals.includes(name);
    }

    function hasAnySignal(signals, names) {
        return names.some(name => hasSignal(signals, name));
    }

    function normalizeRiskAppetite(value) {
        const key = String(value || '').toLowerCase();
        return RISK_APPETITES[key] ? key : DEFAULT_RISK_APPETITE;
    }

    function resolveRiskAppetite(snapshot, context) {
        const explicit = context?.riskAppetite || snapshot?.riskAppetite;
        if (explicit) return normalizeRiskAppetite(explicit);
        try { return normalizeRiskAppetite(localStorage.getItem('slf:tactics:risk-appetite')); }
        catch (_) { return DEFAULT_RISK_APPETITE; }
    }

    function deriveSuiteContext(signals = {}) {
        const scoreState = String(signals.scoreState || signals.score?.state || 'unknown');
        const minute = finite(signals.minute);
        const myBad = finite(signals.myBad);
        const myPowerDropPct = finite(signals.myPowerDropPct);
        const underPressure = signals.underPressure === true || hasAnySignal(signals, ['under_pressure','transition_threat','opponent_high_press']);
        const transitionThreat = signals.transitionThreat === true || hasAnySignal(signals, ['transition_threat','opponent_fast_counter_threat']);
        const opponentHighPress = signals.opponentHighPress === true || hasSignal(signals, 'opponent_high_press');
        const counterExitAvailable = signals.counterExitAvailable === true || hasAnySignal(signals, ['counter_exit_available','space_behind_press','clean_first_pass','space_behind']);
        const counterExitBlocked = signals.counterExitAvailable === false || signals.counterExitBlocked === true || hasAnySignal(signals, ['counter_exit_blocked','first_pass_trapped','isolated_forward','sustained_siege']);
        const pressFatigueRisk = signals.pressFatigueRisk === true || hasAnySignal(signals, ['press_fatigue_risk','own_press_fatigue','press_cost_high']) || myPowerDropPct >= 4;
        const highBadActions = signals.highBadActions === true || hasSignal(signals, 'high_bad_actions') || myBad >= 20;
        const lowBadActions = signals.lowBadActions === true || hasSignal(signals, 'low_bad_actions') || (myBad > 0 && myBad <= 16);
        const attackingMomentum = signals.attackingMomentum === true || hasSignal(signals, 'attacking_momentum');
        const centerClosed = signals.centerClosed === true || hasAnySignal(signals, ['center_closed','opponent_low_block']);
        const wideQuality = signals.wideQuality === true || hasAnySignal(signals, ['wide_quality','wide_advantage','attack_left','attack_right']);
        const ownCrossesBad = signals.ownCrossesBad === true || hasAnySignal(signals, ['own_open_play_crosses_bad','own_crosses_bad_total']);
        const opponentCrossesDangerous = signals.opponentCrossesDangerous === true || hasSignal(signals, 'opponent_crosses_dangerous');
        const attackNeed = finite(signals.attackNeed);
        const pressureRisk = finite(signals.pressureRisk);
        const emergencyLockRequired = underPressure && !counterExitAvailable && (
            signals.ownRedCard === true || highBadActions || myPowerDropPct >= 5 || pressureRisk >= 82 || hasSignal(signals, 'sustained_siege')
        );

        return {
            scoreState,
            minute,
            attackNeed,
            pressureRisk,
            myBad,
            myPowerDropPct,
            underPressure,
            transitionThreat,
            opponentHighPress,
            counterExitAvailable,
            counterExitBlocked,
            pressFatigueRisk,
            highBadActions,
            lowBadActions,
            attackingMomentum,
            centerClosed,
            wideQuality,
            ownCrossesBad,
            opponentCrossesDangerous,
            emergencyLockRequired,
            needGoal: scoreState === 'losing' && minute >= 45,
            lateNeedGoal: scoreState === 'losing' && minute >= 72,
            protectLead: scoreState === 'winning' && minute >= 65
        };
    }

    function classifySituation(signals = {}) {
        const c = deriveSuiteContext(signals);
        if (c.scoreState === 'losing' && c.minute >= 84 && c.attackNeed >= 75 && c.lowBadActions && !c.pressFatigueRisk) return 'final_all_in';
        if (c.emergencyLockRequired || (c.scoreState === 'winning' && c.minute >= 84 && c.underPressure && c.pressureRisk >= 55)) return 'emergency_lock';
        if (c.pressFatigueRisk && !(c.scoreState === 'losing' && c.minute >= 70)) return 'press_cooldown';
        if (c.protectLead) return 'protect_lead';
        if (c.underPressure || c.transitionThreat || c.opponentHighPress) {
            return c.counterExitAvailable && !c.counterExitBlocked ? 'pressure_counter' : 'pressure_escape';
        }
        if (c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous) return 'width_attack';
        if (c.scoreState === 'losing' && c.minute >= 72 && c.attackNeed >= 65 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat) return 'late_high_pressure';
        if ((c.attackingMomentum || c.attackNeed >= 58) && c.minute >= 55 && !c.transitionThreat && !c.highBadActions && !c.pressFatigueRisk) return 'positional_siege';
        if (c.needGoal || c.attackNeed >= 38) return 'controlled_chase';
        return 'stable_control';
    }

    function preferredPreset(situation) {
        const table = {
            stable_control:'Arteta_Control433_bal3',
            pressure_escape:'Pep_BoxControl_bal2',
            pressure_counter:'Compact_Counter_def3',
            press_cooldown:'Pep_PressCooldown_bal2',
            controlled_chase:'Pep_ControlledPush_att3',
            positional_siege:'Pep_TwoThreeFive_att3',
            width_attack:'Conte_WingbackWidth_bal4',
            protect_lead:'Simeone_Compact442_def4',
            emergency_lock:'Simeone_LowBlock_def5',
            late_high_pressure:'Klopp_Gegenpress_att4',
            final_all_in:'Bielsa_ChaosPress_att5'
        };
        return table[situation] || 'Arteta_Control433_bal3';
    }

    function hardVeto(name, signals = {}) {
        const c = Object.assign({}, signals, deriveSuiteContext(signals));
        const situation = signals.situationKey || classifySituation(signals);
        const reasons = [];
        const add = reason => { if (reason && !reasons.includes(reason)) reasons.push(reason); };
        if (!ACTIVE_SET.has(name) || REMOVED_SET.has(name)) add('preset отсутствует в active tactical registry');

        if (name === 'Compact_Counter_def3' && !(c.counterExitAvailable && !c.counterExitBlocked)) add('Compact Counter требует подтверждённый outlet; слабость команды сама по себе не является основанием');
        if (name === 'Simeone_LowBlock_def5' && !['emergency_lock'].includes(situation)) add('Low Block разрешён только как временный emergency lock');
        if (name === 'Simeone_Compact442_def4' && c.scoreState === 'losing') add('защитный 4-4-2 не используется при проигрыше');
        if (name === 'Pep_PressCooldown_bal2' && c.scoreState === 'losing' && c.minute >= 70 && c.attackNeed >= 55) add('поздний проигрыш требует продвижения, а не cooldown');
        if (name === 'Conte_WingbackWidth_bal4' && !(c.centerClosed && c.wideQuality && !c.ownCrossesBad && !c.opponentCrossesDangerous && !c.underPressure)) add('ширина требует закрытого центра и подтверждённого качества флангов без cross-risk');
        if (name === 'Pep_TwoThreeFive_att3' && (c.transitionThreat || c.underPressure || c.pressFatigueRisk || c.highBadActions)) add('3-2-5 запрещён при transition threat, давлении, fatigue или высоком браке');
        if (name === 'Klopp_Gegenpress_att4' && situation !== 'late_high_pressure' && situation !== 'final_all_in') add('Klopp разрешён только в поздней погоне');
        if (name === 'Bielsa_ChaosPress_att5' && situation !== 'final_all_in') add('Bielsa разрешён только в финальном all-in окне');
        if (['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'].includes(name) && (c.pressFatigueRisk || c.highBadActions || signals.ownRedCard === true || c.myPowerDropPct >= 5)) add('дорогой высокий прессинг запрещён по fatigue/браку/удалению');
        if (c.scoreState === 'winning' && c.minute >= 70 && ['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5','Pep_TwoThreeFive_att3'].includes(name)) add('при позднем преимуществе не повышаем риск до high/all-in');

        return { vetoed: reasons.length > 0, reasons };
    }

    function situationScore(name, situation) {
        return finite(SITUATION_PREFS[situation]?.[name]);
    }

    function scoreOne(engine, name, signals = {}) {
        const veto = hardVeto(name, signals);
        const situation = signals.situationKey || classifySituation(signals);
        const c = deriveSuiteContext(signals);
        const appetite = normalizeRiskAppetite(signals.riskAppetite);
        const policy = RISK_APPETITES[appetite];
        const traits = registry.traits?.[name] || {};
        const reasons = [];
        const parts = { situationFit: situationScore(name, situation), contextFit:0, riskAppetite:0, evidenceGuard:0 };

        if (veto.vetoed) {
            return { preset:name, score:-999, rawScore:-999, vetoed:true, vetoReasons:veto.reasons, reasons:[], parts, situationKey:situation };
        }

        let score = parts.situationFit;
        if (parts.situationFit) reasons.push({ key:'situationFit', delta:parts.situationFit, reason:SITUATION_REASONS[situation] || 'совпадение с ситуацией' });

        if (name === 'Arteta_Control433_bal3' && situation === 'stable_control') parts.contextFit += 6;
        if (name === 'Pep_BoxControl_bal2' && (c.highBadActions || c.underPressure)) parts.contextFit += 6;
        if (name === 'Pep_PressCooldown_bal2' && c.pressFatigueRisk) parts.contextFit += 8;
        if (name === 'Compact_Counter_def3') {
            if (c.counterExitAvailable && !c.counterExitBlocked) parts.contextFit += 7;
            // Legacy 5.61 evidence is directionally negative; keep the role available but cautious
            // until v7 phase evidence accumulates. Never compensate this with a strength-disadvantage bonus.
            parts.evidenceGuard -= 6;
        }
        if (name === 'Pep_ControlledPush_att3') parts.contextFit += Math.min(10, c.attackNeed * 0.10);
        if (name === 'Pep_TwoThreeFive_att3' && c.attackingMomentum) parts.contextFit += 8;
        if (name === 'Conte_WingbackWidth_bal4' && c.wideQuality) parts.contextFit += 8;
        if (name === 'Klopp_Gegenpress_att4') parts.contextFit += Math.min(9, c.attackNeed * 0.08);
        if (name === 'Simeone_Compact442_def4' && c.protectLead) parts.contextFit += 8;
        if (name === 'Simeone_LowBlock_def5' && c.emergencyLockRequired) parts.contextFit += 10;
        if (name === 'Bielsa_ChaosPress_att5' && situation === 'final_all_in') parts.contextFit += 10;

        const risk = String(traits.risk || 'medium');
        const attackFamily = ['Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4'].includes(name);
        const highPress = ['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'].includes(name);
        if (attackFamily) parts.riskAppetite += policy.attackBonus;
        if (highPress) parts.riskAppetite += policy.highPressBonus;
        if (['Simeone_LowBlock_def5','Bielsa_ChaosPress_att5'].includes(name)) parts.riskAppetite += policy.emergencyBonus;
        if (appetite === 'conservative' && /high|maximum/.test(risk)) parts.riskAppetite -= 4;

        score += parts.contextFit + parts.riskAppetite + parts.evidenceGuard;
        if (parts.contextFit) reasons.push({ key:'contextFit', delta:round(parts.contextFit), reason:'контекст матча подтверждает роль пресета' });
        if (parts.riskAppetite) reasons.push({ key:'riskAppetite', delta:round(parts.riskAppetite), reason:`профиль риска: ${appetite}` });
        if (parts.evidenceGuard) reasons.push({ key:'evidenceGuard', delta:parts.evidenceGuard, reason:'legacy evidence требует осторожности до накопления phase-v4 выборки' });

        return {
            preset:name,
            score:round(score),
            rawScore:round(score),
            vetoed:false,
            vetoReasons:[],
            reasons,
            parts,
            situationKey:situation
        };
    }

    function confidence(selected, second) {
        const gap = selected && second ? round(selected.score - second.score) : 0;
        return { level: gap >= 18 ? 'high' : gap >= 8 ? 'medium' : 'low', gap };
    }

    function runScorer(engine, signals = {}, runtime = null, detectedPreset = '') {
        const situation = signals.situationKey || classifySituation(signals);
        signals.situationKey = situation;
        const candidates = ACTIVE_PRESETS.map(name => scoreOne(engine, name, signals));
        const ranked = candidates.filter(item => !item.vetoed).sort((a, b) => b.score - a.score || a.preset.localeCompare(b.preset));
        const desired = preferredPreset(situation);
        let selected = ranked[0] || candidates.find(item => item.preset === 'Arteta_Control433_bal3');
        const desiredCandidate = candidates.find(item => item.preset === desired && !item.vetoed);
        if (desiredCandidate && (!selected || desiredCandidate.score >= selected.score - 1)) selected = desiredCandidate;
        const second = ranked.find(item => item.preset !== selected?.preset) || null;
        const conf = confidence(selected, second);
        const reason = SITUATION_REASONS[situation] || 'наиболее безопасный активный tactical role';
        const emergency = ['emergency_lock','final_all_in'].includes(situation);
        const action = {
            preset:selected?.preset || 'Arteta_Control433_bal3',
            presetStatus:engine.getPresetStatus(selected?.preset),
            decision:situation,
            ruleId:`suite_v7_${situation}`,
            risk:String(registry.traits?.[selected?.preset]?.risk || 'medium'),
            score:selected?.score ?? 0,
            reason,
            reasons:(selected?.reasons || []).filter(item => item.delta > 0).slice(0, 3),
            cautions:(selected?.reasons || []).filter(item => item.delta < 0).slice(0, 2),
            guardType:'top_score',
            guardReason:'tactical suite v7 deterministic selection',
            emergency,
            situationKey:situation,
            riskAppetite:normalizeRiskAppetite(signals.riskAppetite),
            libraryVersion:SUITE_VERSION,
            recommendationSchema:RECOMMENDATION_SCHEMA
        };
        if (situation === 'emergency_lock') {
            action.mandatoryReassessment = true;
            action.reassessAtWindow = finite(signals.generationWindowIndex) + 1;
        }

        return {
            schema:'slf_preset_rule_score_v7_tactical_suite',
            action,
            confidence:conf,
            margin:conf.gap,
            candidates:candidates.slice().sort((a, b) => {
                if (a.vetoed !== b.vetoed) return a.vetoed ? 1 : -1;
                return b.score - a.score;
            }).map(item => ({
                preset:item.preset,
                score:item.score,
                rawScore:item.rawScore,
                vetoed:item.vetoed,
                vetoReasons:item.vetoReasons,
                reasons:item.reasons.slice(0, 4),
                parts:item.parts
            })),
            vetoedPresets:Object.fromEntries(candidates.filter(item => item.vetoed).map(item => [item.preset, item.vetoReasons])),
            guard:{ selected:selected || null, guardType:'top_score', guardReason:'central v7 scorer', currentPreset:detectedPreset || null },
            situationKey:situation,
            riskAppetite:normalizeRiskAppetite(signals.riskAppetite),
            libraryVersion:SUITE_VERSION
        };
    }

    function tacticSignature(preset) {
        const signature = {};
        TACTIC_KEYS.forEach(key => {
            if (preset?.[key] !== undefined) signature[key] = String(preset[key]);
        });
        return signature;
    }

    const TACTIC_SIGNATURES = Object.fromEntries(Object.entries(registry.presets || {}).map(([name, preset]) => [name, tacticSignature(preset)]));

    function fingerprint(tactic) {
        if (!tactic || typeof tactic !== 'object') return null;
        return TACTIC_KEYS.map(key => `${key}=${String(tactic[key] ?? '')}`).join('|');
    }

    function stampTelemetry(snapshot, decision, recommendedPreset = null) {
        if (!snapshot || typeof snapshot !== 'object') return;
        const riskAppetite = decision?.action?.riskAppetite || decision?.riskAppetite || DEFAULT_RISK_APPETITE;
        snapshot.ruleDecision = decision || snapshot.ruleDecision || null;
        snapshot.tacticTelemetry = Object.assign({}, snapshot.tacticTelemetry || {}, {
            libraryVersion:SUITE_VERSION,
            recommendationSchema:RECOMMENDATION_SCHEMA,
            riskAppetite,
            currentTacticFingerprint:snapshot.tacticTelemetry?.currentTacticFingerprint || fingerprint(snapshot.currentTactic),
            recommendedPreset:recommendedPreset || decision?.action?.preset || null
        });
    }

    function shortestStep(from, to) {
        if (!from || !to || from === to) return to;
        if (!STEP_GRAPH[from] || !STEP_GRAPH[to]) return to;
        const queue = [[from]];
        const seen = new Set([from]);
        while (queue.length) {
            const path = queue.shift();
            const node = path[path.length - 1];
            for (const next of STEP_GRAPH[node] || []) {
                if (seen.has(next)) continue;
                const nextPath = path.concat(next);
                if (next === to) return nextPath[1] || to;
                seen.add(next);
                queue.push(nextPath);
            }
        }
        return to;
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        Object.entries(registry.presets || {}).forEach(([name, preset]) => {
            BASE_PRESETS[name] = Object.assign({}, preset, { priority:(preset.priority || []).slice() });
        });
    }

    function patchLibrary() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;
        TacticPresetLibrary.meta = Object.fromEntries(Object.entries(registry.meta || {}).map(([name, meta]) => [name, Object.assign({}, meta)]));
        TacticPresetLibrary.traits = Object.fromEntries(Object.entries(registry.traits || {}).map(([name, traits]) => [name, Object.assign({}, traits, {
            attackLanes:(traits.attackLanes || []).slice(),
            strengths:(traits.strengths || []).slice(),
            requires:(traits.requires || []).slice(),
            avoids:(traits.avoids || []).slice()
        })]));
        TacticPresetLibrary.schemeStates = Object.assign({}, registry.schemeStates || {});
        TacticPresetLibrary.presetSchemeState = Object.assign({}, registry.presetSchemeState || {});
    }

    function patchRuleEngine() {
        const engine = CurrentActionHintEngine;
        const originalBuild = engine.MatchDecisionSignals.build.bind(engine.MatchDecisionSignals);
        engine.schema = RECOMMENDATION_SCHEMA;
        engine.ACTIVE_PRESETS = ACTIVE_PRESETS.slice();
        engine.TACTIC_SIGNATURES = Object.fromEntries(Object.entries(TACTIC_SIGNATURES).map(([name, sig]) => [name, Object.assign({}, sig)]));
        if (registry.auditTier) {
            engine.PRESET_AUDIT_TIER = Object.fromEntries(Object.entries(registry.auditTier).map(([key, names]) => [key, Array.isArray(names) ? names.slice() : names]));
        }

        engine.MatchDecisionSignals.build = function buildTacticalSuiteV7(owner, snapshot, context = {}, runtime = null) {
            const signals = originalBuild(owner, snapshot, context, runtime);
            signals.riskAppetite = resolveRiskAppetite(snapshot, context);
            signals.libraryVersion = SUITE_VERSION;
            signals.recommendationSchema = RECOMMENDATION_SCHEMA;
            Object.assign(signals, deriveSuiteContext(Object.assign({}, signals, {
                counterExitAvailable: context?.counterExitAvailable ?? snapshot?.counterExitAvailable ?? signals.counterExitAvailable,
                counterExitBlocked: context?.counterExitBlocked ?? snapshot?.counterExitBlocked ?? signals.counterExitBlocked
            })));
            signals.situationKey = classifySituation(signals);
            if (signals.situationKey === 'emergency_lock') signals.mandatoryReassessmentWindow = finite(signals.generationWindowIndex) + 1;
            return signals;
        };

        engine.PresetRuleScorer.hardVeto = hardVeto;
        engine.PresetRuleScorer.scoreOne = scoreOne;
        engine.PresetRuleScorer.run = runScorer;
        engine.__tacticSuiteV7Installed = true;
        engine.__generator561RuleScorerApplied = true;
        engine.__generator561PressureResponseApplied = true;
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return;

        RecommendationEngine.getPresetLadder = function getSuiteV7Ladder(group) {
            return (registry.ladders?.[group] || []).slice();
        };

        RecommendationEngine.selectRawPreset = function selectTacticalSuiteV7Preset(snapshot, state = {}) {
            const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : CurrentActionHintEngine;
            const decision = engine?.run ? engine.run(snapshot || {}, state || {}) : null;
            const preset = ACTIVE_SET.has(decision?.action?.preset) ? decision.action.preset : 'Arteta_Control433_bal3';
            if (decision?.action && decision.action.preset !== preset) decision.action.preset = preset;
            stampTelemetry(snapshot, decision, preset);
            return {
                name:preset,
                reason:decision?.action?.reason || 'tactical suite v7 fallback',
                ruleDecision:decision,
                progressionAction:'suite_v7_scored'
            };
        };

        RecommendationEngine.applyProgressionGuard = function applySuiteV7ProgressionGuard(candidate, snapshot, context = {}) {
            if (!candidate?.name || !ACTIVE_SET.has(candidate.name) || !snapshot || snapshot.status === 'finished') return candidate;
            const progression = typeof STATE !== 'undefined' ? (STATE.presetProgression || null) : null;
            const lastApplied = progression?.lastAppliedPreset || '';
            if (!lastApplied || !ACTIVE_SET.has(lastApplied) || String(progression?.gameId || '') !== String(snapshot?.gameId || '')) {
                return Object.assign({}, candidate, { progressionAction:'new_baseline' });
            }
            if (candidate.name === lastApplied) return Object.assign({}, candidate, { progressionAction:'hold_current' });

            const previousPreset = progression?.previousPreset || '';
            const currentScoreState = context?.score?.state || snapshot?.ruleDecision?.moment?.context?.scoreState || 'unknown';
            const scoreTransition = progression?.lastScoreState && currentScoreState !== 'unknown' && progression.lastScoreState !== currentScoreState;
            const strongFailure = typeof this.hasStrongPostApplyFailure === 'function' ? this.hasStrongPostApplyFailure(snapshot, context) : false;
            const emergency = candidate.name === 'Simeone_LowBlock_def5' || candidate.name === 'Bielsa_ChaosPress_att5' || context?.urgency?.overrideProgressionGuard === true;
            if (emergency || strongFailure || scoreTransition) {
                return Object.assign({}, candidate, { progressionAction: emergency ? 'emergency_override' : strongFailure ? 'failure_override' : 'score_transition_override' });
            }
            if (previousPreset && candidate.name === previousPreset) {
                return { name:lastApplied, reason:'anti-ping-pong: не возвращаем предыдущий preset без сильного нового сигнала', progressionAction:'hold_against_immediate_rollback' };
            }

            const step = shortestStep(lastApplied, candidate.name);
            if (!step || step === candidate.name) return Object.assign({}, candidate, { progressionAction:'accepted' });
            return {
                name:step,
                reason:`пошаговый tactical route: ${lastApplied} → ${step}; цель ${candidate.name}`,
                progressionAction:'route_step',
                targetPreset:candidate.name
            };
        };

        RecommendationEngine.selectPreset = function selectSuiteV7Preset(snapshot, my, opp, playerSignals, plan, state) {
            const urgency = state.urgency || TacticalUrgencyModel.classify(snapshot, state);
            if (!urgency.allowPreset) {
                plan.preset.push(urgency.reason || 'На этом этапе новая большая рекомендация не выдаётся.');
                return null;
            }

            const raw = this.selectRawPreset(snapshot, state);
            const guarded = this.applyProgressionGuard(raw, snapshot, {
                score:state.score,
                minute:state.minute,
                myXg:state.myXg,
                oppXg:state.oppXg,
                myXT:state.myXT,
                oppXT:state.oppXT,
                myBad:state.myBad,
                urgency,
                generatorQualitySignal:state.generatorQualitySignal
            });
            const name = ACTIVE_SET.has(guarded?.name) ? guarded.name : raw.name;
            const title = this.getPresetTitle(name);
            const reason = guarded?.reason || raw?.reason || 'tactical suite v7';
            plan.primaryPresetName = name;

            if (snapshot?.ruleDecision?.action) {
                snapshot.ruleDecision.action.preset = name;
                snapshot.ruleDecision.action.reason = reason;
                snapshot.ruleDecision.action.guardType = guarded?.progressionAction || 'selected';
                snapshot.ruleDecision.action.guardReason = reason;
                snapshot.ruleDecision.action.libraryVersion = SUITE_VERSION;
                snapshot.ruleDecision.action.recommendationSchema = RECOMMENDATION_SCHEMA;
                if (snapshot.ruleDecision.telemetry) snapshot.ruleDecision.telemetry.recommendedPreset = name;
            }
            stampTelemetry(snapshot, snapshot?.ruleDecision || raw?.ruleDecision || null, name);

            if (typeof STATE !== 'undefined') {
                STATE.presetProgression = Object.assign({}, STATE.presetProgression || {}, {
                    schema:'slf_preset_progression_v2_suite_v7',
                    gameId:snapshot.gameId,
                    lastRecommendedPreset:name,
                    recommendedAt:Date.now(),
                    recommendedBucket:snapshot.bucket || '',
                    recommendedWindowIndex:snapshot.generationWindow?.index || 0,
                    family:this.getPresetGroup(name),
                    rank:this.getPresetRank(name),
                    lastRecommendationReason:reason,
                    lastProgressionAction:guarded?.progressionAction || 'selected',
                    lastScoreState:state?.score?.state || 'unknown',
                    libraryVersion:SUITE_VERSION
                });
            }

            plan.preset.push(`Поставить: ${title}.`);
            plan.preset.push(`Почему: ${reason}.`);
            if (typeof this.getConcisePresetAction === 'function') plan.preset.push(`Что сделать: ${this.getConcisePresetAction(name, state)}`);
            if (guarded?.progressionAction && !['accepted','new_baseline','selected','hold_current','suite_v7_scored'].includes(guarded.progressionAction)) {
                plan.preset.push(`Ограничитель: ${guarded.progressionAction}.`);
            }
            const schemeDecision = typeof this.shouldRecommendSchemeChange === 'function' ? this.shouldRecommendSchemeChange(snapshot, state, urgency, name) : { show:false };
            const scheme = this.getPresetScheme(name);
            if (schemeDecision.show && scheme) {
                plan.preset.push(`Перестройка: ${schemeDecision.reason}.`);
                plan.preset.push(`Схема для ${title}: ${scheme}.`);
            }
            return name;
        };

        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561PressureResponseApplied = true;
        RecommendationEngine.__tacticSuiteV7Installed = true;
    }

    function patchPanel() {
        if (typeof TacticPresetLibraryPanel === 'undefined' || !TacticPresetLibraryPanel) return false;
        TacticPresetLibraryPanel.livePresetOrder = ACTIVE_PRESETS.slice();
        TacticPresetLibraryPanel.liveFormationPositions = Object.fromEntries(Object.entries(registry.formations || {}).map(([name, positions]) => [name, positions.slice()]));
        return true;
    }

    function schedulePanelSync() {
        if (patchPanel()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (patchPanel() || attempts >= 20) clearInterval(timer);
        }, 50);
    }

    patchBasePresets();
    patchLibrary();
    patchRuleEngine();
    patchRecommendationSelection();
    schedulePanelSync();

    registry.choosePreset = function chooseSuiteV7Preset(state = {}, snapshot = {}) {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : CurrentActionHintEngine;
        const decision = engine?.run ? engine.run(snapshot || {}, state || {}) : null;
        return { name:ACTIVE_SET.has(decision?.action?.preset) ? decision.action.preset : 'Arteta_Control433_bal3', reason:decision?.action?.reason || 'suite v7 fallback', ruleDecision:decision };
    };
    registry.ruleDecisionSchema = RECOMMENDATION_SCHEMA;
    registry.riskAppetites = Object.assign({}, RISK_APPETITES);
    registry.defaultRiskAppetite = DEFAULT_RISK_APPETITE;

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            version:POLICY_VERSION,
            suiteVersion:SUITE_VERSION,
            recommendationSchema:RECOMMENDATION_SCHEMA,
            generatorVersion:'5.61',
            autoApply:false,
            activePresets:ACTIVE_PRESETS.slice(),
            riskAppetites:Object.assign({}, RISK_APPETITES),
            defaultRiskAppetite:DEFAULT_RISK_APPETITE,
            tacticSignatures:Object.fromEntries(Object.entries(TACTIC_SIGNATURES).map(([name, sig]) => [name, Object.assign({}, sig)])),
            deriveSuiteContext,
            classifySituation,
            preferredPreset,
            hardVeto,
            shortestStep,
            evaluate(snapshot = {}, context = {}) {
                return CurrentActionHintEngine.run(snapshot, context);
            }
        };
    }
})();