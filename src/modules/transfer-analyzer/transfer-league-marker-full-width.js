// Transfer Analyzer: full-width league markers
// ============================================================

(function () {
    if (document.getElementById('slf-transfer-league-marker-full-width-style')) return;

    const style = document.createElement('style');
    style.id = 'slf-transfer-league-marker-full-width-style';
    style.textContent = `
        .slf-transfer-analysis-chip[data-slf-tip-category="league"],
        .slf-transfer-analysis-chip[data-slf-tip-category="activity"],
        .slf-transfer-analysis-chip[data-slf-tip-category="talent"] {
            flex: 0 0 auto !important;
            width: auto !important;
            min-width: max-content !important;
            max-width: none !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-overflow: clip !important;
        }

        .slf-transfer-analysis-chip[data-slf-tip-category="league"] > span:first-child,
        .slf-transfer-analysis-chip[data-slf-tip-category="activity"] > span:first-child,
        .slf-transfer-analysis-chip[data-slf-tip-category="talent"] > span:first-child {
            min-width: max-content !important;
            max-width: none !important;
            white-space: nowrap !important;
            overflow: visible !important;
            text-overflow: clip !important;
        }
    `;

    document.head.appendChild(style);
}());
