#!/usr/bin/env node
// SLF issue #348 — etalon hint-panel block rendering + button state machine.
// Loads the FULL chain + re-html-utils + task-a UI extension in one vm bundle
// (production order) with a MINIMAL DOM stub (getElementById/addEventListener
// only — no DOM library). Pins:
//   - bold «Эталон (Dave 5.6)» label, situation labels, vector summary line,
//     Δ line when deltaVsCurrent is non-empty, scenario + advice rows;
//   - #slf-etalon-apply-btn rendered with a data-token when a vector exists,
//     enabled for a live own match;
//   - insufficient-data case renders WITHOUT any button (no vector to apply);
//   - foreign match / finished match / bridge apply-in-progress → button
//     present but disabled with the matching title;
//   - already-applied vector → «Уже применено», disabled, no Δ line;
//   - foreign-source or missing etalon → no block at all;
//   - window.SLFDave56EtalonLayer.autoApply === false (and the direction
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
  'src/modules/strategy-data-recommendations/re-html-utils.js',
  'src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js'
];

let currentTactic = {
  def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
  build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4', priority: []
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
  getCurrentTactic: () => Object.assign({}, currentTactic, { priority: currentTactic.priority.slice() })
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  FILES.map(rel => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n;\n')
    + '\n;this.__STATE = (typeof STATE !== "undefined") ? STATE : undefined;',
  sandbox,
  { filename: 'slf-348-panel-bundle.js' }
);
const STATE = sandbox.__STATE;
const engine = sandbox.window.SLFCurrentActionHintEngine;

// --- installation invariants --------------------------------------------------
assert.equal(sandbox.window.SLFDave56EtalonLayer.autoApply, false, 'etalon layer autoApply is false — the button is the only trigger');
assert.equal(sandbox.window.SLFTacticDirectionPolicy.autoApply, false, 'direction policy autoApply unchanged');
assert.ok(listeners.some(entry => entry.type === 'click'), 'apply click delegation bound once');
assert.equal(typeof sandbox.RecommendationEngine.compactPlan, 'function', 'task-a compactPlan patched');

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
const BUTTON_RE = /<button id="slf-etalon-apply-btn" type="button" data-token="([^"]*)"/;

// --- (1) vector case: bold label, summary, Δ line, enabled button + token ----
{
  currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4', priority: []
  };
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.ok(html.includes('<b style="color:#7ad9ff;">Эталон (Dave 5.6):</b>'), 'bold etalon label rendered');
  assert.ok(html.includes('d5 Нужно удержать / b5 Нужно удержать'), 'situation labels rendered');
  assert.ok(html.includes('<div>Вектор: линия/прессинг/ширина/интенс: 1/1/1/2 · выход/темп/диаг/касание: 1/1/1/1 · стиль: 1 · фланги: Л+П</div>'), 'vector summary line with lane labels');
  assert.ok(html.includes('<div>Δ: линия 3→1 · прессинг 3→1 · ширина 3→1 · интенс 4→2 · выход 3→1 · темп 3→1 · диаг 3→1 · касание 3→1 · стиль 4→1 · фланги →left+right</div>'), 'Δ line rendered when deltaVsCurrent is non-empty');
  assert.ok(html.includes('<div>Сценарий: lead10_equal</div>'), 'scenario row rendered');
  assert.ok(html.includes('Совет: атаковать фланг, где соперник не играет'), 'advice note rendered');
  const button = html.match(BUTTON_RE);
  assert.ok(button, '#slf-etalon-apply-btn present with data-token');
  assert.ok(button[1].length > 0, 'data-token is non-empty');
  assert.equal(button[1], STATE.etalonRecommendation.token, 'rendered token matches the remembered recommendation');
  assert.ok(html.includes('>Применить</button>'), 'live own match → enabled «Применить» button');
  assert.equal(html.includes(' disabled'), false, 'no disabled attribute for the enabled case');
  assert.equal(STATE.etalonApplyStatus, 'idle');
  jeq(STATE.etalonRecommendation.ids, ['d5', 'b5', 's1']);
  jeq(STATE.etalonRecommendation.vector, {
    def_line: 1, press_line: 1, def_width: 1, press_intense: 2,
    build_type: 1, build_temp: 1, build_long: 1, build_fast: 1, style: 1,
    priority: ['left', 'right']
  }, 'remembered vector equals the etalon applyVector');
}

