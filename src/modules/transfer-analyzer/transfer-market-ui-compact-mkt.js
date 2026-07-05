// Transfer Analyzer: compact MKT UI + zero-cache runtime
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfCompactMktUiApplied) {
    TransferMarketAnalyzer.slfCompactMktUiApplied = true;

    TransferMarketAnalyzer.removeMktSortToolbarButtons = function removeMktSortToolbarButtons() {
        const bargainButton = document.getElementById('slf-transfer-sort-mkt-bargain');
        const overpricedButton = document.getElementById('slf-transfer-sort-mkt-overpriced');
        if (bargainButton && bargainButton.parentNode) bargainButton.parentNode.removeChild(bargainButton);
        if (overpricedButton && overpricedButton.parentNode) overpricedButton.parentNode.removeChild(overpricedButton);
    };

    TransferMarketAnalyzer.formatCompactMktRatio = function formatCompactMktRatio(ratio) {
        const value = Number(ratio || 0);
        if (!Number.isFinite(value) || value <= 0) return '';
        const raw = value >= 10 ? value.toFixed(1) : value.toFixed(2);
        return raw.replace(/0$/, '').replace(/\.0$/, '');
    };

    TransferMarketAnalyzer.clearAllTransferAnalysisState = function clearAllTransferAnalysisState() {
        const prefixes = [
            'slf_transfer_analysis_',
            'slf_tm_enrichment_cache_',
            'slf_alter_cache_',
            'slf_ps2_',
            'slf_player_state'
        ];

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i) || '';
            if (prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
        }

        document.querySelectorAll('.slf-transfer-analysis-badge').forEach(node => { node.innerHTML = ''; });
        document.querySelectorAll('tr[data-slf-player-id]').forEach(row => {
            delete row.dataset.slfAnalyzerScore;
            delete row.dataset.slfSkillDelta;
            delete row.dataset.slfMinutesPct;
            delete row.dataset.slfTalentUp;
            delete row.dataset.slfTmValue;
            delete row.dataset.slfMktBargain;
            delete row.dataset.slfMktOverpriced;
        });
    };

    TransferMarketAnalyzer.loadAnalysisCache = function () { return {}; };
    TransferMarketAnalyzer.saveAnalysisCache = function () {};
    TransferMarketAnalyzer.getCachedAnalysis = function () { return null; };
    TransferMarketAnalyzer.applyCachedAnalysis = function () { return false; };
    TransferMarketAnalyzer.saveRowAnalysis = function () {};
    TransferMarketAnalyzer.renderCachedRows = function () {};
    TransferMarketAnalyzer.clearAnalysisCache = function () {
        this.clearAllTransferAnalysisState();
        this.setStatus?.('Cache полностью очищен. Transfer Analyzer работает без кеширования.');
    };

    if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
        TMEnrichmentLayer.loadCache = function () { return {}; };
        TMEnrichmentLayer.saveCache = function () {};
        TMEnrichmentLayer.clearCache = function () { TransferMarketAnalyzer.clearAllTransferAnalysisState(); };
        TMEnrichmentLayer.getCache = function () { return null; };
        TMEnrichmentLayer.peekBySlfPlayerId = function () { return null; };
        TMEnrichmentLayer.setCache = function () {};
    }

    if (typeof SLFAlterLayer !== 'undefined' && SLFAlterLayer) {
        SLFAlterLayer.loadCache = function () { return {}; };
        SLFAlterLayer.saveCache = function () {};
        SLFAlterLayer.clearCache = function () { TransferMarketAnalyzer.clearAllTransferAnalysisState(); };
        SLFAlterLayer.getCache = function () { return null; };
        SLFAlterLayer.peekByPlayerId = function () { return null; };
        SLFAlterLayer.setCache = function () {};
    }

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarCompactMktUi() {
        const result = addToolbarOriginal.apply(this, arguments);
        this.removeMktSortToolbarButtons();
        const clearButton = document.getElementById('slf-transfer-clear-cache');
        if (clearButton) {
            clearButton.title = 'Полностью очистить все старые слои кеша Transfer Analyzer.';
            clearButton.onclick = () => this.clearAnalysisCache();
        }
        setTimeout(() => this.removeMktSortToolbarButtons(), 0);
        return result;
    };

    const getMarketSalePriceMarkerOriginal = TransferMarketAnalyzer.getMarketSalePriceMarker;
    TransferMarketAnalyzer.getMarketSalePriceMarker = function getCompactMarketSalePriceMarker() {
        const marker = getMarketSalePriceMarkerOriginal.apply(this, arguments);
        if (!marker || marker.category !== 'market') return marker;
        const ratio = Number(marker.marketDetails && marker.marketDetails.ratio || 0);
        const ratioText = this.formatCompactMktRatio(ratio);
        marker.label = ratioText ? `MKT x${ratioText}` : 'MKT ?';
        return marker;
    };

    TransferMarketAnalyzer.renderSemanticAnalysisGroups = function renderOnlyCoreAnalysisChips(markers, linksHtml, detailsHtml) {
        const visibleMarkers = [
            this.firstMarkerByCategory(markers, 'slf'),
            this.firstMarkerByCategory(markers, 'activity'),
            this.firstMarkerByCategory(markers, 'tm')
        ].filter(Boolean);

        return `
            <div class="ta-line ta-primary" data-ta-line="primary" aria-label="SLF MIN TM">
                ${visibleMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, 'high'))).join('')}
                ${detailsHtml || ''}
            </div>
        `;
    };

    const analyzeVisibleRowsOriginal = TransferMarketAnalyzer.analyzeVisibleRows;
    TransferMarketAnalyzer.analyzeVisibleRows = async function analyzeVisibleRowsLiveParallel() {
        if (this.isHistoryPage?.()) {
            return analyzeVisibleRowsOriginal.apply(this, arguments);
        }

        const rows = this.parseVisibleRows?.() || [];
        if (!rows.length) {
            this.setStatus?.('Игроки не найдены.');
            return;
        }

        const concurrency = 3;
        const runMemory = new Map();
        let done = 0;
        let analyzed = 0;
        let errors = 0;
        const total = rows.length;

        const originalRefreshRanks = this.refreshVisibleRankBadges;
        let refreshSuppressed = false;
        if (typeof originalRefreshRanks === 'function') {
            this.refreshVisibleRankBadges = function noopDuringLiveParallelAnalysis() {};
            refreshSuppressed = true;
        }

        const loadPlayerData = row => {
            const playerId = String(row?.playerId || '').trim();
            if (!playerId) {
                return Promise.resolve({ tmResult: null, slfAlter: null, tmError: null, slfError: null });
            }
            if (!runMemory.has(playerId)) {
                runMemory.set(playerId, Promise.allSettled([
                    TMEnrichmentLayer.getBySlfPlayerId(playerId),
                    SLFAlterLayer.getByPlayerId(playerId)
                ]).then(([tmSettled, slfSettled]) => ({
                    tmResult: tmSettled.status === 'fulfilled' ? tmSettled.value : null,
                    slfAlter: slfSettled.status === 'fulfilled' ? slfSettled.value : null,
                    tmError: tmSettled.status === 'rejected' ? tmSettled.reason : null,
                    slfError: slfSettled.status === 'rejected' ? slfSettled.reason : null
                })));
            }
            return runMemory.get(playerId);
        };

        const analyzeOne = async row => {
            this.renderLoadingBadge?.(row);
            try {
                const result = await loadPlayerData(row);
                if (result.tmError) console.warn('[SLF Transfer Analyzer] TM failed', row.playerId, result.tmError);
                if (result.slfError) console.warn('[SLF Transfer Analyzer] alter.php failed', row.playerId, result.slfError);

                const tmResult = result.tmResult || {
                    playerId: row.playerId,
                    slfUrl: row.playerUrl,
                    tmUrl: '',
                    tmProfile: null,
                    error: result.tmError ? 'tm_failed' : 'empty_enrichment'
                };
                const slfAlter = result.slfAlter || null;

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                this.renderRowBadge?.(row, tmResult, slfAlter);
                analyzed++;
                return { ok: true, row };
            } catch (error) {
                errors++;
                console.error('[SLF Transfer Analyzer] row failed', row, error);
                this.renderErrorBadge?.(row, error);
                return { ok: false, row, error };
            } finally {
                done++;
                if (done === total || done % 3 === 0) {
                    this.setStatus?.(`Live ${done}/${total}: analyzed ${analyzed}, errors ${errors}`);
                }
            }
        };

        const mapLimit = async (items, limit, worker) => {
            let cursor = 0;
            const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
                while (cursor < items.length) {
                    const index = cursor++;
                    await worker(items[index], index);
                }
            });
            await Promise.all(workers);
        };

        this.setStatus?.(`Live анализ: ${total} игроков, parallel ${concurrency}...`);
        try {
            await this.loadMarketBaseline?.();
            await mapLimit(rows, concurrency, analyzeOne);
        } finally {
            if (refreshSuppressed) {
                this.refreshVisibleRankBadges = originalRefreshRanks;
                try {
                    this.refreshVisibleRankBadges?.();
                } catch (error) {
                    console.warn('[SLF Transfer Analyzer] rank refresh failed after live analysis', error);
                }
            }
        }

        this.setStatus?.(`Готово live: ${total} игроков · analyzed ${analyzed} · errors ${errors}`);
    };

    TransferMarketAnalyzer.clearAllTransferAnalysisState();

    const style = document.createElement('style');
    style.textContent = '.slf-transfer-analysis-chip[data-slf-tip-category="league"],.slf-transfer-analysis-chip[data-slf-tip-category="activity"],.slf-transfer-analysis-chip[data-slf-tip-category="talent"]{flex:0 0 auto!important;width:auto!important;min-width:max-content!important;max-width:none!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}.slf-transfer-analysis-chip[data-slf-tip-category="league"]>span:first-child,.slf-transfer-analysis-chip[data-slf-tip-category="activity"]>span:first-child,.slf-transfer-analysis-chip[data-slf-tip-category="talent"]>span:first-child{min-width:max-content!important;max-width:none!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}';
    document.head.appendChild(style);
}
