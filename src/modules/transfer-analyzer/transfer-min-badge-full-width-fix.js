// Transfer Analyzer: full-width MIN/activity badge fix
// ============================================================
// Prevents compact transfer activity chips from clipping values like
// `MIN 28% L3/183` into `MIN 28% L3/1...`.

(function transferMinBadgeFullWidthFix() {
    'use strict';

    if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;
    if (TransferMarketAnalyzer.slfMinBadgeFullWidthFixApplied) return;
    if (typeof TransferMarketAnalyzer.renderCompactChip !== 'function') return;

    TransferMarketAnalyzer.slfMinBadgeFullWidthFixApplied = true;

    const originalRenderCompactChip = TransferMarketAnalyzer.renderCompactChip;

    TransferMarketAnalyzer.renderCompactChip = function renderCompactChipWithFullActivityBadge(marker) {
        const category = this.markerCategory?.(marker);
        const label = String(marker?.label || '');
        const isActivityBadge = category === 'activity' || /^MIN\s/i.test(label);

        if (!isActivityBadge) {
            return originalRenderCompactChip.apply(this, arguments);
        }

        const structuredTooltip = this.buildStructuredMarkerTooltipHtml?.(marker) || this.escapeHtml?.(marker?.text || label) || '';

        this.ensureHtmlTooltipStyles?.();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip slf-transfer-activity-full-badge" data-slf-tip-category="${this.escapeHtml(category || 'activity')}" tabindex="0" style="
                box-sizing:border-box;
                margin:0;
                padding:1px 6px;
                border:1px solid ${this.borderByLevel(marker.level)};
                border-radius:4px;
                color:${this.colorByLevel(marker.level)};
                background:${this.bgByLevel(marker.level)};
                vertical-align:middle;
                line-height:17px;
                min-height:18px;
                font-size:10px;
                font-weight:700;
                text-align:center;
                display:inline-flex;
                flex:0 0 auto;
                width:auto;
                min-width:max-content;
                max-width:none;
                white-space:nowrap;
                overflow:visible;
                text-overflow:clip;
                cursor:help;
            ">
                <span style="display:inline-block;min-width:max-content;max-width:none;white-space:nowrap;overflow:visible;text-overflow:clip;">${this.escapeHtml(label)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
            </span>
        `;
    };
})();
