#!/usr/bin/env node
// SLF issue #361 — Tactical Suite v12: lead-press-hold preset + protect_lead gate
// + named-trainer invariant. Regression layer over the REAL registry and REAL
// direction policy (vm sandbox, no mocks of the code under test — mirrors the
// harness style of tools/test-tactic-fallback-hold-current.mjs).
//
// Covered behavior:
//   - registry completeness for Flick_LeadPressHold_v12 (13 active presets, v12 identity)
//   - SCORE_BY_SITUATION.lead_press_hold exact priors (Flick 80 / Allegri 45 / Simeone 35 / Emery 30)
//   - veto (a): Flick only when winning && 60<=minute<=85 && opponentPressVector>=20
//   - veto (b): Simeone_CompactLead_v11 gated vs high press; still valid after 85',
//     at a 2+ goal lead and in emergency_lock
//   - veto (c): dribble guard in lead_press_hold / protect_lead / protect_lead_with_outlet
//   - named-trainer invariant: every active preset carries a real trainer;
//     'standard' stays a UI-only baseline excluded from recommendations.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const sandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.SLFCurrentActionHintEngine = { schema: 'slf_rule_decision_v11_tactical_suite', run: () => ({}) };
sandbox.RecommendationEngine = {
    getPresetLadder() { return []; },
    applyProgressionGuard(candidate) { return candidate; }
};
vm.createContext(sandbox);
vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'), sandbox, { filename: 'active-preset-registry.js' });
vm.runInContext(read('src/modules/tactics-presets/tactic-preset-direction-policy.js'), sandbox, { filename: 'tactic-preset-direction-policy.js' });

const R = sandbox.window.SLFActivePresetRegistry;
const P = sandbox.window.SLFTacticDirectionPolicy;
const E = sandbox.window.SLFCurrentActionHintEngine;
assert.ok(R && P, 'registry and policy installed');

// --- 1. Registry v12 identity and completeness --------------------------------
assert.equal(R.suiteVersion, 'slf_tactic_suite_561_v12');
assert.equal(R.fallbackPolicy, '5.61-tactical-suite-v12-hold-current', 'v12 hold-current contract (exact string from source)');
assert.equal(P.version, '5.61-tactical-suite-v12.0');
assert.equal(P.suiteVersion, 'slf_tactic_suite_561_v12');

const FLICK = 'Flick_LeadPressHold_v12';
assert.equal(R.active.length, 13, '13 active presets in v12');
assert.ok(R.active.includes(FLICK), 'Flick preset is active');
for (const [where, obj] of [
    ['presets', R.presets], ['labels', R.labels], ['meta', R.meta], ['traits', R.traits],
    ['roleContracts', R.roleContracts], ['formations', R.formations],
    ['presetSchemeState', R.presetSchemeState], ['displayMeta', R.displayMeta]
]) {
    assert.ok(obj[FLICK], `Flick registered in ${where}`);
}
assert.equal(R.labels[FLICK], 'Hansi Flick — Lead Press Hold');
assert.equal(R.meta[FLICK].group, 'defensive');
assert.equal(R.meta[FLICK].role, 'lead_press_hold');
assert.equal(R.roleContracts[FLICK].primarySituation, 'lead_press_hold');
assert.deepEqual(JSON.parse(JSON.stringify(R.roleContracts[FLICK].allowedSituations)), ['protect_lead']);
assert.equal(R.presetSchemeState[FLICK], 'lead_press_hold_4231');
assert.equal(R.schemeStates['lead_press_hold_4231'], 'Fixed 4-2-3-1 RW/RM — Hansi Flick — Lead Press Hold');
assert.equal(R.displayMeta[FLICK].trainer, 'Flick');
assert.equal(R.displayMeta[FLICK].formation, 'Fixed 4-2-3-1 (RW/RM)');
assert.equal(R.displayMeta[FLICK].style, '3');
assert.equal(R.displayMeta[FLICK].suffix, '_neutr');
assert.ok(R.displayOrder.includes(FLICK), 'Flick visible in UI order');
assert.ok(R.auditTier.conditional.includes(FLICK), 'Flick is a conditional-tier preset');
assert.ok(R.situations.includes('lead_press_hold'), 'lead_press_hold is a registry situation');
assert.deepEqual(JSON.parse(JSON.stringify(R.traits[FLICK].requires)), ['lead_one_goal', 'opponent_press_vector_high']);
assert.deepEqual(JSON.parse(JSON.stringify(R.traits[FLICK].avoids)), ['transition_threat', 'high_bad_actions']);

