#!/usr/bin/env node
// SLF issue #350 (evolves #348) — merged «Рекомендация» one-click apply
// contract (token-guarded, single call). Loads the FULL chain + the final
// tactic merge layer + re-html-utils + task-a UI extension in one vm bundle
// (production order), drives the real click delegation path and asserts the
// contract between the #slf-final-tactic-apply-btn button and
// STATE.tacticControlBridge:
//   - exactly ONE applyTacticObject call per user click;
//   - called with the exact MERGED vector: all 14 controls as STRING
//     ordinals + priority array (preset base overridden by etalon blocks per
//     the merge-layer semantics), never a partial etalon-only vector;
//   - opts {strict:true, source:'merged:etalon:<ids>+presets:<preset>'};
//   - reason→status mapping: preflight_failed / post_apply_rolled_back /
//     rollback_unverified / apply_in_progress / success;
//   - stale token → button disabled, NO bridge call;
//   - reentrancy: while STATE.tacticControlBridgeApplyInProgress is set the
//     panel never reaches the bridge;
//   - already-applied is detected on the MERGED vector.
// Note: engine.run does not stamp snapshot.ruleDecision itself (production
// selectRawPreset does — tactic-preset-direction-policy.js:221); the harness
// stamps it the same way before rendering.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const FILES = [
  'src/core/config.js',
  'src/modules/strategy-data-recommendations/current-action-hint-engine.js',
  'src/modules/strategy-data-recommendations/cah-value-utils.js',
  'src/modules/strategy-data-recommendations/cah-runtime-context.js',
  'src/modules/strategy-data-recommendations/cah-decision-core.js',
  'src/modules/strategy-data-recommendations/coach-hint-snapshot-context-layer.js',
  'src/modules/tactics-presets/active-preset-registry.js',
  'src/modules/tactics-presets/tactic-preset-direction-policy.js',
  'src/modules/strategy-data-recommendations/signal-noise-filter-layer.js',
  'src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js',
  'src/modules/strategy-data-recommendations/coach-mode-policy.js',
  'src/modules/strategy-data-recommendations/moment-drift-stabilizer.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-data.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-mapping.js',
  'src/modules/strategy-data-recommendations/dave56-etalon-layer.js',
  'src/modules/strategy-data-recommendations/final-tactic-merge-layer.js',
  'src/modules/strategy-data-recommendations/re-html-utils.js',
  'src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js'
];

