#!/usr/bin/env node
// B6 (rewritten for #409): PresetStorage failures must not be silent.
// Native-failure equivalents — the sandbox deliberately does NOT provide
// NativeTemplateApi (the module guard makes the store unavailable):
// - saveCustom fails LOUD: structured SLFPresetWriteError (native_unavailable),
//   lastSyncError/lastSyncAt recorded, console.warn fired, nothing persisted;
// - loadFromServerAndMerge stays fail-open: resolves (never rejects), the
//   callback fires exactly once per call on every outcome;
// - reads fail open: pre-migration local presets keep working, the legacy
//   storage key is never touched by failed writes.
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

function buildSandbox() {
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
        // Deliberately NO NativeTemplateApi here: the module guard must keep
        // preset-storage.js standalone-safe and fail open (pre-migration
        // continuity) instead of crashing the sandbox.
        CONFIG: { STORAGE_KEY },
        BASE_PRESETS: { standard: { def_line: '2', press_line: '2', priority: [] } },
        BASE_LABELS: { standard: 'Стандарт' },
        DEFAULT_CUSTOM_PRESETS: {},
        debugWarn: (...args) => warnings.push(args.map(String).join(' '))
    };
    vm.createContext(context);
    vm.runInContext(`${source}\n;globalThis.__PresetStorage = PresetStorage;`, context, {
        filename: 'preset-storage.js'
    });
    return { PresetStorage: context.__PresetStorage, warnings, storage };
}

const { PresetStorage, warnings, storage } = buildSandbox();

const LOCAL_PRESETS = {
    My_Local_Preset: { def_line: '2', press_line: '3', corner: '1', priority: [] },
    Old_Preset: { def_line: '3', press_line: '2', priority: [] }
};
storage.set(STORAGE_KEY, JSON.stringify(LOCAL_PRESETS));

assert.equal(PresetStorage.lastSyncError, null, 'initial lastSyncError must be null');
assert.equal(PresetStorage.lastSyncAt, null, 'initial lastSyncAt must be null');
assert.equal(PresetStorage.readSource, 'unavailable', 'initial readSource is unavailable');
assert.equal(PresetStorage.nativeStale, true, 'initial nativeStale is true');

// 1. saveCustom with an unreachable native store: fails LOUD, persists nothing.
const localBefore = storage.get(STORAGE_KEY);
await assert.rejects(
    () => PresetStorage.saveCustom({ My_Local_Preset: LOCAL_PRESETS.My_Local_Preset }),
    error => error.name === 'SLFPresetWriteError' && error.code === 'native_unavailable',
    'saveCustom must throw a structured SLFPresetWriteError when the store is unreachable'
);

assert.ok(
    PresetStorage.lastSyncError && PresetStorage.lastSyncError.includes('native save (store unreachable)'),
    `save failure must be recorded in lastSyncError, got: ${JSON.stringify(PresetStorage.lastSyncError)}`
);
assert.equal(typeof PresetStorage.lastSyncAt, 'number', 'lastSyncAt must be set on failure');
assert.ok(PresetStorage.lastSyncAt > 0, 'lastSyncAt must be a timestamp');
assert.ok(
    warnings.some(w => w.includes('sync failure') && w.includes('native save (store unreachable)')),
    `console.warn must fire on the failed save, warnings: ${JSON.stringify(warnings)}`
);
assert.equal(
    storage.get(STORAGE_KEY),
    JSON.stringify(LOCAL_PRESETS),
    'a failed save must never touch the pre-migration local storage'
);

// 2. loadFromServerAndMerge: fail-open, callback fires exactly once per call.
let callbackCount = 0;
const loadResult = await PresetStorage.loadFromServerAndMerge(() => { callbackCount += 1; });
await PresetStorage.loadFromServerAndMerge(() => { callbackCount += 1; });

assert.equal(loadResult, undefined, 'loadFromServerAndMerge must resolve (fail-open), never reject');
assert.equal(callbackCount, 2, 'callback must fire exactly once per call (two calls -> two firings)');

// 3. Fail-open reads: pre-migration presets are still served after the failures.
const local = PresetStorage.loadCustom();
assert.ok(local.My_Local_Preset, 'local presets must still be returned after sync failures');
assert.equal(local.My_Local_Preset.def_line, '2', 'local preset content must be intact');

const all = PresetStorage.getAllPresets();
assert.ok(all.My_Local_Preset, 'getAllPresets serves the pre-migration composite');
assert.ok(all.standard, 'BASE_PRESETS overlay present while the native store is unavailable');

const labels = PresetStorage.getAllLabels();
assert.equal(labels.My_Local_Preset, 'My_Local_Preset', 'labels fall back to the name');
assert.equal(labels.standard, 'Стандарт', 'BASE_LABELS served in the fallback');

console.log('OK: preset-storage native-store failures are loud (SLFPresetWriteError + lastSyncError/lastSyncAt + console.warn), reads stay fail-open, callback fires exactly once');
