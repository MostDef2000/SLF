// Dave 5.6 Etalon Layer (issue #348)
// ============================================================
// Outermost CurrentActionHintEngine.run wrapper (installed after
// moment-drift-stabilizer in bundle order). Reads the engine result,
// matches the Dave 5.6 etalon situations (dave56-etalon-data.js) via
// the word→ordinal mapper (dave56-etalon-mapping.js), applies score-play
// scenarios and assigns result.etalon. NEVER modifies result.action and
// never applies anything automatically — the hint-panel button is the
// only trigger (direction policy autoApply stays false).

(function dave56EtalonLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__dave56EtalonApplied) return;

    // Stale-registry guard (same pattern as tactic-preset-direction-policy):
    // install only on the v11 tactical suite registry, never on a stale one.
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    const data = typeof window !== 'undefined' ? window.SLFDave56EtalonData : null;
    const mapping = typeof window !== 'undefined' ? window.SLFDave56EtalonMapping : null;
    if (!registry || registry.suiteVersion !== 'slf_tactic_suite_561_v11') return;
    if (!data || data.schema !== 'slf_dave56_etalon_v1' || !mapping || mapping.schema !== data.schema) return;

    const VERSION = 'slf_dave56_etalon_v1';
    const has = (tags, tag) => Array.isArray(tags) && tags.includes(tag);
    const numOrNull = value => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    function findStats(snapshot, teamId) {
        const rows = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
        const id = Number(teamId);
        const row = rows.find(item => Number(item?.teamId) === id);
        return row?.stats || null;
    }

    function pickNumber(...values) {
        for (const value of values) {
            const n = numOrNull(value);
            if (n !== null) return n;
        }
        return null;
    }

    // Snapshot → signals/metrics. Reuses existing signals only; no new DOM
    // parsing is introduced in v1.
    function collectContext(snapshot, context, result) {
        const tags = [];
        const addTag = tag => {
            const value = String(tag || '').trim();
            if (value && !tags.includes(value)) tags.push(value);
        };
        (Array.isArray(context?.tags) ? context.tags : []).forEach(addTag);
        (Array.isArray(snapshot?.tags) ? snapshot.tags : []).forEach(addTag);
        (Array.isArray(result?.moment?.signals) ? result.moment.signals : []).forEach(addTag);
        (Array.isArray(result?.moment?.context?.signals) ? result.moment.context.signals : []).forEach(addTag);
        const lastContext = typeof window !== 'undefined' ? window.SLFLastCoachHintContext : null;
        if (String(lastContext?.gameId || '') === String(snapshot?.gameId || '') && Array.isArray(lastContext?.signals)) {
            lastContext.signals.forEach(addTag);
        }

        const myTeam = Number(snapshot?.myTeam || 0) || null;
        const teams = (Array.isArray(snapshot?.teams) ? snapshot.teams : []).map(Number);
        const oppTeam = myTeam !== null ? (teams.find(id => id !== myTeam) ?? null) : null;
        const myStats = myTeam !== null ? findStats(snapshot, myTeam) : null;
        const oppStats = oppTeam !== null ? findStats(snapshot, oppTeam) : null;
        const mc = result?.moment?.context || {};
        const lastMetrics = lastContext?.metrics || {};

        const score = context?.score || null;
        const scoreState = score?.state || result?.moment?.score || null;
        const scoreDiff = score && Number.isFinite(Number(score.diff)) ? Number(score.diff)
            : (snapshot?.score && Number.isFinite(Number(snapshot.score.diff)) ? Number(snapshot.score.diff) : null);

        return {
            tags,
            scoreState: ['winning', 'losing', 'draw'].includes(scoreState) ? scoreState : null,
            scoreDiff,
            minute: pickNumber(context?.minute, result?.moment?.minute, snapshot?.minute, lastContext?.minute),
            myDef: pickNumber(myStats?.defVector),
            myPress: pickNumber(myStats?.pressVector, lastMetrics.myPress),
            oppDef: pickNumber(context?.oppDefVector, oppStats?.defVector),
            oppPress: pickNumber(context?.oppPressVector, oppStats?.pressVector, lastMetrics.oppPress),
            myBad: pickNumber(context?.myBad, lastMetrics.myBad),
            myFouls: pickNumber(context?.myFouls),
            myXg: pickNumber(context?.myXg, lastMetrics.myXg),
            oppXg: pickNumber(context?.oppXg, lastMetrics.oppXg),
            myPossession: pickNumber(context?.myPossession, mc.myPossession, myStats?.possession),
            oppPossession: pickNumber(context?.oppPossession, mc.oppPossession, oppStats?.possession),
            oppCrossTotal: pickNumber(context?.oppCrossSummary?.total),
            strengthMode: context?.strengthContext?.mode || null,
            strengthKnown: context?.strengthContext?.known === true
        };
    }

    // Situation matching: first match wins per block; the numeric value is
    // the matched-signals count (confidence). Defaults are evaluated last.
    const DEFENSE_RULES = [
        { id: 'd4', when: c => (has(c.tags, 'losing') && has(c.tags, 'need_goal')) ? 2 : null },
        { id: 'd5', when: c => (has(c.tags, 'winning') && has(c.tags, 'late_protect_lead')) ? 2 : null },
        { id: 'd2', when: c => has(c.tags, 'strength_advantage_clear') ? 1 : null },
        { id: 'd3', when: c => has(c.tags, 'strength_disadvantage_clear') ? 1 : null },
        { id: 'd6', when: c => (c.myDef !== null && c.myDef >= 20) ? 1 : null },
        { id: 'd7', when: c => (c.myDef !== null && c.myDef <= -20) ? 1 : null },
        { id: 'd8', when: c => (c.myPress !== null && c.myPress >= 20) ? 1 : null },
        { id: 'd9', when: c => (c.myPress !== null && c.myPress <= -20) ? 1 : null },
        { id: 'd10', when: c => {
            const hits = [has(c.tags, 'opponent_crosses_dangerous'), has(c.tags, 'wide_cross_team'), c.oppCrossTotal !== null && c.oppCrossTotal > 5]
                .filter(Boolean).length;
            return hits ? hits : null;
        } },
        { id: 'd11', when: c => (c.oppDef !== null && c.oppDef >= 65 && (has(c.tags, 'center_closed') || has(c.tags, 'center_weak'))) ? 2 : null },
        { id: 'd12', when: c => (c.myFouls !== null && c.minute !== null && c.minute >= 15 && c.myFouls * 15 >= c.minute) ? 2 : null },
        { id: 'd1', when: c => 1 } // default when no strong tags
    ];

    const BUILDUP_RULES = [
        { id: 'b4', when: c => (has(c.tags, 'losing') && has(c.tags, 'need_goal')) ? 2 : null },
        { id: 'b5', when: c => (has(c.tags, 'winning') && has(c.tags, 'late_protect_lead')) ? 2 : null },
        { id: 'b2', when: c => has(c.tags, 'strength_advantage_clear') ? 1 : null },
        { id: 'b3', when: c => has(c.tags, 'strength_disadvantage_clear') ? 1 : null },
        { id: 'b6', when: c => has(c.tags, 'opponent_high_press') ? 1 : null },
        { id: 'b7', when: c => (c.oppPress !== null && c.oppPress <= 45 && has(c.tags, 'low_bad_actions')) ? 2 : null },
        { id: 'b8', when: c => has(c.tags, 'opponent_low_block') ? 1 : null },
        { id: 'b9', when: c => (has(c.tags, 'high_bad_actions') || (c.myBad !== null && c.myBad >= 20)) ? 1 : null },
        { id: 'b11', when: c => {
            if (has(c.tags, 'generator_defense_working') && has(c.tags, 'generator_attack_working')) return 2;
            if (c.myPossession !== null && c.oppPossession !== null && c.myPossession > c.oppPossession) return 1;
            return null;
        } },
        { id: 'b12', when: c => {
            const oppMomentum = has(c.tags, 'under_pressure')
                || (c.myXg !== null && c.oppXg !== null && c.oppXg > c.myXg + 0.3);
            return (oppMomentum && has(c.tags, 'need_goal')) ? 2 : null;
        } },
        // b10 (игра через «столба») has no reliable signal in v1 — never
        // matched; reported as insufficient data instead.
        { id: 'b1', when: c => 1 } // default when no strong tags
    ];

    function matchBlock(rules, ctx) {
        for (const rule of rules) {
            let confidence = null;
            try { confidence = rule.when(ctx); } catch (_) { confidence = null; }
            if (confidence !== null && confidence !== undefined) {
                return { id: rule.id, confidence: Number(confidence) || 1 };
            }
        }
        return null;
    }

    function isStrengthEqual(ctx) {
        if (ctx.strengthKnown) return ctx.strengthMode === 'equal';
        return false;
    }

    function applyDelta(vector, delta) {
        const out = Object.assign({}, vector);
        for (const [key, shift] of Object.entries(delta || {})) {
            const current = numOrNull(out[key]);
            if (current === null) continue; // control not defined by the etalon → skip
            const clamped = mapping.clamp(key, current + Number(shift));
            if (clamped !== null) out[key] = clamped;
        }
        return out;
    }

    // Score-play scenarios. Override scenarios (s2/s1/s4/s5) and delta
    // scenarios (s3/s6) are mutually exclusive: first match in the order
    // s2 → s1 → s4 → s5 → s3 → s6 wins (a dominating 2:0 gates the s1
    // sweep before minute 60; s4's сушка excludes s3's extra attack).
    function evaluateScenarios(ctx, baseIds) {
        const S = data.scenarios;
        const active = [];
        const notes = [];
        let defenseId = baseIds.defense;
        let buildupId = baseIds.buildup;
        let defenseVectorDelta = null;
        let buildupVectorDelta = null;
        let forcedBase = null;

        if (ctx.scoreState === 'winning' && ctx.scoreDiff === 1
            && (has(ctx.tags, 'attacking_momentum') || has(ctx.tags, 'generator_attack_working'))) {
            active.push({ id: 's2', slug: S.s2.slug });
            S.s2.notes.forEach(note => notes.push(note));
            if (ctx.minute !== null && ctx.minute >= S.s2.overrideMinute) {
                defenseId = S.s2.override.defense;
                buildupId = S.s2.override.buildup;
            }
        } else if (ctx.scoreState === 'winning' && ctx.scoreDiff === 1 && isStrengthEqual(ctx)) {
            active.push({ id: 's1', slug: S.s1.slug });
            S.s1.notes.forEach(note => notes.push(note));
            defenseId = S.s1.override.defense;
            buildupId = S.s1.override.buildup;
        } else if (ctx.scoreState === 'losing' && has(ctx.tags, 'strength_advantage_clear')) {
            active.push({ id: 's4', slug: S.s4.slug });
            defenseId = S.s4.override.defense;
            buildupId = S.s4.override.buildup;
            if (ctx.minute !== null && ctx.minute >= S.s4.lateMinute) {
                defenseVectorDelta = S.s4.lateDelta;
                notes.push(S.s4.lateNote);
            }
        } else if (ctx.scoreState === 'draw' && has(ctx.tags, 'strength_advantage_clear')) {
            active.push({ id: 's5', slug: S.s5.slug });
            S.s5.notes.forEach(note => notes.push(note));
            defenseId = S.s5.override.defense;
            buildupId = S.s5.override.buildup;
        } else if (ctx.scoreState === 'losing' && ctx.scoreDiff === -1 && has(ctx.tags, 'attacking_momentum')) {
            active.push({ id: 's3', slug: S.s3.slug });
            S.s3.notes.forEach(note => notes.push(note));
            buildupVectorDelta = Object.fromEntries(Object.entries(S.s3.delta).filter(([key]) => key !== 'press_line'));
            defenseVectorDelta = Object.fromEntries(Object.entries(S.s3.delta).filter(([key]) => key === 'press_line'));
        } else if (ctx.scoreState === 'losing' && ctx.scoreDiff === -1
            && ctx.myXg !== null && ctx.oppXg !== null
            && ctx.myXg < S.s6.requires.xgMax && ctx.oppXg < S.s6.requires.xgMax) {
            active.push({ id: 's6', slug: S.s6.slug });
            forcedBase = S.s6.forceBase;
            buildupVectorDelta = S.s6.delta;
        }

        return { active, notes, defenseId, buildupId, defenseVectorDelta, buildupVectorDelta, forcedBase };
    }

    function computeDeltaVsCurrent(applyVector) {
        try {
            if (typeof getCurrentTactic !== 'function' || !applyVector) return null;
            const current = getCurrentTactic();
            if (!current || typeof current !== 'object') return null;
            const delta = [];
            for (const [key, value] of Object.entries(applyVector)) {
                if (key === 'priority') continue;
                if (String(current[key] ?? '') !== String(value)) {
                    delta.push({ key, from: current[key] ?? null, to: value });
                }
            }
            if (applyVector.priority) {
                const norm = value => (Array.isArray(value) ? value : []).map(String).sort().join(',');
                if (norm(current.priority) !== norm(applyVector.priority)) {
                    delta.push({ key: 'priority', from: (current.priority || []).join('+'), to: applyVector.priority.join('+') });
                }
            }
            return delta;
        } catch (_) {
            return null;
        }
    }

    function computeEtalon(snapshot, context, result) {
        const ctx = collectContext(snapshot, context, result);
        const insufficientData = [];

        if (!ctx.scoreState) {
            insufficientData.push('score_state');
        }
        if (ctx.myDef === null || ctx.myPress === null) insufficientData.push('def_press_vectors');
        if (ctx.myFouls === null) insufficientData.push('fouls');
        if (ctx.myXg === null || ctx.oppXg === null) insufficientData.push('xg');
        insufficientData.push('b10_lane_play'); // столб not detectable in v1

        let defenseMatch = null;
        let buildupMatch = null;
        if (ctx.scoreState) {
            defenseMatch = matchBlock(DEFENSE_RULES, ctx);
            buildupMatch = matchBlock(BUILDUP_RULES, ctx);
        }

        const scenarioResult = evaluateScenarios(
            ctx,
            { defense: defenseMatch?.id || null, buildup: buildupMatch?.id || null }
        );

        const defenseId = scenarioResult.defenseId;
        const buildupId = scenarioResult.buildupId;
        const picked = mapping.pickVector(
            { defense: defenseId, buildup: buildupId },
            { conservative: true }
        );

        let defenseVector = picked.defenseVector;
        let buildupVector = picked.buildupVector;
        if (scenarioResult.forcedBase) {
            const forced = mapping.pickVector(
                { defense: scenarioResult.forcedBase.defense, buildup: scenarioResult.forcedBase.buildup },
                { conservative: true }
            );
            defenseVector = forced.defenseVector;
            buildupVector = forced.buildupVector;
        }
        if (scenarioResult.defenseVectorDelta) defenseVector = applyDelta(defenseVector, scenarioResult.defenseVectorDelta);
        if (scenarioResult.buildupVectorDelta) buildupVector = applyDelta(buildupVector, scenarioResult.buildupVectorDelta);

        const mergedVector = Object.assign({}, defenseVector, buildupVector);
        const applyVector = Object.assign({}, mergedVector);
        if (picked.priorityLanes) applyVector.priority = picked.priorityLanes.slice();

        const ids = [defenseId, buildupId, ...scenarioResult.active.map(item => item.id)].filter(Boolean);

        return {
            schema: VERSION,
            source: 'dave56_etalon',
            situationIds: {
                defense: defenseId,
                buildup: buildupId,
                scenarios: scenarioResult.active.map(item => item.id)
            },
            ids,
            labels: picked.labels,
            defenseVector,
            buildupVector,
            mergedVector,
            applyVector,
            priorityLanes: picked.priorityLanes,
            priorityOmitted: !picked.priorityDefined,
            deltaVsCurrent: computeDeltaVsCurrent(applyVector),
            confidence: (defenseMatch?.confidence || 0) + (buildupMatch?.confidence || 0),
            insufficientData,
            scenarios: scenarioResult.active,
            notes: scenarioResult.notes,
            conservative: true
        };
    }

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);
    CurrentActionHintEngine.run = function runWithDave56Etalon(snapshot, context = {}) {
        const result = originalRun(snapshot, context) || {};
        try {
            result.etalon = computeEtalon(snapshot, context, result);
        } catch (error) {
            result.etalon = {
                schema: VERSION,
                source: 'dave56_etalon',
                ok: false,
                error: 'etalon_computation_failed',
                insufficientData: ['exception'],
                defenseVector: null,
                buildupVector: null,
                mergedVector: null,
                applyVector: null,
                priorityLanes: null,
                deltaVsCurrent: null,
                confidence: 0,
                scenarios: [],
                notes: []
            };
        }
        return result;
    };

    CurrentActionHintEngine.__dave56EtalonApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFDave56EtalonLayer = {
            version: VERSION,
            suiteVersion: registry.suiteVersion,
            source: 'dave56_etalon',
            autoApply: false,
            computeEtalon
        };
    }
})();

// ============================================================
