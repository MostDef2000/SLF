#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const source = fs.readFileSync(
  path.join(root, 'src/modules/manual-match-telemetry/snapshot-engine.js'),
  'utf8'
);

const context = {
  console,
  Object,
  Array,
  Date,
  JSON,
  String,
  Number,
  Promise,
  location: { href: 'https://slf.fm/game.php?id=g1' },
  SLF_VERSION_INFO: { scriptVersion: 'test' }
};
vm.createContext(context);
vm.runInContext(`${source}\n;globalThis.__SnapshotEngine = SnapshotEngine;`, context, {
  filename: 'snapshot-engine.js'
});

const engine = context.__SnapshotEngine;
const baseSnapshot = {
  gameId: 'g1',
  status: 'live',
  minute: 10,
  bucket: '01-15',
  score: { home: 1, away: 0 },
  teams: [1, 2],
  ts: 100,
  source: { collectedAt: 100 }
};
const retrySnapshot = {
  ...baseSnapshot,
  ts: 999,
  source: { collectedAt: 999, trigger: 'retry' },
  recommendationSource: 'manual_hint_button'
};

assert.equal(
  engine.buildSnapshotKey(baseSnapshot),
  engine.buildSnapshotKey(retrySnapshot),
  'retry-only metadata must not change snapshot identity'
);
assert.notEqual(
  engine.buildSnapshotKey(baseSnapshot),
  engine.buildSnapshotKey({ ...baseSnapshot, minute: 20, bucket: '16-30' }),
  'different generation snapshots must remain distinct'
);
assert.notEqual(
  engine.buildSnapshotKey(baseSnapshot),
  engine.buildSnapshotKey({ ...baseSnapshot, score: { home: 1, away: 1 } }),
  'a changed score must remain a distinct snapshot observation'
);

// Issue #327: two tactical actions may share minute, score and window.
const withPhaseA = {
  ...baseSnapshot,
  tacticalPhase: { phaseId: 'phase|g1|1|abc' },
  tacticalControlState: { revision: 1, fingerprint: 'def_line:1' }
};
const withPhaseB = {
  ...baseSnapshot,
  tacticalPhase: { phaseId: 'phase|g1|2|def' },
  tacticalControlState: { revision: 2, fingerprint: 'def_line:2' }
};
const withPhaseBackToA = {
  ...baseSnapshot,
  tacticalPhase: { phaseId: 'phase|g1|3|abc' },
  tacticalControlState: { revision: 3, fingerprint: 'def_line:1' }
};
assert.notEqual(engine.buildSnapshotKey(withPhaseA), engine.buildSnapshotKey(withPhaseB),
  'same-minute A -> B must retain distinct snapshot identity');
assert.notEqual(engine.buildSnapshotKey(withPhaseA), engine.buildSnapshotKey(withPhaseBackToA),
  'same-minute A -> B -> A must retain a second A snapshot');
assert.equal(engine.buildSnapshotKey(withPhaseB),
  engine.buildSnapshotKey({ ...withPhaseB, ts: 999, recommendationSource: 'retry' }),
  'retry of the same applied phase must be idempotent');

const firstResult = {
  ...baseSnapshot,
  status: 'finished',
  minute: 90,
  bucket: '76-90',
  ts: 1000
};
const retriedResult = {
  ...firstResult,
  minute: 95,
  bucket: '91-105',
  ts: 2000,
  source: { collectedAt: 2000, trigger: 'retry' }
};
assert.equal(
  engine.buildResultKey(firstResult),
  engine.buildResultKey(retriedResult),
  'the same finished result must keep one logical identity across retries'
);
assert.notEqual(
  engine.buildResultKey(firstResult),
  engine.buildResultKey({ ...firstResult, score: { home: 2, away: 0 } }),
  'different finished scores must not collide'
);

const record = engine.buildSnapshotRecord(baseSnapshot);
assert.equal(record.snapshotKey, engine.buildSnapshotKey(baseSnapshot));
assert.equal(record.recordType, 'match_snapshot');
assert.equal(record.source.scriptVersion, 'test');

console.log('[tactical-record-keys-test] passed');
