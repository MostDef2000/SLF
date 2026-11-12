#!/usr/bin/env node
// Situation-classification telemetry in the persisted decisionContext.
// ============================================================
// Regression layer over the REAL modules (vm realm, real registry + real
// cah-* engine modules + real EventTracker.compactRuleDecision — the actual
// producer of the persisted decisionContext in preset_effects export records;
// no mocks of the code under test — mirrors tests/test-tactic-suite-v12-lead-press-hold.mjs
// and tools/test-tactical-decision-linkage.mjs).
//
// Covered behavior (every assertion fails if the telemetry is reverted):
//   A. A classifying scenario (lead_press_hold): the engine decision carries
//      classifiedSituation + situationTrace, and the REAL compactRuleDecision
//      persists both inside decisionContext.signals (the payload the telemetry
//      layer stores verbatim as decisionContext.signals — compactRuleDecision
//      owns the decisionContext top-level key set and passes moment.context
//      through verbatim).
//   B. Trace reasons are non-empty strings for every evaluated-but-not-won
//      situation; the winning situation never appears as a failed entry.
//   C. No-classification scenario (direction policy not installed — stale
//      registry production case): defaults null / [] from
//      cah-runtime-context.js, and the decisionContext record is still written.
//   D. Additivity: every pre-existing decisionContext key (the production
//      export shape) is still present with unchanged values; the ONLY delta is
//      the two new signals keys.
//   E. Degenerate input never throws and still carries telemetry fields.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// decisionContext top-level keys observed in the production preset_effects
// export (var/tactics/export/preset_effects_v2.json) — the pre-change contract
// that must survive untouched.
const LEGACY_DECISION_CONTEXT_KEYS = [
    'action', 'candidateScores', 'confidence', 'generatedAt', 'margin', 'mode', 'schema', 'signals', 'vetoedPresets'
];
const NEW_SIGNAL_KEYS = ['classifiedSituation', 'situationTrace'];

