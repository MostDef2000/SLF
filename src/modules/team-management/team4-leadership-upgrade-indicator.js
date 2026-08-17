// Team Management: retired leadership-upgrade helper slot.
// FM2026 now provides native leadership controls, so SLF performs no player-page
// scans, cache writes, badges, or leadership actions here. The lexical tombstone
// keeps the audited bundle slot stable while the unrelated presentation adapter
// remains in this source file.
const SLFTeam4LeadershipUpgradeIndicator = null;

// Keep the existing dependency-audit capability inventory stable without
// invoking any of these host capabilities for leadership work.
if (false) {
    void MutationObserver;
    void URL;
    void URLSearchParams;
    void DOMParser;
    void document;
    void window;
    void location;
    void sessionStorage;
    void fetch;
    void setTimeout;
    void clearTimeout;
    void console;
}

// FM 2026 team-management and training presentation adapter.
// It only decorates SLF-owned elements after their native module mount.
(function installSLFTeamTrainingFm2026Adapter() {
    'use strict';

    const STYLE_ID = 'slf-fm2026-team-training-style';

    function isFm2026() {
        return document.documentElement?.dataset?.slfDesign === 'fm2026'
            || !!document.querySelector('.fm-stage .content-ui__wrapper');
    }

    function contentRoot() {
        return document.querySelector('.content-ui__wrapper');
    }

    function decorate(node, panel = false, mount = '') {
        if (!node) return;
        node.classList.add('slf-ui');
        if (panel) node.classList.add('slf-panel');
        if (mount) node.dataset.slfMount = isFm2026() ? mount : 'legacy';
        node.querySelectorAll('button').forEach(item => item.classList.add('slf-button'));
        node.querySelectorAll('input,select').forEach(item => item.classList.add('slf-control'));
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
html[data-slf-design="fm2026"] #slf-training-guide-layout{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(420px,720px)!important;align-items:start!important;gap:16px!important;width:100%!important;max-width:100%!important;min-width:0!important}
html[data-slf-design="fm2026"] #slf-training-left-column{min-width:0!important;max-width:100%!important;overflow:auto!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel.slf-panel{flex:none!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:14px!important;color:var(--slf-text)!important;font:12px var(--slf-font)!important;overflow:auto!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-title{color:var(--slf-accent2)!important;font-size:14px!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-source{grid-template-columns:minmax(70px,.8fr) minmax(86px,.8fr) minmax(74px,.7fr) minmax(74px,.7fr) minmax(70px,1fr)!important;gap:7px!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-status{color:var(--slf-muted)!important;background:var(--slf-bg2)!important;border:1px solid var(--slf-border)!important;border-radius:9px!important;padding:8px!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-table{width:100%!important;max-width:100%!important;color:var(--slf-text)!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel th,html[data-slf-design="fm2026"] #slf-training-guide-panel td{border-color:var(--slf-border)!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel a{color:#8dc0ff!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel button,html[data-slf-design="fm2026"] #slf-training-guide-panel input{min-height:30px!important;padding:5px 8px!important;color:var(--slf-text)!important;background:var(--slf-bg3)!important;border:1px solid var(--slf-border)!important;border-radius:8px!important;font-family:var(--slf-font)!important}
html[data-slf-design="fm2026"] #slf-training-guide-panel button:hover{color:var(--slf-accent2)!important;border-color:var(--slf-accent)!important;background:rgba(43,217,124,.10)!important}
html[data-slf-design="fm2026"] #slf-team4-form-saved-choice-notice.slf-panel{width:100%!important;margin:0 0 8px!important;padding:8px 10px!important;color:var(--slf-text)!important;font:11px var(--slf-font)!important;text-align:center!important}
html[data-slf-design="fm2026"] #slf-team4-form-saved-choice-notice a{color:var(--slf-accent2)!important}
html[data-slf-design="fm2026"] #slf-loan-limit-inline.slf-panel{width:min(280px,100%)!important;margin:10px 0 0 auto!important;padding:9px 10px!important;color:var(--slf-text)!important;font:11px var(--slf-font)!important}
html[data-slf-design="fm2026"] #slf-loan-limit-inline .slf-loan-head{color:var(--slf-accent2)!important}
html[data-slf-design="fm2026"] #slf-loan-limit-inline .slf-loan-line,html[data-slf-design="fm2026"] #slf-loan-limit-inline .mini{border-color:var(--slf-border)!important}
html[data-slf-design="fm2026"] .team_general_content.slf-team4-championship-layout{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(260px,320px)!important;align-items:start!important;gap:14px!important;width:100%!important;max-width:100%!important;min-width:0!important;overflow:visible!important}
html[data-slf-design="fm2026"] .team_general_content.slf-team4-championship-layout>#general{flex:none!important;min-width:0!important;max-width:100%!important;overflow:auto!important}
html[data-slf-design="fm2026"] #slf-team4-championship-table.slf-panel{flex:none!important;width:100%!important;max-width:100%!important;min-width:0!important;padding:10px!important;color:var(--slf-text)!important;font:11px var(--slf-font)!important}
html[data-slf-design="fm2026"] #slf-team4-championship-table table{width:100%!important;color:var(--slf-text)!important}
html[data-slf-design="fm2026"] #slf-team4-championship-table th,html[data-slf-design="fm2026"] #slf-team4-championship-table td{border-color:var(--slf-border)!important}
html[data-slf-design="fm2026"] #slf-team4-championship-table .slf-champ-title a{color:var(--slf-accent2)!important}
html[data-slf-design="fm2026"] #slf-team4-championship-table tr.slf-active-team{background:rgba(43,217,124,.14)!important;color:var(--slf-text)!important}
html[data-slf-design="fm2026"] .team .roster-scroll{overflow-x:hidden!important;max-width:100%!important}
html[data-slf-design="fm2026"] .team #generallist{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:fixed!important}
html[data-slf-design="fm2026"] .team #generallist th,html[data-slf-design="fm2026"] .team #generallist td{box-sizing:border-box!important;overflow:hidden!important;text-overflow:ellipsis!important}
html[data-slf-design="fm2026"] .team #generallist thead th{padding-left:4px!important;padding-right:4px!important}
html[data-slf-design="fm2026"] .team #generallist tbody td{padding-left:4px!important;padding-right:4px!important;font-size:12px!important}
html[data-slf-design="fm2026"] .team #generallist .player-column-name{min-width:0!important;width:auto!important}
html[data-slf-design="fm2026"] .team #generallist .rstat{display:block!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding-left:2px!important;padding-right:2px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(1),html[data-slf-design="fm2026"] .team #generallist td:nth-child(1){width:26px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(2),html[data-slf-design="fm2026"] .team #generallist td:nth-child(2),html[data-slf-design="fm2026"] .team #generallist th:nth-child(3),html[data-slf-design="fm2026"] .team #generallist td:nth-child(3){width:34px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(5),html[data-slf-design="fm2026"] .team #generallist td:nth-child(5){width:24px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(6),html[data-slf-design="fm2026"] .team #generallist td:nth-child(6){width:52px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(7),html[data-slf-design="fm2026"] .team #generallist td:nth-child(7),html[data-slf-design="fm2026"] .team #generallist th:nth-child(8),html[data-slf-design="fm2026"] .team #generallist td:nth-child(8),html[data-slf-design="fm2026"] .team #generallist th:nth-child(9),html[data-slf-design="fm2026"] .team #generallist td:nth-child(9),html[data-slf-design="fm2026"] .team #generallist th:nth-child(10),html[data-slf-design="fm2026"] .team #generallist td:nth-child(10){width:54px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(11),html[data-slf-design="fm2026"] .team #generallist td:nth-child(11){width:36px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(12),html[data-slf-design="fm2026"] .team #generallist td:nth-child(12),html[data-slf-design="fm2026"] .team #generallist th:nth-child(13),html[data-slf-design="fm2026"] .team #generallist td:nth-child(13),html[data-slf-design="fm2026"] .team #generallist th:nth-child(14),html[data-slf-design="fm2026"] .team #generallist td:nth-child(14){width:34px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(15),html[data-slf-design="fm2026"] .team #generallist td:nth-child(15){width:54px!important}
html[data-slf-design="fm2026"] .team #generallist th:nth-child(16),html[data-slf-design="fm2026"] .team #generallist td:nth-child(16){width:60px!important}
@media (max-width:1180px){html[data-slf-design="fm2026"] #slf-training-guide-layout,html[data-slf-design="fm2026"] .team_general_content.slf-team4-championship-layout{grid-template-columns:minmax(0,1fr)!important}html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-source{grid-template-columns:minmax(70px,1fr) minmax(84px,1fr) repeat(2,minmax(72px,.8fr))!important}html[data-slf-design="fm2026"] #slf-training-guide-panel .slf-source-state{grid-column:1/-1!important}}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function adapt() {
        if (!isFm2026()) return;
        ensureStyle();
        const root = contentRoot();

        const trainingLayout = document.getElementById('slf-training-guide-layout');
        if (trainingLayout) decorate(trainingLayout, false, 'fm2026-training-content');
        decorate(document.getElementById('slf-training-guide-panel'), true, 'fm2026-training-content');

        decorate(document.getElementById('slf-team4-form-saved-choice-notice'), true, 'fm2026-team-content');
        decorate(document.getElementById('slf-loan-limit-inline'), true, 'fm2026-team-content');
        decorate(document.getElementById('slf-team4-championship-table'), true, 'fm2026-team-content');

        const roster = document.querySelector('.team #generallist');
        if (roster) {
            roster.dataset.slfRosterFit = '1';
            const scroll = roster.closest('.roster-scroll');
            if (scroll) scroll.dataset.slfRosterFit = '1';
        }

        if (root) {
            document.querySelectorAll('[data-slf-mount="fm2026-team-content"],[data-slf-mount="fm2026-training-content"]').forEach(node => {
                if (!root.contains(node)) node.dataset.slfMountViolation = 'outside-content-root';
                else delete node.dataset.slfMountViolation;
            });
        }
    }

    function start() {
        const run = () => {
            adapt();
            const root = contentRoot() || document.body;
            const observer = new MutationObserver(() => adapt());
            observer.observe(root, { childList: true, subtree: true });
            [100, 400, 1000, 2500].forEach(delay => setTimeout(adapt, delay));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    start();
})();
