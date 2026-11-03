#!/usr/bin/env node
// SLF specs/381 — Tactical Knowledge Pack hints.
// ============================================================
// Regression layer for the tactical knowledge pack wiring (loader + registry
// seed priors + direction-policy seam + UI provenance). Real modules loaded in
// bundle order inside a vm realm (same harness style as
// tools/test-tactical-decision-linkage.mjs): Map-backed localStorage, a
// GM_xmlhttpRequest stub that captures the anonymous request, and the REAL
// 3-rule seed pack as fixture. No mocks of the code under test.
//
// Covered behavior (every assertion fails if the wiring is reverted):
//   1. LOADER — exact PACK_URL, anonymous GET with NO Authorization header,
//      non-2xx/timeout/onerror keep previous state, valid response atomically
//      replaces state, malformed JSON / one bad rule cannot poison state
//      (fail-closed), fresh cache -> no fetch, expired cache -> get() null +
//      refetch, storage getItem/setItem exceptions tolerated, missing
//      GM_xmlhttpRequest -> stays null, empty rules array is VALID (withdrawal),
//      safeRules ignored for scoring, strict numerics (string/null my_bad
//      bounds rejected, minute_min finite number, score_state enum, pressure
//      literal only, duplicate rule ids rejected, unknown when-keys rejected).
//   2. ASSESSMENT — each of the 3 real seed rules matches its intended context
//      and adds +3 to ITS preset only (cross-preset isolation), legacy alias
//      preset names resolve, minute boundary (>= matches, below doesn't),
//      myBad 0/missing/numeric-string do NOT match, scoreState 'unknown' never
//      matches, pressure requires underPressure===true, multiple matching rules
//      -> still +3 (non-stacking) with sorted ruleIds, clamp bounds,
//      evidenceAdjustment() with no args -> 0, unknown/retired preset -> 0,
//      no pack -> 0.
//   3. POLICY INTEGRATION — through the real direction-policy scoreCandidate/
//      rank: +3 appears in the candidate score and parts.boundedEvidenceAdjust-
//      ment; vetoed presets stay -999 (the pack must not resurrect them);
//      zero-prior candidates stay ineligible; hold-current eligibility is
//      unchanged by the pack (differential with/without pack).
//   4. UI PROVENANCE — through the real compact renderer: a matched seed renders
//      «База: seed (гипотеза)», no match renders «База: нет совпавших данных»,
//      the line attributes the DISPLAYED preset (finalTactic.presetId when
//      base!=='current_tactic'), and the output is HTML-escaped.
//   5. NO AUTO-REFRESH — completing a fetch between decision and render does not
//      change the already-rendered provenance (the render uses the same
//      decision's data, not a live re-evaluation).
//   6. DIVERGUARD — the decision-time seam scores the NORMALIZED context while
//      the UI provenance reads decision.moment.context (the RAW engine
//      decisionSignals). A context carrying an 'opponent_high_press'-style
//      signal makes the normalized underPressure=true while the raw
//      underPressure stays false. The provenance MUST follow the decision's own
//      parts.boundedEvidenceAdjustment (same-decision data) — never a raw
//      re-evaluation that would show the none-variant while +3 was applied.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

const LOADER_REL = 'src/modules/strategy-data-recommendations/tactical-knowledge-pack.js';
const REGISTRY_REL = 'src/modules/tactics-presets/active-preset-registry.js';
const POLICY_REL = 'src/modules/tactics-presets/tactic-preset-direction-policy.js';
const UI_EXT_REL = 'src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js';
const CACHE_KEY = 'slf:tactics:knowledge-pack:v1';
const PACK_URL = 'https://slf-api.mostdef.ru/slf_ai/tactics/knowledge-pack.latest.json';

// ---------------------------------------------------------------------------
// Pack fixture: the real 3-rule seed pack (external data file, inline fallback
// with the identical rules if the path is unavailable in the sandbox).
// ---------------------------------------------------------------------------
const PACK_FILE = path.resolve(root, '..', 'data', 'tactics_knowledge-pack.latest.json');
function loadPackFixture() {
  try {
    return JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  } catch (_) {
    return {
      schema: 'slf_tactical_knowledge_pack_v1',
      version: '2026-11-03T08:42:51.908442+00:00',
      rules: [
        { id: 'case_losing_after_55_low_bad_press', when: { score_state: 'losing', minute_min: 55, my_bad_max: 16 }, recommendation: { preset: 'Klopp_Gegenpress_att4', reason: 'Проигрываем после 55-й и брак низкий — можно аккуратно поднять давление.' }, confidence: 'seed_rule' },
        { id: 'case_losing_after_55_high_bad_controlled_push', when: { score_state: 'losing', minute_min: 55, my_bad_min: 20 }, recommendation: { preset: 'Pep_ControlledPush_att3', reason: 'Проигрываем, но брак высокий — усиливать атаку контролируемо, без хаоса.' }, confidence: 'seed_rule' },
        { id: 'case_winning_after_70_under_pressure_compact', when: { score_state: 'winning', minute_min: 70, pressure: 'opponent_advantage_xg_or_xt' }, recommendation: { preset: 'Simeone_Compact442_def4', reason: 'Ведём поздно, соперник давит — компактнее закрыть переходы.' }, confidence: 'seed_rule' }
      ]
    };
  }
}
const PACK = loadPackFixture();
assert.equal(PACK.schema, 'slf_tactical_knowledge_pack_v1', 'fixture is the v1 pack');
assert.equal(PACK.rules.length, 3, 'fixture carries the 3 real seed rules');

