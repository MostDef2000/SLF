#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// LLM second-opinion module contract (specs/434-llm-tactical-advisor, F1).
// Covers: payload contract against the real registry shape, fail-closed
// guards, HTML escaping of model output, answer mounting, and the Api.postJson
// timeout pass-through with a stubbed GM_xmlhttpRequest (no network).

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// document stub for mountAnswer
// ---------------------------------------------------------------------------
function makeElement(id = '') {
    return {
        id, children: [], firstElementChild: null, removed: false, parentElement: null,
        // Minimal innerHTML "parser": extracts the first id="..." so mountAnswer's
        // holder.firstElementChild behaves like a real element.
        set innerHTML(html) {
            const match = String(html).match(/id="([^"]+)"/);
            const child = makeElement(match ? match[1] : '');
            this.children.push(child);
            this.firstElementChild = child;
        },
        remove() { this.removed = true; },
        appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            if (!this.firstElementChild) this.firstElementChild = child;
        }
    };
}

function makeDocument({ withPanel = true } = {}) {
    const panel = withPanel ? makeElement('slf-parser-recommendation') : null;
    const answerNode = makeElement('slf-llm-second-opinion-answer');
    return {
        panel, answerNode,
        getElementById(id) {
            if (id === 'slf-parser-recommendation') return panel;
            if (id === 'slf-llm-second-opinion-answer') return answerNode.removed ? null : answerNode;
            return null;
        },
        createElement(tag) { return makeElement(tag === 'div' ? '' : ''); }
    };
}

function loadModule({ withPanel = true } = {}) {
    const document = makeDocument({ withPanel });
    const context = { console, document };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('src/modules/strategy-data-recommendations/llm-second-opinion.js') + '\n;globalThis.__LLM = LLMSecondOpinion;', context, { filename: 'llm-second-opinion.js' });
    return { LLM: context.__LLM, context, document };
}

// Realistic shapes copied from cah-decision-core.evaluate() and the
// active-preset-registry global (issue #434).
function makeRegistry() {
    return {
        active: ['Emery_BalancedBase_v11', 'Pep_BoxControl_bal2'],
        labels: { Emery_BalancedBase_v11: 'Emery Balanced Base', Pep_BoxControl_bal2: 'Pep Box Control' },
        meta: {
            Emery_BalancedBase_v11: { idea: 'баланс', use: 'база', risk: 'низкий' },
            Pep_BoxControl_bal2: { idea: 'контроль', use: 'при контроле', risk: 'средний' }
        }
    };
}

function makeRuleDecision() {
    return {
        action: { preset: 'Emery_BalancedBase_v11', decision: 'active_control' },
        confidence: { level: 'medium', gap: 12.3, completeness: 0.8, conflict: false },
        telemetry: { currentPreset: 'Emery_BalancedBase_v11' },
        moment: {
            context: {
                minute: 30, gameMode: 'active_control', strengthGap: -12, pressureRisk: 41.4,
                underPressure: true, notASignal: 'must-not-leak'
            }
        },
        candidates: [
            { preset: 'Emery_BalancedBase_v11', score: 35.7, vetoed: false },
            { preset: 'Pep_BoxControl_bal2', score: 23.5, vetoed: false },
            { preset: 'Bielsa_ChaosPress_att5', score: 30, vetoed: true, vetoReasons: ['veto'] }
        ]
    };
}

function makeSnapshot() {
    return {
        gameId: 'g-123',
        minute: 30,
        bucket: '16-30',
        score: { home: 0, away: 1 },
        developerHints: Array.from({ length: 25 }, (_, i) => `hint-${i} ${'x'.repeat(400)}`)
    };
}

// --- 1. payload contract ----------------------------------------------------
{
    const { LLM } = loadModule();
    const payload = LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: makeRuleDecision(), registry: makeRegistry() });

    assert.ok(payload, 'payload builds from a full context');
    assert.equal(payload.schema, 'slf_llm_advisor_request_v1');
    assert.equal(payload.gameId, 'g-123');
    assert.equal(payload.minute, 30);
    assert.equal(payload.bucket, '16-30');
    assert.deepEqual(payload.score, { home: 0, away: 1 });
    assert.equal(payload.currentPreset, 'Emery_BalancedBase_v11', 'current preset from telemetry');

    // rule decision: confidence object flattened to level, candidates filtered
    assert.equal(payload.ruleDecision.preset, 'Emery_BalancedBase_v11');
    assert.equal(payload.ruleDecision.gameMode, 'active_control');
    assert.equal(payload.ruleDecision.confidence, 'medium', 'confidence.level extracted');
    assert.equal(payload.ruleDecision.topCandidates.length, 2, 'vetoed candidate excluded');
    assert.equal(
        JSON.stringify(payload.ruleDecision.topCandidates[0]),
        JSON.stringify({ id: 'Emery_BalancedBase_v11', score: 35.7 })
    );

    // signals whitelist: known keys pass, unknown stay local
    assert.equal(payload.signals.strengthGap, -12);
    assert.equal(payload.signals.underPressure, true);
    assert.equal(payload.signals.notASignal, undefined, 'non-whitelisted signal excluded');

    // hints capped: 25 hints of 405+ chars -> 20 hints of <=300 chars
    assert.equal(payload.developerHints.length, 20);
    assert.ok(payload.developerHints.every(h => h.length <= 300));

    // catalog from registry
    assert.equal(payload.presetCatalog.length, 2);
    assert.equal(
        JSON.stringify(payload.presetCatalog[0]),
        JSON.stringify({ id: 'Emery_BalancedBase_v11', label: 'Emery Balanced Base', idea: 'баланс', use: 'база', risk: 'низкий' })
    );

    // catalog capped at 40
    const bigRegistry = makeRegistry();
    bigRegistry.active = Array.from({ length: 50 }, (_, i) => `preset_${i}`);
    const bigPayload = LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: makeRuleDecision(), registry: bigRegistry });
    assert.equal(bigPayload.presetCatalog.length, 40, 'catalog capped at 40 entries');
}

