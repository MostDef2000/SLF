#!/usr/bin/env node
// #483: pre-LLM match-data refresh.
// ============================================================
// The LLM advisor must never answer from a stale DOM snapshot. Before every
// advisor request (button, chat send, chat retry) the userscript fetches ONE
// fresh desktop observation (same-origin /ajax/game4.php JSON), validates it
// fail-closed, rebuilds the snapshot from it and reruns the rule ladder.
//
// This suite pins the four layers of that seam against the REAL module source
// loaded into Node vm realms (no network, no browser):
//   1. MatchStateParser.minuteInfoFromParts  — shared clock semantics.
//   2. MatchStatsParser.normalizeDesktopObservation — strict JSON validation.
//   3. MatchStatsParser.fetchDesktopObservation     — classified failures and
//      a deadline that also covers the body read.
//   4. SnapshotEngine.build(fresh) / build()        — fresh match-derived fields
//      vs DOM-only fields, unchanged no-arg path.
//   5. manual-match-runtime build wrapper           — argument forwarding.
//   6. UI preflight transaction                     — fresh payload, failure
//      without an advisor POST / cached answer / duplicate turn, identity and
//      control changes between checkpoint and payload, guard release.
//
// Only browser host capabilities (document/location/fetch/timers) are stubbed.
// The modules under test are read from src/ and executed as-is.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function teamTable(goals, overrides = {}) {
    return Object.assign({
        goals,
        pos: 55,
        shots: 9,
        ontarget: 4,
        xG: 1.2,
        '1': 100,
        '2': 50,
        '-1': 20,
        '-2': 10,
        ttx: 180,
        defective: 12,
        def_height: '<div class="v">2</div>',
        press_height: '3',
        '-7': 5,
        '14': 3,
        '-10': 1,
        '16': 0,
        ind3: 7
    }, overrides);
}

function validDesktopPayload(overrides = {}) {
    const payload = {
        status: 1,
        // Deliberately stale top-level score: normalization must ignore it.
        score: { home: 0, away: 0 },
        minute: '55',
        live: [
            { id: 'other-game', team_1: 30, team_2: 40 },
            { id: '777', team_1: 10, team_2: 20 }
        ],
        t: {
            '10': teamTable(2),
            '20': teamTable(1, { pos: 45, shots: 5, ontarget: 2, xG: 0.4 })
        },
        xt: { home: 0.8, away: 0.4 },
        game_comments: ['<b>Гол!</b> 12-я минута', { text: '  Жёлтая карточка  ' }, '']
    };
    return Object.assign(payload, overrides);
}

// ---------------------------------------------------------------------------
// Realm 1/2/3: match-state-parser + match-stats-parser
// ---------------------------------------------------------------------------

function createParserRealm() {
    const sandbox = {
        console,
        URLSearchParams,
        AbortController,
        setTimeout,
        clearTimeout,
        JSON,
        Math,
        Number,
        String,
        Object,
        Array,
        Set,
        Map,
        Date,
        Error,
        Promise,
        Boolean,
        RegExp,
        Symbol,
        document: { body: { innerText: '' }, querySelector: () => null, querySelectorAll: () => [] },
        location: { search: '' }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
        read('src/modules/match-reading/match-state-parser.js') + '\n;globalThis.__MatchStateParser = MatchStateParser;',
        sandbox,
        { filename: 'match-state-parser.js' }
    );
    vm.runInContext(
        read('src/modules/match-reading/match-stats-parser.js') + '\n;globalThis.__MatchStatsParser = MatchStatsParser;',
        sandbox,
        { filename: 'match-stats-parser.js' }
    );
    return sandbox;
}

test('minuteInfoFromParts: preserves zero/stoppage semantics and degrades invalid input', () => {
    const realm = createParserRealm();
    const parser = realm.__MatchStateParser;
    const degenerate = {
        rawMinute: null,
        baseMinute: null,
        stoppageMinute: 0,
        effectiveMinute: null,
        isStoppage: false
    };

    assert.deepEqual(plain(parser.minuteInfoFromParts(55)), {
        rawMinute: '55',
        baseMinute: 55,
        stoppageMinute: 0,
        effectiveMinute: 55,
        isStoppage: false
    });
    // Explicit stoppage 0 is "none", not an invalid clock.
    assert.deepEqual(parser.minuteInfoFromParts(55, 0), parser.minuteInfoFromParts(55));
    assert.deepEqual(plain(parser.minuteInfoFromParts(90, 3)), {
        rawMinute: '90+3',
        baseMinute: 90,
        stoppageMinute: 3,
        effectiveMinute: 90,
        isStoppage: true
    });
    // The official clock never exceeds 90; 91+ clamps and is flagged stoppage.
    assert.deepEqual(plain(parser.minuteInfoFromParts(93, 0)), {
        rawMinute: '93',
        baseMinute: 93,
        stoppageMinute: 0,
        effectiveMinute: 90,
        isStoppage: true
    });
    // Fractional stoppage truncates, never throws.
    assert.equal(parser.minuteInfoFromParts(45, 2.9).stoppageMinute, 2);

    for (const value of [null, undefined, 0, -3, 'abc', NaN, Infinity, 2.5, '']) {
        assert.deepEqual(
            plain(parser.minuteInfoFromParts(value)),
            degenerate,
            `minuteInfoFromParts(${String(value)}) must degrade, never throw`
        );
    }

    // readMinuteInfo() is the DOM-text delegate; no clock text -> degenerate.
    assert.deepEqual(plain(parser.readMinuteInfo()), degenerate);
    realm.document.body.innerText = "Идёт '67+2 мин";
    const fromDom = parser.readMinuteInfo();
    assert.equal(fromDom.baseMinute, 67);
    assert.equal(fromDom.stoppageMinute, 2);
    assert.equal(fromDom.effectiveMinute, 67);
});

