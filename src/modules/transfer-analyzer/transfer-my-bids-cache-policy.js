// Transfer Analyzer: bid cache page policy
// ============================================================

if (typeof TransferMyBidsRank !== 'undefined' && TransferMyBidsRank) {
    const clearButtonId = 'slf-my-bids-rank-clear';
    const originalAddToolbarButtons = TransferMyBidsRank.addToolbarButtons;

    // A page reload starts a fresh bid-rank session. The short-lived cache still
    // prevents duplicate requests while the current page remains open.
    TransferMyBidsRank.clearCache();

    TransferMyBidsRank.addToolbarButtons = function addToolbarButtonsWithoutCacheReset() {
        originalAddToolbarButtons.call(this);
        document.getElementById(clearButtonId)?.remove();
    };

    // Covers the case where the original module mounted synchronously before
    // this policy module was evaluated.
    document.getElementById(clearButtonId)?.remove();
}

// ============================================================