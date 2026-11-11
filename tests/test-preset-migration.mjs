#!/usr/bin/env node
// #409 wave 2: PresetMigration — migration coordinator + identity sidecar.
// Proves: source precedence (DEFAULT_CUSTOM_PRESETS > VPS > legacy local >
// seeds), destination-wins (existing native name never overwritten),
// idempotency (re-run after success issues zero saves), resumability after
// an interrupted run, loud quota rejection (server_rejected aborts the
// queue, receipt reports applied + remaining, resume works), deprecated
// names never imported, receipt persistence with the name->id identity map,
// VPS read failure = skipped non-fatal source, NO tactic_delete calls ever,
// cache/managedNames updates through the recordMigratedTemplate seam, and
// read-time stale detection when a migrated template is deleted externally.
// NativeTemplateApi is REAL; failures are injected at the fetch and Api
// seams. No live network. No automatic trigger: loading the modules issues
// zero requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const nativeSource = read('src/modules/tactics-presets/native-template-api.js');
const storageSource = read('src/modules/tactics-presets/preset-storage.js');
const migrationSource = read('src/modules/tactics-presets/preset-migration.js');

const STORAGE_KEY = 'slf_custom_presets_test';
const NATIVE_KEY = `${STORAGE_KEY}_native_v1`;
const RECEIPT_KEY = 'slf_preset_migration_receipt_v1';

// ---- fixtures ---------------------------------------------------------------
const BASE_VECTOR = {
    def_line: '2', press_line: '2', def_width: '2', press_intense: '2',
    build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
    style: '3', pass_risk: '2', dribble: '2', cross: '2', corner: '1', shot: '2',
    priority: []
};
const vec = (overrides = {}, priority) => {
    const vector = Object.assign({}, BASE_VECTOR, overrides);
    vector.priority = priority ? priority.slice() : [];
    return vector;
};
const SITE_A = {
    def_line: 2, press_line: 3, def_width: 1, press_intense: 4,
    build_type: 1, build_temp: 2, build_long: 3, build_fast: 1,
    style: 5, pass_risk: 2, dribble: 5, cross: 1, corner: 2, shot: 3,
    priority_l: 1, priority_c: 0, priority_r: 1
};
const item = (id, name, time, data, userId = 6945) => ({
    id: String(id), user_id: userId, name, data, time: String(time), order: 1,
    share_token: 'tok', share_url: 'https://x/s'
});
const clone = value => JSON.parse(JSON.stringify(value));

