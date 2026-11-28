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
        // holder.firstElementChild behaves like a real element. The raw markup is
        // kept on `html` so tests can assert on rendered text.
        set innerHTML(html) {
            this.html = String(html);
            const match = String(html).match(/id="([^"]+)"/);
            const child = makeElement(match ? match[1] : '');
            child.html = String(html);
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
    const chatNode = makeElement('slf-llm-chat');
    return {
        panel, answerNode, chatNode,
        getElementById(id) {
            if (id === 'slf-parser-recommendation') return panel;
            if (id === 'slf-llm-second-opinion-answer') return answerNode.removed ? null : answerNode;
            if (id === 'slf-llm-chat') return chatNode.removed ? null : chatNode;
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
    // #461: a missing rules decision is no longer a refusal — it becomes a
    // marked partial payload (block 11). "Nothing to advise with" still fails;
    // partial mode additionally needs the snapshot's own situation.
    assert.equal(LLM.buildPayload({ ruleDecision: null, registry: makeRegistry() }), null, 'partial mode without a snapshot -> null');
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: null }), null, 'partial mode still needs a registry -> null');
    const empty = makeRegistry();
    empty.active = [];
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: makeRuleDecision(), registry: empty }), null, 'empty active list -> null');
    assert.equal(LLM.buildPayload({ snapshot: makeSnapshot(), ruleDecision: null, registry: empty }), null, 'empty active list -> null in partial mode too');
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

// --- 4b. Phase 1 (#459): no-dialog payload is byte-identical ----------------
{
    const { LLM } = loadModule();
    const expected = {
        schema: 'slf_llm_advisor_request_v1',
        gameId: 'g-123',
        minute: 30,
        bucket: '16-30',
        score: { home: 0, away: 1 },
        currentPreset: 'Emery_BalancedBase_v11',
        developerHints: Array.from(
            { length: 20 },
            (_, i) => `hint-${i} ${'x'.repeat(400)}`.slice(0, 300)
        ),
        ruleDecision: {
            preset: 'Emery_BalancedBase_v11',
            gameMode: 'active_control',
            confidence: 'medium',
            topCandidates: [
                { id: 'Emery_BalancedBase_v11', score: 35.7 },
                { id: 'Pep_BoxControl_bal2', score: 23.5 }
            ]
        },
        // SIGNAL_KEYS iteration order: minute, strengthGap, pressureRisk,
        // gameMode, underPressure.
        signals: {
            minute: 30,
            strengthGap: -12,
            pressureRisk: 41.4,
            gameMode: 'active_control',
            underPressure: true
        },
        presetCatalog: [
            { id: 'Emery_BalancedBase_v11', label: 'Emery Balanced Base', idea: 'баланс', use: 'база', risk: 'низкий' },
            { id: 'Pep_BoxControl_bal2', label: 'Pep Box Control', idea: 'контроль', use: 'при контроле', risk: 'средний' }
        ]
    };
    const baseArgs = {
        snapshot: makeSnapshot(),
        ruleDecision: makeRuleDecision(),
        registry: makeRegistry()
    };
    // Absent, empty, or fully-cleaned-away dialogues must not add the key.
    for (const dialog of [undefined, null, [], [{ role: 'system', text: 'nope' }], [{ role: 'user', text: '   ' }]]) {
        const payload = LLM.buildPayload({ ...baseArgs, dialog });
        assert.equal(
            JSON.stringify(payload),
            JSON.stringify(expected),
            `no-dialog payload byte-identical for dialog=${JSON.stringify(dialog)}`
        );
        assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'dialog'),
            `no dialog key for dialog=${JSON.stringify(dialog)}`);
    }
}

// --- 4c. Phase 1 (#459): dialog cleaning + caps -----------------------------
{
    const { LLM } = loadModule();
    assert.equal(LLM.MAX_DIALOG_TURNS, 20);
    assert.equal(LLM.MAX_DIALOG_TURN_CHARS, 500);
    const baseArgs = {
        snapshot: makeSnapshot(),
        ruleDecision: makeRuleDecision(),
        registry: makeRegistry()
    };
    const payload = LLM.buildPayload({
        ...baseArgs,
        dialog: [
            { role: 'user', text: '  держим центр  ', ts: 111 },
            { role: 'assistant', text: 'x'.repeat(900) },
            { role: 'system', text: 'evil' },          // bad role dropped
            { role: 'user', text: '' },                // blank dropped
            { role: 'user', text: 42 },                // non-string dropped
            { role: 'assistant', text: 'y', ts: 'not-a-number' }, // ts dropped
            'nope', null                               // non-objects dropped
        ]
    });
    assert.equal(payload.dialog.length, 3, 'only valid user/assistant turns survive');
    assert.equal(JSON.stringify(payload.dialog[0]), JSON.stringify({ role: 'user', text: 'держим центр', ts: 111 }),
        'text trimmed, numeric ts kept');
    assert.equal(payload.dialog[1].text, 'x'.repeat(500), 'text capped at 500 chars');
    assert.equal(JSON.stringify(payload.dialog[2]), JSON.stringify({ role: 'assistant', text: 'y' }),
        'non-numeric ts omitted');
    assert.equal(Object.keys(payload).at(-1), 'dialog', 'dialog appended after legacy keys');

    const many = LLM.buildPayload({
        ...baseArgs,
        dialog: Array.from({ length: 30 }, (_, i) => ({
            role: i % 2 ? 'assistant' : 'user',
            text: `t${i}`
        }))
    });
    assert.equal(many.dialog.length, 20, 'turns capped at 20');
    assert.equal(many.dialog[0].text, 't0', 'cap keeps the first 20 turns');
}

// --- 4d. Phase 1 (#459): renderChat escaping + busy state -------------------
{
    const { LLM } = loadModule();
    const html = LLM.renderChat({
        turns: [
            { role: 'user', text: '<script>alert(1)</script>' },
            { role: 'assistant', text: 'a"b & <c>' }
        ],
        busy: true
    });
    assert.ok(!html.includes('<script>'), 'raw script tag must not survive renderChat');
    assert.ok(html.includes('&lt;script&gt;'), 'user turn text escaped');
    assert.ok(html.includes('a&quot;b &amp; &lt;c&gt;'), 'assistant turn text escaped');
    assert.ok(html.includes('id="slf-llm-chat"'), 'chat container id');
    assert.ok(html.includes('id="slf-llm-chat-input"'), 'chat input id');
    assert.ok(html.includes('id="slf-llm-chat-send"'), 'chat send id');
    assert.ok(html.includes('Диалог с тренером'), 'chat header present');

    const busyInput = html.match(/<input[^>]*id="slf-llm-chat-input"[^>]*>/)[0];
    const busySend = html.match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(busyInput.includes('disabled'), 'input disabled while busy');
    assert.ok(busySend.includes('disabled'), 'send disabled while busy');

    const idle = LLM.renderChat({ turns: [], busy: false });
    const idleInput = idle.match(/<input[^>]*id="slf-llm-chat-input"[^>]*>/)[0];
    const idleSend = idle.match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(!idleInput.includes('disabled'), 'input enabled when idle');
    assert.ok(!idleSend.includes('disabled'), 'send enabled when idle');
    assert.ok(idle.includes('Пока нет реплик'), 'empty chat shows the placeholder');
}