// --- 1b. hint object conversion (Ф2a #441) -----------------------------------
{
    const { LLM } = loadModule();
    const snapshot = makeSnapshot();
    snapshot.developerHints = [
        'plain string hint',
        { text: 'object hint text' },
        { text: 'x'.repeat(400) },   // object hint over cap -> sliced to 300
        { text: '' },                 // empty text -> filtered out
        { other: 'no text key' },     // no .text -> '' -> filtered out
        null                          // null hint -> '' -> filtered out
    ];
    const payload = LLM.buildPayload({ snapshot, ruleDecision: makeRuleDecision(), registry: makeRegistry() });
    assert.deepEqual(
        payload.developerHints,
        ['plain string hint', 'object hint text', 'x'.repeat(300)],
        'object hints contribute .text; empty/missing filtered; per-hint cap applied'
    );
    assert.ok(
        !payload.developerHints.some(h => h.includes('[object Object]')),
        'no [object Object] leak from object hints'
    );
}

// --- 2. fail-closed guards ---------------------------------------------------
{
    const { LLM } = loadModule();
    assert.equal(LLM.buildPayload({}), null, 'no args -> null');
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: makeRuleDecision() }), null, 'no registry -> null');
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), registry: makeRegistry() }), null, 'no ruleDecision -> null');
    const empty = makeRegistry();
    empty.active = [];
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: makeRuleDecision(), registry: empty }), null, 'empty active list -> null');
}

// --- 3. escaping -------------------------------------------------------------
{
    const { LLM } = loadModule();
    const html = LLM.renderAnswer({
        available: true,
        presetLabel: '<script>alert(1)</script>',
        preset: 'x',
        confidence: 'high',
        reason: '<img src=x onerror=alert(2)>',
        model: 'm',
        latencyMs: 1000
    });
    assert.ok(!html.includes('<script>'), 'raw script tag must not survive');
    assert.ok(html.includes('&lt;script&gt;'), 'label escaped');
    assert.ok(!html.includes('<img'), 'raw img tag must not survive');
    assert.ok(html.includes('&lt;img'), 'reason escaped');
    assert.ok(html.includes('только совет'), 'advisory-only disclaimer present');

    // Ф2a (#441): apply button present exactly when available && preset.
    // This answer is available with a non-empty preset -> button rendered.
    assert.ok(html.includes('id="slf-llm-apply-btn"'), 'apply button rendered for available answer with preset');
    assert.ok(html.includes('data-slf-llm-apply-preset="x"'), 'apply button carries the preset id');
    assert.ok(html.includes('data-slf-llm-apply-advice-id=""'), 'apply button carries advice id (empty when absent)');
    assert.ok(html.includes('Применить пресет'), 'apply button label present');

    // Hostile preset/adviceId must be escaped so the attribute cannot break out.
    const hostile = LLM.renderAnswer({
        available: true,
        preset: 'a"b<c>&d',
        adviceId: 'id"onmouseover="alert(1)<script>',
        presetLabel: 'L',
        confidence: 'low',
        reason: 'r',
        model: 'm',
        latencyMs: 100
    });
    assert.ok(hostile.includes('data-slf-llm-apply-preset="a&quot;b&lt;c&gt;&amp;d"'), 'preset attribute value escaped');
    assert.ok(hostile.includes('data-slf-llm-apply-advice-id="id&quot;onmouseover=&quot;alert(1)&lt;script&gt;"'), 'adviceId attribute value escaped');
    assert.ok(!hostile.includes('a"b<c>&d'), 'raw hostile preset must not survive unescaped');
    assert.ok(!hostile.includes('onmouseover="alert(1)'), 'raw adviceId breakout must not survive');

    // No apply button when available but preset is empty or missing.
    const emptyPreset = LLM.renderAnswer({ available: true, preset: '', presetLabel: 'L', confidence: 'low', reason: 'r', model: 'm', latencyMs: 100 });
    assert.ok(!emptyPreset.includes('slf-llm-apply-btn'), 'no apply button when preset is empty');
    const missingPreset = LLM.renderAnswer({ available: true, presetLabel: 'L', confidence: 'low', reason: 'r', model: 'm', latencyMs: 100 });
    assert.ok(!missingPreset.includes('slf-llm-apply-btn'), 'no apply button when preset is missing');

    const unavailable = LLM.renderAnswer({ available: false, error: '<b>boom</b>' });
    assert.ok(unavailable.includes('LLM недоступен'), 'unavailable message rendered');
    assert.ok(unavailable.includes('&lt;b&gt;boom&lt;/b&gt;'), 'error text escaped');
    assert.ok(!unavailable.includes('<b>boom'), 'raw error markup must not survive');
    assert.ok(!unavailable.includes('slf-llm-apply-btn'), 'no apply button when unavailable');

    const broken = LLM.renderAnswer(null);
    assert.ok(broken.includes('LLM недоступен'), 'null answer renders unavailable');
    assert.ok(!broken.includes('slf-llm-apply-btn'), 'no apply button for null answer');
}

