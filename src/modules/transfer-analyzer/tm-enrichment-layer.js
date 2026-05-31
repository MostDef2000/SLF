// 12. TM Enrichment Layer
// ============================================================

const TMEnrichmentLayer = {
    cacheKey: 'slf_tm_enrichment_cache_v6',
    cacheTtlMs: 1000 * 60 * 60 * 24 * (CONFIG.TRANSFER_ANALYZER?.cacheTtlDays || 7),
    requestDelayMs: CONFIG.TRANSFER_ANALYZER?.requestDelayMs || 900,
    _lastRequestAt: 0,

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('[SLF TM] cache save failed', e);
        }
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    getCache(key) {
        const cache = this.loadCache();
        const item = cache[key];

        if (!item) return null;

        const fetchedAt = Number(item.fetchedAt || 0);

        if (!fetchedAt || Date.now() - fetchedAt > this.cacheTtlMs) {
            return null;
        }

        return item;
    },

    peekBySlfPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;

        return this.getCache(`slf:${id}`);
    },

    setCache(key, value) {
        const cache = this.loadCache();

        cache[key] = {
            ...value,
            fetchedAt: Date.now()
        };

        this.saveCache(cache);
    },

    async throttle() {
        const diff = Date.now() - this._lastRequestAt;
        const wait = Math.max(0, this.requestDelayMs - diff);

        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }

        this._lastRequestAt = Date.now();
    },

    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
                },
                timeout: 30000,
                onload: r => resolve(r.responseText || ''),
                onerror: reject,
                ontimeout: reject
            });
        });
    },

    parseHtml(html) {
        return new DOMParser().parseFromString(html || '', 'text/html');
    },

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    includesAnyText(text, terms) {
        const lower = this.normalizeText(text).toLowerCase();

        return (terms || []).some(term => lower.includes(String(term || '').toLowerCase()));
    },

    isRetiredClubText(text) {
        return this.includesAnyText(text, CONFIG.TRANSFER_ANALYZER?.currentClub?.retiredTerms || []);
    },

    isFreeAgentClubText(text) {
        return this.includesAnyText(text, CONFIG.TRANSFER_ANALYZER?.currentClub?.freeAgentTerms || []);
    },

    normalizeUrl(url) {
        const value = String(url || '').trim();

        if (!value) return '';

        if (value.startsWith('//')) return 'https:' + value;
        if (value.startsWith('http')) return value;

        return '';
    },

    normalizeTransfermarktUrl(url) {
        let value = this.normalizeUrl(url);

        if (!value) return '';

        value = value.replace('http://', 'https://');

        value = value
            .replace('https://transfermarkt.', 'https://www.transfermarkt.')
            .replace('https://www.transfermarkt.de', 'https://www.transfermarkt.com')
            .replace('https://www.transfermarkt.ru', 'https://www.transfermarkt.com')
            .replace('https://www.transfermarkt.co.uk', 'https://www.transfermarkt.com');

        return value;
    },

    extractTmId(url) {
        const m = String(url || '').match(/spieler\/(\d+)/);
        return m ? m[1] : '';
    },

    async getBySlfPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) throw new Error('empty_player_id');

        const key = `slf:${id}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const slfUrl = buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(id)}`);
        const slfHtml = await this.fetchUrl(slfUrl);
        const slfDoc = this.parseHtml(slfHtml);

        const tmUrl = this.extractTransfermarktUrlFromSlfPlayer(slfDoc);

        const result = {
            playerId: id,
            slfUrl,
            tmUrl,
            tmProfile: null,
            error: null
        };

        if (!tmUrl) {
            result.error = 'tm_url_not_found';
            this.setCache(key, result);
            return result;
        }

        try {
            result.tmProfile = await this.getTmProfile(tmUrl);
        } catch (e) {
            result.error = String(e?.message || e || 'tm_profile_failed');
        }

        this.setCache(key, result);

        return result;
    },

    extractTransfermarktUrlFromSlfPlayer(doc) {
        const links = [...doc.querySelectorAll('a[href]')];

        const link = links.find(a => {
            const href = a.getAttribute('href') || '';
            return /transfermarkt\./i.test(href) && /spieler\/\d+/i.test(href);
        });

        if (!link) return '';

        return this.normalizeTransfermarktUrl(link.getAttribute('href') || '');
    },

    async getTmProfile(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);
        const key = `tm:${tmId || tmUrl}`;

        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const html = await this.fetchUrl(tmUrl);
        const doc = this.parseHtml(html);

        const profile = {
            tmUrl,
            tmId,

            marketValueText: this.extractTmMarketValueText(doc),
            marketValueEur: null,
            lastKnownMarketValueText: '',
            lastKnownMarketValueEur: null,
            lastKnownMarketValueDate: '',
            marketValueIsHistorical: false,
            isRetired: false,
            isFreeAgent: false,

            highestMarketValueText: '',
            highestMarketValueEur: null,
            highestMarketValueDate: '',
            valuePeakRatio: null,

            dateOfBirth: this.extractProfileValue(doc, [
                'Date of birth/Age',
                'Date of birth',
                'Geb./Alter',
                'Geburtsdatum/Alter'
            ]),
            age: this.extractAge(doc),

            currentClub: this.extractProfileValue(doc, [
                'Current club',
                'Club actuel',
                'Aktueller Verein'
            ]),

            playerAgent: this.extractProfileValue(doc, [
                'Player agent',
                'Agent',
                'Spielerberater',
                'Berater'
            ]),

            joined: this.extractProfileValue(doc, [
                'Joined',
                'Im Team seit',
                'Arrivé le'
            ]),

            contractExpires: this.extractProfileValue(doc, [
                'Contract expires',
                'Vertrag bis',
                'Contrat jusqu’à'
            ]),

            lastContractExtension: this.extractProfileValue(doc, [
                'Last contract extension',
                'Letzte Verlängerung'
            ]),

            activity: this.extractActivity(doc),

            transferHistory: [],
            youthClubs: [],
            rumors: [],

            fetchedAt: Date.now()
        };

        profile.isRetired = this.isRetiredClubText(profile.currentClub);
        profile.isFreeAgent = this.isFreeAgentClubText(profile.currentClub);

        profile.marketValueEur = this.parseMarketValue(profile.marketValueText);

        try {
            const graph = await this.getTmMarketValueGraph(tmUrl);

            profile.marketValueGraph = graph;

            if (graph.currentEur) {
                profile.lastKnownMarketValueEur = graph.currentEur;
                profile.lastKnownMarketValueText = graph.currentText || this.formatMoney(graph.currentEur);
                profile.lastKnownMarketValueDate = graph.currentDate || '';

                if (!profile.isRetired) {
                    profile.marketValueEur = graph.currentEur;
                    profile.marketValueText = `${graph.currentText || this.formatMoney(graph.currentEur)}${graph.currentDate ? ' Last update: ' + graph.currentDate : ''}`;
                }
            }

            if (graph.highestEur) {
                profile.highestMarketValueEur = graph.highestEur;
                profile.highestMarketValueText = graph.highestText || this.formatMoney(graph.highestEur);
                profile.highestMarketValueDate = graph.highestDate || '';
            }
        } catch (e) {
            console.warn('[SLF TM] market value graph failed', tmUrl, e);
        }

        if (!profile.highestMarketValueEur) {
            const highest = this.extractHighestMarketValue(doc);
            profile.highestMarketValueText = highest.highestMarketValueText;
            profile.highestMarketValueEur = highest.highestMarketValueEur;
            profile.highestMarketValueDate = highest.highestMarketValueDate;
        }

        if (profile.isRetired) {
            profile.marketValueIsHistorical = true;

            if (!profile.lastKnownMarketValueEur && profile.marketValueEur) {
                profile.lastKnownMarketValueEur = profile.marketValueEur;
                profile.lastKnownMarketValueText = profile.marketValueText;
            }

            profile.marketValueEur = null;
            profile.marketValueText = '';
            profile.valuePeakRatio = null;
        } else if (profile.marketValueEur && profile.highestMarketValueEur) {
            profile.valuePeakRatio = profile.marketValueEur / profile.highestMarketValueEur;
        }

        try {
            profile.transferHistory = await this.getTmTransferHistory(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] transfer history failed', tmUrl, e);
            profile.transferHistory = [];
        }

        try {
            profile.youthClubs = await this.getTmYouthClubs(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] youth clubs failed', tmUrl, e);
            profile.youthClubs = [];
        }

        try {
            profile.rumors = await this.getTmRumors(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] rumors failed', tmUrl, e);
            profile.rumors = [];
        }

        this.setCache(key, profile);

        return profile;
    },

    async getTmMarketValueGraph(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) {
            return {
                tmId: '',
                points: [],
                currentEur: null,
                currentText: '',
                currentDate: '',
                highestEur: null,
                highestText: '',
                highestDate: ''
            };
        }

        const key = `graph:${tmId}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const graphUrl = `https://www.transfermarkt.com/ceapi/marketValueDevelopment/graph/${encodeURIComponent(tmId)}`;
        const raw = await this.fetchUrl(graphUrl);

        let json = null;

        try {
            json = JSON.parse(raw);
        } catch (e) {
            throw new Error('market_value_graph_json_failed');
        }

        const points = this.extractMarketValueGraphPoints(json);
        const currentPoint = points.length ? points[points.length - 1] : null;

        let highestPoint = points.length
            ? points.slice().sort((a, b) => Number(b.eur || 0) - Number(a.eur || 0))[0]
            : null;

        const explicitHighest = this.parseMarketValue(json.highest || '');

        if (explicitHighest) {
            highestPoint = {
                eur: explicitHighest,
                moneyText: String(json.highest || ''),
                dateText: String(json.highest_date || '')
            };
        }

        const result = {
            tmId,
            graphUrl,
            points,
            currentEur: currentPoint?.eur || null,
            currentText: currentPoint?.moneyText || '',
            currentDate: currentPoint?.dateText || '',
            highestEur: highestPoint?.eur || null,
            highestText: highestPoint?.moneyText || '',
            highestDate: highestPoint?.dateText || '',
            lastChange: json.last_change || ''
        };

        this.setCache(key, result);

        return result;
    },

    extractMarketValueGraphPoints(json) {
        const list = Array.isArray(json?.list) ? json.list : [];

        const points = list
            .map(item => {
                const eur = Number(item?.y || 0);

                if (!Number.isFinite(eur) || eur <= 0) return null;

                return {
                    eur,
                    moneyText: item?.mw || this.formatMoney(eur),
                    dateText: item?.datum_mw || '',
                    club: item?.verein || '',
                    age: item?.age || ''
                };
            })
            .filter(Boolean);

        const seen = new Set();

        return points.filter(point => {
            const key = `${point.eur}|${point.dateText}`;

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
    },

    extractTmMarketValueText(doc) {
        const selectors = [
            '.data-header__market-value-wrapper',
            '.tm-player-market-value-development__current-value',
            '[class*="market-value"]'
        ];

        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            const text = this.normalizeText(el?.textContent || '');

            if (text && /€|m|k|Th\.|mil/i.test(text)) {
                return text;
            }
        }

        const text = doc.body?.innerText || '';
        const m = text.match(/€\s?[\d,.]+\s?(m|k|Th\.|mil\.)?/i);

        return m ? m[0].trim() : '';
    },

    parseMarketValue(text) {
        const raw = String(text || '')
            .replace(/\s+/g, ' ')
            .replace(',', '.')
            .toLowerCase();

        if (!raw.includes('€')) return null;

        const m = raw.match(/€\s*([\d.]+)/);
        if (!m) return null;

        const num = Number(m[1]);

        if (!Number.isFinite(num)) return null;

        if (raw.includes('m') || raw.includes('mil')) return Math.round(num * 1000000);
        if (raw.includes('k') || raw.includes('th')) return Math.round(num * 1000);

        return Math.round(num);
    },

    extractHighestMarketValue(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        let highestMarketValueText = '';
        let highestMarketValueDate = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();

            if (
                line.includes('highest market value') ||
                line.includes('highest mv') ||
                line.includes('höchster marktwert')
            ) {
                const nearby = lines.slice(i, i + 8);

                const valueLine = nearby.find(x => /€\s?[\d,.]+\s?(m|k|Th\.|mil\.)?/i.test(x));
                const dateLine = nearby.find(x => /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(x));

                highestMarketValueText = valueLine || '';
                highestMarketValueDate = dateLine || '';

                break;
            }
        }

        if (!highestMarketValueText) {
            const text = doc.body?.innerText || '';
            const m = text.match(/Highest market value\s*:?\s*[\n\r\s]*(€\s?[\d,.]+\s?(?:m|k|Th\.|mil\.)?)[\n\r\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{4})?/i);

            if (m) {
                highestMarketValueText = m[1] || '';
                highestMarketValueDate = m[2] || '';
            }
        }

        return {
            highestMarketValueText,
            highestMarketValueEur: this.parseMarketValue(highestMarketValueText),
            highestMarketValueDate
        };
    },

    extractProfileValue(doc, labels) {
        const bodyText = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        for (let i = 0; i < bodyText.length; i++) {
            const line = bodyText[i];

            for (const label of labels) {
                const normalizedLabel = label.toLowerCase();
                const lower = line.toLowerCase();

                if (lower === normalizedLabel || lower.startsWith(normalizedLabel + ':')) {
                    const inline = line.split(':').slice(1).join(':').trim();

                    if (inline) return inline;

                    return this.normalizeText(bodyText[i + 1] || '');
                }
            }
        }

        return '';
    },

    extractAge(doc) {
        const text = doc.body?.innerText || '';
        const m = text.match(/\((\d{2})\)/);

        if (!m) return null;

        const age = Number(m[1]);

        return Number.isFinite(age) ? age : null;
    },

    extractPercentNearLabel(lines, labelPatterns) {
        const normalized = lines.map(x => this.normalizeText(x));

        for (let i = 0; i < normalized.length; i++) {
            const line = normalized[i];
            const lower = line.toLowerCase();

            const hasLabel = labelPatterns.some(pattern => lower.includes(pattern));

            if (!hasLabel) continue;

            const nearby = normalized.slice(Math.max(0, i - 2), Math.min(normalized.length, i + 4));
            const joined = nearby.join(' ');

            const direct = line.match(/(\d{1,3})\s*%/);
            if (direct) return Number(direct[1]);

            const beforeLine = normalized[i - 1] || '';
            const afterLine = normalized[i + 1] || '';

            const before = beforeLine.match(/^(\d{1,3})$/);
            if (before && (afterLine === '%' || line.includes('%'))) return Number(before[1]);

            const joinedMatch = joined.match(/(\d{1,3})\s*%\s*[^%]{0,40}/);
            if (joinedMatch) return Number(joinedMatch[1]);
        }

        return null;
    },

    extractActivity(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        return {
            startingElevenPct: this.extractPercentNearLabel(lines, [
                'starting eleven',
                'startelf',
                'starting xi'
            ]),
            minutesPct: this.extractPercentNearLabel(lines, [
                'minutes',
                'minuten'
            ]),
            goalParticipationPct: this.extractPercentNearLabel(lines, [
                'goal participation',
                'goal involvement',
                'torbeteiligung'
            ])
        };
    },

    getTmHistoryUrlCandidates(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const urls = [];

        if (tmUrl.includes('/profil/')) {
            urls.push(tmUrl.replace('/profil/', '/transfers/'));
        }

        urls.push(
            tmUrl.replace(/\/profil\/spieler\/\d+.*/i, `/transfers/spieler/${tmId}`)
        );

        urls.push(`https://www.transfermarkt.com/-/transfers/spieler/${tmId}`);

        return [...new Set(urls.filter(Boolean))];
    },

    async getTmTransferHistory(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `history:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.transferHistory) return cached.transferHistory;

        const urls = this.getTmHistoryUrlCandidates(tmUrl);

        let lastUrl = '';
        let lastHtmlLength = 0;
        let lastTitle = '';

        for (const historyUrl of urls) {
            lastUrl = historyUrl;

            await this.throttle();

            const html = await this.fetchUrl(historyUrl);
            lastHtmlLength = html.length;

            const doc = this.parseHtml(html);
            lastTitle = doc.title || '';

            const transferHistory = this.extractTransferHistory(doc);

            console.log('[SLF TM] history fetch', {
                historyUrl,
                htmlLength: html.length,
                title: doc.title,
                rows: transferHistory.length
            });

            if (transferHistory.length) {
                this.setCache(key, {
                    tmId,
                    historyUrl,
                    transferHistory
                });

                return transferHistory;
            }
        }

        this.setCache(key, {
            tmId,
            historyUrl: lastUrl,
            transferHistory: [],
            debug: {
                lastHtmlLength,
                lastTitle
            }
        });

        return [];
    },

    async getTmYouthClubs(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `youth:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.youthClubs) return cached.youthClubs;

        const urls = this.getTmHistoryUrlCandidates(tmUrl);

        for (const historyUrl of urls) {
            await this.throttle();

            const html = await this.fetchUrl(historyUrl);
            const doc = this.parseHtml(html);
            const youthClubs = this.extractYouthClubs(doc);

            if (youthClubs.length) {
                this.setCache(key, {
                    tmId,
                    historyUrl,
                    youthClubs
                });

                return youthClubs;
            }
        }

        this.setCache(key, {
            tmId,
            youthClubs: []
        });

        return [];
    },

    extractYouthClubs(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();

            if (line !== 'youth clubs' && line !== 'jugendvereine') continue;

            const next = [];

            for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
                const value = lines[j];
                const lower = value.toLowerCase();

                if (
                    lower.includes('stats') ||
                    lower.includes('career') ||
                    lower.includes('national team') ||
                    lower.includes('similar players') ||
                    lower.includes('transfer history') ||
                    lower.includes('market value')
                ) {
                    break;
                }

                if (value.length >= 3) next.push(value);
            }

            next.join(', ')
                .split(',')
                .map(x => this.normalizeText(x))
                .filter(Boolean)
                .forEach(x => result.push(x));
        }

        const seen = new Set();

        return result.filter(x => {
            const key = x.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    extractTransferHistory(doc) {
        const normalize = value => this.normalizeText(value);

        const isTransferText = text => {
            const t = String(text || '').toLowerCase();

            return (
                /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(t) ||
                /\b\d{2}\/\d{2}\b/.test(t) ||
                t.includes('free transfer') ||
                t.includes('loan transfer') ||
                t.includes('end of loan') ||
                t.includes('transfer') ||
                t.includes('€')
            );
        };

        const rows = [];

        [...doc.querySelectorAll('table')].forEach(table => {
            const tableText = normalize(table.innerText).toLowerCase();

            const looksLikeHistory =
                tableText.includes('transfer history') ||
                tableText.includes('season') ||
                tableText.includes('date') ||
                tableText.includes('left') ||
                tableText.includes('joined') ||
                tableText.includes('fee') ||
                tableText.includes('free transfer') ||
                tableText.includes('loan transfer');

            if (!looksLikeHistory) return;

            [...table.querySelectorAll('tbody tr, tr')].forEach(tr => {
                const cells = [...tr.querySelectorAll('td, th')]
                    .map(td => normalize(td.innerText))
                    .filter(Boolean);

                const rowText = normalize(tr.innerText);

                if (!rowText || rowText.length < 8) return;

                const lower = rowText.toLowerCase();

                if (
                    lower === 'season date left joined mv fee' ||
                    lower.includes('season date left joined')
                ) {
                    return;
                }

                if (!isTransferText(rowText)) return;

                rows.push({
                    text: rowText,
                    cells,
                    source: 'table'
                });
            });
        });

        const gridCandidates = [...doc.querySelectorAll(
            '[class*="transfer-history"], [class*="tm-player-transfer-history"], [class*="grid"]'
        )].filter(el => {
            const text = normalize(el.innerText).toLowerCase();

            return text.includes('season') &&
                (
                    text.includes('joined') ||
                    text.includes('left') ||
                    text.includes('fee') ||
                    text.includes('free transfer') ||
                    text.includes('loan transfer')
                );
        });

        gridCandidates.forEach(grid => {
            const lines = (grid.innerText || '')
                .split('\n')
                .map(normalize)
                .filter(Boolean)
                .filter(line => {
                    const lower = line.toLowerCase();

                    return ![
                        'transfer history',
                        'season',
                        'date',
                        'left',
                        'joined',
                        'mv',
                        'fee'
                    ].includes(lower);
                });

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const looksLikeSeason =
                    /^\d{2}\/\d{2}$/.test(line) ||
                    /^\d{4}$/.test(line);

                const nextLines = lines.slice(i + 1, i + 10);
                const hasDateSoon = nextLines.some(x =>
                    /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(x)
                );

                if (!looksLikeSeason || !hasDateSoon) continue;

                let j = i + 1;

                while (j < lines.length) {
                    const nextSeason =
                        j > i + 1 &&
                        (
                            /^\d{2}\/\d{2}$/.test(lines[j]) ||
                            /^\d{4}$/.test(lines[j])
                        );

                    if (nextSeason) break;

                    j++;
                }

                const cells = lines.slice(i, j);
                const rowText = cells.join(' | ');

                if (isTransferText(rowText)) {
                    rows.push({
                        text: rowText,
                        cells,
                        source: 'grid'
                    });
                }

                i = j - 1;
            }
        });

        if (!rows.length) {
            [...doc.querySelectorAll('tr, li, div')].forEach(el => {
                const text = normalize(el.innerText);

                if (!text || text.length < 15 || text.length > 500) return;
                if (!isTransferText(text)) return;

                const lower = text.toLowerCase();

                if (
                    !lower.includes('free transfer') &&
                    !lower.includes('loan') &&
                    !lower.includes('transfer') &&
                    !lower.includes('€')
                ) {
                    return;
                }

                rows.push({
                    text,
                    cells: text.split('|').map(normalize).filter(Boolean),
                    source: 'fallback'
                });
            });
        }

        const seen = new Set();
        const unique = [];

        rows.forEach(row => {
            const key = normalize(row.text).toLowerCase();

            if (!key || seen.has(key)) return;

            seen.add(key);
            unique.push(row);
        });

        return unique.slice(0, 40);
    },

    async getTmRumors(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `rumors:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.rumors) return cached.rumors;

        const rumorUrl = tmUrl.replace('/profil/', '/geruechte/');

        await this.throttle();

        const html = await this.fetchUrl(rumorUrl);
        const doc = this.parseHtml(html);
        const rumors = this.extractRumors(doc);

        this.setCache(key, {
            tmId,
            rumorUrl,
            rumors
        });

        return rumors;
    },

    extractRumors(doc) {
        const normalize = value => this.normalizeText(value);
        const dateRe = /\d{1,2}[./-]\d{1,2}[./-]20\d{2}/g;

        const isHeaderText = text => {
            const t = String(text || '').toLowerCase();

            return (
                t.includes('interested club') &&
                (
                    t.includes('most recent source') ||
                    t.includes('last reply') ||
                    t.includes('user assessment') ||
                    t.includes('verein_id')
                )
            );
        };

        const cleanCell = value => {
            return normalize(value)
                .replace(/\bverein_id\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const rows = [...doc.querySelectorAll('table tbody tr, table tr')];
        const rumors = [];

        rows.forEach(tr => {
            const cells = [...tr.querySelectorAll('td, th')]
                .map(td => cleanCell(td.innerText))
                .filter(Boolean);

            const rowText = normalize(cells.length ? cells.join(' | ') : tr.innerText);

            if (!rowText) return;
            if (rowText.length < 4) return;
            if (isHeaderText(rowText)) return;

            const lower = rowText.toLowerCase();

            if (
                lower === 'club' ||
                lower === 'date' ||
                lower === 'source' ||
                lower === 'rumour' ||
                lower === 'probability'
            ) {
                return;
            }

            const dates = rowText.match(dateRe) || [];
            const dateInfo = this.extractDateFromText(dates[0] || rowText);

            const clubLink = [...tr.querySelectorAll('a[href]')].find(a => {
                const href = a.getAttribute('href') || '';
                return /\/verein\/\d+|verein_id=\d+/i.test(href);
            });

            let club = cleanCell(clubLink?.innerText || '');

            if (!club) {
                club = cells.find(c => {
                    const cLower = c.toLowerCase();

                    if (isHeaderText(cLower)) return false;
                    if (dateRe.test(c)) return false;
                    if (c === '-') return false;
                    if (/^\d+%?$/.test(c)) return false;
                    if (cLower.includes('source')) return false;
                    if (cLower.includes('reply')) return false;
                    if (cLower.includes('assessment')) return false;

                    return /[A-Za-zА-Яа-яЁё]/.test(c);
                }) || '';
            }

            if (!club && !dateInfo.dateText) return;

            const usefulCells = cells.filter(c => {
                if (!c) return false;
                if (isHeaderText(c)) return false;
                return true;
            });

            const textParts = [];

            if (club) textParts.push(club);
            if (dateInfo.dateText) textParts.push(dateInfo.dateText);

            const raw = usefulCells.join(' | ');

            rumors.push({
                text: textParts.length ? textParts.join(' · ') : raw,
                club,
                dateText: dateInfo.dateText,
                dateTs: dateInfo.dateTs,
                cells: usefulCells,
                rawText: raw
            });
        });

        const seen = new Set();
        const unique = [];

        rumors.forEach(r => {
            const key = normalize(`${r.club || ''}|${r.dateText || ''}|${r.rawText || r.text || ''}`).toLowerCase();

            if (!key || seen.has(key)) return;

            seen.add(key);
            unique.push(r);
        });

        return unique.slice(0, 12);
    },

    extractDateFromText(text) {
        const value = String(text || '');

        const datePatterns = [
            /(\d{1,2}\/\d{1,2}\/20\d{2})/,
            /(\d{1,2}\.\d{1,2}\.20\d{2})/,
            /(\d{1,2}-\d{1,2}-20\d{2})/
        ];

        for (const re of datePatterns) {
            const m = value.match(re);

            if (m) {
                const raw = m[1];
                const parts = raw.split(/[./-]/).map(Number);

                if (parts.length === 3) {
                    const [d, mo, y] = parts;
                    const ts = new Date(y, mo - 1, d).getTime();

                    return {
                        dateText: raw,
                        dateTs: Number.isFinite(ts) ? ts : null
                    };
                }
            }
        }

        return {
            dateText: '',
            dateTs: null
        };
    },

    formatMoney(value) {
        const n = Number(value || 0);

        if (!n) return '?';

        if (n >= 1000000) {
            const v = n / 1000000;
            return `€${v >= 10 ? v.toFixed(0) : v.toFixed(1)}m`;
        }

        if (n >= 1000) {
            return `€${Math.round(n / 1000)}k`;
        }

        return `€${n}`;
    }
};
// ============================================================
