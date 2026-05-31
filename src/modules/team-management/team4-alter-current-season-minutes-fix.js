// Team Management: alter.php current-season minutes bridge
// Fixes the chain: alter.php minutes -> team4 storage -> Team4 tooltip.
// This module is branch-scoped and must be bundled after team4-player-status-helper.js.

const Team4AlterCurrentSeasonMinutesBridge = (() => {
    const STORAGE_KEY = 'slf_team4_real_minutes_cache_v1';
    const TEAM4_STORAGE_KEYS = [
        'slf_team4_player_status_cache_v3',
        'slf_team4_player_status_cache_v2',
        'slf_team4_player_status_cache_v1'
    ];
    const NO_MATCH_LOGGED = new Set();
    const MATCH_LOGGED = new Set();

    function norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function low(text) {
        return norm(text).toLowerCase();
    }

    function compactName(text) {
        return low(text)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ё/g, 'е')
            .replace(/[ьъ]/g, '')
            .replace(/[^a-zа-я0-9]+/g, '');
    }

    function nameTokens(text) {
        return low(text)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ё/g, 'е')
            .replace(/[ьъ]/g, '')
            .split(/[^a-zа-я0-9]+/i)
            .map(token => token.trim())
            .filter(token => token.length >= 3);
    }

    function namesMatch(left, right) {
        const a = compactName(left);
        const b = compactName(right);
        if (!a || !b) return false;
        if (a === b || a.includes(b) || b.includes(a)) return true;

        const leftTokens = new Set(nameTokens(left));
        const rightTokens = nameTokens(right);
        if (!leftTokens.size || !rightTokens.length) return false;

        const overlap = rightTokens.filter(token => leftTokens.has(token)).length;
        return overlap >= 2 || (overlap >= 1 && Math.min(leftTokens.size, rightTokens.length) === 1);
    }

    function parseMinutesCell(text) {
        const clean = norm(text)
            .replace(/\d+\s*%/g, ' ')
            .replace(/[^\d\s]/g, ' ');

        const nums = clean
            .split(/\s+/)
            .map(Number)
            .filter(n => Number.isFinite(n));

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

    function isAlterPage() {
        return /\/alter\.php$/i.test(location.pathname || '') || /\/alter\.php\?/i.test(location.href || '');
    }

    function isTeam4Page() {
        return /\/team4\.php$/i.test(location.pathname || '') || /\/team4\.php\?/i.test(location.href || '');
    }

    function readMinutesCache() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function writeMinutesCache(cache) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cache || {}));
        } catch (error) {
            if (typeof debugWarn === 'function') debugWarn('[SLF Team4 MIN] cache write failed', error);
            else console.warn('[SLF Team4 MIN] cache write failed', error);
        }
    }

    function getCachedEntry(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;
        const entry = readMinutesCache()[id] || null;
        const minutes = Number(entry?.currentSeasonMinutes || entry?.seasonMinutes || 0);
        return minutes > 0 ? { ...entry, currentSeasonMinutes: minutes } : null;
    }

    function getCachedEntries() {
        return Object.entries(readMinutesCache())
            .map(([id, entry]) => {
                const minutes = Number(entry?.currentSeasonMinutes || entry?.seasonMinutes || 0);
                return minutes > 0 ? { id, ...entry, currentSeasonMinutes: minutes } : null;
            })
            .filter(Boolean);
    }

    function addId(ids, value) {
        const id = String(value || '').trim();
        if (/^\d+$/.test(id)) ids.add(id);
    }

    function collectIdsFromText(ids, text) {
        const raw = String(text || '');
        const patterns = [
            /[?&](?:id|player_id|playerId|pid|plid)=(\d{3,})/ig,
            /\b(?:alter|player|footballer|pltr|pid|playerId)[^\d]{0,12}(\d{3,})\b/ig,
            /\bpltr-(\d{3,})\b/ig
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(raw))) addId(ids, match[1]);
        });
    }

    function collectRowLinks(row) {
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

    function getDataIds(data, row) {
        const ids = new Set();

        [
            data?.alterId,
            data?.playerId,
            data?.slfPlayerId,
            data?.tmPlayerId,
            data?.id,
            String(row?.id || '').replace(/^pltr-/, '')
        ].forEach(value => addId(ids, value));

        [
            data?.alterUrl,
            data?.playerUrl,
            data?.tmUrl,
            data?.tmLink,
            data?.profileUrl,
            ...(collectRowLinks(row) || [])
        ].forEach(value => {
            addId(ids, getAlterIdFromUrl(value));
            collectIdsFromText(ids, value);
        });

        if (row?.dataset) Object.values(row.dataset).forEach(value => collectIdsFromText(ids, value));
        collectIdsFromText(ids, row?.id || '');

        return [...ids];
    }

    function getDataName(data, row) {
        return norm(data?.name || row?.querySelector?.('a[href*="player"]')?.textContent || row?.textContent || '');
    }

    function entryNames(entry) {
        return [
            entry?.playerName,
            entry?.name,
            ...(Array.isArray(entry?.playerNames) ? entry.playerNames : [])
        ].map(norm).filter(Boolean);
    }

    function findCachedEntryForData(data, row) {
        const ids = getDataIds(data, row);
        for (const id of ids) {
            const entry = getCachedEntry(id);
            if (entry) {
                logMatch(data, row, entry, 'id', ids);
                return entry;
            }
        }

        const entries = getCachedEntries();
        const rowHtml = String(row?.outerHTML || '');
        for (const entry of entries) {
            const id = String(entry.alterId || entry.playerId || entry.id || '').trim();
            if (id && rowHtml.includes(id)) {
                logMatch(data, row, entry, 'row-html-id', ids);
                return entry;
            }
        }

        const dataName = getDataName(data, row);
        if (dataName) {
            for (const entry of entries) {
                if (entryNames(entry).some(name => namesMatch(name, dataName))) {
                    logMatch(data, row, entry, 'name', ids);
                    return entry;
                }
            }
        }

        logNoMatch(data, row, ids, entries);
        return null;
    }

    function logMatch(data, row, entry, mode, ids) {
        const key = `${data?.key || data?.slfPlayerId || getDataName(data, row)}|${entry?.alterId || entry?.playerId}|${mode}`;
        if (MATCH_LOGGED.has(key)) return;
        MATCH_LOGGED.add(key);
        console.log('[SLF Team4 MIN] matched alter minutes', {
            mode,
            name: getDataName(data, row),
            ids,
            alterId: entry?.alterId || entry?.playerId || '',
            currentSeasonMinutes: entry?.currentSeasonMinutes || 0
        });
    }

    function logNoMatch(data, row, ids, entries) {
        const name = getDataName(data, row);
        const key = `${data?.key || data?.slfPlayerId || name}|${ids.join(',')}|${entries.length}`;
        if (NO_MATCH_LOGGED.has(key)) return;
        NO_MATCH_LOGGED.add(key);

        console.warn('[SLF Team4 MIN] no alterId match found for Team4 player', {
            name,
            slfPlayerId: data?.slfPlayerId || '',
            rowId: row?.id || '',
            candidateIds: ids,
            cacheIds: entries.map(entry => ({
                alterId: entry.alterId || entry.playerId || entry.id || '',
                currentSeasonMinutes: entry.currentSeasonMinutes || 0,
                names: entryNames(entry)
            })),
            rowLinks: collectRowLinks(row)
        });
    }

    function mergeMinutesIntoData(data, row) {
        if (!data) return data;
        const entry = findCachedEntryForData(data, row);
        if (!entry) return data;

        const minutes = Number(entry.currentSeasonMinutes || 0);
        if (!Number.isFinite(minutes) || minutes <= 0) return data;

        data.alterId = data.alterId || entry.alterId || entry.playerId || '';
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

    function getDataMinutes(data) {
        const direct = Number(data?.currentSeasonMinutes || data?.realCareerMinutes?.currentSeasonMinutes || 0);
        if (Number.isFinite(direct) && direct > 0) return direct;
        return getProfileMinutes(data?.tmProfile || null);
    }

    function stripUnknownMinutesReasons(data) {
        const minutes = getDataMinutes(data);
        if (!minutes || !data?.status) return data;

        const cleaned = (data.status.reasons || [])
            .filter(reason => !/минуты текущего сезона не найдены|минуты.*не найден/i.test(String(reason || '')));

        if (!cleaned.some(reason => /реальные минуты|минуты текущего сезона/i.test(String(reason || '')))) {
            cleaned.push(`есть реальные минуты: ${minutes}`);
        }

        data.status = { ...data.status, reasons: cleaned.slice(0, 7) };
        data.reasons = data.status.reasons;
        return data;
    }

    function replaceMinutesMarker(panel, data) {
        const minutes = getDataMinutes(data);
        if (!minutes || !panel?.getMinutesMarker) return data;

        const profile = data.tmProfile || {
            activity: {
                currentSeasonMinutes: minutes,
                seasonMinutes: minutes
            }
        };

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
                    const ids = getDataIds(row, null);
                    const names = entryNames(entry);
                    const rowName = getDataName(row, null);
                    const matched = ids.includes(id) || names.some(name => namesMatch(name, rowName));
                    if (!matched) return;

                    row.alterId = row.alterId || id;
                    row.currentSeasonMinutes = minutes;
                    row.realCareerMinutes = {
                        ...(row.realCareerMinutes || {}),
                        currentSeasonMinutes: minutes,
                        seasonLabel: entry.seasonLabel || '',
                        source: 'alter.php',
                        updatedAt: entry.updatedAt || ''
                    };
                    if (row.tmProfile) {
                        row.tmProfile.currentSeasonMinutes = minutes;
                        row.tmProfile.activity = {
                            ...(row.tmProfile.activity || {}),
                            currentSeasonMinutes: minutes,
                            seasonMinutes: minutes,
                            seasonLabel: entry.seasonLabel || row.tmProfile.activity?.seasonLabel || ''
                        };
                    }
                    changed = true;
                });

                if (changed) localStorage.setItem(key, JSON.stringify(parsed));
            } catch (error) {
                if (typeof debugWarn === 'function') debugWarn('[SLF Team4 MIN] team cache merge failed', key, error);
                else console.warn('[SLF Team4 MIN] team cache merge failed', key, error);
            }
        });
    }

    function extractAlterPlayerNames(doc = document) {
        const candidates = [
            doc.title,
            ...[...doc.querySelectorAll('h1, h2, .player-name, .name, .title, .profile-title')]
                .map(el => el.textContent)
        ]
            .map(text => norm(text)
                .replace(/\s*[-–|].*$/g, '')
                .replace(/^Профиль\s*/i, '')
                .replace(/^Игрок\s*/i, '')
            )
            .filter(text => text && !/^Сезон\b/i.test(text) && text.length >= 3 && text.length <= 80);

        return [...new Set(candidates)];
    }

    function saveAlterMinutes(alterId, result) {
        const id = String(alterId || '').trim();
        const minutes = Number(result?.currentSeasonMinutes || 0);
        if (!id || !Number.isFinite(minutes) || minutes <= 0) return null;

        const playerNames = extractAlterPlayerNames(document);
        const cache = readMinutesCache();
        const entry = {
            ...(cache[id] || {}),
            schema: 'slf_team4_current_season_minutes_v2',
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
        const headers = [...doc.querySelectorAll('body *')]
            .filter(el => {
                const text = norm(el.textContent);
                return /^Сезон\s+\d{4}\/\d{4}/i.test(text) && text.length < 160;
            });

        return headers.find(el => /текущий/i.test(norm(el.textContent))) || headers[0] || null;
    }

    function collectSeasonTables(seasonEl) {
        const tables = [];
        let node = seasonEl?.nextElementSibling || null;

        while (node) {
            const text = norm(node.textContent);
            if (/^Сезон\s+\d{4}\/\d{4}/i.test(text) && text.length < 160) break;

            if (node.tagName === 'TABLE') tables.push(node);
            else tables.push(...(node.querySelectorAll?.('table') || []));

            node = node.nextElementSibling;
        }

        return [...new Set(tables)];
    }

    function parseCurrentSeasonMinutesFromDocument(doc = document) {
        const seasonEl = findCurrentSeasonHeader(doc);
        if (!seasonEl) return { currentSeasonMinutes: 0, seasonLabel: '', rows: [] };

        const seasonLabel = norm(seasonEl.textContent).toLowerCase();
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

                rows.push({
                    competition: cells[0] || '',
                    team: cells[1] || '',
                    raw: rowText,
                    minuteCell: cells[minuteIndex] || '',
                    minutes
                });
            });
        });

        return {
            currentSeasonMinutes: rows.reduce((sum, row) => sum + Number(row.minutes || 0), 0),
            seasonLabel,
            rows
        };
    }

    function syncAlterPage() {
        if (!isAlterPage()) return;

        const alterId = getAlterIdFromUrl(location.href);
        const result = parseCurrentSeasonMinutesFromDocument(document);
        const entry = saveAlterMinutes(alterId, result);

        if (entry) {
            console.log('[SLF Team4 MIN] alter minutes saved', {
                alterId: entry.alterId,
                currentSeasonMinutes: entry.currentSeasonMinutes,
                seasonLabel: entry.seasonLabel,
                playerNames: entry.playerNames,
                rows: entry.rows
            });
        }
    }

    function hydrateTeam4Minutes(panel) {
        if (!panel) return;

        let changed = false;

        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    const before = getDataMinutes(record);
                    mergeMinutesIntoData(record, null);
                    replaceMinutesMarker(panel, record);
                    stripUnknownMinutesReasons(record);
                    if (getDataMinutes(record) !== before) changed = true;
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }

            if (panel.getRows) {
                panel.getRows().forEach(row => {
                    const cached = panel.getSessionCached?.(row);
                    if (!cached) return;

                    const before = getDataMinutes(cached);
                    mergeMinutesIntoData(cached, row);
                    replaceMinutesMarker(panel, cached);
                    stripUnknownMinutesReasons(cached);
                    if (getDataMinutes(cached) !== before) changed = true;
                    if (cached?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(cached);
                });
            }

            if (changed) {
                panel.saveToLocalStorage?.();
                panel.render?.(false);
                console.log('[SLF Team4 MIN] hydrated Team4 records from alter minutes cache');
            }
        } catch (error) {
            console.warn('[SLF Team4 MIN] Team4 hydration failed', error);
        }
    }

    function patchPlayerStatusPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel.__slfAlterMinutesBridgePatched) return false;

        panel.__slfAlterMinutesBridgePatched = true;

        const originalNormalizeRecord = panel.normalizeRecord;
        panel.normalizeRecord = function patchedNormalizeRecord(record) {
            mergeMinutesIntoData(record, null);
            const normalized = originalNormalizeRecord.call(this, record);
            mergeMinutesIntoData(normalized, null);
            replaceMinutesMarker(this, normalized);
            stripUnknownMinutesReasons(normalized);
            return normalized;
        };

        const originalReadPlayerFromDom = panel.readPlayerFromDom;
        panel.readPlayerFromDom = function patchedReadPlayerFromDom(row, indexMap) {
            const data = originalReadPlayerFromDom.call(this, row, indexMap);
            mergeMinutesIntoData(data, row);
            replaceMinutesMarker(this, data);
            stripUnknownMinutesReasons(data);
            return data;
        };

        const originalEnrichWithTmProfile = panel.enrichWithTmProfile;
        panel.enrichWithTmProfile = async function patchedEnrichWithTmProfile(data) {
            const result = await originalEnrichWithTmProfile.call(this, data);
            mergeMinutesIntoData(result, null);
            replaceMinutesMarker(this, result);
            stripUnknownMinutesReasons(result);
            return result;
        };

        const originalGetMinutesMarker = panel.getMinutesMarker;
        panel.getMinutesMarker = function patchedGetMinutesMarker(profile) {
            const minutes = getProfileMinutes(profile);
            if (minutes > 0) {
                const level = minutes >= 900 ? 'good' : 'normal';
                const score = minutes >= 900 ? 4 : 2;
                return this.serializeMarker({
                    label: `MIN ${minutes}`,
                    level,
                    score,
                    text: `Минуты текущего сезона: ${minutes}.`
                }, 'activity');
            }
            return originalGetMinutesMarker.call(this, profile);
        };

        const originalBuildTipHtml = panel.buildTipHtml;
        panel.buildTipHtml = function patchedBuildTipHtml(data) {
            mergeMinutesIntoData(data, null);
            replaceMinutesMarker(this, data);
            stripUnknownMinutesReasons(data);

            const minutes = getDataMinutes(data);
            let html = originalBuildTipHtml.call(this, data);

            if (minutes > 0) {
                const minRow = `<div class="row"><b>MIN:</b> ${this.escapeHtml(`${minutes} мин`)}</div>`;
                html = html.replace(/<div class="row"><b>MIN:<\/b>[\s\S]*?<\/div>/, minRow);
                html = html.replace(/MIN \?<\/span><div class="muted">Минуты текущего сезона не найдены\.<\/div>/g, `MIN ${minutes}</span><div class="muted">Минуты текущего сезона: ${minutes}.</div>`);
            }

            return html;
        };

        const originalStatusMarker = panel.statusMarker;
        panel.statusMarker = function patchedStatusMarker(data) {
            mergeMinutesIntoData(data, null);
            replaceMinutesMarker(this, data);
            stripUnknownMinutesReasons(data);

            const minutes = getDataMinutes(data);
            const html = originalStatusMarker.call(this, data);

            if (!minutes || /MIN\s+\d+/.test(html)) return html;
            return html.replace(/title="([^"]*)"/, (_m, title) => {
                const cleanTitle = title ? `${title} · MIN ${minutes}` : `MIN ${minutes}`;
                return `title="${this.escapeAttr(cleanTitle)}"`;
            });
        };

        hydrateTeam4Minutes(panel);
        return true;
    }

    function boot() {
        syncAlterPage();

        if (isTeam4Page()) {
            const tryPatch = () => {
                if (!patchPlayerStatusPanel()) setTimeout(tryPatch, 250);
            };
            tryPatch();
        }
    }

    function start() {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }

    return {
        STORAGE_KEY,
        parseMinutesCell,
        parseCurrentSeasonMinutesFromDocument,
        getCachedEntry,
        getDataIds,
        findCachedEntryForData,
        start
    };
})();

Team4AlterCurrentSeasonMinutesBridge.start();