test('normalizeDesktopObservation: maps fresh live JSON and ignores stale top-level score', () => {
    const { __MatchStatsParser: parser } = createParserRealm();
    const observation = parser.normalizeDesktopObservation(validDesktopPayload(), '777');

    assert.equal(observation.gameId, '777');
    assert.equal(observation.status, 'live');
    assert.deepEqual(plain(observation.teams), [10, 20]);
    assert.equal(observation.minuteInfo.effectiveMinute, 55);
    assert.equal(observation.minuteInfo.rawMinute, '55');
    // Goals come from t[teamId].goals, never from the stale raw.score.
    assert.deepEqual(plain(observation.score), { home: 2, away: 1 });
    assert.deepEqual(plain(observation.xT), { home: 0.8, away: 0.4 });
    assert.deepEqual(plain(observation.shotsTable), []);
    assert.deepEqual(plain(observation.eventsText), ['Гол! 12-я минута', 'Жёлтая карточка']);

    const [home, away] = observation.stats;
    assert.equal(home.teamId, 10);
    assert.equal(home.stats.possession, 55);
    assert.equal(home.stats.accuratePasses, 150, 'pass sums are 1+2');
    assert.equal(home.stats.inaccuratePasses, 30, 'inaccurate sums are -1 + -2');
    assert.equal(home.stats.defVector, 2, 'HTML-wrapped numeric value is decoded');
    assert.equal(home.stats.pressVector, 3);
    assert.equal(home.stats.power, undefined, 'power stays DOM-only (merged by SnapshotEngine)');
    assert.equal(away.teamId, 20);
    assert.equal(away.stats.possession, 45);
});

test('normalizeDesktopObservation: selects the live entry by id and accepts halftime', () => {
    const { __MatchStatsParser: parser } = createParserRealm();
    const payload = validDesktopPayload({ halftime: true, minute: 45 });
    const observation = parser.normalizeDesktopObservation(payload, '777');
    assert.equal(observation.status, 'halftime');
    assert.equal(observation.minuteInfo.effectiveMinute, 45);
});

test('normalizeDesktopObservation: rejects identity, missing stats, inactive and malformed input', () => {
    const { __MatchStatsParser: parser } = createParserRealm();
    const rejects = (payload, expectedKind, gameId = '777') => {
        assert.throws(
            () => parser.normalizeDesktopObservation(payload, gameId),
            error => {
                assert.equal(error.kind, expectedKind, `${expectedKind}: ${error.message}`);
                return true;
            }
        );
    };

    // Identity mismatch: expected id absent from live[].
    rejects(validDesktopPayload(), 'identity_mismatch', '999');
    rejects(validDesktopPayload(), 'identity_mismatch', '');

    // Missing per-team stats table for the live entry.
    const missingTeam = validDesktopPayload();
    delete missingTeam.t['20'];
    rejects(missingTeam, 'invalid_observation');

    // Not started / finished are fail-closed, never treated as live.
    rejects(validDesktopPayload({ status: 0 }), 'not_started');
    rejects(validDesktopPayload({ finish: true }), 'finished');
    rejects(validDesktopPayload({ status: 'матч завершён' }), 'finished');

    // Paused / suspended without halftime is not a live observation.
    rejects(validDesktopPayload({ paused: true }), 'paused');
    rejects(validDesktopPayload({ stop_update: true }), 'paused');
    rejects(validDesktopPayload({ status: 'матч приостановлен' }), 'paused');

    // Uninterpretable clock.
    rejects(validDesktopPayload({ minute: 'скоро' }), 'unavailable');

    // Malformed counters fail closed instead of becoming NaN in rule inputs.
    for (const overrides of [{ pos: 'abc' }, { goals: '' }, { shots: true }, { xG: null }]) {
        const payload = validDesktopPayload();
        payload.t['10'] = teamTable(2, overrides);
        rejects(payload, 'invalid_observation');
    }
});

