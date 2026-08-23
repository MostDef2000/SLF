// Tm Enrichment Profile
// Extracted verbatim from tm-enrichment-layer.js (stage 3 refactor).
// Assigned onto the TMEnrichmentLayer facade; behaviour unchanged.

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
    TMEnrichmentLayer.stage3TmEnrichmentProfileApplied = true;

    Object.assign(TMEnrichmentLayer, {
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

    });
}
