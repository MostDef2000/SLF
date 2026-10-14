#!/usr/bin/env node
// B7: cleanupLegacyBrowserStorage must purge the full legacy chain v1..v9
// and never delete the scanner's currently active storageKey (the live key
// v3_meta is itself part of the declared chain, so the guard is load-bearing).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
    path.join(root, 'src/modules/transfer-analyzer/transfer-candidate-scanner.js'),
    'utf8'
);

const storage = new Map();
const removed = [];
const context = {
    console,
    URLSearchParams,
    location: { pathname: '/game.php', search: '' }, // not transfers.php -> start() no-ops
    document: { readyState: 'complete', addEventListener: () => {} },
    window: { addEventListener: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: {
        getItem: key => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => {
            removed.push(key);
            storage.delete(key);
        }
    }
};
vm.createContext(context);
vm.runInContext(`${source}\n;globalThis.__Scanner = TransferCandidateScanner;`, context, {
    filename: 'transfer-candidate-scanner.js'
});
const scanner = context.__Scanner;

const liveKey = scanner.storageKey;
assert.equal(liveKey, 'slf_transfer_candidate_scanner_v3_meta', 'live storageKey must be v3_meta');

// 1. The scanner itself must declare the complete legacy chain v1..v9
// (previously only [v1, v2] lived here; the rest depended on load-order
// mutation by the later storage policies).
const expectedChain = [
    'v1',
    'v2',
    'v3_meta',
    'v4_meta',
    'v5_meta',
    'v6_meta',
    'v7_meta',
    'v8_meta',
    'v9_meta'
].map(suffix => `slf_transfer_candidate_scanner_${suffix}`);
assert.deepEqual(
    [...scanner.legacyStorageKeys].sort(),
    [...expectedChain].sort(),
    'scanner must declare the full legacy storage chain v1..v9'
);

// Seed every legacy key, the live key (also in the chain), and an unrelated key.
[...expectedChain, liveKey, 'slf_unrelated_key'].forEach(key => storage.set(key, '{"keep":true}'));
removed.length = 0;

scanner.cleanupLegacyBrowserStorage();

// 2. Every legacy key except the live one is purged.
expectedChain
    .filter(key => key !== liveKey)
    .forEach(key => assert.equal(storage.has(key), false, `legacy key must be purged: ${key}`));

// 3. The live storageKey is never deleted — even though it is part of the chain.
assert.equal(storage.has(liveKey), true, `live storageKey must never be deleted: ${liveKey}`);
assert.equal(
    removed.includes(liveKey),
    false,
    'cleanup must not even attempt to remove the live storageKey'
);

// 4. Unrelated keys are untouched.
assert.equal(storage.has('slf_unrelated_key'), true, 'unrelated keys must be untouched');

console.log('OK: scanner purges legacy v1..v9 keys and never deletes the live storageKey');
