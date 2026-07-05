// Transfer Analyzer: compact MKT UI
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfCompactMktUiApplied) {
    TransferMarketAnalyzer.slfCompactMktUiApplied = true;

    TransferMarketAnalyzer.removeMktSortToolbarButtons = function removeMktSortToolbarButtons() {
        const bargainButton = document.getElementById('slf-transfer-sort-mkt-bargain');
        const overpricedButton = document.getElementById('slf-transfer-sort-mkt-overpriced');

        if (bargainButton && bargainButton.parentNode) {
            bargainButton.parentNode.removeChild(bargainButton);
        }

        if (overpricedButton && overpricedButton.parentNode) {
            overpricedButton.parentNode.removeChild(overpricedButton);
        }
    };

    TransferMarketAnalyzer.formatCompactMktRatio = function formatCompactMktRatio(ratio) {
        const value = Number(ratio || 0);
        if (!Number.isFinite(value) || value <= 0) return '';

        const raw = value >= 10 ? value.toFixed(1) : value.toFixed(2);
        return raw.replace(/0$/, '').replace(/\.0$/, '');
    };

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarCompactMktUi() {
        const result = addToolbarOriginal.apply(this, arguments);
        this.removeMktSortToolbarButtons();
        setTimeout(() => this.removeMktSortToolbarButtons(), 0);
        return result;
    };

    const getMarketSalePriceMarkerOriginal = TransferMarketAnalyzer.getMarketSalePriceMarker;
    TransferMarketAnalyzer.getMarketSalePriceMarker = function getCompactMarketSalePriceMarker() {
        const marker = getMarketSalePriceMarkerOriginal.apply(this, arguments);
        if (!marker || marker.category !== 'market') return marker;

        const ratio = Number(marker.marketDetails && marker.marketDetails.ratio || 0);
        const ratioText = this.formatCompactMktRatio(ratio);
        marker.label = ratioText ? `MKT x${ratioText}` : 'MKT ?';
        return marker;
    };
}
