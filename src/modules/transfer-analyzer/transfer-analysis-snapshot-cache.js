// Transfer Analyzer: durable row analysis snapshot cache
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfSnapshotCacheApplied) {
    TransferMarketAnalyzer.slfSnapshotCacheApplied = true;

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    TransferMarketAnalyzer.analysisCacheTtlMs = SEVEN_DAYS_MS;
    TransferMarketAnalyzer.snapshotCacheKey = 'slf_transfer_analysis_snapshot_cache_v1';
    TransferMarketAnalyzer.snapshotCacheTtlMs = SEVEN_DAYS_MS;

    if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
        TMEnrichmentLayer.cacheTtlMs = SEVEN_DAYS_MS;
    }

    if (typeof SLFAlterLayer !== 'undefined' && SLFAlterLayer) {
        SLFAlterLayer.cacheTtlMs = SEVEN_DAYS_MS;
    }

    const originalRenderRowBadge = TransferMarketAnalyzer.renderRowBadge;

    function safeJsonParse(value) {
        try {
            return JSON.parse(value || '{}') || {};
        } catch (error) {
            return {};
        }
    }

    function isExpired(item, ttlMs) {
        const savedAt = Number(item && item.savedAt || 0);
        return !savedAt || Date.now() - savedAt > ttlMs;
    }

    function compactRow(row) {
        return {
            playerId: String(row && row.playerId || ''),
            playerUrl: row && row.playerUrl || '',
            name: row && row.name || '',
            positions: Array.isArray(row && row.positions) ? row.positions : [],
            age: row && row.age != null ? row.age : null,
            talent: row && row.talent != null ? row.talent : null,
            scoutSkill: row && row.scoutSkill != null ? row.scoutSkill : null,
            slfPriceText: row && row.slfPriceText || row && row.salePriceText || '',
            slfPriceCellText: row && row.slfPriceCellText || '',
            slfPrice: row && row.slfPrice != null ? row.slfPrice : row && row.salePrice != null ? row.salePrice : null,
            slfSecondaryPriceText: row && row.slfSecondaryPriceText || '',
            slfSecondaryPrice: row && row.slfSecondaryPrice != null ? row.slfSecondaryPrice : null,
            nominalRatio: row && row.nominalRatio != null ? row.nominalRatio : null,
            nominalBase: row && row.nominalBase != null ? row.nominalBase : null,
            slfPriceSource: row && row.slfPriceSource || ''
        };
    }

    function compactDataset(tr) {
        const dataset = tr && tr.dataset || {};
        return {
            slfAnalyzerScore: dataset.slfAnalyzerScore || '',
            slfSkillDelta: dataset.slfSkillDelta || '',
            slfMinutesPct: dataset.slfMinutesPct || '',
            slfTalentUp: dataset.slfTalentUp || '',
            slfTmValue: dataset.slfTmValue || '',
            slfMktBargain: dataset.slfMktBargain || '',
            slfMktOverpriced: dataset.slfMktOverpriced || ''
        };
    }

    function applySavedRowFields(target, saved) {
        const row = saved && saved.row || {};
        target.slfPrice = target.slfPrice != null ? target.slfPrice : row.slfPrice != null ? row.slfPrice : null;
        target.slfPriceText = target.slfPriceText || row.slfPriceText || '';
        target.slfPriceCellText = target.slfPriceCellText || row.slfPriceCellText || '';
        target.slfSecondaryPriceText = target.slfSecondaryPriceText || row.slfSecondaryPriceText || '';
        target.slfSecondaryPrice = target.slfSecondaryPrice != null ? target.slfSecondaryPrice : row.slfSecondaryPrice != null ? row.slfSecondaryPrice : null;
        target.nominalRatio = target.nominalRatio != null ? target.nominalRatio : row.nominalRatio != null ? row.nominalRatio : null;
        target.nominalBase = target.nominalBase != null ? target.nominalBase : row.nominalBase != null ? row.nominalBase : null;
        target.slfPriceSource = target.slfPriceSource || row.slfPriceSource || '';
    }

    TransferMarketAnalyzer.loadSnapshotCache = function loadSnapshotCache() {
        return safeJsonParse(localStorage.getItem(this.snapshotCacheKey));
    };

    TransferMarketAnalyzer.saveSnapshotCache = function saveSnapshotCache(cache) {
        const ttlMs = this.snapshotCacheTtlMs || SEVEN_DAYS_MS;
        const entries = Object.entries(cache || {})
            .filter(([, value]) => value && !isExpired(value, ttlMs))
            .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0));

        const trySave = limit => {
            localStorage.setItem(this.snapshotCacheKey, JSON.stringify(Object.fromEntries(entries.slice(0, limit))));
        };

        try {
            trySave(500);
        } catch (firstError) {
            try {
                trySave(250);
            } catch (secondError) {
                try {
                    trySave(100);
                } catch (thirdError) {
                    console.warn('[SLF Transfer Snapshot] cache save failed', thirdError);
                    this.setStatus && this.setStatus('Snapshot cache не сохранился: localStorage quota.');
                }
            }
        }
    };

    TransferMarketAnalyzer.buildSnapshotCacheKeys = function buildSnapshotCacheKeys(row, enriched) {
        const keys = [];
        const playerId = String(row && row.playerId || enriched && enriched.playerId || '').trim();
        const tmId = String(enriched && enriched.tmProfile && enriched.tmProfile.tmId || row && row.tmProfile && row.tmProfile.tmId || '').trim();

        if (playerId) keys.push('snap:slf:' + playerId);
        if (tmId) keys.push('snap:tm:' + tmId);

        return Array.from(new Set(keys));
    };

    TransferMarketAnalyzer.getCachedAnalysisSnapshot = function getCachedAnalysisSnapshot(row) {
        const cache = this.loadSnapshotCache();
        const keys = this.buildSnapshotCacheKeys(row, null);
        const ttlMs = this.snapshotCacheTtlMs || SEVEN_DAYS_MS;

        for (const key of keys) {
            const item = cache[key];
            if (!item || isExpired(item, ttlMs)) continue;
            if (!item.badgeHtml) continue;
            return item;
        }

        return null;
    };

    TransferMarketAnalyzer.saveAnalysisSnapshot = function saveAnalysisSnapshot(row, enriched, slfAlter) {
        if (!row || !row.playerId || !row.rowEl) return;

        const box = row.rowEl.querySelector('.slf-transfer-analysis-badge');
        const badgeHtml = String(box && box.innerHTML || '').trim();
        const badgeText = String(box && (box.innerText || box.textContent) || '').replace(/\s+/g, ' ').trim();

        if (!badgeHtml || !badgeText) return;

        const profile = enriched && enriched.tmProfile || null;
        const complete = !!profile && !!slfAlter && slfAlter.finalSkill != null;
        const snapshot = {
            schema: 'transfer_analysis_snapshot_v1',
            savedAt: Date.now(),
            playerId: String(row.playerId || ''),
            name: row.name || '',
            tmUrl: enriched && (enriched.tmUrl || profile && profile.tmUrl) || '',
            tmId: profile && profile.tmId || '',
            quality: complete ? 'complete' : 'partial',
            badgeHtml: badgeHtml.slice(0, 50000),
            badgeText: badgeText.slice(0, 1800),
            row: compactRow(row),
            dataset: compactDataset(row.rowEl)
        };

        const cache = this.loadSnapshotCache();
        this.buildSnapshotCacheKeys(row, enriched).forEach(key => {
            cache[key] = snapshot;
        });
        this.saveSnapshotCache(cache);
    };

    TransferMarketAnalyzer.restoreAnalysisSnapshot = function restoreAnalysisSnapshot(row, snapshot) {
        if (!row || !snapshot || !snapshot.badgeHtml) return false;

        applySavedRowFields(row, snapshot);

        const box = this.getOrCreateBadgeCell ? this.getOrCreateBadgeCell(row) : row.rowEl && row.rowEl.querySelector('.slf-transfer-analysis-badge');
        if (!box) return false;

        box.innerHTML = snapshot.badgeHtml;

        const dataset = snapshot.dataset || {};
        Object.keys(dataset).forEach(key => {
            if (dataset[key] !== '') row.rowEl.dataset[key] = String(dataset[key]);
        });

        try {
            this.bindDetailsAutoClose && this.bindDetailsAutoClose();
            this.bindHtmlTooltipPortal && this.bindHtmlTooltipPortal(box);
            this.cleanupStandaloneMarketNominalControls && this.cleanupStandaloneMarketNominalControls(box);
            this.refreshVisibleRankBadges && this.refreshVisibleRankBadges();
        } catch (error) {
            console.warn('[SLF Transfer Snapshot] restore post-bind failed', row.playerId, error);
        }

        return true;
    };

    TransferMarketAnalyzer.renderRowBadge = function renderRowBadgeWithSnapshot(row, enriched, slfAlter) {
        const result = originalRenderRowBadge.apply(this, arguments);
        if (!this.isHistoryPage || !this.isHistoryPage()) {
            this.saveAnalysisSnapshot(row, enriched, slfAlter);
        }
        return result;
    };

    TransferMarketAnalyzer.renderCachedRows = function renderCachedRowsSnapshotFirst() {
        const rows = this.parseVisibleRows();
        if (!rows.length) return;

        const stats = { restored: 0, partial: 0, missing: 0 };

        rows.forEach(row => {
            const snapshot = this.getCachedAnalysisSnapshot(row);
            if (snapshot && this.restoreAnalysisSnapshot(row, snapshot)) {
                if (snapshot.quality === 'complete') stats.restored++;
                else stats.partial++;
                return;
            }

            const analysisCached = this.getCachedAnalysis(row);
            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                const complete = !!analysisCached.tmResult && !!analysisCached.tmResult.tmProfile && !!analysisCached.slfAlter && analysisCached.slfAlter.finalSkill != null;
                if (complete) stats.restored++;
                else stats.partial++;
                return;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);

            if (!tmCached && !alterCached) {
                stats.missing++;
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
            row.tmValueEur = row.tmProfile && (row.tmProfile.marketValueEur || row.tmProfile.lastKnownMarketValueEur) || 0;
            row.slfAlter = alterCached || null;

            this.renderRowBadge(row, tmResult, alterCached || null);
            stats.partial++;
        });

        this.setStatus(`Cache: restored ${stats.restored}/${rows.length}, partial ${stats.partial}, missing ${stats.missing}`);
    };
}
