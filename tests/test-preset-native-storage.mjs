#!/usr/bin/env node
// #409 wave 1: PresetStorage as a facade over native site templates.
// Proves: name-keyed facade over native items, scoped cache refresh +
// off-page stale fallback, valid-empty inventory, all-malformed keeps the
// previous cache, share.php/readonly rejection, user_id scope isolation,
// NO BASE_PRESETS overlay while the native store is present, pre-migration
// composite fallback when the store is fully unavailable, and the awaited
// saveCustom write protocol (happy / identical-skip / update=save+delete /
// pre-validation / server rejection / partial_replace / delete modes /
// retired-name protection). NativeTemplateApi is REAL; failures are injected
// at the page-config and fetch seams. No live network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const nativeSource = read('src/modules/tactics-presets/native-template-api.js');
const storageSource = read('src/modules/tactics-presets/preset-storage.js');

const STORAGE_KEY = 'slf_custom_presets_test';
const NATIVE_KEY = `${STORAGE_KEY}_native_v1`;

// ---- fixtures ---------------------------------------------------------------
const SITE_A = {
    def_line: 2, press_line: 3, def_width: 1, press_intense: 4,
    build_type: 1, build_temp: 2, build_long: 3, build_fast: 1,
    style: 5, pass_risk: 2, dribble: 5, cross: 1, corner: 2, shot: 3,
    priority_l: 1, priority_c: 0, priority_r: 1
};
const SITE_B = {
    def_line: 1, press_line: 2, def_width: 3, press_intense: 5,
    build_type: 2, build_temp: 1, build_long: 1, build_fast: 3,
    style: 1, pass_risk: 5, dribble: 1, cross: 3, corner: 1, shot: 1,
    priority_l: 0, priority_c: 1, priority_r: 0
};
const VECTOR_A = {
    def_line: '2', press_line: '3', def_width: '1', press_intense: '4',
    build_type: '1', build_temp: '2', build_long: '3', build_fast: '1',
    style: '5', pass_risk: '2', dribble: '5', cross: '1', corner: '2', shot: '3',
    priority: ['left', 'right']
};
const VECTOR_B = {
    def_line: '1', press_line: '2', def_width: '3', press_intense: '5',
    build_type: '2', build_temp: '1', build_long: '1', build_fast: '3',
    style: '1', pass_risk: '5', dribble: '1', cross: '3', corner: '1', shot: '1',
    priority: ['center']
};
const item = (id, name, time, data, userId = 6945) => ({
    id: String(id), user_id: userId, name, data, time: String(time), order: 1,
    share_token: 'tok', share_url: 'https://x/s'
});
const clone = value => JSON.parse(JSON.stringify(value));

function makeSandbox(options = {}) {
    // footLoginId:
    //   'property' (default) — foot_login_id as a plain sandbox-object property
    //     (the pre-#413 assumption; what every existing test relies on).
    //   'lexical' — a top-level `let foot_login_id = 6945;` in the page realm,
    //     the LIVE-SITE condition (team4.php?action=tactic line 2027). A lexical
    //     global does NOT create a window/unsafeWindow property, so the sandbox
    //     object has no foot_login_id property; the binding lives in the realm's
    //     global lexical environment and is only reachable by in-realm evaluation.
    //   'absent' — no binding at all (used with a fake document for the
    //     CSP-independent DOM fallback).
    // document: an optional fake document (e.g. { scripts: [{ textContent }] })
    //     exposed to the realm for the DOM-fallback path.
    const { footLoginId = 'property', document: fakeDocument } = options;
    const warnings = [];
    const storage = new Map();
    const context = {
        console: {
            warn: (...a) => warnings.push(a.map(String).join(' ')),
            log: () => {},
            error: () => {}
        },
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: k => storage.delete(k)
        },
        Date, JSON, Promise, setTimeout, clearTimeout,
        CONFIG: { STORAGE_KEY },
        BASE_PRESETS: { standard: { def_line: '2', press_line: '2', priority: [] } },
        BASE_LABELS: { standard: 'Стандарт' },
        DEFAULT_CUSTOM_PRESETS: {},
        debugWarn: (...a) => warnings.push(a.map(String).join(' ')),
        location: { pathname: '/team4.php?action=tactic' }
    };
    context.unsafeWindow = context;
    context.window = context;
    context.globalThis = context;
    // Page-global login id (present on tactic AND match pages): the read-time
    // scope validation compares it against the cache envelope's user_id.
    if (footLoginId === 'property') {
        context.foot_login_id = 6945;
    }
    if (fakeDocument) {
        context.document = fakeDocument;
    }
    vm.createContext(context);
    if (footLoginId === 'lexical') {
        // The binding persists in the context's global lexical environment
        // across scripts; it is realm-global, so it is visible to every script
        // loaded into this context (including the storage source below).
        vm.runInContext('let foot_login_id = 6945;', context);
    }
    vm.runInContext(nativeSource, context, { filename: 'native-template-api.js' });
    vm.runInContext(`${storageSource}\n;globalThis.__PS = PresetStorage;`, context, {
        filename: 'preset-storage.js'
    });
    return { ps: context.__PS, warnings, storage, context };
}

