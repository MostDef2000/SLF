// Transfer Candidate Scanner pagination, URL and session policy
// ============================================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.paginationPolicyApplied) {
    TransferCandidateScanner.paginationPolicyApplied = true;

    const previousStorageKey = TransferCandidateScanner.storageKey;
    TransferCandidateScanner.storageKey = 'slf_transfer_candidate_scanner_v9_meta';
    TransferCandidateScanner.schema = 'slf_transfer_candidate_scanner_v9_meta';
    TransferCandidateScanner.legacyStorageKeys = [...new Set([
        ...(TransferCandidateScanner.legacyStorageKeys || []),
        previousStorageKey,
        'slf_transfer_candidate_scanner_v3_meta',
        'slf_transfer_candidate_scanner_v4_meta',
        'slf_transfer_candidate_scanner_v5_meta',
        'slf_transfer_candidate_scanner_v6_meta',
        'slf_transfer_candidate_scanner_v7_meta',
        'slf_transfer_candidate_scanner_v8_meta'
    ])];

    TransferCandidateScanner.legacyStorageKeys.forEach(key => {
        if (key && key !== TransferCandidateScanner.storageKey) localStorage.removeItem(key);
    });

    if (!TransferCandidateScanner.state || TransferCandidateScanner.state.schema !== TransferCandidateScanner.schema) {
        TransferCandidateScanner.state = TransferCandidateScanner.defaults();
        TransferCandidateScanner.saveMeta();
    }

    TransferCandidateScanner.errorText = function errorText(error) {
        if (error == null) return 'unknown_error';
        if (typeof error === 'string') return error;
        if (error.message) return String(error.message);
        try {
            return JSON.stringify(error);
        } catch (jsonError) {
            return String(error);
        }
    };

    ['readCollection', 'appendCollection', 'clearCollection', 'fetchPage'].forEach(methodName => {
        const original = TransferCandidateScanner[methodName];
        if (typeof original !== 'function') return;
        TransferCandidateScanner[`${methodName}WithReadableErrorsOriginal`] = original;
        TransferCandidateScanner[methodName] = async function methodWithReadableErrors(...args) {
            try {
                return await original.apply(this, args);
            } catch (error) {
                throw new Error(this.errorText(error));
            }
        };
    });

    TransferCandidateScanner.findPaginationContainer = function findPaginationContainer(doc) {
        const explicit = [...doc.querySelectorAll('.transfers-ui__pages')]
            .filter(element => element.querySelector('a[href*="page="]'));
        if (explicit.length) return explicit[0];

        return [...doc.querySelectorAll('div,nav,td,p,span')]
            .filter(element => {
                const text = this.text(element.textContent);
                return /^Страницы\s*:/i.test(text) && text.length < 500 && element.querySelector('a[href*="page="]');
            })
            .sort((a, b) => this.text(a.textContent).length - this.text(b.textContent).length)[0] || null;
    };

    TransferCandidateScanner.extractLastPaginationPage = function extractLastPaginationPage(doc) {
        const container = this.findPaginationContainer(doc);
        if (!container) return -1;

        const pageIndexes = [];
        container.querySelectorAll('a[href*="page="], span').forEach(element => {
            const text = this.text(element.textContent);
            const href = element.getAttribute?.('href') || '';
            const hrefMatch = href.match(/[?&]page=(\d+)/);
            const textMatch = text.match(/^\d+$/);
            const value = hrefMatch ? Number(hrefMatch[1]) : (textMatch ? Number(text) - 1 : null);
            if (Number.isFinite(value) && value >= 0) pageIndexes.push(value);
        });

        return pageIndexes.length ? Math.max(...pageIndexes) : -1;
    };

    TransferCandidateScanner.canonicalMarketUrl = function canonicalMarketUrl() {
        const url = new URL(location.href);
        url.searchParams.delete('page');
        return url.toString();
    };

    TransferCandidateScanner.baseUrl = function baseUrlWithCurrentMarketQuery() {
        return this.canonicalMarketUrl();
    };

    TransferCandidateScanner.detectInitialTotalPages = function detectInitialTotalPages(doc, pageRows) {
        const lastPageIndex = this.extractLastPaginationPage(doc);
        if (lastPageIndex >= 0) return lastPageIndex + 1;

        const totalPlayers = this.extractTotalPlayers(doc);
        const firstPageSize = Number(pageRows?.length || 0);
        if (totalPlayers > 0 && firstPageSize > 0) return Math.ceil(totalPlayers / firstPageSize);
        return 1;
    };

    TransferCandidateScanner.detectTotalPages = function detectStableTotalPages() {
        return Math.max(1, Number(this.fixedTotalPages || this.state.totalPages || 1));
    };

    TransferCandidateScanner.runOriginal = TransferCandidateScanner.run;

    TransferCandidateScanner.run = async function runWithStablePagination(resume) {
        const uiRows = this.parsePage(document, 0, location.href);
        const uiTotalPages = this.detectInitialTotalPages(document, uiRows);
        this.expectedCanonicalBaseUrl = this.canonicalMarketUrl();
        this.fixedTotalPages = uiTotalPages;

        if (resume && this.state?.baseUrl) {
            try {
                const savedBase = new URL(this.state.baseUrl, location.origin);
                const currentBase = new URL(this.expectedCanonicalBaseUrl, location.origin);
                savedBase.searchParams.delete('page');
                currentBase.searchParams.delete('page');

                if (savedBase.toString() !== currentBase.toString()) {
                    this.status('Выдача рынка изменилась. Нажми «Сбросить» и запусти новый поиск.');
                    return;
                }

                const savedTotalPages = Number(this.state.totalPages || 0);
                if (savedTotalPages > 0 && savedTotalPages !== uiTotalPages) {
                    this.status(`Количество страниц изменилось: было ${savedTotalPages}, стало ${uiTotalPages}. Нажми «Сбросить».`);
                    return;
                }
            } catch (error) {
                this.status(`Ошибка проверки сессии: ${this.errorText(error)}`);
                return;
            }
        }

        this.state.totalPages = uiTotalPages;
        this.state.totalPlayers = this.extractTotalPlayers(document) || this.state.totalPlayers || 0;
        this.state.pageSize = uiRows.length || this.state.pageSize || 0;
        this.saveMeta();
        return this.runOriginal(resume);
    };

    TransferCandidateScanner.scanAllPages = async function scanAllPagesWithStableLimit(resume) {
        this.state.phase = 'scan';
        const totalPages = Math.max(1, Number(this.fixedTotalPages || this.state.totalPages || 1));
        this.state.totalPages = totalPages;
        let page = resume ? Number(this.state.nextPage || 0) : 0;
        let previousSignature = '';

        if (page >= totalPages) {
            this.state.phase = 'enrich';
            this.status('Все страницы уже собраны. Загружаю временный индекс с VPS...');
            this.saveMeta();
            this.renderProgress();
            return;
        }

        for (; !this.stopRequested && page < totalPages; page++) {
            const result = page === 0
                ? { doc: document, pageUrl: location.href }
                : await this.fetchPage(page);
            const pageRows = this.parsePage(result.doc, page, result.pageUrl);

            const signature = pageRows.slice(0, 10).map(row => row.key).join('|');
            if (!pageRows.length) {
                throw new Error(`empty_transfer_page_${page + 1}_of_${totalPages}`);
            }
            if (page > 0 && signature && signature === previousSignature) {
                throw new Error(`duplicate_transfer_page_${page + 1}_of_${totalPages}`);
            }

            this.status(`Сканирование страницы ${page + 1}/${totalPages}...`);
            await this.appendCollection(this.indexCollection, pageRows, `candidate page ${page + 1}`);
            this.state.scannedPages = Math.max(this.state.scannedPages, page + 1);
            this.state.nextPage = page + 1;
            this.state.indexedPlayers += pageRows.length;
            this.saveMeta();
            this.renderProgress();

            previousSignature = signature;
            await this.delay(250);
        }

        if (this.stopRequested) {
            this.status('Сканирование остановлено. Прогресс сохранён на VPS.');
            return;
        }

        if (Number(this.state.scannedPages || 0) !== totalPages) {
            throw new Error(`incomplete_transfer_scan_${this.state.scannedPages}_of_${totalPages}`);
        }

        this.state.phase = 'enrich';
        this.status('Все страницы собраны. Загружаю временный индекс с VPS...');
        this.saveMeta();
        this.renderProgress();
    };
}