// ---------------------------------------------------------------------------
// Map-backed localStorage (same contract as the decision-linkage harness).
// ---------------------------------------------------------------------------
function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

// ---------------------------------------------------------------------------
// Loader harness: a fresh vm realm per scenario. The loader module is a
// singleton that runs init() at load; a GM_xmlhttpRequest stub captures the
// anonymous request so the test can drive onload/onerror/ontimeout by hand.
// ---------------------------------------------------------------------------
function loadPackModule({ storage = {}, gm = true, packJson = null } = {}) {
  const gmCalls = [];
  const context = {
    console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean,
    setTimeout() { return 1; }, clearTimeout() {},
    localStorage: createStorage(storage),
    GM_xmlhttpRequest: gm ? (opts => gmCalls.push(opts)) : undefined,
    window: {}
  };
  context.globalThis = context;
  vm.createContext(context);
  const hasLoader = fs.existsSync(path.join(root, LOADER_REL));
  if (hasLoader) {
    vm.runInContext(read(LOADER_REL) + '\n;globalThis.__pack = TacticalKnowledgePack;', context, { filename: 'tactical-knowledge-pack.js' });
  }
  const pack = hasLoader ? context.__pack : null;
  // Drive a fetch completion when a pack was requested and one is supplied.
  if (pack && packJson !== null && gmCalls.length) {
    gmCalls[0].onload({ status: 200, responseText: typeof packJson === 'string' ? packJson : JSON.stringify(packJson) });
  }
  return { context, gmCalls, pack, hasLoader };
}

// Per-section failure collection: in the working tree every section passes; at
// the base commit the whole feature is absent, so several sections fail. Collect
// them all (instead of stopping at the first) so the RED run shows the
// behavioral failures (expected +3 observed 0; provenance line absent; ...).
const sectionFailures = [];
function runSection(name, fn) {
  try {
    fn();
    console.log(`[knowledge-pack] ${name}: OK`);
  } catch (err) {
    sectionFailures.push({ name, err });
    console.log(`[knowledge-pack] ${name}: FAIL — ${err.message}`);
  }
}

