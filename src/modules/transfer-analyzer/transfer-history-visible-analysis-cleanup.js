// Transfer history visible-analysis cleanup
// =========================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    const addToolbarWithHistoryControls = TransferMarketAnalyzer.addToolbar;

    TransferMarketAnalyzer.addToolbar = function addToolbarWithoutHistoryVisibleAnalysis() {
        const result = addToolbarWithHistoryControls.apply(this, arguments);

        if (this.isHistoryPage()) {
            document.getElementById('slf-transfer-analyze-visible')?.remove();
        }

        return result;
    };

    delete TransferMarketAnalyzer.analyzeHistoryVisibleRows;
}
