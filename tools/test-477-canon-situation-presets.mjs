#!/usr/bin/env node
// SLF issue #477 — canon 12-situation manual as the recommendation authority.
// Reproducing regression test, written to run against the UNMODIFIED base
// (78bda2bf) and fail there: the base has no canon catalog, no canon matcher,
// no canon-first final selection and no league-relative starting advice.
//
// Real boundary: dave56-etalon-data + dave56-etalon-mapping + a stub
// CurrentActionHintEngine + a stub v12 registry + dave56-etalon-layer +
// final-tactic-merge-layer. Evidence arrives as observations (strength,
// pressure, flank, ...), never as a supplied row id.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const EMERY = { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '2', build_fast: '2', style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2', priority: [] };
const CONTE = { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '3', build_temp: '2', build_long: '2', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] };

const CANON_CONTROLS = ['build_type', 'build_temp', 'build_long', 'build_fast', 'style'];

function makeSandbox({ presetId = 'Emery_BalancedBase_v11', currentTactic = null } = {}) {
    const sandbox = {
        console,
        setTimeout,
        getCurrentTactic: currentTactic ? () => JSON.parse(JSON.stringify(currentTactic)) : undefined,
        window: {}
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-data.js'), sandbox, { filename: 'dave56-etalon-data.js' });
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-mapping.js'), sandbox, { filename: 'dave56-etalon-mapping.js' });
    vm.runInContext('globalThis.CurrentActionHintEngine = { run: function () { return { action: this.__stubAction, moment: { signals: [] } }; } };', sandbox, { filename: 'engine-stub.js' });
    vm.runInContext(`globalThis.CurrentActionHintEngine.__stubAction = ${JSON.stringify({ preset: presetId, rawPreset: presetId, decision: 'active_control', ruleId: 'x', reason: 'test', libraryVersion: 'slf_tactic_suite_561_v12' })};`, sandbox);
    vm.runInContext(`globalThis.window.SLFActivePresetRegistry = {
        suiteVersion: 'slf_tactic_suite_561_v12',
        presets: { Emery_BalancedBase_v11: ${JSON.stringify(EMERY)}, Conte_WideChannels_v11: ${JSON.stringify(CONTE)} },
        roleContracts: ${JSON.stringify({
            Emery_BalancedBase_v11: { canon: { row: 1, variant: 'default', exact: true } },
            Conte_WideChannels_v11: { canon: { row: null, variant: null, exact: false } }
        })}
    };`, sandbox);
    vm.runInContext(read('src/modules/strategy-data-recommendations/dave56-etalon-layer.js'), sandbox, { filename: 'dave56-etalon-layer.js' });
    vm.runInContext(read('src/modules/strategy-data-recommendations/final-tactic-merge-layer.js'), sandbox, { filename: 'final-tactic-merge-layer.js' });
    return sandbox;
}

const SNAPSHOT = { gameId: 'g477', myTeam: 1, teams: [1, 2], stats: [{ teamId: 1, stats: { defVector: 0, pressVector: 0 } }] };

function advise(evidence, extra = {}, opts = {}) {
    const sandbox = makeSandbox(opts);
    const context = Object.assign({ minute: 30, tags: [], myFouls: 0, myXg: 1, oppXg: 1, myBad: 0, myPossession: 50, oppPossession: 50 }, extra);
    if (evidence !== undefined) context.canonEvidence = evidence;
    const result = sandbox.CurrentActionHintEngine.run(SNAPSHOT, context);
    return { result, canon: result.canon, finalTactic: result.finalTactic };
}

function assertVector(canon, id, priority, vector, label) {
    assert.ok(canon, `${label}: canon decision present`);
    assert.equal(canon.status, 'matched', `${label}: matched status`);
    assert.equal(canon.id, id, `${label}: row id ${id}`);
    assert.equal(canon.vector.priority, priority, `${label}: priority ${priority}`);
    for (const [index, key] of CANON_CONTROLS.entries()) {
        assert.equal(canon.vector[key], String(vector[index]), `${label}: ${key} === ${vector[index]}`);
    }
}

// ===========================================================================
// R1 — every row resolves to its exact six-setting vector at the final seam
// ===========================================================================
{
    const cases = [
        { label: 'row1', evidence: { strength: 'equal' }, id: 1, priority: '000', vector: [2, 2, 2, 2, 3] },
        { label: 'row2', evidence: { strength: 'advantage' }, id: 2, priority: '000', vector: [3, 2, 2, 2, 3] },
        { label: 'row3', evidence: { strength: 'disadvantage' }, id: 3, priority: '101', vector: [2, 2, 1, 1, 2] },
        { label: 'row4-left', evidence: { needGoal: true, attackFlank: 'left' }, id: 4, variant: 'left', priority: '110', vector: [3, 3, 2, 2, 4] },
        { label: 'row4-right', evidence: { needGoal: true, attackFlank: 'right' }, id: 4, variant: 'right', priority: '011', vector: [3, 3, 2, 2, 4] },
        { label: 'row5', evidence: { protectLead: true }, score: { state: 'winning', diff: 1 }, id: 5, priority: '101', vector: [1, 2, 1, 1, 1] },
        { label: 'row6-weaker', evidence: { firstPassPressure: true, strength: 'disadvantage' }, id: 6, variant: 'weaker', priority: '101', vector: [2, 3, 1, 1, 2] },
        { label: 'row6-equal', evidence: { firstPassPressure: true, strength: 'equal' }, id: 6, variant: 'equal', priority: '101', vector: [2, 3, 1, 1, 3] },
        { label: 'row6-stronger', evidence: { firstPassPressure: true, strength: 'advantage' }, id: 6, variant: 'stronger', priority: '101', vector: [2, 3, 1, 1, 4] },
        { label: 'row7', evidence: { firstPassFree: true }, id: 7, priority: '000', vector: [3, 2, 2, 2, 3] },
        { label: 'row8', evidence: { deepBlock: true }, id: 8, priority: '000', vector: [3, 1, 2, 3, 3] },
        { label: 'row9', evidence: { transitionChaos: true }, id: 9, priority: '101', vector: [2, 2, 1, 1, 3] },
        { label: 'row10', evidence: { targetForward: true }, id: 10, priority: '101', vector: [1, 2, 1, 1, 3] },
        { label: 'row11', evidence: { controlIntent: true }, id: 11, priority: '000', vector: [3, 1, 2, 2, 3] },
        { label: 'row12', evidence: { fastWideIntent: true }, id: 12, priority: '101', vector: [2, 3, 1, 1, 4] }
    ];
    for (const item of cases) {
        const { canon, finalTactic } = advise(item.evidence, { score: item.score || { state: 'draw', diff: 0 } });
        assertVector(canon, item.id, item.priority, item.vector, item.label);
        if (item.variant) assert.equal(canon.variant, item.variant, `${item.label}: variant`);
        assert.ok(finalTactic, `${item.label}: finalTactic present`);
        // The final seam carries the exact six manual settings (strings).
        assert.equal(finalTactic.vector.priority.join('+'), canonicalLanes(item.priority).join('+'), `${item.label}: final priority`);
        for (const [index, key] of CANON_CONTROLS.entries()) {
            assert.equal(finalTactic.vector[key], String(item.vector[index]), `${item.label}: final ${key}`);
        }
        assert.ok(finalTactic.canon && finalTactic.canon.status === 'matched', `${item.label}: finalFactic canon provenance`);
        jeq(finalTactic.canon, canon, `${item.label}: finalTactic.canon is the deterministic decision`);
    }
    console.log('R1 ok: 15 examples (12 rows incl. row4 both flanks and row6 three strengths) resolve exactly');
}

// ===========================================================================
// R7 — the hint carries the manual's verbatim setting words, not only numbers
// ===========================================================================
{
    const { canon, finalTactic } = advise({ deepBlock: true });
    assert.equal(canon.id, 8, 'row 8 for the bus-breaking situation');
    assert.ok(canon.settingText && typeof canon.settingText === 'object', 'matched decision carries the manual words');
    assert.equal(canon.settingText.build_type, 'Позиционный', 'verbatim buildup word');
    assert.equal(canon.settingText.build_temp, 'Низкий / средний', 'verbatim tempo range');
    assert.equal(canon.settingText.build_long, 'Умеренно / часто', 'verbatim diagonals range');
    assert.equal(canon.settingText.build_fast, 'Умеренно / часто', 'verbatim one-touch range');
    assert.equal(canon.settingText.style, 'Обычный / атака', 'verbatim style range');
    assert.match(finalTactic.referenceLine, /Позиционный/, 'reference line shows the manual buildup word');
    assert.match(finalTactic.referenceLine, /Низкий \/ средний/, 'reference line shows the manual tempo words');
    assert.ok(finalTactic.notes.some(note => note.includes('Умеренно / часто')), 'notes repeat the manual diagonal/one-touch words');
    console.log('R7 setting words ok: matched hint shows the manual text, not only ordinals');
}

function canonicalLanes(priority) {
    const lanes = [];
    if (priority[0] === '1') lanes.push('left');
    if (priority[1] === '1') lanes.push('center');
    if (priority[2] === '1') lanes.push('right');
    return lanes;
}

// ===========================================================================
// R2 / identity — equal vectors keep distinct situation ids
// ===========================================================================
{
    const row2 = advise({ strength: 'advantage' });
    const row7 = advise({ firstPassFree: true });
    assert.equal(row2.canon.id, 2, 'strength advantage alone → row 2');
    assert.equal(row7.canon.id, 7, 'free first pass → row 7');
    jeq(row2.canon.vector, row7.canon.vector, 'rows 2 and 7 share the vector');
    assert.notEqual(row2.canon.id, row7.canon.id, 'equal vectors never collapse into one situation id');
    assert.match(row7.canon.situationText, /почти не прессингует/, 'row 7 keeps its own verbatim situation');

    // A specific observed pressure behavior outranks the generic strength row,
    // regardless of how the evidence is keyed/ordered.
    const collision = advise({ strength: 'advantage', firstPassFree: true });
    assert.equal(collision.canon.id, 7, 'specific free-first-pass outranks generic strength advantage');
    assert.equal(collision.canon.id !== 2, true, 'row 2 is not selected on the collision');

    const row6Stronger = advise({ firstPassPressure: true, strength: 'advantage' });
    const row12 = advise({ fastWideIntent: true });
    jeq(row6Stronger.canon.vector, row12.canon.vector, 'row 6 stronger and row 12 share the vector');
    assert.notEqual(row6Stronger.canon.id, row12.canon.id, 'row 6 stronger and row 12 stay distinct');
}

// ===========================================================================
// R2 — equally supported specific intentions are ambiguous, no tactic
// ===========================================================================
{
    const { canon, finalTactic } = advise({ needGoal: true, fastWideIntent: true });
    assert.equal(canon.status, 'ambiguous', 'two equally supported specific intents → ambiguous');
    assert.equal(canon.vector, null, 'ambiguous never carries a vector');
    assert.deepEqual([...canon.candidates.map(item => item.id)].sort((a, b) => a - b), [4, 12], 'ambiguous names both alternatives');
    assert.ok(canon.missingInputs.includes('intended_approach'), 'ambiguous asks for the distinguishing choice');
    assert.equal(finalTactic.canon.status, 'ambiguous', 'finalTactic exposes the ambiguity');
    assert.equal(finalTactic.vector, null, 'ambiguous canon never offers an actionable vector');
    assert.equal(finalTactic.overrides, null, 'ambiguous canon has no preset/etalon overrides to apply');
    assert.equal(finalTactic.source, 'canon:ambiguous', 'source names the unresolved canon status');
    assert.ok(finalTactic.referenceLine.includes('неоднозначно'), 'reference line explains the ambiguity');
}

// ===========================================================================
// R3 — unknown is not zero/equality/default flank/absence of pressure
// ===========================================================================
{
    const noEvidence = advise({});
    assert.equal(noEvidence.canon.status, 'missing_inputs', 'no observations → missing inputs');
    assert.equal(noEvidence.canon.vector, null);
    assert.ok(noEvidence.canon.missingInputs.length > 0, 'missing inputs named');
    assert.equal(noEvidence.finalTactic.canon.status, 'missing_inputs');
    assert.equal(noEvidence.finalTactic.vector, null, 'missing inputs → no final vector');
    assert.equal(noEvidence.finalTactic.overrides, null, 'missing inputs → no overrides');

    const noFlank = advise({ needGoal: true });
    assert.equal(noFlank.canon.status, 'missing_inputs', 'goal needed without flank → missing input');
    assert.ok(noFlank.canon.missingInputs.includes('attacking_flank'), 'asks for the attacking flank');
    assert.equal(noFlank.canon.vector, null);
    assert.equal(noFlank.finalTactic.vector, null, 'missing flank → no final vector');

    const unknownStrength = advise({ firstPassPressure: true, strength: 'unknown' });
    assert.equal(unknownStrength.canon.status, 'missing_inputs', 'unknown strength is not equality');
    assert.ok(unknownStrength.canon.missingInputs.includes('relative_strength'), 'asks for relative strength');
    assert.equal(unknownStrength.finalTactic.vector, null, 'unknown strength → no final vector');

    const absentPressure = advise({ strength: undefined });
    assert.notEqual(absentPressure.canon.id, 7, 'absent pressure observation is not row 7 (low pressure)');
    assert.equal(absentPressure.canon.vector, null, 'no resolved tactic without evidence');
    assert.equal(absentPressure.finalTactic.vector, null, 'no resolved final vector without evidence');
}

// ===========================================================================
// R4 — SLF additions stay separate and never displace a manual match
// ===========================================================================
{
    const addition = advise({ pressFatigue: true });
    assert.equal(addition.canon.id, null, 'press fatigue is not a screenshot row');
    assert.ok(addition.canon.additions.some(item => item.id === 'press_cooldown'), 'press_cooldown addition reported');
    const entry = addition.canon.additions.find(item => item.id === 'press_cooldown');
    assert.equal(entry.eligibleRole, 'Guardiola_PressCooldown_v11', 'addition names its eligible coach role');

    const both = advise({ deepBlock: true, pressFatigue: true });
    assert.equal(both.canon.status, 'matched');
    assert.equal(both.canon.id, 8, 'a resolved manual row keeps its identity over an addition');
    assert.equal(both.finalTactic.vector.build_temp, '1', 'manual row settings survive the addition');

    // The addition declares ['press_fatigue','no_urgent_chase']; fatigue alone
    // is not enough when an urgent chase context is present.
    const urgentChase = advise({ pressFatigue: true, needGoal: true, attackFlank: 'left' });
    assert.equal(urgentChase.canon.status, 'matched');
    assert.equal(urgentChase.canon.id, 4, 'need-goal row resolves');
    assert.ok(!urgentChase.canon.additions.some(item => item.id === 'press_cooldown'),
        'fatigue + urgent chase → press_cooldown is not offered');
    const noUrgentChase = advise({ pressFatigue: true, deepBlock: true });
    assert.ok(noUrgentChase.canon.additions.some(item => item.id === 'press_cooldown'),
        'fatigue + no urgent chase → press_cooldown is offered');
}

// ===========================================================================
// R6 — the deterministic canon selection survives competing proposals
// ===========================================================================
{
    // Competing base preset (Conte) differs on every manual control.
    const presetCompetition = advise({ needGoal: true, attackFlank: 'right' }, { tags: [], score: { state: 'losing', diff: -1 } }, { presetId: 'Conte_WideChannels_v11' });
    assert.equal(presetCompetition.canon.id, 4);
    assert.equal(presetCompetition.canon.variant, 'right');
    assert.equal(presetCompetition.finalTactic.vector.priority.join('+'), 'center+right', 'canon priority 011 survives a competing preset');
    assert.equal(presetCompetition.finalTactic.vector.build_type, '3');
    assert.equal(presetCompetition.finalTactic.vector.build_temp, '3');
    assert.equal(presetCompetition.finalTactic.vector.style, '4');
    assert.equal(presetCompetition.finalTactic.base, 'preset:Conte_WideChannels_v11', 'base stays a preset, only the manual settings are canon');

    // Competing etalon + score-play delta: opponent_high_press → b6 and
    // losing+attacking_momentum → s3 would try to rewrite buildup/style/temp.
    const etalonCompetition = advise(
        { needGoal: true, attackFlank: 'right' },
        { tags: ['opponent_high_press', 'attacking_momentum'], score: { state: 'losing', diff: -1 } }
    );
    assert.equal(etalonCompetition.canon.id, 4);
    assert.equal(etalonCompetition.finalTactic.vector.style, '4', 'canon style beats etalon b6 fallback');
    assert.equal(etalonCompetition.finalTactic.vector.build_temp, '3', 'canon tempo beats the s3 delta');
    assert.equal(etalonCompetition.finalTactic.vector.build_fast, '2', 'canon one-touch beats the s3 delta');
    assert.equal(etalonCompetition.finalTactic.vector.priority.join('+'), 'center+right');
}

// ===========================================================================
// R9 — league-relative starting recommendations (strength zone decides mixed)
// ===========================================================================
{
    const sandbox = makeSandbox();
    const canon = sandbox.window.SLFDave56EtalonData.canon;
    assert.ok(Array.isArray(canon.leagueStarts) && canon.leagueStarts.length === 7, 'seven dated league records');

    const expected = {
        'Эйрбас': 1,
        'Луч': 1,
        'Норт Дистрикт': 1,
        'Пршибрам': 1,
        'Честер': 1,
        'Каррарезе': 2,
        'Боа': 2
    };
    for (const [club, row] of Object.entries(expected)) {
        const record = canon.leagueStarts.find(item => item.club === club);
        assert.ok(record, `${club}: record present`);
        const start = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation(record.evidence);
        assert.equal(start.status, 'classified', `${club}: classified`);
        assert.equal(start.row, row, `${club}: starting row ${row}`);
        assert.equal(start.league, record.league, `${club}: league reported`);
        assert.equal(start.evidenceDate, record.evidenceDate, `${club}: evidence date reported`);
    }

    // Strength zone decides a mixed record.
    const carrarese = canon.leagueStarts.find(item => item.club === 'Каррарезе');
    assert.equal(carrarese.evidence.strengthZone, 'favourite');
    assert.equal(carrarese.evidence.rankZone, 'mid');
    assert.equal(sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation(carrarese.evidence).row, 2);

    // Эйрбас favourite fixture: owner-internal rank is irrelevant.
    const airbusFavourite = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'test', evidenceDate: '2026-11-21', totalTeams: 14,
        strengthRank: 1, rank: 14, strengthZone: 'favourite', rankZone: 'underdog'
    });
    assert.equal(airbusFavourite.row, 2, 'favourite in its own league → row 2, not row 3 from owner rank');
    const airbusRankChanged = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'test', evidenceDate: '2026-11-21', totalTeams: 14,
        strengthRank: 4, rank: 14, strengthZone: 'mid', rankZone: 'underdog'
    });
    assert.equal(airbusRankChanged.row, 1, 'owner-internal/rank change without strength-zone change keeps row 1');

    // Missing / wrong-season / incomparable evidence is insufficient, never row 1.
    const missing = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation(null);
    assert.equal(missing.status, 'insufficient', 'missing evidence → insufficient');
    assert.equal(missing.row, null, 'missing evidence never defaults to row 1');
    const wrongSeason = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'x', evidenceDate: '2026-11-21', season: '2031/32',
        expectedSeason: '2026/27', strengthZone: 'mid', totalTeams: 14
    });
    assert.equal(wrongSeason.status, 'insufficient', 'wrong-season evidence → insufficient');
    const noPopulation = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'x', evidenceDate: '2026-11-21', strengthZone: 'mid', totalTeams: 0
    });
    assert.equal(noPopulation.status, 'insufficient', 'incomparable population → insufficient');

    // Unknown percentile is NOT zero: Number(null)/Number('') must never
    // classify a club as underdog (row 3).
    const nullPercentile = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'x', evidenceDate: '2026-11-21', totalTeams: 14, strengthPercentile: null
    });
    assert.equal(nullPercentile.status, 'insufficient', 'null percentile → insufficient');
    assert.equal(nullPercentile.row, null, 'null percentile never defaults to row 3');
    const emptyPercentile = sandbox.window.SLFDave56EtalonLayer.leagueStartingRecommendation({
        club: 'Эйрбас', league: 'x', evidenceDate: '2026-11-21', totalTeams: 14, strengthPercentile: ''
    });
    assert.equal(emptyPercentile.status, 'insufficient', 'empty-string percentile → insufficient');
    assert.equal(emptyPercentile.row, null, 'empty-string percentile never defaults to row 3');
}

