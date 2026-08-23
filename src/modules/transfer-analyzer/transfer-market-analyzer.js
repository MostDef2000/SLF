// 14. Transfer Market Analyzer
// ============================================================

const TransferMarketAnalyzer = {
    analysisCacheKey: 'slf_transfer_analysis_row_cache_v1',
    analysisCacheTtlMs: 1000 * 60 * 60 * 24 * 14,
    marketBaseline: null,
    marketBaselinePromise: null,

    start() {
        if (!this.isPage()) return;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.mount());
        } else {
            this.mount();
        }

        window.addEventListener('load', () => this.mount());
        setTimeout(() => this.mount(), 800);
        setTimeout(() => this.mount(), 2000);
        setTimeout(() => this.mount(), 4000);
    },


    mount() {
        if (!this.isPage()) return;

        debugLog('[SLF Transfer Analyzer] mount on transfers.php');

        this.addToolbar();

        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps()
                .catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }

        this.renderCachedRows();
        this.loadMarketBaseline()
            .then(() => this.renderCachedRows())
            .catch(error => console.warn('[SLF Transfer Analyzer] market baseline load failed', error));
    },


    getCfg() {
        return CONFIG.TRANSFER_ANALYZER || {};
    },


    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },


    normalizeLower(value) {
        return this.normalizeText(value).toLowerCase();
    },


    addToolbar() {
        if (document.getElementById('slf-transfer-analyzer-toolbar')) return;

        const table = this.findTransferTable();

        if (!table) {
            console.warn('[SLF Transfer Analyzer] transfer table not found');
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.id = 'slf-transfer-analyzer-toolbar';
        toolbar.style.cssText = `
            margin:8px 0;
            padding:8px;
            background:#181818;
            border:1px solid #444;
            border-radius:5px;
            color:#ddd;
            font-size:12px;
            display:flex;
            gap:8px;
            align-items:center;
            flex-wrap:wrap;
        `;

        const historyMode = this.isHistoryPage();

        if (historyMode) {
            toolbar.innerHTML = `
                <b style="color:#7cff7c;">SLF Transfer Analyzer</b> <span style="color:#888;">history VPS sync</span>
                <button id="slf-transfer-analyze-visible">Анализировать видимых</button>
                <button id="slf-transfer-reset-order">Сброс порядка</button>
                <span id="slf-transfer-status" style="color:#aaa;"></span>
            `;

            table.parentNode.insertBefore(toolbar, table);
            document.getElementById('slf-transfer-analyze-visible').onclick = () => this.analyzeVisibleRows();
            document.getElementById('slf-transfer-reset-order').onclick = () => this.resetOrder();
            this.ensureAnalysisHeader(table);
            this.setStatus('History: простой VPS sync UI. MKT/N/details отключены.');
            return;
        }

        toolbar.innerHTML = `
            <b style="color:#7cff7c;">SLF Transfer Analyzer</b> <span style="color:#888;">${historyMode ? 'history collector' : '2-row compact'}</span>
            <button id="slf-transfer-analyze-visible" title="${historyMode ? 'Анализирует видимые состоявшиеся трансферы, хеширует события и отправляет completed_transfer записи на VPS.' : 'Догружает только недостающие TM/SLF данные. Уже найденное берётся из cache.'}">Анализировать видимых</button>
            <button id="slf-transfer-sort-score" title="Сортировка по общей оценке анализатора: зелёные маркеры и сильные SLF/TM сигналы выше, красные риски ниже. Retired/skip всегда просаживают score.">★ score ↓</button>
            <button id="slf-transfer-sort-delta" title="Сортировка по разнице alter.php: ИТОГ минус текущий скилл. Чем больше плюс, тем выше игрок.">SLF Δ ↓</button>
            <button id="slf-transfer-sort-min" title="Сортировка по % минут в текущем сезоне SLF alter.php. Сначала игроки, которые реально играют сейчас.">min% ↓</button>
            <button id="slf-transfer-sort-talent" title="Сортировка по сигналу повышения таланта: лига выше таланта + 40%+ минут. Текущий сезон важнее старых сезонов.">T-up ↓</button>
            <button id="slf-transfer-sort-tm-desc" title="Сортировка по актуальной TM-стоимости от дорогих к дешёвым. Для Retired берётся 0 как текущая ценность, старая цена остаётся только справкой.">TM € ↓</button>
            <button id="slf-transfer-sort-mkt-bargain" title="Сортировка по рыночной выгоде MKT относительно p75: сильнее ниже p75 выше в списке.">MKT bargain ↓</button>
            <button id="slf-transfer-sort-mkt-overpriced" title="Сортировка по переплате MKT относительно p75: сильнее выше p75 выше в списке.">MKT overpriced ↓</button>
            <button id="slf-transfer-reset-order" title="Вернуть исходный порядок строк на странице.">Сброс порядка</button>
            <button id="slf-transfer-clear-cache" title="Очистить TM + SLF alter cache. После этого анализ заново пройдёт игроков на странице.">Сброс cache</button>
            <span id="slf-transfer-status" style="color:#aaa;"></span>
        `;

        table.parentNode.insertBefore(toolbar, table);

        document.getElementById('slf-transfer-analyze-visible').onclick = () => this.analyzeVisibleRows();
        document.getElementById('slf-transfer-sort-score').onclick = () => this.sortByDataset('slfAnalyzerScore', 'desc', 'score');
        document.getElementById('slf-transfer-sort-delta').onclick = () => this.sortByDataset('slfSkillDelta', 'desc', 'SLF Δ');
        document.getElementById('slf-transfer-sort-min').onclick = () => this.sortByDataset('slfMinutesPct', 'desc', 'min%');
        document.getElementById('slf-transfer-sort-talent').onclick = () => this.sortByDataset('slfTalentUp', 'desc', 'T-up');
        document.getElementById('slf-transfer-sort-tm-desc').onclick = () => this.sortByTmValue('desc');
        document.getElementById('slf-transfer-sort-mkt-bargain').onclick = () => this.sortByDataset('slfMktBargain', 'desc', 'MKT bargain');
        document.getElementById('slf-transfer-sort-mkt-overpriced').onclick = () => this.sortByDataset('slfMktOverpriced', 'desc', 'MKT overpriced');
        document.getElementById('slf-transfer-reset-order').onclick = () => this.resetOrder();
        document.getElementById('slf-transfer-clear-cache').onclick = () => {
            TMEnrichmentLayer.clearCache();
            SLFAlterLayer.clearCache();
            this.clearAnalysisCache();
            this.setStatus('TM/SLF/analysis cache очищен.');
        };

        this.ensureAnalysisHeader(table);
        this.setStatus('Готов к анализу.');
    },


    parseRow(tr, index, map) {
        const text = this.normalizeText(tr.innerText);
        const lower = text.toLowerCase();

        if (!text) return null;

        if (
            lower.includes('амплуа') &&
            (
                lower.includes('фамилия') ||
                lower.includes('имя')
            )
        ) {
            return null;
        }

        const cells = [...tr.querySelectorAll('td')];

        if (cells.length < 4) return null;

        const getCell = idx => idx == null ? null : cells[idx] || null;
        const getText = idx => this.normalizeText(getCell(idx)?.innerText || '');

        const playerLink = this.findPlayerLinkInRow(tr);

        if (!playerLink) return null;

        const href = playerLink.getAttribute('href') || '';
        const idFromHref = (href.match(/id=(\d+)/) || [])[1];

        const idText = getText(map.id);
        const idFromCell = (idText.match(/\d{4,}/) || [])[0];
        const idFromRowStart = (text.match(/^(\d{4,})/) || [])[1];

        const playerId = idFromHref || idFromCell || idFromRowStart;

        if (!playerId) return null;

        const linkTitle = this.normalizeText(playerLink.getAttribute('title') || '');
        const linkText = this.normalizeText(playerLink.textContent || '');

        const name = this.cleanPlayerName(linkTitle || linkText || getText(map.name));
        const priceInfo = this.parseTransferPriceCellInfo(tr, map);

        const row = {
            rowEl: tr,
            originalIndex: index,
            playerId: String(playerId),
            playerUrl: buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(playerId)}`),

            name,
            positions: this.parsePositions(getText(map.pos) || text),

            age: this.parseNumber(getText(map.age)),
            talent: this.parseNumber(getText(map.talent)),
            potentialText: getText(map.potential),
            scoutSkill: this.parseNumber(getText(map.scoutSkill)),

            slfPriceText: priceInfo.priceText,
            slfPriceCellText: priceInfo.rawText,
            slfPrice: priceInfo.currentPrice,
            slfSecondaryPriceText: priceInfo.secondaryPriceText,
            slfSecondaryPrice: priceInfo.secondaryPrice,
            nominalRatio: priceInfo.nominalRatio,
            nominalBase: priceInfo.nominalBase,
            slfPriceSource: priceInfo.source,
            slfPriceCellIndex: priceInfo.cellIndex,
            slfBids: this.parseNumber(getText(map.bids)),
            endDateText: getText(map.endDate),

            tmUrl: '',
            tmProfile: null,
            tmValueEur: 0
        };

        tr.dataset.slfOriginalIndex = String(index);
        tr.dataset.slfPlayerId = row.playerId;

        return row;
    },


    parsePositions(value) {
        const text = this.normalizeText(value);
        const matches = text.match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/gi);

        if (!matches) return [];

        return [...new Set(matches.map(x => x.toUpperCase()))].slice(0, 3);
    },


    parseNumber(value) {
        const m = String(value || '').match(/-?\d+(?:[.,]\d+)?/);

        if (!m) return null;

        const n = Number(m[0].replace(',', '.'));

        return Number.isFinite(n) ? n : null;
    },


    setStatus(text) {
        const el = document.getElementById('slf-transfer-status');
        if (el) el.textContent = text || '';
    },


    renderCachedRows() {
        const rows = this.parseVisibleRows();

        if (!rows.length) return;

        let rendered = 0;

        rows.forEach(row => {
            const analysisCached = this.getCachedAnalysis(row);

            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                rendered++;
                return;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);

            if (!tmCached && !alterCached) return;

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
            rendered++;
        });

        if (rendered) {
            this.setStatus(`Из cache показано: ${rendered}. Нажми анализ, чтобы догрузить недостающее.`);
        }
    },


    async analyzeVisibleRows() {
        if (this.isHistoryPage()) {
            await this.analyzeHistoryVisibleRows();
            return;
        }

        const rows = this.parseVisibleRows();

        if (!rows.length) {
            this.setStatus('Игроки не найдены.');
            return;
        }

        this.setStatus(`Найдено строк: ${rows.length}. Анализ...`);
        await this.loadMarketBaseline();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const analysisCached = this.getCachedAnalysis(row);

            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                this.setStatus(`Cache ${i + 1}/${rows.length}: ${row.name || row.playerId}`);
                continue;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`${fromCache ? 'Cache' : 'Анализ'} ${i + 1}/${rows.length}: ${row.name || row.playerId}`);

            if (!fromCache) {
                this.renderLoadingBadge(row);
            }

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer Analyzer] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                this.renderRowBadge(row, tmResult, slfAlter);
                this.saveRowAnalysis(row, tmResult, slfAlter);
            } catch (e) {
                console.error('[SLF Transfer Analyzer] row failed', row, e);
                this.renderErrorBadge(row, e);
            }
        }

        this.setStatus(`Готово: ${rows.length} игроков. Из cache используется всё, что уже было сохранено.`);
    },



    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
};

// ============================================================
