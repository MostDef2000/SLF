// Transfer Candidate Scanner pagination, URL and session policy
// ============================================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.paginationPolicyApplied) {
    TransferCandidateScanner.paginationPolicyApplied = true;

    const previousStorageKey = TransferCandidateScanner.storageKey;
    TransferCandidateScanner.storageKey = 'slf_transfer_candidate_scanner_v6_meta';
    TransferCandidateScanner.schema = 'slf_transfer_candidate_scanner_v6_meta';
    TransferCandidateScanner.legacyStorageKeys = [...new Set([
        ...(TransferCandidateScanner.legacyStorageKeys || []),
        previousStorageKey,
        'slf_transfer_candidate_scanner_v3_meta',
        'slf_transfer_candidate_scanner_v4_meta',
        'slf_transfer_candidate_scanner_v5_meta'
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

    TransferCandidateScanner.extractLastPaginationPage = function extractLastPaginationPage(doc) {
        const numbers = [];
        doc.querySelectorAll('.transfers-ui__pages a, .transfers-ui__pages span, a[href*="page="]').forEach(element => {
            const text = this.text(element.textContent);
            const href = element.getAttribute?.('href') || '';
            const hrefMatch = href.match(/[?&]page=(\d+)/);
            const textMatch = text.match(/^\d+$/);
            const value = hrefMatch ? Number(hrefMatch[1]) : (textMatch ? Number(text) - 1 : null);
            if (Number.isFinite(value) && value >= 0) numbers.push(value);
        });
        return numbers.length ? Math.max(...numbers) : -1;
    };

    TransferCandidateScanner.canonicalMarketUrl = function canonicalMarketUrl() {
        const url = new URL(location.href);
        url.searchParams.delete('page');
        return url.toString();
    };

    TransferCandidateScanner.baseUrl = function baseUrlWithCurrentMarketQuery() {
        return this.canonicalMarketUrl();
    };

    TransferCandidateScanner.detectTotalPagesOriginal = TransferCandidateScanner.detectTotalPages;

    TransferCandidateScanner.detectTotalPages = function detectTotalPagesWithPaginationPolicy(doc, pageRows) {
        const lastPageIndex = this.extractLastPaginationPage(doc);
        const fallback = this.detectTotalPagesOriginal(doc, pageRows);
        const total = lastPageIndex >= 0 ? lastPageIndex + 1 : fallback;
        const totalPlayers = this.extractTotalPlayers(doc);

        this.state.totalPlayers = totalPlayers || this.state.totalPlayers || 0;
        this.state.pageSize = pageRows.length || this.state.pageSize || 0;

        return Math.max(total, fallback, 1);
    };

    TransferCandidateScanner.runOriginal = TransferCandidateScanner.run;

    TransferCandidateScanner.run = async function runWithSessionRevalidation(resume) {
        const uiRows = this.parsePage(document, 0, location.href);
        this.expectedUiTotalPages = this.detectTotalPages(document, uiRows);
        this.expectedCanonicalBaseUrl = this.canonicalMarketUrl();

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
                const scannedPages = Number(this.state.scannedPages || 0);
                this.state.totalPages = Math.max(savedTotalPages, this.expectedUiTotalPages);

                if (this.expectedUiTotalPages > scannedPages && this.state.phase !== 'scan') {
                    this.state.phase = 'scan';
                    this.state.nextPage = scannedPages;
                    this.saveMeta();
                }
            } catch (error) {
                this.status(`Ошибка проверки сессии: ${this.errorText(error)}`);
                return;
            }
        }

        return this.runOriginal(resume);
    };

    TransferCandidateScanner.scanAllPages = async function scanAllPagesWithPaginationGuard(resume) {
        this.state.phase = 'scan';
        let page = resume ? Number(this.state.nextPage || 0) : 0;
        let previousSignature = '';

        for (; !this.stopRequested; page++) {
            const result = page === 0
                ? { doc: document, pageUrl: location.href }
                : await this.fetchPage(page);
            const pageRows = this.parsePage(result.doc, page, result.pageUrl);
            const detectedTotalPages = this.detectTotalPages(result.doc, pageRows);

            if (page === 0 && this.expectedUiTotalPages && detectedTotalPages !== this.expectedUiTotalPages) {
                throw new Error(`pagination_mismatch_ui_${this.expectedUiTotalPages}_scan_${detectedTotalPages}`);
            }

            this.state.totalPages = Math.max(Number(this.state.totalPages || 0), detectedTotalPages);

            const signature = pageRows.slice(0, 10).map(row => row.key).join('|');
            if (!pageRows.length) break;
            if (page > 0 && signature && signature === previousSignature) break;

            this.status(`Сканирование страницы ${page + 1}/${this.state.totalPages || '?'}...`);
            await this.appendCollection(this.indexCollection, pageRows, `candidate page ${page + 1}`);
            this.state.scannedPages = Math.max(this.state.scannedPages, page + 1);
            this.state.nextPage = page + 1;
            this.state.indexedPlayers += pageRows.length;
            this.saveMeta();
            this.renderProgress();

            previousSignature = signature;
            if (this.state.totalPages && page + 1 >= this.state.totalPages) break;
            await this.delay(250);
        }

        if (this.stopRequested) {
            this.status('Сканирование остановлено. Прогресс сохранён на VPS.');
            return;
        }

        if (Number(this.state.scannedPages || 0) < Number(this.state.totalPages || 0)) {
            this.state.phase = 'scan';
            this.state.nextPage = Number(this.state.scannedPages || 0);
            this.stopRequested = true;
            this.status(`Сканирование неполное: ${this.state.scannedPages}/${this.state.totalPages}.`);
            this.saveMeta();
            this.renderProgress();
            return;
        }

        this.state.phase = 'enrich';
        this.status('Все страницы собраны. Загружаю временный индекс с VPS...');
        this.saveMeta();
        this.renderProgress();
    };
}