// Fetch responder: echoes the requested vector back as a save ack.
function echoAckFetch(calls, overrides = {}) {
    const fn = (url, opts) => {
        const action = new URL(String(url), 'https://x').searchParams.get('a');
        calls.push({ action, url: String(url), body: String((opts && opts.body) || '') });
        const behavior = overrides[action] || 'ack';
        if (behavior === 'reject') return Promise.resolve(jsonResponse({ success: -6 }));
        if (action === 'tactic_save') {
            const params = new URLSearchParams(opts.body);
            const data = {};
            for (const [k, v] of params) {
                if (k.startsWith('data[')) data[k.slice(5, -1)] = Number(v);
            }
            return Promise.resolve(jsonResponse({
                success: 1,
                tactic: {
                    id: String(5000 + calls.length), user_id: 6945,
                    name: params.get('name'), data, time: String(2000 + calls.length), order: 1
                }
            }));
        }
        return Promise.resolve(jsonResponse({ success: 1 }));
    };
    fn.calls = calls;
    return fn;
}
const jsonResponse = payload => ({
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload))
});
const envelopeOf = storage => JSON.parse(storage.get(NATIVE_KEY));

// ---- 1. Facade over native items + cache envelope + labels ------------------
{
    const { ps, context, storage } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A), item('5144', 'Block', 90, SITE_B)] };

    const presets = clone(ps.getAllPresets());
    assert.equal(ps.readSource, 'native', 'first read ingests the page config');
    assert.equal(ps.nativeStale, false);
    assert.ok(presets.Press, 'native items surface in the name-keyed facade');
    assert.ok(presets.Block);
    assert.equal(presets.standard, undefined, 'NO BASE_PRESETS overlay while the native store is present');
    assert.equal(presets.Press.def_line, '2', 'controls served as decimal strings');
    assert.deepEqual(presets.Press.priority, ['left', 'right']);
    assert.equal(presets.Block.def_line, '1');

    const env = envelopeOf(storage);
    assert.equal(env.schema, 'slf_native_preset_cache_v1');
    assert.equal(env.userId, '6945', 'cache scoped by site user_id');
    assert.equal(env.items.length, 2);
    assert.deepEqual(
        Object.keys(env.items[0]).sort(),
        ['data', 'id', 'name', 'time', 'userId'],
        'cache persists only id/userId/name/data/time'
    );
    assert.equal(env.items[0].share_token, undefined, 'share_token never persisted');
    assert.equal(env.items[0].share_url, undefined, 'share_url never persisted');
    assert.deepEqual(env.managedNames, []);

    const labels = clone(ps.getAllLabels());
    assert.equal(labels.Press, 'Press', 'label falls back to the name');
    assert.equal(labels.standard, undefined, 'no built-in label overlay while native store is present');

    // Second read of an unchanged page snapshot: served from cache, still fresh.
    assert.equal(ps.readSource, 'cache');
    assert.equal(ps.nativeStale, false, 'an unchanged page snapshot does not make the cache stale');
}

// ---- 2. Same-name duplicates resolve to the freshest item -------------------
{
    const { ps, context } = makeSandbox();
    context.TACTIC_CFG = {
        items: [
            item('9', 'Dup', 100, SITE_A),
            item('11', 'Dup', 100, SITE_B),  // same time, higher id wins
            item('10', 'Dup', 200, SITE_A)   // latest time wins outright
        ]
    };
    const presets = clone(ps.getAllPresets());
    assert.equal(presets.Dup.def_line, '2', 'latest time wins among same-name templates');
    assert.deepEqual(presets.Dup.priority, ['left', 'right']);

    const { ps: ps2, context: context2 } = makeSandbox();
    context2.TACTIC_CFG = { items: [item('9', 'Tie', 100, SITE_A), item('11', 'Tie', 100, SITE_B)] };
    assert.equal(clone(ps2.getAllPresets()).Tie.def_line, '1', 'time tie -> highest numeric id wins');
}

// ---- 3. Off-page stale fallback ---------------------------------------------
{
    const { ps, context } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    ps.loadCustom();
    delete context.TACTIC_CFG; // leave the tactic page

    const presets = clone(ps.loadCustom());
    assert.ok(presets.Press, 'off-page reads fall back to the scoped cache');
    assert.equal(ps.readSource, 'cache');
    assert.equal(ps.nativeStale, true, 'cache fallback marks the read stale');
}

