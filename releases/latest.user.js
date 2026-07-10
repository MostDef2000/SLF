// ==UserScript==
// @name         SLF Tactics Helper (+VPS Sync + Live Parser)
// @namespace    http://tampermonkey.net/
// @version      4.4.199
// @description  Modular SLF helper: tactics, live parser, youth monitor, TM + SLF transfer analyzer
// @author       You
// @match        https://slf.fm/
// @match        https://slf.fm/*
// @match        https://www.slf.fm/
// @match        https://www.slf.fm/*
// @match        https://soccerlife.ru/
// @match        https://soccerlife.ru/*
// @match        https://www.soccerlife.ru/
// @match        https://www.soccerlife.ru/*
// @icon         https://www.google.com/s2/favicons?domain=slf.fm
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @connect      77.105.142.206
// @connect      www.transfermarkt.com
// @connect      transfermarkt.com
// @connect      slf.fm
// @connect      www.slf.fm
// @connect      soccerlife.ru
// @connect      www.soccerlife.ru
// @updateURL    https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js
// @downloadURL  https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js
// ==/UserScript==

(function () {
    'use strict';

    // BEGIN SLF RUNTIME VERSION EXPORT
    var SLF_VERSION_INFO = {
        version: '4.4.199',
        scriptVersion: '4.4.199',
        releaseChannel: 'github-tampermonkey',
        updateURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js',
        downloadURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js'
    };
    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {
        scriptVersion: '4.4.199',
        versionInfo: SLF_VERSION_INFO
    });
    // END SLF RUNTIME VERSION EXPORT


// >>> src/core/domain.js
    // 0. SLF domain helpers
    // ============================================================

    const SLF_GAME_DOMAINS = new Set([
        'slf.fm',
        'www.slf.fm',
        'soccerlife.ru',
        'www.soccerlife.ru'
    ]);

    function getSlfGameOrigin() {
        const host = String(location.hostname || '').toLowerCase();

        if (SLF_GAME_DOMAINS.has(host)) {
            return location.origin;
        }

        return 'https://slf.fm';
    }

    function buildSlfUrl(path) {
        const cleanPath = String(path || '');

        if (/^https?:\/\//i.test(cleanPath)) {
            return cleanPath;
        }

        return getSlfGameOrigin() + (cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath);
    }

// ============================================================
// <<< src/core/domain.js


// >>> src/core/config.js
// 1. Config / Constants
// ============================================================

const CONFIG = {
    DEBUG: false,
    SERVER_URL: "http://77.105.142.206:5000",
    TOKEN: "oaAbGtmEKf7qGdH8cXVILmfCJ7zoWvqSv4pY30o4pXSGHsX1HXFReJYU6LkZk3Bg",

    COLLECTIONS: {
        TACTICS: "tactics",

        // Legacy collections below were originally stored as last-state objects on the VPS.
        // For historical analytics, write match/preset history into fresh *_v2 collections.
        MATCH_SNAPSHOTS: "match_snapshots_v2",
        MATCH_RESULTS: "match_results_v2",
        PRESET_EVENTS: "preset_events_v2",
        PRESET_EFFECTS: "preset_effects_v2",

        PLAYER_OBSERVATIONS: "player_observations",
        TRANSFER_HISTORY: "transfer_history",
        PLAYER_STATUS_CACHE: "player_status_cache"
    },

    LEGACY_COLLECTIONS: {
        MATCH_SNAPSHOTS: "match_snapshots",
        MATCH_RESULTS: "match_results",
        PRESET_EVENTS: "preset_events",
        PRESET_EFFECTS: "preset_effects"
    },

    COLLECTION_ALIASES: {
        match_snapshots: "match_snapshots_v2",
        match_results: "match_results_v2",
        preset_events: "preset_events_v2",
        preset_effects: "preset_effects_v2"
    },

    STORAGE_KEY: "slf_custom_presets",

    MY_TEAMS: {
        luch: 23698,
        carrarese: 21473,
        pribram: 18280,
        boa: 22962,
        chester: 79252,
        northDistrict: 105995
    },

    MY_TEAM_ALIASES: {
        luch: ['луч', 'luch'],
        carrarese: ['каррарезе', 'carrarese'],
        pribram: ['пршибрам', 'příbram', 'pribram', 'fk pribram', '1 fk pribram'],
        boa: ['боа', 'boa'],
        chester: ['честер', 'chester', 'fc chester'],
        northDistrict: ['норт дистрикт', 'north district']
    },

    YOUTH_TM_SOURCES: [
        {
            team: 'Каррарезе',
            label: 'Carrarese Giovanili',
            slug: 'carrarese-giovanili',
            clubId: 54823
        },
        {
            team: 'Каррарезе',
            label: 'Carrarese Under-17',
            slug: 'carrarese-under-17',
            clubId: 120491
        },
        {
            team: 'Пршибрам',
            label: 'FK Pribram Youth',
            slug: 'fk-pribram-youth',
            clubId: 125130
        },
        {
            team: 'Пршибрам',
            label: 'FK Pribram U19',
            slug: '1-fk-pribram-u19',
            clubId: 18986
        },
        {
            team: 'Пршибрам',
            label: 'FK Pribram U17',
            slug: '1-fk-pribram-u17',
            clubId: 32695
        },
        {
            team: 'Честер',
            label: 'FC Chester U18',
            slug: 'fc-chester-u19',
            clubId: 43684
        },
        {
            team: 'Норт Дистрикт',
            label: 'North District Youth',
            slug: 'north-district-jugend',
            clubId: 87571
        },
        {
            team: 'Норт Дистрикт',
            label: 'North District U22',
            slug: 'north-district-u22',
            clubId: 122576
        }
    ]
};

function getTeamName(snapshot, teamId) {
    if (!snapshot || !snapshot.teamNames) {
        return `Team ${teamId}`;
    }

    const teams = snapshot.teams || [];
    const id = Number(teamId);

    if (Number(teams[0]) === id) {
        return snapshot.teamNames.home || `Team ${teamId}`;
    }

    if (Number(teams[1]) === id) {
        return snapshot.teamNames.away || `Team ${teamId}`;
    }

    return `Team ${teamId}`;
}

const BASE_PRESETS = {
    standard: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "2", build_long: "2", build_fast: "2",
        style: "4", pass_risk: "3", dribble: "2", cross: "2",
        corner: "1", shot: "2",
        priority: ["right"]
    },

    // Defensive / hold score. Built from SLF wiki/manual principles:
    // compact block, do not overraise line when opponent creates danger, avoid chaos when leading.
    Simeone_LowBlock_def5: {
        def_line: "1", press_line: "1", def_width: "1", press_intense: "2",
        build_type: "1", build_temp: "1", build_long: "2", build_fast: "1",
        style: "1", pass_risk: "1", dribble: "1", cross: "1",
        corner: "1", shot: "1",
        priority: ["right"]
    },
    Simeone_Compact442_def4: {
        def_line: "1", press_line: "2", def_width: "1", press_intense: "3",
        build_type: "2", build_temp: "1", build_long: "2", build_fast: "1",
        style: "2", pass_risk: "2", dribble: "1", cross: "2",
        corner: "1", shot: "1",
        priority: ["left", "right"]
    },
    Mourinho_WeakSide_def3: {
        def_line: "1", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "1", build_temp: "2", build_long: "3", build_fast: "3",
        style: "2", pass_risk: "2", dribble: "2", cross: "3",
        corner: "1", shot: "2",
        priority: ["left", "right"]
    },
    Henta_Hold_def3: {
        def_line: "1", press_line: "1", def_width: "1", press_intense: "4",
        build_type: "1", build_temp: "1", build_long: "2", build_fast: "2",
        style: "2", pass_risk: "1", dribble: "2", cross: "2",
        corner: "1", shot: "1",
        priority: ["left", "right"]
    },

    // Balance / control. Wiki/manual logic: keep structure first, tune risk by score/context.
    Pep_StandardControl_bal3: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "2", build_long: "2", build_fast: "2",
        style: "3", pass_risk: "3", dribble: "2", cross: "2",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    Xabi_BoxMidfield_bal3: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "2", build_long: "1", build_fast: "2",
        style: "3", pass_risk: "3", dribble: "2", cross: "1",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    Pep_BoxControl_bal2: {
        def_line: "2", press_line: "2", def_width: "1", press_intense: "2",
        build_type: "2", build_temp: "1", build_long: "1", build_fast: "1",
        style: "3", pass_risk: "2", dribble: "1", cross: "1",
        corner: "1", shot: "1",
        priority: ["center"]
    },
    Pep_ControlledPush_att3: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "3", build_long: "1", build_fast: "3",
        style: "4", pass_risk: "3", dribble: "3", cross: "2",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    Xabi_VerticalBox_att3: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "3", build_long: "2", build_fast: "3",
        style: "4", pass_risk: "4", dribble: "2", cross: "1",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    Pep_PressCooldown_bal2: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "2",
        build_type: "2", build_temp: "2", build_long: "1", build_fast: "2",
        style: "3", pass_risk: "2", dribble: "1", cross: "1",
        corner: "1", shot: "1",
        priority: ["center", "right"]
    },
    Compact_Counter_def3: {
        def_line: "1", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "1", build_temp: "2", build_long: "3", build_fast: "4",
        style: "3", pass_risk: "2", dribble: "3", cross: "3",
        corner: "1", shot: "2",
        priority: ["left", "right"]
    },
    DeZerbi_BaitPress_bal3: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "2",
        build_type: "1", build_temp: "1", build_long: "1", build_fast: "2",
        style: "3", pass_risk: "3", dribble: "2", cross: "1",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    Conte_WingbackWidth_bal4: {
        def_line: "2", press_line: "2", def_width: "3", press_intense: "3",
        build_type: "2", build_temp: "2", build_long: "2", build_fast: "3",
        style: "3", pass_risk: "3", dribble: "3", cross: "4",
        corner: "1", shot: "2",
        priority: ["left", "right"]
    },

    // Attack / chase. Wiki/manual logic: raise risk by score and minute, but separate controlled pressure from chaos.
    Klopp_Gegenpress_att4: {
        def_line: "3", press_line: "4", def_width: "3", press_intense: "5",
        build_type: "3", build_temp: "4", build_long: "2", build_fast: "4",
        style: "5", pass_risk: "4", dribble: "4", cross: "3",
        corner: "1", shot: "3",
        priority: ["left", "right"]
    },
    Bielsa_ChaosPress_att5: {
        def_line: "4", press_line: "5", def_width: "4", press_intense: "5",
        build_type: "3", build_temp: "5", build_long: "3", build_fast: "5",
        style: "5", pass_risk: "5", dribble: "5", cross: "4",
        corner: "1", shot: "4",
        priority: ["left", "center", "right"]
    },
    Pep_TwoThreeFive_att3: {
        def_line: "3", press_line: "3", def_width: "3", press_intense: "4",
        build_type: "2", build_temp: "3", build_long: "1", build_fast: "3",
        style: "5", pass_risk: "4", dribble: "3", cross: "2",
        corner: "1", shot: "3",
        priority: ["center"]
    },
    DeZerbi_Release_att4: {
        def_line: "2", press_line: "3", def_width: "2", press_intense: "3",
        build_type: "1", build_temp: "2", build_long: "2", build_fast: "4",
        style: "4", pass_risk: "4", dribble: "3", cross: "2",
        corner: "1", shot: "3",
        priority: ["center", "right"]
    },
    Klopp_WideTrap_att4: {
        def_line: "3", press_line: "4", def_width: "4", press_intense: "5",
        build_type: "3", build_temp: "4", build_long: "2", build_fast: "4",
        style: "5", pass_risk: "4", dribble: "4", cross: "4",
        corner: "1", shot: "3",
        priority: ["left", "right"]
    },

    // Henta variants: lower block + aggressive recovery, with exact attack lane separated.
    Henta_LeftTrap_att3: {
        def_line: "1", press_line: "2", def_width: "2", press_intense: "4",
        build_type: "1", build_temp: "2", build_long: "3", build_fast: "3",
        style: "3", pass_risk: "2", dribble: "3", cross: "3",
        corner: "1", shot: "2",
        priority: ["left"]
    },
    Henta_RightTrap_att3: {
        def_line: "1", press_line: "2", def_width: "2", press_intense: "4",
        build_type: "1", build_temp: "2", build_long: "3", build_fast: "3",
        style: "3", pass_risk: "2", dribble: "3", cross: "3",
        corner: "1", shot: "2",
        priority: ["right"]
    },
    Henta_WideTrap_att3: {
        def_line: "1", press_line: "2", def_width: "3", press_intense: "4",
        build_type: "1", build_temp: "2", build_long: "3", build_fast: "3",
        style: "3", pass_risk: "2", dribble: "3", cross: "4",
        corner: "1", shot: "2",
        priority: ["left", "right"]
    },
    Henta_CounterTrap_att4: {
        def_line: "1", press_line: "2", def_width: "2", press_intense: "4",
        build_type: "1", build_temp: "3", build_long: "4", build_fast: "4",
        style: "4", pass_risk: "3", dribble: "3", cross: "3",
        corner: "1", shot: "3",
        priority: ["left", "right"]
    },
    Henta_CentralTrap_att3: {
        def_line: "1", press_line: "2", def_width: "1", press_intense: "4",
        build_type: "2", build_temp: "2", build_long: "1", build_fast: "2",
        style: "3", pass_risk: "3", dribble: "2", cross: "1",
        corner: "1", shot: "2",
        priority: ["center"]
    }
};

const BASE_LABELS = {
    standard: "Стандартная",
    Simeone_LowBlock_def5: "Simeone Low Block",
    Simeone_Compact442_def4: "Simeone Compact",
    Mourinho_WeakSide_def3: "Mourinho Weak Side",
    Henta_Hold_def3: "Henta Hold",
    Pep_StandardControl_bal3: "Pep Standard Control",
    Xabi_BoxMidfield_bal3: "Xabi Box Midfield",
    Pep_BoxControl_bal2: "Pep Box Control",
    Pep_ControlledPush_att3: "Pep Controlled Push",
    Xabi_VerticalBox_att3: "Xabi Vertical Box",
    Pep_PressCooldown_bal2: "Pep Press Cooldown",
    Compact_Counter_def3: "Compact Counter",
    DeZerbi_BaitPress_bal3: "De Zerbi Bait Press",
    Conte_WingbackWidth_bal4: "Conte Wingback Width",
    Klopp_Gegenpress_att4: "Klopp Gegenpress",
    Bielsa_ChaosPress_att5: "Bielsa Chaos Press",
    Pep_TwoThreeFive_att3: "Pep Positional Attack",
    DeZerbi_Release_att4: "De Zerbi Release",
    Klopp_WideTrap_att4: "Klopp Wide Trap",
    Henta_LeftTrap_att3: "Henta Left Trap",
    Henta_RightTrap_att3: "Henta Right Trap",
    Henta_WideTrap_att3: "Henta Wide Trap",
    Henta_CounterTrap_att4: "Henta Counter Trap",
    Henta_CentralTrap_att3: "Henta Central Trap"
};

const DEFAULT_CUSTOM_PRESETS = {
    balanced: {
        def_line: "2", press_line: "2", def_width: "2", press_intense: "3",
        build_type: "2", build_temp: "2", build_long: "2", build_fast: "2",
        style: "3", pass_risk: "3", dribble: "2", cross: "2",
        corner: "1", shot: "2",
        priority: ["center"]
    },
    attack: {
        def_line: "3", press_line: "3", def_width: "3", press_intense: "4",
        build_type: "3", build_temp: "3", build_long: "2", build_fast: "3",
        style: "5", pass_risk: "4", dribble: "4", cross: "3",
        corner: "1", shot: "3",
        priority: ["left"]
    },
    defense: {
        def_line: "1", press_line: "1", def_width: "1", press_intense: "2",
        build_type: "1", build_temp: "1", build_long: "1", build_fast: "1",
        style: "1", pass_risk: "1", dribble: "1", cross: "1",
        corner: "1", shot: "1",
        priority: ["right"]
    }
};

const STATE = {
    liveParserTimer: null,
    lastSavedBucket: null,
    liveWaitStatus: null,
    liveStartedAt: null,
    pendingPresetEvent: null,
    liveSegmentSnapshots: {},
    recommendationFreeze: null,
    recommendationHistory: [],
    lastRecommendationHtml: null,
    lastRecommendationMeta: null,
    presetProgression: null,
    liveAutoResumeChecked: false,

    tacticWatcherStarted: false,
    lastManualTactic: null,
    manualChangeTimer: null,
    suppressManualWatcherUntil: 0,
    suppressManualWatcherReason: null

};

const LIVE_PARSER_STATE_PREFIX = "slf_live_parser_state_v2";
const LIVE_RECOMMENDATION_HISTORY_LIMIT = 8;

const LAST_PRESET_STORAGE_KEY = "slf_last_selected_preset_v1";
const RECENT_PRESETS_STORAGE_KEY = "slf_recent_selected_presets_v1";

const PresetUsageTracker = {
    getLast() {
        try {
            return JSON.parse(localStorage.getItem(LAST_PRESET_STORAGE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    },

    getLastName() {
        const last = this.getLast();
        return last && last.presetName ? String(last.presetName) : null;
    },

    getRecentNames() {
        try {
            const list = JSON.parse(localStorage.getItem(RECENT_PRESETS_STORAGE_KEY) || '[]');
            return Array.isArray(list) ? list.map(x => String(x)).filter(Boolean) : [];
        } catch (e) {
            return [];
        }
    },

    record(presetName, details = {}) {
        if (!presetName) return;

        const labels = PresetStorage && PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        const meta = typeof TacticPresetLibrary !== 'undefined' ? TacticPresetLibrary.meta[presetName] : null;
        const entry = {
            ts: Date.now(),
            presetName,
            label: labels[presetName] || meta?.title || presetName,
            gameId: details.gameId || MatchStateParser.getGameId(),
            minute: details.minute ?? null,
            bucket: details.bucket || '',
            source: details.source || 'preset_apply'
        };

        localStorage.setItem(LAST_PRESET_STORAGE_KEY, JSON.stringify(entry));

        const recent = this.getRecentNames().filter(x => x !== presetName);
        recent.unshift(presetName);
        localStorage.setItem(RECENT_PRESETS_STORAGE_KEY, JSON.stringify(recent.slice(0, 8)));

        if (typeof UI !== 'undefined' && UI.updateLastPresetBox) {
            UI.updateLastPresetBox();
        }
    },

    format(entry = this.getLast()) {
        if (!entry || !entry.presetName) {
            return 'Последний пресет: пока нет данных.';
        }

        const time = entry.ts ? new Date(entry.ts).toLocaleTimeString() : 'время неизвестно';
        const where = [entry.gameId ? `game ${entry.gameId}` : '', entry.minute != null ? `${entry.minute}'` : '', entry.bucket || '']
            .filter(Boolean)
            .join(' · ');

        return `Последний пресет: ${entry.label || entry.presetName} · ${where || 'без контекста'} · ${time}`;
    }
};

function debugLog(...args) {
    if (CONFIG.DEBUG) console.log(...args);
}

function debugWarn(...args) {
    if (CONFIG.DEBUG) console.warn(...args);
}

function toNum(value) {
    if (value == null) return null;

    const clean = String(value)
        .replace('%', '')
        .replace(',', '.')
        .trim();

    if (clean === '') return null;

    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
}

function num(value) {
    return toNum(value) || 0;
}

function normalizeTeamText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ё/g, 'е')
        .replace(/[^a-z0-9а-я]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function aliasMatchesTeamName(name, aliases) {
    const normalizedName = normalizeTeamText(name);
    const list = Array.isArray(aliases) ? aliases : [];

    if (!normalizedName || !list.length) return false;

    return list.some(alias => {
        const a = normalizeTeamText(alias);
        if (!a || a.length < 2) return false;
        return normalizedName === a || normalizedName.includes(a) || a.includes(normalizedName);
    });
}
// ============================================================
// <<< src/core/config.js


// >>> src/core/token-storage.js
// API token storage via Tampermonkey local storage.
// Do not log or expose the token value.

const SLF_API_TOKEN_STORAGE_KEY = 'slf_api_token';
let SLF_API_TOKEN_MISSING_WARNED = false;
let SLF_API_TOKEN_MENU_INSTALLED = false;

function getApiToken() {
    try {
        if (typeof GM_getValue === 'function') {
            return String(GM_getValue(SLF_API_TOKEN_STORAGE_KEY, '') || '').trim();
        }
    } catch (error) {
        console.warn('[SLF] API token read failed', error);
    }

    return '';
}

function warnMissingApiTokenOnce() {
    if (SLF_API_TOKEN_MISSING_WARNED) return;
    SLF_API_TOKEN_MISSING_WARNED = true;
    console.warn('[SLF] API token is not configured');
}

function hasApiToken() {
    return getApiToken().length > 0;
}

function installApiTokenMenuCommands() {
    if (SLF_API_TOKEN_MENU_INSTALLED) return;
    if (typeof GM_registerMenuCommand !== 'function') return;

    SLF_API_TOKEN_MENU_INSTALLED = true;

    GM_registerMenuCommand('SLF: Set API token', () => {
        try {
            if (typeof GM_setValue !== 'function') {
                console.warn('[SLF] GM_setValue is unavailable');
                return;
            }

            const current = hasApiToken() ? 'configured' : 'not configured';
            const value = prompt(`SLF API token (${current}). Enter new token:`, '');
            if (value == null) return;

            const token = String(value || '').trim();
            if (!token) {
                console.warn('[SLF] Empty API token was not saved');
                return;
            }

            GM_setValue(SLF_API_TOKEN_STORAGE_KEY, token);
            SLF_API_TOKEN_MISSING_WARNED = false;
            console.info('[SLF] API token saved');
        } catch (error) {
            console.warn('[SLF] API token save failed', error);
        }
    });

    GM_registerMenuCommand('SLF: Clear API token', () => {
        try {
            if (typeof GM_deleteValue !== 'function') {
                console.warn('[SLF] GM_deleteValue is unavailable');
                return;
            }

            GM_deleteValue(SLF_API_TOKEN_STORAGE_KEY);
            SLF_API_TOKEN_MISSING_WARNED = false;
            console.info('[SLF] API token cleared');
        } catch (error) {
            console.warn('[SLF] API token clear failed', error);
        }
    });

    GM_registerMenuCommand('SLF: Show API token status', () => {
        const status = hasApiToken() ? 'configured' : 'not configured';
        alert(`SLF API token: ${status}`);
    });
}

installApiTokenMenuCommands();
// <<< src/core/token-storage.js


// >>> src/modules/transfer-analyzer/config.js
// 1.x Transfer Analyzer Config
// ============================================================

CONFIG.TRANSFER_ANALYZER = {
    cacheTtlDays: 7,
    requestDelayMs: 900,

    slfAlter: {
        cacheTtlDays: 1,
        eligibleMinutesPct: 40
    },

    ageGroups: {
        academyMax: 18,
        growthMax: 21,
        lateGrowthMax: 24,
        primeMax: 29,
        shortTermMax: 32
    },

    tmValue: {
        high: 1000000,
        good: 300000,
        normal: 100000
    },

    valueTrend: {
        nearPeakRatio: 0.80,
        stillValuableRatio: 0.50,
        belowPeakRatio: 0.20,
        fallenRatio: 0.10,
        oldPeakYears: 5
    },

    currentClub: {
        retiredTerms: [
            'retired',
            'career break',
            'career ended',
            'завершил карьеру'
        ],

        freeAgentTerms: [
            'without club',
            'no club',
            'free agent',
            'vereinslos',
            'без клуба'
        ]
    },

    agent: {
        noAgentTerms: [
            'no agent',
            'without agent',
            'no agency',
            'kein berater',
            'без агента'
        ]
    },

    verdict: {
        priorityScore: 13,
        targetScore: 8,
        watchlistScore: 3,

        highRiskRedFlags: 3,
        manualCheckRedFlags: 1
    },

    eliteAcademies: [
        { label: 'Benfica academy', patterns: ['benfica', 'sl benfica'] },
        {
            label: 'Barcelona / La Masia',
            patterns: [
                'barcelona',
                'fc barcelona',
                'la masia',
                'barça',
                'barca',
                'barça youth',
                'barca youth',
                'barça u16',
                'barca u16',
                'barça u18',
                'barca u18',
                'barça u19',
                'barca u19',
                'barça atlètic',
                'barca atletic',
                'fc barcelona u16',
                'fc barcelona u18',
                'fc barcelona u19'
            ]
        },
        { label: 'Ajax academy', patterns: ['ajax', 'afc ajax'] },
        { label: 'River Plate academy', patterns: ['river plate'] },
        { label: 'Boca Juniors academy', patterns: ['boca juniors'] },
        { label: 'Sporting CP academy', patterns: ['sporting cp', 'sporting lisbon', 'sporting clube'] },
        { label: 'Real Madrid academy', patterns: ['real madrid', 'real madrid castilla'] },
        { label: 'Lyon academy', patterns: ['olympique lyon', 'lyon'] },
        { label: 'Dinamo Zagreb academy', patterns: ['dinamo zagreb'] },
        { label: 'Dynamo Kyiv academy', patterns: ['dynamo kyiv', 'dinamo kiev'] },
        { label: 'Shakhtar academy', patterns: ['shakhtar'] },
        { label: 'PSV academy', patterns: ['psv'] },
        { label: 'Feyenoord academy', patterns: ['feyenoord'] },
        { label: 'Porto academy', patterns: ['porto', 'fc porto'] },
        { label: 'Chelsea academy', patterns: ['chelsea'] },
        { label: 'Man City academy', patterns: ['manchester city', 'man city'] },
        { label: 'Arsenal academy', patterns: ['arsenal'] },
        { label: 'Liverpool academy', patterns: ['liverpool'] },
        { label: 'PSG academy', patterns: ['paris saint-germain', 'psg'] },
        { label: 'Bayern academy', patterns: ['bayern', 'bayern munich'] },
        { label: 'Dortmund academy', patterns: ['borussia dortmund', 'dortmund'] },
        { label: 'Atalanta academy', patterns: ['atalanta'] },
        { label: 'Partizan academy', patterns: ['partizan'] },
        { label: 'Crvena Zvezda academy', patterns: ['crvena zvezda', 'red star'] },
        { label: 'Flamengo academy', patterns: ['flamengo'] },
        { label: 'São Paulo academy', patterns: ['sao paulo', 'são paulo'] },
        { label: 'Palmeiras academy', patterns: ['palmeiras'] },
        { label: 'Vélez academy', patterns: ['velez', 'vélez'] },
        { label: 'Defensor Sporting academy', patterns: ['defensor sporting'] }
    ],

    strongAcademies: [
        { label: 'Brighton strong club trace', patterns: ['brighton'] },
        { label: 'Southampton academy', patterns: ['southampton'] },
        { label: 'Athletic Bilbao academy', patterns: ['athletic bilbao', 'athletic club'] },
        { label: 'Villarreal academy', patterns: ['villarreal'] },
        { label: 'Valencia academy', patterns: ['valencia'] },
        { label: 'Sevilla academy', patterns: ['sevilla'] },
        { label: 'Monaco academy', patterns: ['monaco'] },
        { label: 'Rennes academy', patterns: ['rennes'] },
        { label: 'Lille academy', patterns: ['lille'] },
        { label: 'AZ academy', patterns: ['az alkmaar', 'az'] },
        { label: 'Anderlecht academy', patterns: ['anderlecht'] },
        { label: 'Genk academy', patterns: ['genk'] },
        { label: 'Club Brugge academy', patterns: ['club brugge'] },
        { label: 'Basel academy', patterns: ['basel'] },
        { label: 'Salzburg academy', patterns: ['salzburg', 'red bull salzburg'] },
        { label: 'Nordsjaelland academy', patterns: ['nordsjaelland', 'nordsjælland'] },
        { label: 'Midtjylland academy', patterns: ['midtjylland'] },
        { label: 'Hajduk academy', patterns: ['hajduk split'] },
        { label: 'Sparta Prague academy', patterns: ['sparta prague'] },
        { label: 'Slavia Prague academy', patterns: ['slavia prague'] }
    ]
};
// ============================================================
// <<< src/modules/transfer-analyzer/config.js


// >>> src/core/dom-utils.js
// 1.5 DOM / UI Mount Helpers
// ============================================================

const DomUtils = {
    waitForElement(selector, callback, maxTries = 50, delay = 100) {
        let tries = 0;

        const check = () => {
            const el = document.querySelector(selector);

            if (el) {
                callback(el);
                return;
            }

            tries++;

            if (tries >= maxTries) return;

            setTimeout(check, delay);
        };

        check();
    },

    installObserver(callback) {
        if (window.__slf_ui_observer_installed) return;
        window.__slf_ui_observer_installed = true;

        let scheduled = false;

        const run = () => {
            if (scheduled) return;

            scheduled = true;

            setTimeout(() => {
                scheduled = false;
                callback();
            }, 150);
        };

        const observer = new MutationObserver(run);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        run();
    }
};
    // ============================================================
// <<< src/core/dom-utils.js


// >>> src/core/api.js
    // 2. VPS API Layer
    // ============================================================

    function buildApiAuthorizationHeader() {
        const token = getApiToken();
        if (!token) warnMissingApiTokenOnce();
        return "Bearer " + token;
    }

    const Api = {
        postPromise(collection, data, label) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${CONFIG.SERVER_URL}/api/${collection}`,
                    headers: {
                        "Authorization": buildApiAuthorizationHeader(),
                        "Content-Type": "application/json"
                    },
                    data: JSON.stringify(data),
                    onload: r => resolve({ response: r, status: r.status, data }),
                    onerror: e => reject(e)
                });
            });
        },

        post(collection, data, label) {
            return this.postPromise(collection, data, label)
                .then(result => {
                    debugLog(`[SLF] ${label || collection} saved:`, result.status, data);
                    return result;
                })
                .catch(error => {
                    debugWarn(`[SLF] ${label || collection} save error:`, error);
                    throw error;
                });
        },

        postAppend(collection, data, label) {
            const payload = Array.isArray(data) ? data : [data];
            return this.post(`${collection}?mode=append`, payload, label || `${collection} append`);
        },

        clearCollection(collection, label) {
            return this.post(collection, [], label || `${collection} clear`);
        },

        getPromise(collection) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `${CONFIG.SERVER_URL}/api/${collection}`,
                    headers: {
                        "Authorization": buildApiAuthorizationHeader()
                    },
                    onload: r => {
                        try {
                            resolve({ data: JSON.parse(r.responseText), response: r, status: r.status });
                        } catch (e) {
                            reject({ error: e, response: r });
                        }
                    },
                    onerror: e => reject({ error: e })
                });
            });
        },

        get(collection, onSuccess, onError) {
            return this.getPromise(collection)
                .then(({ data, response }) => {
                    if (onSuccess) onSuccess(data, response);
                    return data;
                })
                .catch(payload => {
                    if (onError) onError(payload.error || payload, payload.response);
                    throw payload.error || payload;
                });
        },

        getAnalysis(onSuccess, onError) {
            return this.get("analysis", onSuccess, onError);
        }
    };

    function normalizeServerRows(data) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.items)) return data.items;
        if (Object.keys(data).length === 0) return [];
        return [data];
    }

    function payloadType(data) {
        if (Array.isArray(data)) return 'array';
        if (!data) return String(data);
        if (typeof data === 'object' && Object.keys(data).length === 0) return 'empty_object';
        return typeof data;
    }

    function fetchCanonicalApiStatus() {
        const specs = [
            { key: 'snapshots', label: 'Snapshots v2', collection: CONFIG.COLLECTIONS.MATCH_SNAPSHOTS },
            { key: 'results', label: 'Match results v2', collection: CONFIG.COLLECTIONS.MATCH_RESULTS },
            { key: 'events', label: 'Preset events v2', collection: CONFIG.COLLECTIONS.PRESET_EVENTS },
            { key: 'effects', label: 'Preset effects v2', collection: CONFIG.COLLECTIONS.PRESET_EFFECTS },
            { key: 'players', label: 'Player observations', collection: CONFIG.COLLECTIONS.PLAYER_OBSERVATIONS },
            { key: 'transfers', label: 'Transfer history', collection: CONFIG.COLLECTIONS.TRANSFER_HISTORY },
            { key: 'tactics', label: 'Tactics', collection: CONFIG.COLLECTIONS.TACTICS }
        ];

        return Promise.all(specs.map(spec => {
            return Api.getPromise(spec.collection)
                .then(({ data }) => {
                    const rows = normalizeServerRows(data);
                    return Object.assign({}, spec, {
                        ok: true,
                        count: rows.length,
                        rows,
                        payloadType: payloadType(data)
                    });
                })
                .catch(error => Object.assign({}, spec, {
                    ok: false,
                    count: 0,
                    rows: [],
                    error
                }));
        })).then(items => {
            const collections = {};
            const gameIds = new Set();

            items.forEach(item => {
                collections[item.key] = item;
                if (['snapshots', 'results', 'events', 'effects'].includes(item.key)) {
                    item.rows.forEach(row => {
                        if (row && row.gameId) gameIds.add(String(row.gameId));
                    });
                }
            });

            return {
                generatedAt: new Date().toISOString(),
                schema: 'slf_canonical_api_status_v1',
                games: gameIds.size,
                collections
            };
        });
    }

    function legacyCollectionNames() {
        return [
            CONFIG.LEGACY_COLLECTIONS.MATCH_SNAPSHOTS,
            CONFIG.LEGACY_COLLECTIONS.MATCH_RESULTS,
            CONFIG.LEGACY_COLLECTIONS.PRESET_EVENTS,
            CONFIG.LEGACY_COLLECTIONS.PRESET_EFFECTS
        ];
    }

    // ============================================================
// <<< src/core/api.js


// >>> src/modules/tactics-presets/preset-storage.js
    // 3. Preset Storage
    // ============================================================

    function unwrapServerData(data) {
        if (data && typeof data === 'object') {
            if (data.data && typeof data.data === 'object') return data.data;
            if (data.value && typeof data.value === 'object') return data.value;
            if (data.presets && typeof data.presets === 'object') return data.presets;
            if (data.tactics && typeof data.tactics === 'object') return data.tactics;
        }

        return data;
    }

    function isTacticObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

        return [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross', 'shot', 'priority'
        ].some(k => Object.prototype.hasOwnProperty.call(obj, k));
    }

    function normalizePresets(data) {
        data = unwrapServerData(data);

        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

        const result = {};

        for (let key in data) {
            const preset = data[key];
            if (!isTacticObject(preset)) continue;

            result[key] = Object.assign({}, preset);
            delete result[key]['dark-theme'];

            for (let field in result[key]) {
                if (field !== 'priority' && result[key][field] != null) {
                    result[key][field] = String(result[key][field]);
                }
            }

            if (typeof result[key].priority === 'string') {
                result[key].priority = [result[key].priority];
            }

            if (!Array.isArray(result[key].priority)) {
                result[key].priority = [];
            }
        }

        return result;
    }

    const PresetStorage = {
        loadLocalRaw() {
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                return data ? normalizePresets(JSON.parse(data)) : null;
            } catch (e) {
                debugWarn('[SLF] Ошибка чтения localStorage', e);
                return null;
            }
        },

        saveLocalOnly(customPresets) {
            localStorage.setItem(
                CONFIG.STORAGE_KEY,
                JSON.stringify(normalizePresets(customPresets))
            );
        },

        loadCustom() {
            const local = this.loadLocalRaw();

            if (!local) {
                this.saveLocalOnly(DEFAULT_CUSTOM_PRESETS);
                return Object.assign({}, DEFAULT_CUSTOM_PRESETS);
            }

            return local;
        },

        saveCustom(customPresets) {
            const normalized = normalizePresets(customPresets);
            this.saveLocalOnly(normalized);
            Api.post(CONFIG.COLLECTIONS.TACTICS, normalized, 'tactics');
        },

        loadFromServerAndMerge(callback) {
            Api.get(
                CONFIG.COLLECTIONS.TACTICS,
                data => {
                    const serverData = normalizePresets(data);
                    const localData = this.loadLocalRaw() || {};
                    this.saveLocalOnly(Object.assign({}, localData, serverData));

                    if (callback) callback();
                },
                () => {
                    if (callback) callback();
                }
            );
        },

        getAllPresets() {
            // Built-in canonical library wins over older locally/server-saved copies with the same names.
            // User custom presets with unique names are still preserved.
            return Object.assign({}, this.loadCustom(), BASE_PRESETS);
        },

        getAllLabels() {
            const customPresets = this.loadCustom();
            const labels = Object.assign({}, BASE_LABELS);

            for (let key in customPresets) {
                labels[key] = BASE_LABELS[key] || key;
            }

            return labels;
        }
    };

    // ============================================================
// <<< src/modules/tactics-presets/preset-storage.js


// >>> src/modules/tactics-presets/tactic-control-engine.js
    // 4. Tactic Control Engine
    // ============================================================

    function nativeClick(element) {
        if (!element) return;

        try {
            element.click();
            return;
        } catch (e) {}

        const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
        const eventInit = { bubbles: true, cancelable: true };

        if (rect) {
            eventInit.clientX = rect.left + rect.width / 2;
            eventInit.clientY = rect.top + rect.height / 2;
        }

        element.dispatchEvent(new MouseEvent('click', eventInit));
    }

    function priorityNameToValue(name) {
        if (name === 'priority_l') return 'left';
        if (name === 'priority_c') return 'center';
        if (name === 'priority_r') return 'right';
        return '';
    }

    async function setPriorityAsync(value) {
        const values = Array.isArray(value) ? value : [value];
        const allCB = document.querySelectorAll('input[type="checkbox"][name^="priority_"]');

        for (let cb of allCB) {
            const priorityValue = priorityNameToValue(cb.name);
            const shouldBeChecked = values.includes(priorityValue);

            if (cb.checked !== shouldBeChecked) {
                const label = cb.closest('label');
                if (label) nativeClick(label);
                else nativeClick(cb);

                await new Promise(r => setTimeout(r, 80));
            }
        }

        return true;
    }

    async function setControlAsync(key, value) {
        return new Promise(resolve => {
            setTimeout(async () => {
                if (key === 'priority') {
                    resolve(await setPriorityAsync(value));
                    return;
                }

                const el = document.querySelector(`input[name="${key}"][value="${value}"]`);

                if (!el) {
                    debugWarn('[SLF] Не найден элемент:', key, value);
                    resolve(false);
                    return;
                }

                if (!el.checked) {
                    const label = el.closest('label');
                    if (label) nativeClick(label);
                    else nativeClick(el);
                }

                resolve(true);
            }, 20);
        });
    }

    function getCurrentTactic() {
        const groups = {};

        document.querySelectorAll('input[type="radio"][name]:checked').forEach(el => {
            groups[el.name] = el.value;
        });

        document.querySelectorAll('input[type="checkbox"][name]:checked').forEach(el => {
            if (el.name.startsWith('priority_')) return;
            groups[el.name] = el.value;
        });

        const priorities = [];

        document.querySelectorAll('input[type="checkbox"][name^="priority_"]:checked').forEach(el => {
            const value = priorityNameToValue(el.name);
            if (value) priorities.push(value);
        });

        groups.priority = priorities;

        return normalizePresets({ current: groups }).current || groups;
    }

    async function applyPresetAsync(name) {
        const presets = PresetStorage.getAllPresets();
        const preset = presets[name];

        if (!preset || typeof preset !== 'object') {
            debugWarn('[SLF] Пресет не найден:', name);
            return false;
        }

        const beforeSnapshot = location.pathname.includes('/game.php')
            ? SnapshotEngine.build()
            : null;

        STATE.suppressManualWatcherUntil = Date.now() + 2500;
        STATE.suppressManualWatcherReason = `preset:${name}`;

        const allowedKeys = [
            'def_line', 'press_line', 'def_width', 'press_intense',
            'build_type', 'build_temp', 'build_long', 'build_fast',
            'style', 'pass_risk', 'dribble', 'cross',
            'corner', 'shot', 'priority'
        ];

        for (let key of allowedKeys) {
            if (!Object.prototype.hasOwnProperty.call(preset, key)) continue;
            await setControlAsync(key, preset[key]);
        }

        const labels = PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        const presetLabel = labels[name] || TacticPresetLibrary?.meta?.[name]?.title || name;

        if (location.pathname.includes('/game.php') && beforeSnapshot?.myTeam) {
            EventTracker.savePresetEvent(name, preset, beforeSnapshot);
        } else {
            PresetUsageTracker.record(name, {
                gameId: MatchStateParser.getGameId(),
                minute: beforeSnapshot?.minute ?? null,
                bucket: beforeSnapshot?.bucket || '',
                source: 'preset_apply'
            });
        }

        UI.addParserLog(`Пресет выбран: ${presetLabel}`);

        STATE.lastManualTactic = getCurrentTactic();
        STATE.suppressManualWatcherUntil = Date.now() + 800;
        STATE.suppressManualWatcherReason = `preset:${name}`;

        return true;
    }

    // ============================================================
// <<< src/modules/tactics-presets/tactic-control-engine.js


// >>> src/modules/live-parser/match-state-parser.js
    // 5. Match State Parser
    // ============================================================

    const MatchTimingModel = {
        OFFICIAL_MATCH_MINUTES: 90,
        REAL_MATCH_MINUTES: 36,
        GAME_MINUTES_PER_REAL_MINUTE: 90 / 36,
        GENERATION_WINDOWS: [
            { index: 1, from: 1, to: 15, label: '01-15', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 2, from: 16, to: 30, label: '16-30', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 3, from: 31, to: 45, label: '31-45', generationMinutes: 15, realMinutes: 6, phase: 'first_half' },
            { index: 4, from: 46, to: 60, label: '46-60', generationMinutes: 15, realMinutes: 6, phase: 'second_half' },
            { index: 5, from: 61, to: 75, label: '61-75', generationMinutes: 15, realMinutes: 6, phase: 'second_half' },
            { index: 6, from: 76, to: 84, label: '76-84', generationMinutes: 9, realMinutes: 3.6, phase: 'late' },
            { index: 7, from: 85, to: 90, label: '85-90', generationMinutes: 6, realMinutes: 2.4, phase: 'final_5', isFinal: true }
        ],

        clampMinute(minute) {
            const n = Number(minute);
            if (!Number.isFinite(n) || n < 1) return null;
            return Math.min(Math.max(Math.floor(n), 1), this.OFFICIAL_MATCH_MINUTES);
        },

        getWindow(minute) {
            const m = this.clampMinute(minute);
            if (!m) {
                return {
                    index: 0,
                    from: 0,
                    to: 0,
                    label: '0',
                    generationMinutes: 0,
                    realMinutes: 0,
                    phase: 'unknown',
                    next: null
                };
            }

            const current = this.GENERATION_WINDOWS.find(w => m >= w.from && m <= w.to) || this.GENERATION_WINDOWS[this.GENERATION_WINDOWS.length - 1];
            const next = this.GENERATION_WINDOWS.find(w => w.index === current.index + 1) || null;

            return Object.assign({}, current, {
                next: next ? Object.assign({}, next) : null,
                effectiveMinute: m,
                realMinuteEstimate: Number((m / this.GAME_MINUTES_PER_REAL_MINUTE).toFixed(2)),
                realMatchDurationMinutes: this.REAL_MATCH_MINUTES,
                officialMatchMinutes: this.OFFICIAL_MATCH_MINUTES
            });
        },

        getTargetWindowAfterChange(minute) {
            const current = this.getWindow(minute);
            return current.next || current;
        },

        getLegacyTenMinuteBucket(minute) {
            if (!minute || minute < 1) return '0';
            const start = Math.floor((minute - 1) / 10) * 10 + 1;
            return `${start}-${Math.min(start + 9, this.OFFICIAL_MATCH_MINUTES)}`;
        }
    };

    const MatchStateParser = {
        getGameId() {
            return new URLSearchParams(location.search).get('id');
        },

        getStatus() {
            const text = (document.body.innerText || '').toLowerCase();

            if (/матч\s+окончен|финальный\s+свисток|звучит\s+финальный\s+свисток|игра\s+окончена/i.test(text)) return 'finished';
            if (/ид[её]т\s+'?\d{1,3}(?:\+\d{1,2})?\s*мин/i.test(text)) return 'live';
            if (/перерыв|между\s+таймами|первый\s+тайм\s+заверш|команды\s+ушли\s+на\s+перерыв/i.test(text)) return 'halftime';

            return 'unknown';
        },

        isActiveLiveStatus(status) {
            return status === 'live' || status === 'halftime' || status === 'unknown';
        },

        readMinuteInfo() {
            const text = document.body.innerText || '';
            const m = text.match(/ид[её]т\s+'?(\d{1,3})(?:\+(\d{1,2}))?\s*мин/i);
            if (!m) {
                return {
                    rawMinute: null,
                    baseMinute: null,
                    stoppageMinute: 0,
                    effectiveMinute: null,
                    isStoppage: false
                };
            }

            const baseMinute = Number(m[1]);
            const stoppageMinute = m[2] ? Number(m[2]) : 0;
            const rawMinute = stoppageMinute ? `${baseMinute}+${stoppageMinute}` : String(baseMinute);
            const effectiveMinute = MatchTimingModel.clampMinute(baseMinute);

            return {
                rawMinute,
                baseMinute,
                stoppageMinute,
                effectiveMinute,
                isStoppage: stoppageMinute > 0 || baseMinute > MatchTimingModel.OFFICIAL_MATCH_MINUTES
            };
        },

        readMinute() {
            return this.readMinuteInfo().effectiveMinute;
        },

        getBucket(minute) {
            return MatchTimingModel.getWindow(minute).label;
        },

        getGenerationWindow(minute) {
            return MatchTimingModel.getWindow(minute);
        },

        getLegacyTenMinuteBucket(minute) {
            return MatchTimingModel.getLegacyTenMinuteBucket(minute);
        },

        readScore() {
            const scoreCells = [...document.querySelectorAll('.score_board .indarkbig div')];

            if (scoreCells.length >= 2) {
                return {
                    home: toNum(scoreCells[0].innerText.trim() || 0),
                    away: toNum(scoreCells[1].innerText.trim() || 0)
                };
            }

            return null;
        }
    };

    // ============================================================
// <<< src/modules/live-parser/match-state-parser.js


// >>> src/modules/live-parser/match-stats-parser.js
// 6. Match Stats Parser
// ============================================================

const MatchStatsParser = {
    readTeamNames() {
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
    }
};

    // ============================================================
// <<< src/modules/live-parser/match-stats-parser.js


// >>> src/modules/live-parser/squad-parser.js
    // 7. Lineup / Squad Parser
    // ============================================================

    const SquadParser = {
        normalizePosition(raw) {
            if (!raw) return null;

            const p = String(raw).toLowerCase();

            if (p === 'sub') return 'SUB';
            if (p === 'gk') return 'GK';

            if (p === 'ld') return 'DL';
            if (p === 'rd') return 'DR';
            if (p.startsWith('cd')) return 'DC';

            if (p.startsWith('dm')) return 'DM';
            if (p.startsWith('cm')) return 'CM';
            if (p.startsWith('am')) return 'AM';

            if (p === 'lm' || p === 'lw') return 'ML';
            if (p === 'rm' || p === 'rw') return 'MR';

            if (p.startsWith('st')) return 'ST';

            return String(raw).toUpperCase();
        },

        parsePlayerText(text) {
            const clean = String(text || '').trim().replace(/\s+/g, ' ');
            const parts = clean.split(' ');

            const rawPositions = parts.shift() || '';
            const positions = rawPositions
                .split('/')
                .map(p => p.trim().toUpperCase())
                .filter(Boolean);

            const numbers = clean.match(/\d+(?:[.,]\d+)?/g) || [];
            const displayMetric = numbers.length ? toNum(numbers[numbers.length - 1]) : null;

            let displayMetricMode = 'unknown';

            if (displayMetric != null) {
                if (displayMetric <= 10) {
                    displayMetricMode = 'matchRating';
                } else if (displayMetric <= 100) {
                    displayMetricMode = 'fitness';
                } else {
                    displayMetricMode = 'skill';
                }
            }

            // Do not persist match ratings or fitness. Only skill is useful for squad/tactical analytics.
            const skill = displayMetricMode === 'skill' ? displayMetric : null;
            const storedDisplayMetric = displayMetricMode === 'skill' ? displayMetric : null;
            const storedDisplayMetricMode = displayMetricMode === 'skill' ? 'skill' : 'not_logged';

            let namePart = clean;

            if (rawPositions) {
                namePart = namePart.replace(rawPositions, '').trim();
            }

            if (numbers.length) {
                const firstNumberIndex = namePart.search(/\d+(?:[.,]\d+)?/);
                if (firstNumberIndex >= 0) {
                    namePart = namePart.slice(0, firstNumberIndex).trim();
                }
            }

           let finalName = namePart || null;

if (!finalName || /^\d+$/.test(finalName)) {
    const positionPattern = /\b(GK|LD|RD|CD\d*|DM\d*|CM\d*|AM\d*|LW|RW|ST\d*|SUB|LM|RM)\b/gi;

    const cleanedName = clean
        .replace(positionPattern, '')
        .replace(/\d+(?:[.,]\d+)?/g, '')
        .replace(/[^\p{L}.\-\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanedName.length >= 2) {
        finalName = cleanedName;
    }
}

return {
    rawPositions,
    positions,
    primaryPosition: positions[0] || null,
    name: finalName,
    displayMetric: storedDisplayMetric,
    displayMetricMode: storedDisplayMetricMode,
    skill
};
        },

        readExactSlotMap() {
            const map = new Map();
            const slotRe = /^(GK|LD|DL|RD|DR|CD\d*|DC\d*|DM\d*|CM\d*|AM\d*|LM|ML|LW|RM|MR|RW|ST\d*)$/i;
            const candidateSelectors = [
                '[data-position]',
                '[data-pos]',
                '[data-role]',
                '[pos]'
            ];

            const candidates = [...document.querySelectorAll(candidateSelectors.join(','))];

            candidates.forEach(el => {
                if (!el || el.closest('#slf-match-parser-panel, #slf-data-page, #slf-tactics-dropdown, #slf-save-dialog')) return;

                const rawSlot =
                    el.dataset?.position ||
                    el.dataset?.pos ||
                    el.dataset?.role ||
                    el.getAttribute('pos') ||
                    '';

                const slot = String(rawSlot || '').trim().toUpperCase();
                if (!slotRe.test(slot)) return;

                const href = el.querySelector('a[href*="player.php"]')?.getAttribute('href') || '';
                const hrefId = href.match(/[?&]id=(\d+)/)?.[1] || null;
                const idAttr = String(el.id || el.querySelector('[id*="lineup_player_"]')?.id || '');
                const idMatch = idAttr.match(/lineup_player_(\d+)/) || idAttr.match(/player[_-]?(\d+)/i);
                const playerId = toNum(hrefId || idMatch?.[1]);

                if (!playerId) return;

                map.set(String(playerId), {
                    playerId,
                    slot,
                    source: 'grid_data_position',
                    text: (el.innerText || '').trim().replace(/\s+/g, ' ')
                });
            });

            return map;
        },

        readLineupRows() {
            const rows = [...document.querySelectorAll('tr[id^="lineup_player_"]')];
            const exactSlotMap = this.readExactSlotMap();

            return rows.map((row, index) => {
                const playerId = row.id.replace('lineup_player_', '');
                const parsed = this.parsePlayerText(row.innerText);
                const exactSlot = exactSlotMap.get(String(toNum(playerId))) || null;

                const position = exactSlot?.slot || row.dataset.position || parsed.primaryPosition || null;
                const normalizedPosition = this.normalizePosition(position);

                const isStarter = index < 22;
                const side = index < 11
                    ? 'home'
                    : index < 22
                        ? 'away'
                        : 'sub';

                return {
                    index,
                    playerId: toNum(playerId),
                    side,
                    isStarter,
                    position,
                    gridPosition: exactSlot?.slot || null,
                    slotSource: exactSlot?.source || (row.dataset.position ? 'lineup_dataset' : 'lineup_text'),
                    normalizedPosition,
                    positions: parsed.positions,
                    line: toNum(row.dataset.line),
                    name: parsed.name,

                    displayMetric: parsed.displayMetric,
                    displayMetricMode: parsed.displayMetricMode,
                    skill: parsed.skill,

                    text: row.innerText.trim().replace(/\s+/g, ' ')
                };
            });
        },

        buildFormationFromRows(rows) {
            const counts = {};

            rows.forEach(player => {
                const pos = player.normalizedPosition || this.normalizePosition(player.position);

                if (!pos || pos === 'SUB') return;

                counts[pos] = (counts[pos] || 0) + 1;
            });

            const defenders =
                (counts.DL || 0) +
                (counts.DC || 0) +
                (counts.DR || 0);

            const midfielders =
                (counts.DM || 0) +
                (counts.CM || 0) +
                (counts.AM || 0) +
                (counts.ML || 0) +
                (counts.MR || 0);

            const forwards = counts.ST || 0;

            return {
                formation: `${defenders}-${midfielders}-${forwards}`,
                positions: counts
            };
        },

        readFormation() {
            const rows = this.readLineupRows();

            const homeStarters = rows.filter(p => p.side === 'home' && p.isStarter);
            const awayStarters = rows.filter(p => p.side === 'away' && p.isStarter);

            return {
                home: this.buildFormationFromRows(homeStarters),
                away: this.buildFormationFromRows(awayStarters)
            };
        }
    };

   // ============================================================
// <<< src/modules/live-parser/squad-parser.js


// >>> src/modules/live-parser/snapshot-engine.js
// 8. Snapshot Engine
// ============================================================

const SnapshotEngine = {
    build() {
        const ids = MatchStatsParser.getAllTeamIds();
        const teamNames = MatchStatsParser.readTeamNames();
        const minuteInfo = MatchStateParser.readMinuteInfo();
        const minute = minuteInfo.effectiveMinute;
        const generationWindow = MatchStateParser.getGenerationWindow(minute);
        const visibleDeveloperHints = DeveloperHintParser.readHints();
        const generatorDetailMetrics = typeof GeneratorAdviceDetailsParser !== 'undefined'
            ? GeneratorAdviceDetailsParser.collect()
            : null;
        const detailHints = typeof GeneratorAdviceDetailsParser !== 'undefined'
            ? GeneratorAdviceDetailsParser.toDeveloperHints(generatorDetailMetrics)
            : [];
        const developerHints = [...visibleDeveloperHints, ...detailHints]
            .filter((hint, index, arr) => {
                const key = String(hint?.text || '').trim().toLowerCase();
                return key && arr.findIndex(x => String(x?.text || '').trim().toLowerCase() === key) === index;
            });
        const generatorQualitySignal = DeveloperHintParser.getGeneratorQualitySignal(developerHints);
        if (generatorDetailMetrics?.quality?.detected && !generatorQualitySignal.detected) {
            Object.assign(generatorQualitySignal, generatorDetailMetrics.quality, {
                schema: 'slf_generator_quality_signal_v1',
                confidenceBoost: Math.min(0.35, 0.12 + Math.abs(generatorDetailMetrics.quality.percent || 0) / 100),
                source: 'advice_long_quality_title'
            });
        }
        const generatorExpectedPerformance = typeof GeneratorExpectedPerformanceParser !== 'undefined'
            ? GeneratorExpectedPerformanceParser.parse(developerHints)
            : null;
        const eventsText = MatchStatsParser.readEventsText();
        const rawStatus = MatchStateParser.getStatus();

        // Some live pages do not expose the exact status text at kick-off/refresh.
        // If the page already has match data, keep the live parser active instead of waiting on "unknown".
        const hasLiveEvidence =
            minute != null ||
            ids.length >= 2 ||
            eventsText.length > 1 ||
            !!MatchStatsParser.readXT();

        const status = rawStatus === 'unknown' && hasLiveEvidence
            ? 'live'
            : rawStatus;

        return {
            ts: Date.now(),

            gameId: MatchStateParser.getGameId(),
            status,
            rawStatus,
            statusAssumedLive: rawStatus === 'unknown' && status === 'live',

            minute,
            minuteRaw: minuteInfo.rawMinute,
            baseMinute: minuteInfo.baseMinute,
            stoppageMinute: minuteInfo.stoppageMinute,
            isStoppage: minuteInfo.isStoppage,
            bucket: generationWindow.label,
            legacyBucket: MatchStateParser.getLegacyTenMinuteBucket(minute),
            generationWindow,
            timing: {
                realMatchDurationMinutes: MatchTimingModel.REAL_MATCH_MINUTES,
                officialMatchMinutes: MatchTimingModel.OFFICIAL_MATCH_MINUTES,
                realMinuteEstimate: generationWindow.realMinuteEstimate ?? null,
                model: '36_real_minutes_generation_windows_v1'
            },

            score: MatchStateParser.readScore(),
            xT: MatchStatsParser.readXT(),

            teams: ids,
            teamNames,
            myTeam: MatchStatsParser.detectMyTeamId(ids, teamNames),

            lineupRows: SquadParser.readLineupRows(),
            formation: SquadParser.readFormation(),

            shotsTable: MatchStatsParser.readShotsTable(),
            eventsText,
            developerHints,
            generatorQualitySignal,
            generatorExpectedPerformance,
            generatorDetailMetrics,
            currentTactic: getCurrentTactic(),

            stats: ids.map(id => ({
                teamId: id,
                stats: MatchStatsParser.readFullStats(id)
            }))
        };
    },

    getScoreKey(score) {
        if (!score || typeof score !== 'object') return '?:?';
        return `${score.home ?? '?'}:${score.away ?? '?'}`;
    },

    buildSnapshotKey(snapshot) {
        if (!snapshot) return `snapshot|unknown|${Date.now()}`;

        return [
            'match_snapshot',
            snapshot.gameId || '',
            snapshot.status || '',
            snapshot.minute ?? '',
            snapshot.bucket || '',
            this.getScoreKey(snapshot.score),
            (snapshot.teams || []).join('-')
        ].join('|');
    },

    buildResultKey(snapshot) {
        if (!snapshot) return `match_result|unknown|${Date.now()}`;

        return [
            'match_result',
            snapshot.gameId || '',
            'finished_match',
            this.getScoreKey(snapshot.score),
            (snapshot.teams || []).join('-')
        ].join('|');
    },

    buildSnapshotRecord(snapshot) {
        return Object.assign({}, snapshot, {
            recordType: 'match_snapshot',
            schemaVersion: 2,
            parserVersion: 'match_snapshot_append_v1',
            snapshotKey: this.buildSnapshotKey(snapshot),
            source: {
                page: 'game',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: '4.4.72'
            }
        });
    },

    sendSnapshot(snapshot) {
        console.log('[SLF SNAPSHOT]', snapshot);

        const record = this.buildSnapshotRecord(snapshot);

        Api.postAppend(
            CONFIG.COLLECTIONS.MATCH_SNAPSHOTS,
            record,
            'snapshot history'
        );

        this.sendPlayerObservations(snapshot);
    },

    getLiveStorageKey(gameId = MatchStateParser.getGameId()) {
        return `${LIVE_PARSER_STATE_PREFIX}:${gameId || 'unknown'}`;
    },

    compactSnapshotForStorage(snapshot) {
        if (!snapshot) return null;

        return {
            ts: snapshot.ts || Date.now(),
            gameId: snapshot.gameId || null,
            status: snapshot.status || null,
            rawStatus: snapshot.rawStatus || null,
            minute: snapshot.minute ?? null,
            minuteRaw: snapshot.minuteRaw || null,
            baseMinute: snapshot.baseMinute ?? null,
            bucket: snapshot.bucket || '',
            legacyBucket: snapshot.legacyBucket || '',
            generationWindow: snapshot.generationWindow || null,
            score: snapshot.score || null,
            xT: snapshot.xT || null,
            teams: Array.isArray(snapshot.teams) ? snapshot.teams : [],
            teamNames: snapshot.teamNames || {},
            myTeam: snapshot.myTeam || null,
            stats: Array.isArray(snapshot.stats) ? snapshot.stats : [],
            eventsText: Array.isArray(snapshot.eventsText) ? snapshot.eventsText.slice(0, 12) : [],
            developerHints: Array.isArray(snapshot.developerHints) ? snapshot.developerHints.slice(0, 8) : [],
            generatorQualitySignal: snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(snapshot.developerHints || []),
            generatorExpectedPerformance: snapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(snapshot.developerHints || []) : null),
            currentTactic: snapshot.currentTactic || null
        };
    },

    compactSegmentSnapshotsForStorage() {
        const result = {};
        const source = STATE.liveSegmentSnapshots || {};

        Object.keys(source).forEach(key => {
            const rows = Array.isArray(source[key]) ? source[key] : [];
            const compactRows = rows
                .slice(-4)
                .map(snapshot => this.compactSnapshotForStorage(snapshot))
                .filter(Boolean);

            if (compactRows.length) result[key] = compactRows;
        });

        return result;
    },

    persistLiveState(extra = {}) {
        const gameId = MatchStateParser.getGameId();
        if (!gameId) return;

        const payload = Object.assign({
            schema: 'slf_live_parser_state_v2',
            active: !!STATE.liveParserTimer || !!extra.active,
            gameId,
            ts: Date.now(),
            url: location.href,
            lastSavedBucket: STATE.lastSavedBucket || null,
            liveWaitStatus: STATE.liveWaitStatus || null,
            liveStartedAt: STATE.liveStartedAt || Date.now(),
            recommendationFreeze: STATE.recommendationFreeze || null,
            pendingPresetEvent: STATE.pendingPresetEvent || null,
            presetProgression: STATE.presetProgression || null,
            lastRecommendationHtml: STATE.lastRecommendationHtml || null,
            lastRecommendationMeta: STATE.lastRecommendationMeta || null,
            liveSegmentSnapshots: this.compactSegmentSnapshotsForStorage()
        }, extra || {});

        try {
            localStorage.setItem(this.getLiveStorageKey(gameId), JSON.stringify(payload));
        } catch (e) {
            try {
                delete payload.liveSegmentSnapshots;
                localStorage.setItem(this.getLiveStorageKey(gameId), JSON.stringify(payload));
            } catch (inner) {
                debugWarn('[SLF] Live parser state persist failed', inner);
            }
        }
    },

    loadLiveState(gameId = MatchStateParser.getGameId()) {
        if (!gameId) return null;

        try {
            const raw = localStorage.getItem(this.getLiveStorageKey(gameId));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || data.schema !== 'slf_live_parser_state_v2') return null;
            if (String(data.gameId) !== String(gameId)) return null;
            return data;
        } catch (e) {
            return null;
        }
    },

    clearLiveState(gameId = MatchStateParser.getGameId()) {
        if (!gameId) return;
        try {
            localStorage.removeItem(this.getLiveStorageKey(gameId));
        } catch (e) {}
    },

    freezeRecommendationsAfterTacticChange(presetName, snapshot) {
        if (!snapshot || !snapshot.gameId || snapshot.status === 'finished') return;

        const currentWindow = snapshot.generationWindow || MatchTimingModel.getWindow(snapshot.minute);
        const targetWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot.minute);
        const preservedRecommendationHtml = typeof RecommendationEngine !== 'undefined' && RecommendationEngine.captureCurrentRecommendationHtml
            ? RecommendationEngine.captureCurrentRecommendationHtml()
            : STATE.lastRecommendationHtml;
        const label = presetName || 'manual_change';

        if (preservedRecommendationHtml) {
            STATE.lastRecommendationHtml = preservedRecommendationHtml;
            STATE.lastRecommendationMeta = Object.assign({}, STATE.lastRecommendationMeta || {}, {
                preservedAt: Date.now(),
                preservedReason: 'tactic_apply_freeze',
                preservedPresetName: label,
                preservedBucket: snapshot.bucket || ''
            });
        }

        STATE.recommendationFreeze = {
            schema: 'slf_recommendation_freeze_v1',
            gameId: snapshot.gameId,
            presetName: label,
            appliedAt: Date.now(),
            fromBucket: snapshot.bucket || '',
            fromWindowIndex: currentWindow?.index || 0,
            targetBucket: targetWindow?.label || snapshot.bucket || '',
            targetWindowIndex: targetWindow?.index || currentWindow?.index || 0,
            appliedSnapshotKey: this.buildSnapshotKey(snapshot),
            preservedRecommendationHtml: STATE.lastRecommendationHtml || preservedRecommendationHtml || null
        };

        const previousProgression = STATE.presetProgression || null;
        const isKnownPreset = label && label !== 'manual_change' && TacticPresetLibrary?.meta?.[label];

        STATE.presetProgression = {
            schema: 'slf_preset_progression_v1',
            gameId: snapshot.gameId,
            lastAppliedPreset: label,
            previousPreset: previousProgression?.lastAppliedPreset || null,
            lastRecommendedPreset: previousProgression?.lastRecommendedPreset || null,
            family: isKnownPreset ? TacticPresetLibrary.getGroup(label) : 'manual',
            rank: isKnownPreset ? TacticPresetLibrary.getRank(label) : 0,
            baselineBucket: snapshot.bucket || '',
            baselineWindowIndex: currentWindow?.index || 0,
            targetBucket: targetWindow?.label || snapshot.bucket || '',
            targetWindowIndex: targetWindow?.index || currentWindow?.index || 0,
            appliedAt: Date.now(),
            status: 'applied_baseline'
        };

        const waitText = `Пресет применён: ${label}. Ждём следующий snapshot/отрезок ${STATE.recommendationFreeze.targetBucket || ''}.`;
        UI.updateParserStatus(waitText);
        UI.addParserLog(waitText);
        this.persistLiveState({ active: true });
    },

    clearRecommendationFreeze(reason = 'cleared') {
        if (!STATE.recommendationFreeze) return;
        STATE.recommendationFreeze = null;
        this.persistLiveState({ active: !!STATE.liveParserTimer, freezeClearedReason: reason });
    },

    getRecommendationFreezeStatus(snapshot) {
        const freeze = STATE.recommendationFreeze;
        if (!freeze) return { active: false };

        if (!snapshot || String(snapshot.gameId || '') !== String(freeze.gameId || '')) {
            this.clearRecommendationFreeze('game_changed');
            return { active: false };
        }

        if (snapshot.status === 'finished') {
            this.clearRecommendationFreeze('match_finished');
            return { active: false };
        }

        const currentWindow = snapshot.generationWindow || MatchTimingModel.getWindow(snapshot.minute);
        const currentIndex = currentWindow?.index || 0;
        const targetIndex = Number(freeze.targetWindowIndex || 0);
        const fromIndex = Number(freeze.fromWindowIndex || 0);
        const bucketChanged = !!freeze.fromBucket && !!snapshot.bucket && snapshot.bucket !== freeze.fromBucket;
        const reachedTarget = targetIndex > 0 && currentIndex >= targetIndex && currentIndex !== fromIndex;

        if (bucketChanged || reachedTarget) {
            this.clearRecommendationFreeze('target_segment_reached');
            return { active: false };
        }

        return {
            active: true,
            presetName: freeze.presetName || 'manual_change',
            fromBucket: freeze.fromBucket || '',
            targetBucket: freeze.targetBucket || '',
            targetWindowIndex: targetIndex,
            currentBucket: snapshot.bucket || '',
            currentWindowIndex: currentIndex
        };
    },

    autoResumeIfNeeded() {
        if (STATE.liveAutoResumeChecked) return;
        if (!location.pathname.includes('/game.php')) return;
        if (STATE.liveParserTimer) return;

        const saved = this.loadLiveState();
        if (!saved || !saved.active) return;

        const snapshot = this.build();
        if (snapshot?.status === 'finished') {
            this.clearLiveState(saved.gameId);
            return;
        }

        STATE.liveAutoResumeChecked = true;
        this.startLive({ autoResume: true, persistedState: saved });
    },

    rememberLiveSnapshot(snapshot) {
        if (!snapshot || !snapshot.gameId || !snapshot.bucket) return snapshot;

        const key = `${snapshot.gameId}|${snapshot.bucket}`;
        const list = STATE.liveSegmentSnapshots[key] || [];
        list.push(snapshot);
        STATE.liveSegmentSnapshots[key] = list.slice(-12);

        snapshot.segmentAggregate = this.buildSegmentAggregate(STATE.liveSegmentSnapshots[key], snapshot);
        return snapshot;
    },

    buildSegmentAggregate(list, snapshot) {
        const rows = Array.isArray(list) ? list.filter(Boolean) : [];
        if (!rows.length) return null;

        const first = rows[0];
        const last = rows[rows.length - 1] || snapshot;
        const myTeam = last.myTeam || snapshot?.myTeam;

        const getTeam = (snap, teamId) => snap?.stats?.find(x => Number(x.teamId) === Number(teamId))?.stats || null;
        const getOpp = (snap, teamId) => snap?.stats?.find(x => Number(x.teamId) !== Number(teamId))?.stats || null;
        const firstMy = getTeam(first, myTeam);
        const lastMy = getTeam(last, myTeam);
        const firstOpp = getOpp(first, myTeam);
        const lastOpp = getOpp(last, myTeam);

        const delta = (a, b, key) => (a && b) ? num(b[key]) - num(a[key]) : null;

        return {
            bucket: last.bucket,
            samples: rows.length,
            fromMinute: first.minute,
            toMinute: last.minute,
            my: {
                xG: delta(firstMy, lastMy, 'xG'),
                shots: delta(firstMy, lastMy, 'shots'),
                actions: delta(firstMy, lastMy, 'actions'),
                badActionsPct: lastMy ? num(lastMy.badActionsPct) : null,
                badActionsPctDelta: delta(firstMy, lastMy, 'badActionsPct'),
                power: delta(firstMy, lastMy, 'power')
            },
            opp: {
                xG: delta(firstOpp, lastOpp, 'xG'),
                shots: delta(firstOpp, lastOpp, 'shots'),
                actions: delta(firstOpp, lastOpp, 'actions'),
                badActionsPct: lastOpp ? num(lastOpp.badActionsPct) : null,
                badActionsPctDelta: delta(firstOpp, lastOpp, 'badActionsPct'),
                power: delta(firstOpp, lastOpp, 'power')
            },
            powerContext: {
                myPowerStart: firstMy ? num(firstMy.power) : null,
                myPowerEnd: lastMy ? num(lastMy.power) : null,
                oppPowerStart: firstOpp ? num(firstOpp.power) : null,
                oppPowerEnd: lastOpp ? num(lastOpp.power) : null,
                myPowerDrop: firstMy && lastMy ? num(lastMy.power) - num(firstMy.power) : null,
                oppPowerDrop: firstOpp && lastOpp ? num(lastOpp.power) - num(firstOpp.power) : null,
                strengthGapStart: firstMy && firstOpp ? num(firstMy.power) - num(firstOpp.power) : null,
                strengthGapEnd: lastMy && lastOpp ? num(lastMy.power) - num(lastOpp.power) : null,
                strengthGapDelta: firstMy && firstOpp && lastMy && lastOpp ? (num(lastMy.power) - num(lastOpp.power)) - (num(firstMy.power) - num(firstOpp.power)) : null
            }
        };
    },

    sendPlayerObservations(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.lineupRows)) return;

        const teams = snapshot.teams || [];

        const observations = snapshot.lineupRows
            .filter(player => player && player.playerId)
            .map(player => {
                const teamId =
                    player.side === 'home'
                        ? teams[0]
                        : player.side === 'away'
                            ? teams[1]
                            : null;

                return {
                    ts: Date.now(),

                    gameId: snapshot.gameId,
                    status: snapshot.status,
                    minute: snapshot.minute,
                    bucket: snapshot.bucket,

                    teamId,

                    playerId: player.playerId,
                    name: player.name,

                    side: player.side,
                    isStarter: player.isStarter,

                    currentPosition: player.normalizedPosition,
                    rawPosition: player.position,
                    possiblePositions: player.positions,
                    exactSlot: player.gridPosition || player.position || null,
                    slotSource: player.slotSource || 'lineup_rows',

                    skill: player.skill
                };
            });

        if (!observations.length) return;

        Api.post(
            CONFIG.COLLECTIONS.PLAYER_OBSERVATIONS + '?mode=append',
            observations,
            'player observations'
        );
    },

    sendMatchResult(snapshot) {
        const result = Object.assign({}, snapshot, {
            recordType: 'match_result',
            resultType: 'finished_match',
            schemaVersion: 2,
            parserVersion: 'match_result_append_v1',
            resultKey: this.buildResultKey(snapshot),
            parsedAt: Date.now(),
            source: {
                page: 'game',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: '4.4.72'
            }
        });

        Api.postAppend(
            CONFIG.COLLECTIONS.MATCH_RESULTS,
            result,
            'match result history'
        );

        this.sendPlayerObservations(snapshot);
    },

    startLive(options = {}) {
        if (STATE.liveParserTimer) {
            UI.updateParserStatus('Live parser уже запущен');

            try {
                const snapshot = this.build();
                if (snapshot) {
                    this.rememberLiveSnapshot(snapshot);
                    RecommendationEngine.update(snapshot);
                    this.persistLiveState({ active: true, refreshedWhileRunning: true });
                    UI.addParserLog('Live parser уже работал: рекомендация обновлена по текущему snapshot');
                }
            } catch (error) {
                console.error('[SLF] Failed to refresh recommendation while live parser already running', error);
                UI.addParserLog('Live parser уже работал: ошибка обновления рекомендации, см. console');
            }

            return;
        }

        const persisted = options.persistedState || null;

        STATE.lastSavedBucket = persisted?.lastSavedBucket || null;
        STATE.liveWaitStatus = persisted?.liveWaitStatus || null;
        STATE.liveStartedAt = persisted?.liveStartedAt || Date.now();
        STATE.liveSegmentSnapshots = persisted?.liveSegmentSnapshots || {};
        STATE.recommendationFreeze = persisted?.recommendationFreeze || STATE.recommendationFreeze || null;
        STATE.pendingPresetEvent = persisted?.pendingPresetEvent || STATE.pendingPresetEvent || null;
        STATE.presetProgression = persisted?.presetProgression || STATE.presetProgression || null;
        STATE.lastRecommendationHtml = persisted?.lastRecommendationHtml || STATE.lastRecommendationHtml || null;
        STATE.lastRecommendationMeta = persisted?.lastRecommendationMeta || STATE.lastRecommendationMeta || null;

        STATE.liveParserTimer = setInterval(() => {
            const snapshot = this.build();

            if (!snapshot) return;

            if (snapshot.status === 'finished') {
                UI.addParserLog('Live parser увидел завершение матча');
                this.stopLive({ reason: 'finished', clearPersisted: true });
                return;
            }

            if (snapshot.status !== 'live') {
                const waitStatus = snapshot.status || 'unknown';
                UI.updateParserStatus(`Live parser ждёт возобновления: ${waitStatus}`);

                if (STATE.liveWaitStatus !== waitStatus) {
                    STATE.liveWaitStatus = waitStatus;
                    UI.addParserLog(`Live parser не остановлен, ожидание: ${waitStatus}`);
                }

                this.persistLiveState({ active: true });
                return;
            }

            STATE.liveWaitStatus = null;
            this.rememberLiveSnapshot(snapshot);
            RecommendationEngine.update(snapshot);

            if (snapshot.bucket && snapshot.bucket !== STATE.lastSavedBucket) {
                STATE.lastSavedBucket = snapshot.bucket;

                this.sendSnapshot(snapshot);
                UI.addParserLog(`Сохранён generation snapshot: ${snapshot.bucket}`);

                const effect = EventTracker.buildPresetEffect(snapshot);

                if (effect) {
                    Api.postAppend(CONFIG.COLLECTIONS.PRESET_EFFECTS, effect, 'preset effect history');
                    UI.addParserLog(`Эффект тактики сохранён: ${effect.presetName}`);
                }
            }

            this.persistLiveState({ active: true });
        }, 15000);

        const first = this.build();
        this.rememberLiveSnapshot(first);
        RecommendationEngine.update(first);
        this.persistLiveState({ active: true });

        UI.updateParserStatus(options.autoResume ? 'Live parser восстановлен после обновления страницы' : 'Live parser запущен');
        UI.addParserLog(options.autoResume ? 'Live parser auto-resume: восстановлен run state' : 'Live parser запущен: halftime-safe, 36m real-time, generation windows');
    },

    stopLive(options = {}) {
        if (STATE.liveParserTimer) {
            clearInterval(STATE.liveParserTimer);
            STATE.liveParserTimer = null;
        }

        STATE.recommendationFreeze = null;

        if (options.clearPersisted !== false) {
            this.clearLiveState();
        } else {
            this.persistLiveState({ active: false, stopReason: options.reason || 'stopped' });
        }

        UI.updateParserStatus('Live parser остановлен');
        UI.addParserLog('Live parser остановлен');
    }
};

    // ============================================================
// <<< src/modules/live-parser/snapshot-engine.js


// >>> src/modules/live-parser/event-tracker.js
    // 9. Event / Effect Tracking
    // ============================================================

    const EventTracker = {
        findTeamStats(snapshot, teamId) {
            return snapshot?.stats?.find(x => x.teamId === teamId)?.stats || null;
        },

        savePresetEvent(name, preset, beforeSnapshot) {
            const ts = Date.now();
            const generationWindow = beforeSnapshot?.generationWindow || MatchStateParser.getGenerationWindow(beforeSnapshot?.minute);
            const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(beforeSnapshot?.minute);
            const event = {
                ts,
                recordType: 'preset_event',
                schemaVersion: 2,
                parserVersion: 'preset_event_generation_v2',
                eventKey: ['preset_event', MatchStateParser.getGameId(), beforeSnapshot.minute ?? '', beforeSnapshot.bucket || '', name || '', ts].join('|'),
                type: 'preset',
                gameId: MatchStateParser.getGameId(),
                minute: beforeSnapshot.minute,
                bucket: beforeSnapshot.bucket,
                generationWindow,
                targetGenerationWindow,
                targetBucket: targetGenerationWindow?.label || beforeSnapshot.bucket,
                timingModel: 'generation_windows_v1_last_change_before_next_window',
                presetName: name,
                tactic: preset,
                beforeSnapshot
            };

            STATE.pendingPresetEvent = event;
            PresetUsageTracker.record(name, {
                gameId: event.gameId,
                minute: event.minute,
                bucket: event.bucket,
                source: 'preset_apply'
            });

            SnapshotEngine.freezeRecommendationsAfterTacticChange(name, beforeSnapshot);
            Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'preset event history');
            UI.addParserLog(`Пресет применён: ${PresetStorage.getAllLabels()[name] || TacticPresetLibrary?.meta?.[name]?.title || name}`);
        },

        buildPresetEffect(afterSnapshot) {
            const pending = STATE.pendingPresetEvent;

            if (!pending || !afterSnapshot) return null;
            if (pending.gameId !== afterSnapshot.gameId) return null;
            if (!afterSnapshot.myTeam) return null;

            const before = pending.beforeSnapshot;
            const pendingWindow = pending.generationWindow || before?.generationWindow || MatchTimingModel.getWindow(before?.minute);
            const targetWindow = pending.targetGenerationWindow || MatchTimingModel.getTargetWindowAfterChange(before?.minute);
            const afterWindow = afterSnapshot.generationWindow || MatchTimingModel.getWindow(afterSnapshot.minute);

            if (!afterWindow || !targetWindow) return null;
            if ((afterWindow.index || 0) < (targetWindow.index || 0)) return null;
            if ((afterWindow.index || 0) === (pendingWindow.index || 0)) return null;

            const myTeam = afterSnapshot.myTeam;

            const beforeMy = this.findTeamStats(before, myTeam);
            const beforeOpp = before.stats.find(x => x.teamId !== myTeam)?.stats;

            const afterMy = this.findTeamStats(afterSnapshot, myTeam);
            const afterOpp = afterSnapshot.stats.find(x => x.teamId !== myTeam)?.stats;

            if (!beforeMy || !beforeOpp || !afterMy || !afterOpp) return null;

            const beforeQualitySignal = before.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(before.developerHints || []);
            const afterQualitySignal = afterSnapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(afterSnapshot.developerHints || []);
            const beforeExpectedPerformance = before.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(before.developerHints || []) : null);
            const afterExpectedPerformance = afterSnapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(afterSnapshot.developerHints || []) : null);
            const ts = Date.now();
            const effect = {
                ts,
                recordType: 'preset_effect',
                schemaVersion: 2,
                parserVersion: 'preset_effect_generation_v2',
                effectKey: ['preset_effect', afterSnapshot.gameId || '', pending.presetName || pending.type || 'manual_change', before.bucket || '', afterSnapshot.bucket || '', ts].join('|'),
                gameId: afterSnapshot.gameId,
                presetName: pending.presetName || pending.type || 'manual_change',
                eventType: pending.type || 'preset',
                fromMinute: before.minute,
                toMinute: afterSnapshot.minute,
                fromBucket: before.bucket,
                toBucket: afterSnapshot.bucket,
                fromGenerationWindow: pendingWindow,
                targetGenerationWindow: targetWindow,
                toGenerationWindow: afterWindow,
                timingModel: 'generation_windows_v1_last_change_before_next_window',
                before,
                after: afterSnapshot,
                delta: {
                    myXG: num(afterMy.xG) - num(beforeMy.xG),
                    oppXG: num(afterOpp.xG) - num(beforeOpp.xG),
                    myShots: num(afterMy.shots) - num(beforeMy.shots),
                    oppShots: num(afterOpp.shots) - num(beforeOpp.shots),
                    myBadActionsPct: num(afterMy.badActionsPct) - num(beforeMy.badActionsPct),
                    myPower: num(afterMy.power) - num(beforeMy.power),
                    oppPower: num(afterOpp.power) - num(beforeOpp.power),
                    strengthGap: (num(afterMy.power) - num(afterOpp.power)) - (num(beforeMy.power) - num(beforeOpp.power)),
                    myXT: RecommendationEngine.getXTForMyTeam(afterSnapshot).myXT - RecommendationEngine.getXTForMyTeam(before).myXT,
                    oppXT: RecommendationEngine.getXTForMyTeam(afterSnapshot).oppXT - RecommendationEngine.getXTForMyTeam(before).oppXT
                },
                varianceContext: {
                    model: 'variance_tracking_v1_not_rigging_assumption',
                    scoreBefore: before.score || null,
                    scoreAfter: afterSnapshot.score || null,
                    strengthGap: num(beforeMy.power) - num(beforeOpp.power),
                    homeAway: Array.isArray(before.teams) && Number(before.teams[0]) === Number(myTeam) ? 'home' : 'away',
                    beforeDeveloperHints: Array.isArray(before.developerHints) ? before.developerHints.slice(0, 8) : [],
                    afterDeveloperHints: Array.isArray(afterSnapshot.developerHints) ? afterSnapshot.developerHints.slice(0, 8) : [],
                    beforeGeneratorQualitySignal: beforeQualitySignal,
                    afterGeneratorQualitySignal: afterQualitySignal,
                    beforeExpectedPerformance,
                    afterExpectedPerformance,
                    beforeGeneratorDetailMetrics: before.generatorDetailMetrics || null,
                    afterGeneratorDetailMetrics: afterSnapshot.generatorDetailMetrics || null,
                    strengthContext: {
                        myPowerBefore: num(beforeMy.power),
                        myPowerAfter: num(afterMy.power),
                        oppPowerBefore: num(beforeOpp.power),
                        oppPowerAfter: num(afterOpp.power),
                        strengthGapBefore: num(beforeMy.power) - num(beforeOpp.power),
                        strengthGapAfter: num(afterMy.power) - num(afterOpp.power)
                    }
                },
                generatorQualitySignal: afterQualitySignal,
                generatorExpectedPerformance: afterExpectedPerformance,
                generatorDetailMetrics: afterSnapshot.generatorDetailMetrics || null
            };

            if (STATE.presetProgression && String(STATE.presetProgression.gameId || '') === String(afterSnapshot.gameId || '')) {
                const effectScore =
                    (Number(effect.delta.myXG || 0) * 4) -
                    (Number(effect.delta.oppXG || 0) * 5) +
                    (Number(effect.delta.myShots || 0) * 0.5) -
                    (Number(effect.delta.oppShots || 0) * 0.5) -
                    (Number(effect.delta.myBadActionsPct || 0) * 0.3);

                STATE.presetProgression.lastEffect = {
                    schema: 'slf_preset_effect_score_v1',
                    presetName: effect.presetName,
                    effectScore: Number(effectScore.toFixed(2)),
                    fromBucket: effect.fromBucket,
                    toBucket: effect.toBucket,
                    toWindowIndex: afterWindow?.index || 0,
                    delta: effect.delta,
                    generatorQualitySignal: afterQualitySignal,
                    evaluatedAt: Date.now()
                };

                SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });
            }

            STATE.pendingPresetEvent = null;
            return effect;
        },

        diffTactic(oldTactic, newTactic) {
            const diff = {};

            const keys = new Set([
                ...Object.keys(oldTactic || {}),
                ...Object.keys(newTactic || {})
            ]);

            keys.forEach(key => {
                const oldVal = JSON.stringify(oldTactic?.[key] ?? null);
                const newVal = JSON.stringify(newTactic?.[key] ?? null);

                if (oldVal !== newVal) {
                    diff[key] = {
                        from: oldTactic?.[key] ?? null,
                        to: newTactic?.[key] ?? null
                    };
                }
            });

            return diff;
        },

        startManualTacticWatcher() {
            if (STATE.tacticWatcherStarted) return;
            if (!location.pathname.includes('/game.php')) return;

            const ids = MatchStatsParser.getAllTeamIds();
            if (!MatchStatsParser.detectMyTeamId(ids, MatchStatsParser.readTeamNames())) return;

            STATE.tacticWatcherStarted = true;
            STATE.lastManualTactic = getCurrentTactic();

            document.body.addEventListener('change', e => {
                const el = e.target;

                if (!el || !el.name) return;

                const isTacticInput =
                    el.matches('input[type="radio"], input[type="checkbox"]') &&
                    (
                        el.name === 'def_line' ||
                        el.name === 'press_line' ||
                        el.name === 'def_width' ||
                        el.name === 'press_intense' ||
                        el.name === 'build_type' ||
                        el.name === 'build_temp' ||
                        el.name === 'build_long' ||
                        el.name === 'build_fast' ||
                        el.name === 'style' ||
                        el.name === 'pass_risk' ||
                        el.name === 'dribble' ||
                        el.name === 'cross' ||
                        el.name === 'corner' ||
                        el.name === 'shot' ||
                        el.name.startsWith('priority_')
                    );

                if (!isTacticInput) return;

                if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) {
                    return;
                }

                clearTimeout(STATE.manualChangeTimer);

                STATE.manualChangeTimer = setTimeout(() => {
                    if (STATE.suppressManualWatcherUntil && Date.now() < STATE.suppressManualWatcherUntil) {
                        return;
                    }

                    const current = getCurrentTactic();
                    const changed = this.diffTactic(STATE.lastManualTactic, current);

                    if (!Object.keys(changed).length) return;

                    const snapshot = SnapshotEngine.build();

                    const ts = Date.now();
                    const generationWindow = snapshot?.generationWindow || MatchStateParser.getGenerationWindow(snapshot?.minute);
                    const targetGenerationWindow = MatchTimingModel.getTargetWindowAfterChange(snapshot?.minute);
                    const event = {
                        ts,
                        recordType: 'preset_event',
                        schemaVersion: 2,
                        parserVersion: 'manual_tactic_event_generation_v2',
                        eventKey: ['manual_tactic_event', MatchStateParser.getGameId(), snapshot.minute ?? '', snapshot.bucket || '', ts].join('|'),
                        type: 'manual_change',
                        gameId: MatchStateParser.getGameId(),
                        minute: snapshot.minute,
                        bucket: snapshot.bucket,
                        generationWindow,
                        targetGenerationWindow,
                        targetBucket: targetGenerationWindow?.label || snapshot.bucket,
                        timingModel: 'generation_windows_v1_last_change_before_next_window',
                        myTeam: snapshot.myTeam,
                        changed,
                        tactic: current,
                        beforeSnapshot: snapshot,
                        snapshot
                    };

                    STATE.pendingPresetEvent = event;
                    SnapshotEngine.freezeRecommendationsAfterTacticChange('manual_change', snapshot);
                    Api.postAppend(CONFIG.COLLECTIONS.PRESET_EVENTS, event, 'manual tactic event history');
                    UI.addParserLog('Ручное изменение тактики сохранено');

                    STATE.lastManualTactic = current;
                }, 500);
            }, true);

            UI.addParserLog('Manual tactic watcher активен');
        }
    };
    // ============================================================
// <<< src/modules/live-parser/event-tracker.js


// >>> src/modules/strategy-data-recommendations/developer-hint-parser.js
// 9.5 Developer Hint Parser
// ============================================================

const DeveloperHintParser = {
    readHints() {
        const clone = document.body.cloneNode(true);

        [
            '#slf-match-parser-panel',
            '#slf-data-page',
            '#slf-tactics-dropdown',
            '#slf-save-dialog'
        ].forEach(selector => {
            clone.querySelectorAll(selector).forEach(el => el.remove());
        });

        const text = clone.innerText || '';

        const rawLines = text
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);

        const hintLines = rawLines.filter(line => {
            const t = line.toLowerCase();

            if (t.includes('ход матча:')) return false;
            if (t.includes('сейчас пресет:')) return false;
            if (t.includes('идея:')) return false;
            if (t.includes('использовать:')) return false;
            if (t.includes('риск:')) return false;
            if (t.includes('мануал по счёту')) return false;
            if (t.includes('live parser')) return false;
            if (t.includes('рекомендуемый пресет')) return false;

            return (
                line.includes('[Клопп]') ||
                line.includes('[Симеоне]') ||
                line.includes('[Жозе]') ||
                line.includes('Генератор') ||
                line.includes('Вектор обороны') ||
                line.includes('Оценка кроссов') ||
                line.includes('Точность') ||
                line.includes('игроки устали') ||
                line.includes('Приоритет') ||
                line.includes('Выбор К') ||
                line.includes('диагональные передачи') ||
                line.includes('атаку по центру') ||
                line.includes('дальних ударов') ||
                this.isExplicitBetterThanExpectedText(line) ||
                t.includes('ниже ожидан') ||
                t.includes('хуже ожидан') ||
                t.includes('генератор ожидает')
            );
        });

        const unique = [...new Set(
            hintLines.map(line => line.replace(/\s*подробнее\s*$/i, '').trim())
        )];

        return unique
            .filter(Boolean)
            .map(text => ({
                text,
                type: this.classify(text),
                control: this.toControlSignal(text),
                weight: this.getWeight(text)
            }));
    },

    classify(text) {
        const t = text.toLowerCase();

        if (this.isGeneratorQualityText(t)) {
            return 'generator_quality';
        }

        if (
            t.includes('отключите') ||
            t.includes('попробуйте убрать') ||
            t.includes('увеличьте') ||
            t.includes('приоритет') ||
            t.includes('логичный выбор')
        ) {
            return 'control';
        }

        if (t.includes('генератор ожидает')) {
            return 'generator_feedback';
        }

        if (
            t.includes('устали') ||
            t.includes('замены')
        ) {
            return 'player_condition';
        }

        return 'info';
    },

    getWeight(text) {
        const t = text.toLowerCase();

        if (this.isGeneratorQualityText(t)) return 6;
        if (t.includes('генератор')) return 5;
        if (t.includes('[клопп]') || t.includes('[симеоне]') || t.includes('[жозе]')) return 4;
        if (t.includes('устали')) return 4;
        if (t.includes('отключите') || t.includes('увеличьте') || t.includes('убрать')) return 3;

        return 1;
    },

    toControlSignal(text) {
        const t = text.toLowerCase();

        if (t.includes('отключите атаку по центру')) {
            return {
                area: 'priority',
                action: 'disable_center',
                ui: 'Управление → Приоритет атак: убрать центр'
            };
        }

        if (t.includes('убрать диагональные передачи')) {
            return {
                area: 'build',
                action: 'reduce_diagonal',
                ui: 'Управление → Построение атаки: убрать/снизить диагональные передачи'
            };
        }

        if (t.includes('дальних ударов') && t.includes('умеренно')) {
            return {
                area: 'attack',
                action: 'shots_moderate',
                ui: 'Управление → Атака: дальние удары = умеренно'
            };
        }

        if (t.includes('логичный выбор обоих флангов')) {
            return {
                area: 'priority',
                action: 'both_flanks',
                ui: 'Управление → Приоритет атак: оба фланга'
            };
        }

        if (t.includes('устали') || t.includes('замены')) {
            return {
                area: 'subs',
                action: 'prepare_subs',
                ui: 'Проверь замены: игроки устали'
            };
        }

        return null;
    },

    isExplicitBetterThanExpectedText(text) {
        const t = String(text || '').toLowerCase().replace(',', '.');
        return /(?:\+\s*\d+(?:\.\d+)?\s*%\s*)?(?:вы\s+)?(?:играете|играем|проводим(?:\s+матч)?|проводит(?:\s+матч)?)\s+лучше/.test(t) ||
            /(?:вы\s+)?(?:играете|играем|проводим(?:\s+матч)?)\s+лучше\s+(?:ожид|генератор)/.test(t) ||
            /лучше\s+ожидан[^\d+]*(?:\+\s*\d+(?:\.\d+)?\s*%)/.test(t);
    },

    isGeneratorQualityText(text) {
        const t = String(text || '').toLowerCase();

        return (
            this.isExplicitBetterThanExpectedText(t) ||
            t.includes('ниже ожидан') ||
            t.includes('хуже ожидан')
        );
    },

    parsePercent(text) {
        const raw = String(text || '').replace(',', '.');
        const m = raw.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
        if (!m) return null;
        const value = Number(m[1]);
        return Number.isFinite(value) ? value : null;
    },

    parseGeneratorQualitySignal(hints) {
        const rows = Array.isArray(hints) ? hints : [];
        const candidates = rows.filter(h => h && (h.type === 'generator_quality' || this.isGeneratorQualityText(h.text || h)));

        if (!candidates.length) {
            return {
                detected: false,
                direction: 'neutral',
                confidenceBoost: 0,
                percent: null,
                text: '',
                explicitBetterThanExpected: false
            };
        }

        const text = candidates.map(h => h.text || String(h || '')).join(' | ');
        const lower = text.toLowerCase();
        const percent = this.parsePercent(text);
        const explicitBetterThanExpected = this.isExplicitBetterThanExpectedText(text);
        let direction = 'neutral';

        if (explicitBetterThanExpected) {
            direction = 'positive';
        }

        if (
            lower.includes('хуже') ||
            lower.includes('ниже ожид') ||
            (percent != null && percent < 0 && !explicitBetterThanExpected)
        ) {
            direction = 'negative';
        }

        const confidenceBoost = direction === 'positive'
            ? Math.min(0.35, 0.12 + Math.abs(percent || 0) / 100)
            : direction === 'negative'
                ? -Math.min(0.35, 0.12 + Math.abs(percent || 0) / 100)
                : 0.05;

        return {
            schema: 'slf_generator_quality_signal_v1',
            detected: direction !== 'neutral',
            direction,
            confidenceBoost: Number(confidenceBoost.toFixed(2)),
            percent,
            text,
            explicitBetterThanExpected,
            source: explicitBetterThanExpected ? 'explicit_generator_better_text' : 'pep_generator_hint'
        };
    },

    getGeneratorQualitySignal(hints) {
        return this.parseGeneratorQualitySignal(hints);
    },

    getControlHints(hints) {
        return hints.filter(h => h.type === 'control' && h.control);
    },

    getGeneratorHints(hints) {
        return hints.filter(h => h.type === 'generator_feedback' || h.type === 'generator_quality');
    }
};



// ============================================================
// <<< src/modules/strategy-data-recommendations/developer-hint-parser.js


// >>> src/modules/strategy-data-recommendations/generator-advice-details-parser.js
// 9.6 Hidden generator advice detail parser
// ============================================================

const GeneratorAdviceDetailsParser = {
    norm(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    parseNumber(value) {
        const m = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        if (!m) return null;
        const n = Number(m[0]);
        return Number.isFinite(n) ? n : null;
    },

    parsePercent(value) {
        const m = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?\s*%/);
        if (!m) return null;
        const n = Number(m[0].replace('%', ''));
        return Number.isFinite(n) ? n : null;
    },

    parseDataId(onclick) {
        const m = String(onclick || '').match(/advice-long\[data-id\s*=\s*['"]?(\d+)['"]?\]/i);
        return m ? m[1] : null;
    },

    getTitleForLink(el) {
        const parentText = this.norm(el?.parentElement?.textContent || '');
        const before = parentText.split(/подробнее/i)[0] || '';
        return this.norm(before) || this.norm(el?.textContent || 'подробнее');
    },

    readAdviceBlocks() {
        const links = [...document.querySelectorAll('a,button,span')]
            .filter(el => this.norm(el.textContent).toLowerCase().includes('подробнее'))
            .map((el, index) => {
                const onclick = el.getAttribute('onclick') || '';
                const dataId = this.parseDataId(onclick);
                return {
                    index,
                    dataId,
                    title: this.getTitleForLink(el),
                    href: el.getAttribute('href') || '',
                    onclick
                };
            })
            .filter(x => x.dataId != null);

        const blocks = links.map(link => {
            const block = document.querySelector(`.advice-long[data-id="${link.dataId}"]`);
            const fullText = block ? this.norm(block.textContent || '') : '';
            return {
                schema: 'slf_generator_advice_block_v1',
                dataId: link.dataId,
                title: link.title,
                found: !!block,
                textLength: fullText.length,
                textPreview: fullText.slice(0, 700),
                fullText: fullText.slice(0, 2000),
                rows: block ? this.parseDetailRows(block) : [],
                source: 'dom_advice_long_hidden_block'
            };
        });

        return blocks;
    },

    parseDetailRows(block) {
        const rows = [];
        [...block.querySelectorAll('tr')].forEach(tr => {
            const cells = [...tr.querySelectorAll('th,td')]
                .map(td => this.norm(td.textContent || ''))
                .filter(Boolean);
            if (!cells.length) return;
            const joined = this.norm(cells.join(' '));
            if (!/^\d{1,2}'/.test(joined) && !/\b\d{1,2}'\b/.test(joined)) return;
            rows.push({ cells, raw: joined });
        });

        if (!rows.length) {
            const lines = String(block.textContent || '')
                .split(/\n+/)
                .map(x => this.norm(x))
                .filter(Boolean);
            lines.forEach(line => {
                if (/^\d{1,2}'/.test(line)) rows.push({ cells: [line], raw: line });
            });
        }

        return rows;
    },

    parseCrossRow(row) {
        const cells = Array.isArray(row?.cells) ? row.cells : [];
        const joined = this.norm(row?.raw || cells.join(' '));
        if (!/(кросс|навес|углов|штрафн)/i.test(joined)) return null;
        if (!/(^|\s)\d{1,2}'/.test(joined)) return null;

        const percents = joined.match(/\d+(?:[.,]\d+)?\s*%/g) || [];
        const result = cells.find(x => /(выиграл|проиграл|успеш|неуспеш|гол|удар)/i.test(x)) ||
            ((joined.match(/(выиграл|проиграл|успеш|неуспеш|гол|удар)/i) || [])[0] || '');
        const type = cells[1] || ((joined.match(/(кросс-навес|кросс|навес|угловой|штрафной)/i) || [])[0] || '');

        return {
            minute: this.parseNumber(cells[0] || joined),
            type: this.norm(type),
            duel: this.norm(cells[2] || joined),
            pressurePct: percents[0] ? this.parsePercent(percents[0]) : null,
            successPctCandidates: percents.map(x => this.parsePercent(x)).filter(x => x != null),
            result: this.norm(result),
            raw: joined
        };
    },

    summarizeCrossRows(rows) {
        const clean = (rows || []).filter(Boolean);
        const openPlay = clean.filter(r => /кросс|навес/i.test(r.type || '') && !/углов|штраф/i.test(r.type || ''));
        const setPieces = clean.filter(r => /углов|штраф/i.test(r.type || ''));
        const won = clean.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length;
        const lost = clean.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;
        const avg = arr => arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;
        const pressures = clean.map(r => r.pressurePct).filter(x => Number.isFinite(x));
        const success = clean.flatMap(r => r.successPctCandidates || []).filter(x => Number.isFinite(x));
        const openLost = openPlay.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;
        const setLost = setPieces.filter(r => /проиграл|неуспеш/i.test(r.result || '')).length;

        let signal = 'neutral';
        if (openPlay.length >= 2 && openLost / openPlay.length >= 0.7) signal = 'open_play_crosses_bad';
        else if (clean.length >= 4 && clean.length > 0 && won / clean.length <= 0.25) signal = 'crosses_bad_total';

        return {
            total: clean.length,
            won,
            lost,
            winRate: clean.length ? Math.round((won / clean.length) * 100) : null,
            openPlay: {
                total: openPlay.length,
                won: openPlay.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length,
                lost: openLost
            },
            setPieces: {
                total: setPieces.length,
                won: setPieces.filter(r => /выиграл|успеш|гол|удар/i.test(r.result || '')).length,
                lost: setLost
            },
            avgPressurePct: avg(pressures),
            avgSuccessPctCandidate: avg(success),
            signal
        };
    },

    parseCrosses(blocks) {
        const ownRows = [];
        const opponentRows = [];

        (blocks || []).forEach(block => {
            const title = this.norm(block.title || '').toLowerCase();
            if (!title.includes('оценка кроссов')) return;

            const parsedRows = (block.rows || [])
                .map(row => this.parseCrossRow(row))
                .filter(Boolean)
                .map(row => Object.assign(row, {
                    sourceDataId: block.dataId,
                    sourceTitle: block.title
                }));

            if (title.includes('соперник')) opponentRows.push(...parsedRows);
            else ownRows.push(...parsedRows);
        });

        return {
            schema: 'slf_generator_cross_detail_metrics_v1',
            source: 'advice_long_hidden_blocks',
            windowScope: 'unknown_generator_advice_window',
            caution: 'Advice detail rows do not expose an exact generation segment; use as supporting evidence, not as the only trigger.',
            own: {
                rows: ownRows.slice(0, 20),
                summary: this.summarizeCrossRows(ownRows)
            },
            opponent: {
                rows: opponentRows.slice(0, 20),
                summary: this.summarizeCrossRows(opponentRows)
            }
        };
    },

    parseQualityFromText(text) {
        const raw = String(text || '').replace(',', '.');
        const m = raw.match(/игру\s+лучше\s+ожиданий\s+генератора\s+на\s+(\d+(?:\.\d+)?)\s*%/i) ||
            raw.match(/проводите\s+игру\s+лучше\s+ожиданий.*?(\d+(?:\.\d+)?)\s*%/i);
        if (!m) return null;
        const percent = Number(m[1]);
        return Number.isFinite(percent)
            ? { detected: true, direction: 'positive', percent, text: this.norm(text), source: 'advice_long_quality_title' }
            : null;
    },

    collect() {
        const blocks = this.readAdviceBlocks();
        const textBlob = blocks.map(b => `${b.title}\n${b.fullText || b.textPreview || ''}`).join('\n');
        const quality = this.parseQualityFromText(textBlob);
        const crosses = this.parseCrosses(blocks);
        const meaningfulBlocks = blocks
            .filter(b => b.found && (b.textLength > 0 || /генератор|кросс|прессинг|обороны|атаки/i.test(b.title)))
            .map(b => ({
                dataId: b.dataId,
                title: b.title,
                textLength: b.textLength,
                textPreview: b.textPreview,
                source: b.source
            }));

        return {
            schema: 'slf_generator_advice_details_v1',
            collectedAt: Date.now(),
            blocksCount: blocks.length,
            meaningfulBlocks,
            quality,
            crosses,
            windowScope: 'unknown_generator_advice_window',
            caution: 'The hidden generator detail blocks do not disclose exact segment/window boundaries. Use them carefully as contextual signals and keep raw details in logs for later calibration.'
        };
    },

    toDeveloperHints(details) {
        const rows = [];
        if (!details || !details.schema) return rows;
        (details.meaningfulBlocks || []).forEach(block => {
            const text = this.norm(block.title || '');
            if (!text) return;
            if (/генератор|кросс|прессинг|обороны|атаки|дриблинг|точность|устали|замены|фланг|бить/i.test(text)) {
                rows.push(text);
            }
        });
        if (details.quality?.detected && details.quality.text) rows.push(details.quality.text);
        return [...new Set(rows)].map(text => ({
            text,
            type: DeveloperHintParser.classify(text),
            control: DeveloperHintParser.toControlSignal(text),
            weight: DeveloperHintParser.getWeight(text),
            source: 'advice_long_detail_title'
        }));
    }
};

// ============================================================
// <<< src/modules/strategy-data-recommendations/generator-advice-details-parser.js


// >>> src/modules/strategy-data-recommendations/generator-expected-performance-and-strength-context.js
// 9.6 Generator expected-performance and strength context
// ============================================================

const GeneratorExpectedPerformanceParser = {
    parseNumber(value) {
        const n = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    },

    emptyChannel(name) {
        return {
            channel: name,
            detected: false,
            actual: null,
            expected: null,
            delta: null,
            ratio: null,
            verdict: 'unknown',
            text: ''
        };
    },

    classifyAttack(actual, expected, rawText = '') {
        const t = String(rawText || '').toLowerCase();
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) {
            if (t.includes('ожидает') && t.includes('атак')) return 'underperforming';
            if (t.includes('доволен') && t.includes('атак')) return 'working';
            return 'unknown';
        }

        const ratio = actual / expected;
        if (ratio < 0.75 || (t.includes('ожидает') && t.includes('атак'))) return 'underperforming';
        if (ratio >= 0.9 || (t.includes('доволен') && t.includes('атак'))) return 'working';
        return 'neutral';
    },

    classifyDefense(actual, expected, rawText = '') {
        const t = String(rawText || '').toLowerCase();
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) {
            if (t.includes('ожидает') && (t.includes('оборон') || t.includes('защит'))) return 'underperforming';
            if (t.includes('доволен') && (t.includes('оборон') || t.includes('защит'))) return 'working';
            return 'unknown';
        }

        const ratio = actual / expected;
        if (ratio <= 0.75 || (t.includes('доволен') && (t.includes('оборон') || t.includes('защит')))) return 'working';
        if (ratio > 1.25 || (t.includes('ожидает') && (t.includes('оборон') || t.includes('защит')))) return 'underperforming';
        return 'neutral';
    },

    makeChannel(name, actual, expected, verdict, text) {
        const ratio = Number.isFinite(actual) && Number.isFinite(expected) && expected > 0 ? actual / expected : null;
        const delta = Number.isFinite(actual) && Number.isFinite(expected) ? actual - expected : null;

        return {
            channel: name,
            detected: true,
            actual: Number.isFinite(actual) ? actual : null,
            expected: Number.isFinite(expected) ? expected : null,
            delta: Number.isFinite(delta) ? Number(delta.toFixed(3)) : null,
            ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
            verdict,
            text: String(text || '').trim()
        };
    },

    parse(hints) {
        const rows = Array.isArray(hints) ? hints : [];
        const texts = rows.map(h => h?.text || String(h || '')).filter(Boolean);
        let attack = this.emptyChannel('attack');
        let defense = this.emptyChannel('defense');

        texts.forEach(text => {
            const raw = String(text || '').replace(/&quot;/g, '"');
            const lower = raw.toLowerCase();

            const attackMatch = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*xG\s*при\s*ожидаемом\s*([0-9]+(?:[.,][0-9]+)?)\s*xG/i);
            if (attackMatch && (lower.includes('атак') || lower.includes('xg'))) {
                const actual = this.parseNumber(attackMatch[1]);
                const expected = this.parseNumber(attackMatch[2]);
                attack = this.makeChannel('attack', actual, expected, this.classifyAttack(actual, expected, raw), raw);
            } else if (!attack.detected && lower.includes('генератор') && lower.includes('атак')) {
                attack = this.makeChannel('attack', null, null, this.classifyAttack(null, null, raw), raw);
            }

            const defenseMatch = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*xGA\s*при\s*ожидаемом\s*([0-9]+(?:[.,][0-9]+)?)\s*xGA/i);
            if (defenseMatch && (lower.includes('оборон') || lower.includes('защит') || lower.includes('xga'))) {
                const actual = this.parseNumber(defenseMatch[1]);
                const expected = this.parseNumber(defenseMatch[2]);
                defense = this.makeChannel('defense', actual, expected, this.classifyDefense(actual, expected, raw), raw);
            } else if (!defense.detected && lower.includes('генератор') && (lower.includes('оборон') || lower.includes('защит'))) {
                defense = this.makeChannel('defense', null, null, this.classifyDefense(null, null, raw), raw);
            }
        });

        const detected = attack.detected || defense.detected;
        let matrix = 'unknown';
        if (detected) {
            const a = attack.verdict;
            const d = defense.verdict;
            if (d === 'working' && a === 'underperforming') matrix = 'defense_good_attack_bad';
            else if (d === 'underperforming' && a === 'working') matrix = 'attack_good_defense_bad';
            else if (d === 'working' && a === 'working') matrix = 'both_good';
            else if (d === 'underperforming' && a === 'underperforming') matrix = 'both_bad';
            else if (a === 'underperforming') matrix = 'attack_bad';
            else if (d === 'underperforming') matrix = 'defense_bad';
            else if (a === 'working' || d === 'working') matrix = 'one_channel_good';
        }

        return {
            schema: 'slf_generator_expected_performance_v1',
            detected,
            attack,
            defense,
            matrix,
            summary: this.getSummary({ attack, defense, matrix })
        };
    },

    getSummary(result) {
        if (!result || result.matrix === 'unknown') return '';
        const parts = [];
        if (result.defense?.verdict === 'working') parts.push('Оборона работает: не ломать защитную структуру');
        if (result.defense?.verdict === 'underperforming') parts.push('Оборона недобирает: снизить риск и закрыть переходы');
        if (result.attack?.verdict === 'working') parts.push('Атака работает: сохранить атакующий паттерн');
        if (result.attack?.verdict === 'underperforming') parts.push('Атака недобирает: усилить продвижение и вход в штрафную');
        return parts.join('; ');
    }
};

const StrengthContextModel = {
    classifyGap(gap) {
        const value = Number(gap || 0);
        if (value >= 400) return { bucket: 'huge_advantage', label: 'мы намного сильнее', mode: 'advantage' };
        if (value >= 250) return { bucket: 'clear_advantage', label: 'мы явно сильнее', mode: 'advantage' };
        if (value >= 120) return { bucket: 'slight_advantage', label: 'мы немного сильнее', mode: 'advantage' };
        if (value <= -400) return { bucket: 'huge_disadvantage', label: 'мы намного слабее', mode: 'disadvantage' };
        if (value <= -250) return { bucket: 'clear_disadvantage', label: 'мы явно слабее', mode: 'disadvantage' };
        if (value <= -120) return { bucket: 'slight_disadvantage', label: 'мы немного слабее', mode: 'disadvantage' };
        return { bucket: 'near_equal', label: 'силы примерно равны', mode: 'equal' };
    },

    getPowerContext(myPower, oppPower) {
        const my = Number(myPower || 0);
        const opp = Number(oppPower || 0);
        const known = Number.isFinite(my) && Number.isFinite(opp) && my > 0 && opp > 0;
        const strengthGap = known ? my - opp : 0;
        const bucket = this.classifyGap(strengthGap);

        return {
            schema: 'slf_strength_context_v1_provisional_ranges',
            known,
            myPower: known ? my : null,
            oppPower: known ? opp : null,
            strengthGap: known ? strengthGap : null,
            bucket: bucket.bucket,
            label: bucket.label,
            mode: bucket.mode,
            rangesAreProvisional: true
        };
    },

    assessPressFatigue(snapshot, state) {
        const tactic = snapshot?.currentTactic || {};
        const pressIntense = Number(tactic.press_intense || 0);
        const pressLine = Number(tactic.press_line || 0);
        const highPress = pressIntense >= 4 || pressLine >= 4;
        const ag = snapshot?.segmentAggregate || null;
        const powerCtx = ag?.powerContext || null;
        const myPowerDrop = Number(powerCtx?.myPowerDrop || 0);
        const badDelta = Number(ag?.my?.badActionsPctDelta || 0);
        const fouls = Number(state?.myFouls || 0);
        const minute = Number(state?.minute || snapshot?.minute || 0);
        const oppPressure = Number(state?.oppXT || 0) > Number(state?.myXT || 0) + 0.25 || Number(state?.oppXg || 0) > Number(state?.myXg || 0) + 0.45;

        const active = highPress && (
            minute >= 60 ||
            myPowerDrop <= -35 ||
            badDelta >= 3 ||
            fouls >= 12 ||
            oppPressure
        );

        let risk = 'low';
        if (active && (myPowerDrop <= -60 || (oppPressure && badDelta >= 3) || fouls >= 14)) risk = 'high';
        else if (active) risk = 'medium';

        const reason = active
            ? `высокая нагрузка прессинга: press_intense=${pressIntense || '?'}, press_line=${pressLine || '?'}, Δpower=${Number.isFinite(myPowerDrop) ? myPowerDrop : '?'}, брак Δ=${Number.isFinite(badDelta) ? badDelta : '?'}`
            : '';

        return {
            schema: 'slf_press_fatigue_model_v1',
            highPress,
            active,
            risk,
            myPowerDrop: Number.isFinite(myPowerDrop) ? myPowerDrop : null,
            reason
        };
    }
};

// ============================================================
// <<< src/modules/strategy-data-recommendations/generator-expected-performance-and-strength-context.js


// >>> src/modules/strategy-data-recommendations/dave-engine-knowledge.js
// 9.7 Dave forum knowledge source
// ============================================================

const DaveEngineKnowledge = {
    sourceType: 'dave_engine_commentary',
    localKbHint: 'Local parser: slf_dave_forum_parser.py -> dave_forum_posts.jsonl / dave_generator56_posts.jsonl',
    notes: [
        {
            id: 'dave_generator_quality_vs_score',
            topic: 'Генератор 5.6',
            tags: ['generator_quality', 'variance', 'confidence'],
            text: 'Положительная подсказка генератора о качестве матча важнее одного отрицательного счёта: результат может быть хуже, чем качество игры.'
        },
        {
            id: 'dave_no_scenario_rng',
            topic: 'Генератор 5.6',
            tags: ['variance', 'xg'],
            text: 'Не считать каждый плохой счёт сценарием или подкруткой: генератор последовательно решает игровые эпизоды, xG не обязан механически совпадать со счётом.'
        },
        {
            id: 'dave_high_press_not_universal',
            topic: 'Генератор 5.6',
            tags: ['pressing', 'fatigue', 'cards'],
            text: 'Высокий прессинг после 5.6 не универсален: применять по контексту, физике, фолам и качеству структуры.'
        },
        {
            id: 'dave_bus_pressing_interaction',
            topic: 'Генератор 5.6',
            tags: ['low_block', 'pressing', 'counter'],
            text: 'Автобус под прессингом не обязан держать мяч: он играет на отбой или контратакует, если прессинг соперника плохо организован.'
        },
        {
            id: 'dave_scheme_defense_by_lines',
            topic: 'Генератор 5.6',
            tags: ['scheme', 'formation', 'pi'],
            text: 'Схема в обороне определяется количеством игроков по линиям; роль ПИ может поднять игрока на линию выше.'
        }
    ],

    getRelevantNotes(state, urgency, qualitySignal) {
        const tags = new Set(Array.isArray(state?.tags) ? state.tags : []);
        const result = [];

        if (qualitySignal?.detected) result.push(this.notes.find(x => x.id === 'dave_generator_quality_vs_score'));
        if (tags.has('under_pressure') || tags.has('late_protect_lead')) result.push(this.notes.find(x => x.id === 'dave_bus_pressing_interaction'));
        if (tags.has('bad_build_under_press') || tags.has('bait_press_possible')) result.push(this.notes.find(x => x.id === 'dave_high_press_not_universal'));
        if (urgency?.level === 'radical' || urgency?.level === 'emergency') result.push(this.notes.find(x => x.id === 'dave_scheme_defense_by_lines'));

        return [...new Map(result.filter(Boolean).map(note => [note.id, note])).values()].slice(0, 2);
    }
};
// ============================================================
// <<< src/modules/strategy-data-recommendations/dave-engine-knowledge.js


// >>> src/modules/tactics-presets/tactic-preset-library.js
// 9.8 Tactic Preset Library
// ============================================================

const TacticPresetLibrary = {
    meta: {
        // ----------------------------
        // DEFENSIVE
        // ----------------------------
        Simeone_LowBlock_def5: {
            group: 'defensive',
            rank: 5,
            title: 'Simeone Low Block',
            idea: 'максимально низкий и компактный блок, минимум риска, приоритет — не раскрыться',
            use: 'когда ведём в концовке, соперник давит, xGA растёт или нужно просто пережить отрезок',
            risk: 'можно слишком отдать инициативу и перестать выходить из обороны'
        },

        Simeone_Compact442_def4: {
            group: 'defensive',
            rank: 4,
            title: 'Simeone Compact',
            idea: 'компактная оборона без полной посадки назад, фланги как безопасный выход',
            use: 'когда соперник опаснее, но ещё не нужно уходить в глухую защиту',
            risk: 'если совсем отказаться от продвижения, давление соперника будет накапливаться'
        },

        Mourinho_WeakSide_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Mourinho Weak Side',
            idea: 'низкий/средний блок и быстрый выход в слабую сторону соперника',
            use: 'когда соперник давит, а у нас есть пространство за его линиями или слабый фланг',
            risk: 'если нет скорости и точного первого паса, контратаки будут срываться'
        },

        Henta_Hold_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Henta Hold',
            idea: 'низкий блок как у Henta, но осторожнее с мячом; агрессия остаётся в отборах',
            use: 'когда нужно удерживать счёт, но обычная защита слишком пассивная',
            risk: 'может не хватить угрозы впереди'
        },

        // ----------------------------
        // BALANCE / CONTROL
        // ----------------------------
        Pep_StandardControl_bal3: {
            group: 'balance',
            rank: 3,
            title: 'Pep Standard Control',
            idea: 'стандартный контроль с умеренным риском и без перекоса в одну зону',
            use: 'когда игра равная, нет явных сигналов менять структуру или нужно вернуться к базе',
            risk: 'может быть слишком нейтрально, если срочно нужен гол'
        },

        Xabi_BoxMidfield_bal3: {
            group: 'balance',
            rank: 3,
            title: 'Xabi Box Midfield',
            idea: 'перегруз центра, контроль переходов, умный прессинг через CM/DM/AM',
            use: 'когда нужен контроль центра, есть игроки в средней линии и брак не высокий',
            risk: 'при закрытом центре лучше не форсировать — можно упереться в плотный блок'
        },

        Pep_BoxControl_bal2: {
            group: 'balance',
            rank: 2,
            title: 'Pep Box Control',
            idea: 'спокойный контроль через центр, короткий розыгрыш и минимум хаоса',
            use: 'когда нужно успокоить игру, снизить брак или вскрывать низкий блок терпением',
            risk: 'против высокого прессинга можно застрять в розыгрыше'
        },

        Pep_ControlledPush_att3: {
            group: 'attack',
            rank: 3,
            title: 'Pep Controlled Push',
            idea: 'аккуратно усилить атаку без ломки работающей обороны: выше темп, больше продвижения, умеренный риск',
            use: 'когда оборона по генератору работает, а атака недобирает xG относительно ожидаемого',
            risk: 'если брак уже высокий, усиление атаки может превратиться в потери'
        },

        Xabi_VerticalBox_att3: {
            group: 'attack',
            rank: 3,
            title: 'Xabi Vertical Box',
            idea: 'более вертикальный box-midfield: центр сохраняет контроль, но быстрее ищет вход между линиями',
            use: 'когда центр доступен, брак низкий, атака недобирает, а оборонительная структура не должна ломаться',
            risk: 'при закрытом центре или высоком прессинге соперника вертикальность даст брак'
        },

        Pep_PressCooldown_bal2: {
            group: 'balance',
            rank: 2,
            title: 'Pep Press Cooldown',
            idea: 'снизить цену прессинга, вернуть контроль и сохранить структуру без посадки в автобус',
            use: 'когда высокий прессинг выматывает: сила на поле падает, растёт брак/фолы или ухудшается xT',
            risk: 'если срочно нужен гол, может не хватить давления'
        },

        Compact_Counter_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Compact Counter',
            idea: 'закрыть переходы и сохранить быстрый выход, не превращая матч в полный низкий блок',
            use: 'когда атака что-то создаёт, но оборона недобирает или соперник опасен в переходах',
            risk: 'если слишком рано уйти в компактность, атака потеряет давление'
        },

        DeZerbi_BaitPress_bal3: {
            group: 'balance',
            rank: 3,
            title: 'De Zerbi Bait Press',
            idea: 'заманить прессинг соперника, вытянуть его линии и открыть пространство выше',
            use: 'когда соперник высоко прессингует, а у нас достаточно качества паса',
            risk: 'при слабых защитниках/DM можно привезти опасный момент'
        },

        Conte_WingbackWidth_bal4: {
            group: 'balance',
            rank: 4,
            title: 'Conte Wingback Width',
            idea: 'ширина через фланги, растягивание обороны, давление коридорами',
            use: 'когда центр закрыт, но фланги доступны или есть сильные ML/MR/DL/DR',
            risk: 'если фланги слабые, атака станет навесным шумом'
        },

        // ----------------------------
        // ATTACK
        // ----------------------------
        Klopp_Gegenpress_att4: {
            group: 'attack',
            rank: 4,
            title: 'Klopp Gegenpress',
            idea: 'высокий прессинг, быстрый темп, давление после потерь и агрессивные атаки',
            use: 'когда нужно переломить матч, соперник ошибается под давлением или мы проигрываем после 60-й',
            risk: 'усталость, фолы и пространство за спиной защитников'
        },

        Bielsa_ChaosPress_att5: {
            group: 'attack',
            rank: 5,
            title: 'Bielsa Chaos Press',
            idea: 'максимальный темп, максимальное давление, высокий риск ради спасения матча',
            use: 'когда 80+ минута, проигрываем и терять уже почти нечего',
            risk: 'может полностью развалить оборону'
        },

        Pep_TwoThreeFive_att3: {
            group: 'attack',
            rank: 3,
            title: 'Pep Positional Attack',
            idea: 'территориальное давление, высокая линия и постоянное присутствие в атакующих зонах',
            use: 'когда мы сильнее по xG/xT и нужно дожать без полного хаоса',
            risk: 'опасно против быстрых контратак'
        },

        DeZerbi_Release_att4: {
            group: 'attack',
            rank: 4,
            title: 'De Zerbi Release',
            idea: 'после заманивания прессинга быстро выпускать атаку в свободные зоны',
            use: 'когда соперник вышел высоко, а за его линиями есть пространство',
            risk: 'если пространство не появляется, риск паса станет пустым'
        },

        Klopp_WideTrap_att4: {
            group: 'attack',
            rank: 4,
            title: 'Klopp Wide Trap',
            idea: 'высокий прессинг и атака через оба фланга, обход закрытого центра',
            use: 'когда движок советует убрать центр или логичны оба фланга',
            risk: 'если нет флангового преимущества, атаки могут стать предсказуемыми'
        },

        // ----------------------------
        // HENTA EXPERIMENTAL
        // ----------------------------
        Henta_LeftTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Left Trap',
            idea: 'низкий блок, агрессивный отбор и левофланговая атака',
            use: 'когда слабый правый фланг соперника или твой левый фланг хорошо продвигает мяч',
            risk: 'перекос влево может стать читаемым'
        },

        Henta_RightTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Right Trap',
            idea: 'зеркальная Henta через правый фланг',
            use: 'когда слабый левый фланг соперника или твой правый фланг сильнее',
            risk: 'перекос вправо может стать читаемым'
        },

        Henta_WideTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Wide Trap',
            idea: 'низкий блок, агрессивные отборы и атака через оба фланга',
            use: 'когда центр закрыт, высокий прессинг мешает розыгрышу или движок советует убрать центр',
            risk: 'если фланги не дают качества, xG может не расти'
        },

        Henta_CounterTrap_att4: {
            group: 'henta',
            rank: 4,
            title: 'Henta Counter Trap',
            idea: 'Henta с более резким выходом: низко отбираем и быстрее бьём в свободное пространство',
            use: 'когда соперник давит и оставляет зоны за спиной',
            risk: 'при высоком браке контратаки будут теряться'
        },

        Henta_CentralTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Central Trap',
            idea: 'экспериментальная Henta через центр, если соперник слаб в DM/CM/DC',
            use: 'когда у соперника проседает центр, а у нас низкий брак и есть контроль',
            risk: 'если центр закрыт, лучше не форсировать'
        }
    },

    schemeStates: {
        base_balance: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        stable_control: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        controlled_push: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        vertical_box: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        press_cooldown: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        compact_counter: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        hold_score: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        under_pressure: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM1-CM2-DM3-RM / ST2',
        late_protect_lead: '5-4-1 / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        need_goal_55_75: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        late_need_goal: '4-2-4 / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW-ST2',
        center_closed: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        center_weak: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        low_block_sterile: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM1-DM2 / LW-AM2-RW / ST2',
        wingback_width: '4-2-3-1 / GK-LB-CD1-CD3-RB / DM2-CM2 / LW-AM2-RW / ST2',
        counter_trap: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2'
    },

    presetSchemeState: {
        standard: 'base_balance',
        Simeone_LowBlock_def5: 'late_protect_lead',
        Simeone_Compact442_def4: 'hold_score',
        Mourinho_WeakSide_def3: 'counter_trap',
        Henta_Hold_def3: 'under_pressure',
        Pep_StandardControl_bal3: 'base_balance',
        Xabi_BoxMidfield_bal3: 'center_weak',
        Pep_BoxControl_bal2: 'stable_control',
        Pep_ControlledPush_att3: 'controlled_push',
        Xabi_VerticalBox_att3: 'vertical_box',
        Pep_PressCooldown_bal2: 'press_cooldown',
        Compact_Counter_def3: 'compact_counter',
        DeZerbi_BaitPress_bal3: 'stable_control',
        Conte_WingbackWidth_bal4: 'wingback_width',
        Klopp_Gegenpress_att4: 'need_goal_55_75',
        Bielsa_ChaosPress_att5: 'late_need_goal',
        Pep_TwoThreeFive_att3: 'low_block_sterile',
        DeZerbi_Release_att4: 'counter_trap',
        Klopp_WideTrap_att4: 'center_closed',
        Henta_LeftTrap_att3: 'counter_trap',
        Henta_RightTrap_att3: 'counter_trap',
        Henta_WideTrap_att3: 'center_closed',
        Henta_CounterTrap_att4: 'counter_trap',
        Henta_CentralTrap_att3: 'center_weak'
    },

    traits: {
        standard: { attackLanes: ['right'], build: 'balanced', tempo: 'medium', press: 'medium', risk: 'medium', strengths: ['baseline'], requires: [], avoids: [] },
        Simeone_LowBlock_def5: { attackLanes: ['right'], build: 'low_block', tempo: 'low', press: 'low', risk: 'very_low', strengths: ['compactness', 'protect_lead', 'low_transition_risk'], requires: ['lead_or_pressure_context'], avoids: ['urgent_chase', 'need_high_volume_attack'] },
        Simeone_Compact442_def4: { attackLanes: ['left', 'right'], build: 'compact', tempo: 'low', press: 'medium', risk: 'low', strengths: ['compactness', 'safe_wide_outlet', 'transition_control'], requires: ['defensive_stability'], avoids: ['full_low_block_when_goal_needed'] },
        Mourinho_WeakSide_def3: { attackLanes: ['left', 'right'], build: 'counter', tempo: 'medium', press: 'medium', risk: 'low_medium', strengths: ['weak_side_attack', 'compact_counter', 'low_risk_exit'], requires: ['space_behind_opponent', 'first_pass_quality'], avoids: ['slow_no_outlet_attack'] },
        Henta_Hold_def3: { attackLanes: ['left', 'right'], build: 'hold_counter', tempo: 'low', press: 'medium_high', risk: 'medium', strengths: ['low_block', 'aggressive_recovery', 'hold_score'], requires: ['defensive_workrate'], avoids: ['sterile_no_threat'] },
        Pep_StandardControl_bal3: { attackLanes: ['center'], build: 'control', tempo: 'medium', press: 'medium', risk: 'medium', strengths: ['structure', 'central_control', 'baseline_reset'], requires: ['stable_possession'], avoids: ['late_emergency_chase'] },
        Xabi_BoxMidfield_bal3: { attackLanes: ['center'], build: 'box_midfield', tempo: 'medium', press: 'medium', risk: 'medium', strengths: ['central_overload', 'transition_control', 'half_space_entry'], requires: ['midfield_quality', 'low_bad_actions'], avoids: ['center_closed'] },
        Pep_BoxControl_bal2: { attackLanes: ['center'], build: 'control', tempo: 'low', press: 'medium_low', risk: 'low', strengths: ['low_chaos', 'safe_possession', 'central_progression'], requires: ['need_stability'], avoids: ['urgent_chase', 'need_fast_goal'] },
        Pep_ControlledPush_att3: { attackLanes: ['center'], build: 'controlled_attack', tempo: 'medium_high', press: 'medium', risk: 'medium', strengths: ['controlled_pressure', 'attacking_upgrade_without_breaking_shape'], requires: ['defense_working'], avoids: ['very_high_bad_actions'] },
        Xabi_VerticalBox_att3: { attackLanes: ['center'], build: 'vertical_box', tempo: 'medium_high', press: 'medium', risk: 'medium_high', strengths: ['vertical_entry', 'between_lines_attack', 'central_progression'], requires: ['center_available', 'low_bad_actions'], avoids: ['center_closed', 'high_press_with_bad_actions'] },
        Pep_PressCooldown_bal2: { attackLanes: ['center', 'right'], build: 'cooldown_control', tempo: 'medium', press: 'medium_low', risk: 'low', strengths: ['fatigue_control', 'reduce_press_cost', 'restore_structure'], requires: ['press_fatigue_or_bad_actions'], avoids: ['late_emergency_chase'] },
        Compact_Counter_def3: { attackLanes: ['left', 'right'], build: 'compact_counter', tempo: 'medium_high', press: 'medium', risk: 'medium', strengths: ['transition_protection', 'fast_outlet', 'defensive_reset'], requires: ['opponent_transition_threat'], avoids: ['need_sustained_positional_attack'] },
        DeZerbi_BaitPress_bal3: { attackLanes: ['center'], build: 'bait_press', tempo: 'low_medium', press: 'medium_low', risk: 'medium', strengths: ['draw_press', 'open_space_higher', 'positional_bait'], requires: ['passing_quality', 'low_bad_actions'], avoids: ['weak_defenders_under_press'] },
        Conte_WingbackWidth_bal4: { attackLanes: ['left', 'right'], build: 'wide', tempo: 'medium', press: 'medium', risk: 'medium', strengths: ['width', 'wingback_overload', 'wide_corridors', 'cross_volume'], requires: ['wing_quality', 'center_closed_or_wide_available'], avoids: ['own_crosses_bad', 'weak_flanks', 'opponent_crosses_dangerous'] },
        Klopp_Gegenpress_att4: { attackLanes: ['left', 'right'], build: 'gegenpress', tempo: 'high', press: 'high', risk: 'high', strengths: ['counterpress', 'high_pressure', 'fast_attack'], requires: ['fitness', 'need_pressure'], avoids: ['press_fatigue_risk', 'high_bad_actions', 'large_space_behind'] },
        Bielsa_ChaosPress_att5: { attackLanes: ['left', 'center', 'right'], build: 'chaos_press', tempo: 'very_high', press: 'very_high', risk: 'very_high', strengths: ['max_pressure', 'late_chase', 'volume_attack'], requires: ['emergency_need_goal'], avoids: ['protect_lead', 'early_match', 'press_fatigue_risk'] },
        Pep_TwoThreeFive_att3: { attackLanes: ['center'], build: 'positional_attack', tempo: 'medium_high', press: 'medium_high', risk: 'medium_high', strengths: ['territorial_pressure', 'final_third_presence', 'positional_overload'], requires: ['attacking_momentum', 'transition_control'], avoids: ['opponent_fast_counter_threat'] },
        DeZerbi_Release_att4: { attackLanes: ['center', 'right'], build: 'release_space', tempo: 'high', press: 'medium_high', risk: 'high', strengths: ['release_after_bait', 'attack_space_behind', 'fast_vertical_exit'], requires: ['opponent_high_line_or_press', 'passing_quality'], avoids: ['no_space_behind', 'high_bad_actions'] },
        Klopp_WideTrap_att4: { attackLanes: ['left', 'right'], build: 'wide_press', tempo: 'high', press: 'high', risk: 'high', strengths: ['wide_pressure', 'bypass_closed_center', 'counterpress'], requires: ['wide_advantage'], avoids: ['weak_flanks', 'own_crosses_bad', 'press_fatigue_risk'] },
        Henta_LeftTrap_att3: { attackLanes: ['left'], build: 'left_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', strengths: ['left_lane_focus', 'aggressive_recovery', 'weak_right_side_attack'], requires: ['opponent_right_weak_or_own_left_strong'], avoids: ['left_lane_blocked', 'predictable_single_lane'] },
        Henta_RightTrap_att3: { attackLanes: ['right'], build: 'right_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', strengths: ['right_lane_focus', 'aggressive_recovery', 'weak_left_side_attack'], requires: ['opponent_left_weak_or_own_right_strong'], avoids: ['right_lane_blocked', 'predictable_single_lane'] },
        Henta_WideTrap_att3: { attackLanes: ['left', 'right'], build: 'wide_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', strengths: ['wide_attack', 'aggressive_recovery', 'bypass_center'], requires: ['center_closed_or_wide_available'], avoids: ['weak_flanks', 'own_crosses_bad'] },
        Henta_CounterTrap_att4: { attackLanes: ['left', 'right'], build: 'counter_trap', tempo: 'high', press: 'medium_high', risk: 'medium_high', strengths: ['fast_counter', 'space_attack', 'low_recovery_block'], requires: ['opponent_pressure_or_space_behind'], avoids: ['high_bad_actions', 'no_space_behind'] },
        Henta_CentralTrap_att3: { attackLanes: ['center'], build: 'central_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', strengths: ['central_attack', 'weak_dm_cm_dc_attack', 'low_cross_dependence'], requires: ['opponent_center_weak', 'low_bad_actions'], avoids: ['center_closed'] }
    },

    getSchemeForPreset(name) {
        const state = this.presetSchemeState[name] || 'base_balance';
        return this.schemeStates[state] || this.schemeStates.base_balance;
    },

    getTraits(name) {
        return this.traits?.[name] || null;
    },

    makeSchemeHint(name) {
        const scheme = this.getSchemeForPreset(name);
        const title = this.meta[name]?.title || name || '';
        return scheme ? `Схема для ${title}: ${scheme}.` : '';
    },

    makeHint(name, reason) {
        return this.makeRoleHint('Рекомендуемый', name, reason);
    },

    makeRoleHint(role, name, reason) {
        const meta = this.meta[name];
        const label = meta?.title || name;

        if (!meta) {
            return [
                `${role}: ${name}.`,
                `Действие: поставь ${name}.`,
                reason ? `Причина: ${reason}.` : ''
            ].filter(Boolean).join(' ');
        }

        return [
            `${role}: ${label}.`,
            reason ? `Причина: ${reason}.` : '',
            `Идея: ${meta.idea}.`,
            `Риск: ${meta.risk}.`
        ].filter(Boolean).join(' ');
    },

    makeRoleNameHint(role, name) {
        const meta = this.meta[name];
        const label = meta?.title || name;
        return `${role}: ${label}.`;
    },

    getGroup(name) {
        return this.meta[name]?.group || 'custom';
    },

    getRank(name) {
        return Number(this.meta[name]?.rank || 0);
    },

    getShortDescription(name) {
        const meta = this.meta[name];

        if (!meta) return '';

        return `${meta.title}: ${meta.idea}. Использовать: ${meta.use}. Риск: ${meta.risk}.`;
    }
};

// ============================================================
// <<< src/modules/tactics-presets/tactic-preset-library.js


// >>> src/modules/tactics-presets/tactic-preset-library-panel.js
// Tactic Preset Library Panel
// ============================================================

const TacticPresetLibraryPanel = {
    panelId: 'slf-tactic-preset-library-panel',
    layoutId: 'slf-tactic-preset-layout',

    isTacticPage() {
        const params = new URLSearchParams(location.search || '');
        return location.pathname.includes('/team4.php') && params.get('action') === 'tactic';
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    getGroupColors() {
        return {
            defensive: '#9fd3ff',
            balance: '#ffd76a',
            attack: '#ff9f9f',
            henta: '#c6a6ff'
        };
    },

    getGroups() {
        return [
            {
                id: 'defensive',
                title: 'Defensive / удержание',
                desc: 'Схемы для удержания счёта, снижения риска, компактности и игры против давления.'
            },
            {
                id: 'balance',
                title: 'Balance / контроль',
                desc: 'Схемы для равного матча, контроля центра, снижения брака и аккуратного вскрытия блока.'
            },
            {
                id: 'attack',
                title: 'Attack / давление',
                desc: 'Схемы для усиления давления, дожима, высокого прессинга и спасения матча.'
            },
            {
                id: 'henta',
                title: 'Henta Experimental',
                desc: 'Низкий блок, агрессивные отборы и ловушки через фланги, центр или контру.'
            }
        ];
    },

    renderPresetCard(name, meta, existsInStorage) {
        const groupColors = this.getGroupColors();
        const color = groupColors[meta.group] || '#ddd';
        const statusText = existsInStorage
            ? 'есть в dropdown'
            : 'описание есть, пресет не импортирован';
        const statusColor = existsInStorage ? '#7cff7c' : '#ffb86c';

        return `
            <div style="
                background:#181818;
                border:1px solid #444;
                border-left:4px solid ${color};
                border-radius:6px;
                padding:8px 9px;
                margin:7px 0;
            ">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                    <div style="min-width:0;">
                        <div style="font-weight:bold;color:${color};font-size:13px;line-height:1.25;word-break:break-word;">
                            ${this.escapeHtml(name)}
                        </div>
                        <div style="font-size:10px;color:#aaa;margin-top:2px;line-height:1.3;">
                            ${this.escapeHtml(meta.title || '')}
                            · group: ${this.escapeHtml(meta.group || '')}
                            · rank: ${this.escapeHtml(meta.rank ?? '')}
                        </div>
                    </div>
                    <div style="font-size:10px;color:${statusColor};border:1px solid ${statusColor};border-radius:10px;padding:1px 6px;white-space:nowrap;">
                        ${this.escapeHtml(statusText)}
                    </div>
                </div>

                <div style="margin-top:7px;line-height:1.35;font-size:11px;">
                    <div><b style="color:#ddd;">Идея:</b> ${this.escapeHtml(meta.idea || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Использовать:</b> ${this.escapeHtml(meta.use || '')}</div>
                    <div style="margin-top:3px;"><b style="color:#ddd;">Риск:</b> ${this.escapeHtml(meta.risk || '')}</div>
                </div>
            </div>
        `;
    },

    buildHtml() {
        const meta =
            typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary.meta
                ? TacticPresetLibrary.meta
                : {};

        const presets =
            typeof PresetStorage !== 'undefined' && PresetStorage.getAllPresets
                ? PresetStorage.getAllPresets()
                : {};

        const names = Object.keys(meta);

        if (!names.length) {
            return `
                <h3 style="margin:0 0 8px 0;color:#ffd76a;font-size:14px;">Preset Library</h3>
                <div style="color:#f99;">TacticPresetLibrary пустой или не найден.</div>
            `;
        }

        const groupHtml = this.getGroups().map(group => {
            const groupNames = names
                .filter(name => meta[name].group === group.id)
                .sort((a, b) => {
                    const ra = Number(meta[a].rank || 0);
                    const rb = Number(meta[b].rank || 0);
                    return rb - ra || a.localeCompare(b);
                });

            if (!groupNames.length) return '';

            const cards = groupNames
                .map(name => this.renderPresetCard(name, meta[name], !!presets[name]))
                .join('');

            return `
                <div style="margin-bottom:12px;">
                    <h4 style="margin:9px 0 3px 0;color:#ffd76a;font-size:13px;text-transform:uppercase;">
                        ${this.escapeHtml(group.title)}
                    </h4>
                    <div style="color:#aaa;margin-bottom:7px;font-size:11px;line-height:1.3;">
                        ${this.escapeHtml(group.desc)}
                    </div>
                    ${cards}
                </div>
            `;
        }).join('');

        const importedCount = names.filter(name => presets[name]).length;

        return `
            <h3 style="margin:0 0 8px 0;color:#fff;font-size:14px;font-variant:small-caps;letter-spacing:.3px;">
                Preset Library
            </h3>
            <div style="
                margin-bottom:9px;
                padding:7px 8px;
                background:#181818;
                border:1px solid #444;
                border-radius:6px;
                color:#ddd;
                line-height:1.35;
                font-size:11px;
            ">
                Справочник авторских схем: что означает пресет, когда его использовать и какой риск.
                <br>
                Импортировано в dropdown: <b style="color:#7cff7c;">${this.escapeHtml(importedCount)}</b> из <b>${this.escapeHtml(names.length)}</b>.
            </div>
            ${groupHtml}
        `;
    },

    ensureLayout(tacticWrap) {
        let layout = document.getElementById(this.layoutId);
        if (layout) return layout;

        layout = document.createElement('div');
        layout.id = this.layoutId;
        layout.style.cssText = `
            display:flex;
            align-items:flex-start;
            gap:12px;
            width:max-content;
            max-width:none;
        `;

        tacticWrap.parentNode.insertBefore(layout, tacticWrap);
        layout.appendChild(tacticWrap);

        return layout;
    },

    mount() {
        if (!this.isTacticPage()) return;

        const tacticWrap = document.querySelector('.ui-tactic__wrap');
        if (!tacticWrap) return;

        const layout = this.ensureLayout(tacticWrap);
        let panel = document.getElementById(this.panelId);

        if (!panel) {
            panel = document.createElement('aside');
            panel.id = this.panelId;
            panel.style.cssText = `
                width:430px;
                max-height:720px;
                overflow:auto;
                padding:10px;
                background:#111;
                color:#fff;
                border:1px solid #444;
                border-radius:6px;
                box-sizing:border-box;
                font-family:Arial,sans-serif;
                font-size:12px;
            `;

            layout.appendChild(panel);
        }

        panel.innerHTML = this.buildHtml();
    }
};

// ============================================================
// <<< src/modules/tactics-presets/tactic-preset-library-panel.js


// >>> src/modules/strategy-data-recommendations/tactical-urgency-model.js
// 9.8 Tactical urgency / radicality model
// ============================================================

const TacticalUrgencyModel = {
    getMinuteUrgency(minute) {
        const m = Number(minute || 0);
        if (!Number.isFinite(m) || m < 10) return 0;
        if (m < 25) return 1;
        if (m < 40) return 2;
        if (m < 55) return 3;
        if (m < 70) return 4;
        if (m < 80) return 5;
        if (m < 85) return 6;
        return 7;
    },

    getDecisionWindow(minute) {
        const m = Number(minute || 0);

        if (!Number.isFinite(m) || m < 10) {
            return {
                phase: 'collect',
                label: 'Сбор данных',
                sourceSegment: '01-15',
                targetSegment: '16-30',
                applyByMinute: 15
            };
        }

        if (m < 15) return { phase: 'pre_decision', label: 'Предварительное окно решения', sourceSegment: '01-15', targetSegment: '16-30', applyByMinute: 15 };
        if (m < 25) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 30) return { phase: 'decision', label: 'Окно решения', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 40) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 45) return { phase: 'decision', label: 'Окно решения', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 55) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 60) return { phase: 'decision', label: 'Окно решения', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 70) return { phase: 'monitor', label: 'Мониторинг отрезка', sourceSegment: '61-75', targetSegment: '76-84', applyByMinute: 75 };
        if (m < 75) return { phase: 'decision', label: 'Окно решения', sourceSegment: '61-75', targetSegment: '76-84', applyByMinute: 75 };
        if (m < 80) return { phase: 'late', label: 'Позднее окно решения', sourceSegment: '76-84', targetSegment: '85-90', applyByMinute: 85 };
        if (m < 85) return { phase: 'final_decision', label: 'Финальное окно решения', sourceSegment: '76-84', targetSegment: '85-90', applyByMinute: 85 };
        return { phase: 'final_segment', label: 'Финальный отрезок', sourceSegment: '85-90', targetSegment: '85-90', applyByMinute: 90 };
    },

    classify(snapshot, state) {
        const minute = Number(state?.minute || 0);
        const score = state?.score || { diff: 0, state: 'unknown' };
        const losingBy = Math.max(0, -Number(score.diff || 0));
        const winningBy = Math.max(0, Number(score.diff || 0));
        const xgGap = Number(state?.oppXg || 0) - Number(state?.myXg || 0);
        const xtGap = Number(state?.oppXT || 0) - Number(state?.myXT || 0);
        const myBad = Number(state?.myBad || 0);
        const decisionWindow = this.getDecisionWindow(minute);
        const minuteUrgency = this.getMinuteUrgency(minute);
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const hintText = hints.map(h => h.text || '').join(' ').toLowerCase();
        const criticalCondition = /устали|травм|замен|красн|удален|удалён/.test(hintText);

        if (!Number.isFinite(minute) || minute < 10) {
            return {
                level: 'collect',
                label: 'Сбор данных',
                uiLabel: 'Сбор данных',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'до 10-й минуты собираем базу для первого предрешения'
            };
        }

        const emergency =
            losingBy >= 3 ||
            (minute <= 30 && losingBy >= 2) ||
            (minute >= 85 && score.state === 'losing') ||
            xgGap >= 1.2 ||
            xtGap >= 1.5 ||
            myBad >= 28 ||
            criticalCondition;

        const hugeLead = winningBy >= 4 || (minute <= 35 && winningBy >= 3);

        if (emergency) {
            const reasons = [];
            if (losingBy >= 3) reasons.push(`проигрываем ${losingBy} мяча`);
            if (minute <= 30 && losingBy >= 2) reasons.push(`ранний провал по счёту: -${losingBy} к ${minute}-й`);
            if (minute >= 85 && score.state === 'losing') reasons.push('финальный отрезок 85-90: нужен риск ради гола');
            if (xgGap >= 1.2) reasons.push(`провал по xG: ${xgGap.toFixed(2)}`);
            if (xtGap >= 1.5) reasons.push(`провал по xT: ${xtGap.toFixed(2)}`);
            if (myBad >= 28) reasons.push(`критический брак: ${myBad.toFixed(0)}%`);
            if (criticalCondition) reasons.push('критический сигнал по состоянию/карточкам из подсказок');

            return {
                level: 'emergency',
                label: 'Экстренная смена',
                uiLabel: 'Экстренная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: true,
                decisionWindow,
                reason: reasons.join('; ') || 'матч вышел из штатного сценария'
            };
        }

        if (hugeLead) {
            return {
                level: 'radical',
                label: 'Кардинальная смена: закрыть матч',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                preferControlOrCompact: true,
                decisionWindow,
                reason: `крупное преимущество +${winningBy}: цель — контроль, энергия и защита переходов`
            };
        }

        if (minuteUrgency >= 7) {
            return {
                level: 'final_segment',
                label: 'Финальный отрезок 85-90',
                uiLabel: 'Финальный отрезок',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: score.state === 'losing',
                decisionWindow,
                reason: 'последний отрезок: держим заранее выбранный план, но разрешаем срочную коррекцию по счёту/давлению'
            };
        }

        if (minuteUrgency >= 6) {
            return {
                level: 'radical',
                label: 'Финальное окно решения: подготовить 85-90',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'последнее окно до 85-й минуты для решения на 85-90'
            };
        }

        if (minuteUrgency >= 4) {
            return {
                level: 'medium_late',
                label: 'Поздняя перестройка',
                uiLabel: 'Средняя перестройка',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'времени меньше, допустима более решительная смена роли матча'
            };
        }

        if (minuteUrgency >= 2) {
            return {
                level: 'medium',
                label: 'Средняя перестройка',
                uiLabel: 'Средняя перестройка',
                allowPreset: true,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'корректируем структуру без резкого прыжка между семействами'
            };
        }

        return {
            level: 'soft',
            label: 'Мягкая корректировка',
            uiLabel: 'Мягкая корректировка',
            allowPreset: true,
            allowFamilyChange: false,
            overrideProgressionGuard: false,
            decisionWindow,
            reason: 'ранний этап: только аккуратная настройка, если нет экстренного триггера'
        };
    }
};

// ============================================================
// <<< src/modules/strategy-data-recommendations/tactical-urgency-model.js


// >>> src/modules/strategy-data-recommendations/recommendation-engine.js
// 10. Recommendation Engine
// ============================================================

const RecommendationEngine = {
    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    getSectionKey(title) {
        const t = String(title || '').toLowerCase();
        if (t.includes('конкрет')) return 'action';
        if (t.includes('контекст')) return 'context';
        if (t.includes('генератор')) return 'generator';
        if (t.includes('ручн')) return 'controls';
        if (t.includes('замет')) return 'notes';
        if (t.includes('статус')) return 'status';
        if (t.includes('сбор')) return 'collect';
        if (t.includes('ошибка')) return 'error';
        return 'misc_' + t.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 24);
    },

    getDefaultSectionOpen(title) {
        const t = String(title || '').toLowerCase();
        // Main tactical action stays visible. Error blocks also stay visible so failures are not hidden.
        return t.includes('конкрет') || t.includes('ошибка');
    },

    getStoredSectionOpen(title) {
        const key = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${key}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === '1') return true;
            if (stored === '0') return false;
        } catch (e) {}
        return this.getDefaultSectionOpen(title);
    },

    dedupeRows(rows) {
        const list = (Array.isArray(rows) ? rows : [rows])
            .filter(x => x !== null && x !== undefined && String(x).trim() !== '')
            .map(x => String(x).trim());

        const seen = new Set();
        const result = [];

        list.forEach(row => {
            const key = row
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/^[^:]+:\s*/, '')
                .replace(/[.。]+$/g, '')
                .trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            result.push(row);
        });

        return result;
    },

    sectionHtml(title, rows, color = '#ddd', priority = 3) {
        const list = this.dedupeRows(rows);

        if (!list.length) return '';

        const safeTitle = this.escapeHtml(title);
        const safeRows = list.map(row => `<div style="margin:2px 0;line-height:1.35;">${this.escapeHtml(row)}</div>`).join('');
        const sectionKey = this.getSectionKey(title);
        const storageKey = `slf_rec_section_open_${sectionKey}`;
        const openAttr = this.getStoredSectionOpen(title) ? ' open' : '';
        const countText = list.length > 1 ? ` <span style="opacity:.65;font-weight:normal;">(${list.length})</span>` : '';
        const toggleJs = `try{localStorage.setItem('${storageKey}',this.open?'1':'0')}catch(e){}`;

        return `
            <details${openAttr} data-slf-rec-priority="${priority}" data-slf-rec-section="${sectionKey}" ontoggle="${toggleJs}" style="margin:5px 0;padding:0;background:#151515;border:1px solid #444;border-radius:5px;color:#ddd;">
                <summary style="cursor:pointer;list-style:none;padding:7px 9px;font-weight:bold;color:${color};text-align:center;user-select:none;">
                    <span style="float:left;opacity:.65;font-weight:normal;">▸</span>${safeTitle}${countText}
                </summary>
                <div style="padding:0 9px 7px 9px;">${safeRows}</div>
            </details>
        `;
    },

    getTeamStats(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.stats) || snapshot.stats.length < 2) return null;

        if (!snapshot.myTeam) {
            return { my: null, opp: null, a: snapshot.stats[0], b: snapshot.stats[1] };
        }

        const my = snapshot.stats.find(x => Number(x.teamId) === Number(snapshot.myTeam));
        const opp = snapshot.stats.find(x => Number(x.teamId) !== Number(snapshot.myTeam));

        if (!my || !opp) return null;
        return { my, opp };
    },

    getScoreState(snapshot) {
        const score = snapshot?.score;
        const teams = snapshot?.teams || [];
        const myTeam = snapshot?.myTeam;

        if (!score || !myTeam || teams.length < 2) {
            return { known: false, diff: 0, state: 'unknown', myGoals: 0, oppGoals: 0 };
        }

        const isHome = Number(teams[0]) === Number(myTeam);
        const myGoals = isHome ? num(score.home) : num(score.away);
        const oppGoals = isHome ? num(score.away) : num(score.home);
        const diff = myGoals - oppGoals;

        return {
            known: true,
            myGoals,
            oppGoals,
            diff,
            state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
        };
    },

    getXTForMyTeam(snapshot) {
        if (!snapshot?.xT || !snapshot?.myTeam || !Array.isArray(snapshot.teams)) {
            return { myXT: 0, oppXT: 0 };
        }

        const isHome = Number(snapshot.teams[0]) === Number(snapshot.myTeam);
        return {
            myXT: isHome ? num(snapshot.xT.home) : num(snapshot.xT.away),
            oppXT: isHome ? num(snapshot.xT.away) : num(snapshot.xT.home)
        };
    },

    parseMinuteFromEventText(text) {
        const raw = String(text || '').trim();
        const m = raw.match(/^['’`\s]*(\d{1,3})(?:\+(\d{1,2}))?\b/);
        if (!m) return null;

        const base = Number(m[1]);
        if (!Number.isFinite(base) || base <= 0) return null;
        return Math.max(1, Math.min(base, 90));
    },

    getLatestEventMinute(snapshot) {
        const events = Array.isArray(snapshot?.eventsText) ? snapshot.eventsText : [];
        const minutes = events
            .map(text => this.parseMinuteFromEventText(text))
            .filter(x => Number.isFinite(x) && x > 0);

        return minutes.length ? Math.max(...minutes) : null;
    },

    getEffectiveMinute(snapshot) {
        const explicit = Number(snapshot?.minute);
        if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, 90);

        const baseMinute = Number(snapshot?.baseMinute);
        if (Number.isFinite(baseMinute) && baseMinute > 0) return Math.min(baseMinute, 90);

        const eventMinute = this.getLatestEventMinute(snapshot);
        if (Number.isFinite(eventMinute) && eventMinute > 0) return eventMinute;

        const windowFrom = Number(snapshot?.generationWindow?.from);
        if (Number.isFinite(windowFrom) && windowFrom > 1) return windowFrom;

        const bucket = String(snapshot?.bucket || '');
        const bucketMatch = bucket.match(/(\d{1,3})/);
        if (bucketMatch) {
            const bucketMinute = Number(bucketMatch[1]);
            if (Number.isFinite(bucketMinute) && bucketMinute > 1) return Math.min(bucketMinute, 90);
        }

        return 0;
    },

    getPlayerSignals(snapshot) {
        const rows = Array.isArray(snapshot?.lineupRows) ? snapshot.lineupRows : [];
        const teams = snapshot?.teams || [];
        const myTeam = snapshot?.myTeam;
        const mySide = myTeam && Number(teams[0]) === Number(myTeam) ? 'home' : 'away';
        const oppSide = mySide === 'home' ? 'away' : 'home';

        const isStarter = p => p && p.isStarter && p.side !== 'sub' && p.normalizedPosition && p.normalizedPosition !== 'SUB';
        const oppRows = rows.filter(p => isStarter(p) && p.side === oppSide);
        const weakOppSkill = oppRows
            .filter(p => p.displayMetricMode === 'skill' && p.skill != null)
            .sort((a, b) => a.skill - b.skill)
            .slice(0, 2);

        return { weakOppSkill };
    },

    getPresetTitle(name) {
        const labels = typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels ? PresetStorage.getAllLabels() : {};
        return labels[name] || TacticPresetLibrary?.meta?.[name]?.title || name || '';
    },

    getPresetScheme(name) {
        return TacticPresetLibrary?.getSchemeForPreset ? TacticPresetLibrary.getSchemeForPreset(name) : '';
    },

    getPresetGroup(name) {
        return TacticPresetLibrary?.getGroup ? TacticPresetLibrary.getGroup(name) : TacticPresetLibrary?.meta?.[name]?.group || 'custom';
    },

    getPresetRank(name) {
        return TacticPresetLibrary?.getRank ? TacticPresetLibrary.getRank(name) : Number(TacticPresetLibrary?.meta?.[name]?.rank || 0);
    },

    getPresetLadder(group) {
        const ladders = {
            defensive: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3', 'Henta_Hold_def3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
            balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Pep_StandardControl_bal3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'Conte_WingbackWidth_bal4'],
            attack: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'DeZerbi_Release_att4', 'Klopp_WideTrap_att4', 'Bielsa_ChaosPress_att5'],
            henta: ['Henta_CentralTrap_att3', 'Henta_LeftTrap_att3', 'Henta_RightTrap_att3', 'Henta_WideTrap_att3', 'Henta_CounterTrap_att4']
        };

        return ladders[group] || [];
    },

    getAdjacentPresetInFamily(currentName, desiredName, group) {
        const ladder = this.getPresetLadder(group);
        if (!ladder.length) return desiredName;

        const currentIndex = ladder.indexOf(currentName);
        const desiredIndex = ladder.indexOf(desiredName);
        if (currentIndex < 0 || desiredIndex < 0) return desiredName;
        if (Math.abs(desiredIndex - currentIndex) <= 1) return desiredName;

        return ladder[currentIndex + Math.sign(desiredIndex - currentIndex)] || desiredName;
    },

    getPostApplyEffectSignal(progression) {
        const effect = progression?.lastEffect || null;
        if (!effect || !Number.isFinite(Number(effect.effectScore))) {
            return { known: false, score: 0, verdict: 'unknown' };
        }

        const score = Number(effect.effectScore);
        return {
            known: true,
            score,
            verdict: score >= 1.5 ? 'good' : score <= -3 ? 'bad_critical' : score <= -1.25 ? 'bad' : 'neutral',
            effect
        };
    },

    hasStrongPostApplyFailure(snapshot, context = {}) {
        const progression = STATE.presetProgression || null;
        const effect = this.getPostApplyEffectSignal(progression);
        if (effect.verdict === 'bad_critical') return true;
        if (effect.verdict === 'bad') return true;

        const score = context.score || this.getScoreState(snapshot);
        const minute = Number(context.minute ?? this.getEffectiveMinute(snapshot));
        const myXg = Number(context.myXg || 0);
        const oppXg = Number(context.oppXg || 0);
        const myXT = Number(context.myXT || 0);
        const oppXT = Number(context.oppXT || 0);
        const myBad = Number(context.myBad || 0);

        if (score.state === 'losing' && minute >= 70 && oppXg > myXg + 0.4) return true;
        if (oppXg > myXg + 0.8 || oppXT > myXT + 0.6) return true;
        if (myBad >= 26) return true;
        return false;
    },

    applyProgressionGuard(candidate, snapshot, context = {}) {
        if (!candidate?.name || !snapshot || snapshot.status === 'finished') return candidate;

        const progression = STATE.presetProgression || null;
        const lastApplied = progression?.lastAppliedPreset || '';
        if (!lastApplied || lastApplied === 'manual_change' || !TacticPresetLibrary?.meta?.[lastApplied]) {
            return Object.assign({}, candidate, { progressionAction: 'new_baseline' });
        }

        if (String(progression.gameId || '') !== String(snapshot.gameId || '')) {
            return Object.assign({}, candidate, { progressionAction: 'new_game' });
        }

        const urgency = context.urgency || {};
        if (urgency.overrideProgressionGuard) {
            return Object.assign({}, candidate, { progressionAction: 'emergency_override' });
        }

        const qualitySignal = context.generatorQualitySignal || snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(snapshot.developerHints || []);
        const qualityPositive = qualitySignal?.detected && qualitySignal.direction === 'positive';
        const strongFailure = this.hasStrongPostApplyFailure(snapshot, context);
        const currentGroup = progression.family || this.getPresetGroup(lastApplied);
        const candidateGroup = this.getPresetGroup(candidate.name);
        const previousPreset = progression.previousPreset || '';
        const allowFamilyChange = urgency.allowFamilyChange === true;

        if (qualityPositive && candidate.name !== lastApplied && !strongFailure) {
            return {
                name: lastApplied,
                reason: 'генератор оценивает игру лучше ожиданий — текущий baseline не ломаем до сильного отрицательного сигнала',
                progressionAction: 'hold_positive_generator_quality'
            };
        }

        if (previousPreset && candidate.name === previousPreset && !strongFailure) {
            return {
                name: lastApplied,
                reason: 'анти-ping-pong: предыдущий пресет не возвращаем в соседнем окне без явного провала',
                progressionAction: 'hold_against_immediate_rollback'
            };
        }

        if (candidate.name === lastApplied) {
            return Object.assign({}, candidate, { progressionAction: 'hold_current' });
        }

        if (candidateGroup !== currentGroup && !allowFamilyChange && !strongFailure) {
            const adjacent = this.getAdjacentPresetInFamily(lastApplied, candidate.name, currentGroup);
            if (adjacent && adjacent !== candidate.name && adjacent !== lastApplied) {
                return {
                    name: adjacent,
                    reason: `пошаговая корректировка от текущего baseline ${this.getPresetTitle(lastApplied)} вместо резкой смены семейства`,
                    progressionAction: 'family_step'
                };
            }

            return {
                name: lastApplied,
                reason: 'сигнал недостаточно сильный для смены семейства пресетов; держим применённый baseline',
                progressionAction: 'hold_family_change_blocked'
            };
        }

        if (candidateGroup === currentGroup) {
            const adjacent = this.getAdjacentPresetInFamily(lastApplied, candidate.name, currentGroup);
            if (adjacent && adjacent !== candidate.name) {
                return {
                    name: adjacent,
                    reason: `усиливаем/смягчаем текущий baseline пошагово: ${this.getPresetTitle(lastApplied)} → ${this.getPresetTitle(adjacent)}`,
                    progressionAction: 'adjacent_step'
                };
            }
        }

        return Object.assign({}, candidate, { progressionAction: 'accepted' });
    },

    hasEnoughLiveData(snapshot) {
        const minute = this.getEffectiveMinute(snapshot);
        if (!snapshot || !Array.isArray(snapshot.stats) || snapshot.stats.length < 2) {
            return { ok: false, phase: 'no_stats', reason: 'Недостаточно статистики команд для рекомендации.' };
        }

        if (snapshot.status === 'finished') return { ok: true, phase: 'finished' };

        if (!Number.isFinite(minute) || minute <= 0) {
            return { ok: false, phase: 'unknown_minute', reason: 'Ждём первую валидную минуту матча.' };
        }

        if (minute < 15) {
            return {
                ok: false,
                phase: 'collect',
                reason: 'Сбор данных до первого generation-среза. Первая рекомендация появится с 15-й минуты для окна 16-30.'
            };
        }

        return { ok: true, phase: 'ready' };
    },

    makeNotEnoughData(snapshot, gate) {
        const minute = this.getEffectiveMinute(snapshot);
        const window = snapshot?.generationWindow || MatchTimingModel.getWindow(minute);
        const rows = [
            gate?.reason || 'Недостаточно данных для рекомендации.',
            minute ? `Текущая минута: ${minute}.` : '',
            window?.label ? `Текущий отрезок: ${window.label}.` : '',
            'Live Parser пока только собирает метрики: счёт, xG/xT, силу на поле, подсказки генератора и детали «подробнее».'
        ];
        return this.sectionHtml('Сбор данных', rows, '#ffd76a', 3);
    },

    classifyState(snapshot, my, opp, playerSignals = {}) {
        const minute = this.getEffectiveMinute(snapshot);
        const score = this.getScoreState(snapshot);
        const xt = this.getXTForMyTeam(snapshot);
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const myXg = num(my?.xG);
        const oppXg = num(opp?.xG);
        const myPossession = num(my?.possession);
        const oppPossession = num(opp?.possession);
        const myBad = num(my?.badActionsPct ?? my?.defective);
        const myFouls = num(my?.fouls ?? my?.['-7']);
        const myPower = num(my?.power);
        const oppPower = num(opp?.power);
        const oppPressVector = num(opp?.pressVector ?? opp?.press_height);
        const oppDefVector = num(opp?.defVector ?? opp?.def_height);
        const strengthContext = typeof StrengthContextModel !== 'undefined'
            ? StrengthContextModel.getPowerContext(myPower, oppPower)
            : { known: false, strengthGap: null, label: '', mode: 'unknown', bucket: 'unknown' };
        const generatorQualitySignal = snapshot.generatorQualitySignal || DeveloperHintParser.getGeneratorQualitySignal(hints);
        const generatorExpectedPerformance = snapshot.generatorExpectedPerformance || (typeof GeneratorExpectedPerformanceParser !== 'undefined' ? GeneratorExpectedPerformanceParser.parse(hints) : null);
        const generatorDetailMetrics = snapshot.generatorDetailMetrics || null;
        const ownCrossSummary = generatorDetailMetrics?.crosses?.own?.summary || null;
        const oppCrossSummary = generatorDetailMetrics?.crosses?.opponent?.summary || null;
        const pressFatigue = typeof StrengthContextModel !== 'undefined'
            ? StrengthContextModel.assessPressFatigue(snapshot, { minute, myXg, oppXg, myXT: xt.myXT, oppXT: xt.oppXT, myFouls, myBad })
            : { active: false, risk: 'low' };

        const tags = [];
        const add = tag => { if (tag && !tags.includes(tag)) tags.push(tag); };

        if (score.state === 'winning') add('winning');
        if (score.state === 'losing') add('losing');
        if (score.state === 'draw') add('draw');
        if (score.state === 'winning' && minute >= 70) add('late_protect_lead');
        if (score.state === 'losing' && minute >= 55) add('need_goal');
        if (score.state === 'losing' && minute >= 80) add('late_need_goal');
        if (oppXg > myXg + 0.45 || xt.oppXT > xt.myXT + 0.25) add('under_pressure');
        if (myXg > oppXg + 0.35 || xt.myXT > xt.oppXT + 0.2) add('attacking_momentum');
        if (myBad >= 20) add('high_bad_actions');
        if (myBad <= 13 && myBad > 0) add('low_bad_actions');
        if (oppPressVector >= 65) add('opponent_high_press');
        if (oppDefVector > 0 && oppDefVector <= 45) add('opponent_low_block');
        if (generatorQualitySignal?.detected && generatorQualitySignal.direction === 'positive') add('generator_quality_positive');
        if (generatorQualitySignal?.detected && generatorQualitySignal.direction === 'negative') add('generator_quality_negative');
        if (generatorExpectedPerformance?.defense?.verdict === 'working') add('generator_defense_working');
        if (generatorExpectedPerformance?.defense?.verdict === 'underperforming') add('generator_defense_underperforming');
        if (generatorExpectedPerformance?.attack?.verdict === 'working') add('generator_attack_working');
        if (generatorExpectedPerformance?.attack?.verdict === 'underperforming') add('generator_attack_underperforming');
        if (ownCrossSummary?.signal === 'open_play_crosses_bad') add('own_open_play_crosses_bad');
        if (ownCrossSummary?.signal === 'crosses_bad_total') add('own_crosses_bad_total');
        if (oppCrossSummary?.winRate != null && oppCrossSummary.winRate >= 55 && oppCrossSummary.total >= 2) add('opponent_crosses_dangerous');
        if (strengthContext.mode === 'advantage') add(strengthContext.bucket === 'huge_advantage' || strengthContext.bucket === 'clear_advantage' ? 'strength_advantage_clear' : 'strength_advantage_slight');
        if (strengthContext.mode === 'disadvantage') add(strengthContext.bucket === 'huge_disadvantage' || strengthContext.bucket === 'clear_disadvantage' ? 'strength_disadvantage_clear' : 'strength_disadvantage_slight');
        if (pressFatigue.active) add('press_fatigue_risk');

        const weakOpp = playerSignals?.weakOppSkill?.[0] || null;
        const weakPos = weakOpp?.normalizedPosition || null;
        if (['DR', 'MR'].includes(weakPos)) add('attack_left');
        if (['DL', 'ML'].includes(weakPos)) add('attack_right');
        if (['DC', 'DM', 'CM'].includes(weakPos)) add('center_weak');
        if (!tags.length) add('base_balance');

        return {
            score,
            minute,
            myXT: xt.myXT,
            oppXT: xt.oppXT,
            myXg,
            oppXg,
            myPossession,
            oppPossession,
            myBad,
            myFouls,
            myPower,
            oppPower,
            strengthGap: strengthContext.strengthGap,
            strengthContext,
            pressFatigue,
            oppPressVector,
            oppDefVector,
            generatorQualitySignal,
            generatorExpectedPerformance,
            generatorDetailMetrics,
            ownCrossSummary,
            oppCrossSummary,
            tags,
            primary: tags[0] || 'base_balance'
        };
    },

    makeMatchRead(snapshot, my, opp, state) {
        const rows = [];
        const score = state.score || { state: 'unknown', diff: 0 };
        const minute = state.minute;

        if (score.state === 'winning') rows.push(`Ход матча: ведём ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else if (score.state === 'losing') rows.push(`Ход матча: проигрываем ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else if (score.state === 'draw') rows.push(`Ход матча: ничья ${score.myGoals}:${score.oppGoals} на ${minute}-й минуте.`);
        else rows.push(`Ход матча: ${minute || '?'}-я минута.`);

        if (state.myXg > state.oppXg + 0.4) rows.push(`По xG мы опаснее: ${state.myXg.toFixed(2)} против ${state.oppXg.toFixed(2)}.`);
        else if (state.oppXg > state.myXg + 0.4) rows.push(`По xG соперник опаснее: ${state.oppXg.toFixed(2)} против ${state.myXg.toFixed(2)}.`);
        else rows.push(`По xG матч близкий: ${state.myXg.toFixed(2)} против ${state.oppXg.toFixed(2)}.`);

        if (state.myXT > state.oppXT + 0.2) rows.push('По xT мы лучше продвигаем атаки.');
        else if (state.oppXT > state.myXT + 0.2) rows.push('По xT соперник опаснее продвигает атаки.');

        if (state.strengthContext?.known) {
            const sign = state.strengthGap > 0 ? '+' : '';
            rows.push(`Сила на поле: ${state.myPower} / ${state.oppPower} (${sign}${state.strengthGap}) — ${state.strengthContext.label}.`);
        }

        if (state.myBad >= 20) rows.push('Брак высокий — сначала нужна структура, а не хаос.');
        else if (state.myBad > 0 && state.myBad <= 13) rows.push('Брак низкий — можно аккуратно повышать качество продвижения.');

        return rows.slice(0, 6);
    },

    buildManualPlan(snapshot, my, opp, state) {
        const plan = { context: [], developer: [], preset: [], controls: [], notes: [], primaryPresetName: '' };
        const urgency = state.urgency || TacticalUrgencyModel.classify(snapshot, state);
        const decisionWindow = urgency.decisionWindow || TacticalUrgencyModel.getDecisionWindow(state.minute);

        if (urgency?.label) {
            const target = decisionWindow?.targetSegment ? ` Цель: ${decisionWindow.targetSegment}.` : '';
            const apply = decisionWindow?.applyByMinute ? ` Применить до ${decisionWindow.applyByMinute}-й.` : '';
            plan.context.push(`Уровень решения: ${urgency.label}.${target}${apply}`.trim());
            if (urgency.reason) plan.context.push(`Причина срочности: ${urgency.reason}.`);
        }

        plan.context.push(...this.makeMatchRead(snapshot, my, opp, state));

        if (state.generatorQualitySignal?.detected) {
            const signal = state.generatorQualitySignal;
            const pctText = signal.percent != null ? ` на ${signal.percent}%` : '';
            if (signal.direction === 'positive') plan.developer.push(`Игра лучше ожиданий генератора${pctText}: baseline работает, не ломать его без сильного триггера.`);
            else if (signal.direction === 'negative') plan.developer.push(`Генератор оценивает игру ниже ожиданий${pctText}: повышаем готовность к смене плана.`);
        }

        const gep = state.generatorExpectedPerformance || null;
        if (gep?.detected) {
            if (gep.summary) plan.developer.push(`Каналы генератора: ${gep.summary}.`);

            if (gep.defense?.detected) {
                const d = gep.defense;
                const valueText = d.actual != null && d.expected != null ? ` (${d.actual.toFixed(2)} xGA при ожидаемом ${d.expected.toFixed(2)} xGA)` : '';
                if (d.verdict === 'working') plan.controls.push(`Оборона работает${valueText}: не ломать линию/ширину/прессинг без radical/emergency-триггера.`);
                if (d.verdict === 'underperforming') plan.controls.push(`Оборона недобирает${valueText}: снизить риск, закрыть переходы и компактнее держать блок.`);
            }

            if (gep.attack?.detected) {
                const a = gep.attack;
                const valueText = a.actual != null && a.expected != null ? ` (${a.actual.toFixed(2)} xG при ожидаемом ${a.expected.toFixed(2)} xG)` : '';
                if (a.verdict === 'working') plan.controls.push(`Атака работает${valueText}: сохранить атакующий паттерн.`);
                if (a.verdict === 'underperforming') plan.controls.push(`Атака недобирает${valueText}: усилить продвижение/темп/риск или ширину по условиям, не ломая рабочую оборону.`);
            }
        }

        if (state.generatorDetailMetrics?.blocksCount) {
            plan.developer.push('Детали «подробнее» прочитаны из скрытых блоков; точный отрезок этих данных неизвестен, поэтому используем их только как вспомогательный сигнал.');
        }

        const own = state.ownCrossSummary;
        if (own?.total >= 2) {
            if (own.signal === 'open_play_crosses_bad') {
                plan.developer.push(`Кроссы с игры не работают: ${own.openPlay.won}/${own.openPlay.total}; не усиливать обычные навесы без нового адресата.`);
                plan.controls.push('Атака: не повышать навесы; искать низовой вход, пас между линиями или полупространства.');
            } else if (own.signal === 'crosses_bad_total') {
                plan.developer.push(`Кроссы в целом слабые: ${own.won}/${own.total}; стандарты/навесы не должны быть главным планом атаки.`);
            }
        }

        const oppCross = state.oppCrossSummary;
        if (oppCross?.total >= 2 && oppCross.winRate >= 55) {
            plan.developer.push(`Кроссы соперника опасны: ${oppCross.won}/${oppCross.total}; не раскрывать фланги без необходимости.`);
            plan.controls.push('Оборона: осторожнее с фланговой шириной и высокой линией, если соперник продолжает грузить в штрафную.');
        }

        if (state.strengthContext?.known) {
            const sign = state.strengthGap > 0 ? '+' : '';
            plan.notes.push(`Сила состава: ${state.myPower} против ${state.oppPower} (${sign}${state.strengthGap}) — ${state.strengthContext.label}; диапазоны provisional до калибровки по raw live.`);
            if (state.strengthContext.mode === 'advantage') plan.notes.push('Преимущество силы: без сильного давления не уходить в чрезмерно пассивный режим; конвертировать силу в контроль и качество атаки.');
            if (state.strengthContext.mode === 'disadvantage') plan.notes.push('Недостаток силы: осторожнее с хаотичным высоким прессингом; важнее компактность и простые выходы.');
        }

        if (state.pressFatigue?.active) {
            plan.context.push(`Цена прессинга: ${state.pressFatigue.reason}.`);
            plan.controls.push('Прессинг: снизить интенсивность/линию или перейти в контроль, если сила на поле падает и растёт брак.');
        }

        return plan;
    },

    applyDeveloperHints(snapshot, plan) {
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        const controlHints = DeveloperHintParser.getControlHints(hints);
        const generatorHints = DeveloperHintParser.getGeneratorHints(hints);
        const daveNotes = typeof DaveEngineKnowledge !== 'undefined'
            ? DaveEngineKnowledge.getRelevantNotes({ tags: [] }, null, snapshot.generatorQualitySignal)
            : [];

        const existingControlKeys = new Set(this.dedupeRows(plan.controls || []).map(row =>
            String(row).toLowerCase().replace(/^подсказка движка:\s*/i, '').replace(/[.]+$/g, '').trim()
        ));
        let addedControlHints = 0;
        controlHints.forEach(hint => {
            if (!hint.control?.ui || addedControlHints >= 3) return;
            const key = String(hint.control.ui).toLowerCase().replace(/[.]+$/g, '').trim();
            if (existingControlKeys.has(key)) return;
            existingControlKeys.add(key);
            plan.controls.push(`Подсказка движка: ${hint.control.ui}.`);
            addedControlHints += 1;
        });

        generatorHints.slice(0, 2).forEach(hint => {
            const text = hint.text || '';
            if (text && !plan.developer.some(x => x.includes(text))) {
                plan.developer.push(`Генератор: ${text}.`);
            }
        });

        daveNotes.slice(0, 1).forEach(note => {
            if (note?.text) plan.notes.push(`Dave/движок: ${note.text}`);
        });
    },

    applyWeakOpponentZoneRule(playerSignals, plan) {
        const weak = playerSignals?.weakOppSkill?.[0] || null;
        if (!weak) return;

        const pos = weak.normalizedPosition || '';
        if (['DR', 'MR'].includes(pos)) plan.controls.push(`Слабая зона соперника справа (${weak.name || pos}) — можно чаще атаковать левым флангом.`);
        if (['DL', 'ML'].includes(pos)) plan.controls.push(`Слабая зона соперника слева (${weak.name || pos}) — можно чаще атаковать правым флангом.`);
        if (['DC', 'DM', 'CM'].includes(pos)) plan.controls.push(`Слабый центр соперника (${weak.name || pos}) — можно аккуратно усиливать вход через центр, если брак низкий.`);
    },

    selectRawPreset(snapshot, state) {
        const score = state.score;
        const minute = state.minute;
        const xgGap = state.oppXg - state.myXg;
        const xtGap = state.oppXT - state.myXT;
        const ownCrossBad = ['open_play_crosses_bad', 'crosses_bad_total'].includes(state.ownCrossSummary?.signal);
        const centerClosed = state.tags.includes('opponent_low_block') || state.tags.includes('own_open_play_crosses_bad');
        const attackUnder = state.generatorExpectedPerformance?.attack?.verdict === 'underperforming';
        const defenseWorking = state.generatorExpectedPerformance?.defense?.verdict === 'working';
        const defenseBad = state.generatorExpectedPerformance?.defense?.verdict === 'underperforming';
        const attackWorking = state.generatorExpectedPerformance?.attack?.verdict === 'working';

        if (state.pressFatigue?.active) {
            return { name: 'Pep_PressCooldown_bal2', reason: 'высокий прессинг начал стоить силы/брака; нужен cooldown без посадки в автобус' };
        }

        if (state.urgency?.preferControlOrCompact) {
            return { name: xgGap > 0.35 || xtGap > 0.25 ? 'Simeone_Compact442_def4' : 'Pep_BoxControl_bal2', reason: 'крупное преимущество — закрыть переходы, снизить риск и сохранить энергию' };
        }

        if (state.urgency?.level === 'emergency') {
            if (score.state === 'losing') return { name: minute >= 70 ? 'Bielsa_ChaosPress_att5' : 'Klopp_Gegenpress_att4', reason: 'экстренный сценарий по счёту/метрикам — нужна кардинальная смена давления' };
            if (defenseBad || xgGap > 0.6) return { name: 'Compact_Counter_def3', reason: 'экстренно закрыть переходы и оставить быстрый выход' };
        }

        if (score.state === 'winning' && minute >= 70) {
            if (xgGap > 0.35 || xtGap > 0.25 || state.tags.includes('opponent_crosses_dangerous')) return { name: 'Simeone_Compact442_def4', reason: 'ведём поздно, соперник создаёт давление — компактнее без полного автобуса' };
            return { name: 'Pep_BoxControl_bal2', reason: 'ведём и контролируем: убрать хаос, держать мяч и не раскрывать переходы' };
        }

        if (score.state === 'losing' && minute >= 80) {
            return { name: ownCrossBad ? 'Klopp_Gegenpress_att4' : 'Bielsa_ChaosPress_att5', reason: 'финальное окно решения — нужен рост давления до 84-й минуты' };
        }

        if (score.state === 'losing' && minute >= 55) {
            if (state.myBad >= 20) return { name: 'Pep_ControlledPush_att3', reason: 'нужен гол, но брак высокий — усиливать атаку контролируемо' };
            return { name: ownCrossBad ? 'Xabi_VerticalBox_att3' : 'Klopp_Gegenpress_att4', reason: 'проигрываем после 55-й — усилить давление, но учитывать качество кроссов/брака' };
        }

        if (defenseWorking && attackUnder) {
            if (state.tags.includes('center_weak') && state.myBad <= 16) return { name: 'Xabi_VerticalBox_att3', reason: 'оборона работает, атака недобирает, центр доступен — вертикальный box без ломки защиты' };
            if (centerClosed && !ownCrossBad) return { name: 'Conte_WingbackWidth_bal4', reason: 'оборона работает, атака недобирает, центр закрыт — аккуратно добавить ширину' };
            return { name: 'Pep_ControlledPush_att3', reason: 'оборона работает, атака недобирает — controlled push без разрушения структуры' };
        }

        if (attackWorking && defenseBad) {
            return { name: 'Compact_Counter_def3', reason: 'атака работает, но оборона недобирает — защитить переходы, не убивая угрозу' };
        }

        if (defenseBad && attackUnder) {
            return { name: 'Pep_BoxControl_bal2', reason: 'оба канала недобирают — reset через контроль и снижение хаоса' };
        }

        if (xgGap > 0.65 || xtGap > 0.55) {
            return { name: score.state === 'winning' ? 'Simeone_Compact442_def4' : 'Compact_Counter_def3', reason: 'соперник заметно опаснее по xG/xT — сначала закрыть переходы' };
        }

        if (state.myBad >= 22) {
            return { name: 'Pep_BoxControl_bal2', reason: 'высокий брак — снизить риск и стабилизировать розыгрыш' };
        }

        if (state.tags.includes('opponent_high_press')) {
            return { name: state.myBad <= 18 ? 'DeZerbi_BaitPress_bal3' : 'Henta_CounterTrap_att4', reason: 'соперник прессингует высоко — выбрать bait-розыгрыш или простой контрвыход' };
        }

        if (state.tags.includes('opponent_low_block')) {
            return { name: ownCrossBad ? 'Xabi_VerticalBox_att3' : 'Pep_TwoThreeFive_att3', reason: 'низкий блок соперника — вскрывать терпением, позиционной атакой или вертикалью без слепых навесов' };
        }

        if (state.strengthContext?.mode === 'advantage' && state.myXg <= state.oppXg + 0.2) {
            return { name: state.myBad <= 16 ? 'Xabi_BoxMidfield_bal3' : 'Pep_BoxControl_bal2', reason: 'сила выше, но качество моментов не доминирует — конвертировать силу в контроль и вход в штрафную' };
        }

        if (state.strengthContext?.mode === 'disadvantage') {
            return { name: 'Mourinho_WeakSide_def3', reason: 'по силе уступаем — компактность, слабая сторона и низкий риск важнее хаотичного прессинга' };
        }

        if (state.tags.includes('attacking_momentum') && state.myBad <= 16) {
            return { name: 'Pep_TwoThreeFive_att3', reason: 'есть атакующий momentum и низкий брак — можно дожимать позиционно' };
        }

        return { name: 'Pep_BoxControl_bal2', reason: 'без явного перекоса лучший baseline — контроль, снижение хаоса и подготовка следующего среза' };
    },

    shouldRecommendSchemeChange(snapshot, state, urgency, presetName) {
        const reasons = [];
        const score = state.score || { state: 'unknown', diff: 0 };
        const losingBy = Math.max(0, -Number(score.diff || 0));
        const winningBy = Math.max(0, Number(score.diff || 0));
        const minute = Number(state.minute || 0);
        const xgGap = state.oppXg - state.myXg;
        const xtGap = state.oppXT - state.myXT;

        if (urgency?.level === 'emergency') reasons.push('экстренный сценарий');
        if (urgency?.level === 'radical') reasons.push('кардинальное окно решения');
        if (urgency?.decisionWindow?.phase === 'final_decision') reasons.push('финальное окно 80-84');
        if (losingBy >= 3 || (minute <= 30 && losingBy >= 2)) reasons.push('счёт требует перестройки');
        if (winningBy >= 4 || (minute <= 35 && winningBy >= 3)) reasons.push('крупное преимущество — закрыть матч');
        if (xgGap >= 0.8 || xtGap >= 0.7) reasons.push('текущая структура пропускает давление');
        if (state.tags.includes('opponent_crosses_dangerous')) reasons.push('кроссы соперника опасны');
        if (state.tags.includes('opponent_low_block') && (presetName === 'Conte_WingbackWidth_bal4' || presetName === 'Klopp_WideTrap_att4')) reasons.push('центр закрыт, нужна ширина');
        if (score.state === 'winning' && minute >= 75 && xgGap > 0.25) reasons.push('поздняя защита преимущества');
        if (score.state === 'losing' && minute >= 80) reasons.push('поздний риск ради гола');
        if (state.pressFatigue?.risk === 'high') reasons.push('структура прессинга выматывает состав');

        return {
            show: reasons.length > 0,
            reason: reasons.slice(0, 2).join('; ')
        };
    },

    getConcisePresetAction(name, state = {}) {
        const actions = {
            Pep_BoxControl_bal2: 'Держать мяч, снизить темп/риск, не раскрывать переходы.',
            Pep_ControlledPush_att3: 'Поднять продвижение и темп на один шаг без ломки обороны.',
            Xabi_VerticalBox_att3: 'Искать вертикальный вход через центр/полупространства, без слепых навесов.',
            Pep_PressCooldown_bal2: 'Сбросить интенсивность прессинга и вернуть контроль.',
            Compact_Counter_def3: 'Закрыть переходы и оставить быстрый выход в свободную зону.',
            Simeone_Compact442_def4: 'Сжать блок, убрать лишний риск, не садиться в полный автобус.',
            Simeone_LowBlock_def5: 'Максимально закрыть штрафную и пережить концовку.',
            Mourinho_WeakSide_def3: 'Компактно обороняться и выходить через слабую сторону.',
            Conte_WingbackWidth_bal4: 'Дать ширину, но не превращать атаку в навесной шум.',
            Klopp_Gegenpress_att4: 'Поднять давление и темп, контролируя усталость/фолы.',
            Bielsa_ChaosPress_att5: 'All-in давление только когда уже нужен риск ради гола.',
            Pep_TwoThreeFive_att3: 'Дожимать позиционно: выше присутствие, но без хаоса.',
            DeZerbi_BaitPress_bal3: 'Заманить прессинг и выпускать мяч между линиями.',
            DeZerbi_Release_att4: 'Быстрее выпускать атаку за высокую линию соперника.',
            Klopp_WideTrap_att4: 'Обойти закрытый центр через оба фланга и прессинг.',
            Henta_CounterTrap_att4: 'Низко отбирать и резко выходить в контратаку.',
            Henta_WideTrap_att3: 'Упростить выход через фланги без форсирования центра.',
            Henta_CentralTrap_att3: 'Давить слабый центр только при низком браке.',
            Henta_LeftTrap_att3: 'Перегрузить левый фланг как главную зону выхода.',
            Henta_RightTrap_att3: 'Перегрузить правый фланг как главную зону выхода.',
            Henta_Hold_def3: 'Удерживать компактность с активным отбором без лишнего риска.'
        };

        return actions[name] || TacticPresetLibrary?.meta?.[name]?.idea || 'Поменять настройки по текущему состоянию матча.';
    },

    getProgressionActionLabel(action) {
        const map = {
            emergency_override: 'аварийный override anti-ping-pong',
            hold_positive_generator_quality: 'держим baseline: генератор подтверждает качество игры',
            hold_against_immediate_rollback: 'не откатываемся сразу к прошлому пресету',
            hold_family_change_blocked: 'сигнал слабый для смены семейства',
            family_step: 'пошаговая смена вместо резкого прыжка',
            adjacent_step: 'пошаговое усиление/смягчение',
            hold_current: 'оставить текущий baseline'
        };
        return map[action] || action;
    },

    selectPreset(snapshot, my, opp, playerSignals, plan, state) {
        const urgency = state.urgency || TacticalUrgencyModel.classify(snapshot, state);
        if (!urgency.allowPreset) {
            plan.preset.push(urgency.reason || 'На этом этапе новая большая рекомендация не выдаётся.');
            return null;
        }

        const raw = this.selectRawPreset(snapshot, state);
        const guarded = this.applyProgressionGuard(raw, snapshot, {
            score: state.score,
            minute: state.minute,
            myXg: state.myXg,
            oppXg: state.oppXg,
            myXT: state.myXT,
            oppXT: state.oppXT,
            myBad: state.myBad,
            urgency,
            generatorQualitySignal: state.generatorQualitySignal
        });

        const name = guarded?.name || raw?.name || 'Pep_BoxControl_bal2';
        const title = this.getPresetTitle(name);
        const reason = guarded?.reason || raw?.reason || 'лучший текущий baseline по live-данным';
        plan.primaryPresetName = name;
        STATE.presetProgression = Object.assign({}, STATE.presetProgression || {}, {
            schema: 'slf_preset_progression_v1',
            gameId: snapshot.gameId,
            lastRecommendedPreset: name,
            recommendedAt: Date.now(),
            recommendedBucket: snapshot.bucket || '',
            recommendedWindowIndex: snapshot.generationWindow?.index || 0,
            family: this.getPresetGroup(name),
            rank: this.getPresetRank(name),
            lastRecommendationReason: reason,
            lastProgressionAction: guarded?.progressionAction || 'selected'
        });

        plan.preset.push(`Поставить: ${title}.`);
        plan.preset.push(`Почему: ${reason}.`);
        plan.preset.push(`Что сделать: ${this.getConcisePresetAction(name, state)}`);
        if (guarded?.progressionAction && !['accepted', 'new_baseline', 'selected'].includes(guarded.progressionAction)) {
            plan.preset.push(`Ограничитель: ${this.getProgressionActionLabel(guarded.progressionAction)}.`);
        }

        const schemeDecision = this.shouldRecommendSchemeChange(snapshot, state, urgency, name);
        const scheme = this.getPresetScheme(name);
        if (schemeDecision.show && scheme) {
            plan.preset.push(`Перестройка: ${schemeDecision.reason}.`);
            plan.preset.push(`Схема для ${title}: ${scheme}.`);
        }

        return name;
    },

    normalizePlan(plan) {
        const source = plan || {};
        const clean = Object.assign({}, source);
        ['context', 'developer', 'preset', 'controls', 'notes'].forEach(key => {
            clean[key] = this.dedupeRows(source[key] || []);
        });
        return clean;
    },

    compactPlan(plan, snapshot, primaryPresetName = '') {
        const cleanPlan = this.normalizePlan(plan);
        const blocks = [];
        blocks.push(this.sectionHtml('Контекст', cleanPlan.context || [], '#8fd3ff', 2));
        blocks.push(this.sectionHtml('Подсказки генератора', cleanPlan.developer || [], '#c8ff7a', 3));
        blocks.push(this.sectionHtml('Конкретное действие', cleanPlan.preset || [], '#75ff75', 1));
        blocks.push(this.sectionHtml('Ручные настройки', cleanPlan.controls || [], '#ffd76a', 4));
        blocks.push(this.sectionHtml('Заметки', cleanPlan.notes || [], '#ddd', 5));

        const html = blocks.filter(Boolean).join('');
        return html || this.sectionHtml('Рекомендация', ['Явной причины менять пресет нет. Играй от счёта, контроля и компактности блока.'], '#ddd', 3);
    },

    makeObserverAnalysis(snapshot) {
        const rows = [];
        const minute = this.getEffectiveMinute(snapshot);
        rows.push(`Матч смотрится без выбранной команды. Минута: ${minute || '?'}.`);
        rows.push('Live Parser собирает статистику, но тактическая рекомендация строится только для управляемой команды.');
        return this.sectionHtml('Рекомендация', rows, '#ffd76a', 3);
    },

    make(snapshot) {
        try {
            if (!snapshot || !snapshot.stats || snapshot.stats.length < 2) {
                return this.sectionHtml('Рекомендация', ['Недостаточно данных для рекомендации.'], '#ffd76a', 3);
            }

            snapshot.effectiveMinute = this.getEffectiveMinute(snapshot);
            const gate = this.hasEnoughLiveData(snapshot);
            if (!gate.ok) return this.makeNotEnoughData(snapshot, gate);

            if (!snapshot.myTeam) return this.makeObserverAnalysis(snapshot);

            const pack = this.getTeamStats(snapshot);
            if (!pack || !pack.my || !pack.opp) {
                return this.sectionHtml('Рекомендация', ['Недостаточно данных по командам.'], '#ffd76a', 3);
            }

            const my = pack.my.stats;
            const opp = pack.opp.stats;
            const playerSignals = this.getPlayerSignals(snapshot);
            const state = this.classifyState(snapshot, my, opp, playerSignals);
            state.urgency = TacticalUrgencyModel.classify(snapshot, state);
            const plan = this.buildManualPlan(snapshot, my, opp, state);

            if (snapshot.status !== 'finished') {
                this.applyDeveloperHints(snapshot, plan);
                this.applyWeakOpponentZoneRule(playerSignals, plan);
                this.selectPreset(snapshot, my, opp, playerSignals, plan, state);
            }

            return this.compactPlan(plan, snapshot, plan.primaryPresetName || '');
        } catch (error) {
            console.error('[SLF RecommendationEngine.make failed]', error);
            return this.sectionHtml('Ошибка рекомендации', [
                'Блок рекомендаций не смог построить анализ. Ошибка выведена в console.error.',
                String(error?.message || error)
            ], '#ff9090', 1);
        }
    },

    makePresetFreeze(snapshot, freeze) {
        return this.sectionHtml('Статус', [
            `Пресет применён: ${freeze.presetName}.`,
            `Ждём следующий snapshot/отрезок: ${freeze.targetBucket || '?'}.`
        ], '#ffd76a', 3);
    },

    isPlaceholderHtml(html) {
        const clean = String(html || '').toLowerCase();
        return !clean ||
            clean.includes('рекомендация появится после snapshot') ||
            clean.includes('рекомендация отложена') ||
            clean.includes('live parser уже запущен');
    },

    captureCurrentRecommendationHtml() {
        const el = document.getElementById('slf-parser-recommendation');
        const html = el ? String(el.innerHTML || '').trim() : '';

        if (!this.isPlaceholderHtml(html)) {
            STATE.lastRecommendationHtml = html;
            STATE.lastRecommendationMeta = Object.assign({}, STATE.lastRecommendationMeta || {}, {
                capturedAt: Date.now(),
                gameId: MatchStateParser.getGameId(),
                source: 'capture_current_recommendation_html'
            });
            return html;
        }

        return STATE.lastRecommendationHtml || '';
    },

    persistRenderedRecommendation(html, snapshot, meta = {}) {
        if (this.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = Object.assign({
            schema: 'slf_last_recommendation_render_v2',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null
        }, meta || {});

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.persistLiveState) {
            SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer });
        }
    },

    update(snapshot) {
        const el = document.getElementById('slf-parser-recommendation');
        if (!el) return;

        try {
            const freeze = SnapshotEngine.getRecommendationFreezeStatus(snapshot);
            if (freeze.active) {
                const waitText = `Пресет применён: ${freeze.presetName}. Ждём следующий snapshot/отрезок ${freeze.targetBucket || '?'}.`;
                if (typeof UI !== 'undefined' && UI.updateParserStatus) UI.updateParserStatus(waitText);

                const preserved = STATE.lastRecommendationHtml || freeze.preservedRecommendationHtml || '';
                if (preserved && !this.isPlaceholderHtml(preserved)) {
                    el.innerHTML = preserved;
                    return;
                }
            }

            const html = this.make(snapshot);
            el.innerHTML = html;
            this.persistRenderedRecommendation(html, snapshot, { source: 'normal_render_v2' });
        } catch (error) {
            console.error('[SLF RecommendationEngine.update failed]', error);
            el.innerHTML = this.sectionHtml('Ошибка рекомендации', [
                'RecommendationEngine.update упал, чтобы не оставлять пустой placeholder.',
                String(error?.message || error)
            ], '#ff9090', 1);
        }
    }
};
    // ============================================================
// <<< src/modules/strategy-data-recommendations/recommendation-engine.js


// >>> src/modules/strategy-data-recommendations/current-action-hint-engine.js
// SLF On-Demand Stage 2 Hint Engine
// ============================================================
// Button-only tactical hint policy.
//
// Contract:
// - executed only after user presses "Подсказка";
// - no live parser loop;
// - no drift/history/adaptation model;
// - no localStorage;
// - no RAG corpus in browser;
// - one current-state action only.

const CurrentActionHintEngine = {
    schema: 'slf_current_action_hint_v2',

    // Source: docs/audit/tactical-preset-rag-audit.md + active preset registry.
    // RAG press note: "Прессинг Игрок" is treated as a pressure/pressing signal,
    // not as a separate per-player tactical subsystem.
    PRESET_AUDIT_TIER: {
        primary: [
            'Pep_BoxControl_bal2',
            'Arteta_Control433_bal3',
            'Compact_Counter_def3',
            'Pep_TwoThreeFive_att3',
            'Conte_WingbackWidth_bal4',
            'Pep_PressCooldown_bal2',
            'Xabi_BoxMidfield_bal3',
            'DeZerbi_BaitPress_bal3'
        ],
        restricted: [
            'Pep_ControlledPush_att3',
            'Xabi_VerticalBox_att3',
            'Mourinho_WeakSide_def3',
            'Simeone_Compact442_def4',
            'Klopp_Gegenpress_att4',
            'Nagelsmann_WidePress_att4',
            'DeZerbi_Release_att4',
            'Henta_LeftTrap_att3'
        ],
        emergency: [
            'Bielsa_ChaosPress_att5',
            'Simeone_LowBlock_def5'
        ],
        needsMoreData: [],
        experimental: [],
        blocked: []
    },

    HINT_RULES: [
        {
            id: 'late_goal_emergency',
            preset: 'Bielsa_ChaosPress_att5',
            decision: 'all_in_attack',
            risk: 'high',
            reason: 'проигрываем в финальной фазе — только emergency all-in',
            when: c => c.lateNeedGoal
        },
        {
            id: 'late_protect_heavy_pressure',
            preset: 'Simeone_LowBlock_def5',
            decision: 'protect_lead',
            risk: 'high',
            reason: 'ведём поздно и соперник давит — пережить отрезок низким блоком',
            when: c => c.protectLead && c.underPressure && c.minute >= 80
        },
        {
            id: 'protect_compact_442',
            preset: 'Simeone_Compact442_def4',
            decision: 'compact_protect',
            risk: 'medium',
            reason: 'ведём, но полный низкий блок ещё не обязателен — компактная защита',
            when: c => c.protectLead && c.minute < 80 && !c.lateNeedGoal
        },
        {
            id: 'own_press_fatigue_cooldown',
            preset: 'Pep_PressCooldown_bal2',
            decision: 'cooldown_press',
            risk: 'low',
            reason: 'растёт цена собственного прессинга — снизить интенсивность и вернуть структуру',
            when: c => c.pressFatigueRisk && !c.lateNeedGoal
        },
        {
            id: 'bad_actions_control_reset',
            preset: 'Pep_BoxControl_bal2',
            decision: 'stabilize_control',
            risk: 'low',
            reason: 'высокий брак — сначала стабилизировать розыгрыш',
            when: c => c.highBadActions && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_release_space',
            preset: 'DeZerbi_Release_att4',
            decision: 'release_after_press',
            risk: 'high',
            reason: 'соперник прессингует, но есть пространство за линией — быстрее выпускать атаку',
            when: c => c.opponentHighPress && c.spaceBehind && !c.highBadActions && !c.pressFatigueRisk && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_bait',
            preset: 'DeZerbi_BaitPress_bal3',
            decision: 'bait_press',
            risk: 'medium',
            reason: 'соперник высоко прессингует, а брак низкий — можно выманить прессинг',
            when: c => c.opponentHighPress && c.lowBadActions && !c.underPressure && !c.transitionThreat && !c.lateNeedGoal
        },
        {
            id: 'opponent_press_compact_counter',
            preset: 'Compact_Counter_def3',
            decision: 'stabilize_and_counter',
            risk: 'medium',
            reason: 'соперник прессингует и давит — не держать автобусом мяч, закрыться и выйти быстро',
            when: c => c.opponentHighPress && c.underPressure && !c.lateNeedGoal
        },
        {
            id: 'under_pressure_counter',
            preset: 'Compact_Counter_def3',
            decision: 'defensive_reset',
            risk: 'medium',
            reason: 'соперник опаснее по текущим метрикам — нужен defensive reset с выходом в контратаку',
            when: c => c.underPressure && (c.transitionThreat || !c.opponentHighPress) && !c.lateNeedGoal
        },
        {
            id: 'weak_side_under_pressure',
            preset: 'Mourinho_WeakSide_def3',
            decision: 'attack_weak_side',
            risk: 'medium',
            reason: 'соперник давит, но есть слабая сторона или пространство для выхода',
            when: c => c.underPressure && (c.spaceBehind || c.weakSideAvailable) && !c.highBadActions && !c.lateNeedGoal
        },
        {
            id: 'center_closed_wide_quality',
            preset: 'Conte_WingbackWidth_bal4',
            decision: 'use_width',
            risk: 'medium',
            reason: 'центр закрыт, но ширина доступна — растянуть блок через фланги',
            when: c => c.opponentLowBlock && c.wideQuality && !c.needGoal && !c.ownCrossesBad && !c.opponentCrossesDangerous
        },
        {
            id: 'urgent_wide_press',
            preset: 'Nagelsmann_WidePress_att4',
            decision: 'wide_pressure',
            risk: 'high',
            reason: 'нужен гол, центр закрыт, фланги доступны — широкий прессинг вместо хаоса',
            when: c => c.needGoal && c.minute >= 65 && c.centerClosed && c.wideQuality && !c.highBadActions && !c.pressFatigueRisk
        },
        {
            id: 'urgent_pressure_not_all_in',
            preset: 'Klopp_Gegenpress_att4',
            decision: 'urgent_pressure',
            risk: 'high',
            reason: 'нужен срочный рост давления, но guard допускает высокий прессинг',
            when: c => c.needGoal && c.minute >= 70 && c.lowBadActions && !c.pressFatigueRisk && !c.transitionThreat
        },
        {
            id: 'attacking_momentum_positional',
            preset: 'Pep_TwoThreeFive_att3',
            decision: 'maintain_pressure',
            risk: 'medium',
            reason: 'есть атакующий импульс — дожимать позиционно с transition guard',
            when: c => c.attackingMomentum && !c.underPressure && !c.transitionThreat
        },
        {
            id: 'need_goal_controlled_push',
            preset: 'Pep_ControlledPush_att3',
            decision: 'increase_attack',
            risk: 'medium',
            reason: 'нужен гол, но без all-in и без лишнего прессинг-риска',
            when: c => c.needGoal && !c.underPressure && !c.highBadActions && !c.pressFatigueRisk
        },
        {
            id: 'center_vertical_entry',
            preset: 'Xabi_VerticalBox_att3',
            decision: 'vertical_center_entry',
            risk: 'medium',
            reason: 'центр доступен и нужен более быстрый вертикальный вход',
            when: c => c.centerWeak && c.attackingMomentum && !c.centerClosed && !c.highBadActions
        },
        {
            id: 'center_weak_box_midfield',
            preset: 'Xabi_BoxMidfield_bal3',
            decision: 'attack_center',
            risk: 'medium',
            reason: 'центр соперника доступен — можно перегрузить середину',
            when: c => c.centerWeak && !c.centerClosed && !c.highBadActions
        },
        {
            id: 'standard_control_low_noise',
            preset: 'Arteta_Control433_bal3',
            decision: 'standard_control',
            risk: 'low',
            reason: 'игра без сильного аварийного сигнала — базовый контроль через структуру',
            when: c => !c.needGoal && !c.underPressure && !c.highBadActions && !c.attackingMomentum
        },
        {
            id: 'safe_default_control',
            preset: 'Pep_BoxControl_bal2',
            decision: 'hold_control',
            risk: 'low',
            reason: 'нет сильного сигнала для рискованной смены — держать безопасный контроль',
            when: () => true
        }
    ],

    num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    },

    bool(value) {
        return value === true || value === 'true' || value === 1 || value === '1';
    },

    getMetric(snapshot, context, key, aliases = []) {
        const sources = [snapshot || {}, context || {}];
        const keys = [key, ...aliases];
        for (const source of sources) {
            for (const name of keys) {
                if (source?.[name] !== undefined && source?.[name] !== null) return source[name];
            }
        }
        return undefined;
    },

    getMinute(snapshot, context = {}) {
        return this.num(this.getMetric(snapshot, context, 'minute', ['baseMinute', 'effectiveMinute']), 0);
    },

    getScoreState(snapshot, context = {}) {
        const explicit = this.getMetric(snapshot, context, 'scoreState');
        if (explicit) return String(explicit);

        const score = snapshot?.score || context?.score;
        if (!score || score.diff === undefined) return 'unknown';
        if (Number(score.diff) > 0) return 'winning';
        if (Number(score.diff) < 0) return 'losing';
        return 'draw';
    },

    hasAny(values) {
        return (Array.isArray(values) ? values : [values]).some(Boolean);
    },

    hasSignal(signals, names) {
        const list = Array.isArray(names) ? names : [names];
        return list.some(name => signals.includes(name));
    },

    buildContext(snapshot, context = {}) {
        const minute = this.getMinute(snapshot, context);
        const scoreState = this.getScoreState(snapshot, context);
        const myXg = this.num(this.getMetric(snapshot, context, 'myXg', ['myXG']));
        const oppXg = this.num(this.getMetric(snapshot, context, 'oppXg', ['oppXG']));
        const myXT = this.num(this.getMetric(snapshot, context, 'myXT'));
        const oppXT = this.num(this.getMetric(snapshot, context, 'oppXT'));
        const myBad = this.num(this.getMetric(snapshot, context, 'myBad', ['badActionsPct', 'myBadActionsPct']));
        const oppPress = this.num(this.getMetric(snapshot, context, 'oppPress', ['oppPressVector', 'opponentPress', 'opponentPressing']));
        const myPress = this.num(this.getMetric(snapshot, context, 'myPress', ['myPressVector', 'ownPress', 'ownPressVector', 'pressingPlayer', 'playerPressing', 'pressing_player', 'player_pressing']));
        const oppDef = this.num(this.getMetric(snapshot, context, 'oppDef', ['oppDefVector']));
        const signals = Array.isArray(context.signals)
            ? context.signals
            : Array.isArray(snapshot?.signals)
                ? snapshot.signals
                : [];

        const ownCrossesBad = this.bool(this.getMetric(snapshot, context, 'ownCrossesBad')) || this.hasSignal(signals, ['own_crosses_bad_total', 'own_open_play_crosses_bad']);
        const opponentCrossesDangerous = this.bool(this.getMetric(snapshot, context, 'opponentCrossesDangerous')) || this.hasSignal(signals, ['opponent_crosses_dangerous']);
        const pressFatigueRisk = this.bool(this.getMetric(snapshot, context, 'pressFatigueRisk')) || this.hasSignal(signals, ['press_fatigue_risk', 'own_press_fatigue', 'press_cost_high']);
        const wideQuality = this.bool(this.getMetric(snapshot, context, 'wideQuality')) || this.hasSignal(signals, ['wide_quality', 'attack_left', 'attack_right', 'wide_advantage']);
        const centerWeak = this.bool(this.getMetric(snapshot, context, 'centerWeak')) || this.hasSignal(signals, ['center_weak', 'center_available']);
        const centerClosed = this.bool(this.getMetric(snapshot, context, 'centerClosed')) || this.hasSignal(signals, ['center_closed']);
        const transitionThreat = this.bool(this.getMetric(snapshot, context, 'transitionThreat')) || this.hasSignal(signals, ['opponent_fast_counter_threat', 'transition_threat']);
        const spaceBehind = this.bool(this.getMetric(snapshot, context, 'spaceBehind')) || this.hasSignal(signals, ['space_behind', 'opponent_high_line', 'release_space']);
        const weakSideAvailable = this.bool(this.getMetric(snapshot, context, 'weakSideAvailable')) || this.hasSignal(signals, ['weak_side_available', 'opponent_flank_weak']);
        const ownHighPress = myPress > 65 || this.hasSignal(signals, ['own_high_press', 'intensive_pressing', 'pressing_player', 'player_pressing']);
        const opponentHighPress = oppPress > 65 || this.hasSignal(signals, ['opponent_high_press']);
        const highBadActions = myBad >= 20 || this.hasSignal(signals, ['high_bad_actions']);

        return {
            minute,
            scoreState,
            myXg,
            oppXg,
            myXT,
            oppXT,
            myBad,
            myPress,
            oppPress,
            oppDef,
            signals,
            needGoal: scoreState === 'losing' && minute >= 55,
            lateNeedGoal: scoreState === 'losing' && minute >= 80,
            protectLead: scoreState === 'winning' && minute >= 70,
            underPressure: oppXg > myXg + 0.4 || oppXT > myXT + 0.2 || this.hasSignal(signals, ['under_pressure']),
            attackingMomentum: myXg > oppXg + 0.3 || myXT > oppXT + 0.2 || this.hasSignal(signals, ['attacking_momentum']),
            highBadActions,
            lowBadActions: !highBadActions && myBad < 12,
            ownHighPress,
            opponentHighPress,
            opponentLowBlock: (oppDef > 0 && oppDef < 45) || this.hasSignal(signals, ['opponent_low_block']),
            ownCrossesBad,
            opponentCrossesDangerous,
            pressFatigueRisk,
            wideQuality,
            centerWeak,
            centerClosed,
            transitionThreat,
            spaceBehind,
            weakSideAvailable
        };
    },

    getPresetStatus(preset) {
        for (const [status, names] of Object.entries(this.PRESET_AUDIT_TIER)) {
            if (names.includes(preset)) return status;
        }
        return 'unknown';
    },

    isPresetAllowed(preset, c) {
        const status = this.getPresetStatus(preset);
        if (status === 'blocked' || status === 'experimental' || status === 'needsMoreData') return false;
        if (status === 'emergency') return c.lateNeedGoal || (c.protectLead && c.underPressure && c.minute >= 80);
        return status === 'primary' || status === 'restricted';
    },

    classify(snapshot, context = {}) {
        const c = this.buildContext(snapshot, context);
        const signals = [];
        const reasons = [];
        const add = (signal, reason) => {
            if (!signals.includes(signal)) signals.push(signal);
            if (reason && !reasons.includes(reason)) reasons.push(reason);
        };

        if (c.needGoal) add('need_goal', 'проигрываем после 55-й минуты');
        if (c.lateNeedGoal) add('late_need_goal', 'финальная фаза, нужен риск');
        if (c.protectLead) add('protect_lead', 'ведём после 70-й минуты');
        if (c.underPressure) add('under_pressure', 'соперник опаснее по xG/xT или давлению');
        if (c.attackingMomentum) add('attacking_momentum', 'есть атакующий импульс');
        if (c.highBadActions) add('high_bad_actions', 'высокий процент брака');
        if (c.lowBadActions) add('low_bad_actions', 'низкий процент брака');
        if (c.ownHighPress) add('own_high_press', 'собственный прессинг активен');
        if (c.opponentHighPress) add('opponent_high_press', 'высокий прессинг соперника');
        if (c.opponentLowBlock) add('opponent_low_block', 'низкий блок соперника');
        if (c.pressFatigueRisk) add('press_fatigue_risk', 'растёт цена прессинга');
        if (c.spaceBehind) add('space_behind', 'есть пространство за линией');
        if (c.weakSideAvailable) add('weak_side_available', 'есть слабая сторона соперника');
        if (c.centerWeak) add('center_weak', 'центр соперника доступен');
        if (c.centerClosed) add('center_closed', 'центр закрыт');
        if (c.wideQuality) add('wide_quality', 'ширина/фланги доступны');
        if (c.ownCrossesBad) add('own_crosses_bad', 'кроссы/фланговая доставка не работают');
        if (c.opponentCrossesDangerous) add('opponent_crosses_dangerous', 'кроссы соперника опасны');
        if (!signals.length) add('balanced_control', 'нет сильного сигнала');

        return {
            minute: c.minute,
            score: c.scoreState,
            signals,
            reasons,
            context: c
        };
    },

    decide(classification) {
        const c = classification?.context || {};
        const rule = this.HINT_RULES.find(item => item.when(c) && this.isPresetAllowed(item.preset, c)) || this.HINT_RULES[this.HINT_RULES.length - 1];
        const presetStatus = this.getPresetStatus(rule.preset);

        return {
            preset: rule.preset,
            presetStatus,
            ruleId: rule.id,
            decision: rule.decision,
            risk: rule.risk,
            reason: rule.reason
        };
    },

    run(snapshot, context = {}) {
        if (!snapshot) return null;

        const classification = this.classify(snapshot, context);
        const action = this.decide(classification);

        return {
            schema: this.schema,
            mode: 'button_on_demand_current_state_only',
            moment: classification,
            action,
            generatedAt: Date.now()
        };
    },

    toPlanRows(result) {
        if (!result) return [];
        return [
            `Moment: ${result.moment.signals.join(', ')}`,
            `Decision: ${result.action.decision} → ${result.action.preset}`,
            `Tier: ${result.action.presetStatus}; rule: ${result.action.ruleId}`,
            `Reason: ${result.action.reason}`
        ];
    }
};

if (typeof window !== 'undefined') {
    window.SLFCurrentActionHintEngine = CurrentActionHintEngine;
}
// <<< src/modules/strategy-data-recommendations/current-action-hint-engine.js


// >>> src/modules/strategy-data-recommendations/coach-hint-snapshot-context-layer.js
// Coach Hint Snapshot Context Layer
// ============================================================
// Bridges raw SnapshotEngine output into CurrentActionHintEngine flat metrics.
//
// Contract:
// - no UI explanation layer;
// - no localStorage;
// - no preset selection on its own;
// - only enriches manual/current hint input with gameId, score state, xG/xT,
//   team stats and derived tactical signals.

(function coachHintSnapshotContextLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__coachHintSnapshotContextApplied) return;

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function hasValue(value) {
        return value !== undefined && value !== null && value !== '';
    }

    function findStat(snapshot, teamId) {
        const rows = Array.isArray(snapshot?.stats) ? snapshot.stats : [];
        const id = Number(teamId);
        return rows.find(row => Number(row?.teamId) === id)?.stats || null;
    }

    function getTeamContext(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams.map(Number).filter(Boolean) : [];
        const myTeam = Number(snapshot?.myTeam || 0) || null;
        const myIndex = teams.findIndex(id => Number(id) === Number(myTeam));
        const safeMyIndex = myIndex >= 0 ? myIndex : 0;
        const oppIndex = safeMyIndex === 0 ? 1 : 0;
        const myId = teams[safeMyIndex] || myTeam || null;
        const oppId = teams[oppIndex] || null;

        return {
            teams,
            myTeam: myId,
            oppTeam: oppId,
            mySide: safeMyIndex === 0 ? 'home' : 'away',
            oppSide: safeMyIndex === 0 ? 'away' : 'home',
            myStats: findStat(snapshot, myId),
            oppStats: findStat(snapshot, oppId)
        };
    }

    function deriveMinute(snapshot, context) {
        const explicit = context?.minute ?? snapshot?.minute ?? snapshot?.baseMinute ?? snapshot?.effectiveMinute;
        if (hasValue(explicit)) return num(explicit, 0);
        if (snapshot?.status === 'finished') return 90;
        return 0;
    }

    function deriveScoreState(snapshot, teamCtx) {
        const score = snapshot?.score || {};
        if (hasValue(score.diff)) {
            const diff = num(score.diff, 0);
            return {
                diff,
                state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
            };
        }

        if (!hasValue(score.home) || !hasValue(score.away)) {
            return { diff: 0, state: 'unknown' };
        }

        const home = num(score.home, 0);
        const away = num(score.away, 0);
        const diff = teamCtx.mySide === 'away' ? away - home : home - away;

        return {
            diff,
            state: diff > 0 ? 'winning' : diff < 0 ? 'losing' : 'draw'
        };
    }

    function readXT(snapshot, side) {
        const xT = snapshot?.xT || {};
        return num(xT?.[side], 0);
    }

    function addSignal(signals, signal) {
        if (signal && !signals.includes(signal)) signals.push(signal);
    }

    function hintTextList(snapshot) {
        const hints = Array.isArray(snapshot?.developerHints) ? snapshot.developerHints : [];
        return hints
            .map(hint => String(hint?.text || hint || '').toLowerCase())
            .filter(Boolean);
    }

    function deriveHintSignals(snapshot, signals) {
        const texts = hintTextList(snapshot);
        const has = pattern => texts.some(text => pattern.test(text));

        if (has(/устал|требуются замены|замен/)) addSignal(signals, 'press_fatigue_risk');
        if (has(/повысить интенсивность прессинга|высокий прессинг|прессинг/)) addSignal(signals, 'own_high_press');
        if (has(/опустите прессинг|снизить прессинг/)) addSignal(signals, 'press_fatigue_risk');
        if (has(/фланг|lw|rw|lm|rm|край/)) addSignal(signals, 'wide_quality');
        if (has(/атака по центру|центр закрыт|отключите атаку по центру/)) addSignal(signals, 'center_closed');
        if (has(/контратак|обрез|быстр/)) addSignal(signals, 'transition_threat');
        if (has(/кросс|навес/)) addSignal(signals, 'wide_quality');
        if (has(/ж[её]лт|карточ/)) addSignal(signals, 'opponent_cards_available');
    }

    function deriveSignals(snapshot, context, metrics) {
        const signals = [];
        const rawSignals = [];

        if (Array.isArray(context?.signals)) rawSignals.push(...context.signals);
        if (Array.isArray(snapshot?.signals)) rawSignals.push(...snapshot.signals);
        rawSignals.forEach(signal => addSignal(signals, String(signal)));

        if (metrics.needGoal) addSignal(signals, 'need_goal');
        if (metrics.lateNeedGoal) addSignal(signals, 'late_need_goal');
        if (metrics.protectLead) addSignal(signals, 'protect_lead');
        if (metrics.underPressure) addSignal(signals, 'under_pressure');
        if (metrics.attackingMomentum) addSignal(signals, 'attacking_momentum');
        if (metrics.highBadActions) addSignal(signals, 'high_bad_actions');
        if (metrics.myPress > 18) addSignal(signals, 'own_high_press');
        if (metrics.oppPress > 18) addSignal(signals, 'opponent_high_press');
        if (metrics.oppPress > metrics.myPress + 14) addSignal(signals, 'opponent_high_press');
        if (metrics.oppXg > metrics.myXg + 0.65 && metrics.oppXT >= metrics.myXT) addSignal(signals, 'transition_threat');
        if (metrics.oppDef < -15) addSignal(signals, 'opponent_low_block');
        if (metrics.myXT > metrics.oppXT + 0.18) addSignal(signals, 'wide_quality');
        if (metrics.myXg < 0.35 && metrics.oppXg < 0.35 && metrics.minute >= 25) addSignal(signals, 'center_closed');

        deriveHintSignals(snapshot, signals);

        return signals;
    }

    function deriveContext(snapshot, context = {}) {
        const teamCtx = getTeamContext(snapshot || {});
        const score = deriveScoreState(snapshot || {}, teamCtx);
        const minute = deriveMinute(snapshot || {}, context || {});
        const myStats = teamCtx.myStats || {};
        const oppStats = teamCtx.oppStats || {};

        const myXg = hasValue(context.myXg) ? num(context.myXg) : num(myStats.xG, 0);
        const oppXg = hasValue(context.oppXg) ? num(context.oppXg) : num(oppStats.xG, 0);
        const myXT = hasValue(context.myXT) ? num(context.myXT) : readXT(snapshot, teamCtx.mySide);
        const oppXT = hasValue(context.oppXT) ? num(context.oppXT) : readXT(snapshot, teamCtx.oppSide);
        const myBad = hasValue(context.myBad) ? num(context.myBad) : num(myStats.badActionsPct, 0);
        const oppBad = num(oppStats.badActionsPct, 0);
        const myPress = hasValue(context.myPress) ? num(context.myPress) : num(myStats.pressVector, 0);
        const oppPress = hasValue(context.oppPress) ? num(context.oppPress) : num(oppStats.pressVector, 0);
        const myDef = num(myStats.defVector, 0);
        const oppDef = hasValue(context.oppDef) ? num(context.oppDef) : num(oppStats.defVector, 0);
        const myPossession = num(myStats.possession, 0);
        const oppPossession = num(oppStats.possession, 0);
        const myShots = num(myStats.shots, 0);
        const oppShots = num(oppStats.shots, 0);
        const myPower = num(myStats.power, 0);
        const oppPower = num(oppStats.power, 0);

        const needGoal = score.state === 'losing' && minute >= 55;
        const lateNeedGoal = score.state === 'losing' && minute >= 80;
        const protectLead = score.state === 'winning' && minute >= 70;
        const underPressure = oppXg > myXg + 0.4 || oppXT > myXT + 0.2 || oppShots > myShots + 4;
        const attackingMomentum = myXg > oppXg + 0.3 || myXT > oppXT + 0.2 || myShots > oppShots + 4;
        const highBadActions = myBad >= 20;

        const metrics = {
            minute,
            scoreState: score.state,
            myXg,
            oppXg,
            myXT,
            oppXT,
            myBad,
            oppBad,
            myPress,
            oppPress,
            myDef,
            oppDef,
            myPossession,
            oppPossession,
            myShots,
            oppShots,
            myPower,
            oppPower,
            needGoal,
            lateNeedGoal,
            protectLead,
            underPressure,
            attackingMomentum,
            highBadActions
        };

        const signals = deriveSignals(snapshot || {}, context || {}, metrics);
        const manualHintRequest = !!(
            snapshot?.manualRecommendationRefresh ||
            snapshot?.recommendationSource === 'manual' ||
            context?.manualHintRequest
        );

        return Object.assign({}, context || {}, metrics, {
            gameId: String(snapshot?.gameId || context?.gameId || 'unknown'),
            matchStatus: snapshot?.status || context?.matchStatus || 'unknown',
            scoreState: score.state,
            score: Object.assign({}, snapshot?.score || {}, { diff: score.diff }),
            teamSide: teamCtx.mySide,
            myTeam: teamCtx.myTeam,
            oppTeam: teamCtx.oppTeam,
            signals,
            manualHintRequest,
            coachHintSnapshotContext: {
                active: true,
                source: 'snapshot_stats_bridge',
                myTeam: teamCtx.myTeam,
                oppTeam: teamCtx.oppTeam,
                mySide: teamCtx.mySide,
                scoreState: score.state,
                signalCount: signals.length
            }
        });
    }

    function cloneSnapshot(snapshot, enrichedContext) {
        if (!snapshot || typeof snapshot !== 'object') return snapshot;
        const clone = Object.assign({}, snapshot);

        clone.gameId = enrichedContext.gameId;
        clone.minute = enrichedContext.minute;
        clone.score = Object.assign({}, snapshot.score || {}, { diff: enrichedContext.score.diff });
        clone.scoreState = enrichedContext.scoreState;
        clone.signals = enrichedContext.signals.slice();
        clone.myXg = enrichedContext.myXg;
        clone.oppXg = enrichedContext.oppXg;
        clone.myXT = enrichedContext.myXT;
        clone.oppXT = enrichedContext.oppXT;
        clone.myBad = enrichedContext.myBad;
        clone.myPress = enrichedContext.myPress;
        clone.oppPress = enrichedContext.oppPress;
        clone.oppDef = enrichedContext.oppDef;
        clone.manualHintRequest = enrichedContext.manualHintRequest;

        return clone;
    }

    CurrentActionHintEngine.run = function runWithCoachHintSnapshotContext(snapshot, context = {}) {
        const enrichedContext = deriveContext(snapshot, context || {});
        const enrichedSnapshot = cloneSnapshot(snapshot, enrichedContext);
        const result = originalRun(enrichedSnapshot, enrichedContext);

        if (result?.moment) {
            result.moment.gameId = enrichedContext.gameId;
            result.moment.score = enrichedContext.scoreState;
            result.moment.context = Object.assign({}, result.moment.context || {}, {
                gameId: enrichedContext.gameId,
                matchStatus: enrichedContext.matchStatus,
                manualHintRequest: enrichedContext.manualHintRequest,
                coachHintSnapshotContext: enrichedContext.coachHintSnapshotContext,
                myPower: enrichedContext.myPower,
                oppPower: enrichedContext.oppPower,
                myPossession: enrichedContext.myPossession,
                oppPossession: enrichedContext.oppPossession,
                myShots: enrichedContext.myShots,
                oppShots: enrichedContext.oppShots
            });
        }

        if (result?.action) {
            result.action.snapshotContextBridge = true;
        }

        if (typeof window !== 'undefined') {
            window.SLFLastCoachHintContext = {
                gameId: enrichedContext.gameId,
                minute: enrichedContext.minute,
                scoreState: enrichedContext.scoreState,
                signals: enrichedContext.signals.slice(),
                metrics: {
                    myXg: enrichedContext.myXg,
                    oppXg: enrichedContext.oppXg,
                    myXT: enrichedContext.myXT,
                    oppXT: enrichedContext.oppXT,
                    myBad: enrichedContext.myBad,
                    myPress: enrichedContext.myPress,
                    oppPress: enrichedContext.oppPress
                }
            };
        }

        return result;
    };

    CurrentActionHintEngine.__coachHintSnapshotContextApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFCoachHintSnapshotContextLayer = {
            deriveContext
        };
    }
})();
// <<< src/modules/strategy-data-recommendations/coach-hint-snapshot-context-layer.js


// >>> src/modules/tactics-presets/active-preset-registry.js
// Active Tactical Preset Registry
// ============================================================
// Single runtime source for the active tactical preset set.
// Henta is not a separate subsystem here: only Henta_LeftTrap_att3
// remains as one normal preset in the common preset library.
// build_temp means verticality of ball progression, not passing speed:
// 1 = patient/horizontal, 2 = moderate, 3 = high/direct verticality.

(function activeTacticalPresetRegistry() {
    'use strict';

    const ACTIVE_PRESET_NAMES = [
        'Arteta_Control433_bal3',
        'Simeone_LowBlock_def5',
        'Simeone_Compact442_def4',
        'Mourinho_WeakSide_def3',
        'Pep_BoxControl_bal2',
        'Pep_ControlledPush_att3',
        'Pep_TwoThreeFive_att3',
        'Pep_PressCooldown_bal2',
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3',
        'DeZerbi_BaitPress_bal3',
        'DeZerbi_Release_att4',
        'Conte_WingbackWidth_bal4',
        'Compact_Counter_def3',
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5',
        'Henta_LeftTrap_att3'
    ];

    const ACTIVE = new Set(['standard', ...ACTIVE_PRESET_NAMES]);

    const PRESETS = {
        Arteta_Control433_bal3: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '4', pass_risk: '3', dribble: '2', cross: '2', corner: '1', shot: '2', priority: ['center', 'right'] },
        Simeone_LowBlock_def5: { def_line: '1', press_line: '1', def_width: '1', press_intense: '2', build_type: '1', build_temp: '1', build_long: '2', build_fast: '1', style: '1', pass_risk: '1', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['right'] },
        Simeone_Compact442_def4: { def_line: '1', press_line: '2', def_width: '1', press_intense: '3', build_type: '2', build_temp: '1', build_long: '2', build_fast: '1', style: '2', pass_risk: '2', dribble: '1', cross: '2', corner: '1', shot: '1', priority: ['left', 'right'] },
        Mourinho_WeakSide_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '3', style: '2', pass_risk: '2', dribble: '2', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Pep_BoxControl_bal2: { def_line: '2', press_line: '2', def_width: '1', press_intense: '2', build_type: '2', build_temp: '1', build_long: '1', build_fast: '1', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['center'] },
        Pep_ControlledPush_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '4', pass_risk: '3', dribble: '3', cross: '2', corner: '1', shot: '2', priority: ['center'] },
        Pep_TwoThreeFive_att3: { def_line: '3', press_line: '3', def_width: '3', press_intense: '4', build_type: '2', build_temp: '3', build_long: '1', build_fast: '3', style: '5', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: ['center'] },
        Pep_PressCooldown_bal2: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '2', dribble: '1', cross: '1', corner: '1', shot: '1', priority: ['center', 'right'] },
        Xabi_BoxMidfield_bal3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '2', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        Xabi_VerticalBox_att3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '3', build_type: '2', build_temp: '3', build_long: '2', build_fast: '3', style: '4', pass_risk: '4', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        DeZerbi_BaitPress_bal3: { def_line: '2', press_line: '2', def_width: '2', press_intense: '2', build_type: '1', build_temp: '1', build_long: '1', build_fast: '2', style: '3', pass_risk: '3', dribble: '2', cross: '1', corner: '1', shot: '2', priority: ['center'] },
        DeZerbi_Release_att4: { def_line: '2', press_line: '3', def_width: '2', press_intense: '3', build_type: '1', build_temp: '3', build_long: '2', build_fast: '4', style: '4', pass_risk: '4', dribble: '3', cross: '2', corner: '1', shot: '3', priority: ['center', 'right'] },
        Conte_WingbackWidth_bal4: { def_line: '2', press_line: '2', def_width: '3', press_intense: '3', build_type: '2', build_temp: '2', build_long: '2', build_fast: '3', style: '3', pass_risk: '3', dribble: '3', cross: '4', corner: '1', shot: '2', priority: ['left', 'right'] },
        Compact_Counter_def3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '3', build_type: '1', build_temp: '2', build_long: '3', build_fast: '4', style: '3', pass_risk: '2', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left', 'right'] },
        Klopp_Gegenpress_att4: { def_line: '3', press_line: '4', def_width: '3', press_intense: '5', build_type: '3', build_temp: '3', build_long: '2', build_fast: '4', style: '5', pass_risk: '4', dribble: '4', cross: '3', corner: '1', shot: '3', priority: ['left', 'right'] },
        Nagelsmann_WidePress_att4: { def_line: '3', press_line: '4', def_width: '4', press_intense: '5', build_type: '3', build_temp: '3', build_long: '2', build_fast: '4', style: '5', pass_risk: '4', dribble: '4', cross: '4', corner: '1', shot: '3', priority: ['left', 'right'] },
        Bielsa_ChaosPress_att5: { def_line: '4', press_line: '5', def_width: '4', press_intense: '5', build_type: '3', build_temp: '3', build_long: '3', build_fast: '5', style: '5', pass_risk: '5', dribble: '5', cross: '4', corner: '1', shot: '4', priority: ['left', 'center', 'right'] },
        Henta_LeftTrap_att3: { def_line: '1', press_line: '2', def_width: '2', press_intense: '4', build_type: '1', build_temp: '2', build_long: '3', build_fast: '3', style: '3', pass_risk: '2', dribble: '3', cross: '3', corner: '1', shot: '2', priority: ['left'] }
    };

    const LABELS = {
        Arteta_Control433_bal3: 'Arteta Control 4-3-3',
        Simeone_LowBlock_def5: 'Simeone Low Block',
        Simeone_Compact442_def4: 'Simeone Compact 4-4-2',
        Mourinho_WeakSide_def3: 'Mourinho Weak Side',
        Pep_BoxControl_bal2: 'Pep Box Control',
        Pep_ControlledPush_att3: 'Pep Controlled Push',
        Pep_TwoThreeFive_att3: 'Pep Positional Attack',
        Pep_PressCooldown_bal2: 'Pep Press Cooldown',
        Xabi_BoxMidfield_bal3: 'Xabi Box Midfield',
        Xabi_VerticalBox_att3: 'Xabi Vertical Box',
        DeZerbi_BaitPress_bal3: 'De Zerbi Bait Press',
        DeZerbi_Release_att4: 'De Zerbi Release',
        Conte_WingbackWidth_bal4: 'Conte Wingback Width',
        Compact_Counter_def3: 'Compact Counter',
        Klopp_Gegenpress_att4: 'Klopp Gegenpress',
        Nagelsmann_WidePress_att4: 'Nagelsmann Wide Press',
        Bielsa_ChaosPress_att5: 'Bielsa Chaos Press',
        Henta_LeftTrap_att3: 'Henta Left Trap'
    };

    const META = {
        Arteta_Control433_bal3: { group: 'balance', rank: 3, title: 'Arteta Control 4-3-3', idea: 'позиционный контроль с более высокой структурой, чем safe box-control', use: 'равная игра, нужен контроль без ухода в пассивность', risk: 'может быть нейтрально, если нужен быстрый гол' },
        Simeone_LowBlock_def5: { group: 'defensive', rank: 5, title: 'Simeone Low Block', idea: 'максимально низкий и компактный блок', use: 'ведём поздно, соперник давит, нужно пережить отрезок', risk: 'можно полностью отдать инициативу' },
        Simeone_Compact442_def4: { group: 'defensive', rank: 4, title: 'Simeone Compact 4-4-2', idea: 'компактная защита без полного автобуса', use: 'ведём или нас прижимают, но нужен выход через фланги', risk: 'давление может накопиться, если не выходить из блока' },
        Mourinho_WeakSide_def3: { group: 'defensive', rank: 3, title: 'Mourinho Weak Side', idea: 'низкий/средний блок и быстрый выход в слабую сторону', use: 'соперник давит и оставляет слабый фланг или пространство', risk: 'без первого паса контратаки сорвутся' },
        Pep_BoxControl_bal2: { group: 'balance', rank: 2, title: 'Pep Box Control', idea: 'снизить хаос и держать безопасный контроль', use: 'высокий брак, нужно стабилизировать игру', risk: 'против высокого прессинга можно застрять' },
        Pep_ControlledPush_att3: { group: 'attack', rank: 3, title: 'Pep Controlled Push', idea: 'усилить атаку без all-in', use: 'нужен гол, но нас не давят', risk: 'при браке усиление превратится в потери' },
        Pep_TwoThreeFive_att3: { group: 'attack', rank: 3, title: 'Pep Positional Attack', idea: 'позиционно дожимать и держать территорию', use: 'есть attacking momentum и transition guard', risk: 'опасно против быстрых контратак' },
        Pep_PressCooldown_bal2: { group: 'balance', rank: 2, title: 'Pep Press Cooldown', idea: 'снизить цену прессинга и вернуть структуру', use: 'растёт усталость/брак/цена прессинга', risk: 'может не хватить давления при срочном голе' },
        Xabi_BoxMidfield_bal3: { group: 'balance', rank: 3, title: 'Xabi Box Midfield', idea: 'перегруз центра и контроль переходов', use: 'центр доступен, брак низкий, нужна середина', risk: 'при закрытом центре игра упрётся в блок' },
        Xabi_VerticalBox_att3: { group: 'attack', rank: 3, title: 'Xabi Vertical Box', idea: 'вертикальный вход между линиями через центр', use: 'центр доступен и нужен более быстрый вход', risk: 'против прессинга и брака даст потери' },
        DeZerbi_BaitPress_bal3: { group: 'balance', rank: 3, title: 'De Zerbi Bait Press', idea: 'заманить высокий прессинг и раскрыть линии', use: 'соперник высоко прессингует, у нас есть качество паса', risk: 'слабая первая линия может привезти момент' },
        DeZerbi_Release_att4: { group: 'attack', rank: 4, title: 'De Zerbi Release', idea: 'вертикально выпускать атаку за прессинг', use: 'есть пространство за линией соперника', risk: 'если пространства нет, риск паса пустой' },
        Conte_WingbackWidth_bal4: { group: 'balance', rank: 4, title: 'Conte Wingback Width', idea: 'растянуть блок через фланги/wingbacks', use: 'центр закрыт, ширина доступна', risk: 'слабые фланги дадут навесной шум' },
        Compact_Counter_def3: { group: 'defensive', rank: 3, title: 'Compact Counter', idea: 'закрыть переходы и оставить быстрый выход', use: 'нас давят или опасны переходы', risk: 'можно потерять устойчивое давление' },
        Klopp_Gegenpress_att4: { group: 'attack', rank: 4, title: 'Klopp Gegenpress', idea: 'высокое давление и быстрый возврат мяча', use: 'нужен срочный прессинг, но ещё не all-in', risk: 'усталость, фолы, пространство за спиной' },
        Nagelsmann_WidePress_att4: { group: 'attack', rank: 4, title: 'Nagelsmann Wide Press', idea: 'широкий прессинг и атака через фланги', use: 'центр закрыт, но есть wide advantage', risk: 'без флангового качества станет предсказуемо' },
        Bielsa_ChaosPress_att5: { group: 'attack', rank: 5, title: 'Bielsa Chaos Press', idea: 'максимальная вертикальность и давление ради спасения', use: '80+ минута, проигрываем, нужна последняя попытка', risk: 'может развалить оборону' },
        Henta_LeftTrap_att3: { group: 'henta', rank: 3, title: 'Henta Left Trap', idea: 'низкий блок, агрессивный отбор и левофланговая ловушка', use: 'слабый правый фланг соперника или сильный левый фланг у нас', risk: 'перекос влево может стать читаемым' }
    };

    const SCHEME_STATES = {
        standard_base: '4-2-3-1 standard / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        Arteta_Control433_bal3: '4-3-3 control / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Simeone_LowBlock_def5: '5-4-1 low block / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        Simeone_Compact442_def4: '4-4-2 compact / GK-LD-CD1-CD3-RD / LM-CM2-DM2-RM / ST1-ST2',
        Mourinho_WeakSide_def3: '4-1-4-1 weak side / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Pep_BoxControl_bal2: '4-2-2-2 box control / GK-LD-CD1-CD3-RD / DM2-CM2 / AM1-AM2 / ST1-ST2',
        Pep_ControlledPush_att3: '4-2-3-1 controlled push / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        Pep_TwoThreeFive_att3: '2-3-5 positional / GK-CD1-CD3 / LD-DM2-RD / LW-AM1-ST2-AM2-RW',
        Pep_PressCooldown_bal2: '4-1-4-1 cooldown / GK-LD-CD1-CD3-RD / DM2 / LM-CM2-CM3-RM / ST2',
        Xabi_BoxMidfield_bal3: '3-2-4-1 box midfield / GK-CD1-CD2-CD3 / DM2-CM2 / LM-AM1-AM2-RM / ST2',
        Xabi_VerticalBox_att3: '3-4-2-1 vertical box / GK-CD1-CD2-CD3 / LM-DM2-CM2-RM / AM1-AM2 / ST2',
        DeZerbi_BaitPress_bal3: '4-2-4 bait press / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        DeZerbi_Release_att4: '3-2-2-3 release / GK-CD1-CD2-CD3 / DM2-CM2 / AM1-AM2 / LW-ST2-RW',
        Conte_WingbackWidth_bal4: '3-4-3 wingback width / GK-CD1-CD2-CD3 / LWB-DM2-CM2-RWB / LW-ST2-RW',
        Compact_Counter_def3: '4-5-1 compact counter / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        Klopp_Gegenpress_att4: '4-3-3 gegenpress / GK-LD-CD1-CD3-RD / CM1-DM2-CM3 / LW-ST2-RW',
        Nagelsmann_WidePress_att4: '4-2-4 wide press / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-ST1-ST2-RW',
        Bielsa_ChaosPress_att5: '3-3-4 chaos press / GK-CD1-CD2-CD3 / LM-DM2-RM / LW-ST1-ST2-RW',
        Henta_LeftTrap_att3: '4-5-1 left trap / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2'
    };

    const PRESET_SCHEME_STATE = Object.fromEntries(ACTIVE_PRESET_NAMES.map(name => [name, name]));
    PRESET_SCHEME_STATE.standard = 'standard_base';

    const TRAITS = {
        Arteta_Control433_bal3: { attackLanes: ['center', 'right'], build: 'control433', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['low_noise'], avoids: ['late_emergency_chase'] },
        Simeone_LowBlock_def5: { attackLanes: ['right'], build: 'low_block', tempo: 'low', press: 'low', risk: 'very_low', requires: ['protect_lead'], avoids: ['need_goal'] },
        Simeone_Compact442_def4: { attackLanes: ['left', 'right'], build: 'compact442', tempo: 'low', press: 'medium', risk: 'low', requires: ['defensive_stability'], avoids: ['urgent_chase'] },
        Mourinho_WeakSide_def3: { attackLanes: ['left', 'right'], build: 'weak_side_counter', tempo: 'medium', press: 'medium', risk: 'low_medium', requires: ['space_behind_or_weak_side'], avoids: ['no_outlet'] },
        Pep_BoxControl_bal2: { attackLanes: ['center'], build: 'box_control', tempo: 'low', press: 'medium_low', risk: 'low', requires: ['need_stability'], avoids: ['urgent_chase'] },
        Pep_ControlledPush_att3: { attackLanes: ['center'], build: 'controlled_push', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['need_goal'], avoids: ['high_bad_actions'] },
        Pep_TwoThreeFive_att3: { attackLanes: ['center'], build: 'positional_attack', tempo: 'medium_high', press: 'medium_high', risk: 'medium_high', requires: ['attacking_momentum'], avoids: ['transition_threat'] },
        Pep_PressCooldown_bal2: { attackLanes: ['center', 'right'], build: 'cooldown', tempo: 'medium', press: 'medium_low', risk: 'low', requires: ['press_fatigue'], avoids: ['emergency_chase'] },
        Xabi_BoxMidfield_bal3: { attackLanes: ['center'], build: 'box_midfield', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['center_weak'], avoids: ['center_closed'] },
        Xabi_VerticalBox_att3: { attackLanes: ['center'], build: 'vertical_box', tempo: 'medium_high', press: 'medium', risk: 'medium_high', requires: ['center_available'], avoids: ['high_bad_actions'] },
        DeZerbi_BaitPress_bal3: { attackLanes: ['center'], build: 'bait_press', tempo: 'low_medium', press: 'medium_low', risk: 'medium', requires: ['opponent_high_press'], avoids: ['high_bad_actions'] },
        DeZerbi_Release_att4: { attackLanes: ['center', 'right'], build: 'release_space', tempo: 'high', press: 'medium_high', risk: 'high', requires: ['space_behind'], avoids: ['no_space_behind'] },
        Conte_WingbackWidth_bal4: { attackLanes: ['left', 'right'], build: 'wingback_width', tempo: 'medium', press: 'medium', risk: 'medium', requires: ['wide_quality'], avoids: ['own_crosses_bad'] },
        Compact_Counter_def3: { attackLanes: ['left', 'right'], build: 'compact_counter', tempo: 'medium_high', press: 'medium', risk: 'medium', requires: ['under_pressure'], avoids: ['sustained_positional_attack_needed'] },
        Klopp_Gegenpress_att4: { attackLanes: ['left', 'right'], build: 'gegenpress', tempo: 'high', press: 'high', risk: 'high', requires: ['need_pressure'], avoids: ['press_fatigue'] },
        Nagelsmann_WidePress_att4: { attackLanes: ['left', 'right'], build: 'wide_press', tempo: 'high', press: 'high', risk: 'high', requires: ['wide_advantage'], avoids: ['weak_flanks'] },
        Bielsa_ChaosPress_att5: { attackLanes: ['left', 'center', 'right'], build: 'chaos_press', tempo: 'very_high', press: 'very_high', risk: 'very_high', requires: ['emergency_need_goal'], avoids: ['early_match'] },
        Henta_LeftTrap_att3: { attackLanes: ['left'], build: 'left_trap', tempo: 'medium', press: 'medium_high', risk: 'medium', requires: ['left_lane_attack'], avoids: ['left_lane_blocked'] }
    };

    const LADDERS = {
        defensive: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5'],
        balance: ['Pep_BoxControl_bal2', 'Pep_PressCooldown_bal2', 'Arteta_Control433_bal3', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3', 'Conte_WingbackWidth_bal4'],
        attack: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'DeZerbi_Release_att4', 'Bielsa_ChaosPress_att5'],
        henta: ['Henta_LeftTrap_att3']
    };

    const removeInactiveKeys = map => {
        if (!map || typeof map !== 'object') return;
        Object.keys(map).forEach(key => {
            if (!ACTIVE.has(key)) delete map[key];
        });
    };

    removeInactiveKeys(typeof BASE_PRESETS !== 'undefined' ? BASE_PRESETS : null);
    removeInactiveKeys(typeof BASE_LABELS !== 'undefined' ? BASE_LABELS : null);
    if (typeof BASE_PRESETS !== 'undefined') Object.assign(BASE_PRESETS, PRESETS);
    if (typeof BASE_LABELS !== 'undefined') Object.assign(BASE_LABELS, LABELS);

    if (typeof TacticPresetLibrary !== 'undefined' && TacticPresetLibrary) {
        TacticPresetLibrary.meta = Object.assign({}, META);
        TacticPresetLibrary.schemeStates = Object.assign({}, SCHEME_STATES);
        TacticPresetLibrary.presetSchemeState = Object.assign({}, PRESET_SCHEME_STATE);
        TacticPresetLibrary.traits = Object.assign({}, TRAITS);
    }

    if (typeof RecommendationEngine !== 'undefined' && RecommendationEngine) {
        RecommendationEngine.getPresetLadder = function getActivePresetLadder(group) {
            return (LADDERS[group] || []).slice();
        };
    }

    if (typeof CurrentActionHintEngine !== 'undefined' && CurrentActionHintEngine) {
        CurrentActionHintEngine.PRESET_AUDIT_TIER = {
            primary: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Compact_Counter_def3', 'Pep_TwoThreeFive_att3', 'Conte_WingbackWidth_bal4', 'Pep_PressCooldown_bal2', 'Xabi_BoxMidfield_bal3', 'DeZerbi_BaitPress_bal3'],
            restricted: ['Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Mourinho_WeakSide_def3', 'Simeone_Compact442_def4', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'DeZerbi_Release_att4', 'Henta_LeftTrap_att3'],
            emergency: ['Bielsa_ChaosPress_att5', 'Simeone_LowBlock_def5'],
            needsMoreData: [],
            experimental: [],
            blocked: []
        };
    }

    if (typeof window !== 'undefined') {
        window.SLFActivePresetRegistry = { active: ACTIVE_PRESET_NAMES.slice(), labels: Object.assign({}, LABELS), ladders: Object.assign({}, LADDERS) };
    }
})();
// <<< src/modules/tactics-presets/active-preset-registry.js


// >>> src/modules/tactics-presets/tactic-preset-direction-policy.js
// Tactic Preset Direction Policy
// ============================================================
// Runtime overlay for attack direction policy.
//
// Contract:
// - do not touch src/core/config.js;
// - center attack is not a default direction;
// - center attack remains available only for explicit central-overload presets;
// - patch canonical preset runtime values and recommendation selection guards.

(function tacticPresetDirectionPolicy() {
    'use strict';

    if (typeof window !== 'undefined' && window.SLFTacticDirectionPolicy?.applied) return;

    const CENTER_EXCEPTIONS = new Set([
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3',
        'Henta_CentralTrap_att3'
    ]);

    const DIRECTION_OVERRIDES = {
        standard: [],
        Arteta_Control433_bal3: [],
        Pep_StandardControl_bal3: [],
        Pep_BoxControl_bal2: [],
        Pep_ControlledPush_att3: ['left', 'right'],
        Pep_TwoThreeFive_att3: ['left', 'right'],
        Pep_PressCooldown_bal2: [],
        DeZerbi_BaitPress_bal3: [],
        DeZerbi_Release_att4: ['right'],
        Bielsa_ChaosPress_att5: ['left', 'right']
    };

    const TRAIT_DIRECTION_OVERRIDES = {
        standard: [],
        Arteta_Control433_bal3: [],
        Pep_StandardControl_bal3: [],
        Pep_BoxControl_bal2: [],
        Pep_ControlledPush_att3: ['left', 'right'],
        Pep_TwoThreeFive_att3: ['left', 'right'],
        Pep_PressCooldown_bal2: [],
        DeZerbi_BaitPress_bal3: [],
        DeZerbi_Release_att4: ['right'],
        Bielsa_ChaosPress_att5: ['left', 'right']
    };

    const META_PATCHES = {
        Arteta_Control433_bal3: {
            idea: 'позиционный контроль без принудительной атаки по центру; финальная треть сама подтягивает центр, поэтому стартовое направление нейтральное',
            risk: 'если нужен быстрый гол, может быть слишком нейтрально'
        },
        Pep_StandardControl_bal3: {
            idea: 'стандартный контроль без заданного центрального коридора: растягиваем поле, а вход в центр оставляем по ситуации',
            risk: 'может быть слишком нейтрально, если соперник отдаёт явный слабый центр'
        },
        Pep_BoxControl_bal2: {
            idea: 'снизить хаос и держать безопасный контроль без форсирования центральной воронки',
            risk: 'может стать стерильным, если нет флангового/полуфлангового выхода'
        },
        Pep_ControlledPush_att3: {
            idea: 'усилить атаку через ширину/полуфланги без all-in и без принудительного центра',
            risk: 'при браке усиление превратится в потери'
        },
        Pep_TwoThreeFive_att3: {
            idea: 'позиционно дожимать через широкое присутствие и полуфланги, не забивая атаку заранее в центр',
            risk: 'опасно против быстрых контратак'
        },
        DeZerbi_BaitPress_bal3: {
            idea: 'заманить прессинг и раскрыть линии без обязательного входа через центр',
            risk: 'слабая первая линия может привезти момент'
        },
        DeZerbi_Release_att4: {
            idea: 'быстро выпускать атаку за прессинг, преимущественно через свободный фланг/полуфланг',
            risk: 'если пространства нет, риск паса пустой'
        },
        Xabi_BoxMidfield_bal3: {
            idea: 'central-overload только при явной слабости центра соперника и низком браке; не использовать как default control',
            risk: 'если центр не слабый, появится стерильное владение и обрезы в плотной зоне'
        },
        Xabi_VerticalBox_att3: {
            idea: 'вертикальный central-overload как исключение: бить в слабый центр, а не просто держать мяч по центру',
            risk: 'при закрытом центре или давлении соперника вертикальность даст брак'
        }
    };

    function copy(value) {
        return Array.isArray(value) ? value.slice() : [];
    }

    function tagsOf(state = {}) {
        if (Array.isArray(state.tags)) return state.tags;
        if (Array.isArray(state.signals)) return state.signals;
        return [];
    }

    function hasTag(state, tag) {
        return tagsOf(state).includes(tag) || !!state?.[tag];
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function priorityOfPreset(name) {
        if (typeof BASE_PRESETS !== 'undefined' && BASE_PRESETS?.[name]) {
            return copy(BASE_PRESETS[name].priority);
        }
        return copy(DIRECTION_OVERRIDES[name]);
    }

    function hasCenterDirection(name) {
        return priorityOfPreset(name).includes('center') || (TacticPresetLibrary?.traits?.[name]?.attackLanes || []).includes('center');
    }

    function hasCenterExceptionContext(state = {}) {
        const myBad = number(state.myBad, 0);
        const centerWeak = hasTag(state, 'center_weak') || !!state.centerWeak;
        const centerAvailable = hasTag(state, 'center_available') || !!state.centerAvailable;
        const lowBadActions = hasTag(state, 'low_bad_actions') || myBad > 0 && myBad <= 16;
        const centerClosed = hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || !!state.centerClosed;
        const underPressure = hasTag(state, 'under_pressure') || hasTag(state, 'transition_threat') || !!state.underPressure || !!state.transitionThreat;
        const highBadActions = hasTag(state, 'high_bad_actions') || !!state.highBadActions || myBad >= 20;
        const sterileCenter = hasCenterOveruseSymptoms(state);

        return (centerWeak || centerAvailable) && lowBadActions && !centerClosed && !underPressure && !highBadActions && !sterileCenter;
    }

    function hasCenterOveruseSymptoms(state = {}) {
        const minute = number(state.minute, 0);
        const myPossession = number(state.myPossession, 0);
        const myXg = number(state.myXg, 0);
        const oppXg = number(state.oppXg, 0);
        const myXT = number(state.myXT, 0);
        const oppXT = number(state.oppXT, 0);
        const shotsGap = number(state.oppShots, 0) - number(state.myShots, 0);

        if (minute >= 25 && myPossession >= 52 && myXg <= oppXg + 0.1) return true;
        if (minute >= 35 && myXT < oppXT - 0.15) return true;
        if (minute >= 45 && shotsGap >= 3 && myXg <= oppXg + 0.2) return true;
        return false;
    }

    function isCenterOveruse(name, state = {}) {
        if (!name || !hasCenterDirection(name)) return false;
        if (!CENTER_EXCEPTIONS.has(name)) return true;
        return !hasCenterExceptionContext(state);
    }

    function selectNonCenterAlternative(name, state = {}) {
        const scoreState = state?.score?.state || state.scoreState || '';
        const minute = number(state.minute, 0);
        const myBad = number(state.myBad, 0);
        const xgGap = number(state.oppXg, 0) - number(state.myXg, 0);
        const xtGap = number(state.oppXT, 0) - number(state.myXT, 0);

        if (hasTag(state, 'press_fatigue_risk') || state.pressFatigue?.active) return 'Pep_PressCooldown_bal2';
        if (myBad >= 22 || hasTag(state, 'high_bad_actions')) return 'Pep_PressCooldown_bal2';
        if (xgGap > 0.55 || xtGap > 0.45 || hasTag(state, 'transition_threat') || hasTag(state, 'under_pressure')) return 'Compact_Counter_def3';
        if (scoreState === 'winning' && minute >= 70) return 'Simeone_Compact442_def4';
        if (scoreState === 'losing' && minute >= 80) return 'Klopp_Gegenpress_att4';
        if (hasTag(state, 'opponent_high_press') || hasTag(state, 'space_behind')) return 'DeZerbi_Release_att4';
        if (hasTag(state, 'center_closed') || hasTag(state, 'opponent_low_block') || hasTag(state, 'wide_quality')) return 'Conte_WingbackWidth_bal4';
        if (scoreState === 'losing' || hasTag(state, 'need_goal') || hasTag(state, 'attacking_momentum')) return 'Pep_ControlledPush_att3';
        if (state.strengthContext?.mode === 'disadvantage') return 'Mourinho_WeakSide_def3';
        if (hasCenterOveruseSymptoms(state)) return 'Pep_ControlledPush_att3';

        return 'Arteta_Control433_bal3';
    }

    function patchBasePresets() {
        if (typeof BASE_PRESETS === 'undefined' || !BASE_PRESETS) return;

        Object.entries(DIRECTION_OVERRIDES).forEach(([name, priority]) => {
            if (!BASE_PRESETS[name]) return;
            BASE_PRESETS[name] = Object.assign({}, BASE_PRESETS[name], {
                priority: copy(priority)
            });
        });
    }

    function patchLibraryTraits() {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary) return;

        if (TacticPresetLibrary.traits) {
            Object.entries(TRAIT_DIRECTION_OVERRIDES).forEach(([name, attackLanes]) => {
                if (!TacticPresetLibrary.traits[name]) return;
                TacticPresetLibrary.traits[name] = Object.assign({}, TacticPresetLibrary.traits[name], {
                    attackLanes: copy(attackLanes)
                });
            });
        }

        if (TacticPresetLibrary.meta) {
            Object.entries(META_PATCHES).forEach(([name, patch]) => {
                if (!TacticPresetLibrary.meta[name]) return;
                TacticPresetLibrary.meta[name] = Object.assign({}, TacticPresetLibrary.meta[name], patch);
            });
        }
    }

    function patchRecommendationSelection() {
        if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return;
        if (RecommendationEngine.__directionPolicySelectRawPresetApplied) return;
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const originalSelectRawPreset = RecommendationEngine.selectRawPreset;

        RecommendationEngine.selectRawPreset = function selectRawPresetWithDirectionPolicy(snapshot, state = {}) {
            const candidate = originalSelectRawPreset.apply(this, arguments);
            const candidateName = candidate?.name || '';

            if (!isCenterOveruse(candidateName, state)) return candidate;

            const alternative = selectNonCenterAlternative(candidateName, state);
            return Object.assign({}, candidate || {}, {
                name: alternative,
                directionPolicyRedirect: true,
                rawCenterPreset: candidateName,
                reason: `${candidate?.reason || 'выбран center preset'}; center direction guard: атака по центру только для явного central-overload, поэтому выбран нецентральный план`
            });
        };

        RecommendationEngine.__directionPolicySelectRawPresetApplied = true;
    }

    patchBasePresets();
    patchLibraryTraits();
    patchRecommendationSelection();

    if (typeof window !== 'undefined') {
        window.SLFTacticDirectionPolicy = {
            applied: true,
            centerExceptions: Array.from(CENTER_EXCEPTIONS),
            directionOverrides: Object.assign({}, DIRECTION_OVERRIDES),
            hasCenterDirection,
            hasCenterExceptionContext,
            hasCenterOveruseSymptoms,
            isCenterOveruse,
            selectNonCenterAlternative,
            refresh() {
                patchBasePresets();
                patchLibraryTraits();
                return true;
            }
        };
    }
})();
// <<< src/modules/tactics-presets/tactic-preset-direction-policy.js


// >>> src/modules/strategy-data-recommendations/signal-noise-filter-layer.js
// Signal Noise Filter Layer
// ============================================================
// Stage 2.4 guard for tactical hints.
// Filters short-lived signal spikes before CurrentActionHintEngine
// makes an on-demand recommendation.
//
// Contract:
// - in-memory only;
// - no localStorage;
// - no UI explanation layer;
// - score/minute emergency logic remains unfiltered;
// - stable signals require repeat confirmation across recent samples.

(function signalNoiseFilterLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__signalNoiseFilterApplied) return;

    const HISTORY_LIMIT = 4;
    const MIN_CONFIRMATIONS = 2;

    const ALWAYS_KEEP_SIGNALS = new Set([
        'need_goal',
        'late_need_goal',
        'protect_lead',
        'press_fatigue_risk',
        'own_press_fatigue',
        'press_cost_high',
        'high_bad_actions'
    ]);

    const NOISY_SIGNALS = new Set([
        'attacking_momentum',
        'under_pressure',
        'opponent_high_press',
        'own_high_press',
        'intensive_pressing',
        'pressing_player',
        'player_pressing',
        'center_weak',
        'center_available',
        'center_closed',
        'wide_quality',
        'wide_advantage',
        'attack_left',
        'attack_right',
        'space_behind',
        'opponent_high_line',
        'release_space',
        'weak_side_available',
        'opponent_flank_weak',
        'opponent_low_block',
        'transition_threat',
        'opponent_fast_counter_threat',
        'opponent_crosses_dangerous',
        'own_crosses_bad_total',
        'own_open_play_crosses_bad'
    ]);

    const metricKeys = [
        'myXg', 'myXG', 'oppXg', 'oppXG',
        'myXT', 'oppXT',
        'myBad', 'badActionsPct', 'myBadActionsPct',
        'oppPress', 'oppPressVector', 'opponentPress', 'opponentPressing',
        'myPress', 'myPressVector', 'ownPress', 'ownPressVector',
        'oppDef', 'oppDefVector'
    ];

    const historyByGame = new Map();
    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function getMetric(source, keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
            if (source && source[key] !== undefined && source[key] !== null) return source[key];
        }
        return undefined;
    }

    function getGameId(snapshot, context) {
        return String(
            getMetric(context, ['gameId', 'matchId', 'id']) ||
            getMetric(snapshot, ['gameId', 'matchId', 'id']) ||
            'unknown'
        );
    }

    function getMinute(snapshot, context) {
        return Number(
            getMetric(context, ['minute', 'baseMinute', 'effectiveMinute']) ??
            getMetric(snapshot, ['minute', 'baseMinute', 'effectiveMinute']) ??
            0
        ) || 0;
    }

    function collectSignals(snapshot, context) {
        const result = [];
        const add = value => {
            if (!value) return;
            const key = String(value);
            if (!result.includes(key)) result.push(key);
        };

        const contextSignals = Array.isArray(context?.signals) ? context.signals : [];
        const snapshotSignals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];

        contextSignals.forEach(add);
        snapshotSignals.forEach(add);

        return result;
    }

    function getHistory(gameId) {
        if (!historyByGame.has(gameId)) historyByGame.set(gameId, []);
        return historyByGame.get(gameId);
    }

    function trimHistoryMap() {
        if (historyByGame.size <= 6) return;
        const keys = Array.from(historyByGame.keys());
        keys.slice(0, Math.max(0, keys.length - 6)).forEach(key => historyByGame.delete(key));
    }

    function extractMetrics(snapshot, context) {
        const metrics = {};

        metricKeys.forEach(key => {
            const value = getMetric(context, key) ?? getMetric(snapshot, key);
            const n = num(value);
            if (n !== null) metrics[key] = n;
        });

        return metrics;
    }

    function rememberSample(gameId, minute, signals, metrics) {
        const history = getHistory(gameId);

        if (history.length && minute < Number(history[history.length - 1].minute || 0)) {
            history.splice(0, history.length);
        }

        history.push({ minute, signals: signals.slice(), metrics: Object.assign({}, metrics), ts: Date.now() });

        while (history.length > HISTORY_LIMIT) history.shift();
        trimHistoryMap();

        return history;
    }

    function countSignal(history, signal) {
        return history.reduce((count, sample) => count + (sample.signals.includes(signal) ? 1 : 0), 0);
    }

    function isStableSignal(signal, history) {
        if (ALWAYS_KEEP_SIGNALS.has(signal)) return true;
        if (!NOISY_SIGNALS.has(signal)) return true;
        return countSignal(history, signal) >= MIN_CONFIRMATIONS;
    }

    function averageMetric(history, key, fallback) {
        const values = history
            .map(sample => num(sample.metrics?.[key]))
            .filter(value => value !== null);

        if (values.length < 2) return fallback;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function smoothMetrics(snapshot, context, history) {
        const smoothed = {};

        metricKeys.forEach(key => {
            const raw = num(getMetric(context, key) ?? getMetric(snapshot, key));
            if (raw === null) return;

            const avg = averageMetric(history, key, raw);
            const maxJump = key.toLowerCase().includes('bad') ? 8 : 0.35;

            if (Math.abs(raw - avg) > maxJump && history.length >= 2) {
                smoothed[key] = avg;
            }
        });

        return smoothed;
    }

    function cloneWithFilteredSignals(source, filteredSignals, smoothedMetrics) {
        if (!source || typeof source !== 'object') return source;

        const clone = Object.assign({}, source);

        if (Array.isArray(source.signals)) {
            clone.signals = filteredSignals.slice();
        }

        Object.entries(smoothedMetrics).forEach(([key, value]) => {
            if (clone[key] !== undefined) clone[key] = value;
        });

        return clone;
    }

    function filterInput(snapshot, context) {
        const gameId = getGameId(snapshot, context || {});
        const minute = getMinute(snapshot, context || {});
        const signals = collectSignals(snapshot, context || {});
        const metrics = extractMetrics(snapshot, context || {});
        const history = rememberSample(gameId, minute, signals, metrics);

        const filteredSignals = signals.filter(signal => isStableSignal(signal, history));
        const smoothedMetrics = smoothMetrics(snapshot, context || {}, history);

        const nextSnapshot = cloneWithFilteredSignals(snapshot, filteredSignals, smoothedMetrics);
        const nextContext = cloneWithFilteredSignals(context || {}, filteredSignals, smoothedMetrics) || {};

        if (Array.isArray(context?.signals) || filteredSignals.length) nextContext.signals = filteredSignals.slice();
        if (Array.isArray(snapshot?.signals) && nextSnapshot) nextSnapshot.signals = filteredSignals.slice();

        nextContext.signalNoiseFilter = {
            active: true,
            gameId,
            minute,
            rawSignals: signals,
            filteredSignals
        };

        return { snapshot: nextSnapshot, context: nextContext };
    }

    CurrentActionHintEngine.run = function runWithSignalNoiseFilter(snapshot, context = {}) {
        const filtered = filterInput(snapshot, context);
        return originalRun(filtered.snapshot, filtered.context);
    };

    CurrentActionHintEngine.__signalNoiseFilterApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFSignalNoiseFilterLayer = {
            getHistory: () => Array.from(historyByGame.entries()).map(([gameId, samples]) => ({ gameId, samples: samples.slice() }))
        };
    }
})();
// <<< src/modules/strategy-data-recommendations/signal-noise-filter-layer.js


// >>> src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js
// Adaptive Opponent Style Layer
// ============================================================
// Coach Mode v2: adapt tactical hints to the opponent style
// detected inside the current match.
//
// Contract:
// - in-memory match style only;
// - no localStorage;
// - no user feedback memory;
// - no new presets;
// - no UI explanation layer.

(function adaptiveOpponentStyleLayer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__adaptiveOpponentStyleApplied) return;

    const STABLE_THRESHOLD = 3;
    const HISTORY_LIMIT = 8;

    const STYLE_TO_PRESET = {
        high_press_team: {
            prefer: ['DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Compact_Counter_def3'],
            avoid: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4']
        },
        low_block_team: {
            prefer: ['Conte_WingbackWidth_bal4', 'Pep_TwoThreeFive_att3', 'Xabi_BoxMidfield_bal3'],
            avoid: ['Compact_Counter_def3', 'Simeone_LowBlock_def5', 'Simeone_Compact442_def4']
        },
        counter_attack_team: {
            prefer: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Pep_PressCooldown_bal2', 'Compact_Counter_def3'],
            avoid: ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5']
        },
        wide_cross_team: {
            prefer: ['Simeone_Compact442_def4', 'Compact_Counter_def3', 'Mourinho_WeakSide_def3'],
            avoid: ['Conte_WingbackWidth_bal4', 'Nagelsmann_WidePress_att4']
        },
        center_compact_team: {
            prefer: ['Conte_WingbackWidth_bal4', 'DeZerbi_Release_att4', 'Mourinho_WeakSide_def3'],
            avoid: ['Xabi_BoxMidfield_bal3', 'Xabi_VerticalBox_att3']
        },
        open_game: {
            prefer: ['Pep_BoxControl_bal2', 'Arteta_Control433_bal3', 'Pep_PressCooldown_bal2'],
            avoid: ['Bielsa_ChaosPress_att5']
        },
        possession_team: {
            prefer: ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Compact_Counter_def3'],
            avoid: ['Pep_BoxControl_bal2']
        }
    };

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);
    const styleMemory = new Map();

    function contextOf(result) {
        return result?.moment?.context || {};
    }

    function gameIdOf(result) {
        const c = contextOf(result);
        return String(result?.moment?.gameId || c.gameId || 'unknown');
    }

    function minuteOf(result) {
        const c = contextOf(result);
        return Number(result?.moment?.minute ?? c.minute ?? 0) || 0;
    }

    function ensureGame(gameId) {
        if (!styleMemory.has(gameId)) {
            styleMemory.set(gameId, {
                samples: [],
                counts: {
                    high_press_team: 0,
                    low_block_team: 0,
                    counter_attack_team: 0,
                    wide_cross_team: 0,
                    center_compact_team: 0,
                    open_game: 0,
                    possession_team: 0
                }
            });
        }
        return styleMemory.get(gameId);
    }

    function trimMemory() {
        if (styleMemory.size <= 6) return;
        const keys = Array.from(styleMemory.keys());
        keys.slice(0, Math.max(0, keys.length - 6)).forEach(key => styleMemory.delete(key));
    }

    function hasSignal(c, name) {
        return Array.isArray(c.signals) && c.signals.includes(name);
    }

    function detectSampleStyles(c) {
        const styles = [];
        const add = style => {
            if (!styles.includes(style)) styles.push(style);
        };

        if (c.opponentHighPress || Number(c.oppPress || 0) > 65 || hasSignal(c, 'opponent_high_press')) {
            add('high_press_team');
        }

        if (c.opponentLowBlock || Number(c.oppDef || 0) < 45 || hasSignal(c, 'opponent_low_block')) {
            add('low_block_team');
        }

        if (c.transitionThreat || hasSignal(c, 'transition_threat') || hasSignal(c, 'opponent_fast_counter_threat')) {
            add('counter_attack_team');
        }

        if (c.opponentCrossesDangerous || hasSignal(c, 'opponent_crosses_dangerous')) {
            add('wide_cross_team');
        }

        if (c.centerClosed || hasSignal(c, 'center_closed')) {
            add('center_compact_team');
        }

        if (c.underPressure && c.attackingMomentum) {
            add('open_game');
        }

        if (Number(c.oppXT || 0) > Number(c.myXT || 0) + 0.15 && !c.opponentHighPress && !c.transitionThreat) {
            add('possession_team');
        }

        return styles;
    }

    function rememberStyles(gameId, minute, styles) {
        const memory = ensureGame(gameId);

        if (memory.samples.length && minute < Number(memory.samples[memory.samples.length - 1].minute || 0)) {
            memory.samples = [];
            Object.keys(memory.counts).forEach(key => memory.counts[key] = 0);
        }

        memory.samples.push({ minute, styles: styles.slice(), ts: Date.now() });
        while (memory.samples.length > HISTORY_LIMIT) memory.samples.shift();

        Object.keys(memory.counts).forEach(key => memory.counts[key] = 0);
        memory.samples.forEach(sample => {
            sample.styles.forEach(style => {
                if (memory.counts[style] !== undefined) memory.counts[style] += 1;
            });
        });

        trimMemory();
        return memory;
    }

    function stableStyles(memory) {
        return Object.entries(memory.counts)
            .filter(([, count]) => count >= STABLE_THRESHOLD)
            .sort((a, b) => b[1] - a[1])
            .map(([style]) => style);
    }

    function isEmergency(result, c) {
        const action = result?.action || {};
        return action.presetStatus === 'emergency' || c.lateNeedGoal || (c.protectLead && Number(c.minute || 0) >= 80);
    }

    function canUsePreset(preset, c) {
        if (!preset) return false;
        if (typeof CurrentActionHintEngine.isPresetAllowed === 'function' && !CurrentActionHintEngine.isPresetAllowed(preset, c)) return false;

        if (c.highBadActions && ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5'].includes(preset)) return false;
        if (c.pressFatigueRisk && ['Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5', 'Pep_TwoThreeFive_att3'].includes(preset)) return false;
        if (c.centerClosed && ['Xabi_BoxMidfield_bal3', 'Xabi_VerticalBox_att3'].includes(preset)) return false;
        if (c.ownCrossesBad && ['Conte_WingbackWidth_bal4', 'Nagelsmann_WidePress_att4'].includes(preset)) return false;
        if (c.transitionThreat && ['Pep_TwoThreeFive_att3', 'Klopp_Gegenpress_att4', 'Nagelsmann_WidePress_att4', 'Bielsa_ChaosPress_att5'].includes(preset) && !c.lateNeedGoal) return false;

        return true;
    }

    function candidateFromStyle(style, currentPreset, c) {
        const rule = STYLE_TO_PRESET[style];
        if (!rule) return currentPreset;

        if (!rule.avoid.includes(currentPreset)) return currentPreset;

        return rule.prefer.find(preset => canUsePreset(preset, c)) || currentPreset;
    }

    function applyAdaptiveStyle(result) {
        if (!result?.action) return result;

        const c = contextOf(result);
        const gameId = gameIdOf(result);
        const minute = minuteOf(result);
        const sampleStyles = detectSampleStyles(c);
        const memory = rememberStyles(gameId, minute, sampleStyles);
        const styles = stableStyles(memory);

        if (!styles.length || isEmergency(result, c)) {
            result.action = Object.assign({}, result.action, {
                adaptiveCoach: 'v2',
                opponentStyles: styles
            });
            return result;
        }

        let preset = result.action.preset;
        const rawPreset = result.action.rawPreset || result.action.preset;

        for (const style of styles) {
            const next = candidateFromStyle(style, preset, c);
            if (next !== preset) {
                preset = next;
                break;
            }
        }

        result.action = Object.assign({}, result.action, {
            preset,
            adaptiveCoach: 'v2',
            opponentStyles: styles,
            rawPreset
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithAdaptiveOpponentStyle(snapshot, context = {}) {
        return applyAdaptiveStyle(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.__adaptiveOpponentStyleApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFAdaptiveOpponentStyleLayer = {
            getMemory: () => Array.from(styleMemory.entries()).map(([gameId, memory]) => ({
                gameId,
                counts: Object.assign({}, memory.counts),
                samples: memory.samples.slice()
            }))
        };
    }
})();
// <<< src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js


// >>> src/modules/strategy-data-recommendations/coach-mode-policy.js
// Coach Mode v1 Policy Guard
// ============================================================
// Final intermediate coaching layer for on-demand tactical hints.
//
// Contract:
// - no explanations in UI output;
// - no new presets;
// - suppress obvious anti-patterns;
// - apply simple match phase policy;
// - require sufficient signal strength unless emergency/protect conditions apply.

(function coachModeV1Policy() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__coachModeV1Applied) return;

    const SAFE_CONTROL = 'Pep_BoxControl_bal2';
    const STRUCTURE_CONTROL = 'Arteta_Control433_bal3';
    const PRESS_COOLDOWN = 'Pep_PressCooldown_bal2';
    const COMPACT_COUNTER = 'Compact_Counter_def3';
    const COMPACT_PROTECT = 'Simeone_Compact442_def4';
    const CONTROLLED_PUSH = 'Pep_ControlledPush_att3';

    const HIGH_PRESS_PRESETS = new Set([
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5'
    ]);

    const CENTER_PRESETS = new Set([
        'Xabi_BoxMidfield_bal3',
        'Xabi_VerticalBox_att3'
    ]);

    const CROSS_WIDTH_PRESETS = new Set([
        'Conte_WingbackWidth_bal4',
        'Nagelsmann_WidePress_att4'
    ]);

    const AGGRESSIVE_POSSESSION_PRESETS = new Set([
        'Pep_TwoThreeFive_att3',
        'Klopp_Gegenpress_att4',
        'Nagelsmann_WidePress_att4',
        'Bielsa_ChaosPress_att5'
    ]);

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function contextOf(result) {
        return result?.moment?.context || {};
    }

    function phaseOf(minute) {
        const m = Number(minute || 0);
        if (m <= 30) return 'caution';
        if (m <= 55) return 'correction';
        if (m <= 70) return 'first_active_change';
        if (m <= 80) return 'risk_or_protect';
        return 'emergency';
    }

    function countTrue(values) {
        return values.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    }

    function signalStrength(c) {
        if (c.lateNeedGoal || (c.protectLead && c.minute >= 80) || c.highBadActions || c.pressFatigueRisk) return 5;

        return countTrue([
            c.needGoal,
            c.underPressure,
            c.attackingMomentum,
            c.opponentHighPress,
            c.opponentLowBlock,
            c.centerWeak,
            c.centerClosed,
            c.wideQuality,
            c.spaceBehind,
            c.weakSideAvailable,
            c.transitionThreat,
            c.ownCrossesBad,
            c.opponentCrossesDangerous
        ]);
    }

    function allowedFallback(preset, c, phase) {
        if (c.pressFatigueRisk) return PRESS_COOLDOWN;
        if (c.highBadActions) return SAFE_CONTROL;
        if (c.protectLead) return phase === 'emergency' ? 'Simeone_LowBlock_def5' : COMPACT_PROTECT;
        if (c.underPressure || c.transitionThreat) return COMPACT_COUNTER;
        if (c.needGoal) return CONTROLLED_PUSH;
        return STRUCTURE_CONTROL;
    }

    function violatesAntiPattern(preset, c, phase) {
        if (!preset) return true;

        if (c.highBadActions && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (c.pressFatigueRisk && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (c.pressFatigueRisk && preset === 'Pep_TwoThreeFive_att3') return true;

        if (c.needGoal && phase !== 'emergency' && preset === 'Simeone_LowBlock_def5') return true;
        if (c.needGoal && preset === COMPACT_PROTECT && !c.underPressure) return true;

        if (c.centerClosed && CENTER_PRESETS.has(preset)) return true;
        if (c.ownCrossesBad && CROSS_WIDTH_PRESETS.has(preset)) return true;
        if (c.transitionThreat && AGGRESSIVE_POSSESSION_PRESETS.has(preset) && !c.lateNeedGoal) return true;

        if (c.protectLead && HIGH_PRESS_PRESETS.has(preset)) return true;
        if (phase === 'caution' && HIGH_PRESS_PRESETS.has(preset) && !c.underPressure) return true;
        if (phase === 'caution' && preset === 'Bielsa_ChaosPress_att5') return true;

        return false;
    }

    function belowConfidenceThreshold(result, c, phase) {
        if (phase === 'emergency') return false;
        if (c.highBadActions || c.pressFatigueRisk || c.protectLead || c.needGoal) return false;
        return signalStrength(c) < 2;
    }

    function applyCoachPolicy(result) {
        if (!result?.action) return result;

        const c = contextOf(result);
        const phase = phaseOf(c.minute ?? result?.moment?.minute);
        const candidatePreset = result.action.preset;
        let nextPreset = candidatePreset;

        if (belowConfidenceThreshold(result, c, phase)) {
            nextPreset = allowedFallback(candidatePreset, c, phase);
        }

        if (violatesAntiPattern(nextPreset, c, phase)) {
            nextPreset = allowedFallback(nextPreset, c, phase);
        }

        result.action = Object.assign({}, result.action, {
            preset: nextPreset,
            coachMode: 'v1',
            matchPhase: phase,
            confidence: signalStrength(c),
            rawPreset: result.action.rawPreset || candidatePreset
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithCoachModePolicy(snapshot, context = {}) {
        return applyCoachPolicy(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.toPlanRows = function toCoachHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__coachModeV1Applied = true;

    if (typeof window !== 'undefined') {
        window.SLFCoachModeV1 = {
            phaseOf,
            signalStrength
        };
    }
})();
// <<< src/modules/strategy-data-recommendations/coach-mode-policy.js


// >>> src/modules/strategy-data-recommendations/moment-drift-stabilizer.js
// Moment Drift Stabilizer
// ============================================================
// Stabilizes button-generated tactical hints so the recommendation
// does not jump on every noisy snapshot.
//
// Contract:
// - in-memory only;
// - no localStorage;
// - no explanation layer;
// - emergency/protect-lead states can override the hold window;
// - explicit manual hint clicks recompute immediately.

(function momentDriftStabilizer() {
    'use strict';

    if (typeof CurrentActionHintEngine === 'undefined' || !CurrentActionHintEngine) return;
    if (CurrentActionHintEngine.__momentDriftStabilizerApplied) return;

    const HOLD_MINUTES = 6;
    const HOLD_MS = 6 * 60 * 1000;
    const HARD_OVERRIDE_RULES = new Set([
        'late_goal_emergency',
        'late_protect_heavy_pressure',
        'own_press_fatigue_cooldown',
        'bad_actions_control_reset'
    ]);

    let stableState = null;

    const originalRun = CurrentActionHintEngine.run.bind(CurrentActionHintEngine);

    function getContext(result) {
        return result?.moment?.context || {};
    }

    function getMinute(result) {
        return Number(result?.moment?.minute ?? getContext(result).minute ?? 0) || 0;
    }

    function getScore(result) {
        return String(result?.moment?.score ?? getContext(result).scoreState ?? 'unknown');
    }

    function getGameId(result) {
        return String(result?.moment?.gameId ?? getContext(result).gameId ?? 'unknown');
    }

    function isManualHint(result) {
        const context = getContext(result);
        return !!(
            context.manualHintRequest ||
            context.coachHintSnapshotContext?.active ||
            result?.action?.snapshotContextBridge
        );
    }

    function isHardOverride(result) {
        const action = result?.action || {};
        const context = getContext(result);

        if (HARD_OVERRIDE_RULES.has(action.ruleId)) return true;
        if (action.presetStatus === 'emergency') return true;
        if (context.lateNeedGoal) return true;
        if (context.protectLead && context.underPressure && Number(context.minute || 0) >= 80) return true;

        return false;
    }

    function shouldReset(result) {
        if (!stableState) return true;

        const minute = getMinute(result);
        const score = getScore(result);
        const gameId = getGameId(result);

        if (stableState.gameId !== gameId) return true;
        if (stableState.score !== score) return true;
        if (minute < stableState.minute) return true;

        return false;
    }

    function remember(result) {
        if (!result?.action) return result;

        stableState = {
            gameId: getGameId(result),
            score: getScore(result),
            minute: getMinute(result),
            ts: Date.now(),
            action: Object.assign({}, result.action, {
                stabilized: false,
                rawPreset: result.action.rawPreset || result.action.preset
            })
        };

        result.action = Object.assign({}, stableState.action);
        return result;
    }

    function stabilize(result) {
        if (!result?.action) return result;

        if (isManualHint(result)) {
            return remember(result);
        }

        if (shouldReset(result) || isHardOverride(result)) {
            return remember(result);
        }

        const candidate = Object.assign({}, result.action);
        const minute = getMinute(result);
        const now = Date.now();

        if (stableState.action?.preset === candidate.preset) {
            stableState.minute = minute;
            stableState.ts = now;
            stableState.score = getScore(result);
            stableState.action = Object.assign({}, candidate, {
                stabilized: false,
                rawPreset: candidate.rawPreset || candidate.preset
            });
            result.action = Object.assign({}, stableState.action);
            return result;
        }

        const elapsedMinutes = Math.max(0, minute - Number(stableState.minute || 0));
        const elapsedMs = now - Number(stableState.ts || 0);
        const expired = elapsedMinutes >= HOLD_MINUTES || elapsedMs >= HOLD_MS;

        if (expired) {
            return remember(result);
        }

        result.action = Object.assign({}, stableState.action, {
            stabilized: true,
            rawPreset: candidate.preset,
            rawRuleId: candidate.ruleId
        });

        return result;
    }

    CurrentActionHintEngine.run = function runWithMomentDriftStabilizer(snapshot, context = {}) {
        return stabilize(originalRun(snapshot, context));
    };

    CurrentActionHintEngine.toPlanRows = function toHintOnlyRows(result) {
        if (!result?.action?.preset) return [];
        return [`Подсказка: ${result.action.preset}`];
    };

    CurrentActionHintEngine.__momentDriftStabilizerApplied = true;

    if (typeof window !== 'undefined') {
        window.SLFMomentDriftStabilizer = {
            holdMinutes: HOLD_MINUTES,
            getState: () => stableState ? Object.assign({}, stableState) : null,
            reset: () => { stableState = null; }
        };
    }
})();
// <<< src/modules/strategy-data-recommendations/moment-drift-stabilizer.js


// >>> src/app/ui-layer.js
    // 11. UI Layer
    // ============================================================

    const UI = {
        updateParserStatus(text) {
            const el = document.getElementById('slf-parser-status');
            if (el) el.textContent = text;
        },

        addParserLog(text) {
            const el = document.getElementById('slf-parser-log');
            if (!el) return;

            const time = new Date().toLocaleTimeString();
            el.textContent = `[${time}] ${text}`;
        },
        escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },

        addMatchParserPanel() {
            if (!location.pathname.includes('/game.php')) return;
            if (document.getElementById('slf-match-parser-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'slf-match-parser-panel';
            panel.style.cssText =
                'width:800px;margin:8px auto;padding:8px 10px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;font-family:Arial,sans-serif;font-size:13px;display:flex;align-items:center;align-content:flex-start;gap:8px;flex-wrap:wrap;height:auto;min-height:0;overflow:visible;box-sizing:border-box;';

            const status = MatchStateParser.getStatus();
            const gameId = MatchStateParser.getGameId();

            const info = document.createElement('div');
            info.textContent = `SLF Parser | game ${gameId} | ${status}`;
            info.style.cssText = 'font-weight:bold;margin-right:8px;';

            const parseBtn = document.createElement('button');
            parseBtn.textContent = 'Спарсить завершённый';
            parseBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #777;border-radius:3px;cursor:pointer;';
            parseBtn.onclick = () => {
                const snapshot = SnapshotEngine.build();
                SnapshotEngine.sendMatchResult(snapshot);
                RecommendationEngine.update(snapshot);
                this.addParserLog('Финальный результат отправлен');
            };

            const statsBtn = document.createElement('button');
            statsBtn.textContent = 'API';
            statsBtn.style.cssText =
                'padding:5px 8px;background:#555;color:#fff;border:1px solid #888;border-radius:3px;cursor:pointer;';

            statsBtn.onclick = () => {
                fetchCanonicalApiStatus()
                    .then(status => {
                        const c = status.collections || {};
                        this.addParserLog(
                            `API OK v2 | games:${status.games} snapshots:${c.snapshots?.count ?? 0} results:${c.results?.count ?? 0} events:${c.events?.count ?? 0} effects:${c.effects?.count ?? 0} players:${c.players?.count ?? 0}`
                        );

                        console.log('[SLF API v2 canonical]', status);
                    })
                    .catch(error => {
                        this.addParserLog('API v2 connection/parse error');
                        console.warn('[SLF API v2 canonical error]', error);
                    });
            };

            const statusBox = document.createElement('div');
            statusBox.id = 'slf-parser-status';
            statusBox.textContent = 'ожидание';
            statusBox.style.cssText = 'color:#9f9;font-size:12px;';

            const recBox = document.createElement('div');
recBox.id = 'slf-parser-recommendation';
recBox.innerHTML = `
    <div style="padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#ddd;">
        Рекомендация появится после snapshot
    </div>
`;
recBox.style.cssText = `
    color:#ddd;
    font-size:12px;
    max-width:760px;
    width:100%;
    display:block;
    margin:0;
    padding:0;
`;

            const logBox = document.createElement('div');
            logBox.id = 'slf-parser-log';
            logBox.style.cssText = 'color:#9f9;font-size:12px;max-width:760px;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

            panel.append(info, parseBtn, statsBtn, statusBox, recBox, logBox);

            const head = document.querySelector('#head');
            if (head && head.parentNode) {
                head.parentNode.insertBefore(panel, head);
            } else {
                document.body.prepend(panel);
            }
        },

        showSaveDialog(currentTactic, callback) {
            const old = document.getElementById('slf-save-dialog');
            if (old) old.remove();

            const labels = PresetStorage.getAllLabels();

            const overlay = document.createElement('div');
            overlay.id = 'slf-save-dialog';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#222;color:#fff;padding:20px;border-radius:8px;min-width:300px;font-family:Arial,sans-serif;box-shadow:0 0 20px rgba(0,0,0,0.8);';

            dialog.innerHTML = `
                <h3>Сохранить тактику</h3>
                <select id="slf-save-select" style="width:100%;padding:8px;margin-bottom:10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">
                    <option value="__new__">➕ Добавить новую тактику</option>
                    ${Object.keys(labels).map(k => `<option value="${k}">${labels[k]}</option>`).join('')}
                </select>
                <div id="slf-new-name-block" style="display:none;margin-bottom:10px;">
                    <input type="text" id="slf-new-name" placeholder="Название" style="width:100%;padding:8px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;">
                </div>
                <div style="text-align:right;">
                    <button id="slf-cancel-btn" style="padding:8px 15px;margin-right:5px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;">Отмена</button>
                    <button id="slf-save-btn" style="padding:8px 15px;background:#4a8;color:#fff;border:1px solid #6c6;border-radius:4px;cursor:pointer;">Сохранить</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const select = document.getElementById('slf-save-select');
            const newNameBlock = document.getElementById('slf-new-name-block');
            const newNameInput = document.getElementById('slf-new-name');
            const saveBtn = document.getElementById('slf-save-btn');
            const cancelBtn = document.getElementById('slf-cancel-btn');

            if (select.value === '__new__') {
                newNameBlock.style.display = 'block';
                setTimeout(() => newNameInput.focus(), 50);
            }

            select.addEventListener('change', () => {
                const isNew = select.value === '__new__';
                newNameBlock.style.display = isNew ? 'block' : 'none';
                if (isNew) setTimeout(() => newNameInput.focus(), 50);
            });

            cancelBtn.addEventListener('click', () => overlay.remove());

            saveBtn.addEventListener('click', () => {
                const selected = select.value;

                if (selected === '__new__') {
                    const name = newNameInput.value.trim();

                    if (!name) {
                        alert('Введите название');
                        newNameInput.focus();
                        return;
                    }

                    overlay.remove();
                    callback(name);
                } else {
                    overlay.remove();
                    callback(selected);
                }
            });
        },

        waitForTacticReady() {
            return new Promise(resolve => {
                let attempts = 0;
                const maxAttempts = 50;

                const check = () => {
                    const target =
                        document.querySelector('.team_general_content') ||
                        document.querySelector('.game_control') ||
                        document.querySelector('#game_control') ||
                        document.querySelector('.game_tab_content') ||
                        document.querySelector('.tabs_content') ||
                        document.querySelector('.match_content') ||
                        document.querySelector('.content');

                    if (
                        target &&
                        target.querySelectorAll('input[type="radio"][name], input[type="checkbox"][name]').length >= 10
                    ) {
                        resolve();
                        return;
                    }

                    attempts++;

                    if (attempts >= maxAttempts) {
                        resolve();
                        return;
                    }

                    setTimeout(check, 100);
                };

                check();
            });
        },

        async addDropdown() {
            const isTacticPage =
    location.pathname.includes('/game.php') ||
    (
        location.pathname.includes('/team4.php') &&
        new URLSearchParams(location.search).get('action') === 'tactic'
    );

if (!isTacticPage) return;
            document.querySelectorAll('#slf-tactics-dropdown').forEach((el, i) => {
                if (i > 0) el.remove();
            });

            if (document.getElementById('slf-tactics-dropdown')) return;

            if (location.pathname.includes('/game.php')) {
                const ids = MatchStatsParser.getAllTeamIds();
                if (!MatchStatsParser.detectMyTeamId(ids, MatchStatsParser.readTeamNames())) return;
            }

            if (location.pathname.includes('/team4.php')) {
                await this.waitForTacticReady();
            }

            let target = document.querySelector('.team_general_content');

            if (!target && location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');
                target = defInput ? defInput.closest('td, div') : null;
            }

            if (!target) return;

            const container = document.createElement('div');
            container.id = 'slf-tactics-dropdown';
            container.style.cssText =
                'margin-bottom:15px;padding:10px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;font-family:Arial,sans-serif;font-size:14px;';

            const title = document.createElement('div');
            title.textContent = 'Быстрая смена тактики';
            title.style.cssText = 'margin-bottom:5px;font-weight:bold;';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';

            const select = document.createElement('select');
            select.style.cssText =
                'flex:1;min-width:120px;padding:5px;background:#333;color:#fff;border:1px solid #555;border-radius:3px;font-size:14px;';

            function getCoachGroup(key, label = '') {
                const l = String(label).toLowerCase();

                if (l.includes('bielsa')) return 'Bielsa';
                if (l.includes('conte')) return 'Conte';
                if (l.includes('de zerbi')) return 'De Zerbi';
                if (l.includes('klopp')) return 'Klopp';
                if (l.includes('mourinho')) return 'Mourinho';
                if (l.includes('pep')) return 'Pep';
                if (l.includes('simeone')) return 'Simeone';
                if (l.includes('xabi')) return 'Xabi Alonso';

                if (BASE_PRESETS.hasOwnProperty(key)) return 'Other';

                return 'Custom';
            }

            function buildGroupedOptions(labels) {
                const groups = {};

                Object.entries(labels).forEach(([key, value]) => {
                    const group = getCoachGroup(key, value);

                    if (!groups[group]) groups[group] = [];
                    groups[group].push({ key, value });
                });

                Object.keys(groups).forEach(groupName => {
                    groups[groupName].sort((a, b) =>
                        String(a.value).localeCompare(String(b.value), 'ru', { sensitivity: 'base' })
                    );
                });

                return groups;
            }

            function refreshSelect(keepValue) {
                const labels = PresetStorage.getAllLabels();
                const cur = keepValue || select.value;
                const groups = buildGroupedOptions(labels);

                select.innerHTML = '';

                const groupOrder = [
                    'Bielsa',
                    'Conte',
                    'De Zerbi',
                    'Klopp',
                    'Mourinho',
                    'Pep',
                    'Simeone',
                    'Xabi Alonso',
                    'Other',
                    'Custom'
                ];

                groupOrder.forEach(groupName => {
                    const items = groups[groupName];
                    if (!items || items.length === 0) return;

                    const optgroup = document.createElement('optgroup');
                    optgroup.label = groupName;

                    items.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.key;
                        opt.textContent = item.value;
                        optgroup.appendChild(opt);
                    });

                    select.appendChild(optgroup);
                });

                if (labels.hasOwnProperty(cur)) {
                    select.value = cur;
                } else if (select.options.length > 0) {
                    select.value = select.options[0].value;
                }
            }

            const schemeLabel = document.createElement('div');
            schemeLabel.id = 'slf-tactics-scheme-label';
            schemeLabel.style.cssText = 'font-size:12px;color:#ffb86c;white-space:normal;width:100%;max-width:100%;line-height:1.3;margin-top:5px;box-sizing:border-box;';

            function updateSchemeLabel() {
                const scheme = TacticPresetLibrary?.getSchemeForPreset
                    ? TacticPresetLibrary.getSchemeForPreset(select.value)
                    : '';

                schemeLabel.textContent = scheme ? `Схема: ${scheme}` : '';
            }

            refreshSelect();
            updateSchemeLabel();

            select.addEventListener('change', async () => {
                updateSchemeLabel();
                await applyPresetAsync(select.value);
            });

            const applyBtn = document.createElement('button');
            applyBtn.textContent = '🔄';
            applyBtn.title = 'Применить выбранный пресет';
            applyBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            applyBtn.addEventListener('click', async () => {
                applyBtn.disabled = true;
                await applyPresetAsync(select.value);
                applyBtn.disabled = false;
            });

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '💾';
            saveBtn.title = 'Сохранить текущую тактику';
            saveBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            saveBtn.addEventListener('click', () => {
                const currentTactic = getCurrentTactic();

                if (Object.keys(currentTactic).length === 0) {
                    alert('Не удалось считать тактику.');
                    return;
                }

                this.showSaveDialog(currentTactic, name => {
                    const customPresets = PresetStorage.loadCustom();
                    customPresets[name] = currentTactic;
                    PresetStorage.saveCustom(customPresets);
                    refreshSelect(name);
                    updateSchemeLabel();
                });
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Удалить выбранный пресет';
            deleteBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            deleteBtn.addEventListener('click', () => {
                const name = select.value;

                if (BASE_PRESETS.hasOwnProperty(name)) {
                    alert('Встроенный пресет удалить нельзя.');
                    return;
                }

                const customPresets = PresetStorage.loadCustom();

                if (!customPresets.hasOwnProperty(name)) {
                    alert('Пресет не найден.');
                    return;
                }

                if (!confirm(`Удалить "${name}"?`)) return;

                delete customPresets[name];
                PresetStorage.saveCustom(customPresets);
                refreshSelect();
                updateSchemeLabel();
            });

            const exportBtn = document.createElement('button');
            exportBtn.textContent = '📥';
            exportBtn.title = 'Скачать резервную копию';
            exportBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            exportBtn.addEventListener('click', () => {
                const data = JSON.stringify(PresetStorage.loadCustom(), null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = 'slf_tactics_backup.json';
                a.click();

                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });

            const importBtn = document.createElement('button');
            importBtn.textContent = '📤';
            importBtn.title = 'Загрузить пресеты из файла';
            importBtn.style.cssText = 'padding:5px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;cursor:pointer;font-size:16px;';
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';

                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();

                    reader.onload = ev => {
                        try {
                            const imported = normalizePresets(JSON.parse(ev.target.result));
                            if (!confirm('Импорт заменит все пользовательские пресеты локально и на VPS. Продолжить?')) return;

                            PresetStorage.saveCustom(imported);
                            refreshSelect();
                            updateSchemeLabel();

                            alert('Пресеты импортированы!');
                        } catch (ex) {
                            alert('Ошибка: неверный формат файла.');
                        }
                    };

                    reader.readAsText(file);
                };

                input.click();
            });

            row.append(select, applyBtn, saveBtn, deleteBtn, exportBtn, importBtn);
            container.append(title, row, schemeLabel);

            if (location.pathname.includes('/game.php')) {
                const defInput = document.querySelector('input[name="def_line"]');

                let controlRoot = defInput;

                while (
                    controlRoot &&
                    controlRoot !== document.body &&
                    !(
                        controlRoot.innerText &&
                        controlRoot.innerText.includes('Оборона') &&
                        controlRoot.innerText.includes('Построение атаки') &&
                        controlRoot.innerText.includes('Атака')
                    )
                ) {
                    controlRoot = controlRoot.parentNode;
                }

                if (!controlRoot || controlRoot === document.body) return;

                container.style.cssText =
                    'width:100%;box-sizing:border-box;margin:4px 0 8px 0;padding:6px 10px;background:#222;color:#fff;border:1px solid #555;border-radius:4px;font-family:Arial,sans-serif;font-size:13px;display:block;overflow:visible;';

                title.style.cssText = 'font-weight:bold;white-space:nowrap;margin:0;';
                row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:nowrap;min-width:0;';
                schemeLabel.style.cssText = 'font-size:12px;color:#ffb86c;white-space:normal;width:100%;max-width:100%;line-height:1.3;margin-top:5px;box-sizing:border-box;';

                const topLine = document.createElement('div');
                topLine.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;width:100%;min-width:0;';
                topLine.append(title, row);

                container.innerHTML = '';
                container.append(topLine, schemeLabel);

                controlRoot.parentNode.insertBefore(container, controlRoot);
            } else {
                target.insertBefore(container, target.firstChild);
            }
        }
    };

    // ============================================================
// <<< src/app/ui-layer.js


// >>> src/app/version-badge.js
// App: SLF runtime version badge
// Safe self-contained app-level module.
// Must never break userscript startup.

(function installSLFVersionBadge() {
    'use strict';

    try {
        const BADGE_ID = 'slf-version-inline-badge';
        const TARGET_SELECTOR = '.head-ui__information';

        function safeGetGlobal() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
            } catch (error) {}
            try {
                return window;
            } catch (error) {}
            return null;
        }

        function safeGetVersion() {
            try {
                const root = safeGetGlobal();
                const slf = root && root.SLF ? root.SLF : (typeof window !== 'undefined' ? window.SLF : null);

                return String(
                    (slf && slf.scriptVersion) ||
                    (slf && slf.versionInfo && slf.versionInfo.version) ||
                    ''
                ).trim();
            } catch (error) {
                return '';
            }
        }

        function safeGetTarget() {
            try {
                if (typeof document === 'undefined' || !document.querySelector) return null;
                return document.querySelector(TARGET_SELECTOR);
            } catch (error) {
                return null;
            }
        }

        function safeRemoveExisting() {
            try {
                const existing = document.getElementById(BADGE_ID);
                if (existing && existing.parentNode) {
                    existing.parentNode.removeChild(existing);
                }
            } catch (error) {}
        }

        function render() {
            try {
                const target = safeGetTarget();
                if (!target) return false;

                const version = safeGetVersion();
                if (!version) return false;

                safeRemoveExisting();

                const badge = document.createElement('span');
                badge.id = BADGE_ID;
                badge.textContent = ' • SLF ' + version;
                badge.title = 'SLF userscript version';
                badge.style.cssText = [
                    'color:#36ff00',
                    'font-weight:bold',
                    'font-size:10px',
                    'margin-left:6px',
                    'white-space:nowrap',
                    'text-shadow:0 1px 2px #000'
                ].join(';');

                target.appendChild(badge);
                return true;
            } catch (error) {
                return false;
            }
        }

        function start() {
            try {
                const run = function () {
                    try {
                        if (render()) return;

                        let tries = 0;
                        const maxTries = 40;

                        const timer = window.setInterval(function () {
                            try {
                                tries += 1;

                                if (render() || tries >= maxTries) {
                                    window.clearInterval(timer);
                                }
                            } catch (error) {
                                try {
                                    window.clearInterval(timer);
                                } catch (inner) {}
                            }
                        }, 250);
                    } catch (error) {}
                };

                if (typeof document === 'undefined') return;

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', run, { once: true });
                } else {
                    run();
                }
            } catch (error) {}
        }

        start();
    } catch (error) {}
})();
// <<< src/app/version-badge.js


// >>> src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js
// 10.1 Strategy Data Task A UI extension
// ============================================================

(function strategyDataTaskAExtension() {
    'use strict';

    function getFallbackTargetTeam(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        if (!teams.length) return null;
        const selector = document.getElementById('slf-foreign-match-target');
        const side = selector?.value || 'home';
        return side === 'away' ? teams[1] : teams[0];
    }

    function normalizeForeignSnapshot(snapshot) {
        if (!snapshot || snapshot.myTeam || !Array.isArray(snapshot.teams) || snapshot.teams.length < 2) return snapshot;
        const targetTeam = getFallbackTargetTeam(snapshot);
        if (!targetTeam) return snapshot;

        snapshot.matchOwnership = 'foreign';
        snapshot.targetSide = Number(snapshot.teams[1]) === Number(targetTeam) ? 'away' : 'home';
        snapshot.myTeam = targetTeam;
        return snapshot;
    }

    function patchSnapshotBuild() {
        if (typeof SnapshotEngine === 'undefined' || SnapshotEngine.__taskAPatchedBuild) return;
        const originalBuild = SnapshotEngine.build;
        SnapshotEngine.build = function patchedTaskABuild() {
            return normalizeForeignSnapshot(originalBuild.apply(this, arguments));
        };
        SnapshotEngine.__taskAPatchedBuild = true;
    }

    function patchHasEnoughLiveData() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskAPatchedLiveGate) return;
        const originalHasEnoughLiveData = RecommendationEngine.hasEnoughLiveData;
        RecommendationEngine.hasEnoughLiveData = function patchedTaskAHasEnoughLiveData(snapshot) {
            const gate = originalHasEnoughLiveData.apply(this, arguments);
            const minute = this.getEffectiveMinute(snapshot);

            if (gate?.phase === 'collect' && Number.isFinite(minute) && minute >= 10) {
                return { ok: true, phase: 'pre_window' };
            }

            if (gate?.phase === 'collect') {
                return Object.assign({}, gate, {
                    reason: 'Сбор данных до первого pre-window. Первая предварительная рекомендация появится с 10-й минуты, чтобы подготовить смену до 15-й.'
                });
            }

            return gate;
        };
        RecommendationEngine.__taskAPatchedLiveGate = true;
    }

    function getPresetOptionPair(name) {
        if (!name || typeof RecommendationEngine === 'undefined') return { cautious: '', aggressive: '' };

        const group = RecommendationEngine.getPresetGroup(name);
        const ladder = RecommendationEngine.getPresetLadder(group);
        const index = ladder.indexOf(name);
        if (index < 0) return { cautious: '', aggressive: '' };

        if (group === 'defensive') {
            return {
                cautious: ladder[index + 1] || '',
                aggressive: ladder[index - 1] || ''
            };
        }

        return {
            cautious: ladder[index - 1] || '',
            aggressive: ladder[index + 1] || ''
        };
    }

    function appendPresetOptions(plan, name) {
        if (!plan || !Array.isArray(plan.preset) || !name || typeof RecommendationEngine === 'undefined') return;

        const options = getPresetOptionPair(name);
        const rows = [];

        if (options.cautious) rows.push(`Осторожнее: ${RecommendationEngine.getPresetTitle(options.cautious)}.`);
        if (options.aggressive) rows.push(`Агрессивнее: ${RecommendationEngine.getPresetTitle(options.aggressive)}.`);

        rows.forEach(row => {
            if (!plan.preset.includes(row)) plan.preset.push(row);
        });
    }

    function patchPresetOptions() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__taskBPatchedPresetOptions) return;
        const originalSelectPreset = RecommendationEngine.selectPreset;
        RecommendationEngine.selectPreset = function patchedTaskBSelectPreset(snapshot, my, opp, playerSignals, plan, state) {
            const selectedName = originalSelectPreset.apply(this, arguments);
            appendPresetOptions(plan, selectedName);
            return selectedName;
        };
        RecommendationEngine.__taskBPatchedPresetOptions = true;
    }

    function patchLateLosingPressCooldownGuard() {
        if (typeof RecommendationEngine === 'undefined' || RecommendationEngine.__lateLosingPressCooldownGuard) return;
        if (typeof RecommendationEngine.selectRawPreset !== 'function') return;

        const original = RecommendationEngine.selectRawPreset;

        RecommendationEngine.selectRawPreset = function(snapshot, state) {
            const candidate = original.apply(this, arguments);

            if (candidate?.name !== 'Pep_PressCooldown_bal2') return candidate;
            if (!state?.pressFatigue?.active) return candidate;

            const score = state.score || this.getScoreState(snapshot);
            const minute = Number(state.minute ?? this.getEffectiveMinute(snapshot));

            if (score?.state !== 'losing' || !Number.isFinite(minute) || minute < 75) {
                return candidate;
            }

            const myBad = Number(state.myBad || 0);
            const finalLosing = minute >= 80;
            const lastApplied = STATE?.presetProgression?.lastAppliedPreset || '';
            const currentIsChaos = lastApplied === 'Bielsa_ChaosPress_att5';

            if (finalLosing && currentIsChaos && myBad < 26) {
                return {
                    name: 'Bielsa_ChaosPress_att5',
                    reason: 'late game override: preserve chaos press'
                };
            }

            if (finalLosing) {
                return {
                    name: myBad >= 24 ? 'Klopp_Gegenpress_att4' : 'Bielsa_ChaosPress_att5',
                    reason: 'final losing state adjustment'
                };
            }

            return {
                name: myBad >= 24 ? 'Pep_ControlledPush_att3' : 'Klopp_Gegenpress_att4',
                reason: 'late losing override'
            };
        };

        RecommendationEngine.__lateLosingPressCooldownGuard = true;
    }

    function resetLiveOnlyRecommendationState() {
        if (typeof STATE === 'undefined') return;
        STATE.recommendationFreeze = null;
        STATE.pendingPresetEvent = null;
        STATE.liveWaitStatus = null;
    }

    function buildManualRecommendationHtml(snapshot) {
        if (typeof RecommendationEngine === 'undefined') {
            return '<div style="padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#ddd;">RecommendationEngine недоступен.</div>';
        }

        return RecommendationEngine.make(snapshot);
    }

    function rememberManualRecommendation(html, snapshot) {
        if (typeof STATE === 'undefined' || typeof RecommendationEngine === 'undefined') return;
        if (RecommendationEngine.isPlaceholderHtml && RecommendationEngine.isPlaceholderHtml(html)) return;

        STATE.lastRecommendationHtml = html;
        STATE.lastRecommendationMeta = {
            schema: 'slf_manual_hint_render_v1',
            savedAt: Date.now(),
            gameId: snapshot?.gameId || MatchStateParser.getGameId(),
            bucket: snapshot?.bucket || '',
            minute: snapshot?.minute ?? null,
            source: 'manual_hint_button'
        };
    }

    function renderManualRecommendation() {
        resetLiveOnlyRecommendationState();

        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual_hint_button';
        snapshot.manualRecommendationRefresh = true;

        if (typeof SnapshotEngine !== 'undefined' && SnapshotEngine.rememberLiveSnapshot) {
            SnapshotEngine.rememberLiveSnapshot(snapshot);
        }

        const el = document.getElementById('slf-parser-recommendation');
        const html = buildManualRecommendationHtml(snapshot);

        if (el) el.innerHTML = html;
        rememberManualRecommendation(html, snapshot);

        UI.addParserLog('Подсказка обновлена по текущему snapshot');
        UI.updateParserStatus('Подсказка обновлена вручную');
    }

    function mountManualButton() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-manual-recommendation-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'slf-manual-recommendation-btn';
        btn.type = 'button';
        btn.textContent = '↻ Подсказка';
        btn.title = 'Собрать текущий snapshot и показать подсказку по текущему состоянию';
        btn.style.cssText = 'padding:5px 8px;background:#345;color:#fff;border:1px solid #79a;border-radius:3px;cursor:pointer;';
        btn.onclick = () => {
            btn.disabled = true;
            try {
                renderManualRecommendation();
            } catch (error) {
                console.error('[SLF] Manual recommendation refresh failed', error);
                UI.addParserLog('Подсказка: ошибка, см. console');
            } finally {
                btn.disabled = false;
            }
        };

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(btn, status || null);
    }

    function mountForeignSelector() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-foreign-match-target')) return;

        const snapshot = SnapshotEngine.build();
        if (!snapshot || snapshot.matchOwnership !== 'foreign') return;

        const select = document.createElement('select');
        select.id = 'slf-foreign-match-target';
        select.title = 'Тестовый режим чужого матча: выбрать сторону для подсказок';
        select.style.cssText = 'padding:4px 6px;background:#333;color:#fff;border:1px solid #777;border-radius:3px;';
        select.innerHTML = '<option value="home">Анализ: хозяева</option><option value="away">Анализ: гости</option>';
        select.onchange = () => renderManualRecommendation();

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(select, status || null);
    }

    function mount() {
        patchSnapshotBuild();
        patchHasEnoughLiveData();
        patchLateLosingPressCooldownGuard();
        patchPresetOptions();
        mountManualButton();
        mountForeignSelector();
    }

    const originalAddMatchParserPanel = UI.addMatchParserPanel;
    UI.addMatchParserPanel = function patchedTaskAAddMatchParserPanel() {
        const result = originalAddMatchParserPanel.apply(this, arguments);
        mount();
        return result;
    };

    mount();
})();

// ============================================================
// <<< src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js


// >>> src/modules/transfer-analyzer/tm-enrichment-layer.js
// 12. TM Enrichment Layer
// ============================================================

const TMEnrichmentLayer = {
    cacheKey: 'slf_tm_enrichment_cache_v6',
    cacheTtlMs: 1000 * 60 * 60 * 24 * (CONFIG.TRANSFER_ANALYZER?.cacheTtlDays || 7),
    requestDelayMs: CONFIG.TRANSFER_ANALYZER?.requestDelayMs || 900,
    _lastRequestAt: 0,

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('[SLF TM] cache save failed', e);
        }
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    getCache(key) {
        const cache = this.loadCache();
        const item = cache[key];

        if (!item) return null;

        const fetchedAt = Number(item.fetchedAt || 0);

        if (!fetchedAt || Date.now() - fetchedAt > this.cacheTtlMs) {
            return null;
        }

        return item;
    },

    peekBySlfPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;

        return this.getCache(`slf:${id}`);
    },

    setCache(key, value) {
        const cache = this.loadCache();

        cache[key] = {
            ...value,
            fetchedAt: Date.now()
        };

        this.saveCache(cache);
    },

    async throttle() {
        const diff = Date.now() - this._lastRequestAt;
        const wait = Math.max(0, this.requestDelayMs - diff);

        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }

        this._lastRequestAt = Date.now();
    },

    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
                },
                timeout: 30000,
                onload: r => resolve(r.responseText || ''),
                onerror: reject,
                ontimeout: reject
            });
        });
    },

    parseHtml(html) {
        return new DOMParser().parseFromString(html || '', 'text/html');
    },

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    includesAnyText(text, terms) {
        const lower = this.normalizeText(text).toLowerCase();

        return (terms || []).some(term => lower.includes(String(term || '').toLowerCase()));
    },

    isRetiredClubText(text) {
        return this.includesAnyText(text, CONFIG.TRANSFER_ANALYZER?.currentClub?.retiredTerms || []);
    },

    isFreeAgentClubText(text) {
        return this.includesAnyText(text, CONFIG.TRANSFER_ANALYZER?.currentClub?.freeAgentTerms || []);
    },

    normalizeUrl(url) {
        const value = String(url || '').trim();

        if (!value) return '';

        if (value.startsWith('//')) return 'https:' + value;
        if (value.startsWith('http')) return value;

        return '';
    },

    normalizeTransfermarktUrl(url) {
        let value = this.normalizeUrl(url);

        if (!value) return '';

        value = value.replace('http://', 'https://');

        value = value
            .replace('https://transfermarkt.', 'https://www.transfermarkt.')
            .replace('https://www.transfermarkt.de', 'https://www.transfermarkt.com')
            .replace('https://www.transfermarkt.ru', 'https://www.transfermarkt.com')
            .replace('https://www.transfermarkt.co.uk', 'https://www.transfermarkt.com');

        return value;
    },

    extractTmId(url) {
        const m = String(url || '').match(/spieler\/(\d+)/);
        return m ? m[1] : '';
    },

    async getBySlfPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) throw new Error('empty_player_id');

        const key = `slf:${id}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const slfUrl = buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(id)}`);
        const slfHtml = await this.fetchUrl(slfUrl);
        const slfDoc = this.parseHtml(slfHtml);

        const tmUrl = this.extractTransfermarktUrlFromSlfPlayer(slfDoc);

        const result = {
            playerId: id,
            slfUrl,
            tmUrl,
            tmProfile: null,
            error: null
        };

        if (!tmUrl) {
            result.error = 'tm_url_not_found';
            this.setCache(key, result);
            return result;
        }

        try {
            result.tmProfile = await this.getTmProfile(tmUrl);
        } catch (e) {
            result.error = String(e?.message || e || 'tm_profile_failed');
        }

        this.setCache(key, result);

        return result;
    },

    extractTransfermarktUrlFromSlfPlayer(doc) {
        const links = [...doc.querySelectorAll('a[href]')];

        const link = links.find(a => {
            const href = a.getAttribute('href') || '';
            return /transfermarkt\./i.test(href) && /spieler\/\d+/i.test(href);
        });

        if (!link) return '';

        return this.normalizeTransfermarktUrl(link.getAttribute('href') || '');
    },

    async getTmProfile(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);
        const key = `tm:${tmId || tmUrl}`;

        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const html = await this.fetchUrl(tmUrl);
        const doc = this.parseHtml(html);

        const profile = {
            tmUrl,
            tmId,

            marketValueText: this.extractTmMarketValueText(doc),
            marketValueEur: null,
            lastKnownMarketValueText: '',
            lastKnownMarketValueEur: null,
            lastKnownMarketValueDate: '',
            marketValueIsHistorical: false,
            isRetired: false,
            isFreeAgent: false,

            highestMarketValueText: '',
            highestMarketValueEur: null,
            highestMarketValueDate: '',
            valuePeakRatio: null,

            dateOfBirth: this.extractProfileValue(doc, [
                'Date of birth/Age',
                'Date of birth',
                'Geb./Alter',
                'Geburtsdatum/Alter'
            ]),
            age: this.extractAge(doc),

            currentClub: this.extractProfileValue(doc, [
                'Current club',
                'Club actuel',
                'Aktueller Verein'
            ]),

            playerAgent: this.extractProfileValue(doc, [
                'Player agent',
                'Agent',
                'Spielerberater',
                'Berater'
            ]),

            joined: this.extractProfileValue(doc, [
                'Joined',
                'Im Team seit',
                'Arrivé le'
            ]),

            contractExpires: this.extractProfileValue(doc, [
                'Contract expires',
                'Vertrag bis',
                'Contrat jusqu’à'
            ]),

            lastContractExtension: this.extractProfileValue(doc, [
                'Last contract extension',
                'Letzte Verlängerung'
            ]),

            activity: this.extractActivity(doc),

            transferHistory: [],
            youthClubs: [],
            rumors: [],

            fetchedAt: Date.now()
        };

        profile.isRetired = this.isRetiredClubText(profile.currentClub);
        profile.isFreeAgent = this.isFreeAgentClubText(profile.currentClub);

        profile.marketValueEur = this.parseMarketValue(profile.marketValueText);

        try {
            const graph = await this.getTmMarketValueGraph(tmUrl);

            profile.marketValueGraph = graph;

            if (graph.currentEur) {
                profile.lastKnownMarketValueEur = graph.currentEur;
                profile.lastKnownMarketValueText = graph.currentText || this.formatMoney(graph.currentEur);
                profile.lastKnownMarketValueDate = graph.currentDate || '';

                if (!profile.isRetired) {
                    profile.marketValueEur = graph.currentEur;
                    profile.marketValueText = `${graph.currentText || this.formatMoney(graph.currentEur)}${graph.currentDate ? ' Last update: ' + graph.currentDate : ''}`;
                }
            }

            if (graph.highestEur) {
                profile.highestMarketValueEur = graph.highestEur;
                profile.highestMarketValueText = graph.highestText || this.formatMoney(graph.highestEur);
                profile.highestMarketValueDate = graph.highestDate || '';
            }
        } catch (e) {
            console.warn('[SLF TM] market value graph failed', tmUrl, e);
        }

        if (!profile.highestMarketValueEur) {
            const highest = this.extractHighestMarketValue(doc);
            profile.highestMarketValueText = highest.highestMarketValueText;
            profile.highestMarketValueEur = highest.highestMarketValueEur;
            profile.highestMarketValueDate = highest.highestMarketValueDate;
        }

        if (profile.isRetired) {
            profile.marketValueIsHistorical = true;

            if (!profile.lastKnownMarketValueEur && profile.marketValueEur) {
                profile.lastKnownMarketValueEur = profile.marketValueEur;
                profile.lastKnownMarketValueText = profile.marketValueText;
            }

            profile.marketValueEur = null;
            profile.marketValueText = '';
            profile.valuePeakRatio = null;
        } else if (profile.marketValueEur && profile.highestMarketValueEur) {
            profile.valuePeakRatio = profile.marketValueEur / profile.highestMarketValueEur;
        }

        try {
            profile.transferHistory = await this.getTmTransferHistory(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] transfer history failed', tmUrl, e);
            profile.transferHistory = [];
        }

        try {
            profile.youthClubs = await this.getTmYouthClubs(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] youth clubs failed', tmUrl, e);
            profile.youthClubs = [];
        }

        try {
            profile.rumors = await this.getTmRumors(tmUrl);
        } catch (e) {
            console.warn('[SLF TM] rumors failed', tmUrl, e);
            profile.rumors = [];
        }

        this.setCache(key, profile);

        return profile;
    },

    async getTmMarketValueGraph(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) {
            return {
                tmId: '',
                points: [],
                currentEur: null,
                currentText: '',
                currentDate: '',
                highestEur: null,
                highestText: '',
                highestDate: ''
            };
        }

        const key = `graph:${tmId}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        await this.throttle();

        const graphUrl = `https://www.transfermarkt.com/ceapi/marketValueDevelopment/graph/${encodeURIComponent(tmId)}`;
        const raw = await this.fetchUrl(graphUrl);

        let json = null;

        try {
            json = JSON.parse(raw);
        } catch (e) {
            throw new Error('market_value_graph_json_failed');
        }

        const points = this.extractMarketValueGraphPoints(json);
        const currentPoint = points.length ? points[points.length - 1] : null;

        let highestPoint = points.length
            ? points.slice().sort((a, b) => Number(b.eur || 0) - Number(a.eur || 0))[0]
            : null;

        const explicitHighest = this.parseMarketValue(json.highest || '');

        if (explicitHighest) {
            highestPoint = {
                eur: explicitHighest,
                moneyText: String(json.highest || ''),
                dateText: String(json.highest_date || '')
            };
        }

        const result = {
            tmId,
            graphUrl,
            points,
            currentEur: currentPoint?.eur || null,
            currentText: currentPoint?.moneyText || '',
            currentDate: currentPoint?.dateText || '',
            highestEur: highestPoint?.eur || null,
            highestText: highestPoint?.moneyText || '',
            highestDate: highestPoint?.dateText || '',
            lastChange: json.last_change || ''
        };

        this.setCache(key, result);

        return result;
    },

    extractMarketValueGraphPoints(json) {
        const list = Array.isArray(json?.list) ? json.list : [];

        const points = list
            .map(item => {
                const eur = Number(item?.y || 0);

                if (!Number.isFinite(eur) || eur <= 0) return null;

                return {
                    eur,
                    moneyText: item?.mw || this.formatMoney(eur),
                    dateText: item?.datum_mw || '',
                    club: item?.verein || '',
                    age: item?.age || ''
                };
            })
            .filter(Boolean);

        const seen = new Set();

        return points.filter(point => {
            const key = `${point.eur}|${point.dateText}`;

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
    },

    extractTmMarketValueText(doc) {
        const selectors = [
            '.data-header__market-value-wrapper',
            '.tm-player-market-value-development__current-value',
            '[class*="market-value"]'
        ];

        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            const text = this.normalizeText(el?.textContent || '');

            if (text && /€|m|k|Th\.|mil/i.test(text)) {
                return text;
            }
        }

        const text = doc.body?.innerText || '';
        const m = text.match(/€\s?[\d,.]+\s?(m|k|Th\.|mil\.)?/i);

        return m ? m[0].trim() : '';
    },

    parseMarketValue(text) {
        const raw = String(text || '')
            .replace(/\s+/g, ' ')
            .replace(',', '.')
            .toLowerCase();

        if (!raw.includes('€')) return null;

        const m = raw.match(/€\s*([\d.]+)/);
        if (!m) return null;

        const num = Number(m[1]);

        if (!Number.isFinite(num)) return null;

        if (raw.includes('m') || raw.includes('mil')) return Math.round(num * 1000000);
        if (raw.includes('k') || raw.includes('th')) return Math.round(num * 1000);

        return Math.round(num);
    },

    extractHighestMarketValue(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        let highestMarketValueText = '';
        let highestMarketValueDate = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();

            if (
                line.includes('highest market value') ||
                line.includes('highest mv') ||
                line.includes('höchster marktwert')
            ) {
                const nearby = lines.slice(i, i + 8);

                const valueLine = nearby.find(x => /€\s?[\d,.]+\s?(m|k|Th\.|mil\.)?/i.test(x));
                const dateLine = nearby.find(x => /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(x));

                highestMarketValueText = valueLine || '';
                highestMarketValueDate = dateLine || '';

                break;
            }
        }

        if (!highestMarketValueText) {
            const text = doc.body?.innerText || '';
            const m = text.match(/Highest market value\s*:?\s*[\n\r\s]*(€\s?[\d,.]+\s?(?:m|k|Th\.|mil\.)?)[\n\r\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{4})?/i);

            if (m) {
                highestMarketValueText = m[1] || '';
                highestMarketValueDate = m[2] || '';
            }
        }

        return {
            highestMarketValueText,
            highestMarketValueEur: this.parseMarketValue(highestMarketValueText),
            highestMarketValueDate
        };
    },

    extractProfileValue(doc, labels) {
        const bodyText = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        for (let i = 0; i < bodyText.length; i++) {
            const line = bodyText[i];

            for (const label of labels) {
                const normalizedLabel = label.toLowerCase();
                const lower = line.toLowerCase();

                if (lower === normalizedLabel || lower.startsWith(normalizedLabel + ':')) {
                    const inline = line.split(':').slice(1).join(':').trim();

                    if (inline) return inline;

                    return this.normalizeText(bodyText[i + 1] || '');
                }
            }
        }

        return '';
    },

    extractAge(doc) {
        const text = doc.body?.innerText || '';
        const m = text.match(/\((\d{2})\)/);

        if (!m) return null;

        const age = Number(m[1]);

        return Number.isFinite(age) ? age : null;
    },

    extractPercentNearLabel(lines, labelPatterns) {
        const normalized = lines.map(x => this.normalizeText(x));

        for (let i = 0; i < normalized.length; i++) {
            const line = normalized[i];
            const lower = line.toLowerCase();

            const hasLabel = labelPatterns.some(pattern => lower.includes(pattern));

            if (!hasLabel) continue;

            const nearby = normalized.slice(Math.max(0, i - 2), Math.min(normalized.length, i + 4));
            const joined = nearby.join(' ');

            const direct = line.match(/(\d{1,3})\s*%/);
            if (direct) return Number(direct[1]);

            const beforeLine = normalized[i - 1] || '';
            const afterLine = normalized[i + 1] || '';

            const before = beforeLine.match(/^(\d{1,3})$/);
            if (before && (afterLine === '%' || line.includes('%'))) return Number(before[1]);

            const joinedMatch = joined.match(/(\d{1,3})\s*%\s*[^%]{0,40}/);
            if (joinedMatch) return Number(joinedMatch[1]);
        }

        return null;
    },

    extractActivity(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        return {
            startingElevenPct: this.extractPercentNearLabel(lines, [
                'starting eleven',
                'startelf',
                'starting xi'
            ]),
            minutesPct: this.extractPercentNearLabel(lines, [
                'minutes',
                'minuten'
            ]),
            goalParticipationPct: this.extractPercentNearLabel(lines, [
                'goal participation',
                'goal involvement',
                'torbeteiligung'
            ])
        };
    },

    getTmHistoryUrlCandidates(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const urls = [];

        if (tmUrl.includes('/profil/')) {
            urls.push(tmUrl.replace('/profil/', '/transfers/'));
        }

        urls.push(
            tmUrl.replace(/\/profil\/spieler\/\d+.*/i, `/transfers/spieler/${tmId}`)
        );

        urls.push(`https://www.transfermarkt.com/-/transfers/spieler/${tmId}`);

        return [...new Set(urls.filter(Boolean))];
    },

    async getTmTransferHistory(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `history:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.transferHistory) return cached.transferHistory;

        const urls = this.getTmHistoryUrlCandidates(tmUrl);

        let lastUrl = '';
        let lastHtmlLength = 0;
        let lastTitle = '';

        for (const historyUrl of urls) {
            lastUrl = historyUrl;

            await this.throttle();

            const html = await this.fetchUrl(historyUrl);
            lastHtmlLength = html.length;

            const doc = this.parseHtml(html);
            lastTitle = doc.title || '';

            const transferHistory = this.extractTransferHistory(doc);

            console.log('[SLF TM] history fetch', {
                historyUrl,
                htmlLength: html.length,
                title: doc.title,
                rows: transferHistory.length
            });

            if (transferHistory.length) {
                this.setCache(key, {
                    tmId,
                    historyUrl,
                    transferHistory
                });

                return transferHistory;
            }
        }

        this.setCache(key, {
            tmId,
            historyUrl: lastUrl,
            transferHistory: [],
            debug: {
                lastHtmlLength,
                lastTitle
            }
        });

        return [];
    },

    async getTmYouthClubs(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `youth:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.youthClubs) return cached.youthClubs;

        const urls = this.getTmHistoryUrlCandidates(tmUrl);

        for (const historyUrl of urls) {
            await this.throttle();

            const html = await this.fetchUrl(historyUrl);
            const doc = this.parseHtml(html);
            const youthClubs = this.extractYouthClubs(doc);

            if (youthClubs.length) {
                this.setCache(key, {
                    tmId,
                    historyUrl,
                    youthClubs
                });

                return youthClubs;
            }
        }

        this.setCache(key, {
            tmId,
            youthClubs: []
        });

        return [];
    },

    extractYouthClubs(doc) {
        const lines = (doc.body?.innerText || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        const result = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();

            if (line !== 'youth clubs' && line !== 'jugendvereine') continue;

            const next = [];

            for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
                const value = lines[j];
                const lower = value.toLowerCase();

                if (
                    lower.includes('stats') ||
                    lower.includes('career') ||
                    lower.includes('national team') ||
                    lower.includes('similar players') ||
                    lower.includes('transfer history') ||
                    lower.includes('market value')
                ) {
                    break;
                }

                if (value.length >= 3) next.push(value);
            }

            next.join(', ')
                .split(',')
                .map(x => this.normalizeText(x))
                .filter(Boolean)
                .forEach(x => result.push(x));
        }

        const seen = new Set();

        return result.filter(x => {
            const key = x.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    extractTransferHistory(doc) {
        const normalize = value => this.normalizeText(value);

        const isTransferText = text => {
            const t = String(text || '').toLowerCase();

            return (
                /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(t) ||
                /\b\d{2}\/\d{2}\b/.test(t) ||
                t.includes('free transfer') ||
                t.includes('loan transfer') ||
                t.includes('end of loan') ||
                t.includes('transfer') ||
                t.includes('€')
            );
        };

        const rows = [];

        [...doc.querySelectorAll('table')].forEach(table => {
            const tableText = normalize(table.innerText).toLowerCase();

            const looksLikeHistory =
                tableText.includes('transfer history') ||
                tableText.includes('season') ||
                tableText.includes('date') ||
                tableText.includes('left') ||
                tableText.includes('joined') ||
                tableText.includes('fee') ||
                tableText.includes('free transfer') ||
                tableText.includes('loan transfer');

            if (!looksLikeHistory) return;

            [...table.querySelectorAll('tbody tr, tr')].forEach(tr => {
                const cells = [...tr.querySelectorAll('td, th')]
                    .map(td => normalize(td.innerText))
                    .filter(Boolean);

                const rowText = normalize(tr.innerText);

                if (!rowText || rowText.length < 8) return;

                const lower = rowText.toLowerCase();

                if (
                    lower === 'season date left joined mv fee' ||
                    lower.includes('season date left joined')
                ) {
                    return;
                }

                if (!isTransferText(rowText)) return;

                rows.push({
                    text: rowText,
                    cells,
                    source: 'table'
                });
            });
        });

        const gridCandidates = [...doc.querySelectorAll(
            '[class*="transfer-history"], [class*="tm-player-transfer-history"], [class*="grid"]'
        )].filter(el => {
            const text = normalize(el.innerText).toLowerCase();

            return text.includes('season') &&
                (
                    text.includes('joined') ||
                    text.includes('left') ||
                    text.includes('fee') ||
                    text.includes('free transfer') ||
                    text.includes('loan transfer')
                );
        });

        gridCandidates.forEach(grid => {
            const lines = (grid.innerText || '')
                .split('\n')
                .map(normalize)
                .filter(Boolean)
                .filter(line => {
                    const lower = line.toLowerCase();

                    return ![
                        'transfer history',
                        'season',
                        'date',
                        'left',
                        'joined',
                        'mv',
                        'fee'
                    ].includes(lower);
                });

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const looksLikeSeason =
                    /^\d{2}\/\d{2}$/.test(line) ||
                    /^\d{4}$/.test(line);

                const nextLines = lines.slice(i + 1, i + 10);
                const hasDateSoon = nextLines.some(x =>
                    /\d{1,2}[./-]\d{1,2}[./-]\d{4}/.test(x)
                );

                if (!looksLikeSeason || !hasDateSoon) continue;

                let j = i + 1;

                while (j < lines.length) {
                    const nextSeason =
                        j > i + 1 &&
                        (
                            /^\d{2}\/\d{2}$/.test(lines[j]) ||
                            /^\d{4}$/.test(lines[j])
                        );

                    if (nextSeason) break;

                    j++;
                }

                const cells = lines.slice(i, j);
                const rowText = cells.join(' | ');

                if (isTransferText(rowText)) {
                    rows.push({
                        text: rowText,
                        cells,
                        source: 'grid'
                    });
                }

                i = j - 1;
            }
        });

        if (!rows.length) {
            [...doc.querySelectorAll('tr, li, div')].forEach(el => {
                const text = normalize(el.innerText);

                if (!text || text.length < 15 || text.length > 500) return;
                if (!isTransferText(text)) return;

                const lower = text.toLowerCase();

                if (
                    !lower.includes('free transfer') &&
                    !lower.includes('loan') &&
                    !lower.includes('transfer') &&
                    !lower.includes('€')
                ) {
                    return;
                }

                rows.push({
                    text,
                    cells: text.split('|').map(normalize).filter(Boolean),
                    source: 'fallback'
                });
            });
        }

        const seen = new Set();
        const unique = [];

        rows.forEach(row => {
            const key = normalize(row.text).toLowerCase();

            if (!key || seen.has(key)) return;

            seen.add(key);
            unique.push(row);
        });

        return unique.slice(0, 40);
    },

    async getTmRumors(tmUrlRaw) {
        const tmUrl = this.normalizeTransfermarktUrl(tmUrlRaw);
        const tmId = this.extractTmId(tmUrl);

        if (!tmId) return [];

        const key = `rumors:${tmId}`;
        const cached = this.getCache(key);

        if (cached?.rumors) return cached.rumors;

        const rumorUrl = tmUrl.replace('/profil/', '/geruechte/');

        await this.throttle();

        const html = await this.fetchUrl(rumorUrl);
        const doc = this.parseHtml(html);
        const rumors = this.extractRumors(doc);

        this.setCache(key, {
            tmId,
            rumorUrl,
            rumors
        });

        return rumors;
    },

    extractRumors(doc) {
        const normalize = value => this.normalizeText(value);
        const dateRe = /\d{1,2}[./-]\d{1,2}[./-]20\d{2}/g;

        const isHeaderText = text => {
            const t = String(text || '').toLowerCase();

            return (
                t.includes('interested club') &&
                (
                    t.includes('most recent source') ||
                    t.includes('last reply') ||
                    t.includes('user assessment') ||
                    t.includes('verein_id')
                )
            );
        };

        const cleanCell = value => {
            return normalize(value)
                .replace(/\bverein_id\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const rows = [...doc.querySelectorAll('table tbody tr, table tr')];
        const rumors = [];

        rows.forEach(tr => {
            const cells = [...tr.querySelectorAll('td, th')]
                .map(td => cleanCell(td.innerText))
                .filter(Boolean);

            const rowText = normalize(cells.length ? cells.join(' | ') : tr.innerText);

            if (!rowText) return;
            if (rowText.length < 4) return;
            if (isHeaderText(rowText)) return;

            const lower = rowText.toLowerCase();

            if (
                lower === 'club' ||
                lower === 'date' ||
                lower === 'source' ||
                lower === 'rumour' ||
                lower === 'probability'
            ) {
                return;
            }

            const dates = rowText.match(dateRe) || [];
            const dateInfo = this.extractDateFromText(dates[0] || rowText);

            const clubLink = [...tr.querySelectorAll('a[href]')].find(a => {
                const href = a.getAttribute('href') || '';
                return /\/verein\/\d+|verein_id=\d+/i.test(href);
            });

            let club = cleanCell(clubLink?.innerText || '');

            if (!club) {
                club = cells.find(c => {
                    const cLower = c.toLowerCase();

                    if (isHeaderText(cLower)) return false;
                    if (dateRe.test(c)) return false;
                    if (c === '-') return false;
                    if (/^\d+%?$/.test(c)) return false;
                    if (cLower.includes('source')) return false;
                    if (cLower.includes('reply')) return false;
                    if (cLower.includes('assessment')) return false;

                    return /[A-Za-zА-Яа-яЁё]/.test(c);
                }) || '';
            }

            if (!club && !dateInfo.dateText) return;

            const usefulCells = cells.filter(c => {
                if (!c) return false;
                if (isHeaderText(c)) return false;
                return true;
            });

            const textParts = [];

            if (club) textParts.push(club);
            if (dateInfo.dateText) textParts.push(dateInfo.dateText);

            const raw = usefulCells.join(' | ');

            rumors.push({
                text: textParts.length ? textParts.join(' · ') : raw,
                club,
                dateText: dateInfo.dateText,
                dateTs: dateInfo.dateTs,
                cells: usefulCells,
                rawText: raw
            });
        });

        const seen = new Set();
        const unique = [];

        rumors.forEach(r => {
            const key = normalize(`${r.club || ''}|${r.dateText || ''}|${r.rawText || r.text || ''}`).toLowerCase();

            if (!key || seen.has(key)) return;

            seen.add(key);
            unique.push(r);
        });

        return unique.slice(0, 12);
    },

    extractDateFromText(text) {
        const value = String(text || '');

        const datePatterns = [
            /(\d{1,2}\/\d{1,2}\/20\d{2})/,
            /(\d{1,2}\.\d{1,2}\.20\d{2})/,
            /(\d{1,2}-\d{1,2}-20\d{2})/
        ];

        for (const re of datePatterns) {
            const m = value.match(re);

            if (m) {
                const raw = m[1];
                const parts = raw.split(/[./-]/).map(Number);

                if (parts.length === 3) {
                    const [d, mo, y] = parts;
                    const ts = new Date(y, mo - 1, d).getTime();

                    return {
                        dateText: raw,
                        dateTs: Number.isFinite(ts) ? ts : null
                    };
                }
            }
        }

        return {
            dateText: '',
            dateTs: null
        };
    },

    formatMoney(value) {
        const n = Number(value || 0);

        if (!n) return '?';

        if (n >= 1000000) {
            const v = n / 1000000;
            return `€${v >= 10 ? v.toFixed(0) : v.toFixed(1)}m`;
        }

        if (n >= 1000) {
            return `€${Math.round(n / 1000)}k`;
        }

        return `€${n}`;
    }
};
// ============================================================
// <<< src/modules/transfer-analyzer/tm-enrichment-layer.js


// >>> src/modules/transfer-analyzer/slf-alter-layer.js
// 13. SLF Alter Layer
// ============================================================

const SLFAlterLayer = {
    cacheKey: 'slf_alter_cache_v3',
    cacheTtlMs: 1000 * 60 * 60 * 24 * (CONFIG.TRANSFER_ANALYZER?.slfAlter?.cacheTtlDays || 1),

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (e) {
            console.warn('[SLF Alter] cache save failed', e);
        }
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    getCache(key) {
        const cache = this.loadCache();
        const item = cache[key];

        if (!item) return null;

        const fetchedAt = Number(item.fetchedAt || 0);

        if (!fetchedAt || Date.now() - fetchedAt > this.cacheTtlMs) return null;

        return item;
    },

    peekByPlayerId(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return null;

        return this.getCache(`alter:${id}`);
    },

    setCache(key, value) {
        const cache = this.loadCache();

        cache[key] = {
            ...value,
            fetchedAt: Date.now()
        };

        this.saveCache(cache);
    },

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    toNumber(value) {
        const m = String(value || '')
            .replace(',', '.')
            .match(/-?\d+(?:\.\d+)?/);

        if (!m) return null;

        const n = Number(m[0]);

        return Number.isFinite(n) ? n : null;
    },

    async fetchAlterHtml(playerId) {
        const id = String(playerId || '').trim();

        if (!id) throw new Error('empty_player_id');

        const url = buildSlfUrl(`/alter.php?id=${encodeURIComponent(id)}`);
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`alter_http_${response.status}`);
        }

        return {
            url,
            html: await response.text()
        };
    },

    async getByPlayerId(playerId) {
        const id = String(playerId || '').trim();

        if (!id) return null;

        const key = `alter:${id}`;
        const cached = this.getCache(key);

        if (cached) return cached;

        const { url, html } = await this.fetchAlterHtml(id);
        const parsed = this.parse(html, id, url);

        this.setCache(key, parsed);

        return parsed;
    },

    parse(html, playerId, url) {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        const bodyText = this.normalizeText(doc.body?.innerText || doc.body?.textContent || '');

        const basic = this.parseAgeTalentSkill(bodyText);
        const skillData = this.parseSkillTables(doc);
        const rows = this.parseSeasonStatRows(doc);

        return this.buildAnalysis({
            playerId: String(playerId || ''),
            url,
            age: basic.age,
            talent: basic.talent,
            currentSkill: basic.currentSkill,
            seasonSkills: skillData.seasonSkills,
            seasonSkill: skillData.seasonSkill,
            talentSkill: skillData.talentSkill,
            classSkill: skillData.classSkill,
            finalSkill: skillData.finalSkill,
            rows
        });
    },

    parseAgeTalentSkill(text) {
        const m = String(text || '').match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,3}(?:[.,]\d+)?)\b/);

        if (!m) {
            return {
                age: null,
                talent: null,
                currentSkill: null
            };
        }

        return {
            age: Number(m[1]),
            talent: Number(m[2]),
            currentSkill: Number(String(m[3]).replace(',', '.'))
        };
    },

    parseSkillTables(doc) {
        const tables = [...doc.querySelectorAll('table.ai_skill')];
        const seasonSkills = [];
        let seasonSkill = null;
        let talentSkill = null;
        let classSkill = null;
        let finalSkill = null;

        tables.forEach((table, tableIndex) => {
            [...table.querySelectorAll('tr')].forEach(tr => {
                const cells = [...tr.querySelectorAll('td, th')]
                    .map(td => this.normalizeText(td.innerText || td.textContent || ''));

                const label = String(cells[0] || '').toLowerCase();
                const value = this.toNumber(cells[cells.length - 1]);

                if (/^\d{2}\/\d{2}$/.test(cells[0] || '') && value != null) {
                    seasonSkills.push({
                        season: cells[0],
                        skill: value
                    });

                    return;
                }

                if (label === 'скилл' && value != null) {
                    if (tableIndex === 0) seasonSkill = value;
                    else talentSkill = value;
                }

                if (label.includes('класс') && value != null) {
                    classSkill = value;
                }

                if (label.includes('итог') && value != null) {
                    finalSkill = value;
                }
            });
        });

        return {
            seasonSkills,
            seasonSkill,
            talentSkill,
            classSkill,
            finalSkill
        };
    },

    parseGames(text) {
        const m = String(text || '').match(/(\d+)\s*\/\s*(\d+)/);

        return {
            played: m ? Number(m[1]) : null,
            possible: m ? Number(m[2]) : null
        };
    },

    parseMinutes(text) {
        const clean = this.normalizeText(text);
        const pctMatch = clean.match(/(\d{1,3})\s*%/);
        const nums = [...clean.matchAll(/\d+/g)].map(x => Number(x[0]));

        return {
            minutesText: clean,
            minutesPct: pctMatch ? Number(pctMatch[1]) : null,
            minutes: nums.length >= 2 ? nums[1] : (pctMatch ? null : (nums[0] ?? null))
        };
    },

    parseAiStatRow(tr, season) {
        const cells = [...tr.querySelectorAll('td, th')]
            .map(td => this.normalizeText(td.innerText || td.textContent || ''));

        const rowText = cells.join(' | ');

        if (!rowText.trim()) return null;
        if (/Лига\s*\|\s*Команда\s*\|\s*Игр/i.test(rowText)) return null;

        const leagueText = cells[1] || '';
        const teamText = cells[2] || '';
        const gamesText = cells[3] || '';
        const startsText = cells[4] || '';
        const minutesText = cells[5] || '';
        const goalsText = cells[6] || '';
        const assistsText = cells[7] || '';

        const leagueMatch = leagueText.match(/(\d+)\s*\/\s*(\d+)/);
        const games = this.parseGames(gamesText);
        const minutes = this.parseMinutes(minutesText);

        if (!leagueText && games.played == null && minutes.minutesPct == null) return null;

        return {
            season: season?.actualYear ?? null,
            seasonLabel: season?.label || '',
            seasonActualYear: season?.actualYear ?? null,
            seasonStartYear: season?.startYear ?? null,
            seasonEndYear: season?.endYear ?? null,
            isCurrentSeason: season?.isCurrent === true,
            rawCells: cells,
            rowText,

            leagueText,
            leagueLevel: leagueMatch ? Number(leagueMatch[1]) : null,
            leagueSkill: leagueMatch ? Number(leagueMatch[2]) : null,

            teamText,

            gamesPlayed: games.played,
            gamesPossible: games.possible,

            starts: this.toNumber(startsText),

            minutes: minutes.minutes,
            minutesPct: minutes.minutesPct,

            goals: this.toNumber(goalsText),
            assists: this.toNumber(assistsText)
        };
    },


    parseSeasonHeader(text) {
        const clean = this.normalizeText(text);
        const isCurrent = /текущ/i.test(clean);

        const range = clean.match(/^Сезон\s+(\d{4})\s*\/\s*(\d{4})/i);

        if (range) {
            return {
                label: `Сезон ${range[1]}/${range[2]}`,
                startYear: Number(range[1]),
                endYear: Number(range[2]),
                actualYear: Number(range[2]),
                seasonYear: Number(range[2]),
                isCurrent
            };
        }

        const single = clean.match(/^Сезон\s+(\d{4})/i);

        if (single) {
            return {
                label: `Сезон ${single[1]}`,
                startYear: Number(single[1]),
                endYear: Number(single[1]),
                actualYear: Number(single[1]),
                seasonYear: Number(single[1]),
                isCurrent
            };
        }

        return null;
    },

    parseSeasonStatRows(doc) {
        const result = [];

        let currentSeason = null;

        [...doc.body.querySelectorAll('*')].forEach(el => {
            const text = this.normalizeText(el.innerText || el.textContent || '');

            const seasonHeader = text.length < 120
                ? this.parseSeasonHeader(text)
                : null;

            if (seasonHeader) {
                currentSeason = seasonHeader;
                return;
            }

            if (el.matches && el.matches('table.ai_stat')) {
                [...el.querySelectorAll('tr')]
                    .map(tr => this.parseAiStatRow(tr, currentSeason))
                    .filter(Boolean)
                    .forEach(row => {
                        result.push(row);
                    });
            }
        });

        return result;
    },

    getPracticeStatus(age, minutes) {
        const ageNumber = Number(age || 0);
        const minuteNumber = Number(minutes || 0);

        if (minuteNumber <= 0) {
            return {
                label: 'Не играет',
                level: 'risk',
                score: -3
            };
        }

        if (ageNumber <= 18) {
            if (minuteNumber >= 500) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (ageNumber <= 20) {
            if (minuteNumber >= 1200) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 500) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (ageNumber <= 22) {
            if (minuteNumber >= 1800) return { label: 'Практика', level: 'good', score: 4 };
            if (minuteNumber >= 900) return { label: 'Ротация', level: 'normal', score: 2 };
            if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
            return { label: 'Не играет', level: 'risk', score: -2 };
        }

        if (minuteNumber >= 2500) return { label: 'Основа', level: 'good', score: 4 };
        if (minuteNumber >= 900) return { label: 'Ротация', level: 'normal', score: 2 };
        if (minuteNumber >= 300) return { label: 'Эпизодически', level: 'watch', score: 1 };
        return { label: 'Не играет', level: 'risk', score: -2 };
    },

    sumMinutes(rows) {
        return (rows || []).reduce((sum, row) => sum + Number(row?.minutes || 0), 0);
    },

    buildAnalysis(data) {
        const eligiblePct = CONFIG.TRANSFER_ANALYZER?.slfAlter?.eligibleMinutesPct || 40;
        const rows = Array.isArray(data.rows) ? data.rows : [];
        const calendarYear = new Date().getFullYear();

        const statRows = rows.filter(row =>
            row &&
            row.seasonActualYear &&
            row.minutes != null
        );

        const validRows = rows.filter(row =>
            row &&
            row.season &&
            row.gamesPossible != null &&
            row.minutesPct != null
        );

        const leagueRows = validRows.filter(row =>
            row.leagueLevel != null &&
            row.leagueSkill != null
        );

        const markedCurrentAllRows = statRows.filter(row => row.isCurrentSeason === true);
        const fallbackCurrentAllRows = markedCurrentAllRows.length
            ? []
            : statRows.filter(row => Number(row.seasonActualYear || row.season || 0) === calendarYear);
        const currentSeasonRows = markedCurrentAllRows.length ? markedCurrentAllRows : fallbackCurrentAllRows;

        const currentSeasonYear = currentSeasonRows.length
            ? Number(currentSeasonRows[0].seasonActualYear || currentSeasonRows[0].season || 0)
            : null;

        const currentSeasonLabel = currentSeasonRows[0]?.seasonLabel || '';

        const markedCurrentLeagueRows = leagueRows.filter(row =>
            currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
        );

        const currentRow = this.pickBestRow(markedCurrentLeagueRows);
        const currentSeasonMinutes = currentSeasonRows.length ? this.sumMinutes(currentSeasonRows) : 0;
        const practiceStatus = this.getPracticeStatus(data.age, currentSeasonMinutes);

        const eligibleRows = leagueRows.filter(row => Number(row.minutesPct || 0) >= eligiblePct);
        const currentEligibleRows = eligibleRows.filter(row =>
            currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
        );
        const pastEligibleRows = eligibleRows.filter(row =>
            !currentSeasonYear || Number(row.seasonActualYear || row.season || 0) !== currentSeasonYear
        );

        const bestEligibleRow = this.pickBestRow(eligibleRows);
        const currentEligibleRow = this.pickBestRow(currentEligibleRows);
        const pastEligibleRow = this.pickBestRow(pastEligibleRows);

        const talent = Number(data.talent || 0);
        const currentSkill = Number(data.currentSkill || 0);
        const finalSkill = data.finalSkill != null ? Number(data.finalSkill) : null;

        const talentUpgradeRows = eligibleRows.filter(row =>
            talent &&
            row.leagueLevel != null &&
            Number(row.leagueLevel) > talent
        );

        const currentTalentUpgradeRow = this.pickBestRow(
            talentUpgradeRows.filter(row =>
                currentSeasonYear && Number(row.seasonActualYear || row.season || 0) === currentSeasonYear
            )
        );

        const pastTalentUpgradeRow = this.pickBestRow(
            talentUpgradeRows.filter(row =>
                !currentSeasonYear || Number(row.seasonActualYear || row.season || 0) !== currentSeasonYear
            )
        );

        const talentUpgradeRow = currentTalentUpgradeRow || pastTalentUpgradeRow || null;

        const lastSeasonYear = statRows.length
            ? Math.max(...statRows.map(row => Number(row.seasonActualYear || row.season || 0)))
            : null;

        const activeRows = statRows.filter(row => Number(row.minutes || 0) > 0);
        const lastActiveSeasonActualYear = activeRows.length
            ? Math.max(...activeRows.map(row => Number(row.seasonActualYear || row.season || 0)))
            : null;
        const lastActiveSeasonRows = lastActiveSeasonActualYear
            ? activeRows.filter(row => Number(row.seasonActualYear || row.season || 0) === lastActiveSeasonActualYear)
            : [];
        const lastActiveSeasonLabel = lastActiveSeasonRows[0]?.seasonLabel || '';
        const lastActiveSeasonMinutes = this.sumMinutes(lastActiveSeasonRows);

        const hasCurrentSeason = currentSeasonRows.length > 0;
        const isCurrentSeasonActive = currentSeasonMinutes > 0;

        const skillDelta = finalSkill != null && currentSkill
            ? finalSkill - currentSkill
            : null;

        return {
            playerId: data.playerId,
            url: data.url,

            currentSeasonYear,
            currentSeasonLabel,
            currentSeasonMinutes,
            practiceStatus,
            lastSeasonYear,
            lastActiveSeasonLabel,
            lastActiveSeasonActualYear,
            lastActiveSeasonMinutes,
            hasCurrentSeason,
            isCurrentSeasonActive,
            staleActivity: !hasCurrentSeason || currentSeasonMinutes <= 0,

            age: data.age,
            talent: data.talent,
            currentSkill: data.currentSkill,
            finalSkill,
            skillDelta,
            seasonSkill: data.seasonSkill,
            talentSkill: data.talentSkill,
            classSkill: data.classSkill,
            seasonSkills: data.seasonSkills || [],

            rows: validRows,
            leagueRows,
            currentRow,
            bestEligibleRow,
            currentEligibleRow,
            pastEligibleRow,

            hasCurrent40: !!currentEligibleRow,
            hasPast40: !!pastEligibleRow,

            talentUpgradeEligible: !!talentUpgradeRow,
            talentUpgradeRow,
            currentTalentUpgradeRow,
            pastTalentUpgradeRow,

            leagueAboveSkill: !!currentRow &&
                currentSkill &&
                Number(currentRow.leagueSkill || 0) > Number(currentSkill)
        };
    },

    pickBestRow(rows) {
        const list = Array.isArray(rows) ? rows.filter(Boolean) : [];

        if (!list.length) return null;

        return list.slice().sort((a, b) => {
            return Number(b.seasonActualYear || b.season || 0) - Number(a.seasonActualYear || a.season || 0) ||
                Number(b.minutesPct || 0) - Number(a.minutesPct || 0) ||
                Number(b.leagueSkill || 0) - Number(a.leagueSkill || 0) ||
                Number(b.gamesPlayed || 0) - Number(a.gamesPlayed || 0);
        })[0];
    },

    formatSkill(value) {
        if (value == null || !Number.isFinite(Number(value))) return '?';

        const n = Number(value);

        return Number.isInteger(n) ? String(n) : n.toFixed(2);
    },

    formatDelta(value) {
        if (value == null || !Number.isFinite(Number(value))) return '';

        const n = Number(value);
        const sign = n >= 0 ? '+' : '';

        return `${sign}${n.toFixed(2)}`;
    }
};

// ============================================================
// <<< src/modules/transfer-analyzer/slf-alter-layer.js


// >>> src/modules/transfer-analyzer/transfer-market-analyzer.js
// 14. Transfer Market Analyzer
// ============================================================

const TransferMarketAnalyzer = {
    analysisCacheKey: 'slf_transfer_analysis_row_cache_v1',
    analysisCacheTtlMs: 1000 * 60 * 60 * 24 * 14,
    marketBaseline: null,
    marketBaselinePromise: null,

    isTransferDetailPage() {
        if (!location.pathname.includes('/transfers.php')) return false;

        const params = new URLSearchParams(location.search);
        return params.get('action') === 'view' && !!params.get('transfer_id');
    },

    isPage() {
        // Transfer detail pages are not list/analysis pages.
        // Do not mount analyzer UI, hydration, tooltips, observers or requests there.
        return location.pathname.includes('/transfers.php') && !this.isTransferDetailPage();
    },

    isHistoryPage() {
        return location.pathname.includes('/transfers.php') &&
            !this.isTransferDetailPage() &&
            new URLSearchParams(location.search).get('action') === 'history';
    },

    start() {
        if (!this.isPage()) return;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.mount());
        } else {
            this.mount();
        }

        window.addEventListener('load', () => this.mount());
        setTimeout(() => this.mount(), 800);
        setTimeout(() => this.mount(), 2000);
        setTimeout(() => this.mount(), 4000);
    },

    mount() {
        if (!this.isPage()) return;

        console.log('[SLF Transfer Analyzer] mount on transfers.php');

        this.addToolbar();

        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps()
                .catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }

        this.renderCachedRows();
        this.loadMarketBaseline()
            .then(() => this.renderCachedRows())
            .catch(error => console.warn('[SLF Transfer Analyzer] market baseline load failed', error));
    },

    getCfg() {
        return CONFIG.TRANSFER_ANALYZER || {};
    },

    normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    normalizeLower(value) {
        return this.normalizeText(value).toLowerCase();
    },

    isWrapperTable(table) {
        if (!table) return true;

        const id = String(table.id || '').toLowerCase();
        const cls = String(table.className || '').toLowerCase();

        if (id === 'globalcontent') return true;
        if (cls.includes('game-ui__background')) return true;

        const nestedTables = table.querySelectorAll('table').length;
        const rows = table.querySelectorAll('tr').length;

        if (nestedTables >= 3 && rows > 20) return true;

        return false;
    },

    getPlayerLinksIn(table) {
        if (!table) return [];

        return [...table.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });
    },

    scoreTransferTable(table) {
        if (!table || this.isWrapperTable(table)) return -999;

        const text = this.normalizeLower(table.innerText);
        const rows = [...table.querySelectorAll('tr')];
        const playerLinks = this.getPlayerLinksIn(table);
        const nestedTables = table.querySelectorAll('table').length;

        const headerScore =
            (text.includes('амплуа') ? 4 : 0) +
            (text.includes('фамилия') || text.includes('имя') ? 4 : 0) +
            (text.includes('цена') ? 3 : 0) +
            (text.includes('тал') ? 1 : 0) +
            (text.includes('воз') ? 1 : 0) +
            (text.includes('пот') ? 1 : 0) +
            (text.includes('дата') || text.includes('оконч') ? 1 : 0);

        const playerScore = Math.min(playerLinks.length, 20) * 3;

        const sizePenalty =
            rows.length > 80 ? 20 :
            rows.length > 40 ? 8 :
            0;

        const nestedPenalty =
            nestedTables > 0 ? nestedTables * 2 : 0;

        return headerScore + playerScore - sizePenalty - nestedPenalty;
    },

    findTransferTable() {
        const tables = [...document.querySelectorAll('table')];

        const candidates = tables
            .map(table => ({
                table,
                score: this.scoreTransferTable(table),
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                playerLinks: this.getPlayerLinksIn(table).length,
                id: table.id || '',
                cls: String(table.className || ''),
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.score > 0 && x.playerLinks > 0)
            .sort((a, b) => b.score - a.score);

        if (candidates.length) {
            console.log('[SLF Transfer Analyzer] findTransferTable', {
                found: true,
                selected: {
                    score: candidates[0].score,
                    rows: candidates[0].rows,
                    nested: candidates[0].nested,
                    playerLinks: candidates[0].playerLinks,
                    id: candidates[0].id,
                    sample: candidates[0].sample
                },
                candidates: candidates.slice(0, 5).map(x => ({
                    score: x.score,
                    rows: x.rows,
                    nested: x.nested,
                    playerLinks: x.playerLinks,
                    id: x.id,
                    sample: x.sample
                }))
            });

            return candidates[0].table;
        }

        const playerLinks = [...document.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        const tableMap = new Map();

        playerLinks.forEach(a => {
            let node = a;

            while (node && node !== document.body) {
                if (node.tagName && node.tagName.toLowerCase() === 'table') {
                    if (!this.isWrapperTable(node)) {
                        tableMap.set(node, (tableMap.get(node) || 0) + 1);
                        break;
                    }
                }

                node = node.parentElement;
            }
        });

        const fallback = [...tableMap.entries()]
            .map(([table, count]) => ({
                table,
                count,
                rows: table.querySelectorAll('tr').length,
                nested: table.querySelectorAll('table').length,
                sample: this.normalizeLower(table.innerText).slice(0, 220)
            }))
            .filter(x => x.count >= 3)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.rows - b.rows;
            });

        const found = fallback[0]?.table || null;

        console.log('[SLF Transfer Analyzer] findTransferTable fallback', {
            found: !!found,
            fallback: fallback.slice(0, 5).map(x => ({
                count: x.count,
                rows: x.rows,
                nested: x.nested,
                sample: x.sample
            }))
        });

        return found;
    },

    loadAnalysisCache() {
        try {
            return JSON.parse(localStorage.getItem(this.analysisCacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveAnalysisCache(cache) {
        try {
            const entries = Object.entries(cache || {})
                .filter(([, value]) => value && Number(value.savedAt || 0))
                .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
                .slice(0, 700);

            localStorage.setItem(this.analysisCacheKey, JSON.stringify(Object.fromEntries(entries)));
        } catch (e) {
            console.warn('[SLF Transfer Analyzer] analysis cache save failed', e);
        }
    },

    clearAnalysisCache() {
        localStorage.removeItem(this.analysisCacheKey);
    },

    buildAnalysisCacheKeys(row, enriched) {
        const keys = [];
        const playerId = String(row?.playerId || enriched?.playerId || '').trim();
        const tmId = String(enriched?.tmProfile?.tmId || row?.tmProfile?.tmId || '').trim();

        if (playerId) keys.push(`slf:${playerId}`);
        if (tmId) keys.push(`tm:${tmId}`);

        return [...new Set(keys)];
    },

    getCachedAnalysis(row) {
        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, null);

        for (const key of keys) {
            const item = cache[key];
            if (!item) continue;

            const savedAt = Number(item.savedAt || 0);
            if (!savedAt || Date.now() - savedAt > this.analysisCacheTtlMs) continue;

            // 4.4.72: MKT must be based on alter.php final skill.
            // Old row-analysis cache without finalSkill is intentionally ignored
            // so pressing Analyze fetches/uses SLFAlterLayer instead of silently
            // reusing current-skill based MKT output.
            if (!item.slfAlter || item.slfAlter.finalSkill == null) continue;

            return item;
        }

        return null;
    },

    saveRowAnalysis(row, enriched, slfAlter) {
        if (!row?.playerId) return;

        const cache = this.loadAnalysisCache();
        const keys = this.buildAnalysisCacheKeys(row, enriched);
        const item = {
            schema: 'transfer_row_analysis_cache_v1',
            savedAt: Date.now(),
            playerId: String(row.playerId || ''),
            name: row.name || '',
            tmResult: enriched || null,
            slfAlter: slfAlter || null,
            row: {
                playerId: String(row.playerId || ''),
                playerUrl: row.playerUrl || '',
                name: row.name || '',
                positions: row.positions || [],
                age: row.age ?? null,
                talent: row.talent ?? null,
                scoutSkill: row.scoutSkill ?? null,
                slfPriceText: row.slfPriceText || row.salePriceText || '',
                slfPriceCellText: row.slfPriceCellText || '',
                slfPrice: row.slfPrice ?? row.salePrice ?? null,
                slfSecondaryPriceText: row.slfSecondaryPriceText || '',
                slfSecondaryPrice: row.slfSecondaryPrice ?? null,
                nominalRatio: row.nominalRatio ?? null,
                nominalBase: row.nominalBase ?? null,
                slfPriceSource: row.slfPriceSource || ''
            }
        };

        keys.forEach(key => {
            cache[key] = item;
        });

        this.saveAnalysisCache(cache);
    },

    applyCachedAnalysis(row, cached) {
        if (!row || !cached) return false;

        const savedRow = cached.row || {};
        row.tmUrl = cached.tmResult?.tmUrl || cached.tmResult?.tmProfile?.tmUrl || '';
        row.tmProfile = cached.tmResult?.tmProfile || null;
        row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
        row.slfAlter = cached.slfAlter || null;
        row.slfPrice = row.slfPrice ?? savedRow.slfPrice ?? null;
        row.slfPriceText = row.slfPriceText || savedRow.slfPriceText || '';
        row.slfPriceCellText = row.slfPriceCellText || savedRow.slfPriceCellText || '';
        row.slfSecondaryPriceText = row.slfSecondaryPriceText || savedRow.slfSecondaryPriceText || '';
        row.slfSecondaryPrice = row.slfSecondaryPrice ?? savedRow.slfSecondaryPrice ?? null;
        row.nominalRatio = row.nominalRatio ?? savedRow.nominalRatio ?? null;
        row.nominalBase = row.nominalBase ?? savedRow.nominalBase ?? null;
        row.slfPriceSource = row.slfPriceSource || savedRow.slfPriceSource || '';

        this.renderRowBadge(row, cached.tmResult || null, cached.slfAlter || null);
        return true;
    },

    loadMarketBaseline() {
        if (this.marketBaseline) return Promise.resolve(this.marketBaseline);
        if (this.marketBaselinePromise) return this.marketBaselinePromise;

        this.marketBaselinePromise = Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY)
            .then(({ data }) => {
                const rows = normalizeServerRows(data);
                this.marketBaseline = this.buildMarketBaseline(rows);
                return this.marketBaseline;
            })
            .catch(error => {
                this.marketBaseline = { ready: false, error, byKey: {}, generatedAt: Date.now() };
                return this.marketBaseline;
            });

        return this.marketBaselinePromise;
    },

    buildMarketBaseline(rows) {
        const buckets = {};
        const add = (key, value) => {
            if (!key || !value || !Number.isFinite(value)) return;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(value);
        };

        (rows || []).forEach(event => {
            if (!event || event.recordType !== 'completed_transfer') return;

            const price = Number(event.transfer?.price || 0);
            if (!price || price < 1) return;

            const player = event.player || {};
            const pos = this.normalizeMarketPosition(player.primaryPosition || (Array.isArray(player.positions) ? player.positions[0] : ''));
            const ageBucket = this.getMarketAgeBucket(player.age);
            const talentBucket = this.getMarketTalentBucket(player.talent);
            const alterSummary = event.enrichment?.slfAlterSummary || {};
            const finalSkill = player.finalSkill ?? alterSummary.finalSkill ?? null;
            const skillBucket = this.getMarketSkillBucket(finalSkill ?? player.skill ?? player.scoutSkill ?? player.currentSkill);

            add('all', price);
            if (pos) add(`pos:${pos}`, price);
            if (ageBucket) add(`age:${ageBucket}`, price);
            if (skillBucket) add(`skill:${skillBucket}`, price);
            if (pos && ageBucket) add(`pos:${pos}|age:${ageBucket}`, price);
            if (pos && talentBucket) add(`pos:${pos}|talent:${talentBucket}`, price);
            if (pos && skillBucket) add(`pos:${pos}|skill:${skillBucket}`, price);
            if (pos && ageBucket && talentBucket && skillBucket) add(`pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}`, price);
        });

        const byKey = {};
        Object.entries(buckets).forEach(([key, values]) => {
            const sorted = values.slice().sort((a, b) => a - b);
            byKey[key] = this.summarizeMarketValues(sorted);
        });

        return {
            ready: true,
            generatedAt: Date.now(),
            byKey
        };
    },

    summarizeMarketValues(values) {
        const n = values.length;
        const at = pct => values[Math.min(n - 1, Math.max(0, Math.floor((n - 1) * pct)))] || null;
        const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);

        return {
            count: n,
            min: values[0] || null,
            p25: at(0.25),
            median: at(0.50),
            p75: at(0.75),
            max: values[n - 1] || null,
            avg: n ? Math.round(sum / n) : null,
            confidence: n >= 20 ? 'high' : n >= 8 ? 'medium' : n >= 3 ? 'low' : 'weak'
        };
    },

    normalizeMarketPosition(value) {
        const raw = String(value || '').toUpperCase().trim();
        if (!raw) return '';
        if (raw === 'GK') return 'GK';
        if (raw === 'LD' || raw === 'DL' || raw === 'LB') return 'DL';
        if (raw === 'RD' || raw === 'DR' || raw === 'RB') return 'DR';
        if (/^CD|^DC|CB/.test(raw)) return 'DC';
        if (/^DM/.test(raw)) return 'DM';
        if (/^CM/.test(raw)) return 'CM';
        if (/^AM/.test(raw)) return 'AM';
        if (raw === 'LM' || raw === 'LW' || raw === 'ML') return 'ML';
        if (raw === 'RM' || raw === 'RW' || raw === 'MR') return 'MR';
        if (/^ST|CF/.test(raw)) return 'ST';
        return raw;
    },

    getMarketAgeBucket(age) {
        const n = Number(age || 0);
        if (!n) return '';
        if (n <= 18) return 'u18';
        if (n <= 21) return 'u21';
        if (n <= 24) return 'u24';
        if (n <= 29) return 'prime';
        if (n <= 32) return 'short';
        return 'vet';
    },

    getMarketTalentBucket(talent) {
        const n = Number(talent || 0);
        if (!n) return '';
        if (n <= 2) return 't1_2';
        if (n <= 4) return 't3_4';
        if (n <= 6) return 't5_6';
        if (n <= 8) return 't7_8';
        return 't9p';
    },

    getMarketSkillBucket(skill) {
        const n = Number(skill || 0);
        if (!n) return '';
        if (n < 20) return 's00_19';
        if (n < 30) return 's20_29';
        if (n < 40) return 's30_39';
        if (n < 50) return 's40_49';
        if (n < 60) return 's50_59';
        if (n < 70) return 's60_69';
        return 's70p';
    },

    getMarketSkillBasis(row, slfAlter) {
        const finalSkill = slfAlter?.finalSkill != null ? Number(slfAlter.finalSkill) : null;
        const currentSkill = slfAlter?.currentSkill != null ? Number(slfAlter.currentSkill) : null;
        const pageSkill = row?.scoutSkill != null ? Number(row.scoutSkill) : null;

        if (Number.isFinite(finalSkill) && finalSkill > 0) {
            return {
                skill: finalSkill,
                source: 'alter_final_skill',
                label: `ИТОГ alter.php ${SLFAlterLayer.formatSkill(finalSkill)}`,
                currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
                pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
                lowConfidence: false,
                missing: false
            };
        }

        return {
            skill: null,
            source: slfAlter ? 'alter_without_final_skill' : 'alter_missing',
            label: slfAlter ? 'ИТОГ alter.php не распознан' : 'alter.php не загружен',
            currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
            pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
            lowConfidence: true,
            missing: true
        };
    },

    findMarketBaseline(row, slfAlter) {
        const baseline = this.marketBaseline;
        if (!baseline?.ready) return null;

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const pos = this.normalizeMarketPosition((row.positions || [])[0]);
        const ageBucket = this.getMarketAgeBucket(row.age);
        const talentBucket = this.getMarketTalentBucket(row.talent);
        const skillBucket = this.getMarketSkillBucket(skillBasis.skill);
        const keys = [
            pos && ageBucket && talentBucket && skillBucket ? `pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}` : '',
            pos && skillBucket ? `pos:${pos}|skill:${skillBucket}` : '',
            pos && ageBucket ? `pos:${pos}|age:${ageBucket}` : '',
            pos && talentBucket ? `pos:${pos}|talent:${talentBucket}` : '',
            pos ? `pos:${pos}` : '',
            skillBucket ? `skill:${skillBucket}` : '',
            ageBucket ? `age:${ageBucket}` : '',
            'all'
        ].filter(Boolean);

        for (const key of keys) {
            const item = baseline.byKey?.[key];
            if (item && item.count >= 3) {
                return Object.assign({ key }, item);
            }
        }

        return null;
    },

    addToolbar() {
        if (document.getElementById('slf-transfer-analyzer-toolbar')) return;

        const table = this.findTransferTable();

        if (!table) {
            console.warn('[SLF Transfer Analyzer] transfer table not found');
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.id = 'slf-transfer-analyzer-toolbar';
        toolbar.style.cssText = `
            margin:8px 0;
            padding:8px;
            background:#181818;
            border:1px solid #444;
            border-radius:5px;
            color:#ddd;
            font-size:12px;
            display:flex;
            gap:8px;
            align-items:center;
            flex-wrap:wrap;
        `;

        const historyMode = this.isHistoryPage();

        if (historyMode) {
            toolbar.innerHTML = `
                <b style="color:#7cff7c;">SLF Transfer Analyzer</b> <span style="color:#888;">history VPS sync</span>
                <button id="slf-transfer-analyze-visible">Анализировать видимых</button>
                <button id="slf-transfer-reset-order">Сброс порядка</button>
                <span id="slf-transfer-status" style="color:#aaa;"></span>
            `;

            table.parentNode.insertBefore(toolbar, table);
            document.getElementById('slf-transfer-analyze-visible').onclick = () => this.analyzeVisibleRows();
            document.getElementById('slf-transfer-reset-order').onclick = () => this.resetOrder();
            this.ensureAnalysisHeader(table);
            this.setStatus('History: простой VPS sync UI. MKT/N/details отключены.');
            return;
        }

        toolbar.innerHTML = `
            <b style="color:#7cff7c;">SLF Transfer Analyzer</b> <span style="color:#888;">${historyMode ? 'history collector' : '2-row compact'}</span>
            <button id="slf-transfer-analyze-visible" title="${historyMode ? 'Анализирует видимые состоявшиеся трансферы, хеширует события и отправляет completed_transfer записи на VPS.' : 'Догружает только недостающие TM/SLF данные. Уже найденное берётся из cache.'}">Анализировать видимых</button>
            <button id="slf-transfer-sort-score" title="Сортировка по общей оценке анализатора: зелёные маркеры и сильные SLF/TM сигналы выше, красные риски ниже. Retired/skip всегда просаживают score.">★ score ↓</button>
            <button id="slf-transfer-sort-delta" title="Сортировка по разнице alter.php: ИТОГ минус текущий скилл. Чем больше плюс, тем выше игрок.">SLF Δ ↓</button>
            <button id="slf-transfer-sort-min" title="Сортировка по % минут в текущем сезоне SLF alter.php. Сначала игроки, которые реально играют сейчас.">min% ↓</button>
            <button id="slf-transfer-sort-talent" title="Сортировка по сигналу повышения таланта: лига выше таланта + 40%+ минут. Текущий сезон важнее старых сезонов.">T-up ↓</button>
            <button id="slf-transfer-sort-tm-desc" title="Сортировка по актуальной TM-стоимости от дорогих к дешёвым. Для Retired берётся 0 как текущая ценность, старая цена остаётся только справкой.">TM € ↓</button>
            <button id="slf-transfer-sort-mkt-bargain" title="Сортировка по рыночной выгоде MKT относительно p75: сильнее ниже p75 выше в списке.">MKT bargain ↓</button>
            <button id="slf-transfer-sort-mkt-overpriced" title="Сортировка по переплате MKT относительно p75: сильнее выше p75 выше в списке.">MKT overpriced ↓</button>
            <button id="slf-transfer-reset-order" title="Вернуть исходный порядок строк на странице.">Сброс порядка</button>
            <button id="slf-transfer-clear-cache" title="Очистить TM + SLF alter cache. После этого анализ заново пройдёт игроков на странице.">Сброс cache</button>
            <span id="slf-transfer-status" style="color:#aaa;"></span>
        `;

        table.parentNode.insertBefore(toolbar, table);

        document.getElementById('slf-transfer-analyze-visible').onclick = () => this.analyzeVisibleRows();
        document.getElementById('slf-transfer-sort-score').onclick = () => this.sortByDataset('slfAnalyzerScore', 'desc', 'score');
        document.getElementById('slf-transfer-sort-delta').onclick = () => this.sortByDataset('slfSkillDelta', 'desc', 'SLF Δ');
        document.getElementById('slf-transfer-sort-min').onclick = () => this.sortByDataset('slfMinutesPct', 'desc', 'min%');
        document.getElementById('slf-transfer-sort-talent').onclick = () => this.sortByDataset('slfTalentUp', 'desc', 'T-up');
        document.getElementById('slf-transfer-sort-tm-desc').onclick = () => this.sortByTmValue('desc');
        document.getElementById('slf-transfer-sort-mkt-bargain').onclick = () => this.sortByDataset('slfMktBargain', 'desc', 'MKT bargain');
        document.getElementById('slf-transfer-sort-mkt-overpriced').onclick = () => this.sortByDataset('slfMktOverpriced', 'desc', 'MKT overpriced');
        document.getElementById('slf-transfer-reset-order').onclick = () => this.resetOrder();
        document.getElementById('slf-transfer-clear-cache').onclick = () => {
            TMEnrichmentLayer.clearCache();
            SLFAlterLayer.clearCache();
            this.clearAnalysisCache();
            this.setStatus('TM/SLF/analysis cache очищен.');
        };

        this.ensureAnalysisHeader(table);
        this.setStatus('Готов к анализу.');
    },

    findHeaderRow(table) {
        if (!table) return null;

        return [...table.querySelectorAll('tr')].find(tr => {
            const text = this.normalizeLower(tr.innerText);

            return text.includes('амплуа') &&
                (
                    text.includes('фамилия') ||
                    text.includes('имя')
                );
        }) || null;
    },

    ensureAnalysisHeader(table) {
        const headerRow = this.findHeaderRow(table);

        if (!headerRow) {
            console.warn('[SLF Transfer Analyzer] header row not found');
            return;
        }

        if (headerRow.querySelector('.slf-transfer-analysis-header')) return;

        const cell = document.createElement('td');
        cell.className = 'slf-transfer-analysis-header';
        cell.textContent = this.isHistoryPage() ? 'VPS' : 'TM анализ';
        cell.style.cssText = `
            color:#7cff7c;
            font-weight:bold;
            text-align:center;
            min-width:${this.isHistoryPage() ? '80px' : '0'};
            width:auto;
            border-left:1px solid #444;
            background:#202020;
        `;

        headerRow.appendChild(cell);
    },

    getHeaderMap(table) {
        const headerRow = this.findHeaderRow(table);

        const cells = headerRow
            ? [...headerRow.querySelectorAll('td, th')].map(c => this.normalizeLower(c.innerText))
            : [];

        const find = (...needles) => {
            const normalizedNeedles = needles.map(n => this.normalizeLower(n));

            const idx = cells.findIndex(text => {
                return normalizedNeedles.some(n => text.includes(n));
            });

            return idx >= 0 ? idx : null;
        };

        const map = {
            id: find('#', 'id'),
            pos: find('амплуа'),
            name: find('фамилия', 'имя'),
            club: find('команда', 'клуб'),
            age: find('возраст', 'воз'),
            talent: find('талант', 'тал'),
            potential: find('потенциал', 'пот'),
            scoutSkill: find('скилл', 'ск'),
            price: find('цена', 'сумма'),
            date: find('дата'),
            fromClub: find('откуда'),
            toClub: find('куда'),
            transferSum: find('сумма'),
            sellerManager: find('от кого'),
            buyerManager: find('кому'),
            transferType: find('тип'),
            endDate: find('дата окончания', 'оконч'),
            bids: find('предл', 'став')
        };

        console.log('[SLF Transfer Analyzer] header map', {
            cells,
            map
        });

        return map;
    },

    parseVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseRow(tr, index, map))
            .filter(Boolean);

        console.log('[SLF Transfer Analyzer] parseVisibleRows', parsed);

        return parsed;
    },

    findPlayerLinkInRow(tr) {
        const links = [...tr.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                return /player\.php/i.test(href) && /id=\d+/i.test(href);
            });

        if (!links.length) return null;

        const scored = links
            .map(a => {
                const text = this.normalizeText(a.textContent || '');
                const title = this.normalizeText(a.getAttribute('title') || '');
                const href = a.getAttribute('href') || '';
                const nameCandidate = title || text;

                const hasLetters = /[A-Za-zА-Яа-яЁё]/.test(nameCandidate);
                const hasSpace = /\s/.test(nameCandidate);

                let score = 0;
                if (hasLetters) score += 5;
                if (hasSpace) score += 2;
                if (nameCandidate.length >= 3 && nameCandidate.length <= 40) score += 2;
                if (href.includes('action=view')) score += 1;

                return { a, score, nameCandidate };
            })
            .sort((a, b) => b.score - a.score);

        return scored[0].a;
    },

    cleanPlayerName(raw) {
        let name = this.normalizeText(raw);

        if (!name) return '';

        const parts = name.split(' ').filter(Boolean);

        if (parts.length >= 2) {
            const first = parts[0];
            const lastIndex = parts.length - 1;
            const last = parts[lastIndex];

            if (
                first.length >= 2 &&
                last.endsWith(first) &&
                last.length > first.length
            ) {
                parts[lastIndex] = last.slice(0, -first.length);
                name = parts.join(' ').trim();
            }
        }

        const firstWord = name.split(' ')[0];

        if (
            firstWord &&
            firstWord.length >= 2 &&
            name.endsWith(firstWord) &&
            name.length > firstWord.length * 2
        ) {
            const cut = name.slice(0, -firstWord.length).trim();

            if (cut.includes(' ')) {
                name = cut;
            }
        }

        return name.trim();
    },

    parseRow(tr, index, map) {
        const text = this.normalizeText(tr.innerText);
        const lower = text.toLowerCase();

        if (!text) return null;

        if (
            lower.includes('амплуа') &&
            (
                lower.includes('фамилия') ||
                lower.includes('имя')
            )
        ) {
            return null;
        }

        const cells = [...tr.querySelectorAll('td')];

        if (cells.length < 4) return null;

        const getCell = idx => idx == null ? null : cells[idx] || null;
        const getText = idx => this.normalizeText(getCell(idx)?.innerText || '');

        const playerLink = this.findPlayerLinkInRow(tr);

        if (!playerLink) return null;

        const href = playerLink.getAttribute('href') || '';
        const idFromHref = (href.match(/id=(\d+)/) || [])[1];

        const idText = getText(map.id);
        const idFromCell = (idText.match(/\d{4,}/) || [])[0];
        const idFromRowStart = (text.match(/^(\d{4,})/) || [])[1];

        const playerId = idFromHref || idFromCell || idFromRowStart;

        if (!playerId) return null;

        const linkTitle = this.normalizeText(playerLink.getAttribute('title') || '');
        const linkText = this.normalizeText(playerLink.textContent || '');

        const name = this.cleanPlayerName(linkTitle || linkText || getText(map.name));
        const priceInfo = this.parseTransferPriceCellInfo(tr, map);

        const row = {
            rowEl: tr,
            originalIndex: index,
            playerId: String(playerId),
            playerUrl: buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(playerId)}`),

            name,
            positions: this.parsePositions(getText(map.pos) || text),

            age: this.parseNumber(getText(map.age)),
            talent: this.parseNumber(getText(map.talent)),
            potentialText: getText(map.potential),
            scoutSkill: this.parseNumber(getText(map.scoutSkill)),

            slfPriceText: priceInfo.priceText,
            slfPriceCellText: priceInfo.rawText,
            slfPrice: priceInfo.currentPrice,
            slfSecondaryPriceText: priceInfo.secondaryPriceText,
            slfSecondaryPrice: priceInfo.secondaryPrice,
            nominalRatio: priceInfo.nominalRatio,
            nominalBase: priceInfo.nominalBase,
            slfPriceSource: priceInfo.source,
            slfPriceCellIndex: priceInfo.cellIndex,
            slfBids: this.parseNumber(getText(map.bids)),
            endDateText: getText(map.endDate),

            tmUrl: '',
            tmProfile: null,
            tmValueEur: 0
        };

        tr.dataset.slfOriginalIndex = String(index);
        tr.dataset.slfPlayerId = row.playerId;

        return row;
    },

    parsePositions(value) {
        const text = this.normalizeText(value);
        const matches = text.match(/\b(GK|LD|CD|RD|DM|CM|AM|LM|RM|LW|RW|ST)\b/gi);

        if (!matches) return [];

        return [...new Set(matches.map(x => x.toUpperCase()))].slice(0, 3);
    },

    parseNumber(value) {
        const m = String(value || '').match(/-?\d+(?:[.,]\d+)?/);

        if (!m) return null;

        const n = Number(m[0].replace(',', '.'));

        return Number.isFinite(n) ? n : null;
    },

    setStatus(text) {
        const el = document.getElementById('slf-transfer-status');
        if (el) el.textContent = text || '';
    },

    renderCachedRows() {
        const rows = this.parseVisibleRows();

        if (!rows.length) return;

        let rendered = 0;

        rows.forEach(row => {
            const analysisCached = this.getCachedAnalysis(row);

            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                rendered++;
                return;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);

            if (!tmCached && !alterCached) return;

            const tmResult = tmCached || {
                playerId: row.playerId,
                slfUrl: row.playerUrl,
                tmUrl: '',
                tmProfile: null,
                error: 'not_cached'
            };

            row.tmUrl = tmResult.tmUrl || '';
            row.tmProfile = tmResult.tmProfile || null;
            row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
            row.slfAlter = alterCached || null;

            this.renderRowBadge(row, tmResult, alterCached || null);
            rendered++;
        });

        if (rendered) {
            this.setStatus(`Из cache показано: ${rendered}. Нажми анализ, чтобы догрузить недостающее.`);
        }
    },

    async analyzeVisibleRows() {
        if (this.isHistoryPage()) {
            await this.analyzeHistoryVisibleRows();
            return;
        }

        const rows = this.parseVisibleRows();

        if (!rows.length) {
            this.setStatus('Игроки не найдены.');
            return;
        }

        this.setStatus(`Найдено строк: ${rows.length}. Анализ...`);
        await this.loadMarketBaseline();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const analysisCached = this.getCachedAnalysis(row);

            if (analysisCached && this.applyCachedAnalysis(row, analysisCached)) {
                this.setStatus(`Cache ${i + 1}/${rows.length}: ${row.name || row.playerId}`);
                continue;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`${fromCache ? 'Cache' : 'Анализ'} ${i + 1}/${rows.length}: ${row.name || row.playerId}`);

            if (!fromCache) {
                this.renderLoadingBadge(row);
            }

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer Analyzer] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                this.renderRowBadge(row, tmResult, slfAlter);
                this.saveRowAnalysis(row, tmResult, slfAlter);
            } catch (e) {
                console.error('[SLF Transfer Analyzer] row failed', row, e);
                this.renderErrorBadge(row, e);
            }
        }

        this.setStatus(`Готово: ${rows.length} игроков. Из cache используется всё, что уже было сохранено.`);
    },


    parseMoney(value) {
        const raw = String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/,/g, '.')
            .trim();

        if (!raw) return null;

        const lower = raw.toLowerCase();
        const numberMatch = lower.match(/(\d+(?:\s\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);

        if (!numberMatch) return null;

        const numeric = Number(String(numberMatch[1]).replace(/\s/g, ''));
        if (!Number.isFinite(numeric)) return null;

        let multiplier = 1;

        if (/[0-9]\s*[bб](?=$|[^a-zа-яё0-9])|\b(bn|billion)\b|млрд|миллиард/.test(lower)) {
            multiplier = 1000000000;
        } else if (/[0-9]\s*[mм](?=$|[^a-zа-яё0-9])|\b(mln|million)\b|млн|миллион/.test(lower)) {
            multiplier = 1000000;
        } else if (/[0-9]\s*[kк](?=$|[^a-zа-яё0-9])|\b(тыс|thousand)\b/.test(lower)) {
            multiplier = 1000;
        }

        const valueNumber = Math.round(numeric * multiplier);
        return Number.isFinite(valueNumber) && valueNumber > 0 ? valueNumber : null;
    },

    formatSlfMoneyShort(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) return '?';

        if (n >= 1000000) {
            const v = n / 1000000;
            return `${v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}M`;
        }

        if (n >= 1000) {
            const v = n / 1000;
            return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}k`;
        }

        return String(Math.round(n));
    },

    parseNominalRatio(text) {
        const raw = this.normalizeText(text);
        const m = raw.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        if (!m) return null;

        const n = Number(String(m[1]).replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? n : null;
    },

    parseSlfMoneyToken(token) {
        return this.parseMoney(String(token || '').trim());
    },

    extractSlfMoneyTokens(text, nominalMatch) {
        const raw = String(text || '');
        const re = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)(?:\s*)([KКMМBБ])/gi;
        const tokens = [];
        let m;

        while ((m = re.exec(raw))) {
            const token = m[0].trim();
            const start = m.index;
            const afterNominal = !nominalMatch || start >= nominalMatch.index + nominalMatch[0].length;
            if (!afterNominal) continue;

            const value = this.parseSlfMoneyToken(token);
            if (value) tokens.push({ token, value, start });
        }

        return tokens;
    },

    looksLikeTransferPriceCell(text) {
        const raw = this.normalizeText(text);
        if (!raw) return false;
        const hasNominal = /(?:^|\s)\d+(?:[.,]\d+)?\s*[HН](?=\s|$)/i.test(raw);
        const hasMoney = /(\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(raw);
        return hasNominal && hasMoney;
    },

    findTransferPriceCell(tr, map) {
        const cells = [...tr.querySelectorAll('td')];
        if (!cells.length) return { cell: null, index: null, source: 'not_found' };

        const hasNominalDomMarker = cell => !!cell.querySelector(
            '[title="Кол-во номиналов"], [title*="Кол-во номиналов"], img[title="Кол-во номиналов"], img[title*="Кол-во номиналов"]'
        );

        const hasSlfCurrencyImg = cell => !!cell.querySelector(
            'img[title="Внутренняя валюта"], img[title*="Внутренняя валюта"]'
        );

        const hasSlfMoneyText = text => /(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\s\d{3})+)\s*[KКMМBБ]/i.test(text);

        const candidates = cells
            .map((cell, index) => {
                const text = this.normalizeText(cell.innerText || cell.textContent || '');
                const nominalDom = hasNominalDomMarker(cell);
                const currencyImg = hasSlfCurrencyImg(cell);
                const contentPattern = this.looksLikeTransferPriceCell(text);
                const moneyText = hasSlfMoneyText(text);

                // Strict preferred detector for the real "Цена" cell on active transfers:
                // nominal marker title="Кол-во номиналов" + internal currency image.
                const domPriceCell = nominalDom && currencyImg && moneyText;
                const valid = domPriceCell || contentPattern;
                if (!valid) return null;

                let score = domPriceCell ? 200 : 100;
                if (nominalDom) score += 60;
                if (currencyImg) score += 60;
                if (index === map?.price) score += 30;
                if (/^\s*\d+(?:[.,]\d+)?\s*[HН]\s+\d/i.test(text)) score += 15;
                if (cell.querySelector('a[href*="player.php"]')) score -= 80;
                if (/^\d{4,}$/.test(text)) score -= 100;

                return {
                    cell,
                    index,
                    text,
                    score,
                    source: domPriceCell ? 'price_cell_nominal_title_currency_img' : 'price_cell_content_pattern'
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        if (candidates[0]) {
            return { cell: candidates[0].cell, index: candidates[0].index, source: candidates[0].source };
        }

        const fallback = map?.price != null ? cells[map.price] : null;
        if (fallback) {
            const text = this.normalizeText(fallback.innerText || fallback.textContent || '');
            if (hasSlfMoneyText(text) && !fallback.querySelector('a[href*="player.php"]')) {
                return { cell: fallback, index: map.price, source: 'validated_header_price_cell' };
            }
        }

        return { cell: null, index: null, source: 'not_found' };
    },

    parseTransferPriceCellInfo(tr, map) {
        const found = this.findTransferPriceCell(tr, map);
        const rawText = this.normalizeText(found.cell?.innerText || found.cell?.textContent || '');
        const nominalMatch = rawText.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*[HН](?=\s|$)/i);
        const nominalRatio = nominalMatch ? Number(String(nominalMatch[1]).replace(',', '.')) : null;
        const moneyTokens = this.extractSlfMoneyTokens(rawText, nominalMatch);
        const current = moneyTokens[0] || null;
        const secondary = moneyTokens[1] || null;
        const currentPrice = current?.value || null;
        const nominalBase = currentPrice && nominalRatio ? Math.round(currentPrice / nominalRatio) : null;

        return {
            rawText,
            priceText: current?.token || rawText,
            currentPrice,
            secondaryPriceText: secondary?.token || '',
            secondaryPrice: secondary?.value || null,
            nominalRatio: Number.isFinite(nominalRatio) && nominalRatio > 0 ? nominalRatio : null,
            nominalBase,
            source: found.source,
            cellIndex: found.index
        };
    },

    getCurrentSlfMarketPrice(row) {
        const fromPageText = row?.slfPriceText || '';
        const fromPageCellText = row?.slfPriceCellText || fromPageText;
        const fromPageParsed = row?.slfPrice != null ? Number(row.slfPrice) : this.parseMoney(fromPageText);

        if (Number.isFinite(fromPageParsed) && fromPageParsed > 0) {
            return {
                value: fromPageParsed,
                text: fromPageText || this.formatSlfMoneyShort(fromPageParsed),
                source: row?.slfPriceSource || 'transfer_page_price_cell',
                sourceLabel: row?.slfPriceSource === 'price_cell_content_pattern'
                    ? 'ячейка Цена по DOM-паттерну H + SLF money'
                    : 'текущая цена на странице',
                parsedDomCellValue: fromPageCellText || '',
                nominalRatio: row?.nominalRatio ?? null,
                nominalBase: row?.nominalBase ?? null,
                secondaryPriceText: row?.slfSecondaryPriceText || ''
            };
        }

        if (row?.completedTransfer && row?.salePrice) {
            const value = Number(row.salePrice || 0);
            return {
                value,
                text: row.salePriceText || this.formatSlfMoneyShort(value),
                source: 'completed_transfer_row_price',
                sourceLabel: 'финальная цена завершённого трансфера',
                parsedDomCellValue: row.salePriceText || ''
            };
        }

        return {
            value: 0,
            text: '',
            source: 'not_found',
            sourceLabel: 'цена не распознана',
            parsedDomCellValue: fromPageText || row?.salePriceText || ''
        };
    },

    parseHistoryDate(value) {
        const text = this.normalizeText(value);
        const m = text.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

        if (!m) {
            return { dateText: text, dateTs: null };
        }

        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

        return {
            dateText: text,
            dateTs: Number.isFinite(ts) ? ts : null
        };
    },

    parseHistoryVisibleRows() {
        const table = this.findTransferTable();

        if (!table) return [];

        this.ensureAnalysisHeader(table);

        const map = this.getHeaderMap(table);
        const rows = [...table.querySelectorAll('tr')];

        const parsed = rows
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);

        console.log('[SLF Transfer History] parseHistoryVisibleRows', parsed);

        return parsed;
    },

    parseHistoryRow(tr, index, map) {
        const text = this.normalizeText(tr.innerText);
        const lower = text.toLowerCase();

        if (!text) return null;
        if (lower.includes('амплуа') && lower.includes('сумма')) return null;

        const cells = [...tr.querySelectorAll('td')];
        if (cells.length < 10) return null;

        const rawCells = cells.map(td => this.normalizeText(td.innerText || td.textContent || ''));

        const dateIndex = rawCells.findIndex(cell =>
            /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(?:\s+\d{1,2}:\d{2})?/.test(cell)
        );

        if (dateIndex < 0) return null;

        const cell = offset => rawCells[dateIndex + offset] || '';

        const playerLink = this.findPlayerLinkInRow(tr);
        if (!playerLink) return null;

        const href = playerLink.getAttribute('href') || '';
        const idFromHref = (href.match(/id=(\d+)/) || [])[1];
        const idFromRowStart = (text.match(/^\s*(\d{4,})/) || [])[1];
        const playerId = idFromHref || idFromRowStart;

        if (!playerId) return null;

        const linkTitle = this.normalizeText(playerLink.getAttribute('title') || '');
        const linkText = this.normalizeText(playerLink.textContent || '');

        const dateRaw = cell(0);
        const date = this.parseHistoryDate(dateRaw);

        const positionsText = [cell(1), cell(2)]
            .filter(Boolean)
            .join(' ')
            .trim();

        const name = this.cleanPlayerName(linkTitle || linkText || cell(3));

        const age = this.parseNumber(cell(4));
        const talent = this.parseNumber(cell(5));
        const scoutSkill = this.parseNumber(cell(6));

        const fromClubText = cell(7);
        const toClubText = cell(8);
        const salePriceText = cell(9);
        const salePrice = this.parseMoney(salePriceText);

        const historyAuxText = cell(10);
        const buyerManagerText = cell(11);
        const sellerManagerText = cell(12);

        const row = {
            rowEl: tr,
            originalIndex: index,
            playerId: String(playerId),
            playerUrl: buildSlfUrl(`/player.php?action=view&id=${encodeURIComponent(playerId)}`),

            name,
            positions: this.parsePositions(positionsText || text),

            age,
            talent,
            potentialText: '',
            scoutSkill,

            slfPriceText: salePriceText,
            salePriceText,
            salePrice,
            transferDateText: date.dateText,
            transferDateTs: date.dateTs,
            fromClubText,
            toClubText,
            sellerManagerText,
            buyerManagerText,
            transferTypeText: historyAuxText,
            historyAuxText,
            historySchemaVersion: 2,
            historyParserVersion: 'history_v2_cells',

            rawCells,
            rawText: text,
            completedTransfer: true,

            tmUrl: '',
            tmProfile: null,
            tmValueEur: 0
        };

        tr.dataset.slfOriginalIndex = String(index);
        tr.dataset.slfPlayerId = row.playerId;
        tr.dataset.slfCompletedTransfer = '1';
        tr.dataset.slfTransferPrice = String(salePrice || 0);
        tr.dataset.slfTransferDateTs = String(date.dateTs || 0);

        return row;
    },

    getHistorySyncedStorageKey() {
        return 'slf_transfer_history_synced_keys_v2';
    },

    loadHistorySyncedKeys() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistorySyncedStorageKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistorySyncedKeys(data) {
        localStorage.setItem(this.getHistorySyncedStorageKey(), JSON.stringify(data || {}));
    },

    getHistoryVpsCacheKey() {
        return 'slf_transfer_history_vps_records_cache_v1';
    },

    loadHistoryVpsCache() {
        try {
            return JSON.parse(localStorage.getItem(this.getHistoryVpsCacheKey()) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveHistoryVpsCache(data) {
        try {
            localStorage.setItem(this.getHistoryVpsCacheKey(), JSON.stringify({
                savedAt: Date.now(),
                rows: Array.isArray(data) ? data.slice(-3000) : []
            }));
        } catch (e) {
            console.warn('[SLF Transfer History] VPS cache save failed', e);
        }
    },

    normalizeHistoryVpsRows(data) {
        const rows = normalizeServerRows(data)
            .filter(row => row && (row.recordType === 'completed_transfer' || row.eventType === 'completed_transfer'));

        return rows;
    },

    async loadHistoryVpsRows() {
        try {
            const result = await Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY);
            const rows = this.normalizeHistoryVpsRows(result.data);
            this.saveHistoryVpsCache(rows);
            return rows;
        } catch (e) {
            const cache = this.loadHistoryVpsCache();
            const rows = Array.isArray(cache.rows) ? cache.rows : [];
            if (rows.length) return rows;
            throw e;
        }
    },

    buildHistoryMatchKeys(row) {
        const keys = [];
        if (!row) return keys;

        const playerId = String(row.playerId || '').trim();
        const price = Number(row.salePrice || 0);
        const dateText = this.normalizeText(row.transferDateText || '');
        const dateTs = Number(row.transferDateTs || 0);

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    buildHistoryVpsRecordKeys(record) {
        const transfer = record?.transfer || {};
        const player = record?.player || {};
        const playerId = String(player.playerId || record.playerId || '').trim();
        const price = Number(transfer.price || record.price || 0);
        const dateText = this.normalizeText(transfer.dateText || record.dateText || '');
        const dateTs = Number(transfer.dateTs || record.dateTs || 0);
        const keys = [];

        if (playerId && price && dateText) keys.push(`pid:${playerId}|price:${price}|date:${dateText}`);
        if (playerId && price && dateTs) keys.push(`pid:${playerId}|price:${price}|ts:${dateTs}`);
        if (playerId && dateText) keys.push(`pid:${playerId}|date:${dateText}`);
        if (playerId && price) keys.push(`pid:${playerId}|price:${price}`);
        if (playerId) keys.push(`pid:${playerId}`);

        return keys;
    },

    indexHistoryVpsRows(records) {
        const map = new Map();

        (records || []).forEach(record => {
            this.buildHistoryVpsRecordKeys(record).forEach(key => {
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(record);
            });
        });

        return map;
    },

    findHistoryVpsMatch(row, index) {
        const keys = this.buildHistoryMatchKeys(row);
        for (const key of keys) {
            const list = index.get(key);
            if (Array.isArray(list) && list.length) {
                return { record: list[0], key, confidence: key.includes('|price:') && (key.includes('|date:') || key.includes('|ts:')) ? 'high' : 'medium' };
            }
        }
        return null;
    },

    renderHistoryVpsBadge(row, match) {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const synced = !!match;
        const label = synced ? '✓ VPS' : '□ VPS';
        const color = synced ? '#7cff7c' : '#777';
        const border = synced ? '#4b7d2d' : '#444';
        const bg = synced ? '#173018' : '#181818';

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${border};
                border-radius:4px;
                background:${bg};
                color:${color};
                font-weight:bold;
                white-space:nowrap;
            ">${label}</span>
        `;
    },

    renderHistorySyncStatus(row, label = '… VPS', level = 'pending') {
        const box = this.getOrCreateBadgeCell(row);
        if (!box) return;

        const colors = {
            pending: { color: '#ffd76a', border: '#7a6422', bg: '#302610' },
            error: { color: '#ff9f9f', border: '#854040', bg: '#301515' },
            neutral: { color: '#aaa', border: '#444', bg: '#181818' }
        };
        const c = colors[level] || colors.neutral;

        box.innerHTML = `
            <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-width:54px;
                padding:2px 6px;
                border:1px solid ${c.border};
                border-radius:4px;
                background:${c.bg};
                color:${c.color};
                font-weight:bold;
                white-space:nowrap;
            ">${this.escapeHtml(label)}</span>
        `;
    },

    async hydrateHistoryFromVps() {
        const rows = this.parseHistoryVisibleRows();
        if (!rows.length) {
            this.setStatus('История: строки не найдены для VPS rehydrate.');
            return;
        }

        this.setStatus(`История: загружаю VPS completed_transfer (${rows.length} строк)...`);
        const records = await this.loadHistoryVpsRows();
        const index = this.indexHistoryVpsRows(records);
        let matched = 0;

        rows.forEach(row => {
            const match = this.findHistoryVpsMatch(row, index);
            if (match) matched++;
            this.renderHistoryVpsBadge(row, match || null);
        });

        this.setStatus(`История VPS: найдено совпадений ${matched}/${rows.length}; записей в базе ${records.length}.`);
    },

    async hashText(value) {
        const text = String(value || '');

        try {
            if (window.crypto?.subtle && window.TextEncoder) {
                const bytes = new TextEncoder().encode(text);
                const digest = await window.crypto.subtle.digest('SHA-256', bytes);

                return [...new Uint8Array(digest)]
                    .map(byte => byte.toString(16).padStart(2, '0'))
                    .join('');
            }
        } catch (e) {
            console.warn('[SLF Transfer History] crypto hash failed, fallback hash used', e);
        }

        let h = 0;
        for (let i = 0; i < text.length; i++) {
            h = ((h << 5) - h) + text.charCodeAt(i);
            h |= 0;
        }

        return `fallback_${Math.abs(h).toString(16)}`;
    },

    buildHistoryEventKeySource(row) {
        return [
            'completed_transfer',
            row.transferDateText || '',
            row.playerId || '',
            row.fromClubText || '',
            row.toClubText || '',
            row.salePrice || 0
        ].join('|');
    },

    buildHistoryAnalysisPayload(row, enriched, slfAlter) {
        const profile = enriched?.tmProfile || null;
        const fallbackProfile = {
            marketValueEur: 0,
            lastKnownMarketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const effectiveProfile = profile || fallbackProfile;
        const markers = this.buildMarkers(row, effectiveProfile, slfAlter);
        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, сохранены SLF/alter.php сигналы.'
            };

        return {
            verdict: {
                label: verdict.label,
                level: verdict.level,
                score: Number(verdict.score || 0),
                reason: verdict.reason || ''
            },
            markers: markers.map(marker => ({
                category: this.markerCategory(marker),
                label: marker.label || '',
                level: marker.level || '',
                score: Number(marker.score || 0),
                redFlag: !!marker.redFlag,
                hardStop: !!marker.hardStop,
                text: marker.text || ''
            })),
            sortMetrics: {
                analyzerScore: Number(verdict.score || 0),
                skillDelta: slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : null,
                currentMinutesPct: slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : null,
                talentUpScore: markers.some(m => this.markerCategory(m) === 'talent')
                    ? Number(slfAlter?.talentUpgradeRow?.minutesPct || 0)
                    : null,
                tmValueEur: Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0),
                salePrice: Number(row.salePrice || 0)
            }
        };
    },

    buildSlfAlterSummary(alter) {
        if (!alter) return null;

        return {
            age: alter.age ?? null,
            talent: alter.talent ?? null,
            currentSkill: alter.currentSkill ?? null,
            finalSkill: alter.finalSkill ?? null,
            skillDelta: alter.skillDelta ?? null,
            currentSeasonYear: alter.currentSeasonYear ?? null,
            currentSeasonLabel: alter.currentSeasonLabel || '',
            hasCurrentSeason: !!alter.hasCurrentSeason,
            isCurrentSeasonActive: !!alter.isCurrentSeasonActive,
            staleActivity: !!alter.staleActivity,
            currentRow: alter.currentRow ? {
                season: alter.currentRow.season,
                seasonLabel: alter.currentRow.seasonLabel,
                leagueLevel: alter.currentRow.leagueLevel,
                leagueSkill: alter.currentRow.leagueSkill,
                minutesPct: alter.currentRow.minutesPct,
                minutes: alter.currentRow.minutes,
                gamesPlayed: alter.currentRow.gamesPlayed,
                gamesPossible: alter.currentRow.gamesPossible,
                starts: alter.currentRow.starts
            } : null,
            talentUpgradeEligible: !!alter.talentUpgradeEligible,
            talentUpgradeRow: alter.talentUpgradeRow ? {
                season: alter.talentUpgradeRow.season,
                seasonLabel: alter.talentUpgradeRow.seasonLabel,
                leagueLevel: alter.talentUpgradeRow.leagueLevel,
                leagueSkill: alter.talentUpgradeRow.leagueSkill,
                minutesPct: alter.talentUpgradeRow.minutesPct
            } : null
        };
    },

    buildTmProfileSummary(profile) {
        if (!profile) return null;

        return {
            tmUrl: profile.tmUrl || '',
            tmId: profile.tmId || '',
            marketValueText: profile.marketValueText || '',
            marketValueEur: profile.marketValueEur ?? null,
            lastKnownMarketValueText: profile.lastKnownMarketValueText || '',
            lastKnownMarketValueEur: profile.lastKnownMarketValueEur ?? null,
            highestMarketValueText: profile.highestMarketValueText || '',
            highestMarketValueEur: profile.highestMarketValueEur ?? null,
            valuePeakRatio: profile.valuePeakRatio ?? null,
            isRetired: !!profile.isRetired,
            isFreeAgent: !!profile.isFreeAgent,
            currentClub: profile.currentClub || '',
            playerAgent: profile.playerAgent || '',
            contractExpires: profile.contractExpires || '',
            age: profile.age ?? null,
            activity: profile.activity || null,
            rumorsCount: Array.isArray(profile.rumors) ? profile.rumors.length : 0,
            youthClubs: Array.isArray(profile.youthClubs) ? profile.youthClubs.slice(0, 12) : []
        };
    },

    async buildTransferHistoryEvent(row, enriched, slfAlter) {
        const eventKeySource = this.buildHistoryEventKeySource(row);
        const eventKey = await this.hashText(eventKeySource);
        const profile = enriched?.tmProfile || null;

        return {
            recordType: 'completed_transfer',
            eventType: 'completed_transfer',
            schemaVersion: 2,
            parserVersion: row.historyParserVersion || 'history_v2_cells',
            eventKey,
            eventKeySource,

            source: {
                page: 'transfers_history',
                url: location.href,
                collectedAt: Date.now(),
                scriptVersion: '4.4.72'
            },

            transfer: {
                dateText: row.transferDateText || '',
                dateTs: row.transferDateTs || null,
                priceText: row.salePriceText || '',
                price: row.salePrice ?? null,
                typeText: row.transferTypeText || '',
                auxText: row.historyAuxText || ''
            },

            player: {
                playerId: row.playerId || '',
                name: row.name || '',
                positions: row.positions || [],
                primaryPosition: row.positions?.[0] || null,
                age: row.age ?? null,
                talent: row.talent ?? null,
                skill: slfAlter?.finalSkill ?? row.scoutSkill ?? null,
                currentSkill: slfAlter?.currentSkill ?? row.scoutSkill ?? null,
                finalSkill: slfAlter?.finalSkill ?? null,
                skillDelta: slfAlter?.skillDelta ?? null,
                playerUrl: row.playerUrl || ''
            },

            clubs: {
                fromName: row.fromClubText || '',
                toName: row.toClubText || ''
            },

            managers: {
                seller: row.sellerManagerText || '',
                buyer: row.buyerManagerText || ''
            },

            analysis: this.buildHistoryAnalysisPayload(row, enriched, slfAlter),

            enrichment: {
                tmUrl: enriched?.tmUrl || profile?.tmUrl || '',
                tmProfileSummary: this.buildTmProfileSummary(profile),
                slfAlterSummary: this.buildSlfAlterSummary(slfAlter)
            },

            raw: {
                cells: row.rawCells || [],
                rowText: row.rawText || ''
            }
        };
    },

    markHistoryEventsSubmitted(events) {
        const synced = this.loadHistorySyncedKeys();

        (events || []).forEach(event => {
            if (!event?.eventKey) return;

            synced[event.eventKey] = {
                eventKey: event.eventKey,
                playerId: event.player?.playerId || '',
                dateText: event.transfer?.dateText || '',
                price: event.transfer?.price ?? null,
                submittedAt: Date.now()
            };
        });

        this.saveHistorySyncedKeys(synced);
    },

    sendTransferHistoryEvents(events) {
        if (!Array.isArray(events) || !events.length) return;

        Api.post(
            CONFIG.COLLECTIONS.TRANSFER_HISTORY + '?mode=append',
            events,
            'transfer history events'
        );

        this.markHistoryEventsSubmitted(events);
    },

    async analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();

        if (!rows.length) {
            this.setStatus('История трансферов: строки не найдены.');
            return;
        }

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const eventsToSend = [];
        let skipped = 0;
        let failed = 0;

        this.setStatus(`История: найдено строк ${rows.length}. Синхронизация completed_transfer...`);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);

            if (alreadySubmitted[eventKey]) {
                skipped++;
                this.renderHistoryVpsBadge(row, { confidence: 'local', key: eventKey, record: {} });
                this.setStatus(`История ${i + 1}/${rows.length}: уже синхронизировано ${row.name || row.playerId}`);
                continue;
            }

            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            const fromCache = !!tmCached && !!alterCached;

            this.setStatus(`История ${i + 1}/${rows.length}: ${fromCache ? 'cache' : 'анализ'} ${row.name || row.playerId}`);

            this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);

                let slfAlter = alterCached || null;

                if (!slfAlter) {
                    try {
                        slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId);
                    } catch (alterError) {
                        console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError);
                    }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;

                const event = await this.buildTransferHistoryEvent(row, tmResult, slfAlter);
                eventsToSend.push(event);
                this.renderHistoryVpsBadge(row, { confidence: 'queued', key: event.eventKey, record: event });
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                this.renderHistorySyncStatus(row, 'ERR', 'error');

                try {
                    const fallbackEvent = await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null);
                    fallbackEvent.analysisFailed = true;
                    fallbackEvent.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallbackEvent);
                    this.renderHistoryVpsBadge(row, { confidence: 'fallback', key: fallbackEvent.eventKey, record: fallbackEvent });
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            this.sendTransferHistoryEvents(eventsToSend);
        }

        this.setStatus(
            `История готова: подготовлено к отправке ${eventsToSend.length}, пропущено дублей ${skipped}, ошибок ${failed}.`
        );
    },

    getOrCreateBadgeCell(row) {
        const tr = row.rowEl;

        if (!tr) return null;

        let box = tr.querySelector('.slf-transfer-analysis-badge');

        if (!box) {
            box = document.createElement('td');
            box.className = 'slf-transfer-analysis-badge';
            box.style.cssText = this.isHistoryPage()
                ? `
                    box-sizing:border-box;
                    min-width:80px;
                    max-width:96px;
                    width:86px;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:middle;
                    white-space:nowrap;
                    position:relative;
                    overflow:visible;
                    text-align:center;
                `
                : `
                    box-sizing:border-box;
                    min-width:0;
                    max-width:none;
                    width:auto;
                    font-size:11px;
                    line-height:1.12;
                    border-left:1px solid #444;
                    padding:3px 5px;
                    vertical-align:top;
                    white-space:normal;
                    position:relative;
                    overflow:visible;
                    display:flex;
                    flex-wrap:wrap;
                    align-items:flex-start;
                    gap:3px 4px;
                `;

            tr.appendChild(box);
        }

        return box;
    },

    renderLoadingBadge(row) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `<span style="color:#aaa;">TM/SLF анализ...</span>`;
    },

    renderErrorBadge(row, error) {
        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        box.innerHTML = `
            <span style="color:#ff9f9f;">Ошибка анализа</span>
            <span style="color:#777;margin-left:4px;">${this.escapeHtml(String(error?.message || error || 'unknown'))}</span>
        `;
    },

    isUsefulTmText(value) {
        const text = this.normalizeText(value);

        if (!text) return false;

        const lower = text.toLowerCase();

        return ![
            '-',
            '—',
            'n/a',
            'na',
            'unknown',
            'none',
            'null'
        ].includes(lower);
    },

    includesAny(text, terms) {
        const lower = this.normalizeLower(text);

        return (terms || []).some(term => lower.includes(String(term).toLowerCase()));
    },

    isRetired(profile) {
        const terms = this.getCfg().currentClub?.retiredTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isFreeAgent(profile) {
        const terms = this.getCfg().currentClub?.freeAgentTerms || [];
        return this.includesAny(profile?.currentClub || '', terms);
    },

    isNoAgent(profile) {
        const terms = this.getCfg().agent?.noAgentTerms || [];
        return this.includesAny(profile?.playerAgent || '', terms);
    },

    getUsefulRumors(rumors) {
        const list = Array.isArray(rumors) ? rumors : [];

        return list.filter(r => {
            const text = this.normalizeText(r.text || r.rawText || '');
            const lower = text.toLowerCase();

            if (!text) return false;

            if (
                lower.includes('interested club') &&
                (
                    lower.includes('most recent source') ||
                    lower.includes('last reply') ||
                    lower.includes('user assessment') ||
                    lower.includes('verein_id')
                )
            ) {
                return false;
            }

            return !!(r.club || r.dateText || text.length >= 4);
        });
    },

    formatRumorLine(rumor) {
        const club = this.normalizeText(rumor.club || '');
        const date = this.normalizeText(rumor.dateText || '');

        if (club && date) return `${club} · ${date}`;
        if (club) return club;
        if (date) return date;

        return this.normalizeText(rumor.text || rumor.rawText || '')
            .replace(/\s*\|\s*/g, ' · ')
            .slice(0, 160);
    },

    buildTmDetailsHtml(profile) {
        const lines = [];

        if (this.isUsefulTmText(profile.currentClub)) {
            lines.push(`<div><b>Current club:</b> ${this.escapeHtml(profile.currentClub)}</div>`);
        }

        if (this.isUsefulTmText(profile.playerAgent)) {
            lines.push(`<div><b>Agent:</b> ${this.escapeHtml(profile.playerAgent)}</div>`);
        }

        if (this.isUsefulTmText(profile.contractExpires)) {
            lines.push(`<div><b>Контракт:</b> ${this.escapeHtml(profile.contractExpires)}</div>`);
        }

        if (this.isUsefulTmText(profile.joined)) {
            lines.push(`<div><b>Joined:</b> ${this.escapeHtml(profile.joined)}</div>`);
        }

        if (this.isUsefulTmText(profile.lastContractExtension)) {
            lines.push(`<div><b>Extension:</b> ${this.escapeHtml(profile.lastContractExtension)}</div>`);
        }

        if (this.isUsefulTmText(profile.marketValueText)) {
            lines.push(`<div><b>TM value:</b> ${this.escapeHtml(profile.marketValueText)}</div>`);
        }

        if (profile.marketValueIsHistorical && (profile.lastKnownMarketValueEur || profile.lastKnownMarketValueText)) {
            lines.push(`<div><b>Old TM value:</b> ${this.escapeHtml(profile.lastKnownMarketValueText || TMEnrichmentLayer.formatMoney(profile.lastKnownMarketValueEur))} ${this.escapeHtml(profile.lastKnownMarketValueDate || '')} — retired, not current market value</div>`);
        }

        if (this.isUsefulTmText(profile.highestMarketValueText)) {
            lines.push(`<div><b>Highest TM:</b> ${this.escapeHtml(profile.highestMarketValueText)} ${this.escapeHtml(profile.highestMarketValueDate || '')}</div>`);
        }

        if (profile.activity) {
            const a = profile.activity;
            const activityParts = [];

            if (a.startingElevenPct != null) activityParts.push(`XI ${a.startingElevenPct}%`);
            if (a.minutesPct != null) activityParts.push(`Min ${a.minutesPct}%`);
            if (a.goalParticipationPct != null) activityParts.push(`GP ${a.goalParticipationPct}%`);

            if (activityParts.length) {
                lines.push(`<div><b>Activity:</b> ${this.escapeHtml(activityParts.join(' · '))}</div>`);
            }
        }

        const youthClubs = Array.isArray(profile.youthClubs) ? profile.youthClubs : [];

        if (youthClubs.length) {
            lines.push(`<div><b>Youth Clubs:</b> ${this.escapeHtml(youthClubs.join(', '))}</div>`);
        }

        const history = Array.isArray(profile.transferHistory)
            ? profile.transferHistory
            : [];

        if (history.length) {
            const historyPreview = history
                .slice(0, 5)
                .map(h => this.escapeHtml(this.normalizeText(h.text || '').slice(0, 220)))
                .filter(Boolean)
                .map(x => `<li>${x}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#8cf;font-weight:bold;">Transfer history: ${history.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${historyPreview}
                </ul>
            `);
        }

        const rumors = this.getUsefulRumors(profile.rumors);

        if (rumors.length) {
            const rumorsHtml = rumors
                .slice(0, 6)
                .map(r => this.formatRumorLine(r))
                .filter(Boolean)
                .map(x => `<li>${this.escapeHtml(x)}</li>`)
                .join('');

            lines.push(`
                <div style="margin-top:6px;color:#ffd76a;font-weight:bold;">Rumors: ${rumors.length}</div>
                <ul style="margin:3px 0 0 16px;padding:0;color:#ccc;">
                    ${rumorsHtml}
                </ul>
            `);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#aaa;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #444;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">подробнее</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:580px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },

    buildSlfDetailsHtml(alter) {
        if (!alter) return '';

        const lines = [];

        if (alter.currentSkill != null || alter.finalSkill != null) {
            lines.push(`<div><b>SLF skill:</b> ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.currentSkill))} → ${this.escapeHtml(SLFAlterLayer.formatSkill(alter.finalSkill))} ${alter.skillDelta != null ? '(' + this.escapeHtml(SLFAlterLayer.formatDelta(alter.skillDelta)) + ')' : ''}</div>`);
        }

        if (alter.currentRow) {
            const row = alter.currentRow;
            lines.push(`<div><b>Current season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% / ${this.escapeHtml(row.minutes || 0)} min · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.gamesPlayed)}/${this.escapeHtml(row.gamesPossible)} games · starts ${this.escapeHtml(row.starts ?? '')}</div>`);
        } else if (alter.staleActivity) {
            lines.push(`<div><b>Current season:</b> no current league row. Last season: ${this.escapeHtml(alter.lastSeasonYear || '?')}</div>`);
        }

        if (alter.talentUpgradeRow) {
            const row = alter.talentUpgradeRow;
            lines.push(`<div><b>Talent-up signal:</b> T${this.escapeHtml(alter.talent)} → L${this.escapeHtml(row.leagueLevel)} · ${this.escapeHtml(row.minutesPct)}% · ${this.escapeHtml(row.season)}</div>`);
        }

        if (alter.bestEligibleRow) {
            const row = alter.bestEligibleRow;
            lines.push(`<div><b>Best 40%+ season:</b> ${this.escapeHtml(row.season)} · ${this.escapeHtml(row.minutesPct)}% · L${this.escapeHtml(row.leagueLevel)}/${this.escapeHtml(row.leagueSkill)} · ${this.escapeHtml(row.teamText || '')}</div>`);
        }

        if (alter.seasonSkills?.length) {
            lines.push(`<div><b>Season skills:</b> ${this.escapeHtml(alter.seasonSkills.map(x => `${x.season}: ${x.skill}`).join(' · '))}</div>`);
        }

        if (!lines.length) return '';

        return `
            <details class="slf-transfer-details" style="
                display:inline-block;
                margin-left:5px;
                position:relative;
                vertical-align:middle;
            ">
                <summary style="
                    cursor:pointer;
                    color:#9fd3ff;
                    display:inline-block;
                    list-style:none;
                    border:1px solid #446;
                    border-radius:4px;
                    padding:1px 4px;
                    background:#202020;
                    white-space:nowrap;
                ">SLF</summary>

                <div style="
                    position:absolute;
                    right:0;
                    top:20px;
                    z-index:999999;
                    width:620px;
                    max-height:380px;
                    overflow:auto;
                    padding:8px 10px;
                    background:#181818;
                    color:#ddd;
                    border:1px solid #666;
                    border-radius:6px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.75);
                    white-space:normal;
                    line-height:1.35;
                ">
                    ${lines.join('')}
                </div>
            </details>
        `;
    },


    buildScoreBreakdown(markers) {
        const sum = cats => (markers || [])
            .filter(marker => cats.includes(this.markerCategory(marker)))
            .reduce((total, marker) => total + Number(marker.score || 0), 0);
        const value = sum(['market', 'slf', 'tm']);
        const readiness = sum(['activity', 'league']);
        const growth = sum(['talent', 'age', 'trend']);
        const risk = (markers || [])
            .filter(marker => marker.redFlag || marker.hardStop || Number(marker.score || 0) < 0)
            .reduce((total, marker) => total + Math.min(0, Number(marker.score || 0)), 0);
        return `value ${value >= 0 ? '+' : ''}${value} · readiness ${readiness >= 0 ? '+' : ''}${readiness} · growth ${growth >= 0 ? '+' : ''}${growth} · risk ${risk}`;
    },

    buildDecisionDetailsHtml(row, profile, slfAlter, markers, verdict) {
        const marketMarker = (markers || []).find(m => this.markerCategory(m) === 'market') || null;
        const market = marketMarker?.marketDetails || {};
        const baseline = market?.baseline || null;
        const nominalRatio = Number(row?.nominalRatio || market?.nominal?.ratio || 0);
        const baseNominal = Number(row?.nominalBase || market?.nominal?.baseNominal || 0);
        const currentPrice = Number(row?.slfPrice || market?.currentInfo?.value || 0);
        const p75 = Number(baseline?.p75 || 0);
        const comparison = currentPrice && p75
            ? `текущая цена ${currentPrice > p75 ? 'выше' : 'ниже'} p75 примерно в ${(currentPrice / p75).toFixed(2)}x`
            : '';
        const riskMarkers = (markers || [])
            .filter(m => m && (m.redFlag || m.hardStop || ['risk', 'skip'].includes(String(m.level || ''))))
            .map(m => m.label || m.text || '')
            .filter(Boolean)
            .slice(0, 5);

        const rowHtml = (label, value) => {
            const clean = value == null || value === '' ? '—' : String(value);
            return `
                <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;">
                    <span style="color:#aaa;">${this.escapeHtml(label)}</span>
                    <span style="color:#ddd;">${this.escapeHtml(clean)}</span>
                </div>
            `;
        };

        const section = (title, rows) => {
            const body = (rows || []).filter(Boolean).join('');
            if (!body) return '';
            return `
                <div style="margin:0 0 8px 0;padding:7px 9px;background:#151515;border:1px solid #333;border-radius:5px;">
                    <div style="font-weight:bold;color:#ffd76a;margin-bottom:5px;">${this.escapeHtml(title)}</div>
                    ${body}
                </div>
            `;
        };

        const position = Array.isArray(row?.positions) && row.positions.length ? row.positions.join('/') : '';
        const tmValue = profile?.marketValueText || (profile?.marketValueEur ? TMEnrichmentLayer.formatMoney(profile.marketValueEur) : '');
        const slfSkill = slfAlter && (slfAlter.currentSkill != null || slfAlter.finalSkill != null)
            ? `${SLFAlterLayer.formatSkill(slfAlter.currentSkill)} → ${SLFAlterLayer.formatSkill(slfAlter.finalSkill)}${slfAlter.skillDelta != null ? ' (' + SLFAlterLayer.formatDelta(slfAlter.skillDelta) + ')' : ''}`
            : (row?.scoutSkill ? String(row.scoutSkill) : '');
        const minutes = slfAlter?.currentRow?.minutesPct != null
            ? `${slfAlter.currentRow.minutesPct}% · ${slfAlter.currentRow.minutes || 0} min`
            : (slfAlter?.staleActivity ? 'нет текущего сезона' : '');

        const plusMarkers = (markers || []).filter(m => Number(m.score || 0) > 0).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const minusMarkers = (markers || []).filter(m => Number(m.score || 0) < 0 || m.redFlag || m.hardStop).map(m => m.label || m.text || '').filter(Boolean).slice(0, 5);
        const scoreBreakdown = this.buildScoreBreakdown(markers || []);
        const whyReasons = this.buildWhyRankReasons(markers || [], verdict).join(' · ');

        const html = [
            section('Почему такой ранг', [
                rowHtml('Итог', `${this.getShortVerdictLabel(verdict)}${verdict?.rank ? ' #' + verdict.rank : ''}`),
                rowHtml('Score', Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '')),
                rowHtml('why', whyReasons),
                rowHtml('Плюсы', plusMarkers.join(' · ')),
                rowHtml('Минусы', minusMarkers.join(' · ')),
                rowHtml('Score breakdown', scoreBreakdown)
            ]),
            section('Игрок', [
                rowHtml('Позиция', position),
                rowHtml('Возраст / талант', [row?.age ? `${row.age} лет` : '', row?.talent ? `T${row.talent}` : ''].filter(Boolean).join(' · ')),
                rowHtml('Скилл / потенциал', [slfSkill, row?.potentialText || ''].filter(Boolean).join(' · ')),
                rowHtml('Минуты текущего сезона', minutes)
            ]),
            section('Рынок SLF', [
                rowHtml('Цена сейчас', this.formatSlfMoneyShort(currentPrice)),
                rowHtml('База скилла MKT', market?.skillBasis?.label || ''),
                rowHtml('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(p75) : 'нет выборки'),
                baseline && currentPrice ? rowHtml('Отношение к p75', `${(currentPrice / p75).toFixed(2)}x`) : '',
                baseline ? rowHtml('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                baseline ? rowHtml('Выборка / доверие', `${baseline.count || 0} продаж / ${baseline.confidence || ''}`) : '',
                rowHtml('Номинал', nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : ''),
                rowHtml('Базовый номинал', this.formatSlfMoneyShort(baseNominal)),
                rowHtml('Сравнение', comparison),
                rowHtml('Интерпретация', market?.conclusion || '')
            ]),
            section('TM / статус', [
                rowHtml('TM value / signal', tmValue),
                rowHtml('Клуб', profile?.currentClub || ''),
                rowHtml('Агент', profile?.playerAgent || ''),
                rowHtml('Контракт', profile?.contractExpires || '')
            ]),
            section('Риски / решение', [
                rowHtml('Verdict', verdict?.label || ''),
                rowHtml('Причина', verdict?.reason || ''),
                rowHtml('Риск-флаги', riskMarkers.join(' · ')),
                rowHtml('Короткий вывод', this.buildTransferShortDecision(verdict, market))
            ])
        ].filter(Boolean).join('');

        if (!html) return '';

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-decision-details-trigger" tabindex="0" style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                max-width:max-content;
                white-space:nowrap;
                cursor:pointer;
                color:#ddd;
                border:1px solid #555;
                border-radius:4px;
                padding:1px 5px;
                background:#202020;
                line-height:16px;
                min-height:17px;
                font-size:10px;
                box-sizing:border-box;
                vertical-align:middle;
            ">
                подробнее
                <span class="slf-transfer-html-tooltip" style="display:none;">${html}</span>
            </span>
        `;
    },

    buildTransferShortDecision(verdict, market) {
        const level = String(verdict?.level || '');
        const ratio = Number(market?.ratio || 0);
        if (level === 'skip' || level === 'risk' || ratio > 1.5) return 'skip / только при исключительных подтверждениях';
        if (level === 'watch' || ratio > 1.05) return 'watch / дорого, нужна дополнительная проверка';
        if (level === 'good' || level === 'hot' || (ratio && ratio <= 0.85)) return 'buy candidate / проверить финально вручную';
        return 'watch / нейтральная зона';
    },

    renderRowBadge(row, enriched, slfAlter) {
        if (this.isHistoryPage()) {
            this.renderHistoryVpsBadge(row, null);
            return;
        }

        const box = this.getOrCreateBadgeCell(row);

        if (!box) return;

        const profile = enriched?.tmProfile || null;
        const safeEnriched = enriched || {
            playerId: row.playerId,
            slfUrl: row.playerUrl,
            tmUrl: '',
            tmProfile: null,
            error: 'empty_enrichment'
        };

        const fallbackProfile = {
            marketValueEur: 0,
            transferHistory: [],
            youthClubs: [],
            rumors: [],
            currentClub: '',
            playerAgent: '',
            contractExpires: '',
            age: row.age,
            tmUrl: ''
        };

        const markers = this.buildMarkers(row, profile || fallbackProfile, slfAlter);

        const verdict = profile
            ? this.buildTransferVerdict(markers, profile, slfAlter)
            : {
                label: '⚪ LOW DATA',
                level: 'neutral',
                score: markers.reduce((sum, m) => sum + Number(m.score || 0), 0),
                reason: 'TM-профиль не найден, показаны только SLF-сигналы из cache/alter.php.'
            };

        this.writeRowSortMetrics(row, markers, verdict, slfAlter, profile);
        verdict.rank = this.computeVisibleScoreRank(row, verdict.score);

        const detailsHtml = this.buildDecisionDetailsHtml(row, profile || fallbackProfile, slfAlter, markers, verdict);
        const linksHtml = profile?.tmUrl
            ? `
                <span style="
                    display:inline-flex;
                    gap:4px;
                    align-items:center;
                    white-space:nowrap;
                    font-size:11px;
                    line-height:16px;
                    margin-left:2px;
                ">
                    <a href="${this.escapeHtml(profile.tmUrl)}" target="_blank" style="color:#8cf;">TM</a>
                </span>
            `
            : '';

        box.innerHTML = `
            <div class="slf-transfer-analysis-compact ta-cell" style="
                display:inline-flex;
                flex-direction:column;
                align-items:flex-start;
                gap:3px;
                width:max-content;
                max-width:100%;
                box-sizing:border-box;
                overflow:visible;
                white-space:normal;
            ">
                ${this.renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict)}
            </div>
        `;

        this.bindDetailsAutoClose();
        this.bindHtmlTooltipPortal(box);
        this.cleanupStandaloneMarketNominalControls(box);
        this.refreshVisibleRankBadges();
    },

    writeRowSortMetrics(row, markers, verdict, slfAlter, profile) {
        const tr = row?.rowEl;

        if (!tr) return;

        const talentMarker = markers.find(m => this.markerCategory(m) === 'talent');
        const marketMarker = markers.find(m => this.markerCategory(m) === 'market');
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const marketCurrent = Number(marketMarker?.marketDetails?.currentInfo?.value || 0);
        const marketP75 = Number(marketMarker?.marketDetails?.baseline?.p75 || 0);
        const marketHasData = marketRatio > 0 && marketCurrent > 0 && marketP75 > 0;

        tr.dataset.slfAnalyzerScore = String(Number(verdict?.score || 0));
        tr.dataset.slfSkillDelta = String(slfAlter?.skillDelta != null ? Number(slfAlter.skillDelta) : -9999);
        tr.dataset.slfMinutesPct = String(slfAlter?.currentRow?.minutesPct != null ? Number(slfAlter.currentRow.minutesPct) : -1);
        tr.dataset.slfTalentUp = String(talentMarker ? Number(talentMarker.score || 0) * 100 + Number(slfAlter?.talentUpgradeRow?.minutesPct || 0) : 0);
        tr.dataset.slfTmValue = String(Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || 0));
        tr.dataset.slfMktBargain = String(marketHasData ? Number((marketP75 / marketCurrent).toFixed(4)) : -1);
        tr.dataset.slfMktOverpriced = String(marketHasData ? Number(marketRatio.toFixed(4)) : -1);
    },

    markerCategory(marker) {
        if (marker?.category) return marker.category;

        const label = String(marker?.label || '').toLowerCase();

        if (label.includes('retired') || label.includes('no club') || label.includes('без клуба') || label.includes('club')) return 'club';
        if (label.includes('agent')) return 'agent';
        if (label.startsWith('slf') || label.startsWith('→')) return 'slf';
        if (label.includes('min') || label.startsWith('m-') || label.startsWith('m?')) return 'activity';
        if (label.includes('t') && label.includes('<l')) return 'talent';
        if (label.includes('>') && /\d/.test(label)) return 'league';
        if (label.includes('age') || label.includes('growth') || label.includes('grow') || label.includes('late') || label.includes('prime') || label.includes('veteran') || label.includes('vet') || label.includes('short')) return 'age';
        if (label.startsWith('mkt')) return 'market';
        if (label.startsWith('n ') || label.startsWith('n?')) return 'nominal';
        if (label.includes('tm ') || label.startsWith('tm') || label.startsWith('old €') || label.startsWith('old')) return 'tm';
        if (label.includes('peak') || label.includes('trend') || label.includes('collapsed') || label.includes('fallen') || label.includes('fall')) return 'trend';
        if (label.includes('contract') || label.includes('ctr') || label.includes('exp ')) return 'contract';
        if (label.includes('rumor') || /^r\d/.test(label)) return 'rumors';
        if (label.includes('academy') || label.includes('acad') || label.includes('youth') || label.includes('elite') || label.includes('strong')) return 'academy';

        return 'other';
    },

    getMarkerSlotDefs() {
        return [
            { key: 'slf', placeholder: 'SLF?' },
            { key: 'activity', placeholder: 'MIN?' },
            { key: 'talent', placeholder: 'T-' },
            { key: 'league', placeholder: 'L-' },
            { key: 'tm', placeholder: 'TM?' },
            { key: 'market', placeholder: 'MKT?' },
            { key: 'trend', placeholder: 'tr?' },

            { key: 'club', placeholder: 'club?' },
            { key: 'agent', placeholder: 'agent?' },
            { key: 'age', placeholder: 'age?' },
            { key: 'contract', placeholder: 'ctr?' },
            { key: 'rumors', placeholder: 'rum0' },
            { key: 'academy', placeholder: 'acad-' }
        ];
    },

    markerScoreRank(level) {
        return ({
            skip: 100,
            risk: 90,
            hot: 80,
            good: 70,
            watch: 60,
            normal: 50,
            neutral: 40,
            unknown: 30,
            low: 20,
            old: 15,
            empty: 10
        }[level] || 0);
    },

    sortMarkersByImportance(markers) {
        return [...(markers || [])].sort((a, b) => {
            return this.markerScoreRank(b.level) - this.markerScoreRank(a.level) ||
                Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0));
        });
    },

    isRealAnalysisMarker(marker) {
        if (!marker) return false;

        const level = String(marker.level || '');
        const label = this.normalizeText(marker.label || '');

        if (!label || level === 'empty') return false;
        if (/^(SLF\?|MIN\?|TM\?|MKT\?|T-|L-|tr\?|club\?|agent\?|age\?|ctr\?|rum0|acad-)$/i.test(label)) return false;
        if (/^N\s+/i.test(label)) return false;
        if (/^N\?/i.test(label)) return false;

        return true;
    },

    firstMarkerByCategory(markers, category) {
        return this.sortMarkersByImportance(markers)
            .find(marker => this.markerCategory(marker) === category && this.isRealAnalysisMarker(marker)) || null;
    },

    allMarkersByCategories(markers, categories) {
        const allowed = new Set(categories || []);
        return this.sortMarkersByImportance(markers)
            .filter(marker => allowed.has(this.markerCategory(marker)) && this.isRealAnalysisMarker(marker));
    },

    withVisualPriority(marker, priority) {
        return marker ? Object.assign({}, marker, { visualPriority: priority }) : null;
    },

    renderAnalysisGroup(className, title, markers, priority = 'medium') {
        const realMarkers = (markers || [])
            .filter(Boolean)
            .filter(marker => this.isRealAnalysisMarker(marker));

        if (!realMarkers.length) return '';

        return `
            <div class="ta-group ${className}" data-ta-group="${this.escapeHtml(className)}" aria-label="${this.escapeHtml(title)}">
                ${realMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, priority))).join('')}
            </div>
        `;
    },

    makeCombinedContextMarker(markers, labelFallback = '') {
        const realMarkers = (markers || []).filter(Boolean).filter(marker => this.isRealAnalysisMarker(marker));
        if (!realMarkers.length) return null;

        const labels = realMarkers
            .map(marker => String(marker.label || '').trim())
            .filter(Boolean);
        if (!labels.length) return null;

        const texts = realMarkers
            .map(marker => String(marker.text || marker.label || '').trim())
            .filter(Boolean);

        return {
            label: labels.join(' · ') || labelFallback,
            level: 'neutral',
            score: realMarkers.reduce((sum, marker) => sum + Number(marker.score || 0), 0),
            redFlag: realMarkers.some(marker => marker.redFlag),
            hardStop: realMarkers.some(marker => marker.hardStop),
            text: texts.join(' | '),
            category: 'combined'
        };
    },

    renderSemanticAnalysisGroups(markers, linksHtml, detailsHtml, verdict) {
        const primaryMarkers = [
            this.firstMarkerByCategory(markers, 'slf'),
            this.firstMarkerByCategory(markers, 'market'),
            this.firstMarkerByCategory(markers, 'tm'),
            this.firstMarkerByCategory(markers, 'activity'),
            this.firstMarkerByCategory(markers, 'trend')
        ].filter(Boolean);

        const usedPrimary = new Set(primaryMarkers);
        const signalMarkers = this.allMarkersByCategories(markers, ['talent', 'league', 'trend'])
            .filter(marker => !usedPrimary.has(marker));
        const ageMarker = this.firstMarkerByCategory(markers, 'age');
        const clubAgent = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'club'),
            this.firstMarkerByCategory(markers, 'agent')
        ], 'club / agent');
        const contractService = this.makeCombinedContextMarker([
            this.firstMarkerByCategory(markers, 'contract'),
            this.firstMarkerByCategory(markers, 'rumors'),
            this.firstMarkerByCategory(markers, 'academy')
        ], 'contract / status');
        const otherMarkers = this.allMarkersByCategories(markers, ['other']);
        const whyMarker = this.buildWhyRankMarker(markers, verdict);

        const secondaryMarkers = [
            whyMarker,
            ...signalMarkers,
            ageMarker,
            clubAgent,
            contractService,
            ...otherMarkers
        ].filter(Boolean);

        const verdictHtml = verdict ? this.renderRankVerdictChip(verdict) : '';

        const primaryHtml = `
            <div class="ta-line ta-primary" data-ta-line="primary" aria-label="Итог и главные факторы">
                ${verdictHtml}
                ${primaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, 'high'))).join('')}
            </div>
        `;

        const secondaryHtml = `
            <div class="ta-line ta-secondary" data-ta-line="secondary" aria-label="Почему и контекст">
                ${secondaryMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, marker.category === 'why' ? 'medium' : 'low'))).join('')}
                ${linksHtml || ''}
                ${detailsHtml || ''}
            </div>
        `;

        return [primaryHtml, secondaryHtml].join('');
    },


    getShortVerdictLabel(verdict) {
        const raw = String(verdict?.label || '').toUpperCase();
        if (raw.includes('SKIP')) return 'SKIP';
        if (raw.includes('TRAP') || raw.includes('RISK')) return 'RISK';
        if (raw.includes('SPEC')) return 'SPEC';
        if (raw.includes('PRIORITY') || raw.includes('STRONG')) return 'TARGET';
        if (raw.includes('TARGET')) return 'TARGET';
        if (raw.includes('WATCH')) return 'WATCH';
        if (raw.includes('LOW DATA')) return 'WATCH';
        return 'WATCH';
    },

    buildVerdictTooltipHtml(verdict) {
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const label = this.getShortVerdictLabel(verdict);
        const score = Number(verdict?.score || 0).toFixed(1).replace(/\.0$/, '');
        const rank = verdict?.rank ? `#${verdict.rank}` : '#?';
        const reason = verdict?.reason || verdict?.label || '';
        const level = String(verdict?.level || 'neutral');
        const meaning = (() => {
            const raw = String(verdict?.label || '').toUpperCase();
            if (raw.includes('PRIORITY') || raw.includes('TARGET')) return 'кандидат выше среднего: проверять первым, но финально сверить цену, минуты и статус';
            if (raw.includes('WATCH') || raw.includes('SPEC')) return 'наблюдение/ручная проверка: есть плюс, но не хватает уверенности или есть риск';
            if (raw.includes('RISK') || raw.includes('TRAP')) return 'риск покупки: маркеры указывают на переплату, слабую готовность или статусный риск';
            if (raw.includes('SKIP')) return 'пропуск: есть hard-stop или слишком сильная комбинация рисков';
            return 'общий ранговый вывод анализатора';
        })();

        return `
            <div style="font-weight:bold;color:#ffd76a;margin-bottom:6px;">Вердикт и ранг</div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Итог</span><span>${esc(label)} ${esc(rank)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Score</span><span>${esc(score)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Уровень</span><span>${esc(level)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;"><span style="color:#aaa;">Почему</span><span>${esc(reason)}</span></div>
            <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;padding:3px 0;"><span style="color:#aaa;">Как читать</span><span>${esc(meaning)}</span></div>
        `;
    },

    renderRankVerdictChip(verdict) {
        const label = this.getShortVerdictLabel(verdict);
        const rank = verdict?.rank ? ` #${verdict.rank}` : ' #?';
        const tooltip = this.buildVerdictTooltipHtml(verdict);
        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-verdict-chip" data-verdict-base="${this.escapeHtml(label)}" data-score="${this.escapeHtml(verdict?.score || 0)}" tabindex="0" style="
                flex:0 0 auto;
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-height:18px;
                line-height:17px;
                padding:1px 6px;
                border-radius:6px;
                color:${this.colorByLevel(verdict.level)};
                background:${this.bgByLevel(verdict.level)};
                border:1px solid ${this.borderByLevel(verdict.level)};
                font-weight:800;
                white-space:nowrap;
                vertical-align:middle;
                cursor:help;
            ">
                <span class="slf-transfer-verdict-label">${this.escapeHtml(label + rank)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${tooltip}</span>
            </span>
        `;
    },

    computeVisibleScoreRank(row, score) {
        const tr = row?.rowEl;
        const table = this.findTransferTable();
        if (!tr || !table) return null;
        const rows = [...table.querySelectorAll('tr')]
            .filter(item => item.dataset && item.dataset.slfPlayerId && item.dataset.slfAnalyzerScore !== undefined)
            .map(item => ({ item, score: Number(item.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        const index = rows.findIndex(item => item.item === tr);
        if (index >= 0) return index + 1;
        const better = rows.filter(item => Number(item.score) > Number(score || 0)).length;
        return better + 1;
    },

    refreshVisibleRankBadges() {
        const table = this.findTransferTable();
        if (!table) return;
        const rows = [...table.querySelectorAll('tr')]
            .filter(tr => tr.dataset && tr.dataset.slfPlayerId && tr.dataset.slfAnalyzerScore !== undefined)
            .map(tr => ({ tr, score: Number(tr.dataset.slfAnalyzerScore || -999999999) }))
            .sort((a, b) => b.score - a.score);
        rows.forEach((entry, index) => {
            const chip = entry.tr.querySelector('.slf-transfer-verdict-chip[data-verdict-base]');
            if (!chip) return;
            const base = chip.dataset.verdictBase || 'WATCH';
            const labelEl = chip.querySelector('.slf-transfer-verdict-label');
            if (labelEl) labelEl.textContent = `${base} #${index + 1}`;
            else chip.childNodes[0].textContent = `${base} #${index + 1}`;
        });
    },

    buildWhyRankReasons(markers, verdict) {
        const reasons = [];
        const market = (markers || []).find(m => this.markerCategory(m) === 'market');
        const activity = (markers || []).find(m => this.markerCategory(m) === 'activity');
        const trend = (markers || []).find(m => this.markerCategory(m) === 'trend');
        const age = (markers || []).find(m => this.markerCategory(m) === 'age');
        const agent = (markers || []).find(m => this.markerCategory(m) === 'agent');
        const club = (markers || []).find(m => this.markerCategory(m) === 'club');
        const ratio = Number(market?.marketDetails?.ratio || 0);
        const minPct = Number((String(activity?.label || '').match(/MIN\s+(\d+)/i) || [])[1] || 0);
        const peakPct = Number((String(trend?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const ageNum = Number((String(age?.label || '').match(/age\s+(\d+)/i) || [])[1] || 0);
        const verdictText = String(verdict?.label || '').toUpperCase();

        if (minPct >= 70) reasons.push('ready');
        if (ratio && ratio < 1) reasons.push('cheap');
        if (ratio && ratio > 1) reasons.push('overpay');
        if (minPct && minPct < 35) reasons.push('low-min');
        if (peakPct >= 90) reasons.push('peak');
        if (String(trend?.label || '').toLowerCase().includes('fall')) reasons.push('fall');
        if (verdictText.includes('SPEC') || (ageNum >= 22 && ageNum <= 24 && minPct > 0 && minPct < 70 && peakPct >= 90)) reasons.push('spec');
        if (ageNum >= 30) reasons.push('old');
        if (String(agent?.label || '').includes('✓')) reasons.push('agent');
        if (String(club?.label || '').includes('✓')) reasons.push('club');

        return [...new Set(reasons)].slice(0, 3);
    },

    buildWhyRankMarker(markers, verdict) {
        const reasons = this.buildWhyRankReasons(markers, verdict);
        if (!reasons.length) return null;
        return {
            label: `why: ${reasons.join(' · ')}`,
            level: 'neutral',
            score: 0,
            redFlag: false,
            hardStop: false,
            category: 'why',
            text: `Главные причины ранга: ${reasons.join(', ')}.`
        };
    },

    getMarkerSlots(markers) {
        const defs = this.getMarkerSlotDefs();

        return defs.map(def => {
            const marker = this.firstMarkerByCategory(markers, def.key);
            if (marker) return marker;

            return {
                label: def.placeholder,
                level: 'empty',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Нет данных/сигнала для слота ${def.key}.`
            };
        });
    },

    renderMarkerSlots(markers) {
        return this.renderSemanticAnalysisGroups(markers, '', '', null);
    },

    getVerdictIcon(verdict) {
        const label = String(verdict?.label || '');

        if (label.includes('SKIP')) return '⛔';
        if (label.includes('HIGH RISK') || label.includes('RISK') || label.includes('TRAP')) return '🔴';
        if (label.includes('SPEC')) return '◇';
        if (label.includes('MANUAL')) return '🟡';
        if (label.includes('PRIORITY')) return '🔥';
        if (label.includes('TARGET')) return '🟢';
        if (label.includes('WATCHLIST')) return '👀';

        return '⚪';
    },

    ensureHtmlTooltipStyles() {
        if (document.getElementById('slf-transfer-html-tooltip-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-transfer-html-tooltip-style';
        style.textContent = `
            .slf-transfer-chip-tooltip-host { overflow:visible !important; position:relative; outline:none; cursor:help; }
            .slf-transfer-decision-details-trigger { cursor:pointer !important; }
            .slf-transfer-mkt-leaf-badge { min-width:max-content !important; max-width:none !important; width:auto !important; white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; }
            .slf-transfer-analysis-badge, .slf-transfer-analysis-compact, .slf-transfer-marker-wrap, .ta-cell, .ta-line { overflow:visible !important; white-space:normal !important; }
            .slf-transfer-analysis-badge { min-width:0 !important; width:auto !important; max-width:none !important; }
            .ta-cell { display:inline-flex !important; flex-direction:column !important; align-items:flex-start !important; gap:3px !important; box-sizing:border-box !important; min-width:0 !important; width:max-content !important; max-width:100% !important; }
            .ta-line { display:flex !important; flex-wrap:wrap !important; align-items:center !important; justify-content:flex-start !important; gap:3px 4px !important; min-width:0 !important; box-sizing:border-box !important; width:max-content !important; max-width:100% !important; }
            .ta-primary { order:1; }
            .ta-secondary { order:2; opacity:.9; }
            .ta-secondary .slf-transfer-decision-details-trigger { display:inline-flex !important; width:max-content !important; max-width:max-content !important; white-space:nowrap !important; align-self:center !important; }
            .ta-secondary a { white-space:nowrap !important; }
            .slf-transfer-chip-tooltip-host .slf-transfer-html-tooltip { display:none !important; }
            .slf-transfer-html-tooltip-portal {
                position:fixed;
                z-index:2147483647;
                max-width:min(780px, calc(100vw - 24px));
                min-width:260px;
                width:auto;
                max-height:min(560px, calc(100vh - 24px));
                overflow:auto;
                padding:8px 10px;
                background:#181818;
                color:#ddd;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,0.75);
                white-space:normal;
                line-height:1.35;
                text-align:left;
                font-size:11px;
            }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-hover { pointer-events:none; }
            .slf-transfer-html-tooltip-portal.slf-transfer-tooltip-click { pointer-events:auto; }
        `;
        document.head.appendChild(style);
    },

    bindHtmlTooltipPortal(root = document) {
        if (window.__slf_transfer_html_tooltip_portal_bound) return;
        window.__slf_transfer_html_tooltip_portal_bound = true;

        let portal = null;
        let activeHost = null;
        let activeMode = '';

        const escape = value => String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const isDetailsHost = host => !!host && (
            host.classList?.contains('slf-transfer-decision-details-trigger') ||
            host.closest?.('.slf-transfer-details') ||
            String(host.textContent || '').trim().toLowerCase() === 'подробнее'
        );

        const normalizeHostTitle = host => {
            if (!host) return;
            const title = host.getAttribute('title');
            if (title && !host.dataset.slfTip) host.dataset.slfTip = title;
            if (title) host.removeAttribute('title');
        };

        const getTooltipHtml = host => {
            if (!host) return '';
            normalizeHostTitle(host);
            const source = host.querySelector?.('.slf-transfer-html-tooltip');
            if (source) return source.innerHTML || '';
            const tip = host.dataset?.slfTip || host.getAttribute?.('data-tooltip') || host.getAttribute?.('aria-label') || '';
            return tip ? `<div>${escape(tip)}</div>` : '';
        };

        const close = () => {
            if (portal) {
                portal.remove();
                portal = null;
            }
            activeHost = null;
            activeMode = '';
        };

        const place = host => {
            if (!portal || !host) return;
            const rect = host.getBoundingClientRect();
            const margin = 8;
            const details = isDetailsHost(host);
            const preferredWidth = details ? 540 : 780;
            const minWidth = details ? 300 : 260;
            const width = Math.max(Math.min(preferredWidth, window.innerWidth - margin * 2), Math.min(minWidth, window.innerWidth - margin * 2));
            portal.style.width = width + 'px';
            portal.style.minWidth = Math.min(minWidth, width) + 'px';

            let left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
            let top = rect.bottom + 6;
            portal.style.left = left + 'px';
            portal.style.top = top + 'px';

            let after = portal.getBoundingClientRect();
            if (after.right > window.innerWidth - margin) {
                left = Math.max(margin, window.innerWidth - after.width - margin);
                portal.style.left = left + 'px';
            }
            if (after.left < margin) {
                portal.style.left = margin + 'px';
            }
            after = portal.getBoundingClientRect();
            if (after.bottom > window.innerHeight - margin) {
                top = Math.max(margin, rect.top - after.height - 6);
                portal.style.top = top + 'px';
            }
        };

        const open = (host, mode) => {
            if (!host) return;
            const html = getTooltipHtml(host);
            if (!html) return;
            if (portal && activeHost === host && activeMode === mode) {
                place(host);
                return;
            }

            close();
            activeHost = host;
            activeMode = mode;
            portal = document.createElement('div');
            portal.className = 'slf-transfer-html-tooltip-portal ' + (mode === 'click' ? 'slf-transfer-tooltip-click' : 'slf-transfer-tooltip-hover');
            portal.innerHTML = html;
            document.body.appendChild(portal);
            place(host);
        };

        const getHoverHost = target => {
            const host = target?.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host || isDetailsHost(host)) return null;
            return host;
        };

        document.addEventListener('mouseover', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('mouseout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            const related = e.relatedTarget;
            if (related && host.contains(related)) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('focusin', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            open(host, 'hover');
        }, true);

        document.addEventListener('focusout', e => {
            const host = getHoverHost(e.target);
            if (!host) return;
            if (activeHost === host && activeMode === 'hover') close();
        }, true);

        document.addEventListener('click', e => {
            const host = e.target.closest?.('.slf-transfer-chip-tooltip-host');
            if (!host) {
                if (!e.target.closest?.('.slf-transfer-html-tooltip-portal')) close();
                return;
            }

            normalizeHostTitle(host);

            if (!isDetailsHost(host)) {
                return;
            }

            if (host === activeHost && portal && activeMode === 'click') close();
            else open(host, 'click');

            e.stopPropagation();
            e.preventDefault();
        }, true);

        window.addEventListener('scroll', () => activeHost ? place(activeHost) : null, true);
        window.addEventListener('resize', () => activeHost ? place(activeHost) : null);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        }, true);
    },

    buildStructuredMarkerTooltipHtml(marker) {
        if (!marker) return '';

        const category = this.markerCategory(marker);
        const esc = value => this.escapeHtml(value == null || value === '' ? '—' : String(value));
        const row = (label, value) => `
            <div style="display:grid;grid-template-columns:145px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid #2b2b2b;text-align:left;">
                <span style="color:#aaa;">${esc(label)}</span>
                <span style="color:#ddd;">${esc(value)}</span>
            </div>
        `;
        const section = (title, rows) => `
            <div style="margin:0 0 8px 0;">
                <div style="font-weight:bold;color:#ffd76a;margin-bottom:4px;">${esc(title)}</div>
                ${(rows || []).filter(Boolean).join('')}
            </div>
        `;

        const label = marker.label || '';
        const score = Number(marker.score || 0);
        const baseRows = [
            row('Маркер', label),
            row('Тип', category || 'other'),
            row('Сила сигнала', `${score >= 0 ? '+' : ''}${score}`),
            marker.redFlag ? row('Риск', 'красный флаг') : '',
            marker.hardStop ? row('Стоп', 'hard-stop') : '',
            row('Смысл', marker.text || label)
        ];

        if (category === 'market') {
            const details = marker.marketDetails || {};
            const current = details.currentInfo || {};
            const baseline = details.baseline || null;
            const nominal = details.nominal || {};
            const comparison = baseline?.p75 && current?.value
                ? `текущая цена ${Number(current.value) > Number(baseline.p75) ? 'выше' : 'ниже'} p75 примерно в ${Number(current.value / baseline.p75).toFixed(2)}x`
                : 'нет достаточной базы для сравнения';

            return [
                section('Рынок SLF', [
                    row('Цена сейчас', this.formatSlfMoneyShort(current.value)),
                    row('База скилла MKT', details.skillBasis?.label || ''),
                    row('Рыночный ориентир p75', baseline ? this.formatSlfMoneyShort(baseline.p75) : 'нет выборки'),
                    baseline && current?.value ? row('Отношение к p75', details.ratioText || `${Number(current.value / baseline.p75).toFixed(2)}x`) : '',
                    baseline ? row('Диапазон продаж', `${this.formatSlfMoneyShort(baseline.min)} – ${this.formatSlfMoneyShort(baseline.max)}`) : '',
                    baseline ? row('Выборка', `${baseline.count || 0} продаж`) : '',
                    baseline ? row('Доверие', baseline.confidence || '') : ''
                ]),
                section('Номинал', [
                    row('Номинал', nominal.ratioText || ''),
                    row('Базовый номинал', this.formatSlfMoneyShort(nominal.baseNominal || 0))
                ]),
                section('Сравнение', [
                    row('К p75', comparison),
                    row('Вывод', details.conclusion || marker.text || '')
                ])
            ].join('');
        }

        if (category === 'slf') {
            return section('SLF alter.php', [
                row('SLF delta', label),
                row('Что значит', marker.text || 'сравнение current skill и ИТОГ'),
                row('Решение', score > 0 ? 'положительный внутренний сигнал' : score < 0 ? 'риск просадки относительно ИТОГ' : 'нейтрально')
            ]);
        }

        if (category === 'activity') {
            return section('Готовность / минуты', [
                row('MIN', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score >= 3 ? 'готовность подтверждена' : score < 0 ? 'риск отсутствия актуальной практики' : 'нужна ручная проверка')
            ]);
        }

        if (category === 'tm') {
            return section('Transfermarkt value', [
                row('TM €', label),
                row('Источник', 'Transfermarkt как внешний ориентир, не SLF-цена'),
                row('Что значит', marker.text || '')
            ]);
        }

        if (category === 'trend') {
            return section('Пик / динамика цены', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', String(label).toLowerCase().includes('fall') ? 'сильный риск падения/старого пика' : 'проверка актуальности относительно пика')
            ]);
        }

        if (category === 'age') {
            return section('Возраст / стадия', [
                row('Возрастной маркер', label),
                row('Стадия', marker.text || ''),
                row('Влияние', score >= 3 ? 'рост/перепродажа возможны' : score < 0 ? 'возрастной риск' : 'оценивать как текущую пользу')
            ]);
        }

        if (category === 'club' || category === 'agent') {
            return section(category === 'club' ? 'Клубный статус' : 'Агент', [
                row('Маркер', label),
                row('Что значит', marker.text || ''),
                row('Риск', marker.redFlag ? 'повышенный' : 'обычный / неизвестный')
            ]);
        }

        if (category === 'contract') {
            return section('Контракт', [
                row('Статус', label),
                row('Что значит', marker.text || ''),
                row('Влияние', marker.redFlag ? 'нужна ручная проверка срока/доступности' : 'положительный или нейтральный статус')
            ]);
        }

        if (category === 'why') {
            return section('Почему такой ранг', [
                row('why', label),
                row('Главные причины', marker.text || ''),
                row('Как использовать', 'быстрый сжатый вывод; подробная расшифровка остаётся в «подробнее»')
            ]);
        }

        if (category === 'talent' || category === 'league') {
            return section('Рост / уровень лиги', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'потенциальный плюс к развитию/таланту' : 'слабый или рискованный сигнал')
            ]);
        }

        if (category === 'academy') {
            return section('Академия / клубный след', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'добавляет доверия к профилю' : 'нейтральный или неизвестный след')
            ]);
        }

        if (category === 'rumor') {
            return section('Интерес / слухи', [
                row('Сигнал', label),
                row('Что значит', marker.text || ''),
                row('Влияние', score > 0 ? 'внешний спрос поддерживает актуальность' : 'слабый или отсутствующий сигнал')
            ]);
        }

        return section('Маркер анализа', baseRows);
    },

    renderCompactChip(marker) {
        const label = String(marker?.label || '');
        const structuredTooltip = this.buildStructuredMarkerTooltipHtml(marker);
        const category = this.markerCategory(marker);
        const isMarket = category === 'market';
        const priority = String(marker?.visualPriority || (['slf', 'market', 'tm', 'activity'].includes(category) ? 'high' : ['talent', 'league', 'trend'].includes(category) ? 'medium' : 'low'));
        const priorityCss = priority === 'high'
            ? 'font-weight:700;padding:1px 5px;min-height:18px;line-height:17px;'
            : priority === 'low'
                ? 'font-weight:400;opacity:.78;filter:saturate(.75);'
                : 'font-weight:500;';
        const chipBase = `
            box-sizing:border-box;
            margin:0;
            padding:0 4px;
            border:1px solid ${this.borderByLevel(marker.level)};
            border-radius:4px;
            color:${this.colorByLevel(marker.level)};
            background:${this.bgByLevel(marker.level)};
            vertical-align:middle;
            line-height:16px;
            min-height:17px;
            font-size:10px;
            ${priorityCss}
            text-align:center;
        `;
        const marketCss = `
            display:inline-flex;
            flex:0 0 auto;
            width:auto;
            min-width:max-content;
            max-width:none;
            white-space:nowrap;
            overflow:visible;
            text-overflow:clip;
            cursor:help;
        `;
        const normalCss = `
            display:inline-flex;
            flex:0 1 auto;
            min-width:38px;
            max-width:110px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            cursor:help;
        `;

        this.ensureHtmlTooltipStyles();

        return `
            <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip ${isMarket ? 'slf-transfer-mkt-leaf-badge' : ''}" data-slf-tip-category="${this.escapeHtml(category || 'other')}" tabindex="0" style="
                ${chipBase}
                ${isMarket ? marketCss : normalCss}
            ">
                <span style="display:inline-block;min-width:${isMarket ? 'max-content' : '0'};max-width:${isMarket ? 'none' : '100%'};white-space:nowrap;overflow:${isMarket ? 'visible' : 'hidden'};text-overflow:${isMarket ? 'clip' : 'ellipsis'};">${this.escapeHtml(label)}</span>
                <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
            </span>
        `;
    },

    shouldShowCompactMarker(marker) {
        if (!marker) return false;

        const label = String(marker.label || '');
        const level = String(marker.level || '');

        if (marker.hardStop || marker.redFlag) return true;
        if (['skip', 'risk', 'hot', 'good', 'watch'].includes(level)) return true;

        if (label.startsWith('SLF ')) return true;
        if (label.includes('now ')) return true;
        if (label.includes('no current')) return true;
        if (label.includes('T') && label.includes('<L')) return true;
        if (label.includes('>') && /\d/.test(label)) return true;

        if (label.includes('TM €')) return true;
        if (label.includes('peak')) return true;
        if (label.includes('collapsed')) return true;
        if (label.includes('contract')) return true;
        if (label.includes('exp ')) return true;
        if (label.includes('rumors') && !label.includes('RUMORS 0')) return true;

        if (label.includes('elite')) return true;
        if (label.includes('strong')) return true;

        return false;
    },

    cleanupStandaloneMarketNominalControls(root = document) {
        const scope = root || document;
        const duplicateDetails = [...scope.querySelectorAll('.slf-transfer-details > summary')]
            .filter(summary => /^(MKT|N)$/i.test((summary.textContent || '').trim()))
            .map(summary => summary.closest('.slf-transfer-details'))
            .filter(Boolean);

        if (duplicateDetails.length) {
            console.warn('[SLF Transfer Analyzer] removed standalone MKT/N controls', duplicateDetails.length);
            duplicateDetails.forEach(el => el.remove());
        }
    },

    bindDetailsAutoClose() {
        if (window.__slf_transfer_details_autoclose) return;
        window.__slf_transfer_details_autoclose = true;

        const positionOpenDetails = details => {
            if (!details || !details.open) return;
            const summary = details.querySelector('summary');
            const popup = details.querySelector(':scope > div');
            if (!summary || !popup) return;

            const rect = summary.getBoundingClientRect();
            popup.style.position = 'fixed';
            popup.style.zIndex = '2147483647';
            popup.style.background = '#181818';
            popup.style.opacity = '1';
            popup.style.pointerEvents = 'auto';
            popup.style.maxWidth = 'min(720px, calc(100vw - 24px))';
            popup.style.maxHeight = 'min(520px, calc(100vh - 24px))';
            popup.style.overflow = 'auto';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';

            const popupWidth = Math.min(popup.offsetWidth || 620, window.innerWidth - 24);
            let left = Math.min(Math.max(12, rect.left), window.innerWidth - popupWidth - 12);
            let top = rect.bottom + 8;

            const popupHeight = Math.min(popup.offsetHeight || 360, window.innerHeight - 24);
            if (top + popupHeight > window.innerHeight - 12) {
                top = Math.max(12, rect.top - popupHeight - 8);
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        };

        const positionAllOpenDetails = () => {
            document.querySelectorAll('.slf-transfer-details[open]').forEach(positionOpenDetails);
        };

        window.addEventListener('scroll', positionAllOpenDetails, true);
        window.addEventListener('resize', positionAllOpenDetails, true);

        document.addEventListener('click', e => {
            const clickedDetails = e.target.closest?.('.slf-transfer-details') || null;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                if (clickedDetails !== details) {
                    details.removeAttribute('open');
                }
            });
        }, true);

        document.addEventListener('toggle', e => {
            const details = e.target;

            if (!details || !details.matches || !details.matches('.slf-transfer-details')) return;
            if (!details.open) return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(other => {
                if (other !== details) {
                    other.removeAttribute('open');
                }
            });

            requestAnimationFrame(() => positionOpenDetails(details));
        }, true);

        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;

            document.querySelectorAll('.slf-transfer-details[open]').forEach(details => {
                details.removeAttribute('open');
            });
        }, true);
    },

    buildMarkers(row, profile, slfAlter) {
        return [
            this.getClubStatusMarker(profile),
            this.getAgentMarker(profile),
            this.getSlfSkillMarker(slfAlter),
            this.getSlfCurrentActivityMarker(slfAlter),
            this.getSlfTalentUpgradeMarker(slfAlter),
            this.getSlfLeagueSignalMarker(slfAlter),
            this.getAgeMarker(slfAlter?.age || profile.age || row.age),
            this.getTmValueMarker(profile),
            this.getMarketSalePriceMarker(row, slfAlter),
            this.getValueTrendMarker(profile),
            this.getContractMarker(profile.contractExpires),
            this.getRumorMarker(profile.rumors),
            this.getAcademyMarker(profile.transferHistory, profile.youthClubs)
        ].filter(Boolean);
    },

    getSlfSkillMarker(alter) {
        if (!alter || alter.currentSkill == null || alter.finalSkill == null) {
            return {
                label: 'SLF ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не дал текущий и итоговый скилл.'
            };
        }

        const delta = Number(alter.skillDelta || 0);
        const finalSkill = SLFAlterLayer.formatSkill(alter.finalSkill);
        const label = `SLF ${SLFAlterLayer.formatDelta(delta)}`;

        return {
            label,
            level: delta > 0 ? 'good' : delta < 0 ? 'risk' : 'neutral',
            score: delta > 0 ? 3 : delta < 0 ? -2 : 0,
            redFlag: delta < 0,
            hardStop: false,
            text: `ИТОГ alter.php: ${finalSkill}. Чистая разница current skill → ИТОГ: ${SLFAlterLayer.formatDelta(delta)}. Пороги пока не фиксируем, смотри само число.`
        };
    },

    getSlfCurrentActivityMarker(alter) {
        if (!alter) {
            return {
                label: 'MIN ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'alter.php не прочитан.'
            };
        }

        const seasonLabel = alter.currentSeasonLabel || alter.currentSeasonYear || 'текущий сезон';

        if (alter.staleActivity || !alter.hasCurrentSeason) {
            return {
                label: 'MIN -',
                level: 'risk',
                score: -3,
                redFlag: true,
                hardStop: false,
                text: `На alter.php нет строки с пометкой "Текущий". Последний найденный сезон: ${alter.lastSeasonYear || '?'}. Это маркер, что игрок может не играть сейчас.`
            };
        }

        const row = alter.currentRow;

        if (!row) {
            return {
                label: 'MIN ?',
                level: 'risk',
                score: -2,
                redFlag: true,
                hardStop: false,
                text: `Есть текущий сезон ${seasonLabel}, но нет лиговой строки с уровнем лиги/минутами.`
            };
        }

        const pct = Number(row.minutesPct || 0);
        const league = row.leagueLevel != null ? `L${row.leagueLevel}/${row.leagueSkill}` : 'L?';

        if (pct >= 40) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'good',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Текущий сезон ${seasonLabel}: ${pct}% минут, ${row.minutes || 0} минут, ${row.gamesPlayed}/${row.gamesPossible} игр, стартов ${row.starts ?? '?'}.`
            };
        }

        if (pct > 0) {
            return {
                label: `MIN ${pct}% ${league}`,
                level: 'watch',
                score: 1,
                redFlag: false,
                hardStop: false,
                text: `В текущем сезоне ${seasonLabel} игрок играет, но пока меньше 40% минут.`
            };
        }

        return {
            label: `MIN 0% ${league}`,
            level: 'risk',
            score: -2,
            redFlag: true,
            hardStop: false,
            text: `Текущий сезон ${seasonLabel} есть, но игровые минуты 0%.`
        };
    },

    getSlfTalentUpgradeMarker(alter) {
        if (!alter || !alter.talentUpgradeEligible || !alter.talentUpgradeRow) {
            return null;
        }

        const row = alter.talentUpgradeRow;
        const isCurrent = row.isCurrentSeason === true;

        return {
            label: `T${alter.talent}<L${row.leagueLevel} ${row.minutesPct}%`,
            level: isCurrent ? 'hot' : 'good',
            score: isCurrent ? 5 : 3,
            redFlag: false,
            hardStop: false,
            text: `Талант игрока ${alter.talent}, а был сезон ${row.seasonLabel || row.season} с ${row.minutesPct}% минут в лиге уровня ${row.leagueLevel}/${row.leagueSkill}. Это сигнал возможного повышения таланта.`
        };
    },

    getSlfLeagueSignalMarker(alter) {
        if (!alter || !alter.currentRow) return null;

        const row = alter.currentRow;
        const currentSkill = SLFAlterLayer.formatSkill(alter.currentSkill);

        if (alter.leagueAboveSkill) {
            return {
                label: `L${row.leagueSkill}>${currentSkill}`,
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Игрок сейчас играет в лиге скилла ${row.leagueSkill}, выше текущего скилла ${alter.currentSkill}.`
            };
        }

        if (row.leagueSkill != null && alter.currentSkill != null && Number(row.leagueSkill) < Number(alter.currentSkill)) {
            return {
                label: `L${row.leagueSkill}<${currentSkill}`,
                level: 'watch',
                score: -1,
                redFlag: false,
                hardStop: false,
                text: `Текущая лига ниже скилла игрока. Это слабее как сигнал роста.`
            };
        }

        return null;
    },

    getAgeMarker(age) {
        const cfg = this.getCfg().ageGroups || {};

        if (!age) {
            return { label: 'age ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Возраст не найден.' };
        }

        if (age <= (cfg.academyMax || 18)) {
            return { label: `age ${age} acad`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Очень молодой игрок. Можно ниже планку текущего скилла, если есть другие сильные сигналы.' };
        }

        if (age <= (cfg.growthMax || 21)) {
            return { label: `age ${age} grow`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Возрастное окно роста.' };
        }

        if (age <= (cfg.lateGrowthMax || 24)) {
            return { label: `age ${age} late`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Ещё возможен рост, но уже нужен нормальный скилл или сильный TM-профиль.' };
        }

        if (age <= (cfg.primeMax || 29)) {
            return { label: `age ${age} prime`, level: 'normal', score: 2, redFlag: false, hardStop: false, text: 'Игрок здесь и сейчас.' };
        }

        if (age <= (cfg.shortTermMax || 32)) {
            return { label: `age ${age} short`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Краткосрочное усиление. Нужен высокий скилл и разумная цена.' };
        }

        return { label: `age ${age} vet`, level: 'risk', score: -1, redFlag: true, hardStop: false, text: 'Возрастной риск.' };
    },

    getClubStatusMarker(profile) {
        const club = this.normalizeText(profile?.currentClub || '');

        if (!this.isUsefulTmText(club)) {
            return {
                label: 'club ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Текущий клуб не найден.'
            };
        }

        if (this.isRetired(profile)) {
            return {
                label: 'retired',
                level: 'skip',
                score: -100,
                redFlag: true,
                hardStop: true,
                text: 'Transfermarkt показывает Current club: Retired. Игрок завершил карьеру — не покупать.'
            };
        }

        if (this.isFreeAgent(profile)) {
            const age = Number(profile.age || 0);
            const minutes = profile.activity?.minutesPct;

            if (age >= 29 || minutes === 0) {
                return {
                    label: 'no club',
                    level: 'risk',
                    score: -2,
                    redFlag: true,
                    hardStop: false,
                    text: 'Игрок без клуба. Для возрастного или неиграющего игрока это сильный риск.'
                };
            }

            return {
                label: 'no club',
                level: 'watch',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок без клуба. Может быть возможностью, но требует ручной проверки.'
            };
        }

        return {
            label: 'club ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Текущий клуб: ${club}`
        };
    },

    getAgentMarker(profile) {
        const agent = this.normalizeText(profile?.playerAgent || '');

        if (!this.isUsefulTmText(agent)) {
            return {
                label: 'agent ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Агент не найден.'
            };
        }

        if (this.isNoAgent(profile)) {
            const age = Number(profile.age || 0);
            const free = this.isFreeAgent(profile);

            const strongRisk = age >= 29 || free;

            return {
                label: 'no agent',
                level: strongRisk ? 'risk' : 'watch',
                score: strongRisk ? -2 : -1,
                redFlag: strongRisk,
                hardStop: false,
                text: 'Player agent: no agent. Само по себе не стоп, но усиливает риск у свободных/возрастных/неиграющих игроков.'
            };
        }

        return {
            label: 'agent ✓',
            level: 'normal',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: `Агент: ${agent}`
        };
    },

    getTmValueMarker(profileOrValue) {
        const cfg = this.getCfg().tmValue || {};
        const profile = profileOrValue && typeof profileOrValue === 'object'
            ? profileOrValue
            : null;

        if (profile && this.isRetired(profile)) {
            const oldValue = Number(profile.lastKnownMarketValueEur || profile.highestMarketValueEur || 0);

            if (!oldValue) {
                return {
                    label: 'old €?',
                    level: 'old',
                    score: 0,
                    redFlag: false,
                    hardStop: false,
                    text: 'Игрок Retired. Текущей рыночной цены нет; TM-стоимость, если она была, является исторической.'
                };
            }

            return {
                label: `old ${TMEnrichmentLayer.formatMoney(oldValue)}`,
                level: 'old',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Игрок Retired. Эта сумма не текущая рыночная цена, а последняя/историческая оценка Transfermarkt. Для покупки она почти не имеет положительного веса.'
            };
        }

        const value = profile
            ? Number(profile.marketValueEur || 0)
            : Number(profileOrValue || 0);

        if (!value) {
            return { label: 'TM €?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Реальная цена TM не найдена.' };
        }

        if (value >= (cfg.high || 1000000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'hot', score: 4, redFlag: false, hardStop: false, text: 'Высокая реальная цена TM. Это сильный внешний сигнал актуальности игрока.' };
        }

        if (value >= (cfg.good || 300000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Хорошая реальная цена TM.' };
        }

        if (value >= (cfg.normal || 100000)) {
            return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'normal', score: 1, redFlag: false, hardStop: false, text: 'Нормальная реальная цена TM.' };
        }

        return { label: `TM ${TMEnrichmentLayer.formatMoney(value)}`, level: 'low', score: 0, redFlag: false, hardStop: false, text: 'Низкая реальная цена TM.' };
    },

    getMarketSalePriceMarker(row, slfAlter) {
        if (this.isHistoryPage() || row?.completedTransfer) {
            return null;
        }

        const currentInfo = this.getCurrentSlfMarketPrice(row);
        const current = Number(currentInfo.value || 0);
        const nominalRatio = Number(row?.nominalRatio || currentInfo.nominalRatio || 0);
        const baseNominal = current && nominalRatio ? Math.round(current / nominalRatio) : Number(row?.nominalBase || currentInfo.nominalBase || 0);
        const nominalText = nominalRatio ? `${nominalRatio.toFixed(1).replace(/\.0$/, '')}x` : '';

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const unknownDetails = {
            currentInfo,
            baseline: null,
            ratio: 0,
            ratioText: '?',
            skillBasis,
            nominal: {
                ratio: nominalRatio || null,
                ratioText: nominalText,
                baseNominal
            },
            conclusion: 'нет текущей цены, alter.php ИТОГ или рыночной базы для сравнения'
        };

        if (!current) {
            return {
                label: 'MKT ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: unknownDetails,
                text: 'MKT: текущая SLF-цена из ячейки Цена не распознана.'
            };
        }

        if (!skillBasis.skill) {
            const shortCurrent = this.formatSlfMoneyShort(current);
            const fallbackText = skillBasis.pageSkill
                ? `Текущий скилл со страницы ${SLFAlterLayer.formatSkill(skillBasis.pageSkill)} показан только как контекст и не используется для MKT.`
                : 'Текущий скилл со страницы не используется для MKT.';

            return {
                label: `MKT ${shortCurrent} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: `MKT не рассчитан: нужен ИТОГ из alter.php. ${fallbackText}`
                }),
                text: `MKT: ${shortCurrent}, но p75 не считается без ИТОГ alter.php. ${fallbackText}`
            };
        }

        const baseline = this.findMarketBaseline(row, slfAlter);
        const p75 = Number(baseline?.p75 || 0);

        if (!baseline || !p75) {
            return {
                label: `MKT ${this.formatSlfMoneyShort(current)} / ?`,
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                category: 'market',
                marketDetails: Object.assign({}, unknownDetails, {
                    baseline: null,
                    conclusion: 'нет достаточной completed-transfer выборки для p75'
                }),
                text: `MKT: текущая SLF цена ${this.formatSlfMoneyShort(current)}, p75 недоступен.`
            };
        }

        const ratio = current / p75;
        const ratioText = `${ratio.toFixed(2)}x`;
        let level = 'neutral';
        let score = 0;
        let conclusion = 'около рыночного p75; решение зависит от позиции, возраста, скилла и TM-сигнала.';

        if (baseline.count < 3 || baseline.confidence === 'weak') {
            level = 'unknown';
            score = 0;
            conclusion = 'маленькая выборка; использовать как слабый ориентир и проверить вручную.';
        } else if (current <= p75 * 0.85) {
            level = 'good';
            score = 3;
            conclusion = 'ниже верхнего рыночного ориентира p75; потенциально выгодно при нормальных игровых сигналах.';
        } else if (current <= p75 * 1.05) {
            level = 'normal';
            score = 1;
            conclusion = 'около p75; справедливая цена при подтверждении скилла/возраста/позиции.';
        } else if (current <= p75 * 1.50) {
            level = 'watch';
            score = -1;
            conclusion = 'выше p75; дорого, покупать только при сильном подтверждении потенциала или редкости позиции.';
        } else {
            level = 'risk';
            score = -3;
            conclusion = 'сильно выше верхнего рыночного ориентира; высокий риск переплаты.';
        }

        const shortCurrent = this.formatSlfMoneyShort(current);
        const shortP75 = this.formatSlfMoneyShort(p75);

        return {
            label: `MKT ${shortCurrent} / ${shortP75} · ${ratioText}`,
            level,
            score,
            redFlag: level === 'risk',
            hardStop: false,
            category: 'market',
            marketDetails: {
                currentInfo,
                baseline,
                ratio,
                ratioText,
                skillBasis,
                diffPct: Math.round((ratio - 1) * 100),
                nominal: {
                    ratio: nominalRatio || null,
                    ratioText: nominalText,
                    baseNominal
                },
                conclusion
            },
            text: `MKT ${shortCurrent} / ${shortP75}: сравнение текущей SLF-цены с p75 completed transfers (${ratioText}). База скилла: ${skillBasis.label}.`
        };
    },


    getValueTrendMarker(profile) {
        if (this.isRetired(profile)) return null;

        const current = Number(profile?.marketValueEur || 0);
        const highest = Number(profile?.highestMarketValueEur || 0);
        const ratio = Number(profile?.valuePeakRatio || 0);
        const cfg = this.getCfg().valueTrend || {};

        if (!current || !highest || !ratio) {
            return {
                label: 'trend ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'Не удалось сравнить текущую и максимальную цену TM.'
            };
        }

        const percent = Math.round(ratio * 100);
        const peakYear = Number((String(profile.highestMarketValueDate || '').match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();
        const isOldPeak = peakYear && currentYear - peakYear >= (cfg.oldPeakYears || 5);

        if (ratio >= (cfg.nearPeakRatio || 0.80)) {
            return {
                label: `peak ${percent}%`,
                level: 'good',
                score: 3,
                redFlag: false,
                hardStop: false,
                text: 'Текущая цена близка к максимальной. Игрок актуален по TM.'
            };
        }

        if (ratio >= (cfg.stillValuableRatio || 0.50)) {
            return {
                label: `peak ${percent}%`,
                level: 'normal',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: 'Цена ниже максимума, но игрок остаётся достаточно ценным по TM.'
            };
        }

        if (ratio >= (cfg.belowPeakRatio || 0.20)) {
            return {
                label: `peak ${percent}%`,
                level: isOldPeak ? 'risk' : 'watch',
                score: isOldPeak ? -2 : -1,
                redFlag: isOldPeak,
                hardStop: false,
                text: isOldPeak
                    ? 'Цена заметно ниже старого пика. Старый пик может вводить в заблуждение.'
                    : 'Цена заметно ниже пика. Нужна ручная проверка динамики.'
            };
        }

        return {
            label: `fall ${percent}%`,
            level: 'risk',
            score: -3,
            redFlag: true,
            hardStop: false,
            text: 'Игрок сильно дешевле своего пика. Это красный маркер, особенно у возрастных/без клуба.'
        };
    },

    getContractMarker(text) {
        if (!this.isUsefulTmText(text)) {
            return { label: 'ctr ?', level: 'unknown', score: 0, redFlag: false, hardStop: false, text: 'Контракт не найден.' };
        }

        const year = Number((String(text).match(/20\d{2}/) || [])[0]);
        const currentYear = new Date().getFullYear();

        if (!year) {
            return { label: `ctr ${String(text).slice(0, 10)}`, level: 'unknown', score: 0, redFlag: false, hardStop: false, text: `Контракт найден, но год не распознан: ${text}` };
        }

        if (year <= currentYear) {
            return { label: `exp ${year}`, level: 'risk', score: -2, redFlag: true, hardStop: false, text: 'Контракт истекает или уже истёк. Нужна ручная проверка.' };
        }

        if (year === currentYear + 1) {
            return { label: `exp ${year}`, level: 'watch', score: 1, redFlag: false, hardStop: false, text: 'Контракт скоро заканчивается.' };
        }

        return { label: `ctr ${year}`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Действующий контракт.' };
    },

    getRumorMarker(rumors) {
        const list = this.getUsefulRumors(rumors);

        if (!list.length) {
            return { label: 'R0', level: 'empty', score: 0, redFlag: false, hardStop: false, text: 'Слухов не найдено.' };
        }

        const now = Date.now();

        const fresh = list.filter(r => {
            if (!r.dateTs) return false;

            const days = (now - r.dateTs) / 86400000;
            return days <= 90;
        });

        if (fresh.length >= 3) {
            return { label: `R${fresh.length} fresh`, level: 'hot', score: 5, redFlag: false, hardStop: false, text: 'Много свежего интереса.' };
        }

        if (fresh.length >= 1) {
            return { label: `R${fresh.length} fresh`, level: 'good', score: 3, redFlag: false, hardStop: false, text: 'Есть свежий интерес.' };
        }

        if (list.length >= 3) {
            return { label: `R${list.length}`, level: 'watch', score: 3, redFlag: false, hardStop: false, text: 'Есть слухи, свежесть не распознана.' };
        }

        return { label: `R${list.length}`, level: 'old', score: 1, redFlag: false, hardStop: false, text: 'Слухи есть, но сигнал слабый или дата не распознана.' };
    },

    matchAcademyList(text, list) {
        const lower = this.normalizeLower(text);

        for (const item of list || []) {
            const patterns = item.patterns || [];

            if (patterns.some(pattern => lower.includes(String(pattern).toLowerCase()))) {
                return item;
            }
        }

        return null;
    },

    getAcademyMarker(history, youthClubs) {
        const rows = Array.isArray(history) ? history : [];
        const youth = Array.isArray(youthClubs) ? youthClubs : [];

        if (!rows.length && !youth.length) {
            return {
                label: 'acad ?',
                level: 'unknown',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: 'История переходов и Youth Clubs не найдены.'
            };
        }

        const text = [
            ...rows.map(x => x.text || ''),
            ...youth
        ].join(' ');

        const cfg = this.getCfg();

        const elite = this.matchAcademyList(text, cfg.eliteAcademies || []);

        if (elite) {
            return {
                label: 'elite',
                level: 'hot',
                score: 4,
                redFlag: false,
                hardStop: false,
                text: `Топовая академия: ${elite.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const strong = this.matchAcademyList(text, cfg.strongAcademies || []);

        if (strong) {
            return {
                label: 'strong',
                level: 'good',
                score: 2,
                redFlag: false,
                hardStop: false,
                text: `Сильный клубный след: ${strong.label}. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        const lower = this.normalizeLower(text);
        const hasYouthTrace = /\bu1[7-9]\b|\bu2[0-3]\b|\bu-1[7-9]\b|\bu-2[0-3]\b|\byouth\b|\bacademy\b|\bii\b|\bb\b|юнош/i.test(lower);

        if (hasYouthTrace || youth.length) {
            return {
                label: 'youth',
                level: 'neutral',
                score: 0,
                redFlag: false,
                hardStop: false,
                text: `Есть молодёжный след, но клуб не входит в список топовых/сильных академий. Youth Clubs: ${youth.join(', ') || 'нет отдельного блока'}.`
            };
        }

        return {
            label: 'acad -',
            level: 'empty',
            score: 0,
            redFlag: false,
            hardStop: false,
            text: 'Сильного академического сигнала нет.'
        };
    },

    buildTransferVerdict(markers, profile, slfAlter) {
        const cfg = this.getCfg().verdict || {};
        const score = markers.reduce((sum, m) => sum + Number(m.score || 0), 0);

        const hardStop = markers.find(m => m.hardStop);

        if (hardStop) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: hardStop.text || hardStop.label
            };
        }

        const redFlags = markers.filter(m => m.redFlag || m.level === 'risk');
        const redFlagCount = redFlags.length;
        const hotCount = markers.filter(m => m.level === 'hot').length;
        const goodCount = markers.filter(m => m.level === 'good').length;

        const noClub = this.isFreeAgent(profile);
        const noAgent = this.isNoAgent(profile);
        const age = Number(slfAlter?.age || profile?.age || 0);
        const collapsed = markers.some(m => String(m.label || '').includes('collapsed'));
        const inactiveNow = !!slfAlter && (
            slfAlter.staleActivity ||
            !slfAlter.hasCurrentSeason ||
            slfAlter.currentRow?.minutesPct === 0
        );

        if (
            noClub &&
            noAgent &&
            (inactiveNow || collapsed || age >= 30)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Без клуба + no agent + inactive/collapsed/age risk.'
            };
        }

        if (
            age >= 33 &&
            noClub &&
            (inactiveNow || collapsed)
        ) {
            return {
                label: 'SKIP',
                level: 'skip',
                score,
                reason: 'Возрастной игрок без клуба и без актуального игрового сигнала SLF.'
            };
        }

        const marketMarker = markers.find(m => this.markerCategory(m) === 'market') || null;
        const trendMarker = markers.find(m => this.markerCategory(m) === 'trend') || null;
        const marketRatio = Number(marketMarker?.marketDetails?.ratio || 0);
        const minPct = Number(slfAlter?.currentRow?.minutesPct || 0);
        const peakPct = Number((String(trendMarker?.label || '').match(/peak\s+(\d+)/i) || [])[1] || 0);
        const talent = Number(slfAlter?.talent || 0);
        const currentSkill = Number(slfAlter?.currentSkill || 0);
        const slfDelta = Number(slfAlter?.skillDelta || 0);

        const slfGapVeryGood = slfDelta >= 10 || (marketRatio > 0 && marketRatio <= 0.70) || score >= (cfg.priorityScore || 13);
        const slfGapGood = slfDelta >= 5 || (marketRatio > 0 && marketRatio <= 1.05) || score >= (cfg.targetScore || 8);
        const lateAge = age >= 22 && age <= 24;
        const highPeak = peakPct >= 90;
        const lowReadiness = minPct > 0 && minPct < 40;
        const veryLowReadiness = minPct > 0 && minPct < 30;
        const ready = minPct >= 70;
        const mediumReady = minPct >= 50 && minPct < 70;
        const skillReady = ready || currentSkill >= 130 || (currentSkill >= 120 && minPct >= 50);
        const priceCheapEnough = marketRatio > 0 && marketRatio <= 0.85;
        const priceVeryCheap = marketRatio > 0 && marketRatio <= 0.50;
        const mktOverpriced = marketRatio > 1.05;

        if (slfGapVeryGood && ready && skillReady && highPeak && talent >= 2) {
            return {
                label: 'PRIORITY',
                level: 'hot',
                score,
                reason: 'Готовый актив: высокий gap, MIN 70%+, skill ready, peak 90%+, талант 2+.'
            };
        }

        if (slfGapGood && mktOverpriced && lowReadiness && talent <= 1) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'MKT переплата при низкой готовности и таланте 1: риск false bargain.'
            };
        }

        if (slfGapVeryGood && lateAge && highPeak && lowReadiness) {
            return {
                label: 'SPEC',
                level: 'spec',
                score,
                reason: 'Сильный gap, но низкая готовность: late-growth gamble, нужна ручная проверка.'
            };
        }

        if (slfGapGood && veryLowReadiness && talent <= 1 && !priceVeryCheap) {
            return {
                label: 'TRAP?',
                level: 'risk',
                score,
                reason: 'Gap есть, но MIN < 30% и талант 1: риск false bargain.'
            };
        }

        if (slfGapGood && mediumReady && (peakPct >= 80 || highPeak) && redFlagCount < 2) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат: gap подтверждён, готовность средняя, hard risk не доминирует.'
            };
        }

        if (slfGapGood && ready && talent <= 1 && priceCheapEnough) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Готовность высокая и цена достаточно дешёвая, несмотря на talent risk.'
            };
        }

        if (redFlagCount >= (cfg.highRiskRedFlags || 3)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: `Красных флагов: ${redFlagCount}.`
            };
        }

        if (redFlagCount >= 2 && score < (cfg.priorityScore || 13)) {
            return {
                label: 'RISK',
                level: 'risk',
                score,
                reason: 'Несколько рисков без достаточного количества сильных плюсов.'
            };
        }

        if (redFlagCount >= (cfg.manualCheckRedFlags || 1)) {
            return {
                label: 'WATCH',
                level: 'watch',
                score,
                reason: 'Есть риск-факторы, нужна ручная проверка.'
            };
        }

        if (score >= (cfg.priorityScore || 13) || (hotCount >= 2 && score >= 9)) {
            return {
                label: ready && skillReady ? 'PRIORITY' : 'WATCH',
                level: ready && skillReady ? 'hot' : 'watch',
                score,
                reason: ready && skillReady
                    ? 'Сильный кандидат по TM и/или SLF alter-сигналам, готовность подтверждена.'
                    : 'Сильные сигналы есть, но готовность недостаточно подтверждена для PRIORITY.'
            };
        }

        if (score >= (cfg.targetScore || 8) || goodCount >= 3) {
            return {
                label: 'TARGET',
                level: 'good',
                score,
                reason: 'Хороший кандидат без крупных красных флагов.'
            };
        }

        if (score >= (cfg.watchlistScore || 3)) {
            return {
                label: 'WATCH',
                level: 'normal',
                score,
                reason: 'Есть полезные сигналы, но пока не приоритет.'
            };
        }

        return {
            label: 'WATCH',
            level: 'neutral',
            score,
            reason: 'Мало сильных сигналов.'
        };
    },

    colorByLevel(level) {
        return {
            skip: '#ff4d4d',
            risk: '#ff7777',
            watch: '#ffd166',
            spec: '#9fb8cc',
            old: '#b8b8b8',
            low: '#b8b8b8',
            empty: '#777',
            unknown: '#aaa',
            neutral: '#d7d7d7',
            normal: '#c9ff8a',
            good: '#6dff8c',
            hot: '#00f080'
        }[level] || '#ddd';
    },

    bgByLevel(level) {
        return {
            skip: '#3a1010',
            risk: '#301515',
            watch: '#302610',
            spec: '#182533',
            old: '#202020',
            low: '#202020',
            empty: '#171717',
            unknown: '#1d1d1d',
            neutral: '#202020',
            normal: '#173018',
            good: '#12351e',
            hot: '#0b3b22'
        }[level] || '#202020';
    },

    borderByLevel(level) {
        return {
            skip: '#9b3030',
            risk: '#854040',
            watch: '#7a6422',
            spec: '#49687f',
            old: '#555',
            low: '#555',
            empty: '#333',
            unknown: '#444',
            neutral: '#555',
            normal: '#4b7d2d',
            good: '#2f8f4c',
            hot: '#00a65a'
        }[level] || '#555';
    },

    sortByDataset(datasetKey, direction = 'desc', label = datasetKey) {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, datasetKey, direction);
        this.setStatus(`Сортировка ${label} ${direction === 'asc' ? '↑' : '↓'}`);
    },

    sortRowsInTableByDataset(table, datasetKey, direction = 'desc') {
        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfPlayerId);

        rows.sort((a, b) => {
            const avRaw = a.dataset[datasetKey];
            const bvRaw = b.dataset[datasetKey];

            const av = avRaw == null || avRaw === '' ? -999999999 : Number(avRaw);
            const bv = bvRaw == null || bvRaw === '' ? -999999999 : Number(bvRaw);

            if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
            if (Number.isNaN(av)) return 1;
            if (Number.isNaN(bv)) return -1;

            return direction === 'asc'
                ? av - bv
                : bv - av;
        });

        rows.forEach(tr => tbody.appendChild(tr));
    },

    sortByTmValue(direction = 'desc') {
        const table = this.findTransferTable();
        if (!table) return;

        this.sortRowsInTableByDataset(table, 'slfTmValue', direction);
        this.setStatus(direction === 'asc' ? 'Сортировка TM € ↑' : 'Сортировка TM € ↓');
    },

    resetOrder() {
        const table = this.findTransferTable();
        if (!table) return;

        const tbody = table.querySelector('tbody') || table;

        const rows = [...tbody.querySelectorAll('tr')]
            .filter(tr => tr.dataset.slfOriginalIndex);

        rows.sort((a, b) => {
            return Number(a.dataset.slfOriginalIndex) - Number(b.dataset.slfOriginalIndex);
        });

        rows.forEach(tr => tbody.appendChild(tr));

        this.setStatus('Порядок строк восстановлен.');
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
};


// ============================================================
// <<< src/modules/transfer-analyzer/transfer-market-analyzer.js


// >>> src/modules/transfer-analyzer/transfer-history-money-parser-patch.js
// Transfer history money parser patch
// ===================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.slfHistoryMoneyParserPatchApplied = true;

    TransferMarketAnalyzer.parseMoney = function parseMoney(value) {
        const raw = String(value || '')
            .replace(/\u00a0/g, ' ')
            .trim();

        if (!raw) return null;

        const lower = raw.toLowerCase();
        const numberMatches = lower.match(/\d{1,3}(?:[\s'’`]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g);

        if (!numberMatches || !numberMatches.length) return null;

        const token = numberMatches
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .sort((a, b) => {
                const score = value => value.replace(/[^\d]/g, '').length;
                return score(b) - score(a) || b.length - a.length;
            })[0];

        if (!token) return null;

        let normalized = token
            .replace(/[\s'’`]/g, '')
            .replace(/,/g, '.');

        const dotCount = (normalized.match(/\./g) || []).length;
        if (dotCount > 1) {
            const parts = normalized.split('.');
            normalized = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
        }

        const numeric = Number(normalized);
        if (!Number.isFinite(numeric)) return null;

        let multiplier = 1;

        if (/[0-9]\s*[bб](?=$|[^a-zа-яё0-9])|\b(bn|billion)\b|млрд|миллиард/.test(lower)) {
            multiplier = 1000000000;
        } else if (/[0-9]\s*[mм](?=$|[^a-zа-яё0-9])|\b(mln|million)\b|млн|миллион/.test(lower)) {
            multiplier = 1000000;
        } else if (/[0-9]\s*[kк](?=$|[^a-zа-яё0-9])|\b(тыс|thousand)\b/.test(lower)) {
            multiplier = 1000;
        }

        const valueNumber = Math.round(numeric * multiplier);
        return Number.isFinite(valueNumber) && valueNumber > 0 ? valueNumber : null;
    };
}
// <<< src/modules/transfer-analyzer/transfer-history-money-parser-patch.js


// >>> src/modules/transfer-analyzer/transfer-market-ui-compact-mkt.js
// Transfer Analyzer: compact MKT UI + zero-cache runtime
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer && !TransferMarketAnalyzer.slfCompactMktUiApplied) {
    TransferMarketAnalyzer.slfCompactMktUiApplied = true;
    TransferMarketAnalyzer.slfLiveAnalysisRunning = false;
    TransferMarketAnalyzer.slfLiveAnalysisRunId = 0;
    TransferMarketAnalyzer.purchaseForecastLastResult = null;

    TransferMarketAnalyzer.removeMktSortToolbarButtons = function removeMktSortToolbarButtons() {
        [
            'slf-transfer-sort-score',
            'slf-transfer-sort-talent',
            'slf-transfer-sort-mkt-bargain',
            'slf-transfer-sort-mkt-overpriced'
        ].forEach(id => document.getElementById(id)?.remove());
    };

    TransferMarketAnalyzer.formatCompactMktRatio = function formatCompactMktRatio(ratio) {
        const value = Number(ratio || 0);
        if (!Number.isFinite(value) || value <= 0) return '';
        return (value >= 10 ? value.toFixed(1) : value.toFixed(2)).replace(/0$/, '').replace(/\.0$/, '');
    };

    TransferMarketAnalyzer.clearAllTransferAnalysisState = function clearAllTransferAnalysisState() {
        const prefixes = ['slf_transfer_analysis_', 'slf_tm_enrichment_cache_', 'slf_alter_cache_', 'slf_ps2_', 'slf_player_state'];
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i) || '';
            if (prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
        }
        document.querySelectorAll('.slf-transfer-analysis-badge').forEach(node => { node.innerHTML = ''; });
        document.querySelectorAll('tr[data-slf-player-id]').forEach(row => {
            delete row.dataset.slfAnalyzerScore;
            delete row.dataset.slfSkillDelta;
            delete row.dataset.slfMinutesPct;
            delete row.dataset.slfTalentUp;
            delete row.dataset.slfTmValue;
            delete row.dataset.slfMktBargain;
            delete row.dataset.slfMktOverpriced;
        });
    };

    TransferMarketAnalyzer.isFinalTransferMarketPage = function isFinalTransferMarketPage() {
        return location.pathname === '/transfers.php' && !location.search;
    };

    TransferMarketAnalyzer.findPurchaseForecastMarketBox = function findPurchaseForecastMarketBox() {
        const requiredTexts = ['Текущий статус', 'Период проведения', 'Бюджет клуба'];
        return [...document.querySelectorAll('div, table, td')]
            .filter(el => {
                const text = el.innerText || '';
                const rect = el.getBoundingClientRect();
                return requiredTexts.every(part => text.includes(part)) && rect.width > 250 && rect.height > 80;
            })
            .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0] || null;
    };

    TransferMarketAnalyzer.escapeForecastHtml = function escapeForecastHtml(value) {
        if (typeof this.escapeHtml === 'function') return this.escapeHtml(value);
        return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    };

    TransferMarketAnalyzer.formatPurchaseForecastPrice = function formatPurchaseForecastPrice(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n) || n <= 0) return '—';
        return `${this.formatSlfMoneyShort(n)} 🪙`;
    };

    TransferMarketAnalyzer.getPurchaseForecastPositionOptionsHtml = function getPurchaseForecastPositionOptionsHtml() {
        return ['ST', 'CM', 'CD', 'GK', 'DM', 'AM', 'RM', 'LM', 'RD', 'LD'].map(pos => `<option>${pos}</option>`).join('');
    };

    TransferMarketAnalyzer.getPurchaseForecastSkill = function getPurchaseForecastSkill(event, player) {
        const alterSummary = event?.enrichment?.slfAlterSummary || {};
        const candidates = [player?.finalSkill, alterSummary.finalSkill, player?.skill, player?.scoutSkill, player?.currentSkill, event?.skill, event?.scoutSkill, event?.currentSkill];
        for (const candidate of candidates) {
            const value = Number(candidate);
            if (Number.isFinite(value) && value > 0) return value;
        }
        return null;
    };

    TransferMarketAnalyzer.buildPurchaseForecastPlayerUrl = function buildPurchaseForecastPlayerUrl(playerId, playerUrl) {
        if (playerUrl) return playerUrl;
        if (!playerId) return '';
        const path = `/player.php?action=view&id=${encodeURIComponent(playerId)}`;
        return typeof buildSlfUrl === 'function' ? buildSlfUrl(path) : path;
    };

    TransferMarketAnalyzer.extractPurchaseForecastRecord = function extractPurchaseForecastRecord(event) {
        if (!event || !(event.recordType === 'completed_transfer' || event.eventType === 'completed_transfer')) return null;

        const transfer = event.transfer || {};
        const player = event.player || {};
        const clubs = event.clubs || {};
        const positions = Array.isArray(player.positions)
            ? player.positions
            : this.parsePositions?.(player.positions || player.primaryPosition || event.positions || event.position || '') || [];
        const rawPosition = player.primaryPosition || positions[0] || player.position || '';
        const primaryPosition = this.normalizeMarketPosition?.(rawPosition) || String(rawPosition || '').toUpperCase().trim();
        const age = this.parseNumber(player.age ?? event.age);
        const talent = this.parseNumber(player.talent ?? event.talent);
        const skill = this.getPurchaseForecastSkill(event, player);
        const price = Number(transfer.price || event.price || event.salePrice || 0);

        if (!Number.isFinite(price) || price <= 0) return null;

        const playerId = String(player.playerId || event.playerId || event.slfPlayerId || '').trim();
        return {
            event,
            primaryPosition,
            age,
            talent,
            skill,
            price,
            playerId,
            playerName: player.name || event.playerName || event.name || (playerId ? `#${playerId}` : 'Игрок'),
            playerUrl: this.buildPurchaseForecastPlayerUrl(playerId, player.playerUrl || event.playerUrl || event.slfUrl || ''),
            dateText: transfer.dateText || event.dateText || event.transferDateText || '',
            fromClub: clubs.fromName || transfer.fromName || event.fromClub || '',
            toClub: clubs.toName || transfer.toName || event.toClub || ''
        };
    };

    TransferMarketAnalyzer.calculatePurchaseForecast = function calculatePurchaseForecast(events, filters) {
        const position = this.normalizeMarketPosition?.(filters.position) || String(filters.position || '').toUpperCase().trim();
        const records = (events || [])
            .map(event => this.extractPurchaseForecastRecord(event))
            .filter(Boolean)
            .filter(record => {
                if (position && record.primaryPosition !== position) return false;
                if (Number.isFinite(filters.ageFrom) && !(Number(record.age) >= filters.ageFrom)) return false;
                if (Number.isFinite(filters.ageTo) && !(Number(record.age) <= filters.ageTo)) return false;
                if (Number.isFinite(filters.talentFrom) && !(Number(record.talent) >= filters.talentFrom)) return false;
                if (Number.isFinite(filters.talentTo) && !(Number(record.talent) <= filters.talentTo)) return false;
                if (Number.isFinite(filters.skillFrom) && !(Number(record.skill) >= filters.skillFrom)) return false;
                if (Number.isFinite(filters.skillTo) && !(Number(record.skill) <= filters.skillTo)) return false;
                return true;
            });
        const values = records.map(record => Number(record.price || 0)).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
        if (!values.length) return { count: 0, median: null, p75: null, records: [] };
        return { ...this.summarizeMarketValues(values), records: records.sort((a, b) => Number(b.price || 0) - Number(a.price || 0)) };
    };

    TransferMarketAnalyzer.readPurchaseForecastFilters = function readPurchaseForecastFilters() {
        const readNumber = id => {
            const value = Number(String(document.getElementById(id)?.value || '').replace(',', '.'));
            return Number.isFinite(value) ? value : NaN;
        };
        return {
            ageFrom: readNumber('slf-purchase-forecast-age-from'),
            ageTo: readNumber('slf-purchase-forecast-age-to'),
            talentFrom: readNumber('slf-purchase-forecast-talent-from'),
            talentTo: readNumber('slf-purchase-forecast-talent-to'),
            skillFrom: readNumber('slf-purchase-forecast-skill-from'),
            skillTo: readNumber('slf-purchase-forecast-skill-to'),
            position: document.getElementById('slf-purchase-forecast-position')?.value || 'ST'
        };
    };

    TransferMarketAnalyzer.renderPurchaseForecastRows = function renderPurchaseForecastRows(records) {
        const box = document.getElementById('slf-purchase-forecast-list');
        if (!box) return;
        const rows = (records || []).slice(0, 80);
        if (!rows.length) {
            box.innerHTML = '<div style="color:#888;padding:6px 0;">Нет трансферов в текущей выборке.</div>';
            return;
        }
        box.innerHTML = `
            <div style="display:grid;grid-template-columns:62px 1fr 24px 24px 32px 66px;gap:4px;color:#888;font-size:10px;border-bottom:1px solid #333;padding:4px 0;">
                <span>дата</span><span>игрок</span><span>в</span><span>т</span><span>ск</span><span>цена</span>
            </div>
            ${rows.map(record => {
                const title = this.escapeForecastHtml([record.fromClub, record.toClub].filter(Boolean).join(' → '));
                const name = this.escapeForecastHtml(record.playerName || record.playerId || 'Игрок');
                const url = this.escapeForecastHtml(record.playerUrl || '#');
                return `
                    <div title="${title}" style="display:grid;grid-template-columns:62px 1fr 24px 24px 32px 66px;gap:4px;align-items:center;border-bottom:1px solid #282828;padding:4px 0;">
                        <span style="color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeForecastHtml(record.dateText || '')}</span>
                        <a href="${url}" style="color:#d8e9ff;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</a>
                        <span>${record.age ?? '—'}</span>
                        <span>${record.talent ?? '—'}</span>
                        <span>${record.skill ?? '—'}</span>
                        <span style="color:#fff;white-space:nowrap;">${this.formatPurchaseForecastPrice(record.price)}</span>
                    </div>
                `;
            }).join('')}
            ${(records || []).length > rows.length ? `<div style="color:#888;padding-top:5px;">Показано ${rows.length} из ${(records || []).length}.</div>` : ''}
        `;
    };

    TransferMarketAnalyzer.togglePurchaseForecastList = function togglePurchaseForecastList() {
        const box = document.getElementById('slf-purchase-forecast-list');
        if (!box) return;
        const result = this.purchaseForecastLastResult || { records: [] };
        const hidden = box.style.display === 'none' || !box.style.display;
        if (hidden) this.renderPurchaseForecastRows(result.records || []);
        box.style.display = hidden ? 'block' : 'none';
    };

    TransferMarketAnalyzer.renderPurchaseForecastResult = function renderPurchaseForecastResult(result) {
        this.purchaseForecastLastResult = result || { count: 0, median: null, p75: null, records: [] };
        const countEl = document.getElementById('slf-purchase-forecast-count');
        const medianEl = document.getElementById('slf-purchase-forecast-median');
        const p75El = document.getElementById('slf-purchase-forecast-p75');
        if (countEl) {
            countEl.textContent = String(result?.count ?? 0);
            countEl.title = 'Показать трансферы выборки';
        }
        if (medianEl) medianEl.textContent = this.formatPurchaseForecastPrice(result?.median);
        if (p75El) p75El.textContent = this.formatPurchaseForecastPrice(result?.p75);
        const list = document.getElementById('slf-purchase-forecast-list');
        if (list && list.style.display === 'block') this.renderPurchaseForecastRows(result?.records || []);
    };

    TransferMarketAnalyzer.setPurchaseForecastNote = function setPurchaseForecastNote(text) {
        const note = document.getElementById('slf-purchase-forecast-note');
        if (note) note.textContent = text || '';
    };

    TransferMarketAnalyzer.runPurchaseForecast = async function runPurchaseForecast() {
        const button = document.getElementById('slf-purchase-forecast-calc');
        const originalText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Считаю...';
        }
        this.setPurchaseForecastNote('Загрузка VPS History...');
        try {
            const rows = await this.loadHistoryVpsRows();
            const result = this.calculatePurchaseForecast(rows, this.readPurchaseForecastFilters());
            this.renderPurchaseForecastResult(result);
            this.setPurchaseForecastNote(`VPS History: выборка ${result.count || 0} трансферов. Клик по числу откроет список.`);
        } catch (error) {
            console.warn('[SLF Purchase Forecast] calculation failed', error);
            this.renderPurchaseForecastResult({ count: 0, median: null, p75: null, records: [] });
            this.setPurchaseForecastNote('Ошибка загрузки VPS History. Проверь API/VPS доступ.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Посчитать';
            }
        }
    };

    TransferMarketAnalyzer.addPurchaseForecastPanel = function addPurchaseForecastPanel() {
        if (!this.isFinalTransferMarketPage() || document.getElementById('slf-purchase-forecast-panel')) return;
        const marketBox = this.findPurchaseForecastMarketBox();
        if (!marketBox || !marketBox.parentNode) return;

        const row = document.createElement('div');
        row.id = 'slf-purchase-forecast-row';
        row.style.cssText = 'display:flex;align-items:flex-start;gap:14px;width:100%;max-width:1260px;margin:0 0 16px 0;box-sizing:border-box;';
        marketBox.parentNode.insertBefore(row, marketBox);
        row.appendChild(marketBox);
        marketBox.style.flex = '0 0 720px';
        marketBox.style.boxSizing = 'border-box';

        const panel = document.createElement('div');
        panel.id = 'slf-purchase-forecast-panel';
        panel.style.cssText = 'flex:0 0 430px;box-sizing:border-box;padding:10px 12px 11px;background:#151515;color:#ddd;border:1px solid #3b5f3b;border-radius:5px;font-family:Arial,sans-serif;font-size:12px;box-shadow:0 0 0 1px rgba(0,0,0,0.35) inset;';
        panel.innerHTML = `
            <div style="font-weight:bold;color:#7CFF7C;margin-bottom:9px;font-size:14px;">SLF Прогноз покупки</div>
            <div style="display:grid;grid-template-columns:52px 52px 52px 52px 72px 1fr;gap:6px;align-items:end;margin-bottom:7px;">
                <label style="color:#bbb;font-size:11px;">Возр. от<input id="slf-purchase-forecast-age-from" value="21" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <label style="color:#bbb;font-size:11px;">до<input id="slf-purchase-forecast-age-to" value="25" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <label style="color:#bbb;font-size:11px;">Тал. от<input id="slf-purchase-forecast-talent-from" value="4" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <label style="color:#bbb;font-size:11px;">до<input id="slf-purchase-forecast-talent-to" value="6" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <label style="color:#bbb;font-size:11px;">Позиция<select id="slf-purchase-forecast-position" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;">${this.getPurchaseForecastPositionOptionsHtml()}</select></label>
                <button id="slf-purchase-forecast-calc" style="height:28px;padding:3px 8px;font-size:13px;cursor:pointer;">Посчитать</button>
            </div>
            <div style="display:grid;grid-template-columns:52px 52px 1fr;gap:6px;align-items:end;margin-bottom:10px;">
                <label style="color:#bbb;font-size:11px;">Скилл от<input id="slf-purchase-forecast-skill-from" value="145" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <label style="color:#bbb;font-size:11px;">до<input id="slf-purchase-forecast-skill-to" value="180" style="display:block;width:100%;margin-top:2px;background:#333;color:#fff;border:1px solid #666;padding:3px 4px;font-size:13px;box-sizing:border-box;"></label>
                <div style="color:#777;font-size:10px;line-height:1.2;padding-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Скилл: finalSkill → skill → scoutSkill</div>
            </div>
            <div style="display:grid;grid-template-columns:78px 1fr 1fr;gap:6px;">
                <div id="slf-purchase-forecast-count-card" style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;cursor:pointer;" title="Показать трансферы выборки"><div style="color:#999;font-size:11px;">Найдено</div><div id="slf-purchase-forecast-count" style="color:#fff;font-size:19px;font-weight:bold;line-height:1.1;">—</div></div>
                <div style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;"><div style="color:#999;font-size:11px;">Медиана</div><div id="slf-purchase-forecast-median" style="color:#fff;font-size:19px;font-weight:bold;line-height:1.1;">—</div></div>
                <div style="background:#1d1d1d;border:1px solid #3f3f3f;border-radius:4px;padding:7px 8px;"><div style="color:#999;font-size:11px;">75-й перц.</div><div id="slf-purchase-forecast-p75" style="color:#ffcc66;font-size:19px;font-weight:bold;line-height:1.1;">—</div></div>
            </div>
            <div id="slf-purchase-forecast-list" style="display:none;max-height:210px;overflow:auto;margin-top:8px;border-top:1px solid #333;font-size:11px;"></div>
            <div id="slf-purchase-forecast-note" style="color:#777;font-size:10px;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Источник: VPS History. Нажми «Посчитать».</div>
        `;
        row.appendChild(panel);
        document.getElementById('slf-purchase-forecast-calc').onclick = () => this.runPurchaseForecast();
        document.getElementById('slf-purchase-forecast-count-card').onclick = () => this.togglePurchaseForecastList();
    };

    TransferMarketAnalyzer.loadAnalysisCache = function () { return {}; };
    TransferMarketAnalyzer.saveAnalysisCache = function () {};
    TransferMarketAnalyzer.getCachedAnalysis = function () { return null; };
    TransferMarketAnalyzer.applyCachedAnalysis = function () { return false; };
    TransferMarketAnalyzer.saveRowAnalysis = function () {};
    TransferMarketAnalyzer.renderCachedRows = function () {};
    TransferMarketAnalyzer.clearAnalysisCache = function () {
        this.clearAllTransferAnalysisState();
        this.setStatus?.('Cache полностью очищен. Transfer Analyzer работает без кеширования.');
    };

    if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
        TMEnrichmentLayer.loadCache = function () { return {}; };
        TMEnrichmentLayer.saveCache = function () {};
        TMEnrichmentLayer.clearCache = function () { TransferMarketAnalyzer.clearAllTransferAnalysisState(); };
        TMEnrichmentLayer.getCache = function () { return null; };
        TMEnrichmentLayer.peekBySlfPlayerId = function () { return null; };
        TMEnrichmentLayer.setCache = function () {};
    }

    if (typeof SLFAlterLayer !== 'undefined' && SLFAlterLayer) {
        SLFAlterLayer.loadCache = function () { return {}; };
        SLFAlterLayer.saveCache = function () {};
        SLFAlterLayer.clearCache = function () { TransferMarketAnalyzer.clearAllTransferAnalysisState(); };
        SLFAlterLayer.getCache = function () { return null; };
        SLFAlterLayer.peekByPlayerId = function () { return null; };
        SLFAlterLayer.setCache = function () {};
    }

    TransferMarketAnalyzer.mount = function mountZeroCacheTransferAnalyzer() {
        if (!this.isPage()) return;
        this.addToolbar();
        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps().catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }
        this.addPurchaseForecastPanel();
        this.clearAllTransferAnalysisState();
        this.setStatus?.('Live-only режим: нажми "Анализировать видимых", чтобы загрузить TM/SLF данные.');
    };

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarCompactMktUi() {
        const result = addToolbarOriginal.apply(this, arguments);
        this.removeMktSortToolbarButtons();
        const clearButton = document.getElementById('slf-transfer-clear-cache');
        if (clearButton) {
            clearButton.title = 'Полностью очистить все старые слои кеша Transfer Analyzer.';
            clearButton.onclick = () => this.clearAnalysisCache();
        }
        setTimeout(() => this.removeMktSortToolbarButtons(), 0);
        return result;
    };

    const getMarketSalePriceMarkerOriginal = TransferMarketAnalyzer.getMarketSalePriceMarker;
    TransferMarketAnalyzer.getMarketSalePriceMarker = function getCompactMarketSalePriceMarker() {
        const marker = getMarketSalePriceMarkerOriginal.apply(this, arguments);
        if (!marker || marker.category !== 'market') return marker;
        const ratio = Number(marker.marketDetails && marker.marketDetails.ratio || 0);
        const ratioText = this.formatCompactMktRatio(ratio);
        marker.label = ratioText ? `MKT x${ratioText}` : 'MKT ?';
        return marker;
    };

    if (!TransferMarketAnalyzer.slfMinBadgeFullWidthFixApplied && typeof TransferMarketAnalyzer.renderCompactChip === 'function') {
        TransferMarketAnalyzer.slfMinBadgeFullWidthFixApplied = true;
        const renderCompactChipOriginal = TransferMarketAnalyzer.renderCompactChip;
        TransferMarketAnalyzer.renderCompactChip = function renderCompactChipWithFullActivityBadge(marker) {
            const category = this.markerCategory?.(marker);
            const label = String(marker?.label || '');
            const isActivityBadge = category === 'activity' || /^MIN\s/i.test(label);

            if (!isActivityBadge) return renderCompactChipOriginal.apply(this, arguments);

            const structuredTooltip = this.buildStructuredMarkerTooltipHtml?.(marker) || this.escapeHtml?.(marker?.text || label) || '';
            this.ensureHtmlTooltipStyles?.();
            return `
                <span class="slf-transfer-chip-tooltip-host slf-transfer-analysis-chip slf-transfer-activity-full-badge" data-slf-tip-category="${this.escapeHtml(category || 'activity')}" tabindex="0" style="
                    box-sizing:border-box;
                    margin:0;
                    padding:1px 6px;
                    border:1px solid ${this.borderByLevel(marker.level)};
                    border-radius:4px;
                    color:${this.colorByLevel(marker.level)};
                    background:${this.bgByLevel(marker.level)};
                    vertical-align:middle;
                    line-height:17px;
                    min-height:18px;
                    font-size:10px;
                    font-weight:700;
                    text-align:center;
                    display:inline-flex;
                    flex:0 0 auto;
                    width:auto;
                    min-width:max-content;
                    max-width:none;
                    white-space:nowrap;
                    overflow:visible;
                    text-overflow:clip;
                    cursor:help;
                ">
                    <span style="display:inline-block;min-width:max-content;max-width:none;white-space:nowrap;overflow:visible;text-overflow:clip;">${this.escapeHtml(label)}</span>
                    <span class="slf-transfer-html-tooltip" style="display:none;">${structuredTooltip}</span>
                </span>
            `;
        };
    }

    TransferMarketAnalyzer.renderSemanticAnalysisGroups = function renderOnlyCoreAnalysisChips(markers, linksHtml, detailsHtml) {
        const visibleMarkers = [
            this.firstMarkerByCategory(markers, 'slf'),
            this.firstMarkerByCategory(markers, 'activity'),
            this.firstMarkerByCategory(markers, 'tm')
        ].filter(Boolean);
        return `
            <div class="ta-line ta-primary" data-ta-line="primary" aria-label="SLF MIN TM">
                ${visibleMarkers.map(marker => this.renderCompactChip(this.withVisualPriority(marker, 'high'))).join('')}
                ${detailsHtml || ''}
            </div>
        `;
    };

    const analyzeVisibleRowsOriginal = TransferMarketAnalyzer.analyzeVisibleRows;
    TransferMarketAnalyzer.analyzeVisibleRows = async function analyzeVisibleRowsLiveParallel() {
        if (this.isHistoryPage?.()) return analyzeVisibleRowsOriginal.apply(this, arguments);
        if (this.slfLiveAnalysisRunning) return this.setStatus?.('Live анализ уже выполняется. Дождись завершения текущего прохода.');

        const runId = Number(this.slfLiveAnalysisRunId || 0) + 1;
        this.slfLiveAnalysisRunId = runId;
        this.slfLiveAnalysisRunning = true;
        const analyzeButton = document.getElementById('slf-transfer-analyze-visible');
        const originalAnalyzeButtonText = analyzeButton ? analyzeButton.textContent : '';
        if (analyzeButton) {
            analyzeButton.disabled = true;
            analyzeButton.textContent = 'Анализ идет...';
        }

        const isCurrentRun = () => this.slfLiveAnalysisRunId === runId;
        const rows = this.parseVisibleRows?.() || [];
        if (!rows.length) {
            this.setStatus?.('Игроки не найдены.');
            this.slfLiveAnalysisRunning = false;
            if (analyzeButton) {
                analyzeButton.disabled = false;
                analyzeButton.textContent = originalAnalyzeButtonText || 'Анализировать видимых';
            }
            return;
        }

        const concurrency = 3;
        const runMemory = new Map();
        let done = 0, analyzed = 0, errors = 0;
        const total = rows.length;
        const loadPlayerData = row => {
            const playerId = String(row?.playerId || '').trim();
            if (!playerId) return Promise.resolve({ tmResult: null, slfAlter: null, tmError: null, slfError: null });
            if (!runMemory.has(playerId)) {
                runMemory.set(playerId, Promise.allSettled([
                    TMEnrichmentLayer.getBySlfPlayerId(playerId),
                    SLFAlterLayer.getByPlayerId(playerId)
                ]).then(([tmSettled, slfSettled]) => ({
                    tmResult: tmSettled.status === 'fulfilled' ? tmSettled.value : null,
                    slfAlter: slfSettled.status === 'fulfilled' ? slfSettled.value : null,
                    tmError: tmSettled.status === 'rejected' ? tmSettled.reason : null,
                    slfError: slfSettled.status === 'rejected' ? slfSettled.reason : null
                })));
            }
            return runMemory.get(playerId);
        };

        const analyzeOne = async row => {
            if (!isCurrentRun()) return;
            this.renderLoadingBadge?.(row);
            try {
                const result = await loadPlayerData(row);
                if (!isCurrentRun()) return;
                const tmResult = result.tmResult || { playerId: row.playerId, slfUrl: row.playerUrl, tmUrl: '', tmProfile: null, error: result.tmError ? 'tm_failed' : 'empty_enrichment' };
                const slfAlter = result.slfAlter || null;
                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;
                this.renderRowBadge?.(row, tmResult, slfAlter);
                analyzed++;
            } catch (error) {
                errors++;
                console.error('[SLF Transfer Analyzer] row failed', row, error);
            } finally {
                done++;
                if (isCurrentRun() && (done === total || done % 3 === 0)) this.setStatus?.(`Live ${done}/${total}: analyzed ${analyzed}, errors ${errors}`);
            }
        };

        const mapLimit = async (items, limit, worker) => {
            let cursor = 0;
            const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
                while (cursor < items.length && isCurrentRun()) await worker(items[cursor++]);
            });
            await Promise.all(workers);
        };

        this.setStatus?.(`Live анализ: ${total} игроков, parallel ${concurrency}...`);
        try {
            if (isCurrentRun()) await mapLimit(rows, concurrency, analyzeOne);
        } finally {
            this.slfLiveAnalysisRunning = false;
            if (analyzeButton) {
                analyzeButton.disabled = false;
                analyzeButton.textContent = originalAnalyzeButtonText || 'Анализировать видимых';
            }
        }
        if (isCurrentRun()) this.setStatus?.(`Готово live: ${total} игроков · analyzed ${analyzed} · errors ${errors}`);
    };

    TransferMarketAnalyzer.clearAllTransferAnalysisState();
}
// <<< src/modules/transfer-analyzer/transfer-market-ui-compact-mkt.js


// >>> src/modules/transfer-analyzer/purchase-forecast-full-date-patch.js
// Purchase Forecast: full date column
// ============================================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.renderPurchaseForecastRows = function renderPurchaseForecastRows(records) {
        const box = document.getElementById('slf-purchase-forecast-list');
        if (!box) return;

        const rows = (records || []).slice(0, 80);
        if (!rows.length) {
            box.innerHTML = '<div style="color:#888;padding:6px 0;">Нет трансферов в текущей выборке.</div>';
            return;
        }

        const columns = '68px minmax(0,1fr) 22px 22px 30px 66px';

        box.innerHTML = `
            <div style="display:grid;grid-template-columns:${columns};gap:4px;color:#888;font-size:10px;border-bottom:1px solid #333;padding:4px 0;">
                <span>дата</span><span>игрок</span><span>в</span><span>т</span><span>ск</span><span>цена</span>
            </div>
            ${rows.map(record => {
                const title = this.escapeForecastHtml([record.fromClub, record.toClub].filter(Boolean).join(' → '));
                const name = this.escapeForecastHtml(record.playerName || record.playerId || 'Игрок');
                const url = this.escapeForecastHtml(record.playerUrl || '#');

                return `
                    <div title="${title}" style="display:grid;grid-template-columns:${columns};gap:4px;align-items:center;border-bottom:1px solid #282828;padding:4px 0;">
                        <span style="color:#aaa;white-space:nowrap;overflow:visible;text-overflow:clip;">${this.escapeForecastHtml(record.dateText || '')}</span>
                        <a href="${url}" style="min-width:0;color:#d8e9ff;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</a>
                        <span>${record.age ?? '—'}</span>
                        <span>${record.talent ?? '—'}</span>
                        <span>${record.skill ?? '—'}</span>
                        <span style="color:#fff;white-space:nowrap;">${this.formatPurchaseForecastPrice(record.price)}</span>
                    </div>
                `;
            }).join('')}
            ${(records || []).length > rows.length ? `<div style="color:#888;padding-top:5px;">Показано ${rows.length} из ${(records || []).length}.</div>` : ''}
        `;
    };
}

// ============================================================
// <<< src/modules/transfer-analyzer/purchase-forecast-full-date-patch.js


// >>> src/modules/transfer-analyzer/transfer-tm-profile-guard.js
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
// <<< src/modules/transfer-analyzer/transfer-tm-profile-guard.js


// >>> src/modules/transfer-analyzer/transfer-my-bids-rank.js
// Transfer Analyzer: my club bid rank chips
// ============================================================
// Adds a manual checker on /transfers.php?ucs=1 that loads transfer
// detail pages and shows compact rank chips for configured user clubs.

const TransferMyBidsRank = {
    cacheKey: 'slf_my_bid_rank_cache_v1',
    cacheTtlMs: 1000 * 60,
    cacheMaxEntries: 300,
    concurrency: 3,

    teams: {
        '23698': 'ЛУЧ',
        '21473': 'КАР',
        '18280': 'ПРШ',
        '22962': 'БОА',
        '79252': 'ЧЕС',
        '105995': 'НОРТ'
    },

    isPage() {
        if (!location.pathname.includes('/transfers.php')) return false;

        const params = new URLSearchParams(location.search);
        if (params.get('action') === 'view') return false;

        return params.get('ucs') === '1';
    },

    start() {
        if (!this.isPage()) return;

        const run = () => this.mount();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run);
        } else {
            run();
        }

        window.addEventListener('load', run);
        setTimeout(run, 800);
        setTimeout(run, 2000);
        setTimeout(run, 4000);
    },

    mount() {
        if (!this.isPage()) return;

        this.injectStyles();
        this.wrapAnalyzerBadgeRenderer();
        this.addToolbarButtons();
    },

    injectStyles() {
        if (document.getElementById('slf-my-bids-rank-style')) return;

        const style = document.createElement('style');
        style.id = 'slf-my-bids-rank-style';
        style.textContent = `
            .slf-my-bids-rank-wrap {
                display:inline-flex;
                flex-wrap:wrap;
                gap:3px;
                align-items:center;
                margin-right:4px;
            }
            .slf-my-bids-rank-chip {
                display:inline-flex;
                align-items:center;
                justify-content:center;
                padding:1px 5px;
                border-radius:4px;
                border:1px solid #555;
                background:#202020;
                color:#ddd;
                font-size:11px;
                font-weight:bold;
                line-height:1.2;
                white-space:nowrap;
            }
            .slf-my-bids-rank-chip--lead {
                border-color:#4b7d2d;
                background:#173018;
                color:#7cff7c;
            }
            .slf-my-bids-rank-chip--near {
                border-color:#7a6422;
                background:#302610;
                color:#ffd76a;
            }
            .slf-my-bids-rank-chip--far {
                border-color:#444;
                background:#181818;
                color:#aaa;
            }
        `;
        document.head.appendChild(style);
    },

    wrapAnalyzerBadgeRenderer() {
        if (typeof TransferMarketAnalyzer === 'undefined' || !TransferMarketAnalyzer) return;
        if (typeof TransferMarketAnalyzer.renderRowBadge !== 'function') return;
        if (TransferMarketAnalyzer.renderRowBadge.__slfMyBidsRankWrapped) return;

        const originalRenderRowBadge = TransferMarketAnalyzer.renderRowBadge;
        const self = this;

        const wrappedRenderRowBadge = function renderRowBadgeWithMyBidRanks(row, enriched, slfAlter) {
            const result = originalRenderRowBadge.call(this, row, enriched, slfAlter);
            self.restoreBidChips(row);
            return result;
        };

        wrappedRenderRowBadge.__slfMyBidsRankWrapped = true;
        TransferMarketAnalyzer.renderRowBadge = wrappedRenderRowBadge;
    },

    addToolbarButtons() {
        const toolbar = document.getElementById('slf-transfer-analyzer-toolbar');
        if (!toolbar) return;

        const status = document.getElementById('slf-transfer-status');
        const insert = element => {
            if (status && status.parentNode === toolbar) {
                toolbar.insertBefore(element, status);
            } else {
                toolbar.appendChild(element);
            }
        };

        if (!document.getElementById('slf-my-bids-rank-check')) {
            const btn = document.createElement('button');
            btn.id = 'slf-my-bids-rank-check';
            btn.type = 'button';
            btn.textContent = 'Проверить ставки';
            btn.title = 'Проверить места ставок моих клубов на этой странице';
            btn.onclick = () => this.checkVisibleRows();
            insert(btn);
        }

        if (!document.getElementById('slf-my-bids-rank-clear')) {
            const clearBtn = document.createElement('button');
            clearBtn.id = 'slf-my-bids-rank-clear';
            clearBtn.type = 'button';
            clearBtn.textContent = 'Сброс bid cache';
            clearBtn.title = 'Очистить короткий cache мест ставок';
            clearBtn.onclick = () => {
                this.clearCache();
                this.setStatus('Bid cache очищен.');
            };
            insert(clearBtn);
        }
    },

    setStatus(text) {
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.setStatus) {
            TransferMarketAnalyzer.setStatus(text);
            return;
        }

        const el = document.getElementById('slf-transfer-status');
        if (el) el.textContent = text || '';
    },

    findTransferTable() {
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.findTransferTable) {
            return TransferMarketAnalyzer.findTransferTable();
        }

        const rows = [...document.querySelectorAll('tr')]
            .filter(tr => this.parseTransferIdFromRow(tr));

        return rows[0]?.closest('table') || null;
    },

    parseVisibleRows() {
        if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.parseVisibleRows) {
            return TransferMarketAnalyzer.parseVisibleRows()
                .filter(row => row?.rowEl && this.parseTransferIdFromRow(row.rowEl))
                .map(row => Object.assign(row, {
                    transferId: this.parseTransferIdFromRow(row.rowEl)
                }));
        }

        const table = this.findTransferTable();
        if (!table) return [];

        return [...table.querySelectorAll('tr')]
            .map((tr, index) => ({
                rowEl: tr,
                originalIndex: index,
                transferId: this.parseTransferIdFromRow(tr)
            }))
            .filter(row => row.transferId);
    },

    parseTransferIdFromRow(tr) {
        if (!tr) return '';

        const links = [...tr.querySelectorAll('a[href]')];
        const link = links.find(a => {
            const href = a.getAttribute('href') || '';
            return /transfers\.php/i.test(href) &&
                /action=view/i.test(href) &&
                /transfer_id=\d+/i.test(href);
        }) || links.find(a => {
            const href = a.getAttribute('href') || '';
            return /action=view/i.test(href) && /transfer_id=\d+/i.test(href);
        });

        const href = link?.getAttribute('href') || '';
        const match = href.match(/transfer_id=(\d+)/i);

        return match ? match[1] : '';
    },

    async checkVisibleRows() {
        const rows = this.parseVisibleRows();

        if (!rows.length) {
            this.setStatus('Ставки: строки не найдены.');
            return;
        }

        let completed = 0;
        let failed = 0;
        let matched = 0;

        const tasks = rows.map(row => async () => {
            const transferId = row.transferId || this.parseTransferIdFromRow(row.rowEl);

            if (!transferId) return;

            try {
                const cached = this.getCached(transferId);
                const items = cached || await this.loadBidRanks(transferId);

                if (items.length) matched++;
                this.renderBidChips(row, items);
            } catch (error) {
                failed++;
                console.warn('[SLF My Bids Rank] failed', transferId, error);
            } finally {
                completed++;
                this.setStatus(`Ставки: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
            }
        });

        this.setStatus(`Ставки: 0/${rows.length}`);
        await this.runLimited(tasks, this.concurrency);
        this.setStatus(`Ставки проверены: ${completed}/${rows.length} · найдено ${matched} · ошибок ${failed}`);
    },

    async loadBidRanks(transferId) {
        const html = await this.fetchDetailHtml(transferId);
        const items = this.parseMyBidRanks(html);

        this.setCached(transferId, items);
        return items;
    },

    async fetchDetailHtml(transferId) {
        const url = `/transfers.php?action=view&transfer_id=${encodeURIComponent(transferId)}`;
        const response = await fetch(url, {
            credentials: 'same-origin',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.text();
    },

    parseMyBidRanks(htmlText) {
        const doc = new DOMParser().parseFromString(String(htmlText || ''), 'text/html');
        const rows = [...doc.querySelectorAll('table.bet_table tr.betline')];
        const items = [];

        rows.forEach((tr, index) => {
            const rank = index + 1;
            const rosterLink = [...tr.querySelectorAll('a[href]')].find(a => {
                const href = a.getAttribute('href') || '';
                return /roster\.php\?id=\d+/i.test(href);
            });

            const href = rosterLink?.getAttribute('href') || '';
            const teamId = (href.match(/roster\.php\?id=(\d+)/i) || [])[1];

            if (!teamId || !this.teams[teamId]) return;

            items.push({
                teamId,
                label: this.teams[teamId],
                rank
            });
        });

        return items;
    },

    getOrCreateBidCell(row) {
        const tr = row?.rowEl;
        if (!tr) return null;

        let cell = tr.querySelector('.slf-transfer-analysis-badge');

        if (!cell && typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer?.getOrCreateBadgeCell) {
            cell = TransferMarketAnalyzer.getOrCreateBadgeCell(row);
        }

        if (!cell) {
            cell = document.createElement('td');
            cell.className = 'slf-transfer-analysis-badge';
            cell.style.cssText = `
                box-sizing:border-box;
                min-width:0;
                width:auto;
                font-size:11px;
                line-height:1.12;
                border-left:1px solid #444;
                padding:3px 5px;
                vertical-align:top;
                white-space:normal;
                position:relative;
                overflow:visible;
            `;
            tr.appendChild(cell);
        }

        return cell;
    },

    restoreBidChips(row) {
        if (!row?.rowEl?.dataset?.slfMyBidsRankItems) return;

        try {
            const items = JSON.parse(row.rowEl.dataset.slfMyBidsRankItems || '[]');
            this.renderBidChips(row, items);
        } catch (e) {
            delete row.rowEl.dataset.slfMyBidsRankItems;
        }
    },

    renderBidChips(row, items) {
        const cell = this.getOrCreateBidCell(row);
        if (!cell) return;

        let wrap = cell.querySelector('.slf-my-bids-rank-wrap');

        if (!Array.isArray(items) || !items.length) {
            if (wrap) wrap.remove();
            if (row?.rowEl?.dataset) delete row.rowEl.dataset.slfMyBidsRankItems;
            return;
        }

        if (row?.rowEl?.dataset) {
            row.rowEl.dataset.slfMyBidsRankItems = JSON.stringify(items);
        }

        if (!wrap) {
            wrap = document.createElement('span');
            wrap.className = 'slf-my-bids-rank-wrap';
            cell.insertBefore(wrap, cell.firstChild);
        }

        wrap.innerHTML = '';

        items.forEach(item => {
            const chip = document.createElement('span');
            const rank = Number(item.rank || 0);
            const level = rank === 1 ? 'lead' : rank <= 3 ? 'near' : 'far';

            chip.className = `slf-my-bids-rank-chip slf-my-bids-rank-chip--${level}`;
            chip.textContent = `${item.label} #${rank || '?'}`;
            wrap.appendChild(chip);
        });
    },

    loadCache() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveCache(cache) {
        try {
            const entries = Object.entries(cache || {})
                .filter(([, value]) => value && Number(value.savedAt || 0))
                .sort((a, b) => Number(b[1].savedAt || 0) - Number(a[1].savedAt || 0))
                .slice(0, this.cacheMaxEntries);

            localStorage.setItem(this.cacheKey, JSON.stringify(Object.fromEntries(entries)));
        } catch (e) {
            console.warn('[SLF My Bids Rank] cache save failed', e);
        }
    },

    getCached(transferId) {
        const cache = this.loadCache();
        const item = cache[String(transferId || '')];

        if (!item) return null;

        const savedAt = Number(item.savedAt || 0);
        if (!savedAt || Date.now() - savedAt > this.cacheTtlMs) return null;

        return Array.isArray(item.items) ? item.items : [];
    },

    setCached(transferId, items) {
        const cache = this.loadCache();

        cache[String(transferId || '')] = {
            savedAt: Date.now(),
            items: Array.isArray(items) ? items : []
        };

        this.saveCache(cache);
    },

    clearCache() {
        localStorage.removeItem(this.cacheKey);
    },

    async runLimited(tasks, limit) {
        const queue = Array.isArray(tasks) ? tasks.slice() : [];
        const workerCount = Math.max(1, Number(limit || 1));
        const workers = Array.from({ length: workerCount }, async () => {
            while (queue.length) {
                const task = queue.shift();
                await task();
            }
        });

        await Promise.all(workers);
    }
};

TransferMyBidsRank.start();
// <<< src/modules/transfer-analyzer/transfer-my-bids-rank.js


// >>> src/modules/transfer-analyzer/transfer-my-bids-cache-policy.js
// Transfer Analyzer: bid cache page policy
// ============================================================

if (typeof TransferMyBidsRank !== 'undefined' && TransferMyBidsRank) {
    const clearButtonId = 'slf-my-bids-rank-clear';
    const originalAddToolbarButtons = TransferMyBidsRank.addToolbarButtons;

    // A page reload starts a fresh bid-rank session. The short-lived cache still
    // prevents duplicate requests while the current page remains open.
    TransferMyBidsRank.clearCache();

    TransferMyBidsRank.addToolbarButtons = function addToolbarButtonsWithoutCacheReset() {
        originalAddToolbarButtons.call(this);
        document.getElementById(clearButtonId)?.remove();
    };

    // Covers the case where the original module mounted synchronously before
    // this policy module was evaluated.
    document.getElementById(clearButtonId)?.remove();
}

// ============================================================
// <<< src/modules/transfer-analyzer/transfer-my-bids-cache-policy.js


// >>> src/modules/transfer-analyzer/transfer-history-vps-skip-synced.js
// Transfer history VPS sync runtime
// =================================

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.historyFullSyncRunning = false;
    TransferMarketAnalyzer.historyFullSyncStopRequested = false;
    TransferMarketAnalyzer.historyVpsRowsMemoryCache = null;
    TransferMarketAnalyzer.historyVpsRowsPromise = null;

    try { localStorage.removeItem('slf_transfer_history_vps_records_cache_v1'); } catch (e) {}

    TransferMarketAnalyzer.findTransferTable = function findTransferTable() {
        const candidates = [...document.querySelectorAll('table')]
            .map(table => ({ table, score: this.scoreTransferTable(table), rows: table.querySelectorAll('tr').length, links: this.getPlayerLinksIn(table).length }))
            .filter(x => x.score > 0 && x.links > 0)
            .sort((a, b) => b.score - a.score);
        if (candidates[0]) return candidates[0].table;

        const tableMap = new Map();
        this.getPlayerLinksIn(document).forEach(a => {
            for (let node = a; node && node !== document.body; node = node.parentElement) {
                if (node.tagName?.toLowerCase() === 'table' && !this.isWrapperTable(node)) {
                    tableMap.set(node, (tableMap.get(node) || 0) + 1);
                    break;
                }
            }
        });

        return [...tableMap.entries()]
            .map(([table, count]) => ({ table, count, rows: table.querySelectorAll('tr').length }))
            .filter(x => x.count >= 3)
            .sort((a, b) => b.count !== a.count ? b.count - a.count : a.rows - b.rows)[0]?.table || null;
    };

    TransferMarketAnalyzer.getHeaderMap = function getHeaderMap(table) {
        const row = this.findHeaderRow(table);
        const cells = row ? [...row.querySelectorAll('td, th')].map(c => this.normalizeLower(c.innerText)) : [];
        const find = (...needles) => {
            const normalized = needles.map(n => this.normalizeLower(n));
            const idx = cells.findIndex(text => normalized.some(n => text.includes(n)));
            return idx >= 0 ? idx : null;
        };

        return {
            id: find('#', 'id'),
            pos: find('амплуа'),
            name: find('фамилия', 'имя'),
            club: find('команда', 'клуб'),
            age: find('возраст', 'воз'),
            talent: find('талант', 'тал'),
            potential: find('потенциал', 'пот'),
            scoutSkill: find('скилл', 'ск'),
            price: find('цена', 'сумма'),
            date: find('дата'),
            fromClub: find('откуда'),
            toClub: find('куда'),
            transferSum: find('сумма'),
            sellerManager: find('от кого'),
            buyerManager: find('кому'),
            transferType: find('тип'),
            endDate: find('дата окончания', 'оконч'),
            bids: find('предл', 'став')
        };
    };

    TransferMarketAnalyzer.parseVisibleRows = function parseVisibleRows() {
        const table = this.findTransferTable();
        if (!table) return [];
        this.ensureAnalysisHeader(table);
        const map = this.getHeaderMap(table);
        return [...table.querySelectorAll('tr')].map((tr, index) => this.parseRow(tr, index, map)).filter(Boolean);
    };

    TransferMarketAnalyzer.parseHistoryVisibleRows = function parseHistoryVisibleRows() {
        const table = this.findTransferTable();
        if (!table) return [];
        this.ensureAnalysisHeader(table);
        const map = this.getHeaderMap(table);
        return [...table.querySelectorAll('tr')].map((tr, index) => this.parseHistoryRow(tr, index, map)).filter(Boolean);
    };

    TransferMarketAnalyzer.loadHistoryVpsCache = function loadHistoryVpsCache() {
        return { rows: Array.isArray(this.historyVpsRowsMemoryCache) ? this.historyVpsRowsMemoryCache : [] };
    };

    TransferMarketAnalyzer.saveHistoryVpsCache = function saveHistoryVpsCache(rows) {
        this.historyVpsRowsMemoryCache = Array.isArray(rows) ? rows : [];
        try { localStorage.removeItem('slf_transfer_history_vps_records_cache_v1'); } catch (e) {}
    };

    TransferMarketAnalyzer.loadHistoryVpsRows = async function loadHistoryVpsRows() {
        if (Array.isArray(this.historyVpsRowsMemoryCache)) return this.historyVpsRowsMemoryCache;
        if (this.historyVpsRowsPromise) return this.historyVpsRowsPromise;

        this.historyVpsRowsPromise = Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY)
            .then(result => {
                const rows = this.normalizeHistoryVpsRows(result.data);
                this.saveHistoryVpsCache(rows);
                return rows;
            })
            .finally(() => { this.historyVpsRowsPromise = null; });

        return this.historyVpsRowsPromise;
    };

    TransferMarketAnalyzer.isHistoryRowLocallySubmitted = function isHistoryRowLocallySubmitted(row, alreadySubmitted) {
        if (!row) return false;
        const keySource = this.buildHistoryEventKeySource(row);
        const eventKey = row.historyEventKey || '';
        return !!(
            (eventKey && alreadySubmitted?.[eventKey]) ||
            Object.values(alreadySubmitted || {}).some(item => item &&
                String(item.playerId || '') === String(row.playerId || '') &&
                this.normalizeText(item.dateText || '') === this.normalizeText(row.transferDateText || '') &&
                Number(item.price || 0) === Number(row.salePrice || 0)) ||
            (keySource && row.rowEl?.dataset?.slfHistoryEventKeySource === keySource)
        );
    };

    TransferMarketAnalyzer.isHistoryRowSyncedInVps = function isHistoryRowSyncedInVps(row, alreadySubmitted) {
        return this.isHistoryRowLocallySubmitted(row, alreadySubmitted);
    };

    TransferMarketAnalyzer.getCurrentHistoryPageIndex = function getCurrentHistoryPageIndex() {
        const pid = Number(new URLSearchParams(location.search || '').get('pid') || 0);
        return Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : 0;
    };

    TransferMarketAnalyzer.buildHistoryPageUrl = function buildHistoryPageUrl(pageIndex, baseUrl = location.href) {
        const url = new URL(baseUrl, location.origin);
        url.searchParams.set('action', 'history');
        if (Number(pageIndex || 0) <= 0) url.searchParams.delete('pid');
        else url.searchParams.set('pid', String(Math.floor(Number(pageIndex))));
        return url.toString();
    };

    TransferMarketAnalyzer.findHistoryTableInDocument = function findHistoryTableInDocument(doc) {
        if (!doc) return null;
        const direct = doc.querySelector('#trans_history #list');
        if (direct) return direct;

        return [...doc.querySelectorAll('table')]
            .map(table => {
                const text = this.normalizeLower(table.innerText || table.textContent || '');
                const links = [...table.querySelectorAll('a[href]')].filter(a => /player\.php/i.test(a.getAttribute('href') || '') && /id=\d+/i.test(a.getAttribute('href') || '')).length;
                const score = (text.includes('амплуа') ? 4 : 0) + (text.includes('сумма') ? 4 : 0) + (text.includes('откуда') ? 2 : 0) + (text.includes('куда') ? 2 : 0) + Math.min(links, 20);
                return { table, links, score };
            })
            .filter(x => x.score > 8 && x.links > 0)
            .sort((a, b) => b.score - a.score)[0]?.table || null;
    };

    TransferMarketAnalyzer.parseHistoryRowsFromDocument = function parseHistoryRowsFromDocument(doc) {
        const table = this.findHistoryTableInDocument(doc);
        if (!table) return [];
        const map = this.getHeaderMap(table);
        return [...(table.querySelector('tbody') || table).querySelectorAll('tr')]
            .map((tr, index) => this.parseHistoryRow(tr, index, map))
            .filter(Boolean);
    };

    TransferMarketAnalyzer.getHistoryTotalTransfersFromDocument = function getHistoryTotalTransfersFromDocument(doc) {
        const match = this.normalizeText(doc?.body?.innerText || '').match(/Найдено\s+трансферов:\s*([\d'`\s]+)/i);
        const value = match ? Number(String(match[1]).replace(/[^\d]/g, '')) : 0;
        return Number.isFinite(value) && value > 0 ? value : null;
    };

    TransferMarketAnalyzer.getHistoryPageCountFromSelects = function getHistoryPageCountFromSelects(doc) {
        return [...(doc?.querySelectorAll('select') || [])]
            .map(select => [...select.querySelectorAll('option')].map(option => ({ value: Number(option.value), label: this.normalizeText(option.textContent || '') })))
            .filter(items => items.length > 1 && items.every(item => Number.isFinite(item.value) && item.value >= 0 && /^\d+$/.test(item.label)))
            .map(items => Math.max(Math.max(...items.map(item => item.value)) + 1, Math.max(...items.map(item => Number(item.label)))))
            .sort((a, b) => b - a)[0] || null;
    };

    TransferMarketAnalyzer.getHistoryPageCountFromLinks = function getHistoryPageCountFromLinks(doc) {
        const pids = [...(doc?.querySelectorAll('a[href*="transfers.php"][href*="action=history"]') || [])]
            .map(a => { try { return Number(new URL(a.getAttribute('href') || '', location.origin).searchParams.get('pid')); } catch (e) { return NaN; } })
            .filter(value => Number.isFinite(value) && value >= 0);
        return pids.length ? Math.max(...pids) + 1 : null;
    };

    TransferMarketAnalyzer.determineHistoryPageCount = function determineHistoryPageCount(doc, rows) {
        const fromSelect = this.getHistoryPageCountFromSelects(doc);
        if (fromSelect) return fromSelect;
        const total = this.getHistoryTotalTransfersFromDocument(doc);
        const rowCount = Array.isArray(rows) && rows.length ? rows.length : this.parseHistoryRowsFromDocument(doc).length;
        if (total && rowCount) return Math.max(1, Math.ceil(total / rowCount));
        return this.getHistoryPageCountFromLinks(doc) || 1;
    };

    TransferMarketAnalyzer.fetchHistoryPageDocument = async function fetchHistoryPageDocument(pageIndex) {
        const url = this.buildHistoryPageUrl(pageIndex);
        const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error(`history_page_http_${response.status}`);
        return { doc: new DOMParser().parseFromString(await response.text(), 'text/html'), url };
    };

    TransferMarketAnalyzer.sleepHistorySync = ms => new Promise(resolve => setTimeout(resolve, ms));

    TransferMarketAnalyzer.applyHistoryEventSourceUrl = function applyHistoryEventSourceUrl(event, row) {
        if (event && row?.historySourceUrl) {
            event.source = event.source || {};
            event.source.url = row.historySourceUrl;
        }
        return event;
    };

    TransferMarketAnalyzer.renderHistoryLocalBadge = function renderHistoryLocalBadge(row) {
        this.renderHistorySyncStatus(row, 'LOCAL', 'neutral');
    };

    TransferMarketAnalyzer.processHistoryRowsForVps = async function processHistoryRowsForVps(rows, options = {}) {
        const renderRows = options.renderRows !== false;
        const alreadySubmitted = options.alreadySubmitted || this.loadHistorySyncedKeys();
        const vpsIndex = options.vpsIndex || null;
        const hasRealVpsIndex = !!vpsIndex;
        const pageLabel = options.pageLabel || 'видимые строки';
        const eventsToSend = [];
        const pendingRows = [];
        let vpsMatched = 0, localSkipped = 0, localPending = 0, failed = 0;

        for (const row of rows || []) {
            const eventKeySource = this.buildHistoryEventKeySource(row);
            const eventKey = await this.hashText(eventKeySource);
            row.historyEventKey = eventKey;
            if (row.rowEl?.dataset) row.rowEl.dataset.slfHistoryEventKeySource = eventKeySource;

            const vpsMatch = hasRealVpsIndex ? this.findHistoryVpsMatch(row, vpsIndex) : null;
            const localSubmitted = this.isHistoryRowLocallySubmitted(row, alreadySubmitted);

            if (vpsMatch) {
                vpsMatched++;
                if (renderRows) this.renderHistoryVpsBadge(row, vpsMatch);
            } else if (!hasRealVpsIndex && localSubmitted) {
                localSkipped++;
                if (renderRows) this.renderHistoryLocalBadge(row);
            } else {
                if (hasRealVpsIndex && localSubmitted) localPending++;
                pendingRows.push(row);
            }
        }

        if (!pendingRows.length) {
            const localText = localSkipped || localPending ? `, local ${localSkipped + localPending}` : '';
            this.setStatus(`История ${pageLabel}: строк ${rows.length}, реально в VPS ${vpsMatched}${localText}, новых к отправке 0.`);
            return { rows: rows.length, prepared: 0, vpsMatched, localSkipped, localPending, failed };
        }

        const localText = localPending ? `, local pending ${localPending}` : '';
        this.setStatus(`История ${pageLabel}: строк ${rows.length}, реально в VPS ${vpsMatched}${localText}, к отправке ${pendingRows.length}.`);

        for (let i = 0; i < pendingRows.length; i++) {
            if (this.historyFullSyncStopRequested) break;
            const row = pendingRows[i];
            const tmCached = TMEnrichmentLayer.peekBySlfPlayerId(row.playerId);
            const alterCached = SLFAlterLayer.peekByPlayerId(row.playerId);
            this.setStatus(`История ${pageLabel} · ${i + 1}/${pendingRows.length}: ${tmCached && alterCached ? 'cache' : 'анализ'} ${row.name || row.playerId}`);
            if (renderRows) this.renderHistorySyncStatus(row, '… VPS', 'pending');

            try {
                const tmResult = tmCached || await TMEnrichmentLayer.getBySlfPlayerId(row.playerId);
                let slfAlter = alterCached || null;
                if (!slfAlter) {
                    try { slfAlter = await SLFAlterLayer.getByPlayerId(row.playerId); }
                    catch (alterError) { console.warn('[SLF Transfer History] alter.php failed', row.playerId, alterError); }
                }

                row.tmUrl = tmResult.tmUrl || '';
                row.tmProfile = tmResult.tmProfile || null;
                row.tmValueEur = row.tmProfile?.marketValueEur || row.tmProfile?.lastKnownMarketValueEur || 0;
                row.slfAlter = slfAlter;
                eventsToSend.push(this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, tmResult, slfAlter), row));
                if (renderRows) this.renderHistorySyncStatus(row, 'QUEUED', 'pending');
            } catch (e) {
                failed++;
                console.error('[SLF Transfer History] row failed', row, e);
                if (renderRows) this.renderHistorySyncStatus(row, 'ERR', 'error');
                try {
                    const fallback = this.applyHistoryEventSourceUrl(await this.buildTransferHistoryEvent(row, {
                        playerId: row.playerId,
                        slfUrl: row.playerUrl,
                        tmUrl: '',
                        tmProfile: null,
                        error: String(e?.message || e || 'history_analysis_failed')
                    }, null), row);
                    fallback.analysisFailed = true;
                    fallback.analysisError = String(e?.message || e || 'unknown');
                    eventsToSend.push(fallback);
                    if (renderRows) this.renderHistorySyncStatus(row, 'QUEUED', 'pending');
                } catch (eventError) {
                    console.warn('[SLF Transfer History] fallback event build failed', row.playerId, eventError);
                }
            }
        }

        if (eventsToSend.length) {
            this.sendTransferHistoryEvents(eventsToSend);
            Object.assign(alreadySubmitted, this.loadHistorySyncedKeys());
        }

        return { rows: rows.length, prepared: eventsToSend.length, vpsMatched, localSkipped, localPending, failed };
    };

    TransferMarketAnalyzer.analyzeHistoryVisibleRows = async function analyzeHistoryVisibleRows() {
        const rows = this.parseHistoryVisibleRows();
        if (!rows.length) return this.setStatus('История трансферов: строки не найдены.');

        let vpsIndex = null;
        try { vpsIndex = this.indexHistoryVpsRows(await this.loadHistoryVpsRows()); }
        catch (e) { console.warn('[SLF Transfer History] VPS index load failed, local skip only', e); }

        const stats = await this.processHistoryRowsForVps(rows, { alreadySubmitted: this.loadHistorySyncedKeys(), vpsIndex, pageLabel: 'видимых', renderRows: true });
        const localText = stats.localSkipped || stats.localPending ? `, local ${stats.localSkipped + stats.localPending}` : '';
        this.setStatus(`История готова: отправлено в очередь ${stats.prepared}, реально в VPS ${stats.vpsMatched}${localText}, ошибок ${stats.failed}.`);
    };

    TransferMarketAnalyzer.addHistoryFullSyncControls = function addHistoryFullSyncControls() {
        if (!this.isHistoryPage() || document.getElementById('slf-transfer-history-all-pages')) return;
        const analyzeButton = document.getElementById('slf-transfer-analyze-visible');
        if (!analyzeButton?.parentNode) return;

        const allButton = document.createElement('button');
        allButton.id = 'slf-transfer-history-all-pages';
        allButton.textContent = 'Собрать все страницы';
        allButton.title = 'Фоном пройти все страницы текущего wid и текущих фильтров. Первая страница идет без pid, дальше pid=1..N.';

        const stopButton = document.createElement('button');
        stopButton.id = 'slf-transfer-history-stop';
        stopButton.textContent = 'Стоп';
        stopButton.disabled = true;
        stopButton.title = 'Остановить фоновый сбор после текущего запроса/строки.';

        analyzeButton.insertAdjacentElement('afterend', allButton);
        allButton.insertAdjacentElement('afterend', stopButton);
        allButton.onclick = () => this.analyzeHistoryAllPages();
        stopButton.onclick = () => {
            this.historyFullSyncStopRequested = true;
            this.setStatus('История all pages: остановка после текущего запроса/строки...');
        };
    };

    TransferMarketAnalyzer.setHistoryFullSyncControlsRunning = function setHistoryFullSyncControlsRunning(running) {
        const allButton = document.getElementById('slf-transfer-history-all-pages');
        const stopButton = document.getElementById('slf-transfer-history-stop');
        const visibleButton = document.getElementById('slf-transfer-analyze-visible');
        if (allButton) allButton.disabled = !!running;
        if (visibleButton) visibleButton.disabled = !!running;
        if (stopButton) stopButton.disabled = !running;
    };

    TransferMarketAnalyzer.analyzeHistoryAllPages = async function analyzeHistoryAllPages() {
        if (this.historyFullSyncRunning) return this.setStatus('История all pages: сбор уже выполняется.');

        this.historyFullSyncRunning = true;
        this.historyFullSyncStopRequested = false;
        this.setHistoryFullSyncControlsRunning(true);

        const alreadySubmitted = this.loadHistorySyncedKeys();
        const currentPageIndex = this.getCurrentHistoryPageIndex();
        const totals = { pages: 0, rows: 0, prepared: 0, vpsMatched: 0, localSkipped: 0, localPending: 0, failed: 0, pageErrors: 0 };

        try {
            const currentRows = this.parseHistoryVisibleRows();
            const pageCount = this.determineHistoryPageCount(document, currentRows);
            totals.pages = pageCount;
            this.setStatus(`История all pages: загружаю VPS index, страниц ${pageCount}...`);

            let vpsIndex = null;
            try { vpsIndex = this.indexHistoryVpsRows(await this.loadHistoryVpsRows()); }
            catch (e) { console.warn('[SLF Transfer History] VPS index load failed, local skip only', e); }

            for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                if (this.historyFullSyncStopRequested) break;
                const pageNo = pageIndex + 1;

                try {
                    let doc = document;
                    let url = location.href;
                    if (pageIndex !== currentPageIndex) {
                        this.setStatus(`История all pages: загружаю страницу ${pageNo}/${pageCount}...`);
                        ({ doc, url } = await this.fetchHistoryPageDocument(pageIndex));
                    }

                    const rows = this.parseHistoryRowsFromDocument(doc);
                    rows.forEach(row => { row.historySourceUrl = url; });
                    const stats = await this.processHistoryRowsForVps(rows, { alreadySubmitted, vpsIndex, pageLabel: `страница ${pageNo}/${pageCount}`, renderRows: doc === document });

                    totals.rows += stats.rows;
                    totals.prepared += stats.prepared;
                    totals.vpsMatched += stats.vpsMatched;
                    totals.localSkipped += stats.localSkipped;
                    totals.localPending += stats.localPending;
                    totals.failed += stats.failed;
                    this.setStatus(`История all pages: ${pageNo}/${pageCount} · строк ${totals.rows} · queued ${totals.prepared} · VPS ${totals.vpsMatched} · local ${totals.localSkipped + totals.localPending} · ошибок ${totals.failed + totals.pageErrors}`);
                } catch (pageError) {
                    totals.pageErrors++;
                    console.warn('[SLF Transfer History] page failed', pageIndex, pageError);
                    this.setStatus(`История all pages: ошибка страницы ${pageNo}/${pageCount}; продолжаю.`);
                }

                if (!this.historyFullSyncStopRequested && pageIndex < pageCount - 1) await this.sleepHistorySync(500);
            }

            this.setStatus(`${this.historyFullSyncStopRequested ? 'История all pages остановлена' : 'История all pages готова'}: страниц ${totals.pages}, строк ${totals.rows}, queued ${totals.prepared}, реально в VPS ${totals.vpsMatched}, local ${totals.localSkipped + totals.localPending}, ошибок ${totals.failed + totals.pageErrors}.`);
        } finally {
            this.historyFullSyncRunning = false;
            this.historyFullSyncStopRequested = false;
            this.setHistoryFullSyncControlsRunning(false);
        }
    };

    const addToolbarOriginal = TransferMarketAnalyzer.addToolbar;
    TransferMarketAnalyzer.addToolbar = function addToolbarHistorySync() {
        const result = addToolbarOriginal.apply(this, arguments);
        this.addHistoryFullSyncControls();
        return result;
    };

    TransferMarketAnalyzer.mount = function mountTransferAnalyzer() {
        if (!this.isPage()) return;
        this.addToolbar();
        if (this.isHistoryPage()) {
            this.hydrateHistoryFromVps().catch(error => console.warn('[SLF Transfer History] VPS hydrate failed', error));
            return;
        }
        this.addPurchaseForecastPanel?.();
        this.clearAllTransferAnalysisState?.();
        this.setStatus?.('Live-only режим: нажми "Анализировать видимых", чтобы загрузить TM/SLF данные.');
    };
}
// <<< src/modules/transfer-analyzer/transfer-history-vps-skip-synced.js


// >>> src/modules/team-management/training-reference-guide.js
// 14.5 Training Reference Guide
// ============================================================

const SLF_TRAINING_PROFILES_V1 = [
    {
        role: 'GK',
        normal: [['ПС', 8], ['СВ', 7], ['ТВ', 7], ['СК', 6], ['РЕ', 23], ['ИВ', 22], ['ВП', 22], ['РМ', 6], ['ПИ', 2], ['ВВ', 58]],
        top: [['ПС', 9], ['СВ', 8], ['ТВ', 8], ['СК', 8], ['РЕ', 26], ['ИВ', 26], ['ВП', 26], ['РМ', 8], ['ПИ', 2], ['ВВ', 66]]
    },
    {
        role: 'CD',
        normal: [['ПС', 15], ['СУ', 4], ['ТУ', 4], ['СК', 19], ['УС', 19], ['ОТ', 25], ['ВП', 24], ['ТХ', 11], ['БВ', 23], ['КР', 14]],
        top: [['ПС', 18], ['СУ', 5], ['ТУ', 5], ['СК', 23], ['УС', 23], ['ОТ', 30], ['ВП', 28], ['ТХ', 12], ['БВ', 27], ['КР', 17]]
    },
    {
        role: 'LD / RD',
        normal: [['ПС', 17], ['СУ', 4], ['ТУ', 4], ['СК', 22], ['УС', 22], ['ОТ', 25], ['ВП', 23], ['ТХ', 13], ['БВ', 16], ['КР', 16]],
        top: [['ПС', 20], ['СУ', 5], ['ТУ', 5], ['СК', 25], ['УС', 25], ['ОТ', 30], ['ВП', 26], ['ТХ', 15], ['БВ', 18], ['КР', 18]]
    },
    {
        role: 'DM',
        normal: [['ПС', 23], ['СУ', 8], ['ТУ', 8], ['СК', 19], ['УС', 20], ['ОТ', 24], ['ВП', 23], ['ТХ', 18], ['БВ', 11], ['КР', 18]],
        top: [['ПС', 26], ['СУ', 10], ['ТУ', 10], ['СК', 23], ['УС', 23], ['ОТ', 29], ['ВП', 27], ['ТХ', 21], ['БВ', 12], ['КР', 21]]
    },
    {
        role: 'CM',
        normal: [['ПС', 26], ['СУ', 16], ['ТУ', 16], ['СК', 20], ['УС', 20], ['ОТ', 4], ['ВП', 18], ['ТХ', 22], ['БВ', 8], ['КР', 22]],
        top: [['ПС', 30], ['СУ', 19], ['ТУ', 19], ['СК', 23], ['УС', 23], ['ОТ', 5], ['ВП', 20], ['ТХ', 25], ['БВ', 9], ['КР', 25]]
    },
    {
        role: 'LM / RM',
        normal: [['ПС', 25], ['СУ', 15], ['ТУ', 15], ['СК', 23], ['УС', 22], ['ОТ', 3], ['ВП', 15], ['ТХ', 22], ['БВ', 8], ['КР', 21]],
        top: [['ПС', 28], ['СУ', 18], ['ТУ', 18], ['СК', 26], ['УС', 25], ['ОТ', 3], ['ВП', 18], ['ТХ', 25], ['БВ', 9], ['КР', 24]]
    },
    {
        role: 'LW / RW',
        normal: [['ПС', 24], ['СУ', 20], ['ТУ', 20], ['СК', 22], ['УС', 22], ['ОТ', 2], ['ВП', 16], ['ТХ', 22], ['БВ', 8], ['КР', 21]],
        top: [['ПС', 27], ['СУ', 24], ['ТУ', 24], ['СК', 25], ['УС', 25], ['ОТ', 2], ['ВП', 19], ['ТХ', 25], ['БВ', 9], ['КР', 24]]
    },
    {
        role: 'AM',
        normal: [['ПС', 22], ['СУ', 22], ['ТУ', 22], ['СК', 19], ['УС', 19], ['ОТ', 2], ['ВП', 17], ['ТХ', 20], ['БВ', 9], ['КР', 19]],
        top: [['ПС', 27], ['СУ', 26], ['ТУ', 26], ['СК', 23], ['УС', 23], ['ОТ', 2], ['ВП', 20], ['ТХ', 24], ['БВ', 11], ['КР', 23]]
    },
    {
        role: 'ST',
        normal: [['ПС', 11], ['СУ', 25], ['ТУ', 25], ['СК', 18], ['УС', 18], ['ОТ', 2], ['ВП', 20], ['ТХ', 18], ['БВ', 20], ['КР', 16]],
        top: [['ПС', 13], ['СУ', 29], ['ТУ', 29], ['СК', 22], ['УС', 21], ['ОТ', 2], ['ВП', 23], ['ТХ', 21], ['БВ', 26], ['КР', 18]]
    }
];

const TrainingGuidePanel = {
    panelId: 'slf-training-guide-panel',

    isPage() {
        return /\/train\.php$/i.test(location.pathname || '') && !(location.search || '');
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    rows() {
        return SLF_TRAINING_PROFILES_V1;
    },

    formatProfile(role, column, profile) {
        const pairs = Array.isArray(profile) ? profile : [];
        return pairs
            .map(([skill, value]) => `
                <span class="slf-train-pair" data-slf-role="${this.escapeHtml(role)}" data-slf-col="${this.escapeHtml(column)}" data-slf-skill="${this.escapeHtml(skill)}" data-slf-value="${this.escapeHtml(value)}">
                    <span class="slf-train-skill">${this.escapeHtml(skill)}</span>
                    <span class="slf-train-value">${this.escapeHtml(value)}</span>
                </span>
            `)
            .join('');
    },

    renderContent() {
        const rows = this.rows().map(row => `
            <tr data-slf-training-role="${this.escapeHtml(row.role)}">
                <td style="padding:4px 6px;border-bottom:1px solid #333;white-space:nowrap;color:#ffd76a;font-weight:bold;vertical-align:top;">
                    ${this.escapeHtml(row.role)}
                </td>
                <td data-slf-profile-col="normal" style="padding:4px 4px;border-bottom:1px solid #333;line-height:1.35;max-width:235px;vertical-align:top;">${this.formatProfile(row.role, 'normal', row.normal)}</td>
                <td data-slf-profile-col="top" style="padding:4px 4px;border-bottom:1px solid #333;line-height:1.35;max-width:235px;vertical-align:top;">${this.formatProfile(row.role, 'top', row.top)}</td>
            </tr>
        `).join('');

        return `
            <div style="font-weight:bold;color:#7cff7c;margin-bottom:5px;">SLF Training Profiles v1</div>
            <style>
                #slf-training-guide-panel .slf-train-pair{display:inline-block;margin:0 5px 2px 0;white-space:nowrap;}
                #slf-training-guide-panel .slf-train-skill{color:#8cf;font-weight:bold;}
                #slf-training-guide-panel .slf-train-value{color:#fff;}
            </style>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="text-align:left;color:#8cf;">
                        <th style="padding:4px 6px;border-bottom:1px solid #555;">Роль</th>
                        <th style="padding:4px 5px;border-bottom:1px solid #555;">normal</th>
                        <th style="padding:4px 5px;border-bottom:1px solid #555;">top</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    },

    pairKey(pair) {
        return `${pair[0]}:${Number(pair[1])}`;
    },

    validateRendered() {
        const panel = document.getElementById(this.panelId);
        if (!panel) return;

        const allowedRoles = this.rows().map(row => row.role);
        const renderedRoles = [...panel.querySelectorAll('[data-slf-training-role]')]
            .map(el => el.getAttribute('data-slf-training-role'));
        const oldRoles = renderedRoles.filter(role => role === 'DL / DR' || role === 'ML / MR / LW / RW');
        let suspiciousScaleValues = 0;
        let failedRows = 0;

        this.rows().forEach(row => {
            ['normal', 'top'].forEach(column => {
                const expected = row[column].map(pair => this.pairKey(pair)).join('|');
                const found = [...panel.querySelectorAll(`[data-slf-role="${CSS.escape(row.role)}"][data-slf-col="${column}"]`)]
                    .map(el => `${el.getAttribute('data-slf-skill')}:${Number(el.getAttribute('data-slf-value'))}`)
                    .join('|');

                row[column].forEach(pair => {
                    const value = Number(pair[1]);
                    if (Number.isFinite(value) && value >= 100) suspiciousScaleValues++;
                });

                if (expected === found) {
                    console.log(`[SLF Training Profiles] OK ${row.role} ${column}`);
                } else {
                    failedRows++;
                    console.warn('[SLF Training Profiles] mismatch', { role: row.role, column, expected, found });
                }
            });
        });

        const missingRoles = allowedRoles.filter(role => !renderedRoles.includes(role));
        const extraRoles = renderedRoles.filter(role => !allowedRoles.includes(role));

        if (oldRoles.length || missingRoles.length || extraRoles.length || suspiciousScaleValues || failedRows) {
            console.warn('[SLF Training Profiles] validation failed', {
                failedRows,
                oldRoles,
                missingRoles,
                extraRoles,
                suspiciousScaleValues
            });
        } else {
            console.log('[SLF Training Profiles] validation summary: OK all rows; suspiciousScaleValues=0');
        }
    },

    findTrainingAnchor() {
        const train = document.querySelector('#train');
        if (train) return train;

        const selectors = [
            '.pad2',
            '.team_general_content',
            '.content',
            '#content',
            'form[action*="train.php"]',
            'table'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }

        return document.body;
    },

    mount() {
        if (!this.isPage()) return;
        if (document.getElementById(this.panelId)) return;

        const train = document.querySelector('#train');
        const pad = train?.closest('.pad2') || document.querySelector('.pad2');
        const anchor = this.findTrainingAnchor();
        const panel = document.createElement('div');
        panel.id = this.panelId;
        panel.style.cssText = `
            flex:0 0 620px;
            width:620px;
            max-width:620px;
            min-width:500px;
            margin:0 0 12px 18px;
            padding:8px 10px;
            background:#222;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            font-family:Arial,sans-serif;
            font-size:12px;
            box-sizing:border-box;
            align-self:flex-start;
        `;

        panel.innerHTML = this.renderContent();

        if (train && pad) {
            const wrapper = document.createElement('div');
            wrapper.id = 'slf-training-guide-layout';
            wrapper.style.cssText = `
                display:flex;
                align-items:flex-start;
                justify-content:flex-start;
                gap:18px;
                width:100%;
                box-sizing:border-box;
            `;

            const left = document.createElement('div');
            left.id = 'slf-training-left-column';
            left.style.cssText = `
                flex:0 0 auto;
                min-width:0;
                box-sizing:border-box;
            `;

            pad.insertBefore(wrapper, train);
            left.appendChild(train);

            const nextForms = [...pad.querySelectorAll('form')]
                .filter(form => form !== train && !form.contains(panel))
                .filter(form => /очист|clean|train/i.test(form.innerText || form.textContent || form.action || ''));

            nextForms.slice(0, 2).forEach(form => left.appendChild(form));

            wrapper.appendChild(left);
            wrapper.appendChild(panel);
            this.validateRendered();
            return;
        }

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(panel, anchor.nextSibling);
        } else {
            document.body.prepend(panel);
        }

        this.validateRendered();
    }
};
// <<< src/modules/team-management/training-reference-guide.js


// >>> src/modules/team-management/team-loan-limit-helper.js
// 14.8 Team loan limit helper
// ============================================================

const LoanLimitPanel = {
    MODULE_ID: 'slf-loan-limit-inline',
    STYLE_ID: 'slf-loan-limit-inline-style',
    LIMIT_TOTAL: 10,
    LIMIT_OVER_23: 5,
    mounted: false,

    isPage() {
        return location.pathname.includes('/team4.php');
    },

    norm(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    },

    isVisible(row) {
        if (!row) return false;
        const style = getComputedStyle(row);
        return style.display !== 'none' && style.visibility !== 'hidden';
    },

    isLoanTabActive() {
        const activeTab = document.querySelector('.tpanel-a[data-tp="-1"]');
        if (activeTab && /аренд/i.test(activeTab.textContent || '')) return true;

        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .some(row => this.isVisible(row));
    },

    getAgeColumnIndex() {
        const headers = [...document.querySelectorAll('#generallist thead th')];
        const index = headers.findIndex(th => this.norm(th.textContent).includes('воз'));
        return index >= 0 ? index : 10;
    },

    parseAge(row, ageColumnIndex) {
        const cell = row.children[ageColumnIndex];
        const match = String(cell?.textContent || '').match(/\d{1,2}/);
        return match ? Number(match[0]) : null;
    },

    getLoanRows() {
        if (!this.isLoanTabActive()) return [];

        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .filter(row => this.isVisible(row));
    },

    readLoanState() {
        const ageColumnIndex = this.getAgeColumnIndex();
        const rows = this.getLoanRows();

        const players = rows.map(row => {
            const age = this.parseAge(row, ageColumnIndex);
            const name =
                row.querySelector('a[href*="player.php"]')?.textContent?.replace(/\s+/g, ' ').trim() ||
                row.id ||
                'unknown';

            return { row, age, name };
        });

        const total = players.length;
        const over23 = players.filter(player => Number.isFinite(player.age) && player.age >= 23).length;
        const leftTotal = Math.max(0, this.LIMIT_TOTAL - total);
        const leftOver23 = Math.max(0, this.LIMIT_OVER_23 - over23);
        const canOver23 = Math.min(leftTotal, leftOver23);

        return {
            total,
            over23,
            leftTotal,
            leftOver23,
            canOver23,
            totalFull: total >= this.LIMIT_TOTAL,
            over23Full: over23 >= this.LIMIT_OVER_23,
            totalExceeded: total > this.LIMIT_TOTAL,
            over23Exceeded: over23 > this.LIMIT_OVER_23,
            players
        };
    },

    ensureStyle() {
        if (document.getElementById(this.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            #${this.MODULE_ID} {
                width:245px;
                margin:7px 0 0 auto;
                padding:7px 8px;
                background:#202020;
                border:1px solid #4d4d4d;
                border-radius:5px;
                color:#ddd;
                font:11px Verdana,Arial,sans-serif;
                line-height:1.35;
                box-sizing:border-box;
            }
            #${this.MODULE_ID} .slf-loan-head {
                color:#9cff57;
                font-weight:700;
                margin-bottom:4px;
            }
            #${this.MODULE_ID} .slf-loan-line {
                display:flex;
                justify-content:space-between;
                gap:8px;
                padding:2px 0;
                border-top:1px solid #333;
            }
            #${this.MODULE_ID} .ok { color:#7dff7d; font-weight:700; }
            #${this.MODULE_ID} .warn { color:#ffd45a; font-weight:700; }
            #${this.MODULE_ID} .bad { color:#ff7777; font-weight:700; }
            #${this.MODULE_ID} .mini {
                margin-top:4px;
                padding-top:4px;
                border-top:1px solid #333;
                color:#aaa;
                font-size:10px;
            }
        `;
        document.head.appendChild(style);
    },

    ensureBox() {
        this.ensureStyle();

        let box = document.getElementById(this.MODULE_ID);
        if (box) return box;

        const table = document.querySelector('#generallist');
        if (!table) return null;

        box = document.createElement('div');
        box.id = this.MODULE_ID;
        table.insertAdjacentElement('afterend', box);
        return box;
    },

    render() {
        if (!this.isPage()) return;

        const box = this.ensureBox();
        if (!box) return;

        if (!this.isLoanTabActive()) {
            box.style.display = 'none';
            return;
        }

        const state = this.readLoanState();
        let statusClass = 'ok';
        let statusText = `Можно ещё: ${state.leftTotal} всего · ${state.canOver23} 23+`;

        if (state.totalExceeded || state.over23Exceeded) {
            statusClass = 'bad';
            statusText = 'Лимит превышен';
        } else if (state.totalFull) {
            statusClass = 'bad';
            statusText = 'Общий лимит заполнен';
        } else if (state.over23Full) {
            statusClass = 'warn';
            statusText = `Можно ещё: ${state.leftTotal}, только ≤22`;
        }

        box.innerHTML = `
            <div class="slf-loan-head">Аренды</div>
            <div class="slf-loan-line">
                <span>Всего</span>
                <b>${state.total}/${this.LIMIT_TOTAL}</b>
            </div>
            <div class="slf-loan-line">
                <span>23+</span>
                <b>${state.over23}/${this.LIMIT_OVER_23}</b>
            </div>
            <div class="mini ${statusClass}">${statusText}</div>
        `;
        box.style.display = 'block';
    },

    bindTabs() {
        if (this.mounted) return;
        this.mounted = true;

        document.addEventListener('click', event => {
            const tab = event.target.closest('.tpanel-a, .tpanel-b');
            if (!tab) return;
            setTimeout(() => this.render(), 90);
        }, true);
    },

    mount() {
        if (!this.isPage()) return;
        this.bindTabs();
        this.render();
    }
};


// ============================================================
// <<< src/modules/team-management/team-loan-limit-helper.js


// >>> src/modules/team-management/team4-alter-current-season-minutes-fix.js
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
// <<< src/modules/team-management/team4-alter-current-season-minutes-fix.js


// >>> src/modules/team-management/team4-form-saved-choice-notice.js
// Team Management: Team4 form saved-choice notice
// UI-only patch. Stable cache keys: no storage/schema version changes.

const SLFTeam4FormSavedChoiceNotice = (() => {
    const NOTICE_ID = 'slf-team4-form-saved-choice-notice';
    const STYLE_ID = 'slf-team4-form-saved-choice-notice-style';
    const FORM_URL = '/team4.php?action=form';
    const FETCH_URL = '/team4.php?action=form&date=1';

    function isTeam4MainPage() {
        const params = new URLSearchParams(location.search || '');
        return /\/team4\.php$/i.test(location.pathname || '') && !params.get('action');
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${NOTICE_ID} {
                grid-column: 1 / -1;
                width: 100%;
                margin: 0 0 6px 0;
                padding: 5px 8px;
                background: #202020;
                border: 1px solid #4d4d4d;
                border-radius: 5px;
                color: #ddd;
                font: 11px Verdana, Arial, sans-serif;
                text-align: center;
                box-sizing: border-box;
            }
            #${NOTICE_ID} a {
                color: #9cff57;
                font-weight: 700;
                text-decoration: underline;
            }
            #${NOTICE_ID} b {
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    function parseSavedChoiceState(html) {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const expireBox = doc.querySelector('#player_form #coach_set .coach_expire');
        const expireNode = expireBox?.querySelector('span[data-expire]') || expireBox?.querySelector('span');
        const checked = [...doc.querySelectorAll('#player_form input.coachd:checked')];
        const sourceText =
            expireNode?.textContent?.replace(/\s+/g, ' ').trim() ||
            expireBox?.textContent?.replace(/\s+/g, ' ').trim() ||
            '';
        const savedUntil = sourceText.match(/\b\d{2}[-./]\d{2}[-./]\d{4}\b/)?.[0] || '';

        return {
            savedUntil,
            checkedCount: checked.length
        };
    }

    function buildNoticeHtml(state) {
        let label = 'Форма не выбрана';
        let suffix = '';

        if (state.savedUntil) {
            label = 'Форма сохранена до';
            suffix = `: <b>${state.savedUntil}</b>`;
        } else if (state.checkedCount > 0) {
            label = 'Форма выбрана';
            suffix = ': <b>срок не найден</b>';
        }

        return `<a href="${FORM_URL}">${label}</a>${suffix}`;
    }

    function render(state) {
        ensureStyle();
        document.getElementById(NOTICE_ID)?.remove();

        const target = document.querySelector('.team_general_calendar');
        if (!target) return false;

        const notice = document.createElement('div');
        notice.id = NOTICE_ID;
        notice.innerHTML = buildNoticeHtml(state);
        target.insertAdjacentElement('afterbegin', notice);
        return true;
    }

    async function loadState() {
        const response = await fetch(FETCH_URL, {
            credentials: 'include',
            cache: 'no-store'
        });
        const html = await response.text();
        return parseSavedChoiceState(html);
    }

    async function start() {
        if (!isTeam4MainPage()) return;
        try {
            const state = await loadState();
            render(state);
        } catch (error) {
            console.warn('[SLF Team4 Form Notice] failed', error);
        }
    }

    const api = { FORM_URL, FETCH_URL, parseSavedChoiceState, render, start };
    window.SLFTeam4FormSavedChoiceNotice = api;
    return api;
})();

SLFTeam4FormSavedChoiceNotice.start();
// <<< src/modules/team-management/team4-form-saved-choice-notice.js


// >>> src/app/bootstrap.js
// 15. App Bootstrap
// ============================================================

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    // Manual-only Coach Hint mode:
    // - no live parser auto-resume;
    // - no manual tactic watcher freeze/status loop;
    // - tactical blocks are rebuilt only when the user presses "Подсказка".
    TacticPresetLibraryPanel.mount();
    TrainingGuidePanel.mount();
    LoanLimitPanel.mount();


    if (!document.getElementById('slf-tactics-dropdown')) {
        UI.addDropdown();
    }
},

    start() {
        // Важно: трансферный анализатор живёт отдельно от общего UI.
        // В 4.4.4 при удалении Team4 Analyzer этот вызов был случайно потерян,
        // поэтому панель на transfers.php не монтировалась.
        TransferMarketAnalyzer.start();

        PresetStorage.loadFromServerAndMerge(() => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.mountUI();
                    DomUtils.installObserver(() => this.mountUI());
                });
            } else {
                this.mountUI();
                DomUtils.installObserver(() => this.mountUI());
            }
        });
        const SLF_DEBUG_EXPORT = {
            scriptVersion: '4.4.72',
            versionInfo: {
                scriptVersion: '4.4.72',
                canonicalCollections: CONFIG.COLLECTIONS,
                legacyCollections: CONFIG.LEGACY_COLLECTIONS,
                aliases: CONFIG.COLLECTION_ALIASES
            },
            buildMatchSnapshot: () => SnapshotEngine.build(),
            readFormation: () => SquadParser.readFormation(),
            readLineupRows: () => SquadParser.readLineupRows(),
            getCurrentTactic,
            parsePlayerText: text => SquadParser.parsePlayerText(text),

            MatchStateParser,
            MatchTimingModel,
            MatchStatsParser,
            SquadParser,
            SnapshotEngine,
            EventTracker,
            RecommendationEngine,
            TacticPresetLibraryPanel,
            TMEnrichmentLayer,
            SLFAlterLayer,
            TransferMarketAnalyzer,
            TrainingGuidePanel,

            readCollection(collection = 'transfer_history', limit = 5) {
                const requestedCollection = collection;
                const actualCollection = CONFIG.COLLECTION_ALIASES?.[collection] || collection;

                if (requestedCollection !== actualCollection) {
                    console.log(`[SLF DEBUG] ${requestedCollection} redirected to ${actualCollection}`);
                }

                return new Promise((resolve, reject) => {
                    Api.get(
                        actualCollection,
                        data => {
                            const count = Array.isArray(data) ? data.length : null;
                            const tail = Array.isArray(data) ? data.slice(-limit) : data;

                            console.log(`[SLF DEBUG] ${actualCollection} count:`, count ?? data);
                            console.log(`[SLF DEBUG] ${actualCollection} last ${limit}:`, tail);

                            resolve(data);
                        },
                        error => {
                            console.warn(`[SLF DEBUG] ${actualCollection} read error:`, error);
                            reject(error);
                        }
                    );
                });
            },

            readLegacyCollection(collection, limit = 5) {
                return new Promise((resolve, reject) => {
                    Api.get(
                        collection,
                        data => {
                            const count = Array.isArray(data) ? data.length : null;
                            const tail = Array.isArray(data) ? data.slice(-limit) : data;

                            console.log(`[SLF DEBUG LEGACY] ${collection} count:`, count ?? data);
                            console.log(`[SLF DEBUG LEGACY] ${collection} last ${limit}:`, tail);

                            resolve(data);
                        },
                        error => {
                            console.warn(`[SLF DEBUG LEGACY] ${collection} read error:`, error);
                            reject(error);
                        }
                    );
                });
            },

            getCanonicalApiStatus() {
                return fetchCanonicalApiStatus().then(status => {
                    console.log('[SLF DEBUG] canonical API status:', status);
                    return status;
                });
            },

            clearLegacyCollections(confirmText = '') {
                if (confirmText !== 'DELETE LEGACY') {
                    console.warn('[SLF DEBUG] Legacy cleanup blocked. Run: SLF_DEBUG.clearLegacyCollections("DELETE LEGACY")');
                    return Promise.resolve({ ok: false, reason: 'confirmation_required' });
                }

                const names = legacyCollectionNames();
                console.warn('[SLF DEBUG] Clearing legacy collections:', names);

                return Promise.all(names.map(name => {
                    return Api.clearCollection(name, `legacy ${name} cleared`)
                        .then(result => ({ collection: name, ok: true, status: result.status }))
                        .catch(error => ({ collection: name, ok: false, error }));
                })).then(results => {
                    console.log('[SLF DEBUG] legacy cleanup results:', results);
                    return results;
                });
            },

            clearLegacy(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            deleteLegacyCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            resetLegacyCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            clearLegacyMatchCollections(confirmText = '') {
                return this.clearLegacyCollections(confirmText);
            },

            readTransferHistory(limit = 5) {
                return this.readCollection('transfer_history', limit);
            }
        };

        window.SLF_DEBUG = SLF_DEBUG_EXPORT;
        window.SLF = SLF_DEBUG_EXPORT;
        window.slf = SLF_DEBUG_EXPORT;

        try {
            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow.SLF_DEBUG = SLF_DEBUG_EXPORT;
                unsafeWindow.SLF = SLF_DEBUG_EXPORT;
                unsafeWindow.slf = SLF_DEBUG_EXPORT;
            }
        } catch (e) {
            console.warn('[SLF DEBUG] unsafeWindow export failed', e);
        }
    }
};

App.start();
// <<< src/app/bootstrap.js


// >>> src/modules/strategy-data-recommendations/preset-fit-scoring.js
// Strategy Data: preset fit scoring and decision fusion
// ============================================================

(function () {
    if (typeof RecommendationEngine === 'undefined' || !RecommendationEngine) return;

    function list(value) {
        return Array.isArray(value) ? value.filter(Boolean) : [];
    }

    function hasTag(state, tag) {
        return list(state?.tags).includes(tag);
    }

    function addReason(result, delta, reason) {
        if (!reason || !delta) return;
        result.reasons.push({ delta, reason });
        result.score += delta;
    }

    RecommendationEngine.getPresetTraits = function getPresetTraits(name) {
        if (typeof TacticPresetLibrary === 'undefined' || !TacticPresetLibrary?.getTraits) return null;
        return TacticPresetLibrary.getTraits(name) || null;
    };

    RecommendationEngine.getTargetAttackLanes = function getTargetAttackLanes(state = {}) {
        const lanes = [];
        if (hasTag(state, 'attack_left')) lanes.push('left');
        if (hasTag(state, 'attack_right')) lanes.push('right');
        if (hasTag(state, 'center_weak')) lanes.push('center');
        return [...new Set(lanes)];
    };

    RecommendationEngine.scorePresetDirectionFit = function scorePresetDirectionFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const presetLanes = list(traits?.attackLanes);
        const targetLanes = this.getTargetAttackLanes(state);

        if (!presetLanes.length || !targetLanes.length) return result;

        const matches = targetLanes.filter(lane => presetLanes.includes(lane));
        if (matches.length) addReason(result, matches.length * 2, `направление пресета совпадает с целевой зоной: ${matches.join(', ')}`);
        else addReason(result, -2, `направление пресета (${presetLanes.join(', ')}) не совпадает с целевой зоной (${targetLanes.join(', ')})`);

        return result;
    };

    RecommendationEngine.scorePresetCrossFit = function scorePresetCrossFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const avoids = list(traits?.avoids);
        const strengths = list(traits?.strengths);
        const ownCrossBad = hasTag(state, 'own_open_play_crosses_bad') || hasTag(state, 'own_crosses_bad_total');
        const wideOrCross = strengths.some(x => /cross|wide|wing/i.test(String(x))) || String(traits?.build || '').includes('wide');

        if (ownCrossBad && avoids.includes('own_crosses_bad')) addReason(result, 2, 'пресет явно избегает плохих кроссов');
        if (ownCrossBad && wideOrCross && !avoids.includes('own_crosses_bad')) addReason(result, -3, 'кроссы/ширина конфликтуют с плохими кроссами');
        if (hasTag(state, 'opponent_crosses_dangerous') && avoids.includes('opponent_crosses_dangerous')) addReason(result, 1, 'пресет учитывает риск опасных кроссов соперника');

        return result;
    };

    RecommendationEngine.scorePresetRiskFit = function scorePresetRiskFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const risk = String(traits?.risk || 'medium');
        const tempo = String(traits?.tempo || 'medium');
        const press = String(traits?.press || 'medium');
        const highRisk = /high/.test(risk) || /high/.test(tempo) || /high/.test(press);
        const lowRisk = /low/.test(risk);
        const minute = Number(state?.minute || 0);
        const scoreState = state?.score?.state || 'unknown';

        if (hasTag(state, 'high_bad_actions') && highRisk) addReason(result, -3, 'высокий риск/темп/прессинг конфликтует с высоким браком');
        if (hasTag(state, 'high_bad_actions') && lowRisk) addReason(result, 2, 'низкий риск подходит при высоком браке');
        if (hasTag(state, 'low_bad_actions') && highRisk && scoreState === 'losing') addReason(result, 1, 'низкий брак позволяет поднять риск при необходимости гола');
        if (hasTag(state, 'press_fatigue_risk') && /high/.test(press)) addReason(result, -4, 'высокий прессинг конфликтует с fatigue risk');
        if (scoreState === 'winning' && minute >= 70 && highRisk) addReason(result, -2, 'поздно ведём — высокий риск нежелателен');
        if (scoreState === 'losing' && minute >= 80 && highRisk) addReason(result, 2, 'поздно проигрываем — высокий риск допустим');

        return result;
    };

    RecommendationEngine.scorePresetStrengthFit = function scorePresetStrengthFit(traits, state = {}) {
        const result = { score: 0, reasons: [] };
        const build = String(traits?.build || '');
        const requires = list(traits?.requires);
        const avoids = list(traits?.avoids);
        const strengthMode = state?.strengthContext?.mode || 'unknown';
        const highPressOrChaos = /press|chaos|gegen/i.test(build) || /high/.test(String(traits?.press || ''));
        const controlOrCompact = /control|compact|low_block|counter/.test(build);

        if (strengthMode === 'advantage' && /control|positional|box/.test(build)) addReason(result, 2, 'преимущество силы можно конвертировать в контроль/позиционную атаку');
        if (strengthMode === 'advantage' && requires.includes('need_stability')) addReason(result, 1, 'пресет стабилизирует игру при преимуществе силы');
        if (strengthMode === 'disadvantage' && highPressOrChaos && !requires.includes('emergency_need_goal')) addReason(result, -3, 'недостаток силы плохо сочетается с высоким прессингом/хаосом');
        if (strengthMode === 'disadvantage' && controlOrCompact) addReason(result, 2, 'недостаток силы поддерживает компактный/контрольный план');
        if (hasTag(state, 'opponent_high_press') && requires.includes('passing_quality') && hasTag(state, 'high_bad_actions')) addReason(result, -2, 'bait/release требует паса, но брак высокий');
        if (hasTag(state, 'opponent_low_block') && avoids.includes('center_closed')) addReason(result, -1, 'пресет избегает закрытого центра против низкого блока');

        return result;
    };

    RecommendationEngine.scorePresetFit = function scorePresetFit(name, state = {}) {
        const traits = this.getPresetTraits(name);
        const result = { name, score: 0, traitsFound: !!traits, reasons: [], parts: {} };

        if (!traits) {
            result.reasons.push({ delta: 0, reason: 'structured traits missing' });
            return result;
        }

        const parts = {
            direction: this.scorePresetDirectionFit(traits, state),
            cross: this.scorePresetCrossFit(traits, state),
            risk: this.scorePresetRiskFit(traits, state),
            strength: this.scorePresetStrengthFit(traits, state)
        };

        Object.entries(parts).forEach(([key, part]) => {
            result.parts[key] = part;
            result.score += Number(part.score || 0);
            part.reasons.forEach(reason => result.reasons.push(Object.assign({ part: key }, reason)));
        });

        return result;
    };

    RecommendationEngine.explainPresetFitScore = function explainPresetFitScore(fit) {
        if (!fit?.traitsFound) return [`${fit?.name || 'preset'}: traits missing.`];
        const sign = fit.score > 0 ? '+' : '';
        const rows = [`${fit.name}: fit score ${sign}${fit.score}.`];
        fit.reasons.slice(0, 6).forEach(item => {
            const delta = item.delta > 0 ? `+${item.delta}` : String(item.delta);
            rows.push(`${delta}: ${item.reason}.`);
        });
        return rows;
    };

    function groupOf(name) {
        return TacticPresetLibrary?.getGroup ? TacticPresetLibrary.getGroup(name) : TacticPresetLibrary?.meta?.[name]?.group || 'custom';
    }

    function isHighProfile(name) {
        const traits = RecommendationEngine.getPresetTraits(name);
        return /high|very_high/.test(`${traits?.risk || ''} ${traits?.tempo || ''} ${traits?.press || ''}`);
    }

    RecommendationEngine.getPresetFusionCandidateNames = function getPresetFusionCandidateNames(rawCandidate, state = {}) {
        const names = [rawCandidate?.name];
        names.push(...(this.getPresetLadder ? this.getPresetLadder(groupOf(rawCandidate?.name)) : []));

        if (hasTag(state, 'attack_left')) names.push('Henta_LeftTrap_att3', 'Klopp_WideTrap_att4', 'Conte_WingbackWidth_bal4', 'Mourinho_WeakSide_def3');
        if (hasTag(state, 'attack_right')) names.push('Henta_RightTrap_att3', 'Klopp_WideTrap_att4', 'Conte_WingbackWidth_bal4', 'Mourinho_WeakSide_def3');
        if (hasTag(state, 'center_weak')) names.push('Xabi_VerticalBox_att3', 'Xabi_BoxMidfield_bal3', 'Henta_CentralTrap_att3', 'Pep_ControlledPush_att3');
        if (hasTag(state, 'opponent_high_press')) names.push('DeZerbi_BaitPress_bal3', 'DeZerbi_Release_att4', 'Henta_CounterTrap_att4', 'Pep_PressCooldown_bal2');
        if (hasTag(state, 'opponent_low_block')) names.push('Pep_TwoThreeFive_att3', 'Xabi_VerticalBox_att3', 'Conte_WingbackWidth_bal4');
        if (hasTag(state, 'press_fatigue_risk') || hasTag(state, 'high_bad_actions')) names.push('Pep_PressCooldown_bal2', 'Pep_BoxControl_bal2', 'Compact_Counter_def3');

        if (state?.strengthContext?.mode === 'disadvantage') names.push('Mourinho_WeakSide_def3', 'Compact_Counter_def3', 'Pep_BoxControl_bal2');
        if (state?.strengthContext?.mode === 'advantage') names.push('Xabi_BoxMidfield_bal3', 'Pep_TwoThreeFive_att3', 'Pep_ControlledPush_att3');

        const scoreState = state?.score?.state || 'unknown';
        const minute = Number(state?.minute || 0);
        if (scoreState === 'losing' && minute >= 55) names.push('Pep_ControlledPush_att3', 'Xabi_VerticalBox_att3', 'Klopp_Gegenpress_att4', 'DeZerbi_Release_att4');
        if (scoreState === 'losing' && minute >= 80) names.push('Bielsa_ChaosPress_att5');
        if (scoreState === 'winning' && minute >= 70) names.push('Pep_BoxControl_bal2', 'Simeone_Compact442_def4', 'Simeone_LowBlock_def5');

        return [...new Set(names.filter(Boolean))].filter(name => !!TacticPresetLibrary?.meta?.[name]);
    };

    RecommendationEngine.rankPresetFusionCandidates = function rankPresetFusionCandidates(rawCandidate, state = {}) {
        return this.getPresetFusionCandidateNames(rawCandidate, state)
            .map(name => this.scorePresetFit(name, state))
            .filter(fit => fit?.traitsFound)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.name === rawCandidate?.name) return -1;
                if (b.name === rawCandidate?.name) return 1;
                return 0;
            });
    };

    RecommendationEngine.shouldApplyPresetFusion = function shouldApplyPresetFusion(rawFit, bestFit, rawCandidate, state = {}) {
        if (!rawCandidate?.name || !bestFit?.name || bestFit.name === rawCandidate.name) return false;
        const diff = Number(bestFit.score || 0) - Number(rawFit.score || 0);
        const urgent = ['emergency', 'radical'].includes(state?.urgency?.level || '');
        if (diff < (urgent ? 5 : 3)) return false;
        if (Number(bestFit.score || 0) < 2) return false;

        const scoreState = state?.score?.state || 'unknown';
        const minute = Number(state?.minute || 0);
        if (scoreState === 'winning' && minute >= 70 && isHighProfile(bestFit.name)) return false;
        if ((hasTag(state, 'press_fatigue_risk') || hasTag(state, 'high_bad_actions')) && isHighProfile(bestFit.name)) return false;
        if (scoreState === 'losing' && minute >= 80 && groupOf(rawCandidate.name) === 'attack' && groupOf(bestFit.name) !== 'attack' && diff < 6) return false;
        return true;
    };

    RecommendationEngine.applyPresetDecisionFusion = function applyPresetDecisionFusion(rawCandidate, state = {}) {
        if (!rawCandidate?.name || !this.scorePresetFit) return rawCandidate;
        const ranked = this.rankPresetFusionCandidates(rawCandidate, state);
        const rawFit = ranked.find(item => item.name === rawCandidate.name) || this.scorePresetFit(rawCandidate.name, state);
        const bestFit = ranked[0] || rawFit;

        if (!this.shouldApplyPresetFusion(rawFit, bestFit, rawCandidate, state)) {
            return Object.assign({}, rawCandidate, { fusion: { applied: false, rawFit, bestFit, ranked: ranked.slice(0, 5) } });
        }

        const diff = Number(bestFit.score || 0) - Number(rawFit.score || 0);
        const positives = bestFit.reasons.filter(item => Number(item.delta || 0) > 0).slice(0, 2).map(item => item.reason);
        const suffix = positives.length ? ` ${positives.join('; ')}` : '';
        return {
            name: bestFit.name,
            reason: `${rawCandidate.reason || 'базовый выбор'}; fusion: ${this.getPresetTitle ? this.getPresetTitle(bestFit.name) : bestFit.name} лучше совпадает с контекстом по score ${bestFit.score} против ${rawFit.score} (${diff >= 0 ? '+' : ''}${diff}).${suffix}`,
            fusion: { applied: true, originalName: rawCandidate.name, rawFit, bestFit, ranked: ranked.slice(0, 5) }
        };
    };

    if (typeof RecommendationEngine.selectRawPreset === 'function' && !RecommendationEngine.selectRawPreset.__slfFusionWrapped) {
        const originalSelectRawPreset = RecommendationEngine.selectRawPreset;
        const wrapped = function selectRawPresetWithDecisionFusion(snapshot, state) {
            const rawCandidate = originalSelectRawPreset.call(this, snapshot, state);
            return this.applyPresetDecisionFusion(rawCandidate, state || {});
        };
        wrapped.__slfFusionWrapped = true;
        RecommendationEngine.selectRawPreset = wrapped;
    }
}());
// <<< src/modules/strategy-data-recommendations/preset-fit-scoring.js


// >>> src/modules/tactics-presets/tactics-dropdown-ui-policy.js
// Tactics Dropdown UI Policy
// ============================================================
// UI-only normalization for the quick tactic selector.
// - remove stale saved Henta_* custom presets except Henta_LeftTrap_att3;
// - hide trainer/custom optgroup headers;
// - show one flat list sorted by trainer/name.

(function tacticsDropdownUiPolicy() {
    'use strict';

    const ALLOWED_HENTA = 'Henta_LeftTrap_att3';
    const POLICY_MARKER = '__slfTacticsDropdownUiPolicyApplied';

    function isDeprecatedHentaPreset(name) {
        const key = String(name || '');
        return key.startsWith('Henta_') && key !== ALLOWED_HENTA;
    }

    function cloneFilteredMap(map) {
        const result = {};
        Object.entries(map || {}).forEach(([key, value]) => {
            if (!isDeprecatedHentaPreset(key)) result[key] = value;
        });
        return result;
    }

    function cleanupLocalCustomPresets() {
        try {
            if (typeof localStorage === 'undefined' || typeof CONFIG === 'undefined' || !CONFIG?.STORAGE_KEY) return;
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            const filtered = cloneFilteredMap(parsed);
            const before = Object.keys(parsed || {}).sort().join('|');
            const after = Object.keys(filtered || {}).sort().join('|');

            if (before !== after) {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(filtered));
            }
        } catch (e) {}
    }

    function patchPresetStorage() {
        if (typeof PresetStorage === 'undefined' || !PresetStorage || PresetStorage[POLICY_MARKER]) return;

        const wrapMapMethod = methodName => {
            const original = PresetStorage[methodName]?.bind(PresetStorage);
            if (!original) return;

            PresetStorage[methodName] = function filteredPresetMapMethod() {
                return cloneFilteredMap(original.apply(PresetStorage, arguments) || {});
            };
        };

        const originalSaveLocalOnly = PresetStorage.saveLocalOnly?.bind(PresetStorage);
        if (originalSaveLocalOnly) {
            PresetStorage.saveLocalOnly = function saveFilteredLocalPresets(customPresets) {
                return originalSaveLocalOnly(cloneFilteredMap(customPresets || {}));
            };
        }

        const originalSaveCustom = PresetStorage.saveCustom?.bind(PresetStorage);
        if (originalSaveCustom) {
            PresetStorage.saveCustom = function saveFilteredCustomPresets(customPresets) {
                return originalSaveCustom(cloneFilteredMap(customPresets || {}));
            };
        }

        wrapMapMethod('loadLocalRaw');
        wrapMapMethod('loadCustom');
        wrapMapMethod('getAllPresets');
        wrapMapMethod('getAllLabels');

        PresetStorage[POLICY_MARKER] = true;
    }

    function getTrainerSortKey(key, label) {
        const text = `${label || ''} ${key || ''}`.toLowerCase();

        if (text.includes('arteta')) return 'arteta';
        if (text.includes('bielsa')) return 'bielsa';
        if (text.includes('compact counter')) return 'compact';
        if (text.includes('conte')) return 'conte';
        if (text.includes('de zerbi') || text.includes('dezerbi')) return 'de zerbi';
        if (text.includes('henta')) return 'henta';
        if (text.includes('klopp')) return 'klopp';
        if (text.includes('mourinho')) return 'mourinho';
        if (text.includes('nagelsmann')) return 'nagelsmann';
        if (text.includes('pep')) return 'pep';
        if (text.includes('simeone')) return 'simeone';
        if (text.includes('xabi')) return 'xabi';
        if (text.includes('стандарт') || text.includes('standard')) return 'standard';

        return String(label || key || '').toLowerCase();
    }

    function getSortedTacticItems() {
        const labels = typeof PresetStorage !== 'undefined' && PresetStorage.getAllLabels
            ? PresetStorage.getAllLabels()
            : {};

        return Object.entries(labels)
            .filter(([key]) => !isDeprecatedHentaPreset(key))
            .map(([key, label]) => ({
                key,
                label: String(label || key),
                trainer: getTrainerSortKey(key, label)
            }))
            .sort((a, b) => {
                const trainerCmp = a.trainer.localeCompare(b.trainer, 'ru', { sensitivity: 'base' });
                if (trainerCmp !== 0) return trainerCmp;
                return a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' });
            });
    }

    function hasSameFlatOptions(select, items) {
        if (!select || select.children.length !== items.length) return false;
        return items.every((item, index) => {
            const opt = select.children[index];
            return opt && opt.tagName === 'OPTION' && opt.value === item.key && opt.textContent === item.label;
        });
    }

    function rewriteSelectFlat(select) {
        if (!select || select.dataset.slfFlatPresetRewrite === '1') return;

        const items = getSortedTacticItems();
        const current = select.value;

        if (hasSameFlatOptions(select, items)) return;

        select.dataset.slfFlatPresetRewrite = '1';
        select.innerHTML = '';

        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = item.label;
            select.appendChild(opt);
        });

        if (items.some(item => item.key === current)) {
            select.value = current;
        } else if (items.length) {
            select.value = items[0].key;
        }

        setTimeout(() => {
            delete select.dataset.slfFlatPresetRewrite;
        }, 0);
    }

    function normalizeDropdown() {
        cleanupLocalCustomPresets();
        patchPresetStorage();

        const select = document.querySelector('#slf-tactics-dropdown select');
        if (!select) return;

        rewriteSelectFlat(select);

        if (select.dataset.slfFlatPresetObserver === '1') return;

        const observer = new MutationObserver(() => {
            if (select.dataset.slfFlatPresetRewrite === '1') return;
            setTimeout(() => rewriteSelectFlat(select), 0);
        });

        observer.observe(select, { childList: true, subtree: false });
        select.dataset.slfFlatPresetObserver = '1';
    }

    cleanupLocalCustomPresets();
    patchPresetStorage();

    if (typeof UI !== 'undefined' && UI?.addDropdown && !UI.__flatSortedTacticDropdownApplied) {
        const originalAddDropdown = UI.addDropdown.bind(UI);

        UI.addDropdown = async function addFlatSortedTacticDropdown() {
            const result = await originalAddDropdown.apply(UI, arguments);
            normalizeDropdown();
            return result;
        };

        UI.__flatSortedTacticDropdownApplied = true;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', normalizeDropdown, { once: true });
        } else {
            setTimeout(normalizeDropdown, 0);
        }
    }
})();
// <<< src/modules/tactics-presets/tactics-dropdown-ui-policy.js

    // BEGIN SLF FINAL RUNTIME VERSION EXPORT
    var SLF_VERSION_INFO = {
        version: '4.4.199',
        scriptVersion: '4.4.199',
        releaseChannel: 'github-tampermonkey',
        updateURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js',
        downloadURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js'
    };
    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {
        scriptVersion: '4.4.199',
        versionInfo: SLF_VERSION_INFO
    });
    // END SLF FINAL RUNTIME VERSION EXPORT

})();
