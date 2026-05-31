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

    function norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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

    function getDataIds(data, row) {
        const ids = new Set();
        const add = value => {
            const id = String(value || '').trim();
            if (/^\d+$/.test(id)) ids.add(id);
        };

        add(data?.alterId);
        add(data?.playerId);
        add(data?.slfPlayerId);
        add(data?.id);
        add(String(row?.id || '').replace(/^pltr-/, ''));

        const urls = [
            data?.alterUrl,
            data?.playerUrl,
            row?.querySelector?.('a[href*="alter.php?id="]')?.href,
            row?.querySelector?.('a[href*="player.php?id="]')?.href
        ];

        urls.forEach(url => add(getAlterIdFromUrl(url)));
        return [...ids];
    }

    function findCachedEntryForData(data, row) {
        for (const id of getDataIds(data, row)) {
            const entry = getCachedEntry(id);
            if (entry) return entry;
        }
        return null;
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
                    if (!ids.includes(id)) return;
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

    function saveAlterMinutes(alterId, result) {
        const id = String(alterId || '').trim();
        const minutes = Number(result?.currentSeasonMinutes || 0);
        if (!id || !Number.isFinite(minutes) || minutes <= 0) return null;

        const cache = readMinutesCache();
        const entry = {
            ...(cache[id] || {}),
            schema: 'slf_team4_current_season_minutes_v1',
            alterId: id,
            playerId: id,
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
                rows: entry.rows
            });
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
        start
    };
})();

Team4AlterCurrentSeasonMinutesBridge.start();