function makeSandbox({ basePresets = {}, defaultCustom = {}, legacyLocal = null,
    tacticItems = [], vpsData = null, vpsError = null, saveBehavior = null,
    setItemThrowsFor = null } = {}) {
    const warnings = [];
    const storage = new Map();
    const fetchCalls = [];
    const apiCalls = [];
    if (legacyLocal) storage.set(STORAGE_KEY, JSON.stringify(legacyLocal));

    const context = {
        console: {
            warn: (...a) => warnings.push(a.map(String).join(' ')),
            log: () => {},
            error: () => {}
        },
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => {
                // Test seam: simulate a localStorage quota failure for
                // selected keys (string key or predicate).
                const shouldThrow = typeof setItemThrowsFor === 'function'
                    ? setItemThrowsFor(k)
                    : (setItemThrowsFor != null && k === setItemThrowsFor);
                if (shouldThrow) throw new Error('simulated localStorage quota failure');
                storage.set(k, String(v));
            },
            removeItem: k => storage.delete(k)
        },
        Date, JSON, Promise, setTimeout, clearTimeout,
        CONFIG: { STORAGE_KEY, COLLECTIONS: { TACTICS: 'tactics' } },
        BASE_PRESETS: basePresets,
        BASE_LABELS: {},
        DEFAULT_CUSTOM_PRESETS: defaultCustom,
        debugWarn: (...a) => warnings.push(a.map(String).join(' ')),
        location: { pathname: '/team4.php?action=tactic' },
        Api: {
            getPromise: (collection, label) => {
                apiCalls.push({ collection, label });
                if (vpsError) return Promise.reject(vpsError);
                return Promise.resolve({ data: clone(vpsData), response: {}, status: 200 });
            }
        }
    };
    context.unsafeWindow = context;
    context.window = context;
    context.globalThis = context;
    context.foot_login_id = 6945;
    context.TACTIC_CFG = { items: clone(tacticItems || []) };

    // Fetch seam: tactic_save echoes the requested vector back as an ack;
    // tactic_delete would ack too — the tests assert it is NEVER called.
    let saveCount = 0;
    context.fetch = (url, opts) => {
        const action = new URL(String(url), 'https://x').searchParams.get('a');
        const body = String((opts && opts.body) || '');
        fetchCalls.push({ action, body });
        if (action === 'tactic_delete') return Promise.resolve(jsonResponse({ success: 1 }));
        saveCount += 1;
        const behavior = typeof saveBehavior === 'function' ? saveBehavior(saveCount, body) : 'ack';
        if (behavior === 'quota') return Promise.resolve(jsonResponse({ success: -6 }));
        if (behavior === 'network') return Promise.reject(new Error('simulated network failure'));
        const params = new URLSearchParams(body);
        const data = {};
        for (const [k, v] of params) {
            if (k.startsWith('data[')) data[k.slice(5, -1)] = Number(v);
        }
        return Promise.resolve(jsonResponse({
            success: 1,
            tactic: {
                id: String(9000 + saveCount), user_id: 6945,
                name: params.get('name'), data, time: String(3000 + saveCount), order: saveCount
            }
        }));
    };

    vm.createContext(context);
    vm.runInContext(nativeSource, context, { filename: 'native-template-api.js' });
    vm.runInContext(storageSource, context, { filename: 'preset-storage.js' });
    vm.runInContext(`${migrationSource}\n;globalThis.__PM = PresetMigration;`, context, {
        filename: 'preset-migration.js'
    });
    return {
        pm: context.__PM,
        ps: context.__PS || vm.runInContext('PresetStorage', context),
        warnings,
        storage,
        fetchCalls,
        apiCalls,
        context
    };
}
const jsonResponse = payload => ({
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload))
});
const envelopeOf = storage => JSON.parse(storage.get(NATIVE_KEY));
const receiptOf = storage => JSON.parse(storage.get(RECEIPT_KEY));
const saveNames = calls => calls.filter(c => c.action === 'tactic_save')
    .map(call => new URLSearchParams(call.body).get('name'));
const assertNoDeletes = calls => assert.equal(
    calls.filter(call => call.action === 'tactic_delete').length, 0,
    'migration must NEVER issue tactic_delete calls'
);
// Cross-realm safety: arrays returned from the vm sandbox carry the sandbox
// realm's Array prototype — deepStrictEqual against a host-realm literal
// fails on prototype identity even with identical contents. Materialize
// host-realm arrays before comparing.
const namesOf = arr => Array.from(arr, entry => entry.name);

// ---- 0. No automatic trigger: loading the modules issues zero requests ------
{
    const { fetchCalls, apiCalls } = makeSandbox({});
    assert.equal(fetchCalls.length, 0, 'module load issues zero site requests');
    assert.equal(apiCalls.length, 0, 'module load issues zero VPS requests');
}

