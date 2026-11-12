#!/usr/bin/env node
// Match-time preset hints in the merged «Рекомендация» block.
// ============================================================
// The UI extension is a load-time IIFE, so the hints are exercised through the
// REAL compact renderer (RecommendationEngine.compactPlan installed by the
// extension) in a vm realm with the real registry + re-* engine modules — same
// harness style as tools/test-tactical-knowledge-pack.mjs §4 (no mocks of the
// code under test).
//
// Covered behavior (every assertion fails if the hints are reverted):
//   A. GROUPING/WHY/RISK — recommended presets (displayed finalTactic preset +
//      non-vetoed candidates) are grouped by roleContracts[...].role, each row
//      carries the existing META «use» first sentence as the why-line (the
//      appended generic high-press note is truncated away) and a risk color
//      derived from riskClass (very_high → red, medium_high → amber);
//      vetoed candidates get no hint.
//   B. MANUAL ONLY — a manualOnly preset shows the distinct «ручной выбор»
//      marker.
//   C. MISSING CONTRACT — a candidate/finalTactic preset without a role
//      contract renders without hints and never throws (the merged block still
//      renders; the other presets keep their hints).
//   D. NO REGISTRY — window.SLFActivePresetRegistry absent → no hints, the
//      merged block still renders.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function createContext() {
    const storage = new Map();
    const context = {
        console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean,
        setTimeout() { return 1; }, clearTimeout() {},
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        window: {}
    };
    context.globalThis = context;
    context.location = { pathname: '/other.php', href: 'https://sublime.example/other.php' };
    context.document = {
        readyState: 'complete',
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        body: { addEventListener() {} }
    };
    context.UI = { addMatchParserPanel() {}, addParserLog() {}, updateParserStatus() {} };
    // Free global from tactic-preset-library.js (real bundle); the registry
    // populates meta/traits at load, and re-preset-family reads it at call time.
    context.TacticPresetLibrary = { meta: {}, traits: {}, schemeStates: {}, presetSchemeState: {} };
    context.STATE = {};
    context.getCurrentTactic = () => ({});
    context.MatchStateParser = { getGameId() { return 'g'; } };
    // re-snapshot-model.getScoreState reads a bare `num` helper (shared-scope in
    // the real bundle); provide the equivalent here.
    context.num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
    context.window.SLFCurrentActionHintEngine = {
        schema: 'slf_rule_decision_v11_tactical_suite',
        run() { return { schema: 'slf_rule_decision_v11_tactical_suite', action: { preset: null }, candidates: [] }; }
    };
    vm.createContext(context);
    // recommendation-engine.js declares a top-level `const RecommendationEngine`
    // (a global lexical binding, not a context property) — expose a handle.
    vm.runInContext(read('src/modules/strategy-data-recommendations/recommendation-engine.js') + '\n;globalThis.__RE = RecommendationEngine;', context, { filename: 'recommendation-engine.js' });
    for (const rel of [
        'src/modules/strategy-data-recommendations/re-html-utils.js',
        'src/modules/strategy-data-recommendations/re-snapshot-model.js',
        'src/modules/strategy-data-recommendations/re-preset-family.js',
        'src/modules/strategy-data-recommendations/re-plan-engine.js'
    ]) {
        vm.runInContext(read(rel), context, { filename: path.basename(rel) });
    }
    vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'), context, { filename: 'active-preset-registry.js' });
    vm.runInContext(read('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js'), context, { filename: 'strategy-data-task-a-ui-extension.js' });
    return context;
}

const EMPTY_PLAN = { context: [], developer: [], preset: [], controls: [], notes: [] };

function baseSnapshot(overrides = {}) {
    return Object.assign({
        gameId: 'g', myTeam: 1, teams: [1, 2], score: { home: 0, away: 1 }, minute: 75,
        stats: [{ teamId: 1, stats: { power: 100 } }, { teamId: 2, stats: { power: 98 } }]
    }, overrides);
}

// Realistic merged-rec fixture (final-tactic-merge-layer.js shape): the vector
// is the registry preset's own controls, so the block renders for real.
function finalTacticFixture(registry, presetId, overrides = {}) {
    return Object.assign({
        schema: 'slf_final_tactic_v1',
        source: `merged:etalon:e1+presets:${presetId}`,
        base: `preset:${presetId}`,
        presetId,
        vector: Object.assign({}, registry.presets[presetId]),
        overrides: {},
        etalonIds: ['e1'],
        deltaVsCurrent: [],
        insufficientData: [],
        notes: []
    }, overrides);
}

function decisionFixture({ finalTactic, candidates }) {
    return {
        schema: 'slf_rule_decision_v11_tactical_suite',
        action: { preset: candidates.find(item => !item.vetoed)?.preset || null, decision: 'controlled_chase', reason: 'fixture' },
        confidence: { level: 'medium' },
        margin: 1.2,
        candidates,
        finalTactic
    };
}

// The hints row is appended LAST inside the «Подробнее» rows, so everything
// from the section header to the end of the html is the hints block.
function hintsSlice(html) {
    const start = html.indexOf('Пресеты по ролям:');
    assert.ok(start !== -1, 'hints section rendered inside the recommendation block');
    return html.slice(start);
}

