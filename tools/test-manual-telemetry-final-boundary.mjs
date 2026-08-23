#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src/core', 'src/app', 'src/modules'];
const forbidden = [
  'startLive', 'stopLive', 'autoResumeIfNeeded', 'liveParserTimer',
  'lastSavedBucket', 'liveWaitStatus', 'liveStartedAt', 'liveSegmentSnapshots',
  'liveAutoResumeChecked', 'persistLiveState', 'loadLiveState', 'clearLiveState',
  'LIVE_PARSER_STATE_PREFIX', 'LIVE_RECOMMENDATION_HISTORY_LIMIT'
];

function filesUnder(relative) {
  const base = path.join(root, relative);
  if (!fs.existsSync(base)) return [];
  const output = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const item = path.join(base, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(path.relative(root, item)));
    else if (entry.isFile() && item.endsWith('.js')) output.push(item);
  }
  return output;
}

assert.equal(fs.existsSync(path.join(root, 'src/modules/live-parser')), false, 'legacy module directory still exists');
const sources = sourceRoots.flatMap(filesUnder);
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  for (const token of forbidden) {
    assert.equal(text.includes(token), false, `${path.relative(root, file)} still contains ${token}`);
  }
}

const header = fs.readFileSync(path.join(root, 'src/app/userscript-header.js'), 'utf8');
assert.doesNotMatch(header, /live parser/i);
assert.match(header, /manual match telemetry/i);

const runtime = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-match-runtime.js'), 'utf8');
const stateIntegrity = fs.readFileSync(path.join(root, 'src/modules/manual-match-telemetry/manual-state-integrity.js'), 'utf8');
assert.match(stateIntegrity, /manualStatePrefix = 'slf_manual_match_state_v1'/);
assert.match(stateIntegrity, /legacyStatePrefix = 'slf_live_parser_state_v2'/);
assert.doesNotMatch(runtime, /setItem\([^\n]*legacyStatePrefix/);
assert.match(stateIntegrity, /readStoredState\(legacyStatePrefix/);

console.log('[manual-telemetry-final-boundary-test] passed');
