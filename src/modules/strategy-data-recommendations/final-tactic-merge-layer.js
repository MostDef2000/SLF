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

    // Issue #477 — canon-first final selection. When the manual matcher
    // resolved a situation, its row id, variant and all six manual settings
    // are authoritative. The unrelated controls (defense block, attack keys)
    // keep the preset/current contract; the six manual fields are never
    // overlaid again by a preset, etalon, scenario delta or LLM reply.
    const CANON_MANUAL_KEYS = ['build_type', 'build_temp', 'build_long', 'build_fast', 'style'];

    function isMatchedCanon(canon) {
        return !!canon && canon.schema === 'slf_canon_decision_v1'
            && canon.status === 'matched' && canon.vector && typeof canon.vector === 'object';
    }

    // #477 NEW-P1-1: a resolved SLF addition is actionable but is NOT a
    // manual row. It names an eligible role whose preset realizes it.
    function isAdditionCanon(canon) {
        return !!canon && canon.schema === 'slf_canon_decision_v1'
            && canon.status === 'addition' && canon.actionable === true;
    }

    function additionEligibleRole(canon) {
        if (!canon || canon.status !== 'addition') return null;
        if (typeof canon.eligibleRole === 'string' && canon.eligibleRole) return canon.eligibleRole;
        if (Array.isArray(canon.eligibleRoles)) {
            const role = canon.eligibleRoles.find(item => typeof item === 'string' && item);
            if (role) return role;
        }
        return null;
    }

    // The addition's eligible preset becomes the base vector. It is never a
    // manual row: the six manual settings come from the preset controls.
    function resolveAdditionBase(canon) {
        const presetId = additionEligibleRole(canon);
        if (!presetId) return null;
        if (registry.presets && hasOwn(registry.presets, presetId) && registry.presets[presetId]) {
            return {
                base: `preset:${presetId}`,
                presetId,
                vector: normalizeBaseVector(registry.presets[presetId]),
                fromCurrent: false
            };
        }
        return null;
    }

    function canonAdditionReference(canon) {
        const additions = Array.isArray(canon.additions) ? canon.additions : [];
        const names = additions
            .map(item => (item && (item.situation || item.id)) || '')
            .filter(Boolean);
        const label = names.length ? names.join(', ') : 'дополнение SLF';
        const role = additionEligibleRole(canon);
        return `Дополнение SLF: ${label} — пресет ${role || '—'}`;
    }

    function canonSettingWord(canon, key, fallback) {
        const text = canon && canon.settingText && typeof canon.settingText === 'object' ? canon.settingText : null;
        return text && text[key] ? text[key] : fallback;
    }

    function canonReferenceText(canon) {
        const vector = canon.vector || {};
        const lanes = String(vector.priority || '000');
        // #477: the manual's verbatim words are shown alongside the ordinals so
        // the hint explains itself ("Позиционный", "Низкий / средний", ...),
        // never just bare numbers.
        return `Канон №${canon.id} «${canon.situationText}»`
            + (canon.variant ? ` (${canon.variant})` : '')
            + `: направление ${lanes} · выход ${canonSettingWord(canon, 'build_type', vector.build_type)}`
            + ` · темп ${canonSettingWord(canon, 'build_temp', vector.build_temp)}`
            + ` · диагонали ${canonSettingWord(canon, 'build_long', vector.build_long)}`
            + ` · в касание ${canonSettingWord(canon, 'build_fast', vector.build_fast)}`
            + ` · стиль ${canonSettingWord(canon, 'style', vector.style)}`;
    }

    // #477 P1-2: a canon decision that exists but did not resolve a row must
    // never be papered over with a preset/etalon vector. It is surfaced as a
    // non-actionable reference explaining why (status/candidates/missing).
    function canonUnresolvedReference(canon) {
        const parts = [];
        if (canon.status === 'ambiguous') {
            parts.push('Канон: выбор неоднозначно определён — нужно уточнить ситуацию');
        } else if (canon.status === 'missing_inputs') {
            parts.push('Канон: недостаточно данных для выбора строки');
        } else {
            parts.push(`Канон: строка не сопоставлена (${canon.status})`);
        }
        const candidates = Array.isArray(canon.candidates) ? canon.candidates.filter(item => item && item.id != null) : [];
        if (candidates.length) {
            parts.push('кандидаты: ' + candidates
                .map(item => `№${item.id}${item.variant ? '/' + item.variant : ''}`)
                .join(', '));
        }
        const missing = Array.isArray(canon.missingInputs) ? canon.missingInputs.filter(Boolean) : [];
        if (missing.length) parts.push('не хватает: ' + missing.join(', '));
        return parts.join(' · ');
    }

    function canonSettingNotes(canon) {
        const text = canon && canon.settingText && typeof canon.settingText === 'object' ? canon.settingText : null;
        if (!text) return [];
        const notes = [];
        if (text.build_type) notes.push(`Выход из обороны: ${text.build_type}`);
        if (text.build_temp) notes.push(`Темп: ${text.build_temp}`);
        if (text.build_long || text.build_fast) {
            notes.push(`Диагонали: ${text.build_long || '—'} · в касание: ${text.build_fast || '—'}`);
        }
        if (text.style) notes.push(`Стиль: ${text.style}`);
        return notes;
    }

    function applyCanon(vector, canon, overrides) {
        for (const key of CANON_MANUAL_KEYS) {
            if (canon.vector[key] !== undefined && canon.vector[key] !== null) {
                vector[key] = String(canon.vector[key]);
            }
        }
        const priorities = Array.isArray(canon.priorityLanes)
            ? canon.priorityLanes.map(String)
            : (String(canon.vector.priority || '000').split('').map((flag, index) => (
                flag === '1' ? ['left', 'center', 'right'][index] : null
            )).filter(Boolean));
        vector.priority = priorities;
        overrides.buildup = `canon:row${canon.id}`;
        overrides.style = `canon:row${canon.id}`;
        overrides.priority = `canon:row${canon.id}`;
        return vector;
    }

    function computeFinalTactic(snapshot, context, result) {
        const etalon = result?.etalon || null;
        const canon = result?.canon || null;
        const canonMatched = isMatchedCanon(canon);
        const canonAddition = isAdditionCanon(canon);

        // #477 P1-2: a canon decision that exists but did not resolve a row or
        // an actionable addition is authoritative in the NEGATIVE — it must
        // never fall through to a preset/etalon vector. Only canon == null
        // keeps the legacy path.
        if (canon && !canonMatched && !canonAddition) {
            return {
                schema: VERSION,
                vector: null,
                base: null,
                overrides: null,
                source: `canon:${canon.status}`,
                strong: { defense: false, buildup: false, scenario: null, canon: false },
                deltaVsCurrent: null,
                presetId: null,
                etalonIds: Array.isArray(etalon?.ids) ? etalon.ids.filter(Boolean).map(String) : [],
                insufficientData: Array.isArray(canon.missingInputs) ? canon.missingInputs.map(String) : [],
                notes: [],
                referenceLine: canonUnresolvedReference(canon),
                canon
            };
        }

        // An actionable addition resolves its base to the eligible role's
        // preset; anything else uses the preset/current resolution.
        let baseInfo = canonAddition ? resolveAdditionBase(canon) : null;
        if (!baseInfo) baseInfo = resolveBase(snapshot, result);
        // A resolved manual row is actionable even without a readable preset
        // or current tactic: only the six manual settings are known, the rest
        // stay absent (never invented).
        if (!baseInfo && canonMatched) {
            baseInfo = { base: 'canon_only', presetId: null, vector: normalizeBaseVector({}), fromCurrent: false, stalePreset: false };
        }
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
        let insufficientData = Array.isArray(etalon?.insufficientData)
            ? etalon.insufficientData.map(String)
            : ['etalon_layer_absent'];
        const CANON_LEGEND = Array.isArray(canon?.legend) ? canon.legend.filter(Boolean).map(String) : [];
        let notes = Array.isArray(etalon?.notes) ? etalon.notes.filter(Boolean).map(String) : [];

        let referenceLine = null;
        let strong = { defense: false, buildup: false, scenario: null };
        let source = null;

        if (baseInfo.stalePreset) {
            insufficientData.push('stale_preset_name');
        }

        if (canonMatched) {
            // Canon wins: no etalon overlay, no scenario delta, no preset
            // mutation of the six manual settings.
            applyCanon(vector, canon, overrides);
            strong = { defense: false, buildup: true, scenario: null, canon: true };
            referenceLine = canonReferenceText(canon);
            notes = [canon.situationText].concat(canonSettingNotes(canon), CANON_LEGEND);
            insufficientData = [];
            source = `canon:${canon.id}${canon.variant ? '/' + canon.variant : ''}+base:${baseInfo.base}`;
        } else if (canonAddition) {
            // #477 NEW-P1-1: an actionable addition resolves to its eligible
            // preset as the base. It is NOT a manual row (no «Канон №» line)
            // and is never overlaid by the etalon; the reference names the
            // addition and the preset that realizes it.
            referenceLine = canonAdditionReference(canon);
            const additionNames = Array.isArray(canon.additions)
                ? canon.additions.map(item => (item && item.situation) || '').filter(Boolean)
                : [];
            notes = additionNames;
            insufficientData = [];
            strong = { defense: false, buildup: false, scenario: null, canon: false };
            source = `canon:addition+base:${baseInfo.base}`;
        } else {
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
            source = baseInfo.fromCurrent
                ? `merged:current:${etalonIds.join('+')}`
                : `merged:etalon:${etalonIds.join('+')}+presets:${baseInfo.presetId}`;
        }

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
            referenceLine,
            canon: canon || null
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
            referenceLine: null,
            canon: null
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
