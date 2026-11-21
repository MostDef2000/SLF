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
    // install only on a known-current tactical suite registry, never on a
    // stale/unknown one. Accept-list: v11 (historical) and v12 (#361).
    const registry = typeof window !== 'undefined' ? window.SLFActivePresetRegistry : null;
    const data = typeof window !== 'undefined' ? window.SLFDave56EtalonData : null;
    const mapping = typeof window !== 'undefined' ? window.SLFDave56EtalonMapping : null;
    const SUPPORTED_SUITES = ['slf_tactic_suite_561_v11', 'slf_tactic_suite_561_v12'];
    if (!registry || !SUPPORTED_SUITES.includes(registry.suiteVersion)) return;
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

    // =====================================================================
    // Issue #477 — canon manual matcher.
    // The 12 rows live in dave56-etalon-data.js (`canon`). This seam turns
    // observed evidence into {status,id,variant,vector,missingInputs}; it
    // never invents a match and never writes a tactic. A vector is NOT an
    // identity: rows 2/7 (and 6-stronger/12) share one and stay distinct.
    // =====================================================================
    const CANON = data.canon && data.canon.schema === 'slf_canon_manual_v1' ? data.canon : null;
    const CANON_STRENGTH = ['advantage', 'equal', 'disadvantage'];
    const CANON_MANUAL_KEYS = ['build_type', 'build_temp', 'build_long', 'build_fast', 'style'];

    function canonRow(id) {
        return CANON ? (CANON.rows.find(row => Number(row.id) === Number(id)) || null) : null;
    }

    function canonVariant(row, variantId) {
        if (!row || !Array.isArray(row.variants) || !row.variants.length) return row;
        return row.variants.find(variant => variant.id === variantId) || null;
    }

    function canonLanes(priority) {
        const text = String(priority || '000');
        const lanes = [];
        if (text[0] === '1') lanes.push('left');
        if (text[1] === '1') lanes.push('center');
        if (text[2] === '1') lanes.push('right');
        return lanes;
    }

    function canonVector(row, variant) {
        const source = variant && variant.vector ? variant : row;
        if (!source || !source.vector) return null;
        const vector = { priority: String(source.priority || row.priority || '000') };
        for (const key of CANON_MANUAL_KEYS) vector[key] = String(source.vector[key]);
        return vector;
    }

    function canonCandidate(row, variant) {
        return {
            id: Number(row.id),
            variant: variant && variant.id ? variant.id : 'default',
            situationText: row.situation
        };
    }

    function canonDecision(status, fields) {
        return Object.assign({
            schema: 'slf_canon_decision_v1',
            version: CANON ? CANON.version : null,
            source: 'canon_manual',
            status,
            id: null,
            variant: null,
            situationText: null,
            settingText: null,
            legend: CANON ? CANON.legend.slice() : [],
            vector: null,
            priorityLanes: null,
            evidence: [],
            missingInputs: [],
            candidates: [],
            additions: []
        }, fields || {});
    }

    // Derive the observation bundle. `context.canonEvidence` is the rich
    // structured channel; a few specific page signals can corroborate it.
    // Generic strength tags alone never resolve a canon row here (the legacy
    // etalon path keeps owning those, preserving #350 behavior).
    function canonObservations(ctx, context) {
        const rawEvidence = context && context.canonEvidence && typeof context.canonEvidence === 'object'
            ? context.canonEvidence
            : null;
        // When the caller supplies the structured evidence bundle it is the
        // authoritative observation set; page tags are only a fallback for
        // callers that do not (they must never add a competing canon trigger
        // to an explicitly stated situation). An explicitly supplied empty
        // bundle (canonEvidence: {}) is still authoritative — presence of the
        // object, not its key count, decides.
        const explicit = rawEvidence !== null && typeof rawEvidence === 'object';
        const ev = rawEvidence || {};
        const tag = name => !explicit && has(ctx.tags, name);
        const flag = (name, tagName) => explicit ? ev[name] === true : (tag(tagName || name) || ev[name] === true);
        const strength = CANON_STRENGTH.includes(ev.strength) ? ev.strength : null;
        const flank = ev.attackFlank === 'left' || ev.attackFlank === 'right'
            ? ev.attackFlank
            : (!explicit && (context.attackFlank === 'left' || context.attackFlank === 'right') ? context.attackFlank : null);
        return {
            strength,
            needGoal: flag('needGoal', 'need_goal'),
            attackFlank: flank,
            protectLead: explicit
                ? ev.protectLead === true
                : ((tag('protect_lead') || tag('late_protect_lead')) && ctx.scoreState === 'winning') || ev.protectLead === true,
            firstPassPressure: flag('firstPassPressure', 'opponent_high_press'),
            firstPassFree: flag('firstPassFree', 'opponent_first_pass_free')
                || (!explicit && context.opponentFirstPassFree === true),
            deepBlock: flag('deepBlock', 'opponent_low_block'),
            transitionChaos: flag('transitionChaos', 'chaotic_match'),
            targetForward: flag('targetForward', 'target_forward_aerial'),
            controlIntent: flag('controlIntent', 'control_intent'),
            fastWideIntent: flag('fastWideIntent', 'fast_wide_intent'),
            pressFatigue: flag('pressFatigue', 'press_fatigue')
        };
    }

    function canonStrengthVariant(strength) {
        if (strength === 'disadvantage') return 'weaker';
        if (strength === 'advantage') return 'stronger';
        if (strength === 'equal') return 'equal';
        return null;
    }

    const CANON_OBSERVATION_FLAGS = ['needGoal', 'protectLead', 'firstPassPressure', 'firstPassFree', 'deepBlock',
        'transitionChaos', 'targetForward', 'controlIntent', 'fastWideIntent', 'pressFatigue'];

    function hasCanonRequest(context) {
        // The rich evidence bundle is the explicit "canon is in play" signal:
        // an empty {} still counts (the caller asked, there was just nothing).
        return !!(context && Object.prototype.hasOwnProperty.call(context, 'canonEvidence')
            && context.canonEvidence && typeof context.canonEvidence === 'object');
    }

    function computeCanon(snapshot, context, result) {
        if (!CANON) return null;
        const ctx = collectContext(snapshot, context, result);
        const obs = canonObservations(ctx, context);
        const evidence = [];
        const additions = [];
        if (obs.strength) evidence.push(`strength:${obs.strength}`);
        for (const key of CANON_OBSERVATION_FLAGS) {
            if (obs[key]) evidence.push(key);
        }
        if (obs.attackFlank) evidence.push(`attackFlank:${obs.attackFlank}`);

        // #477: the canon matcher only produces a decision when the situation
        // actually asks for it — either the caller supplied the structured
        // canonEvidence bundle, or a canon-relevant page signal resolved an
        // observation. With neither, the legacy etalon/preset merge owns the
        // hint (canon == null keeps the pre-#477 final-tactic path).
        const observed = !!obs.strength || !!obs.attackFlank
            || CANON_OBSERVATION_FLAGS.some(key => obs[key]);
        if (!observed && !hasCanonRequest(context)) return null;

        // The press_cooldown addition declares ['press_fatigue','no_urgent_chase']:
        // fatigue alone is not enough while an urgent chase context is present.
        const noUrgentChase = !obs.needGoal && !obs.protectLead;
        if (obs.pressFatigue && noUrgentChase) {
            for (const addition of (CANON.additions || [])) {
                if (addition.id === 'press_cooldown') additions.push(Object.assign({}, addition, { entryConditions: (addition.entryConditions || []).slice() }));
            }
        }

        const specific = [];
        const unresolved = [];
        const resolvedAdds = (id, variant) => {
            const row = canonRow(id);
            const picked = canonVariant(row, variant);
            if (!row || !picked) return;
            specific.push({ row, variant: picked });
        };

        if (obs.needGoal) {
            if (obs.attackFlank) resolvedAdds(4, obs.attackFlank);
            else unresolved.push({ id: 4, need: 'attacking_flank' });
        }
        if (obs.firstPassPressure) {
            const variant = canonStrengthVariant(obs.strength);
            if (variant) resolvedAdds(6, variant);
            else unresolved.push({ id: 6, need: 'relative_strength' });
        }
        if (obs.firstPassFree) resolvedAdds(7, null);
        if (obs.deepBlock) resolvedAdds(8, null);
        if (obs.transitionChaos) resolvedAdds(9, null);
        if (obs.targetForward) resolvedAdds(10, null);
        if (obs.controlIntent) resolvedAdds(11, null);
        if (obs.fastWideIntent) resolvedAdds(12, null);
        if (obs.protectLead) {
            if (ctx.scoreState === 'winning') resolvedAdds(5, null);
            else unresolved.push({ id: 5, need: 'score_state' });
        }

        const base = { evidence, additions };
        const candidates = specific.map(item => canonCandidate(item.row, item.variant));
        for (const item of unresolved) {
            if (!candidates.some(candidate => candidate.id === item.id)) {
                const row = canonRow(item.id);
                if (row) candidates.push(canonCandidate(row, null));
            }
        }

        if (specific.length > 1) {
            const ids = [...new Set(specific.map(item => Number(item.row.id)))];
            return canonDecision('ambiguous', Object.assign(base, {
                candidates,
                missingInputs: ['intended_approach'],
                evidence: evidence.concat([`ambiguous:${ids.join('+')}`])
            }));
        }
        if (specific.length === 1) {
            if (unresolved.length) {
                return canonDecision('ambiguous', Object.assign(base, {
                    candidates,
                    missingInputs: ['intended_approach', ...new Set(unresolved.map(item => item.need))],
                    evidence
                }));
            }
            const pickedRow = specific[0].row;
            const pickedVariant = specific[0].variant;
            const variantId = pickedRow.variants ? pickedVariant.id : null;
            const vector = canonVector(pickedRow, pickedVariant);
            return canonDecision('matched', Object.assign(base, {
                id: Number(pickedRow.id),
                variant: variantId,
                situationText: pickedRow.situation,
                settingText: pickedRow.settingText || null,
                vector,
                priorityLanes: canonLanes(vector.priority),
                candidates: [canonCandidate(pickedRow, pickedVariant)]
            }));
        }
        if (unresolved.length) {
            return canonDecision('missing_inputs', Object.assign(base, {
                candidates,
                missingInputs: [...new Set(unresolved.map(item => item.need))]
            }));
        }
        // No specific observation: a generic XI comparison can resolve 1/2/3.
        if (obs.strength) {
            const id = obs.strength === 'advantage' ? 2 : (obs.strength === 'disadvantage' ? 3 : 1);
            const row = canonRow(id);
            const vector = canonVector(row, row);
            return canonDecision('matched', Object.assign(base, {
                id,
                variant: null,
                situationText: row.situation,
                settingText: row.settingText || null,
                vector,
                priorityLanes: canonLanes(vector.priority),
                candidates: [canonCandidate(row, null)]
            }));
        }
        if (additions.length) {
            // #477 NEW-P1-1: a resolved SLF addition is actionable on its own.
            // It is NOT a manual row (id/vector stay null); the eligible role
            // names the preset that realizes it, and both the final-tactic and
            // advisor seams treat this status as actionable.
            const eligibleRoles = additions
                .map(addition => addition && typeof addition.eligibleRole === 'string' ? addition.eligibleRole : '')
                .filter(Boolean);
            return canonDecision('addition', Object.assign(base, {
                eligibleRole: eligibleRoles.length ? eligibleRoles[0] : null,
                eligibleRoles,
                actionable: true
            }));
        }
        return canonDecision('missing_inputs', Object.assign(base, {
            missingInputs: ['relative_xi_or_situation']
        }));
    }

    // League-relative starting recommendation (#477 R9). The classification
    // rule is documented in data.canon.leagueRule: the strength zone decides,
    // the points-rank zone only confirms. Missing/incomparable/wrong-season
    // evidence is insufficient — never an implicit row 1.
    const LEAGUE_ZONES = ['favourite', 'mid', 'underdog'];
    function leagueZoneFromPercentile(percentile, rule) {
        if (!Number.isFinite(percentile)) return null;
        if (percentile >= Number(rule.favouriteMinPercentile)) return 'favourite';
        if (percentile <= Number(rule.underdogMaxPercentile)) return 'underdog';
        return 'mid';
    }

    function leagueStartingRecommendation(evidence) {
        const rule = CANON && CANON.leagueRule ? CANON.leagueRule : { favouriteMinPercentile: 75, underdogMaxPercentile: 25 };
        const insufficient = reason => ({ status: 'insufficient', row: null, reason, class: null, league: evidence && evidence.league ? evidence.league : null, evidenceDate: evidence && evidence.evidenceDate ? evidence.evidenceDate : null });
        if (!evidence || typeof evidence !== 'object') return insufficient('missing_evidence');
        if (!evidence.club || !evidence.league) return insufficient('missing_club_or_league');
        if (!evidence.evidenceDate) return insufficient('missing_evidence_date');
        // #477 NEW-P2-1: BOTH season identifiers are required before any
        // classification. A club/league/population/strength zone with either
        // season absent is insufficient — never an implicit row 1.
        if (!evidence.season || !evidence.expectedSeason) return insufficient('missing_season');
        if (String(evidence.season) !== String(evidence.expectedSeason)) {
            return insufficient('wrong_season');
        }
        const total = Number(evidence.totalTeams);
        if (!Number.isFinite(total) || total < 2) return insufficient('incomparable_population');
        let strengthZone = LEAGUE_ZONES.includes(evidence.strengthZone) ? evidence.strengthZone : null;
        // Unknown percentile is NOT zero: null/undefined/'' must never classify
        // a club as underdog (Number(null) === 0, Number('') === 0). Treat them
        // as missing so the result is 'insufficient', never an implicit row 3.
        const rawPercentile = evidence.strengthPercentile;
        const percentile = (rawPercentile === null || rawPercentile === undefined || rawPercentile === '')
            ? null
            : Number(rawPercentile);
        if (!strengthZone) strengthZone = leagueZoneFromPercentile(percentile, rule);
        if (!strengthZone) return insufficient('missing_strength');
        const rankZone = LEAGUE_ZONES.includes(evidence.rankZone) ? evidence.rankZone : null;
        // Mixed clubs are decided by the strength zone (owner decision #477
        // comment 7057658763); the rank zone is confirmation only.
        const recognised = strengthZone === 'favourite' ? 'favourite'
            : (strengthZone === 'underdog' ? 'underdog' : 'middle');
        const row = recognised === 'favourite' ? 2 : (recognised === 'underdog' ? 3 : 1);
        return {
            status: 'classified',
            row,
            class: recognised,
            strengthZone,
            rankZone,
            league: evidence.league,
            club: evidence.club,
            evidenceDate: evidence.evidenceDate,
            note: 'starting baseline from own-league evidence; not a live-opponent observation'
        };
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
        try {
            result.canon = computeCanon(snapshot, context, result);
        } catch (error) {
            result.canon = CANON ? canonDecision('no_match', { evidence: ['exception'] }) : null;
        }
        // #477 R9: expose the club's own-league starting baseline alongside the
        // live match decision. It never overrides a matched live situation; it
        // is the documented starting row for this club in its own division.
        // Resolve from the dated snapshot when the caller supplies league
        // evidence, otherwise from the embedded, dated leagueStarts records.
        if (result.canon) {
            let leagueEvidence = context && context.leagueEvidence ? context.leagueEvidence : null;
            if (!leagueEvidence && CANON && Array.isArray(CANON.leagueStarts)) {
                const clubId = String((context && (context.myTeamId || context.clubId)) || (snapshot && snapshot.myTeam) || '');
                const clubName = context && context.clubName ? String(context.clubName) : null;
                const found = CANON.leagueStarts.find(item =>
                    (clubId && String(item.clubId || '') === clubId) || (clubName && item.club === clubName));
                if (found) leagueEvidence = found.evidence;
            }
            if (leagueEvidence) {
                result.canon.leagueStart = leagueStartingRecommendation(leagueEvidence);
            }
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
            computeEtalon,
            computeCanon,
            leagueStartingRecommendation,
            canonVersion: CANON ? CANON.version : null
        };
    }
})();

// ============================================================
