#!/usr/bin/env node
// B6: PresetStorage server-sync failures must not be silent.
// - failed delete-key / merge posts record lastSyncError/lastSyncAt + console.warn
// - loadFromServerAndMerge onError/final-catch records the failure, stays fail-open
//   (callback still fires, local presets still returned), and warns exactly once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
    path.join(root, 'src/modules/tactics-presets/preset-storage.js'),
    'utf8'
);

const STORAGE_KEY = 'slf_tactics_test_v1';

function buildSandbox(api) {
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
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        Date,
        JSON,
        Promise,
        CONFIG: { STORAGE_KEY, COLLECTIONS: { TACTICS: 'tactics' } },
        Api: api,
        BASE_PRESETS: {},
        BASE_LABELS: {},
        DEFAULT_CUSTOM_PRESETS: {},
        debugWarn: (...args) => warnings.push(args.map(String).join(' '))
    };
    vm.createContext(context);
    vm.runInContext(`${source}\n;globalThis.__PresetStorage = PresetStorage;`, context, {
        filename: 'preset-storage.js'
    });
    return { PresetStorage: context.__PresetStorage, warnings, storage };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Failing API: get() invokes onError(error, response) then still rejects;
// post() rejects (transport failure without any error callback).
const serverError = Object.assign(new Error('VPS 500'), { status: 500 });
const api = {
    get(url, onSuccess, onError) {
        if (onError) onError(serverError, { status: 500 });
        return Promise.reject(serverError);
    },
    post(url, body, label) {
        return Promise.reject(Object.assign(new Error(`post failed: ${label}`), { label }));
    }
};

const { PresetStorage, warnings, storage } = buildSandbox(api);

const LOCAL_PRESETS = {
    My_Local_Preset: { def_line: '2', press_line: '3', corner: '1', priority: [] },
    Old_Preset: { def_line: '3', press_line: '2', priority: [] }
};
storage.set(STORAGE_KEY, JSON.stringify(LOCAL_PRESETS));

assert.equal(PresetStorage.lastSyncError, null, 'initial lastSyncError must be null');
assert.equal(PresetStorage.lastSyncAt, null, 'initial lastSyncAt must be null');

// 1. saveCustom: delete-key post (Old_Preset) and merge post both fail.
PresetStorage.saveCustom({ My_Local_Preset: LOCAL_PRESETS.My_Local_Preset });
await flush();
await flush();

assert.ok(
    PresetStorage.lastSyncError && PresetStorage.lastSyncError.includes('tactics merge'),
    `merge failure must be recorded in lastSyncError, got: ${JSON.stringify(PresetStorage.lastSyncError)}`
);
assert.equal(typeof PresetStorage.lastSyncAt, 'number', 'lastSyncAt must be set on failure');
assert.ok(PresetStorage.lastSyncAt > 0, 'lastSyncAt must be a timestamp');
assert.ok(
    warnings.some(w => w.includes('sync failure') && w.includes('tactics merge')),
    `console.warn must fire on merge failure, warnings: ${JSON.stringify(warnings)}`
);
assert.ok(
    warnings.some(w => w.includes('delete-key (Old_Preset)')),
    `console.warn must fire on delete-key failure, warnings: ${JSON.stringify(warnings)}`
);

// 2. loadFromServerAndMerge: server error path.
const warnsBeforeLoad = warnings.length;
let callbackRan = false;
const loadResult = await PresetStorage.loadFromServerAndMerge(() => {
    callbackRan = true;
});

assert.equal(loadResult, undefined, 'loadFromServerAndMerge must stay fail-open (resolve, not reject)');
assert.equal(callbackRan, true, 'callback must still fire after a server error');
assert.ok(
    PresetStorage.lastSyncError.includes('tactics load'),
    `load failure must be recorded in lastSyncError, got: ${JSON.stringify(PresetStorage.lastSyncError)}`
);
assert.ok(warnings.length > warnsBeforeLoad, 'console.warn must fire on load failure');
const loadWarnings = warnings.slice(warnsBeforeLoad).filter(w => w.includes('tactics load'));
assert.equal(loadWarnings.length, 1, `exactly one warning per load failure, got: ${loadWarnings.length}`);

// 3. Fail-open: local presets are still returned after the sync failures.
const local = PresetStorage.loadCustom();
assert.ok(local.My_Local_Preset, 'local presets must still be returned after sync failures');
assert.equal(local.My_Local_Preset.def_line, '2', 'local preset content must be intact');

console.log('OK: preset-storage sync failures are recorded (lastSyncError/lastSyncAt), warned, and fail-open');
