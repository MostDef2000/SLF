// Generator 5.61 Bold Pressure-Response Tactical Policy
// ============================================================
// Manual-only deterministic recommendation policy. It separates three
// responses to opponent pressure: control escape, direct counter outlet,
// and a temporary emergency lock with mandatory reassessment.

(function tacticPresetDirectionPolicy() {
    'use strict';

    const POLICY_VERSION = '5.61-situation-v6';
    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.version === POLICY_VERSION) return;

    const REMOVED_PRESETS = new Set(['Xabi_BoxMidfield_bal3']);
    const ACTIVE_PRESETS = [
        'Arteta_Control433_bal3',
        'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2',
        'Compact_Counter_def3',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Conte_WingbackWidth_bal4',
        'Klopp_Gegenpress_att4',
        'Simeone_Compact442_def4',
        'Simeone_LowBlock_def5',
        'Bielsa_ChaosPress_att5'
    ];
    const ATTACK_LADDER = [
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Klopp_Gegenpress_att4',
        'Bielsa_ChaosPress_att5'
    ];
    const NEUTRAL_PRESETS = new Set([
        'standard',
        'Arteta_Control433_bal3',
        'Pep_BoxControl_bal2',
        'Pep_PressCooldown_bal2'
    ]);

    const DIRECTION_OVERRIDES = Object.fromEntries(['standard', ...ACTIVE_PRESETS].map(name => [name, []]));
    DIRECTION_OVERRIDES.Conte_WingbackWidth_bal4 = ['left', 'right'];

    const RISK_APPETITES = {
        conservative: { attackBonus: 0, pressBonus: 0, kloppMinute: 74, bielsaMinute: 84, inactionWindow: 3 },
        standard: { attackBonus: 3, pressBonus: 2, kloppMinute: 68, bielsaMinute: 82, inactionWindow: 2 },
        bold: { attackBonus: 7, pressBonus: 5, kloppMinute: 62, bielsaMinute: 78, inactionWindow: 2 },
        experimental: { attackBonus: 10, pressBonus: 8, kloppMinute: 56, bielsaMinute: 74, inactionWindow: 1 }
    };
    const DEFAULT_RISK_APPETITE = 'bold';

    const RETUNED_PRESETS = {
        Arteta_Control433_bal3: { def_line:'2',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'2',build_long:'1',build_fast:'2',style:'3',pass_risk:'3',dribble:'2',cross:'2',corner:'1',shot:'2',priority:[] },
        Pep_BoxControl_bal2: { def_line:'2',press_line:'2',def_width:'2',press_intense:'2',build_type:'2',build_temp:'1',build_long:'1',build_fast:'2',style:'3',pass_risk:'2',dribble:'2',cross:'1',corner:'1',shot:'2',priority:[] },
        Pep_PressCooldown_bal2: { def_line:'1',press_line:'2',def_width:'3',press_intense:'1',build_type:'1',build_temp:'2',build_long:'4',build_fast:'2',style:'2',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[] },
        Compact_Counter_def3: { def_line:'1',press_line:'1',def_width:'2',press_intense:'2',build_type:'1',build_temp:'3',build_long:'5',build_fast:'5',style:'3',pass_risk:'3',dribble:'4',cross:'2',corner:'1',shot:'3',priority:[] },
        Pep_ControlledPush_att3: { def_line:'3',press_line:'3',def_width:'2',press_intense:'3',build_type:'2',build_temp:'3',build_long:'1',build_fast:'4',style:'4',pass_risk:'4',dribble:'3',cross:'2',corner:'1',shot:'3',priority:[] },
        Pep_TwoThreeFive_att3: { def_line:'4',press_line:'4',def_width:'4',press_intense:'4',build_type:'2',build_temp:'2',build_long:'1',build_fast:'3',style:'5',pass_risk:'5',dribble:'4',cross:'2',corner:'1',shot:'4',priority:[] },
        Conte_WingbackWidth_bal4: { def_line:'2',press_line:'2',def_width:'5',press_intense:'3',build_type:'3',build_temp:'2',build_long:'3',build_fast:'3',style:'4',pass_risk:'3',dribble:'4',cross:'5',corner:'1',shot:'2',priority:['left','right'] },
        Klopp_Gegenpress_att4: { def_line:'4',press_line:'5',def_width:'3',press_intense:'5',build_type:'3',build_temp:'3',build_long:'2',build_fast:'5',style:'5',pass_risk:'4',dribble:'4',cross:'3',corner:'1',shot:'4',priority:[] },
        Simeone_Compact442_def4: { def_line:'1',press_line:'2',def_width:'1',press_intense:'4',build_type:'1',build_temp:'1',build_long:'3',build_fast:'2',style:'1',pass_risk:'2',dribble:'1',cross:'2',corner:'1',shot:'1',priority:[] },
        Simeone_LowBlock_def5: { def_line:'1',press_line:'1',def_width:'1',press_intense:'1',build_type:'1',build_temp:'1',build_long:'5',build_fast:'2',style:'1',pass_risk:'1',dribble:'1',cross:'1',corner:'1',shot:'1',priority:[] },
        Bielsa_ChaosPress_att5: { def_line:'5',press_line:'5',def_width:'5',press_intense:'5',build_type:'3',build_temp:'3',build_long:'4',build_fast:'5',style:'5',pass_risk:'5',dribble:'5',cross:'5',corner:'1',shot:'5',priority:[] }
    };

    const TACTIC_SIGNATURES = Object.fromEntries(Object.entries(RETUNED_PRESETS).map(([name, preset]) => {
        const signature = Object.assign({}, preset);
        delete signature.corner;
        delete signature.priority;
        return [name, signature];
    }));

    const FORMATIONS = {
        Arteta_Control433_bal3: ['gk','ld','cd1','cd3','rd','cm1','dm2','cm3','lw','st2','rw'],
        Pep_BoxControl_bal2: ['gk','ld','cd1','cd3','rd','dm2','cm1','cm3','am1','am2','st2'],
        Pep_PressCooldown_bal2: ['gk','ld','cd1','cd3','rd','dm2','lm','cm2','cm3','rm','st2'],
        Compact_Counter_def3: ['gk','ld','cd1','cd3','rd','lm','dm2','cm2','rm','am2','st2'],
        Pep_ControlledPush_att3: ['gk','ld','cd1','cd3','rd','dm2','cm2','lw','am2','rw','st2'],
        Pep_TwoThreeFive_att3: ['gk','cd1','cd2','cd3','dm2','cm2','lw','am1','st1','am2','rw'],
        Conte_WingbackWidth_bal4: ['gk','cd1','cd2','cd3','lb','dm2','cm2','rb','lw','st2','rw'],
        Klopp_Gegenpress_att4: ['gk','ld','cd1','cd3','rd','dm2','cm2','lw','st1','st2','rw'],
        Simeone_Compact442_def4: ['gk','ld','cd1','cd3','rd','lm','cm2','dm2','rm','st1','st2'],
        Simeone_LowBlock_def5: ['gk','lb','cd1','cd2','cd3','rb','lm','dm2','cm2','rm','st2'],
        Bielsa_ChaosPress_att5: ['gk','cd1','cd2','cd3','lm','dm2','rm','lw','st1','st2','rw']
    };

    const SCHEME_STATES = {
        Arteta_Control433_bal3: '4-3-3 structural control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Pep_BoxControl_bal2: '4-1-2-2-1 press-resistant control / GK-LD-CD1-CD3-RD / DM2 / CM1-CM3 / AM1-AM2 / ST2',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown outlet / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Compact_Counter_def3: '4-4-1-1 direct counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-RM / AM2 / ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Pep_TwoThreeFive_att3: '3-2-5 positional siege / GK-CD1-CD2-CD3 / DM2-CM2 / LW-AM1-ST1-AM2-RW',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LB-DM2-CM2-RB / LW-ST2-RW',
        Klopp_Gegenpress_att4: '4-2-4 gegenpress / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Simeone_LowBlock_def5: '5-4-1 emergency lock / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Bielsa_ChaosPress_att5: '3-3-4 final all-in / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW'
    };

    const TRAIT_PATCHES = {
        Arteta_Control433_bal3: { build:'structural_control', tempo:'medium', press:'medium_high', risk:'medium' },
        Pep_BoxControl_bal2: { build:'press_resistant_control', tempo:'low', press:'medium_low', risk:'low', requires:['pressure_without_counter_exit'] },
        Pep_PressCooldown_bal2: { build:'cooldown_outlet', tempo:'low', press:'low', risk:'low', requires:['press_fatigue'] },
        Compact_Counter_def3: { build:'direct_counter', tempo:'very_high', press:'low', risk:'medium_high', requires:['confirmed_counter_exit'] },
        Pep_ControlledPush_att3: { build:'controlled_push', tempo:'high', press:'medium_high', risk:'high' },
        Pep_TwoThreeFive_att3: { build:'positional_siege_325', tempo:'medium_high', press:'high', risk:'very_high' },
        Conte_WingbackWidth_bal4: { build:'maximum_width', tempo:'medium_high', press:'medium', risk:'high' },
        Klopp_Gegenpress_att4: { build:'gegenpress_424', tempo:'very_high', press:'very_high', risk:'very_high' },
        Simeone_Compact442_def4: { build:'compact442', tempo:'low', press:'high_local', risk:'low' },
        Simeone_LowBlock_def5: { build:'temporary_emergency_lock', tempo:'very_low', press:'very_low', risk:'very_low', requires:['mandatory_reassessment_next_window'] },
        Bielsa_ChaosPress_att5: { build:'final_all_in', tempo:'maximum', press:'maximum', risk:'maximum' }
    };

    function finite(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function bounded(value, min = 0, max = 100) {
        return Math.max(min, Math.min(max, finite(value)));
    }

    function copy(value) {
        return Array.isArray(value) ? value.slice() : [];
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

    function hasSignal(signals, name) {
        return Array.isArray(signals?.signals) && signals.signals.includes(name);
    }

    function hasAnySignal(signals, names) {
        return names.some(name => hasSignal(signals, name));
    }

    function derivePressureResponseContext(signals = {}) {
        const myXg = finite(signals.myXg);
        const oppXg = finite(signals.oppXg);
        const myXT = finite(signals.myXT);
        const oppXT = finite(signals.oppXT);
        const myShots = finite(signals.myShots);
        const oppShots = finite(signals.oppShots);
        const myPossession = finite(signals.myPossession);
        const oppPossession = finite(signals.oppPossession);
        const myPressVector = finite(signals.myPressVector);
        const oppPressVector = finite(signals.oppPressVector);
        const myDefVector = finite(signals.myDefVector);
        const oppDefVector = finite(signals.oppDefVector);

        const dominanceVotes = [
            oppXg >= myXg + 0.45,
            oppXT >= myXT + 0.22,
            oppShots >= myShots + 4,
            oppPossession >= 54 && oppPossession >= myPossession + 12
        ].filter(Boolean).length;
        const explicitHighVectors = hasAnySignal(signals, [
            'opponent_attack_vectors_high', 'opponent_attack_wave_high',
            'opponent_sustained_attack', 'sustained_siege'
        ]);
        const vectorDominance = oppPressVector >= myPressVector + 8 && oppDefVector >= myDefVector + 5;
        const opponentHighAttackVectors = explicitHighVectors || oppXT >= myXT + 0.3 || vectorDominance;
        const opponentAttackDominance = dominanceVotes >= 2;
        const sustainedSiege = Boolean(
            signals.underPressure && opponentAttackDominance && opponentHighAttackVectors &&
            (finite(signals.pressureRisk) >= 55 || dominanceVotes >= 3)
        );

        const explicitExit = hasAnySignal(signals, [
            'counter_exit_available', 'space_behind_press',
            'opponent_structure_broken', 'clean_first_pass'
        ]);
        const blockedExit = hasAnySignal(signals, [
            'counter_exit_blocked', 'first_pass_trapped',
            'isolated_forward', 'sustained_siege'
        ]);
        const transitionProgress =
            finite(signals.myXgDelta) >= 0.08 ||
            finite(signals.myShotsDelta) >= 1 ||
            (myXT >= 0.18 && myXT >= oppXT * 0.55) ||
            Boolean(signals.attackingMomentum);
        const possessionOutlet = myPossession >= 38 && oppPossession - myPossession <= 15 && myXT >= 0.1;
        const counterExitAvailable = Boolean(!blockedExit && !sustainedSiege && (explicitExit || transitionProgress || possessionOutlet));
        const emergencyLockRequired = Boolean(
            sustainedSiege && !counterExitAvailable &&
            (signals.ownRedCard || signals.highBadActions || finite(signals.myPowerDropPct) >= 5 || finite(signals.pressureRisk) >= 82)
        );

        return {
            opponentAttackDominance,
            opponentHighAttackVectors,
            sustainedSiege,
            counterExitAvailable,
            emergencyLockRequired,
            counterDominanceVotes: dominanceVotes,
            pressureResponse: emergencyLockRequired ? 'emergency_lock' : counterExitAvailable ? 'direct_counter' : sustainedSiege ? 'control_escape' : 'none'
        };
    }

    function classifySituation(signals = {}) {
        const appetite = normalizeRiskAppetite(signals.riskAppetite);
        const policy = RISK_APPETITES[appetite];
        const attackUnder = hasSignal(signals, 'generator_attack_underperforming');
        const attackWorking = hasSignal(signals, 'generator_attack_working');
        const defenseUnder = hasSignal(signals, 'generator_defense_underperforming');
        const defenseWorking = hasSignal(signals, 'generator_defense_working');
        const pressureContext = signals.underPressure || signals.transitionThreat || finite(signals.strengthGap) <= -25;

        if (signals.scoreState === 'losing' && signals.minute >= policy.bielsaMinute && signals.attackNeed >= 74) return 'final_desperation';
        if (signals.scoreState === 'losing' && signals.minute >= policy.kloppMinute && signals.attackNeed >= 52) return 'late_chase';
        if (signals.scoreState === 'winning' && signals.minute >= 82 && signals.pressureRisk >= 60) return 'late_emergency_lock';
        if (signals.emergencyLockRequired) return 'siege_lock';
        if (signals.pressFatigueRisk || signals.pressingCost >= 62 || signals.myPowerDropPct >= 4) return 'press_cooldown';
        if (signals.scoreState === 'winning' && signals.minute >= 65 && signals.pressureRisk >= 45) return 'protect_lead';
        if (signals.widthOpportunity >= 55 && !signals.ownCrossesBad && !signals.opponentCrossesDangerous && !signals.underPressure) return 'safe_width';
        if (pressureContext && signals.counterExitAvailable) return 'compact_counter';
        if (pressureContext && signals.counterExitAvailable === false) return 'pressure_escape';
        if (attackUnder && defenseWorking && signals.attackNeed < 75) return 'controlled_push';
        if (defenseUnder && attackUnder) return 'control_reset';
        if (signals.highBadActions || signals.controlNeed >= 68) return 'control_reset';
        if (signals.strengthGap >= 30 && signals.pressureRisk < 52 && !signals.highBadActions && (signals.attackingMomentum || attackWorking)) return 'positional_squeeze';
        if (signals.scoreState === 'losing' && signals.minute >= 45 && signals.attackNeed >= 38 && !signals.highBadActions) return 'controlled_push';
        if (signals.attackNeed >= 38 && signals.attackNeed < 70 && !signals.highBadActions) return 'controlled_push';
        if (signals.minute <= 30 && signals.pressureRisk < 50 && signals.attackNeed < 42) return 'balanced_structure';
        return 'active_control';
    }

    function situationAffinity(name, signals = {}) {
        const situation = signals.situationKey || classifySituation(signals);
        const preferredBySituation = {
            balanced_structure: 'Arteta_Control433_bal3',
            active_control: 'Arteta_Control433_bal3',
            control_reset: 'Pep_BoxControl_bal2',
            pressure_escape: 'Pep_BoxControl_bal2',
            siege_lock: 'Simeone_LowBlock_def5',
            press_cooldown: 'Pep_PressCooldown_bal2',
            compact_counter: 'Compact_Counter_def3',
            controlled_push: 'Pep_ControlledPush_att3',
            positional_squeeze: 'Pep_TwoThreeFive_att3',
            safe_width: 'Conte_WingbackWidth_bal4',
            late_chase: 'Klopp_Gegenpress_att4',
            protect_lead: 'Simeone_Compact442_def4',
            late_emergency_lock: 'Simeone_LowBlock_def5',
            final_desperation: 'Bielsa_ChaosPress_att5'
        };
        const reasons = {
            pressure_escape: 'осада без подтверждённого outlet: разбить прессинг через контроль',
            compact_counter: 'подтверждён первый выход и пространство за прессингом',
            siege_lock: 'аварийно закрыть штрафную на один цикл с обязательной переоценкой',
            controlled_push: 'нужен более ранний контролируемый рост атаки',
            positional_squeeze: 'атакующий импульс позволяет перейти к структуре 3-2-5'
        };
        const preferred = preferredBySituation[situation] || 'Arteta_Control433_bal3';
        let delta = name === preferred ? 34 : 0;
        const conflicts = {
            pressure_escape: ['Compact_Counter_def3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            siege_lock: ['Compact_Counter_def3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            compact_counter: ['Pep_BoxControl_bal2','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4','Klopp_Gegenpress_att4'],
            control_reset: ['Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            press_cooldown: ['Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            controlled_push: ['Pep_BoxControl_bal2','Simeone_LowBlock_def5'],
            positional_squeeze: ['Pep_BoxControl_bal2','Simeone_Compact442_def4','Simeone_LowBlock_def5'],
            protect_lead: ['Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            late_emergency_lock: ['Pep_TwoThreeFive_att3','Klopp_Gegenpress_att4','Bielsa_ChaosPress_att5'],
            late_chase: ['Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Simeone_Compact442_def4','Simeone_LowBlock_def5'],
            final_desperation: ['Pep_BoxControl_bal2','Pep_PressCooldown_bal2','Simeone_Compact442_def4','Simeone_LowBlock_def5']
        };
        if ((conflicts[situation] || []).includes(name)) delta -= 18;
        return { situation, preferred, delta, reason: name === preferred ? (reasons[situation] || `соответствие сценарию: ${situation}`) : '' };
    }

    function removePresetFromMap(map) {
        if (!map || typeof map !== 'object') return;
        REMOVED_PRESETS.forEach(name => delete map[name]);
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;
        removePresetFromMap(BASE_PRESETS);
        Object.entries(RETUNED_PRESETS).forEach(([name, preset]) => {
            BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name] || {}, preset, { priority: copy(preset.priority) });
        });
    }

    function patchLibrary() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;
        ['meta','traits','schemeStates','presetSchemeState'].forEach(key => removePresetFromMap(TacticPresetLibrary[key]));
        TacticPresetLibrary.schemeStates = Object.assign({}, TacticPresetLibrary.schemeStates || {}, SCHEME_STATES);
        TacticPresetLibrary.presetSchemeState = Object.assign({}, TacticPresetLibrary.presetSchemeState || {}, Object.fromEntries(ACTIVE_PRESETS.map(name => [name, name])));
        TacticPresetLibrary.traits = TacticPresetLibrary.traits || {};
        Object.entries(TRAIT_PATCHES).forEach(([name, patch]) => {
            TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name] || {}, patch, {
                attackLanes: copy(DIRECTION_OVERRIDES[name])
            });
        });
        if (TacticPresetLibrary.meta?.Pep_BoxControl_bal2) {
            TacticPresetLibrary.meta.Pep_BoxControl_bal2 = Object.assign({}, TacticPresetLibrary.meta.Pep_BoxControl_bal2, {
                idea: 'разбить прессинг короткими опорами и сохранить продвижение без стерильного отказа от атаки',
                use: 'осада или высокий прессинг без подтверждённого выхода в прямую контратаку',
                risk: 'при полном разрушении структуры требуется временный emergency lock'
            });
        }
        if (TacticPresetLibrary.meta?.Simeone_LowBlock_def5) {
            TacticPresetLibrary.meta.Simeone_LowBlock_def5 = Object.assign({}, TacticPresetLibrary.meta.Simeone_LowBlock_def5, {
                idea: 'временный полный lock штрафной с длинным освобождением зоны',
                use: 'критическая осада, удаление, падение силы или позднее удержание; только на один цикл',
                risk: 'обязательная переоценка в следующем окне; не использовать как постоянную стратегию при проигрыше'
            });
        }
    }

    function resolveFormationPanel() {
        try {
            return eval('typeof TacticPresetLibraryPanel !== "undefined" ? TacticPresetLibraryPanel : null');
        } catch (_) {
            return null;
        }
    }

    function patchFormationPanel() {
        const panel = resolveFormationPanel();
        if (!panel) return;
        panel.liveFormationPositions = Object.fromEntries(
            Object.entries(FORMATIONS).map(([name, positions]) => [name, positions.slice()])
        );
    }

    function selectEscalationCandidate(decision, signals, policy) {
        const candidateMap = new Map((decision?.candidates || []).map(item => [item.preset, item]));
        const allowed = name => {
            const item = candidateMap.get(name);
            return item && !item.vetoed;
        };
        const ordered = [];
        if (signals.minute >= policy.bielsaMinute && signals.attackNeed >= 74) ordered.push('Bielsa_ChaosPress_att5');
        if (signals.minute >= policy.kloppMinute && signals.attackNeed >= 52) ordered.push('Klopp_Gegenpress_att4');
        if (signals.attackingMomentum && signals.pressureRisk < 68) ordered.push('Pep_TwoThreeFive_att3');
        ordered.push('Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Bielsa_ChaosPress_att5');
        return ordered.find(allowed) || null;
    }

    function applyInactionPenalty(owner, decision, signals, runtime) {
        const appetite = normalizeRiskAppetite(signals.riskAppetite);
        const policy = RISK_APPETITES[appetite];
        const selectedName = decision?.action?.preset;
        const previousName = runtime?.lastDecision?.action?.preset;
        const previousWindow = finite(runtime?.lastDecision?.telemetry?.observation?.generationWindowIndex, -99);
        const currentWindow = finite(signals.generationWindowIndex, 0);
        const repeatedNeutral = NEUTRAL_PRESETS.has(selectedName) && NEUTRAL_PRESETS.has(previousName) && currentWindow - previousWindow <= policy.inactionWindow;
        const worsening =
            signals.attackNeed >= 52 &&
            (finite(signals.oppXgDelta) > finite(signals.myXgDelta) + 0.04 ||
             finite(signals.oppShotsDelta) > finite(signals.myShotsDelta) ||
             signals.pressureRisk >= 60);
        const stabilizationRequired = ['pressure_escape','siege_lock','late_emergency_lock'].includes(signals.situationKey);
        if (signals.scoreState !== 'losing' || signals.minute < 50 || !repeatedNeutral || !worsening || stabilizationRequired) return decision;

        const replacement = selectEscalationCandidate(decision, signals, policy);
        if (!replacement || replacement === selectedName) return decision;
        const item = (decision.candidates || []).find(candidate => candidate.preset === replacement);
        decision.action = Object.assign({}, decision.action, {
            preset: replacement,
            presetStatus: owner.getPresetStatus ? owner.getPresetStatus(replacement) : decision.action.presetStatus,
            score: item?.score ?? decision.action.score,
            decision: 'inaction_escalation',
            reason: `штраф за бездействие: при проигрыше нейтральная рекомендация повторилась на ухудшающемся отрезке; переход к ${replacement}`,
            guardType: 'inaction_penalty',
            guardReason: 'повтор нейтрального решения запрещён при ухудшении и высокой потребности в голе',
            emergency: false
        });
        decision.guard = {
            selected: item || { preset: replacement, score: decision.action.score },
            guardType: 'inaction_penalty',
            guardReason: decision.action.guardReason,
            previousPreset: selectedName,
            repeatedNeutral: true
        };
        decision.inactionPenalty = { applied: true, from: selectedName, to: replacement, previousPreset: previousName };
        return decision;
    }

    function patchRuleEngine() {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        const scorer = engine?.PresetRuleScorer;
        if (!engine || !scorer || scorer.__pressureResponseV6Installed) return;

        engine.schema = 'slf_rule_decision_v6_pressure_response';
        engine.TACTIC_SIGNATURES = Object.fromEntries(Object.entries(TACTIC_SIGNATURES).map(([name, signature]) => [name, Object.assign({}, signature)]));

        const originalBuild = engine.MatchDecisionSignals.build.bind(engine.MatchDecisionSignals);
        engine.MatchDecisionSignals.build = function buildPressureResponseSignals(owner, snapshot, context = {}, runtime = null) {
            const signals = originalBuild(owner, snapshot, context, runtime);
            signals.riskAppetite = resolveRiskAppetite(snapshot, context);
            signals.riskPolicy = Object.assign({}, RISK_APPETITES[signals.riskAppetite]);
            const rawStrengthAdvantage = finite(signals.strengthAdvantage);
            const cappedStrengthAdvantage = Math.min(rawStrengthAdvantage, 32);
            signals.rawStrengthAdvantage = rawStrengthAdvantage;
            signals.strengthAdvantage = cappedStrengthAdvantage;
            signals.pressingOpportunity = bounded(finite(signals.pressingOpportunity) - Math.max(0, rawStrengthAdvantage - cappedStrengthAdvantage) * 0.35);
            Object.assign(signals, derivePressureResponseContext(signals));
            signals.situationKey = classifySituation(signals);
            if (signals.situationKey === 'siege_lock') signals.mandatoryReassessmentWindow = finite(signals.generationWindowIndex) + 1;
            return signals;
        };

        const originalHardVeto = scorer.hardVeto.bind(scorer);
        scorer.hardVeto = function hardVetoPressureResponse(name, signals = {}) {
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            const original = originalHardVeto(name, signals);
            const reasons = (original.reasons || []).filter(reason => {
                if (name === 'Klopp_Gegenpress_att4' && reason.includes('Klopp разрешён только')) return false;
                if (name === 'Bielsa_ChaosPress_att5' && reason.includes('Bielsa разрешён только')) return false;
                if (name === 'Simeone_LowBlock_def5' && reason.includes('низкий блок разрешён только')) return false;
                return true;
            });
            const pressSafe = !signals.ownRedCard && !signals.highBadActions && !signals.pressFatigueRisk && finite(signals.myPowerDropPct) < 5;
            if (name === 'Klopp_Gegenpress_att4' && !(signals.scoreState !== 'winning' && signals.minute >= policy.kloppMinute && signals.attackNeed >= 45 && pressSafe && (!signals.transitionThreat || signals.minute >= 82))) {
                reasons.push(`Klopp требует appetite=${appetite}, минуту ${policy.kloppMinute}+ и безопасную цену прессинга`);
            }
            if (name === 'Bielsa_ChaosPress_att5' && !(signals.scoreState === 'losing' && signals.minute >= policy.bielsaMinute && signals.attackNeed >= 72 && signals.lowBadActions && pressSafe && (!signals.transitionThreat || signals.minute >= 86))) {
                reasons.push(`Bielsa требует appetite=${appetite}, проигрыш и минуту ${policy.bielsaMinute}+`);
            }
            const lowBlockAllowed =
                signals.situationKey === 'siege_lock' ||
                signals.situationKey === 'late_emergency_lock' ||
                (signals.scoreState === 'winning' && signals.minute >= 82 && signals.pressureRisk >= 55);
            if (name === 'Simeone_LowBlock_def5' && !lowBlockAllowed) {
                reasons.push('low block разрешён только как временный siege lock или позднее аварийное удержание');
            }
            if (name === 'Compact_Counter_def3' && signals.counterExitAvailable !== true) {
                reasons.push('прямая контратака требует подтверждённого первого выхода или пространства за прессингом');
            }
            if (name === 'Pep_BoxControl_bal2' && signals.situationKey === 'siege_lock') {
                reasons.push('критическая осада требует сначала полного временного lock');
            }
            return { vetoed: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
        };

        const originalScoreOne = scorer.scoreOne.bind(scorer);
        scorer.scoreOne = function scoreOnePressureResponse(owner, name, signals) {
            const result = originalScoreOne(owner, name, signals);
            if (result.vetoed) return result;
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            const policy = RISK_APPETITES[appetite];
            const affinity = situationAffinity(name, signals);
            let bonus = affinity.delta;
            if (['Pep_ControlledPush_att3','Pep_TwoThreeFive_att3','Conte_WingbackWidth_bal4'].includes(name)) bonus += policy.attackBonus;
            if (name === 'Klopp_Gegenpress_att4') bonus += policy.attackBonus + policy.pressBonus;
            if (name === 'Bielsa_ChaosPress_att5') bonus += policy.attackBonus + policy.pressBonus + 3;
            if (name === 'Compact_Counter_def3' && signals.counterExitAvailable && signals.strengthGap < 0) bonus += Math.max(2, Math.round(policy.attackBonus * 0.6));
            if (name === 'Pep_BoxControl_bal2' && affinity.situation === 'pressure_escape') bonus += 6;
            if (name === 'Simeone_LowBlock_def5' && affinity.situation === 'siege_lock') bonus += 12;
            if (name === 'Pep_BoxControl_bal2' && appetite !== 'conservative' && !signals.highBadActions && !['control_reset','pressure_escape'].includes(affinity.situation)) bonus -= 7;
            result.score = owner.round(result.score + bonus);
            result.rawScore = owner.round(result.rawScore + bonus);
            result.parts.riskAppetite = bonus - affinity.delta;
            result.parts.situationFit = affinity.delta;
            result.situationKey = affinity.situation;
            if (affinity.reason) result.reasons.unshift({ key:'situationFit', delta:affinity.delta, reason:affinity.reason });
            if (bonus - affinity.delta) result.reasons.unshift({ key:'riskAppetite', delta:bonus - affinity.delta, reason:`профиль смелости: ${appetite}` });
            return result;
        };

        const originalRun = scorer.run.bind(scorer);
        scorer.run = function runPressureResponse(owner, signals, runtime, detectedPreset) {
            const decision = originalRun(owner, signals, runtime, detectedPreset);
            const appetite = normalizeRiskAppetite(signals.riskAppetite);
            decision.schema = 'slf_preset_rule_score_v4_pressure_response';
            decision.riskAppetite = appetite;
            decision.situationKey = signals.situationKey || classifySituation(signals);
            decision.pressureResponse = signals.pressureResponse || 'none';
            decision.exploration = { eligible:false, applied:false, threshold:0, policy:'disabled_deterministic_selection' };
            decision.action.riskAppetite = appetite;
            decision.action.situationKey = decision.situationKey;
            decision.action.pressureResponse = decision.pressureResponse;
            if (decision.situationKey === 'siege_lock') {
                decision.action.mandatoryReassessment = true;
                decision.action.reassessAtWindow = signals.mandatoryReassessmentWindow;
            }
            return applyInactionPenalty(owner, decision, signals, runtime);
        };

        scorer.__boldPolicyInstalled = true;
        scorer.__situationDiversityPolicyInstalled = true;
        scorer.__pressureResponseV6Installed = true;
    }

    function stripCandidateBlock(html) {
        return String(html || '').replace(/\s*<div[^>]*>\s*<b>Кандидаты:<\/b>[\s\S]*?<\/div>/i, '');
    }

    function patchSingleTacticRendering() {
        if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return false;
        if (RecommendationEngine.__singleTacticCoachModePatched) return true;
        if (typeof RecommendationEngine.compactPlan !== 'function') return false;
        const originalCompactPlan = RecommendationEngine.compactPlan.bind(RecommendationEngine);
        RecommendationEngine.compactPlan = function compactSingleTacticPlan() {
            return stripCandidateBlock(originalCompactPlan(...arguments));
        };
        RecommendationEngine.__singleTacticCoachModePatched = true;
        return true;
    }

    function scheduleSingleTacticRenderingPatch() {
        if (patchSingleTacticRendering()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (patchSingleTacticRendering() || attempts >= 40) clearInterval(timer);
        }, 50);
    }

    function evaluateRuleDecision(snapshot = {}, state = {}) {
        const engine = typeof window !== 'undefined' ? window.SLFCurrentActionHintEngine : null;
        if (!engine?.evaluate) return null;
        return engine.evaluate(snapshot, state);
    }

    function selectEvidencePreset(state = {}, snapshot = {}) {
        const decision = evaluateRuleDecision(snapshot, state);
        if (decision?.action?.preset && !REMOVED_PRESETS.has(decision.action.preset)) {
            return { name:decision.action.preset, reason:decision.action.reason, ruleDecision:decision, progressionAction:decision.action.guardType || 'rule_scored' };
        }
        return { name:'Arteta_Control433_bal3', reason:'5.61 fallback: структурный контроль', progressionAction:'rule_fallback' };
    }

    function patchActiveRegistry() {
        const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
        if (!registry) return;
        registry.active = ACTIVE_PRESETS.slice();
        registry.removed = Array.from(new Set([...(registry.removed || []), ...REMOVED_PRESETS]));
        registry.choosePreset = (state = {}, snapshot = {}) => selectEvidencePreset(state, snapshot);
        registry.ruleDecisionSchema = 'slf_rule_decision_v6_pressure_response';
        registry.riskAppetites = Object.assign({}, RISK_APPETITES);
        registry.defaultRiskAppetite = DEFAULT_RISK_APPETITE;
        registry.formations = Object.fromEntries(Object.entries(FORMATIONS).map(([name, positions]) => [name, positions.slice()]));
        registry.ladders = Object.assign({}, registry.ladders || {}, {
            defensive: ['Arteta_Control433_bal3','Simeone_Compact442_def4','Simeone_LowBlock_def5','Pep_PressCooldown_bal2'],
            balance: ['Pep_BoxControl_bal2','Arteta_Control433_bal3','Compact_Counter_def3'],
            attack: ATTACK_LADDER.slice()
        });
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__generator561PressureResponseApplied) return;
        RecommendationEngine.selectRawPreset = function selectGenerator561ScoredPreset(snapshot, state = {}) {
            const candidate = selectEvidencePreset(state, snapshot || {});
            if (snapshot && candidate?.ruleDecision) snapshot.ruleDecision = candidate.ruleDecision;
            return REMOVED_PRESETS.has(candidate?.name)
                ? { name:'Arteta_Control433_bal3', reason:'removed preset guard', progressionAction:'removed_preset_guard' }
                : candidate;
        };
        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
        RecommendationEngine.__generator561SelectionApplied = true;
        RecommendationEngine.__generator561RuleScorerApplied = true;
        RecommendationEngine.__generator561BoldRuleScorerApplied = true;
        RecommendationEngine.__generator561SituationRuleScorerApplied = true;
        RecommendationEngine.__generator561PressureResponseApplied = true;
    }

    function applyPolicy() {
        patchBasePresets();
        patchLibrary();
        patchFormationPanel();
        patchRuleEngine();
        patchActiveRegistry();
        patchRecommendationSelection();
        scheduleSingleTacticRenderingPatch();
    }

    applyPolicy();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            version: POLICY_VERSION,
            generatorVersion: '5.61',
            autoApply: false,
            removedPresets: Array.from(REMOVED_PRESETS),
            activePresets: ACTIVE_PRESETS.slice(),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            riskAppetites: Object.assign({}, RISK_APPETITES),
            defaultRiskAppetite: DEFAULT_RISK_APPETITE,
            signatures: Object.fromEntries(Object.entries(TACTIC_SIGNATURES).map(([name, signature]) => [name, Object.assign({}, signature)])),
            formations: Object.fromEntries(Object.entries(FORMATIONS).map(([name, positions]) => [name, positions.slice()])),
            schemeStates: Object.assign({}, SCHEME_STATES),
            attackLadder: ATTACK_LADDER.slice(),
            normalizeRiskAppetite,
            deriveCounterTransitionContext: derivePressureResponseContext,
            derivePressureResponseContext,
            classifySituation,
            situationAffinity,
            selectEvidencePreset,
            evaluateRuleDecision,
            stripCandidateBlock,
            refresh() { applyPolicy(); return true; }
        };
    }
})();