// --- 4. mountAnswer ----------------------------------------------------------
{
    const { LLM, document } = loadModule();
    assert.equal(LLM.mountAnswer('<div id="slf-llm-second-opinion-answer">x</div>'), true, 'mounts into panel');
    assert.equal(document.panel.children.length, 1);
    assert.equal(document.answerNode.removed, true, 'previous answer removed');

    assert.equal(LLM.mountAnswer('<div></div>'), true, 'remount replaces');
    assert.equal(document.panel.children.length, 2);

    const { LLM: noPanel } = loadModule({ withPanel: false });
    assert.equal(noPanel.mountAnswer('<div></div>'), false, 'no panel -> false');
}

// --- 5. Api.postJson timeout pass-through ------------------------------------
function makeApiContext({ advisorResponse, advisorStatus } = {}) {
    const requests = [];
    const context = {
        console,
        Object, Array, Map, Set, Date, JSON, String, Number, Promise,
        Math, RegExp, Error, Boolean, Symbol,
        setTimeout, clearTimeout,
        CONFIG: { SERVER_URL: 'https://slf-api.mostdef.ru' },
        getApiToken: () => 'test-token',
        warnMissingApiTokenOnce: () => {},
        debugLog: () => {},
        debugWarn: () => {},
        GM_xmlhttpRequest(request) {
            requests.push(request);
            if (advisorStatus != null) {
                request.onload({ status: advisorStatus, responseText: JSON.stringify(advisorResponse) });
            }
        }
    };
    return { context, requests };
}

function loadApi(context) {
    vm.createContext(context);
    vm.runInContext(read('src/core/api.js') + '\n;globalThis.__Api = Api;', context, { filename: 'api.js' });
    return context.__Api;
}

{
    const { context, requests } = makeApiContext({ advisorResponse: { available: true, preset: 'x' }, advisorStatus: 200 });
    const Api = loadApi(context);
    const answer = await Api.postJson('advisor', { schema: 'slf_llm_advisor_request_v1' }, 'llm-advisor', 35000);

    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.url, 'https://slf-api.mostdef.ru/api/advisor');
    assert.equal(request.method, 'POST');
    assert.equal(request.timeout, 35000, 'custom timeout passed through');
    assert.equal(request.headers['Content-Type'], 'application/json');
    assert.equal(request.headers['Authorization'], 'Bearer test-token');
    assert.deepEqual(JSON.parse(request.data), { schema: 'slf_llm_advisor_request_v1' });
    assert.deepEqual(answer, { available: true, preset: 'x' }, 'parsed body returned');

    // default timeout unchanged (backward compat)
    await Api.postJson('advisor', {}, 'llm-advisor');
    assert.equal(requests[1].timeout, 15000, 'default timeout preserved');
}

{
    // 503 -> rejection carries status for the UI mapping
    const { context, requests } = makeApiContext({ advisorResponse: { available: false, errorKind: 'advisor_not_configured' }, advisorStatus: 503 });
    const Api = loadApi(context);
    await assert.rejects(
        () => Api.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.status === 503 && error.kind === 'http'
    );
    assert.equal(requests[0].timeout, 35000);
}

// --- 6. requestSecondOpinion uses the module endpoint + timeout --------------
{
    const { LLM, context } = loadModule();
    const calls = [];
    context.Api = {
        postJson(collection, payload, label, timeoutMs) {
            calls.push({ collection, payload, label, timeoutMs });
            return Promise.resolve({ available: true });
        }
    };
    const result = await LLM.requestSecondOpinion({ schema: 'slf_llm_advisor_request_v1' });
    assert.deepEqual(result, { available: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].collection, 'advisor');
    assert.equal(calls[0].timeoutMs, LLM.REQUEST_TIMEOUT_MS);
    assert.equal(calls[0].timeoutMs, 35000);
}

console.log('test-llm-second-opinion: all assertions passed');
