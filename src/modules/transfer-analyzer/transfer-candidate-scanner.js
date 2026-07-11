// Transfer Candidate Scanner
// VPS-backed full-market crawler and unified Top 20 ranking for transfers.php
// ============================================================

const TransferCandidateScanner = {
    storageKey: 'slf_transfer_candidate_scanner_v3_meta',
    legacyStorageKeys: [
        'slf_transfer_candidate_scanner_v1',
        'slf_transfer_candidate_scanner_v2'
    ],
    schema: 'slf_transfer_candidate_scanner_v3_meta',
    indexCollection: 'transfer_candidate_scan_index_tmp',
    enrichedCollection: 'transfer_candidate_scan_enriched_tmp',
    enrichmentPoolSize: 200,
    resultLimit: 20,
    state: null,
    rows: [],
    finalRows: [],
    running: false,
    stopRequested: false,

    defaults() {
        return {
            schema: this.schema,
            baseUrl: '',
            totalPlayers: 0,
            pageSize: 0,
            totalPages: 0,
            nextPage: 0,
            scannedPages: 0,
            indexedPlayers: 0,
            enrichedPlayers: 0,
            maxPrice: 0,
            phase: 'idle',
            updatedAt: Date.now()
        };
    },

    isPage() {
        if (location.pathname !== '/transfers.php') return false;
        const params = new URLSearchParams(location.search);
        return params.get('action') !== 'view' && params.get('action') !== 'history';
    },

    start() {
        if (!this.isPage()) return;
        this.cleanupLegacyBrowserStorage();
        this.state = this.loadMeta();
        if (this.state.phase === 'complete') {
            const maxPrice = this.state.maxPrice;
            this.state = this.defaults();
            this.state.maxPrice = maxPrice;
            this.saveMeta();
        }
        const mount = () => this.mount();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
        else mount();
        window.addEventListener('load', mount, { once: true });
        setTimeout(mount, 800);
        setTimeout(mount, 2000);
    },

    cleanupLegacyBrowserStorage() {
        this.legacyStorageKeys.forEach(key => localStorage.removeItem(key));
    },

    loadMeta() {
        try {
            const value = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (value?.schema === this.schema) return Object.assign(this.defaults(), value);
        } catch (error) {
            console.warn('[SLF Candidate Scanner] meta load failed', error);
        }
        return this.defaults();
    },

    saveMeta() {
        this.state.updatedAt = Date.now();
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (error) {
            console.warn('[SLF Candidate Scanner] meta save failed', error);
            this.status('Не удалось сохранить краткий прогресс сканирования.');
        }
    },

    normalizeServerRows(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.data)) return data.data;
        if (Array.isArray(data?.items)) return data.items;
        return [];
    },

    async readCollection(name) {
        const result = await Api.getPromise(name);
        return this.normalizeServerRows(result?.data);
    },

    async appendCollection(name, rows, label) {
        if (!rows?.length) return;
        const result = await Api.postAppend(name, rows, label);
        if (Number(result?.status || 0) >= 400) throw new Error(`${name}_append_http_${result.status}`);
    },

    async clearCollection(name, label) {
        const result = await Api.clearCollection(name, label);
        if (Number(result?.status || 0) >= 400) throw new Error(`${name}_clear_http_${result.status}`);
    },

    async clearRemoteSession() {
        await Promise.all([
            this.clearCollection(this.indexCollection, 'temporary candidate index cleared'),
            this.clearCollection(this.enrichedCollection, 'temporary candidate enrichment cleared')
        ]);
    },

    mount() {
        if (!this.isPage() || document.getElementById('slf-transfer-candidate-panel')) return;
        const table = this.findTable(document);
        if (!table?.parentNode) return;

        const panel = document.createElement('section');
        panel.id = 'slf-transfer-candidate-panel';
        panel.style.cssText = 'margin:8px 0 12px;padding:10px;background:#14181d;border:1px solid #3f5668;border-radius:6px;color:#ddd;font:12px Arial,sans-serif;';
        panel.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <b style="color:#7cc8ff;font-size:14px;">SLF Transfer Candidate Scanner</b>
                <label style="display:flex;gap:5px;align-items:center;">Максимальная цена
                    <input id="slf-candidate-max-price" type="text" placeholder="например 300M" style="width:110px;">
                </label>
                <button id="slf-candidate-scan">Найти Top 20</button>
                <button id="slf-candidate-stop" disabled>Остановить</button>
                <button id="slf-candidate-resume">Продолжить</button>
                <button id="slf-candidate-reset">Сбросить</button>
                <span id="slf-candidate-status" style="color:#aaa;"></span>
            </div>
            <div id="slf-candidate-progress" style="margin-top:8px;color:#8fa7b8;"></div>
            <div id="slf-candidate-results" style="margin-top:8px;max-height:560px;overflow:auto;"></div>
        `;
        table.parentNode.insertBefore(panel, table);

        const priceInput = document.getElementById('slf-candidate-max-price');
        priceInput.value = this.state.maxPrice ? this.moneyText(this.state.maxPrice) : '';
        priceInput.onchange = () => {
            this.state.maxPrice = this.money(priceInput.value) || 0;
            priceInput.value = this.state.maxPrice ? this.moneyText(this.state.maxPrice) : '';
            this.saveMeta();
            this.render();
        };

        document.getElementById('slf-candidate-scan').onclick = () => this.run(false);
        document.getElementById('slf-candidate-resume').onclick = () => this.run(true);
        document.getElementById('slf-candidate-stop').onclick = () => {
            this.stopRequested = true;
            this.status('Остановка после текущего запроса...');
        };
        document.getElementById('slf-candidate-reset').onclick = () => this.reset();
        this.render();
    },

    async reset() {
        if (this.running) return;
        this.setRunning(true);
        try {
            await this.clearRemoteSession();
            localStorage.removeItem(this.storageKey);
            this.rows = [];
            this.finalRows = [];
            this.state = this.defaults();
            const input = document.getElementById('slf-candidate-max-price');
            if (input) input.value = '';
            this.status('Временные данные на VPS удалены.');
        } catch (error) {
            console.error('[SLF Candidate Scanner] reset failed', error);
            this.status(`Ошибка удаления временных данных: ${error.message || error}`);
        } finally {
            this.setRunning(false);
            this.render();
        }
    },

    setRunning(value) {
        this.running = value;
        ['slf-candidate-scan', 'slf-candidate-resume', 'slf-candidate-reset'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.disabled = value;
        });
        const stop = document.getElementById('slf-candidate-stop');
        if (stop) stop.disabled = !value;
    },

    status(text) {
        const element = document.getElementById('slf-candidate-status');
        if (element) element.textContent = text || '';
    },

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    text(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); },
    number(value) {
        const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        const number = match ? Number(match[0]) : null;
        return Number.isFinite(number) ? number : null;
    },
    money(value) {
        if (typeof TransferCandidateScannerMoneyParser !== 'undefined') return TransferCandidateScannerMoneyParser.parse(value);
        const text = this.text(value).replace(/\s+/g, '').replace(',', '.');
        const match = text.match(/(\d+(?:\.\d+)?)/);
        if (!match) return null;
        const number = Number(match[1]);
        if (!Number.isFinite(number)) return null;
        if (/млрд|billion|bn|[bб]$/i.test(text)) return Math.round(number * 1e9);
        if (/млн|million|mln|[mм]$/i.test(text)) return Math.round(number * 1e6);
        if (/тыс|thousand|[kк]$/i.test(text)) return Math.round(number * 1e3);
        return Math.round(number);
    },
    moneyText(value) {
        const number = Number(value || 0);
        if (!number) return '';
        if (number >= 1e9) return `${(number / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
        if (number >= 1e6) return `${(number / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
        if (number >= 1e3) return `${Math.round(number / 1e3)}K`;
        return String(Math.round(number));
    },
    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    },

    baseUrl() {
        const url = new URL(location.href);
        ['page', 'sort', 'orderby'].forEach(key => url.searchParams.delete(key));
        return url.toString();
    },

    pageUrl(page) {
        const url = new URL(this.state.baseUrl || this.baseUrl());
        url.searchParams.set('page', String(page));
        return url.toString();
    },

    findTable(doc) {
        return doc.querySelector('table.trans_market_offers') || [...doc.querySelectorAll('table')].find(table => {
            const text = this.text(table.textContent).toLowerCase();
            return text.includes('амплуа') && text.includes('цена') && table.querySelector('a[href*="player.php"]');
        }) || null;
    },

    extractTotalPlayers(doc) {
        const candidates = [...doc.querySelectorAll('h1,h2,h3,div,span,a')];
        for (const element of candidates) {
            const text = this.text(element.textContent);
            const match = text.match(/Все\s+игроки\s*\((\d[\d\s]*)\)/i);
            if (match) return Number(match[1].replace(/\s/g, '')) || 0;
        }
        const bodyMatch = this.text(doc.body?.textContent || '').match(/Все\s+игроки\s*\((\d[\d\s]*)\)/i);
        return bodyMatch ? Number(bodyMatch[1].replace(/\s/g, '')) || 0 : 0;
    },

    detectTotalPages(doc, pageRows) {
        const linkPages = [...doc.querySelectorAll('a[href*="page="]')]
            .map(anchor => Number((anchor.getAttribute('href') || '').match(/[?&]page=(\d+)/)?.[1]))
            .filter(Number.isFinite);
        const fromLinks = linkPages.length ? Math.max(...linkPages) + 1 : 0;
        const totalPlayers = this.extractTotalPlayers(doc);
        const pageSize = pageRows.length;
        const fromCount = totalPlayers > 0 && pageSize > 0 ? Math.ceil(totalPlayers / pageSize) : 0;
        this.state.totalPlayers = totalPlayers || this.state.totalPlayers || 0;
        this.state.pageSize = pageSize || this.state.pageSize || 0;
        return Math.max(fromLinks, fromCount, 1);
    },

    headerMap(table) {
        const header = [...table.querySelectorAll('tr')].find(row => {
            const text = this.text(row.textContent).toLowerCase();
            return text.includes('амплуа') && (text.includes('фамилия') || text.includes('имя'));
        });
        const cells = header ? [...header.querySelectorAll('td,th')].map(cell => this.text(cell.textContent).toLowerCase()) : [];
        const find = (...terms) => {
            const index = cells.findIndex(text => terms.some(term => text.includes(term)));
            return index >= 0 ? index : null;
        };
        return {
            pos: find('амплуа'), club: find('команда', 'клуб'), age: find('воз'), talent: find('тал'),
            potential: find('пот'), skill: find('скилл', 'ск'), price: find('цена', 'сумма'),
            end: find('дата окончания', 'оконч'), bids: find('предл', 'став')
        };
    },

    parsePage(doc, page, pageUrl) {
        const table = this.findTable(doc);
        if (!table) return [];
        const map = this.headerMap(table);
        return [...table.querySelectorAll('tr')].map((rowElement, index) => {
            const player = rowElement.querySelector('a[href*="player.php"][href*="id="]');
            if (!player) return null;
            const cells = [...rowElement.querySelectorAll('td')];
            const cell = cellIndex => cellIndex == null ? null : cells[cellIndex] || null;
            const value = cellIndex => this.text(cell(cellIndex)?.textContent || '');
            const playerId = (player.getAttribute('href') || '').match(/[?&]id=(\d+)/)?.[1];
            if (!playerId) return null;
            const transferId = (rowElement.id || '').match(/tl-(\d+)/)?.[1] || this.text(cells[0]?.textContent || '').match(/\d{4,}/)?.[0] || '';
            const potentialCell = cell(map.potential);
            const potentialLevel = Number((potentialCell?.querySelector('img[src*="/potencial/"]')?.getAttribute('src') || '').match(/potencial\/(\d+)/)?.[1]) || null;
            const priceCell = cell(map.price)?.cloneNode(true);
            priceCell?.querySelectorAll('[title*="номинал"], img').forEach(node => node.remove());
            const tm = rowElement.querySelector('.tm_field a[href*="transfermarkt"]');
            const positions = value(map.pos).toUpperCase().match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/g) || [];
            const row = {
                key: transferId ? `transfer:${transferId}` : `player:${playerId}`,
                transferId,
                playerId,
                page,
                pageUrl,
                originalIndex: index,
                name: this.text(player.textContent),
                playerUrl: new URL(player.getAttribute('href'), location.origin).toString(),
                positions: [...new Set(positions)],
                club: value(map.club),
                age: this.number(value(map.age)),
                talent: this.number(value(map.talent)),
                potentialLevel,
                potentialText: this.text(potentialCell?.querySelector('[title]')?.getAttribute('title') || ''),
                scoutSkill: this.number(value(map.skill)),
                price: this.money(priceCell?.textContent || value(map.price)),
                bids: this.number(value(map.bids)),
                endDateText: value(map.end),
                tmUrl: tm?.href || '',
                tmDisplayedValueEur: this.money(tm?.textContent || '')
            };
            row.preScore = this.preScore(row);
            return row;
        }).filter(Boolean);
    },

    preScore(row) {
        const age = Number(row.age || 99);
        const skill = Number(row.scoutSkill || 0);
        const talent = Number(row.talent || 0);
        const potential = Number(row.potentialLevel || 0);
        const priceM = Number(row.price || 0) / 1e6;
        let score = age <= 22 ? 22 : age <= 25 ? 14 : age <= 29 ? 7 : 0;
        score += Math.max(0, skill - 140) * 0.9;
        score += talent * 2;
        score += potential >= 4 ? 12 : potential === 3 ? 5 : potential <= 2 ? -10 : 0;
        if (priceM > 0) score += Math.max(-20, 24 - priceM / 18);
        if (!Number(row.bids || 0)) score += 3;
        return Number(score.toFixed(2));
    },

    dedupeRows(rows) {
        const map = new Map();
        (rows || []).forEach(row => {
            if (!row?.key) return;
            map.set(row.key, row);
        });
        return [...map.values()];
    },

    async fetchPage(page) {
        const pageUrl = this.pageUrl(page);
        const response = await fetch(pageUrl, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`transfer_page_http_${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return { doc, pageUrl };
    },

    readMaxPrice() {
        const input = document.getElementById('slf-candidate-max-price');
        const maxPrice = this.money(input?.value || '') || 0;
        this.state.maxPrice = maxPrice;
        if (input) input.value = maxPrice ? this.moneyText(maxPrice) : '';
        return maxPrice;
    },

    async run(resume) {
        if (this.running) return;
        this.stopRequested = false;
        this.setRunning(true);
        try {
            const maxPrice = this.readMaxPrice();
            if (!resume || !this.state.baseUrl) {
                await this.clearRemoteSession();
                this.state = this.defaults();
                this.state.baseUrl = this.baseUrl();
                this.state.maxPrice = maxPrice;
                this.rows = [];
                this.finalRows = [];
                this.saveMeta();
            }

            if (this.state.phase === 'idle' || this.state.phase === 'scan') {
                await this.scanAllPages(resume);
            }
            if (this.stopRequested) return;

            this.rows = this.dedupeRows(await this.readCollection(this.indexCollection));
            this.state.indexedPlayers = this.rows.length;
            await this.enrichCandidates();
            if (this.stopRequested) return;

            this.state.phase = 'complete';
            this.finalRows = this.ranked();
            this.status(`Готово: Top ${this.resultLimit} по всему рынку.`);
            await this.clearRemoteSession();
            this.saveMeta();
        } catch (error) {
            console.error('[SLF Candidate Scanner] run failed', error);
            this.status(`Ошибка: ${error.message || error}`);
        } finally {
            this.stopRequested = false;
            this.setRunning(false);
            this.saveMeta();
            this.render();
        }
    },

    async scanAllPages(resume) {
        this.state.phase = 'scan';
        let page = resume ? Number(this.state.nextPage || 0) : 0;
        let previousSignature = '';

        for (; !this.stopRequested; page++) {
            const result = await this.fetchPage(page);
            const pageRows = this.parsePage(result.doc, page, result.pageUrl);
            if (!this.state.totalPages) this.state.totalPages = this.detectTotalPages(result.doc, pageRows);

            const signature = pageRows.slice(0, 10).map(row => row.key).join('|');
            if (!pageRows.length) break;
            if (page > 0 && signature && signature === previousSignature) break;

            this.status(`Сканирование страницы ${page + 1}/${this.state.totalPages || '?'}...`);
            await this.appendCollection(this.indexCollection, pageRows, `candidate page ${page + 1}`);
            this.state.scannedPages = Math.max(this.state.scannedPages, page + 1);
            this.state.nextPage = page + 1;
            this.state.indexedPlayers += pageRows.length;
            this.saveMeta();
            this.renderProgress();

            previousSignature = signature;
            if (this.state.totalPages && page + 1 >= this.state.totalPages) break;
            await this.delay(250);
        }

        if (this.stopRequested) {
            this.status('Сканирование остановлено. Прогресс сохранён на VPS.');
            return;
        }
        this.state.phase = 'enrich';
        this.status('Все страницы собраны. Загружаю временный индекс с VPS...');
        this.saveMeta();
        this.renderProgress();
    },

    eligibleRows() {
        const maxPrice = Number(this.state.maxPrice || 0);
        return (this.rows || []).filter(row => {
            if (!row.playerId || !Number(row.price || 0)) return false;
            if (maxPrice > 0 && Number(row.price) > maxPrice) return false;
            return Number(row.scoutSkill || 0) >= 140 && Number(row.age || 99) <= 32;
        }).sort((a, b) => Number(b.preScore || 0) - Number(a.preScore || 0));
    },

    async enrichCandidates() {
        const candidates = this.eligibleRows().slice(0, this.enrichmentPoolSize);
        if (!candidates.length) {
            this.status('Нет игроков в выбранном ценовом диапазоне.');
            return;
        }

        this.state.phase = 'enrich';
        const existing = this.dedupeRows(await this.readCollection(this.enrichedCollection));
        const enrichedByKey = new Map(existing.map(row => [row.key, row]));
        let done = enrichedByKey.size;
        this.state.enrichedPlayers = done;

        for (const row of candidates) {
            if (this.stopRequested) break;
            if (enrichedByKey.has(row.key)) continue;

            this.status(`Анализ ${done + 1}/${candidates.length}: ${row.name}`);
            let enrichedRow;
            try {
                const alter = await SLFAlterLayer.getByPlayerId(row.playerId);
                let tm = null;
                try {
                    tm = await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);
                } catch (error) {
                    console.warn('[SLF Candidate Scanner] TM failed', row.playerId, error);
                }
                enrichedRow = { ...row, enrichment: this.buildEnrichment(row, alter, tm) };
            } catch (error) {
                enrichedRow = {
                    ...row,
                    enrichment: {
                        completedAt: Date.now(),
                        error: String(error?.message || error || 'enrichment_failed')
                    }
                };
            }

            await this.appendCollection(this.enrichedCollection, [enrichedRow], `candidate enriched ${row.playerId}`);
            enrichedByKey.set(row.key, enrichedRow);
            done++;
            this.state.enrichedPlayers = done;
            this.saveMeta();
            if (done % 3 === 0 || done === candidates.length) {
                this.finalRows = this.rankRows([...enrichedByKey.values()]);
                this.render();
            }
            await this.delay(120);
        }

        this.finalRows = this.rankRows([...enrichedByKey.values()]);
        if (this.stopRequested) this.status('Анализ остановлен. Прогресс сохранён на VPS.');
    },

    buildEnrichment(row, alter, tm) {
        const profile = tm?.tmProfile || null;
        const current = alter?.currentRow || alter?.currentEligibleRow || null;
        const finalSkill = Number(alter?.finalSkill || 0) || null;
        const currentSkill = Number(alter?.currentSkill || row.scoutSkill || 0) || null;
        const contract = this.contract(profile?.contractExpires || '');
        const enrichment = {
            completedAt: Date.now(),
            finalSkill,
            currentSkill,
            skillDelta: finalSkill != null && currentSkill != null ? finalSkill - currentSkill : null,
            minutesPct: Number(current?.minutesPct ?? profile?.activity?.minutesPct ?? 0) || 0,
            currentSeasonMinutes: Number(alter?.currentSeasonMinutes || 0),
            leagueLevel: Number(current?.leagueLevel || 0) || null,
            leagueSkill: Number(current?.leagueSkill || 0) || null,
            hasCurrent40: alter?.hasCurrent40 === true,
            talentUpgradeEligible: alter?.talentUpgradeEligible === true,
            staleActivity: alter?.staleActivity === true,
            tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || row.tmDisplayedValueEur || 0) || null,
            contractExpires: profile?.contractExpires || '',
            contractMonths: contract.months,
            contractStatus: contract.status,
            currentClub: profile?.currentClub || '',
            isRetired: profile?.isRetired === true,
            isFreeAgent: profile?.isFreeAgent === true
        };
        enrichment.score = this.score(row, enrichment);
        return enrichment;
    },

    contract(value) {
        const raw = this.text(value);
        if (!raw) return { months: null, status: 'unknown' };
        const match = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        let date = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
        if (!date) {
            const year = raw.match(/\b(20\d{2})\b/)?.[1];
            if (year) date = new Date(Number(year), 5, 30);
        }
        if (!date || Number.isNaN(date.getTime())) return { months: null, status: 'unknown' };
        const months = Math.round((date.getTime() - Date.now()) / 2629800000);
        return {
            months,
            status: months <= 6 ? 'expiring' : months <= 12 ? 'opportunity' : months <= 24 ? 'medium' : 'stable'
        };
    },

    score(row, enrichment) {
        if (!enrichment || enrichment.error || enrichment.isRetired) return -999;
        const age = Number(row.age || 99);
        const finalSkill = Number(enrichment.finalSkill || row.scoutSkill || 0);
        const delta = Number(enrichment.skillDelta || 0);
        const minutes = Number(enrichment.minutesPct || 0);
        const leagueSkill = Number(enrichment.leagueSkill || 0);
        const leagueLevel = Number(enrichment.leagueLevel || 0);
        const talent = Number(row.talent || 0);
        const potential = Number(row.potentialLevel || 0);
        const priceM = Number(row.price || 0) / 1e6;
        const efficiency = priceM > 0 ? finalSkill / Math.sqrt(priceM) : 0;

        let score = 0;
        score += finalSkill * 0.55;
        score += delta * 2.4;
        score += minutes * 0.28;
        score += Math.max(0, leagueSkill - 130) * 0.18;
        score += Math.max(0, leagueLevel - 2) * 2.5;
        score += age <= 21 ? 24 : age <= 24 ? 16 : age <= 27 ? 9 : age <= 30 ? 3 : -8;
        score += talent * 2;
        score += potential >= 4 ? 10 : potential === 3 ? 4 : potential <= 2 ? -8 : 0;
        score += efficiency * 1.8;
        if (enrichment.hasCurrent40) score += 10;
        if (enrichment.talentUpgradeEligible) score += 8;
        if (enrichment.contractMonths != null && enrichment.contractMonths <= 12 && enrichment.contractMonths >= 0) score += 6;
        if (enrichment.staleActivity) score -= 35;
        if (minutes < 25) score -= 20;
        if (finalSkill < 150) score -= 25;
        if (enrichment.isFreeAgent && minutes < 35) score -= 20;
        return Number(score.toFixed(2));
    },

    rankRows(rows) {
        const maxPrice = Number(this.state.maxPrice || 0);
        return (rows || [])
            .filter(row => row.enrichment?.completedAt && !row.enrichment.error)
            .filter(row => !maxPrice || Number(row.price || 0) <= maxPrice)
            .map(row => ({ ...row, score: Number(row.enrichment.score ?? -999) }))
            .filter(row => row.score > -100)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.resultLimit);
    },

    ranked() {
        return this.finalRows || [];
    },

    renderProgress() {
        const element = document.getElementById('slf-candidate-progress');
        if (!element) return;
        const price = this.state.maxPrice ? this.moneyText(this.state.maxPrice) : 'без лимита';
        element.textContent = `Этап: ${this.state.phase} · Страницы: ${this.state.scannedPages || 0}/${this.state.totalPages || '?'} · На VPS: ${this.state.indexedPlayers || 0} · Проанализировано: ${this.state.enrichedPlayers || 0} · Лимит: ${price}`;
    },

    render() {
        this.renderProgress();
        const box = document.getElementById('slf-candidate-results');
        if (!box) return;
        const rows = this.ranked();
        if (!rows.length) {
            const message = this.state.phase === 'idle'
                ? 'Укажи максимальную цену и нажми «Найти Top 20».'
                : 'Идёт сбор и анализ кандидатов. Итоговый Top 20 появится автоматически.';
            box.innerHTML = `<div style="color:#888;padding:6px 0;">${message}</div>`;
            return;
        }

        const columns = '38px 54px minmax(150px,1fr) 42px 42px 52px 48px 50px 62px 62px 72px 110px';
        box.innerHTML = `
            <div style="display:grid;grid-template-columns:${columns};gap:5px;padding:5px 4px;border-bottom:1px solid #445;font-weight:bold;color:#9aaebe;position:sticky;top:0;background:#14181d;z-index:2;">
                <span>#</span><span>Score</span><span>Игрок</span><span>Стр.</span><span>Возр.</span><span>Скилл</span><span>Δ</span><span>Мин%</span><span>Лига</span><span>Цена</span><span>TM</span><span>Контракт</span>
            </div>
            ${rows.map((row, index) => this.rowHtml(row, columns, index + 1)).join('')}
        `;
    },

    rowHtml(row, columns, rank) {
        const enrichment = row.enrichment || {};
        const league = enrichment.leagueLevel || enrichment.leagueSkill
            ? `${enrichment.leagueLevel || '?'} / ${enrichment.leagueSkill || '?'}`
            : '—';
        const color = rank <= 5 ? '#7cff7c' : rank <= 10 ? '#ffda72' : '#ddd';
        return `
            <div style="display:grid;grid-template-columns:${columns};gap:5px;align-items:center;padding:5px 4px;border-bottom:1px solid #2c343b;">
                <span style="color:${color};font-weight:bold;">${rank}</span>
                <span style="font-weight:bold;">${row.score.toFixed(1)}</span>
                <a href="${this.escape(row.playerUrl)}" style="color:#d8e9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this.escape(row.club)}">${this.escape(row.name || row.playerId)}</a>
                <a href="${this.escape(row.pageUrl)}" style="color:#8dcfff;">${Number(row.page || 0) + 1}</a>
                <span>${row.age ?? '—'}</span>
                <span>${enrichment.finalSkill != null ? Number(enrichment.finalSkill).toFixed(1) : row.scoutSkill ?? '—'}</span>
                <span style="color:${Number(enrichment.skillDelta || 0) >= 8 ? '#7cff7c' : '#ccc'};">${enrichment.skillDelta != null ? `${enrichment.skillDelta >= 0 ? '+' : ''}${Number(enrichment.skillDelta).toFixed(1)}` : '—'}</span>
                <span>${enrichment.minutesPct ?? '—'}</span>
                <span>${league}</span>
                <span>${this.moneyText(row.price) || '—'}</span>
                <span>${this.moneyText(enrichment.tmValueEur) || '—'}</span>
                <span title="${this.escape(enrichment.contractExpires || '')}">${this.escape(enrichment.contractStatus || 'unknown')}</span>
            </div>
        `;
    }
};

TransferCandidateScanner.start();
