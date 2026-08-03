#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

config_path = ROOT / 'src/core/config.js'
config = config_path.read_text(encoding='utf-8')
needle = 'const LIVE_RECOMMENDATION_HISTORY_LIMIT = 8;\n\n'
if config.count(needle) != 1:
    raise RuntimeError(f'expected one obsolete recommendation limit, found {config.count(needle)}')
config_path.write_text(config.replace(needle, ''), encoding='utf-8')

manifest_path = ROOT / 'src/app/bundle-order.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
config_entry = next(entry for entry in manifest['dependencyAudit']['modules'] if entry['file'] == 'src/core/config.js')
config_entry['declares'] = [name for name in config_entry.get('declares', []) if name != 'LIVE_RECOMMENDATION_HISTORY_LIMIT']
config_entry['public'] = [name for name in config_entry.get('public', []) if name != 'LIVE_RECOMMENDATION_HISTORY_LIMIT']
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

old_test = ROOT / 'tools/test-legacy-live-parser-boundary.mjs'
new_test = ROOT / 'tools/test-manual-telemetry-legacy-boundary.mjs'
if not old_test.exists() or new_test.exists():
    raise RuntimeError('legacy-boundary test rename precondition failed')
old_test.rename(new_test)

for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or path.suffix not in {'.md', '.json', '.mjs', '.js', '.yml', '.yaml'}:
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    updated = text.replace('test-legacy-live-parser-boundary.mjs', 'test-manual-telemetry-legacy-boundary.mjs')
    if updated != text:
        path.write_text(updated, encoding='utf-8')

review_path = ROOT / 'data/audit/runtime-reachability-review-v1.json'
review = json.loads(review_path.read_text(encoding='utf-8'))
review['classificationDefinitions']['MIGRATION_ONLY'] = 'Read-only compatibility retained solely to migrate persisted data from a published predecessor.'
by_file = {item['file']: item for item in review['moduleReviews']}
by_file['src/core/config.js'].update({
    'classification': 'MIXED_ACTIVE_LEGACY',
    'evidence': [
        'CONFIG, STATE, preset tracking and utilities have active runtime consumers.',
        'Remaining legacy markers are collection aliases for historical server data and are unrelated to the removed live parser.'
    ]
})
for path in [
    'src/modules/match-reading/match-state-parser.js',
    'src/modules/match-reading/match-stats-parser.js',
    'src/modules/match-reading/squad-parser.js',
    'src/modules/manual-match-telemetry/snapshot-engine.js',
    'src/modules/manual-match-telemetry/event-tracker.js',
]:
    by_file[path]['classification'] = 'ACTIVE'
    by_file[path].pop('auditStatus', None)
by_file['src/modules/manual-match-telemetry/snapshot-engine.js']['evidence'] = [
    'Builds explicit manual snapshots and submits snapshots and finished results.',
    'Contains no automatic interval, live-state storage API or auto-resume path.'
]
by_file['src/modules/manual-match-telemetry/event-tracker.js']['evidence'] = [
    'Creates manual telemetry fingerprints, preset events and deterministic preset effects.',
    'Contains no duplicate watcher or automatic live-parser path.'
]
by_file['src/modules/manual-match-telemetry/manual-match-runtime.js'].update({
    'classification': 'ACTIVE',
    'evidence': [
        'Owns manual-state persistence, pending-event migration, deterministic effect keys, retry recovery and the active manual tactic watcher.',
        'The old storage key is read-only migration input; no legacy API or legacy write remains.'
    ]
})
review['symbolReviewQueue'] = [{
    'owner': 'src/modules/manual-match-telemetry/manual-match-runtime.js',
    'identifiers': ['slf_live_parser_state_v2'],
    'classification': 'MIGRATION_ONLY',
    'notes': 'Read-only fallback for users upgrading from a published predecessor. Manual writes use slf_manual_match_state_v1 only.'
}]
review['scope'] = 'Final review after removal of the automatic live parser. Active manual telemetry is separated; one read-only storage migration key remains.'
review['nonGoals'] = [
    'No tactical policy, preset or recommendation behavior is changed.',
    'No historical VPS data or deployment is changed.',
    'The read-only predecessor storage key is not removed before production acceptance.'
]
review['stage6'] = {
    'issue': 151,
    'status': 'repository_complete',
    'externalGate': 'post-release production manual event-to-effect verification'
}
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

final_test = ROOT / 'tools/test-manual-telemetry-final-boundary.mjs'
final_test.write_text(r'''#!/usr/bin/env node
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
assert.match(runtime, /manualStatePrefix = 'slf_manual_match_state_v1'/);
assert.match(runtime, /legacyStatePrefix = 'slf_live_parser_state_v2'/);
assert.doesNotMatch(runtime, /setItem\([^\n]*legacyStatePrefix/);
assert.match(runtime, /readStoredState\(legacyStatePrefix/);

console.log('[manual-telemetry-final-boundary-test] passed');
''', encoding='utf-8')

(ROOT / 'docs/audit/legacy-live-parser-stage6-final-2026-08-03.md').write_text('''# Legacy live-parser removal — Stage 6 final repository audit

Tracking issue: #151.

## Repository-complete state

- no automatic parser runtime;
- no loop-only state;
- no active module under `src/modules/live-parser/`;
- no legacy state write or compatibility API;
- userscript metadata describes manual match telemetry;
- no active source references removed live-parser symbols;
- the obsolete recommendation-history constant is removed.

## Deliberate migration exception

`slf_live_parser_state_v2:<gameId>` remains as read-only input in `loadManualState()`. New writes use `slf_manual_match_state_v1:<gameId>` exclusively. Clearing manual state removes both keys.

## External acceptance gate

Repository work is complete. Closing #151 requires a published post-Stage-6 userscript and one production manual event → effect verification on that version.
''', encoding='utf-8')

print('[stage6-final-audit] applied')
