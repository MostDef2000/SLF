// Transfer Analyzer: my club bid rank chips
// ============================================================
// Adds a manual checker on /transfers.php?ucs=1 that loads transfer
// detail pages and shows compact rank chips for configured user clubs.

const TransferMyBidsRank = {
    cacheKey: 'slf_my_bid_rank_cache_v1',
    cacheTtlMs: 1000 * 60 * 30,
    cacheMaxEntries: 300,
    concurrency: 3,
    isRunning: false,

    teams: {
        '23698': 'ЛУЧ',
        '21473': 'КАР',
        '18280': 'ПРШ',
        '22962': 'БОА',
        '79252': 'ЧЕС',
        '19703': 'ЭЙР',
        '105995': 'НОРТ'
    },

    isPage() {
        if (!location.pathname.includes('/transfers.php')) return false;

        const params = new URLSearchParams(location.search);
        if (params.get('action') === 'view') return false;

        return params.get('ucs') === '1';
    },

    start() {
        if (!this.isPage()) return;

        const run = () => this.mount();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }

        window.addEventListener('load', run);
        setTimeout(run, 800);
        setTimeout(run, 2000);
        setTimeout(run, 4000);
    },

    mount() {
        if (!this.isPage()) return;

        this.injectStyles();
        this.wrapAnalyzerBadgeRenderers();
        this.addToolbarButtons();
        this.restoreAllVisibleBidChips();
    },

    injectStyles() {
        if (document.getElementById('slf-my-bids-rank-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-my-bids-rank-style';
        style.textContent = `
            .slf-my-bids-rank-wrap {
                display:inline-flex;
                flex-wrap:wrap;
                gap:3px;
                align-items:center;
                margin-right:4px;
            }
            .slf-my-bids-rank-chip {
                display:inline-flex;
                align-items:center;
                justify-content:center;
                padding:1px 5px;
                border-radius:4px;
                border:1px solid #555;
                background:#202020;
                color:#ddd;
                font-size:11px;
                font-weight:bold;
                line-height:1.2;
                white-space:nowrap;
            }
            .slf-my-bids-rank-chip--lead {
                border-color:#4b7d2d;
                background:#173018;
                color:#7cff7c;
            }
            .slf-my-bids-rank-chip--near {
                border-color:#7a6422;
                background:#302610;
                color:#ffd76a;
            }
            .slf-my-bids-rank-chip--far {
                border-color:#444;
                background:#181818;
                color:#aaa;
            }
            .slf-my-bids-rank-wrap[data-status="error"] {
                opacity:0.72;
            }
        `;
        document.head.appendChild(style);
    },

    wrapAnalyzerBadgeRenderers() {
        if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

        const self = this;
        const rowMethods = ['renderLoadingBadge', 'renderErrorBadge', 'renderRowBadge'];

        rowMethods.forEach(methodName => {
            const original = TransferMarketAnalyzer[methodName];
            if (typeof original !== 'function' || original.__slfMyBidsRankWrapped) return;

            const wrapped = function renderWithMyBidRanks(row, ...args) {
                const result = original.call(this, row, ...args);
                self.restoreBidChips(row);
                return result;
            };

            wrapped.__slfMyBidsRankWrapped = true;
            wrapped.__slfMyBidsRankOriginal = original;
            TransferMarketAnalyzer[methodName] = wrapped;
        });

        const originalRenderCachedRows = TransferMarketAnalyzer.renderCachedRows;
        if (
            typeof originalRenderCachedRows === 'function' &&
            !originalRenderCachedRows.__slfMyBidsRankWrapped
        ) {
            const wrappedRenderCachedRows = function renderCachedRowsWithMyBidRanks(...args) {
                const result = originalRenderCachedRows.apply(this, args);
                self.restoreAllVisibleBidChips();
                return result;
            };

            wrappedRenderCachedRows.__slfMyBidsRankWrapped = true;
            wrappedRenderCachedRows.__slfMyBidsRankOriginal = originalRenderCachedRows;
            TransferMarketAnalyzer.renderCachedRows = wrappedRenderCachedRows;
        }
    },

    addToolbarButtons() {
        const toolbar = document.getElementById('slf-transfer-analyzer-toolbar');
        if (!toolbar) return;

        const status = document.getElementById('slf-transfer-status');
        const insert = element => {
            if (status && status.parentNode === toolbar) {
                toolbar.insertBefore(element, status);
            } else {
                toolbar.appendChild(element);
            }
        };

        let btn = document.getElementById('slf-my-bids-rank-check');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'slf-my-bids-rank-check';
            btn.type = 'button';
            btn.title = 'Проверить места ставок моих клубов на этой странице';
            btn.onclick = () => this.checkVisibleRows();
            insert(btn);
        }
        this.setCheckButtonRunning(this.isRunning);

        if (!document.getElementById('slf-my-bids-rank-clear')) {
            const clearBtn = document.createElement('button');
            clearBtn.id = 'slf-my-bids-rank-clear';
            clearBtn.type = 'button';
            clearBtn.textContent = 'Сброс bid cache';
            clearBtn.title = 'Очистить cache мест ставок';
            clearBtn.onclick = () => {
                this.clearCache();
                this.restoreAllVisibleBidChips();
                this.setStatus('Bid cache очищен.');
            };
            insert(clearBtn);
        }
    },

    setCheckButtonRunning(running) {
        const btn = document.getElementById('slf-my-bids-rank-check');
        if (!btn) return;

        btn.disabled = !!running;
        btn.textContent = running ? 'Проверка ставок...' : 'Проверить ставки';
        btn.setAttribute('aria-busy', running ? 'true' : 'false');
    },

    setStatus(text) {
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.setStatus) {
            TransferMarketAnalyzer.setStatus(text);
            return;
        }

        const el = document.getElementById('slf-transfer-status');
        if (el) el.textContent = text || '';
    },

    findTransferTable() {
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.findTransferTable) {
            return TransferMarketAnalyzer.findTransferTable();
        }

        const rows = [...document.querySelectorAll('tr')]
            .filter(tr => this.parseTransferIdFromRow(tr));

        return rows[0]?.closest('table') || null;
    },

    parseVisibleRows() {
        const table = this.findTransferTable();
        if (!table) return [];

        return [...table.querySelectorAll('tr')]
            .map((tr, index) => ({
                rowEl: tr,
                originalIndex: index,
                transferId: this.parseTransferIdFromRow(tr)
            }))
            .filter(row => row.transferId);
    },

    parseTransferIdFromRow(tr) {
        if (!tr) return '';

        const links = [...tr.querySelectorAll('a[href]')];
        const link = links.find(a => {
            const href = a.getAttribute('href') || '';
            return /transfers\.php/i.test(href) &&
                /action=view/i.test(href) &&
                /transfer_id=\d+/i.test(href);
        }) || links.find(a => {
            const href = a.getAttribute('href') || '';
            return /action=view/i.test(href) && /transfer_id=\d+/i.test(href);
        });

        const href = link?.getAttribute('href') || '';
        const match = href.match(/transfer_id=(\d+)/i);

        return match ? match[1] : '';
    },

    async checkVisibleRows() {
        if (this.isRunning) {
            this.setStatus('Ставки: проверка уже выполняется.');
            return;
        }

        const rows = this.parseVisibleRows();

        if (!rows.length) {
            this.setStatus('Ставки: строки не найдены.');
            return;
        }

        this.isRunning = true;
        this.setCheckButtonRunning(true);
        this.restoreAllVisibleBidChips();

        let completed = 0;
        let failed = 0;
        let matched = 0;

        const tasks = rows.map(row => async () => {
            const transferId = row.transferId || this.parseTransferIdFromRow(row.rowEl);
            if (!transferId) return;

            let state = null;

            try {
                state = await this.loadBidState(transferId);
            } catch (error) {
                failed++;
                state = this.recordErrorState(transferId, error);
                console.warn('[SLF My Bids Rank] failed', transferId, error);
            } finally {
                if (state?.items?.length) matched++;
                if (state) this.renderBidState(row, state);
                completed++;
                this.setStatus(`Ставки: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
            }
        });

        try {
            this.setStatus(`Ставки: 0/${rows.length}`);
            await this.runLimited(tasks, this.concurrency);
            this.restoreAllVisibleBidChips();
            this.setStatus(`Ставки проверены: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
        } finally {
            this.isRunning = false;
            this.setCheckButtonRunning(false);
            this.restoreAllVisibleBidChips();
        }
    },

    async loadBidState(transferId) {
        const html = await this.fetchDetailHtml(transferId);
        const parsed = this.parseMyBidRanks(html);
        const checkedAt = Date.now();
        const state = {
            status: parsed.status,
            items: parsed.items,
            checkedAt,
            savedAt: checkedAt,
            error: ''
        };

        if (state.status === 'success') state.lastSuccessAt = checkedAt;
        this.setCachedState(transferId, state);
        return state;
    },

    async fetchDetailHtml(transferId) {
        const url = `/transfers.php?action=view&transfer_id=${encodeURIComponent(transferId)}`;
        const response = await fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        if (!html || html.length < 200) {
            throw new Error('bid_detail_html_incomplete');
        }

        return html;
    },

    parseMyBidRanks(htmlText) {
        const text = String(htmlText || '');
        if (!text.trim()) throw new Error('bid_detail_html_empty');

        const doc = new DOMParser().parseFromString(text, 'text/html');
        if (!doc?.documentElement || doc.querySelector('parsererror')) {
            throw new Error('bid_detail_html_parse_failed');
        }

        const table = doc.querySelector('table.bet_table');
        if (!table) {
            throw new Error('bid_table_not_found');
        }

        const rows = [...table.querySelectorAll('tr.betline')];
        const items = [];
        let recognizedRows = 0;

        rows.forEach((tr, index) => {
            const rosterLink = [...tr.querySelectorAll('a[href]')].find(a => {
                const href = a.getAttribute('href') || '';
                return /roster\.php\?id=\d+/i.test(href);
            });

            const href = rosterLink?.getAttribute('href') || '';
            const teamId = (href.match(/roster\.php\?id=(\d+)/i) || [])[1];
            if (!teamId) return;

            recognizedRows++;
            if (!this.teams[teamId]) return;

            items.push({
                teamId,
                label: this.teams[teamId],
                rank: index + 1
            });
        });

        if (rows.length && recognizedRows !== rows.length) {
            throw new Error('bid_table_incomplete');
        }

        return {
            status: items.length ? 'success' : 'confirmed_empty',
            items
        };
    },

    getOrCreateBidCell(row) {
        const tr = row?.rowEl;
        if (!tr) return null;

        let cell = tr.querySelector('.slf-transfer-analysis-badge');

        if (!cell && typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.getOrCreateBadgeCell) {
            cell = TransferMarketAnalyzer.getOrCreateBadgeCell(row);
        }

        if (!cell) {
            cell = document.createElement('td');
            cell.className = 'slf-transfer-analysis-badge';
            cell.style.cssText = `
                box-sizing:border-box;
                min-width:0;
                width:auto;
                font-size:11px;
                line-height:1.12;
                border-left:1px solid #444;
                padding:3px 5px;
                vertical-align:top;
                white-space:normal;
                position:relative;
                overflow:visible;
            `;
            tr.appendChild(cell);
        }

        return cell;
    },

    normalizeState(value) {
        if (!value || typeof value !== 'object') return null;

        const items = Array.isArray(value.items) ? value.items : [];
        const checkedAt = Number(value.checkedAt || value.savedAt || 0);
        const savedAt = Number(value.savedAt || checkedAt || 0);
        let status = String(value.status || '');

        if (!['success', 'confirmed_empty', 'error'].includes(status)) {
            status = items.length ? 'success' : 'confirmed_empty';
        }

        return {
            status,
            items,
            checkedAt,
            savedAt,
            lastSuccessAt: Number(value.lastSuccessAt || (status === 'success' ? checkedAt : 0)),
            error: String(value.error || '')
        };
    },

    restoreBidChips(row) {
        const transferId = row?.transferId || this.parseTransferIdFromRow(row?.rowEl);
        let state = transferId ? this.getCachedState(transferId) : null;
        if (!state && row?.rowEl?.dataset?.slfMyBidsRankState) {
            try {
                state = this.normalizeState(JSON.parse(row.rowEl.dataset.slfMyBidsRankState));
            } catch (e) {
                delete row.rowEl.dataset.slfMyBidsRankState;
            }
        }

        if (!state && row?.rowEl?.dataset?.slfMyBidsRankItems) {
            try {
                state = this.normalizeState({
                    status: 'success',
                    items: JSON.parse(row.rowEl.dataset.slfMyBidsRankItems || '[]'),
                    checkedAt: Date.now(),
                    savedAt: Date.now()
                });
            } catch (e) {
                delete row.rowEl.dataset.slfMyBidsRankItems;
            }
        }

        if (state) this.renderBidState(row, state);
    },

    restoreAllVisibleBidChips() {
        if (!this.isPage()) return;

        this.parseVisibleRows().forEach(row => this.restoreBidChips(row));
    },

    renderBidState(row, value) {
        const state = this.normalizeState(value);
        if (!state) return;

        const cell = this.getOrCreateBidCell(row);
        if (!cell) return;

        let wrap = cell.querySelector('.slf-my-bids-rank-wrap');

        if (row?.rowEl?.dataset) {
            row.rowEl.dataset.slfMyBidsRankState = JSON.stringify(state);
            delete row.rowEl.dataset.slfMyBidsRankItems;
        }

        if (!state.items.length) {
            if (wrap) wrap.remove();
            return;
        }

        if (!wrap) {
            wrap = document.createElement('span');
            wrap.className = 'slf-my-bids-rank-wrap';
            cell.insertBefore(wrap, cell.firstChild);
        }

        wrap.dataset.status = state.status;
        wrap.title = state.status === 'error'
            ? `Последний успешный результат сохранён; обновление не удалось${state.error ? `: ${state.error}` : ''}`
            : `Проверено ${state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString() : ''}`.trim();
        wrap.innerHTML = '';

        state.items.forEach(item => {
            const chip = document.createElement('span');
            const rank = Number(item.rank || 0);
            const level = rank === 1 ? 'lead' : rank <= 3 ? 'near' : 'far';

            chip.className = `slf-my-bids-rank-chip slf-my-bids-rank-chip--${level}`;
            chip.textContent = `${item.label} #${rank || '?'}`;
            wrap.appendChild(chip);
        });
    },

    renderBidChips(row, items) {
        const now = Date.now();
        this.renderBidState(row, {
            status: Array.isArray(items) && items.length ? 'success' : 'confirmed_empty',
            items: Array.isArray(items) ? items : [],
            checkedAt: now,
            savedAt: now
        });
    },

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            const entries = Object.entries(cache || {})
                .map(([key, value]) => [key, this.normalizeState(value)])
                .filter(([, value]) => value && Number(value.savedAt || value.checkedAt || 0))
                .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
                .slice(0, this.cacheMaxEntries);

            localStorage.setItem(this.cacheKey, JSON.stringify(Object.fromEntries(entries)));
        } catch (e) {
            console.warn('[SLF My Bids Rank] cache save failed', e);
        }
    },

    getCachedState(transferId, options = {}) {
        const cache = this.loadCache();
        const state = this.normalizeState(cache[String(transferId || '')]);
        if (!state) return null;

        const timestamp = Number(state.savedAt || state.checkedAt || 0);
        if (!options.allowExpired && (!timestamp || Date.now() - timestamp > this.cacheTtlMs)) {
            return null;
        }

        return state;
    },

    setCachedState(transferId, value) {
        const key = String(transferId || '');
        if (!key) return;

        const cache = this.loadCache();
        const state = this.normalizeState(value);
        if (!state) return;

        state.savedAt = Date.now();
        if (!state.checkedAt) state.checkedAt = state.savedAt;
        cache[key] = state;
        this.saveCache(cache);
    },

    recordErrorState(transferId, error) {
        const previous = this.getCachedState(transferId, { allowExpired: true });
        const checkedAt = Date.now();
        const items = Array.isArray(previous?.items) ? previous.items : [];
        const state = {
            status: 'error',
            items,
            checkedAt,
            savedAt: checkedAt,
            lastSuccessAt: Number(previous?.lastSuccessAt || (previous?.status === 'success' ? previous.checkedAt : 0)),
            error: String(error?.message || error || 'unknown')
        };

        this.setCachedState(transferId, state);
        return state;
    },

    getCached(transferId) {
        const state = this.getCachedState(transferId);
        return state ? state.items : null;
    },

    setCached(transferId, items) {
        const now = Date.now();
        this.setCachedState(transferId, {
            status: Array.isArray(items) && items.length ? 'success' : 'confirmed_empty',
            items: Array.isArray(items) ? items : [],
            checkedAt: now,
            savedAt: now,
            lastSuccessAt: Array.isArray(items) && items.length ? now : 0,
            error: ''
        });
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
        this.parseVisibleRows().forEach(row => {
            const wrap = row?.rowEl?.querySelector('.slf-my-bids-rank-wrap');
            if (wrap) wrap.remove();
            if (row?.rowEl?.dataset) {
                delete row.rowEl.dataset.slfMyBidsRankState;
                delete row.rowEl.dataset.slfMyBidsRankItems;
            }
        });
    },

    async runLimited(tasks, limit) {
        const queue = Array.isArray(tasks) ? tasks.slice() : [];
        const workerCount = Math.max(1, Number(limit || 1));
        const workers = Array.from({ length: workerCount }, async () => {
            while (queue.length) {
                const task = queue.shift();
                await task();
            }
        });

        await Promise.all(workers);
    }
};

TransferMyBidsRank.start();