// --- 4e. Phase 1 (#459): mountChat ------------------------------------------
{
    const { LLM, document } = loadModule();
    assert.equal(LLM.mountChat('<div id="slf-llm-chat">x</div>'), true, 'mounts into the recommendation panel');
    assert.equal(document.chatNode.removed, true, 'previous chat node removed');
    assert.equal(document.panel.children.length, 1);

    const { LLM: noPanel } = loadModule({ withPanel: false });
    assert.equal(noPanel.mountChat('<div id="slf-llm-chat"></div>'), false, 'no panel -> false');
}

// --- 5. Api.postJson timeout pass-through ------------------------------------
function makeApiContext({ advisorResponse, advisorStatus, advisorRawText } = {}) {
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
                request.onload({
                    status: advisorStatus,
                    responseText: advisorRawText != null ? advisorRawText : JSON.stringify(advisorResponse)
                });
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

// --- 7. answer meta line: model (+ provider) + latency -----------------------
// Owner request: the meta line must show which provider served the answer when
// the server reports it, and keep the legacy `<model> · <latency>` rendering
// exactly as-is when it does not (older server / upstream payload without it).
{
    const { LLM } = loadModule();
    const base = {
        available: true,
        preset: 'x',
        presetLabel: 'L',
        confidence: 'high',
        reason: 'r',
        model: 'test-model',
        latencyMs: 2300
    };

    // Provider present -> model · provider · latency.
    const withProvider = LLM.renderAnswer({ ...base, provider: 'Particle' });
    assert.ok(
        withProvider.includes('test-model · Particle · 2.3s · только совет'),
        `provider rendered in the meta line: ${withProvider}`
    );

    // Provider absent in every "absent" shape -> the EXACT legacy line, no
    // dangling separator, no placeholder text.
    for (const missing of [undefined, null, '', '   ', 42, {}]) {
        const html = LLM.renderAnswer({ ...base, provider: missing });
        assert.ok(
            html.includes('test-model · 2.3s · только совет'),
            `legacy meta line kept for provider=${JSON.stringify(missing)}: ${html}`
        );
        assert.ok(!html.includes('undefined'), `no undefined in the meta line for provider=${JSON.stringify(missing)}`);
        assert.ok(!html.includes('·  ·'), `no dangling separator for provider=${JSON.stringify(missing)}`);
    }

    // The provider is escaped with the same escapeHtml helper as the model.
    const hostile = LLM.renderAnswer({ ...base, provider: '<b>Hack</b>&"x' });
    assert.ok(
        hostile.includes('test-model · &lt;b&gt;Hack&lt;/b&gt;&amp;&quot;x · 2.3s'),
        `provider escaped: ${hostile}`
    );
    assert.ok(!hostile.includes('<b>Hack</b>'), 'raw provider markup must not survive');
}

// --- 8. Ф2c (#441): lab exposure checkpoint from the LLM fresh path ----------
// The manual hint button — the only live lab checkpoint — was retired by Ф2a.
// Requesting a fresh LLM opinion must record the same checkpoint with its own
// source label under the manual path's guard, BEFORE the advisor request, so a
// failed LLM call still records that the user was present in the match.
function makeUiContext({ foreign = false, advisorRejection = null, decideRule = true } = {}) {
    const checkpoints = [];
    const advisorCalls = [];
    const order = [];
    const created = [];
    // #465: the module binds its click handlers via document.addEventListener;
    // the stub keeps them so the adjust/preset delegation is testable.
    const clickListeners = [];
    const logs = [];
    const panel = { id: 'slf-match-parser-panel', children: [], insertBefore(node) { this.children.push(node); } };
    const status = { id: 'slf-parser-status', textContent: '' };
    // mountAnswer (llm-second-opinion.js) mounts here; `html` keeps the markup
    // so the rendered advisor error text is assertable.
    const answerPanel = makeElement('slf-parser-recommendation');
    // Phase 1 (#459): chat controls mounted by the ui-extension are looked up
    // by id; the stubs keep their value/onclick so the send flow is testable.
    const chatInput = { id: 'slf-llm-chat-input', value: '' };
    const chatSend = { id: 'slf-llm-chat-send', disabled: false, onclick: null };
    const elements = new Map([
        ['slf-match-parser-panel', panel],
        ['slf-parser-status', status],
        ['slf-parser-recommendation', answerPanel],
        ['slf-llm-chat-input', chatInput],
        ['slf-llm-chat-send', chatSend]
    ]);
    // The FRESH snapshot built by the LLM entry; the same object is mutated by
    // normalizeForeignSnapshot and handed to the checkpoint.
    const snapshot = foreign
        ? { gameId: 'g-foreign', minute: 20, bucket: '16-30', score: { home: 1, away: 0 }, teams: [1, 2] }
        : { gameId: 'g-123', minute: 20, bucket: '16-30', score: { home: 1, away: 0 }, myTeam: 1, teams: [1, 2] };
    // #483: normalized observation stub for the pre-LLM refresh preflight.
    // The real path fetches get_stat_desktop JSON; tests that don't care about
    // refresh semantics get a valid observation matching the fixture snapshot.
    const freshObservation = {
        gameId: String(snapshot.gameId),
        status: 'live',
        minuteInfo: { rawMinute: String(snapshot.minute), baseMinute: snapshot.minute, stoppageMinute: 0, effectiveMinute: snapshot.minute, isStoppage: false },
        teams: (snapshot.teams || []).slice(),
        score: { home: snapshot.score.home, away: snapshot.score.away },
        stats: (snapshot.teams || []).map(teamId => ({ teamId, stats: { possession: 50, shots: 1, onTarget: 1, xG: 0.1, accuratePasses: 10, inaccuratePasses: 2, actions: 20, badActionsPct: 10, defVector: 0, pressVector: 0, fouls: 0, corners: 0, offsides: 0, woodwork: 0, individualActions: 0, support: null } })),
        xT: null,
        shotsTable: [],
        eventsText: []
    };

    const context = {
        console, Object, Array, Map, Set, Symbol, Date, Error, JSON, Math, String, Number, Promise, Boolean, RegExp,
        setTimeout() { return 1; },
        clearTimeout() {},
        location: { pathname: '/game.php', href: 'https://sublime.example/game.php' },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        document: {
            __slfFinalTacticApplyDelegation: false,
            __slfLlmApplyDelegation: false,
            getElementById(id) {
                if (elements.has(id)) return elements.get(id);
                // #483: mountAnswer/mountChat look up nodes by id; answers are
                // appended dynamically to the panel, so search there too.
                const inPanel = (answerPanel.children || []).find(n => n && n.id === id);
                if (inPanel && !inPanel.removed) return inPanel;
                return null;
            },
            createElement(tag) {
                const node = makeElement('');
                node.tagName = String(tag).toUpperCase();
                node.dataset = {};
                node.style = {};
                created.push(node);
                return node;
            },
            addEventListener(type, handler) {
                if (type === 'click' && typeof handler === 'function') clickListeners.push(handler);
            }
        },
        UI: {
            addMatchParserPanel() { return null; },
            addParserLog(message) { logs.push(String(message)); },
            updateParserStatus() {}
        },
        STATE: {
            tacticalLabRuntime: {
                checkpoint: async (source, snap) => {
                    order.push('checkpoint');
                    checkpoints.push({ source, snapshot: snap });
                },
                mountUI: async () => {}
            }
        },
        MatchStateParser: {
            getGameId: () => String(snapshot.gameId || ''),
            getStatus: () => 'live',
            isActiveLiveStatus: status => status === 'live' || status === 'halftime' || status === 'unknown'
        },
        MatchStatsParser: {},
        slfMatchRefreshError: (kind, message, extra) => {
            const error = new Error(message || kind || 'match refresh failed');
            error.kind = kind || 'unavailable';
            if (extra && typeof extra === 'object') Object.assign(error, extra);
            return error;
        },
        SnapshotEngine: {
            build: (fresh) => {
                // #483: accept optional fresh observation; return the fixture snapshot.
                // The real build merges fresh match-derived fields; tests assert on
                // the snapshot object identity and key fields.
                if (fresh && typeof fresh === 'object') {
                    snapshot.gameId = String(fresh.gameId || snapshot.gameId);
                    snapshot.minute = fresh.minuteInfo?.effectiveMinute ?? snapshot.minute;
                    snapshot.score = fresh.score || snapshot.score;
                    snapshot.status = fresh.status || snapshot.status;
                }
                return snapshot;
            },
            fetchFreshObservation: async () => freshObservation
        },
        // make() stamps snapshot.ruleDecision exactly like the real ladder (the
        // fresh path feeds that decision into the advisor payload). With
        // decideRule:false it stamps nothing — the early-match (phase collect)
        // shape, where the rules engine has no decision yet (#461).
        RecommendationEngine: {
            __compactCoachModePatchedV4: true,
            __generator561RuleScorerApplied: true,
            hasEnoughLiveData: () => ({ ok: true }),
            make: snap => {
                if (decideRule) {
                    snap.ruleDecision = {
                        action: { preset: 'Emery_BalancedBase_v11', decision: 'active_control' },
                        confidence: { level: 'medium' },
                        moment: { context: { minute: snap.minute, gameMode: 'active_control' } },
                        candidates: [{ preset: 'Emery_BalancedBase_v11', score: 1.5, vetoed: false }]
                    };
                }
                return '<div>recommendation</div>';
            }
        },
        Api: {
            postJson: async (collection, payload) => {
                order.push('advisor');
                advisorCalls.push({ collection, payload });
                if (advisorRejection) throw advisorRejection;
                return {
                    available: true,
                    adviceId: 'adv-1',
                    preset: 'Emery_BalancedBase_v11',
                    presetLabel: 'Emery Balanced Base',
                    confidence: 'medium',
                    reason: 'держим баланс',
                    model: 'test-model',
                    provider: 'Particle',
                    latencyMs: 2300
                };
            }
        }
    };
    context.window = context;
    context.globalThis = context;
    context.SLFActivePresetRegistry = makeRegistry();
    vm.createContext(context);
    vm.runInContext(
        read('src/modules/strategy-data-recommendations/llm-second-opinion.js') + '\n;globalThis.__LLM = LLMSecondOpinion;',
        context,
        { filename: 'llm-second-opinion.js' }
    );
    vm.runInContext(
        read('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js'),
        context,
        { filename: 'strategy-data-task-a-ui-extension.js' }
    );
    const llmButton = created.find(node => node.id === 'slf-llm-second-opinion-btn');
    return { context, snapshot, checkpoints, advisorCalls, order, llmButton, answerPanel, chatInput, chatSend, clickListeners, logs };
}

// One macrotask turn lets every already-resolved promise chain (the click
// handler's awaited bridge/report calls) drain before assertions run.
const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Deliver a synthetic click to every captured document listener. Only the
// listener owning `selectorId` sees a matching target, so the unrelated
// delegated handlers (final tactic / preset) no-op exactly like in the page.
function dispatchDelegatedClick(run, selectorId, btn) {
    const target = { closest: selector => (selector === selectorId ? btn : null) };
    for (const listener of run.clickListeners) listener({ target });
}

function makeAdjustButton(changes, adviceId = '') {
    return {
        id: 'slf-llm-apply-adjust',
        dataset: {
            slfLlmApplyChanges: typeof changes === 'string' ? changes : JSON.stringify(changes),
            slfLlmApplyAdviceId: adviceId
        },
        disabled: false,
        textContent: 'Применить изменения'
    };
}

{
    // Owned match: checkpoint('llm_second_opinion', freshSnapshot) exactly once,
    // before the advisor request.
    const { snapshot, checkpoints, advisorCalls, order, llmButton } = makeUiContext();
    assert.ok(llmButton, 'LLM entry mounted by the ui-extension');
    await llmButton.onclick();

    assert.equal(checkpoints.length, 1, `exactly one lab checkpoint from the LLM fresh path: ${checkpoints.length}`);
    assert.equal(checkpoints[0].source, 'llm_second_opinion', `checkpoint source label: ${checkpoints[0].source}`);
    assert.equal(checkpoints[0].snapshot, snapshot, 'checkpoint receives the FRESH snapshot object');
    assert.equal(checkpoints[0].snapshot.minute, 20, 'checkpoint snapshot carries the fresh minute');
    assert.deepEqual(order, ['checkpoint', 'advisor'], `checkpoint runs before the advisor request: ${order}`);
    assert.equal(advisorCalls.length, 1, 'advisor request still sent');
    assert.equal(advisorCalls[0].collection, 'advisor');
}

{
    // Foreign match: the checkpoint is guarded out exactly like the manual path
    // (foreign snapshots are read-only analysis); the advisor request proceeds.
    const foreignRun = makeUiContext({ foreign: true });
    assert.equal(foreignRun.snapshot.matchOwnership, 'foreign', 'fixture normalized to a foreign snapshot');
    await foreignRun.llmButton.onclick();
    assert.equal(foreignRun.checkpoints.length, 0, 'no lab checkpoint for a foreign match');
    assert.deepEqual(foreignRun.order, ['advisor'], `foreign path goes straight to the advisor: ${foreignRun.order}`);
    assert.equal(foreignRun.advisorCalls.length, 1);
}

// --- 9. Honest advisor error text (#454) -------------------------------------
// The server already classifies its own failures (advisor.py errorKind); a
// 502/503 body must not collapse every cause into the generic status guess.
// The rendered answer is inspected via the mountAnswer sink from makeUiContext.
function mountedErrorText(run) {
    const children = (run.answerPanel.children || []).filter(c => c && !c.removed);
    const answers = children.filter(c => c && c.id === 'slf-llm-second-opinion-answer');
    const node = answers[answers.length - 1] || children[children.length - 1];
    return node ? String(node.html || '') : '';
}

function makeAdvisorError(fields) {
    return Object.assign(
        new Error(`SLF API http error during llm-advisor${fields.status ? ` (HTTP ${fields.status})` : ''}`),
        { name: 'SLFApiError', kind: 'http' },
        fields
    );
}

{
    // empty_answer (match 35115343): the honest cause, not "невалидный ответ".
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer' })
    });
    await run.llmButton.onclick();
    const text = mountedErrorText(run);
    assert.ok(text.includes('пустой ответ'), `empty_answer rendered honestly: ${text}`);
    assert.ok(!text.includes('невалидный ответ'), `empty_answer must not render as invalid answer: ${text}`);
}

