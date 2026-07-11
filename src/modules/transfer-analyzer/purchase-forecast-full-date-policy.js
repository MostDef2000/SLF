// Purchase Forecast: full date column policy
// ==========================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.renderPurchaseForecastRows = function renderPurchaseForecastRows(records) {
        const box = document.getElementById('slf-purchase-forecast-list');
        if (!box) return;

        const rows = (records || []).slice(0, 80);
        if (!rows.length) {
            box.innerHTML = '<div style="color:#888;padding:6px 0;">Нет трансферов в текущей выборке.</div>';
            return;
        }

        const columns = '68px minmax(0,1fr) 22px 22px 30px 66px';

        box.innerHTML = `
            <div style="display:grid;grid-template-columns:${columns};gap:4px;color:#888;font-size:10px;border-bottom:1px solid #333;padding:4px 0;">
                <span>дата</span><span>игрок</span><span>в</span><span>т</span><span>ск</span><span>цена</span>
            </div>
            ${rows.map(record => {
                const title = this.escapeForecastHtml([record.fromClub, record.toClub].filter(Boolean).join(' → '));
                const name = this.escapeForecastHtml(record.playerName || record.playerId || 'Игрок');
                const url = this.escapeForecastHtml(record.playerUrl || '#');

                return `
                    <div title="${title}" style="display:grid;grid-template-columns:${columns};gap:4px;align-items:center;border-bottom:1px solid #282828;padding:4px 0;">
                        <span style="color:#aaa;white-space:nowrap;overflow:visible;text-overflow:clip;">${this.escapeForecastHtml(record.dateText || '')}</span>
                        <a href="${url}" style="min-width:0;color:#d8e9ff;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</a>
                        <span>${record.age ?? '—'}</span>
                        <span>${record.talent ?? '—'}</span>
                        <span>${record.skill ?? '—'}</span>
                        <span style="color:#fff;white-space:nowrap;">${this.formatPurchaseForecastPrice(record.price)}</span>
                    </div>
                `;
            }).join('')}
            ${(records || []).length > rows.length ? `<div style="color:#888;padding-top:5px;">Показано ${rows.length} из ${(records || []).length}.</div>` : ''}
        `;
    };
}
