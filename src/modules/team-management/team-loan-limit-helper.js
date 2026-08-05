// 14.8 Team loan limit helper
// ============================================================

const LoanLimitPanel = {
    MODULE_ID: 'slf-loan-limit-inline',
    STYLE_ID: 'slf-loan-limit-inline-style',
    LIMIT_TOTAL: 10,
    LIMIT_OVER_23: 5,
    mounted: false,

    isPage() {
        return location.pathname.includes('/team4.php');
    },

    norm(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    },

    isVisible(row) {
        if (!row) return false;
        const style = getComputedStyle(row);
        return style.display !== 'none' && style.visibility !== 'hidden';
    },

    isLoanTabActive() {
        const activeTab = document.querySelector('.tpanel-a[data-tp="-1"]');
        if (activeTab && /аренд/i.test(activeTab.textContent || '')) return true;

        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .some(row => this.isVisible(row));
    },

    getAgeColumnIndex() {
        const headers = [...document.querySelectorAll('#generallist thead th')];
        const index = headers.findIndex(th => this.norm(th.textContent).includes('воз'));
        return index >= 0 ? index : 10;
    },

    parseAge(row, ageColumnIndex) {
        const cell = row.children[ageColumnIndex];
        const match = String(cell?.textContent || '').match(/\d{1,2}/);
        return match ? Number(match[0]) : null;
    },

    getLoanRows() {
        if (!this.isLoanTabActive()) return [];

        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .filter(row => this.isVisible(row));
    },

    readLoanState() {
        const ageColumnIndex = this.getAgeColumnIndex();
        const rows = this.getLoanRows();

        const players = rows.map(row => {
            const age = this.parseAge(row, ageColumnIndex);
            const name =
                row.querySelector('a[href*="player.php"]')?.textContent?.replace(/\s+/g, ' ').trim() ||
                row.id ||
                'unknown';

            return { row, age, name };
        });

        const total = players.length;
        const over23 = players.filter(player => Number.isFinite(player.age) && player.age >= 23).length;
        const leftTotal = Math.max(0, this.LIMIT_TOTAL - total);
        const leftOver23 = Math.max(0, this.LIMIT_OVER_23 - over23);
        const canOver23 = Math.min(leftTotal, leftOver23);

        return {
            total,
            over23,
            leftTotal,
            leftOver23,
            canOver23,
            totalFull: total >= this.LIMIT_TOTAL,
            over23Full: over23 >= this.LIMIT_OVER_23,
            totalExceeded: total > this.LIMIT_TOTAL,
            over23Exceeded: over23 > this.LIMIT_OVER_23,
            players
        };
    },

    ensureStyle() {
        if (document.getElementById(this.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            #${this.MODULE_ID} {
                width:245px;
                margin:7px 0 0 auto;
                padding:7px 8px;
                background:#202020;
                border:1px solid #4d4d4d;
                border-radius:5px;
                color:#ddd;
                font:11px Verdana,Arial,sans-serif;
                line-height:1.35;
                box-sizing:border-box;
            }
            #${this.MODULE_ID} .slf-loan-head {
                color:#9cff57;
                font-weight:700;
                margin-bottom:4px;
            }
            #${this.MODULE_ID} .slf-loan-line {
                display:flex;
                justify-content:space-between;
                gap:8px;
                padding:2px 0;
                border-top:1px solid #333;
            }
            #${this.MODULE_ID} .ok { color:#7dff7d; font-weight:700; }
            #${this.MODULE_ID} .warn { color:#ffd45a; font-weight:700; }
            #${this.MODULE_ID} .bad { color:#ff7777; font-weight:700; }
            #${this.MODULE_ID} .mini {
                margin-top:4px;
                padding-top:4px;
                border-top:1px solid #333;
                color:#aaa;
                font-size:10px;
            }
        `;
        document.head.appendChild(style);
    },

    ensureBox() {
        this.ensureStyle();

        let box = document.getElementById(this.MODULE_ID);
        if (box) return box;

        const table = document.querySelector('#generallist');
        if (!table) return null;

        box = document.createElement('div');
        box.id = this.MODULE_ID;
        table.insertAdjacentElement('afterend', box);
        return box;
    },

    render() {
        if (!this.isPage()) return;

        const box = this.ensureBox();
        if (!box) return;

        if (!this.isLoanTabActive()) {
            box.style.display = 'none';
            return;
        }

        const state = this.readLoanState();
        let statusClass = 'ok';
        let statusText = `Можно ещё: ${state.leftTotal} всего · ${state.canOver23} 23+`;

        if (state.totalExceeded || state.over23Exceeded) {
            statusClass = 'bad';
            statusText = 'Лимит превышен';
        } else if (state.totalFull) {
            statusClass = 'bad';
            statusText = 'Общий лимит заполнен';
        } else if (state.over23Full) {
            statusClass = 'warn';
            statusText = `Можно ещё: ${state.leftTotal}, только ≤22`;
        }

        box.innerHTML = `
            <div class="slf-loan-head">Аренды</div>
            <div class="slf-loan-line">
                <span>Всего</span>
                <b>${state.total}/${this.LIMIT_TOTAL}</b>
            </div>
            <div class="slf-loan-line">
                <span>23+</span>
                <b>${state.over23}/${this.LIMIT_OVER_23}</b>
            </div>
            <div class="mini ${statusClass}">${statusText}</div>
        `;
        box.style.display = 'block';
    },

    bindTabs() {
        if (this.mounted) return;
        this.mounted = true;

        document.addEventListener('click', event => {
            const tab = event.target.closest('.tpanel-a, .tpanel-b');
            if (!tab) return;
            setTimeout(() => this.render(), 90);
        }, true);
    },

    mount() {
        if (!this.isPage()) return;
        this.bindTabs();
        this.render();
    }
};

(function installTeam4TacticHeaderSelector() {
    const params = new URLSearchParams(location.search || '');
    const isTeam4TacticPage = /\/team4\.php$/i.test(location.pathname || '')
        && params.get('action') === 'tactic';
    if (!isTeam4TacticPage || typeof UI === 'undefined' || !UI?.addDropdown) return;
    if (UI.__team4TacticHeaderSelectorPatched) return;

    const STYLE_ID = 'slf-team4-tactic-header-selector-style';

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector {
                flex: 1 1 520px !important;
                width: auto !important;
                min-width: 360px !important;
                max-width: 720px !important;
                align-self: center !important;
                margin: 0 12px !important;
                padding: 8px 10px !important;
                display: grid !important;
                grid-template-columns: auto minmax(240px, 1fr) !important;
                grid-template-areas: "title controls" "scheme scheme" !important;
                align-items: center !important;
                gap: 4px 10px !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:first-child {
                grid-area: title !important;
                margin: 0 !important;
                color: var(--slf-muted, #8b93ab) !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                letter-spacing: .08em !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
            }
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:nth-child(2) {
                grid-area: controls !important;
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
                flex-wrap: nowrap !important;
                min-width: 0 !important;
            }
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector select {
                flex: 1 1 auto !important;
                width: auto !important;
                min-width: 0 !important;
                max-width: 100% !important;
            }
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector button {
                flex: 0 0 30px !important;
                width: 30px !important;
                height: 30px !important;
                min-width: 30px !important;
                min-height: 30px !important;
                padding: 0 !important;
                line-height: 1 !important;
            }
            .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector #slf-tactics-scheme-label {
                grid-area: scheme !important;
                width: 100% !important;
                min-width: 0 !important;
                margin: 0 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
            }
            @media (max-width: 1300px) {
                .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector {
                    grid-template-columns: minmax(0, 1fr) !important;
                    grid-template-areas: "controls" "scheme" !important;
                    min-width: 330px !important;
                    margin-left: auto !important;
                    margin-right: 8px !important;
                }
                .team > .team-head > #slf-tactics-dropdown.slf-team4-tactic-header-selector > div:first-child {
                    display: none !important;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function moveIntoTeamHeader(container) {
        const header = document.querySelector('.team > .team-head');
        if (!header || !container) return false;
        ensureStyle();
        container.classList.add('slf-ui', 'slf-panel', 'slf-team4-tactic-header-selector');
        container.dataset.slfMount = 'fm2026-team-tactic-header';
        container.dataset.slfTeam4TacticHeader = '1';
        const matches = header.querySelector(':scope > .team-head__matches');
        if (matches) header.insertBefore(container, matches);
        else header.appendChild(container);
        return true;
    }

    const originalAddDropdown = UI.addDropdown.bind(UI);
    UI.addDropdown = async function addTeam4HeaderTacticDropdown() {
        const existing = document.getElementById('slf-tactics-dropdown');
        if (existing) {
            moveIntoTeamHeader(existing);
            return existing;
        }

        const tacticWrap = document.querySelector('.ui-tactic__wrap');
        const bridge = tacticWrap?.closest('form') || tacticWrap?.parentElement || null;
        const addedBridgeClass = !!bridge && !bridge.classList.contains('team_general_content');
        if (addedBridgeClass) bridge.classList.add('team_general_content');

        try {
            await originalAddDropdown.apply(UI, arguments);
            const container = document.getElementById('slf-tactics-dropdown');
            moveIntoTeamHeader(container);
            return container;
        } finally {
            if (addedBridgeClass) bridge.classList.remove('team_general_content');
        }
    };
    UI.__team4TacticHeaderSelectorPatched = true;
})();


// ============================================================