// ============================================================
// 16b. Match Rendering Compatibility
// ============================================================
// Verbatim extraction from src/app/bootstrap.js (issue #278).
// Loaded immediately before the final bootstrap orchestrator.

function installMatchRenderingCompatibility() {
    if (!location.pathname.includes('/game.php')) return;

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const root = document.documentElement;
    if (root.dataset.slfMatchRenderingCompatibility === '1') return;
    root.dataset.slfMatchRenderingCompatibility = '1';

    const FIELD_WIDTH = 800;
    const FIELD_HEIGHT = 550;
    const MAX_RENDER_SCALE = 1;
    const CLASSIC_PITCH_BACKGROUND = '#1d6f36 url("/images/gen4/play_field6.png") -1px 0 / 800px 550px no-repeat';

    const styleId = 'slf-match-rendering-compatibility';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html[data-slf-match-rendering-compatibility="1"] .g3 [id^="fieldgrass"] {
                width: 800px !important;
                height: 550px !important;
                max-width: none !important;
                background: #1d6f36 url("/images/gen4/play_field6.png") -1px 0 / 800px 550px no-repeat !important;
                transform: none !important;
                transform-origin: top center !important;
                margin-left: auto !important;
                margin-right: auto !important;
                margin-bottom: 0 !important;
                filter: none !important;
                box-shadow: none !important;
                transition: none !important;
                will-change: auto !important;
                contain: layout paint style !important;
                isolation: isolate !important;
            }
            html[data-slf-match-rendering-compatibility="1"] .g3 [id^="fieldgrass"] #letsdance {
                width: 800px !important;
                height: 550px !important;
                image-rendering: auto;
                filter: none !important;
                transform: none !important;
            }
            html[data-slf-match-rendering-compatibility="1"] .g3 .g3-timeline {
                width: 800px !important;
                max-width: 800px !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    const getField = () => document.querySelector('.g3 [id^="fieldgrass"]');

    const applyClassicGeometry = () => {
        const field = getField();
        if (!field) return false;

        field.dataset.slfClassicPerformance = '1';
        field.dataset.slfClassicPitchForced = '1';
        field.dataset.slfClassicRaster = '1';
        field.style.setProperty('width', `${FIELD_WIDTH}px`, 'important');
        field.style.setProperty('height', `${FIELD_HEIGHT}px`, 'important');
        field.style.setProperty('background', CLASSIC_PITCH_BACKGROUND, 'important');
        field.style.setProperty('transform', 'none', 'important');
        field.style.setProperty('transform-origin', 'top center', 'important');
        field.style.setProperty('margin-left', 'auto', 'important');
        field.style.setProperty('margin-right', 'auto', 'important');
        field.style.setProperty('margin-bottom', '0px', 'important');
        field.style.setProperty('filter', 'none', 'important');
        field.style.setProperty('box-shadow', 'none', 'important');
        field.style.setProperty('contain', 'layout paint style', 'important');
        field.style.setProperty('isolation', 'isolate', 'important');

        const canvas = field.querySelector('#letsdance');
        if (canvas) {
            canvas.style.setProperty('width', `${FIELD_WIDTH}px`, 'important');
            canvas.style.setProperty('height', `${FIELD_HEIGHT}px`, 'important');
            canvas.style.setProperty('transform', 'none', 'important');
            canvas.style.setProperty('filter', 'none', 'important');
        }

        const timeline = document.querySelector('.g3 .g3-timeline');
        if (timeline) {
            timeline.style.setProperty('width', `${FIELD_WIDTH}px`, 'important');
            timeline.style.setProperty('max-width', `${FIELD_WIDTH}px`, 'important');
            timeline.style.setProperty('margin-left', 'auto', 'important');
            timeline.style.setProperty('margin-right', 'auto', 'important');
        }

        root.dataset.slfClassicMatchPerformance = '1';
        return true;
    };

    const patchRenderScale = () => {
        const engine = pageWindow.game_2d;
        if (!engine || typeof engine.set_render_scale !== 'function') return false;

        if (!engine.__slfSmoothRenderScaleInstalled) {
            const originalSetRenderScale = engine.set_render_scale.bind(engine);
            let lastAppliedScale = null;
            engine.set_render_scale = value => {
                const numeric = Number(value);
                const normalized = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
                const capped = Math.min(normalized, MAX_RENDER_SCALE);
                if (lastAppliedScale !== null && Math.abs(lastAppliedScale - capped) < 0.02) return undefined;
                const result = originalSetRenderScale(capped);
                lastAppliedScale = capped;
                root.dataset.slfMatchRenderScale = String(capped);
                return result;
            };
            Object.defineProperty(engine, '__slfSmoothRenderScaleInstalled', {
                value: true,
                enumerable: false,
                configurable: false
            });
        }

        engine.set_render_scale(MAX_RENDER_SCALE);
        return root.dataset.slfMatchRenderScale === String(MAX_RENDER_SCALE);
    };

    const patchFieldSizer = () => {
        const current = pageWindow.game2dSetFieldSize;
        if (typeof current !== 'function') return false;
        if (current.__slfClassicMatchPerformanceInstalled) return true;

        const original = current.bind(pageWindow);
        const wrapped = function classicMatchFieldSizer() {
            const result = original.apply(pageWindow, arguments);
            applyClassicGeometry();
            patchRenderScale();
            return result;
        };
        Object.defineProperty(wrapped, '__slfClassicMatchPerformanceInstalled', {
            value: true,
            enumerable: false,
            configurable: false
        });
        pageWindow.game2dSetFieldSize = wrapped;
        return true;
    };

    const enforce = () => {
        const geometryReady = applyClassicGeometry();
        const scaleReady = patchRenderScale();
        const fieldSizerReady = patchFieldSizer();
        const ready = geometryReady && scaleReady && fieldSizerReady;
        if (ready) root.dataset.slfMatchRenderHooks = 'ready';
        return ready;
    };

    pageWindow.addEventListener('resize', enforce, { passive: true });
    if (enforce()) return;

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (enforce() || attempts >= 100 || !location.pathname.includes('/game.php')) clearInterval(timer);
    }, 100);
}

try {
    installMatchRenderingCompatibility();
} catch (error) {
    debugWarn('[SLF] match rendering compatibility adapter failed; continuing startup', error);
}
