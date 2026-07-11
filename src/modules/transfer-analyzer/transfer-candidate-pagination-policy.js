// Transfer Candidate Scanner pagination policy
// ============================================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.paginationPolicyApplied) {
    TransferCandidateScanner.paginationPolicyApplied = true;

    TransferCandidateScanner.extractLastPaginationPage = function extractLastPaginationPage(doc) {
        const numbers = [];
        doc.querySelectorAll('a').forEach(anchor => {
            const text = this.text(anchor.textContent);
            const href = anchor.getAttribute('href') || '';
            const hrefMatch = href.match(/[?&]page=(\d+)/);
            const textMatch = text.match(/^\d+$/);
            const value = hrefMatch ? Number(hrefMatch[1]) : (textMatch ? Number(text) : null);
            if (Number.isFinite(value)) numbers.push(value);
        });
        return numbers.length ? Math.max(...numbers) : 0;
    };

    TransferCandidateScanner.detectTotalPagesOriginal = TransferCandidateScanner.detectTotalPages;

    TransferCandidateScanner.detectTotalPages = function detectTotalPagesWithPaginationPolicy(doc, pageRows) {
        const fromPagination = this.extractLastPaginationPage(doc);
        const fallback = this.detectTotalPagesOriginal(doc, pageRows);
        const total = fromPagination > 0 ? fromPagination + 1 : fallback;
        const totalPlayers = this.extractTotalPlayers(doc);

        this.state.totalPlayers = totalPlayers || this.state.totalPlayers || 0;
        this.state.pageSize = pageRows.length || this.state.pageSize || 0;

        return Math.max(total, 1);
    };

    TransferCandidateScanner.scanAllPagesOriginal = TransferCandidateScanner.scanAllPages;

    TransferCandidateScanner.scanAllPages = async function scanAllPagesWithPaginationGuard(resume) {
        await this.scanAllPagesOriginal(resume);
    };
}
