// Transfer Analyzer: compact MKT UI + zero-cache runtime
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfCompactMktUiApplied) {
    TransferMarketAnalyzer.slfCompactMktUiApplied = true;
    TransferMarketAnalyzer.slfLiveAnalysisRunning = false;
    TransferMarketAnalyzer.slfLiveAnalysisRunId = 0;

    TransferMarketAnalyzer.removeMktSortToolbarButtons = function removeMktSortToolbarButtons() {
        const buttonIds = [
            'slf-transfer-sort-score',
            'slf-transfer-sort-talent',
            'slf-transfer-sort-mkt-bargain',
            'slf-transfer-sort-mkt-overpriced'
        ];

        buttonIds.forEach(id => {
            const button = document.getElementById(id);
            if (button && button.parentNode) button.parentNode.removeChild(button);
        });
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

    TransferMarketAnalyzer.isFinalTransferMarketPage = function isFinalTransferMarketPage() {
        return location.pathname === '/transfers.php' && !location.search;
    };

    TransferMarketAnalyzer.findPurchaseForecastMarketBox = function findPurchaseForecastMarketBox() {
        const requiredTexts = ['Текущий статус', 'Период проведения', 'Бюджет клуба'];

        return [...document.querySelectorAll('div, table, td')]
            .filter(el => {
                const text = el.innerText || '';
                if (!requiredTexts.every(part => text.includes(part))) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 250 && rect.height > 80;
            })
            .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0] || null;
    };

    TransferMarketAnalyzer.formatPurchaseForecastPrice = function formatPurchaseForecastPrice(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) return '—';
        return `${this.formatSlfMoneyShort(n)} 🪙`;
    };

    TransferMarketAnalyzer.getPurchaseForecastPositionOptionsHtml = function getPurchaseForecastPositionOptionsHtml() {
        return ['ST', 'CM', 'CD', 'GK', 'DM', 'AM', 'RM', 'LM', 'RD', 'LD']
            .map(pos => `<option>${pos}</option>`)
            .join('');
    };

    TransferMarketAnalyzer.extractPurchaseForecastRecord = function extractPurchaseForecastRecord(event) {
        if (!event || !(event.recordType === 'completed_transfer' || event.eventType === 'completed_transfer')) return null;

        const transfer = event.transfer || {};
        const player = event.player || {};
        const positions = Array.isArray(player.positions)
            ? player.positions
            : this.parsePositions?.(player.positions || player.primaryPosition || event.positions || event.position || '') || [];
        const rawPosition = player.primaryPosition || positions[0] || player.position || '';
        const primaryPosition = this.normalizeMarketPosition?.(rawPosition) || String(rawPosition || '').toUpperCase().trim();
        const age = this.parseNumber(player.age ?? event.age);
        const talent = this.parseNumber(player.talent ?? event.talent);
        const price = Number(transfer.price || event.price || event.salePrice || 0);

        if (!Number.isFinite(price) || price <= 0) return null;

        return {
            primaryPosition,
            age,
            talent,
            price
        };
    };

    TransferMarketAnalyzer.calculatePurchaseForecast = function calculatePurchaseForecast(events, filters) {
        const position = this.normalizeMarketPosition?.(filters.position) || String(filters.position || '').toUpperCase().trim();
        const values = (events || [])
            .map(event => this.extractPurchaseForecastRecord(event))
            .filter(Boolean)
            .filter(record => {
                if (position && record.primaryPosition !== position) return false;
                if (Number.isFinite(filters.ageFrom) && !(Number(record.age) >= filters.ageFrom)) return false;
                if (Number.isFinite(filters.ageTo) && !(Number(record.age) <= filters.ageTo)) return false;
                if (Number.isFinite(filters.talentFrom) && !(Number(record.talent) >= filters.talentFrom)) return false;
                if (Number.isFinite(filters.talentTo) && !(Number(record.talent) <= filters.talentTo)) return false;
                return true;
            })
            .map(record => Number(record.price || 0))
            .filter(value => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b);

        if (!values.length) {
            return { count: 0, median: null, p75: null };
        }

        return this.summarizeMarketValues(values);
    };

    TransferMarketAnalyzer.readPurchaseForecastFilters = function readPurchaseForecastFilters() {
        const readNumber = id => {
            const value = Number(String(document.getElementById(id)?.value || '').replace(',', '.'));
            return Number.isFinite(value) ? value : NaN;
        };

        return {
            ageFrom: readNumber('slf-purchase-forecast-age-from'),
            ageTo: readNumber('slf-purchase-forecast-age-to'),
            talentFrom: readNumber('slf-purchase-forecast-talent-from'),
            talentTo: readNumber('slf-purchase-forecast-talent-to'),
            position: document.getElementById('slf-purchase-forecast-position')?.value || 'ST'
        };
    };

    TransferMarketAnalyzer.renderPurchaseForecastResult = function renderPurchaseForecastResult(result) {
        const countEl = document.getElementById('slf-purchase-forecast-count');
        const medianEl = document.getElementById('slf-purchase-forecast-median');
        const p75El = document.getElementById('slf-purchase-forecast-p75');

        if (countEl) countEl.textContent = String(result?.count ?? 0);
        if (medianEl) medianEl.textContent = this.formatPurchaseForecastPrice(result?.median);
        if (p75El) p75El.textContent = this.formatPurchaseForecastPrice(result?.p75);
    };

    TransferMarketAnalyzer.setPurchaseForecastNote = function setPurchaseForecastNote(text) {
        const note = document.getElementById('slf-purchase-forecast-note');
        if (note) note.textContent = text || '';
    };

    TransferMarketAnalyzer.runPurchaseForecast = async function runPurchaseForecast() {
        const button = document.getElementById('slf-purchase-forecast-calc');
        const originalText = button ? button.textContent : '';

        if (button) {
            button.disabled = true;
            button.textContent = 'Считаю...';
        }

        this.setPurchaseForecastNote('Загрузка VPS History...');

        try {
            const filters = this.readPurchaseForecastFilters();
            const rows = await this.loadHistoryVpsRows();
            const result = this.calculatePurchaseForecast(rows, filters);
            this.renderPurchaseForecastResult(result);
            this.setPurchaseForecastNote(`VPS History: выборка ${result.count || 0} трансферов.`);
        } catch (error) {
            console.warn('[SLF Purchase Forecast] calculation failed', error);
            this.renderPurchaseForecastResult({ count: 0, median: null, p75: null });
            this.setPurchaseForecastNote('Ошибка загрузки VPS History. Проверь API/VPS доступ.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Посчитать';
            }
        }
    };

    TransferMarketAnalyzer.addPurchaseForecastPanel = function addPurchaseForecastPanel() {
        if (!this.isFinalTransferMarketPage()) return;
        if (document.getElementById('slf-purchase-forecast-panel')) return;

        const marketBox = this.findPurchaseForecastMarketBox();
        if (!marketBox || !marketBox.parentNode) return;

        const row = document.createElement('div');
        row.id = 'slf-purchase-forecast-row';
        row.style.cssText = `
            display:flex;
            align-items:flex-start;
            gap:14px;
            width:100%;
            max-width:1260px;
            margin:0 0 16px 0;
            box-sizing:border-box;
        `;

        marketBox.parentNode.insertBefore(row, marketBox);
        row.appendChild(marketBox);
        marketBox.style.flex = '0 0 720px';
        marketBox.style.boxSizing = 'border-box';

        const panel = document.createElement('div');
        panel.id = 'slf-purchase-forecast-panel';
        panel.style.cssText = `
            flex:0 0 430px;
            box-sizing:border-box;
            padding:10px 12px 11px 12px;
            background:#151515;
            color:#ddd;
            border:1px solid #3b5f3b;
            border-radius:5px;
            font-family:Arial,sans-serif;
            font-size:12px;
            box-shadow:0 0 0 1px rgba(0,0,0,0.35) inset;
        `;

        panel.innerHTML = `
            <div style="font-weight:bold;color:#7CFF7C;margin-bottom:9px;font-size:14px;">
                SLF Прогноз покупки
            </div>

            <div style="display:grid;grid-template-columns:52px 52px 52px 52px 72px 1fr;gap:6px;align-items:end;margin-bottom:10px;">
                <label style="color:#bbb;font-size:11px;">
                    Возр. от
                    <input id="slf-purchase-forecast-age-from" value="21" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">
                </label>

                <label style="color:#bbb;font-size:11px;">
                    до
                    <input id="slf-purchase-forecast-age-to" value="25" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">
                </label>

                <label style="color:#bbb;font-size:11px;">
                    Тал. от
                    <input id="slf-purchase-forecast-talent-from" value="4" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">
                </label>

                <label style="color:#bbb;font-size:11px;">
                    до
                    <input id="slf-purchase-forecast-talent-to" value="6" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">
                </label>

                <label style="color:#bbb;font-size:11px;">
                    Позиция
                    <select id="slf-purchase-forecast-position" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">
                        ${this.getPurchaseForecastPositionOptionsHtml()}
                    </select>
                </label>

                <button id="slf-purchase-forecast-calc" style="height:28px;padding:3px 8px;font-size:13px;cursor:pointer;">
                    Посчитать
                </button>
            </div>

            <div style="display:grid;grid-template-columns:78px 1fr 1fr;gap:6px;">
                <div style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;">
                    <div style="color:#999;font-size:11px;">Найдено</div>
                    <div id="slf-purchase-forecast-count" style="color:#fff;font-size:19px;font-weight:bold;line-height:1.1;">—</div>
                </div>

                <div style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;">
                    <div style="color:#999;font-size:11px;">Медиана</div>
                    <div id="slf-purchase-forecast-median" style="color:#fff;font-size:19px;font-weight:bold;line-height:1.1;">—</div>
                </div>

                <div style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;">
                    <div style="color:#999;font-size:11px;">75-й перц.</div>
                    <div id="slf-purchase-forecast-p75" style="color:#ffcc66;font-size:19px;font-weight:bold;line-height:1.1;">—</div>
                </div>
            </div>

            <div id="slf-purchase-forecast-note" style="color:#777;font-size:10px;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                Источник: VPS History. Нажми «Посчитать».
            </div>
        `;

        row.appendChild(panel);
        document.getElementById('slf-purchase-forecast-calc').onclick = () => this.runPurchaseForecast();
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

    TransferMarketAnalyzer.mount = function mountZeroCacheTransferAnalyzer() {
        if (!this.isPage()) return;

        console.log('[SLF Transfer Analyzer] zero-cache mount on transfers.php');
        this.addToolbar();

        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps()
                .catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }

        this.addPurchaseForecastPanel();
        this.clearAllTransferAnalysisState();
        this.setStatus?.('Live-only режим: нажми "Анализировать видимых", чтобы загрузить TM/SLF данные.');
    };

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

        if (this.slfLiveAnalysisRunning) {
            this.setStatus?.('Live анализ уже выполняется. Дождись завершения текущего прохода.');
            return;
        }

        const runId = Number(this.slfLiveAnalysisRunId || 0) + 1;
        this.slfLiveAnalysisRunId = runId;
        this.slfLiveAnalysisRunning = true;

        const analyzeButton = document.getElementById('slf-transfer-analyze-visible');
        const originalAnalyzeButtonText = analyzeButton ? analyzeButton.textContent : '';
        if (analyzeButton) {
            analyzeButton.disabled = true;
            analyzeButton.textContent = 'Анализ идет...';
        }

        const isCurrentRun = () => this.slfLiveAnalysisRunId === runId;

        const rows = this.parseVisibleRows?.() || [];
        if (!rows.length) {
            this.setStatus?.('Игроки не найдены.');
            this.slfLiveAnalysisRunning = false;
            if (analyzeButton) {
                analyzeButton.disabled = false;
                analyzeButton.textContent = originalAnalyzeButtonText || 'Анализировать видимых';
            }
            return;
        }

        const concurrency = 3;
        const runMemory = new Map();
        let done = 0;
        let analyzed = 0;
        let errors = 0;
        const total = rows.length;

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
            if (!isCurrentRun()) return { ok: false, row, skipped: true };
            this.renderLoadingBadge?.(row);
            try {
                const result = await loadPlayerData(row);
                if (!isCurrentRun()) return { ok: false, row, skipped: true };

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
                return { ok: false, row, error };
            } finally {
                done++;
                if (isCurrentRun() && (done === total || done % 3 === 0)) {
                    this.setStatus?.(`Live ${done}/${total}: analyzed ${analyzed}, errors ${errors}`);
                }
            }
        };

        const mapLimit = async (items, limit, worker) => {
            let cursor = 0;
            const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
                while (cursor < items.length && isCurrentRun()) {
                    const index = cursor++;
                    await worker(items[index], index);
                }
            });
            await Promise.all(workers);
        };

        this.setStatus?.(`Live анализ: ${total} игроков, parallel ${concurrency}...`);
        try {
            if (isCurrentRun()) await mapLimit(rows, concurrency, analyzeOne);
        } finally {
            this.slfLiveAnalysisRunning = false;
            if (analyzeButton) {
                analyzeButton.disabled = false;
                analyzeButton.textContent = originalAnalyzeButtonText || 'Анализировать видимых';
            }
        }

        if (isCurrentRun()) this.setStatus?.(`Готово live: ${total} игроков · analyzed ${analyzed} · errors ${errors}`);
    };

    TransferMarketAnalyzer.clearAllTransferAnalysisState();
}