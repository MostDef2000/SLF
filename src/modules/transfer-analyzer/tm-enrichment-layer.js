// 12. TM Enrichment Layer
// ============================================================

const TMEnrichmentLayer = {
    cacheKey: 'slf_tm_enrichment_cache_v6',
    cacheTtlMs: 1000 * 60 * 60 * 24 * (CONFIG.TRANSFER_ANALYZER?.cacheTtlDays || 7),
    requestDelayMs: CONFIG.TRANSFER_ANALYZER?.requestDelayMs || 900,
    _lastRequestAt: 0,

};
