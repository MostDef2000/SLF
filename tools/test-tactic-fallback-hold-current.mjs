#!/usr/bin/env node
// SLF issue #325 — Tactical Suite v9: no implicit preset fallback.
// Regression layer for the v9 hold_current contract (base c5ca7de + R1).
//
// v8 behavior these assertions catch (RED authenticity):
//   - v8 choose() fell back to `ranked.eligible[0] || { preset:'Arteta_Control433_bal3', ... }`
//     (tactic-preset-direction-policy.js:166 at c5ca7de) — v9 must return hold:true, name:null.
//   - v8 selectRawPreset injected `'Arteta_Control433_bal3'` for any invalid/missing decision
//     (policy:266 at c5ca7de) — v9 must return name:null + hold_current + fallbackReason.
//   - v8 preferredPreset returned `|| 'Arteta_Control433_bal3'` for unknown situations
//     (policy:328 at c5ca7de) — v9 must return null (no fallback literal anywhere).
//
// vm-sandbox harness: single concatenated bundle in one script scope (mirrors the
// userscript build), same file set and __RE export trick as .tmp/slf-v9-smoke.js.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'src/modules/strategy-data-recommendations/recommendation-engine.js',
  'src/modules/strategy-data-recommendations/current-action-hint-engine.js',
  'src/modules/strategy-data-recommendations/cah-value-utils.js',
  'src/modules/strategy-data-recommendations/cah-runtime-context.js',
  'src/modules/strategy-data-recommendations/cah-decision-core.js',
  'src/modules/tactics-presets/active-preset-registry.js',
  'src/modules/tactics-presets/tactic-preset-direction-policy.js'
];