// ---- 1. Precedence: DEFAULT_CUSTOM_PRESETS > VPS > legacy local > seeds -----
// + receipt persistence, name->id identity map, managedNames, facade read.
{
    const seedVector = vec({ def_line: '1' });
    const { pm, ps, storage, fetchCalls, apiCalls } = makeSandbox({
        basePresets: {
            standard: vec({ style: '4' }, ['right']),
            SeedOnly: vec({ style: '1' })
        },
        defaultCustom: { balanced: vec({ style: '3' }, ['center']) },
        legacyLocal: { FromLocal: vec({ style: '2' }), Alpha: vec({ def_line: '1' }) },
        vpsData: { Alpha: vec({ def_line: '3' }), VpsOnly: vec({ style: '5' }, ['left']) }
    });

    // No auto-run: nothing ran before the explicit click-equivalent call.
    assert.equal(fetchCalls.length, 0);
    assert.equal(apiCalls.length, 0);

    const result = await pm.run();

    assert.equal(result.ok, true, 'full migration succeeds');
    assert.equal(result.code, 'ok');
    assertNoDeletes(fetchCalls);
    assert.equal(apiCalls.length, 1, 'exactly one VPS tactics read');
    assert.equal(apiCalls[0].collection, 'tactics');

    const created = result.created;
    const byName = {};
    created.forEach(entry => { byName[entry.name] = entry; });
    assert.deepEqual(
        namesOf(created).sort(),
        ['Alpha', 'FromLocal', 'VpsOnly', 'balanced', 'standard', 'SeedOnly'].sort()
    );
    assert.equal(byName.Alpha.source, 'vps_tactics', 'VPS beats legacy local and seeds on collision');
    assert.equal(byName.balanced.source, 'default_custom', 'DEFAULT_CUSTOM_PRESETS win over everything');
    assert.equal(byName.FromLocal.source, 'legacy_local', 'legacy local beats seeds');
    assert.equal(byName.standard.source, 'seed');
    assert.equal(byName.SeedOnly.source, 'seed');
    assert.equal(byName.VpsOnly.source, 'vps_tactics');

    // The imported VECTOR follows the same precedence: Alpha carries the VPS
    // vector (def_line 3), not the legacy (1) or seed (2) one.
    const alphaCall = fetchCalls.find(call => call.action === 'tactic_save'
        && new URLSearchParams(call.body).get('name') === 'Alpha');
    assert.equal(new URLSearchParams(alphaCall.body).get('data[def_line]'), '3',
        'VPS vector wins the collision');

    // Identity sidecar: receipt maps every created name to its site id.
    const receipt = receiptOf(storage);
    assert.equal(receipt.schema, 'slf_preset_migration_receipt_v1');
    assert.equal(receipt.applied.length, 6);
    created.forEach(entry => {
        const mapped = receipt.applied.find(entry2 => entry2.name === entry.name);
        assert.ok(mapped, `receipt records ${entry.name}`);
        assert.equal(mapped.id, entry.id);
        assert.equal(mapped.source, entry.source);
        assert.ok(receipt.vectorFingerprints[entry.name], 'vector fingerprint recorded');
    });
    assert.ok(receipt.ts > 0);

    // Cache envelope updated through the recordMigratedTemplate seam.
    const env = envelopeOf(storage);
    assert.equal(env.items.length, 6);
    assert.equal(env.userId, '6945');
    const managed = new Set(env.managedNames);
    created.forEach(entry => assert.ok(managed.has(entry.name), `${entry.name} joins managedNames`));
    assert.equal(env.items[0].share_token, undefined, 'no share material in the cache');

    // The facade now serves the migrated presets from the native store.
    const presets = clone(ps.getAllPresets());
    assert.equal(presets.Alpha.def_line, '3');
    assert.equal(presets.balanced.style, '3');
    assert.equal(ps.getManagedPresetNames().length, 6);
}

// ---- 2. Destination-wins: existing native name is never overwritten --------
{
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        tacticItems: [item('7001', 'Alpha', 100, SITE_A)],
        legacyLocal: { Alpha: vec({ def_line: '3' }) }
    });

    const result = await pm.run();

    assert.equal(result.ok, true);
    // 'Alpha' exists natively -> no save for it; the seed 'standard' is not
    // in the inventory and is still created (destination-wins is per name).
    assert.deepEqual(saveNames(fetchCalls), ['standard'],
        'no save for the existing native name; other sources still migrate');
    assertNoDeletes(fetchCalls);
    const existsSkip = result.skipped.find(entry => entry.name === 'Alpha');
    assert.ok(existsSkip, 'Alpha reported as skipped');
    assert.equal(existsSkip.reason, 'exists');
    assert.deepEqual(namesOf(result.created), ['standard']);

    // The native vector of the existing template is untouched.
    const env = envelopeOf(storage);
    assert.equal(env.items.length, 2);
    assert.ok(env.items.some(entry => entry.id === '7001' && entry.name === 'Alpha'));
    const alpha = env.items.find(entry => entry.name === 'Alpha');
    assert.equal(alpha.data.def_line, '2', 'existing template vector untouched (canonical string form)');
    assert.deepEqual(receiptOf(storage).applied.map(entry => entry.name), ['standard']);
}

