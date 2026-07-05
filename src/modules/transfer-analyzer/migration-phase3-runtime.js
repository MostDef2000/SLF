// SLF Migration Phase 3 Runtime Override
// =======================================
// Goal: force state-first behavior without rewriting legacy analyzer core
// SAFE MIGRATION: non-destructive monkey-patch layer

(function () {
    const A = window.TransferMarketAnalyzer;
    const S = window.SLF?.PlayerStateStore;

    if (!A) {
        console.warn('[SLF Phase3] Analyzer not found');
        return;
    }

    function getId(row) {
        return String(row?.playerId || '').trim();
    }

    function getState(id) {
        try {
            return S?.get?.(id) || null;
        } catch {
            return null;
        }
    }

    // -----------------------------------------------------
    // 1. DIAGNOSTICS WRAPPER
    // -----------------------------------------------------
    const diag = {
        restored: 0,
        partial: 0,
        missing: 0
    };

    A.__slfPhase3Diagnostics = diag;

    // -----------------------------------------------------
    // 2. OVERRIDE renderCachedRows (STATE FIRST)
    // -----------------------------------------------------
    const originalRenderCachedRows = A.renderCachedRows;

    A.renderCachedRows = function () {
        const rows = this.parseVisibleRows?.() || [];

        for (const row of rows) {
            const id = getId(row);
            if (!id) continue;

            const state = getState(id);
            if (!state) {
                diag.missing++;
                continue;
            }

            // classify completeness
            const hasTM = !!state.tmProfile;
            const hasAlter = !!state.slfAlter;

            if (hasTM && hasAlter) diag.restored++;
            else diag.partial++;

            // hydrate row fully
            row.tmProfile = state.tmProfile || row.tmProfile || null;
            row.tmUrl = state.tmUrl || row.tmUrl || '';
            row.tmValueEur = state.tmValueEur || row.tmValueEur || 0;
            row.slfAlter = state.slfAlter || row.slfAlter || null;
            row.slfPrice = state.slfPrice ?? row.slfPrice ?? null;

            this.renderRowBadge?.(row, row.tmProfile, row.slfAlter);
        }

        if (diag.restored || diag.partial) {
            this.setStatus?.(`Phase3: R:${diag.restored} P:${diag.partial} M:${diag.missing}`);
        }

        return originalRenderCachedRows?.apply(this, arguments);
    };

    // -----------------------------------------------------
    // 3. OVERRIDE getCachedAnalysis (STATE ONLY, IGNORE LEGACY CACHE)
    // -----------------------------------------------------
    const originalGetCachedAnalysis = A.getCachedAnalysis;

    A.getCachedAnalysis = function (row) {
        const id = getId(row);
        const state = getState(id);

        if (!state) return null;

        // enforce TTL = 7 days (override legacy 14d)
        const savedAt = state.savedAt || 0;
        const ttl = 1000 * 60 * 60 * 24 * 7;

        if (!savedAt || Date.now() - savedAt > ttl) {
            return null;
        }

        if (!state.slfAlter?.finalSkill) {
            return null;
        }

        return {
            tmResult: { tmProfile: state.tmProfile, tmUrl: state.tmUrl },
            slfAlter: state.slfAlter,
            row: state.row || {}
        };
    };

    // -----------------------------------------------------
    // 4. SAFETY: fallback logging for missing renderRowBadge
    // -----------------------------------------------------
    if (!A.renderRowBadge) {
        console.warn('[SLF Phase3] renderRowBadge missing');
    }

    console.log('[SLF Phase3] active');
})();
