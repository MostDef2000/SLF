// Transfer history VPS sync runtime
// =================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.historyFullSyncRunning = false;
    TransferMarketAnalyzer.historyFullSyncStopRequested = false;
    TransferMarketAnalyzer.historyVpsRowsMemoryCache = null;
    TransferMarketAnalyzer.historyVpsRowsPromise = null;

    try { localStorage.removeItem('slf_transfer_history_vps_records_cache_v1'); } catch (e) {}

    TransferMarketAnalyzer.findTransferTable = function findTransferTable() {
        const candidates = [...document.querySelectorAll('table')]
            .map(table => ({ table, score: this.scoreTransferTable(table), rows: table.querySelectorAll('tr').length, links: this.getPlayerLinksIn(table).length }))
            .filter(x => x.score > 0 && x.links > 0)
            .sort((a, b) => b.score - a.score);
        if (candidates[0]) return candidates[0].table;

        const tableMap = new Map();
        this.getPlayerLinksIn(document).forEach(a => {
            for (let node = a; node && node !== document.body; node = node.parentElement) {
                if (node.tagName?.toLowerCase() === 'table' && !this.isWrapperTable(node)) {
                    tableMap.set(node, (tableMap.get(node) || 0) + 1);
                    break;
                }
            }
        });

        return [...tableMap.entries()]
            .map(([table, count]) => ({ table, count, rows: table.querySelectorAll('tr').length }))
            .filter(x => x.count >= 3)
            .sort((a, b) => b.count !== a.count ? b.count - a.count : a.rows - b.rows)[0]?.table || null;
    };

    TransferMarketAnalyzer.getHeaderMap = function getHeaderMap(table) {
        const row = this.findHeaderRow(table);
        const cells = row ? [...row.querySelectorAll('td, th')].map(c => this.normalizeLower(c.innerText)) : [];
        const find = (...needles) => {
            const normalized = needles.map(n => this.normalizeLower(n));
            const idx = cells.findIndex(text => normalized.some(n => text.includes(n)));
            return idx >= 0 ? idx : null;
        };

        return {
            id: find('#', 'id'),
            pos: find('амплуа'),
            name: find('фамилия', 'имя'),
            club: find('команда', 'клуб'),
            age: find('возраст', 'воз'),
            talent: find('талант', 'тал'),
            potential: find('потенциал', 'пот'),
            scoutSkill: find('скилл', 'ск'),
            price: find('цена', 'сумма'),
            date: find('дата'),
            fromClub: find('откуда'),
            toClub: find('куда'),
            transferSum: find('сумма'),
            sellerManager: find('от кого'),
            buyerManager: find('кому'),
            transferType: find('тип'),
            endDate: find('дата окончания', 'оконч'),
            bids: find('предл', 'став')
        };
    };

    TransferMarketAnalyzer.parseVisibleRows = function parseVisibleRows() {
        const table = this.findTransferTable();
        if (!table) return [];
        this.ensureAnalysisHeader(table);
        const map = this.getHeaderMap(table);
        return [...table.querySelectorAll('tr')].map((tr, index) => this.parseRow(tr, index, map)).filter(Boolean);
    };

    TransferMarketAnalyzer.parseHistoryVisibleRows = function parseHistoryVisibleRows() {
        const table = this.findTransferTable();
        if (!table) return [];
        this.ensureAnalysisHeader(table);
        const map = this.getHeaderMap(table);
        return [...table.querySelectorAll('tr')].map((tr, index) => this.parseHistoryRow(tr, index, map)).filter(Boolean);
    };

    TransferMarketAnalyzer.loadHistoryVpsCache = function loadHistoryVpsCache() {
        return { rows: Array.isArray(this.historyVpsRowsMemoryCache) ? this.historyVpsRowsMemoryCache : [] };
    };

    TransferMarketAnalyzer.saveHistoryVpsCache = function saveHistoryVpsCache(rows) {
        this.historyVpsRowsMemoryCache = Array.isArray(rows) ? rows : [];
        try { localStorage.removeItem('slf_transfer_history_vps_records_cache_v1'); } catch (e) {}
    };

    TransferMarketAnalyzer.loadHistoryVpsRows = async function loadHistoryVpsRows() {
        if (Array.isArray(this.historyVpsRowsMemoryCache)) return this.historyVpsRowsMemoryCache;
        if (this.historyVpsRowsPromise) return this.historyVpsRowsPromise;

        this.historyVpsRowsPromise = Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY)
            .then(result => {
                const rows = this.normalizeHistoryVpsRows(result.data);
                this.saveHistoryVpsCache(rows);
                return rows;
            })
            .finally(() => { this.historyVpsRowsPromise = null; });

        return this.historyVpsRowsPromise;
    };

    TransferMarketAnalyzer.isHistoryRowLocallySubmitted = function isHistoryRowLocallySubmitted(row, alreadySubmitted) {
        if (!row) return false;
        const keySource = this.buildHistoryEventKeySource(row);
        const eventKey = row.historyEventKey || '';
        return !!(
            (eventKey && alreadySubmitted?.[eventKey]) ||
            Object.values(alreadySubmitted || {}).some(item => item &&
                String(item.playerId || '') === String(row.playerId || '') &&
                this.normalizeText(item.dateText || '') === this.normalizeText(row.transferDateText || '') &&
                Number(item.price || 0) === Number(row.salePrice || 0)) ||
            (keySource && row.rowEl?.dataset?.slfHistoryEventKeySource === keySource)
        );
    };

    TransferMarketAnalyzer.isHistoryRowSyncedInVps = function isHistoryRowSyncedInVps(row, alreadySubmitted) {
        return this.isHistoryRowLocallySubmitted(row, alreadySubmitted);
    };

    TransferMarketAnalyzer.getCurrentHistoryPageIndex = function getCurrentHistoryPageIndex() {
        const pid = Number(new URLSearchParams(location.search || '').get('pid') || 0);
        return Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : 0;
    };

    TransferMarketAnalyzer.buildHistoryPageUrl = function buildHistoryPageUrl(pageIndex, baseUrl = location.href) {
        const url = new URL(baseUrl, location.origin);
        url.searchParams.set('action', 'history');
        if (Number(pageIndex || 0) <= 0) url.searchParams.delete('pid');
        else url.searchParams.set('pid', String(Math.floor(Number(pageIndex))));
        return url.toString();
    };

    TransferMarketAnalyzer.findHistoryTableInDocument = function findHistoryTableInDocument(doc) {
        if (!doc) return null;
        const direct = doc.querySelector('#trans_history #list');
        if (direct) return direct;

        return [...doc.querySelectorAll('table')]
            .map(table => {
                const text = this.normalizeLower(table.innerText || table.textContent || '');
                const links = [...table.querySelectorAll('a[href]')].filter(a => /player\.php/i.test(a.getAttribute('href') || '') && /id=\d+/i.test(a.getAttribute('href') || '')).length;
                const score = (text.includes('амплуа') ? 4 : 0) + (text.includes('сумма') ? 4 : 0) + (text.includes('откуда') ? 2 : 0) + (text.includes('куда') ? 2 : 0) + Math.min(links, 20);
                return { table, links, score };
            })
            .filter(x => x.score > 8 && x.links > 0)
            .sort((a, b) => b.score - a.score)[0]?.table || null;
    };

    TransferMarketAnalyzer.parseHistoryRowsFromDocument = function parseHistoryRowsFromDocument(doc) {
        const table = this.findHistoryTableInDocument(doc);
        if (!table) return [];
        const map = this.getHeaderMap(table);
        return [...(table.querySelector('tbody') || table).querySelectorAll('tr')]
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);
    };

    TransferMarketAnalyzer.getHistoryTotalTransfersFromDocument = function getHistoryTotalTransfersFromDocument(doc) {
        const match = this.normalizeText(doc?.body?.innerText || '').match(/Найдено\s+трансферов:\s*([\d'`\s]+)/i);
        const value = match ? Number(String(match[1]).replace(/[^\d]/g, '')) : 0;
        return Number.isFinite(value) && value > 0 ? value : null;
    };

    TransferMarketAnalyzer.getHistoryPageCountFromSelects = function getHistoryPageCountFromSelects(doc) {
        return [...(doc?.querySelectorAll('select') || [])]
            .map(select => [...select.querySelectorAll('option')].map(option => ({ value: Number(option.value), label: this.normalizeText(option.textContent || '') })))
            .filter(items => items.length > 1 && items.every(item => Number.isFinite(item.value) && item.value >= 0 && /^\d+$/.test(item.label)))
            .map(items => Math.max(Math.max(...items.map(item => item.value)) + 1, Math.max(...items.map(item => Number(item.label)))))
            .sort((a, b) => b - a)[0] || null;
    };

    TransferMarketAnalyzer.getHistoryPageCountFromLinks = function getHistoryPageCountFromLinks(doc) {
        const pids = [...(doc?.querySelectorAll('a[href*="transfers.php"][href*="action=history"]') || [])]
            .map(a => { try { return Number(new URL(a.getAttribute('href') || '', location.origin).searchParams.get('pid')); } catch (e) { return NaN; } })
            .filter(value => Number.isFinite(value) && value >= 0);
        return pids.length ? Math.max(...pids) + 1 : null;
    };

    TransferMarketAnalyzer.determineHistoryPageCount = function determineHistoryPageCount(doc, rows) {
        const fromSelect = this.getHistoryPageCountFromSelects(doc);
        if (fromSelect) return fromSelect;
        const total = this.getHistoryTotalTransfersFromDocument(doc);
        const rowCount = Array.isArray(rows) && rows.length ? rows.length : this.parseHistoryRowsFromDocument(doc).length;
        if (total && rowCount) return Math.max(1, Math.ceil(total / rowCount));
        return this.getHistoryPageCountFromLinks(doc) || 1;
    };

    TransferMarketAnalyzer.fetchHistoryPageDocument = async function fetchHistoryPageDocument(pageIndex) {
        const url = this.buildHistoryPageUrl(pageIndex);
        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`history_page_http_${response.status}`);
        return { doc: new DOMParser().parseFromString(await response.text(), 'text/html'), url };
    };

    TransferMarketAnalyzer.sleepHistorySync = ms => new Promise(resolve => setTimeout(resolve, ms));

    TransferMarketAnalyzer.applyHistoryEventSourceUrl = function applyHistoryEventSourceUrl(event, row) {
        if (event && row?.historySourceUrl) {
            event.source = event.source || {};
            event.source.url = row.historySourceUrl;
        }
        return event;
    };

    TransferMarketAnalyzer.renderHistoryLocalBadge = function renderHistoryLocalBadge(row) {
        this.renderHistorySyncStatus(row, 'LOCAL', 'neutral');
    };

    TransferMarketAnalyzer.processHistoryRowsForVps = async function processHistoryRowsForVps(rows, options = {}) {
        const renderRows = options.renderRows !== false;
        const alreadySubmitted = options.alreadySubmitted || this.loadHistorySyncedKeys();
        const vpsIndex = options.vpsIndex || null;
        const hasRealVpsIndex = !!vpsIndex;
        const pageLabel = options.pageLabel || 'видимые строки';
        const eventsToSend = [];
        const pendingRows = [];
        let vpsMatched = 0, localSkipped = 0, localPending = 0, failed = 0;

        for (const row of rows || []) {
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);
            row.historyEventKey = eventKey;
            if (row.rowEl?.dataset) row.rowEl.dataset.slfHistoryEventKeySource = eventKeySource;

            const vpsMatch = hasRealVpsIndex ? this.findHistoryVpsMatch(row, vpsIndex) : null;
            const localSubmitted = this.isHistoryRowLocallySubmitted(row, alreadySubmitted);

            if (vpsMatch) {
                vpsMatched++;
                if (renderRows) this.renderHistoryVpsBadge(row, vpsMatch);
            } else if (!hasRealVpsIndex && localSubmitted) {
                localSkipped++;
                if (renderRows) this.renderHistoryLocalBadge(row);
            } else {
                if (hasRealVpsIndex && localSubmitted) localPending++;
                pendingRows.push(row);
            }
        }

        if (!pendingRows.length) {
            const localText = localSkipped || localPending ? `, local ${localSkipped + localPending}` : '';
            this.setStatus(`История ${pageLabel}: строк ${rows.length}, реально в VPS ${vpsMatched}${localText}, новых к отправке 0.`);
            return { rows: rows.length, prepared: 0, vpsMatched, localSkipped, localPending, failed };
        }

        const localText = localPending ? `, local pending ${localPending}` : '';
        this.setStatus(`История ${pageLabel}: строк ${rows.length}, реально в VPS ${vpsMatched}${localText}, к отправке ${pendingRows.length}.`);

        for (let i = 0; i < pendingRows.length; i++) {
            if (this.historyFullSyncStopRequested) break;
            const row = pendingRows[i];
            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            this.setStatus(`История ${pageLabel} · ${i + 1}/${pendingRows.length}: ${tmCached && alterCached ? 'cache' : 'анализ'} ${row.name || row.playerId}`);
            if (renderRows) this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);
                let slfAlter = alterCached || null;
                if (!slfAlter) {
                    try { slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId); }
                    catch (alterError) { console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError); }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;
                eventsToSend.push(this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, tmResult, slfAlter), row));
                if (renderRows) this.renderHistorySyncStatus(row, 'QUEUED', 'pending');
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                if (renderRows) this.renderHistorySyncStatus(row, 'ERR', 'error');
                try {
                    const fallback = this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null), row);
                    fallback.analysisFailed = true;
                    fallback.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallback);
                    if (renderRows) this.renderHistorySyncStatus(row, 'QUEUED', 'pending');
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            this.sendTransferHistoryEvents(eventsToSend);
            Object.assign(alreadySubmitted, this.loadHistorySyncedKeys());
        }

        return { rows: rows.length, prepared: eventsToSend.length, vpsMatched, localSkipped, localPending, failed };
    };

    TransferMarketAnalyzer.analyzeHistoryVisibleRows = async function analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();
        if (!rows.length) return this.setStatus('История трансферов: строки не найдены.');

        let vpsIndex = null;
        try { vpsIndex = this.indexHistoryVpsRows(await this.loadHistoryVpsRows()); }
        catch (e) { console.warn('[SLF Transfer History] VPS index load failed, local skip only', e); }

        const stats = await this.processHistoryRowsForVps(rows, { alreadySubmitted: this.loadHistorySyncedKeys(), vpsIndex, pageLabel: 'видимых', renderRows: true });
        const localText = stats.localSkipped || stats.localPending ? `, local ${stats.localSkipped + stats.localPending}` : '';
        this.setStatus(`История готова: отправлено в очередь ${stats.prepared}, реально в VPS ${stats.vpsMatched}${localText}, ошибок ${stats.failed}.`);
    };

    TransferMarketAnalyzer.addHistoryFullSyncControls = function addHistoryFullSyncControls() {
        if (!this.isHistoryPage() || document.getElementById('slf-transfer-history-all-pages')) return;
        const analyzeButton = document.getElementById('slf-transfer-analyze-visible');
        if (!analyzeButton?.parentNode) return;

        const allButton = document.createElement('button');
        allButton.id = 'slf-transfer-history-all-pages';
        allButton.textContent = 'Собрать все страницы';
        allButton.title = 'Фоном пройти все страницы текущего wid и текущих фильтров. Первая страница идет без pid, дальше pid=1..N.';

        const stopButton = document.createElement('button');
        stopButton.id = 'slf-transfer-history-stop';
        stopButton.textContent = 'Стоп';
        stopButton.disabled = true;
        stopButton.title = 'Остановить фоновый сбор после текущего запроса/строки.';

        analyzeButton.insertAdjacentElement('afterend', allButton);
        allButton.insertAdjacentElement('afterend', stopButton);
        allButton.onclick = () => this.analyzeHistoryAllPages();
        stopButton.onclick = () => {
            this.historyFullSyncStopRequested = true;
            this.setStatus('История all pages: остановка после текущего запроса/строки...');
        };
    };

    TransferMarketAnalyzer.setHistoryFullSyncControlsRunning = function setHistoryFullSyncControlsRunning(running) {
        const allButton = document.getElementById('slf-transfer-history-all-pages');
        const stopButton = document.getElementById('slf-transfer-history-stop');
        const visibleButton = document.getElementById('slf-transfer-analyze-visible');
        if (allButton) allButton.disabled = !!running;
        if (visibleButton) visibleButton.disabled = !!running;
        if (stopButton) stopButton.disabled = !running;
    };

    TransferMarketAnalyzer.analyzeHistoryAllPages = async function analyzeHistoryAllPages() {
        if (this.historyFullSyncRunning) return this.setStatus('История all pages: сбор уже выполняется.');

        this.historyFullSyncRunning = true;
        this.historyFullSyncStopRequested = false;
        this.setHistoryFullSyncControlsRunning(true);

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const currentPageIndex = this.getCurrentHistoryPageIndex();
        const totals = { pages: 0, rows: 0, prepared: 0, vpsMatched: 0, localSkipped: 0, localPending: 0, failed: 0, pageErrors: 0 };

        try {
            const currentRows = this.parseHistoryVisibleRows();
            const pageCount = this.determineHistoryPageCount(document, currentRows);
            totals.pages = pageCount;
            this.setStatus(`История all pages: загружаю VPS index, страниц ${pageCount}...`);

            let vpsIndex = null;
            try { vpsIndex = this.indexHistoryVpsRows(await this.loadHistoryVpsRows()); }
            catch (e) { console.warn('[SLF Transfer History] VPS index load failed, local skip only', e); }

            for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                if (this.historyFullSyncStopRequested) break;
                const pageNo = pageIndex + 1;

                try {
                    let doc = document;
                    let url = location.href;
                    if (pageIndex !== currentPageIndex) {
                        this.setStatus(`История all pages: загружаю страницу ${pageNo}/${pageCount}...`);
                        ({ doc, url } = await this.fetchHistoryPageDocument(pageIndex));
                    }

                    const rows = this.parseHistoryRowsFromDocument(doc);
                    rows.forEach(row => { row.historySourceUrl = url; });
                    const stats = await this.processHistoryRowsForVps(rows, { alreadySubmitted, vpsIndex, pageLabel: `страница ${pageNo}/${pageCount}`, renderRows: doc === document });

                    totals.rows += stats.rows;
                    totals.prepared += stats.prepared;
                    totals.vpsMatched += stats.vpsMatched;
                    totals.localSkipped += stats.localSkipped;
                    totals.localPending += stats.localPending;
                    totals.failed += stats.failed;
                    this.setStatus(`История all pages: ${pageNo}/${pageCount} · строк ${totals.rows} · queued ${totals.prepared} · VPS ${totals.vpsMatched} · local ${totals.localSkipped + totals.localPending} · ошибок ${totals.failed + totals.pageErrors}`);
                } catch (pageError) {
                    totals.pageErrors++;
                    console.warn('[SLF Transfer History] page failed', pageIndex, pageError);
                    this.setStatus(`История all pages: ошибка страницы ${pageNo}/${pageCount}; продолжаю.`);
                }

                if (!this.historyFullSyncStopRequested && pageIndex < pageCount - 1) await this.sleepHistorySync(500);
            }

            this.setStatus(`${this.historyFullSyncStopRequested ? 'История all pages остановлена' : 'История all pages готова'}: страниц ${totals.pages}, строк ${totals.rows}, queued ${totals.prepared}, реально в VPS ${totals.vpsMatched}, local ${totals.localSkipped + totals.localPending}, ошибок ${totals.failed + totals.pageErrors}.`);
        } finally {
            this.historyFullSyncRunning = false;
            this.historyFullSyncStopRequested = false;
            this.setHistoryFullSyncControlsRunning(false);
        }
    };

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarHistorySync() {
        const result = addToolbarOriginal.apply(this, arguments);
        this.addHistoryFullSyncControls();
        return result;
    };

    TransferMarketAnalyzer.mount = function mountTransferAnalyzer() {
        if (!this.isPage()) return;
        this.addToolbar();
        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps().catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }
        this.addPurchaseForecastPanel?.();
        this.clearAllTransferAnalysisState?.();
        this.setStatus?.('Live-only режим: нажми "Анализировать видимых", чтобы загрузить TM/SLF данные.');
    };
}