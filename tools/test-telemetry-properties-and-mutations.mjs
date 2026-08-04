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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function createPrng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(next, values) {
  return values[Math.floor(next() * values.length)];
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
    console,
    Date,
    JSON,
    Object,
    Array,
    Map,
    Set,
    Number,
    String,
    Promise,
    location: { href: 'https://slf.fm/game.php?id=property-test' }
  };
  vm.createContext(context);
  vm.runInContext(`${source}\n;globalThis.__SnapshotEngine = SnapshotEngine;`, context, {
    filename: snapshotPath
  });
  return context.__SnapshotEngine;
}

function extractNamedFunction(source, name) {
  const needle = `function ${name}`;
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `missing function ${name}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `missing function body ${name}`);

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

function loadDeterministicEffectKey(source) {
  const functionSource = extractNamedFunction(source, 'getDeterministicEffectKey');
  return vm.runInNewContext(`(${functionSource})`, {});
}

function loadLegacyNormalizer(source) {
  const functionSource = extractNamedFunction(source, 'normalizeLegacyManualState');
  const wrapper = `(() => {
    const manualStateSchema = 'slf_manual_match_state_v1';
    const cloneForStorage = value => value == null ? value : JSON.parse(JSON.stringify(value));
    return (${functionSource});
  })()`;
  return vm.runInNewContext(wrapper, { JSON, Date, Number, String });
}

function makeSnapshot(next, overrides = {}) {
  return {
    ts: Math.floor(next() * 1e12),
    gameId: token(next, 'game-'),
    status: pick(next, ['live', 'halftime', 'finished']),
    minute: Math.floor(next() * 121),
    bucket: pick(next, ['01-15', '16-30', '31-45', '46-60', '61-75', '76-90']),
    score: { home: Math.floor(next() * 7), away: Math.floor(next() * 7) },
    teams: [Math.floor(next() * 99999) + 1, Math.floor(next() * 99999) + 1],
    retryCount: Math.floor(next() * 5),
    source: { collectedAt: Math.floor(next() * 1e12) },
    ...overrides
  };
}

function assertSnapshotProperties(engine, cases, seed) {
  const next = createPrng(seed);
  for (let index = 0; index < cases; index += 1) {
    const snapshot = makeSnapshot(next);
    const baseline = engine.buildSnapshotKey(snapshot);
    assert.match(baseline, /^match_snapshot\|/, 'snapshot key prefix changed');

    const retryVariant = {
      ...snapshot,
      ts: snapshot.ts + 1000,
      retryCount: snapshot.retryCount + 1,
      source: { collectedAt: snapshot.source.collectedAt + 5000, retry: true }
    };
    assert.equal(
      engine.buildSnapshotKey(retryVariant),
      baseline,
      'snapshot identity must ignore transport and retry metadata'
    );

    const dimensions = [
      ['gameId', token(next, 'changed-game-')],
      ['status', snapshot.status === 'live' ? 'finished' : 'live'],
      ['minute', Number(snapshot.minute) + 1],
      ['bucket', `${snapshot.bucket}-changed`],
      ['score', { ...snapshot.score, home: snapshot.score.home + 1 }],
      ['teams', [snapshot.teams[0], snapshot.teams[1] + 100000]]
    ];
    for (const [field, value] of dimensions) {
      assert.notEqual(
        engine.buildSnapshotKey({ ...snapshot, [field]: value }),
        baseline,
        `snapshot identity must change with ${field}`
      );
    }

    const resultBaseline = engine.buildResultKey({ ...snapshot, status: 'finished' });
    assert.match(resultBaseline, /^match_result\|/, 'result key prefix changed');
    assert.equal(
      engine.buildResultKey({
        ...snapshot,
        status: 'live',
        minute: snapshot.minute + 25,
        bucket: 'other',
        ts: snapshot.ts + 99999,
        retryCount: 77
      }),
      resultBaseline,
      'result identity must ignore runtime timing and retry metadata'
    );
    for (const [field, value] of [
      ['gameId', token(next, 'result-game-')],
      ['score', { ...snapshot.score, away: snapshot.score.away + 1 }],
      ['teams', [snapshot.teams[0] + 100000, snapshot.teams[1]]]
    ]) {
      assert.notEqual(
        engine.buildResultKey({ ...snapshot, [field]: value }),
        resultBaseline,
        `result identity must change with ${field}`
      );
    }
  }
}

function assertEffectProperties(buildEffectKey, cases, seed) {
  const next = createPrng(seed ^ 0x9e3779b9);
  for (let index = 0; index < cases; index += 1) {
    const gameId = token(next, 'effect-game-');
    const eventKey = `preset_event|${gameId}|${Math.floor(next() * 100000)}`;
    const pending = { gameId, eventKey, ts: Math.floor(next() * 1e12) };
    const effect = {
      gameId,
      ts: Math.floor(next() * 1e12),
      delta: { xG: next(), shots: Math.floor(next() * 20) },
      effectKey: `legacy|${next()}`
    };
    const baseline = buildEffectKey(effect, pending);
    assert.equal(baseline, `preset_effect|${gameId}|${eventKey}`);
    assert.equal(
      buildEffectKey({ ...effect, ts: effect.ts + 10000, delta: { xG: 999 } }, { ...pending, ts: pending.ts + 10 }),
      baseline,
      'effect identity must ignore observation time and metric changes'
    );
    assert.notEqual(
      buildEffectKey(effect, { ...pending, eventKey: `${eventKey}-other` }),
      baseline,
      'effect identity must change when source event identity changes'
    );
    assert.notEqual(
      buildEffectKey({ ...effect, gameId: `${gameId}-other` }, pending),
      baseline,
      'effect identity must change when effect game identity changes'
    );
    assert.equal(buildEffectKey(effect, null), effect.effectKey, 'effect without pending event must retain original key');
  }
}

function assertMigrationProperties(normalizeLegacy, cases, seed) {
  const next = createPrng(seed ^ 0x85ebca6b);
  for (let index = 0; index < cases; index += 1) {
    const gameId = token(next, 'migration-game-');
    const eventKey = `preset_event|${gameId}|${index}`;
    const legacy = {
      schema: 'slf_live_parser_state_v2',
      gameId,
      ts: Math.floor(next() * 1e12),
      url: `https://slf.fm/game.php?id=${gameId}`,
      pendingPresetEvent: { gameId, eventKey, nested: { value: index } },
      pendingEffectRetry: index % 2 === 0,
      consumedPresetEventKey: index % 3 === 0 ? eventKey : null,
      manualTacticEventPending: index % 5 === 0,
      recommendationFreeze: { gameId, index },
      presetProgression: { rank: index },
      lastRecommendationHtml: `<p>${index}</p>`,
      lastRecommendationMeta: { index },
      liveParserTimer: 123,
      compactSnapshot: { stale: true }
    };
    const migrated = normalizeLegacy(legacy, gameId);
    assert.ok(migrated, 'valid legacy state must migrate');
    assert.equal(migrated.schema, 'slf_manual_match_state_v1');
    assert.equal(migrated.gameId, gameId);
    assert.equal(migrated.migratedFrom, 'slf_live_parser_state_v2');
    assert.equal(Object.hasOwn(migrated, 'liveParserTimer'), false);
    assert.equal(Object.hasOwn(migrated, 'compactSnapshot'), false);
    assert.notEqual(migrated.pendingPresetEvent, legacy.pendingPresetEvent, 'migration must clone nested state');
    assert.deepEqual(migrated.pendingPresetEvent, legacy.pendingPresetEvent);
    assert.equal(normalizeLegacy({ ...legacy, schema: 'unknown' }, gameId), null);
    assert.equal(normalizeLegacy(legacy, `${gameId}-other`), null);
  }
}

