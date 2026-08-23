// Tm Enrichment Cache
// Extracted verbatim from tm-enrichment-layer.js (stage 3 refactor).
// Assigned onto the TMEnrichmentLayer facade; behaviour unchanged.

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
    TMEnrichmentLayer.stage3TmEnrichmentCacheApplied = true;

    Object.assign(TMEnrichmentLayer, {
    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('[SLF TM] cache save failed', e);
        }
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    getCache(key) {
        const cache = this.loadCache();
        const item = cache[key];

        if (!item) return null;

        const fetchedAt = Number(item.fetchedAt || 0);

        if (!fetchedAt || Date.now() - fetchedAt > this.cacheTtlMs) {
            return null;
        }

        return item;
    },

    peekBySlfPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;

        return this.getCache(`slf:${id}`);
    },

    setCache(key, value) {
        const cache = this.loadCache();

        cache[key] = {
            ...value,
            fetchedAt: Date.now()
        };

        this.saveCache(cache);
    },

    });
}