// Exact owner-approved vector (#361 scope item 1).
assert.deepEqual(JSON.parse(JSON.stringify(R.presets[FLICK])), {
    def_line: '2', press_line: '2', def_width: '2', press_intense: '3',
    build_type: '2', build_temp: '1', build_long: '2', build_fast: '2',
    style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2', priority: []
});

// Ladder placement: between Allegri_LeadOutlet_v11 and Simeone_CompactLead_v11.
const defensiveLadder = R.ladders.defensive;
assert.ok(
    defensiveLadder.indexOf('Allegri_LeadOutlet_v11') < defensiveLadder.indexOf(FLICK)
    && defensiveLadder.indexOf(FLICK) < defensiveLadder.indexOf('Simeone_CompactLead_v11'),
    'defensive ladder order Emery < Allegri < Flick < Simeone_CompactLead'
);

// STEP edges (live graph through the policy's shortestStep).
assert.equal(P.shortestStep(FLICK, 'Simeone_CompactLead_v11'), 'Simeone_CompactLead_v11', 'direct edge Flick -> Simeone_CompactLead');
assert.equal(P.shortestStep('Simeone_CompactLead_v11', FLICK), FLICK, 'direct edge Simeone_CompactLead -> Flick');
assert.equal(P.shortestStep('Allegri_LeadOutlet_v11', FLICK), FLICK, 'direct edge Allegri -> Flick');
assert.equal(P.shortestStep(FLICK, 'Allegri_LeadOutlet_v11'), 'Allegri_LeadOutlet_v11', 'direct edge Flick -> Allegri');

// --- 2. SCORE_BY_SITUATION.lead_press_hold exact priors -----------------------
// The table is module-local; the exact row is asserted against the source (the
// established source-text convention), and the observable priors through the
// real scoreCandidate() for the presets that are not vetoed in the situation.
const policySource = read('src/modules/tactics-presets/tactic-preset-direction-policy.js');
assert.ok(
    policySource.includes('"lead_press_hold":{"Flick_LeadPressHold_v12":80,"Allegri_LeadOutlet_v11":45,"Simeone_CompactLead_v11":35,"Emery_BalancedBase_v11":30}'),
    'SCORE_BY_SITUATION.lead_press_hold exact priors: Flick 80 / Allegri 45 / Simeone 35 / Emery 30'
);
const triggerCtx = { scoreState: 'winning', minute: 70, opponentPressVector: 25, score: { state: 'winning', diff: 1 } };
assert.equal(P.classifySituation(triggerCtx), 'lead_press_hold', 'trigger context classifies as lead_press_hold');
assert.equal(P.scoreCandidate(FLICK, triggerCtx, 'lead_press_hold').parts.rulePrior, 80, 'Flick prior 80');
assert.equal(P.scoreCandidate('Emery_BalancedBase_v11', triggerCtx, 'lead_press_hold').parts.rulePrior, 30, 'Emery prior 30');
assert.equal(P.preferredPreset('lead_press_hold'), FLICK, 'Flick is the preferred lead_press_hold preset');

// --- 3. Veto (a): Flick window/vector/lead boundaries -------------------------
const vetoAReason = reason => reason.some(r => r.includes('прессующее удержание'));
const base = { scoreState: 'winning', opponentPressVector: 25 };
for (const [label, ctx, allowed] of [
    ['minute 59', { ...base, minute: 59 }, false],
    ['minute 60', { ...base, minute: 60 }, true],
    ['minute 70', { ...base, minute: 70 }, true],
    ['minute 85', { ...base, minute: 85 }, true],
    ['minute 86', { ...base, minute: 86 }, false],
    ['vector 19', { scoreState: 'winning', minute: 70, opponentPressVector: 19 }, false],
    ['vector 20', { scoreState: 'winning', minute: 70, opponentPressVector: 20 }, true],
    ['vector 33 (Boa-Guarani +33%)', { scoreState: 'winning', minute: 72, opponentPressVector: 33 }, true],
    ['not winning (draw)', { scoreState: 'draw', minute: 70, opponentPressVector: 25 }, false],
    ['losing', { scoreState: 'losing', minute: 70, opponentPressVector: 25 }, false]
]) {
    const veto = P.hardVeto(FLICK, ctx);
    assert.equal(vetoAReason(veto.reasons), !allowed, `veto (a) ${label}: gate reason ${allowed ? 'absent' : 'present'}`);
    if (allowed) assert.equal(veto.vetoed, false, `veto (a) ${label}: Flick eligible`);
    if (allowed) assert.equal(P.classifySituation(ctx), 'lead_press_hold', `veto (a) ${label}: classified lead_press_hold`);
}

