#!/usr/bin/env node
// SLF issue #350 (evolves #348) — merged «Рекомендация» panel block + button
// state machine. Loads the FULL chain + final-tactic-merge-layer + re-html-utils
// + task-a UI extension in one vm bundle (production order) with a MINIMAL DOM
// stub (getElementById/addEventListener only — no DOM library). Pins:
//   - bold «Рекомендация» label + preset title, grouped vector line
//     (оборона/построение/стиль/атака + фланги), Δ line when deltaVsCurrent is
//     non-empty, provenance line (etalon blocks vs preset), T2 reference line,
//     scenario advice row, insufficient-data line;
//   - ONE #slf-final-tactic-apply-btn rendered with a data-token, enabled for
//     a live own match; the legacy etalon block/button are gone;
//   - STATE.finalTacticRecommendation carries the MERGED string vector +
//     merged source; the legacy STATE.etalonRecommendation/etalonApplyStatus
//     pair is removed;
//   - foreign match / finished match / bridge apply-in-progress → button
//     present but disabled with the matching title;
//   - already-applied merged vector → «Уже применено», disabled, no Δ line;
//   - missing or degraded finalTactic → legacy «Действие» row, no button;
//   - window.SLFFinalTacticMergeLayer.autoApply === false (and the direction
//     policy autoApply stays false) — the button is the ONLY apply trigger.

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

let currentTactic = {
  def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
  build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4',
  pass_risk: '3', dribble: '2', cross: '3', corner: '2', shot: '2', priority: []
};
const listeners = [];
const sandbox = {
  console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
  Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, Error,
  setTimeout: () => 0, clearTimeout: () => {},
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
  UI: { addMatchParserPanel() {}, addParserLog() {}, updateParserStatus() {} },
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
  { filename: 'slf-350-panel-bundle.js' }
);
const STATE = sandbox.__STATE;
const engine = sandbox.window.SLFCurrentActionHintEngine;

// --- installation invariants --------------------------------------------------
assert.equal(sandbox.window.SLFFinalTacticMergeLayer.autoApply, false, 'merge layer autoApply is false — the button is the only trigger');
assert.equal(sandbox.window.SLFTacticDirectionPolicy.autoApply, false, 'direction policy autoApply unchanged');
assert.ok(listeners.some(entry => entry.type === 'click'), 'apply click delegation bound once');
assert.equal(typeof sandbox.RecommendationEngine.compactPlan, 'function', 'task-a compactPlan patched');
assert.equal(STATE.finalTacticRecommendation, null, 'STATE.finalTacticRecommendation initialized to null');
assert.equal(STATE.finalTacticApplyStatus, 'idle', 'STATE.finalTacticApplyStatus initialized to idle');
assert.equal(STATE.etalonRecommendation, undefined, 'legacy STATE.etalonRecommendation pair removed');
assert.equal(STATE.etalonApplyStatus, undefined, 'legacy STATE.etalonApplyStatus pair removed');

const mkSnapshot = (score, over = {}) => Object.assign({
  gameId: 'g1', myTeam: 101, teams: [101, 202], minute: 75, status: 'live',
  score,
  stats: [
    { teamId: 101, stats: { defVector: 5, pressVector: 10, xG: 0.2, possession: 45, badActionsPct: 10, fouls: 1, power: 5000 } },
    { teamId: 202, stats: { defVector: 20, pressVector: 10, xG: 0.1, possession: 55, power: 4900 } }
  ]
}, over);

// engine.run does not stamp ruleDecision itself; production selectRawPreset
// does (tactic-preset-direction-policy.js:221) — mirror that here.
function render(snapshot, context) {
  const result = engine.run(snapshot, JSON.parse(JSON.stringify(context)));
  snapshot.ruleDecision = result;
  return sandbox.RecommendationEngine.compactPlan({}, snapshot, '');
}

const LEAD_CONTEXT = {
  tags: ['winning', 'late_protect_lead'],
  score: { state: 'winning', diff: 1, myGoals: 2, oppGoals: 1, known: true },
  minute: 75, myBad: 10, myFouls: 1, myXg: 0.2, oppXg: 0.1,
  myPossession: 45, oppPossession: 55, oppPressVector: 5, oppDefVector: 20,
  strengthContext: { known: true, mode: 'equal', bucket: 'near_equal', strengthGap: 100 }
};
const BUTTON_RE = /<button id="slf-final-tactic-apply-btn" type="button" data-token="([^"]*)"/;

