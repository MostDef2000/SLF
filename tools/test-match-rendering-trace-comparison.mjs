import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    compareTraceMatrix,
    formatComparisonSummary
} from './compare-match-rendering-traces.mjs';

const toolSource = fs.readFileSync(new URL('./compare-match-rendering-traces.mjs', import.meta.url), 'utf8');
for (const prohibited of [
    'fetch(',
    'XMLHttpRequest',
    'GM_xmlhttpRequest',
    'localStorage.setItem',
    'sessionStorage.setItem',
    'writeFileSync',
    'appendFileSync'
]) {
    assert.equal(toolSource.includes(prohibited), false, `comparison tool must remain offline/read-only: ${prohibited}`);
}

const makeReport = ({
    p50 = 16.7,
    p95 = 20,
    p99 = 30,
    max = 60,
    gaps40 = 4,
    gaps50 = 2,
    gaps100 = 0,
    longTaskCount = 1,
    longTaskTotal = 55,
    longTaskMax = 55,
    canvasChanges = 0,
    observerRuns = 2,
    renderScale = null,
    renderHooks = null,
    scriptVersion = null,
    dpr = 1,
    viewportWidth = 1440,
    viewportHeight = 900,
    visibilityState = 'visible',
    visibilityChanges = [{ atMs: 0, state: 'visible' }]
} = {}) => ({
    schema: 'slf_match_rendering_diagnostics_v1',
    startedAt: '2026-08-06T00:00:00.000Z',
    finishedAt: '2026-08-06T00:00:15.000Z',
    reason: 'duration-complete',
    durationMs: 15000,
    page: {
        href: 'https://example.invalid/game.php?game=1',
        visibilityState,
        devicePixelRatio: dpr,
        viewport: { width: viewportWidth, height: viewportHeight }
    },
    frames: {
        sampleCount: 900,
        medianMs: p50,
        p95Ms: p95,
        p99Ms: p99,
        maxMs: max,
        gapsOver40Ms: gaps40,
        gapsOver50Ms: gaps50,
        gapsOver100Ms: gaps100
    },
    longTasks: {
        supported: true,
        count: longTaskCount,
        totalDurationMs: longTaskTotal,
        maxDurationMs: longTaskMax,
        entries: []
    },
    canvas: {
        stateChangeCount: canvasChanges,
        states: [{
            atMs: 0,
            bitmapWidth: 800,
            bitmapHeight: 550,
            cssWidth: 800,
            cssHeight: 550,
            fieldWidth: 800,
            fieldHeight: 550,
            fieldTransform: 'none',
            renderScale,
            renderHooks
        }]
    },
    slf: {
        scriptVersion,
        observerTarget: '.match_content',
        observerRuns,
        renderScale,
        renderHooks
    },
    visibilityChanges
});

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slf-match-traces-'));
const writeCondition = (id, reports) => reports.map((report, index) => {
    const relative = `${id}-${index + 1}.json`;
    fs.writeFileSync(path.join(tempDir, relative), JSON.stringify(report));
    return relative;
});

