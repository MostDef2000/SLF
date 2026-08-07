// Transfer Candidate Scanner pagination, URL, session and FM2026 row-identity policy
// ==============================================================================

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

    ['readCollection', 'appendCollection', 'clearCollection'].forEach(methodName => {
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

    TransferCandidateScanner.browserFetch = function browserFetch(url, options) {
        const pageFetch = typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.fetch === 'function'
            ? unsafeWindow.fetch.bind(unsafeWindow)
            : fetch.bind(window);
        return pageFetch(url, options);
    };

    TransferCandidateScanner.fetchDocumentUrl = async function fetchDocumentUrl(url) {
        const response = await this.browserFetch(url, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`transfer_page_http_${response.status}`);
        return new DOMParser().parseFromString(await response.text(), 'text/html');
    };

    TransferCandidateScanner.playerIdFromHref = function playerIdFromHref(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.origin);
            const path = url.pathname.toLowerCase();
            if (!/(?:player|alter)\.php$/.test(path) && !/\/player\/\d+/.test(path)) return '';
            for (const key of ['id', 'player_id', 'playerId', 'player']) {
                const candidate = url.searchParams.get(key);
                if (/^\d+$/.test(candidate || '')) return candidate;
            }
            return (path.match(/\/player\/(\d+)/) || [])[1] || '';
        } catch (error) {
            return '';
        }
    };

    TransferCandidateScanner.transferIdFromHref = function transferIdFromHref(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.origin);
            if (url.pathname !== '/transfers.php') return '';
            for (const key of ['transfer_id', 'transfer', 'tl']) {
                const candidate = url.searchParams.get(key);
                if (/^\d+$/.test(candidate || '')) return candidate;
            }
            const id = url.searchParams.get('id') || '';
            return url.searchParams.get('action') === 'view' && /^\d+$/.test(id) ? id : '';
        } catch (error) {
            return '';
        }
    };

    TransferCandidateScanner.findDirectPlayerAnchor = function findDirectPlayerAnchor(root) {
        return [...(root?.querySelectorAll?.('a[href]') || [])]
            .map(anchor => ({ anchor, playerId: this.playerIdFromHref(anchor.getAttribute('href') || '') }))
            .filter(entry => entry.playerId)
            .sort((a, b) => {
                const aText = this.text(a.anchor.getAttribute('title') || a.anchor.textContent || '');
                const bText = this.text(b.anchor.getAttribute('title') || b.anchor.textContent || '');
                return Number(/[A-Za-zА-Яа-яЁё]/.test(bText)) - Number(/[A-Za-zА-Яа-яЁё]/.test(aText));
            })[0] || null;
    };

    TransferCandidateScanner.findTransferDetailAnchor = function findTransferDetailAnchor(root) {
        return [...(root?.querySelectorAll?.('a[href]') || [])]
            .map(anchor => ({ anchor, transferId: this.transferIdFromHref(anchor.getAttribute('href') || '') }))
            .find(entry => entry.transferId) || null;
    };

    TransferCandidateScanner.resolvePlayerIdentityFromDocument = function resolvePlayerIdentityFromDocument(doc, preferredName) {
        const expectedName = this.text(preferredName).toLowerCase();
        const candidates = [...doc.querySelectorAll('a[href]')]
            .map(anchor => {
                const href = anchor.getAttribute('href') || '';
                const playerId = this.playerIdFromHref(href);
                if (!playerId) return null;
                const label = this.text(anchor.getAttribute('title') || anchor.textContent || '');
                let score = 10;
                if (label && /[A-Za-zА-Яа-яЁё]/.test(label)) score += 5;
                if (expectedName && label.toLowerCase().includes(expectedName)) score += 30;
                if (/player\.php/i.test(href)) score += 5;
                return {
                    playerId,
                    playerUrl: new URL(href, location.origin).toString(),
                    name: label,
                    score
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        if (candidates[0]) return candidates[0];

        const html = doc.documentElement?.innerHTML || '';
        const match = html.match(/(?:player|alter)\.php[^"'<>]{0,180}?(?:[?&](?:id|player_id|playerId|player)=)(\d+)/i);
        if (!match) return null;
        const playerId = match[1];
        return {
            playerId,
            playerUrl: new URL(`/player.php?action=view&id=${encodeURIComponent(playerId)}`, location.origin).toString(),
            name: '',
            score: 1
        };
    };

    TransferCandidateScanner.resolvePlayerIdentity = async function resolvePlayerIdentity(row) {
        if (/^\d+$/.test(String(row?.playerId || ''))) return row;
        if (!row) throw new Error('candidate_row_missing');

        let detailUrl = row.transferDetailUrl || '';
        if (!detailUrl && row.transferId) {
            detailUrl = new URL(`/transfers.php?action=view&transfer_id=${encodeURIComponent(row.transferId)}`, location.origin).toString();
        }
        if (!detailUrl) throw new Error(`player_identity_missing_${row.key || 'unknown'}`);

        const doc = await this.fetchDocumentUrl(detailUrl);
        const identity = this.resolvePlayerIdentityFromDocument(doc, row.name);
        if (!identity?.playerId) throw new Error(`player_identity_not_found_${row.transferId || row.key || 'unknown'}`);

        row.playerId = String(identity.playerId);
        row.playerUrl = identity.playerUrl || new URL(`/player.php?action=view&id=${encodeURIComponent(identity.playerId)}`, location.origin).toString();
        if (identity.name && /[A-Za-zА-Яа-яЁё]/.test(identity.name)) row.name = identity.name;
        return row;
    };

    const headerMapOriginal = TransferCandidateScanner.headerMap;
    TransferCandidateScanner.headerMap = function headerMapWithName(table) {
        const map = headerMapOriginal.apply(this, arguments) || {};
        if (map.name != null) return map;
        const header = [...table.querySelectorAll('tr')].find(row => {
            const text = this.text(row.textContent).toLowerCase();
            return text.includes('амплуа') && (text.includes('фамилия') || text.includes('имя'));
        });
        const cells = header ? [...header.querySelectorAll('td,th')].map(cell => this.text(cell.textContent).toLowerCase()) : [];
        const index = cells.findIndex(text => text.includes('фамилия') || text.includes('имя'));
        return { ...map, name: index >= 0 ? index : null };
    };

    TransferCandidateScanner.parsePage = function parsePageWithFm2026RowIdentity(doc, page, pageUrl) {
        const table = this.findTable(doc);
        if (!table) return [];
        const map = this.headerMap(table);

        return [...table.querySelectorAll('tr')].map((rowElement, index) => {
            const text = this.text(rowElement.textContent);
            if (!text) return null;
            const lower = text.toLowerCase();
            if (lower.includes('амплуа') && (lower.includes('фамилия') || lower.includes('имя'))) return null;

            const cells = [...rowElement.querySelectorAll('td')];
            if (cells.length < 4) return null;
            const cell = cellIndex => cellIndex == null ? null : cells[cellIndex] || null;
            const value = cellIndex => this.text(cell(cellIndex)?.textContent || '');

            const direct = this.findDirectPlayerAnchor(rowElement);
            const detail = this.findTransferDetailAnchor(rowElement);
            const rowIdTransfer = (rowElement.id || '').match(/(?:tl|transfer)[-_]?(\d+)/i)?.[1] || '';
            const transferId = detail?.transferId || rowIdTransfer || '';
            const playerId = direct?.playerId || '';
            if (!playerId && !transferId) return null;

            const potentialCell = cell(map.potential);
            const potentialLevel = Number((potentialCell?.querySelector('img[src*="/potencial/"]')?.getAttribute('src') || '').match(/potencial\/(\d+)/)?.[1]) || null;
            const priceCell = cell(map.price)?.cloneNode(true);
            priceCell?.querySelectorAll('[title*="номинал"], img').forEach(node => node.remove());
            const tm = rowElement.querySelector('.tm_field a[href*="transfermarkt"], a[href*="transfermarkt."]');
            const positions = value(map.pos).toUpperCase().match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/g) || [];
            const directLabel = this.text(direct?.anchor?.getAttribute('title') || direct?.anchor?.textContent || '');
            const cellName = value(map.name);
            const name = /[A-Za-zА-Яа-яЁё]/.test(cellName) ? cellName : directLabel;
            const transferDetailUrl = detail?.anchor
                ? new URL(detail.anchor.getAttribute('href') || '', location.origin).toString()
                : transferId
                    ? new URL(`/transfers.php?action=view&transfer_id=${encodeURIComponent(transferId)}`, location.origin).toString()
                    : '';
            const playerUrl = playerId
                ? new URL(`/player.php?action=view&id=${encodeURIComponent(playerId)}`, location.origin).toString()
                : '';

            const row = {
                key: transferId ? `transfer:${transferId}` : `player:${playerId}`,
                transferId,
                transferDetailUrl,
                playerId,
                page,
                pageUrl,
                originalIndex: index,
                name: name || playerId || (transferId ? `Трансфер #${transferId}` : 'Игрок'),
                playerUrl,
                positions: [...new Set(positions)],
                club: value(map.club),
                age: this.number(value(map.age)),
                talent: this.number(value(map.talent)),
                potentialLevel,
                potentialText: this.text(potentialCell?.querySelector('[title]')?.getAttribute('title') || ''),
                scoutSkill: this.number(value(map.skill)),
                price: this.money(priceCell?.textContent || value(map.price)),
                bids: this.number(value(map.bids)),
                endDateText: value(map.end),
                tmUrl: tm?.href || '',
                tmDisplayedValueEur: this.money(tm?.textContent || '')
            };
            row.preScore = this.preScore(row);
            return row;
        }).filter(Boolean);
    };

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
        this.paginationEntries(doc).forEach(entry => this.nativePageUrls.set(entry.displayPage - 1, entry.url));
    };

    TransferCandidateScanner.paginationPairs = function paginationPairs(doc) {
        return this.paginationEntries(doc).map(entry => {
            const rawPage = Number(new URL(entry.url).searchParams.get('page'));
            if (!Number.isInteger(rawPage) || rawPage < 0) return null;
            return { displayPage: entry.displayPage, rawPage, offset: rawPage - (entry.displayPage - 1) };
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

    TransferCandidateScanner.pageUrlCandidates = function pageUrlCandidates(pageIndex) {
        const index = Math.max(0, Number(pageIndex || 0));
        const result = [];
        const add = value => {
            if (!value) return;
            try {
                const normalized = new URL(value, location.origin).toString();
                if (!result.includes(normalized)) result.push(normalized);
            } catch (error) {}
        };

        const nativeUrl = this.nativePageUrls instanceof Map ? this.nativePageUrls.get(index) : null;
        if (nativeUrl) {
            const native = new URL(nativeUrl, location.origin);
            const raw = Number(native.searchParams.get('page'));
            if (Number.isInteger(raw) && Number.isInteger(this.pageParamCorrection) && this.pageParamCorrection !== 0) {
                const corrected = new URL(native.toString());
                corrected.searchParams.set('page', String(Math.max(0, raw + this.pageParamCorrection)));
                add(corrected.toString());
            }
            add(native.toString());
            if (Number.isInteger(raw)) {
                const plusOne = new URL(native.toString());
                plusOne.searchParams.set('page', String(raw + 1));
                add(plusOne.toString());
                if (raw > 0) {
                    const minusOne = new URL(native.toString());
                    minusOne.searchParams.set('page', String(raw - 1));
                    add(minusOne.toString());
                }
            }
        }

        const base = new URL(this.state?.baseUrl || this.canonicalMarketUrl(), location.origin);
        base.searchParams.delete('page');
        if (index > 0) {
            const byDisplay = new URL(base.toString());
            byDisplay.searchParams.set('page', String(index + 1));
            add(byDisplay.toString());
            const byIndex = new URL(base.toString());
            byIndex.searchParams.set('page', String(index));
            add(byIndex.toString());
        }
        return result;
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

    TransferCandidateScanner.fetchLogicalPage = async function fetchLogicalPage(pageIndex, seenSignatures) {
        const attempts = [];
        const nativeUrl = this.nativePageUrls instanceof Map ? this.nativePageUrls.get(pageIndex) : null;
        const nativeRaw = nativeUrl ? Number(new URL(nativeUrl, location.origin).searchParams.get('page')) : null;

        for (const pageUrl of this.pageUrlCandidates(pageIndex)) {
            try {
                const doc = await this.fetchDocumentUrl(pageUrl);
                this.rememberPaginationLinks(doc);
                const rows = this.parsePage(doc, pageIndex, pageUrl);
                const signature = this.pageSignature(rows);
                const duplicate = !!(signature && seenSignatures?.has(signature));
                attempts.push(`${this.pageRequestLabel(pageUrl)}:${rows.length}${duplicate ? ':duplicate' : ''}`);
                if (!rows.length || duplicate) continue;

                const acceptedRaw = Number(new URL(pageUrl, location.origin).searchParams.get('page'));
                if (Number.isInteger(nativeRaw) && Number.isInteger(acceptedRaw) && acceptedRaw !== nativeRaw) {
                    this.pageParamCorrection = acceptedRaw - nativeRaw;
                }
                return { doc, pageUrl, pageRows: rows, signature };
            } catch (error) {
                attempts.push(`${this.pageRequestLabel(pageUrl)}:${this.errorText(error)}`);
            }
        }
        throw new Error(`Не удалось получить уникальную страницу рынка ${pageIndex + 1}/${this.state.totalPages || '?'}. Попытки: ${attempts.join(' | ')}`);
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
        this.nativePageUrls = new Map();
        this.pageParamCorrection = null;
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
            let result;
            let pageRows;
            let signature;
            if (page === 0) {
                result = { doc: document, pageUrl: this.canonicalMarketUrl() };
                pageRows = this.parsePage(document, page, result.pageUrl);
                signature = this.pageSignature(pageRows);
            } else {
                const fetched = await this.fetchLogicalPage(page, seenSignatures);
                result = { doc: fetched.doc, pageUrl: fetched.pageUrl };
                pageRows = fetched.pageRows;
                signature = fetched.signature;
            }

            if (!pageRows.length) {
                throw new Error(`Пустая страница рынка ${page + 1}/${totalPages}. Запрос: ${this.pageRequestLabel(result.pageUrl)}. Нажми «Сбросить».`);
            }
            if (signature && seenSignatures.has(signature)) {
                throw new Error(`Повторная страница рынка ${page + 1}/${totalPages}. Запрос: ${this.pageRequestLabel(result.pageUrl)}. Нажми «Сбросить».`);
            }

            this.status(`Сканирование страницы ${page + 1}/${totalPages}: найдено ${pageRows.length}...`);
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
