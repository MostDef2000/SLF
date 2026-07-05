// Transfer Analyzer: my club bid rank chips
// ============================================================
// Adds a manual checker on /transfers.php?ucs=1 that loads transfer
// detail pages and shows compact rank chips for configured user clubs.

const TransferMyBidsRank = {
    cacheKey: 'slf_my_bid_rank_cache_v1',
    cacheTtlMs: 1000 * 60,
    cacheMaxEntries: 300,
    concurrency: 3,

    teams: {
        '23698': 'ЛУЧ',
        '21473': 'КАР',
        '18280': 'ПРШ',
        '22962': 'БОА',
        '79252': 'ЧЕС',
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
        this.wrapAnalyzerBadgeRenderer();
        this.addToolbarButtons();
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
        `;
        document.head.appendChild(style);
    },

    wrapAnalyzerBadgeRenderer() {
        if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;
        if (typeof TransferMarketAnalyzer.renderRowBadge !== 'function') return;
        if (TransferMarketAnalyzer.renderRowBadge.__slfMyBidsRankWrapped) return;

        const originalRenderRowBadge = TransferMarketAnalyzer.renderRowBadge;
        const self = this;

        const wrappedRenderRowBadge = function renderRowBadgeWithMyBidRanks(row, enriched, slfAlter) {
            const result = originalRenderRowBadge.call(this, row, enriched, slfAlter);
            self.restoreBidChips(row);
            return result;
        };

        wrappedRenderRowBadge.__slfMyBidsRankWrapped = true;
        TransferMarketAnalyzer.renderRowBadge = wrappedRenderRowBadge;
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

        if (!document.getElementById('slf-my-bids-rank-check')) {
            const btn = document.createElement('button');
            btn.id = 'slf-my-bids-rank-check';
            btn.type = 'button';
            btn.textContent = 'Проверить ставки';
            btn.title = 'Проверить места ставок моих клубов на этой странице';
            btn.onclick = () => this.checkVisibleRows();
            insert(btn);
        }

        if (!document.getElementById('slf-my-bids-rank-clear')) {
            const clearBtn = document.createElement('button');
            clearBtn.id = 'slf-my-bids-rank-clear';
            clearBtn.type = 'button';
            clearBtn.textContent = 'Сброс bid cache';
            clearBtn.title = 'Очистить короткий cache мест ставок';
            clearBtn.onclick = () => {
                this.clearCache();
                this.setStatus('Bid cache очищен.');
            };
            insert(clearBtn);
        }
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
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.parseVisibleRows) {
            return TransferMarketAnalyzer.parseVisibleRows()
                .filter(row => row?.rowEl && this.parseTransferIdFromRow(row.rowEl))
                .map(row => Object.assign(row, {
                    transferId: this.parseTransferIdFromRow(row.rowEl)
                }));
        }

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
        const rows = this.parseVisibleRows();

        if (!rows.length) {
            this.setStatus('Ставки: строки не найдены.');
            return;
        }

        let completed = 0;
        let failed = 0;
        let matched = 0;

        const tasks = rows.map(row => async () => {
            const transferId = row.transferId || this.parseTransferIdFromRow(row.rowEl);

            if (!transferId) return;

            try {
                const cached = this.getCached(transferId);
                const items = cached || await this.loadBidRanks(transferId);

                if (items.length) matched++;
                this.renderBidChips(row, items);
            } catch (error) {
                failed++;
                console.warn('[SLF My Bids Rank] failed', transferId, error);
            } finally {
                completed++;
                this.setStatus(`Ставки: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
            }
        });

        this.setStatus(`Ставки: 0/${rows.length}`);
        await this.runLimited(tasks, this.concurrency);
        this.setStatus(`Ставки проверены: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
    },

    async loadBidRanks(transferId) {
        const html = await this.fetchDetailHtml(transferId);
        const items = this.parseMyBidRanks(html);

        this.setCached(transferId, items);
        return items;
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

        return response.text();
    },

    parseMyBidRanks(htmlText) {
        const doc = new DOMParser().parseFromString(String(htmlText || ''), 'text/html');
        const rows = [...doc.querySelectorAll('table.bet_table tr.betline')];
        const items = [];

        rows.forEach((tr, index) => {
            const rank = index + 1;
            const rosterLink = [...tr.querySelectorAll('a[href]')].find(a => {
                const href = a.getAttribute('href') || '';
                return /roster\.php\?id=\d+/i.test(href);
            });

            const href = rosterLink?.getAttribute('href') || '';
            const teamId = (href.match(/roster\.php\?id=(\d+)/i) || [])[1];

            if (!teamId || !this.teams[teamId]) return;

            items.push({
                teamId,
                label: this.teams[teamId],
                rank
            });
        });

        return items;
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

    restoreBidChips(row) {
        if (!row?.rowEl?.dataset?.slfMyBidsRankItems) return;

        try {
            const items = JSON.parse(row.rowEl.dataset.slfMyBidsRankItems || '[]');
            this.renderBidChips(row, items);
        } catch (e) {
            delete row.rowEl.dataset.slfMyBidsRankItems;
        }
    },

    renderBidChips(row, items) {
        const cell = this.getOrCreateBidCell(row);
        if (!cell) return;

        let wrap = cell.querySelector('.slf-my-bids-rank-wrap');

        if (!Array.isArray(items) || !items.length) {
            if (wrap) wrap.remove();
            if (row?.rowEl?.dataset) delete row.rowEl.dataset.slfMyBidsRankItems;
            return;
        }

        if (row?.rowEl?.dataset) {
            row.rowEl.dataset.slfMyBidsRankItems = JSON.stringify(items);
        }

        if (!wrap) {
            wrap = document.createElement('span');
            wrap.className = 'slf-my-bids-rank-wrap';
            cell.insertBefore(wrap, cell.firstChild);
        }

        wrap.innerHTML = '';

        items.forEach(item => {
            const chip = document.createElement('span');
            const rank = Number(item.rank || 0);
            const level = rank === 1 ? 'lead' : rank <= 3 ? 'near' : 'far';

            chip.className = `slf-my-bids-rank-chip slf-my-bids-rank-chip--${level}`;
            chip.textContent = `${item.label} #${rank || '?'}`;
            wrap.appendChild(chip);
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
                .filter(([, value]) => value && Number(value.savedAt || 0))
                .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
                .slice(0, this.cacheMaxEntries);

            localStorage.setItem(this.cacheKey, JSON.stringify(Object.fromEntries(entries)));
        } catch (e) {
            console.warn('[SLF My Bids Rank] cache save failed', e);
        }
    },

    getCached(transferId) {
        const cache = this.loadCache();
        const item = cache[String(transferId || '')];

        if (!item) return null;

        const savedAt = Number(item.savedAt || 0);
        if (!savedAt || Date.now() - savedAt > this.cacheTtlMs) return null;

        return Array.isArray(item.items) ? item.items : [];
    },

    setCached(transferId, items) {
        const cache = this.loadCache();

        cache[String(transferId || '')] = {
            savedAt: Date.now(),
            items: Array.isArray(items) ? items : []
        };

        this.saveCache(cache);
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
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
