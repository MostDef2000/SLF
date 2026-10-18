// Final Tactic Merge Layer (issue #350)
// ============================================================
// Outermost CurrentActionHintEngine.run wrapper (installed after
// dave56-etalon-layer in bundle order). Merges the v11 preset
// recommendation (base) with the Dave 5.6 etalon (situational overrides)
// into ONE final recommended tactic and assigns result.finalTactic.
// NEVER modifies result.action or result.etalon and never applies
// anything automatically — the single merged hint-panel button is the
// only trigger (direction policy autoApply stays false).

(function finalTacticMergeLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__finalTacticMergeApplied) return;

    // Stale-registry guard (same pattern as dave56-etalon-layer): install
    // only on a known-current tactical suite registry, never on a stale one.
    // Accept-list: v11 (historical) and v12 (#361).
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    const SUPPORTED_SUITES = ['slf_tactic_suite_561_v11', 'slf_tactic_suite_561_v12'];
    if (!registry || !SUPPORTED_SUITES.includes(registry.suiteVersion)) return;

    const VERSION = 'slf_final_tactic_v1';
    const SOURCE = 'final_tactic_merge';

    // The 14 tactic controls grouped by etalon block. The etalon never
    // covers the attack keys; style belongs to the buildup block but is
    // tracked separately for provenance display.
    const DEFENSE_KEYS = ['def_line', 'press_line', 'def_width', 'press_intense'];
    const BUILDUP_KEYS = ['build_type', 'build_temp', 'build_long', 'build_fast'];
    const STYLE_KEY = 'style';
    const ATTACK_KEYS = ['pass_risk', 'dribble', 'cross', 'corner', 'shot'];
    const CONTROL_KEYS = DEFENSE_KEYS.concat(BUILDUP_KEYS, [STYLE_KEY], ATTACK_KEYS);

    const STRONG_DEFENSE_ID = /^d([2-9]|1[0-2])$/; // d2..d12 (d1 is the default)
    const STRONG_BUILDUP_ID = /^b([2-9]|1[0-2])$/; // b2..b12 (b1 is the default)

    function hasOwn(vector, key) {
        return !!vector && typeof vector === 'object' && Object.prototype.hasOwnProperty.call(vector, key);
    }

    function isInsufficientEtalon(etalon) {
        // T1: the etalon carries no applicable vector — pure preset/current.
        if (!etalon || etalon.ok === false) return true;
        if (Array.isArray(etalon.insufficientData) && etalon.insufficientData.includes('score_state')) return true;
        const applyVector = etalon.applyVector;
        if (!applyVector || typeof applyVector !== 'object' || !Object.keys(applyVector).length) return true;
        return false;
    }

    // Scenario strength detail: s1/s2@≥60/s4/s5 REPLACE blocks (visible as
    // non-default defense/buildup ids); s2 before minute 60 does not. Delta
    // scenarios (s3/s6) are strong only for the keys their delta actually
    // shifts: s3 splits press_line→defense, the rest→buildup; s6 shifts the
    // buildup block only. The shifted keys are read from the versioned
    // etalon data (read-only) instead of being hardcoded here.
    function collectScenarioStrength(etalon) {
        const result = { scenario: null, defenseKeys: [], buildupKeys: [] };
        const scenarios = Array.isArray(etalon?.scenarios) ? etalon.scenarios : [];
        if (scenarios.length) result.scenario = String(scenarios[0]?.id || scenarios[0]?.slug || '') || null;

        const data = typeof window !== 'undefined' ? window.SLFDave56EtalonData : null;
        const known = data && data.schema === 'slf_dave56_etalon_v1' && data.scenarios ? data.scenarios : null;
        if (!known) return result;

        for (const item of scenarios) {
            const scenario = known[String(item?.id || '')];
            const delta = scenario && !scenario.override && scenario.delta && typeof scenario.delta === 'object'
                ? scenario.delta
                : null;
            if (!delta) continue; // replacement scenarios act via their ids
            for (const key of Object.keys(delta)) {
                if (DEFENSE_KEYS.includes(key)) result.defenseKeys.push(key);
                else result.buildupKeys.push(key); // buildup keys + style
            }
        }
        return result;
    }

    function computeStrength(etalon) {
        const defenseId = etalon?.situationIds?.defense || null;
        const buildupId = etalon?.situationIds?.buildup || null;
        const shifted = collectScenarioStrength(etalon);
        return {
            defenseBlock: STRONG_DEFENSE_ID.test(String(defenseId || '')),
            buildupBlock: STRONG_BUILDUP_ID.test(String(buildupId || '')),
            defenseKeys: shifted.defenseKeys,
            buildupKeys: shifted.buildupKeys,
            scenario: shifted.scenario
        };
    }

    // All 14 values normalized to STRING ordinals (registry/current are
    // strings, etalon vectors are numbers — mixed types would split
    // telemetry fingerprints on 1 vs "1").
    function normalizeBaseVector(raw) {
        const out = {};
        for (const key of CONTROL_KEYS) {
            if (raw && raw[key] !== undefined && raw[key] !== null) out[key] = String(raw[key]);
        }
        out.priority = Array.isArray(raw?.priority) ? raw.priority.map(String) : [];
        return out;
    }

    function resolveBase(snapshot, result) {
        const action = result?.action || null;
        const presetId = action?.preset || null;
        if (presetId && hasOwn(registry.presets, presetId) && registry.presets[presetId]) {
            return {
                base: `preset:${presetId}`,
                presetId,
                vector: normalizeBaseVector(registry.presets[presetId]),
                fromCurrent: false
            };
        }
        // T6 hold_current (or a stale preset name): base = current tactic.
        let current = null;
        try {
            current = typeof getCurrentTactic === 'function' ? getCurrentTactic() : null;
        } catch (_) {
            current = null;
        }
        if (!current || typeof current !== 'object') return null;
        return {
            base: 'current_tactic',
            presetId: null,
            vector: normalizeBaseVector(current),
            fromCurrent: true,
            stalePreset: Boolean(presetId)
        };
    }

    function applyEtalonOverrides(vector, etalon, strength, overrides) {
        const defenseVector = etalon?.defenseVector;
        const buildupVector = etalon?.buildupVector;
        const defenseId = etalon?.situationIds?.defense || null;
        const buildupId = etalon?.situationIds?.buildup || null;

        // Defense block: strong → etalon overrides present keys; preset/current fills gaps.
        if (strength.defenseBlock || strength.defenseKeys.length) {
            const keys = strength.defenseBlock ? DEFENSE_KEYS : strength.defenseKeys;
            for (const key of keys) {
                if (hasOwn(defenseVector, key)) vector[key] = String(defenseVector[key]);
            }
            if (defenseId) overrides.defense = `etalon:${defenseId}`;
        }

        // Buildup block (style may be absent, e.g. b6 → base keeps it).
        if (strength.buildupBlock || strength.buildupKeys.length) {
            const keys = strength.buildupBlock ? BUILDUP_KEYS.concat([STYLE_KEY]) : strength.buildupKeys;
            for (const key of keys) {
                if (hasOwn(buildupVector, key)) vector[key] = String(buildupVector[key]);
            }
            if (buildupId) overrides.buildup = `etalon:${buildupId}`;
        }

        // Style provenance follows the buildup override only when the etalon
        // actually supplied the key.
        if (hasOwn(buildupVector, STYLE_KEY) && (strength.buildupBlock || strength.buildupKeys.includes(STYLE_KEY))) {
            overrides.style = buildupId ? `etalon:${buildupId}` : overrides.style;
        }

        // Priority: etalon lanes win when the buildup block is strong and
        // lanes are defined; otherwise the base priority survives.
        if ((strength.buildupBlock || strength.buildupKeys.length)
            && Array.isArray(etalon?.priorityLanes) && etalon.priorityLanes.length) {
            vector.priority = etalon.priorityLanes.map(String);
            overrides.priority = buildupId ? `etalon:${buildupId}` : overrides.priority;
        }

        return vector;
    }

    function computeDeltaVsCurrent(vector) {
        try {
            if (typeof getCurrentTactic !== 'function' || !vector) return null;
            const current = getCurrentTactic();
            if (!current || typeof current !== 'object') return null;
            const delta = [];
            for (const key of CONTROL_KEYS) {
                if (vector[key] === undefined) continue;
                if (String(current[key] ?? '') !== String(vector[key])) {
                    delta.push({ key, from: current[key] ?? null, to: vector[key] });
                }
            }
            const norm = value => (Array.isArray(value) ? value : []).map(String).sort().join(',');
            if (norm(current.priority) !== norm(vector.priority)) {
                delta.push({ key: 'priority', from: (current.priority || []).join('+'), to: (vector.priority || []).join('+') });
            }
            return delta;
        } catch (_) {
            return null;
        }
    }

    function buildReferenceLine(base, etalon) {
        const defenseId = etalon?.situationIds?.defense || 'd1';
        const buildupId = etalon?.situationIds?.buildup || 'b1';
        const tail = base === 'current_tactic' ? 'оставлена текущая тактика' : 'применён пресет';
        return `Эталон: ${defenseId}/${buildupId} — равный матч, ${tail}`;
    }

    function computeFinalTactic(snapshot, context, result) {
        const etalon = result?.etalon || null;
        const baseInfo = resolveBase(snapshot, result);
        if (!baseInfo) return null; // no preset and no readable current tactic

        const overrides = {
            defense: baseInfo.fromCurrent ? 'current' : 'preset',
            buildup: baseInfo.fromCurrent ? 'current' : 'preset',
            style: baseInfo.fromCurrent ? 'current' : 'preset',
            attack: baseInfo.fromCurrent ? 'current' : 'preset',
            priority: baseInfo.fromCurrent ? 'current' : 'preset'
        };

        const vector = Object.assign({}, baseInfo.vector);
        const etalonIds = Array.isArray(etalon?.ids) ? etalon.ids.filter(Boolean).map(String) : [];
        const insufficientData = Array.isArray(etalon?.insufficientData)
            ? etalon.insufficientData.map(String)
            : ['etalon_layer_absent'];
        const notes = Array.isArray(etalon?.notes) ? etalon.notes.filter(Boolean).map(String) : [];

        let referenceLine = null;
        let strong = { defense: false, buildup: false, scenario: null };

        if (baseInfo.stalePreset) {
            insufficientData.push('stale_preset_name');
        }

        if (!isInsufficientEtalon(etalon)) {
            const strength = computeStrength(etalon);
            strong = { defense: strength.defenseBlock || strength.defenseKeys.length > 0,
                buildup: strength.buildupBlock || strength.buildupKeys.length > 0,
                scenario: strength.scenario };

            if (strong.defense || strong.buildup) {
                applyEtalonOverrides(vector, etalon, strength, overrides);
            } else {
                // T2 generic-only: preset/current base, etalon as a reference line.
                referenceLine = buildReferenceLine(baseInfo.base, etalon);
            }
        }

        // Provenance of the merged recommendation: etalon ids + base preset,
        // or the etalon ids over the current tactic (hold_current).
        const source = baseInfo.fromCurrent
            ? `merged:current:${etalonIds.join('+')}`
            : `merged:etalon:${etalonIds.join('+')}+presets:${baseInfo.presetId}`;

        return {
            schema: VERSION,
            vector,
            base: baseInfo.base,
            overrides,
            source,
            strong,
            deltaVsCurrent: computeDeltaVsCurrent(vector),
            presetId: baseInfo.presetId,
            etalonIds,
            insufficientData,
            notes,
            referenceLine
        };
    }

    function degradedFinalTactic() {
        return {
            schema: VERSION,
            source: SOURCE,
            ok: false,
            error: 'final_tactic_computation_failed',
            vector: null,
            base: null,
            overrides: null,
            strong: { defense: false, buildup: false, scenario: null },
            deltaVsCurrent: null,
            presetId: null,
            etalonIds: [],
            insufficientData: ['exception'],
            notes: [],
            referenceLine: null
        };
    }

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);
    CurrentActionHintEngine.run = function runWithFinalTacticMerge(snapshot, context = {}) {
        const result = originalRun(snapshot, context) || {};
        try {
            result.finalTactic = computeFinalTactic(snapshot, context, result);
        } catch (error) {
            result.finalTactic = degradedFinalTactic();
        }
        return result;
    };

    CurrentActionHintEngine.__finalTacticMergeApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFFinalTacticMergeLayer = {
            version: VERSION,
            suiteVersion: registry.suiteVersion,
            source: SOURCE,
            autoApply: false,
            computeFinalTactic
        };
    }
})();

// ============================================================