function createContext({ withPolicy = true } = {}) {
    const sandbox = {
        console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, Boolean, Symbol, Error,
        setTimeout: () => 0, clearTimeout: () => {},
        localStorage: { getItem: () => null },
        document: { readyState: 'complete', querySelector: () => null, defaultView: null },
        location: { pathname: '/other.php', href: 'https://sublime.example/other.php' },
        URLSearchParams
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.RecommendationEngine = {
        getPresetLadder() { return []; },
        applyProgressionGuard(candidate) { return candidate; }
    };
    vm.createContext(sandbox);
    // Bundle order (src/app/bundle-order.json): match-state-parser -> cah engine
    // stack -> registry -> direction policy; telemetry stack config ->
    // snapshot-engine -> event-tracker (bundle positions 13/31-34/40/41/14).
    vm.runInContext(read('src/core/config.js'), sandbox, { filename: 'config.js' });
    vm.runInContext(read('src/modules/manual-match-telemetry/snapshot-engine.js'), sandbox, { filename: 'snapshot-engine.js' });
    vm.runInContext(`${read('src/modules/manual-match-telemetry/event-tracker.js')}\n;globalThis.__EventTracker = EventTracker;`, sandbox, { filename: 'event-tracker.js' });
    for (const rel of [
        'src/modules/match-reading/match-state-parser.js',
        'src/modules/strategy-data-recommendations/current-action-hint-engine.js',
        'src/modules/strategy-data-recommendations/cah-value-utils.js',
        'src/modules/strategy-data-recommendations/cah-runtime-context.js',
        'src/modules/strategy-data-recommendations/cah-decision-core.js'
    ]) {
        vm.runInContext(read(rel), sandbox, { filename: path.basename(rel) });
    }
    if (withPolicy) {
        vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'), sandbox, { filename: 'active-preset-registry.js' });
        vm.runInContext(read('src/modules/tactics-presets/tactic-preset-direction-policy.js'), sandbox, { filename: 'tactic-preset-direction-policy.js' });
    }
    return sandbox;
}

function baseSnapshot(overrides = {}) {
    return Object.assign({ gameId: 'g-telemetry', status: 'live', tacticTelemetry: {} }, overrides);
}

function assertTraceShape(trace, winner) {
    assert.ok(Array.isArray(trace), 'situationTrace is an array');
    for (const entry of trace) {
        assert.equal(typeof entry.situation, 'string', `trace entry situation is a string (${JSON.stringify(entry)})`);
        assert.equal(entry.ok, false, 'trace entries are failed situations');
        assert.equal(typeof entry.reason, 'string', 'trace reason is a string');
        assert.ok(entry.reason.length > 0, `trace reason is non-empty for ${entry.situation}`);
        assert.ok(!('preset' in entry), 'trace carries no per-preset data');
    }
    if (winner != null) assert.ok(!trace.some(entry => entry.situation === winner), 'winning situation is not listed as blocked');
}

// ===========================================================================
console.log('[situation-telemetry] A. classifying scenario end-to-end (engine -> policy -> compactRuleDecision)');
const sandbox = createContext();
const Engine = sandbox.window.SLFCurrentActionHintEngine;
const Policy = sandbox.window.SLFTacticDirectionPolicy;
const EventTracker = sandbox.__EventTracker;
assert.ok(Engine && sandbox.window.SLFActivePresetRegistry, 'real engine and registry installed');
assert.ok(sandbox.window.SLFTacticDirectionPolicy, 'direction policy installed');
assert.ok(EventTracker, 'real EventTracker loaded');

// Boa-Guarani-style trigger: winning at 70' vs an opponent pressing above plan.
const triggerCtx = { scoreState: 'winning', minute: 70, opponentPressVector: 25, score: { state: 'winning', diff: 1 } };
const decision = Engine.run(baseSnapshot(), triggerCtx);
assert.equal(decision.action.preset, 'Flick_LeadPressHold_v12', 'engine recommends Flick (sanity: real decision path)');
assert.equal(decision.situationKey, 'lead_press_hold');
assert.equal(decision.classifiedSituation, 'lead_press_hold', 'decision carries classifiedSituation');
assert.ok(Array.isArray(decision.situationTrace) && decision.situationTrace.length > 0, 'decision carries a non-empty situationTrace');
assertTraceShape(decision.situationTrace, 'lead_press_hold');

// The REAL persisted decisionContext (compactRuleDecision is what lands in the
// preset_effects export records) carries the telemetry inside signals.
const compact = EventTracker.compactRuleDecision(decision);
assert.ok(compact, 'compactRuleDecision produced the decisionContext record');
assert.equal(compact.signals.classifiedSituation, 'lead_press_hold', 'decisionContext.signals.classifiedSituation persisted');
assert.deepEqual(JSON.parse(JSON.stringify(compact.signals.situationTrace)), JSON.parse(JSON.stringify(decision.situationTrace)),
    'decisionContext.signals.situationTrace persisted verbatim');

console.log('[situation-telemetry] B. trace reasons are non-empty strings; winner never blocked');
{
    // width_attack scenario: center closed + wide quality, no pressure.
    const widthCtx = { scoreState: 'draw', minute: 30, centerClosed: true, wideQuality: true };
    const widthDecision = Engine.run(baseSnapshot({ gameId: 'g-telemetry-width' }), widthCtx);
    assert.equal(Policy.classifySituation(widthCtx), 'width_attack', 'width context classifies as width_attack');
    assert.equal(widthDecision.classifiedSituation, 'width_attack', 'engine decision classifies width_attack');
    assertTraceShape(widthDecision.situationTrace, 'width_attack');
    assert.ok(widthDecision.situationTrace.some(entry => entry.situation === 'lead_press_hold' && entry.reason.includes('прессующее удержание')),
        'lead_press_hold blocker reuses the existing veto wording');
    assert.ok(widthDecision.situationTrace.some(entry => entry.situation === 'protect_lead'),
        'protect_lead listed as blocked before width_attack wins');
    const compactWidth = EventTracker.compactRuleDecision(widthDecision);
    assert.equal(compactWidth.signals.classifiedSituation, 'width_attack', 'width classification persisted');
    assert.deepEqual(JSON.parse(JSON.stringify(compactWidth.signals.situationTrace)), JSON.parse(JSON.stringify(widthDecision.situationTrace)),
        'width trace persisted verbatim');
}

console.log('[situation-telemetry] C. no-classification scenario: null/[] defaults, record intact');
{
    const bare = createContext({ withPolicy: false });
    const bareEngine = bare.window.SLFCurrentActionHintEngine;
    const bareDecision = bareEngine.run(baseSnapshot({ gameId: 'g-telemetry-bare' }), triggerCtx);
    assert.ok(bareDecision?.action, 'bare engine still produces a decision');
    assert.equal(bareDecision.moment.context.classifiedSituation, null, 'no policy -> classifiedSituation defaults to null');
    assert.deepEqual(JSON.parse(JSON.stringify(bareDecision.moment.context.situationTrace)), [], 'no policy -> empty trace default');
    const bareCompact = bare.__EventTracker.compactRuleDecision(bareDecision);
    assert.ok(bareCompact, 'decisionContext record still written without the policy');
    assert.equal(bareCompact.signals.classifiedSituation, null, 'persisted signals.classifiedSituation is null');
    assert.deepEqual(JSON.parse(JSON.stringify(bareCompact.signals.situationTrace)), [], 'persisted situationTrace is empty');
    for (const key of LEGACY_DECISION_CONTEXT_KEYS) {
        assert.ok(key in bareCompact, `legacy decisionContext key "${key}" present in the no-policy record`);
    }
}

console.log('[situation-telemetry] D. additivity: legacy keys and values byte-identical, only new signal keys added');
{
    const stripped = JSON.parse(JSON.stringify(decision));
    delete stripped.classifiedSituation;
    delete stripped.situationTrace;
    delete stripped.moment.context.classifiedSituation;
    delete stripped.moment.context.situationTrace;
    const compactStripped = EventTracker.compactRuleDecision(stripped);

    // Top level: every legacy key present; values unchanged for all of them.
    // JSON round-trip on both sides: the record is persisted as JSON, and
    // vm-realm objects must not trip prototype identity checks.
    const json = value => JSON.parse(JSON.stringify(value));
    for (const key of LEGACY_DECISION_CONTEXT_KEYS) {
        assert.ok(key in compact, `legacy decisionContext key "${key}" present`);
        if (key === 'signals') continue; // compared key-by-key below
        assert.deepEqual(JSON.parse(JSON.stringify(compact[key])), JSON.parse(JSON.stringify(compactStripped[key])),
            `decisionContext.${key} unchanged by the telemetry`);
    }
    // signals: exact key delta = the two new telemetry keys; every legacy
    // signals value byte-identical.
    const legacySignalKeys = Object.keys(compactStripped.signals);
    const newSignalKeys = Object.keys(compact.signals).filter(key => !legacySignalKeys.includes(key));
    assert.deepEqual(newSignalKeys.slice().sort(), NEW_SIGNAL_KEYS.slice().sort(),
        'the only new decisionContext.signals keys are classifiedSituation + situationTrace');
    for (const key of legacySignalKeys) {
        assert.deepEqual(JSON.parse(JSON.stringify(compact.signals[key])), JSON.parse(JSON.stringify(compactStripped.signals[key])),
            `decisionContext.signals.${key} unchanged by the telemetry`);
    }
}

console.log('[situation-telemetry] E. classification outcomes unchanged (refactor tripwire) + degenerate input never throws');
{
    // Known classifications pinned by tests/test-tactic-suite-v12-lead-press-hold.mjs.
    assert.equal(Policy.classifySituation(triggerCtx), 'lead_press_hold');
    assert.equal(Policy.classifySituation({ scoreState: 'winning', minute: 70, opponentPressVector: 5 }), 'protect_lead');
    assert.equal(Policy.classifySituation({ scoreState: 'winning', minute: 70, opponentPressVector: 5, counterExitAvailable: true }), 'protect_lead_with_outlet');
    assert.equal(Policy.classifySituation({
        scoreState: 'winning', minute: 84, underPressure: true, counterExitAvailable: false,
        pressureRisk: 90, opponentPressVector: 25, signals: ['under_pressure', 'sustained_siege']
    }), 'emergency_lock');
    assert.equal(Policy.classifySituation({}), 'default_start', 'empty context still classifies (default_start)');
    // rank() exposes the same trace the decision was built from.
    const ranked = Policy.rank(triggerCtx);
    assert.equal(ranked.situation, 'lead_press_hold');
    assertTraceShape(ranked.situationTrace, 'lead_press_hold');
    // Degenerate input: the wrapper must not throw and must still carry telemetry.
    let degenerate;
    assert.doesNotThrow(() => { degenerate = Engine.run(null, null); }, 'degenerate engine.run never throws');
    assert.ok(typeof degenerate.classifiedSituation === 'string' || degenerate.classifiedSituation === null,
        'degenerate decision still carries classifiedSituation');
    assert.ok(Array.isArray(degenerate.situationTrace), 'degenerate decision still carries a situationTrace array');
}

console.log('[situation-telemetry] all sections OK');
