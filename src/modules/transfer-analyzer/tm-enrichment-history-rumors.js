// Tm Enrichment History Rumors
// Extracted verbatim from tm-enrichment-layer.js (stage 3 refactor).
// Assigned onto the TMEnrichmentLayer facade; behaviour unchanged.

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
    TMEnrichmentLayer.stage3TmEnrichmentHistoryRumorsApplied = true;

    Object.assign(TMEnrichmentLayer, {
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

            debugLog('[SLF TM] history fetch', {
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
                return (/\/verein\/\d+|verein_id=\d+/i).test(href);
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

    });
}