test('fetchDesktopObservation: classifies timeouts, HTTP, non-JSON and network failures', async () => {
    const { __MatchStatsParser: parser } = createParserRealm();
    const validBody = JSON.stringify(validDesktopPayload());

    // Deadline covers the BODY read: headers arrive at once, text() hangs.
    const slowBody = async () => {
        await new Promise(resolve => setTimeout(resolve, 40));
        return validBody;
    };
    await assert.rejects(
        parser.fetchDesktopObservation({
            gameId: '777',
            timeoutMs: 5,
            fetchImpl: async () => ({ ok: true, status: 200, text: slowBody })
        }),
        error => error.kind === 'timeout' && /timed out/.test(error.message),
        'a slow body read must hit the deadline'
    );

    // A fetch that never settles also times out.
    await assert.rejects(
        parser.fetchDesktopObservation({
            gameId: '777',
            timeoutMs: 5,
            fetchImpl: () => new Promise(() => {})
        }),
        error => error.kind === 'timeout'
    );

    await assert.rejects(
        parser.fetchDesktopObservation({
            gameId: '777',
            fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' })
        }),
        error => error.kind === 'http_status' && error.status === 503
    );

    // Redirect/login page served with 200 is not JSON -> non_json.
    await assert.rejects(
        parser.fetchDesktopObservation({
            gameId: '777',
            fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html><form>login</form></html>' })
        }),
        error => error.kind === 'non_json' && /login|redirect/i.test(error.message)
    );

    await assert.rejects(
        parser.fetchDesktopObservation({
            gameId: '777',
            fetchImpl: async () => { throw new Error('socket closed'); }
        }),
        error => error.kind === 'network' && /socket closed/.test(error.message)
    );
});

test('fetchDesktopObservation: same-origin no-store GET and a normalized success', async () => {
    const { __MatchStatsParser: parser } = createParserRealm();
    const calls = [];
    const observation = await parser.fetchDesktopObservation({
        gameId: '777',
        cacheBust: 12345,
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return { ok: true, status: 200, text: async () => JSON.stringify(validDesktopPayload()) };
        }
    });

    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.match(url, /^\/ajax\/game4\.php\?/);
    assert.match(url, /[?&]action=get_stat_desktop(?:&|$)/);
    assert.match(url, /[?&]game_id=777(?:&|$)/);
    assert.match(url, /[?&]goal_count=NaN(?:&|$)/);
    assert.match(url, /[?&]_slf=12345(?:&|$)/);
    assert.equal(init.method, 'GET');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Accept, 'application/json');

    assert.equal(observation.gameId, '777');
    assert.deepEqual(plain(observation.score), { home: 2, away: 1 });
});

// ---------------------------------------------------------------------------
// Realm 4: SnapshotEngine.build(fresh)
// ---------------------------------------------------------------------------

function createSnapshotRealm() {
    const calls = {
        getAllTeamIds: 0,
        readTeamNames: 0,
        readMinuteInfo: 0,
        readEventsText: 0,
        readXT: 0,
        readShotsTable: 0,
        readFullStats: 0,
        getGameId: 0,
        getStatus: 0,
        getGenerationWindow: 0,
        detectMyTeamId: 0
    };
    const currentTactic = { def_line: '2', style: '3', priority: [] };
    const sandbox = {
        console,
        Date,
        JSON,
        Math,
        Number,
        String,
        Object,
        Array,
        Set,
        Map,
        Promise,
        Boolean,
        Symbol,
        Error,
        RegExp,
        MatchTimingModel: { REAL_MATCH_MINUTES: 36, OFFICIAL_MATCH_MINUTES: 90 },
        MatchStateParser: {
            getGameId() { calls.getGameId += 1; return 'g-dom'; },
            getStatus() { calls.getStatus += 1; return 'live'; },
            readScore() { return { home: 0, away: 0 }; },
            readMinuteInfo() {
                calls.readMinuteInfo += 1;
                return { rawMinute: '20', baseMinute: 20, stoppageMinute: 0, effectiveMinute: 20, isStoppage: false };
            },
            getGenerationWindow(minute) {
                calls.getGenerationWindow += 1;
                return { label: `win-${minute}`, realMinuteEstimate: 1.1 };
            },
            getLegacyTenMinuteBucket(minute) { return `bucket-${minute}`; }
        },
        MatchStatsParser: {
            getAllTeamIds() { calls.getAllTeamIds += 1; return [1, 2]; },
            readTeamNames() { calls.readTeamNames += 1; return { home: 'Дом', away: 'Гость' }; },
            detectMyTeamId(ids) { calls.detectMyTeamId += 1; return ids[0]; },
            readEventsText() { calls.readEventsText += 1; return ['старое событие']; },
            readXT() { calls.readXT += 1; return { home: 0.1, away: 0.2 }; },
            readShotsTable() { calls.readShotsTable += 1; return [{ dom: true }]; },
            readFullStats(teamId) {
                calls.readFullStats += 1;
                return { power: 100 + Number(teamId), possession: 1, shots: 1 };
            }
        },
        DeveloperHintParser: {
            readHints() { return [{ text: 'дом-подсказка' }]; },
            getGeneratorQualitySignal() { return { detected: false }; }
        },
        SquadParser: {
            readLineupRows() { return [{ p: 1 }]; },
            readFormation() { return '4-4-2'; }
        },
        getCurrentTactic() { return currentTactic; },
        slfMatchRefreshError: (kind, message) => Object.assign(new Error(message || kind), { kind })
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
        read('src/modules/manual-match-telemetry/snapshot-engine.js') + '\n;globalThis.__SnapshotEngine = SnapshotEngine;',
        sandbox,
        { filename: 'snapshot-engine.js' }
    );
    return { sandbox, engine: sandbox.__SnapshotEngine, calls, currentTactic };
}