// ===========================================================================
// 1. LOADER
// ===========================================================================
runSection('1. LOADER', () => {
  assert.ok(fs.existsSync(path.join(root, LOADER_REL)), 'loader module present in the working tree');

  // (a) Exact PACK_URL, anonymous GET, NO Authorization header.
  {
    const { gmCalls, pack } = loadPackModule({});
    assert.equal(pack.get(), null, 'no cache + no response yet -> get() null');
    assert.equal(gmCalls.length, 1, 'exactly one anonymous GET on a cold start');
    const req = gmCalls[0];
    assert.equal(req.method, 'GET', 'request method is GET');
    assert.equal(req.url, PACK_URL, 'request targets the exact PACK_URL');
    assert.equal(req.anonymous, true, 'request is anonymous');
    assert.ok(!req.headers || !('Authorization' in req.headers), 'request carries NO Authorization header');
    assert.ok(!('Authorization' in req), 'request object has no Authorization field');
  }

  // (b) Valid response atomically replaces state.
  {
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(PACK) });
    const got = pack.get();
    assert.ok(got, 'valid 200 response -> get() returns the pack');
    assert.equal(got.rules.length, 3, 'the 3 seed rules are adopted');
    assert.equal(got.version, PACK.version, 'pack version preserved');
  }

  // (c) non-2xx / timeout / onerror keep previous state (null here).
  for (const [label, drive] of [
    ['non-2xx', r => r.onload({ status: 500, responseText: JSON.stringify(PACK) })],
    ['timeout', r => r.ontimeout && r.ontimeout()],
    ['onerror', r => r.onerror && r.onerror(new Error('net'))]
  ]) {
    const { gmCalls, pack } = loadPackModule({});
    drive(gmCalls[0]);
    assert.equal(pack.get(), null, `${label} keeps previous state (null)`);
  }

  // (d) malformed JSON cannot poison state.
  {
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: '{not json' });
    assert.equal(pack.get(), null, 'malformed JSON -> state stays null');
  }

  // (e) one bad rule rejects the WHOLE pack (fail-closed).
  {
    const bad = clone(PACK);
    bad.rules[1].confidence = 'not_a_seed'; // one malformed rule
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(bad) });
    assert.equal(pack.get(), null, 'one bad rule rejects the whole pack');
  }

  // (f) a previously valid state is not discarded by a later bad response.
  {
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(PACK) });
    assert.ok(pack.get(), 'valid state adopted');
    pack.handleResponse({ status: 500, responseText: 'x' });
    pack.handleResponse({ status: 200, responseText: '{bad' });
    assert.ok(pack.get(), 'a bad response does not discard the valid in-memory state');
    assert.equal(pack.get().rules.length, 3, 'the valid pack is still served');
  }

  // (g) fresh (unexpired) cache -> no fetch, state served from cache.
  {
    const envelope = { fetchedAt: Date.now() - 1000, pack: PACK };
    const { gmCalls, pack } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify(envelope) } });
    assert.equal(gmCalls.length, 0, 'fresh cache -> no fetch');
    assert.ok(pack.get(), 'fresh cache -> get() serves the cached pack');
    assert.equal(pack.get().rules.length, 3, 'cached pack rules intact');
  }

  // (h) expired cache -> get() null AND a refetch is triggered.
  {
    const envelope = { fetchedAt: Date.now() - (24 * 60 * 60 * 1000 + 5000), pack: PACK };
    const { gmCalls, pack } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify(envelope) } });
    assert.equal(pack.get(), null, 'expired cache must not score (get() null)');
    assert.equal(gmCalls.length, 1, 'expired cache triggers a refetch');
  }

  // (i) storage getItem/setItem exceptions are tolerated.
  {
    const { pack } = loadPackModule({ storage: { getItem() { throw new Error('read boom'); }, setItem() {} } });
    assert.equal(pack.get(), null, 'getItem exception tolerated (stays null, no crash)');
  }
  {
    const { gmCalls, pack } = loadPackModule({ storage: { getItem() { return null; }, setItem() { throw new Error('write boom'); } } });
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(PACK) });
    assert.ok(pack.get(), 'setItem exception tolerated: valid in-memory state is kept');
    assert.equal(pack.get().rules.length, 3, 'in-memory pack survives a cache-write failure');
  }

  // (j) missing GM_xmlhttpRequest -> stays null, no crash.
  {
    const { gmCalls, pack } = loadPackModule({ gm: false });
    assert.equal(gmCalls.length, 0, 'no GM capability -> no request');
    assert.equal(pack.get(), null, 'missing GM_xmlhttpRequest -> pack stays null');
  }

  // (k) empty rules array is VALID (withdrawal mechanism).
  {
    const empty = { schema: 'slf_tactical_knowledge_pack_v1', version: 'withdrawn', rules: [] };
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(empty) });
    const got = pack.get();
    assert.ok(got, 'empty rules array is a valid pack');
    assert.deepEqual(clone(got.rules), [], 'withdrawal -> get() returns the pack with rules:[]');
  }

  // (l) safeRules (generatorContext) is diagnostic-only and NOT scoring input.
  {
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(PACK) });
    const got = pack.get();
    assert.equal(got.rules.length, 3, 'only the 3 seed rules are exposed for scoring');
    assert.ok(!('generatorContext' in got), 'generatorContext.safeRules is stripped from the scoring pack');
    assert.ok(!('safeRules' in got), 'no safeRules on the scoring pack');
  }

  // (m) strict numerics + enum + literal + duplicate ids + unknown when-keys.
  const reject = (mutate, label) => {
    const p = clone(PACK);
    mutate(p);
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(p) });
    assert.equal(pack.get(), null, `${label} -> pack rejected`);
  };
  reject(p => { p.rules[0].when.my_bad_max = '16'; }, 'my_bad_max as a numeric string');
  reject(p => { p.rules[0].when.my_bad_max = null; }, 'my_bad_max as null');
  reject(p => { p.rules[1].when.my_bad_min = '20'; }, 'my_bad_min as a numeric string');
  reject(p => { p.rules[0].when.minute_min = '55'; }, 'minute_min as a numeric string');
  reject(p => { p.rules[0].when.minute_min = NaN; }, 'minute_min as NaN');
  reject(p => { p.rules[0].when.score_state = 'unknown'; }, 'score_state outside the enum');
  reject(p => { p.rules[2].when.pressure = 'some_other_literal'; }, 'pressure literal mismatch');
  reject(p => { p.rules[1].id = p.rules[0].id; }, 'duplicate rule id');
  reject(p => { p.rules[0].when.some_unknown_key = 1; }, 'unknown when-key');
  reject(p => { p.rules[0].when.my_bad_min = 20; p.rules[0].when.my_bad_max = 10; }, 'my_bad_min > my_bad_max');
  // Positive controls: the enum and the literal accept their valid forms.
  {
    const ok = clone(PACK);
    ok.rules[0].when.score_state = 'draw'; // valid enum member
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(ok) });
    assert.ok(pack.get(), 'score_state enum accepts a valid member');
  }

  // (n) future-dated cache entry is rejected (cannot bypass the TTL / score).
  {
    const envelope = { fetchedAt: Date.now() + 60 * 60 * 1000, pack: PACK };
    const { gmCalls, pack } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify(envelope) } });
    assert.equal(pack.get(), null, 'future-dated cache entry is rejected (poisoned future entry cannot score)');
    assert.equal(gmCalls.length, 1, 'a rejected future-dated cache triggers a refetch');
  }

  // (o) future-dated in-memory state must not score.
  {
    const { gmCalls, pack } = loadPackModule({});
    gmCalls[0].onload({ status: 200, responseText: JSON.stringify(PACK) });
    assert.ok(pack.get(), 'valid state adopted before the future-dating');
    pack.state.fetchedAt = Date.now() + 60 * 60 * 1000;
    assert.equal(pack.get(), null, 'future-dated in-memory state -> get() null');
  }

  // (p) within the 60s clock-skew tolerance, a slightly-future fetchedAt still scores.
  {
    const envelope = { fetchedAt: Date.now() + 30 * 1000, pack: PACK };
    const { pack } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify(envelope) } });
    assert.ok(pack.get(), 'within-skew future (30s) still scores (tolerance works)');
    assert.equal(pack.get().rules.length, 3, 'within-skew future cache serves the pack');
  }

  // (q) TTL boundary: exactly TTL old -> expired (>= boundary); just under -> scores.
  {
    const TTL = 24 * 60 * 60 * 1000;
    const { pack: pBoundary } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify({ fetchedAt: Date.now() - TTL, pack: PACK }) } });
    assert.equal(pBoundary.get(), null, 'fetchedAt exactly TTL old -> get() null (>= boundary)');
    const { pack: pUnder } = loadPackModule({ storage: { [CACHE_KEY]: JSON.stringify({ fetchedAt: Date.now() - TTL + 1000, pack: PACK }) } });
    assert.ok(pUnder.get(), 'fetchedAt just under TTL -> scores');
  }
});

