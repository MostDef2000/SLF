// Team Management: Team4 real-minutes refresh
// Stable storage key. Do not rename without explicit migration approval.

const Team4AlterCurrentSeasonMinutesBridge = (() => {
    const STORAGE_KEY = 'slf_team4_real_minutes_cache_v1';
    const TEAM4_STATUS_CACHE_KEYS = [
        'slf_team4_player_status_cache_v3',
        'slf_team4_player_status_cache_v2',
        'slf_team4_player_status_cache_v1'
    ];
    const PATCH_FLAG = '__slfTeam4AlterMinutesRefreshPatched';
    const LOG_ONCE = new Set();
    let refreshRunning = false;

    function norm(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function logOnce(level, key, message, payload) {
        if (LOG_ONCE.has(key)) return;
        LOG_ONCE.add(key);
        console[level](message, payload || '');
    }

    function isTeam4Page() {
        return /\/team4\.php(?:$|\?)/i.test(location.pathname + location.search);
    }

    function isAlterPage() {
        return /\/alter\.php(?:$|\?)/i.test(location.pathname + location.search);
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || '') || fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value || {}));
    }

    function readMinutesCache() {
        return readJson(STORAGE_KEY, {});
    }

    function writeMinutesCache(cache) {
        writeJson(STORAGE_KEY, cache || {});
    }

    function parseIdFromUrl(urlText) {
        try {
            const url = new URL(String(urlText || ''), location.origin);
            const value = url.searchParams.get('id');
            return /^\d+$/.test(String(value || '')) ? String(value) : '';
        } catch (_) {
            const match = String(urlText || '').match(/[?&]id=(\d+)/i);
            return match ? match[1] : '';
        }
    }

    function parsePlayerIdFromRow(row) {
        const rowId = String(row?.id || '').match(/^pltr-(\d+)$/)?.[1] || '';
        if (rowId) return rowId;
        const link = row?.querySelector?.('a[href*="/player.php?action=view&id="]');
        return parseIdFromUrl(link?.getAttribute?.('href') || link?.href || '');
    }

    function parseTeam4Rows(doc = document) {
        return [...doc.querySelectorAll('tr[id^="pltr-"]')]
            .map(row => {
                const playerId = parsePlayerIdFromRow(row);
                const playerLink = row.querySelector('a[href*="/player.php?action=view&id="]');
                const name = norm(playerLink?.textContent || '');
                const visible = !/display\s*:\s*none/i.test(String(row.getAttribute('style') || ''));
                const teamReal = norm(row.querySelector('.player-team-real')?.textContent || '');
                return playerId ? { playerId, rowId: row.id || `pltr-${playerId}`, name, visible, teamReal, row } : null;
            })
            .filter(Boolean);
    }

    function parseSeasonTitle(text) {
        const clean = norm(text).toLowerCase();
        const marker = /текущий/i.test(clean);
        let match = clean.match(/^сезон\s+(\d{4})\s*[\/\\]\s*(\d{4})(?:\s+текущий)?$/i);
        if (match) {
            return {
                label: norm(text),
                startYear: Number(match[1]),
                endYear: Number(match[2]),
                actualYear: Number(match[2]),
                hasCurrentMarker: marker,
                type: 'range'
            };
        }
        match = clean.match(/^сезон\s+(\d{4})(?:\s+текущий)?$/i);
        if (match) {
            const year = Number(match[1]);
            return {
                label: norm(text),
                startYear: year,
                endYear: year,
                actualYear: year,
                hasCurrentMarker: marker,
                type: 'year'
            };
        }
        return null;
    }

    function seasonScore(season) {
        const currentYear = new Date().getFullYear();
        let score = Number(season.actualYear || season.endYear || season.startYear || 0);
        if (season.hasCurrentMarker) score += 1000000;
        if (Number(season.actualYear || 0) === currentYear) score += 10000;
        return score;
    }

    function isCurrentActualSeason(season) {
        return Number(season?.actualYear || 0) === new Date().getFullYear();
    }

    function parseMinutesCell(text) {
        const clean = norm(text)
            .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')
            .replace(/[^\d\s]/g, ' ');
        const numbers = clean.split(/\s+/).map(Number).filter(Number.isFinite);
        return numbers.length ? numbers[numbers.length - 1] : 0;
    }

    function getCellText(tr) {
        return [...tr.children].map(cell => norm(cell.textContent));
    }

    function parseSeasonBlock(block) {
        const title = block.querySelector('.h2') || block.querySelector('h1,h2,h3');
        const season = parseSeasonTitle(title?.textContent || '');
        if (!season) return null;

        const rows = [];
        const table = block.querySelector('table.ai_stat') || block.querySelector('table');
        if (!table) return { season, rows, total: 0 };

        const trs = [...table.querySelectorAll('tr')];
        const header = trs.find(tr => /Минут/i.test(norm(tr.textContent)));
        if (!header) return { season, rows, total: 0 };

        const headers = getCellText(header);
        const minuteIndex = headers.findIndex(text => /Минут/i.test(text));
        if (minuteIndex < 0) return { season, rows, total: 0 };

        trs.slice(trs.indexOf(header) + 1).forEach(tr => {
            const cells = getCellText(tr);
            if (cells.length <= minuteIndex) return;
            const rowText = norm(tr.textContent);
            if (!rowText || /Лига|Команда|Игр|Старт|Минут/i.test(rowText)) return;
            const minutes = parseMinutesCell(cells[minuteIndex]);
            if (!Number.isFinite(minutes) || minutes <= 0) return;
            rows.push({
                competition: cells[1] || cells[0] || '',
                team: cells[2] || '',
                minuteCell: cells[minuteIndex] || '',
                minutes,
                raw: rowText
            });
        });

        return { season, rows, total: rows.reduce((sum, row) => sum + row.minutes, 0) };
    }

    function parseAlterDocument(doc) {
        const playerId = parseIdFromUrl(doc.querySelector('a[href*="/player.php?action=view&id="]')?.getAttribute('href') || '') || parseIdFromUrl(doc.location?.href || '');
        const profileName = norm(doc.querySelector('#alter .h2.ai_dark')?.textContent || doc.querySelector('.ai_dark')?.textContent || doc.title || '');
        const blocks = [...doc.querySelectorAll('.season_stat')]
            .map(parseSeasonBlock)
            .filter(Boolean)
            .map(block => ({ ...block, score: seasonScore(block.season) }))
            .sort((a, b) => b.score - a.score || b.season.actualYear - a.season.actualYear);
        const currentBlock = blocks.find(block => block.season.hasCurrentMarker) || blocks.find(block => isCurrentActualSeason(block.season)) || null;
        const lastActiveBlock = blocks.find(block => Number(block.total || 0) > 0) || null;
        const currentSeasonMinutes = currentBlock ? Number(currentBlock.total || 0) : 0;

        return {
            playerId,
            playerName: profileName,
            selectedSeason: currentBlock?.season || null,
            currentSeasonMinutes,
            hasCurrentSeasonPractice: !!currentBlock && currentSeasonMinutes > 0,
            lastActiveSeason: lastActiveBlock?.season || null,
            lastActiveSeasonLabel: lastActiveBlock?.season?.label || '',
            lastActiveSeasonActualYear: lastActiveBlock?.season?.actualYear || 0,
            lastActiveSeasonMinutes: Number(lastActiveBlock?.total || 0),
            rows: currentBlock?.rows || [],
            candidates: blocks.map(block => ({
                label: block.season.label,
                startYear: block.season.startYear,
                endYear: block.season.endYear,
                actualYear: block.season.actualYear,
                hasCurrentMarker: block.season.hasCurrentMarker,
                total: block.total,
                score: block.score
            }))
        };
    }

    function saveMinutesRecord(playerId, parsed) {
        const id = String(playerId || parsed?.playerId || '').trim();
        const minutes = Number(parsed?.currentSeasonMinutes || 0);
        if (!/^\d+$/.test(id) || !Number.isFinite(minutes)) return null;

        const cache = readMinutesCache();
        const previous = cache[id] || {};
        const entry = {
            ...previous,
            schema: previous.schema || 'slf_team4_current_season_minutes',
            playerId: id,
            alterId: id,
            playerName: parsed.playerName || previous.playerName || '',
            currentSeasonMinutes: minutes,
            hasCurrentSeasonPractice: !!parsed.hasCurrentSeasonPractice,
            seasonLabel: parsed.selectedSeason?.label || '',
            lastActiveSeasonLabel: parsed.lastActiveSeasonLabel || previous.lastActiveSeasonLabel || '',
            lastActiveSeasonActualYear: parsed.lastActiveSeasonActualYear || previous.lastActiveSeasonActualYear || 0,
            lastActiveSeasonMinutes: Number(parsed.lastActiveSeasonMinutes || 0),
            rows: parsed.rows || [],
            source: 'team4-auto-alter-fetch',
            updatedAt: new Date().toISOString()
        };
        cache[id] = entry;
        writeMinutesCache(cache);
        return entry;
    }

    function resetMinutesOnly() {
        writeMinutesCache({});
        TEAM4_STATUS_CACHE_KEYS.forEach(key => {
            const parsed = readJson(key, null);
            if (!parsed) return;
            const records = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
            let changed = false;
            records.forEach(record => {
                if (!record || typeof record !== 'object') return;
                if (record.currentSeasonMinutes || record.realCareerMinutes?.currentSeasonMinutes || record.tmProfile?.activity?.currentSeasonMinutes) changed = true;
                delete record.currentSeasonMinutes;
                delete record.alterId;
                delete record.__slfAlterMinuteTrustedIds;
                if (record.realCareerMinutes) {
                    delete record.realCareerMinutes.currentSeasonMinutes;
                    delete record.realCareerMinutes.seasonMinutes;
                    delete record.realCareerMinutes.lastActiveSeasonLabel;
                    delete record.realCareerMinutes.lastActiveSeasonActualYear;
                    delete record.realCareerMinutes.lastActiveSeasonMinutes;
                }
                if (record.tmProfile) {
                    delete record.tmProfile.currentSeasonMinutes;
                    if (record.tmProfile.activity) {
                        delete record.tmProfile.activity.currentSeasonMinutes;
                        delete record.tmProfile.activity.seasonMinutes;
                        delete record.tmProfile.activity.lastActiveSeasonLabel;
                        delete record.tmProfile.activity.lastActiveSeasonActualYear;
                        delete record.tmProfile.activity.lastActiveSeasonMinutes;
                    }
                }
                if (Array.isArray(record.markers)) {
                    const before = record.markers.length;
                    record.markers = record.markers.filter(marker => !/^MIN\b/i.test(norm(marker?.label || '')));
                    if (record.markers.length !== before) changed = true;
                }
            });
            if (changed) writeJson(key, parsed);
        });
        console.log('[SLF Team4 MIN] reset complete', { storageKey: STORAGE_KEY });
    }

    async function fetchAlter(playerId) {
        const response = await fetch(`/alter.php?id=${encodeURIComponent(playerId)}`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parsed = parseAlterDocument(doc);
        const entry = saveMinutesRecord(playerId, parsed);
        return { playerId, ok: !!entry, entry, parsed };
    }

    async function refreshFromTeam4(options = {}) {
        if (refreshRunning) return { ok: false, reason: 'refresh already running' };
        refreshRunning = true;
        const startedAt = Date.now();
        const rows = parseTeam4Rows(document);
        const ids = [...new Set(rows.map(row => row.playerId))];
        const limit = Number(options.limit || ids.length);
        const selectedIds = ids.slice(0, limit);
        const results = [];

        if (options.reset !== false) resetMinutesOnly();
        console.log('[SLF Team4 MIN] refresh started', { players: selectedIds.length, totalRows: rows.length, ids: selectedIds });

        try {
            for (const playerId of selectedIds) {
                try {
                    const result = await fetchAlter(playerId);
                    results.push(result);
                    console.log('[SLF Team4 MIN] fetched', {
                        playerId,
                        name: result.entry?.playerName || '',
                        minutes: result.entry?.currentSeasonMinutes || 0,
                        season: result.entry?.seasonLabel || '',
                        lastActiveSeason: result.entry?.lastActiveSeasonLabel || '',
                        ok: result.ok
                    });
                } catch (error) {
                    results.push({ playerId, ok: false, error: String(error?.message || error) });
                    console.warn('[SLF Team4 MIN] fetch failed', { playerId, error });
                }
            }
            hydrateTeam4Tooltips();
            const cache = readMinutesCache();
            const summary = Object.entries(cache).map(([id, entry]) => ({
                id,
                name: entry.playerName || '',
                minutes: entry.currentSeasonMinutes || 0,
                season: entry.seasonLabel || '',
                lastActiveSeason: entry.lastActiveSeasonLabel || ''
            }));
            console.table(summary);
            console.log('[SLF Team4 MIN] refresh completed', { saved: summary.length, ms: Date.now() - startedAt });
            return { ok: true, rows, ids: selectedIds, results, cache };
        } finally {
            refreshRunning = false;
        }
    }

    function entryForData(data, row) {
        const ids = new Set();
        [data?.slfPlayerId, data?.playerId, data?.id, parsePlayerIdFromRow(row)].forEach(value => {
            if (/^\d+$/.test(String(value || ''))) ids.add(String(value));
        });
        const cache = readMinutesCache();
        for (const id of ids) {
            const entry = cache[id];
            if (entry && (Number(entry.currentSeasonMinutes || 0) > 0 || entry.lastActiveSeasonLabel)) return { id, entry };
        }
        return { id: [...ids][0] || '', entry: null };
    }

    function getPracticeGrade(minutes, age, lastActiveSeasonLabel) {
        const m = Number(minutes || 0);
        const a = Number(age || 0);
        if (m <= 0) {
            const season = norm(lastActiveSeasonLabel).replace(/^сезон\s+/i, '');
            return {
                label: season ? `нет практики с ${season}` : 'не играет',
                level: 'risk',
                score: -2,
                redFlag: true,
                text: season ? `В актуальном сезоне минут нет. Последние игровые минуты были в сезоне ${season}.` : 'В актуальном сезоне нет игровых минут.'
            };
        }
        if (a > 0 && a <= 18) {
            if (m >= 500) return { label: 'Практика', level: 'good', score: 3, redFlag: false, text: 'Для игрока 17-18 лет это хорошая игровая практика.' };
            if (m >= 300) return { label: 'Эпизодически', level: 'watch', score: 0, redFlag: false, text: 'Для игрока 17-18 лет это эпизодическая практика.' };
        } else if (a > 18 && a <= 20) {
            if (m >= 1200) return { label: 'Практика', level: 'good', score: 3, redFlag: false, text: 'Для игрока 19-20 лет это хорошая игровая практика.' };
            if (m >= 500) return { label: 'Эпизодически', level: 'normal', score: 1, redFlag: false, text: 'Для игрока 19-20 лет это заметная практика.' };
        } else if (a > 20 && a <= 22) {
            if (m >= 1800) return { label: 'Практика', level: 'good', score: 3, redFlag: false, text: 'Для игрока 21-22 лет это хорошая игровая практика.' };
            if (m >= 900) return { label: 'Ротация', level: 'normal', score: 1, redFlag: false, text: 'Для игрока 21-22 лет это ротационная практика.' };
            if (m >= 300) return { label: 'Эпизодически', level: 'watch', score: 0, redFlag: false, text: 'Для игрока 21-22 лет это эпизодическая практика.' };
        } else {
            if (m >= 2500) return { label: 'Основа', level: 'good', score: 4, redFlag: false, text: 'Игрок основы по минутам текущего сезона.' };
            if (m >= 1800) return { label: 'Ротация', level: 'good', score: 3, redFlag: false, text: 'Игрок основы/ротации по минутам текущего сезона.' };
            if (m >= 900) return { label: 'Ротация', level: 'normal', score: 1, redFlag: false, text: 'Ротационная игровая практика в текущем сезоне.' };
            if (m >= 300) return { label: 'Эпизодически', level: 'watch', score: 0, redFlag: false, text: 'Эпизодическая игровая практика в текущем сезоне.' };
        }
        return { label: 'Не играет', level: 'risk', score: -2, redFlag: true, text: 'Мало минут в актуальном сезоне.' };
    }

    function estimateMinutesPct(minutes, age) {
        const grade = getPracticeGrade(minutes, age, '');
        if (grade.score >= 4) return 75;
        if (grade.score >= 3) return 60;
        if (grade.score >= 1) return 40;
        if (grade.score === 0) return 20;
        return 0;
    }

    function minutesTextForData(data) {
        const minutes = Number(data?.currentSeasonMinutes || data?.realCareerMinutes?.currentSeasonMinutes || data?.tmProfile?.activity?.currentSeasonMinutes || data?.tmProfile?.activity?.seasonMinutes || 0);
        if (minutes > 0) return `${minutes} мин`;
        const last = data?.lastActiveSeasonLabel || data?.realCareerMinutes?.lastActiveSeasonLabel || data?.tmProfile?.activity?.lastActiveSeasonLabel || '';
        if (last) return `нет практики с ${norm(last).replace(/^сезон\s+/i, '')}`;
        const pct = data?.tmProfile?.activity?.minutesPct;
        return pct != null ? `${pct}%` : '?';
    }

    function applyMinutesToData(panel, data, row) {
        if (!data) return data;
        const { id, entry } = entryForData(data, row);
        if (!entry) {
            delete data.currentSeasonMinutes;
            delete data.lastActiveSeasonLabel;
            if (data.realCareerMinutes) {
                delete data.realCareerMinutes.currentSeasonMinutes;
                delete data.realCareerMinutes.lastActiveSeasonLabel;
            }
            if (data.tmProfile?.activity) {
                delete data.tmProfile.activity.currentSeasonMinutes;
                delete data.tmProfile.activity.lastActiveSeasonLabel;
            }
            if (Array.isArray(data.markers)) data.markers = data.markers.filter(marker => !/^MIN\b/i.test(norm(marker?.label || '')));
            return data;
        }

        const minutes = Number(entry.currentSeasonMinutes || 0);
        const age = Number(data.age || 0);
        const lastActiveSeasonLabel = entry.lastActiveSeasonLabel || '';
        data.playerId = data.playerId || id;
        data.alterId = id;
        data.currentSeasonMinutes = minutes;
        data.hasCurrentSeasonPractice = !!entry.hasCurrentSeasonPractice;
        data.lastActiveSeasonLabel = lastActiveSeasonLabel;
        data.realCareerMinutes = {
            ...(data.realCareerMinutes || {}),
            currentSeasonMinutes: minutes,
            hasCurrentSeasonPractice: !!entry.hasCurrentSeasonPractice,
            seasonLabel: entry.seasonLabel || '',
            lastActiveSeasonLabel,
            lastActiveSeasonActualYear: entry.lastActiveSeasonActualYear || 0,
            lastActiveSeasonMinutes: entry.lastActiveSeasonMinutes || 0,
            source: entry.source || 'team4-auto-alter-fetch'
        };
        data.tmProfile = data.tmProfile || {};
        data.tmProfile.activity = {
            ...(data.tmProfile.activity || {}),
            currentSeasonMinutes: minutes,
            seasonMinutes: minutes,
            minutesPct: estimateMinutesPct(minutes, age),
            seasonLabel: entry.seasonLabel || '',
            age,
            hasCurrentSeasonPractice: !!entry.hasCurrentSeasonPractice,
            lastActiveSeasonLabel,
            lastActiveSeasonActualYear: entry.lastActiveSeasonActualYear || 0,
            lastActiveSeasonMinutes: entry.lastActiveSeasonMinutes || 0
        };
        if (panel?.getMinutesMarker) {
            const marker = panel.getMinutesMarker(data.tmProfile);
            const markers = Array.isArray(data.markers) ? data.markers : [];
            data.markers = [...markers.filter(item => !/^MIN\b/i.test(norm(item?.label || ''))), marker].filter(Boolean);
        }
        if (panel?.classifyStatus) {
            data.status = panel.classifyStatus(data);
            data.reasons = data.status?.reasons || [];
        }
        logOnce('log', `match:${id}`, '[SLF Team4 MIN] applied minutes to Team4 player', { id, name: data.name || entry.playerName || '', minutes, lastActiveSeasonLabel });
        return data;
    }

    function hydrateTeam4Tooltips() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel) return;
        try {
            if (panel.sessionCache?.values) {
                [...panel.sessionCache.values()].forEach(record => {
                    applyMinutesToData(panel, record, null);
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }
            if (panel.getRows) {
                panel.getRows().forEach(row => {
                    const record = panel.getSessionCached?.(row);
                    if (!record) return;
                    applyMinutesToData(panel, record, row);
                    if (record?.slfPlayerId && panel.cacheTooltipHtml) panel.cacheTooltipHtml(record);
                });
            }
            panel.saveToLocalStorage?.();
            panel.render?.(false);
        } catch (error) {
            console.warn('[SLF Team4 MIN] hydrate failed', error);
        }
    }

    function patchPlayerStatusPanel() {
        const panel = typeof PlayerStatusPanel !== 'undefined' ? PlayerStatusPanel : null;
        if (!panel || panel[PATCH_FLAG]) return false;
        panel[PATCH_FLAG] = true;

        const originalReadPlayerFromDom = panel.readPlayerFromDom;
        panel.readPlayerFromDom = function patchedReadPlayerFromDom(row, indexMap) {
            return applyMinutesToData(this, originalReadPlayerFromDom.call(this, row, indexMap), row);
        };

        const originalNormalizeRecord = panel.normalizeRecord;
        panel.normalizeRecord = function patchedNormalizeRecord(record) {
            return applyMinutesToData(this, originalNormalizeRecord.call(this, record), null);
        };

        const originalEnrichWithTmProfile = panel.enrichWithTmProfile;
        panel.enrichWithTmProfile = async function patchedEnrichWithTmProfile(data) {
            return applyMinutesToData(this, await originalEnrichWithTmProfile.call(this, data), null);
        };

        const originalGetMinutesMarker = panel.getMinutesMarker;
        panel.getMinutesMarker = function patchedGetMinutesMarker(profile) {
            const minutes = Number(profile?.activity?.currentSeasonMinutes || profile?.activity?.seasonMinutes || profile?.currentSeasonMinutes || 0);
            const age = Number(profile?.activity?.age || profile?.age || 0);
            const lastActiveSeasonLabel = profile?.activity?.lastActiveSeasonLabel || profile?.lastActiveSeasonLabel || '';
            if (minutes > 0 || lastActiveSeasonLabel) {
                const grade = getPracticeGrade(minutes, age, lastActiveSeasonLabel);
                return this.serializeMarker({
                    label: minutes > 0 ? `MIN ${minutes}` : 'MIN ✗',
                    level: grade.level,
                    score: grade.score,
                    redFlag: grade.redFlag,
                    text: minutes > 0 ? `Минуты текущего сезона: ${minutes}. ${grade.label}.` : grade.text
                }, 'activity');
            }
            return originalGetMinutesMarker.call(this, profile);
        };

        const originalBuildTipHtml = panel.buildTipHtml;
        panel.buildTipHtml = function patchedBuildTipHtml(data) {
            applyMinutesToData(this, data, null);
            const html = originalBuildTipHtml.call(this, data);
            const minText = this.escapeHtml(minutesTextForData(data));
            return String(html || '').replace(/<div class="row"><b>MIN:<\/b>[\s\S]*?<\/div>/, `<div class="row"><b>MIN:</b> ${minText}</div>`);
        };

        const originalShowPreparedTip = panel.showPreparedTip;
        panel.showPreparedTip = function patchedShowPreparedTip(button, playerId) {
            const row = button?.closest?.('tr') || null;
            const record = [...(this.sessionCache?.values?.() || [])].find(item => String(item?.slfPlayerId || item?.playerId || '') === String(playerId || ''));
            if (record) {
                applyMinutesToData(this, record, row);
                this.cacheTooltipHtml?.(record);
            }
            return originalShowPreparedTip.call(this, button, playerId);
        };

        document.addEventListener('click', event => {
            const target = event.target?.closest?.('a,button,input,span,td,th');
            const text = norm(target?.value || target?.textContent || target?.getAttribute?.('title') || '');
            if (/^обновить$/i.test(text)) setTimeout(() => refreshFromTeam4({ reset: true }), 0);
        }, true);

        hydrateTeam4Tooltips();
        return true;
    }

    function boot() {
        if (isTeam4Page()) {
            const timer = setInterval(() => {
                if (patchPlayerStatusPanel()) clearInterval(timer);
            }, 250);
            setTimeout(() => clearInterval(timer), 10000);
        }
        if (isAlterPage()) {
            const parsed = parseAlterDocument(document);
            const id = parseIdFromUrl(location.href) || parsed.playerId;
            const entry = saveMinutesRecord(id, parsed);
            if (entry) console.log('[SLF Team4 MIN] alter page saved', entry);
        }
    }

    function start() {
        const run = () => {
            try {
                boot();
            } catch (error) {
                console.error('[SLF Team4 MIN] boot failed', error);
            }
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else run();
    }

    const api = { STORAGE_KEY, parseTeam4Rows, parseAlterDocument, parseMinutesCell, refreshFromTeam4, resetMinutesOnly, hydrateTeam4Tooltips, readMinutesCache, start };
    window.SLFTeam4AlterMinutes = api;
    return api;
})();

Team4AlterCurrentSeasonMinutesBridge.start();