function panelHarness() {
  const listeners = [];
  const logs = [];
  const statuses = [];
  const timers = [];
  const calls = [];
  let bridgeResult = { ok: true, failures: [], mismatches: [], applicationStatus: 'ui_readback_confirmed' };
  let bridgeThrows = false;
  let currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4', priority: []
  };
  const sandbox = {
    console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, Error,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      readyState: 'complete',
      querySelector: () => null,
      defaultView: null,
      getElementById: () => null,
      addEventListener: (type, fn) => { listeners.push({ type, fn }); },
      createElement: () => ({ style: { cssText: '' } })
    },
    location: { pathname: '/game.php' },
    UI: {
      addMatchParserPanel() {},
      addParserLog: text => logs.push(String(text)),
      updateParserStatus: text => statuses.push(String(text))
    },
    RecommendationEngine: {
      normalizePlan(plan) { return Object.assign({ developer: [] }, plan); },
      getTeamStats: () => null,
      getScoreState: () => ({ known: false }),
      getEffectiveMinute: () => null,
      getPresetTitle: name => name,
      getPresetScheme: () => null,
      make: () => ''
    },
    SnapshotEngine: { build: () => null },
    MatchStateParser: { getGameId: () => 'g1' },
    getCurrentTactic: () => Object.assign({}, currentTactic, { priority: (currentTactic.priority || []).slice() })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    FILES.map(rel => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n;\n')
      + '\n;this.__STATE = (typeof STATE !== "undefined") ? STATE : undefined;',
    sandbox,
    { filename: 'slf-350-apply-contract-bundle.js' }
  );
  const STATE = sandbox.__STATE;
  assert.ok(STATE, 'STATE exported from the bundle scope');
  STATE.tacticControlBridge = {
    async applyTacticObject(vector, opts) {
      calls.push({ vector, opts });
      if (bridgeThrows) throw new Error('bridge exploded');
      return bridgeResult;
    }
  };
  const engine = sandbox.window.SLFCurrentActionHintEngine;
  const clickListener = listeners.find(entry => entry.type === 'click');
  assert.ok(clickListener, 'panel bound the #slf-final-tactic-apply-btn click delegation');

  const mkSnapshot = (score, over = {}) => Object.assign({
    gameId: 'g1', myTeam: 101, teams: [101, 202], minute: 75, status: 'live',
    score,
    stats: [
      { teamId: 101, stats: { defVector: 5, pressVector: 10, xG: 0.2, possession: 45, badActionsPct: 10, fouls: 1, power: 5000 } },
      { teamId: 202, stats: { defVector: 20, pressVector: 10, xG: 0.1, possession: 55, power: 4900 } }
    ]
  }, over);

  // Render a fresh hint: engine run → production-style ruleDecision stamp →
  // compactPlan → STATE.finalTacticRecommendation with a fresh token.
  function render(snapshot, context) {
    const result = engine.run(snapshot, context);
    snapshot.ruleDecision = result;
    const html = sandbox.RecommendationEngine.compactPlan({}, snapshot, '');
    return html;
  }

  async function click(btn) {
    clickListener.fn({ target: { closest: selector => (selector === '#slf-final-tactic-apply-btn' ? btn : null) } });
    for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve));
  }

  const freshBtn = token => ({ dataset: { token }, disabled: true, textContent: 'Применить', isConnected: true });

  const LEAD = {
    snapshot: () => mkSnapshot({ home: 2, away: 1, diff: 1 }),
    context: {
      tags: ['winning', 'late_protect_lead'],
      score: { state: 'winning', diff: 1, myGoals: 2, oppGoals: 1, known: true },
      minute: 75, myBad: 10, myFouls: 1, myXg: 0.2, oppXg: 0.1,
      myPossession: 45, oppPossession: 55, oppPressVector: 5, oppDefVector: 20,
      strengthContext: { known: true, mode: 'equal', bucket: 'near_equal', strengthGap: 100 }
    }
  };
  const FAVOURITE = {
    snapshot: () => mkSnapshot({ home: 2, away: 0, diff: 2 }, { minute: 30 }),
    context: {
      tags: ['winning', 'strength_advantage_clear'],
      score: { state: 'winning', diff: 2, myGoals: 2, oppGoals: 0, known: true },
      minute: 30, myBad: 10, myFouls: 1, myXg: 0.2, oppXg: 0.1,
      myPossession: 45, oppPossession: 55, oppPressVector: 10, oppDefVector: 20,
      strengthContext: { known: true, mode: 'advantage', bucket: 'clear_advantage', strengthGap: 300 }
    }
  };

  const h = { sandbox, STATE, calls, logs, statuses, timers, render, click, freshBtn, LEAD, FAVOURITE,
    setCurrentTactic(value) { currentTactic = value; },
    setBridge(result) { bridgeResult = result; bridgeThrows = false; },
    setBridgeThrows() { bridgeThrows = true; } };
  return h;
}

const h = panelHarness();