// ===========================================================================
// Assessment + policy harness: loader + real registry + real direction policy
// in one realm (the registry reads the TacticalKnowledgePack global).
// ===========================================================================
function createAssessmentHarness({ packJson = PACK, gm = true, storage = {} } = {}) {
  const { context, gmCalls, pack } = loadPackModule({ gm, storage, packJson });
  context.window.SLFCurrentActionHintEngine = { schema: 'slf_rule_decision_v11_tactical_suite', run: () => ({}) };
  vm.runInContext(read(REGISTRY_REL), context, { filename: 'active-preset-registry.js' });
  vm.runInContext(read(POLICY_REL), context, { filename: 'tactic-preset-direction-policy.js' });
  return { context, gmCalls, pack, registry: context.window.SLFActivePresetRegistry, policy: context.window.SLFTacticDirectionPolicy };
}

// Assessment results are built in the vm realm; JSON-clone them into the host
// realm so deepStrictEqual compares values, not realm prototypes (same trick as
// the decision-linkage harness).
const assess = (registry, args) => clone(registry.knowledgeAssessment(args));

// ===========================================================================
// 2. ASSESSMENT (through the REAL registry, REAL pack)
// ===========================================================================
runSection('2. ASSESSMENT', () => {
  const { registry } = createAssessmentHarness({});
  assert.equal(typeof registry.knowledgeAssessment, 'function', 'registry exposes knowledgeAssessment');
  assert.equal(typeof registry.evidenceAdjustment, 'function', 'registry exposes evidenceAdjustment');

  // Rule 1 -> Klopp (alias Klopp_Gegenpress_att4). +3 to ITS preset only.
  const r1ctx = { scoreState: 'losing', minute: 60, myBad: 10 };
  let a = assess(registry, { preset: 'Klopp_LateGegenpress_v11', situation: 'late_high_pressure', context: r1ctx });
  assert.equal(a.delta, 3, 'rule 1 adds +3 to Klopp');
  assert.equal(a.source, 'seed', 'rule 1 source is seed');
  assert.deepEqual(a.ruleIds, ['case_losing_after_55_low_bad_press'], 'rule 1 provenance id');
  assert.equal(a.packVersion, PACK.version, 'assessment carries the pack version');
  a = registry.knowledgeAssessment({ preset: 'Guardiola_ControlledPush_v11', situation: 'late_high_pressure', context: r1ctx });
  assert.equal(a.delta, 0, 'cross-preset isolation: ControlledPush gets 0 for rule 1');
  assert.equal(a.source, 'none', 'cross-preset isolation: source none');

  // Rule 2 -> ControlledPush (alias Pep_ControlledPush_att3).
  const r2ctx = { scoreState: 'losing', minute: 60, myBad: 25 };
  a = assess(registry, { preset: 'Guardiola_ControlledPush_v11', situation: 'controlled_chase', context: r2ctx });
  assert.equal(a.delta, 3, 'rule 2 adds +3 to ControlledPush');
  assert.deepEqual(a.ruleIds, ['case_losing_after_55_high_bad_controlled_push'], 'rule 2 provenance id');
  a = registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', situation: 'late_high_pressure', context: r2ctx });
  assert.equal(a.delta, 0, 'cross-preset isolation: Klopp gets 0 for rule 2 (myBad 25 > 16)');

  // Rule 3 -> Simeone (alias Simeone_Compact442_def4).
  const r3ctx = { scoreState: 'winning', minute: 75, underPressure: true };
  a = assess(registry, { preset: 'Simeone_CompactLead_v11', situation: 'protect_lead', context: r3ctx });
  assert.equal(a.delta, 3, 'rule 3 adds +3 to Simeone');
  assert.deepEqual(a.ruleIds, ['case_winning_after_70_under_pressure_compact'], 'rule 3 provenance id');
  a = registry.knowledgeAssessment({ preset: 'Emery_BalancedBase_v11', situation: 'protect_lead', context: r3ctx });
  assert.equal(a.delta, 0, 'cross-preset isolation: Emery gets 0 for rule 3');

  // Legacy alias preset names resolve to the active preset.
  a = registry.knowledgeAssessment({ preset: 'Klopp_Gegenpress_att4', situation: 'late_high_pressure', context: r1ctx });
  assert.equal(a.delta, 3, 'legacy alias Klopp_Gegenpress_att4 resolves and matches');
  a = registry.knowledgeAssessment({ preset: 'Simeone_Compact442_def4', situation: 'protect_lead', context: r3ctx });
  assert.equal(a.delta, 3, 'legacy alias Simeone_Compact442_def4 resolves and matches');

  // Minute boundary: >= matches, below doesn't.
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 55, myBad: 10 } }).delta, 3, 'minute 55 (== minute_min) matches');
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 54, myBad: 10 } }).delta, 0, 'minute 54 (< minute_min) does not match');

  // myBad 0 / missing / numeric-string do NOT match (missing is not 0%).
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 60, myBad: 0 } }).delta, 0, 'myBad 0 does not match');
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 60 } }).delta, 0, 'missing myBad does not match');
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 60, myBad: '10' } }).delta, 0, 'numeric-string myBad does not match');

  // scoreState 'unknown' never matches.
  assert.equal(registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'unknown', minute: 60, myBad: 10 } }).delta, 0, "scoreState 'unknown' never matches");

  // pressure requires underPressure === true.
  assert.equal(registry.knowledgeAssessment({ preset: 'Simeone_CompactLead_v11', context: { scoreState: 'winning', minute: 75, underPressure: false } }).delta, 0, 'underPressure false -> no pressure match');
  assert.equal(registry.knowledgeAssessment({ preset: 'Simeone_CompactLead_v11', context: { scoreState: 'winning', minute: 75 } }).delta, 0, 'missing underPressure -> no pressure match');

  // Multiple matching rules -> still +3 (non-stacking) with sorted ruleIds.
  {
    const multi = {
      schema: 'slf_tactical_knowledge_pack_v1', version: 'multi',
      rules: [
        { id: 'rule_b', when: { score_state: 'losing', minute_min: 50 }, recommendation: { preset: 'Klopp_Gegenpress_att4' }, confidence: 'seed_rule' },
        { id: 'rule_a', when: { score_state: 'losing', minute_min: 40 }, recommendation: { preset: 'Klopp_Gegenpress_att4' }, confidence: 'seed_rule' }
      ]
    };
    const h = createAssessmentHarness({ packJson: multi });
    const m = assess(h.registry, { preset: 'Klopp_LateGegenpress_v11', context: { scoreState: 'losing', minute: 60 } });
    assert.equal(m.delta, 3, 'multiple matching rules do NOT stack (still +3)');
    assert.deepEqual(m.ruleIds, ['rule_a', 'rule_b'], 'matched ruleIds are sorted');
  }

  // Clamp bounds: the seed delta is bounded to ±5.
  a = registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: r1ctx });
  assert.ok(a.delta >= -5 && a.delta <= 5, 'seed delta is within the ±5 clamp');
  assert.equal(a.delta, 3, 'seed delta is exactly +3');

  // evidenceAdjustment() with no args -> 0.
  assert.equal(registry.evidenceAdjustment(), 0, 'evidenceAdjustment() with no args -> 0');
  assert.equal(registry.evidenceAdjustment({}), 0, 'evidenceAdjustment({}) -> 0');

  // unknown / retired preset -> 0.
  assert.equal(registry.knowledgeAssessment({ preset: 'Compact_Counter_def3', context: r1ctx }).delta, 0, 'retired preset -> 0');
  assert.equal(registry.knowledgeAssessment({ preset: 'Ghost_Removed_v11', context: r1ctx }).delta, 0, 'unknown preset -> 0');

  // no pack -> 0.
  {
    const h = createAssessmentHarness({ gm: false });
    assert.equal(h.pack.get(), null, 'no pack loaded');
    assert.equal(h.registry.knowledgeAssessment({ preset: 'Klopp_LateGegenpress_v11', context: r1ctx }).delta, 0, 'no pack -> 0');
    assert.equal(h.registry.evidenceAdjustment({ preset: 'Klopp_LateGegenpress_v11', context: r1ctx }), 0, 'no pack -> evidenceAdjustment 0');
  }
});

