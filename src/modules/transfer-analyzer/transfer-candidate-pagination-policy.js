// Transfer Candidate Scanner pagination policy
// ============================================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.paginationPolicyApplied) {
    TransferCandidateScanner.paginationPolicyApplied = true;

    TransferCandidateScanner.extractLastPaginationPage = function extractLastPaginationPage(doc) {
        const numbers = [];
        doc.querySelectorAll('a').forEach(anchor => {
            const text = this.text(anchor.textContent);
            const href = anchor.getAttribute('href') || '';
            const pageFromHref = href