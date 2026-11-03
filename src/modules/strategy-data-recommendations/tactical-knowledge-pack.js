// Tactical Knowledge Pack loader
// ============================================================
// Anonymous read-only loader for the seed-rule knowledge pack served by the
// SLF AI endpoint. The pack supplies LABELED HYPOTHESIS priors (seed rules)
// to the active preset registry scoring seam — it never applies tactics and
// never mutates engine or registry state.
//
// Contract (specs/381-tactical-knowledge-pack-hints):
// - init() reads the localStorage cache synchronously; when absent, expired
//   or invalid it starts ONE anonymous GET (no Authorization header). The
//   fetch is never awaited during hint generation — a completed fetch affects
//   the NEXT hint only. No polling and no re-render on completion.
// - validatePack() is fail-closed: one malformed rule rejects the whole pack.
//   An EMPTY rules array is valid (withdrawal mechanism).
// - get() is synchronous and read-only: validated unexpired state or null.
//   An expired cache must not score. A future-dated fetchedAt (beyond a 60s
//   clock-skew tolerance) is rejected the same way — it must not bypass the
//   TTL and must not score.
// - All storage, parse and transport errors are caught; a cache-write failure
//   must not discard valid in-memory state; a missing GM capability keeps the
//   pack null (endpoint outage is not a kill switch).
// - generatorContext.safeRules is diagnostic-only and is NOT scoring input;
//   it is ignored here.

const TacticalKnowledgePack = {
    schema: 'slf_tactical_knowledge_pack_v1',
    PACK_URL: 'https://slf-api.mostdef.ru/slf_ai/tactics/knowledge-pack.latest.json',
    CACHE_KEY: 'slf:tactics:knowledge-pack:v1',
    TTL_MS: 24 * 60 * 60 * 1000,
    FETCH_TIMEOUT_MS: 15000,
    SUPPORTED_WHEN_KEYS: ['score_state', 'minute_min', 'my_bad_min', 'my_bad_max', 'pressure'],
    SCORE_STATES: ['losing', 'winning', 'draw'],
    PRESSURE_LITERAL: 'opponent_advantage_xg_or_xt',
    CLOCK_SKEW_MS: 60000,

    // Validated in-memory state: {fetchedAt: number, pack} | null.
    state: null,
    fetchStarted: false,

    storageAvailable() {
        try {
            return typeof localStorage !== 'undefined' && !!localStorage
                && typeof localStorage.getItem === 'function';
        } catch (_) {
            return false;
        }
    },

    readCache() {
        try {
            if (!this.storageAvailable()) return null;
            const raw = localStorage.getItem(this.CACHE_KEY);
            if (typeof raw !== 'string' || !raw) return null;
            const envelope = JSON.parse(raw);
            if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return null;
            const fetchedAt = envelope.fetchedAt;
            if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null;
            if (fetchedAt > Date.now() + this.CLOCK_SKEW_MS) return null; // future-dated: reject, must not bypass the TTL
            if (Date.now() - fetchedAt >= this.TTL_MS) return null; // expired cache must not score
            const pack = this.validatePack(envelope.pack);
            return pack ? { fetchedAt, pack } : null;
        } catch (_) {
            return null;
        }
    },

    writeCache(state) {
        // A cache-write failure must not discard valid in-memory state.
        try {
            if (!this.storageAvailable() || typeof localStorage.setItem !== 'function') return;
            const envelope = { fetchedAt: state.fetchedAt, pack: state.pack };
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(envelope));
        } catch (_) { /* keep serving the in-memory state */ }
    },

    isSupportedWhenValue(key, value) {
        if (key === 'score_state') return this.SCORE_STATES.indexOf(value) !== -1;
        if (key === 'minute_min' || key === 'my_bad_min' || key === 'my_bad_max') {
            // Strict numerics: no null/''/numeric-string coercion.
            return typeof value === 'number' && Number.isFinite(value);
        }
        if (key === 'pressure') return value === this.PRESSURE_LITERAL;
        return false;
    },

    validateRule(rule, seenIds) {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
        if (typeof rule.id !== 'string' || !rule.id.trim()) return false;
        if (seenIds.has(rule.id)) return false;
        if (rule.confidence !== 'seed_rule') return false;
        const recommendation = rule.recommendation;
        if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) return false;
        if (typeof recommendation.preset !== 'string' || !recommendation.preset.trim()) return false;
        if (recommendation.reason !== undefined && typeof recommendation.reason !== 'string') return false;
        const when = rule.when;
        if (!when || typeof when !== 'object' || Array.isArray(when)) return false;
        const keys = Object.keys(when);
        if (!keys.length) return false;
        for (const key of keys) {
            if (this.SUPPORTED_WHEN_KEYS.indexOf(key) === -1) return false;
            if (!this.isSupportedWhenValue(key, when[key])) return false;
        }
        if (when.my_bad_min !== undefined && when.my_bad_max !== undefined && when.my_bad_min > when.my_bad_max) return false;
        return true;
    },

    // Fail-closed: the first malformed rule rejects the whole pack (null).
    validatePack(raw) {
        try {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
            if (raw.schema !== this.schema) return null;
            if (typeof raw.version !== 'string' || !raw.version.trim()) return null;
            if (!Array.isArray(raw.rules)) return null;
            const seenIds = new Set();
            for (const rule of raw.rules) {
                if (!this.validateRule(rule, seenIds)) return null;
                seenIds.add(rule.id);
            }
            return { schema: raw.schema, version: raw.version, rules: raw.rules };
        } catch (_) {
            return null;
        }
    },

    adoptPack(raw) {
        const pack = this.validatePack(raw);
        if (!pack) return; // invalid pack → keep previous state (fail-closed)
        this.state = { fetchedAt: Date.now(), pack };
        this.writeCache(this.state);
    },

    handleResponse(response) {
        const status = Number(response && response.status);
        if (!Number.isFinite(status) || status < 200 || status > 299) return;
        const text = response && typeof response.responseText === 'string' ? response.responseText : '';
        if (!text) return;
        let raw = null;
        try {
            raw = JSON.parse(text);
        } catch (_) {
            return; // parse error → keep previous state
        }
        this.adoptPack(raw);
    },

    startFetch() {
        if (this.fetchStarted) return;
        if (typeof GM_xmlhttpRequest !== 'function') return; // missing GM capability → stay null
        this.fetchStarted = true;
        const packLoader = this;
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: this.PACK_URL,
                timeout: this.FETCH_TIMEOUT_MS,
                anonymous: true,
                onload: response => { try { packLoader.handleResponse(response); } catch (_) { /* keep state */ } },
                onerror: () => { /* transport failure → keep state */ },
                ontimeout: () => { /* timeout → keep state */ }
            });
        } catch (_) {
            // Transport raised synchronously — remain without a pack.
        }
    },

    // Synchronous, read-only. Expired or future-dated state must not score.
    get() {
        const state = this.state;
        if (!state || !state.pack) return null;
        if (typeof state.fetchedAt !== 'number' || !Number.isFinite(state.fetchedAt)) return null;
        if (state.fetchedAt > Date.now() + this.CLOCK_SKEW_MS) return null; // future-dated: reject
        if (Date.now() - state.fetchedAt >= this.TTL_MS) return null;
        return state.pack;
    },

    init() {
        const cached = this.readCache();
        if (cached) {
            this.state = cached;
            return;
        }
        this.startFetch();
    }
};

if (typeof window !== 'undefined') {
    window.SLFTacticalKnowledgePack = TacticalKnowledgePack;
}

TacticalKnowledgePack.init();