// ===========================================================================
// 3. POLICY INTEGRATION (real direction-policy scoreCandidate / rank)
// ===========================================================================
runSection('3. POLICY INTEGRATION', () => {
  const { policy, registry } = createAssessmentHarness({});

  // A context that classifies as late_high_pressure and matches rule 1 (Klopp).
  const kloppCtx = {
    scoreState: 'losing', minute: 75, myBad: 10, attackNeed: 75, lowBadActions: true,
    underPressure: false, signals: [], myPowerDropPct: 0, highBadActions: false,
    ownRedCard: false, transitionThreat: false, pressFatigueRisk: false
  };
  assert.equal(policy.classifySituation(kloppCtx), 'late_high_pressure', 'kloppCtx classifies as late_high_pressure');

  // +3 appears in the candidate score and parts.boundedEvidenceAdjustment.
  const klopp = policy.scoreCandidate('Klopp_LateGegenpress_v11', kloppCtx);
  assert.equal(klopp.vetoed, false, 'Klopp is not vetoed in late_high_pressure');
  assert.equal(klopp.parts.boundedEvidenceAdjustment, 3, '+3 in parts.boundedEvidenceAdjustment');
  assert.equal(klopp.parts.rulePrior, 80, 'Klopp rulePrior 80');
  assert.equal(klopp.score, 83, 'Klopp score = 80 + 3');
  const ranked = policy.rank(kloppCtx);
  assert.equal(ranked.eligible[0].preset, 'Klopp_LateGegenpress_v11', 'Klopp tops the ranking');
  assert.equal(ranked.eligible[0].score, 83, 'ranked Klopp score carries the +3');

  // Vetoed presets stay -999 (the pack must not resurrect them).
  // Simeone matches rule 3 (winning, minute>=70, pressure) but is dribble-vetoed
  // in lead_press_hold -> the +3 must not lift it off -999.
  const simeoneCtx = { scoreState: 'winning', minute: 75, underPressure: true, scoreDiff: 1, opponentPressVector: 25, myBad: 5, signals: [] };
  assert.equal(policy.classifySituation(simeoneCtx), 'lead_press_hold', 'simeoneCtx classifies as lead_press_hold');
  // Sanity: the seed WOULD match Simeone on the normalized context.
  assert.equal(registry.knowledgeAssessment({ preset: 'Simeone_CompactLead_v11', context: policy.deriveSuiteContext(simeoneCtx) }).delta, 3, 'seed matches Simeone on the normalized context');
  const simeone = policy.scoreCandidate('Simeone_CompactLead_v11', simeoneCtx);
  assert.equal(simeone.vetoed, true, 'Simeone is vetoed (dribble guard) in lead_press_hold');
  assert.equal(simeone.score, -999, 'vetoed Simeone stays -999 despite a matching seed');
  assert.equal(simeone.parts.boundedEvidenceAdjustment, 0, 'vetoed candidate carries no evidence adjustment');

  // Zero-prior candidates stay ineligible even with a matching seed.
  {
    const zeroPrior = {
      schema: 'slf_tactical_knowledge_pack_v1', version: 'zero-prior',
      rules: [
        { id: 'zp_emery', when: { score_state: 'losing', minute_min: 50 }, recommendation: { preset: 'Emery_BalancedBase_v11' }, confidence: 'seed_rule' }
      ]
    };
    const h = createAssessmentHarness({ packJson: zeroPrior });
    const r = h.policy.rank(kloppCtx);
    const emery = r.all.find(item => item.preset === 'Emery_BalancedBase_v11');
    assert.equal(emery.parts.rulePrior, 0, 'Emery has zero rulePrior in late_high_pressure');
    assert.equal(emery.parts.boundedEvidenceAdjustment, 3, 'the seed still adds +3 to Emery score');
    assert.ok(!r.eligible.some(item => item.preset === 'Emery_BalancedBase_v11'), 'zero-prior Emery stays ineligible despite the +3');
  }

  // hold-current unchanged: the pack changes scores, never eligibility.
  {
    const withPack = createAssessmentHarness({}).policy.rank(kloppCtx);
    const noPack = createAssessmentHarness({ gm: false }).policy.rank(kloppCtx);
    const setA = clone(withPack.eligible.map(item => item.preset).sort());
    const setB = clone(noPack.eligible.map(item => item.preset).sort());
    assert.deepEqual(setA, setB, 'eligible preset set is identical with/without the pack');
    const kloppWith = withPack.eligible.find(item => item.preset === 'Klopp_LateGegenpress_v11').score;
    const kloppNo = noPack.eligible.find(item => item.preset === 'Klopp_LateGegenpress_v11').score;
    assert.equal(kloppWith - kloppNo, 3, 'the only score delta is the +3 seed prior on Klopp');
  }
});