// ---- 4. Valid-empty inventory is canonical ----------------------------------
{
    const { ps, context, storage } = makeSandbox();
    context.TACTIC_CFG = { items: [] };
    const presets = clone(ps.getAllPresets());
    assert.deepEqual(Object.keys(presets), [], 'valid-empty inventory clears the facade');
    assert.equal(ps.readSource, 'native');
    assert.equal(ps.nativeStale, false);
    assert.equal(envelopeOf(storage).items.length, 0, 'cache cleared by valid-empty inventory');
    assert.equal(envelopeOf(storage).userId, '6945', 'empty inventory is scoped to the page user (foot_login_id) so read-time validation can serve it');
}

// ---- 5. All-malformed inventory keeps the previous cache ---------------------
{
    const { ps, context, warnings } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    ps.loadCustom();

    context.TACTIC_CFG = { items: [{ garbage: true }] };
    const presets = clone(ps.getAllPresets());
    assert.ok(presets.Press, 'all-malformed read keeps the previous cache instead of wiping it');
    assert.equal(ps.readSource, 'cache');
    assert.ok(
        warnings.some(w => w.includes('malformed')),
        'malformed items are reported, never silently zeroed'
    );
}

// ---- 6. share.php readonly rejection ----------------------------------------
{
    const { ps, context, storage } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    ps.loadCustom(); // build cache first

    context.location = { pathname: '/share.php?id=42' };
    context.TACTIC_CFG = { items: [item('9999', 'Evil', 999, SITE_B)] };
    const presets = clone(ps.loadCustom());
    assert.ok(presets.Press, 'share.php config never ingested — cache served instead');
    assert.equal(ps.readSource, 'cache');
    assert.equal(envelopeOf(storage).items.some(i => i.id === '9999'), false, 'readonly-page item never enters the cache');
}

// ---- 7. user_id scope isolation ----------------------------------------------
{
    const { ps, context, storage } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A, 6945)] };
    ps.loadCustom();
    assert.equal(envelopeOf(storage).userId, '6945');

    context.TACTIC_CFG = { items: [item('7001', 'OtherUser', 100, SITE_B, 9999)] };
    ps.loadCustom();
    const env = envelopeOf(storage);
    assert.equal(env.userId, '9999', 'a different user_id replaces the cache scope');
    assert.equal(env.items.length, 1, 'no merge across accounts');
    assert.equal(env.items[0].name, 'OtherUser');
}

// ---- 8. saveCustom: happy path ----------------------------------------------
{
    const calls = [];
    const { ps, storage, context } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [] };

    const result = await ps.saveCustom({ Press: VECTOR_A });
    assert.deepEqual(clone(result), { ok: true, applied: ['Press'], removed: [], replacedOldIds: [] });
    assert.equal(calls.length, 1, 'one manager POST for a new template');
    assert.equal(calls[0].action, 'tactic_save');
    const params = new URLSearchParams(calls[0].body);
    assert.equal(params.get('name'), 'Press');
    assert.equal([...params.keys()].filter(k => k.startsWith('data[')).length, 17, 'all 17 data keys posted');

    const env = envelopeOf(storage);
    assert.equal(env.items.length, 1);
    assert.equal(env.items[0].id, '5001');
    assert.equal(env.items[0].userId, '6945');
    assert.deepEqual(env.managedNames, ['Press'], 'saved names become plugin-managed');
    assert.deepEqual(clone(ps.getManagedPresetNames()), ['Press']);

    const presets = clone(ps.loadCustom());
    assert.deepEqual(presets.Press, VECTOR_A, 'acknowledged save is readable from the facade');
}

// ---- 9. saveCustom: identical vector -> no network ---------------------------
{
    const calls = [];
    const { ps, context } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('3001', 'Press', 100, SITE_A)] };
    ps.loadCustom();

    const result = await ps.saveCustom({ Press: VECTOR_A });
    assert.deepEqual(clone(result), { ok: true, applied: [], removed: [], replacedOldIds: [] });
    assert.equal(calls.length, 0, 'identical vector must not touch the network');
}

// ---- 10. update = save-new + delete-old --------------------------------------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('3001', 'Press', 100, SITE_A)] };
    ps.loadCustom();

    const result = await ps.saveCustom({ Press: VECTOR_B });
    assert.deepEqual(clone(result), { ok: true, applied: ['Press'], removed: [], replacedOldIds: ['3001'] });
    assert.deepEqual(calls.map(c => c.action), ['tactic_save', 'tactic_delete'], 'update is save-new THEN delete-old');
    const deleteParams = new URLSearchParams(calls[1].body);
    assert.equal(deleteParams.get('id'), '3001', 'the old copy is deleted by id');

    const env = envelopeOf(storage);
    assert.equal(env.items.length, 1);
    assert.equal(env.items[0].id, '5001');
    assert.equal(env.items[0].data.def_line, '1', 'cache holds the new vector only');
}

