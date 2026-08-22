// Transfer Table Sorter
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1TableSorterApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    sortByDataset(datasetKey, direction = 'desc', label = datasetKey) {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, datasetKey, direction);
        this.setStatus(`Сортировка ${label} ${direction === 'asc' ? '↑' : '↓'}`);
    },

    sortRowsInTableByDataset(table, datasetKey, direction = 'desc') {
        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfPlayerId);

        rows.sort((a, b) => {
            const avRaw = a.dataset[datasetKey];
            const bvRaw = b.dataset[datasetKey];

            const av = avRaw == null || avRaw === '' ? -999999999 : Number(avRaw);
            const bv = bvRaw == null || bvRaw === '' ? -999999999 : Number(bvRaw);

            if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
            if (Number.isNaN(av)) return 1;
            if (Number.isNaN(bv)) return -1;

            return direction === 'asc'
                ? av - bv
                : bv - av;
        });

        rows.forEach(tr => tbody.appendChild(tr));
    },

    sortByTmValue(direction = 'desc') {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, 'slfTmValue', direction);
        this.setStatus(direction === 'asc' ? 'Сортировка TM € ↑' : 'Сортировка TM € ↓');
    },

    resetOrder() {
        const table = this.findTransferTable();
        if (!table) return;

        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfOriginalIndex);

        rows.sort((a, b) => {
            return Number(a.dataset.slfOriginalIndex) - Number(b.dataset.slfOriginalIndex);
        });

        rows.forEach(tr => tbody.appendChild(tr));

        this.setStatus('Порядок строк восстановлен.');
    },

    });
}