const sandbox = {
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const bundle = files.map(rel => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n;\n');
vm.runInContext(bundle + '\n;\nthis.__RE = (typeof RecommendationEngine !== "undefined") ? RecommendationEngine : undefined;', sandbox, { filename: 'slf-v9-fallback-hold-bundle.js' });

const R = sandbox.window.SLFActivePresetRegistry;
const P = sandbox.window.SLFTacticDirectionPolicy;
const E = sandbox.window.SLFCurrentActionHintEngine;
const RE = sandbox.__RE;
assert.ok(R && P && E && RE, 'bundle installed registry, policy, engine and RecommendationEngine');
assert.equal(P.version, '5.61-tactical-suite-v9.0', 'policy version v9.0');
assert.equal(R.fallbackPolicy, '5.61-tactical-suite-v9-hold-current', 'registry fallbackPolicy is the v9 hold-current contract');

// --- (a) hold branch: no eligible candidate -> hold_current, no preset --------
// choose()/rank()/scoreCandidate() are closure-local inside the policy IIFE, so a
// property patch on the exported policy object is bypassed. We cannot force a
// full veto from public signals either: the v9 policy gives
// Arteta_Control433_bal3 no hard veto at all (verified below). The hold branch is
// therefore exercised through the REAL closure path (rank -> choose -> hold) in a
// dedicated sandbox whose v9-identity registry stub carries `active: []`, so the
// active set is genuinely empty and choose() has no eligible candidate. Zero
// monkey patches; production code runs as-is.
const emergencyCtx = {
  scoreState: 'winning', minute: 85,
  underPressure: true, counterExitAvailable: false, counterExitBlocked: true,
  pressureRisk: 90, signals: ['under_pressure', 'sustained_siege']
};
assert.equal(P.classifySituation(emergencyCtx), 'emergency_lock', 'emergency context classifies as emergency_lock');
assert.equal(P.hardVeto('Arteta_Control433_bal3', emergencyCtx).vetoed, false, 'Arteta carries no hard veto in v9 (full veto not constructible via public signals)');
assert.equal(P.hardVeto('Simeone_LowBlock_def5', emergencyCtx).vetoed, false, 'LowBlock is allowed in emergency_lock');

// Sandbox B: real closure path to the hold branch with an empty active set.
const holdSandbox = {
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
holdSandbox.window = holdSandbox;
holdSandbox.globalThis = holdSandbox;
holdSandbox.window.SLFActivePresetRegistry = {
  suiteVersion: 'slf_tactic_suite_561_v9',
  recommendationSchema: 'slf_rule_decision_v9_tactical_suite',
  active: [],
  defaultRiskAppetite: 'standard',
  meta: {},
  evidenceAdjustment: function () { return 0; }
};
holdSandbox.window.SLFCurrentActionHintEngine = { run: function () { return null; } };
vm.createContext(holdSandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/modules/tactics-presets/tactic-preset-direction-policy.js'), 'utf8'), holdSandbox, { filename: 'policy-empty-active-sandbox.js' });
const holdEngine = holdSandbox.window.SLFCurrentActionHintEngine;
assert.ok(holdSandbox.window.SLFTacticDirectionPolicy, 'policy installs on a v9-identity registry with an empty active set');
const holdResult = holdEngine.run({});
assert.equal(holdResult.action.preset, null, 'hold: action.preset is null (no fallback preset injected)');
assert.notEqual(holdResult.action.preset, 'Arteta_Control433_bal3', 'v8-style Arteta fallback must not be injected');
assert.equal(holdResult.action.rawPreset, null, 'hold: rawPreset null');
assert.equal(holdResult.action.decision, 'hold_current');
assert.equal(holdResult.action.ruleId, 'suite_v9_hold_current');
assert.equal(holdResult.action.guardType, 'hold_current');
assert.equal(holdResult.action.fallbackReason, 'no_eligible_candidate');
assert.equal(holdResult.action.guardReason, 'no production preset fallback is allowed');
assert.equal(holdResult.action.score, 0);
assert.equal(holdResult.schema, 'slf_rule_decision_v9_tactical_suite');
assert.equal(holdResult.libraryVersion, 'slf_tactic_suite_561_v9');
assert.equal(holdResult.telemetry.recommendedPreset, null, 'hold: telemetry.recommendedPreset null');
assert.equal(holdResult.telemetry.recommendationState, 'fallback_hold', 'hold: telemetry.recommendationState fallback_hold');
assert.equal(holdResult.telemetry.libraryVersion, 'slf_tactic_suite_561_v9');
assert.equal(holdResult.action.riskAppetite, 'standard');

// Non-hold sanity (sandbox A, real bundle): normal contexts still select an active preset (no over-holding).
const normal = E.run({ gameId: 'g1', minute: 10, stats: [], myTeam: 1 }, { minute: 10 });
assert.ok(R.active.includes(normal.action.preset), `normal run selects an active preset (${normal.action.preset})`);
assert.equal(normal.action.guardType, 'suite_v9_selection', 'non-hold action keeps the v9 selection guard');
assert.equal(normal.action.ruleId, `suite_v9_${normal.situationKey}`, 'non-hold ruleId names the situation');
assert.equal(normal.telemetry.recommendedPreset, normal.action.preset, 'non-hold telemetry mirrors the selected preset');

// --- (b) unknown situation: no preset name is ever produced ------------------
assert.equal(P.preferredPreset('nonexistent_situation'), null, 'unknown situation -> null');
assert.equal(P.preferredPreset('pressure_counter'), null, 'v8-era pressure_counter no longer resolves (v8 returned the Arteta fallback literal)');
assert.equal(P.preferredPreset(''), null, 'empty situation -> null');
assert.equal(P.preferredPreset('stable_control'), 'Arteta_Control433_bal3', 'known situation still maps to its primary preset');
for (const situation of R.situations) {
  assert.ok(typeof P.preferredPreset(situation) === 'string' && R.active.includes(P.preferredPreset(situation)), `${situation} maps to an active preset`);
}

// --- (c) selectRawPreset hold paths -------------------------------------------
const stubDecision = { action: { preset: 'Compact_Counter_def3', reason: 'retired id leaked from a stale layer' } };
E.run = () => stubDecision;
const removedSnap = {};
const removed = RE.selectRawPreset(removedSnap, {});
assert.equal(removed.name, null, 'removed preset id must never be selected');
assert.equal(removed.progressionAction, 'hold_current', 'removed preset id -> hold_current progression');
assert.equal(removed.fallbackReason, 'invalid_preset', 'removed preset id -> invalid_preset fallbackReason');
// R6: canonical telemetry must never carry an invalid recommendation — only the
// diagnostic ruleDecision passthrough retains the raw (invalid) decision.
assert.equal(removedSnap.ruleDecision, stubDecision, 'invalid_preset hold: raw decision kept on the snapshot as diagnostic input');
assert.equal(removedSnap.tacticTelemetry.recommendedPreset, null, 'invalid_preset hold: retired preset id never survives into canonical telemetry');
assert.equal(removedSnap.tacticTelemetry.libraryVersion, 'slf_tactic_suite_561_v9', 'invalid_preset hold: snapshot telemetry carries the v9 library version');

E.run = () => null;
const priorDecision = { action: { preset: 'Arteta_Control433_bal3', reason: 'prior decision from an earlier tick' } };
const noDecisionSnap = { ruleDecision: priorDecision };
const noDecision = RE.selectRawPreset(noDecisionSnap, {});
assert.equal(noDecision.name, null, 'no decision -> name null');
assert.equal(noDecision.progressionAction, 'hold_current', 'no decision -> hold_current progression');
assert.equal(noDecision.fallbackReason, 'no_decision', 'no decision -> no_decision fallbackReason');
assert.equal(noDecisionSnap.ruleDecision, priorDecision, 'no_decision hold: pre-existing prior decision is retained as diagnostic input');
assert.equal(noDecisionSnap.tacticTelemetry.recommendedPreset, null, 'no_decision hold: canonical telemetry carries no recommendation');
const freshSnap = {};
RE.selectRawPreset(freshSnap, {});
assert.equal(freshSnap.ruleDecision, null, 'no_decision hold: fresh snapshot keeps ruleDecision null');
assert.equal(freshSnap.tacticTelemetry.recommendedPreset, null, 'no_decision hold: fresh snapshot telemetry carries no recommendation');

E.run = () => ({ action: { preset: 'Arteta_Control433_bal3', reason: 'ok' } });
const validSnap = {};
const valid = RE.selectRawPreset(validSnap, {});
assert.equal(valid.name, 'Arteta_Control433_bal3', 'valid active preset passes through');
assert.equal(valid.progressionAction, 'suite_v9_scored', 'valid preset keeps the v9 scored progression');
assert.equal(validSnap.tacticTelemetry.recommendedPreset, 'Arteta_Control433_bal3', 'positive control: valid path stamps the selected preset into canonical telemetry');
assert.equal(RE.__tacticSuiteV9Installed, true, 'RE v9 flag');
assert.equal(RE.__directionPolicySelectRawPresetApplied, true, 'RE selectRawPreset v9 flag');

// --- (d) mixed-stack guard: v8 registry + v9 policy must not install ----------
const guardSandbox = { console, setTimeout: () => 0, localStorage: { getItem: () => null } };
guardSandbox.window = guardSandbox;
guardSandbox.document = { readyState: 'complete' };
vm.createContext(guardSandbox);
vm.runInContext('window.SLFActivePresetRegistry = { suiteVersion: "slf_tactic_suite_561_v8", recommendationSchema: "slf_rule_decision_v8_tactical_suite", active: [], defaultRiskAppetite: "standard" };', guardSandbox);
vm.runInContext('window.SLFCurrentActionHintEngine = { run: () => null };', guardSandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/modules/tactics-presets/tactic-preset-direction-policy.js'), 'utf8'), guardSandbox, { filename: 'policy-mixed-stack-guard' });
assert.equal(guardSandbox.window.SLFTacticDirectionPolicy, undefined, 'install guard aborts: v8 registry + v9 policy leaves no policy behind');

// --- (e) toPlanRows: null preset renders hold text, never a preset id ----------
const rows = E.toPlanRows({ action: { preset: null, decision: 'hold_current', score: 0, reason: 'hold' }, candidates: [], confidence: { level: 'low' }, margin: 0 });
const holdRow = rows.find(row => row.startsWith('Рекомендация'));
assert.equal(holdRow, 'Рекомендация отсутствует — оставить текущую тактику', 'hold plan row text without preset identity');
assert.ok(!rows.some(row => row.includes('Arteta_Control433_bal3')), 'no preset id leaks into any hold plan row');
assert.ok(rows.some(row => row.startsWith('Режим: hold_current')), 'mode row reflects hold_current');

// --- (f) static source guard: no Arteta fallback literal in the policy --------
const policySource = fs.readFileSync(path.join(root, 'src/modules/tactics-presets/tactic-preset-direction-policy.js'), 'utf8');
for (const pattern of [/\|\|\s*'Arteta/, /find\([^)]*Arteta/, /\?\s*'Arteta/]) {
  assert.equal(pattern.test(policySource), false, `policy source must not contain an Arteta fallback literal (${pattern})`);
}

console.log('tactical suite v9 fallback/hold-current contract: OK');
