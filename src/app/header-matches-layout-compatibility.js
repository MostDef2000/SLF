// FM 2026 header matches layout compatibility
// ============================================================

const HeaderMatchesLayoutCompatibility = {
    install() {
        const root = document.documentElement;
        if (!root || root.dataset.slfHeaderMatchesFit === '1') return;
        root.dataset.slfHeaderMatchesFit = '1';

        const styleId = 'slf-header-matches-fit';
        if (document.getElementById(styleId)) return;

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
};

runCompatibilityAdapter('header-matches-layout', () => HeaderMatchesLayoutCompatibility.install());
