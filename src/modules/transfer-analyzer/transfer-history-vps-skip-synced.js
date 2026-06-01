// Transfer history VPS skip-synced guard
// Prevents Analyze visible from reprocessing rows already marked as synced in VPS.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.isHistoryRowSyncedInVps = function isHistoryRowSyncedInVps(row, alreadySubmitted) {
        if (!row) return false;

        const badgeText = this.normalizeText(row.rowEl?.querySelector('.slf-transfer-analysis-badge')?.innerText || '');
        if (/✓\s*VPS/i.test(badgeText)) return true;

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
            (eventKeySource && row.dataset?.slfHistoryEventKeySource === eventKeySource)
        );
    };

    TransferMarketAnalyzer.analyzeHistoryVisibleRows = async function analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();

        if (!rows.length) {
            this.setStatus('История трансферов: строки не найдены.');
            return;
        }

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const eventsToSend = [];
        let skipped = 0;
        let failed = 0;

        const pendingRows = [];

        for (const row of rows) {
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);
            row.historyEventKey = eventKey;

            if (alreadySubmitted[eventKey] || this.isHistoryRowSyncedInVps(row, alreadySubmitted)) {
                skipped++;
                this.renderHistoryVpsBadge(row, { confidence: 'local', key: eventKey, record: {} });
                continue;
            }

            pendingRows.push(row);
        }

        if (!pendingRows.length) {
            this.setStatus(`История готова: видимых строк ${rows.length}, уже в VPS ${skipped}, новых к анализу 0.`);
            return;
        }

        this.setStatus(`История: видимых строк ${rows.length}, уже в VPS ${skipped}, к анализу ${pendingRows.length}.`);

        for (let i = 0; i < pendingRows.length; i++) {
            const row = pendingRows[i];
            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`История ${i + 1}/${pendingRows.length}: ${fromCache ? 'cache' : 'анализ'} ${row.name || row.playerId}`);

            this.renderHistorySyncStatus(row, '… VPS', 'pending');

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

                const event = await this.buildTransferHistoryEvent(row, tmResult, slfAlter);
                eventsToSend.push(event);
                this.renderHistoryVpsBadge(row, { confidence: 'queued', key: event.eventKey, record: event });
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                this.renderHistorySyncStatus(row, 'ERR', 'error');

                try {
                    const fallbackEvent = await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null);
                    fallbackEvent.analysisFailed = true;
                    fallbackEvent.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallbackEvent);
                    this.renderHistoryVpsBadge(row, { confidence: 'fallback', key: fallbackEvent.eventKey, record: fallbackEvent });
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            this.sendTransferHistoryEvents(eventsToSend);
        }

        this.setStatus(
            `История готова: подготовлено к отправке ${eventsToSend.length}, уже в VPS ${skipped}, ошибок ${failed}.`
        );
    };
}