// ===========================================================================
// R8 — LLM reference is a separate structured channel; validation is exact
// ===========================================================================
async function loadLlm() {
    const context = { console };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('src/modules/strategy-data-recommendations/llm-second-opinion.js') + '\n;globalThis.__LLM = LLMSecondOpinion;', context, { filename: 'llm-second-opinion.js' });
    return context.__LLM;
}

{
    const LLM = await loadLlm();
    const canonDecision = advise({ deepBlock: true }).canon;
    // Fixture registry mirrors the runtime contract the switch validator reads:
    // presets (controls) plus roleContracts[id].canon (exact row/variant).
    // Emery realizes row 1 exactly (000 2 2 2 2 3, priority []); Conte is a
    // documented non-exact association and must never become actionable.
    const registry = {
        active: ['Emery_BalancedBase_v11', 'Conte_WideChannels_v11'],
        labels: { Emery_BalancedBase_v11: 'Emery', Conte_WideChannels_v11: 'Conte' },
        meta: {},
        presets: { Emery_BalancedBase_v11: EMERY, Conte_WideChannels_v11: CONTE },
        roleContracts: {
            Emery_BalancedBase_v11: { canon: { row: 1, variant: 'default', exact: true } },
            Conte_WideChannels_v11: { canon: { row: null, variant: null, exact: false } }
        }
    };
    const payload = LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 60, developerHints: ['page hint'] },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: canonDecision } },
        registry
    });
    assert.ok(payload.canonReference, 'canon reference sent as its own field');
    assert.equal(payload.canonReference.matchedId, 8, 'reference carries the matched id');
    assert.equal(payload.canonReference.situationText, canonDecision.situationText, 'verbatim situation text');
    assert.equal(payload.canonReference.legend.length, 8, 'all eight legend lines');
    assert.equal(payload.canonReference.vector.build_temp, '1', 'selected vector');
    assert.ok(!payload.developerHints.includes(canonDecision.situationText), 'canon is NOT smuggled into developerHints');
    assert.equal(payload.developerHints.length, 1, 'developerHints keeps only page hints');
    // #477 P1-5: candidates travel in the reference channel (bounded), so the
    // advisor sees the alternatives without receiving the full 12-row catalog.
    assert.ok(Array.isArray(payload.canonReference.candidates), 'reference carries the bounded candidates');
    assert.equal(payload.canonReference.candidates.length, 1, 'matched row contributes one candidate');
    assert.equal(payload.canonReference.candidates[0].id, 8, 'candidate id');
    assert.equal(payload.canonReference.candidates[0].situationText, canonDecision.situationText, 'candidate situation text');

    const ambiguousDecision = advise({ needGoal: true, fastWideIntent: true }).canon;
    const ambiguousPayload = LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 40 },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: ambiguousDecision } },
        registry
    });
    assert.equal(ambiguousPayload.canonReference.status, 'ambiguous');
    assert.ok(ambiguousPayload.canonReference.candidates.length <= 12, 'candidates are bounded to the 12 rows');
    assert.ok(ambiguousPayload.canonReference.candidates.every(item => typeof item.situationText === 'string'
        && item.situationText.length <= 200), 'candidate situation text is bounded');

    // Valid 2-change row 8 adjustment is actionable; rendering does not apply.
    const valid = {
        available: true, mode: 'adjust', confidence: 'medium', reason: 'row 8', model: 'm', latencyMs: 100,
        changes: [{ control: 'build_temp', value: '1' }, { control: 'build_fast', value: '3' }]
    };
    const validHtml = LLM.renderAnswer(valid);
    assert.ok(validHtml.includes('id="slf-llm-apply-adjust"'), 'valid adjustment renders the explicit apply button');
    assert.ok(validHtml.includes('применение только по клику'), 'apply is click-only');
    assert.ok(!validHtml.includes('данные устарели'), 'valid adjustment is not marked stale');

    // Mixed contradictory adjustment: one valid, one contradicts row 8 → not actionable.
    const contradictory = { ...valid, changes: [{ control: 'build_temp', value: '1' }, { control: 'build_temp2', value: 'x' }] };
    const contradictoryMixed = { ...valid, changes: [{ control: 'build_temp', value: '1' }, { control: 'build_temp', value: '3' }] };
    const mixedHtml = LLM.renderAnswer(contradictoryMixed);
    assert.ok(!mixedHtml.includes('id="slf-llm-apply-adjust"'), 'duplicate/contradictory controls render no apply button');
    assert.ok(mixedHtml.includes('не примен'), 'contradictory proposal is visibly non-actionable');
    assert.ok(!contradictory.changes[1].control.includes('★'), 'sanity');

    const conflictingTarget = { ...valid, changes: [{ control: 'build_temp', value: '3' }] };
    const conflictingHtml = LLM.renderAnswer(conflictingTarget);
    assert.ok(!conflictingHtml.includes('id="slf-llm-apply-adjust"'), 'a manual control moved away from row 8 target is rejected');
    assert.ok(conflictingHtml.includes('row 8') || conflictingHtml.includes('строк'), 'rejection names the deterministic row');

    // Canon switch: only an exact eligible preset realizing the matched variant.
    const row1Decision = advise({ strength: 'equal' }).canon;
    const row1Payload = LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 20 },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: row1Decision } },
        registry
    });
    assert.equal(row1Payload.canonReference.matchedId, 1);
    const eligibleSwitch = LLM.renderAnswer({ available: true, mode: 'switch', preset: 'Emery_BalancedBase_v11', confidence: 'medium', reason: 'row 1', model: 'm', latencyMs: 10 });
    assert.ok(eligibleSwitch.includes('id="slf-llm-apply-btn"'), 'exact canon-mapped preset switch is actionable');
    const ineligibleSwitch = LLM.renderAnswer({ available: true, mode: 'switch', preset: 'Conte_WideChannels_v11', confidence: 'medium', reason: 'row 1', model: 'm', latencyMs: 10 });
    assert.ok(!ineligibleSwitch.includes('id="slf-llm-apply-btn"'), 'unmapped preset switch is not actionable');

    // Row 4 right: no preset exactly realizes it, so every switch is rejected.
    const row4Right = advise({ needGoal: true, attackFlank: 'right' }).canon;
    LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 20 },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: row4Right } },
        registry
    });
    const wrongVariant = LLM.renderAnswer({ available: true, mode: 'switch', preset: 'Emery_BalancedBase_v11', confidence: 'medium', reason: 'row 4', model: 'm', latencyMs: 10 });
    assert.ok(!wrongVariant.includes('id="slf-llm-apply-btn"'), 'row 4 right rejects an entry that only realizes row 1');

    // No canon decision (legacy/old client) keeps the pre-existing switch path.
    LLM.buildPayload({ snapshot: { gameId: 'g477' }, ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} } }, registry });
    const legacy = LLM.renderAnswer({ available: true, preset: 'Emery_BalancedBase_v11', confidence: 'low', reason: 'legacy', model: 'm', latencyMs: 10 });
    assert.ok(legacy.includes('id="slf-llm-apply-btn"'), 'legacy switch rendering is preserved without a canon decision');

    // #477 P1-3: the canon must be bound to the REQUEST, not to a single
    // mutable slot. Two overlapping payloads: an answer from payload A must
    // validate against A's canon even after payload B was built.
    const payloadA = LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 60 },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: canonDecision } },
        registry
    });
    const row1Decision2 = advise({ strength: 'equal' }).canon;
    const payloadB = LLM.buildPayload({
        snapshot: { gameId: 'g477', minute: 60 },
        ruleDecision: { action: { preset: 'Emery_BalancedBase_v11' }, moment: { context: {} }, finalTactic: { canon: row1Decision2 } },
        registry
    });
    const lateAnswer = {
        available: true, mode: 'adjust', confidence: 'medium', reason: 'late', model: 'm', latencyMs: 100,
        changes: [{ control: 'build_temp', value: '1' }, { control: 'build_fast', value: '3' }]
    };
    const boundToA = LLM.renderAnswer(lateAnswer, { payload: payloadA });
    assert.ok(boundToA.includes('id="slf-llm-apply-adjust"'), 'answer validated against payload A (row 8) is actionable');
    const boundToB = LLM.renderAnswer(lateAnswer, { payload: payloadB });
    assert.ok(!boundToB.includes('id="slf-llm-apply-adjust"'), 'the same answer validated against payload B (row 1) is rejected');
    assert.ok(boundToB.includes('Не применено'), 'mismatched request canon is visibly non-actionable');
}

