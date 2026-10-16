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

    // Loan-row anchoring re-verified live on team4.php (default squad page),
    // 2026-10-16, in BOTH design states (design=0 and design=1):
    //   - #generallist is alive with tr.view-team__player rows; loaned players
    //     are marked by span.player-loan INSIDE their row (text «аренда»,
    //     title «Взят в аренду у клуба …») — stable in both designs;
    //   - the old anchors are dead SITE-WIDE: tr.view-team__player.pl--1
    //     matches nothing (line classes are now pl-0/pl-1/pl--3) and the
    //     .tpanel-a[data-tp="-1"] loan tab is absent (only data-tp="0"
    //     «Основная команда») — the panel used to mount but stay display:none;
    //   - traps: /аренд/i text matching also hits the «аренд. номинал» table
    //     header, and tablesorter duplicates a header row (direct th children)
    //     inside tbody — those are never loan rows (structural exclusion);
    //   - age header «Воз» (#generallist thead th, index 10) and the mount
    //     point (#generallist → box after the table) are unchanged.
    isLoanTabActive() {
        const activeTab = document.querySelector('.tpanel-a[data-tp="-1"]');
        if (activeTab && /аренд/i.test(activeTab.textContent || '')) return true;

        // No loan tab in the tab bar (current site state, both designs):
        // activity is row-based — visible loan rows exist. Fail-closed:
        // no #generallist / no matching rows → false → panel stays hidden.
        return this.getLoanRows().length > 0;
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
        const rows = new Set();

        // Legacy anchor (old design): loaned players carry the pl--1 line class.
        for (const row of document.querySelectorAll('tr.view-team__player.pl--1')) {
            if (this.isVisible(row)) rows.add(row);
        }

        // Current anchor: visible tbody rows of #generallist marked with
        // span.player-loan inside the row. Tablesorter duplicates a header
        // row inside tbody (direct th children, text includes
        // «аренд. номинал») — excluded structurally, never by text matching.
        const table = document.querySelector('#generallist');
        if (table) {
            for (const row of table.querySelectorAll('tbody tr')) {
                if (rows.has(row)) continue;
                if (!this.isVisible(row)) continue;
                const isHeaderRow = [...row.children].some(
                    child => String(child.tagName || '').toLowerCase() === 'th');
                if (isHeaderRow) continue;
                if (row.querySelector('span.player-loan')) rows.add(row);
            }
        }

        return [...rows];
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

        // Current markup has no loan tab to click: #generallist mutations
        // (design filter switches, loan state changes) must re-render the
        // panel. render() only writes its own box AFTER the table and never
        // mutates table children, so the observer cannot feed back into
        // itself. Debounced ~200ms to coalesce bursts of mutations.
        const table = document.querySelector('#generallist');
        if (table && typeof MutationObserver === 'function') {
            let timer = null;
            this.loanTableObserver = new MutationObserver(() => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    timer = null;
                    this.render();
                }, 200);
            });
            this.loanTableObserver.observe(table, { childList: true, subtree: true });
        }
    },

    mount() {
        if (!this.isPage()) return;
        this.bindTabs();
        this.render();
    }
};


// ============================================================