// --- (1) success: exactly ONE call, exact MERGED vector, merged source -------
{
  h.setBridge({ ok: true, failures: [], mismatches: [], applicationStatus: 'ui_readback_confirmed' });
  const callsBefore = h.calls.length;
  const html = h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  assert.match(html, /id="slf-final-tactic-apply-btn"/, 'merged apply button rendered for a live own match');
  const token = h.STATE.finalTacticRecommendation.token;
  assert.ok(token, 'fresh merged recommendation token');
  const btn = h.freshBtn(token);
  await h.click(btn);
  assert.equal(h.calls.length - callsBefore, 1, 'exactly ONE applyTacticObject call per click');
  const call = h.calls[h.calls.length - 1];
  // Emery_BalancedBase_v11 base (v12 dribble guard: protect_lead no longer
  // picks Simeone_CompactLead_v11) + etalon d5/b5/s1 overrides (defense+
  // buildup+style+lanes from the etalon, attack from the preset) — all 14
  // STRING ordinals + priority.
  jeq(call.vector, {
    def_line: '1', press_line: '1', def_width: '1', press_intense: '2',
    build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1',
    pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: ['left', 'right']
  }, 'called with the exact merged vector (14 strings + priority)');
  jeq(Object.keys(call.vector).sort(), [
    'build_fast', 'build_long', 'build_temp', 'build_type', 'corner', 'cross',
    'def_line', 'def_width', 'dribble', 'pass_risk', 'press_intense', 'press_line',
    'priority', 'shot', 'style'
  ], 'the merged vector carries ALL 14 controls + priority (attack keys included)');
  for (const key of Object.keys(call.vector)) {
    if (key === 'priority') continue;
    assert.equal(typeof call.vector[key], 'string', `merged vector.${key} is a STRING`);
  }
  assert.equal(call.opts.strict, true, 'strict apply (preflight + rollback)');
  assert.ok(String(call.opts.source).startsWith('merged:'), 'source starts with merged:');
  assert.equal(call.opts.source, 'merged:etalon:d5+b5+s1+presets:Emery_BalancedBase_v11', 'source names the etalon ids and the base preset');
  assert.equal(call.opts.source, h.STATE.finalTacticRecommendation.source, 'bridge source equals the remembered recommendation source');
  assert.equal(h.STATE.finalTacticApplyStatus, 'applied', 'success → applied');
  assert.equal(btn.textContent, 'Применено ✓');
  assert.equal(btn.disabled, true, 'applied button stays disabled until the next render');
  jeq(h.STATE.finalTacticRecommendation.ids, ['d5', 'b5', 's1']);
}

// --- (2) lane-less etalon (b2 «все направления»): preset priority survives ---
{
  h.setBridge({ ok: true, failures: [], mismatches: [] });
  const callsBefore = h.calls.length;
  h.render(h.FAVOURITE.snapshot(), JSON.parse(JSON.stringify(h.FAVOURITE.context)));
  const btn = h.freshBtn(h.STATE.finalTacticRecommendation.token);
  await h.click(btn);
  assert.equal(h.calls.length - callsBefore, 1, 'one call for the lane-less recommendation too');
  const call = h.calls[h.calls.length - 1];
  // Emery_BalancedBase_v11 base + etalon d2/b2 overrides; b2 lanes omitted →
  // the preset priority [] survives (still present as an array key).
  jeq(call.vector, {
    def_line: '3', press_line: '3', def_width: '2', press_intense: '3',
    build_type: '3', build_temp: '2', build_long: '2', build_fast: '2', style: '3',
    pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: []
  }, 'd2/b2 merged vector over the Emery preset');
  jeq(Object.keys(call.vector).sort(), [
    'build_fast', 'build_long', 'build_temp', 'build_type', 'corner', 'cross',
    'def_line', 'def_width', 'dribble', 'pass_risk', 'press_intense', 'press_line',
    'priority', 'shot', 'style'
  ], 'the merged vector always carries the full 15-key shape');
  assert.equal(call.opts.source, 'merged:etalon:d2+b2+presets:Emery_BalancedBase_v11');
}

// --- (3) reason → status mapping ----------------------------------------------
async function scenario(bridge, expect) {
  h.setBridge(bridge);
  const callsBefore = h.calls.length;
  h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  const btn = h.freshBtn(h.STATE.finalTacticRecommendation.token);
  await h.click(btn);
  assert.equal(h.calls.length - callsBefore, 1, 'bridge consulted exactly once');
  assert.equal(h.STATE.finalTacticApplyStatus, expect.status, `status for reason=${bridge.reason || 'ok'}`);
  assert.equal(btn.disabled, expect.disabled, `disabled flag for ${bridge.reason || 'ok'}`);
  assert.equal(btn.textContent, expect.text, `button label for ${bridge.reason || 'ok'}`);
  return btn;
}

await scenario(
  { ok: false, reason: 'preflight_failed', failures: ['def_line'], mismatches: [], rolledBack: false },
  { status: 'failed_rolled_back', disabled: false, text: 'Применить' }
);
h.logs.length = 0;

