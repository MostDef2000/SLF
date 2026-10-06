#!/usr/bin/env node
// SLF issue #325 — Tactical Suite v9: STEP transition graph invariants.
// Regression layer for the v9 progression graph (base c5ca7de + R1).
//
// The direction policy keeps STEP module-local and only exposes shortestStep().
// This test therefore carries a static mirror of the v9 STEP graph (kept in sync
// with src/modules/tactics-presets/tactic-preset-direction-policy.js) and validates
// the live graph through shortestStep() behavior + registry.active.
//
// v9 deltas vs the v8 graph these assertions catch (RED authenticity):
//   - v8 STEP had no edges: PressCooldown->Compact442, Compact442->PressCooldown,
//     LowBlock->BoxControl, Klopp->ControlledPush; v8 TwoThreeFive ordered
//     [ControlledPush, Klopp, Conte] vs v9 [ControlledPush, Conte, Klopp].
//   - v8 shortestStep('Pep_PressCooldown_bal2','Simeone_Compact442_def4') would return
//     'Pep_BoxControl_bal2' (first hop of the 3-hop path), not the target.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal sandbox: the policy install guard needs registry + engine; the
// RecommendationEngine stub lets the policy install selectRawPreset and wrap
// applyProgressionGuard (both asserted below).
const sandbox = {
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
// The policy install guard requires a registry AND an engine; the stub engine
// stands in for SLFCurrentActionHintEngine (run() is replaced per-scenario below).
sandbox.window.SLFCurrentActionHintEngine = { schema: 'slf_rule_decision_v9_tactical_suite', run: () => null };
sandbox.RecommendationEngine = {
  getPresetLadder() { return []; },
  applyProgressionGuard(candidate) { return candidate; }
};
vm.createContext(sandbox);

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'), sandbox, { filename: 'active-preset-registry.js' });
vm.runInContext(read('src/modules/tactics-presets/tactic-preset-direction-policy.js'), sandbox, { filename: 'tactic-preset-direction-policy.js' });

const R = sandbox.window.SLFActivePresetRegistry;
const P = sandbox.window.SLFTacticDirectionPolicy;
const E = sandbox.window.SLFCurrentActionHintEngine;
const RE = sandbox.RecommendationEngine;
assert.ok(R && P && E, 'registry and policy installed in the v9 sandbox');
assert.equal(R.suiteVersion, 'slf_tactic_suite_561_v9');
assert.equal(P.version, '5.61-tactical-suite-v9.0');
assert.deepEqual([...P.activePresets], [...R.active], 'policy active set mirrors the registry');

const active = R.active;
const removed = new Set(R.removed);
const retired = new Set(R.retiredActive);

// --- Static mirror of the v9 STEP graph (module-local in the policy) -----------
const STEP = {
  Arteta_Control433_bal3: ['Pep_BoxControl_bal2', 'Pep_ControlledPush_att3', 'Conte_WingbackWidth_bal4', 'Simeone_Compact442_def4'],
  Pep_BoxControl_bal2: ['Arteta_Control433_bal3', 'Pep_PressCooldown_bal2'],
  Pep_PressCooldown_bal2: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Simeone_Compact442_def4'],
  Pep_ControlledPush_att3: ['Arteta_Control433_bal3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4'],
  Pep_TwoThreeFive_att3: ['Pep_ControlledPush_att3', 'Conte_WingbackWidth_bal4', 'Klopp_Gegenpress_att4'],
  Conte_WingbackWidth_bal4: ['Arteta_Control433_bal3', 'Pep_ControlledPush_att3', 'Pep_TwoThreeFive_att3'],
  Simeone_Compact442_def4: ['Arteta_Control433_bal3', 'Simeone_LowBlock_def5', 'Pep_PressCooldown_bal2'],
  Simeone_LowBlock_def5: ['Simeone_Compact442_def4', 'Pep_BoxControl_bal2'],
  Klopp_Gegenpress_att4: ['Pep_TwoThreeFive_att3', 'Pep_ControlledPush_att3', 'Bielsa_ChaosPress_att5'],
  Bielsa_ChaosPress_att5: ['Klopp_Gegenpress_att4']
};

// Every active preset is a STEP node and nothing else is.
assert.deepEqual(Object.keys(STEP).sort(), [...active].sort(), 'STEP node set equals the 10 active presets');
for (const [from, targets] of Object.entries(STEP)) {
  for (const to of targets) {
    assert.ok(active.includes(to), `edge ${from} -> ${to} targets an active preset`);
    assert.ok(!removed.has(to), `edge ${from} -> ${to} must not target a removed/retired preset`);
    assert.ok(!retired.has(to), `edge ${from} -> ${to} must not target a retired preset`);
    assert.ok(!removed.has(from), `STEP node ${from} must not be removed/retired`);
  }
}
assert.ok(!STEP.Simeone_LowBlock_def5.includes('Bielsa_ChaosPress_att5'), 'no LowBlock -> ChaosPress edge (emergency lock must not chain straight into final all-in)');

// Undirected connectivity: BFS from Arteta reaches all 10 active presets.
const undirected = new Map(active.map(name => [name, new Set()]));
for (const [from, targets] of Object.entries(STEP)) {
  for (const to of targets) { undirected.get(from).add(to); undirected.get(to).add(from); }
}
let reached = new Set(['Arteta_Control433_bal3']);
let queue = ['Arteta_Control433_bal3'];
while (queue.length) {
  const node = queue.pop();
  for (const next of undirected.get(node)) {
    if (!reached.has(next)) { reached.add(next); queue.push(next); }
  }
}
assert.equal(reached.size, active.length, 'undirected graph connected: BFS from Arteta reaches all 10');

// Directed reachability mirror (used to scope the non-adjacent checks below).
function mirrorReachable(from, to) {
  if (from === to) return true;
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const node = q.pop();
    for (const next of STEP[node] || []) {
      if (seen.has(next)) continue;
      if (next === to) return true;
      seen.add(next);
      q.push(next);
    }
  }
  return false;
}

