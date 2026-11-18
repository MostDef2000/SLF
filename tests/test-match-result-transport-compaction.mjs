#!/usr/bin/env node
// SLF #469: finished-match result transport compaction.
// The real SnapshotEngine.sendMatchResult is loaded from source (vm realm, same
// harness pattern as tests/test-tactical-lab-p04-transition.mjs). Api.postAppend
// is stubbed so the test inspects the exact POST body the server would receive.
// Asserts:
//   T1 the compacted body (UTF-8 bytes) is materially smaller than the
//      reconstructed full one and fits a conservative 5000-byte regression
//      budget (inside the reported <=5KB success range; not a proven network
//      threshold);
//   T2 lineupRows/shotsTable/eventsText/developerHints are absent from the POST;
//   T3 tacticTelemetry is byte-identical to the snapshot input;
//   T4 every server-consumed field (resultKey/status/score/gameId/parsedAt/
//      teams/myTeam) survives unchanged;
//   T5 the ORIGINAL snapshot keeps lineupRows (sendPlayerObservations POST still
//      carries all 38 player rows).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// Harness: real snapshot-engine.js, stubbed transport.
// ---------------------------------------------------------------------------
const posts = [];
const context = {
  console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math,
  String, Number, Promise, Boolean,
  location: { href: 'https://slf.fm/game.php?game=469' },
  STATE: {},
  SLF_VERSION_INFO: { scriptVersion: 'test' },
  CONFIG: { COLLECTIONS: { MATCH_RESULTS: 'match_results_v2', PLAYER_OBSERVATIONS: 'player_observations_v2' } },
  Api: {
    postAppend(collection, payload, label) {
      posts.push({ kind: 'append', collection, payload, label });
      return Promise.resolve({ status: 200 });
    },
    post(collection, payload, label) {
      posts.push({ kind: 'post', collection, payload, label });
      return Promise.resolve({ status: 200 });
    }
  }
};
vm.createContext(context);
vm.runInContext(
  `${read('src/modules/manual-match-telemetry/snapshot-engine.js')}\n;globalThis.__SnapshotEngine = SnapshotEngine;`,
  context,
  { filename: 'snapshot-engine.js' }
);
const engine = context.__SnapshotEngine;

// ---------------------------------------------------------------------------
// Representative finished-match snapshot: real-shape lineup (38 rows), a long
// events ticker, hints, shots table and a contract-required tacticTelemetry
// envelope with the transition timeline.
// ---------------------------------------------------------------------------
const POSITIONS = ['GK', 'DC', 'DL', 'DR', 'MC', 'ML', 'MR', 'ST'];

function lineupRow(index) {
  const side = index % 2 === 0 ? 'home' : 'away';
  const position = POSITIONS[index % POSITIONS.length];
  return {
    playerId: 100000 + index,
    name: `Player ${side === 'home' ? 'Home' : 'Away'} ${index + 1}`,
    side,
    isStarter: index < 22,
    position,
    normalizedPosition: position,
    positions: [...POSITIONS, 'AMC', 'AMR', 'AML'],
    skill: 70 + (index % 25),
    gridPosition: `r${(index % 6) + 1}c${(index % 5) + 1}`,
    slotSource: 'lineup_rows'
  };
}

const eventsText = Array.from({ length: 120 }, (_, index) => {
  const minute = Math.min(90, 1 + Math.floor(index * 0.75));
  const team = index % 2 === 0 ? 'Home FC' : 'Away FC';
  return `${minute}' ${team}: ${['pass', 'shot on target', 'corner', 'foul', 'interception'][index % 5]} near the box`;
}).join('\n');

const tacticTelemetry = {
  schema: 'slf_tactic_telemetry_v1',
  libraryVersion: 'slf_tactic_suite_561_v11',
  recommendationSchema: 'slf_rule_decision_v11_tactical_suite',
  riskAppetite: 'balanced',
  currentPreset: 'Emery_BalancedBase_v11',
  currentTacticFingerprint: 'tactic-fingerprint-469',
  initialPreset: 'Emery_BalancedBase_v11',
  transitionCount: 3,
  latestDecision: { action: 'hold', preset: null, atMinute: 76, reasons: ['score stable'] },
  transitions: [
    { atMinute: 12, fromPreset: 'Emery_BalancedBase_v11', toPreset: 'Emery_Press_v11', source: 'preset_apply', tacticFingerprint: 'fp-a' },
    { atMinute: 48, fromPreset: 'Emery_Press_v11', toPreset: 'Emery_Hold_v11', source: 'preset_apply', tacticFingerprint: 'fp-b' },
    { atMinute: 76, fromPreset: 'Emery_Hold_v11', toPreset: 'Emery_Hold_v11', source: 'hold', tacticFingerprint: 'fp-b' }
  ]
};

