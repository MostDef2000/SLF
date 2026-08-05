// Transfer history visible-analysis cleanup
// =========================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    const WORKSPACE_ID = 'slf-transfer-workspace';
    const STYLE_ID = 'slf-transfer-workspace-style';
    let adaptTimer = 0;

    function isFm2026() {
        return document.documentElement?.dataset?.slfDesign === 'fm2026' ||
            !!document.querySelector('.fm-topbar, .fm-stage, .fmx');
    }

    function ensureStyle() {
        if (!isFm2026() || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
html[data-slf-design="fm2026"] #${WORKSPACE_ID}{--tw-a:var(--slf-accent,#2bd97c);--tw-a2:var(--slf-accent2,#43f58c);--tw-bg:var(--slf-bg,#171b29);--tw-bg2:var(--slf-bg2,#1c2132);--tw-border:var(--slf-border,#38415f);--tw-text:var(--slf-text,#eef1f8);--tw-muted:var(--slf-muted,#8b93ab);position:relative;width:100%;max-width:100%;margin:0 0 14px;overflow:hidden;box-sizing:border-box;color:var(--tw-text);background:linear-gradient(90deg,rgba(43,217,124,.08),transparent 28%),linear-gradient(180deg,rgba(28,33,50,.98),rgba(23,27,41,.98));border:1px solid var(--tw-border);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--tw-a2),rgba(79,124,255,.72));pointer-events:none}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-candidate-panel,html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-analyzer-toolbar{width:100%!important;max-width:100%!important;margin:0!important;padding:10px 14px!important;box-sizing:border-box!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-analyzer-toolbar{border-top:1px solid rgba(139,147,171,.2)!important}
html[data-slf-design="fm2026"] .slf-transfer-scanner-head,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar.slf-transfer-workspace-analyzer{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:6px!important}
html[data-slf-design="fm2026"] .slf-transfer-workspace-title{display:inline-flex!important;align-items:center;gap:7px;margin:0 6px 0 0!important;color:var(--slf-accent2,#43f58c)!important;font-size:12.5px!important;font-weight:750!important;line-height:1.2!important;white-space:nowrap}
html[data-slf-design="fm2026"] .slf-transfer-workspace-title::before{content:"";width:6px;height:6px;flex:0 0 auto;border-radius:50%;background:var(--slf-accent,#2bd97c);box-shadow:0 0 9px rgba(43,217,124,.65)}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel label{display:inline-flex!important;align-items:center!important;gap:6px!important;margin:0!important;color:var(--slf-muted,#8b93ab)!important;font-size:10.5px!important;white-space:nowrap}
html[data-slf-design="fm2026"] #slf-candidate-max-price{width:96px!important;min-height:28px!important;height:28px!important;margin:0!important;padding:4px 8px!important;font-size:11.5px!important}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel button,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar button{min-height:28px!important;height:28px!important;padding:4px 9px!important;border-radius:8px!important;font-size:11.5px!important;line-height:1!important;white-space:nowrap}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel button:disabled,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar button:disabled{opacity:.42!important;cursor:not-allowed!important}
html[data-slf-design="fm2026"] #slf-candidate-scan,html[data-slf-design="fm2026"] #slf-transfer-analyze-visible{color:#07130c!important;background:linear-gradient(180deg,var(--slf-accent2,#43f58c),#1fb863)!important;border-color:transparent!important}
html[data-slf-design="fm2026"] #slf-candidate-stop{color:#ff9aa5!important}
html[data-slf-design="fm2026"] .slf-transfer-scanner-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;min-height:18px;margin-top:5px;color:var(--slf-muted,#8b93ab);font-size:10.5px}
html[data-slf-design="fm2026"] .slf-transfer-scanner-meta>*{margin:0!important;color:inherit!important;font-size:inherit!important}
html[data-slf-design="fm2026"] #slf-candidate-status:not(:empty)::before{content:"Статус · ";opacity:.72}html[data-slf-design="fm2026"] #slf-candidate-progress:not(:empty)::before{content:"Прогресс · ";opacity:.72}
html[data-slf-design="fm2026"] #slf-candidate-results:empty{display:none!important}html[data-slf-design="fm2026"] #slf-candidate-results{margin-top:8px!important}
html[data-slf-design="fm2026"] .slf-transfer-workspace-mode{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;color:var(--slf-muted,#8b93ab)!important;background:rgba(139,147,171,.08);border:1px solid rgba(139,147,171,.16);border-radius:999px;font-size:9.5px!important;white-space:nowrap}
html[data-slf-design="fm2026"] .slf-transfer-sort-button{background:rgba(79,124,255,.09)!important;border-color:rgba(79,124,255,.24)!important}html[data-slf-design="fm2026"] .slf-transfer-utility-button{color:var(--slf-muted,#8b93ab)!important;background:transparent!important;border-color:rgba(139,147,171,.2)!important}
html[data-slf-design="fm2026"] #slf-transfer-status{flex:1 1 260px;min-width:180px;margin-left:auto;color:var(--slf-muted,#8b93ab)!important;font-size:10.5px!important;line-height:1.3;text-align:right}
html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar.slf-transfer-workspace-solo{width:100%!important;margin:0 0 14px!important;padding:10px 14px!important;background:linear-gradient(180deg,rgba(28,33,50,.98),rgba(23,27,41,.98))!important;border:1px solid var(--slf-border,#38415f)!important;border-radius:14px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-row.slf-transfer-forecast-layout{grid-template-columns:minmax(0,1fr) minmax(360px,410px)!important;gap:12px!important;margin-bottom:14px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-row>.fmx-info-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin:0!important;min-width:0!important;max-width:none!important;flex:none!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-row>.fmx-info-grid>.fmx-card{min-width:0!important;margin:0!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast{width:auto!important;min-width:0!important;max-width:410px!important;margin:0!important;padding:10px 11px!important;background:linear-gradient(135deg,rgba(43,217,124,.09),transparent 42%),var(--slf-bg,#171b29)!important;border:1px solid var(--slf-border,#38415f)!important;border-radius:14px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:first-child{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:0 0 7px!important;color:var(--slf-accent2,#43f58c)!important;font-size:12.5px!important;line-height:1.2!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:first-child::after{content:"VPS History";padding:2px 7px;color:var(--slf-muted,#8b93ab);background:rgba(139,147,171,.08);border:1px solid rgba(139,147,171,.16);border-radius:999px;font-size:9px;font-weight:600}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:nth-child(2){grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:5px!important;margin-bottom:5px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:nth-child(3){grid-template-columns:62px 62px minmax(0,1fr)!important;gap:5px!important;margin-bottom:6px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast label{color:var(--slf-muted,#8b93ab)!important;font-size:9.5px!important;line-height:1.15!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast input,html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast select,html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast button{min-height:28px!important;height:28px!important;margin-top:2px!important;padding:4px 7px!important;font-size:11.5px!important;border-radius:8px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:nth-child(4){grid-template-columns:74px repeat(2,minmax(0,1fr))!important;gap:5px!important}html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast>div:nth-child(4)>div{min-height:46px;padding:5px 7px!important;border-radius:9px!important}
html[data-slf-design="fm2026"] #slf-purchase-forecast-count,html[data-slf-design="fm2026"] #slf-purchase-forecast-median,html[data-slf-design="fm2026"] #slf-purchase-forecast-p75{font-size:15px!important}html[data-slf-design="fm2026"] #slf-purchase-forecast-note{margin-top:5px!important;font-size:9.5px!important}
@media(max-width:1220px){html[data-slf-design="fm2026"] #slf-purchase-forecast-row.slf-transfer-forecast-layout{grid-template-columns:minmax(0,1fr)!important}html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast{width:100%!important;max-width:none!important}html[data-slf-design="fm2026"] #slf-transfer-status{flex-basis:100%;text-align:left}}
@media(max-width:860px){html[data-slf-design="fm2026"] #slf-purchase-forecast-row>.fmx-info-grid{grid-template-columns:minmax(0,1fr)!important}html[data-slf-design="fm2026"] .slf-transfer-workspace-title{width:100%}}
@media(prefers-reduced-motion:reduce){html[data-slf-design="fm2026"] #${WORKSPACE_ID},html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast{transition:none!important;animation:none!important}}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function adaptCandidate(panel) {
        if (!panel) return;
        panel.firstElementChild?.classList.add('slf-transfer-scanner-head');
        panel.querySelector('b')?.classList.add('slf-transfer-workspace-title');
        let meta = panel.querySelector(':scope > .slf-transfer-scanner-meta');
        if (!meta) {
            meta = document.createElement('div');
            meta.className = 'slf-transfer-scanner-meta';
            panel.insertBefore(meta, document.getElementById('slf-candidate-results') || null);
        }
        ['slf-candidate-status', 'slf-candidate-progress'].forEach(id => {
            const node = document.getElementById(id);
            if (node && node.parentElement !== meta) meta.appendChild(node);
        });
    }

    function adaptToolbar(toolbar) {
        if (!toolbar) return;
        toolbar.classList.add('slf-transfer-workspace-analyzer');
        toolbar.querySelector('b')?.classList.add('slf-transfer-workspace-title');
        [...toolbar.querySelectorAll('span')].find(node => node.id !== 'slf-transfer-status')?.classList.add('slf-transfer-workspace-mode');
        ['slf-transfer-sort-score','slf-transfer-sort-delta','slf-transfer-sort-min','slf-transfer-sort-talent','slf-transfer-sort-tm-desc','slf-transfer-sort-mkt-bargain','slf-transfer-sort-mkt-overpriced'].forEach(id => document.getElementById(id)?.classList.add('slf-transfer-sort-button'));
        ['slf-transfer-reset-order','slf-transfer-clear-cache'].forEach(id => document.getElementById(id)?.classList.add('slf-transfer-utility-button'));
    }

    function wrapWorkspace(candidate, toolbar) {
        if (!candidate || !toolbar) {
            toolbar?.classList.add('slf-transfer-workspace-solo');
            return;
        }
        const root = document.querySelector('.content-ui__wrapper') || candidate.parentElement;
        if (!root?.contains(candidate) || !root.contains(toolbar)) return;
        let workspace = document.getElementById(WORKSPACE_ID);
        if (!workspace) {
            const first = candidate.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING ? candidate : toolbar;
            workspace = document.createElement('section');
            workspace.id = WORKSPACE_ID;
            workspace.className = 'slf-ui slf-transfer-workspace';
            workspace.dataset.slfMount = 'fm2026-transfer-content';
            first.parentNode.insertBefore(workspace, first);
        }
        [candidate, toolbar].sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).forEach(node => {
            if (node.parentElement !== workspace) workspace.appendChild(node);
        });
        toolbar.classList.remove('slf-transfer-workspace-solo');
    }

    function adapt() {
        if (!isFm2026()) return;
        ensureStyle();
        const candidate = document.getElementById('slf-transfer-candidate-panel');
        const toolbar = document.getElementById('slf-transfer-analyzer-toolbar');
        adaptCandidate(candidate);
        adaptToolbar(toolbar);
        wrapWorkspace(candidate, toolbar);
        document.getElementById('slf-purchase-forecast-row')?.classList.add('slf-transfer-forecast-layout');
        document.getElementById('slf-purchase-forecast-panel')?.classList.add('slf-transfer-workspace-forecast');
    }

    function scheduleAdapt() {
        clearTimeout(adaptTimer);
        adaptTimer = setTimeout(adapt, 0);
    }

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarWithoutHistoryVisibleAnalysis() {
        const result = addToolbarOriginal.apply(this, arguments);
        if (this.isHistoryPage()) document.getElementById('slf-transfer-analyze-visible')?.remove();
        scheduleAdapt();
        return result;
    };
    delete TransferMarketAnalyzer.analyzeHistoryVisibleRows;

    const findForecastBoxOriginal = TransferMarketAnalyzer.findPurchaseForecastMarketBox;
    if (typeof findForecastBoxOriginal === 'function') {
        TransferMarketAnalyzer.findPurchaseForecastMarketBox = function findFm2026ForecastBox() {
            return document.querySelector('.fmx > .fmx-info-grid, .fmx-info-grid') || findForecastBoxOriginal.apply(this, arguments);
        };
    }
    const addForecastOriginal = TransferMarketAnalyzer.addPurchaseForecastPanel;
    if (typeof addForecastOriginal === 'function') {
        TransferMarketAnalyzer.addPurchaseForecastPanel = function addCompactPurchaseForecastPanel() {
            const result = addForecastOriginal.apply(this, arguments);
            scheduleAdapt();
            return result;
        };
    }

    if (!window.__slfTransferWorkspaceObserverInstalled) {
        window.__slfTransferWorkspaceObserverInstalled = true;
        const install = () => {
            const root = document.querySelector('.content-ui__wrapper') || document.body;
            if (root && window.MutationObserver) new MutationObserver(scheduleAdapt).observe(root, { childList: true, subtree: true });
            scheduleAdapt();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
        window.addEventListener('load', scheduleAdapt, { once: true });
        setTimeout(scheduleAdapt, 800);
        setTimeout(scheduleAdapt, 2200);
    }
}
