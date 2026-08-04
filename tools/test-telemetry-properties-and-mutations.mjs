#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const root = process.cwd();
const snapshotPath = 'src/modules/manual-match-telemetry/snapshot-engine.js';
const runtimePath = 'src/modules/manual-match-telemetry/manual-match-runtime.js';
const artifactPath = 'releases/latest.user.js';
const budgetPath = 'data/quality/reliability-budget-v1.json';

const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = relativePath => JSON.parse(read(relativePath));

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function token(next, prefix = 'v') {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789_-Жé';
  let value = prefix;
  const length = 2 + Math.floor(next() * 10);
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(next() * alphabet.length)];
  }
  return value;
}

function loadSnapshotEngine(source) {
  const context = {
    console, Date, JSON, Object, Array, Map, Set, Number, String, Promise,
    location: { href: 'https://slf.fm/game.php?id=property-test' }
  };
  vm.createContext(context);
  vm.runInContext(`${source}\n;globalThis.__SnapshotEngine = SnapshotEngine;`, context, {
    filename: snapshotPath
  });
  return context.__SnapshotEngine;
}

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function loadEffectKey(source) {
  return vm.runInNewContext(`(${extractNamedFunction(source, 'getDeterministicEffectKey')})`, {});
}

function loadLegacyNormalizer(source) {
  const functionSource = extractNamedFunction(source, 'normalizeLegacyManualState');
  return vm.runInNewContext(`(() => {
    const manualStateSchema = 'slf_manual_match_state_v1';
    const cloneForStorage = value => value == null ? value : JSON.parse(JSON.stringify(value));
    return (${functionSource});
  })()`, { JSON, Date, Number, String });
}

function makeSnapshot(next) {
  return {
    ts: Math.floor(next() * 1e12),
    gameId: token(next, 'game-'),
    status: ['live', 'halftime', 'finished'][Math.floor(next() * 3)],
    minute: Math.floor(next() * 121),
    bucket: ['01-15', '16-30', '31-45', '46-60', '61-75', '76-90'][Math.floor(next() * 6)],
    score: { home: Math.floor(next() * 7), away: Math.floor(next() * 7) },
    teams: [Math.floor(next() * 99999) + 1, Math.floor(next() * 99999) + 1],
    retryCount: Math.floor(next() * 5),
    source: { collectedAt: Math.floor(next() * 1e12) }
  };
}

function assertSnapshotProperties(engine, cases, seed) {
  const next = createPrng(seed);
  for (let index = 0; index < cases; index += 1) {
    const snapshot = makeSnapshot(next);
    const key = engine.buildSnapshotKey(snapshot);
    assert.match(key, /^match_snapshot\|/);
    assert.equal(engine.buildSnapshotKey({
      ...snapshot,
      ts: snapshot.ts + 1,
      retryCount: snapshot.retryCount + 1,
      source: { collectedAt: snapshot.source.collectedAt + 1, retry: true }
    }), key, 'snapshot identity changed with transport metadata');

    for (const [field, value] of [
      ['gameId', token(next, 'other-game-')],
      ['status', snapshot.status === 'live' ? 'finished' : 'live'],
      ['minute', snapshot.minute + 1],
      ['bucket', `${snapshot.bucket}-other`],
      ['score', { ...snapshot.score, home: snapshot.score.home + 1 }],
      ['teams', [snapshot.teams[0], snapshot.teams[1] + 100000]]
    ]) {
      assert.notEqual(engine.buildSnapshotKey({ ...snapshot, [field]: value }), key, `snapshot ${field}`);
    }

    const resultKey = engine.buildResultKey(snapshot);
    assert.match(resultKey, /^match_result\|/);
    assert.equal(engine.buildResultKey({
      ...snapshot,
      status: snapshot.status === 'live' ? 'finished' : 'live',
      minute: snapshot.minute + 30,
      bucket: 'other',
      ts: snapshot.ts + 99,
      retryCount: 99
    }), resultKey, 'result identity changed with runtime metadata');
    for (const [field, value] of [
      ['gameId', token(next, 'other-result-')],
      ['score', { ...snapshot.score, away: snapshot.score.away + 1 }],
      ['teams', [snapshot.teams[0] + 100000, snapshot.teams[1]]]
    ]) {
      assert.notEqual(engine.buildResultKey({ ...snapshot, [field]: value }), resultKey, `result ${field}`);
    }
  }
}

function assertEffectProperties(buildKey, cases, seed) {
  const next = createPrng(seed ^ 0x9e3779b9);
  for (let index = 0; index < cases; index += 1) {
    const gameId = token(next, 'effect-game-');
    const eventKey = `preset_event|${gameId}|${index}`;
    const effect = { gameId, effectKey: `legacy|${index}`, ts: index, delta: { xG: next() } };
    const pending = { gameId, eventKey, ts: index };
    const key = buildKey(effect, pending);
    assert.equal(key, `preset_effect|${gameId}|${eventKey}`);
    assert.equal(buildKey({ ...effect, ts: index + 1, delta: { xG: 999 } }, { ...pending, ts: index + 2 }), key);
    assert.notEqual(buildKey(effect, { ...pending, eventKey: `${eventKey}-other` }), key);
    assert.notEqual(buildKey({ ...effect, gameId: `${gameId}-other` }, pending), key);
    assert.equal(buildKey(effect, null), effect.effectKey);
  }
}

