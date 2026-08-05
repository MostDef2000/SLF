// App: SLF 2026 design adapter and runtime version badge
// Safe self-contained app-level module. Must never break userscript startup.

const SLFDesign = (() => {
    'use strict';

    const STYLE_ID = 'slf-fm2026-design-adapter-style';
    const DESIGN_ATTR = 'data-slf-design';

    function isFm2026() {
        try {
            return !!document.querySelector('.fm-stage, .fm-topbar, .fm-deck, .content-ui__wrapper');
        } catch (error) {
            return false;
        }
    }

    function syncDesignMarker() {
        try {
            document.documentElement.setAttribute(DESIGN_ATTR, isFm2026() ? 'fm2026' : 'legacy');
        } catch (error) {}
    }

    function getContentRoot() {
        try {
            return document.querySelector('.content-ui__wrapper') ||
                document.querySelector('.fm-stage') ||
                document.querySelector('.match_content') ||
                document.querySelector('.team_general_content') ||
                document.body;
        } catch (error) {
            return null;
        }
    }

    function getBadgeTarget() {
        try {
            return document.querySelector('.fm-card--manager .fm-account__status') ||
                document.querySelector('.fm-topbar__right') ||
                document.querySelector('.head-ui__information');
        } catch (error) {
            return null;
        }
    }

    function ensureStyles() {
        try {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
html[${DESIGN_ATTR}="fm2026"] {
    --slf-ui-bg: var(--fm-panel, #171b29);
    --slf-ui-bg-2: var(--fm-panel-2, #1c2132);
    --slf-ui-bg-3: var(--fm-panel-3, #222842);
    --slf-ui-border: var(--fm-border-2, #38415f);
    --slf-ui-text: var(--fm-text, #eef1f8);
    --slf-ui-muted: var(--fm-muted, #8b93ab);
    --slf-ui-accent: var(--fm-green, #2bd97c);
    --slf-ui-accent-2: var(--fm-green-2, #43f58c);
    --slf-ui-danger: var(--fm-red, #ff5d6c);
    --slf-ui-radius: var(--fm-radius, 14px);
    --slf-ui-font: var(--fm-font, "Roboto", "Segoe UI", Arial, sans-serif);
}
html[${DESIGN_ATTR}="fm2026"] .slf-ui,
html[${DESIGN_ATTR}="fm2026"] .slf-ui * {
    box-sizing: border-box;
    font-family: var(--slf-ui-font) !important;
}
html[${DESIGN_ATTR}="fm2026"] .slf-panel {
    color: var(--slf-ui-text) !important;
    background:
        radial-gradient(120% 140% at 0% 0%, rgba(43,217,124,.10), transparent 54%),
        linear-gradient(160deg, rgba(79,124,255,.09), transparent 62%),
        var(--slf-ui-bg) !important;
    border: 1px solid var(--slf-ui-border) !important;
    border-radius: var(--slf-ui-radius) !important;
    box-shadow: 0 14px 34px rgba(0,0,0,.24) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel.slf-panel {
    width: 100% !important;
    max-width: none !important;
    margin: 0 0 16px !important;
    padding: 12px 14px !important;
    display: flex !important;
    align-items: center !important;
    align-content: flex-start !important;
    gap: 8px !important;
    font-size: 12.5px !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel > div:first-child,
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown > div:first-child {
    color: var(--slf-ui-text) !important;
    font-weight: 700 !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-parser-status,
html[${DESIGN_ATTR}="fm2026"] #slf-parser-log {
    color: var(--slf-ui-accent-2) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-parser-recommendation {
    width: 100% !important;
    max-width: none !important;
    color: var(--slf-ui-text) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-parser-recommendation > div,
html[${DESIGN_ATTR}="fm2026"] [data-slf-rec-priority] {
    color: var(--slf-ui-text) !important;
    background: var(--slf-ui-bg-2) !important;
    border: 1px solid var(--slf-ui-border) !important;
    border-radius: 10px !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel button,
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown button,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog button {
    min-height: 30px !important;
    padding: 6px 10px !important;
    color: var(--slf-ui-text) !important;
    background: var(--slf-ui-bg-3) !important;
    border: 1px solid var(--slf-ui-border) !important;
    border-radius: 8px !important;
    font: 600 12px var(--slf-ui-font) !important;
    cursor: pointer !important;
    transition: border-color .15s, color .15s, background-color .15s !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel button:hover,
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown button:hover,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog button:hover {
    color: var(--slf-ui-accent-2) !important;
    border-color: var(--slf-ui-accent) !important;
    background: rgba(43,217,124,.10) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-manual-recommendation-btn {
    color: #07130c !important;
    background: linear-gradient(180deg, var(--slf-ui-accent-2), #1fb863) !important;
    border-color: transparent !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown.slf-panel {
    width: 100% !important;
    max-width: 100% !important;
    margin: 4px 0 12px !important;
    padding: 10px 12px !important;
    color: var(--slf-ui-text) !important;
    font-size: 12.5px !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown select,
html[${DESIGN_ATTR}="fm2026"] #slf-foreign-match-target,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog select,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog input {
    min-height: 32px !important;
    padding: 6px 9px !important;
    color: var(--slf-ui-text) !important;
    background: var(--slf-ui-bg-2) !important;
    border: 1px solid var(--slf-ui-border) !important;
    border-radius: 8px !important;
    font: 500 12px var(--slf-ui-font) !important;
    outline: none !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-dropdown select:focus,
html[${DESIGN_ATTR}="fm2026"] #slf-foreign-match-target:focus,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog select:focus,
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog input:focus {
    border-color: var(--slf-ui-accent) !important;
    box-shadow: 0 0 0 3px rgba(43,217,124,.14) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-tactics-scheme-label {
    color: #eaac41 !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog {
    background: rgba(5,7,13,.78) !important;
    backdrop-filter: blur(5px);
}
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog > div {
    min-width: min(420px, calc(100vw - 32px)) !important;
    padding: 20px !important;
    color: var(--slf-ui-text) !important;
    background: var(--slf-ui-bg) !important;
    border: 1px solid var(--slf-ui-border) !important;
    border-radius: var(--slf-ui-radius) !important;
    box-shadow: 0 24px 64px rgba(0,0,0,.55) !important;
    font-family: var(--slf-ui-font) !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-save-dialog h3 {
    margin: 0 0 14px !important;
    color: var(--slf-ui-text) !important;
    font-weight: 500 !important;
}
html[${DESIGN_ATTR}="fm2026"] #slf-version-inline-badge {
    display: inline-flex;
    align-items: center;
    margin-left: 7px;
    padding: 1px 7px;
    color: var(--slf-ui-accent-2) !important;
    background: rgba(43,217,124,.10);
    border: 1px solid rgba(43,217,124,.28);
    border-radius: 999px;
    font: 700 9px var(--slf-ui-font) !important;
    letter-spacing: .04em;
    white-space: nowrap;
    text-shadow: none !important;
}
@media (max-width: 900px) {
    html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel.slf-panel { align-items: stretch !important; }
    html[${DESIGN_ATTR}="fm2026"] #slf-match-parser-panel button { flex: 1 1 auto; }
}
            `;
            (document.head || document.documentElement).appendChild(style);
        } catch (error) {}
    }

    function addClass(node, className) {
        try {
            if (node && node.classList) node.classList.add(className);
        } catch (error) {}
    }

    function adaptMatchPanel() {
        try {
            const panel = document.getElementById('slf-match-parser-panel');
            if (!panel) return false;
            addClass(panel, 'slf-ui');
            addClass(panel, 'slf-panel');
            panel.dataset.slfMount = isFm2026() ? 'fm2026-content' : 'legacy';

            if (isFm2026()) {
                const root = getContentRoot();
                if (root && root !== panel && !root.contains(panel)) root.insertBefore(panel, root.firstChild);
            }

            panel.querySelectorAll('button').forEach(node => addClass(node, 'slf-button'));
            panel.querySelectorAll('select,input').forEach(node => addClass(node, 'slf-control'));
            return true;
        } catch (error) {
            return false;
        }
    }

    function adaptTacticsDropdown() {
        try {
            const panel = document.getElementById('slf-tactics-dropdown');
            if (!panel) return false;
            addClass(panel, 'slf-ui');
            addClass(panel, 'slf-panel');
            panel.dataset.slfMount = isFm2026() ? 'fm2026-tactic-root' : 'legacy';
            panel.querySelectorAll('button').forEach(node => addClass(node, 'slf-button'));
            panel.querySelectorAll('select,input').forEach(node => addClass(node, 'slf-control'));
            return true;
        } catch (error) {
            return false;
        }
    }

    function adaptSaveDialog() {
        try {
            const overlay = document.getElementById('slf-save-dialog');
            if (!overlay) return false;
            addClass(overlay, 'slf-ui');
            return true;
        } catch (error) {
            return false;
        }
    }

    function adaptExisting() {
        syncDesignMarker();
        ensureStyles();
        adaptMatchPanel();
        adaptTacticsDropdown();
        adaptSaveDialog();
    }

    function patchUi() {
        try {
            if (typeof UI === 'undefined' || !UI || UI.__fm2026DesignAdapterApplied) return;

            if (typeof UI.addMatchParserPanel === 'function') {
                const original = UI.addMatchParserPanel.bind(UI);
                UI.addMatchParserPanel = function addAdaptedMatchParserPanel() {
                    const result = original.apply(UI, arguments);
                    adaptMatchPanel();
                    return result;
                };
            }

            if (typeof UI.addDropdown === 'function') {
                const original = UI.addDropdown.bind(UI);
                UI.addDropdown = async function addAdaptedTacticsDropdown() {
                    const result = await original.apply(UI, arguments);
                    adaptTacticsDropdown();
                    return result;
                };
            }

            if (typeof UI.showSaveDialog === 'function') {
                const original = UI.showSaveDialog.bind(UI);
                UI.showSaveDialog = function showAdaptedSaveDialog() {
                    const result = original.apply(UI, arguments);
                    adaptSaveDialog();
                    return result;
                };
            }

            UI.__fm2026DesignAdapterApplied = true;
        } catch (error) {}
    }

    function install() {
        try {
            syncDesignMarker();
            ensureStyles();
            patchUi();
            adaptExisting();
        } catch (error) {}
    }

    return {
        STYLE_ID,
        isFm2026,
        getContentRoot,
        getBadgeTarget,
        ensureStyles,
        adaptExisting,
        install
    };
})();

SLFDesign.install();

(function installSLFVersionBadge() {
    'use strict';

    try {
        const BADGE_ID = 'slf-version-inline-badge';

        function safeGetGlobal() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
            } catch (error) {}
            try {
                return window;
            } catch (error) {}
            return null;
        }

        function safeGetVersion() {
            try {
                const root = safeGetGlobal();
                const slf = root && root.SLF ? root.SLF : (typeof window !== 'undefined' ? window.SLF : null);
                return String(
                    (slf && slf.scriptVersion) ||
                    (slf && slf.versionInfo && slf.versionInfo.version) ||
                    ''
                ).trim();
            } catch (error) {
                return '';
            }
        }

        function safeGetTarget() {
            try {
                return SLFDesign.getBadgeTarget();
            } catch (error) {
                return null;
            }
        }

        function safeRemoveExisting() {
            try {
                const existing = document.getElementById(BADGE_ID);
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            } catch (error) {}
        }

        function render() {
            try {
                SLFDesign.adaptExisting();
                const target = safeGetTarget();
                if (!target) return false;
                const version = safeGetVersion();
                if (!version) return false;

                safeRemoveExisting();
                const badge = document.createElement('span');
                badge.id = BADGE_ID;
                badge.className = 'slf-ui';
                badge.textContent = `SLF ${version}`;
                badge.title = 'SLF userscript version';
                target.appendChild(badge);
                return true;
            } catch (error) {
                return false;
            }
        }

        function start() {
            try {
                const run = function () {
                    try {
                        if (render()) return;
                        let tries = 0;
                        const maxTries = 40;
                        const timer = window.setInterval(function () {
                            try {
                                tries += 1;
                                if (render() || tries >= maxTries) window.clearInterval(timer);
                            } catch (error) {
                                try { window.clearInterval(timer); } catch (inner) {}
                            }
                        }, 250);
                    } catch (error) {}
                };

                if (typeof document === 'undefined') return;
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
                else run();
            } catch (error) {}
        }

        start();
    } catch (error) {}
})();
