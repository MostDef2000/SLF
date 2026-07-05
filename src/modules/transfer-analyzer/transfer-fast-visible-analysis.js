// Transfer Analyzer: fast visible analysis
// ========================================
// Safe speed-up for active transfer page:
// - cache-first restore
// - limited parallel analysis
// - TM + SLF requests in parallel per player
// - reduced rank recalculation pressure during batch

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const A = TransferMarketAnalyzer;
    const CONCURRENCY = 3;

    function playerLabel(row) {
        return row?.name || row?.playerId || 'player';
    }

    async function mapLimit(items, limit, worker) {
        let cursor = 0;
        const results = [];
        const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                results[index] = await worker(items[index], index);
            }
        });
        await Promise.all(workers);
        return results;
    }

    async function analyzeOne(row, index, total) {
        const cached = this.getCachedAnalysis?.(row);
        if (cached && this.applyCachedAnalysis?.(row, cached)) {
            return { status: 'cache', row };
        }

        const tmCached = typeof TMEnrichmentLayer !== 'undefined'
            ? TMEnrichmentLayer.peekBySlfPlayerId(row.playerId)
            : null;
        const alterCached = typeof SLFAlterLayer !== 'undefined'
            ? SLFAlterLayer.peekByPlayerId(row.playerId)
            : null;

        const fromCache = !!tmCached && !!alterCached;

        if (!fromCache) {
            this.renderLoadingBadge?.(row);
        }

        try {
            const tmPromise = tmCached
                ? Promise.resolve(tmCached)
                : TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

            const alterPromise = alterCached
                ? Promise.resolve(alterCached)
                : SLFAlterLayer.getByPlayerId(row.playerId).catch(error => {
                    console.warn('[SLF Transfer Analyzer] alter.php failed', row.playerId, error);
                    return null;
                });

            const [tmResult, slfAlter] = await Promise.all([tmPromise, alterPromise]);

            row.tmUrl = tmResult?.tmUrl || '';
            row.tmProfile = tmResult?.tmProfile || null;
            row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
            row.slfAlter = slfAlter || null;

            this.renderRowBadge?.(row, tmResult, slfAlter || null);
            this.saveRowAnalysis?.(row, tmResult, slfAlter || null);
            window.SLF?.PlayerStateStore?.saveAnalysis?.(row, tmResult, slfAlter || null);

            return { status: fromCache ? 'lower-cache' : 'analyzed', row };
        } catch (error) {
            console.error('[SLF Transfer Analyzer] row failed', row, error);
            this.renderErrorBadge?.(row, error);
            return { status: 'error', row, error };
        }
    }

    A.analyzeVisibleRows = async function analyzeVisibleRowsFast() {
        if (this.isHistoryPage?.()) {
            await this.analyzeHistoryVisibleRows();
            return;
        }

        const rows = this.parseVisibleRows?.() || [];

        if (!rows.length) {
            this.setStatus?.('Игроки не найдены.');
            return;
        }

        await this.loadMarketBaseline?.();

        let done = 0;
        let cache = 0;
        let lowerCache = 0;
        let analyzed = 0;
        let errors = 0;

        const originalRefreshRanks = this.refreshVisibleRankBadges;
        let refreshSuppressed = false;

        if (typeof originalRefreshRanks === 'function') {
            this.refreshVisibleRankBadges = function noopDuringFastAnalysis() {};
            refreshSuppressed = true;
        }

        this.setStatus?.(`Fast анализ: ${rows.length} игроков, parallel ${CONCURRENCY}...`);

        try {
            await mapLimit(rows, CONCURRENCY, async (row, index) => {
                const result = await analyzeOne.call(this, row, index, rows.length);
                done++;

                if (result.status === 'cache') cache++;
                else if (result.status === 'lower-cache') lowerCache++;
                else if (result.status === 'analyzed') analyzed++;
                else if (result.status === 'error') errors++;

                if (done === rows.length || done % 3 === 0) {
                    this.setStatus?.(`Fast ${done}/${rows.length}: cache ${cache}, lower ${lowerCache}, analyzed ${analyzed}, errors ${errors}`);
                }

                return result;
            });
        } finally {
            if (refreshSuppressed) {
                this.refreshVisibleRankBadges = originalRefreshRanks;
                try {
                    this.refreshVisibleRankBadges?.();
                } catch (error) {
                    console.warn('[SLF Transfer Analyzer] rank refresh failed after fast analysis', error);
                }
            }
        }

        this.setStatus?.(`Готово fast: ${rows.length} игроков · cache ${cache} · lower ${lowerCache} · analyzed ${analyzed} · errors ${errors}`);
    };

    console.log('[SLF Transfer Analyzer] fast visible analysis active', { concurrency: CONCURRENCY });
}());
