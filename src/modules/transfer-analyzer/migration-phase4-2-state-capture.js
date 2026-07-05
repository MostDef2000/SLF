// SLF Migration Phase 4.2 - STATE CAPTURE PATCH
// =====================================================
// Fixes missing persistence by enforcing guaranteed write-through
// EVEN WHEN analysis pipeline is partial or legacy-driven

(function () {
    const A = window.TransferMarketAnalyzer;
    const S = window.SLF?.PlayerStateStore;

    if (!A || !S) {
        console.warn('[SLF Phase4.2] missing dependencies');
        return;
    }

    function getId(row) {
        return String(row?.playerId || '').trim();
    }

    function safeState(id) {
        return S.get(id) || null;
    }

    function upsert(row, enriched, slfAlter) {
        const id = getId(row);
        if (!id) return;

        S.upsert(id, {
            tmProfile: enriched?.tmProfile || row.tmProfile || null,
            tmUrl: enriched?.tmUrl || row.tmUrl || '',
            tmValueEur: row.tmValueEur || 0,
            slfAlter: slfAlter || row.slfAlter || null,
            slfPrice: row.slfPrice ?? null,
            row: {
                slfPrice: row.slfPrice ?? null,
                tmValueEur: row.tmValueEur || 0
            },
            savedAt: Date.now()
        });
    }

    const originalRenderRowBadge = A.renderRowBadge;

    A.renderRowBadge = function (row, enriched, slfAlter) {
        const result = originalRenderRowBadge?.apply(this, arguments);

        try {
            upsert(row, enriched, slfAlter);
        } catch (e) {
            console.warn('[SLF Phase4.2] renderRowBadge persist failed', e);
        }

        return result;
    };

    const originalRenderCachedRows = A.renderCachedRows;

    A.renderCachedRows = function () {
        const rows = this.parseVisibleRows?.() || [];

        let backfilled = 0;

        for (const row of rows) {
            const id = getId(row);
            if (!id) continue;

            const state = safeState(id);

            if (!state) {
                upsert(row, row.tmProfile, row.slfAlter);
                backfilled++;
                continue;
            }

            if (!state.tmProfile || !state.slfAlter) {
                upsert(row, row.tmProfile, row.slfAlter);
                backfilled++;
            }
        }

        if (backfilled > 0) {
            this.setStatus?.(`Phase4.2 backfill: ${backfilled}`);
        }

        return originalRenderCachedRows?.apply(this, arguments);
    };

    const originalParseVisibleRows = A.parseVisibleRows;

    A.parseVisibleRows = function () {
        const rows = originalParseVisibleRows?.apply(this, arguments) || [];

        let repaired = 0;

        for (const row of rows) {
            const id = getId(row);
            if (!id) continue;

            const state = safeState(id);

            if (!state) {
                upsert(row, row.tmProfile, row.slfAlter);
                repaired++;
            }
        }

        if (repaired > 0) {
            console.log(`[SLF Phase4.2] repaired ${repaired} missing states`);
        }

        return rows;
    };

    console.log('[SLF Phase4.2] STATE CAPTURE ACTIVE');
})();