// ===========================================================================
// R7 / no auto-apply — advising never writes a tactic
// ===========================================================================
{
    const current = { def_line: '1', press_line: '1', def_width: '2', press_intense: '1', build_type: '1', build_temp: '2', build_long: '2', build_fast: '1', style: '1', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '3', priority: [] };
    const before = JSON.stringify(current);
    const sandbox = makeSandbox({ currentTactic: current });
    let bridgeCalls = 0;
    sandbox.STATE = { tacticControlBridge: { applyTacticObject: () => { bridgeCalls += 1; return { ok: true }; } } };
    const context = { minute: 30, canonEvidence: { deepBlock: true }, score: { state: 'draw', diff: 0 } };
    sandbox.CurrentActionHintEngine.run(SNAPSHOT, context);
    sandbox.CurrentActionHintEngine.run(SNAPSHOT, context);
    assert.equal(JSON.stringify(current), before, 'advising does not mutate the current tactic');
    assert.equal(bridgeCalls, 0, 'advising never calls the tactic control bridge');
    assert.equal(sandbox.window.SLFFinalTacticMergeLayer.autoApply, false, 'final merge remains click-only');
    assert.equal(sandbox.window.SLFDave56EtalonLayer.autoApply, false, 'etalon/canon layer remains click-only');
}