// ---- 3. Idempotency: re-run after full success issues zero saves ------------
{
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        legacyLocal: { One: vec({ style: '2' }), Two: vec({ style: '1' }) }
    });

    const first = await pm.run();
    assert.equal(first.ok, true);
    assert.equal(saveNames(fetchCalls).length, 3);
    const appliedAfterFirst = clone(receiptOf(storage).applied);
    const fingerprintsAfterFirst = clone(receiptOf(storage).vectorFingerprints);

    const second = await pm.run();

    assert.equal(saveNames(fetchCalls).length, 3, 're-run issued ZERO new saves');
    assert.equal(second.ok, true);
    assert.equal(second.created.length, 0);
    assert.deepEqual(
        namesOf(second.skipped).sort(),
        ['One', 'Two', 'standard']
    );
    second.skipped.forEach(entry => assert.equal(entry.reason, 'already_migrated',
        `every source name is skipped as already_migrated (got ${entry.reason} for ${entry.name})`));

    // The identity sidecar is unchanged by the no-op re-run (applied map and
    // vector fingerprints; skipped is per-run reporting, ts is per-write).
    const receipt2 = receiptOf(storage);
    assert.deepEqual(receipt2.applied, appliedAfterFirst);
    assert.deepEqual(receipt2.vectorFingerprints, fingerprintsAfterFirst);
    assertNoDeletes(fetchCalls);
}

// ---- 4. Resumability: quota abort mid-queue, re-run completes the rest ------
{
    let quotaFrom = 3; // save ordinal from which the server rejects (save limit)
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        legacyLocal: { One: vec({ style: '2' }), Two: vec({ style: '1' }), Three: vec({ style: '5' }) },
        saveBehavior: n => (n >= quotaFrom ? 'quota' : 'ack')
    });

    // Run 1: standard + One saved, Two rejected -> loud abort, Three not tried.
    const first = await pm.run();
    assert.equal(first.ok, false, 'aborted run is not ok');
    assert.equal(first.code, 'aborted');
    assert.equal(first.aborted, true);
    assert.deepEqual(namesOf(first.created), ['standard', 'One'],
        'exactly the saves before the rejection were applied');
    assert.equal(first.failed.length, 1);
    assert.equal(first.failed[0].name, 'Two');
    assert.equal(first.failed[0].code, 'server_rejected');
    const threeSkip = first.skipped.find(entry => entry.name === 'Three');
    assert.ok(threeSkip, 'remaining queue entry reported');
    assert.equal(threeSkip.reason, 'aborted_after_rejection');

    // The partial progress is PERSISTED: the receipt carries the 2 applied.
    const partialReceipt = receiptOf(storage);
    assert.deepEqual(partialReceipt.applied.map(entry => entry.name), ['standard', 'One']);

    // Run 2 (server accepts again): ONLY the missing names are created.
    quotaFrom = Infinity;
    const second = await pm.run();

    assert.equal(second.ok, true);
    assert.deepEqual(saveNames(fetchCalls).slice(3), ['Two', 'Three'],
        're-run creates only the names missing from the receipt (index 3 = the rejected Two attempt)');
    assert.equal(second.created.length, 2);
    const finalReceipt = receiptOf(storage);
    assert.deepEqual(finalReceipt.applied.map(entry => entry.name).sort(),
        ['One', 'Three', 'Two', 'standard']);
    // No duplicates in the native inventory.
    const env = envelopeOf(storage);
    assert.equal(env.items.length, 4);
    assert.equal(new Set(env.items.map(entry => entry.id)).size, 4, 'no duplicate template ids');
    assertNoDeletes(fetchCalls);
}

// ---- 5. Quota rejection detail: failed entry carries the server rejection ---
{
    const { pm, fetchCalls, storage } = makeSandbox({
        legacyLocal: { One: vec({ style: '2' }), Two: vec({ style: '1' }), Three: vec({ style: '5' }) },
        saveBehavior: () => 'quota'
    });

    const result = await pm.run();

    assert.equal(result.ok, false);
    assert.equal(result.aborted, true);
    assert.equal(result.code, 'aborted');
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].name, 'One');
    assert.equal(result.failed[0].code, 'server_rejected',
        'the failed entry carries the server save-limit rejection');
    assert.ok(result.failed[0].message.includes('One'), 'message names the rejected template');
    assert.equal(saveNames(fetchCalls).length, 1, 'queue stops at the first rejection');
    // What remains unapplied is reported and persisted for the resume.
    assert.deepEqual(namesOf(result.skipped), ['Two', 'Three']);
    result.skipped.forEach(entry => assert.equal(entry.reason, 'aborted_after_rejection'));
    assert.deepEqual(receiptOf(storage).applied, [], 'nothing recorded as applied');
    assertNoDeletes(fetchCalls);
}

