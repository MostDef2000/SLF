// 15. App Bootstrap
// ============================================================

(function installMatchRenderingCompatibility() {
    if (!location.pathname.includes('/game.php')) return;

    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const root = document.documentElement;
    if (root.dataset.slfMatchRenderingCompatibility === '1') return;
    root.dataset.slfMatchRenderingCompatibility = '1';

    const FIELD_WIDTH = 800;
    const FIELD_HEIGHT = 550;
    const MAX_RENDER_SCALE = 1.5;

    const styleId = 'slf-match-rendering-compatibility';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .g3 [id^="fieldgrass"]:not([class*="user-custom__game-field-"]) {
                background: #1d6f36 url("/images/gen4/play_field6.png") -1px 0 / 800px 550px no-repeat !important;
            }
            html[data-slf-match-rendering-compatibility="1"] .g3 [id^="fieldgrass"] {
                width: 800px !important;
                height: 550px !important;
                max-width: none !important;
                transform: none !important;
                transform-origin: top center !important;
                margin-left: auto !important;
                margin-right: auto !important;
                margin-bottom: 0 !important;
                filter: none !important;
                box-shadow: none !important;
                transition: none !important;
                will-change: auto !important;
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
        field.style.setProperty('width', `${FIELD_WIDTH}px`, 'important');
        field.style.setProperty('height', `${FIELD_HEIGHT}px`, 'important');
        field.style.setProperty('transform', 'none', 'important');
        field.style.setProperty('transform-origin', 'top center', 'important');
        field.style.setProperty('margin-left', 'auto', 'important');
        field.style.setProperty('margin-right', 'auto', 'important');
        field.style.setProperty('margin-bottom', '0px', 'important');
        field.style.setProperty('filter', 'none', 'important');
        field.style.setProperty('box-shadow', 'none', 'important');

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
            engine.set_render_scale = value => {
                const numeric = Number(value);
                const normalized = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
                return originalSetRenderScale(Math.min(normalized, MAX_RENDER_SCALE));
            };
            Object.defineProperty(engine, '__slfSmoothRenderScaleInstalled', {
                value: true,
                enumerable: false,
                configurable: false
            });
        }

        engine.set_render_scale(MAX_RENDER_SCALE);
        return true;
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
        applyClassicGeometry();
        patchRenderScale();
        patchFieldSizer();
    };

    enforce();
    pageWindow.addEventListener('resize', enforce, { passive: true });

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        enforce();
        if (attempts >= 100 || !location.pathname.includes('/game.php')) clearInterval(timer);
    }, 100);
})();

function applyTacticsDropdownUiPolicy() {
    if (typeof UI === 'undefined' || !UI?.addDropdown || UI.__flatSortedTacticDropdownApplied) return;

    function getTrainerSortKey(key, label) {
        const text = `${label || ''} ${key || ''}`.toLowerCase();
        if (text.includes('arteta')) return 'arteta';
        if (text.includes('bielsa')) return 'bielsa';
        if (text.includes('compact counter')) return 'compact';
        if (text.includes('conte')) return 'conte';
        if (text.includes('de zerbi') || text.includes('dezerbi')) return 'de zerbi';
        if (text.includes('henta')) return 'henta';
        if (text.includes('klopp')) return 'klopp';
        if (text.includes('mourinho')) return 'mourinho';
        if (text.includes('nagelsmann')) return 'nagelsmann';
        if (text.includes('pep')) return 'pep';
        if (text.includes('simeone')) return 'simeone';
        if (text.includes('xabi')) return 'xabi';
        if (text.includes('стандарт') || text.includes('standard')) return 'standard';
        return String(label || key || '').toLowerCase();
    }

    function getSortedTacticItems() {
        const labels = typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels
            ? PresetStorage.getAllLabels()
            : {};
        return Object.entries(labels)
            .map(([key, label]) => ({
                key,
                label: String(label || key),
                trainer: getTrainerSortKey(key, label)
            }))
            .sort((a, b) => {
                const trainerCmp = a.trainer.localeCompare(b.trainer, 'ru', { sensitivity: 'base' });
                if (trainerCmp !== 0) return trainerCmp;
                return a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' });
            });
    }

    function hasSameFlatOptions(select, items) {
        if (!select || select.children.length !== items.length) return false;
        return items.every((item, index) => {
            const option = select.children[index];
            return option && option.tagName === 'OPTION' && option.value === item.key && option.textContent === item.label;
        });
    }

    function rewriteSelectFlat(select) {
        if (!select || select.dataset.slfFlatPresetRewrite === '1') return;
        const items = getSortedTacticItems();
        const current = select.value;
        if (hasSameFlatOptions(select, items)) return;

        select.dataset.slfFlatPresetRewrite = '1';
        select.innerHTML = '';
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.key;
            option.textContent = item.label;
            select.appendChild(option);
        });

        if (items.some(item => item.key === current)) select.value = current;
        else if (items.length) select.value = items[0].key;

        setTimeout(() => {
            delete select.dataset.slfFlatPresetRewrite;
        }, 0);
    }

    function normalizeDropdown() {
        const select = document.querySelector('#slf-tactics-dropdown select');
        if (!select) return;
        rewriteSelectFlat(select);

        if (select.dataset.slfFlatPresetObserver === '1') return;
        const observer = new MutationObserver(() => {
            if (select.dataset.slfFlatPresetRewrite === '1') return;
            setTimeout(() => rewriteSelectFlat(select), 0);
        });
        observer.observe(select, { childList: true, subtree: false });
        select.dataset.slfFlatPresetObserver = '1';
    }

    const originalAddDropdown = UI.addDropdown.bind(UI);
    UI.addDropdown = async function addFlatSortedTacticDropdown() {
        const result = await originalAddDropdown.apply(UI, arguments);
        normalizeDropdown();
        return result;
    };
    UI.__flatSortedTacticDropdownApplied = true;
}

applyTacticsDropdownUiPolicy();

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    // Manual-only Coach Hint mode:
    // - no live parser auto-resume;
    // - no manual tactic watcher freeze/status loop;
    // - tactical blocks are rebuilt only when the user presses "Подсказка".
    // Keep the library module loaded for preset metadata, but do not mount its visible reference panel.
    void TacticPresetLibraryPanel;
    TrainingGuidePanel.mount();
    LoanLimitPanel.mount();


    if (!document.getElementById('slf-tactics-dropdown')) {
        UI.addDropdown();
    }
},

    start() {
        // Важно: трансферный анализатор живёт отдельно от общего UI.
        // В 4.4.4 при удалении Team4 Analyzer этот вызов был случайно потерян,
        // поэтому панель на transfers.php не монтировалась.
        TransferMarketAnalyzer.start();

        PresetStorage.loadFromServerAndMerge(() => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.mountUI();
                    DomUtils.installObserver(() => this.mountUI());
                });
            } else {
                this.mountUI();
                DomUtils.installObserver(() => this.mountUI());
            }
        });
        // Production exports no page-global API or debug capability.
        // The release builder adds read-only version metadata after App starts.
    }
};

App.start();

})();