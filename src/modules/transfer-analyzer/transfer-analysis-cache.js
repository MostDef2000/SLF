// Transfer Analysis Cache
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1AnalysisCacheApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    loadAnalysisCache() {
        try {
            return JSON.parse(localStorage.getItem(this.analysisCacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveAnalysisCache(cache) {
        try {
            const entries = Object.entries(cache || {})
                .filter(([, value]) => value && Number(value.savedAt || 0))
                .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
                .slice(0, 700);

            localStorage.setItem(this.analysisCacheKey, JSON.stringify(Object.fromEntries(entries)));
        } catch (e) {
            console.warn('[SLF Transfer Analyzer] analysis cache save failed', e);
        }
    },

    clearAnalysisCache() {
        localStorage.removeItem(this.analysisCacheKey);
    },

    buildAnalysisCacheKeys(row, enriched) {
        const keys = [];
        const playerId = String(row?.playerId || enriched?.playerId || '').trim();
        const tmId = String(enriched?.tmProfile?.tmId || row?.tmProfile?.tmId || '').trim();

        if (playerId) keys.push(`slf:${playerId}`);
        if (tmId) keys.push(`tm:${tmId}`);

        return [...new Set(keys)];
    },

    getCachedAnalysis(row) {
        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, null);

        for (const key of keys) {
            const item = cache[key];
            if (!item) continue;

            const savedAt = Number(item.savedAt || 0);
            if (!savedAt || Date.now() - savedAt > this.analysisCacheTtlMs) continue;

            // 4.4.72: MKT must be based on alter.php final skill.
            // Old row-analysis cache without finalSkill is intentionally ignored
            // so pressing Analyze fetches/uses SLFAlterLayer instead of silently
            // reusing current-skill based MKT output.
            if (!item.slfAlter || item.slfAlter.finalSkill == null) continue;

            return item;
        }

        return null;
    },

    saveRowAnalysis(row, enriched, slfAlter) {
        if (!row?.playerId) return;

        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, enriched);
        const item = {
            schema: 'transfer_row_analysis_cache_v1',
            savedAt: Date.now(),
            playerId: String(row.playerId || ''),
            name: row.name || '',
            tmResult: enriched || null,
            slfAlter: slfAlter || null,
            row: {
                playerId: String(row.playerId || ''),
                playerUrl: row.playerUrl || '',
                name: row.name || '',
                positions: row.positions || [],
                age: row.age ?? null,
                talent: row.talent ?? null,
                scoutSkill: row.scoutSkill ?? null,
                slfPriceText: row.slfPriceText || row.salePriceText || '',
                slfPriceCellText: row.slfPriceCellText || '',
                slfPrice: row.slfPrice ?? row.salePrice ?? null,
                slfSecondaryPriceText: row.slfSecondaryPriceText || '',
                slfSecondaryPrice: row.slfSecondaryPrice ?? null,
                nominalRatio: row.nominalRatio ?? null,
                nominalBase: row.nominalBase ?? null,
                slfPriceSource: row.slfPriceSource || ''
            }
        };

        keys.forEach(key => {
            cache[key] = item;
        });

        this.saveAnalysisCache(cache);
    },

    applyCachedAnalysis(row, cached) {
        if (!row || !cached) return false;

        const savedRow = cached.row || {};
        row.tmUrl = cached.tmResult?.tmUrl || cached.tmResult?.tmProfile?.tmUrl || '';
        row.tmProfile = cached.tmResult?.tmProfile || null;
        row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
        row.slfAlter = cached.slfAlter || null;
        row.slfPrice = row.slfPrice ?? savedRow.slfPrice ?? null;
        row.slfPriceText = row.slfPriceText || savedRow.slfPriceText || '';
        row.slfPriceCellText = row.slfPriceCellText || savedRow.slfPriceCellText || '';
        row.slfSecondaryPriceText = row.slfSecondaryPriceText || savedRow.slfSecondaryPriceText || '';
        row.slfSecondaryPrice = row.slfSecondaryPrice ?? savedRow.slfSecondaryPrice ?? null;
        row.nominalRatio = row.nominalRatio ?? savedRow.nominalRatio ?? null;
        row.nominalBase = row.nominalBase ?? savedRow.nominalBase ?? null;
        row.slfPriceSource = row.slfPriceSource || savedRow.slfPriceSource || '';

        this.renderRowBadge(row, cached.tmResult || null, cached.slfAlter || null);
        return true;
    },

    });
}
