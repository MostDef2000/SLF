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
}
