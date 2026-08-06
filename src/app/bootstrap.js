// 15. App Bootstrap
// ============================================================

const App = {
    placeTrainingGuideBeforeChampAverages() {
        if (!/^\/train\.php$/i.test(location.pathname || '') || (location.search || '')) return false;

        const panel = document.getElementById('slf-training-guide-panel');
        const champ = document.querySelector('.train__champ');
        if (!panel || !champ || !champ.parentNode) return false;

        if (panel.nextElementSibling !== champ || panel.parentNode !== champ.parentNode) {
            champ.parentNode.insertBefore(panel, champ);
        }

        panel.dataset.slfMount = 'fm2026-training-before-champ';

        const styleId = 'slf-training-guide-block-layout';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                #slf-training-guide-panel[data-slf-mount="fm2026-training-before-champ"] {
                    display: block !important;
                    width: 100% !important;
                    max-width: none !important;
                    flex: none !important;
                    margin: 18px 0 14px !important;
                    padding: 14px !important;
                    box-sizing: border-box !important;
                    background: var(--fm-panel, #171b29) !important;
                    border: 1px solid var(--fm-border-2, #38415f) !important;
                    border-radius: var(--fm-radius, 14px) !important;
                    color: var(--fm-text, #eef1f8) !important;
                    overflow-x: auto !important;
                }
                #slf-training-guide-panel[data-slf-mount="fm2026-training-before-champ"] .slf-source {
                    grid-template-columns: minmax(80px, 1fr) 90px minmax(78px, .8fr) minmax(78px, .8fr) minmax(0, 1fr) !important;
                }
                @media (max-width: 1050px) {
                    #slf-training-guide-panel[data-slf-mount="fm2026-training-before-champ"] .slf-source {
                        grid-template-columns: 80px 90px 1fr 1fr !important;
                    }
                    #slf-training-guide-panel[data-slf-mount="fm2026-training-before-champ"] .slf-source-state {
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
