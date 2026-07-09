// Transfer history VPS skip-synced guard + background page collector
// ===================================================================
// Prevents Analyze visible from reprocessing rows already confirmed in VPS.
// Adds a safe sequential "all pages" collector for transfers.php?action=history.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.historyFullSyncRunning = false;
    TransferMarketAnalyzer.historyFullSyncStopRequested = false;

    TransferMarketAnalyzer.isHistoryRowLocallySubmitted = function isHistoryRowLocallySubmitted(row, alreadySubmitted) {
        if (!row) return false;

        const eventKeySource = this.buildHistoryEventKeySource(row);
        const eventKey = row.historyEventKey || '';

        return !!(
            (eventKey && alreadySubmitted?.[eventKey]) ||
            Object.values(alreadySubmitted || {}).some(item =>
                item &&
                String(item.playerId || '') === String(row.playerId || '') &&
                this.normalizeText(item.dateText || '') === this.normalizeText(row.transferDateText || '') &&
                Number(item.price || 0) === Number(row.salePrice || 0)
            ) ||
            (eventKeySource && row.rowEl?.dataset?.slfHistoryEventKeySource === eventKeySource)
        );
    };

    TransferMarketAnalyzer.isHistoryRowSyncedInVps = function isHistoryRowSyncedInVps(row, alreadySubmitted) {
        // Backward-compatible alias for old callers. This is local state only;
        // real VPS confirmation must come from findHistoryVpsMatch(vpsIndex).
        return this.isHistoryRowLocallySubmitted(row, alreadySubmitted);
    };

    TransferMarketAnalyzer.getCurrentHistoryPageIndex = function getCurrentHistoryPageIndex() {
        const params = new URLSearchParams(location.search || '');
        const pid = Number(params.get('pid') || 0);
        return Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : 0;
    };

    TransferMarketAnalyzer.buildHistoryPageUrl = function buildHistoryPageUrl(pageIndex, baseUrl = location.href) {
        const url = new URL(baseUrl, location.origin);
        url.searchParams.set('action', 'history');

        if (Number(pageIndex || 0) <= 0) {
            url.searchParams.delete('pid');
        } else {
            url.searchParams.set('pid', String(Math.floor(Number(pageIndex))));
        }

        return url.toString();
    };

    TransferMarketAnalyzer.findHistoryTableInDocument = function findHistoryTableInDocument(doc) {
        if (!doc) return null;

        const direct = doc.querySelector('#trans_history #list');
        if (direct) return direct;

        return [...doc.querySelectorAll('table')]
            .map(table => {
                const text = this.normalizeLower(table.innerText || table.textContent || '');
                const playerLinks = [...table.querySelectorAll('a[href]')]
                    .filter(a => /player\.php/i.test(a.getAttribute('href') || '') && /id=\d+/i.test(a.getAttribute('href') || ''));
                const score =
                    (text.includes('амплуа') ? 4 : 0) +
                    (text.includes('сумма') ? 4 : 0) +
                    (text.includes('откуда') ? 2 : 0) +
                    (text.includes('куда') ? 2 : 0) +
                    Math.min(playerLinks.length, 20);
                return { table, score, playerLinks: playerLinks.length };
            })
            .filter(item => item.score > 8 && item.playerLinks > 0)
            .sort((a, b) => b.score - a.score)[0]?.table || null;
    };

    TransferMarketAnalyzer.parseHistoryRowsFromDocument = function parseHistoryRowsFromDocument(doc) {
        const table = this.findHistoryTableInDocument(doc);
        if (!table) return [];

        const map = this.getHeaderMap(table);
        const rowRoot = table.querySelector('tbody') || table;

        return [...rowRoot.querySelectorAll('tr')]
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);
    };

    TransferMarketAnalyzer.getHistoryTotalTransfersFromDocument = function getHistoryTotalTransfersFromDocument(doc) {
        const text = this.normalizeText(doc?.body?.innerText || '');
        const match = text.match(/Найдено\s+трансферов:\s*([\d'`\s]+)/i);
        if (!match) return null;

        const value = Number(String(match[1] || '').replace(/[^\d]/g, ''));
        return Number.isFinite(value) && value > 0 ? value : null;
    };

    TransferMarketAnalyzer.getHistoryPageCountFromSelects = function getHistoryPageCountFromSelects(doc) {
        const candidates = [...(doc?.querySelectorAll('select') || [])]
            .map(select => {
                const options = [...select.querySelectorAll('option')];
                const numeric = options
                    .map(option => ({
                        value: Number(option.value),
                        label: this.normalizeText(option.textContent || '')
                    }))
                    .filter(item => Number.isFinite(item.value) && item.value >= 0 && /^\d+$/.test(item.label));

                if (options.length < 2 || numeric.length !== options.length) return null;

                return {
                    count: numeric.length,
                    maxValue: Math.max(...numeric.map(item => item.value)),
                    maxLabel: Math.max(...numeric.map(item => Number(item.label)))
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.count - a.count);

        const selected = candidates[0];
        if (!selected || selected.maxValue < 1) return null;

        return Math.max(selected.maxValue + 1, selected.maxLabel);
    };

    TransferMarketAnalyzer.getHistoryPageCountFromLinks = function getHistoryPageCountFromLinks(doc) {
        const pids = [...(doc?.querySelectorAll('a[href*="transfers.php"][href*="action=history"]') || [])]
            .map(a => {
                try {
                    return Number(new URL(a.getAttribute('href') || '', location.origin).searchParams.get('pid'));
                } catch (e) {
                    return NaN;
                }
            })
            .filter(value => Number.isFinite(value) && value >= 0);

        if (!pids.length) return null;
        return Math.max(...pids) + 1;
    };

    TransferMarketAnalyzer.determineHistoryPageCount = function determineHistoryPageCount(doc, rows) {
        const fromSelect = this.getHistoryPageCountFromSelects(doc);
        if (fromSelect) return fromSelect;

        const fromTotal = this.getHistoryTotalTransfersFromDocument(doc);
        const rowCount = Array.isArray(rows) && rows.length ? rows.length : this.parseHistoryRowsFromDocument(doc).length;
        if (fromTotal && rowCount) return Math.max(1, Math.ceil(fromTotal / rowCount));

        const fromLinks = this.getHistoryPageCountFromLinks(doc);
        if (fromLinks) return fromLinks;

        return 1;
    };

    TransferMarketAnalyzer.fetchHistoryPageDocument = async function fetchHistoryPageDocument(pageIndex) {
        const url = this.buildHistoryPageUrl(pageIndex);
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`history_page_http_${response.status}`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        return { doc, url };
    };

    TransferMarketAnalyzer.sleepHistorySync = function sleepHistorySync(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    TransferMarketAnalyzer.applyHistoryEventSourceUrl = function applyHistoryEventSourceUrl(event, row) {
        if (!event || !row?.historySourceUrl) return event;
        event.source = event.source || {};
        event.source.url = row.historySourceUrl;
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
        let vpsMatched = 0;
        let localSkipped = 0;
        let localPending = 0;
        let failed = 0;
        const pendingRows = [];

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
                continue;
            }

            if (!hasRealVpsIndex && localSubmitted) {
                localSkipped++;
                if (renderRows) this.renderHistoryLocalBadge(row);
                continue;
            }

            if (hasRealVpsIndex && localSubmitted) {
                localPending++;
            }

            pendingRows.push(row);
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
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`История ${pageLabel} · ${i + 1}/${pendingRows.length}: ${fromCache ? 'cache' : 'анализ'} ${row.name || row.playerId}`);

            if (renderRows) this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                const event = this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, tmResult, slfAlter), row);
                eventsToSend.push(event);
                if (renderRows) this.renderHistorySyncStatus(row, 'QUEUED', 'pending');
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                if (renderRows) this.renderHistorySyncStatus(row, 'ERR', 'error');

                try {
                    const fallbackEvent = this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null), row);
                    fallbackEvent.analysisFailed = true;
                    fallbackEvent.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallbackEvent);
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

        return {
            rows: rows.length,
            prepared: eventsToSend.length,
            vpsMatched,
            localSkipped,
            localPending,
            failed
        };
    };

    TransferMarketAnalyzer.analyzeHistoryVisibleRows = async function analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();

        if (!rows.length) {
            this.setStatus('История трансферов: строки не найдены.');
            return;
        }

        let vpsIndex = null;
        try {
            const records = await this.loadHistoryVpsRows();
            vpsIndex = this.indexHistoryVpsRows(records);
        } catch (e) {
            console.warn('[SLF Transfer History] VPS index load failed, local skip only', e);
        }

        const stats = await this.processHistoryRowsForVps(rows, {
            alreadySubmitted: this.loadHistorySyncedKeys(),
            vpsIndex,
            pageLabel: 'видимых',
            renderRows: true
        });

        const localText = stats.localSkipped || stats.localPending ? `, local ${stats.localSkipped + stats.localPending}` : '';
        this.setStatus(
            `История готова: отправлено в очередь ${stats.prepared}, реально в VPS ${stats.vpsMatched}${localText}, ошибок ${stats.failed}.`
        );
    };

    TransferMarketAnalyzer.addHistoryFullSyncControls = function addHistoryFullSyncControls() {
        if (!this.isHistoryPage()) return;
        if (document.getElementById('slf-transfer-history-all-pages')) return;

        const analyzeButton = document.getElementById('slf-transfer-analyze-visible');
        if (!analyzeButton || !analyzeButton.parentNode) return;

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
        if (this.historyFullSyncRunning) {
            this.setStatus('История all pages: сбор уже выполняется.');
            return;
        }

        this.historyFullSyncRunning = true;
        this.historyFullSyncStopRequested = false;
        this.setHistoryFullSyncControlsRunning(true);

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const currentPageIndex = this.getCurrentHistoryPageIndex();
        const totals = {
            pages: 0,
            rows: 0,
            prepared: 0,
            vpsMatched: 0,
            localSkipped: 0,
            localPending: 0,
            failed: 0,
            pageErrors: 0
        };

        try {
            const currentRows = this.parseHistoryVisibleRows();
            const pageCount = this.determineHistoryPageCount(document, currentRows);
            totals.pages = pageCount;

            this.setStatus(`История all pages: загружаю VPS index, страниц ${pageCount}...`);

            let vpsIndex = null;
            try {
                const records = await this.loadHistoryVpsRows();
                vpsIndex = this.indexHistoryVpsRows(records);
            } catch (e) {
                console.warn('[SLF Transfer History] VPS index load failed, local skip only', e);
            }

            for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                if (this.historyFullSyncStopRequested) break;

                const pageNo = pageIndex + 1;
                let doc;
                let url;

                try {
                    if (pageIndex === currentPageIndex) {
                        doc = document;
                        url = location.href;
                    } else {
                        this.setStatus(`История all pages: загружаю страницу ${pageNo}/${pageCount}...`);
                        const loaded = await this.fetchHistoryPageDocument(pageIndex);
                        doc = loaded.doc;
                        url = loaded.url;
                    }

                    const rows = this.parseHistoryRowsFromDocument(doc);
                    rows.forEach(row => { row.historySourceUrl = url; });

                    const stats = await this.processHistoryRowsForVps(rows, {
                        alreadySubmitted,
                        vpsIndex,
                        pageLabel: `страница ${pageNo}/${pageCount}`,
                        renderRows: doc === document
                    });

                    totals.rows += stats.rows;
                    totals.prepared += stats.prepared;
                    totals.vpsMatched += stats.vpsMatched;
                    totals.localSkipped += stats.localSkipped;
                    totals.localPending += stats.localPending;
                    totals.failed += stats.failed;

                    const localTotal = totals.localSkipped + totals.localPending;
                    this.setStatus(
                        `История all pages: ${pageNo}/${pageCount} · строк ${totals.rows} · queued ${totals.prepared} · VPS ${totals.vpsMatched} · local ${localTotal} · ошибок ${totals.failed + totals.pageErrors}`
                    );
                } catch (pageError) {
                    totals.pageErrors++;
                    console.warn('[SLF Transfer History] page failed', pageIndex, pageError);
                    this.setStatus(`История all pages: ошибка страницы ${pageNo}/${pageCount}; продолжаю.`);
                }

                if (!this.historyFullSyncStopRequested && pageIndex < pageCount - 1) {
                    await this.sleepHistorySync(500);
                }
            }

            const stopped = this.historyFullSyncStopRequested;
            const localTotal = totals.localSkipped + totals.localPending;
            this.setStatus(
                `${stopped ? 'История all pages остановлена' : 'История all pages готова'}: страниц ${totals.pages}, строк ${totals.rows}, queued ${totals.prepared}, реально в VPS ${totals.vpsMatched}, local ${localTotal}, ошибок ${totals.failed + totals.pageErrors}.`
            );
        } finally {
            this.historyFullSyncRunning = false;
            this.historyFullSyncStopRequested = false;
            this.setHistoryFullSyncControlsRunning(false);
        }
    };

    const addToolbarWithHistoryFullSyncOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarWithHistoryFullSync() {
        const result = addToolbarWithHistoryFullSyncOriginal.apply(this, arguments);
        this.addHistoryFullSyncControls();
        return result;
    };
}