// ===========================================================================
// UI harness: loader + RecommendationEngine facade + re-* modules + registry +
// policy + the real UI extension (compact renderer).
// ===========================================================================
function createUiHarness({ packJson = PACK, gm = true } = {}) {
  const { context, gmCalls, pack } = loadPackModule({ gm, packJson });
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
    run: function (snapshot, ctx = {}) {
      return {
        schema: 'slf_rule_decision_v11_tactical_suite',
        moment: { context: ctx, gameId: 'g', minute: Number(ctx?.minute || 0) },
        action: { preset: null, decision: 'stub', score: 0, reason: 'stub' },
        confidence: { level: 'low', gap: 0 },
        margin: 0,
        candidates: [],
        telemetry: {}
      };
    }
  };
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
  vm.runInContext(read(REGISTRY_REL), context, { filename: 'active-preset-registry.js' });
  vm.runInContext(read(POLICY_REL), context, { filename: 'tactic-preset-direction-policy.js' });
  vm.runInContext(read(UI_EXT_REL), context, { filename: 'strategy-data-task-a-ui-extension.js' });
  return {
    context, gmCalls, pack,
    registry: context.window.SLFActivePresetRegistry,
    policy: context.window.SLFTacticDirectionPolicy,
    RE: context.__RE,
    engine: context.window.SLFCurrentActionHintEngine
  };
}

