(() => {
    'use strict';

    const REPORT_KEY = '__SLF_MATCH_RENDER_DIAGNOSTICS_REPORT__';
    const STOP_KEY = '__SLF_MATCH_RENDER_DIAGNOSTICS_STOP__';
    const RUNNING_KEY = '__SLF_MATCH_RENDER_DIAGNOSTICS_RUNNING__';

    if (window[RUNNING_KEY]) {
        console.warn('[SLF diagnostics] capture is already running');
        return;
    }

    const options = Object.assign({
        durationMs: 15000,
        canvasSampleIntervalMs: 250,
        maxFrameSamples: 5000
    }, window.SLF_MATCH_DIAGNOSTICS_OPTIONS || {});

    const durationMs = Math.max(1000, Number(options.durationMs) || 15000);
    const sampleIntervalMs = Math.max(100, Number(options.canvasSampleIntervalMs) || 250);
    const maxFrameSamples = Math.max(300, Number(options.maxFrameSamples) || 5000);
    const startedAt = new Date().toISOString();
    const startedAtPerformance = performance.now();
    const frameDeltas = [];
    const longTasks = [];
    const canvasSamples = [];
    const visibilityChanges = [];
    let lastFrameAt = null;
    let rafId = null;
    let sampleTimer = null;
    let finishTimer = null;
    let longTaskObserver = null;
    let stopped = false;

    const percentile = (values, ratio) => {
        if (!values.length) return null;
        const ordered = [...values].sort((a, b) => a - b);
        const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1));
        return Number(ordered[index].toFixed(2));
    };

    const summarizeFrames = values => ({
        sampleCount: values.length,
        medianMs: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        maxMs: values.length ? Number(Math.max(...values).toFixed(2)) : null,
        gapsOver40Ms: values.filter(value => value > 40).length,
        gapsOver50Ms: values.filter(value => value > 50).length,
        gapsOver100Ms: values.filter(value => value > 100).length
    });

    const readCanvasState = () => {
        const field = document.querySelector('.g3 [id^="fieldgrass"]');
        const canvas = field?.querySelector('#letsdance') || document.getElementById('letsdance');
        if (!canvas) return null;
        const fieldRect = field?.getBoundingClientRect?.() || null;
        const canvasRect = canvas.getBoundingClientRect?.() || null;
        return {
            atMs: Number((performance.now() - startedAtPerformance).toFixed(2)),
            bitmapWidth: Number(canvas.width || 0),
            bitmapHeight: Number(canvas.height || 0),
            cssWidth: canvasRect ? Number(canvasRect.width.toFixed(2)) : null,
            cssHeight: canvasRect ? Number(canvasRect.height.toFixed(2)) : null,
            fieldWidth: fieldRect ? Number(fieldRect.width.toFixed(2)) : null,
            fieldHeight: fieldRect ? Number(fieldRect.height.toFixed(2)) : null,
            fieldTransform: field ? getComputedStyle(field).transform : null,
            renderScale: document.documentElement?.dataset?.slfMatchRenderScale || null,
            renderHooks: document.documentElement?.dataset?.slfMatchRenderHooks || null
        };
    };

    const recordCanvas = () => {
        const state = readCanvasState();
        if (!state) return;
        const previous = canvasSamples.at(-1);
        const signature = JSON.stringify([
            state.bitmapWidth,
            state.bitmapHeight,
            state.cssWidth,
            state.cssHeight,
            state.fieldWidth,
            state.fieldHeight,
            state.fieldTransform,
            state.renderScale,
            state.renderHooks
        ]);
        const previousSignature = previous?.signature || null;
        if (signature === previousSignature) return;
        canvasSamples.push(Object.assign({ signature }, state));
    };

    const onFrame = now => {
        if (stopped) return;
        if (lastFrameAt !== null && frameDeltas.length < maxFrameSamples) {
            frameDeltas.push(now - lastFrameAt);
        }
        lastFrameAt = now;
        rafId = requestAnimationFrame(onFrame);
    };

    const onVisibilityChange = () => {
        visibilityChanges.push({
            atMs: Number((performance.now() - startedAtPerformance).toFixed(2)),
            state: document.visibilityState
        });
    };

    const finish = reason => {
        if (stopped) return window[REPORT_KEY] || null;
        stopped = true;
        window[RUNNING_KEY] = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (sampleTimer !== null) clearInterval(sampleTimer);
        if (finishTimer !== null) clearTimeout(finishTimer);
        if (longTaskObserver) longTaskObserver.disconnect();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        recordCanvas();

        const totalLongTaskMs = longTasks.reduce((sum, item) => sum + item.durationMs, 0);
        const uniqueCanvasStates = canvasSamples.map(({ signature, ...sample }) => sample);
        const report = {
            schema: 'slf_match_rendering_diagnostics_v1',
            startedAt,
            finishedAt: new Date().toISOString(),
            reason,
            durationMs: Number((performance.now() - startedAtPerformance).toFixed(2)),
            page: {
                href: location.href,
                visibilityState: document.visibilityState,
                devicePixelRatio: Number(window.devicePixelRatio || 1),
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            },
            frames: summarizeFrames(frameDeltas),
            longTasks: {
                supported: Boolean(longTaskObserver),
                count: longTasks.length,
                totalDurationMs: Number(totalLongTaskMs.toFixed(2)),
                maxDurationMs: longTasks.length
                    ? Number(Math.max(...longTasks.map(item => item.durationMs)).toFixed(2))
                    : null,
                entries: longTasks
            },
            canvas: {
                stateChangeCount: Math.max(0, uniqueCanvasStates.length - 1),
                states: uniqueCanvasStates
            },
            slf: {
                scriptVersion: window.SLF?.scriptVersion || null,
                observerTarget: window.__slf_ui_observer_target || null,
                observerRuns: Number(window.__slf_match_ui_observer_runs || 0),
                renderScale: document.documentElement?.dataset?.slfMatchRenderScale || null,
                renderHooks: document.documentElement?.dataset?.slfMatchRenderHooks || null
            },
            visibilityChanges
        };

        window[REPORT_KEY] = report;
        delete window[STOP_KEY];
        console.info('[SLF diagnostics] capture complete');
        console.log(JSON.stringify(report, null, 2));
        return report;
    };

    window[RUNNING_KEY] = true;
    window[STOP_KEY] = () => finish('manual-stop');
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityChanges.push({ atMs: 0, state: document.visibilityState });

    if (typeof PerformanceObserver === 'function') {
        try {
            longTaskObserver = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    longTasks.push({
                        startTimeMs: Number(entry.startTime.toFixed(2)),
                        durationMs: Number(entry.duration.toFixed(2)),
                        name: entry.name || 'longtask'
                    });
                }
            });
            longTaskObserver.observe({ type: 'longtask', buffered: true });
        } catch (error) {
            longTaskObserver = null;
            console.warn('[SLF diagnostics] Long Tasks API unavailable', error);
        }
    }

    recordCanvas();
    sampleTimer = setInterval(recordCanvas, sampleIntervalMs);
    rafId = requestAnimationFrame(onFrame);
    finishTimer = setTimeout(() => finish('duration-complete'), durationMs);
    console.info(`[SLF diagnostics] capture started for ${durationMs} ms`);
})();
