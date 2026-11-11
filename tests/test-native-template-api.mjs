#!/usr/bin/env node
// #409 wave 1: NativeTemplateApi — manager transport + page-config inventory.
// Proven against the live-verified protocol (tasks.md T1):
// - POST /ajax/team3.9.php?a=tactic_save|tactic_rename|tactic_delete,
//   form-encoded, no CSRF, credentials same-origin;
// - the endpoint answers JSON with a lying `Content-Type: text/html` —
//   parsing must ignore the header and validate the body schema;
// - structured results only: {ok, tactic|tactics, code, message}.
// The network seam is the page fetch — mocked here; NO live network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
    path.join(root, 'src/modules/tactics-presets/native-template-api.js'),
    'utf8'
);

// ---- fixtures ---------------------------------------------------------------
const SITE_DATA = {
    def_line: 2, press_line: 3, def_width: 1, press_intense: 4,
    build_type: 1, build_temp: 2, build_long: 3, build_fast: 1,
    style: 5, pass_risk: 2, dribble: 5, cross: 1, corner: 2, shot: 3,
    priority_l: 1, priority_c: 0, priority_r: 1
};
const PLUGIN_VECTOR = {
    def_line: '2', press_line: '3', def_width: '1', press_intense: '4',
    build_type: '1', build_temp: '2', build_long: '3', build_fast: '1',
    style: '5', pass_risk: '2', dribble: '5', cross: '1', corner: '2', shot: '3',
    priority: ['left', 'right']
};
const ackTactic = (id, name, time) => ({
    success: 1,
    tactic: {
        id: String(id), user_id: 6945, name,
        data: SITE_DATA, time: String(time), order: 1,
        share_token: 'tok', share_url: 'https://x/s'
    }
});
const jsonResponse = (payload, status = 200) => ({
    status,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload))
});

function makeSandbox({ pathname = '/team4.php?action=tactic', items, fetchImpl } = {}) {
    const context = {
        console: { warn: () => {}, log: () => {}, error: () => {} },
        Date, JSON, Promise, setTimeout, clearTimeout,
        location: { pathname }
    };
    context.unsafeWindow = context;
    context.window = context;
    context.globalThis = context;
    if (fetchImpl) context.fetch = fetchImpl;
    if (items !== undefined) context.TACTIC_CFG = { items };
    vm.createContext(context);
    vm.runInContext(
        `${source}\n;globalThis.__A = NativeTemplateApi; globalThis.__M = NativeTemplateMapping;`,
        context,
        { filename: 'native-template-api.js' }
    );
    const clone = value => JSON.parse(JSON.stringify(value));
    return { api: context.__A, mapping: clone(context.__M), context };
}

function makeFetch(handler) {
    const calls = [];
    const fetchFn = (url, opts) => {
        const call = {
            url: String(url),
            method: opts && opts.method,
            headers: opts && opts.headers,
            body: opts && opts.body,
            credentials: opts && opts.credentials
        };
        calls.push(call);
        return Promise.resolve(handler(call, calls));
    };
    fetchFn.calls = calls;
    return fetchFn;
}

// ---- 1. Page-config inventory ------------------------------------------------
{
    const { api } = makeSandbox({
        items: [
            { id: 5143, user_id: 6945, name: 'Press', data: SITE_DATA, time: 100, order: 1 },
            { id: '', user_id: 6945, name: 'NoId', data: SITE_DATA },
            { id: '2', user_id: 6945, name: 'Bad', data: { def_line: 9 } }
        ]
    });
    const inv = api.readInventory();
    assert.equal(inv.ok, true, 'inventory with some malformed items still reads');
    assert.equal(inv.items.length, 1, 'only valid items ingested');
    assert.equal(inv.items[0].id, '5143');
    assert.equal(inv.malformed.length, 2, 'malformed items skipped and counted');
    assert.match(inv.message, /2 malformed/, 'malformed count surfaced in message');
}

{
    // Valid-empty is a real inventory, not a missing config.
    const { api } = makeSandbox({ items: [] });
    const inv = api.readInventory();
    assert.equal(inv.ok, true, 'empty items array is a valid-empty inventory');
    assert.equal(inv.items.length, 0);
    assert.equal(inv.malformed.length, 0);
}

