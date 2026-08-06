#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_SCHEMA = 'slf_match_rendering_diagnostics_v1';
const MATRIX_SCHEMA = 'slf_match_rendering_trace_matrix_v1';
const OUTPUT_SCHEMA = 'slf_match_rendering_trace_comparison_v1';

export const DEFAULT_PROVISIONAL_THRESHOLDS = Object.freeze({
    p95Ms: 33.4,
    p99Ms: 50,
    maxGapsOver100Ms: 0,
    maxCanvasStateChanges: 0,
    expectedRenderScale: '1',
    expectedRenderHooks: 'ready'
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Number(value.toFixed(3));

const median = values => {
    const numbers = values.filter(isFiniteNumber).sort((a, b) => a - b);
    if (!numbers.length) return null;
    const middle = Math.floor(numbers.length / 2);
    return numbers.length % 2
        ? round(numbers[middle])
        : round((numbers[middle - 1] + numbers[middle]) / 2);
};

const maximum = values => {
    const numbers = values.filter(isFiniteNumber);
    return numbers.length ? round(Math.max(...numbers)) : null;
};

const sum = values => round(values.filter(isFiniteNumber).reduce((total, value) => total + value, 0));

const ratePerSecond = (value, durationMs) => {
    if (!isFiniteNumber(value) || !isFiniteNumber(durationMs) || durationMs <= 0) return null;
    return round(value / (durationMs / 1000));
};

const ratePerThousandFrames = (value, sampleCount) => {
    if (!isFiniteNumber(value) || !isFiniteNumber(sampleCount) || sampleCount <= 0) return null;
    return round((value / sampleCount) * 1000);
};

const requireNumber = (errors, value, label, { nullable = false, minimum = null } = {}) => {
    if (nullable && value === null) return;
    if (!isFiniteNumber(value)) {
        errors.push(`${label} must be a finite number${nullable ? ' or null' : ''}`);
        return;
    }
    if (minimum !== null && value < minimum) errors.push(`${label} must be >= ${minimum}`);
};

export function validateDiagnosticsReport(report, source = 'report') {
    const errors = [];
    if (!isObject(report)) throw new Error(`${source}: report must be an object`);
    if (report.schema !== REPORT_SCHEMA) errors.push(`schema must be ${REPORT_SCHEMA}`);

    if (!isObject(report.page)) errors.push('page must be an object');
    if (!isObject(report.page?.viewport)) errors.push('page.viewport must be an object');
    requireNumber(errors, report.page?.devicePixelRatio, 'page.devicePixelRatio', { minimum: 0.1 });
    requireNumber(errors, report.page?.viewport?.width, 'page.viewport.width', { minimum: 1 });
    requireNumber(errors, report.page?.viewport?.height, 'page.viewport.height', { minimum: 1 });
    requireNumber(errors, report.durationMs, 'durationMs', { minimum: 1000 });

    if (!isObject(report.frames)) errors.push('frames must be an object');
    requireNumber(errors, report.frames?.sampleCount, 'frames.sampleCount', { minimum: 1 });
    for (const key of ['medianMs', 'p95Ms', 'p99Ms', 'maxMs']) {
        requireNumber(errors, report.frames?.[key], `frames.${key}`, { minimum: 0 });
    }
    for (const key of ['gapsOver40Ms', 'gapsOver50Ms', 'gapsOver100Ms']) {
        requireNumber(errors, report.frames?.[key], `frames.${key}`, { minimum: 0 });
    }

    if (!isObject(report.longTasks)) errors.push('longTasks must be an object');
    if (typeof report.longTasks?.supported !== 'boolean') errors.push('longTasks.supported must be boolean');
    requireNumber(errors, report.longTasks?.count, 'longTasks.count', { minimum: 0 });
    requireNumber(errors, report.longTasks?.totalDurationMs, 'longTasks.totalDurationMs', { minimum: 0 });
    requireNumber(errors, report.longTasks?.maxDurationMs, 'longTasks.maxDurationMs', {
        nullable: true,
        minimum: 0
    });

    if (!isObject(report.canvas)) errors.push('canvas must be an object');
    requireNumber(errors, report.canvas?.stateChangeCount, 'canvas.stateChangeCount', { minimum: 0 });
    if (!Array.isArray(report.canvas?.states)) errors.push('canvas.states must be an array');

    if (!isObject(report.slf)) errors.push('slf must be an object');
    if (!Array.isArray(report.visibilityChanges)) errors.push('visibilityChanges must be an array');

    if (errors.length) throw new Error(`${source}: ${errors.join('; ')}`);
    return report;
}

const captureSummary = (report, source) => {
    validateDiagnosticsReport(report, source);
    const visibilityStates = report.visibilityChanges.map(item => item?.state).filter(Boolean);
    const foreground = report.page.visibilityState === 'visible'
        && visibilityStates.length > 0
        && visibilityStates.every(state => state === 'visible');

    return {
        source,
        durationMs: report.durationMs,
        foreground,
        environment: {
            devicePixelRatio: report.page.devicePixelRatio,
            viewportWidth: report.page.viewport.width,
            viewportHeight: report.page.viewport.height
        },
        frames: {
            sampleCount: report.frames.sampleCount,
            medianMs: report.frames.medianMs,
            p95Ms: report.frames.p95Ms,
            p99Ms: report.frames.p99Ms,
            maxMs: report.frames.maxMs,
            gapsOver40Ms: report.frames.gapsOver40Ms,
            gapsOver50Ms: report.frames.gapsOver50Ms,
            gapsOver100Ms: report.frames.gapsOver100Ms,
            gapsOver40Per1000Frames: ratePerThousandFrames(report.frames.gapsOver40Ms, report.frames.sampleCount),
            gapsOver50Per1000Frames: ratePerThousandFrames(report.frames.gapsOver50Ms, report.frames.sampleCount),
            gapsOver100Per1000Frames: ratePerThousandFrames(report.frames.gapsOver100Ms, report.frames.sampleCount)
        },
        longTasks: {
            supported: report.longTasks.supported,
            count: report.longTasks.count,
            totalDurationMs: report.longTasks.totalDurationMs,
            maxDurationMs: report.longTasks.maxDurationMs,
            countPerSecond: ratePerSecond(report.longTasks.count, report.durationMs),
            totalDurationPerSecond: ratePerSecond(report.longTasks.totalDurationMs, report.durationMs)
        },
        canvas: {
            stateChangeCount: report.canvas.stateChangeCount,
            finalState: report.canvas.states.at(-1) || null
        },
        slf: {
            scriptVersion: report.slf.scriptVersion ?? null,
            observerTarget: report.slf.observerTarget ?? null,
            observerRuns: report.slf.observerRuns,
            observerRunsPerSecond: ratePerSecond(report.slf.observerRuns, report.durationMs),
            renderScale: report.slf.renderScale ?? null,
            renderHooks: report.slf.renderHooks ?? null
        }
    };
};

const unique = values => [...new Set(values.map(value => JSON.stringify(value)))].map(value => JSON.parse(value));

const aggregateCondition = (condition, captures, thresholds) => {
    const aggregate = {
        id: condition.id,
        label: condition.label || condition.id,
        expectSlf: Boolean(condition.expectSlf),
        captureCount: captures.length,
        foregroundCaptureCount: captures.filter(capture => capture.foreground).length,
        environment: {
            devicePixelRatios: unique(captures.map(capture => capture.environment.devicePixelRatio)),
            viewports: unique(captures.map(capture => ({
                width: capture.environment.viewportWidth,
                height: capture.environment.viewportHeight
            })))
        },
        frames: {
            medianMs: median(captures.map(capture => capture.frames.medianMs)),
            p95Ms: median(captures.map(capture => capture.frames.p95Ms)),
            p99Ms: median(captures.map(capture => capture.frames.p99Ms)),
            maxMs: maximum(captures.map(capture => capture.frames.maxMs)),
            gapsOver40Per1000Frames: median(captures.map(capture => capture.frames.gapsOver40Per1000Frames)),
            gapsOver50Per1000Frames: median(captures.map(capture => capture.frames.gapsOver50Per1000Frames)),
            gapsOver100Per1000Frames: median(captures.map(capture => capture.frames.gapsOver100Per1000Frames)),
            maxGapsOver100Ms: maximum(captures.map(capture => capture.frames.gapsOver100Ms))
        },
        longTasks: {
            supportedCaptureCount: captures.filter(capture => capture.longTasks.supported).length,
            countPerSecond: median(captures.map(capture => capture.longTasks.countPerSecond)),
            totalDurationPerSecond: median(captures.map(capture => capture.longTasks.totalDurationPerSecond)),
            maxDurationMs: maximum(captures.map(capture => capture.longTasks.maxDurationMs))
        },
        canvas: {
            medianStateChangeCount: median(captures.map(capture => capture.canvas.stateChangeCount)),
            maxStateChangeCount: maximum(captures.map(capture => capture.canvas.stateChangeCount))
        },
        slf: {
            scriptVersions: unique(captures.map(capture => capture.slf.scriptVersion)),
            renderScales: unique(captures.map(capture => capture.slf.renderScale)),
            renderHooks: unique(captures.map(capture => capture.slf.renderHooks)),
            observerRunsPerSecond: median(captures.map(capture => capture.slf.observerRunsPerSecond))
        },
        captures
    };

    const checks = [
        {
            id: 'foreground-only',
            applies: true,
            pass: aggregate.foregroundCaptureCount === aggregate.captureCount,
            actual: `${aggregate.foregroundCaptureCount}/${aggregate.captureCount}`,
            expected: 'all captures visible for the full window'
        },
        {
            id: 'p95-frame-delta',
            applies: true,
            pass: aggregate.frames.p95Ms <= thresholds.p95Ms,
            actual: aggregate.frames.p95Ms,
            expected: `<= ${thresholds.p95Ms}`
        },
        {
            id: 'p99-frame-delta',
            applies: true,
            pass: aggregate.frames.p99Ms <= thresholds.p99Ms,
            actual: aggregate.frames.p99Ms,
            expected: `<= ${thresholds.p99Ms}`
        },
        {
            id: 'gaps-over-100ms',
            applies: true,
            pass: aggregate.frames.maxGapsOver100Ms <= thresholds.maxGapsOver100Ms,
            actual: aggregate.frames.maxGapsOver100Ms,
            expected: `<= ${thresholds.maxGapsOver100Ms} per capture`
        },
        {
            id: 'canvas-state-changes',
            applies: aggregate.expectSlf,
            pass: !aggregate.expectSlf || aggregate.canvas.maxStateChangeCount <= thresholds.maxCanvasStateChanges,
            actual: aggregate.canvas.maxStateChangeCount,
            expected: `<= ${thresholds.maxCanvasStateChanges} after hooks are ready`
        },
        {
            id: 'render-scale',
            applies: aggregate.expectSlf,
            pass: !aggregate.expectSlf || (
                aggregate.slf.renderScales.length === 1
                && aggregate.slf.renderScales[0] === thresholds.expectedRenderScale
            ),
            actual: aggregate.slf.renderScales,
            expected: [thresholds.expectedRenderScale]
        },
        {
            id: 'render-hooks',
            applies: aggregate.expectSlf,
            pass: !aggregate.expectSlf || (
                aggregate.slf.renderHooks.length === 1
                && aggregate.slf.renderHooks[0] === thresholds.expectedRenderHooks
            ),
            actual: aggregate.slf.renderHooks,
            expected: [thresholds.expectedRenderHooks]
        }
    ];

    aggregate.provisionalAssessment = {
        status: checks.filter(check => check.applies).every(check => check.pass) ? 'pass' : 'investigate',
        checks
    };
    return aggregate;
};

const delta = (current, baseline) => {
    if (!isFiniteNumber(current) || !isFiniteNumber(baseline)) return null;
    const absolute = round(current - baseline);
    const percent = baseline === 0 ? null : round((absolute / baseline) * 100);
    return { current, baseline, absolute, percent };
};

const compareToBaseline = (condition, baseline) => ({
    frames: {
        medianMs: delta(condition.frames.medianMs, baseline.frames.medianMs),
        p95Ms: delta(condition.frames.p95Ms, baseline.frames.p95Ms),
        p99Ms: delta(condition.frames.p99Ms, baseline.frames.p99Ms),
        maxMs: delta(condition.frames.maxMs, baseline.frames.maxMs),
        gapsOver40Per1000Frames: delta(
            condition.frames.gapsOver40Per1000Frames,
            baseline.frames.gapsOver40Per1000Frames
        ),
        gapsOver50Per1000Frames: delta(
            condition.frames.gapsOver50Per1000Frames,
            baseline.frames.gapsOver50Per1000Frames
        ),
        gapsOver100Per1000Frames: delta(
            condition.frames.gapsOver100Per1000Frames,
            baseline.frames.gapsOver100Per1000Frames
        )
    },
    longTasks: {
        countPerSecond: delta(condition.longTasks.countPerSecond, baseline.longTasks.countPerSecond),
        totalDurationPerSecond: delta(
            condition.longTasks.totalDurationPerSecond,
            baseline.longTasks.totalDurationPerSecond
        ),
        maxDurationMs: delta(condition.longTasks.maxDurationMs, baseline.longTasks.maxDurationMs)
    },
    canvas: {
        maxStateChangeCount: delta(
            condition.canvas.maxStateChangeCount,
            baseline.canvas.maxStateChangeCount
        )
    },
    slf: {
        observerRunsPerSecond: delta(
            condition.slf.observerRunsPerSecond,
            baseline.slf.observerRunsPerSecond
        )
    }
});

const loadReport = (entry, baseDir, conditionId, index) => {
    if (isObject(entry)) {
        const source = entry.path || `${conditionId}[${index}]`;
        if (entry.report) return captureSummary(entry.report, source);
        if (!entry.path) throw new Error(`${conditionId}[${index}]: report entry requires path or report`);
        const resolved = path.resolve(baseDir, entry.path);
        return captureSummary(JSON.parse(fs.readFileSync(resolved, 'utf8')), entry.path);
    }
    if (typeof entry !== 'string' || !entry) throw new Error(`${conditionId}[${index}]: invalid report entry`);
    const resolved = path.resolve(baseDir, entry);
    return captureSummary(JSON.parse(fs.readFileSync(resolved, 'utf8')), entry);
};

export function compareTraceMatrix(matrix, { baseDir = process.cwd() } = {}) {
    if (!isObject(matrix)) throw new Error('matrix must be an object');
    if (matrix.schema !== MATRIX_SCHEMA) throw new Error(`matrix.schema must be ${MATRIX_SCHEMA}`);
    if (!Array.isArray(matrix.conditions) || matrix.conditions.length < 2) {
        throw new Error('matrix.conditions must contain at least two conditions');
    }

    const minimumReports = Number.isInteger(matrix.minimumReportsPerCondition)
        ? matrix.minimumReportsPerCondition
        : 3;
    if (minimumReports < 1) throw new Error('minimumReportsPerCondition must be >= 1');

    const ids = matrix.conditions.map(condition => condition?.id);
    if (ids.some(id => typeof id !== 'string' || !id)) throw new Error('every condition requires a non-empty id');
    if (new Set(ids).size !== ids.length) throw new Error('condition ids must be unique');

    const baselineId = matrix.baselineCondition || ids[0];
    if (!ids.includes(baselineId)) throw new Error(`baseline condition not found: ${baselineId}`);

    const thresholds = Object.assign({}, DEFAULT_PROVISIONAL_THRESHOLDS, matrix.provisionalThresholds || {});
    const conditions = matrix.conditions.map(condition => {
        if (!Array.isArray(condition.reports) || condition.reports.length < minimumReports) {
            throw new Error(`${condition.id}: requires at least ${minimumReports} reports`);
        }
        const captures = condition.reports.map((entry, index) => loadReport(entry, baseDir, condition.id, index));
        return aggregateCondition(condition, captures, thresholds);
    });

    const allCaptures = conditions.flatMap(condition => condition.captures);
    const dprValues = unique(allCaptures.map(capture => capture.environment.devicePixelRatio));
    const viewportValues = unique(allCaptures.map(capture => ({
        width: capture.environment.viewportWidth,
        height: capture.environment.viewportHeight
    })));
    const foregroundFailures = allCaptures.filter(capture => !capture.foreground).map(capture => capture.source);
    const durationValues = allCaptures.map(capture => capture.durationMs);
    const minDuration = Math.min(...durationValues);
    const maxDuration = Math.max(...durationValues);
    const durationRatio = minDuration > 0 ? round(maxDuration / minDuration) : null;

    const comparabilityIssues = [];
    if (dprValues.length !== 1) comparabilityIssues.push(`devicePixelRatio differs: ${JSON.stringify(dprValues)}`);
    if (viewportValues.length !== 1) comparabilityIssues.push(`viewport differs: ${JSON.stringify(viewportValues)}`);
    if (foregroundFailures.length) comparabilityIssues.push(`non-foreground captures: ${foregroundFailures.join(', ')}`);
    if (durationRatio !== null && durationRatio > 1.25) {
        comparabilityIssues.push(`capture durations differ by more than 25%: ratio=${durationRatio}`);
    }

    const baseline = conditions.find(condition => condition.id === baselineId);
    const comparisons = Object.fromEntries(
        conditions
            .filter(condition => condition.id !== baselineId)
            .map(condition => [condition.id, compareToBaseline(condition, baseline)])
    );

    return {
        schema: OUTPUT_SCHEMA,
        generatedAt: new Date().toISOString(),
        sourceSchema: REPORT_SCHEMA,
        baselineCondition: baselineId,
        minimumReportsPerCondition: minimumReports,
        environment: matrix.environment || null,
        provisionalThresholds: thresholds,
        comparability: {
            ok: comparabilityIssues.length === 0,
            issues: comparabilityIssues,
            devicePixelRatios: dprValues,
            viewports: viewportValues,
            durationRatio
        },
        conditions,
        comparisons
    };
}

const formatDelta = value => {
    if (!value) return 'n/a';
    const sign = value.absolute > 0 ? '+' : '';
    const percent = value.percent === null ? '' : ` (${sign}${value.percent}%)`;
    return `${sign}${value.absolute}${percent}`;
};

export function formatComparisonSummary(result) {
    const lines = [
        '# SLF match rendering trace comparison',
        '',
        `Baseline: ${result.baselineCondition}`,
        `Comparable: ${result.comparability.ok ? 'yes' : 'no'}`
    ];
    for (const issue of result.comparability.issues) lines.push(`- comparability issue: ${issue}`);

    lines.push('', '| Condition | Captures | p95 ms | p99 ms | >100 ms max | Long task ms/s | Canvas max changes | Assessment |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---|');
    for (const condition of result.conditions) {
        lines.push(`| ${condition.label} | ${condition.captureCount} | ${condition.frames.p95Ms} | ${condition.frames.p99Ms} | ${condition.frames.maxGapsOver100Ms} | ${condition.longTasks.totalDurationPerSecond ?? 'n/a'} | ${condition.canvas.maxStateChangeCount} | ${condition.provisionalAssessment.status} |`);
    }

    lines.push('', '## Delta to baseline');
    for (const [id, comparison] of Object.entries(result.comparisons)) {
        lines.push(`- ${id}: p95 ${formatDelta(comparison.frames.p95Ms)}, p99 ${formatDelta(comparison.frames.p99Ms)}, >50ms/1000f ${formatDelta(comparison.frames.gapsOver50Per1000Frames)}, long-task ms/s ${formatDelta(comparison.longTasks.totalDurationPerSecond)}`);
    }
    lines.push('', 'Threshold assessments are provisional investigation signals, not merge gates.');
    return lines.join('\n');
}

function runCli() {
    const args = process.argv.slice(2);
    const jsonOnly = args.includes('--json');
    const matrixArg = args.find(arg => !arg.startsWith('--'));
    if (!matrixArg) {
        console.error('Usage: node tools/compare-match-rendering-traces.mjs <matrix.json> [--json]');
        process.exitCode = 1;
        return;
    }

    try {
        const matrixPath = path.resolve(matrixArg);
        const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
        const result = compareTraceMatrix(matrix, { baseDir: path.dirname(matrixPath) });
        console.log(jsonOnly ? JSON.stringify(result, null, 2) : formatComparisonSummary(result));
        if (!result.comparability.ok) process.exitCode = 2;
    } catch (error) {
        console.error(`[match-rendering-trace-comparison] ${error.message}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) runCli();