{
    // Unknown server kind -> the server's own error text wins over the guess.
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({
            status: 502,
            errorKind: 'something_new',
            serverError: 'провайдер отклонил модель'
        })
    });
    await run.llmButton.onclick();
    const text = mountedErrorText(run);
    assert.ok(text.includes('провайдер отклонил модель'), `server error text used: ${text}`);
}

{
    // No body fields (older server / non-JSON body): legacy status fallback.
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502 })
    });
    await run.llmButton.onclick();
    const text = mountedErrorText(run);
    assert.ok(text.includes('LLM вернул невалидный ответ'), `legacy 502 fallback kept: ${text}`);
}

{
    // createApiError carries errorKind/serverError from a stubbed non-2xx JSON
    // body, redacts the API token, and leaves the fields absent for non-JSON.
    const withBody = makeApiContext({
        advisorResponse: { available: false, errorKind: 'empty_answer', error: 'model returned no content' },
        advisorStatus: 502
    });
    const Api = loadApi(withBody.context);
    await assert.rejects(
        () => Api.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.kind === 'http'
            && error.status === 502
            && error.errorKind === 'empty_answer'
            && error.serverError === 'model returned no content'
    );

    const redacted = makeApiContext({
        advisorResponse: { available: false, error: 'bad test-token here' },
        advisorStatus: 502
    });
    const RedactedApi = loadApi(redacted.context);
    await assert.rejects(
        () => RedactedApi.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.serverError === 'bad [redacted] here'
    );

    const raw = makeApiContext({ advisorRawText: '<html>bad gateway</html>', advisorStatus: 502 });
    const RawApi = loadApi(raw.context);
    await assert.rejects(
        () => RawApi.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.kind === 'http' && error.errorKind === undefined && error.serverError === undefined
    );

    // #471: the server's allowlisted finishReason is carried on the error
    // object; any other value is never echoed.
    const withLength = makeApiContext({
        advisorResponse: { available: false, errorKind: 'empty_answer', error: 'model returned no content', finishReason: 'length' },
        advisorStatus: 502
    });
    const LengthApi = loadApi(withLength.context);
    await assert.rejects(
        () => LengthApi.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.kind === 'http'
            && error.errorKind === 'empty_answer'
            && error.finishReason === 'length'
    );

    const otherReason = makeApiContext({
        advisorResponse: { available: false, errorKind: 'upstream_error', finishReason: 'content_filter' },
        advisorStatus: 502
    });
    const OtherReasonApi = loadApi(otherReason.context);
    await assert.rejects(
        () => OtherReasonApi.postJson('advisor', {}, 'llm-advisor', 35000),
        error => error.kind === 'http' && error.finishReason === undefined
    );
}

