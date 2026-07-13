// Transfer Candidate Scanner four-ranking policy
// ===============================================

if (typeof TransferCandidateScanner !== 'undefined' && TransferCandidateScanner && !TransferCandidateScanner.fourRankingPolicyApplied) {
    TransferCandidateScanner.fourRankingPolicyApplied = true;

    const previousStorageKey = TransferCandidateScanner.storageKey;
    TransferCandidateScanner.storageKey = 'slf_transfer_candidate_scanner_v8_meta';
    TransferCandidateScanner.schema = 'slf_transfer_candidate_scanner_v8_meta';
    TransferCandidateScanner.legacyStorageKeys = [...new Set([
        ...(TransferCandidateScanner.legacyStorageKeys || []),
        previousStorageKey,
        'slf_transfer_candidate_scanner_v7_meta'
    ])];
    Transfer