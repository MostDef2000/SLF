// SLF Rule-Based Match Decision Engine
// ============================================================
// Button-only tactical recommendation policy.
//
// Contract:
// - runs only after the user requests a hint;
// - evaluates every active preset, not the first matching rule;
// - keeps emergency rules as hard overrides;
// - never applies a tactic automatically;
// - keeps short in-memory match history for power/vector deltas and hysteresis;
// - exposes candidate scores, vetoes, confidence and explanations for telemetry.

const CurrentActionHintEngine = {
    // Registry-aware schema read: v9 suite schema when the active registry is present,
    // legacy v3 constant only as last resort (e.g. registry not loaded yet).
    schema: (typeof window !== 'undefined' && window.SLFActivePresetRegistry?.recommendationSchema) || 'slf_rule_decision_v3',
    mode: 'button_on_demand_scored_rules',

    // v9 preset list retired: tactic-preset-direction-policy.js overwrites
    // ACTIVE_PRESETS from the v11 registry at load time. Kept as an empty
    // array (same shape) so pre-install readers see a valid container.
    ACTIVE_PRESETS: [],

    // v9 audit tiers retired: active-preset-registry.js overwrites
    // PRESET_AUDIT_TIER from the v11 registry at load time. Tier keys stay
    // (runtime code iterates them) with empty arrays.
    PRESET_AUDIT_TIER: {
        primary: [],
        conditional: [],
        restricted: [],
        emergency: [],
        removed: [],
        needsMoreData: [],
        experimental: [],
        blocked: []
    },

    HINT_RULES: [],
    runtimeByGame: new Map(),

    TACTIC_SIGNATURES: {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '4', pass_risk: '3', dribble: '2', cross: '2', shot: '2' },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' },
        Pep_PressCooldown_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '1', cross: '1', shot: '1' },
        // legacy_retired: signature kept for detection only (Compact_Counter_def3 is retired
        // from active selection; the signature still detects it as an actually applied tactic).
        Compact_Counter_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '4', style: '3', pass_risk: '2', dribble: '3', cross: '3', shot: '2' },
        Pep_ControlledPush_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '2', shot: '2' },
        Pep_TwoThreeFive_att3: { def_line: '2', press_line: '3', def_width: '3', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '5', pass_risk: '4', dribble: '3', cross: '2', shot: '3' },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '2', build_temp: '2', build_long: '2', build_fast: '2', style: '3', pass_risk: '3', dribble: '3', cross: '3', shot: '2' },
        Klopp_Gegenpress_att4: { def_line: '3', press_line: '4', def_width: '3', press_intense: '4', build_type: '3', build_temp: '3', build_long: '2', build_fast: '3', style: '5', pass_risk: '3', dribble: '3', cross: '3', shot: '3' },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '3', build_type: '2', build_temp: '1', build_long: '2', build_fast: '1', style: '2', pass_risk: '2', dribble: '1', cross: '2', shot: '1' },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '2', build_type: '1', build_temp: '1', build_long: '2', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', shot: '1' },
        Bielsa_ChaosPress_att5: { def_line: '4', press_line: '5', def_width: '4', press_intense: '5', build_type: '3', build_temp: '3', build_long: '3', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '4', shot: '4' }
    },

};

if (typeof window !== 'undefined') {
    window.SLFCurrentActionHintEngine = CurrentActionHintEngine;
    window.SLFMatchDecisionSignals = CurrentActionHintEngine.MatchDecisionSignals;
    window.SLFPresetRuleScorer = CurrentActionHintEngine.PresetRuleScorer;
}