// --- (1) merged block: title, grouped vector, Δ, provenance, ONE button ------
{
  currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4',
    pass_risk: '3', dribble: '2', cross: '3', corner: '2', shot: '2', priority: []
  };
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.ok(html.includes('<b style="color:#75ff75;">Рекомендация:</b> '), 'merged recommendation title rendered');
  const titleMatch = html.match(/Рекомендация:<\/b> ([^<]*)/);
  assert.ok(titleMatch, 'preset title present');
  assert.equal(titleMatch[1], 'Emery_BalancedBase_v11.', 'preset title = engine action preset');
  assert.ok(html.includes('<div>Вектор: оборона линия/прессинг/ширина/интенс: 1/1/1/2 · построение выход/темп/диаг/касание: 1/1/1/1 · стиль: 1 · атака риск/дриблинг/кроссы/угловые/удары: 2/2/2/1/2 · фланги: Л+П</div>'),
    'grouped vector line (оборона/построение/стиль/атака + фланги)');
  assert.ok(html.includes('<div>Δ: линия 3→1 · прессинг 3→1 · ширина 3→1 · интенс 4→2 · выход 3→1 · темп 3→1 · диаг 3→1 · касание 3→1 · стиль 4→1 · риск 3→2 · кроссы 3→2 · угловые 2→1 · фланги →left+right</div>'),
    'Δ line over changed controls + priority vs current (dribble/shot equal under v12 → omitted by the renderer)');
  assert.ok(html.includes('оборона/построение/стиль ← эталон d5+b5+s1'), 'provenance line: etalon blocks');
  assert.ok(html.includes('атака ← пресет Emery_BalancedBase_v11'), 'provenance line: attack from preset');
  assert.ok(html.includes('<div style="opacity:.9;">Совет: атаковать фланг, где соперник не играет</div>'), 'scenario advice note rendered');
  const button = html.match(BUTTON_RE);
  assert.ok(button, '#slf-final-tactic-apply-btn present with data-token');
  assert.ok(button[1].length > 0, 'data-token is non-empty');
  assert.equal(button[1], STATE.finalTacticRecommendation.token, 'rendered token matches the remembered recommendation');
  assert.ok(html.includes('>Применить</button>'), 'live own match → enabled «Применить» button');
  assert.equal(html.includes(' disabled'), false, 'no disabled attribute for the enabled case');
  assert.equal(STATE.finalTacticApplyStatus, 'idle');
  jeq(STATE.finalTacticRecommendation.ids, ['d5', 'b5', 's1']);
  const recVector = STATE.finalTacticRecommendation.vector;
  jeq(recVector, {
    def_line: '1', press_line: '1', def_width: '1', press_intense: '2',
    build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1',
    pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: ['left', 'right']
  }, 'remembered vector is the full MERGED string vector');
  assert.equal(recVector.def_line, '1', 'merged vector: etalon defense value as STRING');
  assert.equal(recVector.pass_risk, '2', 'merged vector: attack from the preset');
  jeq(recVector.priority, ['left', 'right'], 'merged vector carries etalon priority lanes');
  assert.equal(STATE.finalTacticRecommendation.source, 'merged:etalon:d5+b5+s1+presets:Emery_BalancedBase_v11', 'rec.source names etalon ids + preset');
  assert.equal(html.includes('<b style="color:#75ff75;">Действие:</b>'), false, 'legacy «Действие» row replaced by the merged block');
  assert.equal(html.includes('Эталон (Dave 5.6)'), false, 'legacy etalon-only block markup is gone');
  assert.equal(html.includes('slf-etalon-apply-btn'), false, 'legacy #slf-etalon-apply-btn is gone');
  assert.equal((html.match(/<button/g) || []).length, 1, 'exactly ONE button in the panel block');
}

// --- (2) T2 generic-only: reference line + full-preset provenance -------------
{
  currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4',
    pass_risk: '3', dribble: '2', cross: '3', corner: '2', shot: '2', priority: []
  };
  const html = render(mkSnapshot({ home: 1, away: 1, diff: 0 }, { minute: 30 }), {
    tags: [], score: { state: 'draw', diff: 0, myGoals: 1, oppGoals: 1, known: true },
    minute: 30, myBad: 10, myFouls: 1, myXg: 1.0, oppXg: 1.0,
    myPossession: 50, oppPossession: 50, oppPressVector: 5, oppDefVector: 5,
    strengthContext: { known: true, mode: 'equal', bucket: 'near_equal', strengthGap: 100 }
  });
  assert.ok(html.includes('<div style="opacity:.9;">Эталон: d1/b1 — равный матч, применён пресет</div>'), 'T2 reference line rendered');
  assert.ok(html.includes('оборона/построение/стиль/атака ← пресет Emery_BalancedBase_v11'), 'T2 provenance: every group from the preset');
  assert.equal(html.includes('← эталон'), false, 'T2 has no etalon override in provenance');
  assert.ok(html.match(BUTTON_RE), 'T2 still renders the apply button (preset vector is applicable)');
  assert.equal(STATE.finalTacticRecommendation.source, 'merged:etalon:d1+b1+presets:Emery_BalancedBase_v11');
}

// --- (3) already-applied on the merged vector ---------------------------------
{
  currentTactic = {
    def_line: '1', press_line: '1', def_width: '1', press_intense: '2',
    build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1',
    pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: ['left', 'right']
  };
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.equal(html.includes('<div>Δ:'), false, 'no Δ line when merged vector matches current');
  assert.ok(html.includes('>Уже применено</button>'), 'matching current tactic → «Уже применено»');
  assert.ok(html.includes(' disabled'), 'already-applied button is disabled');
  assert.equal(STATE.finalTacticApplyStatus, 'already_applied');
}

