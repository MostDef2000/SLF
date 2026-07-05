// SLF SINGLE SOURCE PRODUCTION MODE (PHASE 4 FINAL)
// =====================================================
// Hard override: PlayerStateStore is the ONLY source of truth

(function () {
    const A = window.TransferMarketAnalyzer;
    const S = window.SLF?.PlayerStateStore;

    if (!A || !S) {
        console.warn('[SLF SSPM] missing dependencies');
        return;
    }

    window.SLF_SS_MODE = true;

    function getId(row) {
        return String(row?.playerId || '').trim();
    }

    function getState(id) {
        if (!id) return null;
        return S.get(id);
    }

    // --------------------------------------------------
    // 1. HARD OVERRIDE: renderCachedRows
    // --------------------------------------------------
    A.renderCachedRows = function () {
        const rows = this.parseVisibleRows?.() || [];

        let rendered = 0;
        let missing = 0;

        for (const row of rows) {
            const id = getId(row);
            const state = getState(id);

            if (!state) {
                missing++;
                continue;
            }

            row.tmProfile = state.tmProfile || null;
            row.tmUrl = state.tmUrl || '';
            row.tmValueEur = state.tmValueEur || 0;
            row.slfAlter = state.slfAlter || null;
            row.slfPrice = state.slfPrice ?? null;

            this.renderRowBadge?.(row, row.tmProfile, row.slfAlter);
            rendered++;
        }

        this.setStatus?.(`SSPM: rendered ${rendered}, missing ${missing}`);
    };

    // --------------------------------------------------
    // 2. HARD OVERRIDE: getCachedAnalysis (STATE ONLY)
    // --------------------------------------------------
    A.getCachedAnalysis = function (row) {
        const id = getId(row);
        const state = getState(id);

        if (!state) return null;

        return {
            tmResult: {
                tmProfile: state.tmProfile,
                tmUrl: state.tmUrl
            },
            slfAlter: state.slfAlter,
            row: state.row || {}
        };
    };

    // --------------------------------------------------
    // 3. DISABLE LEGACY SNAPSHOT RESTORE
    // --------------------------------------------------
    if (A.restoreAnalysisSnapshot) {
        A.restoreAnalysisSnapshot = function () {
            return false;
        };
    }

    // --------------------------------------------------
    // 4. DISABLE ANALYSIS CACHE FALLBACK
    // --------------------------------------------------
    if (A.findAnalysisCacheByPlayerId) {
        A.findAnalysisCacheByPlayerId = function () {
            return null;
        };
    }

    if (A.hasDirectRowAnalysisCache) {
        A.hasDirectRowAnalysisCache = function () {
            return false;
        };
    }

    console.log('[SLF SSPM] SINGLE SOURCE MODE ACTIVE');
})();