// ---- 11. pre-validation: incomplete vector never touches the network ---------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('3001', 'Keep', 100, SITE_A)] };
    ps.loadCustom();
    const before = storage.get(NATIVE_KEY);

    const incomplete = { ...VECTOR_B };
    delete incomplete.shot;
    await assert.rejects(
        () => ps.saveCustom({ Good: VECTOR_A, Bad: incomplete }),
        err => err.name === 'SLFPresetWriteError' && err.code === 'incomplete_vector',
        'batch with an incomplete vector must fail before writing'
    );
    assert.equal(calls.length, 0, 'pre-validation happens before any network touch');
    assert.equal(storage.get(NATIVE_KEY), before, 'cache untouched by a rejected batch');
}

// ---- 12. server rejection mid-batch: acked progress persists -----------------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.TACTIC_CFG = { items: [] };
    ps.loadCustom();

    // First save passes the mock, second is rejected.
    let saves = 0;
    context.fetch = (url, opts) => {
        const action = new URL(String(url), 'https://x').searchParams.get('a');
        calls.push({ action, body: String(opts.body) });
        saves += 1;
        return Promise.resolve(saves >= 2 ? jsonResponse({ success: -6 }) : jsonResponse({
            success: 1,
            tactic: { id: String(5000 + saves), user_id: 6945, name: saves === 1 ? 'A' : 'B', data: SITE_A, time: '200', order: 1 }
        }));
    };

    const error = await ps.saveCustom({ A: VECTOR_A, B: VECTOR_B }).then(
        () => { throw new Error('must have rejected'); },
        err => err
    );
    assert.equal(error.name, 'SLFPresetWriteError');
    assert.equal(error.code, 'server_rejected');
    assert.equal(error.serverCode, -6);
    assert.deepEqual(clone(error.partial), { applied: ['A'], removed: [] }, 'partial progress reported');
    assert.equal(envelopeOf(storage).items.length, 1, 'only the acknowledged save is cached');
    assert.equal(envelopeOf(storage).items[0].name, 'A');
}

// ---- 13. partial_replace: save acked, old-copy delete failed -----------------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = (url, opts) => {
        const action = new URL(String(url), 'https://x').searchParams.get('a');
        calls.push({ action, body: String(opts.body) });
        if (action === 'tactic_save') {
            return Promise.resolve(jsonResponse({
                success: 1,
                tactic: { id: '3002', user_id: 6945, name: 'Press', data: SITE_B, time: '300', order: 1 }
            }));
        }
        return Promise.resolve(jsonResponse({ success: -6 })); // delete fails
    };
    context.TACTIC_CFG = { items: [item('3001', 'Press', 100, SITE_A)] };
    ps.loadCustom();

    const error = await ps.saveCustom({ Press: VECTOR_B }).then(
        () => { throw new Error('must have rejected'); },
        err => err
    );
    assert.equal(error.name, 'SLFPresetWriteError');
    assert.equal(error.code, 'partial_replace', 'save-ok + delete-fail is a partial replace');
    assert.match(error.message, /3001/, 'message names the old id');
    assert.match(error.message, /3002/, 'message names the new id');
    assert.deepEqual(clone(error.partial.applied), ['Press'], 'the acked save is reported as applied');

    const env = envelopeOf(storage);
    assert.equal(env.items.length, 2, 'cache holds the acked new copy AND the not-deleted old copy');
    assert.deepEqual(
        env.items.map(i => i.id).sort(),
        ['3001', '3002'],
        'acknowledged progress rule: the acked new id (3002) is persisted even though the old-copy delete failed'
    );
    assert.ok(env.items.some(i => i.id === '3002' && i.name === 'Press'), 'the acked new template is in the cache');
    assert.ok(env.items.some(i => i.id === '3001'), 'the failed delete means the old copy stays too');
    assert.deepEqual(clone(env.managedNames), ['Press'], 'the applied name is plugin-managed');
    assert.ok(error.partial, 'structured partial info present');
}

