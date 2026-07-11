// Transfer Candidate Scanner: compact SLF/TM money parser
// ============================================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner) {
    TransferCandidateScanner.money = function parseCandidateMoney(value) {
        const text = this.text(value).replace(',', '.');
        const match = text.match(/(\d+(?:\.\d+)?)/);
        if (!match) return null;

        const amount = Number(match[1]);
        if (!Number.isFinite(amount)) return null;

        if (/млрд|billion|[0-9]\s*[bб](?:\s|$)/i.test(text)) return Math.round(amount * 1000000000);
        if (/млн|million|[0-9]\s*[mм](?:\s|$)/i.test(text)) return Math.round(amount * 1000000);
        if (/тыс|thousand|[0-9]\s*[kк](?:\s|$)/i.test(text)) return Math.round(amount * 1000);

        return amount;
    };
}

// ============================================================