{
    // Full chain (#454): a stubbed non-2xx JSON body from GM_xmlhttpRequest
    // becomes a real Api.postJson rejection carrying errorKind/serverError,
    // and that EXACT error object (not a hand-built one) drives the UI error
    // text through the mounted answer. No seam is stubbed between the halves.
    const apiRun = makeApiContext({
        advisorResponse: { available: false, errorKind: 'empty_answer', error: 'model returned no content' },
        advisorStatus: 502
    });
    const Api = loadApi(apiRun.context);
    let capturedError;
    try {
        await Api.postJson('advisor', {}, 'llm-advisor', 35000);
    } catch (error) {
        capturedError = error;
    }
    assert.ok(capturedError, 'Api.postJson rejected the non-2xx response');
    assert.equal(capturedError.kind, 'http', 'rejection is an http error');
    assert.equal(capturedError.errorKind, 'empty_answer', 'rejection carries the server error kind');
    assert.equal(capturedError.serverError, 'model returned no content', 'rejection carries the server error text');

    const run = makeUiContext({ advisorRejection: capturedError });
    await run.llmButton.onclick();
    const text = mountedErrorText(run);
    assert.ok(text.includes('пустой ответ'), `chained empty_answer rendered honestly: ${text}`);
    assert.ok(!text.includes('невалидный ответ'), `chained empty_answer must not render as invalid answer: ${text}`);
}

// --- 10. Phase 1 (#459): chat send flow --------------------------------------
// The chat window is an additional entry point next to the «🤖 LLM» button:
// one send = one advisor request with the accumulated dialogue; the answer
// still renders with the «Применить пресет» button (no auto-apply).
function lastNodeHtml(run, id) {
    const marker = `id="${id}"`;
    const nodes = (run.answerPanel.children || []).filter(node => !node.removed && String(node.html || '').includes(marker));
    const node = nodes[nodes.length - 1];
    return node ? String(node.html || '') : '';
}

