// Team Management: strict Team4 alter-minutes linking guard
// Must be bundled after team4-alter-current-season-minutes-fix.js.
// Prevents one cached alter.php minutes record from leaking into every Team4 tooltip.

const Team4AlterMinutesStrictLinkHotfix = (() => {
    const STORAGE_KEY = 'slf_team4_real_minutes_cache_v1';
    const PATCH_FLAG = '__slfAlterMinutesStrictLinkPatched';

    function norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function readCache() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function cacheEntries() {
        return Object.entries(readCache())
            .map(([id, entry]) => {
                const minutes = Number(entry?.currentSeasonMinutes || entry?.seasonMinutes || 0);
                return minutes > 0 ? { id: String(id), ...entry, currentSeasonMinutes: minutes } : null;
            })
            .filter(Boolean);
    }

    function addId(ids, value) {
        const id = String(value || '').trim();
        if (/^\d{3,}$/.test(id)) ids.add(id);
    }

    function collectIdsFromText(ids, text) {
        const raw = String(text || '');
        const patterns = [
            /[?&](?:id|player_id|playerId|pid|plid)=(\d{3,})/ig,
            /\bpltr-(\d{3,})\b/ig,
            /\b(?:alter|player|footballer|pid|playerId)[^\d]{0,16}(\d{3,})\b/ig
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(raw))) addId(ids, match[1]);
        });
    }

    function rowLinks(row) {
        if (!row?.querySelectorAll) return [];
        return [...row.querySelectorAll('a[href], [data-href], [onclick], [data-player-id], [data-id], [data-pid]')]
            .flatMap(el => [
                el.getAttribute?.('href'),
                el.getAttribute?.('data-href'),
                el.getAttribute?.('onclick'),
                el.getAttribute?.('data-player-id'),
                el.getAttribute?.('data-id'),
                el.getAttribute?.('data-pid')
            ])
            .filter(Boolean);
    }

    function trustedIds(data, row) {
        const ids = new Set();

        // Do not trust data.alterId here: the previous bridge could inject 5024317 into unrelated rows.
        [
            data?.slfPlayerId,
            data?.playerId,
            data?.id,
            String(row?.id || '').replace(/^pltr-/, '')
        ].forEach(value => addId(ids, value));

        [
            data?.playerUrl,
            data?.profileUrl,
            ...(rowLinks(row) || [])
        ].forEach(value => collectIdsFromText(ids, value));

        if (row?.dataset) Object.values(row.dataset).forEach(value => collectIdsFromText(ids, value));
        collectIdsFromText(ids, row?.id || '');

        return [...ids];
    }

    function getDataMinutes(data) {
        const candidates = [
            data?.currentSeasonMinutes,
            data?.realCareerMinutes?.currentSeasonMinutes,
            data?.tmProfile?.currentSeasonMinutes,
            data?.tmProfile?.activity?.currentSeasonMinutes,
            data?.tmProfile?.activity?.seasonMinutes
        ];

        for (const value of candidates) {
            const minutes = Number(value || 0);
            if (Number.isFinite(minutes) && minutes > 0) return minutes;
        }

        return 0;
    }

    function strictEntryFor(data, row) {
        const ids = trustedIds(data, row);
        const entries = cacheEntries();

        for (const entry of entries) {
            const entryIds = [entry.id, entry.alterId, entry.playerId].map(String).filter(Boolean);
            if (entryIds.some(id => ids.includes(id))) return { entry, ids };
        }

        return { entry: null, ids };
    }

    function removeFalseMinutes(data) {
        if (!data) return data;

        const badMinutes = getDataMinutes(data);
        delete data.currentSeasonMinutes;

        if (data.realCareerMinutes) {
            delete data.realCareerMinutes.currentSeasonMinutes;
            delete data.realCareerMinutes.seasonMinutes;
        }

        if (data.tmProfile) {
            delete data.tmProfile.currentSeasonMinutes;
            delete data.tmProfile.seasonMinutes;
            if (data.tmProfile.activity) {
                delete data.tmProfile.activity.currentSeasonMinutes;
                delete data.tmProfile.activity.seasonMinutes;
            }
        }

        if (Array.isArray(data.markers)) {
            data.markers = data.markers.filter(marker => {
                const label = norm(marker?.label || '');
                const text = norm(marker?.text || '');
                if (!/^MIN\s+\d+$/i.test(label)) return true;
                if (/Минуты текущего сезона/i.test(text)) return false;
                return !badMinutes || !label.includes(String(badMinutes));
            });
        }

        if (data.alterId && data.slfPlayerId && String(data.alterId) !== String(data.slfPlayerId)) {
            delete data.alterId;
        }

        return data;
    }

    function applyStrictMinutes(data, row) {
        if (!data) return data;

        const { entry, ids } = strictEntryFor(data, row);
        if (!entry) {
            if (getDataMinutes(data)) {
                console.warn('[SLF Team4 MIN] removed non-matching alter minutes from Team4 player', {
                    name: data.name || '',
                    slfPlayerId: data.slfPlayerId || '',
                    trustedIds: ids,
                    removedMinutes: getDataMinutes(data),
                    cacheIds: cacheEntries().map(item => item.alterId || item.playerId || item.id)
                });
            }
            return removeFalseMinutes(data);
        }

        const minutes = Number(entry.currentSeasonMinutes || 0);
        data.alterId = entry.alterId || entry.playerId || entry.id || '';
        data.currentSeasonMinutes = minutes;
        data.realCareerMinutes = {
            ...(data.realCareerMinutes || {}),
            currentSeasonMinutes: minutes,
            seasonLabel: entry.seasonLabel || '',
            source: entry.source || 'alter.php',
            updatedAt: entry.updatedAt || ''
        };

        if (data.tmProfile) {
            data.tmProfile.currentSeasonMinutes = minutes;
            data.tmProfile.activity = {
                ...(data.tmProfile.activity || {}),
                currentSeasonMinutes: minutes,
                seasonMinutes: minutes,
                seasonLabel: entry.seasonLabel || data.tmProfile.activity?.seasonLabel || ''
            };
        }

        console.log('[SLF Team4 MIN] strict alter minutes match', {
            name: data.name || '',
            slfPlayerId: data.slfPlayerId || '',
            trustedIds: ids,
            alterId: data.alterId,
            currentSeasonMinutes: minutes
        });

        return data;
    }

    function sanitizeTooltipHtml(html, data, row) {
        const { entry } = strictEntryFor(data, row);
        const minutes = Number(entry?.currentSeasonMinutes || 0);

        if (minutes > 0) {
            const minRow = `<div class="row"><b>MIN:</b> ${minutes} мин</div>`;
            return String(html || '').replace(/<div class="row"><b>MIN:<\/b>[\s\S]*?<\/div>/, minRow);
        }

        return String(html || '')
            .replace(/<div class="row"><b>MIN:<\/b>\s*\d+\s*мин<\/div>/g, '<div class="row"><b>MIN:</b> ?</div>')
            .replace(/<span class="slf-status-badge [^"]*">MIN\s+\d+<\/span><div class="muted">Минуты текущего сезона:\s*\d+\.<\/div>/g, '<span class="slf-status-badge neutral">MIN ?</span><div class="muted">Минуты текущего сезона не найдены.</div>')
            .replace(/\s*·\s*MIN\s+\d+/g, '');
    }

    function sanitizeStatusHtml(html, data, row) {
        const { entry } = strictEntryFor(data, row);
        if (entry) return html;
        return String(html || '').replace(/\s*·\s*MIN\s+\d+/g, '');
    }

    function hydrate(panel) {
        let changed = false;

        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    const before = getDataMinutes(record);
                    applyStrictMinutes(record, null);
                    if (getDataMinutes(record) !== before) changed = true;
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }

            if (panel.getRows) {
                panel.getRows().forEach(row => {
                    const record = panel.getSessionCached?.(row);
                    if (!record) return;

                    const before = getDataMinutes(record);
                    applyStrictMinutes(record, row);
                    if (getDataMinutes(record) !== before) changed = true;
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }

            if (changed) {
                panel.saveToLocalStorage?.();
                panel.render?.(false);
                console.log('[SLF Team4 MIN] strict hydration cleaned Team4 minutes cache');
            }
        } catch (error) {
            console.warn('[SLF Team4 MIN] strict hydration failed', error);
        }
    }

    function patchPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        const originalReadPlayerFromDom = panel.readPlayerFromDom;
        panel.readPlayerFromDom = function strictReadPlayerFromDom(row, indexMap) {
            return applyStrictMinutes(originalReadPlayerFromDom.call(this, row, indexMap), row);
        };

        const originalNormalizeRecord = panel.normalizeRecord;
        panel.normalizeRecord = function strictNormalizeRecord(record) {
            return applyStrictMinutes(originalNormalizeRecord.call(this, record), null);
        };

        const originalEnrichWithTmProfile = panel.enrichWithTmProfile;
        panel.enrichWithTmProfile = async function strictEnrichWithTmProfile(data) {
            return applyStrictMinutes(await originalEnrichWithTmProfile.call(this, data), null);
        };

        const originalBuildTipHtml = panel.buildTipHtml;
        panel.buildTipHtml = function strictBuildTipHtml(data) {
            applyStrictMinutes(data, null);
            const html = originalBuildTipHtml.call(this, data);
            applyStrictMinutes(data, null);
            return sanitizeTooltipHtml(html, data, null);
        };

        const originalStatusMarker = panel.statusMarker;
        panel.statusMarker = function strictStatusMarker(data) {
            applyStrictMinutes(data, null);
            const html = originalStatusMarker.call(this, data);
            applyStrictMinutes(data, null);
            return sanitizeStatusHtml(html, data, null);
        };

        const originalShowPreparedTip = panel.showPreparedTip;
        panel.showPreparedTip = function strictShowPreparedTip(button, playerId) {
            const row = button?.closest?.('tr') || null;
            const record = [...(this.sessionCache?.values?.() || [])].find(item => item?.slfPlayerId === playerId);
            if (record) {
                applyStrictMinutes(record, row);
                this.cacheTooltipHtml?.(record);
            }
            return originalShowPreparedTip.call(this, button, playerId);
        };

        hydrate(panel);
        setTimeout(() => hydrate(panel), 1000);
        return true;
    }

    function start() {
        if (!/\/team4\.php(?:$|\?)/i.test(location.pathname + location.search)) return;

        const tryPatch = () => {
            if (!patchPanel()) setTimeout(tryPatch, 250);
        };

        tryPatch();
    }

    return {
        start,
        trustedIds,
        strictEntryFor,
        applyStrictMinutes
    };
})();

Team4AlterMinutesStrictLinkHotfix.start();
