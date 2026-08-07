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

    TransferCandidateScanner.hasNumericPagination = function hasNumericPagination(element) {
        if (!element) return false;
        return [...element.querySelectorAll('a[href], span, strong, b')]
            .some(node => /^\d+$/.test(this.text(node.textContent)));
    };

    TransferCandidateScanner.findPaginationContainer = function findPaginationContainer(doc) {
        const explicit = [...doc.querySelectorAll('.transfers-ui__pages')]
            .filter(element => this.hasNumericPagination(element));
        if (explicit.length) return explicit[0];

        return [...doc.querySelectorAll('div,nav,td,p,span')]
            .filter(element => {
                const text = this.text(element.textContent);
                return /^Страницы\s*:/i.test(text) && text.length < 500 && this.hasNumericPagination(element);
            })
            .sort((a, b) => this.text(a.textContent).length - this.text(b.textContent).length)[0] || null;
    };

    TransferCandidateScanner.paginationEntries = function paginationEntries(doc) {
        const container = this.findPaginationContainer(doc);
        if (!container) return [];

        return [...container.querySelectorAll('a[href]')].map(anchor => {
            const label = this.text(anchor.textContent);
            const displayPage = /^\d+$/.test(label) ? Number(label) : null;
            if (!Number.isInteger(displayPage) || displayPage < 1) return null;

            try {
                const url = new URL(anchor.getAttribute('href') || '', location.href);
                if (url.origin !== location.origin || url.pathname !== '/transfers.php') return null;
                return { displayPage, url: url.toString() };
            } catch (error) {
                return null;
            }
        }).filter(Boolean);
    };

    TransferCandidateScanner.rememberPaginationLinks = function rememberPaginationLinks(doc) {
        if (!(this.nativePageUrls instanceof Map)) this.nativePageUrls = new Map();
        this.paginationEntries(doc).forEach(entry => {
            this.nativePageUrls.set(entry.displayPage - 1, entry.url);
        });
    };

    TransferCandidateScanner.paginationPairs = function paginationPairs(doc) {
        return this.paginationEntries(doc).map(entry => {
            const rawPage = Number(new URL(entry.url).searchParams.get('page'));
            if (!Number.isInteger(rawPage) || rawPage < 0) return null;
            return {
                displayPage: entry.displayPage,
                rawPage,
                offset: rawPage - (entry.displayPage - 1)
            };
        }).filter(Boolean);
    };

    TransferCandidateScanner.detectPageParamOffset = function detectPageParamOffset(doc) {
        const counts = new Map();
        this.paginationPairs(doc).forEach(pair => {
            if (pair.offset !== 0 && pair.offset !== 1) return;
            counts.set(pair.offset, Number(counts.get(pair.offset) || 0) + 1);
        });
        if (!counts.size) return null;
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    };

    TransferCandidateScanner.extractLastPaginationPage = function extractLastPaginationPage(doc) {
        const container = this.findPaginationContainer(doc);
        if (!container) return -1;

        const displayIndexes = [];
        container.querySelectorAll('a[href], span, strong, b').forEach(element => {
            const text = this.text(element.textContent);
            if (/^\d+$/.test(text)) displayIndexes.push(Number(text) - 1);
        });
        if (displayIndexes.length) return Math.max(...displayIndexes);

        const offset = Number.isInteger(this.pageParamOffset) ? this.pageParamOffset : 1;
        const rawIndexes = this.paginationPairs(doc).map(pair => pair.rawPage - offset);
        return rawIndexes.length ? Math.max(...rawIndexes) : -1;
    };

    TransferCandidateScanner.canonicalMarketUrl = function canonicalMarketUrl() {
        const url = new URL(location.href);
        url.searchParams.delete('page');
        return url.toString();
    };

    TransferCandidateScanner.baseUrl = function baseUrlWithCurrentMarketQuery() {
        return this.canonicalMarketUrl();
    };

    TransferCandidateScanner.pageUrl = function pageUrlWithNativePagination(pageIndex) {
        const index = Math.max(0, Number(pageIndex || 0));
        const nativeUrl = this.nativePageUrls instanceof Map ? this.nativePageUrls.get(index) : null;
        if (nativeUrl) return nativeUrl;

        const url = new URL(this.state?.baseUrl || this.canonicalMarketUrl(), location.origin);
        url.searchParams.delete('page');
        if (index > 0) {
            const offset = Number.isInteger(this.pageParamOffset) ? this.pageParamOffset : 1;
            url.searchParams.set('page', String(index + offset));
        }
        return url.toString();
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

    TransferCandidateScanner.pageSignature = function pageSignature(rows) {
        const keys = (rows || []).map(row => row?.key).filter(Boolean);
        return keys.length ? `${keys.length}:${keys.join('|')}` : '';
    };

    TransferCandidateScanner.pageRequestLabel = function pageRequestLabel(value) {
        try {
            const url = new URL(value, location.origin);
            return `${url.pathname}${url.search}`;
        } catch (error) {
            return String(value || 'unknown_url');
        }
    };

    TransferCandidateScanner.runOriginal = TransferCandidateScanner.run;

    TransferCandidateScanner.run = async function runWithStablePagination(resume) {
        const uiRows = this.parsePage(document, 0, location.href);
        this.nativePageUrls = new Map();
        this.rememberPaginationLinks(document);
        this.pageParamOffset = this.detectPageParamOffset(document);
        if (!Number.isInteger(this.pageParamOffset)) this.pageParamOffset = 1;
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
        const seenSignatures = new Set();

        if (page >= totalPages) {
            this.state.phase = 'enrich';
            this.status('Все страницы уже собраны. Загружаю временный индекс с VPS...');
            this.saveMeta();
            this.renderProgress();
            return;
        }

        for (; !this.stopRequested && page < totalPages; page++) {
            const result = page === 0
                ? { doc: document, pageUrl: this.canonicalMarketUrl() }
                : await this.fetchPage(page);
            this.rememberPaginationLinks(result.doc);
            const pageRows = this.parsePage(result.doc, page, result.pageUrl);
            const signature = this.pageSignature(pageRows);

            if (!pageRows.length) {
                throw new Error(`Пустая страница рынка ${page + 1}/${totalPages}. Запрос: ${this.pageRequestLabel(result.pageUrl)}. Нажми «Сбросить».`);
            }
            if (signature && seenSignatures.has(signature)) {
                throw new Error(`Повторная страница рынка ${page + 1}/${totalPages}. Запрос: ${this.pageRequestLabel(result.pageUrl)}. Нажми «Сбросить».`);
            }

            this.status(`Сканирование страницы ${page + 1}/${totalPages}...`);
            await this.appendCollection(this.indexCollection, pageRows, `candidate page ${page + 1}`);
            this.state.scannedPages = Math.max(this.state.scannedPages, page + 1);
            this.state.nextPage = page + 1;
            this.state.indexedPlayers += pageRows.length;
            this.saveMeta();
            this.renderProgress();

            if (signature) seenSignatures.add(signature);
            await this.delay(250);
        }

        if (this.stopRequested) {
            this.status('Сканирование остановлено. Прогресс сохранён на VPS.');
            return;
        }

        if (Number(this.state.scannedPages || 0) !== totalPages) {
            throw new Error(`Неполный обход рынка: ${this.state.scannedPages}/${totalPages}. Нажми «Продолжить» или «Сбросить».`);
        }

        this.state.phase = 'enrich';
        this.status('Все страницы собраны. Загружаю временный индекс с VPS...');
        this.saveMeta();
        this.renderProgress();
    };
}
