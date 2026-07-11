// Transfer Candidate Scanner
// Manual full-market crawler and candidate ranking for transfers.php
// ============================================================

const TransferCandidateScanner = {
    storageKey: 'slf_transfer_candidate_scanner_v1',
    schema: 'slf_transfer_candidate_scanner_v1',
    state: null,
    running: false,
    stopRequested: false,

    defaults() {
        return {
            schema: this.schema,
            baseUrl: '',
            totalPages: 0,
            nextPage: 0,
            scannedPages: 0,
            rows: [],
            activePreset: 'young_growth',
            enrichmentLimit: 100,
            updatedAt: Date.now()
        };
    },

    isPage() {
        if (location.pathname !== '/transfers.php') return false;
        const p = new URLSearchParams(location.search);
        return p.get('action') !== 'view' && p.get('action') !== 'history';
    },

    start() {
        if (!this.isPage()) return;
        this.state = this.load();
        const mount = () => this.mount();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
        else mount();
        window.addEventListener('load', mount, { once: true });
        setTimeout(mount, 800);
        setTimeout(mount, 2000);
    },

    load() {
        try {
            const value = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (value?.schema === this.schema && Array.isArray(value.rows)) return Object.assign(this.defaults(), value);
        } catch (e) {
            console.warn('[SLF Candidate Scanner] state load failed', e);
        }
        return this.defaults();
    },

    save() {
        this.state.updatedAt = Date.now();
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {
            console.warn('[SLF Candidate Scanner] state save failed', e);
            this.status('Не удалось сохранить прогресс: localStorage переполнен.');
        }
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
                <button id="slf-candidate-scan">Сканировать все страницы</button>
                <button id="slf-candidate-stop" disabled>Остановить</button>
                <button id="slf-candidate-resume">Продолжить</button>
                <button id="slf-candidate-enrich">Обогатить Top</button>
                <label>Top <input id="slf-candidate-limit" type="number" min="10" max="300" step="10" value="100" style="width:58px;"></label>
                <select id="slf-candidate-preset">
                    <option value="young_growth">На вырост</option>
                    <option value="cheap_160">Cheap 160+</option>
                    <option value="ready_starter">Здесь и сейчас</option>
                    <option value="contract_opportunity">Контрактные возможности</option>
                    <option value="hidden_upgrade">Hidden Upgrade</option>
                </select>
                <button id="slf-candidate-export">CSV</button>
                <button id="slf-candidate-reset">Сбросить</button>
                <span id="slf-candidate-status" style="color:#aaa;"></span>
            </div>
            <div id="slf-candidate-progress" style="margin-top:8px;color:#8fa7b8;"></div>
            <div id="slf-candidate-results" style="margin-top:8px;max-height:560px;overflow:auto;"></div>
        `;
        table.parentNode.insertBefore(panel, table);
        document.getElementById('slf-candidate-scan').onclick = () => this.scan(false);
        document.getElementById('slf-candidate-resume').onclick = () => this.scan(true);
        document.getElementById('slf-candidate-stop').onclick = () => { this.stopRequested = true; this.status('Остановка после текущего запроса...'); };
        document.getElementById('slf-candidate-enrich').onclick = () => this.enrich();
        document.getElementById('slf-candidate-export').onclick = () => this.exportCsv();
        document.getElementById('slf-candidate-reset').onclick = () => this.reset();
        document.getElementById('slf-candidate-preset').onchange = e => { this.state.activePreset = e.target.value; this.save(); this.render(); };
        document.getElementById('slf-candidate-limit').onchange = e => {
            this.state.enrichmentLimit = this.clamp(Number(e.target.value || 100), 10, 300);
            e.target.value = String(this.state.enrichmentLimit);
            this.save();
        };
        document.getElementById('slf-candidate-preset').value = this.state.activePreset;
        document.getElementById('slf-candidate-limit').value = String(this.state.enrichmentLimit);
        this.render();
    },

    reset() {
        if (this.running) return;
        localStorage.removeItem(this.storageKey);
        this.state = this.defaults();
        this.render();
        this.status('Сканер сброшен.');
    },

    setRunning(value) {
        this.running = value;
        ['slf-candidate-scan', 'slf-candidate-resume', 'slf-candidate-enrich'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = value;
        });
        const stop = document.getElementById('slf-candidate-stop');
        if (stop) stop.disabled = !value;
    },

    status(text) {
        const el = document.getElementById('slf-candidate-status');
        if (el) el.textContent = text || '';
    },

    clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v || 0))); },
    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
    text(v) { return String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); },
    number(v) {
        const m = String(v || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        const n = m ? Number(m[0]) : null;
        return Number.isFinite(n) ? n : null;
    },
    money(v) {
        const text = this.text(v).replace(',', '.');
        const m = text.match(/(\d+(?:\.\d+)?)/);
        if (!m) return null;
        const n = Number(m[1]);
        if (!Number.isFinite(n)) return null;
        if (/млрд|billion|\b[bб]\b/i.test(text)) return Math.round(n * 1e9);
        if (/млн|million|\b[mм]\b/i.test(text)) return Math.round(n * 1e6);
        if (/тыс|thousand|\b[kк]\b/i.test(text)) return Math.round(n * 1e3);
        return n;
    },
    moneyText(v) {
        const n = Number(v || 0);
        if (!n) return '—';
        if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
        if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
        return String(Math.round(n));
    },
    escape(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

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

    totalPages(doc) {
        const pages = [...doc.querySelectorAll('a[href*="page="]')]
            .map(a => Number((a.getAttribute('href') || '').match(/[?&]page=(\d+)/)?.[1]))
            .filter(Number.isFinite);
        return pages.length ? Math.max(...pages) + 1 : 1;
    },

    headerMap(table) {
        const header = [...table.querySelectorAll('tr')].find(tr => {
            const text = this.text(tr.textContent).toLowerCase();
            return text.includes('амплуа') && (text.includes('фамилия') || text.includes('имя'));
        });
        const cells = header ? [...header.querySelectorAll('td,th')].map(c => this.text(c.textContent).toLowerCase()) : [];
        const find = (...terms) => { const i = cells.findIndex(t => terms.some(term => t.includes(term))); return i >= 0 ? i : null; };
        return { pos: find('амплуа'), club: find('команда', 'клуб'), age: find('воз'), talent: find('тал'), potential: find('пот'), skill: find('скилл', 'ск'), price: find('цена', 'сумма'), end: find('дата окончания', 'оконч'), bids: find('предл', 'став') };
    },

    parsePage(doc, page, pageUrl) {
        const table = this.findTable(doc);
        if (!table) return [];
        const map = this.headerMap(table);
        return [...table.querySelectorAll('tr')].map((tr, index) => {
            const player = tr.querySelector('a[href*="player.php"][href*="id="]');
            if (!player) return null;
            const cells = [...tr.querySelectorAll('td')];
            const cell = i => i == null ? null : cells[i] || null;
            const value = i => this.text(cell(i)?.textContent || '');
            const playerId = (player.getAttribute('href') || '').match(/[?&]id=(\d+)/)?.[1];
            if (!playerId) return null;
            const transferId = (tr.id || '').match(/tl-(\d+)/)?.[1] || this.text(cells[0]?.textContent || '').match(/\d{4,}/)?.[0] || '';
            const potentialCell = cell(map.potential);
            const potentialLevel = Number((potentialCell?.querySelector('img[src*="/potencial/"]')?.getAttribute('src') || '').match(/potencial\/(\d+)/)?.[1]) || null;
            const priceCell = cell(map.price)?.cloneNode(true);
            priceCell?.querySelectorAll('[title*="номинал"], img').forEach(node => node.remove());
            const tm = tr.querySelector('.tm_field a[href*="transfermarkt"]');
            const positions = value(map.pos).toUpperCase().match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/g) || [];
            const row = {
                key: transferId ? `transfer:${transferId}` : `player:${playerId}`,
                transferId, playerId, page, pageUrl, originalIndex: index,
                name: this.text(player.textContent),
                playerUrl: new URL(player.getAttribute('href'), location.origin).toString(),
                positions: [...new Set(positions)],
                club: value(map.club), age: this.number(value(map.age)), talent: this.number(value(map.talent)),
                potentialLevel, potentialText: this.text(potentialCell?.querySelector('[title]')?.getAttribute('title') || ''),
                scoutSkill: this.number(value(map.skill)), price: this.money(priceCell?.textContent || value(map.price)),
                bids: this.number(value(map.bids)), endDateText: value(map.end), tmUrl: tm?.href || '', tmDisplayedValueEur: this.money(tm?.textContent || ''), enrichment: null
            };
            row.preScore = this.preScore(row);
            return row;
        }).filter(Boolean);
    },

    preScore(row) {
        const age = Number(row.age || 99), skill = Number(row.scoutSkill || 0), talent = Number(row.talent || 0), potential = Number(row.potentialLevel || 0), priceM = Number(row.price || 0) / 1e6;
        let score = age <= 22 ? 25 : age <= 25 ? 15 : age <= 29 ? 7 : 0;
        score += Math.max(0, skill - 140) * 0.8 + talent * 2 + (potential >= 4 ? 14 : potential === 3 ? 5 : potential <= 2 ? -12 : 0);
        if (priceM > 0) score += Math.max(-20, 25 - priceM / 20);
        if (!Number(row.bids || 0)) score += 3;
        return Number(score.toFixed(2));
    },

    merge(rows) {
        const map = new Map((this.state.rows || []).map(row => [row.key, row]));
        rows.forEach(row => { const old = map.get(row.key); map.set(row.key, old?.enrichment ? { ...row, enrichment: old.enrichment } : row); });
        this.state.rows = [...map.values()];
    },

    async fetchPage(page) {
        const pageUrl = this.pageUrl(page);
        const response = await fetch(pageUrl, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`transfer_page_http_${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return { doc, pageUrl };
    },

    async scan(resume) {
        if (this.running) return;
        this.stopRequested = false;
        this.setRunning(true);
        try {
            if (!resume || !this.state.baseUrl) {
                const preset = document.getElementById('slf-candidate-preset')?.value || 'young_growth';
                const limit = this.clamp(Number(document.getElementById('slf-candidate-limit')?.value || 100), 10, 300);
                this.state = this.defaults();
                this.state.baseUrl = this.baseUrl();
                this.state.activePreset = preset;
                this.state.enrichmentLimit = limit;
            }
            let page = resume ? Number(this.state.nextPage || 0) : 0;
            for (; !this.stopRequested; page++) {
                const result = await this.fetchPage(page);
                if (!this.state.totalPages) this.state.totalPages = this.totalPages(result.doc);
                if (page >= this.state.totalPages) break;
                this.status(`Страница ${page + 1}/${this.state.totalPages}...`);
                this.merge(this.parsePage(result.doc, page, result.pageUrl));
                this.state.scannedPages = Math.max(this.state.scannedPages, page + 1);
                this.state.nextPage = page + 1;
                this.save();
                this.renderProgress();
                if (page + 1 >= this.state.totalPages) break;
                await this.delay(250);
            }
            this.status(this.stopRequested ? 'Сканирование остановлено. Прогресс сохранён.' : `Индекс готов: ${this.state.rows.length} лотов.`);
            this.render();
        } catch (e) {
            console.error('[SLF Candidate Scanner] scan failed', e);
            this.status(`Ошибка сканирования: ${e.message || e}`);
        } finally {
            this.stopRequested = false;
            this.setRunning(false);
        }
    },

    prefiltered() {
        const preset = this.state.activePreset;
        return (this.state.rows || []).filter(row => {
            const age = Number(row.age || 99), skill = Number(row.scoutSkill || 0), potential = Number(row.potentialLevel || 0);
            if (!row.playerId || !row.price) return false;
            if (preset === 'young_growth') return age <= 23 && skill >= 145 && potential >= 3;
            if (preset === 'cheap_160') return age <= 28 && skill >= 150;
            if (preset === 'ready_starter') return age >= 22 && age <= 30 && skill >= 165;
            if (preset === 'contract_opportunity') return age <= 29 && skill >= 150;
            if (preset === 'hidden_upgrade') return age <= 28 && skill >= 145 && skill < 180;
            return true;
        }).sort((a, b) => Number(b.preScore || 0) - Number(a.preScore || 0));
    },

    async enrich() {
        if (this.running) return;
        const limit = this.clamp(Number(document.getElementById('slf-candidate-limit')?.value || this.state.enrichmentLimit || 100), 10, 300);
        this.state.enrichmentLimit = limit;
        const rows = this.prefiltered().slice(0, limit);
        if (!rows.length) return this.status('Нет кандидатов. Сначала просканируй рынок.');
        this.stopRequested = false;
        this.setRunning(true);
        let done = 0;
        try {
            for (const row of rows) {
                if (this.stopRequested) break;
                if (row.enrichment?.completedAt) { done++; continue; }
                this.status(`Обогащение ${done + 1}/${rows.length}: ${row.name}`);
                try {
                    const alter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    let tm = null;
                    try { tm = await TMEnrichmentLayer.getBySlfPlayerId(row.playerId); }
                    catch (e) { console.warn('[SLF Candidate Scanner] TM failed', row.playerId, e); }
                    row.enrichment = this.buildEnrichment(row, alter, tm);
                } catch (e) {
                    row.enrichment = { completedAt: Date.now(), error: String(e?.message || e || 'enrichment_failed') };
                }
                done++;
                this.save();
                if (done % 3 === 0 || done === rows.length) this.render();
                await this.delay(120);
            }
            this.status(this.stopRequested ? 'Обогащение остановлено. Прогресс сохранён.' : `Обогащено: ${done}/${rows.length}.`);
        } finally {
            this.stopRequested = false;
            this.setRunning(false);
            this.save();
            this.render();
        }
    },

    buildEnrichment(row, alter, tm) {
        const profile = tm?.tmProfile || null;
        const current = alter?.currentRow || alter?.currentEligibleRow || null;
        const finalSkill = Number(alter?.finalSkill || 0) || null;
        const currentSkill = Number(alter?.currentSkill || row.scoutSkill || 0) || null;
        const contract = this.contract(profile?.contractExpires || '');
        const e = {
            completedAt: Date.now(), finalSkill, currentSkill,
            skillDelta: finalSkill != null && currentSkill != null ? finalSkill - currentSkill : null,
            minutesPct: Number(current?.minutesPct ?? profile?.activity?.minutesPct ?? 0) || 0,
            currentSeasonMinutes: Number(alter?.currentSeasonMinutes || 0),
            leagueLevel: Number(current?.leagueLevel || 0) || null,
            leagueSkill: Number(current?.leagueSkill || 0) || null,
            hasCurrent40: alter?.hasCurrent40 === true,
            talentUpgradeEligible: alter?.talentUpgradeEligible === true,
            staleActivity: alter?.staleActivity === true,
            tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || row.tmDisplayedValueEur || 0) || null,
            contractExpires: profile?.contractExpires || '', contractMonths: contract.months, contractStatus: contract.status,
            currentClub: profile?.currentClub || '', isRetired: profile?.isRetired === true, isFreeAgent: profile?.isFreeAgent === true,
            scoreByPreset: {}
        };
        ['young_growth', 'cheap_160', 'ready_starter', 'contract_opportunity', 'hidden_upgrade'].forEach(name => { e.scoreByPreset[name] = this.score(row, e, name); });
        return e;
    },

    contract(value) {
        const raw = this.text(value);
        if (!raw) return { months: null, status: 'unknown' };
        const m = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        let date = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
        if (!date) { const year = raw.match(/\b(20\d{2})\b/)?.[1]; if (year) date = new Date(Number(year), 5, 30); }
        if (!date || Number.isNaN(date.getTime())) return { months: null, status: 'unknown' };
        const months = Math.round((date.getTime() - Date.now()) / 2629800000);
        return { months, status: months <= 6 ? 'expiring' : months <= 12 ? 'opportunity' : months <= 24 ? 'medium' : 'stable' };
    },

    score(row, e, preset) {
        if (!e || e.error || e.isRetired) return -999;
        const age = Number(row.age || 99), finalSkill = Number(e.finalSkill || row.scoutSkill || 0), delta = Number(e.skillDelta || 0), minutes = Number(e.minutesPct || 0), leagueSkill = Number(e.leagueSkill || 0), potential = Number(row.potentialLevel || 0), priceM = Number(row.price || 0) / 1e6;
        const efficiency = priceM > 0 ? finalSkill / Math.sqrt(priceM) : 0;
        let score = 0;
        if (preset === 'young_growth') {
            score = delta * 2.2 + minutes * 0.22 + Math.max(0, 24 - age) * 3 + potential * 4 + Math.max(0, leagueSkill - finalSkill) * 0.35 + efficiency;
            if (age > 23 || finalSkill < 150 || minutes < 35 || potential < 3 || e.staleActivity) score -= 45;
        } else if (preset === 'cheap_160') {
            score = finalSkill * 0.7 + minutes * 0.25 + delta * 1.2 + efficiency * 2 + Math.max(0, 29 - age) * 1.5;
            if (finalSkill < 160 || age > 28 || minutes < 40 || e.staleActivity) score -= 50;
        } else if (preset === 'ready_starter') {
            score = finalSkill + minutes * 0.45 + leagueSkill * 0.25 + efficiency;
            if (finalSkill < 175 || age < 22 || age > 30 || minutes < 55 || e.staleActivity) score -= 55;
        } else if (preset === 'contract_opportunity') {
            score = finalSkill * 0.55 + minutes * 0.25 + efficiency + (e.contractMonths != null && e.contractMonths <= 12 ? 35 : 0) + (e.contractMonths != null && e.contractMonths <= 6 ? 15 : 0);
            if (age > 29 || minutes < 35 || e.contractMonths == null || e.contractMonths > 18) score -= 45;
        } else {
            score = delta * 3.4 + finalSkill * 0.45 + minutes * 0.2 + efficiency * 1.5;
            if (delta < 8 || finalSkill < 170 || minutes < 35 || e.staleActivity) score -= 55;
        }
        if (e.isFreeAgent && minutes < 35) score -= 25;
        return Number(score.toFixed(2));
    },

    ranked() {
        const preset = this.state.activePreset;
        return (this.state.rows || []).filter(row => row.enrichment?.completedAt && !row.enrichment.error)
            .map(row => ({ ...row, score: Number(row.enrichment.scoreByPreset?.[preset] ?? -999) }))
            .filter(row => row.score > -100).sort((a, b) => b.score - a.score);
    },

    renderProgress() {
        const el = document.getElementById('slf-candidate-progress');
        if (!el) return;
        const enriched = (this.state.rows || []).filter(row => row.enrichment?.completedAt).length;
        el.textContent = `Страницы: ${this.state.scannedPages || 0}/${this.state.totalPages || '?'} · Игроков: ${(this.state.rows || []).length} · Быстрый фильтр: ${this.prefiltered().length} · Обогащено: ${enriched}`;
    },

    render() {
        this.renderProgress();
        const box = document.getElementById('slf-candidate-results');
        if (!box) return;
        const rows = this.ranked().slice(0, 150);
        if (!rows.length) {
            box.innerHTML = (this.state.rows || []).length ? '<div style="color:#888;padding:6px 0;">Индекс собран. Нажми «Обогатить Top».</div>' : '<div style="color:#888;padding:6px 0;">Запусти ручное сканирование всех страниц.</div>';
            return;
        }
        const cols = '46px 44px minmax(150px,1fr) 42px 42px 48px 48px 50px 62px 58px 65px 110px';
        box.innerHTML = `<div style="display:grid;grid-template-columns:${cols};gap:5px;padding:5px 4px;border-bottom:1px solid #445;font-weight:bold;color:#9aaebe;position:sticky;top:0;background:#14181d;z-index:2;"><span>Score</span><span>Стр.</span><span>Игрок</span><span>Возр.</span><span>Тал.</span><span>Скилл</span><span>Δ</span><span>Мин%</span><span>Лига</span><span>Цена</span><span>TM</span><span>Контракт</span></div>${rows.map(row => this.rowHtml(row, cols)).join('')}`;
    },

    rowHtml(row, cols) {
        const e = row.enrichment || {};
        const league = e.leagueLevel || e.leagueSkill ? `${e.leagueLevel || '?'} / ${e.leagueSkill || '?'}` : '—';
        const color = row.score >= 150 ? '#7cff7c' : row.score >= 110 ? '#ffda72' : '#ddd';
        return `<div style="display:grid;grid-template-columns:${cols};gap:5px;align-items:center;padding:5px 4px;border-bottom:1px solid #2c343b;"><span style="color:${color};font-weight:bold;">${row.score.toFixed(1)}</span><a href="${this.escape(row.pageUrl)}" style="color:#8dcfff;">${Number(row.page || 0) + 1}</a><a href="${this.escape(row.playerUrl)}" style="color:#d8e9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${this.escape(row.club)}">${this.escape(row.name || row.playerId)}</a><span>${row.age ?? '—'}</span><span>${row.talent ?? '—'}</span><span>${e.finalSkill != null ? Number(e.finalSkill).toFixed(1) : row.scoutSkill ?? '—'}</span><span style="color:${Number(e.skillDelta || 0) >= 8 ? '#7cff7c' : '#ccc'};">${e.skillDelta != null ? `${e.skillDelta >= 0 ? '+' : ''}${Number(e.skillDelta).toFixed(1)}` : '—'}</span><span>${e.minutesPct ?? '—'}</span><span>${league}</span><span>${this.moneyText(row.price)}</span><span>${this.moneyText(e.tmValueEur)}</span><span title="${this.escape(e.currentClub)}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escape(e.contractExpires || e.contractStatus || '—')}</span></div>`;
    },

    exportCsv() {
        const rows = this.ranked();
        if (!rows.length) return this.status('Нет обогащённых кандидатов для экспорта.');
        const preset = this.state.activePreset;
        const header = ['score','preset','page','transferId','playerId','name','positions','age','talent','potential','scoutSkill','finalSkill','skillDelta','minutesPct','leagueLevel','leagueSkill','price','tmValueEur','contractExpires','contractMonths','club','playerUrl','pageUrl'];
        const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(',')].concat(rows.map(row => {
            const e = row.enrichment || {};
            return [row.score,preset,Number(row.page || 0)+1,row.transferId,row.playerId,row.name,(row.positions||[]).join('/'),row.age,row.talent,row.potentialLevel,row.scoutSkill,e.finalSkill,e.skillDelta,e.minutesPct,e.leagueLevel,e.leagueSkill,row.price,e.tmValueEur,e.contractExpires,e.contractMonths,row.club,row.playerUrl,row.pageUrl].map(quote).join(',');
        }));
        const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `slf-transfer-candidates-${preset}-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        this.status(`CSV экспортирован: ${rows.length} кандидатов.`);
    }
};

TransferCandidateScanner.start();

// ============================================================
