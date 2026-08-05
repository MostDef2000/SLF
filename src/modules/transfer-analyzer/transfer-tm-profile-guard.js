// Transfer Analyzer: TM profile value guard
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfTmProfileGuardApplied) {
    TransferMarketAnalyzer.slfTmProfileGuardApplied = true;
    TransferMarketAnalyzer.snapshotCacheKey = 'slf_transfer_analysis_snapshot_cache_v2';

    const originalGetTmValueMarker = TransferMarketAnalyzer.getTmValueMarker;
    const originalGetValueTrendMarker = TransferMarketAnalyzer.getValueTrendMarker;

    function hasText(value) {
        return String(value || '').trim().length > 0;
    }

    function positivePlayerId(value) {
        const id = String(value || '').trim();
        return /^\d+$/.test(id) && Number(id) > 0 ? id : '';
    }

    function playerIdFromRelativeUrl(value) {
        const raw = String(value || '').trim();
        if (!/^\/player\.php\?/i.test(raw)) return '';
        if (!/(?:^|[?&])action=view(?:&|$)/i.test(raw)) return '';
        return positivePlayerId(raw.match(/(?:^|[?&])id=(\d+)(?:&|$)/i)?.[1] || '');
    }

    TransferMarketAnalyzer.buildPurchaseForecastPlayerUrl = function buildSafePurchaseForecastPlayerUrl(playerId, playerUrl) {
        const requestedId = positivePlayerId(playerId);
        const urlId = playerIdFromRelativeUrl(playerUrl);
        const id = requestedId || urlId;
        if (!id) return '';
        return `/player.php?action=view&id=${id}`;
    };

    TransferMarketAnalyzer.hasValidTmProfileForValue = function hasValidTmProfileForValue(profile) {
        if (!profile || typeof profile !== 'object') return false;
        if (!hasText(profile.tmUrl) && !hasText(profile.tmId)) return false;

        if (hasText(profile.currentClub)) return true;
        if (hasText(profile.playerAgent)) return true;
        if (hasText(profile.contractExpires)) return true;
        if (hasText(profile.dateOfBirth)) return true;
        if (profile.age != null) return true;
        if (Array.isArray(profile.transferHistory) && profile.transferHistory.length > 0) return true;
        if (Array.isArray(profile.youthClubs) && profile.youthClubs.length > 0) return true;
        if (profile.isRetired === true || profile.isFreeAgent === true) return true;

        return false;
    };

    TransferMarketAnalyzer.getTmValueMarker = function getTmValueMarkerWithProfileGuard(profileOrValue) {
        if (profileOrValue && typeof profileOrValue === 'object' && !this.hasValidTmProfileForValue(profileOrValue)) {
            return {
                label: 'TM €?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'TM profile is not confirmed, so TM value is hidden.'
            };
        }

        return originalGetTmValueMarker.apply(this, arguments);
    };

    TransferMarketAnalyzer.getValueTrendMarker = function getValueTrendMarkerWithProfileGuard(profile) {
        if (!this.hasValidTmProfileForValue(profile)) {
            return {
                label: 'trend ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'TM profile is not confirmed, so TM trend is hidden.'
            };
        }

        return originalGetValueTrendMarker.apply(this, arguments);
    };
}

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer && !TMEnrichmentLayer.slfStrictMarketValueApplied) {
    TMEnrichmentLayer.slfStrictMarketValueApplied = true;

    TMEnrichmentLayer.extractTmMarketValueText = function extractTmMarketValueTextStrict(doc) {
        const selectors = [
            '.data-header__market-value-wrapper',
            '.tm-player-market-value-development__current-value'
        ];

        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            const text = this.normalizeText(el && el.textContent || '');
            if (text && text.indexOf('€') >= 0) {
                return text;
            }
        }

        return '';
    };
}