{
    const { api } = makeSandbox({}); // no TACTIC_CFG at all
    const inv = api.readInventory();
    assert.equal(inv.ok, false);
    assert.equal(inv.code, 'config_missing', 'missing page config is NOT an empty list');
    assert.equal(inv.items.length, 0);
}

{
    const { api, context } = makeSandbox({ items: [] });
    context.TACTIC_CFG = {}; // config present, items missing
    const inv = api.readInventory();
    assert.equal(inv.ok, false);
    assert.equal(inv.code, 'config_missing');
}

{
    // share.php is readonly: never ingested even with a config present.
    const { api } = makeSandbox({ pathname: '/share.php?id=42', items: [] });
    const config = api.readTemplateConfig();
    assert.equal(config.ok, false);
    assert.equal(config.code, 'readonly_page', 'share.php must never be ingested as inventory');
}

// ---- 2. saveTemplate: form serialization + ack parsing ----------------------
{
    const fetchFn = makeFetch(() => jsonResponse(ackTactic('5001', 'My Press', 200)));
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const res = JSON.parse(JSON.stringify(await api.saveTemplate('My Press', PLUGIN_VECTOR)));
    assert.equal(res.ok, true, `save must ack: ${res.message || ''}`);
    assert.equal(res.tactic.id, '5001');
    assert.equal(res.tactic.name, 'My Press');
    assert.equal(res.tactic.data.def_line, '2', 'ack vector normalized to plugin form');
    assert.deepEqual(res.tactic.data.priority, ['left', 'right']);
    assert.equal(res.tactic.userId, '6945');

    assert.equal(fetchFn.calls.length, 1, 'exactly one manager POST');
    const call = fetchFn.calls[0];
    assert.equal(call.url, '/ajax/team3.9.php?a=tactic_save');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
    assert.equal(call.credentials, 'same-origin', 'same-origin credentials, no CSRF token');

    const params = new URLSearchParams(call.body);
    assert.equal(params.get('name'), 'My Press', 'name field form-encoded');
    for (const key of api.mapping.SITE_DATA_KEYS) {
        assert.ok(call.body.includes(`data[${key}]=`), `body carries data[${key}]`);
    }
    assert.equal(params.get('data[def_line]'), '2');
    assert.equal(params.get('data[priority_l]'), '1');
    assert.equal(params.get('data[priority_c]'), '0');
    assert.equal(params.get('data[priority_r]'), '1');
    assert.equal(params.get('csrf'), null, 'no CSRF hash for team3.9.php');
    // All 17 keys present, name first.
    assert.equal([...params.keys()].length, 18, 'name + 17 data keys');
    assert.ok(call.body.startsWith('name='), 'name serialized first');
}

{
    // Incomplete plugin vectors are rejected before any network touch.
    const fetchFn = makeFetch(() => jsonResponse(ackTactic('1', 'x', 1)));
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const incomplete = { ...PLUGIN_VECTOR };
    delete incomplete.shot;
    const res = await api.saveTemplate('Broken', incomplete);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'incomplete_vector');
    assert.equal(fetchFn.calls.length, 0, 'invalid vector never reaches the network');
}

// ---- 3. Response parsing: lying content type, error classes -----------------
const saveCases = [
    {
        label: 'JSON body despite text/html content-type',
        respond: () => jsonResponse(ackTactic('5002', 'X', 201)),
        expect: { ok: true }
    },
    {
        label: 'login/HTML body',
        respond: () => jsonResponse('<!DOCTYPE html><html><body><form>login</form></body></html>'),
        expect: { ok: false, code: 'not_json' }
    },
    {
        label: 'empty body',
        respond: () => jsonResponse(''),
        expect: { ok: false, code: 'empty_response' }
    },
    {
        label: 'whitespace body',
        respond: () => jsonResponse('   '),
        expect: { ok: false, code: 'empty_response' }
    },
    {
        label: 'success:-6 (server rejection, e.g. template limit)',
        respond: () => jsonResponse({ success: -6 }),
        expect: { ok: false, code: 'server_rejected', serverCode: -6 }
    },
    {
        label: 'string success value is not an ack',
        respond: () => jsonResponse({ success: '1' }),
        expect: { ok: false, code: 'server_rejected', serverCode: '1' }
    },
    {
        label: 'success without tactic payload',
        respond: () => jsonResponse({ success: 1 }),
        expect: { ok: false, code: 'invalid_payload' }
    },
    {
        label: 'tactic without id',
        respond: () => jsonResponse({ success: 1, tactic: { id: '', data: SITE_DATA } }),
        expect: { ok: false, code: 'invalid_payload' }
    },
    {
        label: 'tactic with invalid data vector',
        respond: () => jsonResponse({ success: 1, tactic: { id: '7', data: { ...SITE_DATA, style: 99 } } }),
        expect: { ok: false, code: 'invalid_payload' }
    },
    {
        label: 'HTTP 500',
        respond: () => jsonResponse({ success: 1 }, 500),
        expect: { ok: false, code: 'http_500' }
    },
    {
        label: 'response without readable body',
        respond: () => ({}),
        expect: { ok: false, code: 'unknown_outcome' }
    }
];

