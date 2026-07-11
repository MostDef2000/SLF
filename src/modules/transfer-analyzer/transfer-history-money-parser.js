// Transfer history money parser
// =============================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.slfHistoryMoneyParserApplied = true;

    TransferMarketAnalyzer.parseMoney = function parseMoney(value) {
        const raw = String(value || '')
            .replace(/\u00a0/g, ' ')
            .trim();

        if (!raw) return null;

        const lower = raw.toLowerCase();
        const numberMatches = lower.match(/\d{1,3}(?:[\s'’`]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g);

        if (!numberMatches || !numberMatches.length) return null;

        const token = numberMatches
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .sort((a, b) => {
                const score = value => value.replace(/[^\d]/g, '').length;
                return score(b) - score(a) || b.length - a.length;
            })[0];

        if (!token) return null;

        let normalized = token
            .replace(/[\s'’`]/g, '')
            .replace(/,/g, '.');

        const dotCount = (normalized.match(/\./g) || []).length;
        if (dotCount > 1) {
            const parts = normalized.split('.');
            normalized = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
        }

        const numeric = Number(normalized);
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
    };
}
