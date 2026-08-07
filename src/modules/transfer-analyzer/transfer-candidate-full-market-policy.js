// Transfer Candidate Scanner full-market policy
// =============================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.fullMarketPolicyApplied) {
    TransferCandidateScanner.fullMarketPolicyApplied = true;

    const previousStorageKey = TransferCandidateScanner.storageKey;
    const defaultsOriginal = TransferCandidateScanner.defaults;
    const mountOriginal = TransferCandidateScanner.mount;

    TransferCandidateScanner.storageKey = 'slf_transfer_candidate_scanner_v7_meta';
    TransferCandidateScanner.schema = 'slf_transfer_candidate_scanner_v7_meta';
    TransferCandidateScanner.legacyStorageKeys = [...new Set([
        ...(TransferCandidateScanner.legacyStorageKeys || []),
        previousStorageKey,
        'slf_transfer_candidate_scanner_v3_meta',
        'slf_transfer_candidate_scanner_v4_meta',
        'slf_transfer_candidate_scanner_v5_meta',
        'slf_transfer_candidate_scanner_v6_meta'
    ])];

    TransferCandidateScanner.legacyStorageKeys.forEach(key => {
        if (key && key !== TransferCandidateScanner.storageKey) localStorage.removeItem(key);
    });

    TransferCandidateScanner.defaults = function defaultsWithoutCandidateLimits() {
        const state = defaultsOriginal.apply(this, arguments);
        state.schema = this.schema;
        state.maxPrice = 0;
        return state;
    };

    TransferCandidateScanner.state = TransferCandidateScanner.defaults();
    TransferCandidateScanner.saveMeta();

    TransferCandidateScanner.removeInternalPriceControl = function removeInternalPriceControl() {
        const input = document.getElementById('slf-candidate-max-price');
        const label = input?.closest('label');
        if (label) label.remove();
        else input?.remove();
    };

    TransferCandidateScanner.mount = function mountWithoutInternalPriceFilter() {
        const result = mountOriginal.apply(this, arguments);
        this.removeInternalPriceControl();
        return result;
    };

    TransferCandidateScanner.removeInternalPriceControl();

    TransferCandidateScanner.readMaxPrice = function readMaxPriceDisabled() {
        this.state.maxPrice = 0;
        return 0;
    };

    TransferCandidateScanner.eligibleRows = function allIndexedPlayers() {
        return (this.rows || [])
            .filter(row => !!(row?.playerId || row?.transferId || row?.transferDetailUrl))
            .sort((a, b) => Number(b.preScore || 0) - Number(a.preScore || 0));
    };

    TransferCandidateScanner.enrichCandidates = async function enrichAllCandidates() {
        const candidates = this.eligibleRows();
        if (!candidates.length) {
            this.status('В текущей выдаче не найдено игроков для анализа.');
            return;
        }

        this.state.phase = 'enrich';
        const existing = this.dedupeRows(await this.readCollection(this.enrichedCollection));
        const enrichedByKey = new Map(existing.map(row => [row.key, row]));
        const candidateKeys = new Set(candidates.map(row => row.key));
        let done = candidates.filter(row => {
            const saved = enrichedByKey.get(row.key);
            return !!(saved?.enrichment?.completedAt && !saved.enrichment.error);
        }).length;
        this.state.enrichedPlayers = done;

        for (const sourceRow of candidates) {
            if (this.stopRequested) break;

            const saved = enrichedByKey.get(sourceRow.key);
            if (saved?.enrichment?.completedAt && !saved.enrichment.error) continue;

            this.status(`Анализ ${done + 1}/${candidates.length}: ${sourceRow.name}`);
            let enrichedRow;

            try {
                const row = typeof this.resolvePlayerIdentity === 'function'
                    ? await this.resolvePlayerIdentity({ ...sourceRow })
                    : sourceRow;
                if (!row?.playerId) throw new Error(`player_identity_missing_${row?.transferId || row?.key || 'unknown'}`);

                const alter = await SLFAlterLayer.getByPlayerId(row.playerId);
                let tm = null;
                try {
                    tm = await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);
                } catch (error) {
                    console.warn('[SLF Candidate Scanner] TM failed', row.playerId, error);
                }
                enrichedRow = { ...row, enrichment: this.buildEnrichment(row, alter, tm) };
            } catch (error) {
                enrichedRow = {
                    ...sourceRow,
                    enrichment: {
                        completedAt: Date.now(),
                        error: this.errorText ? this.errorText(error) : String(error?.message || error || 'enrichment_failed')
                    }
                };
            }

            await this.appendCollection(this.enrichedCollection, [enrichedRow], `candidate enriched ${enrichedRow.playerId || enrichedRow.transferId || enrichedRow.key}`);
            enrichedByKey.set(sourceRow.key, enrichedRow);

            if (!enrichedRow.enrichment?.error) done++;
            this.state.enrichedPlayers = done;
            this.saveMeta();

            if (done % 3 === 0 || done === candidates.length) {
                this.finalRows = this.rankRows([...enrichedByKey.values()]);
                this.render();
            }
            await this.delay(120);
        }

        this.finalRows = this.rankRows([...enrichedByKey.values()]);
        if (this.stopRequested) {
            this.status('Анализ остановлен. Прогресс сохранён на VPS.');
            return;
        }

        const failed = [...enrichedByKey.values()].filter(row => candidateKeys.has(row.key) && row.enrichment?.error).length;
        if (failed > 0) {
            this.stopRequested = true;
            this.status(`Не удалось проанализировать игроков: ${failed}. Нажми «Продолжить» для повторной попытки.`);
        }
    };

    TransferCandidateScanner.rankRows = function rankAllAnalyzedRows(rows) {
        return (rows || [])
            .filter(row => row.enrichment?.completedAt && !row.enrichment.error)
            .map(row => ({ ...row, score: Number(row.enrichment.score ?? -999) }))
            .filter(row => row.score > -100)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.resultLimit);
    };

    TransferCandidateScanner.renderProgress = function renderFullMarketProgress() {
        const element = document.getElementById('slf-candidate-progress');
        if (!element) return;
        element.textContent = `Этап: ${this.state.phase} · Страницы: ${this.state.scannedPages || 0}/${this.state.totalPages || '?'} · На VPS: ${this.state.indexedPlayers || 0} · Проанализировано: ${this.state.enrichedPlayers || 0}`;
    };

    // The 2026 market is a CSS grid made of div.fmx-row elements, not an HTML table.
    // Keep the legacy table parser intact and branch only when the real FM2026 grid is present.
    const findTableBeforeFm2026Grid = TransferCandidateScanner.findTable;
    const headerMapBeforeFm2026Grid = TransferCandidateScanner.headerMap;
    const parsePageBeforeFm2026Grid = TransferCandidateScanner.parsePage;

    TransferCandidateScanner.findFm2026MarketSurface = function findFm2026MarketSurface(doc = document) {
        const header = doc?.querySelector?.('.fmx-rows__head.fmx-tmarket');
        if (!header) return null;
        const card = header.closest?.('.fmx-card') || header.parentElement;
        if (!card?.querySelector?.('.fmx-row.fmx-tmarket')) return null;
        return card;
    };

    TransferCandidateScanner.isFm2026MarketSurface = function isFm2026MarketSurface(surface) {
        return !!(
            surface?.querySelector?.('.fmx-rows__head.fmx-tmarket') &&
            surface?.querySelector?.('.fmx-row.fmx-tmarket')
        );
    };

    TransferCandidateScanner.findTable = function findTableWithFm2026Grid(doc) {
        return this.findFm2026MarketSurface(doc) || findTableBeforeFm2026Grid.apply(this, arguments);
    };

    TransferCandidateScanner.headerMap = function headerMapWithFm2026Grid(surface) {
        if (this.isFm2026MarketSurface(surface)) {
            return {
                pos: 0,
                name: 1,
                club: 2,
                age: 3,
                talent: 4,
                potential: 5,
                skill: 6,
                nominal: 7,
                price: 8,
                end: 9,
                bids: 10,
                actions: 11
            };
        }
        return headerMapBeforeFm2026Grid.apply(this, arguments);
    };

    TransferCandidateScanner.getFm2026GridCells = function getFm2026GridCells(rowElement) {
        return [...(rowElement?.children || [])].filter(node => String(node.tagName || '').toLowerCase() === 'span');
    };

    TransferCandidateScanner.fm2026GridCellText = function fm2026GridCellText(cells, index) {
        return this.text(cells?.[index]?.textContent || '');
    };

    TransferCandidateScanner.parseFm2026GridRow = function parseFm2026GridRow(rowElement, index, page, pageUrl) {
        const cells = this.getFm2026GridCells(rowElement);
        if (cells.length < 11) return null;

        const direct = typeof this.findDirectPlayerAnchor === 'function'
            ? this.findDirectPlayerAnchor(rowElement)
            : null;
        const directAnchor = direct?.anchor || rowElement.querySelector('a[href*="player.php"][href*="id="]');
        const directHref = directAnchor?.getAttribute('href') || '';
        const directPlayerId = direct?.playerId ||
            (typeof this.playerIdFromHref === 'function' ? this.playerIdFromHref(directHref) : '') ||
            (directHref.match(/[?&]id=(\d+)/)?.[1] || '');

        const detail = typeof this.findTransferDetailAnchor === 'function'
            ? this.findTransferDetailAnchor(rowElement)
            : null;
        const detailAnchor = detail?.anchor || rowElement.querySelector('a.fmx-goto[href*="transfer_id="]');
        const detailHref = detailAnchor?.getAttribute('href') || '';
        const rowTransferId = (rowElement.id || '').match(/(?:tl|transfer)[-_]?(\d+)/i)?.[1] || '';
        const detailTransferId = detail?.transferId ||
            (typeof this.transferIdFromHref === 'function' ? this.transferIdFromHref(detailHref) : '') ||
            (detailHref.match(/[?&]transfer_id=(\d+)/)?.[1] || '');
        const transferId = detailTransferId || rowTransferId;
        if (!directPlayerId && !transferId) return null;

        const wideName = this.text(directAnchor?.querySelector?.('.wide_format')?.textContent || '');
        const directName = this.text(directAnchor?.getAttribute?.('title') || directAnchor?.textContent || '');
        const fallbackName = this.fm2026GridCellText(cells, 1);
        const name = wideName || directName || fallbackName || directPlayerId || (transferId ? `Трансфер #${transferId}` : 'Игрок');

        const positionText = this.fm2026GridCellText(cells, 0).toUpperCase();
        const positions = positionText.match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/g) || [];
        const clubAnchor = cells[2]?.querySelector?.('a[href*="roster.php"]');
        const potentialCell = cells[5];
        const potentialLevel = Number((potentialCell?.querySelector?.('img[src*="/potencial/"]')?.getAttribute('src') || '').match(/potencial\/(\d+)/)?.[1]) || null;
        const skillText = this.text(cells[6]?.querySelector?.('.fmx-rating')?.textContent || this.fm2026GridCellText(cells, 6));
        const priceText = this.fm2026GridCellText(cells, 8);
        const endDateText = this.text(cells[9]?.querySelector?.('.wide_format')?.textContent || this.fm2026GridCellText(cells, 9));
        const bidsText = this.text(cells[10]?.querySelector?.('.fmx-bets__count')?.textContent || this.fm2026GridCellText(cells, 10));
        const tm = rowElement.querySelector('.tm_field a[href*="transfermarkt"], a[href*="transfermarkt."]');
        const playerUrl = directPlayerId
            ? new URL(`/player.php?action=view&id=${encodeURIComponent(directPlayerId)}`, location.origin).toString()
            : '';
        const transferDetailUrl = detailHref
            ? new URL(detailHref, location.origin).toString()
            : transferId
                ? new URL(`/transfers.php?action=view&transfer_id=${encodeURIComponent(transferId)}`, location.origin).toString()
                : '';

        const row = {
            key: transferId ? `transfer:${transferId}` : `player:${directPlayerId}`,
            transferId,
            transferDetailUrl,
            playerId: String(directPlayerId || ''),
            page,
            pageUrl,
            originalIndex: index,
            name,
            playerUrl,
            positions: [...new Set(positions)],
            club: this.text(clubAnchor?.textContent || this.fm2026GridCellText(cells, 2)),
            age: this.number(this.fm2026GridCellText(cells, 3)),
            talent: this.number(this.fm2026GridCellText(cells, 4)),
            potentialLevel,
            potentialText: this.text(potentialCell?.querySelector?.('[title]')?.getAttribute('title') || ''),
            scoutSkill: this.number(skillText),
            price: this.money(priceText),
            bids: this.number(bidsText),
            endDateText,
            tmUrl: tm?.href || '',
            tmDisplayedValueEur: this.money(tm?.textContent || '')
        };
        row.preScore = this.preScore(row);
        return row;
    };

    TransferCandidateScanner.parsePage = function parsePageWithRealFm2026Grid(doc, page, pageUrl) {
        const surface = this.findFm2026MarketSurface(doc);
        if (!surface) return parsePageBeforeFm2026Grid.apply(this, arguments);

        const rows = [...surface.querySelectorAll('.fmx-row.fmx-tmarket')]
            .map((rowElement, index) => this.parseFm2026GridRow(rowElement, index, page, pageUrl))
            .filter(Boolean);

        return rows;
    };
}
