#!/usr/bin/env node
// B9: PresetUsageTracker.record must survive localStorage quota errors.
// Each setItem write is guarded independently: a quota failure warns via
// debugWarn but never aborts the preset-apply path, and the usage is still
// recorded through the remaining working storage path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/core/config.js'), 'utf8');

// config.js is a bundle fragment: PresetStorage / MatchStateParser live in
// sibling fragments sharing the bundle scope, so inject minimal stubs.
const prelude = `
const PresetStorage = { getAllLabels: () => ({ Quota_Preset: 'Quota Preset' }) };
const MatchStateParser = { getGameId: () => 'game-quota-test' };
`;

function buildTracker({ failKeys }) {
    const warnings = [];
    const storage = new Map();
    const context = {
        console: {
            warn: (...args) => warnings.push(args.map(String).join(' ')),
            log: () => {},
            error: () => {}
        },
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem(key, value) {
                if (failKeys === '*' || failKeys.includes(key)) {
                    throw new Error('QuotaExceededError: localStorage write failed');
                }
                storage.set(key, String(value));
            },
            removeItem: key => storage.delete(key)
        },
        Date,
        JSON
    };
    vm.createContext(context);
    vm.runInContext(
        `${prelude}\n${source}\n;globalThis.__Tracker = PresetUsageTracker; globalThis.__CONFIG = CONFIG;`,
        context,
        { filename: 'config.js' }
    );
    context.__CONFIG.DEBUG = true; // debugWarn gates on CONFIG.DEBUG
    return { tracker: context.__Tracker, warnings, storage };
}

// --- Case 1: quota error on the "last preset" write; recent-presets write works.
{
    const { tracker, warnings, storage } = buildTracker({ failKeys: ['slf_last_selected_preset_v1'] });

    assert.doesNotThrow(
        () => tracker.record('Quota_Preset', { minute: 12, source: 'preset_apply' }),
        'record must survive a quota error on the last-preset write'
    );
    assert.ok(
        warnings.some(w => w.includes('failed to persist last preset')),
        `quota failure must be warned, warnings: ${JSON.stringify(warnings)}`
    );
    // Usage still recorded via the surviving storage path + in-memory bookkeeping.
    assert.deepEqual(
        tracker.getRecentNames(),
        ['Quota_Preset'],
        'recent presets must still record the usage after a quota error'
    );
    assert.equal(tracker.getLastName(), null, 'failed persist must fail open (getLast returns null)');
    assert.equal(tracker.getLast(), null, 'getLast must not throw after a failed persist');
    assert.ok(storage.has('slf_recent_selected_presets_v1'), 'recent-presets write must still land');
}

// --- Case 2: total quota exhaustion (every setItem throws) — record still survives.
{
    const { tracker, warnings } = buildTracker({ failKeys: '*' });

    assert.doesNotThrow(
        () => tracker.record('Quota_Preset', { minute: 30 }),
        'record must survive total localStorage quota exhaustion'
    );
    assert.ok(
        warnings.some(w => w.includes('failed to persist last preset')),
        'last-preset quota failure must be warned'
    );
    assert.ok(
        warnings.some(w => w.includes('failed to persist recent presets')),
        'recent-presets quota failure must be warned'
    );
    assert.equal(tracker.getRecentNames().length, 0, 'no partial state may be exposed after total failure');
}

console.log('OK: PresetUsageTracker.record survives quota errors and still records usage');
