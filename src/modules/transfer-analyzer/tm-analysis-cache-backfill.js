// Transfer Analyzer: stable compact persistence + restore
// ============================================================
// Final policy:
// - PlayerStateStore v2 is compact and quota-safe: one localStorage key per player.
// - Restore order: stable state -> legacy row cache -> lower TM/SLF caches.
// - Analyze/render writes compact state, but render is not the only restore source.

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const A = TransferMarketAnalyzer;
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const PREFIX = 'slf_ps2_';
    const INDEX_KEY = 'slf_ps2_index';
    const LEGACY_BLOB_KEY = 'slf_player_state_v1';
    const OLD_SNAPSHOT_KEYS = [
        'slf_transfer_analysis_snapshot_cache_v2',
        'slf_transfer_analysis_snapshot_cache_v1'
    ];

    A.analysisCacheTtlMs = TTL_MS;

    function now() {
        return Date.now();
    }

    function safeParse(value, fallback) {
        try {
            return JSON.parse(value || '') || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function readJson(key, fallback = {}) {
        return safeParse(localStorage.getItem(key), fallback);
    }

    function readIndex() {
        const raw = readJson(INDEX_KEY, []);
        return Array.isArray(raw) ? raw.map(String) : [];
    }

    function writeIndex(ids) {
        const unique = Array.from(new Set((ids || []).map(String).filter(Boolean))).slice(-1000);
        try {
            localStorage.setItem(INDEX_KEY, JSON.stringify(unique));
        } catch (error) {
            console.warn('[SLF Transfer Persist] index write failed', error);
        }
    }

    function addToIndex(id) {
        if (!id) return;
        const ids = readIndex();
        if (!ids.includes(String(id))) {
            ids.push(String(id));
            writeIndex(ids);
        }
    }

    function storageKey(id) {
        return PREFIX + String(id || '').trim();
    }

    function pruneOldest() {
        const ids = readIndex();
        const items = ids.map(id => ({ id, item: readJson(storageKey(id), null) }))
            .filter(x => x.item && x.item.t)
            .sort((a, b) => Number(a.item.t || 0) - Number(b.item.t || 0));

        const removeCount = Math.max(10, Math.ceil(items.length * 0.15));
        items.slice(0, removeCount).forEach(x => localStorage.removeItem(storageKey(x.id)));
        writeIndex(items.slice(removeCount).map(x => x.id));
    }

    function writePlayerState(id, item) {
        if (!id || !item) return false;
        const key = storageKey(id);
        const payload = JSON.stringify(item);

        try {
            localStorage.setItem(key, payload);
            addToIndex(id);
            return true;
        } catch (firstError) {
            pruneOldest();
            try {
                localStorage.setItem(key, payload);
                addToIndex(id);
                return true;
            } catch (secondError) {
                console.warn('[SLF Transfer Persist] player write failed', id, secondError);
                return false;
            }
        }
    }

    function compactProfile(profile) {
        if (!profile) return null;
        return {
            tmId: profile.tmId || '',
            tmUrl: profile.tmUrl || '',
            marketValueEur: Number(profile.marketValueEur || 0),
            lastKnownMarketValueEur: Number(profile.lastKnownMarketValueEur || 0),
            marketValueText: profile.marketValueText || '',
            highestMarketValueEur: Number(profile.highestMarketValueEur || 0),
            highestMarketValueDate: profile.highestMarketValueDate || '',
            valuePeakRatio: Number(profile.valuePeakRatio || 0),
            currentClub: profile.currentClub || '',
            playerAgent: profile.playerAgent || '',
            contractExpires: profile.contractExpires || '',
            age: profile.age ?? null,
            isRetired: profile.isRetired === true,
            isFreeAgent: profile.isFreeAgent === true,
            transferHistory: (profile.transferHistory || []).slice(0, 8).map(x => ({ text: String(x?.text || '').slice(0, 180) })),
            youthClubs: (profile.youthClubs || []).slice(0, 8).map(x => String(x || '').slice(0, 80)),
            rumors: (profile.rumors || []).slice(0, 5).map(x => ({
                text: String(x?.text || '').slice(0, 160),
                dateTs: Number(x?.dateTs || 0)
            }))
        };
    }

    function compactAlter(alter) {
        if (!alter) return null;
        const compactRow = row => row ? {
            season: row.season || '',
            seasonLabel: row.seasonLabel || '',
            isCurrentSeason: row.isCurrentSeason === true,
            leagueLevel: row.leagueLevel ?? null,
            leagueSkill: row.leagueSkill ?? null,
            minutesPct: row.minutesPct ?? null,
            minutes: row.minutes ?? null,
            gamesPlayed: row.gamesPlayed ?? null,
            gamesPossible: row.gamesPossible ?? null,
            starts: row.starts ?? null
        } : null;

        return {
            currentSkill: alter.currentSkill ?? null,
            finalSkill: alter.finalSkill ?? null,
            skillDelta: alter.skillDelta ?? null,
            age: alter.age ?? null,
            talent: alter.talent ?? null,
            currentSeasonLabel: alter.currentSeasonLabel || '',
            currentSeasonYear: alter.currentSeasonYear || '',
            hasCurrentSeason: alter.hasCurrentSeason === true,
            staleActivity: alter.staleActivity === true,
            lastSeasonYear: alter.lastSeasonYear || '',
            currentRow: compactRow(alter.currentRow),
            talentUpgradeEligible: alter.talentUpgradeEligible === true,
            talentUpgradeRow: compactRow(alter.talentUpgradeRow),
            leagueAboveSkill: alter.leagueAboveSkill === true
        };
    }

    function compactRow(row) {
        if (!row) return null;
        return {
            playerId: String(row.playerId || ''),
            playerUrl: row.playerUrl || '',
            name: row.name || '',
            positions: Array.isArray(row.positions) ? row.positions.slice(0, 4) : [],
            age: row.age ?? null,
            talent: row.talent ?? null,
            scoutSkill: row.scoutSkill ?? null,
            potentialText: row.potentialText || '',
            slfPrice: row.slfPrice ?? row.salePrice ?? null,
            slfPriceText: row.slfPriceText || row.salePriceText || '',
            slfPriceCellText: row.slfPriceCellText || '',
            slfSecondaryPrice: row.slfSecondaryPrice ?? null,
            slfSecondaryPriceText: row.slfSecondaryPriceText || '',
            nominalRatio: row.nominalRatio ?? null,
            nominalBase: row.nominalBase ?? null,
            slfPriceSource: row.slfPriceSource || ''
        };
    }

    function buildState(row, enriched, slfAlter) {
        const id = String(row?.playerId || enriched?.playerId || '').trim();
        if (!id) return null;

        const profile = enriched?.tmProfile || row?.tmProfile || null;
        const alter = slfAlter || row?.slfAlter || null;
        const rowState = compactRow(row);
        const profileState = compactProfile(profile);
        const alterState = compactAlter(alter);

        return {
            v: 2,
            id,
            t: now(),
            row: rowState,
            tmUrl: enriched?.tmUrl || profile?.tmUrl || row?.tmUrl || '',
            tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || row?.tmValueEur || 0),
            tmProfile: profileState,
            slfAlter: alterState
        };
    }

    function isExpired(item) {
        return !item || !item.t || now() - Number(item.t || 0) > TTL_MS;
    }

    function getState(id) {
        const key = storageKey(id);
        const item = readJson(key, null);
        if (item && !isExpired(item)) return item;
        if (item) localStorage.removeItem(key);

        const legacyBlob = readJson(LEGACY_BLOB_KEY, {});
        const legacy = legacyBlob?.[id] || legacyBlob?.[`slf:${id}`] || null;
        if (legacy && !isExpired(legacy)) {
            const migrated = Object.assign({}, legacy, { v: 2, id: String(id), t: Number(legacy.t || legacy.updatedAt || legacy.savedAt || now()) });
            writePlayerState(id, migrated);
            return migrated;
        }

        return null;
    }

    function setState(id, item) {
        return writePlayerState(id, item);
    }

    function clearState() {
        readIndex().forEach(id => localStorage.removeItem(storageKey(id)));
        localStorage.removeItem(INDEX_KEY);
        localStorage.removeItem(LEGACY_BLOB_KEY);
    }

    window.SLF = window.SLF || {};
    window.SLF.PlayerStateStore = {
        KEY: INDEX_KEY,
        PREFIX,
        TTL_MS,
        get: id => getState(String(id || '')),
        upsert: (id, patch) => {
            const prev = getState(id) || { v: 2, id: String(id), t: now() };
            const item = Object.assign({}, prev, patch || {}, { v: 2, id: String(id), t: now() });
            return setState(id, item);
        },
        saveAnalysis: (row, enriched, slfAlter) => {
            const item = buildState(row, enriched, slfAlter);
            return item ? setState(item.id, item) : false;
        },
        load: () => Object.fromEntries(readIndex().map(id => [id, getState(id)]).filter(([, v]) => !!v)),
        clear: clearState,
        stats: () => ({ index: readIndex().length, key: INDEX_KEY, prefix: PREFIX })
    };

    function applyRowState(row, state) {
        const savedRow = state?.row || {};
        row.tmUrl = state.tmUrl || state.tmProfile?.tmUrl || row.tmUrl || '';
        row.tmProfile = state.tmProfile || null;
        row.tmValueEur = state.tmValueEur || state.tmProfile?.marketValueEur || state.tmProfile?.lastKnownMarketValueEur || 0;
        row.slfAlter = state.slfAlter || null;
        row.slfPrice = row.slfPrice ?? savedRow.slfPrice ?? null;
        row.slfPriceText = row.slfPriceText || savedRow.slfPriceText || '';
        row.slfPriceCellText = row.slfPriceCellText || savedRow.slfPriceCellText || '';
        row.slfSecondaryPrice = row.slfSecondaryPrice ?? savedRow.slfSecondaryPrice ?? null;
        row.slfSecondaryPriceText = row.slfSecondaryPriceText || savedRow.slfSecondaryPriceText || '';
        row.nominalRatio = row.nominalRatio ?? savedRow.nominalRatio ?? null;
        row.nominalBase = row.nominalBase ?? savedRow.nominalBase ?? null;
        row.slfPriceSource = row.slfPriceSource || savedRow.slfPriceSource || '';
    }

    function getLegacyAnalysisByPlayerId(analyzer, row) {
        const id = String(row?.playerId || '').trim();
        if (!id) return null;
        const cache = analyzer.loadAnalysisCache ? analyzer.loadAnalysisCache() : readJson(analyzer.analysisCacheKey || 'slf_transfer_analysis_row_cache_v1', {});
        const direct = cache[`slf:${id}`];
        const values = direct ? [direct] : Object.values(cache || {});
        return values.find(item => {
            const itemId = String(item?.playerId || item?.row?.playerId || item?.tmResult?.playerId || '').trim();
            const savedAt = Number(item?.savedAt || 0);
            return itemId === id && savedAt && now() - savedAt <= TTL_MS;
        }) || null;
    }

    const originalSaveRowAnalysis = A.saveRowAnalysis;
    A.saveRowAnalysis = function saveRowAnalysisStable(row, enriched, slfAlter) {
        const result = originalSaveRowAnalysis?.apply(this, arguments);
        window.SLF.PlayerStateStore.saveAnalysis(row, enriched, slfAlter || null);
        return result;
    };

    const originalRenderRowBadge = A.renderRowBadge;
    A.renderRowBadge = function renderRowBadgeStable(row, enriched, slfAlter) {
        const result = originalRenderRowBadge?.apply(this, arguments);
        if (!this.isHistoryPage || !this.isHistoryPage()) {
            window.SLF.PlayerStateStore.saveAnalysis(row, enriched, slfAlter || null);
        }
        return result;
    };

    A.renderCachedRows = function renderCachedRowsStablePersistence() {
        const rows = this.parseVisibleRows();
        if (!rows.length) return;

        let stable = 0;
        let legacy = 0;
        let lower = 0;
        let missing = 0;

        rows.forEach(row => {
            const id = String(row.playerId || '').trim();
            const state = getState(id);

            if (state) {
                applyRowState(row, state);
                this.renderRowBadge(row, { playerId: id, slfUrl: row.playerUrl, tmUrl: row.tmUrl || state.tmUrl || '', tmProfile: row.tmProfile || null }, row.slfAlter || null);
                stable++;
                return;
            }

            const cached = getLegacyAnalysisByPlayerId(this, row);
            if (cached) {
                this.applyCachedAnalysis(row, cached);
                window.SLF.PlayerStateStore.saveAnalysis(row, cached.tmResult || null, cached.slfAlter || null);
                legacy++;
                return;
            }

            const tmCached = typeof TMEnrichmentLayer !== 'undefined' ? TMEnrichmentLayer.peekBySlfPlayerId(row.playerId) : null;
            const alterCached = typeof SLFAlterLayer !== 'undefined' ? SLFAlterLayer.peekByPlayerId(row.playerId) : null;

            if (tmCached || alterCached) {
                const tmResult = tmCached || { playerId: row.playerId, slfUrl: row.playerUrl, tmUrl: '', tmProfile: null, error: 'not_cached' };
                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = alterCached || null;
                this.renderRowBadge(row, tmResult, alterCached || null);
                window.SLF.PlayerStateStore.saveAnalysis(row, tmResult, alterCached || null);
                lower++;
                return;
            }

            missing++;
        });

        this.setStatus(`Cache: stable ${stable} · legacy ${legacy} · lower ${lower} · missing ${missing}`);
    };

    const originalClearAnalysisCache = A.clearAnalysisCache;
    A.clearAnalysisCache = function clearAnalysisStablePersistence() {
        originalClearAnalysisCache?.call(this);
        clearState();
        OLD_SNAPSHOT_KEYS.forEach(key => localStorage.removeItem(key));
        this.setStatus?.('TM/SLF/analysis/state cache очищен.');
    };

    console.log('[SLF Transfer Analyzer] stable compact persistence active', window.SLF.PlayerStateStore.stats());
}());