function expectMutationKilled(label, run) {
  let killed = false;
  try {
    run();
  } catch (error) {
    if (error instanceof assert.AssertionError || error?.name === 'AssertionError') killed = true;
    else throw error;
  }
  assert.equal(killed, true, `mutation survived: ${label}`);
  return 1;
}

const budget = readJson(budgetPath);
const snapshotSource = read(snapshotPath);
const runtimeSource = read(runtimePath);
const artifactSource = read(artifactPath);
const cases = budget.fuzz.javascriptCases;
const seed = budget.fuzz.seed;

const parseStarted = performance.now();
new vm.Script(artifactSource, { filename: artifactPath });
const parseMilliseconds = performance.now() - parseStarted;
const artifactBytes = Buffer.byteLength(artifactSource, 'utf8');
assert.ok(artifactBytes <= budget.artifact.maxBytes, `artifact size ${artifactBytes} exceeds ${budget.artifact.maxBytes}`);
assert.ok(parseMilliseconds <= budget.artifact.maxParseMilliseconds, `artifact parse ${parseMilliseconds.toFixed(1)}ms exceeds budget`);

const engine = loadSnapshotEngine(snapshotSource);
const deterministicEffectKey = loadDeterministicEffectKey(runtimeSource);
const normalizeLegacy = loadLegacyNormalizer(runtimeSource);
assertSnapshotProperties(engine, cases, seed);
assertEffectProperties(deterministicEffectKey, cases, seed);
assertMigrationProperties(normalizeLegacy, Math.min(cases, 500), seed);

