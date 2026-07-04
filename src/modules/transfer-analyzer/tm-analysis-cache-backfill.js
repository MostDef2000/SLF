// Transfer Analyzer: row-analysis cache backfill from lower TM/SLF cache
// ============================================================
// When a row can be rendered from TMEnrichmentLayer / SLFAlterLayer cache,
// persist the same compact row-analysis cache snapshot so the next refresh can
// restore it through getCachedAnalysis().

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    TransferMarketAnalyzer.renderCachedRows = function renderCachedRowsWithBackfill() {
        const rows = this.parseVisibleRows();

        if (!rows.length) return;

        let rowCacheRendered = 0;
        let lowerCacheRendered = 0;
        let lowerCacheBackfilled = 0;
        let missing = 0;

        rows.forEach(row => {
            const analysisCached = this.getCachedAnalysis(row);

            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                rowCacheRendered++;
                return;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);

            if (!tmCached && !alterCached) {
                missing++;
                return;
            }

            const tmResult = tmCached || {
                playerId: row.playerId,
                slfUrl: row.playerUrl,
                tmUrl: '',
                tmProfile: null,
                error: 'not_cached'
            };

            row.tmUrl = tmResult.tmUrl || '';
            row.tmProfile = tmResult.tmProfile || null;
            row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
            row.slfAlter = alterCached || null;

            this.renderRowBadge(row, tmResult, alterCached || null);
            lowerCacheRendered++;

            try {
                this.saveRowAnalysis(row, tmResult, alterCached || null);
                lowerCacheBackfilled++;
            } catch (error) {
                console.warn('[SLF Transfer Analyzer] lower-cache backfill failed', row.playerId, error);
            }
        });

        const rendered = rowCacheRendered + lowerCacheRendered;

        if (rendered) {
            this.setStatus(
                `Из row cache: ${rowCacheRendered} · из TM/SLF cache: ${lowerCacheRendered} · backfill: ${lowerCacheBackfilled} · нет cache: ${missing}.`
            );
        } else if (missing) {
            this.setStatus(`Cache не найден для видимых игроков: ${missing}. Нажми анализ, чтобы догрузить.`);
        }
    };
}());
