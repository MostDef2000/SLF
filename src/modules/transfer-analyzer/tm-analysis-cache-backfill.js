// Transfer Analyzer: row-analysis cache backfill from lower TM/SLF cache
// ============================================================
// When a row can be rendered from TMEnrichmentLayer / SLFAlterLayer cache,
// persist the same compact row-analysis cache snapshot so the next refresh can
// restore it through getCachedAnalysis(). Also make renderRowBadge write-through:
// every rendered TM Analysis badge gets a compact row-cache snapshot.

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const originalRenderRowBadge = TransferMarketAnalyzer.renderRowBadge;

    TransferMarketAnalyzer.hasUsefulAnalysisForCacheWrite = function hasUsefulAnalysisForCacheWrite(enriched, slfAlter) {
        const hasTmProfile = !!enriched?.tmProfile;
        const hasUsefulTmUrl = !!enriched?.tmUrl && !enriched?.error;
        const hasSlfAlter = !!slfAlter;
        return hasTmProfile || hasUsefulTmUrl || hasSlfAlter;
    };

    TransferMarketAnalyzer.hasRenderedAnalysisBadgeForCacheWrite = function hasRenderedAnalysisBadgeForCacheWrite(row) {
        const badge = row?.rowEl?.querySelector?.('.slf-transfer-analysis-badge');
        const text = String(badge?.innerText || badge?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        const html = String(badge?.innerHTML || '').trim();

        if (!badge || !text || !html) return false;

        const lower = text.toLowerCase();
        if (lower.includes('tm/slf анализ')) return false;
        if (lower.includes('анализ...')) return false;
        if (lower.includes('ошибка анализа')) return false;

        return true;
    };

    TransferMarketAnalyzer.buildDisplaySnapshotTmResult = function buildDisplaySnapshotTmResult(row, enriched) {
        if (enriched && typeof enriched === 'object') return enriched;

        return {
            playerId: row?.playerId || '',
            slfUrl: row?.playerUrl || '',
            tmUrl: row?.tmUrl || '',
            tmProfile: row?.tmProfile || null,
            error: 'display_snapshot_only'
        };
    };

    TransferMarketAnalyzer.hasDirectRowAnalysisCache = function hasDirectRowAnalysisCache(row) {
        if (!row?.playerId) return false;
        const cache = this.loadAnalysisCache ? this.loadAnalysisCache() : {};
        const item = cache[`slf:${row.playerId}`];
        if (!item) return false;
        if (this.isAnalysisCacheItemExpired && this.isAnalysisCacheItemExpired(item)) return false;
        return !!(this.hasRestorableAnalysisCacheItem ? this.hasRestorableAnalysisCacheItem(item) : item);
    };

    if (typeof originalRenderRowBadge === 'function' && !originalRenderRowBadge.__slfCacheWriteThroughWrapped) {
        const wrappedRenderRowBadge = function renderRowBadgeWithCacheWriteThrough(row, enriched, slfAlter) {
            const result = originalRenderRowBadge.call(this, row, enriched, slfAlter);

            if (this.isHistoryPage && this.isHistoryPage()) return result;
            if (!row?.playerId) return result;

            const hasUsefulPayload = this.hasUsefulAnalysisForCacheWrite(enriched, slfAlter);
            const hasRenderedBadge = this.hasRenderedAnalysisBadgeForCacheWrite(row);

            if (!hasUsefulPayload && !hasRenderedBadge) return result;
            if (this.hasDirectRowAnalysisCache(row)) return result;

            try {
                this.saveRowAnalysis(
                    row,
                    this.buildDisplaySnapshotTmResult(row, enriched),
                    slfAlter || null
                );
            } catch (error) {
                console.warn('[SLF Transfer Analyzer] render badge cache write-through failed', row.playerId, error);
            }

            return result;
        };

        wrappedRenderRowBadge.__slfCacheWriteThroughWrapped = true;
        TransferMarketAnalyzer.renderRowBadge = wrappedRenderRowBadge;
    }

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

            const hadDirectRowCache = this.hasDirectRowAnalysisCache(row);
            const canBackfill = this.hasUsefulAnalysisForCacheWrite(tmResult, alterCached || null);

            this.renderRowBadge(row, tmResult, alterCached || null);
            lowerCacheRendered++;

            if (!hadDirectRowCache && canBackfill && this.hasDirectRowAnalysisCache(row)) {
                lowerCacheBackfilled++;
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
