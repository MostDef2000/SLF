// Transfer Analyzer: 7-day TM analysis cache policy
// ============================================================

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const TM_ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const originalLoadAnalysisCache = TransferMarketAnalyzer.loadAnalysisCache;
    const originalMount = TransferMarketAnalyzer.mount;
    const originalAnalyzeVisibleRows = TransferMarketAnalyzer.analyzeVisibleRows;

    TransferMarketAnalyzer.analysisCacheTtlMs = TM_ANALYSIS_CACHE_TTL_MS;

    function compactActivity(activity) {
        if (!activity || typeof activity !== 'object') return null;
        return {
            startingElevenPct: activity.startingElevenPct ?? null,
            minutesPct: activity.minutesPct ?? null,
            goalParticipationPct: activity.goalParticipationPct ?? null
        };
    }

    function compactProfile(profile) {
        if (!profile || typeof profile !== 'object') return null;
        return {
            tmUrl: profile.tmUrl || '',
            tmId: profile.tmId || '',
            marketValueText: profile.marketValueText || '',
            marketValueEur: profile.marketValueEur ?? null,
            lastKnownMarketValueText: profile.lastKnownMarketValueText || '',
            lastKnownMarketValueEur: profile.lastKnownMarketValueEur ?? null,
            lastKnownMarketValueDate: profile.lastKnownMarketValueDate || '',
            marketValueIsHistorical: !!profile.marketValueIsHistorical,
            highestMarketValueText: profile.highestMarketValueText || '',
            highestMarketValueEur: profile.highestMarketValueEur ?? null,
            highestMarketValueDate: profile.highestMarketValueDate || '',
            valuePeakRatio: profile.valuePeakRatio ?? null,
            isRetired: !!profile.isRetired,
            isFreeAgent: !!profile.isFreeAgent,
            currentClub: profile.currentClub || '',
            playerAgent: profile.playerAgent || '',
            contractExpires: profile.contractExpires || '',
            joined: profile.joined || '',
            lastContractExtension: profile.lastContractExtension || '',
            age: profile.age ?? null,
            activity: compactActivity(profile.activity),
            transferHistory: Array.isArray(profile.transferHistory)
                ? profile.transferHistory.slice(0, 12).map(item => ({ text: item?.text || '', dateText: item?.dateText || '', club: item?.club || '' }))
                : [],
            youthClubs: Array.isArray(profile.youthClubs) ? profile.youthClubs.slice(0, 12) : [],
            rumors: Array.isArray(profile.rumors)
                ? profile.rumors.slice(0, 12).map(item => ({ text: item?.text || item?.rawText || '', rawText: item?.rawText || '', club: item?.club || '', dateText: item?.dateText || '', dateTs: item?.dateTs ?? null }))
                : []
        };
    }

    function compactTmResult(enriched, row) {
        const profile = compactProfile(enriched?.tmProfile || null);
        return {
            playerId: String(enriched?.playerId || row?.playerId || ''),
            slfUrl: enriched?.slfUrl || row?.playerUrl || '',
            tmUrl: enriched?.tmUrl || profile?.tmUrl || '',
            tmProfile: profile,
            error: enriched?.error || ''
        };
    }

    function compactSeasonRow(row) {
        if (!row || typeof row !== 'object') return null;
        return {
            season: row.season || '',
            seasonLabel: row.seasonLabel || '',
            leagueLevel: row.leagueLevel ?? null,
            leagueSkill: row.leagueSkill ?? null,
            minutesPct: row.minutesPct ?? null,
            minutes: row.minutes ?? null,
            gamesPlayed: row.gamesPlayed ?? null,
            gamesPossible: row.gamesPossible ?? null,
            starts: row.starts ?? null,
            teamText: row.teamText || ''
        };
    }

    function compactSlfAlter(slfAlter) {
        if (!slfAlter || typeof slfAlter !== 'object') return null;
        return {
            age: slfAlter.age ?? null,
            talent: slfAlter.talent ?? null,
            currentSkill: slfAlter.currentSkill ?? null,
            finalSkill: slfAlter.finalSkill ?? null,
            skillDelta: slfAlter.skillDelta ?? null,
            currentSeasonYear: slfAlter.currentSeasonYear ?? null,
            currentSeasonLabel: slfAlter.currentSeasonLabel || '',
            hasCurrentSeason: !!slfAlter.hasCurrentSeason,
            isCurrentSeasonActive: !!slfAlter.isCurrentSeasonActive,
            staleActivity: !!slfAlter.staleActivity,
            lastSeasonYear: slfAlter.lastSeasonYear ?? null,
            currentRow: compactSeasonRow(slfAlter.currentRow),
            talentUpgradeEligible: !!slfAlter.talentUpgradeEligible,
            talentUpgradeRow: compactSeasonRow(slfAlter.talentUpgradeRow),
            bestEligibleRow: compactSeasonRow(slfAlter.bestEligibleRow),
            seasonSkills: Array.isArray(slfAlter.seasonSkills) ? slfAlter.seasonSkills.slice(0, 8).map(item => ({ season: item?.season || '', skill: item?.skill ?? null })) : []
        };
    }

    TransferMarketAnalyzer.isAnalysisCacheItemExpired = function isAnalysisCacheItemExpired(item, now = Date.now()) {
        const savedAt = Number(item?.savedAt || 0);
        return !savedAt || now - savedAt > this.analysisCacheTtlMs;
    };

    TransferMarketAnalyzer.hasRestorableAnalysisCacheItem = function hasRestorableAnalysisCacheItem(item) {
        if (!item || typeof item !== 'object') return false;

        const hasTmResult = !!item.tmResult;
        const hasSlfAlter = !!item.slfAlter;
        const hasSavedRow = !!item.row;
        const hasPlayerId = !!String(item.playerId || item.row?.playerId || '').trim();

        return hasPlayerId && (hasTmResult || hasSlfAlter || hasSavedRow);
    };

    TransferMarketAnalyzer.pruneExpiredAnalysisCache = function pruneExpiredAnalysisCache(cache = null) {
        const current = cache || originalLoadAnalysisCache.call(this);
        const now = Date.now();

        Object.keys(current || {}).forEach(key => {
            if (this.isAnalysisCacheItemExpired(current[key], now)) {
                delete current[key];
            }
        });

        return current || {};
    };

    TransferMarketAnalyzer.saveAnalysisCache = function saveAnalysisCacheCompact(cache) {
        const pruned = this.pruneExpiredAnalysisCache(cache || {});
        const entries = Object.entries(pruned)
            .filter(([, value]) => value && Number(value.savedAt || 0))
            .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0));

        const trySave = limit => {
            localStorage.setItem(this.analysisCacheKey, JSON.stringify(Object.fromEntries(entries.slice(0, limit))));
        };

        try {
            trySave(350);
        } catch (firstError) {
            try {
                trySave(160);
            } catch (secondError) {
                try {
                    trySave(60);
                } catch (thirdError) {
                    console.warn('[SLF Transfer Analyzer] compact analysis cache save failed', thirdError);
                    this.setStatus?.('Analysis cache не сохранился: localStorage quota. Нажми Сброс cache и повтори анализ.');
                }
            }
        }
    };

    TransferMarketAnalyzer.loadAnalysisCache = function loadAnalysisCacheWithTtlCleanup() {
        return this.pruneExpiredAnalysisCache(originalLoadAnalysisCache.call(this));
    };

    TransferMarketAnalyzer.getCachedAnalysis = function getCachedAnalysisWithPartialRestore(row) {
        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, null);

        for (const key of keys) {
            const item = cache[key];
            if (!item) continue;
            if (this.isAnalysisCacheItemExpired(item)) continue;
            if (!this.hasRestorableAnalysisCacheItem(item)) continue;

            return item;
        }

        return null;
    };

    TransferMarketAnalyzer.saveRowAnalysis = function saveRowAnalysisCompact(row, enriched, slfAlter) {
        if (!row?.playerId) return;

        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, enriched);
        const item = {
            schema: 'transfer_row_analysis_cache_v2_compact',
            savedAt: Date.now(),
            playerId: String(row.playerId || ''),
            name: row.name || '',
            tmResult: compactTmResult(enriched, row),
            slfAlter: compactSlfAlter(slfAlter),
            row: {
                playerId: String(row.playerId || ''),
                playerUrl: row.playerUrl || '',
                name: row.name || '',
                positions: row.positions || [],
                age: row.age ?? null,
                talent: row.talent ?? null,
                scoutSkill: row.scoutSkill ?? null,
                potentialText: row.potentialText || '',
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
    };

    TransferMarketAnalyzer.mount = function mountWithTtlCleanup() {
        if (this.isPage && this.isPage() && !this.isHistoryPage()) {
            const pruned = this.pruneExpiredAnalysisCache();
            this.saveAnalysisCache(pruned);
        }

        return originalMount.call(this);
    };

    TransferMarketAnalyzer.analyzeVisibleRows = async function analyzeVisibleRowsWithTtlCleanup() {
        if (this.isHistoryPage && !this.isHistoryPage()) {
            const pruned = this.pruneExpiredAnalysisCache();
            this.saveAnalysisCache(pruned);
        }

        return originalAnalyzeVisibleRows.call(this);
    };
}());
