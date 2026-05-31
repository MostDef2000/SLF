// Team Management: alter.php current-season minutes bridge
// Single source file for the chain: alter.php minutes -> storage -> strict Team4 tooltip match.

const Team4AlterCurrentSeasonMinutesBridge = (() => {
    const STORAGE_KEY = 'slf_team4_real_minutes_cache_v1';
    const TEAM4_STORAGE_KEYS = [
        'slf_team4_player_status_cache_v3',
        'slf_team4_player_status_cache_v2',
        'slf_team4_player_status_cache_v1'
    ];
    const PATCH_FLAG = '__slfAlterMinutesStrictBridgePatched';
    const MATCH_LOGGED = new Set();
    const NO_MATCH_LOGGED = new Set();
    const CLEAN_LOGGED = new Set();

    function norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function parseMinutesCell(text) {
        const clean = norm(text)
            .replace(/\d+\s*%/g, ' ')
            .replace(/[^\d\s]/g, ' ');
        const nums = clean.split(/\s+/).map(Number).filter(n => Number.isFinite(n));
        return nums.length ? nums[nums.length - 1] : 0;
    }

    function getAlterIdFromUrl(urlText) {
        try {
            const url = new URL(String(urlText || location.href), location.origin);
            return String(url.searchParams.get('id') || '').trim();
        } catch (_) {
            const match = String(urlText || '').match(/[?&]id=(\d+)/i);
            return match ? match[1] : '';
        }
    }

    function parseSeasonHeaderText(text) {
        const clean = norm(text);
        const match = clean.match(/^Сезон\s+(\d{4})\s*[\/\\]\s*(\d{4})(?:\s+Текущий)?$/i);
        if (!match) return null;
        return {
            label: clean,
            startYear: Number(match[1]),
            endYear: Number(match[2]),
            hasCurrentMarker: /текущий/i.test(clean)
        };
    }

    function scoreSeasonHeader(season) {
        const nowYear = new Date().getFullYear();
        let score = season.startYear;
        if (season.hasCurrentMarker) score += 100000;
        if (season.startYear === nowYear || season.endYear === nowYear) score += 10000;
        if (season.startYear === nowYear - 1 && season.endYear === nowYear) score += 5000;
        return score;
    }

    function isAlterPage() {
        return /\/alter\.php(?:$|\?)/i.test(location.pathname + location.search);
    }

    function isTeam4Page() {
        return /\/team4\.php(?:$|\?)/i.test(location.pathname + location.search);
    }

    function readMinutesCache() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
        catch (_) { return {}; }
    }

    function writeMinutesCache(cache) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache || {})); }
        catch (error) { console.warn('[SLF Team4 MIN] cache write failed', error); }
    }

    function getCachedEntries() {
        return Object.entries(readMinutesCache())
            .map(([id, entry]) => {
                const minutes = Number(entry?.currentSeasonMinutes || entry?.seasonMinutes || 0);
                return minutes > 0 ? { id: String(id), ...entry, currentSeasonMinutes: minutes } : null;
            })
            .filter(Boolean);
    }

    function getCachedEntry(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;
        const entry = readMinutesCache()[id] || null;
        const minutes = Number(entry?.currentSeasonMinutes || entry?.seasonMinutes || 0);
        return minutes > 0 ? { id, ...entry, currentSeasonMinutes: minutes } : null;
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
        // Do not trust data.alterId: older builds could inject one cached alterId into unrelated rows.
        [
            data?.slfPlayerId,
            data?.playerId,
            data?.id,
            ...(Array.isArray(data?.__slfAlterMinuteTrustedIds) ? data.__slfAlterMinuteTrustedIds : []),
            String(row?.id || '').replace(/^pltr-/, '')
        ].forEach(value => addId(ids, value));
        [data?.playerUrl, data?.profileUrl, ...(rowLinks(row) || [])].forEach(value => collectIdsFromText(ids, value));
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
        for (const entry of getCachedEntries()) {
            const entryIds = [entry.id, entry.alterId, entry.playerId].map(String).filter(Boolean);
            if (entryIds.some(id => ids.includes(id))) return { entry, ids };
        }
        return { entry: null, ids };
    }

    function logStrictMatch(data, row, entry, ids) {
        const key = `${data?.slfPlayerId || data?.name || row?.id || ''}|${entry?.alterId || entry?.playerId || entry?.id || ''}`;
        if (MATCH_LOGGED.has(key)) return;
        MATCH_LOGGED.add(key);
        console.log('[SLF Team4 MIN] strict alter minutes match', {
            name: data?.name || '',
            slfPlayerId: data?.slfPlayerId || '',
            trustedIds: ids,
            alterId: entry?.alterId || entry?.playerId || entry?.id || '',
            currentSeasonMinutes: entry?.currentSeasonMinutes || 0
        });
    }

    function logNoStrictMatch(data, row, ids) {
        const key = `${data?.slfPlayerId || data?.name || row?.id || ''}|${ids.join(',')}`;
        if (NO_MATCH_LOGGED.has(key)) return;
        NO_MATCH_LOGGED.add(key);
        console.warn('[SLF Team4 MIN] no strict alterId match found for Team4 player', {
            name: data?.name || '',
            slfPlayerId: data?.slfPlayerId || '',
            rowId: row?.id || '',
            trustedIds: ids,
            cacheIds: getCachedEntries().map(entry => ({
                alterId: entry.alterId || entry.playerId || entry.id || '',
                currentSeasonMinutes: entry.currentSeasonMinutes || 0
            })),
            rowLinks: rowLinks(row)
        });
    }

    function removeFalseMinutes(data, row, ids) {
        if (!data) return data;
        const removedMinutes = getDataMinutes(data);
        if (!removedMinutes) return data;

        delete data.currentSeasonMinutes;
        delete data.__slfAlterMinuteTrustedIds;
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
        if (data.alterId && data.slfPlayerId && String(data.alterId) !== String(data.slfPlayerId)) delete data.alterId;

        if (Array.isArray(data.markers)) {
            data.markers = data.markers.filter(marker => {
                const label = norm(marker?.label || '');
                const text = norm(marker?.text || '');
                if (!/^MIN\s+\d+$/i.test(label)) return true;
                if (/Минуты текущего сезона/i.test(text)) return false;
                return !String(label).includes(String(removedMinutes));
            });
        }

        const key = `${data?.slfPlayerId || data?.name || row?.id || ''}|${removedMinutes}`;
        if (!CLEAN_LOGGED.has(key)) {
            CLEAN_LOGGED.add(key);
            console.warn('[SLF Team4 MIN] removed non-matching alter minutes from Team4 player', {
                name: data?.name || '',
                slfPlayerId: data?.slfPlayerId || '',
                trustedIds: ids || trustedIds(data, row),
                removedMinutes
            });
        }
        return data;
    }

    function applyStrictMinutes(data, row) {
        if (!data) return data;
        const { entry, ids } = strictEntryFor(data, row);
        if (!entry) {
            if (getDataMinutes(data)) removeFalseMinutes(data, row, ids);
            else if (ids.length) logNoStrictMatch(data, row, ids);
            return data;
        }

        const minutes = Number(entry.currentSeasonMinutes || 0);
        data.__slfAlterMinuteTrustedIds = ids;
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
        logStrictMatch(data, row, entry, ids);
        return data;
    }

    function getProfileMinutes(profile) {
        const candidates = [
            profile?.activity?.currentSeasonMinutes,
            profile?.activity?.seasonMinutes,
            profile?.currentSeasonMinutes,
            profile?.seasonMinutes
        ];
        for (const value of candidates) {
            const minutes = Number(value || 0);
            if (Number.isFinite(minutes) && minutes > 0) return minutes;
        }
        return 0;
    }

    function replaceMinutesMarker(panel, data) {
        const minutes = getDataMinutes(data);
        if (!minutes || !panel?.getMinutesMarker) return data;
        const profile = data.tmProfile || { activity: { currentSeasonMinutes: minutes, seasonMinutes: minutes } };
        const marker = panel.getMinutesMarker(profile);
        const markers = Array.isArray(data.markers) ? data.markers : [];
        data.markers = [
            ...markers.filter(item => {
                const label = String(item?.label || '').trim();
                const category = String(item?.category || '').trim();
                return category !== 'activity' && !/^MIN\b/i.test(label);
            }),
            marker
        ].filter(Boolean);
        return data;
    }

    function stripUnknownMinutesReasons(data) {
        const minutes = getDataMinutes(data);
        if (!minutes || !data?.status) return data;
        const cleaned = (data.status.reasons || [])
            .filter(reason => !/минуты текущего сезона не найдены|минуты.*не найден/i.test(String(reason || '')));
        if (!cleaned.some(reason => /реальные минуты|минуты текущего сезона/i.test(String(reason || '')))) cleaned.push(`есть реальные минуты: ${minutes}`);
        data.status = { ...data.status, reasons: cleaned.slice(0, 7) };
        data.reasons = data.status.reasons;
        return data;
    }

    function applyPanelData(panel, data, row) {
        applyStrictMinutes(data, row);
        replaceMinutesMarker(panel, data);
        stripUnknownMinutesReasons(data);
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

    function extractAlterPlayerNames(doc = document) {
        const candidates = [doc.title, ...[...doc.querySelectorAll('h1, h2, .player-name, .name, .title, .profile-title')].map(el => el.textContent)]
            .map(text => norm(text).replace(/\s*[-–|].*$/g, '').replace(/^Профиль\s*/i, '').replace(/^Игрок\s*/i, ''))
            .filter(text => text && !/^Сезон\b/i.test(text) && text.length >= 3 && text.length <= 80);
        return [...new Set(candidates)];
    }

    function updateTeam4Storage(entry) {
        const minutes = Number(entry?.currentSeasonMinutes || 0);
        const id = String(entry?.alterId || entry?.playerId || '').trim();
        if (!id || !minutes) return;
        TEAM4_STORAGE_KEYS.forEach(key => {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const rows = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
                let changed = false;
                rows.forEach(row => {
                    const ids = trustedIds(row, null);
                    if (!ids.includes(id)) return;
                    row.__slfAlterMinuteTrustedIds = ids;
                    row.alterId = id;
                    row.currentSeasonMinutes = minutes;
                    row.realCareerMinutes = { ...(row.realCareerMinutes || {}), currentSeasonMinutes: minutes, seasonLabel: entry.seasonLabel || '', source: 'alter.php', updatedAt: entry.updatedAt || '' };
                    if (row.tmProfile) row.tmProfile.activity = { ...(row.tmProfile.activity || {}), currentSeasonMinutes: minutes, seasonMinutes: minutes, seasonLabel: entry.seasonLabel || '' };
                    changed = true;
                });
                if (changed) localStorage.setItem(key, JSON.stringify(parsed));
            } catch (error) {
                console.warn('[SLF Team4 MIN] team cache merge failed', key, error);
            }
        });
    }

    function saveAlterMinutes(alterId, result) {
        const id = String(alterId || '').trim();
        const minutes = Number(result?.currentSeasonMinutes || 0);
        if (!id || !Number.isFinite(minutes) || minutes <= 0) return null;
        const cache = readMinutesCache();
        const playerNames = extractAlterPlayerNames(document);
        const entry = {
            ...(cache[id] || {}),
            schema: 'slf_team4_current_season_minutes_v4',
            alterId: id,
            playerId: id,
            playerName: playerNames[0] || cache[id]?.playerName || '',
            playerNames: [...new Set([...(cache[id]?.playerNames || []), ...playerNames])],
            currentSeasonMinutes: minutes,
            seasonLabel: result.seasonLabel || '',
            rows: Array.isArray(result.rows) ? result.rows : [],
            source: 'alter.php',
            updatedAt: new Date().toISOString()
        };
        cache[id] = entry;
        writeMinutesCache(cache);
        updateTeam4Storage(entry);
        return entry;
    }

    function findCurrentSeasonHeader(doc) {
        const seen = new Set();
        const candidates = [...doc.querySelectorAll('body *')]
            .map(el => ({ el, season: parseSeasonHeaderText(el.textContent) }))
            .filter(item => item.season)
            .filter(item => {
                const key = item.season.label;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .map(item => ({ ...item, score: scoreSeasonHeader(item.season) }))
            .sort((a, b) => b.score - a.score || b.season.startYear - a.season.startYear);

        return candidates[0]?.el || null;
    }

    function collectSeasonTables(seasonEl) {
        const tables = [];
        let node = seasonEl?.nextElementSibling || null;
        while (node) {
            if (parseSeasonHeaderText(node.textContent)) break;
            if (node.tagName === 'TABLE') tables.push(node);
            else tables.push(...(node.querySelectorAll?.('table') || []));
            node = node.nextElementSibling;
        }
        return [...new Set(tables)];
    }

    function parseCurrentSeasonMinutesFromDocument(doc = document) {
        const seasonEl = findCurrentSeasonHeader(doc);
        if (!seasonEl) return { currentSeasonMinutes: 0, seasonLabel: '', rows: [] };
        const season = parseSeasonHeaderText(seasonEl.textContent);
        const seasonLabel = season?.label || norm(seasonEl.textContent).toLowerCase();
        const rows = [];
        collectSeasonTables(seasonEl).forEach(table => {
            const trList = [...table.querySelectorAll('tr')];
            const headerRow = trList.find(tr => /Минут/i.test(norm(tr.textContent)));
            if (!headerRow) return;
            const headerIndex = trList.indexOf(headerRow);
            const headers = [...headerRow.children].map(cell => norm(cell.textContent));
            const minuteIndex = headers.findIndex(text => /Минут/i.test(text));
            if (minuteIndex < 0) return;
            trList.slice(headerIndex + 1).forEach(tr => {
                const rowText = norm(tr.textContent);
                if (!rowText || /Лига|Команда|Игр|Старт|Минут/i.test(rowText)) return;
                const cells = [...tr.children].map(cell => norm(cell.textContent));
                const minutes = parseMinutesCell(cells[minuteIndex]);
                if (!Number.isFinite(minutes) || minutes <= 0) return;
                rows.push({ competition: cells[0] || '', team: cells[1] || '', raw: rowText, minuteCell: cells[minuteIndex] || '', minutes });
            });
        });
        return { currentSeasonMinutes: rows.reduce((sum, row) => sum + Number(row.minutes || 0), 0), seasonLabel, rows };
    }

    function syncAlterPage() {
        if (!isAlterPage()) return;
        const entry = saveAlterMinutes(getAlterIdFromUrl(location.href), parseCurrentSeasonMinutesFromDocument(document));
        if (entry) console.log('[SLF Team4 MIN] alter minutes saved', {
            alterId: entry.alterId,
            currentSeasonMinutes: entry.currentSeasonMinutes,
            seasonLabel: entry.seasonLabel,
            playerNames: entry.playerNames,
            rows: entry.rows
        });
    }

    function hydrateTeam4Minutes(panel) {
        let changed = false;
        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    const before = getDataMinutes(record);
                    applyPanelData(panel, record, null);
                    if (getDataMinutes(record) !== before) changed = true;
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }
            if (panel.getRows) {
                panel.getRows().forEach(row => {
                    const record = panel.getSessionCached?.(row);
                    if (!record) return;
                    const before = getDataMinutes(record);
                    applyPanelData(panel, record, row);
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
            console.warn('[SLF Team4 MIN] Team4 hydration failed', error);
        }
    }

    function patchPlayerStatusPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        const originalNormalizeRecord = panel.normalizeRecord;
        panel.normalizeRecord = function patchedNormalizeRecord(record) {
            return applyPanelData(this, originalNormalizeRecord.call(this, record), null);
        };

        const originalReadPlayerFromDom = panel.readPlayerFromDom;
        panel.readPlayerFromDom = function patchedReadPlayerFromDom(row, indexMap) {
            return applyPanelData(this, originalReadPlayerFromDom.call(this, row, indexMap), row);
        };

        const originalEnrichWithTmProfile = panel.enrichWithTmProfile;
        panel.enrichWithTmProfile = async function patchedEnrichWithTmProfile(data) {
            return applyPanelData(this, await originalEnrichWithTmProfile.call(this, data), null);
        };

        const originalGetMinutesMarker = panel.getMinutesMarker;
        panel.getMinutesMarker = function patchedGetMinutesMarker(profile) {
            const minutes = getProfileMinutes(profile);
            if (minutes > 0) return this.serializeMarker({
                label: `MIN ${minutes}`,
                level: minutes >= 900 ? 'good' : 'normal',
                score: minutes >= 900 ? 4 : 2,
                text: `Минуты текущего сезона: ${minutes}.`
            }, 'activity');
            return originalGetMinutesMarker.call(this, profile);
        };

        const originalBuildTipHtml = panel.buildTipHtml;
        panel.buildTipHtml = function patchedBuildTipHtml(data) {
            applyPanelData(this, data, null);
            const html = originalBuildTipHtml.call(this, data);
            applyPanelData(this, data, null);
            return sanitizeTooltipHtml(html, data, null);
        };

        const originalStatusMarker = panel.statusMarker;
        panel.statusMarker = function patchedStatusMarker(data) {
            applyPanelData(this, data, null);
            const html = originalStatusMarker.call(this, data);
            applyPanelData(this, data, null);
            return sanitizeStatusHtml(html, data, null);
        };

        const originalShowPreparedTip = panel.showPreparedTip;
        panel.showPreparedTip = function patchedShowPreparedTip(button, playerId) {
            const row = button?.closest?.('tr') || null;
            const record = [...(this.sessionCache?.values?.() || [])].find(item => item?.slfPlayerId === playerId);
            if (record) {
                applyPanelData(this, record, row);
                this.cacheTooltipHtml?.(record);
            }
            return originalShowPreparedTip.call(this, button, playerId);
        };

        hydrateTeam4Minutes(panel);
        setTimeout(() => hydrateTeam4Minutes(panel), 1000);
        return true;
    }

    function boot() {
        syncAlterPage();
        if (isTeam4Page()) {
            const tryPatch = () => { if (!patchPlayerStatusPanel()) setTimeout(tryPatch, 250); };
            tryPatch();
        }
    }

    function start() {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return { STORAGE_KEY, parseMinutesCell, parseCurrentSeasonMinutesFromDocument, getCachedEntry, trustedIds, strictEntryFor, applyStrictMinutes, start };
})();

Team4AlterCurrentSeasonMinutesBridge.start();