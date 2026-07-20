// 14. Transfer Market Analyzer
// ============================================================

const TransferMarketAnalyzer = {
    analysisCacheKey: 'slf_transfer_analysis_row_cache_v1',
    analysisCacheTtlMs: 1000 * 60 * 60 * 24 * 14,
    marketBaseline: null,
    marketBaselinePromise: null,

    isTransferDetailPage() {
        if (!location.pathname.includes('/transfers.php')) return false;

        const params = new URLSearchParams(location.search);
        return params.get('action') === 'view' && !!params.get('transfer_id');
    },

    isPage() {
        // Transfer detail pages are not list/analysis pages.
        // Do not mount analyzer UI, hydration, tooltips, observers or requests there.
        return location.pathname.includes('/transfers.php') && !this.isTransferDetailPage();
    },

    isHistoryPage() {
        return location.pathname.includes('/transfers.php') &&
            !this.isTransferDetailPage() &&
            new URLSearchParams(location.search).get('action') === 'history';
    },

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

        console.log('[SLF Transfer Analyzer] mount on transfers.php');

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

    isWrapperTable(table) {
        if (!table) return true;

        const id = String(table.id || '').toLowerCase();
        const cls = String(table.className || '').toLowerCase();

        if (id === 'globalcontent') return true;
        if (cls.includes('game-ui__background')) return true;

        const nestedTables = table.querySelectorAll('table').length;
        const rows = table.querySelectorAll('tr').length;

        if (nestedTables >= 3 && rows > 20) return true;

        return false;
    },

    getPlayerLinksIn(table) {
        if (!table) return [];

        return [...table.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });
    },

    scoreTransferTable(table) {
        if (!table || this.isWrapperTable(table)) return -999;

        const text = this.normalizeLower(table.innerText);
        const rows = [...table.querySelectorAll('tr')];
        const playerLinks = this.getPlayerLinksIn(table);
        const nestedTables = table.querySelectorAll('table').length;

        const headerScore =
            (text.includes('амплуа') ? 4 : 0) +
            (text.includes('фамилия') || text.includes('имя') ? 4 : 0) +
            (text.includes('цена') ? 3 : 0) +
            (text.includes('тал') ? 1 : 0) +
            (text.includes('воз') ? 1 : 0) +
            (text.includes('пот') ? 1 : 0) +
            (text.includes('дата') || text.includes('оконч') ? 1 : 0);

        const playerScore = Math.min(playerLinks.length, 20) * 3;

        const sizePenalty =
            rows.length > 80 ? 20 :
            rows.length > 40 ? 8 :
            0;

        const nestedPenalty =
            nestedTables > 0 ? nestedTables * 2 : 0;

        return headerScore + playerScore - sizePenalty - nestedPenalty;
    },

    findTransferTable() {
        const tables = [...document.querySelectorAll('table')];

        const candidates = tables
            .map(table => ({
                table,
                score: this.scoreTransferTable(table),
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                playerLinks: this.getPlayerLinksIn(table).length,
                id: table.id || '',
                cls: String(table.className || ''),
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.score > 0 && x.playerLinks > 0)
            .sort((a, b) => b.score - a.score);

        if (candidates.length) {
            console.log('[SLF Transfer Analyzer] findTransferTable', {
                found: true,
                selected: {
                    score: candidates[0].score,
                    rows: candidates[0].rows,
                    nested: candidates[0].nested,
                    playerLinks: candidates[0].playerLinks,
                    id: candidates[0].id,
                    sample: candidates[0].sample
                },
                candidates: candidates.slice(0, 5).map(x => ({
                    score: x.score,
                    rows: x.rows,
                    nested: x.nested,
                    playerLinks: x.playerLinks,
                    id: x.id,
                    sample: x.sample
                }))
            });

            return candidates[0].table;
        }

        const playerLinks = [...document.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        const tableMap = new Map();

        playerLinks.forEach(a => {
            let node = a;

            while (node && node !== document.body) {
                if (node.tagName && node.tagName.toLowerCase() === 'table') {
                    if (!this.isWrapperTable(node)) {
                        tableMap.set(node, (tableMap.get(node) || 0) + 1);
                        break;
                    }
                }

                node = node.parentElement;
            }
        });

        const fallback = [...tableMap.entries()]
            .map(([table, count]) => ({
                table,
                count,
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.count >= 3)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.rows - b.rows;
            });

        const found = fallback[0]?.table || null;

        console.log('[SLF Transfer Analyzer] findTransferTable fallback', {
            found: !!found,
            fallback: fallback.slice(0, 5).map(x => ({
                count: x.count,
                rows: x.rows,
                nested: x.nested,
                sample: x.sample
            }))
        });

        return found;
    },

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

    loadMarketBaseline() {
        if (this.marketBaseline) return Promise.resolve(this.marketBaseline);
        if (this.marketBaselinePromise) return this.marketBaselinePromise;

        this.marketBaselinePromise = Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY)
            .then(({ data }) => {
                const rows = normalizeServerRows(data);
                this.marketBaseline = this.buildMarketBaseline(rows);
                return this.marketBaseline;
            })
            .catch(error => {
                this.marketBaseline = { ready: false, error, byKey: {}, generatedAt: Date.now() };
                return this.marketBaseline;
            });

        return this.marketBaselinePromise;
    },

    buildMarketBaseline(rows) {
        const buckets = {};
        const add = (key, value) => {
            if (!key || !value || !Number.isFinite(value)) return;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(value);
        };

        (rows || []).forEach(event => {
            if (!event || event.recordType !== 'completed_transfer') return;

            const price = Number(event.transfer?.price || 0);
            if (!price || price < 1) return;

            const player = event.player || {};
            const pos = this.normalizeMarketPosition(player.primaryPosition || (Array.isArray(player.positions) ? player.positions[0] : ''));
            const ageBucket = this.getMarketAgeBucket(player.age);
            const talentBucket = this.getMarketTalentBucket(player.talent);
            const alterSummary = event.enrichment?.slfAlterSummary || {};
            const finalSkill = player.finalSkill ?? alterSummary.finalSkill ?? null;
            const skillBucket = this.getMarketSkillBucket(finalSkill ?? player.skill ?? player.scoutSkill ?? player.currentSkill);

            add('all', price);
            if (pos) add(`pos:${pos}`, price);
            if (ageBucket) add(`age:${ageBucket}`, price);
            if (skillBucket) add(`skill:${skillBucket}`, price);
            if (pos && ageBucket) add(`pos:${pos}|age:${ageBucket}`, price);
            if (pos && talentBucket) add(`pos:${pos}|talent:${talentBucket}`, price);
            if (pos && skillBucket) add(`pos:${pos}|skill:${skillBucket}`, price);
            if (pos && ageBucket && talentBucket && skillBucket) add(`pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}`, price);
        });

        const byKey = {};
        Object.entries(buckets).forEach(([key, values]) => {
            const sorted = values.slice().sort((a, b) => a - b);
            byKey[key] = this.summarizeMarketValues(sorted);
        });

        return {
            ready: true,
            generatedAt: Date.now(),
            byKey
        };
    },

    summarizeMarketValues(values) {
        const n = values.length;
        const at = pct => values[Math.min(n - 1, Math.max(0, Math.floor((n - 1) * pct)))] || null;
        const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);

        return {
            count: n,
            min: values[0] || null,
            p25: at(0.25),
            median: at(0.50),
            p75: at(0.75),
            max: values[n - 1] || null,
            avg: n ? Math.round(sum / n) : null,
            confidence: n >= 20 ? 'high' : n >= 8 ? 'medium' : n >= 3 ? 'low' : 'weak'
        };
    },

    normalizeMarketPosition(value) {
        const raw = String(value || '').toUpperCase().trim();
        if (!raw) return '';
        if (raw === 'GK') return 'GK';
        if (raw === 'LD' || raw === 'DL' || raw === 'LB') return 'DL';
        if (raw === 'RD' || raw === 'DR' || raw === 'RB') return 'DR';
        if (/^CD|^DC|CB/.test(raw)) return 'DC';
        if (/^DM/.test(raw)) return 'DM';
        if (/^CM/.test(raw)) return 'CM';
        if (/^AM/.test(raw)) return 'AM';
        if (raw === 'LM' || raw === 'LW' || raw === 'ML') return 'ML';
        if (raw === 'RM' || raw === 'RW' || raw === 'MR') return 'MR';
        if (/^ST|CF/.test(raw)) return 'ST';
        return raw;
    },

    getMarketAgeBucket(age) {
        const n = Number(age || 0);
        if (!n) return '';
        if (n <= 18) return 'u18';
        if (n <= 21) return 'u21';
        if (n <= 24) return 'u24';
        if (n <= 29) return 'prime';
        if (n <= 32) return 'short';
        return 'vet';
    },

    getMarketTalentBucket(talent) {
        const n = Number(talent || 0);
        if (!n) return '';
        if (n <= 2) return 't1_2';
        if (n <= 4) return 't3_4';
        if (n <= 6) return 't5_6';
        if (n <= 8) return 't7_8';
        return 't9p';
    },

    getMarketSkillBucket(skill) {
        const n = Number(skill || 0);
        if (!n) return '';
        if (n < 20) return 's00_19';
        if (n < 30) return 's20_29';
        if (n < 40) return 's30_39';
        if (n < 50) return 's40_49';
        if (n < 60) return 's50_59';
        if (n < 70) return 's60_69';
        return 's70p';
    },

    getMarketSkillBasis(row, slfAlter) {
        const finalSkill = slfAlter?.finalSkill != null ? Number(slfAlter.finalSkill) : null;
        const currentSkill = slfAlter?.currentSkill != null ? Number(slfAlter.currentSkill) : null;
        const pageSkill = row?.scoutSkill != null ? Number(row.scoutSkill) : null;

        if (Number.isFinite(finalSkill) && finalSkill > 0) {
            return {
                skill: finalSkill,
                source: 'alter_final_skill',
                label: `ИТОГ alter.php ${SLFAlterLayer.formatSkill(finalSkill)}`,
                currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
                pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
                lowConfidence: false,
                missing: false
            };
        }

        return {
            skill: null,
            source: slfAlter ? 'alter_without_final_skill' : 'alter_missing',
            label: slfAlter ? 'ИТОГ alter.php не распознан' : 'alter.php не загружен',
            currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
            pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
            lowConfidence: true,
            missing: true
        };
    },

    findMarketBaseline(row, slfAlter) {
        const baseline = this.marketBaseline;
        if (!baseline?.ready) return null;

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const pos = this.normalizeMarketPosition((row.positions || [])[0]);
        const ageBucket = this.getMarketAgeBucket(row.age);
        const talentBucket = this.getMarketTalentBucket(row.talent);
        const skillBucket = this.getMarketSkillBucket(skillBasis.skill);
        const keys = [
            pos && ageBucket && talentBucket && skillBucket ? `pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}` : '',
            pos && skillBucket ? `pos:${pos}|skill:${skillBucket}` : '',
            pos && ageBucket ? `pos:${pos}|age:${ageBucket}` : '',
            pos && talentBucket ? `pos:${pos}|talent:${talentBucket}` : '',
            pos ? `pos:${pos}` : '',
            skillBucket ? `skill:${skillBucket}` : '',
            ageBucket ? `age:${ageBucket}` : '',
            'all'
        ].filter(Boolean);

        for (const key of keys) {
            const item = baseline.byKey?.[key];
            if (item && item.count >= 3) {
                return Object.assign({ key }, item);
            }
        }

        return null;
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

    findHeaderRow(table) {
        if (!table) return null;

        return [...table.querySelectorAll('tr')].find(tr => {
            const text = this.normalizeLower(tr.innerText);

            return text.includes('амплуа') &&
                (
                    text.includes('фамилия') ||
                    text.includes('имя')
                );
        }) || null;
    },

    ensureAnalysisHeader(table) {
        const headerRow = this.findHeaderRow(table);

        if (!headerRow) {
            console.warn('[SLF Transfer Analyzer] header row not found');
            return;
        }

        if (headerRow.querySelector('.slf-transfer-analysis-header')) return;

        const cell = document.createElement('td');
        cell.className = 'slf-transfer-analysis-header';
        cell.textContent = this.isHistoryPage() ? 'VPS' : 'TM анализ';
        cell.style.cssText = `
            color:#7cff7c;
            font-weight:bold;
            text-align:center;
            min-width:${this.isHistoryPage() ? '80px' : '0'};
            width:auto;
            border-left:1px solid #444;
            background:#202020;
        `;

        headerRow.appendChild(cell);
    },

    getHeaderMap(table) {
        const headerRow = this.findHeaderRow(table);

        const cells = headerRow
            ? [...headerRow.querySelectorAll('td, th')].map(c => this.normalizeLower(c.innerText))
            : [];

        const find = (...needles) => {
            const normalizedNeedles = needles.map(n => this.normalizeLower(n));

            const idx = cells.findIndex(text => {
                return normalizedNeedles.some(n => text.includes(n));
            });

            return idx >= 0 ? idx : null;
        };

        const map = {
            id: find('#', 'id'),
            pos: find('амплуа'),
            name: find('фамилия', 'имя'),
            club: find('команда', 'клуб'),
            age: find('возраст', 'воз'),
            talent: find('талант', 'тал'),
            potential: find('потенциал', 'пот'),
            scoutSkill: find('скилл', 'ск'),
            price: find('цена', 'сумма'),
            date: find('дата'),
            fromClub: find('откуда'),
            toClub: find('куда'),
            transferSum: find('сумма'),
            sellerManager: find('от кого'),
            buyerManager: find('кому'),
            transferType: find('тип'),
            endDate: find('дата окончания', 'оконч'),
            bids: find('предл', 'став')
        };

        console.log('[SLF Transfer Analyzer] header map', {
            cells,
            map
        });

        return map;
    },

    parseVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseRow(tr, index, map))
            .filter(Boolean);

        console.log('[SLF Transfer Analyzer] parseVisibleRows', parsed);

        return parsed;
    },

    findPlayerLinkInRow(tr) {
        const links = [...tr.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        if (!links.length) return null;

        const scored = links
            .map(a => {
                const text = this.normalizeText(a.textContent || '');
                const title = this.normalizeText(a.getAttribute('title') || '');
                const href = a.getAttribute('href') || '';
                const nameCandidate = title || text;

                const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(nameCandidate);
                const hasSpace = /\s/.test(nameCandidate);

                let score = 0;
                if (hasLetters) score += 5;
                if (hasSpace) score += 2;
                if (nameCandidate.length >= 3 && nameCandidate.length <= 40) score += 2;
                if (href.includes('action=view')) score += 1;

                return { a, score, nameCandidate };
            })
            .sort((a, b) => b.score - a.score);

        return scored[0].a;
    },

    cleanPlayerName(raw) {
        let name = this.normalizeText(raw);

        if (!name) return '';

        const parts = name.split(' ').filter(Boolean);

        if (parts.length >= 2) {
            const first = parts[0];
            const lastIndex = parts.length - 1;
            const last = parts[lastIndex];

            if (
                first.length >= 2 &&
                last.endsWith(first) &&
                last.length > first.length
            ) {
                parts[lastIndex] = last.slice(0, -first.length);
                name = parts.join(' ').trim();
            }
        }

        const firstWord = name.split(' ')[0];

        if (
            firstWord &&
            firstWord.length >= 2 &&
            name.endsWith(firstWord) &&
            name.length > firstWord.length * 2
        ) {
            const cut = name.slice(0, -firstWord.length).trim();

            if (cut.includes(' ')) {
                name = cut;
            }
        }

        return name.trim();
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


    parseMoney(value) {
        const raw = String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/,/g, '.')
            .trim();

        if (!raw) return null;

        const lower = raw.toLowerCase();
        const numberMatch = lower.match(/(\d+(?:\s\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);

        if (!numberMatch) return null;

        const numeric = Number(String(numberMatch[1]).replace(/\s/g, ''));
        if (!Number.isFinite(numeric)) return null;

        let multiplier = 1;

        if (/[0-9]\s*[bб](?=$|[^a-zа-яё0-9])|\b(bn|billion)\b|млрд|миллиард/.test(lower)) {
            multiplier = 1000000000;
        } else if (/[0-9]\s*[mм](?=$|[^a-zа-яё0-9])|\b(mln|million)\b|млн|миллион/.test(lower)) {
            multiplier = 1000000;
        } else if (/[0-9]\s*[kк](?=$|[^a-zа-яё0-9])|\b(тыс|thousand)\b/.test(lower)) {
            multiplier = 1000;
        }

        const valueNumber = Math.round(numeric * multiplier);
        return Number.isFinite(valueNumber) && valueNumber > 0 ? valueNumber : null;
    },

    formatSlfMoneyShort(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) return '?';

        if (n >= 1000000) {
            const v = n / 1000000;
            return `${v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}M`;
        }

        if (n >= 1000) {
            const v = n / 1000;
            return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
        }

        return String(Math.round(n));
    },

    parseNominalRatio(text) {
        const raw = this.normalizeText(text);
        const m = raw.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        if (!m) return null;

        const n = Number(String(m[1]).replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : null;
    },

    parseSlfMoneyToken(token) {
        return this.parseMoney(String(token || '').trim());
    },

    extractSlfMoneyTokens(text, nominalMatch) {
        const raw = String(text || '');
        const re = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)(?:\s*)([KКMМBБ])/gi;
        const tokens = [];
        let m;

        while ((m = re.exec(raw))) {
            const token = m[0].trim();
            const start = m.index;
            const afterNominal = !nominalMatch || start >= nominalMatch.index + nominalMatch[0].length;
            if (!afterNominal) continue;

            const value = this.parseSlfMoneyToken(token);
            if (value) tokens.push({ token, value, start });
        }

        return tokens;
    },

    looksLikeTransferPriceCell(text) {
        const raw = this.normalizeText(text);
        if (!raw) return false;
        const hasNominal = /(?:^|\s)\d+(?:[.,]\d+)?\s*[HН](?=\s|$)/i.test(raw);
        const hasMoney = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(raw);
        return hasNominal && hasMoney;
    },

    findTransferPriceCell(tr, map) {
        const cells = [...tr.querySelectorAll('td')];
        if (!cells.length) return { cell: null, index: null, source: 'not_found' };

        const hasNominalDomMarker = cell => !!cell.querySelector(
            '[title="Кол-во номиналов"], [title*="Кол-во номиналов"], img[title="Кол-во номиналов"], img[title*="Кол-во номиналов"]'
        );

        const hasSlfCurrencyImg = cell => !!cell.querySelector(
            'img[title="Внутренняя валюта"], img[title*="Внутренняя валюта"]'
        );

        const hasSlfMoneyText = text => /(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(text);

        const candidates = cells
            .map((cell, index) => {
                const text = this.normalizeText(cell.innerText || cell.textContent || '');
                const nominalDom = hasNominalDomMarker(cell);
                const currencyImg = hasSlfCurrencyImg(cell);
                const contentPattern = this.looksLikeTransferPriceCell(text);
                const moneyText = hasSlfMoneyText(text);

                // Strict preferred detector for the real "Цена" cell on active transfers:
                // nominal marker title="Кол-во номиналов" + internal currency image.
                const domPriceCell = nominalDom && currencyImg && moneyText;
                const valid = domPriceCell || contentPattern;
                if (!valid) return null;

                let score = domPriceCell ? 200 : 100;
                if (nominalDom) score += 60;
                if (currencyImg) score += 60;
                if (index === map?.price) score += 30;
                if (/^\s*\d+(?:[.,]\d+)?\s*[HН]\s+\d/i.test(text)) score += 15;
                if (cell.querySelector('a[href*="player.php"]')) score -= 80;
                if (/^\d{4,}$/.test(text)) score -= 100;

                return {
                    cell,
                    index,
                    text,
                    score,
                    source: domPriceCell ? 'price_cell_nominal_title_currency_img' : 'price_cell_content_pattern'
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        if (candidates[0]) {
            return { cell: candidates[0].cell, index: candidates[0].index, source: candidates[0].source };
        }

        const fallback = map?.price != null ? cells[map.price] : null;
        if (fallback) {
            const text = this.normalizeText(fallback.innerText || fallback.textContent || '');
            if (hasSlfMoneyText(text) && !fallback.querySelector('a[href*="player.php"]')) {
                return { cell: fallback, index: map.price, source: 'validated_header_price_cell' };
            }
        }

        return { cell: null, index: null, source: 'not_found' };
    },

    parseTransferPriceCellInfo(tr, map) {
        const found = this.findTransferPriceCell(tr, map);
        const rawText = this.normalizeText(found.cell?.innerText || found.cell?.textContent || '');
        const nominalMatch = rawText.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        const nominalRatio = nominalMatch ? Number(String(nominalMatch[1]).replace(',', '.')) : null;
        const moneyTokens = this.extractSlfMoneyTokens(rawText, nominalMatch);
        const current = moneyTokens[0] || null;
        const secondary = moneyTokens[1] || null;
        const currentPrice = current?.value || null;
        const nominalBase = currentPrice && nominalRatio ? Math.round(currentPrice / nominalRatio) : null;

        return {
            rawText,
            priceText: current?.token || rawText,
            currentPrice,
            secondaryPriceText: secondary?.token || '',
            secondaryPrice: secondary?.value || null,
            nominalRatio: Number.isFinite(nominalRatio) && nominalRatio > 0 ? nominalRatio : null,
            nominalBase,
            source: found.source,
            cellIndex: found.index
        };
    },

    getCurrentSlfMarketPrice(row) {
        const fromPageText = row?.slfPriceText || '';
        const fromPageCellText = row?.slfPriceCellText || fromPageText;
        const fromPageParsed = row?.slfPrice != null ? Number(row.slfPrice) : this.parseMoney(fromPageText);

        if (Number.isFinite(fromPageParsed) && fromPageParsed > 0) {
            return {
                value: fromPageParsed,
                text: fromPageText || this.formatSlfMoneyShort(fromPageParsed),
                source: row?.slfPriceSource || 'transfer_page_price_cell',
                sourceLabel: row?.slfPriceSource === 'price_cell_content_pattern'
                    ? 'ячейка Цена по DOM-паттерну H + SLF money'
                    : 'текущая цена на странице',
                parsedDomCellValue: fromPageCellText || '',
                nominalRatio: row?.nominalRatio ?? null,
                nominalBase: row?.nominalBase ?? null,
                secondaryPriceText: row?.slfSecondaryPriceText || ''
            };
        }

        if (row?.completedTransfer && row?.salePrice) {
            const value = Number(row.salePrice || 0);
            return {
                value,
                text: row.salePriceText || this.formatSlfMoneyShort(value),
                source: 'completed_transfer_row_price',
                sourceLabel: 'финальная цена завершённого трансфера',
                parsedDomCellValue: row.salePriceText || ''
            };
        }

        return {
            value: 0,
            text: '',
            source: 'not_found',
            sourceLabel: 'цена не распознана',
            parsedDomCellValue: fromPageText || row?.salePriceText || ''
        };
    },

    parseHistoryDate(value) {
        const text = this.normalizeText(value);
        const m = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

        if (!m) {
            return { dateText: text, dateTs: null };
        }

        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

        return {
            dateText: text,
            dateTs: Number.isFinite(ts) ? ts : null
        };
    },

    parseHistoryVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);

        console.log('[SLF Transfer History] parseHistoryVisibleRows', parsed);

        return parsed;
    },

    parseHistoryRow(tr, index, map) {
        const text = this.normalizeText(tr.innerText);
        const lower = text.toLowerCase();

        if (!text) return null;
        if (lower.includes('амплуа') && lower.includes('сумма')) return null;

        const cells = [...tr.querySelectorAll('td')];
        if (cells.length < 10) return null;

        const rawCells = cells.map(td => this.normalizeText(td.innerText || td.textContent || ''));

        const dateIndex = rawCells.findIndex(cell =>
            /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(?:\s+\d{1,2}:\d{2})?/.test(cell)
        );

        if (dateIndex < 0) return null;

        const cell = offset => rawCells[dateIndex + offset] || '';

        const playerLink = this.findPlayerLinkInRow(tr);
        if (!playerLink) return null;

        const href = playerLink.getAttribute('href') || '';
        const idFromHref = (href.match(/id=(\d+)/) || [])[1];
        const idFromRowStart = (text.match(/^\s*(\d{4,})/) || [])[1];
        const playerId = idFromHref || idFromRowStart;

        if (!playerId) return null;

        const linkTitle = this.normalizeText(playerLink.getAttribute('title') || '');
        const linkText = this.normalizeText(playerLink.textContent || '');

        const dateRaw = cell(0);
        const date = this.parseHistoryDate(dateRaw);

        const positionsText = [cell(1), cell(2)]
            .filter(Boolean)
            .join(' ')
            .trim();

        const name = this.cleanPlayerName(linkTitle || linkText || cell(3));

        const age = this.parseNumber(cell(4));
        const talent = this.parseNumber(cell(5));
        const scoutSkill = this.parseNumber(cell(6));

        const fromClubText = cell(7);
        const toClubText = cell(8);
        const salePriceText = cell(9);
        const salePrice = this.parseMoney(salePriceText);

        const historyAuxText = cell(10);
        const buyerManagerText = cell(11);
        const sellerManagerText = cell(12);

        const row = {
            rowEl: tr,
            originalIndex: index,
            playerId: String(playerId),
            playerUrl: buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(playerId)}`),

            name,
            positions: this.parsePositions(positionsText || text),

            age,
            talent,
            potentialText: '',
            scoutSkill,

            slfPriceText: salePriceText,
            salePriceText,
            salePrice,
            transferDateText: date.dateText,
            transferDateTs: date.dateTs,
            fromClubText,
            toClubText,
            sellerManagerText,
            buyerManagerText,
            transferTypeText: historyAuxText,
            historyAuxText,
            historySchemaVersion: 2,
            historyParserVersion: 'history_v2_cells',

            rawCells,
            rawText: text,
            completedTransfer: true,

            tmUrl: '',
            tmProfile: null,
            tmValueEur: 0
        };

        tr.dataset.slfOriginalIndex = String(index);
        tr.dataset.slfPlayerId = row.playerId;
        tr.dataset.slfCompletedTransfer = '1';
        tr.dataset.slfTransferPrice = String(salePrice || 0);
        tr.dataset.slfTransferDateTs = String(date.dateTs || 0);

        return row;
    },

    getHistorySyncedStorageKey() {
        return 'slf_transfer_history_synced_keys_v2';
    },

    loadHistorySyncedKeys() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistorySyncedStorageKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistorySyncedKeys(data) {
        localStorage.setItem(this.getHistorySyncedStorageKey(), JSON.stringify(data || {}));
    },

    getHistoryVpsCacheKey() {
        return 'slf_transfer_history_vps_records_cache_v1';
    },

    loadHistoryVpsCache() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistoryVpsCacheKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistoryVpsCache(data) {
        try {
            localStorage.setItem(this.getHistoryVpsCacheKey(), JSON.stringify({
                savedAt: Date.now(),
                rows: Array.isArray(data) ? data.slice(-3000) : []
            }));
        } catch (e) {
            console.warn('[SLF Transfer History] VPS cache save failed', e);
        }
    },

    normalizeHistoryVpsRows(data) {
        const rows = normalizeServerRows(data)
            .filter(row => row && (row.recordType === 'completed_transfer' || row.eventType === 'completed_transfer'));

        return rows;
    },

    async loadHistoryVpsRows() {
        try {
            const result = await Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY);
            const rows = this.normalizeHistoryVpsRows(result.data);
            this.saveHistoryVpsCache(rows);
            return rows;
        } catch (e) {
            const cache = this.loadHistoryVpsCache();
            const rows = Array.isArray(cache.rows) ? cache.rows : [];
            if (rows.length) return rows;
            throw e;
        }
    },

    buildHistoryMatchKeys(row) {
        const keys = [];
        if (!row) return keys;

        const playerId = String(row.playerId || '').trim();
        const price = Number(row.salePrice || 0);
        const dateText = this.normalizeText(row.transferDateText || '');
        const dateTs = Number(row.transferDateTs || 0);

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    buildHistoryVpsRecordKeys(record) {
        const transfer = record?.transfer || {};
        const player = record?.player || {};
        const playerId = String(player.playerId || record.playerId || '').trim();
        const price = Number(transfer.price || record.price || 0);
        const dateText = this.normalizeText(transfer.dateText || record.dateText || '');
        const dateTs = Number(transfer.dateTs || record.dateTs || 0);
        const keys = [];

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    indexHistoryVpsRows(records) {
        const map = new Map();

        (records || []).forEach(record => {
            this.buildHistoryVpsRecordKeys(record).forEach(key => {
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(record);
            });
        });

        return map;
    },

    findHistoryVpsMatch(row, index) {
        const keys = this.buildHistoryMatchKeys(row);
        for (const key of keys) {
            const list = index.get(key);
            if (Array.isArray(list) && list.length) {
                return { record: list[0], key, confidence: key.includes('|price:') && (key.includes('|date:') || key.includes('|ts:')) ? 'high' : 'medium' };
            }
        }
        return null;
    },

    renderHistoryVpsBadge(row, match) {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const synced = !!match;
        const label = synced ? '✓ VPS' : '□ VPS';
        const color = synced ? '#7cff7c' : '#777';
        const border = synced ? '#4b7d2d' : '#444';
        const bg = synced ? '#173018' : '#181818';

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${border};
                border-radius:4px;
                background:${bg};
                color:${color};
                font-weight:bold;
                white-space:nowrap;
            ">${label}</span>
        `;
    },

    renderHistorySyncStatus(row, label = '… VPS', level = 'pending') {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const colors = {
            pending: { color: '#ffd76a', border: '#7a6422', bg: '#302610' },
            error: { color: '#ff9f9f', border: '#854040', bg: '#301515' },
            neutral: { color: '#aaa', border: '#444', bg: '#181818' }
        };
        const c = colors[level] || colors.neutral;

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${c.border};
                border-radius:4px;
                background:${c.bg};
                color:${c.color};
                font-weight:bold;
                white-space:nowrap;
            ">${this.escapeHtml(label)}</span>
        `;
    },

    async hydrateHistoryFromVps() {
        const rows = this.parseHistoryVisibleRows();
        if (!rows.length) {
            this.setStatus('История: строки не найдены для VPS rehydrate.');
            return;
        }

        this.setStatus(`История: загружаю VPS completed_transfer (${rows.length} строк)...`);
        const records = await this.loadHistoryVpsRows();
        const index = this.indexHistoryVpsRows(records);
        let matched = 0;

        rows.forEach(row => {
            const match = this.findHistoryVpsMatch(row, index);
            if (match) matched++;
            this.renderHistoryVpsBadge(row, match || null);
        });

        this.setStatus(`История VPS: найдено совпадений ${matched}/${rows.length}; записей в базе ${records.length}.`);
    },

    async hashText(value) {
        const text = String(value || '');

        try {
            if (window.crypto?.subtle && window.TextEncoder) {
                const bytes = new TextEncoder().encode(text);
                const digest = await window.crypto.subtle.digest('SHA-256', bytes);

                return [...new Uint8Array(digest)]
                    .map(byte => byte.toString(16).padStart(2, '0'))
                    .join('');
            }
        } catch (e) {
            console.warn('[SLF Transfer History] crypto hash failed, fallback hash used', e);
        }

        let h = 0;
        for (let i = 0; i < text.length; i++) {
            h = ((h << 5) - h) + text.charCodeAt(i);
            h |= 0;
        }

        return `fallback_${Math.abs(h).toString(16)}`;
    },

    buildHistoryEventKeySource(row) {
        return [
            'completed_transfer',
            row.transferDateText || '',
            row.playerId || '',
            row.fromClubText || '',
            row.toClubText || '',
            row.salePrice || 0
        ].join('|');
    },

    buildHistoryAnalysisPayload(row, enriched, slfAlter) {
        const profile = enriched?.tmProfile || null;
        const fallbackProfile = {
            marketValueEur: 0,
            lastKnownMarketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const effectiveProfile = profile || fallbackProfile;
        const markers = this.buildMarkers(row, effectiveProfile, slfAlter);
        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, сохранены SLF/alter.php сигналы.'
            };

        return {
            verdict: {
                label: verdict.label,
                level: verdict.level,
                score: Number(verdict.score || 0),
                reason: verdict.reason || ''
            },
            markers: markers.map(marker => ({
                category: this.markerCategory(marker),
                label: marker.label || '',
                level: marker.level || '',
                score: Number(marker.score || 0),
                redFlag: !!marker.redFlag,
                hardStop: !!marker.hardStop,
                text: marker.text || ''
            })),
            sortMetrics: {
                analyzerScore: Number(verdict.score || 0),
                skillDelta: slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : null,
                currentMinutesPct: slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : null,
                talentUpScore: markers.some(m => this.markerCategory(m) === 'talent')
                    ? Number(slfAlter?.talentUpgradeRow?.minutesPct || 0)
                    : null,
                tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0),
                salePrice: Number(row.salePrice || 0)
            }
        };
    },

    buildSlfAlterSummary(alter) {
        if (!alter) return null;

        return {
            age: alter.age ?? null,
            talent: alter.talent ?? null,
            currentSkill: alter.currentSkill ?? null,
            finalSkill: alter.finalSkill ?? null,
            skillDelta: alter.skillDelta ?? null,
            currentSeasonYear: alter.currentSeasonYear ?? null,
            currentSeasonLabel: alter.currentSeasonLabel || '',
            hasCurrentSeason: !!alter.hasCurrentSeason,
            isCurrentSeasonActive: !!alter.isCurrentSeasonActive,
            staleActivity: !!alter.staleActivity,
            currentRow: alter.currentRow ? {
                season: alter.currentRow.season,
                seasonLabel: alter.currentRow.seasonLabel,
                leagueLevel: alter.currentRow.leagueLevel,
                leagueSkill: alter.currentRow.leagueSkill,
                minutesPct: alter.currentRow.minutesPct,
                minutes: alter.currentRow.minutes,
                gamesPlayed: alter.currentRow.gamesPlayed,
                gamesPossible: alter.currentRow.gamesPossible,
                starts: alter.currentRow.starts
            } : null,
            talentUpgradeEligible: !!alter.talentUpgradeEligible,
            talentUpgradeRow: alter.talentUpgradeRow ? {
                season: alter.talentUpgradeRow.season,
                seasonLabel: alter.talentUpgradeRow.seasonLabel,
                leagueLevel: alter.talentUpgradeRow.leagueLevel,
                leagueSkill: alter.talentUpgradeRow.leagueSkill,
                minutesPct: alter.talentUpgradeRow.minutesPct
            } : null
        };
    },

    buildTmProfileSummary(profile) {
        if (!profile) return null;

        return {
            tmUrl: profile.tmUrl || '',
            tmId: profile.tmId || '',
            marketValueText: profile.marketValueText || '',
            marketValueEur: profile.marketValueEur ?? null,
            lastKnownMarketValueText: profile.lastKnownMarketValueText || '',
            lastKnownMarketValueEur: profile.lastKnownMarketValueEur ?? null,
            highestMarketValueText: profile.highestMarketValueText || '',
            highestMarketValueEur: profile.highestMarketValueEur ?? null,
            valuePeakRatio: profile.valuePeakRatio ?? null,
            isRetired: !!profile.isRetired,
            isFreeAgent: !!profile.isFreeAgent,
            currentClub: profile.currentClub || '',
            playerAgent: profile.playerAgent || '',
            contractExpires: profile.contractExpires || '',
            age: profile.age ?? null,
            activity: profile.activity || null,
            rumorsCount: Array.isArray(profile.rumors) ? profile.rumors.length : 0,
            youthClubs: Array.isArray(profile.youthClubs) ? profile.youthClubs.slice(0, 12) : []
        };
    },

    async buildTransferHistoryEvent(row, enriched, slfAlter) {
        const eventKeySource = this.buildHistoryEventKeySource(row);
        const eventKey = await this.hashText(eventKeySource);
        const profile = enriched?.tmProfile || null;

        return {
            recordType: 'completed_transfer',
            eventType: 'completed_transfer',
            schemaVersion: 2,
            parserVersion: row.historyParserVersion || 'history_v2_cells',
            eventKey,
            eventKeySource,

            source: {
                page: 'transfers_history',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: SLF_VERSION_INFO.scriptVersion
            },

            transfer: {
                dateText: row.transferDateText || '',
                dateTs: row.transferDateTs || null,
                priceText: row.salePriceText || '',
                price: row.salePrice ?? null,
                typeText: row.transferTypeText || '',
                auxText: row.historyAuxText || ''
            },

            player: {
                playerId: row.playerId || '',
                name: row.name || '',
                positions: row.positions || [],
                primaryPosition: row.positions?.[0] || null,
                age: row.age ?? null,
                talent: row.talent ?? null,
                skill: slfAlter?.finalSkill ?? row.scoutSkill ?? null,
                currentSkill: slfAlter?.currentSkill ?? row.scoutSkill ?? null,
                finalSkill: slfAlter?.finalSkill ?? null,
                skillDelta: slfAlter?.skillDelta ?? null,
                playerUrl: row.playerUrl || ''
            },

            clubs: {
                fromName: row.fromClubText || '',
                toName: row.toClubText || ''
            },

            managers: {
                seller: row.sellerManagerText || '',
                buyer: row.buyerManagerText || ''
            },

            analysis: this.buildHistoryAnalysisPayload(row, enriched, slfAlter),

            enrichment: {
                tmUrl: enriched?.tmUrl || profile?.tmUrl || '',
                tmProfileSummary: this.buildTmProfileSummary(profile),
                slfAlterSummary: this.buildSlfAlterSummary(slfAlter)
            },

            raw: {
                cells: row.rawCells || [],
                rowText: row.rawText || ''
            }
        };
    },

    markHistoryEventsSubmitted(events) {
        const synced = this.loadHistorySyncedKeys();

        (events || []).forEach(event => {
            if (!event?.eventKey) return;

            synced[event.eventKey] = {
                eventKey: event.eventKey,
                playerId: event.player?.playerId || '',
                dateText: event.transfer?.dateText || '',
                price: event.transfer?.price ?? null,
                submittedAt: Date.now()
            };
        });

        this.saveHistorySyncedKeys(synced);
    },

    sendTransferHistoryEvents(events) {
        if (!Array.isArray(events) || !events.length) return Promise.resolve(null);

        return Api.post(
            CONFIG.COLLECTIONS.TRANSFER_HISTORY + '?mode=append',
            events,
            'transfer history events'
        ).then(result => {
            this.markHistoryEventsSubmitted(events);
            return result;
        });
    },

    async analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();

        if (!rows.length) {
            this.setStatus('История трансферов: строки не найдены.');
            return;
        }

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const eventsToSend = [];
        let skipped = 0;
        let failed = 0;

        this.setStatus(`История: найдено строк ${rows.length}. Синхронизация completed_transfer...`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);

            if (alreadySubmitted[eventKey]) {
                skipped++;
                this.renderHistoryVpsBadge(row, { confidence: 'local', key: eventKey, record: {} });
                this.setStatus(`История ${i + 1}/${rows.length}: уже синхронизировано ${row.name || row.playerId}`);
                continue;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`История ${i + 1}/${rows.length}: ${fromCache ? 'cache' : 'анализ'} ${row.name || row.playerId}`);

            this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                const event = await this.buildTransferHistoryEvent(row, tmResult, slfAlter);
                eventsToSend.push(event);
                this.renderHistoryVpsBadge(row, { confidence: 'queued', key: event.eventKey, record: event });
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                this.renderHistorySyncStatus(row, 'ERR', 'error');

                try {
                    const fallbackEvent = await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null);
                    fallbackEvent.analysisFailed = true;
                    fallbackEvent.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallbackEvent);
                    this.renderHistoryVpsBadge(row, { confidence: 'fallback', key: fallbackEvent.eventKey, record: fallbackEvent });
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            try {
                await this.sendTransferHistoryEvents(eventsToSend);
            } catch (error) {
                this.setStatus(
                    `История: ошибка отправки ${eventsToSend.length} записей (${error?.kind || 'unknown'}).`
                );
                return;
            }
        }

        this.setStatus(
            `История готова: отправлено ${eventsToSend.length}, пропущено дублей ${skipped}, ошибок ${failed}.`
        );
    },

    getOrCreateBadgeCell(row) {
        const tr = row.rowEl;

        if (!tr) return null;

        let box = tr.querySelector('.slf-transfer-analysis-badge');

        if (!box) {
            box = document.createElement('td');
            box.className = 'slf-transfer-analysis-badge';
            box.style.cssText = this.isHistoryPage()
                ? `
                    box-sizing:border-box;
                    min-width:80px;
                    max-width:96px;
                    width:86px;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:middle;
                    white-space:nowrap;
                    position:relative;
                    overflow:visible;
                    text-align:center;
                `
                : `
                    box-sizing:border-box;
                    min-width:0;
                    max-width:none;
                    width:auto;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:top;
                    white-space:normal;
                    position:relative;
                    overflow:visible;
                    display:flex;
                    flex-wrap:wrap;
                    align-items:flex-start;
                    gap:3px 4px;
                `;

            tr.appendChild(box);
        }

        return box;
    },

    renderLoadingBadge(row) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `<span style="color:#aaa;">TM/SLF анализ...</span>`;
    },

    renderErrorBadge(row, error) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `
            <span style="color:#ff9f9f;">Ошибка анализа</span>
            <span style="color:#777;margin-left:4px;">${this.escapeHtml(String(error?.message || error || 'unknown'))}</span>
        `;
    },

    isUsefulTmText(value) {
        const text = this.normalizeText(value);

        if (!text) return false;

        const lower = text.toLowerCase();

        return ![
            '-',
            '—',
            'n/a',
            'na',
            'unknown',
            'none',
            'null'
        ].includes(lower);
    },

    includesAny(text, terms) {
        const lower = this.normalizeLower(text);

        return (terms || []).some(term => lower.includes(String(term).toLowerCase()));
    },

    isRetired(profile) {
        const terms = this.getCfg().currentClub?.retiredTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isFreeAgent(profile) {
        const terms = this.getCfg().currentClub?.freeAgentTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isNoAgent(profile) {
        const terms = this.getCfg().agent?.noAgentTerms || [];
        return this.includesAny(profile?.playerAgent || '', terms);
    },

    getUsefulRumors(rumors) {
        const list = Array.isArray(rumors) ? rumors : [];

        return list.filter(r => {
            const text = this.normalizeText(r.text || r.rawText || '');
            const lower = text.toLowerCase();

            if (!text) return false;

            if (
                lower.includes('interested club') &&
                (
                    lower.includes('most recent source') ||
                    lower.includes('last reply') ||
                    lower.includes('user assessment') ||
                    lower.includes('verein_id')
                )
            ) {
                return false;
            }

            return !!(r.club || r.dateText || text.length >= 4);
        });
    },

    formatRumorLine(rumor) {
        const club = this.normalizeText(rumor.club || '');
        const date = this.normalizeText(rumor.dateText || '');

        if (club && date) return `${club} · ${date}`;
        if (club) return club;
        if (date) return date;

        return this.normalizeText(rumor.text || rumor.rawText || '')
            .replace(/\s*\|\s*/g, ' · ')
            .slice(0, 160);
    },

    buildTmDetailsHtml(profile) {
        const lines = [];

        if (this.isUsefulTmText(profile.currentClub)) {
            lines.push(`<div><b>Current club:</b> ${this.escapeHtml(profile.currentClub)}</div>`);
        }

        if (this.isUsefulTmText(profile.playerAgent)) {
            lines.push(`<div><b>Agent:</b> ${this.escapeHtml(profile.playerAgent)}</div>`);
        }

        if (this.isUsefulTmText(profile.contractExpires)) {
            lines.push(`<div><b>Контракт:</b> ${this.escapeHtml(profile.contractExpires)}</div>`);
        }

        if (this.isUsefulTmText(profile.joined)) {
            lines.push(`<div><b>Joined:</b> ${this.escapeHtml(profile.joined)}</div>`);
        }

        if (this.isUsefulTmText(profile.lastContractExtension)) {
            lines.push(`<div><b>Extension:</b> ${this.escapeHtml(profile.lastContractExtension)}</div>`);
        }

        if (this.isUsefulTmText(profile.marketValueText)) {
            lines.push(`<div><b>TM value:</b> ${this.escapeHtml(profile.marketValueText)}</div>`);
        }

        if (profile.marketValueIsHistorical && (profile.lastKnownMarketValueEur || profile.lastKnownMarketValueText)) {
            lines.push(`<div><b>Old TM value:</b> ${this.escapeHtml(profile.lastKnownMarketValueText || TMEnrichmentLayer.formatMoney(profile.lastKnownMarketValueEur))} ${this.escapeHtml(profile.lastKnownMarketValueDate || '')} — retired, not current market value</div>`);
        }

        if (this.isUsefulTmText(profile.highestMarketValueText)) {
            lines.push(`<div><b>Highest TM:</b> ${this.escapeHtml(profile.highestMarketValueText)} ${this.escapeHtml(profile.highestMarketValueDate || '')}</div>`);
        }

        if (profile.activity) {
            const a = profile.activity;
            const activityParts = [];

            if (a.startingElevenPct != null) activityParts.push(`XI ${a.startingElevenPct}%`);
            if (a.minutesPct != null) activityParts.push(`Min ${a.minutesPct}%`);
            if (a.goalParticipationPct != null) activityParts.push(`GP ${a.goalParticipationPct}%`);

            if (activityParts.length) {
                lines.push(`<div><b>Activity:</b> ${this.escapeHtml(activityParts.join(' · '))}</div>`);
            }
        }

        const youthClubs = Array.isArray(profile.youthClubs) ? profile.youthClubs : [];

        if (youthClubs.length) {
            lines.push(`<div><b>Youth Clubs:</b> ${this.escapeHtml(youthClubs.join(', '))}</div>`);
        }

        const history = Array.isArray(profile.transferHistory)
            ? profile.transferHistory
            : [];

        if (history.length) {
            const historyPreview = history
                .slice(0, 5)
                .map(h => this.escapeHtml(this.normalizeText(h.text || '').slice(0, 220)))
                .filter(Boolean)
                .map(x => `<li>${x}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#8cf;font-weight:bold;">Transfer history: ${history.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${historyPreview}
                </ul>
            `);
        }

        const rumors = this.getUsefulRumors(profile.rumors);

        if (rumors.length) {
            const rumorsHtml = rumors
                .slice(0, 6)
                .map(r => this.formatRumorLine(r))
                .filter(Boolean)
                .map(x => `<li>${this.escapeHtml(x)}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#ffd76a;font-weight:bold;">Rumors: ${rumors.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${rumorsHtml}
                </ul>
            `);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#aaa;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #444;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">подробнее</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:580px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },

    buildSlfDetailsHtml(alter) {
        if (!alter) return '';

        const lines = [];

        if (alter.currentSkill != null || alter.finalSkill != null) {
            lines.push(`<div><b>SLF skill:</b> ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.currentSkill))} → ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.finalSkill))} ${alter.skillDelta != null ? '(' + this.escapeHtml(SLFAlterLayer.formatDelta(alter.skillDelta)) + ')' : ''}</div>`);
        }

        if (alter.currentRow) {
            const row = alter.currentRow;
            lines.push(`<div><b>Current season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% / ${this.escapeHtml(row.minutes || 0)} min · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.gamesPlayed)}/${this.escapeHtml(row.gamesPossible)} games · starts ${this.escapeHtml(row.starts ?? '')}</div>`);
        } else if (alter.staleActivity) {
            lines.push(`<div><b>Current season:</b> no current league row. Last season: ${this.escapeHtml(alter.lastSeasonYear || '?')}</div>`);
        }

        if (alter.talentUpgradeRow) {
            const row = alter.talentUpgradeRow;
            lines.push(`<div><b>Talent-up signal:</b> T${this.escapeHtml(alter.talent)} → L${this.escapeHtml(row.leagueLevel)} · ${this.escapeHtml(row.minutesPct)}% · ${this.escapeHtml(row.season)}</div>`);
        }

        if (alter.bestEligibleRow) {
            const row = alter.bestEligibleRow;
            lines.push(`<div><b>Best 40%+ season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.teamText || '')}</div>`);
        }

        if (alter.seasonSkills?.length) {
            lines.push(`<div><b>Season skills:</b> ${this.escapeHtml(alter.seasonSkills.map(x => `${x.season}: ${x.skill}`).join(' · '))}</div>`);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#9fd3ff;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #446;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">SLF</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:620px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },


    buildScoreBreakdown(markers) {
        const sum = cats => (markers || [])
            .filter(marker => cats.includes(this.markerCategory(marker)))
            .reduce((total, marker) => total + Number(marker.score || 0), 0);
        const value = sum(['market', 'slf', 'tm']);
        const readiness = sum(['activity', 'league']);
        const growth = sum(['talent', 'age', 'trend']);
        const risk = (markers || [])
            .filter(marker => marker.redFlag || marker.hardStop || Number(marker.score || 0) < 0)
            .reduce((total, marker) => total + Math.min(0, Number(marker.score || 0)), 0);
        return `value ${value >= 0 ? '+' : ''}${value} · readiness ${readiness >= 0 ? '+' : ''}${readiness} · growth ${growth >= 0 ? '+' : ''}${growth} · risk ${risk}`;
    },

    buildDecisionDetailsHtml(row, profile, slfAlter, markers, verdict) {
        const marketMarker = (markers || []).find(m => this.markerCategory(m) === 'market') || null;
        const market = marketMarker?.marketDetails || {};
        const baseline = market?.baseline || null;
        const nominalRatio = Number(row?.nominalRatio || market?.nominal?.ratio || 0);
        const baseNominal = Number(row?.nominalBase || market?.nominal?.baseNominal || 0);
        const currentPrice = Number(row?.slfPrice || market?.currentInfo?.value || 0);
        const p75 = Number(baseline?.p75 || 0);
        const comparison = currentPrice && p75
            ? `текущая цена ${currentPrice > p75 ? 'выше' : 'ниже'} p75 примерно в ${(currentPrice / p75).toFixed(2)}x`
            : '';
        const riskMarkers = (markers || [])
            .filter(m => m && (m.redFlag || m.hardStop || ['risk', 'skip'].includes(String(m.level || ''))))
            .map(m => m.label || m.text || '')
            .filter(Boolean)
            .slice(0, 5);

        const rowHtml = (label, value) => {
            const clean = value == null || value === '' ? '—' : String(value);
            return `
                <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;">
                    <span style="color:#aaa;">${this.escapeHtml(label)}</span>
                    <span style="color:#ddd;">${this.escapeHtml(clean)}</span>
                </div>
            `;
        };

        const section = (title, rows) => {
            const body = (rows || []).filter(Boolean).join('');
            if (!body) return '';
            return `
                <div style="margin:0 0 8px 0;padding:7px 9px;background:#151515;border:1px solid #333;border-radius:5px;">
                    <div style="font-weight:bold;color:#ffd76a;margin-bottom:5px;">${this.escapeHtml(title)}</div>
                    ${body}
                </div>
            `;
        };

        const position = Array.isArray(row?.positions) && row.positions.length ? row.positions.join('/') : '';
        const tmValue = profile?.marketValueText || (profile?.marketValueEur ? TMEnrichmentLayer.formatMoney(profile.marketValueEur) : '');
        const slfSkill = slfAlter && (slfAlter.currentSkill != null || slfAlter.finalSkill != null)
            ? `${SLFAlterLayer.formatSkill(slfAlter.currentSkill)} → ${SLFAlterLayer.formatSkill(slfAlter.finalSkill)}${slfAlter.skillDelta != null ? ' (' + SLFAlterLayer.formatDelta(slfAlter.skillDelta) + ')' : ''}`
            : (row?.scoutSkill ? String(row.scoutSkill) : '');
        const minutes = slfAlter?.currentRow?.minutesPct != null
            ? `${slfAlter.currentRow.minutesPct}% · ${slfAlter.currentRow.minutes || 0} min`
            : (slfAlter?.staleActivity ? 'нет текущего сезона' : '');

        const plusMarkers = (markers || []).filter(m => Number(m.score || 0) > 0).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const minusMarkers = (markers || []).filter(m => Number(m.score || 0) < 0 || m.redFlag || m.hardStop).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const scoreBreakdown = this.buildScoreBreakdown(markers || []);
        const whyReasons = this.buildWhyRankReasons(markers || [], verdict).join(' · ');

        const html = [
            section('Почему такой ранг', [
                rowHtml('Итог', `${this.getShortVerdictLabel(verdict)}${verdict?.rank ? ' #' + verdict.rank : ''}`),
                rowHtml('Score', Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '')),
                rowHtml('why', whyReasons),
                rowHtml('Плюсы', plusMarkers.join(' · ')),
                rowHtml('Минусы', minusMarkers.join(' · ')),
                rowHtml('Score breakdown', scoreBreakdown)
            ]),
            section('Игрок', [
                rowHtml('Позиция', position),
                rowHtml('Возраст / талант', [row?.age ? `${row.age} лет` : '', row?.talent ? `T${row.talent}` : ''].filter(Boolean).join(' · ')),
                rowHtml('Скилл / потенциал', [slfSkill, row?.potentialText || ''].filter(Boolean).join(' · ')),
                rowHtml('Минуты текущего сезона', minutes)
            ]),
            section('Рынок SLF', [
                rowHtml('Цена сейчас', this.formatSlfMoneyShort(currentPrice)),
                rowHtml('База скилла MKT', market?.skillBasis?.label || ''),
                rowHtml('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(p75) : 'нет выборки'),
                baseline && currentPrice ? rowHtml('Отношение к p75', `${(currentPrice / p75).toFixed(2)}x`) : '',
                baseline ? rowHtml('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                baseline ? rowHtml('Выборка / доверие', `${baseline.count || 0} продаж / ${baseline.confidence || ''}`) : '',
                rowHtml('Номинал', nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : ''),
                rowHtml('Базовый номинал', this.formatSlfMoneyShort(baseNominal)),
                rowHtml('Сравнение', comparison),
                rowHtml('Интерпретация', market?.conclusion || '')
            ]),
            section('TM / статус', [
                rowHtml('TM value / signal', tmValue),
                rowHtml('Клуб', profile?.currentClub || ''),
                rowHtml('Агент', profile?.playerAgent || ''),
                rowHtml('Контракт', profile?.contractExpires || '')
            ]),
            section('Риски / решение', [
                rowHtml('Verdict', verdict?.label || ''),
                rowHtml('Причина', verdict?.reason || ''),
                rowHtml('Риск-флаги', riskMarkers.join(' · ')),
                rowHtml('Короткий вывод', this.buildTransferShortDecision(verdict, market))
            ])
        ].filter(Boolean).join('');

        if (!html) return '';

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-decision-details-trigger" tabindex="0" style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                max-width:max-content;
                white-space:nowrap;
                cursor:pointer;
                color:#ddd;
                border:1px solid #555;
                border-radius:4px;
                padding:1px 5px;
                background:#202020;
                line-height:16px;
                min-height:17px;
                font-size:10px;
                box-sizing:border-box;
                vertical-align:middle;
            ">
                подробнее
                <span class="slf-transfer-html-tooltip" style="display:none;">${html}</span>
            </span>
        `;
    },

    buildTransferShortDecision(verdict, market) {
        const level = String(verdict?.level || '');
        const ratio = Number(market?.ratio || 0);
        if (level === 'skip' || level === 'risk' || ratio > 1.5) return 'skip / только при исключительных подтверждениях';
        if (level === 'watch' || ratio > 1.05) return 'watch / дорого, нужна дополнительная проверка';
        if (level === 'good' || level === 'hot' || (ratio && ratio <= 0.85)) return 'buy candidate / проверить финально вручную';
        return 'watch / нейтральная зона';
    },

    renderRowBadge(row, enriched, slfAlter) {
        if (this.isHistoryPage()) {
            this.renderHistoryVpsBadge(row, null);
            return;
        }

        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        const profile = enriched?.tmProfile || null;
        const safeEnriched = enriched || {
            playerId: row.playerId,
            slfUrl: row.playerUrl,
            tmUrl: '',
            tmProfile: null,
            error: 'empty_enrichment'
        };

        const fallbackProfile = {
            marketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const markers = this.buildMarkers(row, profile || fallbackProfile, slfAlter);

        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, показаны только SLF-сигналы из cache/alter.php.'
            };

        this.writeRowSortMetrics(row, markers, verdict, slfAlter, profile);
        verdict.rank = this.computeVisibleScoreRank(row, verdict.score);

        const detailsHtml = this.buildDecisionDetailsHtml(row, profile || fallbackProfile, slfAlter, markers, verdict);
        const linksHtml = profile?.tmUrl
            ? `
                <span style="
                    display:inline-flex;
                    gap:4px;
                    align-items:center;
                    white-space:nowrap;
                    font-size:11px;
                    line-height:16px;
                    margin-left:2px;
                ">
                    <a href="${this.escapeHtml(profile.tmUrl)}" target="_blank" style="color:#8cf;">TM</a>
                </span>
            `
            : '';

        box.innerHTML = `
            <div class="slf-transfer-analysis-compact ta-cell" style="
                display:inline-flex;
                flex-direction:column;
                align-items:flex-start;
                gap:3px;
                width:max-content;
                max-width:100%;
                box-sizing:border-box;
                overflow:visible;
                white-space:normal;
            ">
                ${this.renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict)}
            </div>
        `;

        this.bindDetailsAutoClose();
        this.bindHtmlTooltipPortal(box);
        this.cleanupStandaloneMarketNominalControls(box);
        this.refreshVisibleRankBadges();
    },

    writeRowSortMetrics(row, markers, verdict, slfAlter, profile) {
        const tr = row?.rowEl;

        if (!tr) return;

        const talentMarker = markers.find(m => this.markerCategory(m) === 'talent');
        const marketMarker = markers.find(m => this.markerCategory(m) === 'market');
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const marketCurrent = Number(marketMarker?.marketDetails?.currentInfo?.value || 0);
        const marketP75 = Number(marketMarker?.marketDetails?.baseline?.p75 || 0);
        const marketHasData = marketRatio > 0 && marketCurrent > 0 && marketP75 > 0;

        tr.dataset.slfAnalyzerScore = String(Number(verdict?.score || 0));
        tr.dataset.slfSkillDelta = String(slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : -9999);
        tr.dataset.slfMinutesPct = String(slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : -1);
        tr.dataset.slfTalentUp = String(talentMarker ? Number(talentMarker.score || 0) * 100 + Number(slfAlter?.talentUpgradeRow?.minutesPct || 0) : 0);
        tr.dataset.slfTmValue = String(Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0));
        tr.dataset.slfMktBargain = String(marketHasData ? Number((marketP75 / marketCurrent).toFixed(4)) : -1);
        tr.dataset.slfMktOverpriced = String(marketHasData ? Number(marketRatio.toFixed(4)) : -1);
    },

    markerCategory(marker) {
        if (marker?.category) return marker.category;

        const label = String(marker?.label || '').toLowerCase();

        if (label.includes('retired') || label.includes('no club') || label.includes('без клуба') || label.includes('club')) return 'club';
        if (label.includes('agent')) return 'agent';
        if (label.startsWith('slf') || label.startsWith('→')) return 'slf';
        if (label.includes('min') || label.startsWith('m-') || label.startsWith('m?')) return 'activity';
        if (label.includes('t') && label.includes('<l')) return 'talent';
        if (label.includes('>') && /\d/.test(label)) return 'league';
        if (label.includes('age') || label.includes('growth') || label.includes('grow') || label.includes('late') || label.includes('prime') || label.includes('veteran') || label.includes('vet') || label.includes('short')) return 'age';
        if (label.startsWith('mkt')) return 'market';
        if (label.startsWith('n ') || label.startsWith('n?')) return 'nominal';
        if (label.includes('tm ') || label.startsWith('tm') || label.startsWith('old €') || label.startsWith('old')) return 'tm';
        if (label.includes('peak') || label.includes('trend') || label.includes('collapsed') || label.includes('fallen') || label.includes('fall')) return 'trend';
        if (label.includes('contract') || label.includes('ctr') || label.includes('exp ')) return 'contract';
        if (label.includes('rumor') || /^r\d/.test(label)) return 'rumors';
        if (label.includes('academy') || label.includes('acad') || label.includes('youth') || label.includes('elite') || label.includes('strong')) return 'academy';

        return 'other';
    },

    getMarkerSlotDefs() {
        return [
            { key: 'slf', placeholder: 'SLF?' },
            { key: 'activity', placeholder: 'MIN?' },
            { key: 'talent', placeholder: 'T-' },
            { key: 'league', placeholder: 'L-' },
            { key: 'tm', placeholder: 'TM?' },
            { key: 'market', placeholder: 'MKT?' },
            { key: 'trend', placeholder: 'tr?' },

            { key: 'club', placeholder: 'club?' },
            { key: 'agent', placeholder: 'agent?' },
            { key: 'age', placeholder: 'age?' },
            { key: 'contract', placeholder: 'ctr?' },
            { key: 'rumors', placeholder: 'rum0' },
            { key: 'academy', placeholder: 'acad-' }
        ];
    },

    markerScoreRank(level) {
        return ({
            skip: 100,
            risk: 90,
            hot: 80,
            good: 70,
            watch: 60,
            normal: 50,
            neutral: 40,
            unknown: 30,
            low: 20,
            old: 15,
            empty: 10
        }[level] || 0);
    },

    sortMarkersByImportance(markers) {
        return [...(markers || [])].sort((a, b) => {
            return this.markerScoreRank(b.level) - this.markerScoreRank(a.level) ||
                Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0));
        });
    },

    isRealAnalysisMarker(marker) {
        if (!marker) return false;

        const level = String(marker.level || '');
        const label = this.normalizeText(marker.label || '');

        if (!label || level === 'empty') return false;
        if (/^(SLF\?|MIN\?|TM\?|MKT\?|T-|L-|tr\?|club\?|agent\?|age\?|ctr\?|rum0|acad-)$/i.test(label)) return false;
        if (/^N\s+/i.test(label)) return false;
        if (/^N\?/i.test(label)) return false;

        return true;
    },

    firstMarkerByCategory(markers, category) {
        return this.sortMarkersByImportance(markers)
            .find(marker => this.markerCategory(marker) === category && this.isRealAnalysisMarker(marker)) || null;
    },

    allMarkersByCategories(markers, categories) {
        const allowed = new Set(categories || []);
        return this.sortMarkersByImportance(markers)
            .filter(marker => allowed.has(this.markerCategory(marker)) && this.isRealAnalysisMarker(marker));
    },

    withVisualPriority(marker, priority) {
        return marker ? Object.assign({}, marker, { visualPriority: priority }) : null;
    },

    renderAnalysisGroup(className, title, markers, priority = 'medium') {
        const realMarkers = (markers || [])
            .filter(Boolean)
            .filter(marker => this.isRealAnalysisMarker(marker));

        if (!realMarkers.length) return '';

        return `
            <div class="ta-group ${className}" data-ta-group="${this.escapeHtml(className)}" aria-label="${this.escapeHtml(title)}">
                ${realMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, priority))).join('')}
            </div>
        `;
    },

    makeCombinedContextMarker(markers, labelFallback = '') {
        const realMarkers = (markers || []).filter(Boolean).filter(marker => this.isRealAnalysisMarker(marker));
        if (!realMarkers.length) return null;

        const labels = realMarkers
            .map(marker => String(marker.label || '').trim())
            .filter(Boolean);
        if (!labels.length) return null;

        const texts = realMarkers
            .map(marker => String(marker.text || marker.label || '').trim())
            .filter(Boolean);

        return {
            label: labels.join(' · ') || labelFallback,
            level: 'neutral',
            score: realMarkers.reduce((sum, marker) => sum + Number(marker.score || 0), 0),
            redFlag: realMarkers.some(marker => marker.redFlag),
            hardStop: realMarkers.some(marker => marker.hardStop),
            text: texts.join(' | '),
            category: 'combined'
        };
    },

    renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict) {
        const primaryMarkers = [
            this.firstMarkerByCategory(markers, 'slf'),
            this.firstMarkerByCategory(markers, 'market'),
            this.firstMarkerByCategory(markers, 'tm'),
            this.firstMarkerByCategory(markers, 'activity'),
            this.firstMarkerByCategory(markers, 'trend')
        ].filter(Boolean);

        const usedPrimary = new Set(primaryMarkers);
        const signalMarkers = this.allMarkersByCategories(markers, ['talent', 'league', 'trend'])
            .filter(marker => !usedPrimary.has(marker));
        const ageMarker = this.firstMarkerByCategory(markers, 'age');
        const clubAgent = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'club'),
            this.firstMarkerByCategory(markers, 'agent')
        ], 'club / agent');
        const contractService = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'contract'),
            this.firstMarkerByCategory(markers, 'rumors'),
            this.firstMarkerByCategory(markers, 'academy')
        ], 'contract / status');
        const otherMarkers = this.allMarkersByCategories(markers, ['other']);
        const whyMarker = this.buildWhyRankMarker(markers, verdict);

        const secondaryMarkers = [
            whyMarker,
            ...signalMarkers,
            ageMarker,
            clubAgent,
            contractService,
            ...otherMarkers
        ].filter(Boolean);

        const verdictHtml = verdict ? this.renderRankVerdictChip(verdict) : '';

        const primaryHtml = `
            <div class="ta-line ta-primary" data-ta-line="primary" aria-label="Итог и главные факторы">
                ${verdictHtml}
                ${primaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, 'high'))).join('')}
            </div>
        `;

        const secondaryHtml = `
            <div class="ta-line ta-secondary" data-ta-line="secondary" aria-label="Почему и контекст">
                ${secondaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, marker.category === 'why' ? 'medium' : 'low'))).join('')}
                ${linksHtml || ''}
                ${detailsHtml || ''}
            </div>
        `;

        return [primaryHtml, secondaryHtml].join('');
    },


    getShortVerdictLabel(verdict) {
        const raw = String(verdict?.label || '').toUpperCase();
        if (raw.includes('SKIP')) return 'SKIP';
        if (raw.includes('TRAP') || raw.includes('RISK')) return 'RISK';
        if (raw.includes('SPEC')) return 'SPEC';
        if (raw.includes('PRIORITY') || raw.includes('STRONG')) return 'TARGET';
        if (raw.includes('TARGET')) return 'TARGET';
        if (raw.includes('WATCH')) return 'WATCH';
        if (raw.includes('LOW DATA')) return 'WATCH';
        return 'WATCH';
    },

    buildVerdictTooltipHtml(verdict) {
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const label = this.getShortVerdictLabel(verdict);
        const score = Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '');
        const rank = verdict?.rank ? `#${verdict.rank}` : '#?';
        const reason = verdict?.reason || verdict?.label || '';
        const level = String(verdict?.level || 'neutral');
        const meaning = (() => {
            const raw = String(verdict?.label || '').toUpperCase();
            if (raw.includes('PRIORITY') || raw.includes('TARGET')) return 'кандидат выше среднего: проверять первым, но финально сверить цену, минуты и статус';
            if (raw.includes('WATCH') || raw.includes('SPEC')) return 'наблюдение/ручная проверка: есть плюс, но не хватает уверенности или есть риск';
            if (raw.includes('RISK') || raw.includes('TRAP')) return 'риск покупки: маркеры указывают на переплату, слабую готовность или статусный риск';
            if (raw.includes('SKIP')) return 'пропуск: есть hard-stop или слишком сильная комбинация рисков';
            return 'общий ранговый вывод анализатора';
        })();

        return `
            <div style="font-weight:bold;color:#ffd76a;margin-bottom:6px;">Вердикт и ранг</div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Итог</span><span>${esc(label)} ${esc(rank)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Score</span><span>${esc(score)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Уровень</span><span>${esc(level)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Почему</span><span>${esc(reason)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;"><span style="color:#aaa;">Как читать</span><span>${esc(meaning)}</span></div>
        `;
    },

    renderRankVerdictChip(verdict) {
        const label = this.getShortVerdictLabel(verdict);
        const rank = verdict?.rank ? ` #${verdict.rank}` : ' #?';
        const tooltip = this.buildVerdictTooltipHtml(verdict);
        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-verdict-chip" data-verdict-base="${this.escapeHtml(label)}" data-score="${this.escapeHtml(verdict?.score || 0)}" tabindex="0" style="
                flex:0 0 auto;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-height:18px;
                line-height:17px;
                padding:1px 6px;
                border-radius:6px;
                color:${this.colorByLevel(verdict.level)};
                background:${this.bgByLevel(verdict.level)};
                border:1px solid ${this.borderByLevel(verdict.level)};
                font-weight:800;
                white-space:nowrap;
                vertical-align:middle;
                cursor:help;
            ">
                <span class="slf-transfer-verdict-label">${this.escapeHtml(label + rank)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${tooltip}</span>
            </span>
        `;
    },

    computeVisibleScoreRank(row, score) {
        const tr = row?.rowEl;
        const table = this.findTransferTable();
        if (!tr || !table) return null;
        const rows = [...table.querySelectorAll('tr')]
            .filter(item => item.dataset && item.dataset.slfPlayerId && item.dataset.slfAnalyzerScore !== undefined)
            .map(item => ({ item, score: Number(item.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        const index = rows.findIndex(item => item.item === tr);
        if (index >= 0) return index + 1;
        const better = rows.filter(item => Number(item.score) > Number(score || 0)).length;
        return better + 1;
    },

    refreshVisibleRankBadges() {
        const table = this.findTransferTable();
        if (!table) return;
        const rows = [...table.querySelectorAll('tr')]
            .filter(tr => tr.dataset && tr.dataset.slfPlayerId && tr.dataset.slfAnalyzerScore !== undefined)
            .map(tr => ({ tr, score: Number(tr.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        rows.forEach((entry, index) => {
            const chip = entry.tr.querySelector('.slf-transfer-verdict-chip[data-verdict-base]');
            if (!chip) return;
            const base = chip.dataset.verdictBase || 'WATCH';
            const labelEl = chip.querySelector('.slf-transfer-verdict-label');
            if (labelEl) labelEl.textContent = `${base} #${index + 1}`;
            else chip.childNodes[0].textContent = `${base} #${index + 1}`;
        });
    },

    buildWhyRankReasons(markers, verdict) {
        const reasons = [];
        const market = (markers || []).find(m => this.markerCategory(m) === 'market');
        const activity = (markers || []).find(m => this.markerCategory(m) === 'activity');
        const trend = (markers || []).find(m => this.markerCategory(m) === 'trend');
        const age = (markers || []).find(m => this.markerCategory(m) === 'age');
        const agent = (markers || []).find(m => this.markerCategory(m) === 'agent');
        const club = (markers || []).find(m => this.markerCategory(m) === 'club');
        const ratio = Number(market?.marketDetails?.ratio || 0);
        const minPct = Number((String(activity?.label || '').match(/MIN\s+(\d+)/i) || [])[1] || 0);
        const peakPct = Number((String(trend?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const ageNum = Number((String(age?.label || '').match(/age\s+(\d+)/i) || [])[1] || 0);
        const verdictText = String(verdict?.label || '').toUpperCase();

        if (minPct >= 70) reasons.push('ready');
        if (ratio && ratio < 1) reasons.push('cheap');
        if (ratio && ratio > 1) reasons.push('overpay');
        if (minPct && minPct < 35) reasons.push('low-min');
        if (peakPct >= 90) reasons.push('peak');
        if (String(trend?.label || '').toLowerCase().includes('fall')) reasons.push('fall');
        if (verdictText.includes('SPEC') || (ageNum >= 22 && ageNum <= 24 && minPct > 0 && minPct < 70 && peakPct >= 90)) reasons.push('spec');
        if (ageNum >= 30) reasons.push('old');
        if (String(agent?.label || '').includes('✓')) reasons.push('agent');
        if (String(club?.label || '').includes('✓')) reasons.push('club');

        return [...new Set(reasons)].slice(0, 3);
    },

    buildWhyRankMarker(markers, verdict) {
        const reasons = this.buildWhyRankReasons(markers, verdict);
        if (!reasons.length) return null;
        return {
            label: `why: ${reasons.join(' · ')}`,
            level: 'neutral',
            score: 0,
            redFlag: false,
            hardStop: false,
            category: 'why',
            text: `Главные причины ранга: ${reasons.join(', ')}.`
        };
    },

    getMarkerSlots(markers) {
        const defs = this.getMarkerSlotDefs();

        return defs.map(def => {
            const marker = this.firstMarkerByCategory(markers, def.key);
            if (marker) return marker;

            return {
                label: def.placeholder,
                level: 'empty',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Нет данных/сигнала для слота ${def.key}.`
            };
        });
    },

    renderMarkerSlots(markers) {
        return this.renderSemanticAnalysisGroups(markers, '', '', null);
    },

    getVerdictIcon(verdict) {
        const label = String(verdict?.label || '');

        if (label.includes('SKIP')) return '⛔';
        if (label.includes('HIGH RISK') || label.includes('RISK') || label.includes('TRAP')) return '🔴';
        if (label.includes('SPEC')) return '◇';
        if (label.includes('MANUAL')) return '🟡';
        if (label.includes('PRIORITY')) return '🔥';
        if (label.includes('TARGET')) return '🟢';
        if (label.includes('WATCHLIST')) return '👀';

        return '⚪';
    },

    ensureHtmlTooltipStyles() {
        if (document.getElementById('slf-transfer-html-tooltip-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-transfer-html-tooltip-style';
        style.textContent = `
            .slf-transfer-chip-tooltip-host { overflow:visible !important; position:relative; outline:none; cursor:help; }
            .slf-transfer-decision-details-trigger { cursor:pointer !important; }
            .slf-transfer-mkt-leaf-badge { min-width:max-content !important; max-width:none !important; width:auto !important; white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; }
            .slf-transfer-analysis-badge, .slf-transfer-analysis-compact, .slf-transfer-marker-wrap, .ta-cell, .ta-line { overflow:visible !important; white-space:normal !important; }
            .slf-transfer-analysis-badge { min-width:0 !important; width:auto !important; max-width:none !important; }
            .ta-cell { display:inline-flex !important; flex-direction:column !important; align-items:flex-start !important; gap:3px !important; box-sizing:border-box !important; min-width:0 !important; width:max-content !important; max-width:100% !important; }
            .ta-line { display:flex !important; flex-wrap:wrap !important; align-items:center !important; justify-content:flex-start !important; gap:3px 4px !important; min-width:0 !important; box-sizing:border-box !important; width:max-content !important; max-width:100% !important; }
            .ta-primary { order:1; }
            .ta-secondary { order:2; opacity:.9; }
            .ta-secondary .slf-transfer-decision-details-trigger { display:inline-flex !important; width:max-content !important; max-width:max-content !important; white-space:nowrap !important; align-self:center !important; }
            .ta-secondary a { white-space:nowrap !important; }
            .slf-transfer-chip-tooltip-host .slf-transfer-html-tooltip { display:none !important; }
            .slf-transfer-html-tooltip-portal {
                position:fixed;
                z-index:2147483647;
                max-width:min(780px, calc(100vw - 24px));
                min-width:260px;
                width:auto;
                max-height:min(560px, calc(100vh - 24px));
                overflow:auto;
                padding:8px 10px;
                background:#181818;
                color:#ddd;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,0.75);
                white-space:normal;
                line-height:1.35;
                text-align:left;
                font-size:11px;
            }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-hover { pointer-events:none; }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-click { pointer-events:auto; }
        `;
        document.head.appendChild(style);
    },

    bindHtmlTooltipPortal(root = document) {
        if (window.__slf_transfer_html_tooltip_portal_bound) return;
        window.__slf_transfer_html_tooltip_portal_bound = true;

        let portal = null;
        let activeHost = null;
        let activeMode = '';

        const escape = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const isDetailsHost = host => !!host && (
            host.classList?.contains('slf-transfer-decision-details-trigger') ||
            host.closest?.('.slf-transfer-details') ||
            String(host.textContent || '').trim().toLowerCase() === 'подробнее'
        );

        const normalizeHostTitle = host => {
            if (!host) return;
            const title = host.getAttribute('title');
            if (title && !host.dataset.slfTip) host.dataset.slfTip = title;
            if (title) host.removeAttribute('title');
        };

        const getTooltipHtml = host => {
            if (!host) return '';
            normalizeHostTitle(host);
            const source = host.querySelector?.('.slf-transfer-html-tooltip');
            if (source) return source.innerHTML || '';
            const tip = host.dataset?.slfTip || host.getAttribute?.('data-tooltip') || host.getAttribute?.('aria-label') || '';
            return tip ? `<div>${escape(tip)}</div>` : '';
        };

        const close = () => {
            if (portal) {
                portal.remove();
                portal = null;
            }
            activeHost = null;
            activeMode = '';
        };

        const place = host => {
            if (!portal || !host) return;
            const rect = host.getBoundingClientRect();
            const margin = 8;
            const details = isDetailsHost(host);
            const preferredWidth = details ? 540 : 780;
            const minWidth = details ? 300 : 260;
            const width = Math.max(Math.min(preferredWidth, window.innerWidth - margin * 2), Math.min(minWidth, window.innerWidth - margin * 2));
            portal.style.width = width + 'px';
            portal.style.minWidth = Math.min(minWidth, width) + 'px';

            let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
            let top = rect.bottom + 6;
            portal.style.left = left + 'px';
            portal.style.top = top + 'px';

            let after = portal.getBoundingClientRect();
            if (after.right > window.innerWidth - margin) {
                left = Math.max(margin, window.innerWidth - after.width - margin);
                portal.style.left = left + 'px';
            }
            if (after.left < margin) {
                portal.style.left = margin + 'px';
            }
            after = portal.getBoundingClientRect();
            if (after.bottom > window.innerHeight - margin) {
                top = Math.max(margin, rect.top - after.height - 6);
                portal.style.top = top + 'px';
            }
        };

        const open = (host, mode) => {
            if (!host) return;
            const html = getTooltipHtml(host);
            if (!html) return;
            if (portal && activeHost === host && activeMode === mode) {
                place(host);
                return;
            }

            close();
            activeHost = host;
            activeMode = mode;
            portal = document.createElement('div');
            portal.className = 'slf-transfer-html-tooltip-portal ' + (mode === 'click' ? 'slf-transfer-tooltip-click' : 'slf-transfer-tooltip-hover');
            portal.innerHTML = html;
            document.body.appendChild(portal);
            place(host);
        };

        const getHoverHost = target => {
            const host = target?.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host || isDetailsHost(host)) return null;
            return host;
        };

        document.addEventListener('mouseover', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('mouseout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            const related = e.relatedTarget;
            if (related && host.contains(related)) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('focusin', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('focusout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('click', e => {
            const host = e.target.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host) {
                if (!e.target.closest?.('.slf-transfer-html-tooltip-portal')) close();
                return;
            }

            normalizeHostTitle(host);

            if (!isDetailsHost(host)) {
                return;
            }

            if (host === activeHost && portal && activeMode === 'click') close();
            else open(host, 'click');

            e.stopPropagation();
            e.preventDefault();
        }, true);

        window.addEventListener('scroll', () => activeHost ? place(activeHost) : null, true);
        window.addEventListener('resize', () => activeHost ? place(activeHost) : null);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        }, true);
    },

    buildStructuredMarkerTooltipHtml(marker) {
        if (!marker) return '';

        const category = this.markerCategory(marker);
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const row = (label, value) => `
            <div style="display:grid;grid-template-columns:145px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;text-align:left;">
                <span style="color:#aaa;">${esc(label)}</span>
                <span style="color:#ddd;">${esc(value)}</span>
            </div>
        `;
        const section = (title, rows) => `
            <div style="margin:0 0 8px 0;">
                <div style="font-weight:bold;color:#ffd76a;margin-bottom:4px;">${esc(title)}</div>
                ${(rows || []).filter(Boolean).join('')}
            </div>
        `;

        const label = marker.label || '';
        const score = Number(marker.score || 0);
        const baseRows = [
            row('Маркер', label),
            row('Тип', category || 'other'),
            row('Сила сигнала', `${score >= 0 ? '+' : ''}${score}`),
            marker.redFlag ? row('Риск', 'красный флаг') : '',
            marker.hardStop ? row('Стоп', 'hard-stop') : '',
            row('Смысл', marker.text || label)
        ];

        if (category === 'market') {
            const details = marker.marketDetails || {};
            const current = details.currentInfo || {};
            const baseline = details.baseline || null;
            const nominal = details.nominal || {};
            const comparison = baseline?.p75 && current?.value
                ? `текущая цена ${Number(current.value) > Number(baseline.p75) ? 'выше' : 'ниже'} p75 примерно в ${Number(current.value / baseline.p75).toFixed(2)}x`
                : 'нет достаточной базы для сравнения';

            return [
                section('Рынок SLF', [
                    row('Цена сейчас', this.formatSlfMoneyShort(current.value)),
                    row('База скилла MKT', details.skillBasis?.label || ''),
                    row('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(baseline.p75) : 'нет выборки'),
                    baseline && current?.value ? row('Отношение к p75', details.ratioText || `${Number(current.value / baseline.p75).toFixed(2)}x`) : '',
                    baseline ? row('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                    baseline ? row('Выборка', `${baseline.count || 0} продаж`) : '',
                    baseline ? row('Доверие', baseline.confidence || '') : ''
                ]),
                section('Номинал', [
                    row('Номинал', nominal.ratioText || ''),
                    row('Базовый номинал', this.formatSlfMoneyShort(nominal.baseNominal || 0))
                ]),
                section('Сравнение', [
                    row('К p75', comparison),
                    row('Вывод', details.conclusion || marker.text || '')
                ])
            ].join('');
        }

        if (category === 'slf') {
            return section('SLF alter.php', [
                row('SLF delta', label),
                row('Что значит', marker.text || 'сравнение current skill и ИТОГ'),
                row('Решение', score > 0 ? 'положительный внутренний сигнал' : score < 0 ? 'риск просадки относительно ИТОГ' : 'нейтрально')
            ]);
        }

        if (category === 'activity') {
            return section('Готовность / минуты', [
                row('MIN', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score >= 3 ? 'готовность подтверждена' : score < 0 ? 'риск отсутствия актуальной практики' : 'нужна ручная проверка')
            ]);
        }

        if (category === 'tm') {
            return section('Transfermarkt value', [
                row('TM €', label),
                row('Источник', 'Transfermarkt как внешний ориентир, не SLF-цена'),
                row('Что значит', marker.text || '')
            ]);
        }

        if (category === 'trend') {
            return section('Пик / динамика цены', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', String(label).toLowerCase().includes('fall') ? 'сильный риск падения/старого пика' : 'проверка актуальности относительно пика')
            ]);
        }

        if (category === 'age') {
            return section('Возраст / стадия', [
                row('Возрастной маркер', label),
                row('Стадия', marker.text || ''),
                row('Влияние', score >= 3 ? 'рост/перепродажа возможны' : score < 0 ? 'возрастной риск' : 'оценивать как текущую пользу')
            ]);
        }

        if (category === 'club' || category === 'agent') {
            return section(category === 'club' ? 'Клубный статус' : 'Агент', [
                row('Маркер', label),
                row('Что значит', marker.text || ''),
                row('Риск', marker.redFlag ? 'повышенный' : 'обычный / неизвестный')
            ]);
        }

        if (category === 'contract') {
            return section('Контракт', [
                row('Статус', label),
                row('Что значит', marker.text || ''),
                row('Влияние', marker.redFlag ? 'нужна ручная проверка срока/доступности' : 'положительный или нейтральный статус')
            ]);
        }

        if (category === 'why') {
            return section('Почему такой ранг', [
                row('why', label),
                row('Главные причины', marker.text || ''),
                row('Как использовать', 'быстрый сжатый вывод; подробная расшифровка остаётся в «подробнее»')
            ]);
        }

        if (category === 'talent' || category === 'league') {
            return section('Рост / уровень лиги', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'потенциальный плюс к развитию/таланту' : 'слабый или рискованный сигнал')
            ]);
        }

        if (category === 'academy') {
            return section('Академия / клубный след', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'добавляет доверия к профилю' : 'нейтральный или неизвестный след')
            ]);
        }

        if (category === 'rumor') {
            return section('Интерес / слухи', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'внешний спрос поддерживает актуальность' : 'слабый или отсутствующий сигнал')
            ]);
        }

        return section('Маркер анализа', baseRows);
    },

    renderCompactChip(marker) {
        const label = String(marker?.label || '');
        const structuredTooltip = this.buildStructuredMarkerTooltipHtml(marker);
        const category = this.markerCategory(marker);
        const isMarket = category === 'market';
        const priority = String(marker?.visualPriority || (['slf', 'market', 'tm', 'activity'].includes(category) ? 'high' : ['talent', 'league', 'trend'].includes(category) ? 'medium' : 'low'));
        const priorityCss = priority === 'high'
            ? 'font-weight:700;padding:1px 5px;min-height:18px;line-height:17px;'
            : priority === 'low'
                ? 'font-weight:400;opacity:.78;filter:saturate(.75);'
                : 'font-weight:500;';
        const chipBase = `
            box-sizing:border-box;
            margin:0;
            padding:0 4px;
            border:1px solid ${this.borderByLevel(marker.level)};
            border-radius:4px;
            color:${this.colorByLevel(marker.level)};
            background:${this.bgByLevel(marker.level)};
            vertical-align:middle;
            line-height:16px;
            min-height:17px;
            font-size:10px;
            ${priorityCss}
            text-align:center;
        `;
        const marketCss = `
            display:inline-flex;
            flex:0 0 auto;
            width:auto;
            min-width:max-content;
            max-width:none;
            white-space:nowrap;
            overflow:visible;
            text-overflow:clip;
            cursor:help;
        `;
        const normalCss = `
            display:inline-flex;
            flex:0 1 auto;
            min-width:38px;
            max-width:110px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            cursor:help;
        `;

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip ${isMarket ? 'slf-transfer-mkt-leaf-badge' : ''}" data-slf-tip-category="${this.escapeHtml(category || 'other')}" tabindex="0" style="
                ${chipBase}
                ${isMarket ? marketCss : normalCss}
            ">
                <span style="display:inline-block;min-width:${isMarket ? 'max-content' : '0'};max-width:${isMarket ? 'none' : '100%'};white-space:nowrap;overflow:${isMarket ? 'visible' : 'hidden'};text-overflow:${isMarket ? 'clip' : 'ellipsis'};">${this.escapeHtml(label)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
            </span>
        `;
    },

    shouldShowCompactMarker(marker) {
        if (!marker) return false;

        const label = String(marker.label || '');
        const level = String(marker.level || '');

        if (marker.hardStop || marker.redFlag) return true;
        if (['skip', 'risk', 'hot', 'good', 'watch'].includes(level)) return true;

        if (label.startsWith('SLF ')) return true;
        if (label.includes('now ')) return true;
        if (label.includes('no current')) return true;
        if (label.includes('T') && label.includes('<L')) return true;
        if (label.includes('>') && /\d/.test(label)) return true;

        if (label.includes('TM €')) return true;
        if (label.includes('peak')) return true;
        if (label.includes('collapsed')) return true;
        if (label.includes('contract')) return true;
        if (label.includes('exp ')) return true;
        if (label.includes('rumors') && !label.includes('RUMORS 0')) return true;

        if (label.includes('elite')) return true;
        if (label.includes('strong')) return true;

        return false;
    },

    cleanupStandaloneMarketNominalControls(root = document) {
        const scope = root || document;
        const duplicateDetails = [...scope.querySelectorAll('.slf-transfer-details > summary')]
            .filter(summary => /^(MKT|N)$/i.test((summary.textContent || '').trim()))
            .map(summary => summary.closest('.slf-transfer-details'))
            .filter(Boolean);

        if (duplicateDetails.length) {
            console.warn('[SLF Transfer Analyzer] removed standalone MKT/N controls', duplicateDetails.length);
            duplicateDetails.forEach(el => el.remove());
        }
    },

    bindDetailsAutoClose() {
        if (window.__slf_transfer_details_autoclose) return;
        window.__slf_transfer_details_autoclose = true;

        const positionOpenDetails = details => {
            if (!details || !details.open) return;
            const summary = details.querySelector('summary');
            const popup = details.querySelector(':scope > div');
            if (!summary || !popup) return;

            const rect = summary.getBoundingClientRect();
            popup.style.position = 'fixed';
            popup.style.zIndex = '2147483647';
            popup.style.background = '#181818';
            popup.style.opacity = '1';
            popup.style.pointerEvents = 'auto';
            popup.style.maxWidth = 'min(720px, calc(100vw - 24px))';
            popup.style.maxHeight = 'min(520px, calc(100vh - 24px))';
            popup.style.overflow = 'auto';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';

            const popupWidth = Math.min(popup.offsetWidth || 620, window.innerWidth - 24);
            let left = Math.min(Math.max(12, rect.left), window.innerWidth - popupWidth - 12);
            let top = rect.bottom + 8;

            const popupHeight = Math.min(popup.offsetHeight || 360, window.innerHeight - 24);
            if (top + popupHeight > window.innerHeight - 12) {
                top = Math.max(12, rect.top - popupHeight - 8);
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        };

        const positionAllOpenDetails = () => {
            document.querySelectorAll('.slf-transfer-details[open]').forEach(positionOpenDetails);
        };

        window.addEventListener('scroll', positionAllOpenDetails, true);
        window.addEventListener('resize', positionAllOpenDetails, true);

        document.addEventListener('click', e => {
            const clickedDetails = e.target.closest?.('.slf-transfer-details') || null;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                if (clickedDetails !== details) {
                    details.removeAttribute('open');
                }
            });
        }, true);

        document.addEventListener('toggle', e => {
            const details = e.target;

            if (!details || !details.matches || !details.matches('.slf-transfer-details')) return;
            if (!details.open) return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(other => {
                if (other !== details) {
                    other.removeAttribute('open');
                }
            });

            requestAnimationFrame(() => positionOpenDetails(details));
        }, true);

        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                details.removeAttribute('open');
            });
        }, true);
    },

    buildMarkers(row, profile, slfAlter) {
        return [
            this.getClubStatusMarker(profile),
            this.getAgentMarker(profile),
            this.getSlfSkillMarker(slfAlter),
            this.getSlfCurrentActivityMarker(slfAlter),
            this.getSlfTalentUpgradeMarker(slfAlter),
            this.getSlfLeagueSignalMarker(slfAlter),
            this.getAgeMarker(slfAlter?.age || profile.age || row.age),
            this.getTmValueMarker(profile),
            this.getMarketSalePriceMarker(row, slfAlter),
            this.getValueTrendMarker(profile),
            this.getContractMarker(profile.contractExpires),
            this.getRumorMarker(profile.rumors),
            this.getAcademyMarker(profile.transferHistory, profile.youthClubs)
        ].filter(Boolean);
    },

    getSlfSkillMarker(alter) {
        if (!alter || alter.currentSkill == null || alter.finalSkill == null) {
            return {
                label: 'SLF ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не дал текущий и итоговый скилл.'
            };
        }

        const delta = Number(alter.skillDelta || 0);
        const finalSkill = SLFAlterLayer.formatSkill(alter.finalSkill);
        const label = `SLF ${SLFAlterLayer.formatDelta(delta)}`;

        return {
            label,
            level: delta > 0 ? 'good' : delta < 0 ? 'risk' : 'neutral',
            score: delta > 0 ? 3 : delta < 0 ? -2 : 0,
            redFlag: delta < 0,
            hardStop: false,
            text: `ИТОГ alter.php: ${finalSkill}. Чистая разница current skill → ИТОГ: ${SLFAlterLayer.formatDelta(delta)}. Пороги пока не фиксируем, смотри само число.`
        };
    },

    getSlfCurrentActivityMarker(alter) {
        if (!alter) {
            return {
                label: 'MIN ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не прочитан.'
            };
        }

        const seasonLabel = alter.currentSeasonLabel || alter.currentSeasonYear || 'текущий сезон';

        if (alter.staleActivity || !alter.hasCurrentSeason) {
            return {
                label: 'MIN -',
                level: 'risk',
                score: -3,
                redFlag: true,
                hardStop: false,
                text: `На alter.php нет строки с пометкой "Текущий". Последний найденный сезон: ${alter.lastSeasonYear || '?'}. Это маркер, что игрок может не играть сейчас.`
            };
        }

        const row = alter.currentRow;

        if (!row) {
            return {
                label: 'MIN ?',
                level: 'risk',
                score: -2,
                redFlag: true,
                hardStop: false,
                text: `Есть текущий сезон ${seasonLabel}, но нет лиговой строки с уровнем лиги/минутами.`
            };
        }

        const pct = Number(row.minutesPct || 0);
        const league = row.leagueLevel != null ? `L${row.leagueLevel}/${row.leagueSkill}` : 'L?';

        if (pct >= 40) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'good',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Текущий сезон ${seasonLabel}: ${pct}% минут, ${row.minutes || 0} минут, ${row.gamesPlayed}/${row.gamesPossible} игр, стартов ${row.starts ?? '?'}.`
            };
        }

        if (pct > 0) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'watch',
                score: 1,
                redFlag: false,
                hardStop: false,
                text: `В текущем сезоне ${seasonLabel} игрок играет, но пока меньше 40% минут.`
            };
        }

        return {
            label: `MIN 0% ${league}`,
            level: 'risk',
            score: -2,
            redFlag: true,
            hardStop: false,
            text: `Текущий сезон ${seasonLabel} есть, но игровые минуты 0%.`
        };
    },

    getSlfTalentUpgradeMarker(alter) {
        if (!alter || !alter.talentUpgradeEligible || !alter.talentUpgradeRow) {
            return null;
        }

        const row = alter.talentUpgradeRow;
        const isCurrent = row.isCurrentSeason === true;

        return {
            label: `T${alter.talent}<L${row.leagueLevel} ${row.minutesPct}%`,
            level: isCurrent ? 'hot' : 'good',
            score: isCurrent ? 5 : 3,
            redFlag: false,
            hardStop: false,
            text: `Талант игрока ${alter.talent}, а был сезон ${row.seasonLabel || row.season} с ${row.minutesPct}% минут в лиге уровня ${row.leagueLevel}/${row.leagueSkill}. Это сигнал возможного повышения таланта.`
        };
    },

    getSlfLeagueSignalMarker(alter) {
        if (!alter || !alter.currentRow) return null;

        const row = alter.currentRow;
        const currentSkill = SLFAlterLayer.formatSkill(alter.currentSkill);

        if (alter.leagueAboveSkill) {
            return {
                label: `L${row.leagueSkill}>${currentSkill}`,
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Игрок сейчас играет в лиге скилла ${row.leagueSkill}, выше текущего скилла ${alter.currentSkill}.`
            };
        }

        if (row.leagueSkill != null && alter.currentSkill != null && Number(row.leagueSkill) < Number(alter.currentSkill)) {
            return {
                label: `L${row.leagueSkill}<${currentSkill}`,
                level: 'watch',
                score: -1,
                redFlag: false,
                hardStop: false,
                text: `Текущая лига ниже скилла игрока. Это слабее как сигнал роста.`
            };
        }

        return null;
    },

    getAgeMarker(age) {
        const cfg = this.getCfg().ageGroups || {};

        if (!age) {
            return { label: 'age ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Возраст не найден.' };
        }

        if (age <= (cfg.academyMax || 18)) {
            return { label: `age ${age} acad`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Очень молодой игрок. Можно ниже планку текущего скилла, если есть другие сильные сигналы.' };
        }

        if (age <= (cfg.growthMax || 21)) {
            return { label: `age ${age} grow`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Возрастное окно роста.' };
        }

        if (age <= (cfg.lateGrowthMax || 24)) {
            return { label: `age ${age} late`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Ещё возможен рост, но уже нужен нормальный скилл или сильный TM-профиль.' };
        }

        if (age <= (cfg.primeMax || 29)) {
            return { label: `age ${age} prime`, level: 'normal', score: 2, redFlag: false, hardStop: false, text: 'Игрок здесь и сейчас.' };
        }

        if (age <= (cfg.shortTermMax || 32)) {
            return { label: `age ${age} short`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Краткосрочное усиление. Нужен высокий скилл и разумная цена.' };
        }

        return { label: `age ${age} vet`, level: 'risk', score: -1, redFlag: true, hardStop: false, text: 'Возрастной риск.' };
    },

    getClubStatusMarker(profile) {
        const club = this.normalizeText(profile?.currentClub || '');

        if (!this.isUsefulTmText(club)) {
            return {
                label: 'club ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Текущий клуб не найден.'
            };
        }

        if (this.isRetired(profile)) {
            return {
                label: 'retired',
                level: 'skip',
                score: -100,
                redFlag: true,
                hardStop: true,
                text: 'Transfermarkt показывает Current club: Retired. Игрок завершил карьеру — не покупать.'
            };
        }

        if (this.isFreeAgent(profile)) {
            const age = Number(profile.age || 0);
            const minutes = profile.activity?.minutesPct;

            if (age >= 29 || minutes === 0) {
                return {
                    label: 'no club',
                    level: 'risk',
                    score: -2,
                    redFlag: true,
                    hardStop: false,
                    text: 'Игрок без клуба. Для возрастного или неиграющего игрока это сильный риск.'
                };
            }

            return {
                label: 'no club',
                level: 'watch',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок без клуба. Может быть возможностью, но требует ручной проверки.'
            };
        }

        return {
            label: 'club ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Текущий клуб: ${club}`
        };
    },

    getAgentMarker(profile) {
        const agent = this.normalizeText(profile?.playerAgent || '');

        if (!this.isUsefulTmText(agent)) {
            return {
                label: 'agent ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Агент не найден.'
            };
        }

        if (this.isNoAgent(profile)) {
            const age = Number(profile.age || 0);
            const free = this.isFreeAgent(profile);

            const strongRisk = age >= 29 || free;

            return {
                label: 'no agent',
                level: strongRisk ? 'risk' : 'watch',
                score: strongRisk ? -2 : -1,
                redFlag: strongRisk,
                hardStop: false,
                text: 'Player agent: no agent. Само по себе не стоп, но усиливает риск у свободных/возрастных/неиграющих игроков.'
            };
        }

        return {
            label: 'agent ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Агент: ${agent}`
        };
    },

    getTmValueMarker(profileOrValue) {
        const cfg = this.getCfg().tmValue || {};
        const profile = profileOrValue && typeof profileOrValue === 'object'
            ? profileOrValue
            : null;

        if (profile && this.isRetired(profile)) {
            const oldValue = Number(profile.lastKnownMarketValueEur || profile.highestMarketValueEur || 0);

            if (!oldValue) {
                return {
                    label: 'old €?',
                    level: 'old',
                    score: 0,
                    redFlag: false,
                    hardStop: false,
                    text: 'Игрок Retired. Текущей рыночной цены нет; TM-стоимость, если она была, является исторической.'
                };
            }

            return {
                label: `old ${TMEnrichmentLayer.formatMoney(oldValue)}`,
                level: 'old',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок Retired. Эта сумма не текущая рыночная цена, а последняя/историческая оценка Transfermarkt. Для покупки она почти не имеет положительного веса.'
            };
        }

        const value = profile
            ? Number(profile.marketValueEur || 0)
            : Number(profileOrValue || 0);

        if (!value) {
            return { label: 'TM €?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Реальная цена TM не найдена.' };
        }

        if (value >= (cfg.high || 1000000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'hot', score: 4, redFlag: false, hardStop: false, text: 'Высокая реальная цена TM. Это сильный внешний сигнал актуальности игрока.' };
        }

        if (value >= (cfg.good || 300000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Хорошая реальная цена TM.' };
        }

        if (value >= (cfg.normal || 100000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'normal', score: 1, redFlag: false, hardStop: false, text: 'Нормальная реальная цена TM.' };
        }

        return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'low', score: 0, redFlag: false, hardStop: false, text: 'Низкая реальная цена TM.' };
    },

    getMarketSalePriceMarker(row, slfAlter) {
        if (this.isHistoryPage() || row?.completedTransfer) {
            return null;
        }

        const currentInfo = this.getCurrentSlfMarketPrice(row);
        const current = Number(currentInfo.value || 0);
        const nominalRatio = Number(row?.nominalRatio || currentInfo.nominalRatio || 0);
        const baseNominal = current && nominalRatio ? Math.round(current / nominalRatio) : Number(row?.nominalBase || currentInfo.nominalBase || 0);
        const nominalText = nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : '';

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const unknownDetails = {
            currentInfo,
            baseline: null,
            ratio: 0,
            ratioText: '?',
            skillBasis,
            nominal: {
                ratio: nominalRatio || null,
                ratioText: nominalText,
                baseNominal
            },
            conclusion: 'нет текущей цены, alter.php ИТОГ или рыночной базы для сравнения'
        };

        if (!current) {
            return {
                label: 'MKT ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: unknownDetails,
                text: 'MKT: текущая SLF-цена из ячейки Цена не распознана.'
            };
        }

        if (!skillBasis.skill) {
            const shortCurrent = this.formatSlfMoneyShort(current);
            const fallbackText = skillBasis.pageSkill
                ? `Текущий скилл со страницы ${SLFAlterLayer.formatSkill(skillBasis.pageSkill)} показан только как контекст и не используется для MKT.`
                : 'Текущий скилл со страницы не используется для MKT.';

            return {
                label: `MKT ${shortCurrent} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: `MKT не рассчитан: нужен ИТОГ из alter.php. ${fallbackText}`
                }),
                text: `MKT: ${shortCurrent}, но p75 не считается без ИТОГ alter.php. ${fallbackText}`
            };
        }

        const baseline = this.findMarketBaseline(row, slfAlter);
        const p75 = Number(baseline?.p75 || 0);

        if (!baseline || !p75) {
            return {
                label: `MKT ${this.formatSlfMoneyShort(current)} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: 'нет достаточной completed-transfer выборки для p75'
                }),
                text: `MKT: текущая SLF цена ${this.formatSlfMoneyShort(current)}, p75 недоступен.`
            };
        }

        const ratio = current / p75;
        const ratioText = `${ratio.toFixed(2)}x`;
        let level = 'neutral';
        let score = 0;
        let conclusion = 'около рыночного p75; решение зависит от позиции, возраста, скилла и TM-сигнала.';

        if (baseline.count < 3 || baseline.confidence === 'weak') {
            level = 'unknown';
            score = 0;
            conclusion = 'маленькая выборка; использовать как слабый ориентир и проверить вручную.';
        } else if (current <= p75 * 0.85) {
            level = 'good';
            score = 3;
            conclusion = 'ниже верхнего рыночного ориентира p75; потенциально выгодно при нормальных игровых сигналах.';
        } else if (current <= p75 * 1.05) {
            level = 'normal';
            score = 1;
            conclusion = 'около p75; справедливая цена при подтверждении скилла/возраста/позиции.';
        } else if (current <= p75 * 1.50) {
            level = 'watch';
            score = -1;
            conclusion = 'выше p75; дорого, покупать только при сильном подтверждении потенциала или редкости позиции.';
        } else {
            level = 'risk';
            score = -3;
            conclusion = 'сильно выше верхнего рыночного ориентира; высокий риск переплаты.';
        }

        const shortCurrent = this.formatSlfMoneyShort(current);
        const shortP75 = this.formatSlfMoneyShort(p75);

        return {
            label: `MKT ${shortCurrent} / ${shortP75} · ${ratioText}`,
            level,
            score,
            redFlag: level === 'risk',
            hardStop: false,
            category: 'market',
            marketDetails: {
                currentInfo,
                baseline,
                ratio,
                ratioText,
                skillBasis,
                diffPct: Math.round((ratio - 1) * 100),
                nominal: {
                    ratio: nominalRatio || null,
                    ratioText: nominalText,
                    baseNominal
                },
                conclusion
            },
            text: `MKT ${shortCurrent} / ${shortP75}: сравнение текущей SLF-цены с p75 completed transfers (${ratioText}). База скилла: ${skillBasis.label}.`
        };
    },


    getValueTrendMarker(profile) {
        if (this.isRetired(profile)) return null;

        const current = Number(profile?.marketValueEur || 0);
        const highest = Number(profile?.highestMarketValueEur || 0);
        const ratio = Number(profile?.valuePeakRatio || 0);
        const cfg = this.getCfg().valueTrend || {};

        if (!current || !highest || !ratio) {
            return {
                label: 'trend ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Не удалось сравнить текущую и максимальную цену TM.'
            };
        }

        const percent = Math.round(ratio * 100);
        const peakYear = Number((String(profile.highestMarketValueDate || '').match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();
        const isOldPeak = peakYear && currentYear - peakYear >= (cfg.oldPeakYears || 5);

        if (ratio >= (cfg.nearPeakRatio || 0.80)) {
            return {
                label: `peak ${percent}%`,
                level: 'good',
                score: 3,
                redFlag: false,
                hardStop: false,
                text: 'Текущая цена близка к максимальной. Игрок актуален по TM.'
            };
        }

        if (ratio >= (cfg.stillValuableRatio || 0.50)) {
            return {
                label: `peak ${percent}%`,
                level: 'normal',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: 'Цена ниже максимума, но игрок остаётся достаточно ценным по TM.'
            };
        }

        if (ratio >= (cfg.belowPeakRatio || 0.20)) {
            return {
                label: `peak ${percent}%`,
                level: isOldPeak ? 'risk' : 'watch',
                score: isOldPeak ? -2 : -1,
                redFlag: isOldPeak,
                hardStop: false,
                text: isOldPeak
                    ? 'Цена заметно ниже старого пика. Старый пик может вводить в заблуждение.'
                    : 'Цена заметно ниже пика. Нужна ручная проверка динамики.'
            };
        }

        return {
            label: `fall ${percent}%`,
            level: 'risk',
            score: -3,
            redFlag: true,
            hardStop: false,
            text: 'Игрок сильно дешевле своего пика. Это красный маркер, особенно у возрастных/без клуба.'
        };
    },

    getContractMarker(text) {
        if (!this.isUsefulTmText(text)) {
            return { label: 'ctr ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Контракт не найден.' };
        }

        const year = Number((String(text).match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();

        if (!year) {
            return { label: `ctr ${String(text).slice(0, 10)}`, level: 'unknown', score: 0, redFlag: false, hardStop: false, text: `Контракт найден, но год не распознан: ${text}` };
        }

        if (year <= currentYear) {
            return { label: `exp ${year}`, level: 'risk', score: -2, redFlag: true, hardStop: false, text: 'Контракт истекает или уже истёк. Нужна ручная проверка.' };
        }

        if (year === currentYear + 1) {
            return { label: `exp ${year}`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Контракт скоро заканчивается.' };
        }

        return { label: `ctr ${year}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Действующий контракт.' };
    },

    getRumorMarker(rumors) {
        const list = this.getUsefulRumors(rumors);

        if (!list.length) {
            return { label: 'R0', level: 'empty', score: 0, redFlag: false, hardStop: false, text: 'Слухов не найдено.' };
        }

        const now = Date.now();

        const fresh = list.filter(r => {
            if (!r.dateTs) return false;

            const days = (now - r.dateTs) / 86400000;
            return days <= 90;
        });

        if (fresh.length >= 3) {
            return { label: `R${fresh.length} fresh`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Много свежего интереса.' };
        }

        if (fresh.length >= 1) {
            return { label: `R${fresh.length} fresh`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Есть свежий интерес.' };
        }

        if (list.length >= 3) {
            return { label: `R${list.length}`, level: 'watch', score: 3, redFlag: false, hardStop: false, text: 'Есть слухи, свежесть не распознана.' };
        }

        return { label: `R${list.length}`, level: 'old', score: 1, redFlag: false, hardStop: false, text: 'Слухи есть, но сигнал слабый или дата не распознана.' };
    },

    matchAcademyList(text, list) {
        const lower = this.normalizeLower(text);

        for (const item of list || []) {
            const patterns = item.patterns || [];

            if (patterns.some(pattern => lower.includes(String(pattern).toLowerCase()))) {
                return item;
            }
        }

        return null;
    },

    getAcademyMarker(history, youthClubs) {
        const rows = Array.isArray(history) ? history : [];
        const youth = Array.isArray(youthClubs) ? youthClubs : [];

        if (!rows.length && !youth.length) {
            return {
                label: 'acad ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'История переходов и Youth Clubs не найдены.'
            };
        }

        const text = [
            ...rows.map(x => x.text || ''),
            ...youth
        ].join(' ');

        const cfg = this.getCfg();

        const elite = this.matchAcademyList(text, cfg.eliteAcademies || []);

        if (elite) {
            return {
                label: 'elite',
                level: 'hot',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Топовая академия: ${elite.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const strong = this.matchAcademyList(text, cfg.strongAcademies || []);

        if (strong) {
            return {
                label: 'strong',
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Сильный клубный след: ${strong.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const lower = this.normalizeLower(text);
        const hasYouthTrace = /\bu1[7-9]\b|\bu2[0-3]\b|\bu-1[7-9]\b|\bu-2[0-3]\b|\byouth\b|\bacademy\b|\bii\b|\bb\b|юнош/i.test(lower);

        if (hasYouthTrace || youth.length) {
            return {
                label: 'youth',
                level: 'neutral',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Есть молодёжный след, но клуб не входит в список топовых/сильных академий. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        return {
            label: 'acad -',
            level: 'empty',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: 'Сильного академического сигнала нет.'
        };
    },

    buildTransferVerdict(markers, profile, slfAlter) {
        const cfg = this.getCfg().verdict || {};
        const score = markers.reduce((sum, m) => sum + Number(m.score || 0), 0);

        const hardStop = markers.find(m => m.hardStop);

        if (hardStop) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: hardStop.text || hardStop.label
            };
        }

        const redFlags = markers.filter(m => m.redFlag || m.level === 'risk');
        const redFlagCount = redFlags.length;
        const hotCount = markers.filter(m => m.level === 'hot').length;
        const goodCount = markers.filter(m => m.level === 'good').length;

        const noClub = this.isFreeAgent(profile);
        const noAgent = this.isNoAgent(profile);
        const age = Number(slfAlter?.age || profile?.age || 0);
        const collapsed = markers.some(m => String(m.label || '').includes('collapsed'));
        const inactiveNow = !!slfAlter && (
            slfAlter.staleActivity ||
            !slfAlter.hasCurrentSeason ||
            slfAlter.currentRow?.minutesPct === 0
        );

        if (
            noClub &&
            noAgent &&
            (inactiveNow || collapsed || age >= 30)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Без клуба + no agent + inactive/collapsed/age risk.'
            };
        }

        if (
            age >= 33 &&
            noClub &&
            (inactiveNow || collapsed)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Возрастной игрок без клуба и без актуального игрового сигнала SLF.'
            };
        }

        const marketMarker = markers.find(m => this.markerCategory(m) === 'market') || null;
        const trendMarker = markers.find(m => this.markerCategory(m) === 'trend') || null;
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const minPct = Number(slfAlter?.currentRow?.minutesPct || 0);
        const peakPct = Number((String(trendMarker?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const talent = Number(slfAlter?.talent || 0);
        const currentSkill = Number(slfAlter?.currentSkill || 0);
        const slfDelta = Number(slfAlter?.skillDelta || 0);

        const slfGapVeryGood = slfDelta >= 10 || (marketRatio > 0 && marketRatio <= 0.70) || score >= (cfg.priorityScore || 13);
        const slfGapGood = slfDelta >= 5 || (marketRatio > 0 && marketRatio <= 1.05) || score >= (cfg.targetScore || 8);
        const lateAge = age >= 22 && age <= 24;
        const highPeak = peakPct >= 90;
        const lowReadiness = minPct > 0 && minPct < 40;
        const veryLowReadiness = minPct > 0 && minPct < 30;
        const ready = minPct >= 70;
        const mediumReady = minPct >= 50 && minPct < 70;
        const skillReady = ready || currentSkill >= 130 || (currentSkill >= 120 && minPct >= 50);
        const priceCheapEnough = marketRatio > 0 && marketRatio <= 0.85;
        const priceVeryCheap = marketRatio > 0 && marketRatio <= 0.50;
        const mktOverpriced = marketRatio > 1.05;

        if (slfGapVeryGood && ready && skillReady && highPeak && talent >= 2) {
            return {
                label: 'PRIORITY',
                level: 'hot',
                score,
                reason: 'Готовый актив: высокий gap, MIN 70%+, skill ready, peak 90%+, талант 2+.'
            };
        }

        if (slfGapGood && mktOverpriced && lowReadiness && talent <= 1) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'MKT переплата при низкой готовности и таланте 1: риск false bargain.'
            };
        }

        if (slfGapVeryGood && lateAge && highPeak && lowReadiness) {
            return {
                label: 'SPEC',
                level: 'spec',
                score,
                reason: 'Сильный gap, но низкая готовность: late-growth gamble, нужна ручная проверка.'
            };
        }

        if (slfGapGood && veryLowReadiness && talent <= 1 && !priceVeryCheap) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'Gap есть, но MIN < 30% и талант 1: риск false bargain.'
            };
        }

        if (slfGapGood && mediumReady && (peakPct >= 80 || highPeak) && redFlagCount < 2) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат: gap подтверждён, готовность средняя, hard risk не доминирует.'
            };
        }

        if (slfGapGood && ready && talent <= 1 && priceCheapEnough) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Готовность высокая и цена достаточно дешёвая, несмотря на talent risk.'
            };
        }

        if (redFlagCount >= (cfg.highRiskRedFlags || 3)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: `Красных флагов: ${redFlagCount}.`
            };
        }

        if (redFlagCount >= 2 && score < (cfg.priorityScore || 13)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: 'Несколько рисков без достаточного количества сильных плюсов.'
            };
        }

        if (redFlagCount >= (cfg.manualCheckRedFlags || 1)) {
            return {
                label: 'WATCH',
                level: 'watch',
                score,
                reason: 'Есть риск-факторы, нужна ручная проверка.'
            };
        }

        if (score >= (cfg.priorityScore || 13) || (hotCount >= 2 && score >= 9)) {
            return {
                label: ready && skillReady ? 'PRIORITY' : 'WATCH',
                level: ready && skillReady ? 'hot' : 'watch',
                score,
                reason: ready && skillReady
                    ? 'Сильный кандидат по TM и/или SLF alter-сигналам, готовность подтверждена.'
                    : 'Сильные сигналы есть, но готовность недостаточно подтверждена для PRIORITY.'
            };
        }

        if (score >= (cfg.targetScore || 8) || goodCount >= 3) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат без крупных красных флагов.'
            };
        }

        if (score >= (cfg.watchlistScore || 3)) {
            return {
                label: 'WATCH',
                level: 'normal',
                score,
                reason: 'Есть полезные сигналы, но пока не приоритет.'
            };
        }

        return {
            label: 'WATCH',
            level: 'neutral',
            score,
            reason: 'Мало сильных сигналов.'
        };
    },

    colorByLevel(level) {
        return {
            skip: '#ff4d4d',
            risk: '#ff7777',
            watch: '#ffd166',
            spec: '#9fb8cc',
            old: '#b8b8b8',
            low: '#b8b8b8',
            empty: '#777',
            unknown: '#aaa',
            neutral: '#d7d7d7',
            normal: '#c9ff8a',
            good: '#6dff8c',
            hot: '#00f080'
        }[level] || '#ddd';
    },

    bgByLevel(level) {
        return {
            skip: '#3a1010',
            risk: '#301515',
            watch: '#302610',
            spec: '#182533',
            old: '#202020',
            low: '#202020',
            empty: '#171717',
            unknown: '#1d1d1d',
            neutral: '#202020',
            normal: '#173018',
            good: '#12351e',
            hot: '#0b3b22'
        }[level] || '#202020';
    },

    borderByLevel(level) {
        return {
            skip: '#9b3030',
            risk: '#854040',
            watch: '#7a6422',
            spec: '#49687f',
            old: '#555',
            low: '#555',
            empty: '#333',
            unknown: '#444',
            neutral: '#555',
            normal: '#4b7d2d',
            good: '#2f8f4c',
            hot: '#00a65a'
        }[level] || '#555';
    },

    sortByDataset(datasetKey, direction = 'desc', label = datasetKey) {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, datasetKey, direction);
        this.setStatus(`Сортировка ${label} ${direction === 'asc' ? '↑' : '↓'}`);
    },

    sortRowsInTableByDataset(table, datasetKey, direction = 'desc') {
        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfPlayerId);

        rows.sort((a, b) => {
            const avRaw = a.dataset[datasetKey];
            const bvRaw = b.dataset[datasetKey];

            const av = avRaw == null || avRaw === '' ? -999999999 : Number(avRaw);
            const bv = bvRaw == null || bvRaw === '' ? -999999999 : Number(bvRaw);

            if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
            if (Number.isNaN(av)) return 1;
            if (Number.isNaN(bv)) return -1;

            return direction === 'asc'
                ? av - bv
                : bv - av;
        });

        rows.forEach(tr => tbody.appendChild(tr));
    },

    sortByTmValue(direction = 'desc') {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, 'slfTmValue', direction);
        this.setStatus(direction === 'asc' ? 'Сортировка TM € ↑' : 'Сортировка TM € ↓');
    },

    resetOrder() {
        const table = this.findTransferTable();
        if (!table) return;

        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfOriginalIndex);

        rows.sort((a, b) => {
            return Number(a.dataset.slfOriginalIndex) - Number(b.dataset.slfOriginalIndex);
        });

        rows.forEach(tr => tbody.appendChild(tr));

        this.setStatus('Порядок строк восстановлен.');
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