// ===========================================================================
// R7 — provenance text must attribute canon overrides to canon, not the base preset
// ===========================================================================
{
    const uiSource = read('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js');
    const start = uiSource.indexOf('function finalTacticProvenanceText');
    assert.ok(start >= 0, 'provenance renderer exists');
    const body = uiSource.slice(start, start + 900);
    assert.match(body, /startsWith\('canon:'\)/, 'provenance renderer recognises canon: overrides');
    assert.match(body, /канон/, 'canon overrides are labelled as canon, not as the base preset');

    // Knowledge attribution must follow the displayed canon row, not the
    // competing preset that only supplied the base/defense/attack controls.
    const knowledgeStart = uiSource.indexOf('function buildKnowledgeProvenanceHtml');
    assert.ok(knowledgeStart >= 0, 'knowledge provenance renderer exists');
    const knowledgeBody = uiSource.slice(knowledgeStart, knowledgeStart + 2200);
    assert.match(knowledgeBody, /canon\.status === 'matched'/, 'knowledge attribution checks a matched canon row');
    assert.match(knowledgeBody, /канон №/, 'knowledge attribution names the canon row');
    assert.match(knowledgeBody, /situationText/, 'knowledge attribution may include the situation text');
}

console.log('canon situation presets #477: R1 rows + variants + collisions + missing/ambiguous + additions + R6 survival + league starts + adjust/switch validation + no auto-apply + canon provenance: OK');