// ===========================================================================
console.log('[preset-hints] A. grouping / why-line / risk color');
{
    const context = createContext();
    const registry = context.window.SLFActivePresetRegistry;
    const RE = context.__RE;
    const snapshot = baseSnapshot();
    snapshot.ruleDecision = decisionFixture({
        finalTactic: finalTacticFixture(registry, 'Klopp_LateGegenpress_v11'),
        candidates: [
            { preset: 'Klopp_LateGegenpress_v11', score: 5.2, vetoed: false },
            { preset: 'Guardiola_ControlledPush_v11', score: 3.1, vetoed: false },
            { preset: 'Simeone_CompactLead_v11', score: 1.4, vetoed: true }
        ]
    });

    const html = RE.compactPlan({ ...EMPTY_PLAN }, snapshot, '');
    assert.ok(html.includes('Рекомендация:'), 'merged recommendation block rendered');
    const hints = hintsSlice(html);

    // Grouping by roleContracts[...].role (role keys — no human labels exist).
    assert.ok(hints.includes('late_high_pressure'), 'Klopp grouped under its role key');
    assert.ok(hints.includes('controlled_chase'), 'ControlledPush grouped under its role key');
    assert.ok(hints.indexOf('late_high_pressure') < hints.indexOf('controlled_chase'),
        'displayed preset (finalTactic.presetId) leads the grouping');

    // Why-line: existing META «use» text, first sentence only — the appended
    // generic high-press note (C324/C379) is truncated away.
    assert.ok(hints.includes('Позднее отставание при хорошей физике'), 'Klopp why-line from META.use');
    assert.ok(hints.includes('Нужен гол, но нет оснований для all-in'), 'ControlledPush why-line from META.use');
    assert.ok(!hints.includes('Для высокого прессинга назначьте'), 'generic high-press note truncated out of the why-line');

    // Risk color derived from riskClass (very_high → red, medium_high → amber).
    assert.ok(hints.includes('риск: very_high') && hints.includes('#ff7a7a'), 'very_high riskClass renders the red marker');
    assert.ok(hints.includes('риск: medium_high') && hints.includes('#ffd76a'), 'medium_high riskClass renders the amber marker');

    // Vetoed candidates get no hint.
    assert.ok(!hints.includes('Diego Simeone — Compact Lead'), 'vetoed candidate excluded from hints');
    assert.ok(!hints.includes('protect_lead'), 'vetoed candidate role absent from hints');
}

console.log('[preset-hints] B. manualOnly marker');
{
    const context = createContext();
    const registry = context.window.SLFActivePresetRegistry;
    const RE = context.__RE;
    const snapshot = baseSnapshot();
    snapshot.ruleDecision = decisionFixture({
        finalTactic: finalTacticFixture(registry, 'Klopp_LateGegenpress_v11'),
        candidates: [
            { preset: 'Klopp_LateGegenpress_v11', score: 5.2, vetoed: false },
            { preset: 'Arteta_SafePossession_v11', score: 0.4, vetoed: false }
        ]
    });

    const html = RE.compactPlan({ ...EMPTY_PLAN }, snapshot, '');
    const hints = hintsSlice(html);
    assert.ok(hints.includes('ручной выбор'), 'manualOnly preset shows the «ручной выбор» marker');
    assert.ok(hints.includes('Mikel Arteta — Safe Possession'), 'manualOnly preset still listed with its title');
}

console.log('[preset-hints] C. missing role contract never throws');
{
    const context = createContext();
    const registry = context.window.SLFActivePresetRegistry;
    const RE = context.__RE;
    const snapshot = baseSnapshot();
    // Unknown preset id everywhere a preset id is consumed; the vector stays
    // real so the merged block itself still renders.
    snapshot.ruleDecision = decisionFixture({
        finalTactic: finalTacticFixture(registry, 'Klopp_LateGegenpress_v11', { presetId: 'Ghost_Preset_Unknown', base: 'preset:Ghost_Preset_Unknown' }),
        candidates: [
            { preset: 'Ghost_Preset_Unknown', score: 9.9, vetoed: false },
            { preset: 'Klopp_LateGegenpress_v11', score: 5.2, vetoed: false }
        ]
    });

    const html = RE.compactPlan({ ...EMPTY_PLAN }, snapshot, '');
    assert.ok(html.includes('Рекомендация:'), 'merged block still renders when a preset has no contract');
    const hints = hintsSlice(html);
    assert.ok(!hints.includes('Ghost_Preset_Unknown'), 'preset without a contract renders without hints');
    assert.ok(hints.includes('late_high_pressure'), 'presets WITH contracts keep their hints');
}

console.log('[preset-hints] D. absent registry renders without hints');
{
    const context = createContext();
    const registry = context.window.SLFActivePresetRegistry;
    const RE = context.__RE;
    const snapshot = baseSnapshot();
    snapshot.ruleDecision = decisionFixture({
        finalTactic: finalTacticFixture(registry, 'Klopp_LateGegenpress_v11'),
        candidates: [{ preset: 'Klopp_LateGegenpress_v11', score: 5.2, vetoed: false }]
    });
    context.window.SLFActivePresetRegistry = null;

    const html = RE.compactPlan({ ...EMPTY_PLAN }, snapshot, '');
    assert.ok(html.includes('Рекомендация:'), 'merged block renders without the registry');
    assert.ok(!html.includes('Пресеты по ролям:'), 'no hints section without the registry');
}

console.log('[preset-hints] all sections OK');
