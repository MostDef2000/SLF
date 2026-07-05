// SLF Player State Integration (MIGRATION PHASE 2)
// =====================================================
// Bridges legacy analyzer cache -> unified PlayerStateStore

(function () {
    const A = window.TransferMarketAnalyzer;
    const S = window.SLF?.PlayerStateStore;

    if (!A || !S) {
        console.warn('[SLF State Integration] missing dependencies');
        return;
    }

    function getId(row) {
        return String(row?.playerId || '').trim();
    }

    function hydrateFromState(row) {
        const id = getId(row);
        if (!id) return false;

        const state = S.get(id);
        if (!state) return false;

        row.tmProfile = state.tmProfile || row.tmProfile || null;
        row.tmUrl = state.tmUrl || row.tmUrl || '';
        row.tmValueEur = state.tmValueEur || row.tmValueEur || 0;
        row.slfAlter = state.slfAlter || row.slfAlter || null;
        row.slfPrice = state.slfPrice ?? row.slfPrice ?? null;

        return true;
    }

    const originalRenderCachedRows = A.renderCachedRows;

    A.renderCachedRows = function () {
        const rows = this.parseVisibleRows?.() || [];

        let stateHits = 0;

        for (const row of rows) {
            if (hydrateFromState(row)) {
                stateHits++;
                this.renderRowBadge?.(row, row.tmProfile, row.slfAlter);
                continue;
            }
        }

        if (stateHits > 0) {
            this.setStatus?.(`State restore: ${stateHits}`);
        }

        if (originalRenderCachedRows) {
            return originalRenderCachedRows.apply(this, arguments);
        }
    };

    const originalRenderRowBadge = A.renderRowBadge;

    A.renderRowBadge = function (row, enriched, slfAlter) {
        const result = originalRenderRowBadge?.apply(this, arguments);

        const id = getId(row);
        if (!id) return result;

        try {
            S.upsert(id, {
                tmProfile: enriched?.tmProfile || row.tmProfile || null,
                tmUrl: enriched?.tmUrl || row.tmUrl || '',
                tmValueEur: row.tmValueEur || 0,
                slfAlter: slfAlter || row.slfAlter || null,
                slfPrice: row.slfPrice || null
            });
        } catch (e) {
            console.warn('[SLF State Integration] write failed', e);
        }

        return result;
    };

    console.log('[SLF State Integration] phase 2 active');
})();