// ---- 6. Deprecated names are never imported ---------------------------------
// Both names are genuinely in PresetStorage's retired built-in list.
{
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        legacyLocal: { Henta_Hold_def3: vec({ style: '2' }), GoodLocal: vec({ style: '1' }) },
        vpsData: { Klopp_Gegenpress_att4: vec({ style: '5' }), VpsGood: vec({ style: '3' }) }
    });

    const result = await pm.run();

    assert.equal(result.ok, true);
    assert.deepEqual(namesOf(result.created).sort(),
        ['GoodLocal', 'VpsGood', 'standard'], 'only non-deprecated names created');
    const deprecatedSkips = result.skipped.filter(entry => entry.reason === 'deprecated');
    assert.deepEqual(namesOf(deprecatedSkips).sort(),
        ['Henta_Hold_def3', 'Klopp_Gegenpress_att4'],
        'deprecated names reported as skipped with the deprecated reason');
    assert.equal(saveNames(fetchCalls).filter(name =>
        name === 'Henta_Hold_def3' || name === 'Klopp_Gegenpress_att4').length, 0,
        'no save is issued for a deprecated name');
    const receipt = receiptOf(storage);
    assert.equal(receipt.applied.length, 3);
    receipt.applied.forEach(entry => assert.notEqual(entry.name, 'Henta_Hold_def3'));
    const env = envelopeOf(storage);
    env.items.forEach(entry => {
        assert.ok(entry.name !== 'Henta_Hold_def3' && entry.name !== 'Klopp_Gegenpress_att4',
            'deprecated names never reach the native inventory');
    });
    assertNoDeletes(fetchCalls);
}

// ---- 7. VPS read failure is a non-fatal skipped source ----------------------
{
    const { pm, fetchCalls, apiCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        legacyLocal: { One: vec({ style: '2' }) },
        defaultCustom: { balanced: vec({ style: '3' }) },
        vpsData: { VpsOnly: vec({ style: '5' }) },
        vpsError: new Error('vps unreachable')
    });

    const result = await pm.run();

    assert.equal(result.ok, true, 'VPS failure does not fail the migration');
    assert.equal(result.code, 'ok');
    assert.equal(apiCalls.length, 1, 'exactly one VPS read attempted');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].source, 'vps_tactics');
    assert.equal(result.sources[0].ok, false, 'the vps source is reported as failed');
    assert.ok(/unreachable/.test(result.sources[0].reason), 'the failure reason is named');
    assert.deepEqual(namesOf(result.created).sort(),
        ['One', 'balanced', 'standard'], 'remaining sources migrated');
    assert.ok(!result.created.some(entry => entry.name === 'VpsOnly'));
    const receipt = receiptOf(storage);
    assert.equal(receipt.applied.length, 3);
    assertNoDeletes(fetchCalls);
}

// ---- 8. Stale detection: externally deleted template is marked stale --------
{
    const { pm, ps, context, storage, fetchCalls } = makeSandbox({
        legacyLocal: { One: vec({ style: '2' }), Two: vec({ style: '1' }) }
    });

    const first = await pm.run();
    assert.equal(first.ok, true);
    assert.equal(first.staleNames.length, 0, 'nothing stale after a clean run');

    // External deletion + fresh page state: the page-embedded inventory no
    // longer carries the migrated templates and the ingest fingerprint is
    // reset (new tab). A valid-empty read is canonical -> the cache clears.
    context.TACTIC_CFG.items = [];
    ps.lastIngestFingerprint = null;
    assert.equal(ps.refreshNativeState(), 'native');

    const reconciliation = pm.reconcileReceipt(true);
    assert.equal(reconciliation.unavailable, undefined, 'scope is readable — staleness is decidable');
    assert.deepEqual(Array.from(reconciliation.stale).sort(), ['One', 'Two'],
        'applied entries whose site template disappeared are marked stale');

    // The stale marking is persisted on the receipt.
    const persisted = receiptOf(storage);
    assert.deepEqual(persisted.stale.slice().sort(), ['One', 'Two']);
    assert.ok(persisted.reconciledAt > 0, 'reconciledAt recorded');

    // Receipt idempotency holds anyway: a re-run still skips the stale names
    // (re-migration requires clearing the receipt — documented semantics).
    const rerun = await pm.run();
    assert.equal(rerun.ok, true);
    assert.equal(rerun.created.length, 0, 'stale names are NOT silently re-imported');
    rerun.skipped.forEach(entry => assert.equal(entry.reason, 'already_migrated'));
    assert.equal(saveNames(fetchCalls).length, 2, 're-run issues zero saves');
    assertNoDeletes(fetchCalls);
    assert.deepEqual(receiptOf(storage).applied.map(entry => entry.name).sort(), ['One', 'Two']);
}