{
    const run = makeUiContext();
    assert.ok(run.chatSend && typeof run.chatSend.onclick === 'function', 'chat send wired on mount');
    run.chatInput.value = 'Соперник давит справа';
    const callsBefore = run.advisorCalls.length;
    await run.chatSend.onclick();

    assert.equal(run.advisorCalls.length, callsBefore + 1, 'one advisor request per chat turn');
    const payload = run.advisorCalls[run.advisorCalls.length - 1].payload;
    assert.equal(payload.dialog.length, 1, 'payload carries the accumulated dialogue');
    assert.equal(payload.dialog[0].role, 'user');
    assert.equal(payload.dialog[0].text, 'Соперник давит справа');
    assert.equal(typeof payload.dialog[0].ts, 'number', 'user turn stamped with ts');

    const turns = run.context.STATE.llmDialogByGame['g-123'];
    assert.equal(turns.length, 2, 'user + assistant turns kept per game');
    assert.deepEqual(
        { role: turns[0].role, text: turns[0].text },
        { role: 'user', text: 'Соперник давит справа' }
    );
    assert.deepEqual(
        { role: turns[1].role, text: turns[1].text },
        { role: 'assistant', text: 'держим баланс' },
        'assistant turn carries the model reason'
    );

    const chatHtml = lastNodeHtml(run, 'slf-llm-chat');
    assert.ok(chatHtml.includes('Соперник давит справа'), 'user turn rendered');
    assert.ok(chatHtml.includes('держим баланс'), 'assistant turn rendered');
    assert.ok(chatHtml.includes('data-slf-llm-chat-turn="assistant"'), 'assistant turn marked');
    const sendTag = chatHtml.match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(!sendTag.includes('disabled'), 'send re-enabled after a successful turn');
    assert.equal(run.chatInput.value, '', 'input cleared after send');

    const answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('slf-llm-apply-btn'), 'answer rendered with the apply button');
    assert.ok(answerHtml.includes('Применить пресет'), 'apply label is the existing one');
}

{
    const run = makeUiContext();
    run.chatInput.value = '   ';
    const before = run.advisorCalls.length;
    const result = await run.chatSend.onclick();
    assert.equal(result, null, 'blank input sends nothing');
    assert.equal(run.advisorCalls.length, before, 'no advisor request for blank input');
    const turns = run.context.STATE.llmDialogByGame['g-123'] || [];
    assert.equal(turns.length, 0, 'blank input appends no turn');
}

{
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer' })
    });
    run.chatInput.value = 'жми выше';
    await run.chatSend.onclick();

    const turns = run.context.STATE.llmDialogByGame['g-123'];
    assert.equal(turns.length, 1, 'only the user turn survives a failure');
    assert.equal(turns[0].role, 'user');
    assert.equal(turns[0].text, 'жми выше');
    assert.ok(!turns.some(turn => turn.role === 'assistant'), 'no fake assistant turn on failure');

    const answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('пустой ответ'), `honest advisor error text rendered: ${answerHtml}`);

    const chatHtml = lastNodeHtml(run, 'slf-llm-chat');
    assert.ok(chatHtml.includes('жми выше'), 'user turn stays visible for a resend');
    const sendTag = chatHtml.match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(!sendTag.includes('disabled'), 'send re-enabled after a failure');
}

{
    // #471: chat «Повторить» — resends the EXISTING dialogue without appending
    // another user turn; the one-shot button path gets no retry control.
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer' })
    });
    run.chatInput.value = 'жми выше';
    await run.chatSend.onclick();

    let answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('id="slf-llm-chat-retry"'), `retry control mounted on chat failure: ${answerHtml}`);
    assert.ok(answerHtml.includes('Повторить'), 'retry label present');
    assert.ok(!/id="slf-llm-chat-retry"[^>]*disabled/.test(answerHtml), 'retry control enabled on failure');

    const buttonRun = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer', finishReason: 'length' })
    });
    await buttonRun.llmButton.onclick();
    const buttonText = mountedErrorText(buttonRun);
    assert.ok(buttonText.includes('Модель исчерпала лимит ответа'), `honest length text on the button path: ${buttonText}`);
    assert.ok(!buttonText.includes('slf-llm-chat-retry'), 'no retry control on the one-shot button path');

    // The retry succeeds: one advisor call, SAME dialogue, only the assistant
    // turn is added.
    run.context.Api.postJson = async (collection, payload) => {
        run.advisorCalls.push({ collection, payload });
        return {
            available: true, adviceId: 'adv-2', preset: 'Emery_BalancedBase_v11',
            presetLabel: 'Emery Balanced Base', confidence: 'medium',
            reason: 'держим баланс', model: 'test-model', latencyMs: 100
        };
    };
    const retryBtn = { id: 'slf-llm-chat-retry', disabled: false };
    dispatchDelegatedClick(run, '#slf-llm-chat-retry', retryBtn);
    await flushAsync();

    assert.ok(retryBtn.disabled, 'retry button disabled on click');
    const retryPayload = run.advisorCalls[run.advisorCalls.length - 1].payload;
    assert.equal(retryPayload.dialog.length, 1, 'retry sends the EXISTING dialogue — no duplicate user turn');
    assert.equal(retryPayload.dialog[0].role, 'user');
    assert.equal(retryPayload.dialog[0].text, 'жми выше');
    const turns = run.context.STATE.llmDialogByGame['g-123'];
    assert.deepEqual([...turns].map(t => t.role), ['user', 'assistant'], 'assistant added once, no duplicated user turn');

    answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('slf-llm-apply-btn'), 'successful retry renders the answer');
    assert.ok(!answerHtml.includes('slf-llm-chat-retry'), 'retry control gone after success');
}

{
    // #471: while a retry request is in flight the answer node shows
    // «Думает…» (no retry control) and send is disabled; a second click sends
    // nothing; a failed retry restores the control enabled with the honest
    // length text and adds no dialogue turn.
    let rejectAdvisors;
    const run = makeUiContext({
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer' })
    });
    run.chatInput.value = 'жми выше';
    await run.chatSend.onclick(); // failure #1: retry control mounted

    run.context.Api.postJson = (collection, payload) => {
        run.advisorCalls.push({ collection, payload });
        return new Promise((resolve, reject) => { rejectAdvisors = reject; });
    };
    dispatchDelegatedClick(run, '#slf-llm-chat-retry', { id: 'slf-llm-chat-retry', disabled: false });
    await flushAsync();

    assert.equal(run.advisorCalls.length, 2, 'retry issued exactly one advisor request');
    let answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('Думает'), `in-flight answer shows progress: ${answerHtml}`);
    assert.ok(!answerHtml.includes('slf-llm-chat-retry'), 'retry control absent while busy');
    const busySend = lastNodeHtml(run, 'slf-llm-chat').match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(busySend.includes('disabled'), 'send disabled while retry is in flight');

    dispatchDelegatedClick(run, '#slf-llm-chat-retry', { id: 'slf-llm-chat-retry', disabled: false });
    await flushAsync();
    assert.equal(run.advisorCalls.length, 2, 'no second request while busy');

    rejectAdvisors(makeAdvisorError({ status: 502, errorKind: 'empty_answer', finishReason: 'length' }));
    await flushAsync();

    answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('id="slf-llm-chat-retry"'), 'retry control restored on failure');
    assert.ok(!/id="slf-llm-chat-retry"[^>]*disabled/.test(answerHtml), 'restored retry control is enabled');
    assert.ok(answerHtml.includes('Модель исчерпала лимит ответа'), `honest length text on retry failure: ${answerHtml}`);
    const sendTag = lastNodeHtml(run, 'slf-llm-chat').match(/<button[^>]*id="slf-llm-chat-send"[^>]*>/)[0];
    assert.ok(!sendTag.includes('disabled'), 'send re-enabled after failed retry');
    assert.equal(run.context.STATE.llmDialogByGame['g-123'].length, 1, 'failed retry adds no turn');
}