const snapshot = {
  ts: 1700000000000,
  gameId: 'game-469',
  status: 'finished',
  rawStatus: 'finished',
  minute: 90,
  bucket: '76-90',
  score: { home: 2, away: 1 },
  teams: [111, 222],
  teamNames: ['Home FC', 'Away FC'],
  myTeam: 111,
  lineupRows: Array.from({ length: 38 }, (_, index) => lineupRow(index)),
  formation: { home: '4-4-2', away: '4-3-3' },
  shotsTable: [
    { minute: 23, teamId: 111, playerId: 100005, kind: 'shot', onTarget: true, xg: 0.14 },
    { minute: 61, teamId: 222, playerId: 100017, kind: 'shot', onTarget: false, xg: 0.08 }
  ],
  eventsText,
  developerHints: [
    { text: 'Generator advice long title: press line too deep', severity: 'warn' },
    { text: 'Generator advice long title: build type overlaps', severity: 'info' },
    { text: 'Opponent attacks left flank', severity: 'info' }
  ],
  currentTactic: { def_line: '2', press_line: '2', priority: [] },
  stats: [
    { teamId: 111, stats: { power: 412, badActionsPct: 9, possession: 54, defVector: 2, pressVector: 3 } },
    { teamId: 222, stats: { power: 398, badActionsPct: 12, possession: 46, defVector: 2, pressVector: 2 } }
  ],
  tacticTelemetry
};

const lineupRowsBefore = snapshot.lineupRows;
const tacticTelemetryBefore = JSON.stringify(tacticTelemetry);

// ---------------------------------------------------------------------------
// T1-T4: inspect the exact transport record.
// ---------------------------------------------------------------------------
await engine.sendMatchResult(snapshot);

const resultPost = posts.find(post => post.kind === 'append' && post.collection === 'match_results_v2');
assert.ok(resultPost, 'match result POST was issued');
const record = resultPost.payload;

const compactBytes = Buffer.byteLength(JSON.stringify([record]), 'utf8');
// Reconstruction: the same record before this change (fields still present).
const fullBytes = Buffer.byteLength(JSON.stringify([Object.assign({}, record, {
  lineupRows: snapshot.lineupRows,
  shotsTable: snapshot.shotsTable,
  eventsText: snapshot.eventsText,
  developerHints: snapshot.developerHints
})]), 'utf8');

// Regression budget, in UTF-8 bytes of the POST body. Reported observations:
// bodies <=5KB got responses, >=6KB stalled. 5000 bytes is a conservative
// budget inside the successful range; it is NOT a proven network threshold.
const REGRESSION_BUDGET_BYTES = 5000;

assert.ok(compactBytes < REGRESSION_BUDGET_BYTES, `compacted body fits the ${REGRESSION_BUDGET_BYTES}-byte regression budget (got ${compactBytes})`);
assert.ok(
  compactBytes <= fullBytes * 0.5,
  `compaction removes at least half the body (${fullBytes} -> ${compactBytes} bytes)`
);
console.log(`[match-result-compaction] T1 body bytes: full=${fullBytes} compacted=${compactBytes} budget=${REGRESSION_BUDGET_BYTES} bytes`);

for (const field of ['lineupRows', 'shotsTable', 'eventsText', 'developerHints']) {
  assert.equal(Object.prototype.hasOwnProperty.call(record, field), false, `${field} is absent from the POST record`);
}
console.log('[match-result-compaction] T2 verbose fields absent: ok');

assert.equal(JSON.stringify(record.tacticTelemetry), tacticTelemetryBefore, 'tacticTelemetry is byte-identical to the input');
assert.deepEqual(record.tacticTelemetry, tacticTelemetry, 'tacticTelemetry content is unchanged');
console.log('[match-result-compaction] T3 tacticTelemetry verbatim: ok');

assert.equal(record.resultKey, engine.buildResultKey(snapshot), 'resultKey is the canonical dedup key');
assert.equal(record.status, 'finished', 'status survives');
assert.deepEqual(record.score, { home: 2, away: 1 }, 'score survives');
assert.equal(record.gameId, 'game-469', 'gameId survives');
assert.equal(typeof record.parsedAt, 'number', 'parsedAt survives');
assert.deepEqual(record.teams, [111, 222], 'teams survive');
assert.equal(record.myTeam, 111, 'myTeam survives');
assert.equal(record.recordType, 'match_result', 'recordType survives');
assert.equal(record.resultType, 'finished_match', 'resultType survives');
assert.equal(record.schemaVersion, 2, 'schemaVersion survives');
console.log('[match-result-compaction] T4 server-consumed fields unchanged: ok');

// ---------------------------------------------------------------------------
// T5: the source snapshot is untouched; player observations still flow.
// ---------------------------------------------------------------------------
assert.equal(snapshot.lineupRows, lineupRowsBefore, 'snapshot.lineupRows is the same array reference (never mutated)');
assert.equal(snapshot.lineupRows.length, 38, 'snapshot still carries all 38 lineup rows');
const observationsPost = posts.find(post => post.kind === 'post' && String(post.collection).startsWith('player_observations_v2'));
assert.ok(observationsPost, 'player observations POST was still issued');
assert.equal(observationsPost.payload.length, 38, 'all 38 lineup rows still produce player observations');
console.log('[match-result-compaction] T5 original snapshot + player observations intact: ok');

console.log('[match-result-transport-compaction-test] passed');
