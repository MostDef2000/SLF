// Adaptive Opponent Style Layer
// ============================================================
// Coach Mode v2: adapt tactical hints to the opponent style
// detected inside the current match.
//
// Contract:
// - in-memory match style only;
// - no localStorage;
// - no user feedback memory;
// - no new presets;
// - no UI explanation layer.

(function adaptiveOpponentStyleLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__adaptiveOpponentStyleApplied) return;

    const STABLE_THRESHOLD = 3;
    const HISTORY_LIMIT = 8;

    const STYLE_TO_PRESET = {
        high_press_team: {
            prefer: ['DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Compact_Counter_def3'],
            avoid: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4']
        },
        low_block_team: {
            prefer: ['Conte_WingbackWidth_bal4', 'Pep_TwoThreeFive_att3', 'Xabi_BoxMidfield_bal3'],
            avoid: ['Compact_Counter_def3', 'Simeone_LowBlock_def5', 'Simeone_Compact442_def4']
        },
        counter_attack_team: {
            prefer: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3'],
            avoid: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5']
        },
        wide_cross_team: {
            prefer: ['Simeone_Compact442_def4', 'Compact_Counter_def3', 'Mourinho_WeakSide_def3'],
            avoid: ['Conte_WingbackWidth_bal4', 'Nagelsmann_WidePress_att4']
        },
        center_compact_team: {
            prefer: ['Conte_WingbackWidth_bal4', 'DeZerbi_Release_att4', 'Mourinho_WeakSide_def3'],
            avoid: ['Xabi_BoxMidfield_bal3', 'Xabi_VerticalBox_att3']
        },
        open_game: {
            prefer: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Pep_PressCooldown_bal2'],
            avoid: ['Bielsa_ChaosPress_att5']
        },
        possession_team: {
            prefer: ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Compact_Counter_def3'],
            avoid: ['Pep_BoxControl_bal2']
        }
    };

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);
    const styleMemory = new Map();

    function contextOf(result) {
        return result?.moment?.context || {};
    }

    function gameIdOf(result) {
        const c = contextOf(result);
        return String(result?.moment?.gameId || c.gameId || 'unknown');
    }

    function minuteOf(result) {
        const c = contextOf(result);
        return Number(result?.moment?.minute ?? c.minute ?? 0) || 0;
    }

    function ensureGame(gameId) {
        if (!styleMemory.has(gameId)) {
            styleMemory.set(gameId, {
                samples: [],
                counts: {
                    high_press_team: 0,
                    low_block_team: 0,
                    counter_attack_team: 0,
                    wide_cross_team: 0,
                    center_compact_team: 0,
                    open_game: 0,
                    possession_team: 0
                }
            });
        }
        return styleMemory.get(gameId);
    }

    function trimMemory() {
        if (styleMemory.size <= 6) return;
        const keys = Array.from(styleMemory.keys());
        keys.slice(0, Math.max(0, keys.length - 6)).forEach(key => styleMemory.delete(key));
    }

    function hasSignal(c, name) {
        return Array.isArray(c.signals) && c.signals.includes(name);
    }

    function detectSampleStyles(c) {
        const styles = [];
        const add = style => {
            if (!styles.includes(style)) styles.push(style);
        };

        if (c.opponentHighPress || Number(c.oppPress || 0) > 65 || hasSignal(c, 'opponent_high_press')) {
            add('high_press_team');
        }

        if (c.opponentLowBlock || Number(c.oppDef || 0) < 45 || hasSignal(c, 'opponent_low_block')) {
            add('low_block_team');
        }

        if (c.transitionThreat || hasSignal(c, 'transition_threat') || hasSignal(c, 'opponent_fast_counter_threat')) {
            add('counter_attack_team');
        }

        if (c.opponentCrossesDangerous || hasSignal(c, 'opponent_crosses_dangerous')) {
            add('wide_cross_team');
        }

        if (c.centerClosed || hasSignal(c, 'center_closed')) {
            add('center_compact_team');
        }

        if (c.underPressure && c.attackingMomentum) {
            add('open_game');
        }

        if (Number(c.oppXT || 0) > Number(c.myXT || 0) + 0.15 && !c.opponentHighPress && !c.transitionThreat) {
            add('possession_team');
        }

        return styles;
    }

    function rememberStyles(gameId, minute, styles) {
        const memory = ensureGame(gameId);

        if (memory.samples.length && minute < Number(memory.samples[memory.samples.length - 1].minute || 0)) {
            memory.samples = [];
            Object.keys(memory.counts).forEach(key => memory.counts[key] = 0);
        }

        memory.samples.push({ minute, styles: styles.slice(), ts: Date.now() });
        while (memory.samples.length > HISTORY_LIMIT) memory.samples.shift();

        Object.keys(memory.counts).forEach(key => memory.counts[key] = 0);
        memory.samples.forEach(sample => {
            sample.styles.forEach(style => {
                if (memory.counts[style] !== undefined) memory.counts[style] += 1;
            });
        });

        trimMemory();
        return memory;
    }

    function stableStyles(memory) {
        return Object.entries(memory.counts)
            .filter(([, count]) => count >= STABLE_THRESHOLD)
            .sort((a, b) => b[1] - a[1])
            .map(([style]) => style);
    }

    function isEmergency(result, c) {
        const action = result?.action || {};
        return action.presetStatus === 'emergency' || c.lateNeedGoal || (c.protectLead && Number(c.minute || 0) >= 80);
    }

    function canUsePreset(preset, c) {
        if (!preset) return false;
        if (typeof CurrentActionHintEngine.isPresetAllowed === 'function' && !CurrentActionHintEngine.isPresetAllowed(preset, c)) return false;

        if (c.highBadActions && ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5'].includes(preset)) return false;
        if (c.pressFatigueRisk && ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5', 'Pep_TwoThreeFive_att3'].includes(preset)) return false;
        if (c.centerClosed && ['Xabi_BoxMidfield_bal3', 'Xabi_VerticalBox_att3'].includes(preset)) return false;
        if (c.ownCrossesBad && ['Conte_WingbackWidth_bal4', 'Nagelsmann_WidePress_att4'].includes(preset)) return false;
        if (c.transitionThreat && ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5'].includes(preset) && !c.lateNeedGoal) return false;

        return true;
    }

    function candidateFromStyle(style, currentPreset, c) {
        const rule = STYLE_TO_PRESET[style];
        if (!rule) return currentPreset;

        if (!rule.avoid.includes(currentPreset)) return currentPreset;

        return rule.prefer.find(preset => canUsePreset(preset, c)) || currentPreset;
    }

    function applyAdaptiveStyle(result) {
        if (!result?.action) return result;

        const c = contextOf(result);
        const gameId = gameIdOf(result);
        const minute = minuteOf(result);
        const sampleStyles = detectSampleStyles(c);
        const memory = rememberStyles(gameId, minute, sampleStyles);
        const styles = stableStyles(memory);

        if (!styles.length || isEmergency(result, c)) {
            result.action = Object.assign({}, result.action, {
                adaptiveCoach: 'v2',
                opponentStyles: styles
            });
            return result;
        }

        let preset = result.action.preset;
        const rawPreset = result.action.rawPreset || result.action.preset;

        for (const style of styles) {
            const next = candidateFromStyle(style, preset, c);
            if (next !== preset) {
                preset = next;
                break;
            }
        }

        result.action = Object.assign({}, result.action, {
            preset,
            adaptiveCoach: 'v2',
            opponentStyles: styles,
            rawPreset
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithAdaptiveOpponentStyle(snapshot, context = {}) {
        return applyAdaptiveStyle(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.__adaptiveOpponentStyleApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFAdaptiveOpponentStyleLayer = {
            getMemory: () => Array.from(styleMemory.entries()).map(([gameId, memory]) => ({
                gameId,
                counts: Object.assign({}, memory.counts),
                samples: memory.samples.slice()
            }))
        };
    }
})();