// ---- 9. dryRun previews without writing anything ----------------------------
{
    const { pm, ps, fetchCalls, apiCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        // 'Existing' is BOTH a legacy source and a native template: the
        // preview must report it as destination-wins (reason 'exists').
        legacyLocal: { One: vec({ style: '2' }), Existing: vec({ def_line: '3' }) },
        tacticItems: [item('7001', 'Existing', 100, SITE_A)]
    });

    // Establish the scoped cache first so the dry-run's refresh is a no-op
    // and the envelope comparison is byte-exact.
    ps.refreshNativeState();
    const envBefore = clone(envelopeOf(storage));

    const preview = await pm.run({ dryRun: true });

    assert.equal(preview.ok, true);
    assert.equal(preview.receipt, null, 'no receipt object from a preview');
    assert.deepEqual(namesOf(preview.created).sort(), ['One', 'standard'],
        'preview reports would-create names');
    preview.created.forEach(entry => assert.equal(entry.id, null, 'preview ids are null'));
    const existsSkip = preview.skipped.find(entry => entry.name === 'Existing');
    assert.ok(existsSkip && existsSkip.reason === 'exists',
        'the colliding source name is previewed as destination-wins');
    assert.equal(fetchCalls.length, 0, 'dryRun issues zero site writes');
    assert.equal(storage.has(RECEIPT_KEY), false, 'dryRun writes no receipt');
    assert.deepEqual(envelopeOf(storage), envBefore, 'native cache byte-identical');
    assert.equal(apiCalls.length, 1, 'dryRun still reads the VPS archive (pinned actual behavior)');

    // A real run afterwards still creates everything the preview promised.
    const real = await pm.run();
    assert.equal(real.ok, true);
    assert.deepEqual(saveNames(fetchCalls), ['standard', 'One'],
        'real run creates exactly the previewed names (seed before legacy, per merged order)');
    assert.equal(receiptOf(storage).applied.length, 2);
    assertNoDeletes(fetchCalls);
}

// ---- 10. Explicit no-delete: unmanaged native names are never touched -------
{
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        tacticItems: [item('7001', 'OrphanNative', 100, SITE_A), item('7002', 'Managed', 101, SITE_A)],
        legacyLocal: { Managed: vec({ style: '2' }) }
    });

    const result = await pm.run();

    assertNoDeletes(fetchCalls);
    // 'OrphanNative' is in NO source: migration neither deletes nor rewrites
    // it — even an unmanaged native template is untouchable.
    const env = envelopeOf(storage);
    assert.equal(env.items.length, 3, 'orphan + pre-existing Managed + created seed');
    const orphan = env.items.find(entry => entry.name === 'OrphanNative');
    assert.ok(orphan, 'orphan survives the migration');
    assert.equal(orphan.id, '7001');
    assert.equal(orphan.data.def_line, '2', 'orphan vector untouched (canonical string form)');
    // 'Managed' exists natively -> destination-wins, no save; only the seed is created.
    assert.deepEqual(saveNames(fetchCalls), ['standard']);
    assert.deepEqual(namesOf(result.created), ['standard']);
    const managedSkip = result.skipped.find(entry => entry.name === 'Managed');
    assert.ok(managedSkip && managedSkip.reason === 'exists');
    assert.equal(receiptOf(storage).applied.length, 1);
}