for (const testCase of saveCases) {
    const fetchFn = makeFetch(() => testCase.respond());
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const res = await api.saveTemplate('X', PLUGIN_VECTOR);
    if (testCase.expect.ok) {
        assert.equal(res.ok, true, testCase.label);
    } else {
        assert.equal(res.ok, false, `${testCase.label}: must not succeed`);
        assert.equal(res.code, testCase.expect.code, `${testCase.label}: code`);
        if (testCase.expect.serverCode !== undefined) {
            assert.equal(res.serverCode, testCase.expect.serverCode, `${testCase.label}: serverCode`);
        }
    }
}

{
    // Network rejection -> structured network error, outcome unknown-safe.
    const fetchFn = makeFetch(() => Promise.reject(new Error('socket hang up')));
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const res = await api.saveTemplate('X', PLUGIN_VECTOR);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'network');
    assert.match(res.message, /socket hang up/);
}

{
    // Timeout: the server outcome is unknown and must be reported as such.
    const fetchFn = makeFetch(() => new Promise(() => {}));
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const res = await api.saveTemplate('X', PLUGIN_VECTOR, { timeoutMs: 25 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'timeout');
    assert.match(res.message, /timed out/);
}

{
    // No fetch transport at all -> structured transport_unavailable.
    const { api } = makeSandbox({});
    const res = await api.saveTemplate('X', PLUGIN_VECTOR);
    assert.equal(res.ok, false);
    assert.equal(res.code, 'transport_unavailable');
}

// ---- 4. rename / delete ------------------------------------------------------
{
    const fetchFn = makeFetch(call =>
        call.url.includes('tactic_rename')
            ? jsonResponse(ackTactic('5143', 'Renamed', 300))
            : jsonResponse({ success: 1 })
    );
    const { api } = makeSandbox({ fetchImpl: fetchFn });

    const renamed = await api.renameTemplate('5143', 'Renamed');
    assert.equal(renamed.ok, true, 'rename ack normalizes the tactic');
    assert.equal(renamed.tactic.name, 'Renamed');
    assert.equal(fetchFn.calls[0].url, '/ajax/team3.9.php?a=tactic_rename');
    const renameParams = new URLSearchParams(fetchFn.calls[0].body);
    assert.equal(renameParams.get('id'), '5143');
    assert.equal(renameParams.get('name'), 'Renamed');

    const deleted = await api.deleteTemplate('5143');
    assert.equal(deleted.ok, true, '{success:1} without tactic payload is the delete ack');
    assert.equal(fetchFn.calls[1].url, '/ajax/team3.9.php?a=tactic_delete');
    const deleteParams = new URLSearchParams(fetchFn.calls[1].body);
    assert.equal(deleteParams.get('id'), '5143');
}

{
    // Rename rejection surfaces serverCode.
    const fetchFn = makeFetch(() => jsonResponse({ success: -6 }));
    const { api } = makeSandbox({ fetchImpl: fetchFn });
    const res = await api.renameTemplate('5143', 'Nope');
    assert.equal(res.ok, false);
    assert.equal(res.code, 'server_rejected');
    assert.equal(res.serverCode, -6);
}

// ---- 5. Protocol pins --------------------------------------------------------
assert.equal(api_MANAGER_URL(), '/ajax/team3.9.php');
function api_MANAGER_URL() { return makeSandbox({}).api.MANAGER_URL; }
assert.equal(makeSandbox({}).api.REQUEST_TIMEOUT_MS, 15000);

console.log('OK: NativeTemplateApi form serialization, text/html JSON parse, login-HTML/empty/-6/invalid/unknown-outcome/timeout/network handling all verified (fetch mocked, no live network)');