const disabledReports = writeCondition('slf-disabled', [
    makeReport({ p95: 20, p99: 30, canvasChanges: 1 }),
    makeReport({ p95: 21, p99: 31, canvasChanges: 2 }),
    makeReport({ p95: 19, p99: 29, canvasChanges: 1 })
]);
const enabledReports = writeCondition('slf-enabled', [
    makeReport({ p95: 25, p99: 35, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' }),
    makeReport({ p95: 26, p99: 36, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' }),
    makeReport({ p95: 24, p99: 34, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' })
]);
const experimentReports = writeCondition('slf-experiment', [
    makeReport({ p95: 18, p99: 27, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' }),
    makeReport({ p95: 19, p99: 28, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' }),
    makeReport({ p95: 17, p99: 26, renderScale: '1', renderHooks: 'ready', scriptVersion: '4.4.285' })
]);

const matrix = {
    schema: 'slf_match_rendering_trace_matrix_v1',
    baselineCondition: 'slf-disabled',
    minimumReportsPerCondition: 3,
    environment: {
        browser: 'Chromium fixture',
        os: 'test',
        gpu: 'test',
        zoom: '100%'
    },
    conditions: [
        { id: 'slf-disabled', label: 'SLF disabled', expectSlf: false, reports: disabledReports },
        { id: 'slf-enabled', label: 'SLF enabled', expectSlf: true, reports: enabledReports },
        { id: 'slf-experiment', label: 'SLF experiment', expectSlf: true, reports: experimentReports }
    ]
};

const result = compareTraceMatrix(matrix, { baseDir: tempDir });
assert.equal(result.schema, 'slf_match_rendering_trace_comparison_v1');
assert.equal(result.comparability.ok, true);
assert.equal(result.conditions.length, 3);
assert.equal(result.conditions[0].captureCount, 3);
assert.equal(result.conditions[1].frames.p95Ms, 25);
assert.equal(result.conditions[1].frames.p99Ms, 35);
assert.equal(result.conditions[1].provisionalAssessment.status, 'pass');
assert.equal(result.comparisons['slf-enabled'].frames.p95Ms.absolute, 5);
assert.equal(result.comparisons['slf-enabled'].frames.p95Ms.percent, 25);
assert.equal(result.comparisons['slf-experiment'].frames.p95Ms.absolute, -2);
assert.equal(result.comparisons['slf-experiment'].frames.p95Ms.percent, -10);
assert.match(formatComparisonSummary(result), /Threshold assessments are provisional/);

const mismatchedMatrix = structuredClone(matrix);
mismatchedMatrix.conditions[1].reports[0] = {
    path: 'mismatched-inline',
    report: makeReport({
        p95: 25,
        p99: 35,
        dpr: 2,
        renderScale: '1',
        renderHooks: 'ready',
        scriptVersion: '4.4.285'
    })
};
const mismatched = compareTraceMatrix(mismatchedMatrix, { baseDir: tempDir });
assert.equal(mismatched.comparability.ok, false);
assert.ok(mismatched.comparability.issues.some(issue => issue.includes('devicePixelRatio differs')));

const hiddenMatrix = structuredClone(matrix);
hiddenMatrix.conditions[2].reports[0] = {
    path: 'hidden-inline',
    report: makeReport({
        p95: 18,
        p99: 27,
        renderScale: '1',
        renderHooks: 'ready',
        scriptVersion: '4.4.285',
        visibilityState: 'hidden',
        visibilityChanges: [{ atMs: 0, state: 'visible' }, { atMs: 5000, state: 'hidden' }]
    })
};
const hidden = compareTraceMatrix(hiddenMatrix, { baseDir: tempDir });
assert.equal(hidden.comparability.ok, false);
assert.ok(hidden.comparability.issues.some(issue => issue.includes('non-foreground captures')));

assert.throws(
    () => compareTraceMatrix({ ...matrix, conditions: matrix.conditions.slice(0, 1) }, { baseDir: tempDir }),
    /at least two conditions/
);
assert.throws(
    () => compareTraceMatrix({
        ...matrix,
        conditions: matrix.conditions.map((condition, index) => index === 0
            ? { ...condition, reports: condition.reports.slice(0, 2) }
            : condition)
    }, { baseDir: tempDir }),
    /requires at least 3 reports/
);
assert.throws(
    () => compareTraceMatrix({
        ...matrix,
        conditions: matrix.conditions.map((condition, index) => index === 0
            ? { ...condition, reports: [{ report: { schema: 'wrong' } }, ...condition.reports.slice(1)] }
            : condition)
    }, { baseDir: tempDir }),
    /schema must be slf_match_rendering_diagnostics_v1/
);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Match rendering trace comparison: OK');
