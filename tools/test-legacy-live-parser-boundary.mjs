#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reviewPath = path.join(root, 'data/audit/manual-match-symbol-review-v1.json');
const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkJs(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const srcRoot = path.join(root, 'src');
const files = walkJs(srcRoot);
const sourceByFile = new Map(
  files.map(file => [path.relative(root, file).replaceAll(path.sep, '/'), fs.readFileSync(file, 'utf8')])
);

const findings = [];
for (const item of review.symbols || []) {
  assert.ok(item.symbol, 'review entry missing symbol');
  assert.ok(item.token, `${item.symbol}: missing token`);
  assert.ok(item.owner, `${item.symbol}: missing owner`);
  assert.ok(item.classification, `${item.symbol}: missing classification`);
  assert.ok(Array.isArray(item.allowedFiles) && item.allowedFiles.length, `${item.symbol}: missing allowedFiles`);
  assert.ok(Array.isArray(item.evidence) && item.evidence.length, `${item.symbol}: missing evidence`);
  assert.ok(item.deletionStatus, `${item.symbol}: missing deletionStatus`);

  const tokenRegex = new RegExp(`\\b${escapeRegex(item.token)}\\b`, 'g');
  const observedFiles = [];
  let totalOccurrences = 0;

  for (const [file, source] of sourceByFile) {
    const count = [...source.matchAll(tokenRegex)].length;
    if (!count) continue;
    observedFiles.push(file);
    totalOccurrences += count;
  }

  assert.ok(observedFiles.includes(item.owner), `${item.symbol}: owner does not contain token`);
  const unexpectedFiles = observedFiles.filter(file => !item.allowedFiles.includes(file));
  assert.deepEqual(unexpectedFiles, [], `${item.symbol}: unreviewed reference files: ${unexpectedFiles.join(', ')}`);

  for (const pattern of item.forbiddenCallPatterns || []) {
    const regex = new RegExp(pattern, 'g');
    const calls = [];
    for (const [file, source] of sourceByFile) {
      const count = [...source.matchAll(regex)].length;
      if (count) calls.push({ file, count });
    }
    assert.deepEqual(calls, [], `${item.symbol}: forbidden active call detected`);
  }

  findings.push({
    symbol: item.symbol,
    classification: item.classification,
    totalOccurrences,
    files: observedFiles
  });
}

const bootstrap = sourceByFile.get('src/app/bootstrap.js') || '';
const uiLayer = sourceByFile.get('src/app/ui-layer.js') || '';
const snapshotEngine = sourceByFile.get('src/modules/live-parser/snapshot-engine.js') || '';
const eventTracker = sourceByFile.get('src/modules/live-parser/event-tracker.js') || '';
const runtimeIntegrity = sourceByFile.get('src/modules/live-parser/runtime-telemetry-integrity.js') || '';

assert.match(bootstrap, /Manual-only Coach Hint mode/);
assert.doesNotMatch(bootstrap, /SnapshotEngine\.(?:startLive|stopLive|autoResumeIfNeeded)\s*\(/);
assert.doesNotMatch(uiLayer, /SnapshotEngine\.(?:startLive|stopLive|autoResumeIfNeeded)\s*\(/);
assert.match(snapshotEngine, /STATE\.liveParserTimer\s*=\s*setInterval\s*\(/);
assert.match(snapshotEngine, /},\s*15000\s*\);/);
assert.match(eventTracker, /startManualTacticWatcher\s*\(\)/);
assert.doesNotMatch(eventTracker, /EventTracker\.startManualTacticWatcher\s*\(/);
assert.match(runtimeIntegrity, /function\s+installManualWatcher\s*\(/);
assert.match(runtimeIntegrity, /scheduleManualWatcher\s*\(\)/);
assert.match(runtimeIntegrity, /pendingPresetEvent/);
assert.match(runtimeIntegrity, /consumedPresetEventKey/);

console.log('[legacy-live-parser-boundary-test] passed');
for (const finding of findings) {
  console.log(`${finding.classification} ${finding.symbol} occurrences=${finding.totalOccurrences} files=${finding.files.join(',')}`);
}