test('SnapshotEngine.build: no-arg path is unchanged and fresh observation wins for match fields', () => {
    const { engine, calls, currentTactic } = createSnapshotRealm();

    const dom = engine.build();
    assert.equal(dom.gameId, 'g-dom');
    assert.equal(dom.status, 'live');
    assert.equal(dom.rawStatus, 'live');
    assert.equal(dom.minute, 20);
    assert.deepEqual(plain(dom.score), { home: 0, away: 0 });
    assert.deepEqual(plain(dom.xT), { home: 0.1, away: 0.2 });
    assert.deepEqual(plain(dom.eventsText), ['старое событие']);
    assert.deepEqual(plain(dom.teams), [1, 2]);
    assert.deepEqual(plain(dom.teamNames), { home: 'Дом', away: 'Гость' });
    assert.equal(dom.currentTactic, currentTactic);
    assert.deepEqual(plain(dom.shotsTable), [{ dom: true }]);
    assert.deepEqual(plain(dom.stats.map(entry => entry.teamId)), [1, 2]);

    const callsBeforeFresh = JSON.parse(JSON.stringify(calls));

    const fresh = {
        gameId: 'g-fresh',
        status: 'live',
        minuteInfo: { rawMinute: '55+2', baseMinute: 55, stoppageMinute: 2, effectiveMinute: 55, isStoppage: true },
        teams: [3, 4],
        score: { home: 2, away: 1 },
        stats: [
            { teamId: 3, stats: { possession: 60, shots: 8, power: 999 } },
            { teamId: 4, stats: { possession: 40, shots: 4, power: 888 } }
        ],
        xT: null,
        shotsTable: [{ fresh: true }],
        eventsText: ['свежее событие']
    };
    const built = engine.build(fresh);

    // Match-derived fields come from the observation.
    assert.equal(built.gameId, 'g-fresh');
    assert.equal(built.minute, 55);
    assert.equal(built.minuteRaw, '55+2');
    assert.equal(built.stoppageMinute, 2);
    assert.equal(built.isStoppage, true);
    assert.equal(built.status, 'live');
    assert.equal(built.statusAssumedLive, false);
    assert.equal(built.bucket, 'win-55');
    assert.deepEqual(plain(built.score), { home: 2, away: 1 });
    assert.equal(built.xT, null);
    assert.deepEqual(plain(built.teams), [3, 4]);
    assert.deepEqual(plain(built.shotsTable), [{ fresh: true }]);
    assert.deepEqual(plain(built.eventsText), ['свежее событие']);

    // DOM-only fields stay page-sourced.
    assert.deepEqual(plain(built.teamNames), { home: 'Дом', away: 'Гость' });
    assert.equal(built.currentTactic, currentTactic);
    assert.deepEqual(plain(built.lineupRows), [{ p: 1 }]);
    assert.equal(built.formation, '4-4-2');
    assert.deepEqual(plain(built.developerHints), [{ text: 'дом-подсказка' }]);

    // Team counters come from the observation; only power is merged from DOM.
    const [home, away] = built.stats;
    assert.equal(home.teamId, 3);
    assert.equal(home.stats.possession, 60);
    assert.equal(home.stats.power, 103, 'power is DOM-static and overridden per team');
    assert.equal(away.teamId, 4);
    assert.equal(away.stats.power, 104);

    // The stale DOM match readers were not consulted for fresh match data.
    assert.equal(calls.readMinuteInfo, callsBeforeFresh.readMinuteInfo, 'fresh path does not read the DOM clock');
    assert.equal(calls.readEventsText, callsBeforeFresh.readEventsText, 'fresh path does not read DOM events');
    assert.equal(calls.readXT, callsBeforeFresh.readXT, 'fresh path does not read DOM xT');
    assert.equal(calls.readShotsTable, callsBeforeFresh.readShotsTable, 'fresh path does not read DOM shots');
    assert.equal(calls.getGameId, callsBeforeFresh.getGameId, 'fresh path does not read the URL game id');
    assert.equal(calls.getStatus, callsBeforeFresh.getStatus, 'fresh path does not read the DOM status');
    assert.equal(calls.getGenerationWindow, callsBeforeFresh.getGenerationWindow + 1);
    assert.equal(calls.detectMyTeamId, callsBeforeFresh.detectMyTeamId + 1);
    assert.equal(calls.readFullStats, callsBeforeFresh.readFullStats + 2, 'power lookup only');

    // The no-arg build after the fresh build is still the original DOM path.
    const domAgain = engine.build();
    assert.equal(domAgain.gameId, 'g-dom');
    assert.equal(domAgain.minute, 20);
    assert.deepEqual(plain(domAgain.score), { home: 0, away: 0 });
    assert.deepEqual(plain(domAgain.eventsText), ['старое событие']);
});