{
    // No gameId: the dialogue must not be shared across matches or sent with
    // gameId:null. Honest refusal, nothing stored, no request.
    const run = makeUiContext();
    delete run.snapshot.gameId;
    run.chatInput.value = 'жми выше';
    const before = run.advisorCalls.length;
    const result = await run.chatSend.onclick();
    assert.equal(result, null, 'no game id -> no advisor request');
    assert.equal(run.advisorCalls.length, before, 'nothing is sent without a match id');
    const dialogs = run.context.STATE.llmDialogByGame || {};
    assert.equal(dialogs.unknown, undefined, "nothing stored under a shared 'unknown' key");
    assert.ok(
        Object.values(dialogs).every(turns => !turns.length),
        'no dialogue turns stored without a game id'
    );
    const answerHtml = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(answerHtml.includes('только на странице матча'), `honest no-game message: ${answerHtml}`);
    assert.equal(run.chatInput.value, 'жми выше', 'input is kept on the no-game refusal');
}

// --- 11. #461: partial-data payload -----------------------------------------
// Early match (phase collect): the rules engine has no decision yet. The
// payload still goes out, explicitly marked partial, so the server may answer
// with a caveated advice instead of the client refusing to ask.
{
    const { LLM } = loadModule();
    for (const ruleDecision of [undefined, null]) {
        const payload = LLM.buildPayload({
            snapshot: makeSnapshot(),
            ruleDecision,
            registry: makeRegistry()
        });
        assert.ok(payload, `partial payload builds for ruleDecision=${ruleDecision}`);
        assert.equal(payload.ruleDecision, null, 'rules decision sent as explicit null');
        assert.equal(payload.dataCompleteness, 'partial', 'partial completeness marker sent');
        assert.equal(
            payload.dataNote,
            'Правила не дали решения на текущих данных матча',
            'short honest note explaining the missing decision'
        );
        // Available situation data is still sent as-is.
        assert.equal(payload.gameId, 'g-123');
        assert.equal(payload.minute, 30);
        assert.equal(payload.bucket, '16-30');
        assert.deepEqual(payload.score, { home: 0, away: 1 }, 'score still sent');
        assert.equal(payload.presetCatalog.length, 2, 'catalog still sent');
        assert.equal(payload.developerHints.length, 20, 'hints still sent');
        assert.equal(JSON.stringify(payload.signals), '{}', 'no fabricated signals without a decision context');
        assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'dialog'), 'no dialog key when absent');
    }

    // Full data: not one byte of the legacy payload changes (the JSON.stringify
    // equality in block 4b is the byte-level pin; this guards the key set/order
    // and the absence of the partial keys).
    const full = LLM.buildPayload({
        snapshot: makeSnapshot(),
        ruleDecision: makeRuleDecision(),
        registry: makeRegistry()
    });
    assert.deepEqual(
        Object.keys(full),
        ['schema', 'gameId', 'minute', 'bucket', 'score', 'currentPreset',
            'developerHints', 'ruleDecision', 'signals', 'presetCatalog'],
        'full payload key set/order unchanged'
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(full, 'dataCompleteness'),
        'no dataCompleteness on a full payload');
    assert.ok(!Object.prototype.hasOwnProperty.call(full, 'dataNote'),
        'no dataNote on a full payload');
    assert.equal(typeof full.ruleDecision, 'object', 'full payload keeps the rules decision object');
}

// --- 12. #461: renderAnswer partial marker -----------------------------------
{
    const { LLM } = loadModule();
    const answer = {
        available: true,
        adviceId: 'adv-1',
        preset: 'x',
        presetLabel: 'L',
        confidence: 'high',
        reason: 'r',
        model: 'm',
        latencyMs: 1000
    };
    const partialHtml = LLM.renderAnswer(answer, { partial: true });
    assert.ok(
        partialHtml.includes('Предварительный совет на неполных данных (правила не дали решения)'),
        `honest preliminary marker rendered: ${partialHtml}`
    );
    // Layout and the click-only apply control are untouched.
    assert.ok(partialHtml.includes('id="slf-llm-apply-btn"'), 'apply button kept in partial mode');
    assert.ok(partialHtml.includes('Применить пресет'), 'apply label unchanged');
    assert.ok(partialHtml.includes('только совет, тактика не применена'), 'advisory-only disclaimer kept');
    assert.ok(
        partialHtml.indexOf('Предварительный совет') < partialHtml.indexOf('🤖 Второе мнение'),
        'marker precedes the answer header'
    );

    // Absent/false flag: the pre-#461 answer, byte-for-byte.
    const plain = LLM.renderAnswer(answer);
    assert.ok(!plain.includes('Предварительный совет'), 'no marker without the partial flag');
    assert.equal(LLM.renderAnswer(answer, {}), plain, 'default options change nothing');
    assert.equal(LLM.renderAnswer(answer, { partial: false }), plain, 'explicit false changes nothing');

    // An unavailable answer stays the honest error box: no marker, no fake
    // advice, no apply button, even when the request was partial.
    const errorHtml = LLM.renderAnswer({ available: false, error: 'LLM недоступен' }, { partial: true });
    assert.ok(errorHtml.includes('LLM недоступен'), 'error text kept');
    assert.ok(!errorHtml.includes('Предварительный совет'), 'no partial marker on the error box');
    assert.ok(!errorHtml.includes('slf-llm-apply-btn'), 'no apply button on the error box');
}

// --- 13. #461: fresh path without a rules decision ---------------------------
// The one-shot «🤖 LLM» button and the chat send both go through
// requestLlmSecondOpinionFresh: neither may silently refuse an early match.
{
    const run = makeUiContext({ decideRule: false });
    assert.equal(run.snapshot.ruleDecision, undefined, 'fixture: the ladder stamped no decision');
    // A stale decision from a previous game must not be resurrected.
    run.context.STATE.lastRuleDecision = makeRuleDecision();
    await run.llmButton.onclick();

    assert.equal(run.advisorCalls.length, 1, 'advisor is called without a rules decision');
    const payload = run.advisorCalls[0].payload;
    assert.equal(payload.ruleDecision, null, 'no stale rules decision is sent');
    assert.equal(payload.dataCompleteness, 'partial', 'partial marker sent');
    assert.equal(payload.dataNote, 'Правила не дали решения на текущих данных матча');
    assert.equal(payload.minute, 20, 'minute still sent');
    assert.deepEqual(payload.score, { home: 1, away: 0 }, 'score still sent');
    assert.equal(payload.presetCatalog.length, 2, 'catalog still sent');

    const html = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(
        html.includes('Предварительный совет на неполных данных (правила не дали решения)'),
        `answer rendered with the preliminary marker: ${html}`
    );
    assert.ok(html.includes('держим баланс'), 'model reason rendered');
    assert.ok(html.includes('slf-llm-apply-btn'), 'apply button kept (explicit click only)');
    assert.ok(!html.includes('LLM недоступен'), 'the old "no decision" refusal is gone');
}