const EMPTY_PLAN = { context: [], developer: [], preset: [], controls: [], notes: [] };
function baseSnapshot(overrides = {}) {
  return Object.assign({
    gameId: 'g', myTeam: 1, teams: [1, 2], score: { home: 0, away: 1 }, minute: 75,
    stats: [{ teamId: 1, stats: { power: 100 } }, { teamId: 2, stats: { power: 98 } }]
  }, overrides);
}

// ===========================================================================
// 4. UI PROVENANCE (through the real compact renderer)
// ===========================================================================
runSection('4. UI PROVENANCE', () => {
  const { RE, engine } = createUiHarness({});
  assert.equal(typeof RE.compactPlan, 'function', 'compact renderer installed');

  // (a) matched seed renders «База: seed (гипотеза)» for the +3 winner.
  {
    const ctx = { scoreState: 'losing', minute: 75, myBad: 10, attackNeed: 75, lowBadActions: true, underPressure: false, signals: [], myPowerDropPct: 0, highBadActions: false, ownRedCard: false, transitionThreat: false, pressFatigueRisk: false };
    const snapshot = baseSnapshot();
    const decision = engine.run(snapshot, ctx);
    assert.equal(decision.action.preset, 'Klopp_LateGegenpress_v11', 'Klopp wins the late_high_pressure scenario');
    const kloppCand = decision.candidates.find(c => c.preset === 'Klopp_LateGegenpress_v11');
    assert.equal(kloppCand.parts.boundedEvidenceAdjustment, 3, 'decision applied +3 to Klopp');
    snapshot.ruleDecision = decision;
    const html = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
    assert.ok(html.includes('База: seed (гипотеза)'), 'matched seed renders the seed provenance line');
    assert.ok(!html.includes('нет совпавших данных'), 'no none-variant when a seed matched');
  }

  // (b) no match renders «База: нет совпавших данных».
  {
    const ctx = { scoreState: 'draw', minute: 30, myBad: 0, underPressure: false, signals: [] };
    const snapshot = baseSnapshot({ score: { home: 0, away: 0 }, minute: 30 });
    const decision = engine.run(snapshot, ctx);
    snapshot.ruleDecision = decision;
    const html = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
    assert.ok(html.includes('База: нет совпавших данных'), 'no match renders the none provenance line');
    assert.ok(!html.includes('База: seed (гипотеза)'), 'no seed line when nothing matched');
  }

  // (c) the line attributes the DISPLAYED preset (finalTactic.presetId when
  //     base!=='current_tactic'), not blindly the original winner.
  {
    // Context matches rule 1 (Klopp) but NOT rule 2 (ControlledPush, myBad>=20).
    const ctx = { scoreState: 'losing', minute: 60, myBad: 10, underPressure: false, signals: [] };
    const snapshot = baseSnapshot({ minute: 60 });
    const decision = engine.run(snapshot, ctx);
    // The original winner is Klopp (matches rule 1). The DISPLAYED preset is the
    // merged final tactic -> ControlledPush (matches no rule here).
    decision.action.preset = 'Klopp_LateGegenpress_v11';
    decision.finalTactic = { base: 'preset:Guardiola_ControlledPush_v11', presetId: 'Guardiola_ControlledPush_v11' };
    snapshot.ruleDecision = decision;
    const html = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
    assert.ok(html.includes('База: нет совпавших данных'), 'provenance attributes the DISPLAYED preset (ControlledPush), not the winner (Klopp)');
    assert.ok(!html.includes('База: seed (гипотеза)'), 'the winner seed must not leak into the displayed-preset provenance');
  }

  // (d) output is HTML-escaped (the label passes through etalonEscape).
  {
    const ctx = { scoreState: 'losing', minute: 75, myBad: 10, attackNeed: 75, lowBadActions: true, underPressure: false, signals: [], myPowerDropPct: 0, highBadActions: false, ownRedCard: false, transitionThreat: false, pressFatigueRisk: false };
    const snapshot = baseSnapshot();
    const decision = engine.run(snapshot, ctx);
    snapshot.ruleDecision = decision;
    const html = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
    assert.ok(html.includes('<div style="line-height:1.4;opacity:.85;">База: seed (гипотеза)</div>'), 'provenance line is the escaped label in its own div');
    assert.equal(typeof RE.escapeHtml, 'function', 'escapeHtml is available to the renderer');
  }
});