const intervalCount = (artifactSource.match(/\bsetInterval\s*\(/g) || []).length;
const observerCount = (artifactSource.match(/\bnew\s+MutationObserver\s*\(/g) || []).length;
assert.ok(intervalCount <= budget.runtimeStaticInventory.maxSetIntervalCalls, `setInterval inventory ${intervalCount} exceeds budget`);
assert.ok(observerCount <= budget.runtimeStaticInventory.maxMutationObservers, `MutationObserver inventory ${observerCount} exceeds budget`);
assert.ok(runtimeSource.includes('const maxAttempts = 120;'), 'manual watcher installation must remain bounded to 120 attempts');
assert.ok(runtimeSource.includes('setInterval(tryInstall, 500)'), 'manual watcher installation interval changed');

let killed = 0;
killed += expectMutationKilled('snapshot prefix', () => {
  const mutated = snapshotSource.replace("'match_snapshot',", "'match_snapshot_mutated',");
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectMutationKilled('snapshot minute omitted', () => {
  const mutated = snapshotSource.replace("            snapshot.minute ?? '',\n", '');
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectMutationKilled('snapshot score omitted', () => {
  const mutated = snapshotSource.replace('            this.getScoreKey(snapshot.score),\n', "            '',\n");
  assert.notEqual(mutated, snapshotSource);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectMutationKilled('result score omitted', () => {
  const first = snapshotSource.indexOf('this.getScoreKey(snapshot.score)');
  const second = snapshotSource.indexOf('this.getScoreKey(snapshot.score)', first + 1);
  assert.ok(second >= 0);
  const mutated = snapshotSource.slice(0, second) + "''" + snapshotSource.slice(second + 'this.getScoreKey(snapshot.score)'.length);
  assertSnapshotProperties(loadSnapshotEngine(mutated), 10, seed);
});
killed += expectMutationKilled('effect prefix', () => {
  const functionSource = extractNamedFunction(runtimeSource, 'getDeterministicEffectKey');
  const mutatedFunction = functionSource.replace("'preset_effect'", "'preset_effect_mutated'");
  assert.notEqual(mutatedFunction, functionSource);
  const mutated = vm.runInNewContext(`(${mutatedFunction})`, {});
  assertEffectProperties(mutated, 10, seed);
});
killed += expectMutationKilled('migration remains legacy', () => {
  const functionSource = extractNamedFunction(runtimeSource, 'normalizeLegacyManualState');
  const mutatedFunction = functionSource.replace('schema: manualStateSchema', 'schema: legacy.schema');
  assert.notEqual(mutatedFunction, functionSource);
  const mutated = vm.runInNewContext(`(() => {
    const manualStateSchema = 'slf_manual_match_state_v1';
    const cloneForStorage = value => value == null ? value : JSON.parse(JSON.stringify(value));
    return (${mutatedFunction});
  })()`, { JSON, Date, Number, String });
  assertMigrationProperties(mutated, 10, seed);
});

assert.ok(killed >= budget.mutationSentinels.minimumKilled, `killed ${killed} mutation sentinels`);
console.log(
  `[telemetry-properties] passed: cases=${cases} mutationsKilled=${killed} bytes=${artifactBytes} parseMs=${parseMilliseconds.toFixed(1)} intervals=${intervalCount} observers=${observerCount}`
);