{
    // Partial request that fails: honest error, no fake advice, no marker.
    const run = makeUiContext({
        decideRule: false,
        advisorRejection: makeAdvisorError({ status: 502, errorKind: 'empty_answer' })
    });
    await run.llmButton.onclick();
    assert.equal(run.advisorCalls.length, 1, 'the partial request was actually sent');
    const html = lastNodeHtml(run, 'slf-llm-second-opinion-answer');
    assert.ok(html.includes('пустой ответ'), `honest error text in partial mode: ${html}`);
    assert.ok(!html.includes('Предварительный совет'), 'no preliminary marker on a failure');
    assert.ok(!html.includes('slf-llm-apply-btn'), 'no apply button without an answer');
}

// --- 14. #465: currentControls vector in the payload -------------------------
// The advisor needs the current slider vector to propose fine-grained «adjust»
// changes. The key is purely additive: callers that send nothing keep the
// exact legacy payload bytes, and cleaning drops unknown/non-string values.
{
    const { LLM } = loadModule();
    const args = { snapshot: makeSnapshot(), ruleDecision: makeRuleDecision(), registry: makeRegistry() };
    const withoutVector = LLM.buildPayload(args);
    assert.ok(!Object.prototype.hasOwnProperty.call(withoutVector, 'currentControls'),
        'no currentControls key when the caller sends none');
    const nullVector = LLM.buildPayload({ ...args, currentControls: null });
    assert.equal(JSON.stringify(nullVector), JSON.stringify(withoutVector),
        'an absent/null vector keeps the legacy payload bytes');

    const vector = {
        def_line: '2', press_line: ' 2 ', def_width: '2', press_intense: '3',
        build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
        style: '3', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2',
        unknown_control: '9',
        priority: ['left', 'center', 'left', 'up']
    };
    const withVector = LLM.buildPayload({ ...args, currentControls: vector });
    const expectedVector = {
        def_line: '2', press_line: '2', def_width: '2', press_intense: '3',
        build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
        style: '3', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2',
        priority: ['left', 'center']
    };
    assert.equal(JSON.stringify(withVector.currentControls), JSON.stringify(expectedVector),
        'known control strings survive, unknown keys drop, priority is a clean subset');
    const additive = JSON.parse(JSON.stringify(withVector));
    delete additive.currentControls;
    assert.equal(JSON.stringify(additive), JSON.stringify(withoutVector),
        'the vector is purely additive; the rest of the payload is unchanged');

    // Invalid values are dropped; an empty or non-object vector is omitted.
    const invalidOnly = LLM.buildPayload({ ...args, currentControls: { def_line: 2, priority: ['up'] } });
    assert.ok(!Object.prototype.hasOwnProperty.call(invalidOnly, 'currentControls'),
        'emptied vector is omitted entirely');
    const nonObject = LLM.buildPayload({ ...args, currentControls: 'def_line=2' });
    assert.ok(!Object.prototype.hasOwnProperty.call(nonObject, 'currentControls'),
        'non-object vector is omitted entirely');
}

// --- 15. #465: renderAnswer adjust vs switch/legacy --------------------------
{
    const { LLM } = loadModule();
    const baseAnswer = {
        available: true, adviceId: 'adv-9', confidence: 'low',
        reason: 'сдвинь прессинг', model: 'm', latencyMs: 1200
    };
    const adjustAnswer = {
        ...baseAnswer, mode: 'adjust', preset: null, presetLabel: null,
        changes: [{ control: 'press_intense', value: '5' }, { control: 'style', value: '4<&"' }]
    };
    const adjustHtml = LLM.renderAnswer(adjustAnswer);
    assert.ok(adjustHtml.includes('Точечная подстройка'), `adjust heading rendered: ${adjustHtml}`);
    assert.ok(adjustHtml.includes('press_intense: 5'), 'first change rendered');
    assert.ok(adjustHtml.includes('style: 4&lt;&amp;&quot;'), 'change value escaped');
    assert.ok(adjustHtml.includes('id="slf-llm-apply-adjust"'), 'adjust apply button rendered');
    assert.ok(adjustHtml.includes('data-slf-llm-apply-advice-id="adv-9"'), 'advice id carried');
    assert.ok(!adjustHtml.includes('slf-llm-apply-btn'), 'no preset apply button for adjust');
    assert.ok(!adjustHtml.includes('Применить пресет'), 'no preset apply label for adjust');
    assert.ok(adjustHtml.includes('только совет, тактика не применена'), 'advisory disclaimer kept');
    assert.ok(adjustHtml.includes('(уверенность: low)'), 'confidence meta kept');
    assert.ok(adjustHtml.includes('1.2s'), 'latency meta kept');
    const attr = adjustHtml.match(/data-slf-llm-apply-changes="([^"]*)"/);
    assert.ok(attr, 'changes JSON attribute rendered');
    const decoded = attr[1]
        .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.deepEqual(JSON.parse(decoded), adjustAnswer.changes,
        'attribute round-trips the exact changes JSON');
    // reason stays escaped as before.
    const hostileAdjust = LLM.renderAnswer({
        ...adjustAnswer, changes: [{ control: 'shot', value: '3' }], reason: '<b>odd</b>'
    });
    assert.ok(hostileAdjust.includes('&lt;b&gt;odd&lt;/b&gt;'), 'adjust reason escaped');

    // mode absent but changes present: still the adjust rendering.
    const changesOnly = LLM.renderAnswer({
        ...baseAnswer, changes: [{ control: 'corner', value: '1' }]
    });
    assert.ok(changesOnly.includes('Точечная подстройка'), 'changes without mode render as adjust');
    assert.ok(!changesOnly.includes('slf-llm-apply-btn'), 'no preset button for changes-only answer');

    // Switch and legacy answers keep the pre-#465 preset markup byte-for-byte.
    const switchAnswer = {
        ...baseAnswer, mode: 'switch', preset: 'Emery_BalancedBase_v11',
        presetLabel: 'Emery Balanced Base'
    };
    const switchHtml = LLM.renderAnswer(switchAnswer);
    assert.ok(switchHtml.includes('id="slf-llm-apply-btn"'), 'switch keeps the preset apply button');
    assert.ok(switchHtml.includes('data-slf-llm-apply-preset="Emery_BalancedBase_v11"'),
        'switch preset id carried');
    assert.ok(switchHtml.includes('Применить пресет'), 'switch label unchanged');
    assert.ok(!switchHtml.includes('slf-llm-apply-adjust'), 'switch has no adjust button');
    const { mode: _mode, ...legacyAnswer } = switchAnswer;
    assert.equal(LLM.renderAnswer(legacyAnswer), switchHtml,
        'legacy no-mode answer renders byte-identically to an explicit switch');
}

