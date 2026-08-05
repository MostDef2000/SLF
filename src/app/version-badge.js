// App: FM 2026 design adapter and runtime version badge.
// Self-contained: it must never block userscript startup.

(function () {
    'use strict';

    const STYLE_ID = 'slf-fm2026-design-adapter-style';
    const BADGE_ID = 'slf-version-inline-badge';
    const designSelector = '.fm-stage, .fm-topbar, .fm-deck, .content-ui__wrapper';

    function safe(fn, fallback = null) {
        try { return fn(); } catch (error) { return fallback; }
    }

    function isFm2026() {
        return !!safe(() => document.querySelector(designSelector), null);
    }

    function syncDesignMarker() {
        safe(() => {
            const value = isFm2026() ? 'fm2026' : 'legacy';
            if (document.documentElement.dataset.slfDesign !== value) {
                document.documentElement.dataset.slfDesign = value;
            }
        });
    }

    function contentRoot() {
        return safe(() =>
            document.querySelector('.content-ui__wrapper') ||
            document.querySelector('.fm-stage') ||
            document.querySelector('.match_content') ||
            document.querySelector('.team_general_content') ||
            document.body
        );
    }

    function badgeTarget() {
        return safe(() =>
            document.querySelector('.fm-card--manager .fm-account__status') ||
            document.querySelector('.fm-topbar__right') ||
            document.querySelector('.head-ui__information')
        );
    }

    function ensureStyles() {
        safe(() => {
            if (document.getElementById(STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
html[data-slf-design="fm2026"]{--slf-bg:var(--fm-panel,#171b29);--slf-bg2:var(--fm-panel-2,#1c2132);--slf-bg3:var(--fm-panel-3,#222842);--slf-border:var(--fm-border-2,#38415f);--slf-text:var(--fm-text,#eef1f8);--slf-muted:var(--fm-muted,#8b93ab);--slf-accent:var(--fm-green,#2bd97c);--slf-accent2:var(--fm-green-2,#43f58c);--slf-radius:var(--fm-radius,14px);--slf-font:var(--fm-font,"Roboto","Segoe UI",Arial,sans-serif)}
html[data-slf-design="fm2026"] .slf-ui,html[data-slf-design="fm2026"] .slf-ui *{box-sizing:border-box;font-family:var(--slf-font)!important}
html[data-slf-design="fm2026"] .slf-panel{color:var(--slf-text)!important;background:radial-gradient(120% 140% at 0 0,rgba(43,217,124,.10),transparent 54%),linear-gradient(160deg,rgba(79,124,255,.09),transparent 62%),var(--slf-bg)!important;border:1px solid var(--slf-border)!important;border-radius:var(--slf-radius)!important;box-shadow:0 14px 34px rgba(0,0,0,.24)!important}
html[data-slf-design="fm2026"] #slf-match-parser-panel.slf-panel{width:100%!important;max-width:none!important;margin:0 0 16px!important;padding:12px 14px!important;display:flex!important;align-items:center!important;align-content:flex-start!important;gap:8px!important;font-size:12.5px!important}
html[data-slf-design="fm2026"] #slf-match-parser-panel>div:first-child,html[data-slf-design="fm2026"] #slf-tactics-dropdown>div:first-child{color:var(--slf-text)!important;font-weight:700!important}
html[data-slf-design="fm2026"] #slf-parser-status,html[data-slf-design="fm2026"] #slf-parser-log{color:var(--slf-accent2)!important}
html[data-slf-design="fm2026"] #slf-parser-recommendation{width:100%!important;max-width:none!important;color:var(--slf-text)!important}
html[data-slf-design="fm2026"] #slf-parser-recommendation>div,html[data-slf-design="fm2026"] [data-slf-rec-priority]{color:var(--slf-text)!important;background:var(--slf-bg2)!important;border:1px solid var(--slf-border)!important;border-radius:10px!important}
html[data-slf-design="fm2026"] #slf-match-parser-panel button,html[data-slf-design="fm2026"] #slf-tactics-dropdown button,html[data-slf-design="fm2026"] #slf-save-dialog button{min-height:30px!important;padding:6px 10px!important;color:var(--slf-text)!important;background:var(--slf-bg3)!important;border:1px solid var(--slf-border)!important;border-radius:8px!important;font:600 12px var(--slf-font)!important;cursor:pointer!important}
html[data-slf-design="fm2026"] #slf-match-parser-panel button:hover,html[data-slf-design="fm2026"] #slf-tactics-dropdown button:hover,html[data-slf-design="fm2026"] #slf-save-dialog button:hover{color:var(--slf-accent2)!important;border-color:var(--slf-accent)!important;background:rgba(43,217,124,.10)!important}
html[data-slf-design="fm2026"] #slf-manual-recommendation-btn{color:#07130c!important;background:linear-gradient(180deg,var(--slf-accent2),#1fb863)!important;border-color:transparent!important}
html[data-slf-design="fm2026"] #slf-tactics-dropdown.slf-panel{width:100%!important;max-width:100%!important;margin:4px 0 12px!important;padding:10px 12px!important;color:var(--slf-text)!important;font-size:12.5px!important}
html[data-slf-design="fm2026"] #slf-tactics-dropdown select,html[data-slf-design="fm2026"] #slf-foreign-match-target,html[data-slf-design="fm2026"] #slf-save-dialog select,html[data-slf-design="fm2026"] #slf-save-dialog input{min-height:32px!important;padding:6px 9px!important;color:var(--slf-text)!important;background:var(--slf-bg2)!important;border:1px solid var(--slf-border)!important;border-radius:8px!important;font:500 12px var(--slf-font)!important;outline:none!important}
html[data-slf-design="fm2026"] #slf-tactics-dropdown select:focus,html[data-slf-design="fm2026"] #slf-foreign-match-target:focus,html[data-slf-design="fm2026"] #slf-save-dialog select:focus,html[data-slf-design="fm2026"] #slf-save-dialog input:focus{border-color:var(--slf-accent)!important;box-shadow:0 0 0 3px rgba(43,217,124,.14)!important}
html[data-slf-design="fm2026"] #slf-tactics-scheme-label{color:#eaac41!important}
html[data-slf-design="fm2026"] #slf-save-dialog{background:rgba(5,7,13,.78)!important;backdrop-filter:blur(5px)}
html[data-slf-design="fm2026"] #slf-save-dialog>div{min-width:min(420px,calc(100vw - 32px))!important;padding:20px!important;color:var(--slf-text)!important;background:var(--slf-bg)!important;border:1px solid var(--slf-border)!important;border-radius:var(--slf-radius)!important;box-shadow:0 24px 64px rgba(0,0,0,.55)!important;font-family:var(--slf-font)!important}
html[data-slf-design="fm2026"] #slf-save-dialog h3{margin:0 0 14px!important;color:var(--slf-text)!important;font-weight:500!important}
html[data-slf-design="fm2026"] #slf-version-inline-badge{display:inline-flex;align-items:center;margin-left:7px;padding:1px 7px;color:var(--slf-accent2)!important;background:rgba(43,217,124,.10);border:1px solid rgba(43,217,124,.28);border-radius:999px;font:700 9px var(--slf-font)!important;letter-spacing:.04em;white-space:nowrap;text-shadow:none!important}
            `;
            (document.head || document.documentElement).appendChild(style);
        });
    }

    function decorate(node, type) {
        if (!node) return false;
        safe(() => {
            node.classList.add('slf-ui');
            if (type === 'panel') node.classList.add('slf-panel');
            node.querySelectorAll('button').forEach(item => item.classList.add('slf-button'));
            node.querySelectorAll('select,input').forEach(item => item.classList.add('slf-control'));
        });
        return true;
    }

    function adaptExisting() {
        syncDesignMarker();
        ensureStyles();

        const panel = safe(() => document.getElementById('slf-match-parser-panel'));
        if (panel) {
            decorate(panel, 'panel');
            const mode = isFm2026() ? 'fm2026-content' : 'legacy';
            if (panel.dataset.slfMount !== mode) panel.dataset.slfMount = mode;
            const root = contentRoot();
            if (isFm2026() && root && root !== panel && !root.contains(panel)) {
                root.insertBefore(panel, root.firstChild);
            }
        }

        const dropdown = safe(() => document.getElementById('slf-tactics-dropdown'));
        if (dropdown) {
            decorate(dropdown, 'panel');
            const mode = isFm2026() ? 'fm2026-tactic-root' : 'legacy';
            if (dropdown.dataset.slfMount !== mode) dropdown.dataset.slfMount = mode;
        }

        decorate(safe(() => document.getElementById('slf-save-dialog')));
    }

    function runtimeVersion() {
        return safe(() => {
            const root = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
            return String(root?.SLF?.scriptVersion || root?.SLF?.versionInfo?.version || '').trim();
        }, '');
    }

    function renderBadge() {
        adaptExisting();
        const target = badgeTarget();
        const version = runtimeVersion();
        if (!target || !version) return false;
        safe(() => document.getElementById(BADGE_ID)?.remove());
        const badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.className = 'slf-ui';
        badge.textContent = `SLF ${version}`;
        badge.title = 'SLF userscript version';
        target.appendChild(badge);
        return true;
    }

    function start() {
        const run = () => {
            adaptExisting();
            renderBadge();
            let attempts = 0;
            const timer = window.setInterval(() => {
                attempts += 1;
                adaptExisting();
                if (!document.getElementById(BADGE_ID)) renderBadge();
                if (attempts >= 120) window.clearInterval(timer);
            }, 250);
        };

        if (typeof document === 'undefined') return;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    safe(start);
})();
