// Team Management: weekly background form training (owner decision 2026-11-26)
// Runs on any top-level https://slf.fm page, once per week, inside one cross-tab
// navigator.locks election. Reads the starting XI, ranks it (TOP 5 BY FORM, then
// TOP 3 BY ТТД) and submits the three coach[] picks for every eligible club.
// HOME TEAM IS DYNAMIC: the active team is captured at cycle start and restored.
// No page-global save function and no debug export are provided.

const SLFWeeklyFormTraining = (() => {
    'use strict';

    const LOG_PREFIX = '[SLF Weekly Form Training]';
    const EXPECTED_USER_ID = '6945';
    const LOCK_NAME = 'slf:weekly-form-training:v1';
    const STATE_KEY_PREFIX = 'slf_weekly_form_training_v1:';
    const ACTIVITY_KEY = 'slf_weekly_form_activity_v1';
    const ACTIVITY_CHANNEL = 'slf:weekly-form-training:activity';
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
    const DUE_SLACK_MS = 6 * 60 * 60 * 1000;
    const QUIET_MS = 120 * 1000;
    const RETRY_MS = 15 * 60 * 1000;
    const MAX_RETRIES = 2;
    const WAKE_MS = 5 * 60 * 1000;
    const FORM_URL = '/team4.php?action=form&date=1';
    const LINEUP_URL = '/team4.php?action=lineup';
    const TRAIN_TEAM_URL = '/train.php?action=team';
    const PLAYERSTATS_URL = '/team4.php?action=playerstats';
    // Live-confirmed gamelist endpoint (GET, no body). Returns JSON
    // {"list":[[gid, "/game.php?id=<gid>", ...], ...]}.
    const GAMELIST_URL = '/team4.php?action=playerstats&team_id=&season=0&gamelist&gametype%5B%5D=3';
    const GAMESTAT_URL = '/team4.php?action=playerstats&team_id=&season=0&gamestat';
    const STAT_ROW_LENGTH = 68;
    // Captured contract: row[0] is the PID, row[63] is «ТТД всего».
    const TTD_MAPPING = Object.freeze({ label: 'ТТД всего', index: 63 });

    let started = false;
    let wakeTimer = 0;
    let activityChannel = null;
    let memoryActivity = 0;
    let lastRecordedActivity = 0;

    const norm = value => String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

    function report(code, detail) {
        try {
            if (detail === undefined) console.warn(`${LOG_PREFIX} ${code}`);
            else console.warn(`${LOG_PREFIX} ${code}`, detail);
        } catch (_) {}
    }

    function errorCode(error) {
        return String(error && (error.code || error.name) || 'error');
    }

    function isTopLevel() {
        try { return window.top === window.self; } catch (_) { return false; }
    }

    function isWriterOrigin() {
        try { return location.origin === 'https://slf.fm'; } catch (_) { return false; }
    }

    function pageWindow() {
        try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow; } catch (_) {}
        return window;
    }

    function readLoginIdFromDom() {
        const pw = pageWindow();
        try { if (pw && pw.foot_login_id != null) return String(pw.foot_login_id); } catch (_) {}
        try { if (typeof window !== 'undefined' && window && window.foot_login_id != null) return String(window.foot_login_id); } catch (_) {}
        try {
            if (typeof document !== 'undefined' && document && document.scripts) {
                for (const script of document.scripts) {
                    const match = /(?:^|[^A-Za-z0-9_$])(?:let|const|var)\s+foot_login_id\s*=\s*(\d+)/.exec(script.textContent || '');
                    if (match) return match[1];
                }
            }
        } catch (_) {}
        return '';
    }

    function readLoginIdFromHtml(html) {
        const match = /(?:^|[^A-Za-z0-9_$])(?:let|const|var)\s+foot_login_id\s*=\s*(\d+)/.exec(String(html || ''));
        return match ? match[1] : '';
    }

    function identityOkFromDom() {
        return readLoginIdFromDom() === EXPECTED_USER_ID;
    }

    function identityOkFromHtml(html) {
        return readLoginIdFromHtml(html) === EXPECTED_USER_ID;
    }

    function isNewDarkDesign(doc) {
        try {
            const body = doc && doc.body;
            if (!(body && body.classList && body.classList.contains('dark-theme'))) return false;
            return Boolean(doc.querySelector('.fm-topbar, .fm-stage, .content-ui__wrapper'));
        } catch (_) { return false; }
    }

    function admissionOk() {
        if (!isTopLevel() || !isWriterOrigin()) return false;
        if (typeof document === 'undefined' || document.readyState === 'loading') return false;
        if (!identityOkFromDom()) return false;
        return isNewDarkDesign(document);
    }

    function extractPidFromHref(href) {
        const match = /[?&]id=(\d+)/.exec(String(href || ''));
        return match && match[1] !== '0' ? match[1] : '';
    }

    function parseSwitcher(doc) {
        const nodes = [...doc.querySelectorAll('div.fmc-tabs-host > div.lt3.fmc-tabs > div[data-team]')];
        const seen = new Set();
        const result = [];
        for (const node of nodes) {
            const id = String(node.getAttribute('data-team') || '').trim();
            if (!/^\d+$/.test(id) || id === '0' || seen.has(id)) continue;
            if (!/setgo\s*\(/.test(String(node.getAttribute('onclick') || ''))) continue;
            seen.add(id);
            result.push({ id, active: node.classList.contains('b') });
        }
        return result;
    }

    function readActiveTeam(doc) {
        const gc = doc.querySelector('#globalcontent');
        const ids = [...String(gc && gc.className || '').matchAll(/user-custom__team-(\d+)/g)]
            .map(match => match[1]).filter(id => id !== '0');
        const classId = ids.length ? ids[ids.length - 1] : '';
        const nav = doc.querySelector('.fmc-navclub[href*="/roster.php?id="]');
        const navId = extractPidFromHref(nav && nav.getAttribute('href'));
        if (!classId || !navId || classId !== navId) return '';
        return classId;
    }

    function parseLineupPids(doc) {
        const pitch = doc.querySelector('.fcpitch');
        if (!pitch) return { ok: false, reason: 'pitch-missing' };
        const links = [...pitch.querySelectorAll('a[href*="player.php?action=view&id="]')];
        const pids = links.map(link => extractPidFromHref(link.getAttribute('href'))).filter(Boolean);
        if (links.length !== 11 || pids.length !== 11 || new Set(pids).size !== 11) {
            return { ok: false, reason: 'xi-incomplete' };
        }
        return { ok: true, pids };
    }

    function parseStrictNumber(text) {
        const cleaned = String(text == null ? '' : text).replace(/\u00a0/g, ' ').replace(/\s+/g, '').replace(/%$/, '');
        if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(cleaned)) return null;
        const value = Number(cleaned.replace(',', '.'));
        return Number.isFinite(value) ? value : null;
    }

    function parseDateText(text) {
        const match = /\b(\d{2})[-./](\d{2})[-./](\d{4})\b/.exec(String(text || ''));
        if (!match) return null;
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return { raw: match[0], epoch: Date.UTC(year, month - 1, day), day, month, year };
    }

    function parseDateHeader(value) {
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function expiryIsFuture(expiry, serverNow) {
        if (!expiry || !serverNow) return false;
        const now = new Date(serverNow);
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return expiry.epoch > today;
    }

    function parseEligibility(doc) {
        const table = doc.querySelector('table.tt-base');
        if (!table) return { blocked: true, reason: 'tt-base-missing' };
        const rows = [...table.querySelectorAll('tr')];
        const currentCell = [...table.querySelectorAll('th,td')].find(cell => cell.classList.contains('is-current'));
        if (!currentCell) return { blocked: true, reason: 'current-column-missing' };
        const column = currentCell.cellIndex;
        if (column < 0) return { blocked: true, reason: 'current-column-missing' };
        const formRow = rows.find(row => /Тренировки\s+формы\s+игроков/i.test(norm(row.textContent)));
        if (!formRow) return { blocked: true, reason: 'form-training-row-missing' };
        const cell = formRow.children[column];
        if (!cell) return { blocked: true, reason: 'capacity-missing' };
        const capacity = parseStrictNumber(cell.textContent);
        if (capacity === null || !Number.isInteger(capacity)) return { blocked: true, reason: 'capacity-unparseable' };
        return { eligible: capacity === 3, ineligible: capacity !== 3, capacity };
    }

    function parseFormDocument(doc) {
        const root = doc.querySelector('#player_form') || doc;
        const expireBox = root.querySelector('#coach_set .coach_expire') || root.querySelector('.coach_expire');
        const expiry = parseDateText(expireBox && expireBox.textContent);
        const submit = root.querySelector('input[name="coach_set"][type="submit"]')
            || root.querySelector('input[name="coach_set"]')
            || root.querySelector('button[name="coach_set"]');
        const submitValue = submit ? String(submit.getAttribute('value') || submit.value || '').trim() : '';
        const controls = [...root.querySelectorAll('input[name="coach[]"], input.coachd')].filter(element => {
            const type = String(element.getAttribute('type') || element.type || 'checkbox').toLowerCase();
            return type === 'checkbox' && !element.disabled;
        });
        const usablePids = new Set(controls.map(element => String(element.getAttribute('value') || element.value || '').trim()).filter(Boolean));
        const checked = [...root.querySelectorAll('input.coachd:checked, input[name="coach[]"]:checked, input.coachd[checked], input[name="coach[]"][checked]')];
        const checkedPids = [...new Set(checked.map(element => String(element.getAttribute('value') || element.value || '').trim()).filter(Boolean))];
        const needBase = Boolean(doc.querySelector('div.need_base[data-base="1"]'));
        const tables = [...root.querySelectorAll('table')];
        let formTable = null;
        let headerRow = null;
        for (const table of tables) {
            const candidate = [...table.querySelectorAll('tr')]
                .find(row => [...row.children].some(cell => /ПОСЛЕ/i.test(norm(cell.textContent))));
            if (candidate) { formTable = table; headerRow = candidate; break; }
        }
        let formMap = null;
        let formReason = '';
        if (!headerRow) {
            formReason = 'after-column-missing';
        } else {
            const afterIndex = [...headerRow.children].findIndex(cell => /ПОСЛЕ/i.test(norm(cell.textContent)));
            if (afterIndex < 0) {
                formReason = 'after-column-missing';
            } else {
                formMap = new Map();
                for (const row of [...formTable.querySelectorAll('tr')]) {
                    if (row === headerRow) continue;
                    const link = row.querySelector('a[href*="player.php?action=view&id="]') || row.querySelector('a[href*="player.php"]');
                    const pid = extractPidFromHref(link && link.getAttribute('href'));
                    if (!pid) continue;
                    const value = parseStrictNumber(row.children[afterIndex] && row.children[afterIndex].textContent);
                    if (value === null) continue;
                    if (formMap.has(pid)) { formReason = `duplicate-form:${pid}`; break; }
                    formMap.set(pid, value);
                }
            }
        }
        return { expiry, expireText: norm(expireBox && expireBox.textContent), submitValue, controls, usablePids, checkedPids, needBase, formMap, formReason };
    }

    function extractAssignedObject(text, name) {
        const source = String(text || '');
        const pattern = new RegExp(`(?:^|[^A-Za-z0-9_$])(?:var|let|const|window\\.)?\\s*${name}\\s*=\\s*`, 'm');
        const match = pattern.exec(source);
        if (!match) return { found: false };
        let index = match.index + match[0].length;
        while (index < source.length && /\s/.test(source[index])) index++;
        if (source.startsWith('null', index)) return { found: true, literal: null };
        if (source[index] !== '{') return { found: false };
        let depth = 0;
        let quote = '';
        let escaped = false;
        for (let i = index; i < source.length; i++) {
            const char = source[i];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === quote) quote = '';
                continue;
            }
            if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
            if (char === '{') depth++;
            else if (char === '}') {
                depth--;
                if (depth === 0) return { found: true, literal: source.slice(index, i + 1) };
            }
        }
        return { found: false };
    }

    function parseMatchDayFields(literal) {
        const read = name => {
            const match = new RegExp(`\\b${name}\\s*:\\s*['"]?(-?\\d+)['"]?`).exec(literal);
            return match ? Number(match[1]) : undefined;
        };
        return { final: read('final'), online: read('online'), unix: read('unix') };
    }

    function normalizeMatchDay(today, next) {
        const day = value => {
            if (value === null || value === undefined) return null;
            if (typeof value !== 'object') return undefined;
            const final = Number(value.final);
            const online = Number(value.online);
            const unix = Number(value.unix);
            if (!Number.isFinite(final) || !Number.isFinite(online) || !Number.isFinite(unix)) return undefined;
            return { final, online, unix };
        };
        const todayDay = day(today);
        const nextDay = day(next);
        if (todayDay === undefined || nextDay === undefined) return { known: false };
        return { known: true, today: todayDay, next: nextDay };
    }

    function readMatchDayFromText(text) {
        const today = extractAssignedObject(text, 'fm_md_today');
        const next = extractAssignedObject(text, 'fm_md_next');
        if (!today.found || !next.found) return { known: false };
        return normalizeMatchDay(
            today.literal === null ? null : parseMatchDayFields(today.literal),
            next.literal === null ? null : parseMatchDayFields(next.literal)
        );
    }

    function readMatchDayFromWindow() {
        const pw = pageWindow();
        try {
            if (!('fm_md_today' in pw) || !('fm_md_next' in pw)) return { known: false };
            return normalizeMatchDay(pw.fm_md_today, pw.fm_md_next);
        } catch (_) { return { known: false }; }
    }

    function readMatchDayFromDocument(doc, text) {
        if (doc === document) {
            const fromWindow = readMatchDayFromWindow();
            if (fromWindow.known) return fromWindow;
        }
        return readMatchDayFromText(text || (doc && doc.documentElement && doc.documentElement.outerHTML) || '');
    }

    function matchGuard(matchDay, serverNow) {
        if (!matchDay || !matchDay.known) return { safe: false, reason: 'matchday-unknown' };
        const today = matchDay.today;
        const next = matchDay.next;
        if (today !== null && today.final !== 1) return { safe: false, reason: 'match-in-progress' };
        if (next === null) return { safe: true };
        if (next.online === 1) return { safe: false, reason: 'next-match-online' };
        const nextMs = next.unix > 1e12 ? next.unix : next.unix * 1000;
        if (!(nextMs > serverNow)) return { safe: false, reason: 'next-match-due' };
        return { safe: true };
    }

    function noteExternalActivity(ts) {
        const value = Number(ts) || 0;
        if (value > memoryActivity) memoryActivity = value;
    }

    function recordActivity(ts) {
        const value = Number(ts) || Date.now();
        if (value > memoryActivity) memoryActivity = value;
        if (value - lastRecordedActivity < 1000) return;
        lastRecordedActivity = value;
        try { if (typeof GM_setValue === 'function') GM_setValue(ACTIVITY_KEY, value); } catch (_) {}
        try { localStorage.setItem(ACTIVITY_KEY, String(value)); } catch (_) {}
        try { if (activityChannel) activityChannel.postMessage(value); } catch (_) {}
    }

    function lastActivity() {
        let gm = 0;
        let ls = 0;
        try { if (typeof GM_getValue === 'function') gm = Number(GM_getValue(ACTIVITY_KEY, 0)) || 0; } catch (_) {}
        try { ls = Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch (_) {}
        return Math.max(gm, ls, memoryActivity);
    }

    function hasActiveEdit() {
        try {
            const element = document.activeElement;
            if (!element) return false;
            const tag = String(element.tagName || '').toUpperCase();
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true;
        } catch (_) { return true; }
    }

    function activityGuard(now) {
        if (hasActiveEdit()) return false;
        return now - lastActivity() >= QUIET_MS;
    }

    function installActivityTracking() {
        const onLocal = event => {
            if (event && event.isTrusted === false) return;
            recordActivity(Date.now());
        };
        ['pointerdown', 'keydown', 'wheel', 'input', 'submit', 'focusin'].forEach(type => {
            try { window.addEventListener(type, onLocal, { capture: true, passive: true }); } catch (_) {}
        });
        try {
            document.addEventListener('visibilitychange', () => { if (!document.hidden) recordActivity(Date.now()); });
        } catch (_) {}
        try {
            window.addEventListener('storage', event => {
                if (event && event.key === ACTIVITY_KEY) noteExternalActivity(Number(event.newValue) || 0);
            });
        } catch (_) {}
        if (typeof BroadcastChannel === 'function') {
            try {
                activityChannel = new BroadcastChannel(ACTIVITY_CHANNEL);
                activityChannel.onmessage = event => noteExternalActivity(Number(event.data) || 0);
            } catch (_) { activityChannel = null; }
        }
    }

    function stateKey(userId) {
        return `${STATE_KEY_PREFIX}${userId}`;
    }

    function defaultState(userId) {
        return { v: 1, userId, startedAt: 0, lastCompletedAt: 0, retryAfter: 0, retryCount: 0, restorePending: false, phase: 'idle', homeTeamId: '', clubs: {} };
    }

    function isValidState(value, userId) {
        if (!value || typeof value !== 'object') return false;
        if (value.v !== 1 || String(value.userId) !== String(userId)) return false;
        for (const key of ['startedAt', 'lastCompletedAt', 'retryAfter']) {
            if (!Number.isFinite(Number(value[key])) || Number(value[key]) < 0) return false;
        }
        if (value.retryCount !== undefined && (!Number.isFinite(Number(value.retryCount)) || Number(value.retryCount) < 0)) return false;
        if (typeof value.restorePending !== 'boolean') return false;
        if (typeof value.phase !== 'string') return false;
        if (typeof value.homeTeamId !== 'string') return false;
        if (!value.clubs || typeof value.clubs !== 'object' || Array.isArray(value.clubs)) return false;
        return true;
    }

    function readState(userId) {
        let raw;
        try { raw = localStorage.getItem(stateKey(userId)); } catch (_) { return { status: 'unavailable' }; }
        if (!raw) return { status: 'missing' };
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { return { status: 'malformed' }; }
        if (!isValidState(parsed, userId)) return { status: 'malformed' };
        parsed.retryCount = Number(parsed.retryCount) || 0;
        return { status: 'ok', state: parsed };
    }

    function persistState(state) {
        const key = stateKey(state.userId);
        const serialized = JSON.stringify(state);
        try {
            localStorage.setItem(key, serialized);
            if (localStorage.getItem(key) !== serialized) throw new Error('read-back-mismatch');
        } catch (_) {
            const error = new Error('state-persist-failed');
            error.code = 'state-persist-failed';
            throw error;
        }
    }

    function safePersist(state) {
        try { persistState(state); return true; } catch (_) { return false; }
    }

    function isDue(state, now) {
        if (!state) return true;
        if (state.lastCompletedAt > now || state.startedAt > now) return false;
        if (state.retryAfter && now < state.retryAfter) return false;
        if (!state.lastCompletedAt) return true;
        return now - state.lastCompletedAt >= WEEK_MS;
    }

    function isDueCheap(state, now) {
        if (!state) return true;
        if (state.lastCompletedAt > now || state.startedAt > now) return false;
        if (state.retryAfter && now < state.retryAfter) return false;
        if (!state.lastCompletedAt) return true;
        return now - state.lastCompletedAt >= WEEK_MS - DUE_SLACK_MS;
    }

    function appendCacheBuster(url) {
        return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
    }

    async function httpGet(url, options = {}) {
        const target = options.cacheBust ? appendCacheBuster(url) : url;
        const init = { credentials: 'include', cache: 'no-store', redirect: 'follow' };
        if (options.headers) init.headers = options.headers;
        const response = await fetch(target, init);
        const text = await response.text();
        return { ok: response.ok, status: response.status, text, serverNow: parseDateHeader(response.headers.get('date')) };
    }

    async function httpPostForm(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text, serverNow: parseDateHeader(response.headers.get('date')) };
    }

    async function gotoTeam(teamId) {
        let response;
        try {
            // Live-confirmed switch: jQuery same-origin XHR carries the
            // X-Requested-With header and a todo flag; GET is a session mutation.
            response = await httpGet(
                `/ajax/userset.php?action=goto&idteam=${encodeURIComponent(teamId)}&todo=0`,
                { cacheBust: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } }
            );
        } catch (_) {
            return { ok: false, reason: 'goto-transport' };
        }
        if (!response.ok) return { ok: false, reason: `goto-http-${response.status}`, serverNow: response.serverNow };
        let json;
        try { json = JSON.parse(response.text); } catch (_) { return { ok: false, reason: 'goto-json', serverNow: response.serverNow }; }
        if (!json || typeof json !== 'object') return { ok: false, reason: 'goto-json', serverNow: response.serverNow };
        return { ok: true, json, serverNow: response.serverNow };
    }

    function extractGameIds(text) {
        const source = String(text || '');
        const ids = new Set();
        const add = value => {
            const id = String(value == null ? '' : value).trim();
            if (/^\d+$/.test(id) && id !== '0') ids.add(id);
        };
        for (const match of source.matchAll(/gamechoice(?:\[\]|%5B%5D)["']?\s*(?:value=["']|:\s*["']?)(\d+)/gi)) add(match[1]);
        for (const match of source.matchAll(/game\.php\?id=(\d+)/gi)) add(match[1]);
        for (const match of source.matchAll(/data-game(?:-id)?=["'](\d+)["']/gi)) add(match[1]);
        try {
            const walk = value => {
                if (Array.isArray(value)) {
                    // Gamelist rows are positional: [gid, "/game.php?id=<gid>", ...].
                    if (value.length && /^\d+$/.test(String(value[0] == null ? '' : value[0]).trim())) add(value[0]);
                    value.forEach(walk);
                    return;
                }
                if (value && typeof value === 'object') {
                    for (const key of ['id', 'game_id', 'gameId', 'gid']) if (value[key] != null) add(value[key]);
                    Object.values(value).forEach(walk);
                }
            };
            walk(JSON.parse(source));
        } catch (_) {}
        return [...ids];
    }

    async function fetchTtd() {
        let page;
        try { page = await httpGet(PLAYERSTATS_URL, { cacheBust: true }); } catch (_) { return { ok: false, reason: 'playerstats-transport' }; }
        let serverNow = page.serverNow;
        if (!page.ok) return { ok: false, reason: 'playerstats-http', serverNow };
        let gids = [];
        try {
            const list = await httpGet(GAMELIST_URL, { cacheBust: true });
            serverNow = list.serverNow || serverNow;
            if (list.ok) gids = extractGameIds(list.text);
        } catch (_) {}
        if (!gids.length) gids = extractGameIds(page.text);
        if (!gids.length) return { ok: false, reason: 'gamelist-empty', serverNow };
        const body = gids.map(gid => `gamechoice%5B%5D=${encodeURIComponent(gid)}`).join('&');
        let stat;
        try { stat = await httpPostForm(GAMESTAT_URL, body); } catch (_) { return { ok: false, reason: 'gamestat-transport', serverNow }; }
        serverNow = stat.serverNow || serverNow;
        if (!stat.ok) return { ok: false, reason: 'gamestat-http', serverNow };
        let json;
        try { json = JSON.parse(stat.text); } catch (_) { return { ok: false, reason: 'gamestat-json', serverNow }; }
        if (!json || !Array.isArray(json.stat)) return { ok: false, reason: 'gamestat-schema', serverNow };
        const rows = [];
        for (const row of json.stat) {
            // A structurally invalid row outside the selected five cannot change
            // the result: skip it instead of aborting the whole fetch. rankCandidates
            // still requires exactly one valid non-negative integer ТТД per selected PID.
            if (!Array.isArray(row) || row.length !== STAT_ROW_LENGTH) continue;
            const pid = String(row[0] == null ? '' : row[0]).trim();
            if (!/^\d+$/.test(pid) || pid === '0') continue;
            const raw = row[TTD_MAPPING.index];
            let ttd = null;
            if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
                const value = Number(raw);
                if (Number.isInteger(value) && value >= 0) ttd = value;
            }
            rows.push({ pid, ttd });
        }
        return { ok: true, rows, serverNow };
    }

    function rankCandidates(xiPids, formMap, ttdRows) {
        const xi = xiPids.map(String);
        if (xi.length !== 11 || new Set(xi).size !== 11) return { ok: false, reason: 'xi-incomplete' };
        const valid = xi.filter(pid => {
            const value = formMap.get(pid);
            return typeof value === 'number' && Number.isFinite(value);
        });
        if (valid.length < 5) return { ok: false, reason: 'valid-starters-lt-5' };
        // Every starter needs an unambiguous form value before ranking: a
        // starter without a ПОСЛЕ value could have been inside the top five,
        // so the club is blocked with zero saves instead of guessing.
        if (valid.length !== xi.length) return { ok: false, reason: 'xi-form-incomplete' };
        const five = [...valid].sort((a, b) => {
            const delta = formMap.get(b) - formMap.get(a);
            return delta !== 0 ? delta : Number(a) - Number(b);
        }).slice(0, 5);
        const byPid = new Map();
        for (const row of ttdRows) {
            if (!byPid.has(row.pid)) byPid.set(row.pid, []);
            byPid.get(row.pid).push(row.ttd);
        }
        const ttdMap = new Map();
        for (const pid of five) {
            const values = byPid.get(pid) || [];
            if (values.length !== 1) return { ok: false, reason: 'ttd-missing-or-duplicate' };
            const value = values[0];
            if (!Number.isInteger(value) || value < 0) return { ok: false, reason: 'ttd-invalid' };
            ttdMap.set(pid, value);
        }
        const three = [...five].sort((a, b) => {
            const ttd = ttdMap.get(b) - ttdMap.get(a);
            if (ttd !== 0) return ttd;
            const form = formMap.get(b) - formMap.get(a);
            if (form !== 0) return form;
            return Number(a) - Number(b);
        }).slice(0, 3);
        return { ok: true, five, three };
    }

    function buildCoachBody(pids, submitValue) {
        const params = new URLSearchParams();
        pids.forEach(pid => params.append('coach[]', pid));
        params.set('coach_set', submitValue);
        return params.toString();
    }

    function setClub(state, clubId, status, reason) {
        const record = state.clubs[clubId] || (state.clubs[clubId] = {});
        record.status = status;
        record.reason = reason || '';
        if (status === 'uncertain' || status === 'posting') record.attemptAt = Date.now();
        return record;
    }

    async function discover() {
        let response;
        try { response = await httpGet(LINEUP_URL, { cacheBust: true }); } catch (_) { return { ok: false, reason: 'discovery-transport' }; }
        if (!response.ok) return { ok: false, reason: `discovery-http-${response.status}` };
        const serverNow = response.serverNow;
        if (!serverNow) return { ok: false, reason: 'server-clock' };
        if (!identityOkFromHtml(response.text)) return { ok: false, reason: 'identity' };
        const doc = new DOMParser().parseFromString(response.text, 'text/html');
        const home = readActiveTeam(doc);
        if (!home) return { ok: false, reason: 'active-team' };
        const clubs = parseSwitcher(doc).map(item => item.id);
        const matchDay = readMatchDayFromDocument(doc, response.text);
        return { ok: true, serverNow, home, clubs, matchDay, matchGuard: matchGuard(matchDay, serverNow) };
    }

    function preflightSwitch(serverNow, lastMatchDay) {
        if (!identityOkFromDom()) return { ok: false, reason: 'identity' };
        if (!activityGuard(Date.now())) return { ok: false, reason: 'activity' };
        if (lastMatchDay) {
            const guard = matchGuard(lastMatchDay, serverNow);
            if (!guard.safe) return { ok: false, reason: guard.reason };
        }
        return { ok: true, serverNow };
    }

    async function restoreHome(state, serverNow) {
        if (!identityOkFromDom()) return { ok: false, serverNow };
        const home = String(state.homeTeamId || '');
        if (!/^\d+$/.test(home) || home === '0') return { ok: false, serverNow };
        const switched = await gotoTeam(home);
        serverNow = switched.serverNow || serverNow;
        if (!switched.ok) return { ok: false, serverNow };
        let response;
        try { response = await httpGet(LINEUP_URL, { cacheBust: true }); } catch (_) { return { ok: false, serverNow }; }
        serverNow = response.serverNow || serverNow;
        if (!response.ok) return { ok: false, serverNow };
        if (!identityOkFromHtml(response.text)) return { ok: false, serverNow };
        const doc = new DOMParser().parseFromString(response.text, 'text/html');
        if (readActiveTeam(doc) !== home) return { ok: false, serverNow };
        state.restorePending = false;
        return { ok: true, serverNow };
    }

    async function attemptRestore(state) {
        if (!identityOkFromDom()) return { ok: false, reason: 'identity' };
        const restored = await restoreHome(state, Date.now());
        if (!restored.ok) {
            state.retryAfter = (restored.serverNow || Date.now()) + RETRY_MS;
            safePersist(state);
            return { ok: false, reason: 'restore' };
        }
        if (!safePersist(state)) return { ok: false, reason: 'storage' };
        return { ok: true };
    }

    async function inspectClub(clubId, record, serverNow) {
        const switched = await gotoTeam(clubId);
        serverNow = switched.serverNow || serverNow;
        if (!switched.ok) return { stop: true, serverNow };
        let lineup;
        try { lineup = await httpGet(LINEUP_URL, { cacheBust: true }); } catch (_) { return { stop: true, serverNow }; }
        serverNow = lineup.serverNow || serverNow;
        if (!lineup.ok || !identityOkFromHtml(lineup.text)) return { stop: true, serverNow };
        const doc = new DOMParser().parseFromString(lineup.text, 'text/html');
        if (readActiveTeam(doc) !== clubId) return { stop: true, serverNow };
        const matchDay = readMatchDayFromDocument(doc, lineup.text);
        if (!matchGuard(matchDay, serverNow).safe) return { stop: true, serverNow, matchDay };
        let formResponse;
        try { formResponse = await httpGet(FORM_URL, { cacheBust: true }); } catch (_) { return { stop: true, serverNow, matchDay }; }
        serverNow = formResponse.serverNow || serverNow;
        if (!formResponse.ok) return { stop: true, serverNow, matchDay };
        const formDoc = new DOMParser().parseFromString(formResponse.text, 'text/html');
        const form = parseFormDocument(formDoc);
        const intended = (record.intendedPids || []).map(String);
        const checkedOk = intended.length === 3 && form.checkedPids.length === 3 && intended.every(pid => form.checkedPids.includes(pid));
        const expiryOk = expiryIsFuture(form.expiry, serverNow);
        record.observedExpiry = form.expiry ? form.expiry.raw : (record.observedExpiry || '');
        if (checkedOk && expiryOk) {
            record.status = 'verified';
            record.reason = 'read-only-inspection';
        } else {
            record.status = 'uncertain';
            record.reason = 'inspection-not-proven';
            record.attemptAt = Date.now();
        }
        return { stop: false, serverNow, matchDay };
    }

    async function processClub(clubId, state, serverNow) {
        const switched = await gotoTeam(clubId);
        serverNow = switched.serverNow || serverNow;
        if (!switched.ok) {
            setClub(state, clubId, 'blocked', switched.reason);
            safePersist(state);
            return { serverNow, stop: true };
        }
        let lineup;
        try { lineup = await httpGet(LINEUP_URL, { cacheBust: true }); } catch (_) { return { serverNow, stop: true }; }
        serverNow = lineup.serverNow || serverNow;
        if (!lineup.ok) { safePersist(state); return { serverNow, stop: true }; }
        if (!identityOkFromHtml(lineup.text)) return { serverNow, stop: true };
        const lineupDoc = new DOMParser().parseFromString(lineup.text, 'text/html');
        if (readActiveTeam(lineupDoc) !== clubId) return { serverNow, stop: true };
        const matchDay = readMatchDayFromDocument(lineupDoc, lineup.text);
        if (!matchGuard(matchDay, serverNow).safe) return { serverNow, stop: true, matchDay };
        if (!activityGuard(Date.now())) return { serverNow, stop: true, matchDay };

        const xi = parseLineupPids(lineupDoc);
        if (!xi.ok) {
            setClub(state, clubId, 'blocked', xi.reason);
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }

        let train;
        try { train = await httpGet(TRAIN_TEAM_URL, { cacheBust: true }); } catch (_) { train = null; }
        serverNow = (train && train.serverNow) || serverNow;
        if (!train || !train.ok) {
            setClub(state, clubId, 'blocked', 'train-http');
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }
        const eligibility = parseEligibility(new DOMParser().parseFromString(train.text, 'text/html'));
        if (eligibility.blocked) {
            setClub(state, clubId, 'blocked', eligibility.reason);
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }
        if (!eligibility.eligible) {
            setClub(state, clubId, 'ineligible', 'capacity');
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }

        let formResponse;
        try { formResponse = await httpGet(FORM_URL, { cacheBust: true }); } catch (_) { formResponse = null; }
        serverNow = (formResponse && formResponse.serverNow) || serverNow;
        if (!formResponse || !formResponse.ok) {
            setClub(state, clubId, 'blocked', 'form-http');
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }
        const form = parseFormDocument(new DOMParser().parseFromString(formResponse.text, 'text/html'));
        if (!form.needBase) { setClub(state, clubId, 'blocked', 'need-base-missing'); safePersist(state); return { serverNow, matchDay, stop: false }; }
        if (form.controls.length < 3) { setClub(state, clubId, 'blocked', 'coach-controls'); safePersist(state); return { serverNow, matchDay, stop: false }; }
        if (!form.submitValue) { setClub(state, clubId, 'blocked', 'submit-label'); safePersist(state); return { serverNow, matchDay, stop: false }; }
        if (!form.formMap || form.formReason) { setClub(state, clubId, 'blocked', form.formReason || 'form-map'); safePersist(state); return { serverNow, matchDay, stop: false }; }

        const ttd = await fetchTtd();
        serverNow = ttd.serverNow || serverNow;
        if (!ttd.ok) {
            setClub(state, clubId, 'blocked', ttd.reason);
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }
        const ranked = rankCandidates(xi.pids, form.formMap, ttd.rows);
        if (!ranked.ok) {
            setClub(state, clubId, 'blocked', ranked.reason);
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }
        if (!ranked.three.every(pid => form.usablePids.has(pid))) {
            setClub(state, clubId, 'blocked', 'winner-checkbox');
            safePersist(state);
            return { serverNow, matchDay, stop: false };
        }

        if (!activityGuard(Date.now())) return { serverNow, stop: true, matchDay };
        let recheck;
        try { recheck = await httpGet(FORM_URL, { cacheBust: true }); } catch (_) { return { serverNow, stop: true, matchDay }; }
        serverNow = recheck.serverNow || serverNow;
        if (!recheck.ok || !identityOkFromHtml(recheck.text)) return { serverNow, stop: true, matchDay };
        const recheckDoc = new DOMParser().parseFromString(recheck.text, 'text/html');
        if (readActiveTeam(recheckDoc) !== clubId) return { serverNow, stop: true, matchDay };
        const recheckForm = parseFormDocument(recheckDoc);
        if (!recheckForm.needBase || !recheckForm.submitValue) return { serverNow, stop: true, matchDay };
        if (!ranked.three.every(pid => recheckForm.usablePids.has(pid))) return { serverNow, stop: true, matchDay };
        const recheckMatchDay = readMatchDayFromDocument(recheckDoc, recheck.text);
        if (!matchGuard(recheckMatchDay, serverNow).safe) return { serverNow, stop: true, matchDay: recheckMatchDay };
        if (!activityGuard(Date.now())) return { serverNow, stop: true, matchDay: recheckMatchDay };

        const record = setClub(state, clubId, 'posting', '');
        record.intendedPids = ranked.three.slice();
        record.priorExpiry = recheckForm.expiry ? recheckForm.expiry.raw : '';
        record.observedExpiry = '';
        record.extensionProven = false;
        if (!safePersist(state)) return { serverNow, stop: true, matchDay: recheckMatchDay };

        let posted;
        try {
            posted = await httpPostForm(FORM_URL, buildCoachBody(ranked.three, recheckForm.submitValue));
        } catch (_) {
            record.status = 'uncertain';
            record.reason = 'post-transport';
            record.attemptAt = Date.now();
            safePersist(state);
            return { serverNow, stop: true, matchDay: recheckMatchDay };
        }
        serverNow = posted.serverNow || serverNow;

        let verification;
        try { verification = await httpGet(FORM_URL, { cacheBust: true }); } catch (_) { verification = null; }
        if (!verification || !verification.ok) {
            record.status = 'uncertain';
            record.reason = 'verify-fetch';
            record.attemptAt = Date.now();
            safePersist(state);
            return { serverNow, stop: true, matchDay: recheckMatchDay };
        }
        serverNow = verification.serverNow || serverNow;
        if (!identityOkFromHtml(verification.text)) {
            record.status = 'uncertain';
            record.reason = 'verify-identity';
            record.attemptAt = Date.now();
            safePersist(state);
            return { serverNow, stop: true, matchDay: recheckMatchDay };
        }
        const verifyDoc = new DOMParser().parseFromString(verification.text, 'text/html');
        const verifyForm = parseFormDocument(verifyDoc);
        const verifyActive = readActiveTeam(verifyDoc);
        const checkedOk = verifyForm.checkedPids.length === 3 && ranked.three.every(pid => verifyForm.checkedPids.includes(pid));
        const expiryOk = expiryIsFuture(verifyForm.expiry, serverNow);
        record.observedExpiry = verifyForm.expiry ? verifyForm.expiry.raw : '';
        if (verifyActive !== clubId || !checkedOk || !expiryOk) {
            record.status = 'uncertain';
            record.reason = verifyActive !== clubId ? 'verify-team' : (!checkedOk ? 'verify-checked' : 'verify-expiry');
            record.attemptAt = Date.now();
            safePersist(state);
            return { serverNow, stop: true, matchDay: recheckMatchDay };
        }
        record.status = 'verified';
        record.extensionProven = Boolean(recheckForm.expiry && record.observedExpiry && recheckForm.expiry.raw !== record.observedExpiry);
        record.reason = record.extensionProven ? 'state-verified' : 'state-verified-expiry-unchanged';
        record.attemptAt = 0;
        if (!safePersist(state)) return { serverNow, stop: true, matchDay: recheckMatchDay };
        return { serverNow, stop: false, matchDay: recheckMatchDay };
    }

    async function runSweep(state, discovery) {
        const now = discovery.serverNow;
        const recent = state.startedAt > 0 && now - state.startedAt < RESUME_WINDOW_MS;
        const resume = recent && (state.phase === 'partial' || state.phase === 'sweeping');
        if (!resume) {
            const carry = {};
            for (const [id, record] of Object.entries(state.clubs || {})) {
                if (!record || (record.status !== 'uncertain' && record.status !== 'posting')) continue;
                const at = Number(record.attemptAt || 0);
                if (at > 0 && now - at < RESUME_WINDOW_MS) carry[id] = record;
            }
            state.clubs = carry;
            state.startedAt = now;
            state.phase = 'sweeping';
            state.retryCount = 0;
        }
        if (!resume) state.homeTeamId = discovery.home;
        state.restorePending = true;
        state.retryAfter = 0;
        if (!safePersist(state)) { report('storage', 'restore-marker'); return; }

        let serverNow = now;
        let lastMatchDay = discovery.matchDay;
        let aborted = false;
        try {
            for (const clubId of discovery.clubs) {
                if (aborted) break;
                const record = state.clubs[clubId];
                if (resume && record && (record.status === 'verified' || record.status === 'ineligible')) continue;
                if (record && (record.status === 'uncertain' || record.status === 'posting') && Array.isArray(record.intendedPids)) {
                    const pre = preflightSwitch(serverNow, lastMatchDay);
                    if (!pre.ok) { aborted = true; break; }
                    const inspection = await inspectClub(clubId, record, serverNow);
                    serverNow = inspection.serverNow || serverNow;
                    if (inspection.matchDay) lastMatchDay = inspection.matchDay;
                    if (inspection.stop) { aborted = true; break; }
                    if (!safePersist(state)) { aborted = true; break; }
                    continue;
                }
                const pre = preflightSwitch(serverNow, lastMatchDay);
                if (!pre.ok) { aborted = true; break; }
                const result = await processClub(clubId, state, serverNow);
                serverNow = result.serverNow || serverNow;
                if (result.matchDay) lastMatchDay = result.matchDay;
                if (result.stop) { aborted = true; break; }
            }
        } finally {
            let homeOk = false;
            try {
                const restored = await restoreHome(state, serverNow);
                serverNow = restored.serverNow || serverNow;
                homeOk = restored.ok;
            } catch (_) { homeOk = false; }

            const statuses = discovery.clubs.map(id => state.clubs[id] && state.clubs[id].status || 'missing');
            const allTerminal = statuses.length > 0 && statuses.every(status => status === 'verified' || status === 'ineligible');
            const hasBlocked = statuses.some(status => status === 'blocked' || status === 'missing');
            if (allTerminal && homeOk) {
                state.lastCompletedAt = serverNow;
                state.phase = 'complete';
                state.retryAfter = 0;
                state.retryCount = 0;
                state.restorePending = false;
            } else {
                state.phase = 'partial';
                if (homeOk) {
                    state.restorePending = false;
                    if (hasBlocked) {
                        // Bounded transient retries: after MAX_RETRIES a permanent
                        // block backs off to a full week instead of churning every
                        // 15 minutes forever.
                        state.retryCount = (Number(state.retryCount) || 0) + 1;
                        state.retryAfter = state.retryCount > MAX_RETRIES ? serverNow + WEEK_MS : serverNow + RETRY_MS;
                    } else {
                        state.retryAfter = serverNow + WEEK_MS;
                    }
                } else {
                    // Restore is still pending; the recovery path owns its own
                    // retry timing (attemptRestore arms retryAfter), so the sweep
                    // must not arm a separate 15-minute window here.
                    state.retryAfter = 0;
                }
            }
            if (!safePersist(state)) report('storage', 'final');
            if (!homeOk) report('restore-failed');
            if (aborted) report('sweep-aborted');
        }
    }

    async function coordinatedRun() {
        if (!admissionOk()) return;
        const userId = EXPECTED_USER_ID;
        const read = readState(userId);
        if (read.status === 'unavailable') { report('storage-unavailable'); return; }
        if (read.status === 'malformed') { report('state-malformed'); return; }
        const state = read.status === 'missing' ? defaultState(userId) : read.state;

        if (state.restorePending) {
            const restoreNow = Date.now();
            if (state.retryAfter && restoreNow < state.retryAfter) {
                report('restore-pending', 'retry-window');
                return;
            }
            if (!activityGuard(restoreNow)) {
                // Never let the idle guard drop a pending restore: keep the marker
                // and retry on a later wake.
                report('restore-pending', 'activity');
                return;
            }
            const recovery = await attemptRestore(state);
            if (!recovery.ok) { report('restore-pending', recovery.reason); return; }
        }

        const localNow = Date.now();
        if (read.status === 'ok' && !isDueCheap(state, localNow)) return;

        const discovery = await discover();
        if (!discovery.ok) { report('discovery-failed', discovery.reason); return; }
        if (!isDue(state, discovery.serverNow)) return;
        if (!discovery.clubs.length) { report('no-clubs'); return; }
        if (!discovery.matchGuard.safe) { report('match-guard', discovery.matchGuard.reason); return; }
        if (!activityGuard(Date.now())) { report('activity-guard'); return; }
        await runSweep(state, discovery);
    }

    async function runOnce() {
        try {
            if (!isTopLevel() || !isWriterOrigin()) return;
            if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') return;
            await navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
                if (!lock) return;
                await coordinatedRun();
            });
        } catch (error) {
            report('coordinator-failed', errorCode(error));
        }
    }

    function scheduleRun(delay) {
        if (wakeTimer) clearTimeout(wakeTimer);
        wakeTimer = setTimeout(() => {
            wakeTimer = 0;
            void runOnce();
        }, Math.max(0, Number(delay) || 0));
    }

    function start() {
        if (started) return;
        started = true;
        try {
            if (!isTopLevel() || !isWriterOrigin()) return;
            installActivityTracking();
            const wake = () => scheduleRun(0);
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', wake, { once: true });
            } else {
                wake();
            }
            document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
            window.addEventListener('focus', wake);
            window.addEventListener('pageshow', wake);
            setInterval(wake, WAKE_MS);
        } catch (error) {
            report('start-failed', errorCode(error));
        }
    }

    return { start };
})();