// ===========================================================================
// 5. NO AUTO-REFRESH — a fetch completing between decision and render must not
//    change the already-rendered provenance (render uses the same decision).
// ===========================================================================
runSection('5. NO AUTO-REFRESH', () => {
  const { RE, engine, pack } = createUiHarness({});
  const ctx = { scoreState: 'losing', minute: 75, myBad: 10, attackNeed: 75, lowBadActions: true, underPressure: false, signals: [], myPowerDropPct: 0, highBadActions: false, ownRedCard: false, transitionThreat: false, pressFatigueRisk: false };
  const snapshot = baseSnapshot();
  const decision = engine.run(snapshot, ctx);
  snapshot.ruleDecision = decision;
  const html1 = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
  assert.ok(html1.includes('База: seed (гипотеза)'), 'first render shows the seed line');
  // Complete a fetch with a DIFFERENT pack (no matching rule) after the decision.
  pack.state = { fetchedAt: Date.now(), pack: { schema: 'slf_tactical_knowledge_pack_v1', version: 'other', rules: [] } };
  const html2 = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
  assert.equal(html2, html1, 'a later fetch does not change the already-rendered provenance (same-decision data)');
});

// ===========================================================================
// 6. DIVERGUARD — the provenance must follow the decision's own adjustment,
//    never a raw-context re-evaluation that diverges from the normalized
//    decision context (signal-derived underPressure).
// ===========================================================================
runSection('6. DIVERGUARD', () => {
  // Synthetic pack: a pressure rule targeting Emery (which CAN be the winner in
  // protect_lead), so the +3 lands on the DISPLAYED preset.
  const synthetic = {
    schema: 'slf_tactical_knowledge_pack_v1', version: 'synthetic',
    rules: [
      { id: 'syn_emery_pressure', when: { score_state: 'winning', minute_min: 70, pressure: 'opponent_advantage_xg_or_xt' }, recommendation: { preset: 'Emery_BalancedBase_v11' }, confidence: 'seed_rule' }
    ]
  };
  const { RE, engine, registry } = createUiHarness({ packJson: synthetic });
  // Raw context: underPressure false, but the 'opponent_high_press' signal makes
  // the policy's normalizedContext derive underPressure=true.
  const ctx = { scoreState: 'winning', minute: 75, myBad: 5, underPressure: false, signals: ['opponent_high_press'], counterExitAvailable: false, myPowerDropPct: 0, highBadActions: false, ownRedCard: false, transitionThreat: false, pressFatigueRisk: false };
  const snapshot = baseSnapshot({ score: { home: 1, away: 0 } });
  const decision = engine.run(snapshot, ctx);
  assert.equal(decision.action.preset, 'Emery_BalancedBase_v11', 'Emery wins protect_lead (Simeone/Allegri vetoed)');
  const emeryCand = decision.candidates.find(c => c.preset === 'Emery_BalancedBase_v11');
  assert.equal(emeryCand.parts.boundedEvidenceAdjustment, 3, 'decision applied +3 to Emery via the signal-derived underPressure');
  // The RAW moment.context has underPressure=false -> a raw re-evaluation diverges.
  const rawAssessment = registry.knowledgeAssessment({ preset: 'Emery_BalancedBase_v11', context: decision.moment.context });
  assert.equal(rawAssessment.delta, 0, 'raw-context re-evaluation diverges (underPressure false) — the lie the guard prevents');
  // The provenance MUST follow the decision (parts), not the raw re-evaluation.
  snapshot.ruleDecision = decision;
  const html = RE.compactPlan(clone(EMPTY_PLAN), snapshot, '');
  assert.ok(html.includes('База: seed (гипотеза)'), 'provenance follows the decision adjustment (no lie)');
  assert.ok(!html.includes('нет совпавших данных'), 'provenance must not show the none-variant while +3 was applied');
});

if (sectionFailures.length) {
  for (const f of sectionFailures) {
    console.error(`\n=== ${f.name} ===\n${f.err.stack}`);
  }
  process.exitCode = 1;
  throw new Error(`${sectionFailures.length} section(s) failed: ${sectionFailures.map(f => f.name).join(', ')}`);
}

console.log('tactical knowledge pack hints: OK (loader, assessment, policy, provenance, no-auto-refresh, diverguard)');