// Family sanity per registry.meta group: BFS restricted to edges whose endpoints
// share the start's meta group must reach every member of that group.
const groupOf = name => R.meta[name]?.group;
for (const group of ['balance', 'attack', 'defensive']) {
  const members = active.filter(name => groupOf(name) === group);
  assert.ok(members.length >= 2, `group ${group} has members`);
  for (const start of members) {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const node = q.pop();
      for (const next of STEP[node] || []) {
        if (seen.has(next)) continue;
        if (groupOf(next) !== groupOf(node) || groupOf(node) !== group) continue;
        seen.add(next);
        q.push(next);
      }
    }
    for (const member of members) {
      assert.ok(seen.has(member), `group ${group}: BFS from ${start} restricted to intra-group edges reaches ${member}`);
    }
  }
}

// --- Live graph validation through P.shortestStep -----------------------------
// Adjacency: for every mirrored edge u->v, shortestStep(u, v) === v (direct edge).
for (const [from, targets] of Object.entries(STEP)) {
  for (const to of targets) {
    assert.equal(P.shortestStep(from, to), to, `live graph has the v9 edge ${from} -> ${to}`);
  }
}
// Non-adjacent reachable pairs: shortestStep must not jump straight to the target
// (would mean an extra direct edge in the live graph) and its first hop must be a
// real edge of the mirrored graph.
for (const from of active) {
  for (const to of active) {
    if (from === to) continue;
    if (STEP[from].includes(to)) continue;
    if (!mirrorReachable(from, to)) continue;
    const hop = P.shortestStep(from, to);
    assert.notEqual(hop, to, `no live extra edge ${from} -> ${to} (first hop differs)`);
    assert.ok(STEP[from].includes(hop), `live first hop ${from} -> ${hop} is a mirrored edge`);
  }
}
// shortestStep between any two active presets returns an active preset (or the
// target itself) — never a removed/retired id.
for (const from of active) {
  for (const to of active) {
    const result = P.shortestStep(from, to);
    assert.ok(active.includes(result), `shortestStep(${from}, ${to}) = ${result} stays in the active set`);
    assert.ok(!removed.has(result), `shortestStep(${from}, ${to}) never yields a removed id`);
  }
}
// Dynamic connectivity: walking repeated shortestStep hops from Arteta lands on
// every active preset within a bounded number of hops.
for (const target of active) {
  if (target === 'Arteta_Control433_bal3') continue;
  let current = 'Arteta_Control433_bal3';
  let hops = 0;
  while (current !== target && hops < 15) {
    const next = P.shortestStep(current, target);
    assert.notEqual(next, current, `no progress from ${current} toward ${target}`);
    current = next;
    hops += 1;
  }
  assert.equal(current, target, `Arteta reaches ${target} in ${hops} hops`);
}

// --- Progression guard: removed ids pass through, selectRawPreset never emits --
const removedCandidate = { name: 'Compact_Counter_def3', reason: 'retired id must pass through unguarded' };
const guarded = RE.applyProgressionGuard(removedCandidate, { gameId: 'g', status: 'live', ruleDecision: { action: { preset: 'Arteta_Control433_bal3' }, telemetry: {} } }, {});
assert.equal(guarded, removedCandidate, 'applyProgressionGuard passthrough: non-active candidate returned unchanged (documented)');
assert.equal(guarded.name, 'Compact_Counter_def3');

// ...but the selection boundary must never emit it.
E.run = () => ({ action: { preset: 'Compact_Counter_def3', reason: 'stale' } });
const selected = RE.selectRawPreset({}, {});
assert.equal(selected.name, null, 'selectRawPreset never emits a removed preset');
assert.equal(selected.fallbackReason, 'invalid_preset');

console.log('tactical suite v9 transition graph invariants: OK');