// --- (4) insufficient data (T1): merged block still renders, pure preset ------
{
  currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4',
    pass_risk: '3', dribble: '2', cross: '3', corner: '2', shot: '2', priority: []
  };
  const snapshot = mkSnapshot(undefined, { minute: 10 });
  const html = render(snapshot, { tags: [], minute: 10, score: { state: 'unknown' } });
  assert.ok(html.includes('Эталон: недостаточно данных'), 'T1 insufficient line rendered');
  assert.ok(html.includes('счёт не определён'), 'score_state reason translated');
  assert.equal(html.includes('игра через «столба» не распознаётся'), false, 'b10 marker filtered (permanent limitation, not per-recommendation noise)');
  const button = html.match(BUTTON_RE);
  assert.ok(button, 'T1 still renders the apply button (pure preset vector)');
  assert.equal(STATE.finalTacticRecommendation.source, 'merged:etalon:+presets:Emery_BalancedBase_v11', 'T1 source: empty ids + preset (engine picked Emery without a score)');
  assert.equal(STATE.finalTacticRecommendation.vector.def_line, '2', 'T1 vector is the pure preset (Emery def_line=2)');
  jeq(STATE.finalTacticRecommendation.ids, [], 'T1 remembers no etalon ids');
}

// --- (5) foreign match → button disabled --------------------------------------
{
  const snapshot = mkSnapshot({ home: 2, away: 1, diff: 1 });
  snapshot.matchOwnership = 'foreign';
  const html = render(snapshot, LEAD_CONTEXT);
  assert.ok(html.match(BUTTON_RE), 'foreign match still shows the button');
  assert.ok(html.includes(' disabled'), 'foreign match → button disabled');
  assert.ok(html.includes('Чужой матч — применение тактики недоступно'), 'foreign match title');
}

// --- (6) finished snapshot → button disabled ----------------------------------
{
  const snapshot = mkSnapshot({ home: 2, away: 1, diff: 1 });
  snapshot.status = 'finished';
  const html = render(snapshot, LEAD_CONTEXT);
  assert.ok(html.match(BUTTON_RE), 'finished match still shows the button');
  assert.ok(html.includes(' disabled'), 'finished match → button disabled');
  assert.ok(html.includes('Матч завершён — применение недоступно'), 'finished match title');
}

// --- (7) bridge apply in progress → button disabled ----------------------------
{
  STATE.tacticControlBridgeApplyInProgress = true;
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.ok(html.includes(' disabled'), 'apply-in-progress → button disabled');
  assert.ok(html.includes('Идёт применение тактики — подождите'), 'apply-in-progress title');
  STATE.tacticControlBridgeApplyInProgress = false;
}

// --- (8) missing or degraded finalTactic → legacy «Действие» row ---------------
{
  const bare = mkSnapshot({ home: 2, away: 1, diff: 1 });
  bare.ruleDecision = { action: { preset: 'X_v11', decision: 'hold_current', reason: 'r' }, candidates: [], confidence: { level: 'low' }, margin: 0 };
  const html = sandbox.RecommendationEngine.compactPlan({}, bare, '');
  assert.ok(html.includes('<b style="color:#75ff75;">Действие:</b>'), 'no finalTactic → legacy «Действие» row');
  assert.equal(html.includes('slf-final-tactic-apply-btn'), false, 'no finalTactic → no apply button');
  assert.equal(html.includes('Рекомендация:'), false, 'no finalTactic → no merged block');

  const degraded = mkSnapshot({ home: 2, away: 1, diff: 1 });
  degraded.ruleDecision = {
    action: { preset: 'X_v11', decision: 'active_control', reason: 'r' },
    candidates: [], confidence: { level: 'low' }, margin: 0,
    finalTactic: { schema: 'slf_final_tactic_v1', source: 'final_tactic_merge', ok: false, error: 'final_tactic_computation_failed', vector: null }
  };
  const html2 = sandbox.RecommendationEngine.compactPlan({}, degraded, '');
  assert.ok(html2.includes('<b style="color:#75ff75;">Действие:</b>'), 'degraded finalTactic (vector:null) → legacy «Действие» row');
  assert.equal(html2.includes('slf-final-tactic-apply-btn'), false, 'degraded finalTactic → no apply button');

  const foreign = mkSnapshot({ home: 2, away: 1, diff: 1 });
  foreign.ruleDecision = {
    action: { preset: 'X_v11', decision: 'hold_current', reason: 'r' },
    candidates: [], confidence: { level: 'low' }, margin: 0,
    etalon: { source: 'someone_elses_hint', applyVector: { def_line: 1 } }
  };
  const html3 = sandbox.RecommendationEngine.compactPlan({}, foreign, '');
  assert.equal(html3.includes('Рекомендация:'), false, 'a hand-stamped ruleDecision without finalTactic renders no merged block even with a foreign etalon');
}

console.log('final tactic merged panel: «Рекомендация» block, grouped vector, Δ, provenance, reference line, ONE button states, legacy fallback, autoApply=false: OK');