// --- 16. #465: the UI request sends the current slider vector ----------------
{
    const run = makeUiContext();
    assert.equal(run.advisorCalls.length, 0, 'fixture: no request yet');
    run.context.getCurrentTactic = () => ({
        def_line: '2', press_line: '2', def_width: '2', press_intense: '3',
        build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
        style: '3', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2',
        priority: ['left', 'center'], unknown_control: '9'
    });
    await run.llmButton.onclick();
    assert.equal(run.advisorCalls.length, 1, 'advisor called once');
    assert.equal(JSON.stringify(run.advisorCalls[0].payload.currentControls), JSON.stringify({
        def_line: '2', press_line: '2', def_width: '2', press_intense: '3',
        build_type: '2', build_temp: '2', build_long: '2', build_fast: '2',
        style: '3', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2',
        priority: ['left', 'center']
    }), 'current vector sent, unknown keys dropped');

    const noVector = makeUiContext();
    await noVector.llmButton.onclick();
    assert.ok(!Object.prototype.hasOwnProperty.call(noVector.advisorCalls[0].payload, 'currentControls'),
        'no currentControls key when getCurrentTactic is unavailable (server handles absence)');
}

// --- 17. #465: adjust click applies ONLY the changes, priority preserved -----
// A partial vector without the current priority would be cleared to [] by the
// bridge's normalizePresets(), silently wiping the direction priorities.
{
    const run = makeUiContext();
    run.context.getCurrentTactic = () => ({
        def_line: '2', shot: '2', corner: '1', priority: ['left', 'center']
    });
    const bridgeCalls = [];
    run.context.STATE.tacticControlBridge = {
        applyTacticObject: async (tactic, options) => {
            bridgeCalls.push({ tactic, options });
            return { ok: true, failures: [], mismatches: [], rolledBack: false };
        }
    };
    assert.equal(bridgeCalls.length, 0, 'nothing is applied before the click');
    const btn = makeAdjustButton([{ control: 'shot', value: '3' }, { control: 'corner', value: '2' }], 'adv-1');
    dispatchDelegatedClick(run, '#slf-llm-apply-adjust', btn);
    await flushAsync();

    assert.equal(bridgeCalls.length, 1, 'one bridge apply per click');
    assert.equal(JSON.stringify(bridgeCalls[0].tactic), JSON.stringify({
        shot: '3', corner: '2', priority: ['left', 'center']
    }), 'partial object carries only the changes plus the current priority');
    assert.equal(bridgeCalls[0].options.strict, true, 'strict readback apply');
    assert.equal(bridgeCalls[0].options.source, 'llm_adjust', 'distinct apply source');
    assert.equal(btn.disabled, true, 'button disabled after confirmed apply');
    assert.equal(btn.textContent, 'Применено ✓ (подтверждено в интерфейсе)');
    assert.ok(run.logs.some(line => line.includes('Точечная подстройка из совета LLM применена')),
        `success logged honestly: ${JSON.stringify(run.logs)}`);
    const applyEvent = run.advisorCalls.find(call => call.collection === 'advisor_apply');
    assert.ok(applyEvent, 'advice apply event reported');
    assert.equal(JSON.stringify(applyEvent.payload), JSON.stringify({ adviceId: 'adv-1', ok: true }));

    // A second click on the applied button is ignored.
    dispatchDelegatedClick(run, '#slf-llm-apply-adjust', btn);
    await flushAsync();
    assert.equal(bridgeCalls.length, 1, 're-click is ignored');
}

// --- 18. #465: adjust failures are honest ------------------------------------
{
    const run = makeUiContext();
    run.context.getCurrentTactic = () => ({ def_line: '2', priority: ['right'] });
    run.context.STATE.tacticControlBridge = {
        applyTacticObject: async () => ({
            ok: false, reason: 'post_apply_rolled_back',
            failures: ['shot:missing_dom_input'], mismatches: [], rolledBack: true
        })
    };
    const btn = makeAdjustButton([{ control: 'shot', value: '3' }], 'adv-2');
    dispatchDelegatedClick(run, '#slf-llm-apply-adjust', btn);
    await flushAsync();
    assert.equal(btn.disabled, false, 'button stays usable for a manual retry');
    assert.equal(btn.textContent, 'Применить изменения');
    assert.ok(run.logs.some(line => line.includes(
        'Не удалось применить изменения (post_apply_rolled_back: shot:missing_dom_input)')),
        `honest failure diagnostics: ${JSON.stringify(run.logs)}`);
    const applyEvent = run.advisorCalls.find(call => call.collection === 'advisor_apply');
    assert.equal(JSON.stringify(applyEvent.payload), JSON.stringify({ adviceId: 'adv-2', ok: false }));

    // Unparsable changes payload: nothing reaches the bridge.
    const malformed = makeUiContext();
    const malformedCalls = [];
    malformed.context.getCurrentTactic = () => ({ def_line: '2', priority: [] });
    malformed.context.STATE.tacticControlBridge = {
        applyTacticObject: async tactic => {
            malformedCalls.push(tactic);
            return { ok: true, failures: [], mismatches: [] };
        }
    };
    const badBtn = makeAdjustButton('{not json', 'adv-3');
    dispatchDelegatedClick(malformed, '#slf-llm-apply-adjust', badBtn);
    await flushAsync();
    assert.equal(malformedCalls.length, 0, 'malformed changes never reach the bridge');
    assert.ok(malformed.logs.some(line => line.includes('список изменений не прочитан')),
        `malformed changes reported honestly: ${JSON.stringify(malformed.logs)}`);
    assert.equal(badBtn.disabled, false, 'malformed button stays clickable');

    // Missing bridge: honest refusal, no crash, no mutation claim.
    const noBridge = makeUiContext();
    noBridge.context.getCurrentTactic = () => ({ def_line: '2', priority: [] });
    const noBridgeBtn = makeAdjustButton([{ control: 'def_line', value: '3' }], 'adv-4');
    dispatchDelegatedClick(noBridge, '#slf-llm-apply-adjust', noBridgeBtn);
    await flushAsync();
    assert.ok(noBridge.logs.some(line => line.includes('мост управления тактикой недоступен')),
        `unavailable bridge reported honestly: ${JSON.stringify(noBridge.logs)}`);
}

console.log('test-llm-second-opinion: all assertions passed');
