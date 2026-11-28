// 6. Match Stats Parser
// ============================================================

// #483: classified refresh error shared by the desktop-observation path and
// its callers (SnapshotEngine / the LLM advisor UI). `kind` is the machine
// contract; the UI maps it to a user-facing message. Never carry secret data.
function slfMatchRefreshError(kind, message, extra) {
    const error = new Error(message || kind || 'match refresh failed');
    error.kind = kind || 'unavailable';
    if (extra && typeof extra === 'object') {
        Object.assign(error, extra);
    }
    return error;
}

const MatchStatsParser = {
    // #483: same-origin desktop observation endpoint. The raw game.php HTML is
    // NO-GO (score/.stat-* empty, filled by JS from JSON); this endpoint is the
    // single fresh observation source used before an LLM advisor request.
    DESKTOP_ENDPOINT: '/ajax/game4.php',
    DESKTOP_REFRESH_TIMEOUT_MS: 5000,

    readTeamNames() {
        // FM2026 "g3" layout (issue #313) scopes the match teams inside
        // .g3-scoreline.  Prefer those nodes so foreign roster.php links that
        // appear earlier in the document (e.g. a sidebar club link) cannot
        // hijack home/away.
        const g3HomeName = document.querySelector('.g3-scoreline .g3-team--home .g3-team__name a[href*="roster.php?id="]');
        const g3AwayName = document.querySelector('.g3-scoreline .g3-team--away .g3-team__name a[href*="roster.php?id="]');

        const g3Home = (g3HomeName?.textContent || '').trim();
        const g3Away = (g3AwayName?.textContent || '').trim();

        if (g3Home && g3Away) {
            return { home: g3Home, away: g3Away };
        }

        const links = [...document.querySelectorAll('a[href*="roster.php?id="]')];

        const names = links
            .map(a => (a.textContent || '').trim())
            .filter(Boolean)
            .filter(x => x.length >= 2);

        return {
            home: names[0] || null,
            away: names[1] || null
        };
    },

    getAllTeamIds() {
        const ids = [...document.querySelectorAll('[class*="stat-"]')]
            .flatMap(el => [...el.classList])
            .map(c => {
                const m = c.match(/^stat-(\d+)-/);
                return m ? Number(m[1]) : null;
            })
            .filter(Boolean);

        return [...new Set(ids)];
    },

    detectMyTeamId(ids, teamNames = null) {
        const list = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
        const byKnownId = list.find(id => Object.values(CONFIG.MY_TEAMS).includes(id));

        if (byKnownId) return byKnownId;

        const names = teamNames || this.readTeamNames();
        const aliases = CONFIG.MY_TEAM_ALIASES || {};
        const homeIsMine = Object.values(aliases).some(aliasList => aliasMatchesTeamName(names?.home, aliasList));
        const awayIsMine = Object.values(aliases).some(aliasList => aliasMatchesTeamName(names?.away, aliasList));

        if (homeIsMine && list[0]) return list[0];
        if (awayIsMine && list[1]) return list[1];

        return null;
    },

    readFullStats(teamId) {
        const get = key =>
            document.querySelector(`.stat-${teamId}-${key}`)?.innerText.trim() || null;

        return {
            power: toNum(get('power2') || get('power')),
            possession: toNum(get('pos')),
            shots: toNum(get('shots')),
            onTarget: toNum(get('ontarget')),
            xG: toNum(get('xG')),
            accuratePasses: toNum(get('passes')),
            inaccuratePasses: toNum(get('unpasses')),
            actions: toNum(get('ttx')),
            badActionsPct: toNum(get('defective')),
            defVector: toNum(get('def_height')),
            pressVector: toNum(get('press_height')),
            fouls: toNum(get('fouls')),
            corners: toNum(get('corners')),
            offsides: toNum(get('offsides')),
            individualActions: toNum(get('ind')),
            woodwork: toNum(get('post')),
            support: toNum(get('support'))
        };
    },

    readXT() {
        const text = document.body.innerText;
        const m = text.match(/xT\s*\(импульс атаки\)\s*([\d.]+)\s*-\s*([\d.]+)/i);

        return m
            ? {
                home: toNum(m[1]),
                away: toNum(m[2])
            }
            : null;
    },

    readEventsText() {
        return [...document.querySelectorAll('.game_comments tr, .game-ui__play-comments tr')]
            .slice(0, 30)
            .map(el => el.innerText.trim().replace(/\s+/g, ' '))
            .filter(Boolean);
    },

    readShotsTable() {
        return [];
    },

    // #483: build the same-origin desktop-observation URL with the full param
    // set the live page itself uses. `goal_count=NaN` is part of the native
    // request shape (probe-confirmed); the cache-bust param is fresh per call.
    buildDesktopUrl(gameId, cacheBust = Date.now()) {
        const params = new URLSearchParams();
        params.set('action', 'get_stat_desktop');
        params.set('game_id', String(gameId == null ? '' : gameId));
        params.set('comment_last_id', '0');
        params.set('last_upd', '0');
        params.set('goal_count', 'NaN');
        params.set('shot_id', '0');
        params.set('event', '0');
        params.set('launch_id', '0');
        params.set('target_side', '0');
        params.set('comment_id', '0');
        if (cacheBust != null) params.set('_slf', String(cacheBust));
        return `${this.DESKTOP_ENDPOINT}?${params.toString()}`;
    },

    _stripTags(value) {
        return String(value == null ? '' : value).replace(/<[^>]*>/g, '');
    },

    // Strict numeric decoding: preserves 0, accepts numeric strings / numbers
    // and HTML-wrapped values (def_height/press_height come as HTML), rejects
    // blank, boolean, non-finite and non-numeric input.
    _decodeStrict(value, label) {
        if (value === null || value === undefined) {
            throw slfMatchRefreshError('invalid_observation', `${label} is missing`);
        }
        if (typeof value === 'boolean') {
            throw slfMatchRefreshError('invalid_observation', `${label} is boolean`);
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                throw slfMatchRefreshError('invalid_observation', `${label} is not finite`);
            }
            return value;
        }
        if (typeof value !== 'string') {
            throw slfMatchRefreshError('invalid_observation', `${label} is not a number`);
        }
        const text = this._stripTags(value).trim();
        if (!text) {
            throw slfMatchRefreshError('invalid_observation', `${label} is blank`);
        }
        if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
            throw slfMatchRefreshError('invalid_observation', `${label} is not numeric`);
        }
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) {
            throw slfMatchRefreshError('invalid_observation', `${label} is not finite`);
        }
        return parsed;
    },

    _decodeOptional(value, label) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string' && !this._stripTags(value).trim()) return null;
        return this._decodeStrict(value, label);
    },

    _tryNumber(value) {
        try {
            return this._decodeStrict(value, 'value');
        } catch (_) {
            return null;
        }
    },

    _minuteInfoFromObservation(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return MatchStateParser.minuteInfoFromParts(value, 0);
        }
        if (typeof value === 'string') {
            const m = value.trim().match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
            if (m) return MatchStateParser.minuteInfoFromParts(Number(m[1]), m[2] ? Number(m[2]) : 0);
        }
        return null;
    },

    _firstTeamId(...candidates) {
        for (const candidate of candidates) {
            const n = Number(candidate);
            if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
        }
        return null;
    },

    // Team counters mapped to the existing readFullStats field names. Power is
    // intentionally absent: it is DOM-static (power2/legacy power) and is
    // merged back in by SnapshotEngine.build(fresh).
    _normalizeTeamCounters(team, label) {
        const req = (value, field) => this._decodeStrict(value, `${label}.${field}`);
        return {
            possession: req(team.pos, 'pos'),
            shots: req(team.shots, 'shots'),
            onTarget: req(team.ontarget, 'ontarget'),
            xG: req(team.xG, 'xG'),
            accuratePasses: req(team['1'], '1') + req(team['2'], '2'),
            inaccuratePasses: req(team['-1'], '-1') + req(team['-2'], '-2'),
            actions: req(team.ttx, 'ttx'),
            badActionsPct: req(team.defective, 'defective'),
            defVector: req(team.def_height, 'def_height'),
            pressVector: req(team.press_height, 'press_height'),
            fouls: req(team['-7'], '-7'),
            corners: this._decodeOptional(team['14'], `${label}.14`),
            offsides: this._decodeOptional(team['-10'], `${label}.-10`),
            woodwork: this._decodeOptional(team['16'], `${label}.16`),
            individualActions: this._decodeOptional(team.ind3, `${label}.ind3`),
            // Probe did not confirm a confident support mapping: stay honest.
            support: null
        };
    },

    _eventTextOf(item) {
        if (typeof item === 'string') return this._stripTags(item);
        if (typeof item === 'number' && Number.isFinite(item)) return String(item);
        if (item && typeof item === 'object') {
            for (const key of ['text', 'comment', 'message', 'title', 'description']) {
                const value = item[key];
                if (typeof value === 'string' && value.trim()) return this._stripTags(value);
            }
        }
        return '';
    },

    _normalizeEventsText(comments, events) {
        const primary = Array.isArray(comments) && comments.length ? comments
            : (Array.isArray(events) ? events : []);
        return primary
            .map(item => this._eventTextOf(item).replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 30);
    },

    // #483: validate + normalize one desktop observation. Returns the private
    // normalized record or throws a classified slfMatchRefreshError. Never uses
    // the stale top-level `score`; goals come from t[teamId].goals.
    normalizeDesktopObservation(payload, expectedGameId) {
        const expected = expectedGameId == null ? '' : String(expectedGameId);
        if (!expected) {
            throw slfMatchRefreshError('identity_mismatch', 'missing expected game id');
        }

        let raw = payload;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)
            && raw.data && typeof raw.data === 'object' && !('t' in raw) && !('live' in raw)) {
            raw = raw.data;
        }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw slfMatchRefreshError('non_json', 'observation payload is not an object');
        }

        const rawStatus = raw.status;
        const finishFlag = raw.finish === true || raw.finish === 1 || raw.finish === '1' || raw.finish === 'true';
        const finalStatus = typeof rawStatus === 'string' && /finish|окончен|заверш|final/i.test(rawStatus);
        if (finishFlag || finalStatus) {
            throw slfMatchRefreshError('finished', 'match is finished');
        }
        if (rawStatus === 0 || rawStatus === '0') {
            throw slfMatchRefreshError('not_started', 'match has not started');
        }

        const live = Array.isArray(raw.live) ? raw.live : [];
        const entry = live.find(item => item && String(item.id) === expected);
        if (!entry) {
            throw slfMatchRefreshError('identity_mismatch', 'game id not found in live list');
        }
        const homeId = this._firstTeamId(entry.team_1, entry.home, entry.team1);
        const awayId = this._firstTeamId(entry.team_2, entry.away, entry.team2);
        if (homeId == null || awayId == null || homeId === awayId) {
            throw slfMatchRefreshError('invalid_observation', 'live entry has no distinct team ids');
        }

        const tables = raw.t;
        if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
            throw slfMatchRefreshError('invalid_observation', 'no team stats table');
        }
        const homeTable = tables[String(homeId)];
        const awayTable = tables[String(awayId)];
        if (!homeTable || typeof homeTable !== 'object' || !awayTable || typeof awayTable !== 'object') {
            throw slfMatchRefreshError('invalid_observation', 'missing per-team stats');
        }

        const halftime = raw.halftime === true
            || (typeof rawStatus === 'string' && /halftime|перерыв|первый\s+тайм\s+заверш/i.test(rawStatus));
        const pauseSignal = raw.paused === true
            || raw.stop_update === true
            || (typeof rawStatus === 'string' && /paus|suspend|приостанов|пауза/i.test(rawStatus));
        if (pauseSignal && !halftime) {
            throw slfMatchRefreshError('paused', 'match is paused/suspended');
        }

        const minuteInfo = this._minuteInfoFromObservation(raw.minute);
        if (!minuteInfo || minuteInfo.effectiveMinute == null) {
            throw slfMatchRefreshError(pauseSignal ? 'paused' : 'unavailable', 'match clock is not interpretable');
        }

        const score = {
            home: this._decodeStrict(homeTable.goals, 'home.goals'),
            away: this._decodeStrict(awayTable.goals, 'away.goals')
        };

        const stats = [
            { teamId: homeId, stats: this._normalizeTeamCounters(homeTable, 'home') },
            { teamId: awayId, stats: this._normalizeTeamCounters(awayTable, 'away') }
        ];

        // xT is only accepted when the shape is confidently {home,away} numbers;
        // the probe did not confirm an xT field, so anything else stays null.
        let xT = null;
        const xt = raw.xt;
        if (xt && typeof xt === 'object' && !Array.isArray(xt)) {
            const home = this._tryNumber(xt.home);
            const away = this._tryNumber(xt.away);
            if (home != null && away != null) xT = { home, away };
        }

        return {
            gameId: expected,
            status: halftime ? 'halftime' : 'live',
            minuteInfo,
            teams: [homeId, awayId],
            score,
            stats,
            xT,
            // readShotsTable() returns [] today; keep the same compatible shape
            // instead of inventing a row schema from the unconfirmed shots[].
            shotsTable: [],
            eventsText: this._normalizeEventsText(raw.game_comments, raw.events)
        };
    },

    // #483: same-origin GET with a hard deadline that covers the body read.
    // Injectable fetchImpl for tests. Every failure is a classified error:
    // timeout | network | http_status | non_json | invalid_observation | ...
    async fetchDesktopObservation(options = {}) {
        const settings = options && typeof options === 'object' ? options : {};
        const gameId = settings.gameId == null ? '' : String(settings.gameId);
        if (!gameId) {
            throw slfMatchRefreshError('identity_mismatch', 'missing game id for refresh');
        }
        const fetchImpl = typeof settings.fetchImpl === 'function'
            ? settings.fetchImpl
            : (typeof fetch === 'function' ? fetch.bind(typeof globalThis !== 'undefined' ? globalThis : null) : null);
        if (!fetchImpl) {
            throw slfMatchRefreshError('network', 'fetch is unavailable');
        }
        const timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
            ? settings.timeoutMs
            : this.DESKTOP_REFRESH_TIMEOUT_MS;
        const url = settings.url || this.buildDesktopUrl(gameId, settings.cacheBust != null ? settings.cacheBust : Date.now());

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        let timedOut = false;
        // The deadline wraps the request AND the body read: a single timer
        // rejects the raced promise and aborts the in-flight fetch.
        const deadline = new Promise((_, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                if (controller) { try { controller.abort(); } catch (_) {} }
                reject(slfMatchRefreshError('timeout', 'match refresh timed out'));
            }, timeoutMs);
        });

        const race = promise => Promise.race([promise, deadline]);

        try {
            const init = {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
                redirect: 'error',
                headers: { 'Accept': 'application/json' }
            };
            if (controller) init.signal = controller.signal;

            const response = await race(Promise.resolve(fetchImpl(url, init)));
            if (!response || typeof response !== 'object') {
                throw slfMatchRefreshError('network', 'empty refresh response');
            }
            if (response.ok === false) {
                throw slfMatchRefreshError('http_status', `refresh HTTP ${response.status}`, { status: response.status });
            }
            const bodyText = await race(Promise.resolve(response.text()));
            let payload;
            try {
                payload = JSON.parse(String(bodyText == null ? '' : bodyText));
            } catch (_) {
                throw slfMatchRefreshError('non_json', 'refresh response is not JSON (login/redirect page?)');
            }
            return this.normalizeDesktopObservation(payload, gameId);
        } catch (error) {
            if (error && error.kind) throw error;
            if (timedOut || (error && error.name === 'AbortError')) {
                throw slfMatchRefreshError('timeout', 'match refresh timed out');
            }
            throw slfMatchRefreshError('network', error && error.message ? error.message : 'match refresh failed');
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
};


    // ============================================================