// --- (2) already-applied: no Δ line, «Уже применено», disabled ----------------
{
  currentTactic = {
    def_line: '1', press_line: '1', def_width: '1', press_intense: '2',
    build_type: '1', build_temp: '1', build_long: '1', build_fast: '1', style: '1',
    priority: ['left', 'right']
  };
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.equal(html.includes('<div>Δ:'), false, 'empty deltaVsCurrent → no Δ line');
  assert.ok(html.includes('>Уже применено</button>'), 'matching current tactic → «Уже применено»');
  assert.ok(html.includes(' disabled'), 'already-applied button is disabled');
  assert.equal(STATE.etalonApplyStatus, 'already_applied');
}

// --- (3) insufficient data: block WITHOUT any button --------------------------
{
  currentTactic = {
    def_line: '3', press_line: '3', def_width: '3', press_intense: '4',
    build_type: '3', build_temp: '3', build_long: '3', build_fast: '3', style: '4', priority: []
  };
  const snapshot = mkSnapshot(undefined, { minute: 10 });
  const recBefore = STATE.etalonRecommendation;
  const html = render(snapshot, { tags: [], minute: 10, score: { state: 'unknown' } });
  assert.ok(html.includes('Эталон (Dave 5.6)'), 'etalon block still renders without data');
  assert.ok(html.includes('Недостаточно данных'), 'insufficient-data text rendered');
  assert.ok(html.includes('счёт не определён'), 'score_state reason translated');
  assert.ok(html.includes('игра через «столба» не распознаётся'), 'b10 marker surfaced');
  assert.equal(html.includes('slf-etalon-apply-btn'), false, 'no vector → NO apply button at all');
  assert.equal(STATE.etalonRecommendation, recBefore, 'insufficient render mints no new recommendation (the previous one becomes unreachable: no button, token-guarded click)');
}

// --- (4) foreign match → button disabled --------------------------------------
{
  const snapshot = mkSnapshot({ home: 2, away: 1, diff: 1 });
  snapshot.matchOwnership = 'foreign';
  const html = render(snapshot, LEAD_CONTEXT);
  assert.ok(html.match(BUTTON_RE), 'foreign match still shows the button');
  assert.ok(html.includes(' disabled'), 'foreign match → button disabled');
  assert.ok(html.includes('Чужой матч — применение тактики недоступно'), 'foreign match title');
}

// --- (5) finished snapshot → button disabled ----------------------------------
{
  const snapshot = mkSnapshot({ home: 2, away: 1, diff: 1 });
  snapshot.status = 'finished';
  const html = render(snapshot, LEAD_CONTEXT);
  assert.ok(html.match(BUTTON_RE), 'finished match still shows the button');
  assert.ok(html.includes(' disabled'), 'finished match → button disabled');
  assert.ok(html.includes('Матч завершён — применение недоступно'), 'finished match title');
}

// --- (6) bridge apply in progress → button disabled ----------------------------
{
  STATE.tacticControlBridgeApplyInProgress = true;
  const html = render(mkSnapshot({ home: 2, away: 1, diff: 1 }), LEAD_CONTEXT);
  assert.ok(html.includes(' disabled'), 'apply-in-progress → button disabled');
  assert.ok(html.includes('Идёт применение тактики — подождите'), 'apply-in-progress title');
  STATE.tacticControlBridgeApplyInProgress = false;
}

// --- (7) missing / foreign-source etalon → no block ----------------------------
{
  const bare = mkSnapshot({ home: 2, away: 1, diff: 1 });
  bare.ruleDecision = { action: { preset: 'X_v11', decision: 'hold_current', reason: 'r' }, candidates: [], confidence: { level: 'low' }, margin: 0 };
  const html = sandbox.RecommendationEngine.compactPlan({}, bare, '');
  assert.equal(html.includes('Эталон (Dave 5.6)'), false, 'no etalon → no block');
  const foreign = mkSnapshot({ home: 2, away: 1, diff: 1 });
  foreign.ruleDecision = {
    action: { preset: 'X_v11', decision: 'hold_current', reason: 'r' },
    candidates: [], confidence: { level: 'low' }, margin: 0,
    etalon: { source: 'someone_elses_hint', applyVector: { def_line: 1 } }
  };
  const html2 = sandbox.RecommendationEngine.compactPlan({}, foreign, '');
  assert.equal(html2.includes('Эталон (Dave 5.6)'), false, 'etalon with a foreign source is ignored');
}

console.log('dave56 etalon panel: block rendering, Δ line, button states (foreign/finished/in-progress/insufficient), autoApply=false: OK');