// End-to-end: choose() picks Flick in the trigger window and nothing else.
const decision = P.rank(triggerCtx);
assert.equal(decision.situation, 'lead_press_hold');
assert.equal(decision.eligible[0].preset, FLICK, 'Flick tops lead_press_hold');
assert.equal(decision.eligible[0].score, 80, 'Flick score 80 (standard appetite, no evidence adjustment)');
assert.equal(decision.eligible[1].preset, 'Emery_BalancedBase_v11', 'Emery is the runner-up (Allegri/Simeone dribble-vetoed)');
const chosen = E.run({ gameId: 'g361', status: 'live', tacticTelemetry: {} }, triggerCtx);
assert.equal(chosen.action.preset, FLICK, 'engine wrapper recommends Flick under the Boa-Guarani 70\' situation');
assert.equal(chosen.situationKey, 'lead_press_hold');

// --- 4. Veto (b): Compact Lead gated vs high press, carve-outs honored --------
const vetoBReason = reason => reason.some(r => r.includes('компактный блок'));
const dribbleReason = reason => reason.some(r => r.includes('дриблинг'));

// (b) fires inside the window at a one-goal lead (classified lead_press_hold).
const bInside = P.hardVeto('Simeone_CompactLead_v11', triggerCtx);
assert.ok(bInside.vetoed, 'Simeone vetoed vs high press in the 60-85 window');
assert.ok(vetoBReason(bInside.reasons), 'veto (b) gate reason present in-window');
assert.ok(dribbleReason(bInside.reasons), 'dribble guard reason also present (dribble 1)');

// Carve-out: 2+ goal lead — no (b) gate reason (still dribble-vetoed in lead situations).
const bTwoGoal = P.hardVeto('Simeone_CompactLead_v11', { scoreState: 'winning', minute: 70, opponentPressVector: 25, scoreDiff: 2 });
assert.ok(!vetoBReason(bTwoGoal.reasons), 'veto (b) does not fire at a 2-goal lead');

// Carve-out: after 85' — no (b) gate reason.
const bLate = P.hardVeto('Simeone_CompactLead_v11', { scoreState: 'winning', minute: 86, opponentPressVector: 25, scoreDiff: 1 });
assert.ok(!vetoBReason(bLate.reasons), 'veto (b) does not fire after 85\'');

// Carve-out: emergency_lock — Simeone fully valid there (no (b), no dribble guard).
const emergencyCtx = {
    scoreState: 'winning', minute: 84, underPressure: true, counterExitAvailable: false,
    pressureRisk: 90, opponentPressVector: 25, signals: ['under_pressure', 'sustained_siege']
};
assert.equal(P.classifySituation(emergencyCtx), 'emergency_lock');
const bEmergency = P.hardVeto('Simeone_CompactLead_v11', emergencyCtx);
assert.equal(bEmergency.vetoed, false, 'Simeone remains valid in emergency_lock even vs high press');
assert.ok(!vetoBReason(bEmergency.reasons) && !dribbleReason(bEmergency.reasons), 'no (b)/dribble reasons in emergency_lock');

// Low press outside the gate: in-window, one-goal, but vector below plan -> no (b).
const bLowPress = P.hardVeto('Simeone_CompactLead_v11', { scoreState: 'winning', minute: 70, opponentPressVector: 10, scoreDiff: 1 });
assert.ok(!vetoBReason(bLowPress.reasons), 'veto (b) does not fire vs press at/below plan');