// ---- 14. delete modes: managed / none / all ----------------------------------
{
    const seedItems = () => [
        item('4001', 'Mine', 100, SITE_A),
        item('4002', 'Foreign', 100, SITE_B),    // previously plugin-managed
        item('4003', 'Stranger', 100, SITE_B)    // native template the plugin does not own
    ];
    const seedEnvelope = storage => storage.set(NATIVE_KEY, JSON.stringify({
        schema: 'slf_native_preset_cache_v1',
        userId: '6945',
        fetchedAt: 1,
        items: seedItems(),
        managedNames: ['Mine', 'Foreign']
    }));

    // 'managed': only previously managed names are deleted; the foreign
    // native template (absent from the map, never managed) must survive.
    {
        const calls = [];
        const { ps, context, storage } = makeSandbox();
        context.fetch = echoAckFetch(calls);
        context.TACTIC_CFG = { items: seedItems() };
        seedEnvelope(storage);
        ps.loadCustom(); // re-ingest keeps managedNames (same scope)

        const managed = await ps.saveCustom({ Mine: VECTOR_A }, { deleteMissing: 'managed' });
        assert.deepEqual(clone(managed), { ok: true, applied: [], removed: ['Foreign'], replacedOldIds: [] });
        assert.deepEqual(calls.map(c => c.action), ['tactic_delete'], 'one delete, no save (vector unchanged)');
        const names = envelopeOf(storage).items.map(i => i.name).sort();
        assert.deepEqual(clone(names), ['Mine', 'Stranger'], 'unmanaged native template kept in managed mode');
    }

    // 'none': add/update only.
    {
        const { ps, context, storage } = makeSandbox();
        context.TACTIC_CFG = { items: seedItems() };
        seedEnvelope(storage);
        ps.loadCustom();
        const none = await ps.saveCustom({ Mine: VECTOR_A }, { deleteMissing: 'none' });
        assert.deepEqual(clone(none), { ok: true, applied: [], removed: [], replacedOldIds: [] });
        assert.equal(envelopeOf(storage).items.length, 3, "'none' never deletes");
    }

    // default 'all': full replacement semantics for the passed map.
    {
        const calls = [];
        const { ps, context, storage } = makeSandbox();
        context.fetch = echoAckFetch(calls);
        context.TACTIC_CFG = { items: seedItems() };
        seedEnvelope(storage);
        ps.loadCustom();

        const all = await ps.saveCustom({ Mine: VECTOR_A });
        assert.deepEqual(clone(all), { ok: true, applied: [], removed: ['Foreign', 'Stranger'], replacedOldIds: [] });
        assert.deepEqual(calls.map(c => c.action), ['tactic_delete', 'tactic_delete']);
        assert.equal(envelopeOf(storage).items.length, 1);
    }
}

// ---- 15. retired built-in names are never auto-deleted -----------------------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('3003', 'Klopp_Gegenpress_att4', 100, SITE_A)] };
    ps.loadCustom();

    const result = await ps.saveCustom({}, { deleteMissing: 'all' });
    assert.deepEqual(clone(result), { ok: true, applied: [], removed: [], replacedOldIds: [] });
    assert.equal(calls.length, 0, 'retired names are display-filtered, never auto-deleted');
    assert.equal(envelopeOf(storage).items.length, 1, 'retired-name native template survives');
    assert.equal(clone(ps.getAllPresets()).Klopp_Gegenpress_att4, undefined, 'but stays display-filtered');
}

// ---- 16. store fully unavailable -> pre-migration composite fallback ---------
{
    const { ps, context, storage } = makeSandbox();
    storage.set(STORAGE_KEY, JSON.stringify({
        Old_One: { def_line: '2', press_line: '2', priority: ['left'] }
    }));
    delete context.TACTIC_CFG; // no page config, no native cache

    const custom = clone(ps.loadCustom());
    assert.ok(custom.Old_One, 'pre-migration local presets stay readable');
    assert.equal(custom.Old_One.def_line, '2');

    const presets = clone(ps.getAllPresets());
    assert.ok(presets.Old_One, 'local presets served in the composite');
    assert.ok(presets.standard, 'BASE_PRESETS overlay present ONLY in the unavailable fallback');
    assert.equal(ps.readSource, 'unavailable');
    assert.equal(ps.nativeStale, true);
}

// ---- 17. loadFromServerAndMerge: callback-once + fail-open -------------------
{
    const { ps, context, storage, warnings } = makeSandbox();
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    let fired = 0;
    const result = await ps.loadFromServerAndMerge(() => { fired += 1; });
    assert.equal(result, undefined, 'loadFromServerAndMerge resolves (fail-open)');
    assert.equal(fired, 1, 'callback fires exactly once on success');
    assert.equal(envelopeOf(storage).items.length, 1, 'refresh ingested the inventory');

    // Throwing page config: failure recorded + warned, callback still fires once.
    // (The getter lives on the config object itself: defineProperty on the
    // contextified global would remove the binding inside the vm entirely.)
    context.TACTIC_CFG = {
        get items() { throw new Error('config exploded'); }
    };
    let fired2 = 0;
    await ps.loadFromServerAndMerge(() => { fired2 += 1; });
    assert.equal(fired2, 1, 'callback fires exactly once even when the read throws');
    assert.ok(ps.lastSyncError && ps.lastSyncError.includes('native inventory read'),
        `throwing read must be recorded, got: ${JSON.stringify(ps.lastSyncError)}`);
    assert.equal(typeof ps.lastSyncAt, 'number');
    assert.ok(
        warnings.some(w => w.includes('native inventory read')),
        'console.warn/debugWarn must fire on a throwing read'
    );
    assert.equal(fired, 1, 'first callback count unchanged');

    // Fail-open: cached presets still served after the failure.
    const presets = clone(ps.loadCustom());
    assert.ok(presets.Press, 'reads fail open to the scoped cache after a refresh failure');
    assert.equal(ps.readSource, 'cache');
}