// ---------------------------------------------------------------------------
// Realm 5: manual-match-runtime build wrapper forwards arguments
// ---------------------------------------------------------------------------

test('manual-match-runtime: buildWithTacticalPhaseV2 forwards build arguments', () => {
    const buildArgs = [];
    const engine = {
        __tacticalTelemetryV2Installed: false,
        build(...args) {
            buildArgs.push(args);
            return null; // null short-circuits the phase layer; forwarding is the contract
        }
    };
    const sandbox = {
        console,
        JSON,
        Math,
        Number,
        String,
        Object,
        Array,
        Set,
        Map,
        Date,
        Error,
        Promise,
        Boolean,
        Symbol,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: { readyState: 'loading', addEventListener() {} },
        location: { pathname: '/game.php', href: 'https://sublime.example/game.php' },
        STATE: {},
        MatchStateParser: { getGameId: () => 'g-wrapper' },
        SnapshotEngine: engine,
        Api: { postAppend() {} },
        applyPresetAsync() {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
        read('src/modules/manual-match-telemetry/manual-match-runtime.js'),
        sandbox,
        { filename: 'manual-match-runtime.js' }
    );

    const wrapper = engine.build;
    assert.equal(typeof wrapper, 'function');

    const fresh = { gameId: 'g-fresh', teams: [10, 20] };
    assert.equal(wrapper(fresh), null);
    assert.deepEqual(buildArgs[0], [fresh], 'the fresh observation is forwarded by identity');

    wrapper();
    assert.deepEqual(buildArgs[1], [], 'a no-arg build forwards no arguments');
});

// ---------------------------------------------------------------------------
// Realm 6: UI preflight transaction
// ---------------------------------------------------------------------------

function makeElement(id = '') {
    return {
        id,
        children: [],
        firstElementChild: null,
        removed: false,
        parentElement: null,
        html: '',
        innerHTMLWrites: 0,
        set innerHTML(html) {
            this.innerHTMLWrites += 1;
            this.html = String(html);
            const match = String(html).match(/id="([^"]+)"/);
            const child = makeElement(match ? match[1] : '');
            child.html = String(html);
            this.children.push(child);
            this.firstElementChild = child;
        },
        get innerHTML() { return this.html; },
        remove() { this.removed = true; },
        appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            if (!this.firstElementChild) this.firstElementChild = child;
            return child;
        },
        insertBefore(child) {
            this.children.push(child);
            return child;
        }
    };
}