function assertMigrationProperties(normalize, cases, seed) {
  const next = createPrng(seed ^ 0x85ebca6b);
  for (let index = 0; index < cases; index += 1) {
    const gameId = token(next, 'migration-game-');
    const event = { gameId, eventKey: `preset_event|${gameId}|${index}`, nested: { index } };
    const legacy = {
      schema: 'slf_live_parser_state_v2', gameId, ts: index,
      url: `https://slf.fm/game.php?id=${gameId}`,
      pendingPresetEvent: event, pendingEffectRetry: index % 2 === 0,
      consumedPresetEventKey: null, manualTacticEventPending: false,
      recommendationFreeze: { index }, presetProgression: { index },
      lastRecommendationHtml: `<p>${index}</p>`, lastRecommendationMeta: { index },
      liveParserTimer: 123, compactSnapshot: { stale: true }
    };
    const migrated = normalize(legacy, gameId);
    assert.ok(migrated);
    assert.equal(migrated.schema, 'slf_manual_match_state_v1');
    assert.equal(migrated.migratedFrom, 'slf_live_parser_state_v2');
    assert.equal(Object.hasOwn(migrated, 'liveParserTimer'), false);
    assert.equal(Object.hasOwn(migrated, 'compactSnapshot'), false);
    assert.notEqual(migrated.pendingPresetEvent, legacy.pendingPresetEvent);
    assert.equal(JSON.stringify(migrated.pendingPresetEvent), JSON.stringify(legacy.pendingPresetEvent));
    assert.equal(normalize({ ...legacy, schema: 'unknown' }, gameId), null);
    assert.equal(normalize(legacy, `${gameId}-other`), null);
  }
}

function expectKilled(label, test) {
  try {
    test();
  } catch (error) {
    if (error?.name === 'AssertionError') return 1;
    throw error;
  }
  throw new assert.AssertionError({ message: `mutation survived: ${label}` });
}

const budget = readJson(budgetPath);
const snapshotSource = read(snapshotPath);
const runtimeSource = read(runtimePath);
const artifactSource = read(artifactPath);
const bundleOrder = readJson('src/app/bundle-order.json');
const cases = budget.fuzz.javascriptCases;
const seed = budget.fuzz.seed;

const parseStart = performance.now();
new vm.Script(artifactSource, { filename: artifactPath });
const parseMs = performance.now() - parseStart;
const bytes = Buffer.byteLength(artifactSource, 'utf8');
assert.ok(bytes <= budget.artifact.maxBytes, `artifact bytes ${bytes}`);
assert.ok(parseMs <= budget.artifact.maxParseMilliseconds, `artifact parse ${parseMs.toFixed(1)}ms`);
assert.equal(bundleOrder.files.length, budget.bundle.expectedModules);

assertSnapshotProperties(loadSnapshotEngine(snapshotSource), cases, seed);
assertEffectProperties(loadEffectKey(runtimeSource), cases, seed);
assertMigrationProperties(loadLegacyNormalizer(runtimeSource), Math.min(cases, 500), seed);

const intervals = (artifactSource.match(/\bsetInterval\s*\(/g) || []).length;
const observers = (artifactSource.match(/\bnew\s+MutationObserver\s*\(/g) || []).length;
assert.ok(intervals <= budget.runtimeStaticInventory.maxSetIntervalCalls, `setInterval inventory ${intervals}`);
assert.ok(observers <= budget.runtimeStaticInventory.maxMutationObservers, `MutationObserver inventory ${observers}`);
const scheduleSource = extractNamedFunction(runtimeSource, 'scheduleManualWatcher');
assert.ok(
  scheduleSource.includes(`attempts >= ${budget.runtimeStaticInventory.manualWatcherMaxAttempts}`),
  'manual watcher attempt boundary changed'
);
assert.match(
  scheduleSource,
  new RegExp(`\\},\\s*${budget.runtimeStaticInventory.manualWatcherInstallIntervalMilliseconds}\\);`),
  'manual watcher interval changed'
);

let killed = 0;
killed += expectKilled('snapshot prefix', () => {
  const mutated = snapshotSource.replace("'match_snapshot',", "'match_snapshot_mutated',");
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectKilled('snapshot minute', () => {
  const mutated = snapshotSource.replace("            snapshot.minute ?? '',\n", '');
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectKilled('snapshot score', () => {
  const mutated = snapshotSource.replace('            this.getScoreKey(snapshot.score),\n', "            '',\n");
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectKilled('result score', () => {
  const needle = 'this.getScoreKey(snapshot.score)';
  const first = snapshotSource.indexOf(needle);
  const second = snapshotSource.indexOf(needle, first + 1);
  assert.ok(second >= 0);
  const mutated = snapshotSource.slice(0, second) + "''" + snapshotSource.slice(second + needle.length);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectKilled('effect prefix', () => {
  const source = extractNamedFunction(runtimeSource, 'getDeterministicEffectKey');
  const mutated = source.replace("'preset_effect'", "'preset_effect_mutated'");
  assert.notEqual(mutated, source);
  assertEffectProperties(vm.runInNewContext(`(${mutated})`, {}), 10, seed);
});
killed += expectKilled('migration schema', () => {
  const source = extractNamedFunction(runtimeSource, 'normalizeLegacyManualState');
  const mutated = source.replace('schema: manualStateSchema', 'schema: legacy.schema');
  assert.notEqual(mutated, source);
  const normalize = vm.runInNewContext(`(() => {
    const manualStateSchema = 'slf_manual_match_state_v1';
    const cloneForStorage = value => value == null ? value : JSON.parse(JSON.stringify(value));
    return (${mutated});
  })()`, { JSON, Date, Number, String });
  assertMigrationProperties(normalize, 10, seed);
});

assert.ok(killed >= budget.mutationSentinels.minimumKilled, `killed ${killed} mutations`);
console.log(
  `[telemetry-properties] passed: cases=${cases} mutationsKilled=${killed} bytes=${bytes} parseMs=${parseMs.toFixed(1)} intervals=${intervals} observers=${observers}`
);
