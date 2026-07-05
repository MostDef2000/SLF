// Transfer Analyzer: row-analysis cache backfill from lower TM/SLF cache
// ============================================================
// Stable restore policy:
// - playerId is the canonical cache key
// - snapshot is primary when present
// - row-analysis cache is restored by playerId even if stored under a legacy key
// - lower TM/SLF caches are fallback and are backfilled into row-analysis cache

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const originalRenderRowBadge = TransferMarketAnalyzer.renderRowBadge;
    const SNAPSHOT_KEYS = [
        'slf_transfer_analysis_snapshot_cache_v2',
        'slf_transfer_analysis_snapshot_cache_v1'
    ];

    function directKey(rowOrId) {
        const id = typeof rowOrId === 'object'
            ? String(rowOrId?.playerId || '')
            : String(rowOrId || '');
        return id ? `slf:${id}` : '';
    }

    function snapshotKey(rowOrId) {
        const id = typeof rowOrId === 'object'
            ? String(rowOrId?.playerId || '')
            : String(rowOrId || '');
        return id ? `snap:slf:${id}` : '';
    }

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value || {}));
            return true;
        } catch (error) {
            console.warn('[SLF Transfer Analyzer] cache write failed', key, error);
            return false;
        }
    }

    function itemPlayerId(item) {
        return String(
            item?.playerId ||
            item?.row?.playerId ||
            item?.tmResult?.playerId ||
            ''
        ).trim();
    }

    function applySavedRowFields(target, cached) {
        const savedRow = cached?.row || {};
        target.slfPrice = target.slfPrice ?? savedRow.slfPrice ?? null;
        target.slfPriceText = target.slfPriceText || savedRow.slfPriceText || '';
        target.slfPriceCellText = target.slfPriceCellText || savedRow.slfPriceCellText || '';
        target.slfSecondaryPriceText = target.slfSecondaryPriceText || savedRow.slfSecondaryPriceText || '';
        target.slfSecondaryPrice = target.slfSecondaryPrice ?? savedRow.slfSecondaryPrice ?? null;
        target.nominalRatio = target.nominalRatio ?? savedRow.nominalRatio ?? null;
        target.nominalBase = target.nominalBase ?? savedRow.nominalBase ?? null;
        target.slfPriceSource = target.slfPriceSource || savedRow.slfPriceSource || '';
    }

    TransferMarketAnalyzer.hasUsefulAnalysisForCacheWrite = function hasUsefulAnalysisForCacheWrite(enriched, slfAlter) {
        const hasTmProfile = !!enriched?.tmProfile;
        const hasUsefulTmUrl = !!enriched?.tmUrl && !enriched?.error;
        const hasSlfAlter = !!slfAlter;
        return hasTmProfile || hasUsefulTmUrl || hasSlfAlter;
    };

    TransferMarketAnalyzer.findAnalysisCacheByPlayerId = function findAnalysisCacheByPlayerId(row) {
        const id = String(row?.playerId || '').trim();
        if (!id) return null;

        const cache = this.loadAnalysisCache ? this.loadAnalysisCache() : {};
        const primary = cache[directKey(id)];

        if (primary && !(this.isAnalysisCacheItemExpired && this.isAnalysisCacheItemExpired(primary))) {
            return primary;
        }

        const found = Object.values(cache || {}).find(item => {
            if (!item || itemPlayerId(item) !== id) return false;
            if (this.isAnalysisCacheItemExpired && this.isAnalysisCacheItemExpired(item)) return false;
            return true;
        });

        if (found) {
            cache[directKey(id)] = found;
            this.saveAnalysisCache?.(cache);
            return found;
        }

        return null;
    };

    TransferMarketAnalyzer.hasDirectRowAnalysisCache = function hasDirectRowAnalysisCache(row) {
        const item = this.findAnalysisCacheByPlayerId(row);
        if (!item) return false;
        return !!(this.hasRestorableAnalysisCacheItem ? this.hasRestorableAnalysisCacheItem(item) : item);
    };

    TransferMarketAnalyzer.findSnapshotByPlayerId = function findSnapshotByPlayerId(row) {
        const key = snapshotKey(row);
        if (!key) return null;

        for (const storageKey of SNAPSHOT_KEYS) {
            const cache = readJson(storageKey);
            const item = cache[key];
            if (!item || !item.badgeHtml) continue;
            return { item, storageKey, cache };
        }

        return null;
    };

    TransferMarketAnalyzer.restoreSnapshotByPlayerId = function restoreSnapshotByPlayerId(row) {
        const found = this.findSnapshotByPlayerId(row);
        if (!found) return false;

        const restored = this.restoreAnalysisSnapshot
            ? this.restoreAnalysisSnapshot(row, found.item)
            : false;

        if (restored && found.storageKey !== SNAPSHOT_KEYS[0]) {
            const current = readJson(SNAPSHOT_KEYS[0]);
            current[snapshotKey(row)] = found.item;
            writeJson(SNAPSHOT_KEYS[0], current);
        }

        return restored;
    };

    TransferMarketAnalyzer.saveDirectRowAnalysis = function saveDirectRowAnalysis(row, enriched, slfAlter) {
        if (!row?.playerId || !this.saveRowAnalysis) return false;

        this.saveRowAnalysis(row, enriched, slfAlter || null);

        const cache = this.loadAnalysisCache ? this.loadAnalysisCache() : {};
        const item = this.findAnalysisCacheByPlayerId(row);

        if (item) {
            cache[directKey(row)] = item;
            this.saveAnalysisCache?.(cache);
            return true;
        }

        return false;
    };

    if (typeof originalRenderRowBadge === 'function' && !originalRenderRowBadge.__slfCacheWriteThroughWrapped) {
        const wrappedRenderRowBadge = function renderRowBadgeWithCacheWriteThrough(row, enriched, slfAlter) {
            const result = originalRenderRowBadge.call(this, row, enriched, slfAlter);

            if (this.isHistoryPage && this.isHistoryPage()) return result;
            if (!row?.playerId) return result;
            if (!this.hasUsefulAnalysisForCacheWrite(enriched, slfAlter)) return result;

            try {
                this.saveDirectRowAnalysis(row, enriched, slfAlter || null);
            } catch (error) {
                console.warn('[SLF Transfer Analyzer] render badge cache write-through failed', row.playerId, error);
            }

            return result;
        };

        wrappedRenderRowBadge.__slfCacheWriteThroughWrapped = true;
        TransferMarketAnalyzer.renderRowBadge = wrappedRenderRowBadge;
    }

    TransferMarketAnalyzer.renderCachedRows = function renderCachedRowsStableByPlayerId() {
        const rows = this.parseVisibleRows();
        if (!rows.length) return;

        let snapshotRendered = 0;
        let rowCacheRendered = 0;
        let lowerCacheRendered = 0;
        let lowerCacheBackfilled = 0;
        let missing = 0;

        rows.forEach(row => {
            if (this.restoreSnapshotByPlayerId(row)) {
                snapshotRendered++;
                return;
            }

            const analysisCached = this.findAnalysisCacheByPlayerId(row);
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

            if (this.hasDirectRowAnalysisCache(row)) {
                lowerCacheBackfilled++;
            }
        });

        const rendered = snapshotRendered + rowCacheRendered + lowerCacheRendered;

        if (rendered) {
            this.setStatus(
                `Cache: snapshot ${snapshotRendered} · row ${rowCacheRendered} · TM/SLF ${lowerCacheRendered} · backfill ${lowerCacheBackfilled} · missing ${missing}.`
            );
        } else if (missing) {
            this.setStatus(`Cache не найден для видимых игроков: ${missing}. Нажми анализ, чтобы догрузить.`);
        }
    };

    const originalClearAnalysisCache = TransferMarketAnalyzer.clearAnalysisCache;
    TransferMarketAnalyzer.clearAnalysisCache = function clearAnalysisAndSnapshotCache() {
        originalClearAnalysisCache?.call(this);
        SNAPSHOT_KEYS.forEach(key => localStorage.removeItem(key));
    };
}());
