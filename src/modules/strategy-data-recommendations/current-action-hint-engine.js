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
    schema: 'slf_rule_decision_v3',
    mode: 'button_on_demand_scored_rules',

    ACTIVE_PRESETS: [
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
    ],

    PRESET_AUDIT_TIER: {
        primary: [
            'Arteta_Control433_bal3',
            'Pep_BoxControl_bal2',
            'Pep_PressCooldown_bal2',
            'Compact_Counter_def3',
            'Pep_TwoThreeFive_att3'
        ],
        conditional: [
            'Pep_ControlledPush_att3',
            'Conte_WingbackWidth_bal4',
            'Simeone_Compact442_def4'
        ],
        restricted: ['Klopp_Gegenpress_att4'],
        emergency: ['Simeone_LowBlock_def5', 'Bielsa_ChaosPress_att5'],
        removed: [
            'Mourinho_WeakSide_def3',
            'Xabi_VerticalBox_att3',
            'Xabi_BoxMidfield_bal3',
            'DeZerbi_BaitPress_bal3',
            'DeZerbi_Release_att4',
            'Nagelsmann_WidePress_att4',
            'Henta_LeftTrap_att3'
        ],
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