// ---- 18. duplicate-name delete: EVERY copy is deleted, name reported once ---
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('6001', 'Dup', 100, SITE_A), item('6002', 'Dup', 90, SITE_B)] };
    ps.loadCustom();

    const result = await ps.saveCustom({}); // 'all' mode: name absent -> delete EVERY copy
    assert.deepEqual(clone(result), { ok: true, applied: [], removed: ['Dup'], replacedOldIds: [] },
        'duplicate-name delete reports the name exactly once');
    assert.deepEqual(calls.map(c => c.action), ['tactic_delete', 'tactic_delete'], 'BOTH same-name copies deleted');
    assert.deepEqual(
        calls.map(c => new URLSearchParams(c.body).get('id')).sort(),
        ['6001', '6002'],
        'both duplicate ids deleted'
    );
    assert.equal(envelopeOf(storage).items.length, 0, 'no same-name copy survives a delete');
}

// ---- 19. duplicate-name update: save-new + delete of BOTH old copies --------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('6001', 'Dup', 100, SITE_A), item('6002', 'Dup', 90, SITE_B)] };
    ps.loadCustom();

    const result = await ps.saveCustom({ Dup: VECTOR_B }); // differs from the freshest copy (SITE_A)
    assert.deepEqual(clone(result), { ok: true, applied: ['Dup'], removed: [], replacedOldIds: ['6001', '6002'] },
        'update deletes BOTH old same-name copies');
    assert.deepEqual(calls.map(c => c.action), ['tactic_save', 'tactic_delete', 'tactic_delete']);
    assert.deepEqual(
        calls.filter(c => c.action === 'tactic_delete')
            .map(c => new URLSearchParams(c.body).get('id')).sort(),
        ['6001', '6002']
    );
    const env = envelopeOf(storage);
    assert.equal(env.items.length, 1, 'new id present, old copies gone');
    assert.equal(env.items[0].id, '5001');
    assert.equal(env.items[0].name, 'Dup');
}

// ---- 20. stale-write gate: stale cache must not be written against ----------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    ps.loadCustom(); // fresh ingest -> nativeStale false
    const before = storage.get(NATIVE_KEY);

    // Off-page: read unavailable, scoped cache fallback -> stale.
    delete context.TACTIC_CFG;
    const offPageError = await ps.saveCustom({ Press: VECTOR_B }).then(
        () => { throw new Error('must have rejected'); },
        err => err
    );
    assert.equal(offPageError.name, 'SLFPresetWriteError');
    assert.equal(offPageError.code, 'native_stale', 'off-page save against a stale cache must fail loud');
    assert.match(offPageError.message, /устарело/);
    assert.equal(calls.length, 0, 'stale gate fires before any network write');
    assert.equal(storage.get(NATIVE_KEY), before, 'nothing persisted by the stale gate');

    // All-malformed read: cache kept but marked stale -> same gate.
    context.TACTIC_CFG = { items: [item('5143', 'Press', 100, SITE_A)] };
    ps.loadCustom(); // re-ingest fresh
    context.TACTIC_CFG = { items: [{ garbage: true }] };
    await assert.rejects(
        () => ps.saveCustom({}),
        err => err.name === 'SLFPresetWriteError' && err.code === 'native_stale',
        'all-malformed read leaves a stale cache that must not be written'
    );
}

// ---- 21. cache scope validation: foot_login_id vs envelope userId -----------
{
    // Mismatch (envelope '111' vs page 222): cache is not a valid source ->
    // readSource 'unavailable' -> pre-migration composite fallback.
    {
        const { ps, context, storage } = makeSandbox();
        storage.set(NATIVE_KEY, JSON.stringify({
            schema: 'slf_native_preset_cache_v1',
            userId: '111',
            fetchedAt: 1,
            items: [item('8001', 'Alien', 100, SITE_A, 111)],
            managedNames: []
        }));
        context.foot_login_id = 222;
        delete context.TACTIC_CFG; // force the fallback branch

        const presets = clone(ps.loadCustom());
        assert.equal(ps.readSource, 'unavailable', 'mismatched cache scope is not a valid source');
        assert.equal(ps.nativeStale, true);
        assert.equal(presets.Alien, undefined, "another account's cached templates are not served");
        assert.ok(clone(ps.getAllPresets()).standard, 'falls through to the pre-migration composite');

        // Matching ids -> served (stale but readable fallback).
        context.foot_login_id = '111';
        const served = clone(ps.loadCustom());
        assert.ok(served.Alien, 'matching page user serves the cache');
        assert.equal(ps.readSource, 'cache');
        assert.equal(ps.nativeStale, true, 'fallback cache is stale but readable');

        // foot_login_id absent -> not served.
        delete context.foot_login_id;
        const absent = clone(ps.loadCustom());
        assert.equal(ps.readSource, 'unavailable', 'no page user -> cache is not a valid source');
        assert.equal(absent.Alien, undefined, 'cache not served without a page user');
        assert.ok(clone(ps.getAllPresets()).standard, 'legacy composite served when the scope cannot be validated');
    }
}