// --- 5. Veto (c): dribble guard across the three lead situations --------------
const leadSituations = ['lead_press_hold', 'protect_lead', 'protect_lead_with_outlet'];
const dribbleOne = ['Simeone_CompactLead_v11', 'Simeone_EmergencyBlock_v11', 'Allegri_LeadOutlet_v11', 'Guardiola_PressEscape_v11', 'Guardiola_PressCooldown_v11'];
const ctxBySituation = {
    lead_press_hold: { scoreState: 'winning', minute: 70, opponentPressVector: 25 },
    protect_lead: { scoreState: 'winning', minute: 70, opponentPressVector: 5 },
    protect_lead_with_outlet: { scoreState: 'winning', minute: 70, opponentPressVector: 5, counterExitAvailable: true }
};
for (const situation of leadSituations) {
    const ctx = ctxBySituation[situation];
    assert.equal(P.classifySituation(ctx), situation, `context classifies as ${situation}`);
    for (const name of dribbleOne) {
        const veto = P.hardVeto(name, ctx);
        assert.ok(veto.vetoed, `${name} vetoed in ${situation}`);
        assert.ok(dribbleReason(veto.reasons), `${name} vetoed by the dribble guard in ${situation}`);
    }
    // Flick (dribble 2) and Emery (dribble 2) are never dribble-vetoed there.
    for (const name of [FLICK, 'Emery_BalancedBase_v11']) {
        const veto = P.hardVeto(name, ctx);
        assert.ok(!dribbleReason(veto.reasons), `${name} not dribble-vetoed in ${situation}`);
    }
    // The top recommendation never has dribble <= 1.
    const ranked = P.rank(ctx);
    const top = ranked.eligible[0];
    assert.ok(top, `${situation}: has an eligible candidate`);
    assert.ok(Number(R.presets[top.preset].dribble) >= 2, `${situation}: top pick ${top.preset} has dribble >= 2`);
}
// Situation winners: Flick in lead_press_hold, Emery carries both deep-lead situations.
assert.equal(P.rank(ctxBySituation.lead_press_hold).eligible[0].preset, FLICK);
assert.equal(P.rank(ctxBySituation.protect_lead).eligible[0].preset, 'Emery_BalancedBase_v11', 'protect_lead: deep blocks (dribble 1) out, Emery top');
assert.equal(P.rank(ctxBySituation.protect_lead_with_outlet).eligible[0].preset, 'Emery_BalancedBase_v11', 'protect_lead_with_outlet: Allegri (dribble 1) out, Emery top');
// The dribble guard does not leak into non-lead situations.
const emergencyBlock = P.hardVeto('Simeone_EmergencyBlock_v11', emergencyCtx);
assert.equal(emergencyBlock.vetoed, false, 'dribble guard inactive in emergency_lock');

// --- 6. opponentPressVector context contract ----------------------------------
assert.equal(P.deriveSuiteContext({ opponentPressVector: 22 }).opponentPressVector, 22, 'direct field honored');
assert.equal(P.deriveSuiteContext({ oppPressVector: 25 }).opponentPressVector, 25, 'moment.context.oppPressVector alias honored');
assert.equal(P.deriveSuiteContext({ oppPress: 30 }).opponentPressVector, 30, 'coach-hint oppPress alias honored');
assert.equal(P.deriveSuiteContext({}).opponentPressVector, 0, 'defaults to 0 (press at/below plan)');

// --- 7. Named-trainer invariant (#361 scope item 5) ---------------------------
for (const name of R.active) {
    assert.ok(R.displayMeta[name] && String(R.displayMeta[name].trainer).length > 0, `${name}: DISPLAY_META trainer is a non-empty real name`);
    assert.ok(R.labels[name], `${name}: LABELS entry present`);
}
assert.match(R.labels.Flick_LeadPressHold_v12, /Hansi Flick/);
assert.ok(!R.active.includes('standard'), "'standard' is excluded from the recommendation set (named-trainer invariant, smaller-diff option)");
assert.ok(R.displayOrder.includes('standard'), "'standard' remains visible as the UI-only baseline");

console.log('tactical suite v12 lead-press-hold contract: OK (registry, scoring, vetoes a/b/c, trainer invariant)');