function createUiRealm(options = {}) {
    const logs = [];
    const order = [];
    const advisorCalls = [];
    const checkpoints = [];
    const elements = new Map();
    const clickListeners = [];

    const panel = makeElement('slf-match-parser-panel');
    const status = makeElement('slf-parser-status');
    const answerPanel = makeElement('slf-parser-recommendation');
    const chatInput = Object.assign(makeElement('slf-llm-chat-input'), { value: '' });
    const chatSend = Object.assign(makeElement('slf-llm-chat-send'), { disabled: false, onclick: null });
    const foreignTarget = Object.assign(makeElement('slf-foreign-match-target'), { value: 'home' });
    elements.set('slf-match-parser-panel', panel);
    elements.set('slf-parser-status', status);
    elements.set('slf-parser-recommendation', answerPanel);
    elements.set('slf-llm-chat-input', chatInput);
    elements.set('slf-llm-chat-send', chatSend);
    elements.set('slf-foreign-match-target', foreignTarget);

    let currentGameId = options.gameId || 'g-1';
    let tactic = { def_line: '2', style: '3', priority: [] };
    let fetchError = null;
    let changeGameDuringRefresh = false;
    let changeControlsDuringCheckpoint = false;
    let changeTargetDuringCheckpoint = false;
    let reloadCalls = 0;
    let buildCalls = 0;

    const staleSnapshot = {
        gameId: 'g-1',
        minute: 20,
        bucket: '16-30',
        status: 'live',
        score: { home: 1, away: 0 },
        teams: [1, 2],
        myTeam: 1,
        matchOwnership: 'owned',
        developerHints: ['дом-подсказка'],
        currentTactic: tactic,
        stats: [
            { teamId: 1, stats: { possession: 50, power: 100 } },
            { teamId: 2, stats: { possession: 50, power: 90 } }
        ]
    };
    const freshObservation = {
        gameId: options.observationGameId || 'g-1',
        status: 'live',
        minuteInfo: { rawMinute: '55', baseMinute: 55, stoppageMinute: 0, effectiveMinute: 55, isStoppage: false },
        teams: [1, 2],
        score: { home: 2, away: 1 },
        stats: [
            { teamId: 1, stats: { possession: 60, shots: 9, power: 101 } },
            { teamId: 2, stats: { possession: 40, shots: 4, power: 91 } }
        ],
        xT: { home: 0.8, away: 0.4 },
        shotsTable: [],
        eventsText: ['свежее событие']
    };

    const cloneSnapshot = source => ({
        ...source,
        score: { ...source.score },
        teams: source.teams.slice(),
        stats: source.stats.map(entry => ({ teamId: entry.teamId, stats: { ...entry.stats } }))
    });

    const context = {
        console: {
            log() {},
            warn() {},
            error(...args) { logs.push(args.map(String).join(' ')); }
        },
        Object,
        Array,
        Map,
        Set,
        Symbol,
        Date,
        Error,
        JSON,
        Math,
        String,
        Number,
        Promise,
        Boolean,
        RegExp,
        setTimeout() { return 1; },
        clearTimeout() {},
        location: {
            pathname: '/game.php',
            href: 'https://sublime.example/game.php',
            reload() { reloadCalls += 1; }
        },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        document: {
            __slfFinalTacticApplyDelegation: false,
            __slfLlmApplyDelegation: false,
            getElementById(id) {
                if (elements.has(id)) return elements.get(id);
                const inPanel = (answerPanel.children || []).find(node => node && node.id === id && !node.removed);
                return inPanel || null;
            },
            createElement(tag) {
                const node = makeElement('');
                node.tagName = String(tag).toUpperCase();
                node.dataset = {};
                node.style = {};
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
            llmDialogByGame: {},
            tacticalLabRuntime: {
                checkpoint: async (source, snapshot) => {
                    order.push('checkpoint');
                    checkpoints.push({ source, snapshot });
                    if (changeControlsDuringCheckpoint) {
                        tactic = { def_line: '3', style: '5', priority: ['left'] };
                    }
                    if (changeTargetDuringCheckpoint) foreignTarget.value = 'away';
                },
                mountUI: async () => {}
            }
        },
        MatchStateParser: {
            getGameId: () => currentGameId,
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
        getCurrentTactic: () => tactic,
        SnapshotEngine: {
            build(fresh) {
                buildCalls += 1;
                if (!fresh || typeof fresh !== 'object') return cloneSnapshot(staleSnapshot);
                return {
                    gameId: fresh.gameId,
                    minute: fresh.minuteInfo.effectiveMinute,
                    bucket: '46-60',
                    status: fresh.status,
                    score: { ...fresh.score },
                    xT: fresh.xT,
                    teams: fresh.teams.slice(),
                    myTeam: fresh.teams[0],
                    matchOwnership: 'owned',
                    developerHints: ['дом-подсказка'],
                    currentTactic: tactic,
                    stats: fresh.stats.map(entry => ({ teamId: entry.teamId, stats: { ...entry.stats } }))
                };
            },
            async fetchFreshObservation({ gameId } = {}) {
                order.push('refresh');
                if (fetchError) throw fetchError;
                if (changeGameDuringRefresh) currentGameId = 'g-2';
                return { ...freshObservation, gameId: gameId || freshObservation.gameId };
            }
        },
        RecommendationEngine: {
            __compactCoachModePatchedV4: true,
            __taskAPatchedLiveGate: true,
            __generator561RuleScorerApplied: true,
            hasEnoughLiveData: () => ({ ok: true }),
            make(snapshot) {
                const scoreState = snapshot.score.home > snapshot.score.away
                    ? 'winning'
                    : snapshot.score.home < snapshot.score.away ? 'losing' : 'drawing';
                snapshot.ruleDecision = {
                    action: { preset: 'Emery_BalancedBase_v11', decision: 'active_control' },
                    confidence: { level: 'medium' },
                    moment: { context: { minute: snapshot.minute, scoreState } },
                    candidates: [{ preset: 'Emery_BalancedBase_v11', score: 1.5, vetoed: false }]
                };
                return '<div data-slf-rec-section="combined">recommendation</div>';
            }
        },
        Api: {
            async postJson(collection, payload) {
                order.push('advisor');
                advisorCalls.push({ collection, payload });
                return {
                    available: true,
                    adviceId: 'adv-1',
                    preset: 'Emery_BalancedBase_v11',
                    presetLabel: 'Emery Balanced Base',
                    confidence: 'medium',
                    reason: 'держим баланс',
                    model: 'test-model',
                    latencyMs: 1200
                };
            }
        }
    };
    context.window = context;
    context.globalThis = context;
    context.SLFActivePresetRegistry = {
        active: ['Emery_BalancedBase_v11'],
        labels: { Emery_BalancedBase_v11: 'Emery Balanced Base' },
        meta: { Emery_BalancedBase_v11: { idea: 'баланс', use: 'база', risk: 'низкий' } }
    };
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

    const internals = context.window.SLFStrategyTaskAInternals;
    assert.ok(internals && typeof internals.requestLlmSecondOpinionFresh === 'function', 'test seam is exposed');

    return {
        context,
        internals,
        staleSnapshot,
        freshObservation,
        advisorCalls,
        checkpoints,
        order,
        answerPanel,
        logs,
        get reloadCalls() { return reloadCalls; },
        get buildCalls() { return buildCalls; },
        get currentGameId() { return currentGameId; },
        get tactic() { return tactic; },
        set fetchError(value) { fetchError = value; },
        set changeGameDuringRefresh(value) { changeGameDuringRefresh = value; },
        set changeControlsDuringCheckpoint(value) { changeControlsDuringCheckpoint = value; },
        set changeTargetDuringCheckpoint(value) { changeTargetDuringCheckpoint = value; },
        foreignTarget
    };
}

function lastAnswerHtml(run) {
    const nodes = (run.answerPanel.children || [])
        .filter(node => node && !node.removed && node.id === 'slf-llm-second-opinion-answer');
    const node = nodes[nodes.length - 1];
    return node ? String(node.html || '') : '';
}

test('UI preflight: stale DOM + fresh JSON -> advisor payload and checkpoint use fresh match data', async () => {
    const run = createUiRealm();
    run.internals.rememberLlmDialogTurn('g-1', 'user', 'что менять?', 1000);
    const dialog = run.internals.llmDialogForGame('g-1').slice();

    const answer = await run.internals.requestLlmSecondOpinionFresh({ mode: 'send', gameId: 'g-1', dialog });

    assert.equal(answer && answer.available, true, 'advisor answer is returned');
    assert.equal(run.advisorCalls.length, 1, 'exactly one advisor POST');
    assert.deepEqual(run.order, ['refresh', 'checkpoint', 'advisor'], `refresh -> checkpoint -> advisor: ${run.order}`);

    const payload = run.advisorCalls[0].payload;
    assert.equal(payload.collection ?? run.advisorCalls[0].collection, 'advisor');
    assert.equal(payload.gameId, 'g-1');
    assert.equal(payload.minute, 55, 'payload minute comes from the fresh observation');
    assert.deepEqual(plain(payload.score), { home: 2, away: 1 }, 'payload score comes from the fresh observation');
    assert.equal(payload.signals.minute, 55);
    assert.equal(payload.signals.scoreState, 'winning', 'rules reran on the fresh score');

    assert.equal(run.checkpoints.length, 1);
    assert.equal(run.checkpoints[0].source, 'llm_second_opinion');
    assert.equal(run.checkpoints[0].snapshot.minute, 55);
    assert.deepEqual(plain(run.checkpoints[0].snapshot.score), { home: 2, away: 1 });

    // The visible page/DOM was not replaced and the page was not reloaded.
    assert.equal(run.answerPanel.innerHTMLWrites, 0, 'preflight never rewrites the recommendation panel');
    assert.equal(run.reloadCalls, 0, 'no page reload on refresh');
    assert.equal(run.staleSnapshot.minute, 20, 'the stale snapshot object is not mutated');
    assert.deepEqual(run.staleSnapshot.score, { home: 1, away: 0 });

    // One honest assistant turn was appended after a successful answer; the
    // existing user turn is not duplicated.
    const turns = run.internals.llmDialogForGame('g-1');
    assert.equal(turns.length, 2);
    assert.equal(turns[0].role, 'user');
    assert.equal(turns[1].role, 'assistant');
});

test('UI preflight: refresh failure -> zero advisor POSTs, retryable message, no assistant turn, guard released', async () => {
    const run = createUiRealm();
    run.internals.rememberLlmDialogTurn('g-1', 'user', 'нажми прессинг', 1000);
    const refreshError = Object.assign(new Error('offline'), { kind: 'network' });
    run.fetchError = refreshError;

    const dialog = run.internals.llmDialogForGame('g-1').slice();
    const answer = await run.internals.requestLlmSecondOpinionFresh({ mode: 'send', gameId: 'g-1', dialog });

    assert.equal(answer, null);
    assert.equal(run.advisorCalls.length, 0, 'a failed refresh never reaches the advisor');
    assert.equal(run.order.includes('advisor'), false);

    const rendered = lastAnswerHtml(run);
    assert.match(rendered, /Не удалось обновить данные матча/);
    assert.match(rendered, /Повторите попытку/);
    assert.match(rendered, /slf-llm-chat-retry/, 'chat failures carry the explicit retry control');

    // The failed refresh adds no assistant turn and does not duplicate the user.
    const turns = run.internals.llmDialogForGame('g-1');
    assert.equal(turns.length, 1, 'no assistant turn was invented');
    assert.equal(turns[0].role, 'user');
    assert.equal(turns[0].text, 'нажми прессинг');

    // The guard is released in finally: a second attempt reaches the advisor.
    run.fetchError = null;
    const retried = await run.internals.requestLlmSecondOpinionFresh({ mode: 'button' });
    assert.equal(retried && retried.available, true);
    assert.equal(run.advisorCalls.length, 1, 'guard released after the failed preflight');
});

test('UI preflight: non-retryable inactive states render without a retry control', async () => {
    const run = createUiRealm();
    for (const error of [
        Object.assign(new Error('not started'), { kind: 'not_started' }),
        Object.assign(new Error('finished'), { kind: 'finished' })
    ]) {
        run.fetchError = error;
        await run.internals.requestLlmSecondOpinionFresh({ mode: 'send', gameId: 'g-1', dialog: [] });
        const rendered = lastAnswerHtml(run);
        assert.match(rendered, /Матч ещё не начался|Матч завершён/);
        assert.doesNotMatch(rendered, /slf-llm-chat-retry/, 'inactive states are not retryable');
        assert.equal(run.advisorCalls.length, 0);
    }

    assert.equal(
        run.internals.llmRefreshErrorText(Object.assign(new Error('p'), { kind: 'paused' })),
        'Матч на паузе или статус недоступен. Обновите страницу и повторите попытку.'
    );
    assert.equal(
        run.internals.llmRefreshErrorText(Object.assign(new Error('s'), { kind: 'stale_tactic' })),
        'Тактика изменилась во время обновления данных. Запрос не отправлен. Повторите попытку.'
    );
});

test('UI preflight: game change during refresh -> identity mismatch, no advisor POST', async () => {
    const run = createUiRealm();
    run.changeGameDuringRefresh = true;

    const answer = await run.internals.requestLlmSecondOpinionFresh({ mode: 'button', gameId: 'g-1' });

    assert.equal(answer, null);
    assert.equal(run.advisorCalls.length, 0, 'a different match is never sent to the advisor');
    assert.equal(run.currentGameId, 'g-2');
    assert.equal(lastAnswerHtml(run).includes('Не удалось обновить данные матча'), true);
    assert.equal(run.checkpoints.length, 0, 'identity is rechecked before the checkpoint');
});

test('UI preflight: controls changed across the checkpoint -> stale_tactic, no advisor POST', async () => {
    const run = createUiRealm();
    run.changeControlsDuringCheckpoint = true;

    const answer = await run.internals.requestLlmSecondOpinionFresh({ mode: 'button', gameId: 'g-1' });

    assert.equal(answer, null);
    assert.equal(run.advisorCalls.length, 0, 'rules and payload would describe different tactics');
    assert.equal(run.checkpoints.length, 1, 'the checkpoint itself still ran');
    assert.match(lastAnswerHtml(run), /Тактика изменилась во время обновления данных/);

    // The guard is released after the stale_tactic rejection too.
    run.changeControlsDuringCheckpoint = false;
    const retried = await run.internals.requestLlmSecondOpinionFresh({ mode: 'button' });
    assert.equal(retried && retried.available, true);
    assert.equal(run.advisorCalls.length, 1);
});

test('UI preflight: foreign target changed across the checkpoint -> stale_tactic, no advisor POST', async () => {
    const run = createUiRealm();
    run.changeTargetDuringCheckpoint = true;

    const answer = await run.internals.requestLlmSecondOpinionFresh({ mode: 'button', gameId: 'g-1' });

    assert.equal(answer, null);
    assert.equal(run.advisorCalls.length, 0);
    assert.equal(run.foreignTarget.value, 'away');
    assert.match(lastAnswerHtml(run), /Тактика изменилась во время обновления данных/);
});