// ---- 22. throwing refresh callback: contained, fired exactly once -----------
{
    const { ps, warnings } = makeSandbox();
    let fired = 0;
    const result = await ps.loadFromServerAndMerge(() => {
        fired += 1;
        throw new Error('callback exploded');
    });
    assert.equal(result, undefined, 'no exception escapes loadFromServerAndMerge');
    assert.equal(fired, 1, 'callback fired exactly once despite throwing');
    assert.ok(
        ps.lastSyncError && ps.lastSyncError.includes('preset refresh callback'),
        `callback throw recorded, got: ${JSON.stringify(ps.lastSyncError)}`
    );
    assert.equal(typeof ps.lastSyncAt, 'number');
    assert.ok(
        warnings.some(w => w.includes('preset refresh callback')),
        'console.warn must fire on a throwing callback'
    );
}

// ---- 23. unknown deleteMissing value -> invalid_option ----------------------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [] };
    ps.loadCustom();
    const before = storage.get(NATIVE_KEY);

    await assert.rejects(
        () => ps.saveCustom({ Press: VECTOR_A }, { deleteMissing: 'sometimes' }),
        err => err.name === 'SLFPresetWriteError' && err.code === 'invalid_option',
        'unknown deleteMissing value must reject with invalid_option'
    );
    assert.equal(calls.length, 0, 'rejected before any network touch');
    assert.equal(storage.get(NATIVE_KEY), before, 'nothing persisted by an invalid option');
}

// ---- 24. write-path scope: a foreign envelope is never a write basis --------
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = echoAckFetch(calls);
    context.TACTIC_CFG = { items: [item('7001', 'Mine', 100, SITE_A)] };
    ps.loadCustom(); // ingest our snapshot: fingerprint set, our envelope cached

    // Two-tab scenario: another tab (same browser, different account)
    // overwrites the shared constant-key cache with its own envelope.
    storage.set(NATIVE_KEY, JSON.stringify({
        schema: 'slf_native_preset_cache_v1',
        userId: '999',
        fetchedAt: 2,
        items: [item('8888', 'Alien', 100, SITE_B, 999)],
        managedNames: ['Alien']
    }));
    assert.equal(envelopeOf(storage).userId, '999', 'pre-state: foreign envelope in the shared cache');

    // Unchanged page snapshot + foreign cache: the snapshot is re-persisted
    // (fresh same-page data) and the write plan is built from OUR items.
    const result = await ps.saveCustom({ Mine: VECTOR_B });
    assert.equal(ps.readSource, 'native', 'foreign envelope is re-persisted from the page snapshot, not served');
    assert.equal(ps.nativeStale, false);
    assert.deepEqual(clone(result), { ok: true, applied: ['Mine'], removed: [], replacedOldIds: ['7001'] },
        'the plan used the page item (old id 7001), never the foreign envelope');
    assert.deepEqual(calls.map(c => c.action), ['tactic_save', 'tactic_delete']);
    assert.equal(new URLSearchParams(calls[1].body).get('id'), '7001', 'delete targets our page item id');
    assert.ok(
        calls.every(c => !(c.body || '').includes('8888')),
        'no foreign id is ever saved or deleted'
    );

    const env = envelopeOf(storage);
    assert.equal(env.userId, '6945', 'cache re-scoped to the page user');
    assert.equal(env.items.length, 1);
    assert.equal(env.items[0].id, '5001', 'only our acked template remains');
    assert.equal(env.items.some(i => i.name === 'Alien'), false, 'foreign items never enter our envelope');
    assert.deepEqual(clone(env.managedNames), ['Mine'], "foreign managedNames ('Alien') never leak into our envelope");
}

