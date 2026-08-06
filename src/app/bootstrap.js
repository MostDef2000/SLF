// 15. App Bootstrap
// ============================================================

(function installHeaderMatchesLayoutCompatibility() {
    const root = document.documentElement;
    if (!root || root.dataset.slfHeaderMatchesFit === '1') return;
    root.dataset.slfHeaderMatchesFit = '1';

    const styleId = 'slf-header-matches-fit';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html[data-slf-header-matches-fit="1"] .fm-deck__grid {
                column-gap: 14px !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls {
                display: grid !important;
                grid-template-columns: none !important;
                grid-auto-flow: column !important;
                grid-auto-columns: minmax(0, 1fr) !important;
                align-items: stretch !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls > .fm-card {
                width: auto !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-card__mid,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-account,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-char,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-md,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-club,
            html[data-slf-header-matches-fit="1"] .fm-card--controls .fm-club__body {
                min-width: 0 !important;
                max-width: 100% !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-card--matches {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: visible !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck:not(.fm-deck--collapsed) .fm-card--matches #field-f7 {
                min-height: 0 !important;
                height: auto !important;
                overflow: visible !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck:not(.fm-deck--collapsed) .fm-matches__scroll {
                flex: 0 0 auto !important;
                height: auto !important;
                max-height: none !important;
                overflow-y: visible !important;
                scrollbar-width: none !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck:not(.fm-deck--collapsed) .fm-matches__scroll::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck:not(.fm-deck--collapsed) .fm-fixture--mine {
                position: relative !important;
                top: auto !important;
            }
            html[data-slf-header-matches-fit="1"] .fm-deck:not(.fm-deck--collapsed) #fm-games-expand {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    const parseFixtureMinute = row => {
        const explicit = row.querySelector('.fm-fixture__time');
        const text = String(explicit?.textContent || row.firstElementChild?.textContent || '').trim();
        const match = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
    };

    const chronologicalStartMinute = minutes => {
        const unique = Array.from(new Set(minutes)).sort((a, b) => a - b);
        if (unique.length < 2) return unique[0] ?? 0;

        let largestGap = -1;
        let startMinute = unique[0];
        unique.forEach((minute, index) => {
            const next = index + 1 < unique.length ? unique[index + 1] : unique[0] + 24 * 60;
            const gap = next - minute;
            if (gap > largestGap) {
                largestGap = gap;
                startMinute = next % (24 * 60);
            }
        });
        return startMinute;
    };

    const sortFixtureList = list => {
        if (!list || list.dataset.slfChronologicalSortActive === '1') return false;
        const rows = Array.from(list.children).filter(node => node.classList?.contains('fm-fixture'));
        if (rows.length < 2) return false;

        const parsed = rows.map((row, index) => ({ row, index, minute: parseFixtureMinute(row) }));
        const validMinutes = parsed.filter(item => item.minute !== null).map(item => item.minute);
        if (validMinutes.length < 2) return false;

        const startMinute = chronologicalStartMinute(validMinutes);
        const sorted = parsed.slice().sort((left, right) => {
            if (left.minute === null && right.minute === null) return left.index - right.index;
            if (left.minute === null) return 1;
            if (right.minute === null) return -1;
            const leftKey = (left.minute - startMinute + 24 * 60) % (24 * 60);
            const rightKey = (right.minute - startMinute + 24 * 60) % (24 * 60);
            return leftKey - rightKey || left.index - right.index;
        });

        if (sorted.every((item, index) => item.row === rows[index])) {
            list.dataset.slfChronologicalOrder = '1';
            return false;
        }

        list.dataset.slfChronologicalSortActive = '1';
        sorted.forEach(item => list.appendChild(item.row));
        list.dataset.slfChronologicalOrder = '1';
        delete list.dataset.slfChronologicalSortActive;
        return true;
    };

    let sortScheduled = false;
    const normalizeFixtureOrder = () => {
        sortScheduled = false;
        document.querySelectorAll('.fm-card--matches .fm-fixtures').forEach(sortFixtureList);
        root.dataset.slfHeaderMatchesChronological = '1';
    };
    const scheduleFixtureOrder = () => {
        if (sortScheduled) return;
        sortScheduled = true;
        setTimeout(normalizeFixtureOrder, 0);
    };

    scheduleFixtureOrder();
    const observerRoot = document.querySelector('.fm-deck') || document.body;
    if (observerRoot) {
        const observer = new MutationObserver(scheduleFixtureOrder);
        observer.observe(observerRoot, { childList: true, subtree: true, characterData: true });
    }
})();

(function installMatchRenderingCompatibility() {
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
    placeTrainingGuideBeforeChampAverages() {
        if (!/^\/train\.php$/i.test(location.pathname || '') || (location.search || '')) return false;

        const panel = document.getElementById('slf-training-guide-panel');
        const champ = document.querySelector('.train__champ');
        if (!panel || !champ || !champ.parentNode) return false;

        const cardId = 'slf-training-benchmarks-card';
        let card = document.getElementById(cardId);
        if (!card) {
            card = document.createElement('section');
            card.id = cardId;
            champ.parentNode.insertBefore(card, champ);
        } else if (!card.contains(champ) && card.parentNode !== champ.parentNode) {
            champ.parentNode.insertBefore(card, champ);
        }

        if (panel.parentNode !== card) card.appendChild(panel);
        if (champ.parentNode !== card) card.appendChild(champ);
        if (card.firstElementChild !== panel) card.insertBefore(panel, card.firstElementChild);
        if (panel.nextElementSibling !== champ) card.insertBefore(champ, panel.nextElementSibling);

        card.dataset.slfMount = 'fm2026-training-benchmarks-card';
        panel.dataset.slfMount = 'fm2026-training-before-champ';

        const styleId = 'slf-training-guide-block-layout';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                #slf-training-benchmarks-card {
                    display: block !important;
                    width: 100% !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    margin: 18px 0 14px !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                    background: var(--fm-panel, #171b29) !important;
                    border: 1px solid var(--fm-border-2, #38415f) !important;
                    border-radius: var(--fm-radius, 14px) !important;
                    color: var(--fm-text, #eef1f8) !important;
                    overflow: hidden !important;
                }
                #slf-training-benchmarks-card > #slf-training-guide-panel {
                    display: block !important;
                    width: 100% !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    flex: none !important;
                    margin: 0 !important;
                    padding: 14px !important;
                    box-sizing: border-box !important;
                    background: transparent !important;
                    border: 0 !important;
                    border-bottom: 1px solid var(--fm-border-2, #38415f) !important;
                    border-radius: 0 !important;
                    overflow-x: auto !important;
                }
                #slf-training-benchmarks-card > .train__champ {
                    display: block !important;
                    width: 100% !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    padding: 14px !important;
                    box-sizing: border-box !important;
                    background: transparent !important;
                    border: 0 !important;
                    border-radius: 0 !important;
                    overflow-x: auto !important;
                }
                #slf-training-benchmarks-card > #slf-training-guide-panel .slf-source {
                    grid-template-columns: minmax(80px, 1fr) 90px minmax(78px, .8fr) minmax(78px, .8fr) minmax(0, 1fr) !important;
                }
                @media (max-width: 1050px) {
                    #slf-training-benchmarks-card > #slf-training-guide-panel .slf-source {
                        grid-template-columns: 80px 90px 1fr 1fr !important;
                    }
                    #slf-training-benchmarks-card > #slf-training-guide-panel .slf-source-state {
                        grid-column: 1 / -1;
                    }
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        return true;
    },

    mountUI() {
    UI.addMatchParserPanel();
    // Manual-only Coach Hint mode:
    // - no live parser auto-resume;
    // - no manual tactic watcher freeze/status loop;
    // - tactical blocks are rebuilt only when the user presses "Подсказка".
    // Keep the library module loaded for preset metadata, but do not mount its visible reference panel.
    void TacticPresetLibraryPanel;
    TrainingGuidePanel.mount();
    this.placeTrainingGuideBeforeChampAverages();
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
