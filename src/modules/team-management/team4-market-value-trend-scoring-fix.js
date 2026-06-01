// Team Management: Team4 market-value trend scoring fix
// Stable cache keys: this patch does not introduce storage/schema versions.

const SLFTeam4MarketValueTrendFix = (() => {
    const PATCH_FLAG = '__slfTeam4MarketValueTrendFixPatched';

    function norm(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function parseMoney(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const raw = norm(value);
        if (!raw) return 0;
        const match = raw.replace(/'/g, '').replace(/,/g, '.').match(/([0-9]+(?:\.[0-9]+)?)/);
        if (!match) return 0;
        let amount = Number(match[1] || 0);
        if (!Number.isFinite(amount)) return 0;
        if (/\bM\b|mio\.?|млн/i.test(raw)) amount *= 1000000;
        else if (/\bk\b|тыс/i.test(raw)) amount *= 1000;
        return amount;
    }

    function normalizeDirection(value) {
        const raw = norm(value).toLowerCase();
        if (!raw) return 'unknown';
        if (/^(up|rise|rising|increase|increasing|growth|grow|positive|plus|\+|вверх|растет|растёт|рост|вырос)/i.test(raw)) return 'up';
        if (/^(down|fall|falling|decrease|decreasing|drop|negative|minus|-|вниз|падает|спад|упал|снижение)/i.test(raw)) return 'down';
        if (/^(flat|stable|unchanged|same|neutral|ровно|стабил|без изменений)/i.test(raw)) return 'flat';
        return 'unknown';
    }

    function directionFromDelta(value) {
        const delta = Number(value);
        if (!Number.isFinite(delta) || delta === 0) return 'unknown';
        return delta > 0 ? 'up' : 'down';
    }

    function extractValue(point) {
        if (point == null) return 0;
        if (typeof point === 'number' || typeof point === 'string') return parseMoney(point);
        return parseMoney(
            point.value ??
            point.marketValueEur ??
            point.marketValue ??
            point.y ??
            point.amount ??
            point.moneyText ??
            point.valueText ??
            point.label ??
            0
        );
    }

    function flattenHistory(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (Array.isArray(value.points)) return value.points;
        if (Array.isArray(value.data)) return value.data;
        if (Array.isArray(value.history)) return value.history;
        if (Array.isArray(value.values)) return value.values;
        return [];
    }

    function directionFromHistory(history) {
        const points = flattenHistory(history)
            .map(extractValue)
            .filter(value => Number.isFinite(value) && value > 0);
        if (points.length < 2) return 'unknown';
        const previous = points[points.length - 2];
        const current = points[points.length - 1];
        if (current > previous) return 'up';
        if (current < previous) return 'down';
        return 'flat';
    }

    function getMarketValueDirection(profile) {
        if (!profile) return 'unknown';

        const direct = [
            profile.marketValueTrendDirection,
            profile.valueTrendDirection,
            profile.trendDirection,
            profile.marketValueTrend,
            profile.valueTrend
        ].map(normalizeDirection).find(direction => direction !== 'unknown');
        if (direct) return direct;

        const delta = [
            profile.marketValueTrendDeltaEur,
            profile.valueTrendDeltaEur,
            profile.marketValueDeltaEur,
            profile.marketValueTrendDeltaPct,
            profile.valueTrendDeltaPct,
            profile.marketValueDeltaPct
        ].map(directionFromDelta).find(direction => direction !== 'unknown');
        if (delta) return delta;

        return [
            profile.marketValueHistory,
            profile.marketValueDevelopment,
            profile.marketValuePoints,
            profile.marketValueChart,
            profile.valueHistory,
            profile.valueDevelopment
        ].map(directionFromHistory).find(direction => direction !== 'unknown') || 'unknown';
    }

    function directionLabel(direction) {
        if (direction === 'up') return 'растет';
        if (direction === 'down') return 'падает';
        if (direction === 'flat') return 'стабилен';
        return '';
    }

    function applyDirection(original, direction) {
        const trend = { ...(original || {}) };
        const ratio = Number(trend.ratio || 0);
        const pct = trend.pct != null ? trend.pct : (ratio ? Math.round(ratio * 100) : null);
        trend.direction = direction;
        trend.directionLabel = directionLabel(direction);

        if (direction === 'unknown') return trend;

        if (direction === 'up') {
            if (ratio >= 0.70) {
                return {
                    ...trend,
                    key: 'recovery',
                    label: `восстановление ${pct}%`,
                    className: 'good',
                    text: 'TM-цена ниже исторического пика, но текущий тренд растет.'
                };
            }
            if (ratio >= 0.20) {
                return {
                    ...trend,
                    key: 'recoveringRisk',
                    label: `восстановление ${pct}%`,
                    className: 'warn',
                    text: 'TM-цена восстанавливается, но всё ещё заметно ниже пика.'
                };
            }
            return {
                ...trend,
                key: 'earlyRecovery',
                label: pct != null ? `раннее восстановление ${pct}%` : 'раннее восстановление',
                className: 'warn',
                text: 'Есть признак роста цены, но уровень всё ещё сильно ниже пика.'
            };
        }

        if (direction === 'down') {
            if (ratio >= 0.70) {
                return {
                    ...trend,
                    key: 'fallingFromPeak',
                    label: `падение ${pct}%`,
                    className: 'warn',
                    text: 'TM-цена близка к пику, но текущий тренд падает.'
                };
            }
            if (ratio >= 0.40) {
                return {
                    ...trend,
                    key: 'decliningBelowPeak',
                    label: `падение ${pct}%`,
                    className: 'warn',
                    text: 'TM-цена ниже пика и текущий тренд падает.'
                };
            }
            return {
                ...trend,
                key: 'decliningFall',
                label: pct != null ? `спад ${pct}%` : 'спад',
                className: 'bad',
                text: 'TM-цена заметно ниже пика и продолжает снижаться.'
            };
        }

        if (direction === 'flat') {
            return {
                ...trend,
                label: trend.label ? `${trend.label} · стабильно` : 'TM стабильно',
                text: `${trend.text || 'TM-цена без выраженного направления.'} Текущий тренд стабилен.`
            };
        }

        return trend;
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        panel.getMarketValueDirection = getMarketValueDirection;

        const originalGetTrendInfo = panel.getTrendInfo;
        if (typeof originalGetTrendInfo === 'function') {
            panel.getTrendInfo = function patchedGetTrendInfo(profile, rowValueEur) {
                const original = originalGetTrendInfo.call(this, profile, rowValueEur);
                const direction = getMarketValueDirection(profile);
                return applyDirection(original, direction);
            };
        }

        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    record.trendInfo = panel.getTrendInfo(record.tmProfile, record.tmValueRowEur);
                    record.status = panel.classifyStatus?.(record) || record.status;
                    record.reasons = record.status?.reasons || record.reasons || [];
                    if (record.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
                panel.saveToLocalStorage?.();
                panel.render?.(false);
            }
        } catch (error) {
            console.warn('[SLF Team4 TM Trend] hydrate failed', error);
        }
        return true;
    }

    function start() {
        const run = () => {
            try {
                if (patchPanel()) return;
                const timer = setInterval(() => {
                    if (patchPanel()) clearInterval(timer);
                }, 250);
                setTimeout(() => clearInterval(timer), 10000);
            } catch (error) {
                console.error('[SLF Team4 TM Trend] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { getMarketValueDirection, applyDirection, start };
    window.SLFTeam4MarketValueTrendFix = api;
    return api;
})();

SLFTeam4MarketValueTrendFix.start();