// ---- 25. partial_replace progress: the acked new copy survives in the cache -
{
    const calls = [];
    const { ps, context, storage } = makeSandbox();
    context.fetch = (url, opts) => {
        const action = new URL(String(url), 'https://x').searchParams.get('a');
        calls.push({ action, body: String(opts.body) });
        if (action === 'tactic_save') {
            return Promise.resolve(jsonResponse({
                success: 1,
                tactic: { id: '3002', user_id: 6945, name: 'Dup', data: SITE_B, time: '300', order: 1 }
            }));
        }
        // Two old copies: first delete acked, second fails.
        const id = new URLSearchParams(opts.body).get('id');
        return Promise.resolve(jsonResponse(id === '6001' ? { success: 1 } : { success: -6 }));
    };
    context.TACTIC_CFG = { items: [item('6001', 'Dup', 100, SITE_A), item('6002', 'Dup', 90, SITE_B)] };
    ps.loadCustom();

    const error = await ps.saveCustom({ Dup: VECTOR_B }).then(
        () => { throw new Error('must have rejected'); },
        err => err
    );
    assert.equal(error.name, 'SLFPresetWriteError');
    assert.equal(error.code, 'partial_replace');
    assert.match(error.message, /6002/, 'message names the failing old id');
    assert.deepEqual(clone(error.partial.applied), ['Dup'], 'the acked save is reported as applied despite the partial failure');

    const env = envelopeOf(storage);
    assert.deepEqual(
        env.items.map(i => i.id).sort(),
        ['3002', '6002'],
        'acknowledged-progress rule: acked new id (3002) persisted, first old copy (6001) delete acked and applied, failing old copy (6002) stays'
    );
    assert.deepEqual(clone(env.managedNames), ['Dup'], 'the applied name is plugin-managed even on partial_replace');
}

// ---- 26. #413: foot_login_id as a LEXICAL global (live-site condition) ------
{
    // The live site (team4.php?action=tactic, line 2027) declares
    // `let foot_login_id = 6945;` at the top level. A top-level `let` is a
    // lexical global: it does NOT create a window/unsafeWindow property.
    // readPageUserId() must still resolve it — otherwise
    // readScopedNativeCache() always returns null and the migration gate
    // blocks the owner's ⬆️ button.
    const { ps, context } = makeSandbox({ footLoginId: 'lexical' });
    // Precondition: the binding is NOT a property of the sandbox object —
    // that is exactly the bug's trigger.
    assert.equal(
        context.foot_login_id, undefined,
        'lexical foot_login_id is not a sandbox-object property (live-site precondition)'
    );
    // Precondition: the binding IS present in the realm, reachable only by
    // in-realm evaluation (indirect eval).
    assert.equal(
        vm.runInContext(
            `(0,eval)("typeof foot_login_id !== 'undefined' ? String(foot_login_id) : null")`,
            context
        ),
        '6945',
        'the lexical binding is present in the realm (test precondition)'
    );
    // The actual assertion: the real method must resolve the lexical global.
    assert.equal(
        ps.readPageUserId(), '6945',
        'readPageUserId must resolve a lexical-global foot_login_id, not only a window property'
    );
}

// ---- 27. #413: CSP-independent DOM fallback (document.scripts scan) ---------
{
    // No foot_login_id binding at all (neither a window property nor a lexical
    // global), but the page's inline <script> text carries the declaration. A
    // strict CSP that blocks eval would defeat the in-realm-eval fallback, so
    // readPageUserId must also be able to recover the id by scanning
    // document.scripts textContent.
    const { ps, context } = makeSandbox({
        footLoginId: 'absent',
        document: { scripts: [{ textContent: 'let foot_login_id = 6945;' }] }
    });
    assert.equal(
        context.foot_login_id, undefined,
        'no foot_login_id property (precondition)'
    );
    assert.equal(
        ps.readPageUserId(), '6945',
        'readPageUserId must recover foot_login_id from document.scripts when no live binding exists'
    );
}

// ---- 28. #413: DOM scan must NOT resolve a foreign property assignment -------
{
    // Account-isolation guard (peer-review finding F3): the document.scripts
    // fallback must resolve DECLARATIONS only (let/const/var foot_login_id = N).
    // A non-declaration assignment in script text — e.g. `obj.foot_login_id =
    // 111;`, a property write on some other object — is never the page's login
    // id. A bare top-level assignment (foot_login_id = 111;) creates a window
    // property, which the property-read path already catches; so the DOM scan
    // only needs declaration forms. If the scan matched property assignments,
    // readScopedNativeCache could serve ANOTHER user's cached templates
    // (envelope userId '111' would validate against the foreign id).
    const { ps, context } = makeSandbox({
        footLoginId: 'absent',
        document: { scripts: [{ textContent: 'obj.foot_login_id = 111;' }] }
    });
    assert.equal(
        context.foot_login_id, undefined,
        'no foot_login_id property (precondition)'
    );
    assert.equal(
        ps.readPageUserId(), null,
        'readPageUserId must NOT resolve a foreign property assignment in script text (account isolation)'
    );
}

console.log('OK: PresetStorage native facade, scoped cache, fallbacks, scope isolation and the awaited saveCustom write protocol all verified');
