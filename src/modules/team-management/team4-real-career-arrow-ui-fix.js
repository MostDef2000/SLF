// Team Management: Team4 real-career arrow UI fix
// UI-only patch. Stable cache keys: no storage/schema version changes.

const SLFTeam4RealCareerArrowUiFix = (() => {
    const PATCH_FLAG = '__slfTeam4RealCareerArrowUiFixPatched';
    const STYLE_ID = 'slf-team4-real-career-arrow-ui-style';

    const STATUS_ICON_MAP = {
        'ЗВЕЗДА': { icon: '★', title: 'ЗВЕЗДА — элитный real-career статус' },
        'РОСТ': { icon: '↗', title: 'РОСТ — положительный real-career тренд' },
        'ПИК': { icon: '→', title: 'ПИК — около максимума real-career' },
        'ОСНОВА': { icon: '→', title: 'ОСНОВА — актуальный игрок real-career' },
        'СЫРОЙ': { icon: '·', title: 'СЫРОЙ — мало real/TM данных' },
        'РЕГРЕСС': { icon: '↘', title: 'РЕГРЕСС — отрицательный real-career тренд' },
        'СПАД': { icon: '↓', title: 'СПАД — сильный отрицательный real-career тренд' },
        'ВНЕ': { icon: '×', title: 'ВНЕ — вне активного real-career уровня' },
        '?': { icon: '-', title: 'нет real-career оценки' }
    };

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #generallist .slf-real-career-arrow {
                display:inline-block;
                min-width:18px;
                height:18px;
                line-height:18px;
                text-align:center;
                font:900 18px Arial,Verdana,sans-serif;
                background:transparent;
                border:0;
                padding:0;
                margin:0;
                cursor:pointer;
                vertical-align:middle;
                text-shadow:0 1px 0 rgba(0,0,0,.75), 0 0 2px rgba(0,0,0,.55);
            }
            #generallist .slf-real-career-arrow.good { color:var(--green,#2caa0a); }
            #generallist .slf-real-career-arrow.warn { color:#e0b23a; }
            #generallist .slf-real-career-arrow.bad { color:#ff4b4b; }
            #generallist .slf-real-career-arrow.neutral { color:#9a9a9a; }
            #generallist td.slf-player-status-cell {
                width:38px;
                min-width:38px;
                max-width:38px;
                text-align:center;
                padding-left:2px;
                padding-right:2px;
            }
            #generallist th.slf-player-status-head {
                width:38px;
                min-width:38px;
                max-width:38px;
                text-align:center;
            }
            #generallist th.slf-player-status-head .slf-status-title {
                font-size:11px;
                letter-spacing:.3px;
                color:var(--bright,yellowgreen);
                text-transform:uppercase;
            }
        `;
        document.head.appendChild(style);
    }

    function getIconInfo(code) {
        return STATUS_ICON_MAP[String(code || '?').trim().toUpperCase()] || STATUS_ICON_MAP['?'];
    }

    function buildTitle(panel, data, code, info) {
        const titleParts = [info.title || code];
        if (data?.trendInfo?.label) titleParts.push(data.trendInfo.label);
        if (data?.tmProfile?.activity?.minutesPct != null) titleParts.push(`MIN ${data.tmProfile.activity.minutesPct}%`);
        if (data?.status?.confidence) titleParts.push(`conf ${data.status.confidence}`);
        return panel.escapeAttr(titleParts.join(' · '));
    }

    function setHeaderTitle(panel) {
        const head = document.querySelector(`th.${panel?.HEAD_CLASS || 'slf-player-status-head'}`);
        const title = head?.querySelector?.('.slf-status-title');
        if (title) title.textContent = 'ТМ';
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        const originalEnsureStyle = panel.ensureStyle;
        if (typeof originalEnsureStyle === 'function') {
            panel.ensureStyle = function patchedEnsureStyle() {
                originalEnsureStyle.call(this);
                ensureStyle();
            };
        } else {
            ensureStyle();
        }

        const originalEnsureHeader = panel.ensureHeader;
        if (typeof originalEnsureHeader === 'function') {
            panel.ensureHeader = function patchedEnsureHeader() {
                originalEnsureHeader.call(this);
                setHeaderTitle(this);
            };
        }

        panel.statusMarker = function arrowStatusMarker(data) {
            const code = data?.status?.code || '?';
            const type = data?.status?.className || 'neutral';
            const playerId = data?.slfPlayerId || '';
            const info = getIconInfo(code);
            this.cacheTooltipHtml(data);
            return `<button type="button" class="slf-real-career-arrow ${this.MARKER_CLASS} ${this.escapeAttr(type)}" data-player-id="${this.escapeAttr(playerId)}" aria-label="${this.escapeAttr(code)}" title="${buildTitle(this, data, code, info)}">${this.escapeHtml(info.icon)}</button>`;
        };

        try {
            ensureStyle();
            panel.ensureHeader?.();
            setHeaderTitle(panel);
            panel.render?.(false);
        } catch (error) {
            console.warn('[SLF Team4 RealCareer UI] render refresh failed', error);
        }
        return true;
    }

    function start() {
        const run = () => {
            try {
                if (patchPanel()) return;
                const timer = setInterval(() => {
                    if (patchPanel()) clearInterval(timer);
                }, 250);
                setTimeout(() => clearInterval(timer), 10000);
            } catch (error) {
                console.error('[SLF Team4 RealCareer UI] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { STATUS_ICON_MAP, getIconInfo, start };
    window.SLFTeam4RealCareerArrowUiFix = api;
    return api;
})();

SLFTeam4RealCareerArrowUiFix.start();