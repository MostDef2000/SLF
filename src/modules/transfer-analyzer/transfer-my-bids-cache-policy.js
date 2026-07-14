// Transfer Analyzer: bid cache page policy
// ============================================================

if (typeof TransferMyBidsRank !== 'undefined' && TransferMyBidsRank) {
    const clearButtonId = 'slf-my-bids-rank-clear';
    const originalAddToolbarButtons = TransferMyBidsRank.addToolbarButtons;

    // Keep the last-known bid-rank cache across page reloads. The main module
    // owns TTL, bounded storage, explicit force refresh and manual clearing.
    TransferMyBidsRank.addToolbarButtons = function addToolbarButtonsWithoutClearButton() {
        originalAddToolbarButtons.call(this);
        document.getElementById(clearButtonId)?.remove();
    };

    // Covers the case where the original module mounted synchronously before
    // this policy module was evaluated.
    document.getElementById(clearButtonId)?.remove();
}

// ============================================================
