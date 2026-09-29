#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const sourcePath = path.join(root, 'src/core/api.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeContext({ analysisResponse, analysisError } = {}) {
    const requests = [];
    const context = {
        console,
        Object, Array, Map, Set, Date, JSON, String, Number, Promise,
        Math, RegExp, Error, Boolean, Symbol,
        setTimeout, clearTimeout,
        CONFIG: {
            SERVER_URL: 'https://slf-api.mostdef.ru',
            COLLECTIONS: {
                MATCH_SNAPSHOTS: 'match_snapshots_v2',
                MATCH_RESULTS: 'match_results_v2',
                PRESET_EVENTS: 'preset_events_v2',
                PRESET_EFFECTS: 'preset_effects_v2',
                PLAYER_OBSERVATIONS: 'player_observations',
                TRANSFER_HISTORY: 'transfer_history',
                TACTICS: 'tactics'
            }
        },
        getApiToken: () => 'test-token',
        warnMissingApiTokenOnce: () => {},
        debugLog: () => {},
        debugWarn: () => {},
        GM_xmlhttpRequest(request) {
            requests.push(request);
            const url = request.url || '';
            if (analysisError && url.includes('/api/analysis')) {
                if (analysisError === 'network') return request.onerror({ status: 0, statusText: '' });
                if (analysisError === 'http') return request.onload({ status: 500, responseText: 'err' });
                if (analysisError === 'parse') return request.onload({ status: 200, responseText: 'not-json' });
            }
            if (url.includes('/api/analysis')) {
                request.onload({ status: 200, responseText: JSON.stringify(analysisResponse) });
                return;
            }
            // Any raw collection GET is unexpected and must fail the test.
            request.onerror({ status: 0, statusText: 'unexpected-raw-get' });
        }
    };
    return { context, requests };
}

function loadApi(context) {
    vm.createContext(context);
    vm.runInContext(`${source}\n;globalThis.__fetchCanonicalApiStatus = fetchCanonicalApiStatus;`, context, { filename: 'api.js' });
    return context.__fetchCanonicalApiStatus;
}

function baseAnalysis(overrides = {}) {
    const collections = {
        match_snapshots_v2: { exists: true, valid: true, type: 'list', count: 1777, fileSize: 84267546, duplicateKeys: 1, missingUniqueKeys: 0 },
        match_results_v2: { exists: true, valid: true, type: 'list', count: 300, fileSize: 14126335, duplicateKeys: 2, missingUniqueKeys: 0 },
        preset_events_v2: { exists: true, valid: true, type: 'list', count: 558, fileSize: 17361154, duplicateKeys: 0, missingUniqueKeys: 0 },
        preset_effects_v2: { exists: true, valid: true, type: 'list', count: 306, fileSize: 7623832, duplicateKeys: 0, missingUniqueKeys: 0 },
        player_observations: { exists: true, valid: true, type: 'list', count: 42587, fileSize: 18435666, duplicateKeys: 0, missingUniqueKeys: 0 },
        transfer_history: { exists: true, valid: true, type: 'list', count: 12354, fileSize: 87819498, duplicateKeys: 0, missingUniqueKeys: 0 },
        tactics: { exists: true, valid: true, type: 'list', count: 15, fileSize: 1234, duplicateKeys: 0, missingUniqueKeys: 0 }
    };
    return Object.assign({ status: 'ok', games: 482, collections, serverTime: 1790582332 }, overrides);
}

async function main() {
    // Test 1: happy path — only /api/analysis requested, correct counts, no raw GETs.
    {
        const { context, requests } = makeContext({ analysisResponse: baseAnalysis() });
        const fetchStatus = loadApi(context);
        const status = await fetchStatus();
        assert.equal(status.schema, 'slf_canonical_api_status_v2');
        assert.equal(status.status, 'ok');
        assert.equal(status.games, 482);
        assert.equal(status.collections.snapshots.count, 1777);
        assert.equal(status.collections.results.count, 300);
        assert.equal(status.collections.events.count, 558);
        assert.equal(status.collections.effects.count, 306);
        assert.equal(status.collections.players.count, 42587);
        assert.equal(status.collections.transfers.count, 12354);
        assert.equal(status.collections.tactics.count, 15);
        assert.equal(requests.length, 1, 'expected exactly one request');
        assert.ok(requests[0].url.includes('/api/analysis'), `unexpected url: ${requests[0].url}`);
        assert.ok(!requests.some(r => r.url.includes('/api/match_snapshots_v2')), 'raw snapshot GET must not happen');
        assert.ok(!requests.some(r => /\/api\/(match_results_v2|preset_events_v2|preset_effects_v2|player_observations|transfer_history|tactics)$/.test(r.url)), 'no raw collection GET allowed');
        console.log('[api-status-analysis-test] happy path passed');
    }

    // Test 2: corrupt collection surfaces as degraded, count still reported (not masked to 0).
    {
        const analysis = baseAnalysis({ status: 'degraded' });
        analysis.collections.match_snapshots_v2 = { exists: true, valid: false, type: 'list', count: 1777, fileSize: 84267546, duplicateKeys: 1, missingUniqueKeys: 0 };
        const { context } = makeContext({ analysisResponse: analysis });
        const fetchStatus = loadApi(context);
        const status = await fetchStatus();
        assert.equal(status.status, 'degraded');
        assert.equal(status.collections.snapshots.corrupt, true);
        assert.equal(status.collections.snapshots.ok, false);
        assert.equal(status.collections.snapshots.count, 1777);
        console.log('[api-status-analysis-test] corrupt collection passed');
    }

    // Test 3: analysis request failure rejects (UI shows ERROR, never 0).
    {
        const { context, requests } = makeContext({ analysisError: 'network' });
        const fetchStatus = loadApi(context);
        let threw = false;
        let kind = null;
        try {
            await fetchStatus();
        } catch (error) {
            threw = true;
            kind = error.kind;
        }
        assert.equal(threw, true, 'analysis failure must reject');
        assert.equal(kind, 'network');
        assert.equal(requests.length, 1);
        assert.ok(requests[0].url.includes('/api/analysis'));
        console.log('[api-status-analysis-test] analysis failure passed');
    }

    console.log('[api-status-analysis-test] all passed');
}

main().catch(error => {
    console.error('[api-status-analysis-test] FAILED:', error);
    process.exit(1);
});
