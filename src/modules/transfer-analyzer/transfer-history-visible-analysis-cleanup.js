// Transfer history visible-analysis cleanup
// =========================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    const WORKSPACE_ID = 'slf-transfer-workspace';
    const STYLE_ID = 'slf-transfer-workspace-style';
    const STATUS_ID = 'slf-transfer-workspace-status';
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
html[data-slf-design="fm2026"] #${WORKSPACE_ID}{--tw-a:var(--slf-accent,#2bd97c);--tw-a2:var(--slf-accent2,#43f58c);--tw-bg:var(--slf-bg,#171b29);--tw-bg2:var(--slf-bg2,#1c2132);--tw-border:var(--slf-border,#38415f);--tw-text:var(--slf-text,#eef1f8);--tw-muted:var(--slf-muted,#8b93ab);position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);grid-template-areas:"analyzer scanner" "status status";align-items:start;width:100%;max-width:100%;margin:0 0 14px;overflow:hidden;box-sizing:border-box;color:var(--tw-text);background:linear-gradient(90deg,rgba(43,217,124,.08),transparent 28%),linear-gradient(180deg,rgba(28,33,50,.98),rgba(23,27,41,.98));border:1px solid var(--tw-border);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--tw-a2),rgba(79,124,255,.72));pointer-events:none}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-analyzer-toolbar{grid-area:analyzer;border-right:1px solid rgba(139,147,171,.18)!important}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-candidate-panel{grid-area:scanner}
html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-candidate-panel,html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-analyzer-toolbar{min-width:0;width:auto!important;max-width:none!important;margin:0!important;padding:9px 12px!important;box-sizing:border-box!important;background:transparent!important;border-top:0!important;border-bottom:0!important;border-left:0!important;border-radius:0!important;box-shadow:none!important}
html[data-slf-design="fm2026"] .slf-transfer-scanner-head,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar.slf-transfer-workspace-analyzer{display:flex!important;align-items:center!important;align-content:flex-start!important;flex-wrap:wrap!important;gap:5px!important;min-height:28px}
html[data-slf-design="fm2026"] .slf-transfer-workspace-title{display:inline-flex!important;align-items:center;gap:6px;margin:0 5px 0 0!important;color:var(--slf-accent2,#43f58c)!important;font-size:12px!important;font-weight:750!important;line-height:1.2!important;white-space:nowrap}
html[data-slf-design="fm2026"] .slf-transfer-workspace-title::before{content:"";width:6px;height:6px;flex:0 0 auto;border-radius:50%;background:var(--slf-accent,#2bd97c);box-shadow:0 0 9px rgba(43,217,124,.65)}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel label{display:inline-flex!important;align-items:center!important;gap:5px!important;margin:0!important;color:var(--slf-muted,#8b93ab)!important;font-size:10px!important;white-space:nowrap}
html[data-slf-design="fm2026"] #slf-candidate-max-price{width:84px!important;min-height:26px!important;height:26px!important;margin:0!important;padding:3px 7px!important;font-size:11px!important}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel button,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar button{min-height:26px!important;height:26px!important;padding:3px 8px!important;border-radius:8px!important;font-size:10.5px!important;line-height:1!important;white-space:nowrap}
html[data-slf-design="fm2026"] #slf-transfer-candidate-panel button:disabled,html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar button:disabled{opacity:.42!important;cursor:not-allowed!important}
html[data-slf-design="fm2026"] #slf-candidate-scan,html[data-slf-design="fm2026"] #slf-transfer-analyze-visible{color:#07130c!important;background:linear-gradient(180deg,var(--slf-accent2,#43f58c),#1fb863)!important;border-color:transparent!important}
html[data-slf-design="fm2026"] #slf-candidate-stop{color:#ff9aa5!important}
html[data-slf-design="fm2026"] .slf-transfer-ranking-tabs{display:inline-flex!important;align-items:center!important;gap:4px!important;flex-wrap:wrap!important;margin:0!important;padding:0!important}
html[data-slf-design="fm2026"] .slf-transfer-ranking-tabs button{min-height:24px!important;height:24px!important;padding:3px 7px!important;font-size:9.5px!important}
html[data-slf-design="fm2026"] #slf-candidate-results{grid-column:1/-1;margin-top:7px!important;max-width:100%;overflow:auto}
html[data-slf-design="fm2026"] #slf-candidate-results.slf-transfer-results-idle{display:none!important}
html[data-slf-design="fm2026"] .slf-transfer-workspace-mode{display:inline-flex;align-items:center;min-height:19px;padding:2px 6px;color:var(--slf-muted,#8b93ab)!important;background:rgba(139,147,171,.08);border:1px solid rgba(139,147,171,.16);border-radius:999px;font-size:9px!important;white-space:nowrap}
html[data-slf-design="fm2026"] .slf-transfer-sort-button{background:rgba(79,124,255,.09)!important;border-color:rgba(79,124,255,.24)!important}html[data-slf-design="fm2026"] .slf-transfer-utility-button{color:var(--slf-muted,#8b93ab)!important;background:transparent!important;border-color:rgba(139,147,171,.2)!important}
html[data-slf-design="fm2026"] #${STATUS_ID}{grid-area:status;display:flex;align-items:center;gap:6px 13px;flex-wrap:wrap;min-width:0;padding:5px 12px 6px;border-top:1px solid rgba(139,147,171,.16);color:var(--slf-muted,#8b93ab);font-size:9.5px;line-height:1.25}
html[data-slf-design="fm2026"] #${STATUS_ID}>*{min-width:0;margin:0!important;color:inherit!important;font-size:inherit!important;text-align:left!important;white-space:normal}
html[data-slf-design="fm2026"] #${STATUS_ID}>*+*{padding-left:12px;border-left:1px solid rgba(139,147,171,.16)}
html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar.slf-transfer-workspace-solo{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:6px!important;width:100%!important;margin:0 0 14px!important;padding:10px 14px!important;background:linear-gradient(180deg,rgba(28,33,50,.98),rgba(23,27,41,.98))!important;border:1px solid var(--slf-border,#38415f)!important;border-radius:14px!important}
html[data-slf-design="fm2026"] #slf-transfer-analyzer-toolbar.slf-transfer-workspace-solo #slf-transfer-status{flex:1 1 260px;min-width:180px;margin-left:auto!important;color:var(--slf-muted,#8b93ab)!important;font-size:10.5px!important;text-align:right!important}
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
@media(max-width:1220px){html[data-slf-design="fm2026"] #slf-purchase-forecast-row.slf-transfer-forecast-layout{grid-template-columns:minmax(0,1fr)!important}html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast{width:100%!important;max-width:none!important}}
@media(max-width:900px){html[data-slf-design="fm2026"] #${WORKSPACE_ID}{grid-template-columns:minmax(0,1fr);grid-template-areas:"analyzer" "scanner" "status"}html[data-slf-design="fm2026"] #${WORKSPACE_ID}>#slf-transfer-analyzer-toolbar{border-right:0!important;border-bottom:1px solid rgba(139,147,171,.16)!important}html[data-slf-design="fm2026"] #slf-purchase-forecast-row>.fmx-info-grid{grid-template-columns:minmax(0,1fr)!important}html[data-slf-design="fm2026"] .slf-transfer-workspace-title{width:auto}}
@media(prefers-reduced-motion:reduce){html[data-slf-design="fm2026"] #${WORKSPACE_ID},html[data-slf-design="fm2026"] #slf-purchase-forecast-panel.slf-transfer-workspace-forecast{transition:none!important;animation:none!important}}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function adaptCandidate(panel) {
        if (!panel) return;
        const head = panel.firstElementChild;
        head?.classList.add('slf-transfer-scanner-head');
        panel.querySelector('b')?.classList.add('slf-transfer-workspace-title');

        const results = document.getElementById('slf-candidate-results');
        if (!results || !head) return;
        const rankingTabs = [...results.children].find(node => node.querySelector?.('[data-slf-ranking]'));
        if (rankingTabs) {
            [...head.querySelectorAll(':scope > .slf-transfer-ranking-tabs')].forEach(node => node.remove());
            rankingTabs.classList.add('slf-transfer-ranking-tabs');
            head.appendChild(rankingTabs);
        }
        const hasRankedTable = !!results.querySelector('[style*="position:sticky"]');
        results.classList.toggle('slf-transfer-results-idle', !hasRankedTable);
    }

    function adaptToolbar(toolbar) {
        if (!toolbar) return;
        toolbar.classList.add('slf-transfer-workspace-analyzer');
        toolbar.querySelector('b')?.classList.add('slf-transfer-workspace-title');
        [...toolbar.querySelectorAll('span')].find(node => node.id !== 'slf-transfer-status')?.classList.add('slf-transfer-workspace-mode');
        ['slf-transfer-sort-score','slf-transfer-sort-delta','slf-transfer-sort-min','slf-transfer-sort-talent','slf-transfer-sort-tm-desc','slf-transfer-sort-mkt-bargain','slf-transfer-sort-mkt-overpriced'].forEach(id => document.getElementById(id)?.classList.add('slf-transfer-sort-button'));
        ['slf-transfer-reset-order','slf-transfer-clear-cache'].forEach(id => document.getElementById(id)?.classList.add('slf-transfer-utility-button'));
    }

    function ensureWorkspaceStatus(workspace) {
        let status = document.getElementById(STATUS_ID);
        if (!status) {
            status = document.createElement('div');
            status.id = STATUS_ID;
            status.className = 'slf-transfer-workspace-status';
        }
        ['slf-candidate-status', 'slf-candidate-progress', 'slf-transfer-status'].forEach(id => {
            const node = document.getElementById(id);
            if (!node) return;
            node.classList.add('slf-transfer-status-item');
            if (node.parentElement !== status) status.appendChild(node);
        });
        if (status.parentElement !== workspace) workspace.appendChild(status);
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
        if (toolbar.parentElement !== workspace) workspace.appendChild(toolbar);
        if (candidate.parentElement !== workspace) workspace.appendChild(candidate);
        ensureWorkspaceStatus(workspace);
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
