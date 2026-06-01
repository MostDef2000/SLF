// Team Management: Team4 marker cache persistence fix
// Stable cache keys: this patch does not introduce storage/schema versions.

const SLFTeam4MarkerCachePersistenceFix = (() => {
    const PATCH_FLAG = '__slfTeam4MarkerCachePersistenceFixPatched';

    function parseTime(value) {
        const timestamp = Date.parse(value || '');
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function markerScore(record) {
        return (Array.isArray(record?.markers) ? record.markers : [])
            .filter(marker => marker && String(marker.label || '').trim())
            .length;
    }

    function getRecordRichness(record) {
        if (!record || typeof record !== 'object') return 0;
        let score = 0;
        if (record.tmProfile) score += 20;
        if (record.tmProfile?.marketValueEur || record.tmProfile?.highestMarketValueEur) score += 8;
        if (record.tmProfile?.contractExpires || record.contractState || record.tmProfile?.contractState) score += 5;
        if (record.tmProfile?.activity) score += 5;
        if (record.trendInfo?.current || record.trendInfo?.peak) score += 5;
        if (record.tmError) score += 2;
        score += Math.min(markerScore(record), 8);
        return score;
    }

    function shouldKeepExisting(existing, incoming) {
        if (!existing || !incoming) return false;
        const existingRichness = getRecordRichness(existing);
        const incomingRichness = getRecordRichness(incoming);
        if (existingRichness >= 20 && incomingRichness < existingRichness) return true;
        if (existingRichness > incomingRichness && parseTime(existing.updatedAt) >= parseTime(incoming.updatedAt)) return true;
        return false;
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;
        panel.getRecordRichness = getRecordRichness;

        const originalSetSessionCached = panel.setSessionCached;
        if (typeof originalSetSessionCached === 'function') {
            panel.setSessionCached = function patchedSetSessionCached(row, data) {
                const key = this.playerKey?.(row) || data?.key || '';
                const existing = key ? this.sessionCache?.get(key) : null;
                if (shouldKeepExisting(existing, data)) {
                    if (row && existing) this.sessionCache.set(key, existing);
                    if (existing?.key) this.sessionCache.set(existing.key, existing);
                    return existing;
                }
                return originalSetSessionCached.call(this, row, data);
            };
        }

        const originalPutSessionRecord = panel.putSessionRecord;
        if (typeof originalPutSessionRecord === 'function') {
            panel.putSessionRecord = function patchedPutSessionRecord(record) {
                const normalized = this.normalizeRecord?.(record);
                if (!normalized) return false;
                const existing = this.sessionCache?.get(normalized.key);
                if (shouldKeepExisting(existing, normalized)) return false;
                return originalPutSessionRecord.call(this, record);
            };
        }

        const originalRefreshRow = panel.refreshRow;
        if (typeof originalRefreshRow === 'function') {
            panel.refreshRow = async function patchedRefreshRow(row, indexMap, seq) {
                await originalRefreshRow.call(this, row, indexMap, seq);
                const cached = this.getSessionCached?.(row);
                if (getRecordRichness(cached) >= 20) this.saveToLocalStorage?.();
            };
        }

        try {
            panel.saveToLocalStorage?.();
        } catch (error) {
            console.warn('[SLF Team4 Cache] initial save failed', error);
        }
        return true;
    }

    function start() {
        const run = () => {
            try {
                if (patchPanel()) return;
                const timer = setInterval(() => {
                    if (patchPanel()) clearInterval(timer);
                }, 250);
                setTimeout(() => clearInterval(timer), 10000);
            } catch (error) {
                console.error('[SLF Team4 Cache] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { getRecordRichness, shouldKeepExisting, start };
    window.SLFTeam4MarkerCachePersistenceFix = api;
    return api;
})();

SLFTeam4MarkerCachePersistenceFix.start();