// ---- 11. Ambiguous save outcome: unknown list, conservative re-run skip -----
// A network-class failure means the server MAY have created the template:
// the name is recorded in receipt.unknown (never applied — no id exists),
// the receipt is persisted immediately, and a re-run skips the name.
{
    let networkOnSave = 2;
    const { pm, fetchCalls, storage } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        legacyLocal: { One: vec({ style: '2' }), Two: vec({ style: '1' }), Three: vec({ style: '5' }) },
        saveBehavior: n => (n === 2 ? 'network' : 'ack')
    });

    const first = await pm.run();
    assert.equal(first.ok, false);
    assert.equal(first.code, 'aborted');
    assert.equal(first.aborted, true);
    assert.equal(first.failed.length, 1);
    assert.equal(first.failed[0].name, 'One');
    assert.equal(first.failed[0].code, 'network');
    assert.ok(first.failed[0].message.includes('исход сохранения неизвестен'),
        'the failed entry says the save outcome is unknown');
    assert.ok(first.message.includes('обновления страницы'),
        'the result message tells the owner to reload and check the site');
    // Incremental persistence: the acked 1st save is already on disk, and
    // the ambiguous name is recorded as unknown — never as applied.
    const receipt1 = receiptOf(storage);
    assert.deepEqual(receipt1.applied.map(entry => entry.name), ['standard']);
    assert.equal(receipt1.unknown.length, 1);
    assert.equal(receipt1.unknown[0].name, 'One');
    assert.equal(receipt1.unknown[0].source, 'legacy_local');
    assert.ok(receipt1.unknown[0].ts > 0);

    // Re-run: the unknown name is skipped conservatively (zero saves for it),
    // the remaining names are created normally.
    const second = await pm.run();
    assert.equal(second.ok, true);
    assert.deepEqual(saveNames(fetchCalls).slice(2), ['Two', 'Three'],
        're-run never re-saves the ambiguous name; the rest migrate');
    const unknownSkip = second.skipped.find(entry => entry.name === 'One');
    assert.ok(unknownSkip && unknownSkip.reason === 'unknown_outcome_previous',
        'the ambiguous name is skipped as unknown_outcome_previous');
    const finalReceipt = receiptOf(storage);
    assert.deepEqual(namesOf(finalReceipt.applied).sort(), ['Three', 'Two', 'standard']);
    assert.equal(finalReceipt.unknown.length, 1, 'unknown entry stays until the receipt is cleared');
    assert.equal(finalReceipt.unknown[0].name, 'One');
    assertNoDeletes(fetchCalls);
}

// ---- 12. Cache-write resilience: a failed cache write never loses an ack ----
{
    let failCacheWrites = false;
    const { pm, ps, fetchCalls, storage, warnings } = makeSandbox({
        basePresets: { standard: vec({ style: '4' }) },
        setItemThrowsFor: key => failCacheWrites && key === NATIVE_KEY
    });

    // Establish the scoped cache first: run()'s refresh then takes the
    // unchanged-fingerprint path (no ingest write) and the ONLY native-cache
    // write is the migration's recordMigratedTemplate — which now throws.
    ps.refreshNativeState();
    failCacheWrites = true;

    const result = await pm.run();

    assert.equal(result.ok, true, 'a cache-write failure does not fail the run');
    assert.equal(result.created.length, 1);
    assert.ok(result.created[0].id, 'the acked save is in created');
    assert.deepEqual(receiptOf(storage).applied.map(entry => entry.name), ['standard'],
        'the acked save lands in the receipt even when the cache write fails');
    assert.ok(warnings.some(line => /кэш/.test(line)), 'the cache-write failure was reported');
    assertNoDeletes(fetchCalls);
}

// ---- 13. Reconcile with an unreadable scope: report, never guess ------------
{
    const { pm, context, storage } = makeSandbox({
        legacyLocal: { One: vec({ style: '2' }) }
    });
    const first = await pm.run();
    assert.equal(first.ok, true);

    // Fresh page state without a page user: the scoped cache is unreadable,
    // so staleness is undecidable — reconcile reports unavailable and marks
    // nothing.
    delete context.foot_login_id;
    const reconciliation = pm.reconcileReceipt(true);
    assert.equal(reconciliation.unavailable, true, 'unreadable scope reported');
    assert.deepEqual(Array.from(reconciliation.stale), [], 'no stale marks without a readable scope');
    assert.equal(receiptOf(storage).stale, undefined, 'the receipt was not modified');
}

console.log('test-preset-migration: all scenarios passed');
