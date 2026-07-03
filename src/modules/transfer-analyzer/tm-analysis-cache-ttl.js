// Transfer Analyzer: 7-day TM analysis cache policy
// ============================================================

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const TM_ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const originalLoadAnalysisCache = TransferMarketAnalyzer.loadAnalysisCache;
    const originalSaveAnalysisCache = TransferMarketAnalyzer.saveAnalysisCache;
    const originalMount = TransferMarketAnalyzer.mount;
    const originalAnalyzeVisibleRows = TransferMarketAnalyzer.analyzeVisibleRows;

    TransferMarketAnalyzer.analysisCacheTtlMs = TM_ANALYSIS_CACHE_TTL_MS;

    TransferMarketAnalyzer.isAnalysisCacheItemExpired = function isAnalysisCacheItemExpired(item, now = Date.now()) {
        const savedAt = Number(item?.savedAt || 0);
        return !savedAt || now - savedAt > this.analysisCacheTtlMs;
    };

    TransferMarketAnalyzer.pruneExpiredAnalysisCache = function pruneExpiredAnalysisCache(cache = null) {
        const current = cache || originalLoadAnalysisCache.call(this);
        const now = Date.now();
        let changed = false;

        Object.keys(current || {}).forEach(key => {
            if (this.isAnalysisCacheItemExpired(current[key], now)) {
                delete current[key];
                changed = true;
            }
        });

        if (changed) {
            originalSaveAnalysisCache.call(this, current);
        }

        return current || {};
    };

    TransferMarketAnalyzer.loadAnalysisCache = function loadAnalysisCacheWithTtlCleanup() {
        return this.pruneExpiredAnalysisCache(originalLoadAnalysisCache.call(this));
    };

    TransferMarketAnalyzer.saveAnalysisCache = function saveAnalysisCacheWithTtlCleanup(cache) {
        const pruned = this.pruneExpiredAnalysisCache(cache || {});
        originalSaveAnalysisCache.call(this, pruned);
    };

    TransferMarketAnalyzer.mount = function mountWithTtlCleanup() {
        if (this.isPage && this.isPage() && !this.isHistoryPage()) {
            this.pruneExpiredAnalysisCache();
        }

        return originalMount.call(this);
    };

    TransferMarketAnalyzer.analyzeVisibleRows = async function analyzeVisibleRowsWithTtlCleanup() {
        if (this.isHistoryPage && !this.isHistoryPage()) {
            this.pruneExpiredAnalysisCache();
        }

        return originalAnalyzeVisibleRows.call(this);
    };
}());
