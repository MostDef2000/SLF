// Transfer Analyzer: compact state persistence + fast visible analysis
// ============================================================
// Single active pipeline:
// - save analysis only to compact per-player state
// - do not write legacy row-analysis blob cache
// - restore from compact state first, then lower TM/SLF cache
// - fast visible analysis with safe concurrency

(function () {
    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;

    const A = TransferMarketAnalyzer;
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CONCURRENCY = 3;
    const PREFIX = 'slf_ps2_';
    const INDEX_KEY = 'slf_ps2_index';
    const LEGACY_BLOB_KEY = 'slf_player_state_v1';
    const SNAPSHOT_KEYS = ['slf_transfer_analysis_snapshot_cache_v2', 'slf_transfer_analysis_snapshot_cache_v1'];
    const oldGetCachedAnalysis = A.getCachedAnalysis;
    const oldClearAnalysisCache = A.clearAnalysisCache;

    const now = () => Date.now();
    const storageKey = id => PREFIX + String(id || '').trim();
    const parse = (value, fallback) => { try { return JSON.parse(value || '') || fallback; } catch { return fallback; } };
    const readIndex = () => {
        const ids = parse(localStorage.getItem(INDEX_KEY), []);
        return Array.isArray(ids) ? ids.map(String) : [];
    };
    const writeIndex = ids => {
        try {
            localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set((ids || []).map(String).filter(Boolean))].slice(-1000)));
        } catch (error) {
            console.warn('[SLF Transfer Persist] index write failed', error);
        }
    };
    const addIndex = id => {
        const ids = readIndex();
        if (!ids.includes(String(id))) {
            ids.push(String(id));
            writeIndex(ids);
        }
    };
    const expired = item => !item || !item.t || now() - Number(item.t || 0) > TTL_MS;

    function pruneOldest() {
        const items = readIndex()
            .map(id => ({ id, item: parse(localStorage.getItem(storageKey(id)), null) }))
            .filter(x => x.item && x.item.t)
            .sort((a, b) => Number(a.item.t || 0) - Number(b.item.t || 0));
        const removeCount = Math.max(10, Math.ceil(items.length * 0.15));
        items.slice(0, removeCount).forEach(x => localStorage.removeItem(storageKey(x.id)));
        writeIndex(items.slice(removeCount).map(x => x.id));
    }

    function writeState(id, item) {
        id = String(id || '').trim();
        if (!id || !item) return false;
        const payload = JSON.stringify({ ...item, id, v: 2, t: now() });
        try {
            localStorage.setItem(storageKey(id), payload);
            addIndex(id);
            return true;
        } catch (error) {
            pruneOldest();
            try {
                localStorage.setItem(storageKey(id), payload);
                addIndex(id);
                return true;
            } catch (error2) {
                console.warn('[SLF Transfer Persist] compact state write failed', id, error2);
                return false;
            }
        }
    }

    function readState(id) {
        id = String(id || '').trim();
        if (!id) return null;
        const item = parse(localStorage.getItem(storageKey(id)), null);
        if (item && !expired(item)) return item;
        if (item) localStorage.removeItem(storageKey(id));
        return null;
    }

    function compactProfile(p) {
        if (!p) return null;
        return {
            tmUrl: p.tmUrl || '',
            tmId: p.tmId || '',
            marketValueText: p.marketValueText || '',
            marketValueEur: Number(p.marketValueEur || 0),
            lastKnownMarketValueText: p.lastKnownMarketValueText || '',
            lastKnownMarketValueEur: Number(p.lastKnownMarketValueEur || 0),
            lastKnownMarketValueDate: p.lastKnownMarketValueDate || '',
            marketValueIsHistorical: !!p.marketValueIsHistorical,
            highestMarketValueText: p.highestMarketValueText || '',
            highestMarketValueEur: Number(p.highestMarketValueEur || 0),
            highestMarketValueDate: p.highestMarketValueDate || '',
            valuePeakRatio: p.valuePeakRatio ?? null,
            isRetired: !!p.isRetired,
            isFreeAgent: !!p.isFreeAgent,
            currentClub: p.currentClub || '',
            playerAgent: p.playerAgent || '',
            contractExpires: p.contractExpires || '',
            joined: p.joined || '',
            lastContractExtension: p.lastContractExtension || '',
            age: p.age ?? null,
            transferHistory: (p.transferHistory || []).slice(0, 8).map(x => ({ text: String(x?.text || '').slice(0, 180), dateText: x?.dateText || '', club: x?.club || '' })),
            youthClubs: (p.youthClubs || []).slice(0, 8).map(x => String(x || '').slice(0, 80)),
            rumors: (p.rumors || []).slice(0, 5).map(x => ({ text: String(x?.text || x?.rawText || '').slice(0, 160), club: x?.club || '', dateText: x?.dateText || '', dateTs: x?.dateTs ?? null }))
        };
    }

    function compactSeason(row) {
        return row ? {
            season: row.season || '',
            seasonLabel: row.seasonLabel || '',
            leagueLevel: row.leagueLevel ?? null,
            leagueSkill: row.leagueSkill ?? null,
            minutesPct: row.minutesPct ?? null,
            minutes: row.minutes ?? null,
            gamesPlayed: row.gamesPlayed ?? null,
            gamesPossible: row.gamesPossible ?? null,
            starts: row.starts ?? null
        } : null;
    }

    function compactAlter(a) {
        if (!a) return null;
        return {
            age: a.age ?? null,
            talent: a.talent ?? null,
            currentSkill: a.currentSkill ?? null,
            finalSkill: a.finalSkill ?? null,
            skillDelta: a.skillDelta ?? null,
            currentSeasonYear: a.currentSeasonYear ?? null,
            currentSeasonLabel: a.currentSeasonLabel || '',
            hasCurrentSeason: !!a.hasCurrentSeason,
            isCurrentSeasonActive: !!a.isCurrentSeasonActive,
            staleActivity: !!a.staleActivity,
            lastSeasonYear: a.lastSeasonYear ?? null,
            currentRow: compactSeason(a.currentRow),
            talentUpgradeEligible: !!a.talentUpgradeEligible,
            talentUpgradeRow: compactSeason(a.talentUpgradeRow),
            bestEligibleRow: compactSeason(a.bestEligibleRow),
            leagueAboveSkill: !!a.leagueAboveSkill
        };
    }

    function compactRow(row) {
        return row ? {
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
        } : null;
    }

    function buildState(row, enriched, slfAlter) {
        const id = String(row?.playerId || enriched?.playerId || '').trim();
        if (!id) return null;
        const profile = enriched?.tmProfile || row?.tmProfile || null;
        return {
            id,
            row: compactRow(row),
            tmUrl: enriched?.tmUrl || profile?.tmUrl || row?.tmUrl || '',
            tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || row?.tmValueEur || 0),
            tmProfile: compactProfile(profile),
            slfAlter: compactAlter(slfAlter || row?.slfAlter || null)
        };
    }

    function applySavedRowFields(row, savedRow) {
        savedRow = savedRow || {};
        row.slfPrice = row.slfPrice ?? savedRow.slfPrice ?? null;
        row.slfPriceText = row.slfPriceText || savedRow.slfPriceText || '';
        row.slfPriceCellText = row.slfPriceCellText || savedRow.slfPriceCellText || '';
        row.slfSecondaryPrice = row.slfSecondaryPrice ?? savedRow.slfSecondaryPrice ?? null;
        row.slfSecondaryPriceText = row.slfSecondaryPriceText || savedRow.slfSecondaryPriceText || '';
        row.nominalRatio = row.nominalRatio ?? savedRow.nominalRatio ?? null;
        row.nominalBase = row.nominalBase ?? savedRow.nominalBase ?? null;
        row.slfPriceSource = row.slfPriceSource || savedRow.slfPriceSource || '';
    }

    function stateToCached(row, state) {
        if (!state) return null;
        applySavedRowFields(row, state.row);
        return {
            schema: 'transfer_row_analysis_state_v2',
            savedAt: Number(state.t || now()),
            playerId: String(state.id || row.playerId || ''),
            tmResult: {
                playerId: String(state.id || row.playerId || ''),
                slfUrl: row.playerUrl || state.row?.playerUrl || '',
                tmUrl: state.tmUrl || state.tmProfile?.tmUrl || '',
                tmProfile: state.tmProfile || null,
                error: ''
            },
            slfAlter: state.slfAlter || null,
            row: state.row || {}
        };
    }

    function saveAnalysis(row, enriched, slfAlter) {
        const state = buildState(row, enriched, slfAlter);
        return state ? writeState(state.id, state) : false;
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
        get: id => readState(id),
        saveAnalysis,
        upsert: (id, patch) => writeState(id, { ...(readState(id) || {}), ...(patch || {}) }),
        batchUpsert: arr => (arr || []).forEach(x => x?.playerId && window.SLF.PlayerStateStore.upsert(x.playerId, x.patch || x)),
        load: () => Object.fromEntries(readIndex().map(id => [id, readState(id)]).filter(([, value]) => !!value)),
        clear: clearState,
        stats: () => ({ index: readIndex().length, key: INDEX_KEY, prefix: PREFIX })
    };

    A.getCachedAnalysis = function getCachedAnalysisCompact(row) {
        const state = readState(row?.playerId);
        if (state) return stateToCached(row, state);
        const cached = typeof oldGetCachedAnalysis === 'function' ? oldGetCachedAnalysis.call(this, row) : null;
        if (cached && cached.tmResult?.tmProfile) return cached;
        return null;
    };

    A.saveRowAnalysis = function saveRowAnalysisCompactStateOnly(row, enriched, slfAlter) {
        saveAnalysis(row, enriched, slfAlter || null);
    };

    A.renderCachedRows = function renderCachedRowsCompactState() {
        const rows = this.parseVisibleRows?.() || [];
        if (!rows.length) return;

        let stable = 0, lower = 0, missing = 0;
        rows.forEach(row => {
            const cached = this.getCachedAnalysis(row);
            if (cached && this.applyCachedAnalysis?.(row, cached)) { stable++; return; }

            const tmCached = typeof TMEnrichmentLayer !== 'undefined' ? TMEnrichmentLayer.peekBySlfPlayerId(row.playerId) : null;
            const alterCached = typeof SLFAlterLayer !== 'undefined' ? SLFAlterLayer.peekByPlayerId(row.playerId) : null;
            if (!tmCached && !alterCached) { missing++; return; }

            const tmResult = tmCached || { playerId: row.playerId, slfUrl: row.playerUrl, tmUrl: '', tmProfile: null, error: 'not_cached' };
            row.tmUrl = tmResult.tmUrl || '';
            row.tmProfile = tmResult.tmProfile || null;
            row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
            row.slfAlter = alterCached || null;
            this.renderRowBadge?.(row, tmResult, alterCached || null);
            this.saveRowAnalysis?.(row, tmResult, alterCached || null);
            lower++;
        });

        this.setStatus?.(`Cache: stable ${stable} · lower ${lower} · missing ${missing}`);
    };

    async function mapLimit(items, limit, worker) {
        let cursor = 0;
        const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                await worker(items[index], index);
            }
        });
        await Promise.all(workers);
    }

    A.analyzeVisibleRows = async function analyzeVisibleRowsFastCore() {
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

        let done = 0, cache = 0, lower = 0, analyzed = 0, errors = 0;
        const originalRefreshRanks = this.refreshVisibleRankBadges;
        if (typeof originalRefreshRanks === 'function') this.refreshVisibleRankBadges = function noopDuringFastAnalysis() {};

        this.setStatus?.(`Fast анализ: ${rows.length} игроков, parallel ${CONCURRENCY}...`);

        try {
            await mapLimit(rows, CONCURRENCY, async row => {
                try {
                    const cached = this.getCachedAnalysis?.(row);
                    if (cached && this.applyCachedAnalysis?.(row, cached)) { cache++; return; }

                    const tmCached = typeof TMEnrichmentLayer !== 'undefined' ? TMEnrichmentLayer.peekBySlfPlayerId(row.playerId) : null;
                    const alterCached = typeof SLFAlterLayer !== 'undefined' ? SLFAlterLayer.peekByPlayerId(row.playerId) : null;
                    const fromLower = !!tmCached && !!alterCached;
                    if (!fromLower) this.renderLoadingBadge?.(row);

                    const tmPromise = tmCached ? Promise.resolve(tmCached) : TMEnrichmentLayer.getBySlfPlayerId(row.playerId);
                    const alterPromise = alterCached ? Promise.resolve(alterCached) : SLFAlterLayer.getByPlayerId(row.playerId).catch(error => {
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
                    if (fromLower) lower++; else analyzed++;
                } catch (error) {
                    errors++;
                    console.error('[SLF Transfer Analyzer] row failed', row, error);
                    this.renderErrorBadge?.(row, error);
                } finally {
                    done++;
                    if (done % 3 === 0 || done === rows.length) {
                        this.setStatus?.(`Fast ${done}/${rows.length}: cache ${cache}, lower ${lower}, analyzed ${analyzed}, errors ${errors}`);
                    }
                }
            });
        } finally {
            if (typeof originalRefreshRanks === 'function') {
                this.refreshVisibleRankBadges = originalRefreshRanks;
                try { this.refreshVisibleRankBadges?.(); } catch (error) { console.warn('[SLF Transfer Analyzer] rank refresh failed', error); }
            }
        }

        this.setStatus?.(`Готово fast: ${rows.length} игроков · cache ${cache} · lower ${lower} · analyzed ${analyzed} · errors ${errors}`);
    };

    A.clearAnalysisCache = function clearAnalysisCompactState() {
        oldClearAnalysisCache?.call(this);
        clearState();
        SNAPSHOT_KEYS.forEach(k => localStorage.removeItem(k));
        this.setStatus?.('TM/SLF/analysis/state cache очищен.');
    };

    console.log('[SLF Transfer Analyzer] compact state + fast core active', { concurrency: CONCURRENCY, state: window.SLF.PlayerStateStore.stats() });
}());