// post_apply_rolled_back: disabled + rollback note, re-enabled after the 5s timer.
{
  const timersBefore = h.timers.length;
  const btn = await scenario(
    { ok: false, reason: 'post_apply_rolled_back', rolledBack: true, applicationStatus: 'apply_failed_rolled_back', failures: [], mismatches: [] },
    { status: 'failed_rolled_back', disabled: true, text: 'Отклонено — откачено' }
  );
  const added = h.timers.slice(timersBefore);
  assert.equal(added.length, 1, 'rollback note schedules exactly one re-enable timer');
  assert.equal(added[0].ms, 5000, 'rollback note visible for 5s');
  added[0].fn();
  assert.equal(btn.disabled, false, 're-enable after the rollback note window');
  assert.equal(btn.textContent, 'Применить');
}

// rollback_unverified: unsafe state — button stays disabled, no re-enable timer.
{
  const timersBefore = h.timers.length;
  await scenario(
    { ok: false, reason: 'rollback_unverified', rolledBack: false, applicationStatus: 'apply_failed_unverified', failures: [], mismatches: [] },
    { status: 'failed_unverified', disabled: true, text: '⚠ Откат не подтверждён' }
  );
  assert.equal(h.timers.length, timersBefore, 'unverified rollback never auto-re-enables');
}

await scenario(
  { ok: false, reason: 'apply_in_progress', failures: ['reentrancy'], mismatches: [], rolledBack: false },
  { status: 'idle', disabled: false, text: 'Применить' }
);

// --- (4) token mismatch: stale button never reaches the bridge ---------------
{
  h.setBridge({ ok: true, failures: [], mismatches: [] });
  const callsBefore = h.calls.length;
  h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  const btn = h.freshBtn('stale-token-from-an-older-render');
  await h.click(btn);
  assert.equal(h.calls.length, callsBefore, 'token mismatch → NO bridge call');
  assert.equal(btn.disabled, true, 'stale button is disabled');
  assert.equal(btn.textContent, 'Данные устарели — ↻ Подсказка');
  assert.ok(h.logs.some(log => log.includes('данные устарели')), 'stale data logged');
}

// --- (5) reentrancy: while a bridge apply is in progress, no second call ----
{
  const callsBefore = h.calls.length;
  const logsBefore = h.logs.length;
  h.STATE.tacticControlBridgeApplyInProgress = true;
  h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  const btn = h.freshBtn(h.STATE.finalTacticRecommendation.token);
  await h.click(btn);
  assert.equal(h.calls.length, callsBefore, 'reentrancy guard blocks the bridge call');
  assert.ok(h.logs.slice(logsBefore).some(log => log.includes('применение тактики уже выполняется')), 'waiting message logged');
  h.STATE.tacticControlBridgeApplyInProgress = false;
}

// --- (6) bridge exception is contained (no unhandled rejection, safe status) --
{
  h.setBridgeThrows();
  const callsBefore = h.calls.length;
  h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  const btn = h.freshBtn(h.STATE.finalTacticRecommendation.token);
  await h.click(btn);
  assert.equal(h.calls.length - callsBefore, 1, 'throwing bridge was consulted exactly once');
  assert.equal(h.STATE.finalTacticApplyStatus, 'failed_rolled_back', 'exception maps to the retry-safe failure status');
  assert.equal(btn.disabled, false, 'exception leaves the button retryable');
}

// --- (7) already-applied is detected on the MERGED vector --------------------
{
  h.setCurrentTactic({
    def_line: '1', press_line: '1', def_width: '1', press_intense: '2',
    build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1',
    pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: ['left', 'right']
  });
  const html = h.render(h.LEAD.snapshot(), JSON.parse(JSON.stringify(h.LEAD.context)));
  assert.ok(html.includes('>Уже применено</button>'), 'current tactic equals the MERGED vector → «Уже применено»');
  assert.ok(html.includes(' disabled'), 'already-applied button is disabled');
  assert.equal(h.STATE.finalTacticApplyStatus, 'already_applied');
  assert.equal(html.includes('<div>Δ:'), false, 'no Δ line when the merged vector equals the current tactic');
  h.setCurrentTactic({
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4', priority: []
  });
}

console.log('final tactic merged apply contract: single call, exact merged vector, merged source, status mapping, token + reentrancy + already-applied guards: OK');
