// Tm Enrichment Url Text Utils
// Extracted verbatim from tm-enrichment-layer.js (stage 3 refactor).
// Assigned onto the TMEnrichmentLayer facade; behaviour unchanged.

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
    TMEnrichmentLayer.stage3TmEnrichmentUrlTextUtilsApplied = true;

    Object.assign(TMEnrichmentLayer, {
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
    });
}
