// ==UserScript==
// @name         SLF Tactics Helper (+VPS Sync + Live Parser)
// @namespace    http://tampermonkey.net/
// @version      4.4.79
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
        version: '4.4.79',
        scriptVersion: '4.4.79',
        releaseChannel: 'github-tampermonkey',
        updateURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js',
        downloadURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js'
    };
    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {
        scriptVersion: '4.4.79',
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

    const Api = {
        postPromise(collection, data, label) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${CONFIG.SERVER_URL}/api/${collection}`,
                    headers: {
                        "Authorization": "Bearer " + CONFIG.TOKEN,
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
                        "Authorization": "Bearer " + CONFIG.TOKEN
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
            { index: 6, from: 76, to: 85, label: '76-85', generationMinutes: 10, realMinutes: 4, phase: 'late' },
            { index: 7, from: 86, to: 90, label: '86-90', generationMinutes: 5, realMinutes: 2, phase: 'final_5', isFinal: true }
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
                t.includes('лучше проводим') ||
                t.includes('лучше проводит') ||
                t.includes('проводим матч лучше') ||
                t.includes('выше ожидан') ||
                t.includes('ниже ожидан') ||
                t.includes('хуже ожидан') ||
                t.includes('качество игры') ||
                t.includes('генератор доволен') ||
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

        if (
            t.includes('генератор доволен') ||
            t.includes('генератор ожидает')
        ) {
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

    isGeneratorQualityText(text) {
        const t = String(text || '').toLowerCase();

        return (
            t.includes('лучше проводим') ||
            t.includes('лучше проводит') ||
            t.includes('проводим матч лучше') ||
            t.includes('проводит матч лучше') ||
            t.includes('выше ожидан') ||
            t.includes('ниже ожидан') ||
            t.includes('хуже ожидан') ||
            t.includes('качество игры') ||
            (t.includes('генератор') && (t.includes('доволен') || t.includes('ожидает')))
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
                text: ''
            };
        }

        const text = candidates.map(h => h.text || String(h || '')).join(' | ');
        const lower = text.toLowerCase();
        const percent = this.parsePercent(text);
        let direction = 'neutral';

        if (
            lower.includes('лучше') ||
            lower.includes('выше ожид') ||
            lower.includes('доволен') ||
            (percent != null && percent > 0)
        ) {
            direction = 'positive';
        }

        if (
            lower.includes('хуже') ||
            lower.includes('ниже ожид') ||
            (percent != null && percent < 0)
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
            detected: true,
            direction,
            confidenceBoost: Number(confidenceBoost.toFixed(2)),
            percent,
            text,
            source: 'pep_generator_hint'
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

    getSchemeForPreset(name) {
        const state = this.presetSchemeState[name] || 'base_balance';
        return this.schemeStates[state] || this.schemeStates.base_balance;
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


// >>> src/modules/strategy-data-recommendations/tactical-urgency-model.js
// 9.8 Tactical urgency / radicality model
// ============================================================

const TacticalUrgencyModel = {
    getMinuteUrgency(minute) {
        const m = Number(minute || 0);
        if (!Number.isFinite(m) || m < 15) return 0;
        if (m < 30) return 1;
        if (m < 45) return 2;
        if (m < 60) return 3;
        if (m < 75) return 4;
        if (m < 80) return 5;
        if (m < 85) return 6;
        return 2;
    },

    getDecisionWindow(minute) {
        const m = Number(minute || 0);

        if (!Number.isFinite(m) || m < 15) {
            return {
                phase: 'collect',
                label: 'Сбор данных',
                sourceSegment: '01-15',
                targetSegment: '16-30',
                applyByMinute: 15
            };
        }

        if (m < 30) return { phase: 'decision', label: 'Окно решения', sourceSegment: '01-15', targetSegment: '16-30', applyByMinute: 15 };
        if (m < 45) return { phase: 'decision', label: 'Окно решения', sourceSegment: '16-30', targetSegment: '31-45', applyByMinute: 30 };
        if (m < 60) return { phase: 'decision', label: 'Окно решения', sourceSegment: '31-45', targetSegment: '46-60', applyByMinute: 45 };
        if (m < 75) return { phase: 'decision', label: 'Окно решения', sourceSegment: '46-60', targetSegment: '61-75', applyByMinute: 60 };
        if (m < 80) return { phase: 'late', label: 'Позднее окно решения', sourceSegment: '61-75', targetSegment: '76-85', applyByMinute: 75 };
        if (m < 85) return { phase: 'final_decision', label: 'Финальное окно решения', sourceSegment: '76-80', targetSegment: '86-90', applyByMinute: 84 };
        return { phase: 'too_late_big_change', label: 'Поздний статус', sourceSegment: '86-90', targetSegment: '86-90', applyByMinute: 84 };
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

        if (!Number.isFinite(minute) || minute < 15) {
            return {
                level: 'collect',
                label: 'Сбор данных',
                uiLabel: 'Сбор данных',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'до первого generation-среза пресет не предлагается'
            };
        }

        if (minute >= 85) {
            return {
                level: 'late_status',
                label: 'Поздний статус: большие изменения уже поздно',
                uiLabel: 'Поздний статус',
                allowPreset: false,
                allowFamilyChange: false,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'финальную смену нужно было применять до 84-й минуты'
            };
        }

        const emergency =
            losingBy >= 3 ||
            (minute <= 30 && losingBy >= 2) ||
            xgGap >= 1.2 ||
            xtGap >= 1.5 ||
            myBad >= 28 ||
            criticalCondition;

        const hugeLead = winningBy >= 4 || (minute <= 35 && winningBy >= 3);

        if (emergency) {
            const reasons = [];
            if (losingBy >= 3) reasons.push(`проигрываем ${losingBy} мяча`);
            if (minute <= 30 && losingBy >= 2) reasons.push(`ранний провал по счёту: -${losingBy} к ${minute}-й`);
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

        if (minuteUrgency >= 6) {
            return {
                level: 'radical',
                label: 'Финальное окно решения: применить до 84-й',
                uiLabel: 'Кардинальная смена',
                allowPreset: true,
                allowFamilyChange: true,
                overrideProgressionGuard: false,
                decisionWindow,
                reason: 'последнее окно для изменения картины игры на 86-90'
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

            const liveBtn = document.createElement('button');
            liveBtn.textContent = '▶ Live';
            liveBtn.style.cssText = 'padding:5px 8px;background:#285;color:#fff;border:1px solid #6c6;border-radius:3px;cursor:pointer;';
            liveBtn.onclick = () => SnapshotEngine.startLive();

            const stopBtn = document.createElement('button');
            stopBtn.textContent = '■ Stop';
            stopBtn.style.cssText = 'padding:5px 8px;background:#633;color:#fff;border:1px solid #966;border-radius:3px;cursor:pointer;';
            stopBtn.onclick = () => SnapshotEngine.stopLive();

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

            panel.append(info, liveBtn, stopBtn, parseBtn, statsBtn, statusBox, recBox, logBox);

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

            function refreshSelect(keepValue) {
                const labels = PresetStorage.getAllLabels();
                const cur = keepValue || select.value;

                select.innerHTML = Object.keys(labels)
                    .map(k => `<option value="${k}">${labels[k]}</option>`)
                    .join('');

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


// >>> src/modules/team-management/youth-external-monitor.js
// 11.4 Youth External Monitor
// ============================================================

const YouthExternalMonitor = {
    cacheKey: 'slf_youth_tm_seen_ids_v8',
    _scanPromise: null,

    getSeasons() {
        const y = new Date().getFullYear();
        return [y, y - 1];
    },

    buildTransferUrl(source, season) {
        return `https://www.transfermarkt.com/${source.slug}/transfers/verein/${source.clubId}/saison_id/${season}`;
    },

    buildCanonicalYouthUrl(source) {
        return `https://www.transfermarkt.com/${source.slug}/transfers/verein/${source.clubId}`;
    },

    getCanonicalYouthKey(source) {
        return String(source?.clubId || '').trim();
    },

    extractClubIdFromUrl(url) {
        const m = String(url || '').match(/\/verein\/(\d+)/i);
        return m ? Number(m[1]) : null;
    },

    isTmChallengePage(html) {
        const text = String(html || '').toLowerCase();
        if (!text) return false;

        return (
            text.includes('captcha') ||
            text.includes('access denied') ||
            text.includes('are you a human') ||
            text.includes('unusual traffic') ||
            text.includes('cloudflare')
        );
    },

    resolveTmSourceState(html, source, requestedSeason, requestedUrl, loadedUrl) {
        const finalUrl = loadedUrl || requestedUrl || '';
        const expectedClubId = Number(source?.clubId || 0) || null;
        const loadedClubId = this.extractClubIdFromUrl(finalUrl) || this.extractClubIdFromUrl(requestedUrl);
        const resolvedSeason = this.resolveSeasonFromUrlOrContent(finalUrl || requestedUrl, requestedSeason, html);
        const identityMismatch = !!(expectedClubId && loadedClubId && expectedClubId !== loadedClubId);

        return {
            canonicalYouthKey: this.getCanonicalYouthKey(source),
            canonicalYouthUrl: this.buildCanonicalYouthUrl(source),
            requestedUrl,
            loadedUrl: finalUrl || requestedUrl,
            requestedSeason,
            resolvedSeason,
            label: source?.label || '',
            team: source?.team || '',
            slug: source?.slug || '',
            expectedClubId,
            loadedClubId,
            identityMismatch,
            challenge: this.isTmChallengePage(html),
            sourceLabel: source?.label || '',
            sourceTeam: source?.team || '',
            sourceClubId: expectedClubId
        };
    },

    loadSeenIds() {
        try {
            return JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveSeenIds(data) {
        localStorage.setItem(this.cacheKey, JSON.stringify(data));
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    makeFetchError(kind, url, response = null, original = null) {
        const status = response?.status ?? null;
        const statusText = response?.statusText || '';
        const err = new Error(`${kind}${status ? ' HTTP ' + status : ''}${statusText ? ' ' + statusText : ''}`.trim());
        err.kind = kind;
        err.url = url;
        err.status = status;
        err.statusText = statusText;
        err.responseText = response?.responseText || '';
        err.original = original || null;
        return err;
    },

    async fetchUrl(url, options = {}) {
        const retries = Number(options.retries ?? 1);
        const delayMs = Number(options.delayMs ?? CONFIG.TRANSFER_ANALYZER?.requestDelayMs ?? 900);
        const timeout = Number(options.timeout ?? 20000);

        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            if (attempt > 0 || delayMs > 0) await this.sleep(delayMs * (attempt + 1));

            try {
                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        },
                        onload: r => {
                            if (r.status >= 200 && r.status < 400) {
                                const html = r.responseText || '';

                                if (options.returnMeta) {
                                    resolve({
                                        html,
                                        requestedUrl: url,
                                        finalUrl: r.finalUrl || r.responseURL || url,
                                        status: r.status,
                                        statusText: r.statusText || ''
                                    });
                                    return;
                                }

                                resolve(html);
                                return;
                            }
                            reject(this.makeFetchError('http_error', url, r));
                        },
                        onerror: e => reject(this.makeFetchError('network_error', url, null, e)),
                        ontimeout: e => reject(this.makeFetchError('timeout', url, null, e)),
                        timeout
                    });
                });
            } catch (e) {
                lastError = e;
                if (e.status && ![403, 408, 429, 500, 502, 503, 504].includes(Number(e.status))) break;
            }
        }

        throw lastError || this.makeFetchError('unknown_error', url);
    },

    extractPlayersFromTM(html, source, season, sourceUrl, sourceState = null) {
        const state = sourceState || this.resolveTmSourceState(html, source, season, sourceUrl, sourceUrl);

        if (state.identityMismatch) {
            throw this.makeFetchError(
                'tm_identity_mismatch',
                state.loadedUrl || sourceUrl,
                { status: 0, statusText: `expected verein ${state.expectedClubId}, got ${state.loadedClubId || 'unknown'}` }
            );
        }

        if (state.challenge) {
            throw this.makeFetchError(
                'tm_challenge_or_block',
                state.loadedUrl || sourceUrl,
                { status: 0, statusText: 'captcha/access denied/challenge page' }
            );
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const links = [...doc.querySelectorAll('a[href*="/profil/spieler/"]')];

        const map = new Map();

        links.forEach(a => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/spieler\/(\d+)/);
            if (!m) return;

            const tmId = m[1];
            const name = (a.textContent || '').trim().replace(/\s+/g, ' ');

            if (!name || name.length < 2) return;

            const fullUrl = href.startsWith('http')
                ? href
                : 'https://www.transfermarkt.com' + href;

            map.set(tmId, {
                tmId,
                name,
                tmUrl: fullUrl,
                season: state.resolvedSeason || season,
                requestedSeason: season,
                resolvedSeason: state.resolvedSeason || season,
                sourceLabel: source.label,
                sourceTeam: source.team,
                sourceSlug: source.slug,
                sourceClubId: source.clubId,
                canonicalYouthKey: state.canonicalYouthKey,
                canonicalYouthUrl: state.canonicalYouthUrl,
                loadedUrl: state.loadedUrl,
                sourceUrl: state.loadedUrl || sourceUrl,
                sourceDebug: state
            });
        });

        return [...map.values()];
    },

    normalizeText(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    resolveSeasonFromUrlOrContent(url, fallbackSeason, html = '') {
        const fromUrl = String(url || '').match(/saison_id\/(\d{4})|saison_id=(\d{4})/i);
        const urlSeason = Number(fromUrl?.[1] || fromUrl?.[2] || 0);
        if (Number.isFinite(urlSeason) && urlSeason > 0) return urlSeason;

        const body = String(html || '');
        const selected = body.match(/<option[^>]+(?:selected|selected="selected")[^>]+value=["']?(\d{4})/i);
        const selectedSeason = Number(selected?.[1] || 0);
        if (Number.isFinite(selectedSeason) && selectedSeason > 0) return selectedSeason;

        const anySeason = body.match(/saison_id[=\/"'&;: ]+(\d{4})/i);
        const contentSeason = Number(anySeason?.[1] || 0);
        if (Number.isFinite(contentSeason) && contentSeason > 0) return contentSeason;

        const season = Number(fallbackSeason || 0);
        return Number.isFinite(season) && season > 0 ? season : fallbackSeason;
    },

    getYouthFilterForPlayer(player, seen) {
        const check = seen[String(player?.tmId || '')] || {};
        const eligibility = check.eligibility || player?.eligibility || null;

        if (!check.checked) return 'unchecked';
        if (check.exists === true) return 'exists';
        if (check.exists === false && eligibility?.skip) return 'skip';
        if (check.exists === false && eligibility?.manualReview) return 'manual';
        if (check.exists === false) return 'missing';
        return 'found';
    },

    makeFilterButton(filter, label, count, color = '#ddd') {
        return `
            <button type="button" class="slf-youth-filter-btn" data-filter="${this.escapeHtml(filter)}" style="
                background:#181818;
                border:1px solid #444;
                border-radius:5px;
                padding:6px 8px;
                color:${color};
                cursor:pointer;
            ">${this.escapeHtml(label)}: <b>${this.escapeHtml(count)}</b></button>
        `;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    normalizeClubName(value) {
        return this.normalizeText(value)
            .toLowerCase()
            .replace(/\bunder\s*[- ]?\s*(\d{2})\b/g, 'u$1')
            .replace(/\bu\s*[- ]?\s*(\d{2})\b/g, 'u$1')
            .replace(/\b(fc|sc|cf|afc|club|football club)\b/g, ' ')
            .replace(/[^a-z0-9а-яё]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    stripYouthSuffix(value) {
        return this.normalizeText(value)
            .replace(/\bunder\s*[- ]?\s*\d{2}\b/ig, '')
            .replace(/\bu\s*[- ]?\s*\d{2}\b/ig, '')
            .replace(/\bgiovanili\b/ig, '')
            .replace(/\byouth\b/ig, '')
            .replace(/\bjugend\b/ig, '')
            .replace(/\bacademy\b/ig, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    sourceClubAliasGroups(source) {
        const rawLabel = this.normalizeText(source?.label || '');
        const rawTeam = this.normalizeText(source?.team || '');
        const rawSlug = this.normalizeText(String(source?.slug || '').replace(/-/g, ' '));

        const youthRaw = [rawLabel, rawSlug].filter(Boolean);
        const parentRaw = [
            rawTeam,
            this.stripYouthSuffix(rawLabel),
            this.stripYouthSuffix(rawSlug)
        ].filter(Boolean);

        const normalizeList = arr => [...new Set(arr
            .map(x => this.normalizeClubName(x))
            .filter(x => x && x.length >= 3))];

        return {
            youth: normalizeList(youthRaw),
            parent: normalizeList(parentRaw),
            all: normalizeList([...youthRaw, ...parentRaw])
        };
    },

    clubMatchesAliases(clubName, aliases) {
        const name = this.normalizeClubName(clubName);
        const list = Array.isArray(aliases) ? aliases : [];
        if (!name || !list.length) return false;

        return list.some(alias => {
            const a = this.normalizeClubName(alias);
            if (!a || a.length < 3) return false;
            if (name === a) return true;
            if (a.length >= 5 && name.includes(a)) return true;
            if (name.length >= 5 && a.includes(name)) return true;
            return false;
        });
    },

    parseTransferDateText(text) {
        const m = String(text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yy = Number(m[3]);
        if (!dd || !mm || !yy) return null;
        return Date.UTC(yy, mm - 1, dd);
    },

    findValueAfterLabels(lines, labels) {
        const lowerLabels = labels.map(x => String(x).toLowerCase().replace(/:$/, '').trim());

        for (let i = 0; i < lines.length; i++) {
            const line = this.normalizeText(lines[i]);
            const lower = line.toLowerCase().replace(/:$/, '').trim();

            if (!lowerLabels.includes(lower)) continue;

            for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
                const value = this.normalizeText(lines[j]);
                const valueLower = value.toLowerCase().replace(/:$/, '').trim();
                if (!value) continue;
                if (lowerLabels.includes(valueLower)) continue;
                return value;
            }
        }

        return '';
    },

    parseTransferHistoryRows(doc) {
        const rows = [];
        const trs = [...doc.querySelectorAll('table tr')];

        trs.forEach(tr => {
            const cells = [...tr.querySelectorAll('td,th')]
                .map(td => this.normalizeText(td.innerText || td.textContent || ''))
                .filter(Boolean);

            if (cells.length < 4) return;

            const dateIndex = cells.findIndex(x => /\d{1,2}\/\d{1,2}\/\d{4}/.test(x));
            if (dateIndex < 0) return;

            const dateText = cells[dateIndex];
            const left = cells[dateIndex + 1] || '';
            const joined = cells[dateIndex + 2] || '';
            const fee = cells[cells.length - 1] || '';
            const season = cells[0] || '';

            rows.push({
                season,
                dateText,
                dateTs: this.parseTransferDateText(dateText),
                left,
                joined,
                fee,
                rawCells: cells
            });
        });

        return rows;
    },

    parseTmProfileDoc(doc) {
        const bodyText = doc.body?.innerText || '';
        const lines = bodyText
            .split(/\n+/)
            .map(x => this.normalizeText(x))
            .filter(Boolean);

        const currentClub = this.findValueAfterLabels(lines, [
            'Current club:',
            'Current club',
            'Aktueller Verein:',
            'Aktueller Verein'
        ]);

        const onLoanFrom = this.findValueAfterLabels(lines, [
            'On loan from:',
            'On loan from',
            'Ausgeliehen von:',
            'Ausgeliehen von'
        ]);

        const joined = this.findValueAfterLabels(lines, ['Joined:', 'Joined']);
        const contractExpires = this.findValueAfterLabels(lines, ['Contract expires:', 'Contract expires']);
        const contractThereExpires = this.findValueAfterLabels(lines, ['Contract there expires:', 'Contract there expires']);

        return {
            currentClub,
            onLoanFrom,
            joined,
            contractExpires,
            contractThereExpires,
            transferHistory: this.parseTransferHistoryRows(doc)
        };
    },

    async inspectYouthEligibility(player, source) {
        try {
            const html = await this.fetchUrl(player.tmUrl);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const profile = this.parseTmProfileDoc(doc);
            return this.analyzeYouthEligibility(player, source, profile);
        } catch (e) {
            return {
                status: 'manual_review_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: `TM profile check failed: ${e?.message || e || 'unknown error'}`,
                profile: null,
                parserVersion: 'youth_eligibility_v2'
            };
        }
    },

    analyzeYouthEligibility(player, source, profile) {
        const aliases = this.sourceClubAliasGroups(source || player || {});
        const rows = Array.isArray(profile?.transferHistory) ? profile.transferHistory : [];
        const currentClub = this.normalizeText(profile?.currentClub || '');
        const onLoanFrom = this.normalizeText(profile?.onLoanFrom || '');
        const lowerCurrent = currentClub.toLowerCase();
        const checkTs = Date.now();

        const currentIsUnknown = !currentClub || lowerCurrent === '-' || lowerCurrent.includes('unknown') || lowerCurrent.includes('без клуба');
        const currentIsRetired = lowerCurrent.includes('retired') || lowerCurrent.includes('career break');
        const currentMatchesYouth = this.clubMatchesAliases(currentClub, aliases.youth);
        const currentMatchesParent = this.clubMatchesAliases(currentClub, aliases.parent);
        const loanFromMatches = this.clubMatchesAliases(onLoanFrom, aliases.all);

        const rowTouchesYouthOrParent = row => (
            this.clubMatchesAliases(row.left, aliases.all) ||
            this.clubMatchesAliases(row.joined, aliases.all)
        );

        const rowLeftYouthOrParent = row => this.clubMatchesAliases(row.left, aliases.all);
        const rowJoinedYouthOrParent = row => this.clubMatchesAliases(row.joined, aliases.all);
        const isLoanRow = row => /loan|аренд|end of loan/i.test(`${row.fee || ''} ${row.rawCells?.join(' ') || ''}`);

        const relatedRows = rows.filter(rowTouchesYouthOrParent);
        const leftRows = relatedRows.filter(row => rowLeftYouthOrParent(row) && !rowJoinedYouthOrParent(row));
        const loanRows = relatedRows.filter(isLoanRow);
        const latestRelated = relatedRows
            .slice()
            .sort((a, b) => (b.dateTs || 0) - (a.dateTs || 0))[0] || null;
        const latestLeft = leftRows
            .slice()
            .sort((a, b) => (b.dateTs || 0) - (a.dateTs || 0))[0] || null;

        if (currentIsRetired) {
            return {
                status: 'skip_retired_or_invalid',
                bucket: 'skip',
                manualReview: false,
                skip: true,
                reason: 'Transfermarkt current club is Retired / career inactive.',
                profile,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (loanFromMatches || loanRows.length) {
            return {
                status: 'loaned_youth_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: loanFromMatches
                    ? `Player is on loan from monitored club/pathway: ${onLoanFrom}.`
                    : 'Transfer history contains loan / end-of-loan row touching monitored club/pathway.',
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentMatchesYouth) {
            return {
                status: 'active_youth_candidate',
                bucket: 'candidate',
                manualReview: false,
                skip: false,
                reason: `Current club matches monitored youth source: ${currentClub}.`,
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentMatchesParent) {
            return {
                status: 'parent_club_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: `Player appears to have moved from youth to parent club: ${currentClub}.`,
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (latestLeft && latestLeft.dateTs && latestLeft.dateTs <= checkTs && (currentIsUnknown || !currentMatchesYouth && !currentMatchesParent)) {
            return {
                status: 'skip_left_youth',
                bucket: 'skip',
                manualReview: false,
                skip: true,
                reason: `Player left monitored youth/pathway on ${latestLeft.dateText}: ${latestLeft.left} → ${latestLeft.joined}.`,
                profile,
                latestRelated,
                latestLeft,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        if (currentIsUnknown) {
            return {
                status: 'manual_review_candidate',
                bucket: 'manual',
                manualReview: true,
                skip: false,
                reason: 'Current club is Unknown; transfer history did not give a definitive active/left verdict.',
                profile,
                latestRelated,
                parserVersion: 'youth_eligibility_v2'
            };
        }

        return {
            status: 'manual_review_candidate',
            bucket: 'manual',
            manualReview: true,
            skip: false,
            reason: currentClub
                ? `Current club is ${currentClub}; requires manual check against monitored youth/pathway.`
                : 'No decisive current club / transfer history signal.',
            profile,
            latestRelated,
            parserVersion: 'youth_eligibility_v2'
        };
    },

    getYouthStatusPresentation(status) {
        const map = {
            active_youth_candidate: { text: 'активная молодёжка', color: '#7cff7c' },
            loaned_youth_candidate: { text: 'аренда / ручной анализ', color: '#8cf' },
            parent_club_candidate: { text: 'основной клуб / ручной анализ', color: '#8cf' },
            manual_review_candidate: { text: 'ручной анализ', color: '#ffd76a' },
            skip_left_youth: { text: 'ушёл из молодёжки — skip', color: '#f99' },
            skip_retired_or_invalid: { text: 'неактивен — skip', color: '#f99' }
        };

        return map[status] || { text: 'не найден в SLF', color: '#ffd76a' };
    },

    shouldShowApplication(eligibility, checked, exists) {
        if (!checked || exists) return false;
        if (eligibility?.skip) return false;
        return true;
    },

  checkSlfExists(tmId) {
    return new Promise(resolve => {
        const id = String(tmId);

        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position:fixed;
            left:-9999px;
            top:-9999px;
            width:900px;
            height:600px;
            opacity:0;
            pointer-events:none;
        `;

        iframe.src = buildSlfUrl(`/search.php?tmid=${encodeURIComponent(id)}`);

        let finished = false;
        let clicked = false;
        let startedAt = Date.now();
        let pollTimer = null;

        const cleanup = (exists, reason, extra = {}) => {
            if (finished) return;

            finished = true;

            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }

            try {
                iframe.remove();
            } catch (e) {}

            console.log('[SLF Youth check]', {
                tmId: id,
                exists,
                reason,
                ...extra
            });

            resolve(exists);
        };

        const getDoc = () => {
            try {
                return iframe.contentDocument || iframe.contentWindow.document;
            } catch (e) {
                return null;
            }
        };

        const normalizeHref = href => String(href || '').replaceAll('&amp;', '&');

        const isMenuOrServiceLink = a => {
            if (!a) return true;

            const text = (a.textContent || '').trim().toLowerCase();
            const href = normalizeHref(a.getAttribute('href') || '');
            const cls = String(a.className || '').toLowerCase();

            if (!text) return true;

            const badText = [
                'я/мы',
                'мониторинг опыта',
                'профиль',
                'мой профиль',
                'статистика',
                'опыт',
                'менеджер'
            ];

            if (badText.some(x => text.includes(x))) return true;

            if (href.includes('monitoring')) return true;
            if (cls.includes('general-menu')) return true;

            const badParent = a.closest(
                '#head, #header, .head, .header, .head-ui, .general-menu, .top-menu, .left-menu, .right-menu, .user-menu, .menu, .tmenu, .ticon'
            );

            return !!badParent;
        };

        const looksLikePlayerName = text => {
            const clean = String(text || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (clean.length < 3) return false;

            const lower = clean.toLowerCase();

            const bad = [
                'я/мы',
                'мониторинг',
                'профиль',
                'статистика',
                'опыт',
                'поиск',
                'найти',
                'добавить',
                'создать'
            ];

            if (bad.some(x => lower.includes(x))) return false;

            // Обычно в SLF игрок — это фамилия + имя: "Карас Самуэль".
            // Но оставляем запас: достаточно букв и не служебного текста.
            const letters = clean.match(/[A-Za-zА-Яа-яЁё]/g) || [];

            return letters.length >= 3;
        };

        const findRealPlayerLink = doc => {
            if (!doc || !doc.body) return null;

            const links = [...doc.querySelectorAll('a[href]')];

            const candidates = links
                .map(a => {
                    const href = normalizeHref(a.getAttribute('href') || '');
                    const text = (a.textContent || '').trim().replace(/\s+/g, ' ');
                    const row = a.closest('tr, td, div');
                    const rowText = (row?.innerText || '').trim().replace(/\s+/g, ' ');

                    return { a, href, text, rowText };
                })
                .filter(x => {
                    const isPlayerHref =
                        /\/?player\.php\?action=view&id=\d+/i.test(x.href) ||
                        /\/?player\.php[^"'<>]*action=view[^"'<>]*id=\d+/i.test(x.href);

                    if (!isPlayerHref) return false;
                    if (isMenuOrServiceLink(x.a)) return false;
                    if (!looksLikePlayerName(x.text)) return false;

                    return true;
                });

            return candidates[0] || null;
        };

        const isClearlyMissing = doc => {
            if (!doc || !doc.body) return false;

            const text = (doc.body.innerText || '').toLowerCase();

            return (
                text.includes('ничего не найдено') ||
                text.includes('нет результатов') ||
                text.includes('поиск не дал результатов') ||
                text.includes('игрок не найден') ||
                text.includes('создать игрока') ||
                text.includes('создать нового игрока') ||
                text.includes('добавить игрока')
            );
        };

        const submitSearch = doc => {
            if (!doc || clicked) return false;

            const input =
                doc.querySelector('input[name="tm_id"]') ||
                doc.querySelector('input[name="tmid"]') ||
                doc.querySelector('input[id*="tm"]');

            const btn =
                doc.getElementById('sfButton') ||
                doc.querySelector('input[type="submit"][name="search"]') ||
                doc.querySelector('input[type="submit"]') ||
                doc.querySelector('button[type="submit"]');

            if (!input || !btn) return false;

            clicked = true;
            input.value = id;

            try {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}

            setTimeout(() => {
                try {
                    btn.click();
                } catch (e) {
                    cleanup(false, 'click_failed_treat_as_missing');
                }
            }, 150);

            return true;
        };

        const pollResult = () => {
            if (finished) return;

            const doc = getDoc();

            if (!doc || !doc.body) {
                pollTimer = setTimeout(pollResult, 300);
                return;
            }

            const realPlayer = findRealPlayerLink(doc);

            if (realPlayer) {
                cleanup(true, 'real_player_link_found', {
                    href: realPlayer.href,
                    text: realPlayer.text,
                    rowText: realPlayer.rowText.slice(0, 180)
                });
                return;
            }

            if (clicked && Date.now() - startedAt > 1200 && isClearlyMissing(doc)) {
                cleanup(false, 'missing_marker_found');
                return;
            }

            /*
             * Важно:
             * Раньше здесь был fallback "непонятно => exists true".
             * Для твоего сценария это плохо: непонятные/пустые результаты должны попадать
             * в ручную проверку как "не найден в SLF".
             */
            if (clicked && Date.now() - startedAt > 8000) {
                cleanup(false, 'no_valid_result_player_link');
                return;
            }

            if (Date.now() - startedAt > 15000) {
                cleanup(false, 'timeout_treat_as_missing');
                return;
            }

            pollTimer = setTimeout(pollResult, 300);
        };

        iframe.onload = () => {
            const doc = getDoc();

            if (!doc || !doc.body) {
                cleanup(false, 'no_document_treat_as_missing');
                return;
            }

            const beforeClick = findRealPlayerLink(doc);

            if (beforeClick) {
                cleanup(true, 'real_player_link_found_before_click', {
                    href: beforeClick.href,
                    text: beforeClick.text,
                    rowText: beforeClick.rowText.slice(0, 180)
                });
                return;
            }

            submitSearch(doc);
            setTimeout(pollResult, 500);
        };

        document.body.appendChild(iframe);

        setTimeout(() => {
            cleanup(false, 'global_timeout_treat_as_missing');
        }, 18000);
    });
},

    async scanAll(onProgress) {
        if (this._scanPromise) {
            if (onProgress) onProgress('Youth Monitor уже выполняется: ждём текущую проверку.');
            return this._scanPromise;
        }

        this._scanPromise = this.scanAllInternal(onProgress)
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    },

    async scanAllInternal(onProgress) {
        const seen = this.loadSeenIds();
        const sources = CONFIG.YOUTH_TM_SOURCES || [];
        const seasons = this.getSeasons();

        const foundMap = new Map();
        const fresh = [];
        const errors = [];
        const seasonSources = [];

        for (const source of sources) {
            for (const season of seasons) {
                const url = this.buildTransferUrl(source, season);

                try {
                    if (onProgress) onProgress(`Загружаю ${source.label}, сезон ${season}...`);

                    const page = await this.fetchUrl(url, { returnMeta: true });
                    const html = page?.html || '';
                    const loadedUrl = page?.finalUrl || page?.requestedUrl || url;
                    const sourceState = this.resolveTmSourceState(html, source, season, url, loadedUrl);
                    const players = this.extractPlayersFromTM(html, source, season, loadedUrl, sourceState);

                    const sourceRecord = Object.assign({}, sourceState, {
                        status: page?.status || null,
                        playersFound: players.length
                    });

                    seasonSources.push(sourceRecord);
                    debugLog('[SLF Youth TM source]', sourceRecord);

                    if (onProgress) {
                        onProgress(
                            `Загружено ${source.label}: сезон ${sourceState.resolvedSeason || season}, игроков ${players.length}`
                        );
                    }

                    players.forEach(p => {
                        const key = `${p.tmId}`;
                        if (!foundMap.has(key)) foundMap.set(key, p);
                    });
                } catch (e) {
                    const errorRecord = {
                        source: source.label,
                        team: source.team,
                        season,
                        status: e?.status || null,
                        kind: e?.kind || 'error',
                        url,
                        canonicalYouthKey: this.getCanonicalYouthKey(source),
                        canonicalYouthUrl: this.buildCanonicalYouthUrl(source),
                        error: e?.message || String(e)
                    };

                    errors.push(errorRecord);
                    seasonSources.push(Object.assign({}, errorRecord, {
                        playersFound: 0,
                        failed: true
                    }));
                    debugWarn('[SLF Youth TM source error]', errorRecord);
                }
            }
        }

        const found = [...foundMap.values()];
        const manualReview = [];
        const skipped = [];

        for (const p of found) {
            const seenKey = `${p.tmId}`;
            const cached = seen[seenKey] || null;

            if (cached?.checked && cached?.youthEligibilityVersion === 2) {
                const eligibility = cached?.eligibility || null;
                if (cached?.exists === false) {
                    if (eligibility?.skip) skipped.push(p);
                    else if (eligibility?.manualReview) manualReview.push(p);
                    else fresh.push(p);
                }
                continue;
            }

            if (onProgress) onProgress(`Проверяю SLF: ${p.name} / ${p.tmId}`);

            const exists = await this.checkSlfExists(p.tmId);
            let eligibility = null;

            if (!exists) {
                if (onProgress) onProgress(`Проверяю актуальность youth/TM: ${p.name} / ${p.tmId}`);
                eligibility = await this.inspectYouthEligibility(p, p);
                p.eligibility = eligibility;
            }

            seen[seenKey] = {
                tmId: p.tmId,
                name: p.name,
                sourceLabel: p.sourceLabel,
                sourceTeam: p.sourceTeam,
                sourceClubId: p.sourceClubId,
                sourceSlug: p.sourceSlug,
                canonicalYouthKey: p.canonicalYouthKey,
                canonicalYouthUrl: p.canonicalYouthUrl,
                requestedSeason: p.requestedSeason,
                resolvedSeason: p.resolvedSeason,
                loadedUrl: p.loadedUrl || p.sourceUrl || '',
                firstSeen: cached?.firstSeen || Date.now(),
                checkedAt: Date.now(),
                checked: true,
                exists,
                youthEligibilityVersion: 2,
                eligibility
            };

            if (!exists) {
                if (eligibility?.skip) skipped.push(p);
                else if (eligibility?.manualReview) manualReview.push(p);
                else fresh.push(p);
            }
        }

        this.saveSeenIds(seen);

        return {
            found,
            fresh,
            manualReview,
            skipped,
            errors,
            seen,
            seasonSources
        };
    },

    resetCache() {
        localStorage.removeItem(this.cacheKey);
    },

    renderResult(result) {
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const seen = result?.seen || {};
        const found = Array.isArray(result?.found) ? result.found : [];
        const fresh = Array.isArray(result?.fresh) ? result.fresh : [];
        const manualReview = Array.isArray(result?.manualReview) ? result.manualReview : [];
        const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
        const seasonSources = Array.isArray(result?.seasonSources) ? result.seasonSources : [];

        const checkedCount = found.filter(p => seen[String(p.tmId)]?.checked).length;
        const existsCount = found.filter(p => seen[String(p.tmId)]?.exists === true).length;
        const missingCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && !check.eligibility?.skip;
        }).length;
        const manualCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && check.eligibility?.manualReview;
        }).length;
        const skippedCount = found.filter(p => {
            const check = seen[String(p.tmId)] || {};
            return check.checked && check.exists === false && check.eligibility?.skip;
        }).length;

        const errorsHtml = errors.length
            ? `
                <div style="color:#f99;margin-bottom:8px;">
                    Ошибки источников: ${this.escapeHtml(errors.length)}
                    <div style="margin-top:4px;color:#fbb;font-size:11px;line-height:1.35;">
                        ${errors.slice(0, 8).map(e => this.escapeHtml(`${e.source || ''} ${e.season || ''}: ${e.status || e.kind || ''} ${e.error || ''}`)).join('<br>')}
                    </div>
                </div>
            `
            : '';

        const freshNotice = fresh.length || manualReview.length || skipped.length
            ? `
                <div style="color:#ffd76a;margin-bottom:8px;">
                    Кандидаты не найдены в SLF: ${this.escapeHtml(fresh.length)};
                    ручной анализ: ${this.escapeHtml(manualReview.length)};
                    skip: ${this.escapeHtml(skipped.length)}.
                    Используй кнопки-фильтры ниже — они фильтруют эту же таблицу без повторной проверки TM/SLF.
                </div>
            `
            : `
                <div style="color:#9f9;margin-bottom:8px;">
                    Новых активных/потенциальных игроков не найдено.
                </div>
            `;

        const seasonSourcesHtml = seasonSources.length
            ? `
                <details style="margin-bottom:10px;color:#aaa;">
                    <summary style="cursor:pointer;color:#8cf;">TM источники/сезоны: ${this.escapeHtml(seasonSources.length)}</summary>
                    <div style="margin-top:6px;font-size:11px;line-height:1.35;">
                        ${seasonSources.slice(0, 40).map(s => {
                            const status = s.failed
                                ? `Ошибка: ${s.status || s.kind || ''} ${s.error || ''}`
                                : `OK · игроков ${s.playersFound ?? 0}`;
                            const seasonText = s.resolvedSeason && s.resolvedSeason !== s.requestedSeason
                                ? `${s.requestedSeason} → ${s.resolvedSeason}`
                                : `${s.requestedSeason || s.season || ''}`;
                            return this.escapeHtml(`${s.team || ''} / ${s.label || s.source || ''} · season ${seasonText} · verein ${s.expectedClubId || s.sourceClubId || ''} · ${status}`);
                        }).join('<br>')}
                    </div>
                </details>
            `
            : '';

        const rows = found
            .slice()
            .sort((a, b) => {
                const ae = seen[String(a.tmId)]?.exists;
                const be = seen[String(b.tmId)]?.exists;

                if (ae === false && be !== false) return -1;
                if (ae !== false && be === false) return 1;

                return String(a.sourceTeam || '').localeCompare(String(b.sourceTeam || '')) ||
                    String(a.sourceLabel || '').localeCompare(String(b.sourceLabel || '')) ||
                    String(a.name || '').localeCompare(String(b.name || ''));
            })
            .map(p => {
                const check = seen[String(p.tmId)] || {};
                const exists = check.exists === true;
                const checked = check.checked === true;
                const eligibility = check.eligibility || p.eligibility || null;
                const filter = this.getYouthFilterForPlayer(p, seen);
                const isMissingGroup = checked && check.exists === false && !eligibility?.skip;

                let statusText = 'не проверен';
                let statusColor = '#aaa';
                let reasonText = '';

                if (checked && exists) {
                    statusText = 'уже есть в SLF';
                    statusColor = '#7cff7c';
                } else if (checked && !exists) {
                    const presentation = this.getYouthStatusPresentation(eligibility?.status);
                    statusText = presentation.text;
                    statusColor = presentation.color;
                    reasonText = eligibility?.reason || '';
                }

                const addUrl = buildSlfUrl(
                    `/youngs2.php?action=new` +
                    `&slf_tm_id=${encodeURIComponent(p.tmId || '')}` +
                    `&slf_tm_url=${encodeURIComponent(p.tmUrl || '')}` +
                    `&slf_name=${encodeURIComponent(p.name || '')}` +
                    `&slf_source_team=${encodeURIComponent(p.sourceTeam || '')}` +
                    `&slf_source_label=${encodeURIComponent(p.sourceLabel || '')}`
                );

                const addLink = this.shouldShowApplication(eligibility, checked, exists)
                    ? `<a href="${this.escapeHtml(addUrl)}" target="_blank" style="color:#8cf;font-weight:bold;">Заявка</a>`
                    : `<span style="color:#555;">Заявка</span>`;

                return `
                    <tr class="slf-youth-player-row"
                        data-youth-filter="${this.escapeHtml(filter)}"
                        data-youth-checked="${checked ? '1' : '0'}"
                        data-youth-exists="${exists ? '1' : '0'}"
                        data-youth-missing="${isMissingGroup ? '1' : '0'}"
                        data-youth-tmid="${this.escapeHtml(p.tmId || '')}">
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.name || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.tmId || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.sourceTeam || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">${this.escapeHtml(p.sourceLabel || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;" title="${this.escapeHtml(p.loadedUrl || p.sourceUrl || '')}">${this.escapeHtml(p.resolvedSeason || p.season || '')}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;color:${statusColor};font-weight:bold;">${this.escapeHtml(statusText)}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;color:#aaa;max-width:360px;">${this.escapeHtml(reasonText)}</td>
                        <td style="padding:4px;border-bottom:1px solid #333;">
                            <a href="${this.escapeHtml(p.tmUrl || '')}" target="_blank" style="color:#8cf;">TM</a>
                            |
                            <a href="${this.escapeHtml(buildSlfUrl(`/search.php?tmid=${encodeURIComponent(p.tmId || '')}`))}" target="_blank" style="color:#8cf;">SLF Search</a>
                            |
                            ${addLink}
                        </td>
                    </tr>
                `;
            })
            .join('');

        const manualHintHtml = manualCount
            ? `
                <div style="margin:0 0 10px 0;padding:7px 9px;background:#181818;border:1px solid #444;border-radius:5px;color:#aaa;">
                    <b style="color:#8cf;">Ручной анализ:</b>
                    ${this.escapeHtml(manualCount)} игроков. Это аренды, переходы youth → основной клуб, Unknown/current club и неоднозначные цепочки.
                    Нажми фильтр «Ручной анализ», чтобы оставить только их.
                </div>
            `
            : '';

        return `
            <h3>Youth Monitor</h3>

            ${errorsHtml}
            ${freshNotice}
            ${seasonSourcesHtml}

            <div id="slf-youth-filter-bar" data-active-filter="all" style="
                display:flex;
                gap:8px;
                flex-wrap:wrap;
                margin-bottom:8px;
                color:#ddd;
            ">
                ${this.makeFilterButton('all', 'Все', found.length, '#ddd')}
                ${this.makeFilterButton('found', 'Найдено на TM', found.length, '#ddd')}
                ${this.makeFilterButton('checked', 'Проверено через SLF', checkedCount, '#ddd')}
                ${this.makeFilterButton('exists', 'Уже есть в SLF', existsCount, '#7cff7c')}
                ${this.makeFilterButton('missing', 'Не найдены в SLF', missingCount, '#ffd76a')}
                ${this.makeFilterButton('manual', 'Ручной анализ', manualCount, '#8cf')}
                ${this.makeFilterButton('skip', 'Skip', skippedCount, '#f99')}
            </div>

            <div id="slf-youth-filter-state" style="margin-bottom:10px;color:#aaa;font-size:12px;">
                Показано: ${this.escapeHtml(found.length)} из ${this.escapeHtml(found.length)}.
            </div>

            ${manualHintHtml}

            <div style="margin-bottom:8px;color:#aaa;">
                Проверочная таблица: открой TM и SLF Search, чтобы вручную убедиться, найден ли игрок на проекте.
            </div>

            <table id="slf-youth-result-table" style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="color:#ffd76a;text-align:left;">
                        <th style="padding:4px;border-bottom:1px solid #555;">Игрок</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">TM ID</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Клуб</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Источник</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Сезон</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Статус</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Причина</th>
                        <th style="padding:4px;border-bottom:1px solid #555;">Ссылки</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || `
                        <tr>
                            <td colspan="8" style="padding:8px;color:#aaa;">Нет данных для отображения.</td>
                        </tr>
                    `}
                    <tr id="slf-youth-empty-filter-row" style="display:none;">
                        <td colspan="8" style="padding:8px;color:#aaa;">Нет игроков для выбранного фильтра.</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    bindRenderedFilters(root = document) {
        const scope = root && root.querySelector ? root : document;
        const bar = scope.querySelector('#slf-youth-filter-bar') || document.getElementById('slf-youth-filter-bar');
        const table = scope.querySelector('#slf-youth-result-table') || document.getElementById('slf-youth-result-table');
        const stateBox = scope.querySelector('#slf-youth-filter-state') || document.getElementById('slf-youth-filter-state');

        if (!bar || !table) return;

        const getRows = () => [...table.querySelectorAll('tr.slf-youth-player-row[data-youth-filter]')];

        const matchesFilter = (row, filter) => {
            if (!row) return false;
            const value = row.dataset.youthFilter || '';

            if (filter === 'all' || filter === 'found') return true;
            if (filter === 'checked') return row.dataset.youthChecked === '1';
            if (filter === 'exists') return value === 'exists';
            if (filter === 'missing') return row.dataset.youthMissing === '1';
            if (filter === 'manual') return value === 'manual';
            if (filter === 'skip') return value === 'skip';
            if (filter === 'unchecked') return value === 'unchecked';

            return value === filter;
        };

        const setButtonState = active => {
            bar.querySelectorAll('.slf-youth-filter-btn').forEach(btn => {
                const isActive = (btn.dataset.filter || 'all') === active;
                btn.dataset.active = isActive ? '1' : '0';
                btn.style.outline = isActive ? '2px solid #7cff7c' : 'none';
                btn.style.background = isActive ? '#25351f' : '#181818';
                btn.style.boxShadow = isActive ? '0 0 0 1px rgba(124,255,124,.15) inset' : 'none';
            });
        };

        const apply = requestedFilter => {
            const current = bar.dataset.activeFilter || 'all';
            const requested = requestedFilter || 'all';
            const active = requested === 'all' || requested === current ? 'all' : requested;

            bar.dataset.activeFilter = active;
            setButtonState(active);

            let visible = 0;
            const rows = getRows();

            rows.forEach(row => {
                const show = matchesFilter(row, active);
                row.style.display = show ? '' : 'none';
                if (show) visible += 1;
            });

            const emptyRow = table.querySelector('#slf-youth-empty-filter-row');
            if (emptyRow) emptyRow.style.display = visible ? 'none' : '';

            if (stateBox) {
                const labelMap = {
                    all: 'Все',
                    found: 'Найдено на TM',
                    checked: 'Проверено через SLF',
                    exists: 'Уже есть в SLF',
                    missing: 'Не найдены в SLF',
                    manual: 'Ручной анализ',
                    skip: 'Skip',
                    unchecked: 'Не проверены'
                };

                stateBox.textContent = `Фильтр: ${labelMap[active] || active}. Показано: ${visible} из ${rows.length}.`;
            }
        };

        bar.onclick = event => {
            const btn = event.target && event.target.closest
                ? event.target.closest('.slf-youth-filter-btn')
                : null;

            if (!btn || !bar.contains(btn)) return;

            event.preventDefault();
            event.stopPropagation();

            apply(btn.dataset.filter || 'all');
        };

        apply(bar.dataset.activeFilter || 'all');
    }
};
// <<< src/modules/team-management/youth-external-monitor.js


// >>> src/modules/uncategorized/021-data-inspector-page.js
// 11.5 Data Inspector Page
// ============================================================

const DataInspector = {
    tabId: 'slf-data-global-link',
    pageId: 'slf-data-page',

    addGlobalMenuButton() {
        if (document.getElementById(this.tabId)) return;

        const link = document.createElement('a');
        link.id = this.tabId;
        link.href = '#';
        link.textContent = 'SLF Data';
        link.style.cssText = `
            display:inline-flex;
            align-items:center;
            justify-content:center;
            height:22px;
            margin-left:8px;
            padding:0 10px;
            border:1px solid #666;
            border-radius:4px;
            background:#2b2b2b;
            color:#7cff7c;
            font-weight:bold;
            text-decoration:none;
            cursor:pointer;
            vertical-align:middle;
        `;

        link.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.show();
        });

        const searchForm = document.querySelector('.head-ui__search-form');

        if (searchForm) {
            searchForm.appendChild(link);
        } else {
            const searchMenu = [...document.querySelectorAll('a')]
                .find(a => (a.innerText || '').trim() === 'Поиск');

            if (!searchMenu || !searchMenu.parentNode) {
                console.warn('[SLF Data] search form/menu not found');
                return;
            }

            searchMenu.parentNode.insertBefore(link, searchMenu.nextSibling);
        }

        this.createPage();
    },

    createPage() {
        if (document.getElementById(this.pageId)) return;

        const page = document.createElement('div');
        page.id = this.pageId;
        page.style.cssText = `
            display:none;
            position:fixed;
            top:70px;
            left:50%;
            transform:translateX(-50%);
            width:980px;
            max-height:82vh;
            z-index:99999;
            padding:12px;
            background:#1f1f1f;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            box-shadow:0 10px 30px rgba(0,0,0,0.7);
            font-family:Arial,sans-serif;
            font-size:13px;
        `;

        page.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <b style="font-size:15px;">SLF Data Inspector</b>
                <button id="slf-data-overview-btn">Overview</button>
                <button id="slf-data-players-btn">Players</button>
                <button id="slf-data-youth-btn">Youth</button>
                <button id="slf-data-presets-btn">Presets</button>
                <button id="slf-data-close-btn">Закрыть</button>
                <button id="slf-youth-reset-cache" title="Сбросить кэш проверки Youth Monitor">Сбросить кэш проверки</button>
            </div>
            <div id="slf-data-content" style="background:#111;border:1px solid #444;padding:10px;min-height:160px;max-height:66vh;overflow:auto;white-space:normal;">
                Нажми Overview, Players, Youth или Presets.
            </div>
        `;

        document.body.appendChild(page);

        document.getElementById('slf-data-overview-btn').onclick = () => this.renderOverview();
        document.getElementById('slf-data-players-btn').onclick = () => this.renderPlayers();
        document.getElementById('slf-data-youth-btn').onclick = () => this.renderYouth();
        document.getElementById('slf-data-presets-btn').onclick = () => this.renderPresets();
        document.getElementById('slf-data-close-btn').onclick = () => this.hide();
        document.getElementById('slf-youth-reset-cache').onclick = () => {
            YouthExternalMonitor.resetCache();
            this.setContent('Кэш Youth Monitor сброшен. Нажми Youth ещё раз.');
        };
    },

    show() {
        this.createPage();

        const page = document.getElementById(this.pageId);
        if (page) {
            page.style.display = 'block';
            this.renderOverview();
        }
    },

    hide() {
        const page = document.getElementById(this.pageId);
        if (page) page.style.display = 'none';
    },

    setContent(html) {
        const content = document.getElementById('slf-data-content');
        if (content) content.innerHTML = html;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    renderOverview() {
        this.setContent('Загрузка Overview v2...');

        fetchCanonicalApiStatus()
            .then(status => {
                const c = status.collections || {};

                this.setContent(`
                    <h3>Overview v2</h3>
                    <div style="margin-bottom:8px;color:#aaa;">
                        Канонические исторические коллекции: <b>match_snapshots_v2</b>, <b>match_results_v2</b>, <b>preset_events_v2</b>, <b>preset_effects_v2</b>.
                        Legacy-коллекции не учитываются.
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td>Unique games in v2 history</td><td>${status.games ?? 0}</td></tr>
                        <tr><td>Snapshots v2</td><td>${c.snapshots?.count ?? 0}</td></tr>
                        <tr><td>Match results v2</td><td>${c.results?.count ?? 0}</td></tr>
                        <tr><td>Preset events v2</td><td>${c.events?.count ?? 0}</td></tr>
                        <tr><td>Preset effects v2</td><td>${c.effects?.count ?? 0}</td></tr>
                        <tr><td>Player observations</td><td>${c.players?.count ?? 0}</td></tr>
                        <tr><td>Transfer history</td><td>${c.transfers?.count ?? 0}</td></tr>
                        <tr><td>Tactics</td><td>${c.tactics?.count ?? 0}</td></tr>
                    </table>
                `);
            })
            .catch(() => this.setContent('Ошибка загрузки Overview v2'));
    },

    renderPlayers() {
        this.setContent('Загрузка Players...');

        Api.get(
            'player_observations',
            data => {
                const rows = Array.isArray(data) ? data.slice(-50).reverse() : [];

                if (!rows.length) {
                    this.setContent('player_observations пусто');
                    return;
                }

                const htmlRows = rows.map(p => `
                    <tr>
                        <td>${p.playerId ?? ''}</td>
                        <td>${p.name ?? ''}</td>
                        <td>${p.teamId ?? ''}</td>
                        <td>${p.currentPosition ?? ''}</td>
                        <td>${Array.isArray(p.possiblePositions) ? p.possiblePositions.join('/') : ''}</td>
                        <td>${p.skill ?? ''}</td>
                        <td>${p.exactSlot ?? ''}</td>
                        <td>${p.gameId ?? ''}</td>
                        <td>${p.minute ?? ''}</td>
                    </tr>
                `).join('');

                this.setContent(`
                    <h3>Last 50 player observations</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead>
                            <tr style="color:#ffd76a;">
                                <th>playerId</th>
                                <th>name</th>
                                <th>teamId</th>
                                <th>pos</th>
                                <th>possible</th>
                                <th>skill</th>
                                <th>slot</th>
                                <th>game</th>
                                <th>min</th>
                            </tr>
                        </thead>
                        <tbody>${htmlRows}</tbody>
                    </table>
                `);
            },
            () => this.setContent('Ошибка загрузки Players')
        );
    },

    renderYouth() {
        this.setContent('Проверяю молодёжные команды Transfermarkt...');

        YouthExternalMonitor.scanAll(
            msg => this.setContent(msg)
        )
            .then(result => {
                this.setContent(YouthExternalMonitor.renderResult(result));
                this.bindYouthFilters();
            })
            .catch(e => {
                console.error('[SLF Youth Monitor]', e);
                this.setContent(`Ошибка Youth Monitor: ${this.escapeHtml(e?.message || String(e))}. Частичные данные сохраняются в результате, если источники успели загрузиться.`);
            });
    },

    bindYouthFilters() {
        if (typeof YouthExternalMonitor !== 'undefined' && YouthExternalMonitor.bindRenderedFilters) {
            YouthExternalMonitor.bindRenderedFilters(document);
        }
    },

    renderPresetCard(name, meta, existsInStorage) {
        const groupColors = {
            defensive: '#9fd3ff',
            balance: '#ffd76a',
            attack: '#ff9f9f',
            henta: '#c6a6ff'
        };

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
                padding:9px 10px;
                margin:8px 0;
            ">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:bold;color:${color};font-size:14px;">
                            ${this.escapeHtml(name)}
                        </div>
                        <div style="font-size:11px;color:#aaa;margin-top:2px;">
                            ${this.escapeHtml(meta.title || '')}
                            · group: ${this.escapeHtml(meta.group || '')}
                            · rank: ${this.escapeHtml(meta.rank ?? '')}
                        </div>
                    </div>
                    <div style="font-size:11px;color:${statusColor};border:1px solid ${statusColor};border-radius:10px;padding:2px 7px;">
                        ${this.escapeHtml(statusText)}
                    </div>
                </div>

                <div style="margin-top:8px;line-height:1.4;">
                    <div><b style="color:#ddd;">Идея:</b> ${this.escapeHtml(meta.idea || '')}</div>
                    <div style="margin-top:4px;"><b style="color:#ddd;">Использовать:</b> ${this.escapeHtml(meta.use || '')}</div>
                    <div style="margin-top:4px;"><b style="color:#ddd;">Риск:</b> ${this.escapeHtml(meta.risk || '')}</div>
                </div>
            </div>
        `;
    },

    renderPresets() {
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
            this.setContent(`
                <h3>Preset Library</h3>
                <div style="color:#f99;">TacticPresetLibrary пустой или не найден.</div>
            `);
            return;
        }

        const groups = [
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

        const groupHtml = groups.map(group => {
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
                <div style="margin-bottom:14px;">
                    <h3 style="margin:10px 0 4px 0;color:#ffd76a;">${this.escapeHtml(group.title)}</h3>
                    <div style="color:#aaa;margin-bottom:8px;">${this.escapeHtml(group.desc)}</div>
                    ${cards}
                </div>
            `;
        }).join('');

        const importedCount = names.filter(name => presets[name]).length;

        this.setContent(`
            <div>
                <h3 style="margin-top:0;">Preset Library</h3>

                <div style="
                    margin-bottom:10px;
                    padding:8px 10px;
                    background:#181818;
                    border:1px solid #444;
                    border-radius:6px;
                    color:#ddd;
                    line-height:1.4;
                ">
                    Здесь справочник авторских схем: что означает пресет, когда его использовать и какой риск.
                    <br>
                    Импортировано в dropdown: <b style="color:#7cff7c;">${importedCount}</b> из <b>${names.length}</b>.
                    Если у схемы статус “описание есть, пресет не импортирован”, значит она есть в справочнике рекомендаций, но её ещё нет в твоём JSON пресетов.
                </div>

                ${groupHtml}
            </div>
        `);
    }
};

// ============================================================
// <<< src/modules/uncategorized/021-data-inspector-page.js


// >>> src/modules/team-management/youth-application-autofill.js
// 11.6 Youth Application Autofill
// ============================================================

const YouthApplicationAutofill = {
    isPage() {
        const params = new URLSearchParams(location.search);

        return location.pathname.includes('/youngs2.php') &&
            params.get('action') === 'new' &&
            !!params.get('slf_tm_url');
    },

    getParams() {
        const params = new URLSearchParams(location.search);

        return {
            tmId: params.get('slf_tm_id') || '',
            tmUrl: params.get('slf_tm_url') || '',
            name: params.get('slf_name') || '',
            sourceTeam: params.get('slf_source_team') || '',
            sourceLabel: params.get('slf_source_label') || ''
        };
    },

    // Логика имени как у Хенты:
    // full name -> first/last
    splitName(full) {
        const parts = String(full || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) {
            return { first: '', last: '' };
        }

        const first = parts[0] || '';

        if (parts.length <= 1) {
            return { first, last: '' };
        }

        return {
            first,
            last: parts.slice(1).join(' ')
        };
    },

    // Логика Хенты: убираем диакритику и приводим к ASCII.
    toAscii(s) {
        if (!s) return '';

        let t = String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        t = t
            .replace(/ß/g, 'ss')
            .replace(/ø/g, 'o')
            .replace(/đ/g, 'd')
            .replace(/ł/g, 'l')
            .replace(/ð/g, 'd')
            .replace(/þ/g, 'th');

        return t;
    },

    // Логика Хенты: простая русификация латиницы.
    translitRU(s) {
        if (!s) return '';

        const map = {
            sch: 'щ',
            sh: 'ш',
            ch: 'ч',
            zh: 'ж',
            yo: 'ё',
            yu: 'ю',
            ya: 'я',
            ts: 'ц',
            th: 'т',

            a: 'а',
            b: 'б',
            c: 'к',
            d: 'д',
            e: 'е',
            f: 'ф',
            g: 'г',
            h: 'х',
            i: 'и',
            j: 'й',
            k: 'к',
            l: 'л',
            m: 'м',
            n: 'н',
            o: 'о',
            p: 'п',
            q: 'к',
            r: 'р',
            s: 'с',
            t: 'т',
            u: 'у',
            v: 'в',
            w: 'в',
            x: 'кс',
            y: 'и',
            z: 'з'
        };

        const orig = this.toAscii(s).replace(/\./g, '');
        const low = orig.toLowerCase();

        let out = '';
        let i = 0;

        while (i < low.length) {
            const tri = low.slice(i, i + 3);

            if (map[tri]) {
                out += map[tri];
                i += 3;
                continue;
            }

            const di = low.slice(i, i + 2);

            if (map[di]) {
                out += map[di];
                i += 2;
                continue;
            }

            const ch = low[i];
            out += map[ch] || ch;
            i++;
        }

        out = out.replace(/(^|\s|-)([а-яё])/g, (m, before, c) => {
            return before + c.toUpperCase();
        });

        return out;
    },

    getNameVariants(fullName) {
        const split = this.splitName(fullName);

        const firstLat = this.toAscii(split.first).replace(/\./g, '');
        const lastLat = this.toAscii(split.last).replace(/\./g, '');

        return {
            firstLat,
            lastLat,
            firstRu: this.translitRU(firstLat),
            lastRu: this.translitRU(lastLat)
        };
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    injectPageScript(tmUrl) {
        const code = `
            (function () {
                const tmUrl = ${JSON.stringify(tmUrl)};

                const vipTab = document.querySelector('div[onclick*="vipwant"]');

                if (vipTab) {
                    try {
                        vipTab.click();
                        console.log('[SLF Youth Autofill PAGE] vipTab.click() done');
                    } catch (e) {
                        console.warn('[SLF Youth Autofill PAGE] vipTab.click() failed', e);
                    }
                } else {
                    console.warn('[SLF Youth Autofill PAGE] vipTab not found');
                }

                setTimeout(function () {
                    const input = document.querySelector('#tmlink');

                    if (input) {
                        input.value = tmUrl;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.dispatchEvent(new Event('keyup', { bubbles: true }));

                        try {
                            input.focus();
                            input.select();
                        } catch (e) {}

                        console.log('[SLF Youth Autofill PAGE] #tmlink filled', input.value);
                    } else {
                        console.warn('[SLF Youth Autofill PAGE] #tmlink not found');
                    }

                    const vipRows = Array.from(document.querySelectorAll('.vipauto'))
                        .map(x => getComputedStyle(x).display);

                    console.log('[SLF Youth Autofill PAGE] state', {
                        vipTab,
                        input,
                        vipRows
                    });
                }, 300);
            })();
        `;

        const script = document.createElement('script');
        script.textContent = code;
        document.documentElement.appendChild(script);
        script.remove();
    },

    forceFallback(tmUrl) {
        const vipTab = document.querySelector('div[onclick*="vipwant"]');
        const manualTab = document.querySelector('div[onclick*="tomanual"]');

        if (manualTab) {
            manualTab.classList.remove('changed');
            manualTab.classList.add('notchanged');
        }

        if (vipTab) {
            vipTab.classList.remove('notchanged');
            vipTab.classList.add('changed');
        }

        document.querySelectorAll('.nonactive').forEach(el => {
            el.style.display = 'none';
        });

        document.querySelectorAll('.vipauto').forEach(el => {
            el.style.display = el.tagName.toLowerCase() === 'tr'
                ? 'table-row'
                : 'block';
        });

        const input = document.querySelector('#tmlink');

        if (input) {
            input.value = tmUrl;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            try {
                input.focus();
                input.select();
            } catch (e) {}
        }

        console.log('[SLF Youth Autofill] fallback state', {
            vipTab,
            manualTab,
            input,
            inputValue: input?.value,
            vipRows: [...document.querySelectorAll('.vipauto')].map(x => getComputedStyle(x).display)
        });
    },

    copyText(value, button) {
        const text = String(value || '');

        if (!text) return;

        const done = () => {
            if (!button) return;

            const old = button.textContent;
            button.textContent = 'Скопировано';
            setTimeout(() => {
                button.textContent = old;
            }, 900);
        };

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => {});
            return;
        }

        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();

        try {
            document.execCommand('copy');
            done();
        } catch (e) {}

        ta.remove();
    },

    showPanel(data) {
        const old = document.getElementById('slf-youth-autofill-panel');
        if (old) old.remove();

        const input = document.querySelector('#tmlink');
        const vipVisible = [...document.querySelectorAll('.vipauto')]
            .some(x => getComputedStyle(x).display !== 'none');

        const ok = !!input && input.value === data.tmUrl && vipVisible;
        const names = this.getNameVariants(data.name);

        const latinFull = `${names.firstLat || ''} ${names.lastLat || ''}`.trim();
        const ruFull = `${names.firstRu || ''} ${names.lastRu || ''}`.trim();

        const panel = document.createElement('div');
        panel.id = 'slf-youth-autofill-panel';
        panel.style.cssText = `
            position:fixed;
            right:12px;
            bottom:12px;
            z-index:999999;
            width:410px;
            background:#1f1f1f;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            padding:10px;
            font-family:Arial,sans-serif;
            font-size:12px;
            box-shadow:0 8px 24px rgba(0,0,0,0.65);
        `;

        panel.innerHTML = `
            <div style="font-weight:bold;color:#7cff7c;margin-bottom:6px;">
                SLF Youth Autofill
            </div>

            <div style="margin-bottom:4px;">
                VIP:
                <b style="color:${vipVisible ? '#7cff7c' : '#ff9f9f'};">
                    ${vipVisible ? 'открыта' : 'не открыта'}
                </b>
            </div>

            <div style="margin-bottom:4px;">
                TM:
                <b style="color:${ok ? '#7cff7c' : '#ff9f9f'};">
                    ${ok ? 'вставлена' : 'не вставлена'}
                </b>
            </div>

            <div style="margin-bottom:4px;">
                Игрок TM: <b>${this.escapeHtml(data.name || '')}</b>
            </div>

            <div style="
                margin:7px 0;
                padding:7px;
                background:#181818;
                border:1px solid #444;
                border-radius:5px;
                line-height:1.45;
            ">
                <div style="color:#aaa;margin-bottom:4px;">Транслитерация как у Хенты:</div>

                <div>
                    Имя RU:
                    <b style="color:#ffd76a;">${this.escapeHtml(names.firstRu || '')}</b>
                    <button id="slf-copy-first-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>

                <div>
                    Фамилия RU:
                    <b style="color:#ffd76a;">${this.escapeHtml(names.lastRu || '')}</b>
                    <button id="slf-copy-last-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>

                <div style="margin-top:4px;color:#aaa;">
                    Полностью: <b>${this.escapeHtml(ruFull)}</b>
                    <button id="slf-copy-full-ru" style="margin-left:6px;padding:1px 5px;">copy</button>
                </div>
            </div>

            <div style="margin-bottom:4px;">
                Latin:
                <b>${this.escapeHtml(latinFull)}</b>
            </div>

            <div style="margin-bottom:4px;">
                TM ID: <b>${this.escapeHtml(data.tmId || '')}</b>
            </div>

            <div style="margin-bottom:6px;color:#aaa;">
                ${this.escapeHtml(data.sourceTeam || '')}
                ${data.sourceLabel ? '· ' + this.escapeHtml(data.sourceLabel) : ''}
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <a href="${this.escapeHtml(data.tmUrl || '#')}" target="_blank" style="color:#8cf;">Открыть TM</a>
                <button id="slf-youth-autofill-retry" style="padding:3px 7px;">Повторить</button>
                <button id="slf-youth-autofill-close" style="padding:3px 7px;">Закрыть</button>
            </div>
        `;

        document.body.appendChild(panel);

        const firstBtn = document.getElementById('slf-copy-first-ru');
        if (firstBtn) firstBtn.onclick = () => this.copyText(names.firstRu, firstBtn);

        const lastBtn = document.getElementById('slf-copy-last-ru');
        if (lastBtn) lastBtn.onclick = () => this.copyText(names.lastRu, lastBtn);

        const fullBtn = document.getElementById('slf-copy-full-ru');
        if (fullBtn) fullBtn.onclick = () => this.copyText(ruFull, fullBtn);

        const retry = document.getElementById('slf-youth-autofill-retry');
        if (retry) {
            retry.onclick = () => this.run(true);
        }

        const close = document.getElementById('slf-youth-autofill-close');
        if (close) {
            close.onclick = () => panel.remove();
        }
    },

    run(force = false) {
        if (!this.isPage()) return;

        const data = this.getParams();

        if (!data.tmUrl) return;

        if (!force && window.__slfYouthAutofillDone === location.href) return;

        window.__slfYouthAutofillDone = location.href;

        console.log('[SLF Youth Autofill] run', data);

        this.injectPageScript(data.tmUrl);

        setTimeout(() => this.injectPageScript(data.tmUrl), 500);
        setTimeout(() => this.forceFallback(data.tmUrl), 1100);
        setTimeout(() => this.showPanel(data), 1600);
    },

    start() {
        if (!this.isPage()) return;

        console.log('[SLF Youth Autofill] start', location.href);

        this.run();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.run(true));
        }

        window.addEventListener('load', () => this.run(true));

        setTimeout(() => this.run(true), 700);
        setTimeout(() => this.run(true), 1500);
        setTimeout(() => this.run(true), 3000);
    }
};

/*
 * Отдельный bootstrap.
 * Не зависит от App.mountUI(), чтобы работало на youngs2.php?action=new.
 */
try {
    YouthApplicationAutofill.start();
} catch (e) {
    console.error('[SLF Youth Autofill] bootstrap failed', e);
}



// ============================================================
// <<< src/modules/team-management/youth-application-autofill.js


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
            season,
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
                label: `${range[1]}/${range[2]}`,
                startYear: Number(range[1]),
                endYear: Number(range[2]),
                seasonYear: Number(range[2]),
                isCurrent
            };
        }

        const single = clean.match(/^Сезон\s+(\d{4})/i);

        if (single) {
            return {
                label: single[1],
                startYear: Number(single[1]),
                endYear: Number(single[1]),
                seasonYear: Number(single[1]),
                isCurrent
            };
        }

        return null;
    },

    parseSeasonStatRows(doc) {
        const result = [];

        let currentSeason = null;
        let currentSeasonLabel = '';
        let currentIsCurrent = false;

        [...doc.body.querySelectorAll('*')].forEach(el => {
            const text = this.normalizeText(el.innerText || el.textContent || '');

            const seasonHeader = text.length < 120
                ? this.parseSeasonHeader(text)
                : null;

            if (seasonHeader) {
                currentSeason = seasonHeader.seasonYear;
                currentSeasonLabel = seasonHeader.label;
                currentIsCurrent = seasonHeader.isCurrent;
                return;
            }

            if (el.matches && el.matches('table.ai_stat')) {
                [...el.querySelectorAll('tr')]
                    .map(tr => this.parseAiStatRow(tr, currentSeason))
                    .filter(Boolean)
                    .forEach(row => {
                        row.seasonLabel = currentSeasonLabel;
                        row.isCurrentSeason = currentIsCurrent;
                        result.push(row);
                    });
            }
        });

        return result;
    },

    buildAnalysis(data) {
        const eligiblePct = CONFIG.TRANSFER_ANALYZER?.slfAlter?.eligibleMinutesPct || 40;
        const rows = Array.isArray(data.rows) ? data.rows : [];

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

        const markedCurrentAllRows = validRows.filter(row => row.isCurrentSeason === true);
        const markedCurrentLeagueRows = leagueRows.filter(row => row.isCurrentSeason === true);

        const currentSeasonYear = markedCurrentAllRows.length
            ? Math.max(...markedCurrentAllRows.map(row => Number(row.season || 0)))
            : null;

        const currentSeasonLabel = markedCurrentAllRows[0]?.seasonLabel || '';

        const currentRow = this.pickBestRow(markedCurrentLeagueRows);

        const eligibleRows = leagueRows.filter(row => Number(row.minutesPct || 0) >= eligiblePct);
        const currentEligibleRows = eligibleRows.filter(row => row.isCurrentSeason === true);
        const pastEligibleRows = eligibleRows.filter(row => row.isCurrentSeason !== true);

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
            talentUpgradeRows.filter(row => row.isCurrentSeason === true)
        );

        const pastTalentUpgradeRow = this.pickBestRow(
            talentUpgradeRows.filter(row => row.isCurrentSeason !== true)
        );

        const talentUpgradeRow = currentTalentUpgradeRow || pastTalentUpgradeRow || null;

        const lastSeasonYear = validRows.length
            ? Math.max(...validRows.map(row => Number(row.season || 0)))
            : null;

        const hasCurrentSeason = markedCurrentAllRows.length > 0;
        const isCurrentSeasonActive = !!currentRow && (
            Number(currentRow.minutesPct || 0) > 0 ||
            Number(currentRow.gamesPlayed || 0) > 0
        );

        const skillDelta = finalSkill != null && currentSkill
            ? finalSkill - currentSkill
            : null;

        return {
            playerId: data.playerId,
            url: data.url,

            currentSeasonYear,
            currentSeasonLabel,
            lastSeasonYear,
            hasCurrentSeason,
            isCurrentSeasonActive,
            staleActivity: !hasCurrentSeason,

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
            return Number(b.season || 0) - Number(a.season || 0) ||
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
        return location.pathname.includes('/train.php');
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


// ============================================================
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

    isLoanTabActive() {
        const activeTab = document.querySelector('.tpanel-a[data-tp="-1"]');
        if (activeTab && /аренд/i.test(activeTab.textContent || '')) return true;

        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .some(row => getComputedStyle(row).display !== 'none');
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
        return [...document.querySelectorAll('tr.view-team__player.pl--1')]
            .filter(row => row.querySelector('.player-loan') || /аренд/i.test(row.textContent || ''));
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
        const over23 = players.filter(player => Number.isFinite(player.age) && player.age >= 24).length;
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
        let statusText = `Можно ещё: ${state.leftTotal} всего · ${state.canOver23} 24+`;

        if (state.totalExceeded || state.over23Exceeded) {
            statusClass = 'bad';
            statusText = 'Лимит превышен';
        } else if (state.totalFull) {
            statusClass = 'bad';
            statusText = 'Общий лимит заполнен';
        } else if (state.over23Full) {
            statusClass = 'warn';
            statusText = `Можно ещё: ${state.leftTotal}, только ≤23`;
        }

        box.innerHTML = `
            <div class="slf-loan-head">Аренды</div>
            <div class="slf-loan-line">
                <span>Всего</span>
                <b>${state.total}/${this.LIMIT_TOTAL}</b>
            </div>
            <div class="slf-loan-line">
                <span>24+</span>
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


// >>> src/modules/team-management/team4-player-status-helper.js
// 14.9 Team4 player status helper
// ============================================================

const PlayerStatusPanel = {
    HEAD_CLASS: 'slf-player-status-head',
    CELL_CLASS: 'slf-player-status-cell',
    MARKER_CLASS: 'slf-status-marker',
    TIP_ID: 'slf-player-status-tip',
    STYLE_ID: 'slf-player-status-style',
    STORAGE_KEY: 'slf_team4_player_status_cache_v3',
    LEGACY_STORAGE_KEYS: ['slf_team4_player_status_cache_v2', 'slf_team4_player_status_cache_v1'],
    TAB_TYPES: new Set(['0', '1', '-3']),
    TYPE_TO_ROW_CLASS: { '0': 'pl-0', '1': 'pl-1', '-3': 'pl--3' },
    REAL_MARKER_CATEGORIES: new Set(['club', 'agent', 'tmValue', 'activity', 'trend', 'contract', 'academy']),
    mounted: false,
    renderSeq: 0,
    sessionCache: new Map(),
    tooltipHtmlCache: new Map(),
    activeTipPlayerId: '',
    activeTipButton: null,

    isPage() {
        return location.pathname.includes('/team4.php');
    },

    norm(text) {
        return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    },

    low(text) {
        return this.norm(text).toLowerCase();
    },

    parseNum(text) {
        const match = String(text || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    },

    parseMoney(text) {
        const raw = this.norm(text);
        if (!raw) return 0;
        const match = raw.replace(/'/g, '').replace(/,/g, '.').match(/([0-9]+(?:\.[0-9]+)?)/);
        if (!match) return 0;
        let value = Number(match[1] || 0);
        if (!Number.isFinite(value)) return 0;
        if (/\bM\b|млн|mio\.?/i.test(raw)) value *= 1000000;
        else if (/\bk\b|тыс/i.test(raw)) value *= 1000;
        return value;
    },

    formatMoney(value) {
        const n = Number(value || 0);
        if (!n) return '?';
        if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer.formatMoney) {
            try { return TMEnrichmentLayer.formatMoney(n); } catch (_) { /* noop */ }
        }
        if (n >= 1000000) return `€${(n / 1000000).toFixed(n >= 10000000 ? 1 : 2)}M`;
        if (n >= 1000) return `€${Math.round(n / 1000)}k`;
        return `€${Math.round(n)}`;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    escapeAttr(value) {
        return this.escapeHtml(value).replaceAll('\n', '&#10;');
    },

    getActiveTabType() {
        return String(document.querySelector('.tpanel-a[data-tp]')?.dataset.tp || '0');
    },

    shouldShowModule() {
        return this.TAB_TYPES.has(this.getActiveTabType());
    },

    getRows() {
        return [...document.querySelectorAll('tr.view-team__player.pl-0, tr.view-team__player.pl-1, tr.view-team__player.pl--3')];
    },

    getActiveRows() {
        const rowClass = this.TYPE_TO_ROW_CLASS[this.getActiveTabType()];
        return rowClass ? [...document.querySelectorAll(`tr.view-team__player.${rowClass}`)] : [];
    },

    getPlayerId(row) {
        return String(row?.id || '').replace(/^pltr-/, '');
    },

    getTmLink(row) {
        return row.querySelector('a[href*="transfermarkt.com"]')?.href || '';
    },

    getTmPlayerId(tmUrl) {
        const match = String(tmUrl || '').match(/spieler\/(\d+)/i);
        return match ? match[1] : '';
    },

    makeKeyFromValues(playerId, tmUrl) {
        const slfId = String(playerId || '').trim();
        const tmId = this.getTmPlayerId(tmUrl);
        return `slf:${slfId}|tm:${tmId || tmUrl || '-'}`;
    },

    playerKey(row) {
        return this.makeKeyFromValues(this.getPlayerId(row), this.getTmLink(row));
    },

    getSessionCached(row) {
        return this.sessionCache.get(this.playerKey(row)) || null;
    },

    setSessionCached(row, data) {
        this.sessionCache.set(this.playerKey(row), data);
        if (data?.key) this.sessionCache.set(data.key, data);
    },

    parseTime(value) {
        const timestamp = Date.parse(value || '');
        return Number.isFinite(timestamp) ? timestamp : 0;
    },

    isRealMarker(marker) {
        if (!marker) return false;
        const category = String(marker.category || '').trim();
        if (category && this.REAL_MARKER_CATEGORIES.has(category)) return true;
        const label = this.low(marker.label || '');
        return /^(tm|min|club|agent|ctr|contract|academy|youth|peak|fall|пик|спад|около пика|ниже пика)/i.test(label);
    },

    filterRealMarkers(markers) {
        return (Array.isArray(markers) ? markers : []).filter(marker => this.isRealMarker(marker));
    },

    normalizeRecord(record) {
        if (!record || record.recordType !== 'team4_player_status') return null;
        const key = record.key || this.makeKeyFromValues(record.slfPlayerId, record.tmUrl || record.tmLink || '');
        if (!key || !record.slfPlayerId) return null;

        const normalized = {
            ...record,
            key,
            tmLink: record.tmLink || record.tmUrl || '',
            tmUrl: record.tmUrl || record.tmLink || '',
            markers: this.filterRealMarkers(record.markers),
            contextMarkers: [],
            potentialTitle: '',
            formDelta: 0,
            practice: null,
            physical: null,
            fatigue: null,
            morale: null
        };

        normalized.trendInfo = normalized.trendInfo || this.getTrendInfo(normalized.tmProfile, normalized.tmValueRowEur);
        normalized.status = this.classifyStatus(normalized);
        normalized.reasons = normalized.status?.reasons || [];
        return normalized;
    },

    putSessionRecord(record) {
        const normalized = this.normalizeRecord(record);
        if (!normalized) return false;
        const existing = this.sessionCache.get(normalized.key);
        if (existing && this.parseTime(existing.updatedAt) > this.parseTime(normalized.updatedAt)) return false;
        this.sessionCache.set(normalized.key, normalized);
        this.cacheTooltipHtml(normalized);
        return true;
    },

    loadFromLocalStorage() {
        if (!this.isPage()) return false;
        try {
            const rows = [];
            [this.STORAGE_KEY, ...this.LEGACY_STORAGE_KEYS].forEach(key => {
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                rows.push(...(Array.isArray(parsed) ? parsed : Object.values(parsed || {})));
            });
            let changed = false;
            rows.forEach(row => { changed = this.putSessionRecord(row) || changed; });
            return changed;
        } catch (error) {
            debugWarn('[SLF Статус] localStorage read failed', error);
            return false;
        }
    },

    saveToLocalStorage() {
        try {
            const unique = [];
            const seen = new Set();
            [...this.sessionCache.values()].forEach(record => {
                const row = this.normalizeRecord(record);
                if (!row?.key || seen.has(row.key)) return;
                seen.add(row.key);
                unique.push(row);
            });
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(unique));
        } catch (error) {
            debugWarn('[SLF Статус] localStorage write failed', error);
        }
    },

    getHeaderIndexMap() {
        const headers = [...document.querySelectorAll('#generallist thead th')]
            .filter(th => !th.classList.contains(this.HEAD_CLASS));
        const result = {
            age: 10,
            talent: 11,
            skill: 14,
            realClub: 19,
            tmPrice: 21
        };
        headers.forEach((th, index) => {
            const text = this.low(th.textContent);
            if (text.includes('воз')) result.age = index;
            else if (text.includes('тал')) result.talent = index;
            else if (text === 'скилл' || (text.includes('скилл') && !text.includes('р-скилл'))) result.skill = index;
            else if (text.includes('клуб в реале')) result.realClub = index;
            else if (text === 'цена') result.tmPrice = index;
        });
        return result;
    },

    getCell(row, index) {
        const cells = [...row.children].filter(td => !td.classList.contains(this.CELL_CLASS));
        return cells[index] || null;
    },

    getPosition(row) {
        return this.low(row.querySelector('.player-position')?.textContent || '').toUpperCase();
    },

    getName(row) {
        return this.norm(row.querySelector('a[href*="player.php"]')?.textContent || row.id || 'unknown');
    },

    getClub(row) {
        return this.norm(row.querySelector('.player-team-real')?.textContent || '');
    },

    getClubConfidence(row) {
        const cell = row.querySelector('.player-team-real');
        if (!cell) return 'none';
        if (cell.querySelector('a[href*="roster.php"]')) return 'linked';
        if (this.norm(cell.textContent)) return 'text';
        return 'none';
    },

    getTmContractFromRow(row) {
        return this.norm(row.querySelector('.player-tm-contract')?.textContent || '');
    },

    isCenterDefender(position) {
        return /^(CD|DC|CB)$/i.test(position);
    },

    isWidePosition(position) {
        return /^(LD|RD|LB|RB|LM|RM|LW|RW)$/i.test(position);
    },

    getAgeStage(age, position) {
        if (!Number.isFinite(age)) return { key: 'unknown', label: 'возр ?', className: 'neutral' };
        if (age <= 19) return { key: 'youth', label: `${age} юн`, className: 'good' };
        if (age <= 23) return { key: 'grow', label: `${age} рост`, className: 'good' };
        if (age <= 29) return { key: 'prime', label: `${age} прайм`, className: 'good' };
        if (position === 'GK') {
            if (age <= 33) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
            if (age <= 36) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (this.isCenterDefender(position)) {
            if (age <= 32) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
            if (age <= 34) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (this.isWidePosition(position)) {
            if (age <= 31) return { key: 'late', label: `${age} поздно`, className: 'warn' };
            return { key: 'old', label: `${age} стар`, className: 'bad' };
        }
        if (age <= 32) return { key: 'hold', label: `${age} держит`, className: 'neutral' };
        if (age <= 34) return { key: 'late', label: `${age} поздно`, className: 'warn' };
        return { key: 'old', label: `${age} стар`, className: 'bad' };
    },

    markerClass(level) {
        const value = String(level || '').toLowerCase();
        if (['hot', 'good', 'normal'].includes(value)) return 'good';
        if (['watch', 'low', 'old'].includes(value)) return 'warn';
        if (['risk', 'skip', 'bad'].includes(value)) return 'bad';
        return 'neutral';
    },

    serializeMarker(marker, category = '') {
        if (!marker) return null;
        const label = String(marker.label || '').trim();
        if (!label) return null;
        return {
            label,
            level: marker.level || 'neutral',
            className: marker.className || this.markerClass(marker.level),
            score: Number(marker.score || 0),
            redFlag: !!marker.redFlag,
            hardStop: !!marker.hardStop,
            category: marker.category || category || '',
            text: marker.text || ''
        };
    },

    getMinutesMarker(profile) {
        const pct = profile?.activity?.minutesPct;
        if (pct == null) return this.serializeMarker({ label: 'MIN ?', level: 'unknown', score: 0, text: 'Минуты текущего сезона не найдены.' }, 'activity');
        const p = Number(pct || 0);
        if (p >= 70) return this.serializeMarker({ label: `MIN ${p}%`, level: 'good', score: 4, text: 'Высокий процент минут в реальном сезоне.' }, 'activity');
        if (p >= 40) return this.serializeMarker({ label: `MIN ${p}%`, level: 'normal', score: 2, text: 'Нормальная доля минут в реальном сезоне.' }, 'activity');
        if (p > 0) return this.serializeMarker({ label: `MIN ${p}%`, level: 'watch', score: -1, redFlag: true, text: 'Мало минут в реальном сезоне.' }, 'activity');
        return this.serializeMarker({ label: 'MIN 0%', level: 'risk', score: -2, redFlag: true, text: 'В текущем реальном сезоне нет игровых минут.' }, 'activity');
    },

    getRowTmValueMarker(data) {
        if (data.tmValueRowEur) {
            return this.serializeMarker({ label: `TM ${this.formatMoney(data.tmValueRowEur)}`, level: data.tmValueRowEur >= 300000 ? 'normal' : 'low', score: data.tmValueRowEur >= 300000 ? 1 : 0, text: 'TM-цена прочитана из строки team4.' }, 'tmValue');
        }
        return this.serializeMarker({ label: 'TM €?', level: 'unknown', score: 0, text: 'TM-цена на странице не найдена.' }, 'tmValue');
    },

    getTransferMarkers(profile, data) {
        const markers = [];
        const analyzer = typeof TransferMarketAnalyzer !== 'undefined' ? TransferMarketAnalyzer : null;
        const safe = (fn, category) => {
            try {
                const marker = this.serializeMarker(fn(), category);
                if (marker && this.isRealMarker(marker)) markers.push(marker);
            } catch (error) {
                debugWarn('[SLF Статус] marker failed', category, error);
            }
        };

        if (!profile || !analyzer) {
            markers.push(this.getRowTmValueMarker(data));
            return this.filterRealMarkers(markers);
        }

        safe(() => analyzer.getClubStatusMarker(profile), 'club');
        safe(() => analyzer.getAgentMarker(profile), 'agent');
        safe(() => analyzer.getTmValueMarker(profile), 'tmValue');
        markers.push(this.getMinutesMarker(profile));
        safe(() => analyzer.getValueTrendMarker(profile), 'trend');
        safe(() => analyzer.getContractMarker(profile.contractExpires), 'contract');
        safe(() => analyzer.getAcademyMarker(profile.transferHistory || [], profile.youthClubs || []), 'academy');
        return this.filterRealMarkers(markers);
    },

    getTrendInfo(profile, rowValueEur) {
        const current = Number(profile?.marketValueEur || profile?.lastKnownMarketValueEur || rowValueEur || 0);
        const peak = Number(profile?.highestMarketValueEur || 0);
        const ratio = Number(profile?.valuePeakRatio || (current && peak ? current / peak : 0));
        const pct = ratio ? Math.round(ratio * 100) : null;
        if (!current) return { key: 'unknown', label: 'TM ?', className: 'neutral', current, peak, ratio, pct, text: 'TM-цена не найдена.' };
        if (!peak || !ratio) return { key: 'value', label: `TM ${this.formatMoney(current)}`, className: 'neutral', current, peak, ratio, pct, text: 'Есть текущая TM-цена, но пик не найден.' };
        if (ratio >= 0.90) return { key: 'peak', label: `пик ${pct}%`, className: 'good', current, peak, ratio, pct, text: 'TM-цена на пике или почти на пике.' };
        if (ratio >= 0.70) return { key: 'nearPeak', label: `около пика ${pct}%`, className: 'good', current, peak, ratio, pct, text: 'TM-цена близка к пику.' };
        if (ratio >= 0.40) return { key: 'belowPeak', label: `ниже пика ${pct}%`, className: 'neutral', current, peak, ratio, pct, text: 'TM-цена ниже пика, но игрок еще сохраняет стоимость.' };
        if (ratio >= 0.20) return { key: 'fall', label: `спад ${pct}%`, className: 'warn', current, peak, ratio, pct, text: 'TM-цена заметно ниже пика.' };
        return { key: 'hardFall', label: `сильный спад ${pct}%`, className: 'bad', current, peak, ratio, pct, text: 'TM-цена сильно ниже пика.' };
    },

    classifyStatus(data) {
        const club = this.low(data.club);
        const profile = data.tmProfile || null;
        const profileClub = this.low(profile?.currentClub || '');
        const combinedClubText = `${club} ${profileClub}`;
        const hasRowClub = !!club && !/без клуба|without club|no club|free agent|vereinslos|retired|заверш/i.test(club);
        const hasProfileClub = !!profileClub && !/без клуба|without club|no club|free agent|vereinslos|retired|заверш/i.test(profileClub);
        const hasClub = hasRowClub || hasProfileClub;
        const uncertainClub = data.clubConfidence === 'text' && !hasProfileClub;
        const free = /без клуба|without club|no club|free agent|vereinslos/i.test(combinedClubText) || !!profile?.isFreeAgent;
        const retired = /retired|заверш|career ended/i.test(combinedClubText) || !!profile?.isRetired;
        const hasExternalProfile = !!data.tmLink;
        const stage = data.ageStage?.key || 'unknown';
        const trend = data.trendInfo || this.getTrendInfo(null, data.tmValueRowEur);
        const minPct = profile?.activity?.minutesPct != null ? Number(profile.activity.minutesPct) : null;
        const age = Number(data.age || 0);
        const tmCurrent = Number(profile?.marketValueEur || data.tmValueRowEur || trend.current || 0);
        const peakRatio = Number.isFinite(trend.ratio) ? trend.ratio : null;
        const markers = this.filterRealMarkers(data.markers || []);
        const markerText = this.low(markers.map(marker => `${marker.label || ''} ${marker.text || ''} ${marker.category || ''}`).join(' '));
        const majorRisks = [];
        const minorRisks = [];
        const positives = [];
        const notes = [];
        let confidence = 'medium';

        const addUnique = (list, reason) => {
            if (reason && !list.includes(reason)) list.push(reason);
        };
        const addMajor = reason => addUnique(majorRisks, reason);
        const addMinor = reason => addUnique(minorRisks, reason);
        const addPositive = reason => addUnique(positives, reason);
        const addNote = reason => addUnique(notes, reason);
        const markerHas = re => re.test(markerText);

        if (profile && hasExternalProfile) confidence = 'high';
        if (!profile || !hasExternalProfile) confidence = 'medium';
        if (!hasExternalProfile && !hasClub) confidence = 'low';

        const severeTrend = trend.key === 'hardFall' || (Number.isFinite(peakRatio) && peakRatio > 0 && peakRatio < 0.20);
        const fallingTrend = trend.key === 'fall' || (Number.isFinite(peakRatio) && peakRatio >= 0.20 && peakRatio < 0.40);
        const belowPeakTrend = trend.key === 'belowPeak' || (Number.isFinite(peakRatio) && peakRatio >= 0.40 && peakRatio < 0.70);
        const nearPeakTrend = trend.key === 'peak' || trend.key === 'nearPeak' || (Number.isFinite(peakRatio) && peakRatio >= 0.85);
        const missingTrend = !trend.current || trend.key === 'unknown';
        const highValue = tmCurrent >= 10000000;
        const eliteValue = tmCurrent >= 20000000;
        const goodValue = tmCurrent >= 1000000;
        const hasAcademy = markerHas(/(elite|academy|youth|академ|школ|la masia|barcelona)/i);
        const hasAgent = markerHas(/(agent ✓|агент ✓|agent ok|agent)/i) && !markerHas(/(no agent|без агента|agent \?|агент \?|нет агента)/i);
        const hasContract = markerHas(/(ctr|contract|контракт)/i) && !markerHas(/(contract \?|ctr \?|нет контракта)/i);
        const confirmedLowMinutes = minPct != null && minPct < 30;
        const confirmedVeryLowMinutes = minPct != null && minPct < 10;
        const confirmedNoMinutes = minPct === 0;

        const isUnknownMarker = marker => {
            const text = this.low(`${marker.label || ''} ${marker.text || ''}`);
            return /min \?|minutes \?|минуты.*не найден|не найдены|нет данных|unknown|agent \?|агент \?|contract \?|ctr \?/i.test(text);
        };
        const redMarkers = markers.filter(marker => !isUnknownMarker(marker) && (marker.hardStop || marker.redFlag || marker.className === 'bad' || ['risk', 'skip', 'bad'].includes(String(marker.level || '').toLowerCase())));
        const warnMarkers = markers.filter(marker => !isUnknownMarker(marker) && (marker.className === 'warn' || ['watch', 'low', 'old'].includes(String(marker.level || '').toLowerCase())));

        if (retired) return { code: 'ВНЕ', label: 'завершил', className: 'bad', confidence, reasons: ['завершил карьеру'] };
        if (free) return { code: 'ВНЕ', label: 'без клуба', className: 'bad', confidence, reasons: ['без клуба'] };

        if (!hasClub) addMinor('клуб не подтвержден');
        if (uncertainClub) addNote('клуб указан текстом, уверенность ниже');
        if (!hasExternalProfile) addNote('нет TM-профиля');
        if (missingTrend && hasExternalProfile) addNote('TM-тренд не найден');
        if (minPct == null && profile) addNote('минуты текущего сезона не найдены');

        if (severeTrend) addMajor('TM-цена сильно ниже пика');
        else if (fallingTrend) addMajor('TM-цена заметно ниже пика');
        else if (belowPeakTrend && (stage === 'late' || stage === 'old' || age >= 30)) addMinor('TM-цена ниже пика на возрастном этапе');

        if (confirmedNoMinutes && age >= 23) addMajor('0% минут в текущем реальном сезоне');
        else if (confirmedVeryLowMinutes && age >= 23) addMajor('очень мало подтвержденных реальных минут');
        else if (confirmedLowMinutes && age >= 25) addMinor('низкая подтвержденная реальная активность');

        if (stage === 'old') addMajor('возрастной hard-risk для позиции');
        else if (stage === 'late') addMinor('поздний возрастной этап для позиции');
        redMarkers.forEach(marker => addMajor(marker.text || marker.label || 'красный real/TM маркер'));
        warnMarkers.forEach(marker => addMinor(marker.text || marker.label || 'желтый real/TM маркер'));

        if (hasClub) addPositive('есть клуб');
        if (hasExternalProfile) addPositive('есть TM-профиль');
        if (nearPeakTrend) addPositive('TM-цена около пика');
        if (eliteValue) addPositive('очень высокая TM-цена');
        else if (highValue) addPositive('высокая TM-цена');
        else if (goodValue) addPositive('есть значимая TM-цена');
        if (minPct != null && minPct >= 70) addPositive('высокие реальные минуты');
        else if (minPct != null && minPct >= 40) addPositive('есть реальные минуты');
        if (hasAgent) addPositive('есть агент');
        if (hasContract) addPositive('есть контракт');
        if (hasAcademy) addPositive('сильный academy/youth trace');

        const riskReasons = [...majorRisks, ...minorRisks];
        const allReasons = [...riskReasons, ...positives, ...notes].slice(0, 7);
        const strongCurrentProfile = hasClub && hasExternalProfile && nearPeakTrend && (highValue || eliteValue || hasAcademy || minPct >= 40);
        const cleanStrongProfile = majorRisks.length === 0 && hasClub && hasExternalProfile && nearPeakTrend;

        if (majorRisks.length) {
            if (severeTrend || stage === 'old' || (age >= 30 && majorRisks.length >= 1) || majorRisks.length >= 2) {
                return { code: 'СПАД', label: 'сильный спад', className: 'bad', confidence, reasons: allReasons };
            }
            return { code: 'РЕГРЕСС', label: 'подтвержденный риск', className: 'warn', confidence, reasons: allReasons };
        }

        if (minorRisks.length >= 2 && !strongCurrentProfile) {
            if (age >= 30 || stage === 'late' || stage === 'hold') {
                return { code: 'СПАД', label: 'накопленные риски', className: 'warn', confidence, reasons: allReasons };
            }
            return { code: 'РЕГРЕСС', label: 'есть риски снижения', className: 'warn', confidence, reasons: allReasons };
        }

        if (eliteValue && cleanStrongProfile && minPct != null && minPct >= 70) {
            return { code: 'ТОП', label: 'топ-уровень', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (highValue && cleanStrongProfile) {
            if (stage === 'youth' || stage === 'grow') {
                return { code: 'РОСТ', label: 'звезда на подъеме', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            }
            return { code: 'ЗВЕЗДА', label: 'звезда команды', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if ((stage === 'youth' || stage === 'grow') && hasClub && hasExternalProfile) {
            if (nearPeakTrend || hasAcademy || goodValue) {
                return { code: 'РОСТ', label: 'на подъеме', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            }
            return { code: 'СЫРОЙ', label: 'молодой, мало данных', className: 'neutral', confidence: confidence === 'high' ? 'medium' : confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'prime' && hasClub && hasExternalProfile) {
            if (nearPeakTrend) return { code: 'ПИК', label: 'около пика', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (minPct != null && minPct >= 40) return { code: 'ОСНОВА', label: 'стабильная основа', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (minorRisks.length === 1) return { code: 'ОСНОВА', label: 'основа с оговоркой', className: 'neutral', confidence, reasons: allReasons };
            return { code: 'ОСНОВА', label: 'актуальный игрок', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'hold' && hasClub && hasExternalProfile) {
            return { code: 'ДЕРЖИТ', label: 'держит уровень', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (stage === 'late' || stage === 'old') {
            return { code: 'СПАД', label: 'возрастной спад', className: stage === 'old' ? 'bad' : 'warn', confidence, reasons: allReasons.length ? allReasons : ['поздний возрастной этап для позиции'] };
        }

        if (hasClub && hasExternalProfile) {
            if (nearPeakTrend) return { code: 'ПИК', label: 'около пика', className: 'good', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            if (goodValue || minPct != null && minPct >= 40) return { code: 'ОСНОВА', label: 'актуальный игрок', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
            return { code: 'СЫРОЙ', label: 'мало real/TM данных', className: 'neutral', confidence, reasons: [...positives, ...notes].slice(0, 7) };
        }

        if (age && age <= 21) return { code: 'СЫРОЙ', label: 'молодой, мало данных', className: 'neutral', confidence: 'low', reasons: allReasons.length ? allReasons : ['мало real/TM данных'] };
        return { code: 'СПАД', label: 'слабые real/TM данные', className: 'warn', confidence: 'low', reasons: allReasons.length ? allReasons : ['нет сильных real/TM подтверждений'] };
    },

    readPlayerFromDom(row, indexMap) {
        const age = this.parseNum(this.getCell(row, indexMap.age)?.textContent);
        const talent = this.parseNum(this.getCell(row, indexMap.talent)?.textContent);
        const skill = this.parseNum(this.getCell(row, indexMap.skill)?.textContent);
        const position = this.getPosition(row);
        const ageStage = this.getAgeStage(age, position);
        const tmLink = this.getTmLink(row);
        const data = {
            recordType: 'team4_player_status',
            key: this.playerKey(row),
            slfPlayerId: this.getPlayerId(row),
            tmPlayerId: this.getTmPlayerId(tmLink),
            tmUrl: tmLink,
            name: this.getName(row),
            position,
            age,
            talent,
            skill,
            tmValueRowText: this.norm(this.getCell(row, indexMap.tmPrice)?.childNodes?.[0]?.textContent || this.getCell(row, indexMap.tmPrice)?.textContent || ''),
            tmValueRowEur: 0,
            tmContractRow: this.getTmContractFromRow(row),
            club: this.getClub(row),
            clubConfidence: this.getClubConfidence(row),
            tmLink,
            ageStage,
            updatedAt: new Date().toISOString(),
            updateState: 'updated',
            tmProfile: null,
            tmError: '',
            markers: [],
            contextMarkers: []
        };
        data.tmValueRowEur = this.parseMoney(data.tmValueRowText);
        data.trendInfo = this.getTrendInfo(null, data.tmValueRowEur);
        data.markers = this.getTransferMarkers(null, data);
        data.status = this.classifyStatus(data);
        data.reasons = data.status?.reasons || [];
        return data;
    },

    async enrichWithTmProfile(data) {
        if (!data?.tmLink || typeof TMEnrichmentLayer === 'undefined' || !TMEnrichmentLayer.getTmProfile) {
            data.markers = this.getTransferMarkers(null, data);
            data.status = this.classifyStatus(data);
            data.reasons = data.status?.reasons || [];
            return data;
        }
        try {
            const profile = await TMEnrichmentLayer.getTmProfile(data.tmLink);
            data.tmProfile = {
                currentClub: profile.currentClub || '',
                playerAgent: profile.playerAgent || '',
                contractExpires: profile.contractExpires || '',
                marketValueText: profile.marketValueText || profile.lastKnownMarketValueText || '',
                marketValueEur: profile.marketValueEur || profile.lastKnownMarketValueEur || 0,
                highestMarketValueText: profile.highestMarketValueText || '',
                highestMarketValueEur: profile.highestMarketValueEur || 0,
                highestMarketValueDate: profile.highestMarketValueDate || '',
                valuePeakRatio: profile.valuePeakRatio ?? null,
                activity: profile.activity || null,
                isRetired: !!profile.isRetired,
                isFreeAgent: !!profile.isFreeAgent,
                transferHistory: profile.transferHistory || [],
                youthClubs: profile.youthClubs || [],
                rumors: profile.rumors || [],
                fetchedAt: profile.fetchedAt || Date.now()
            };
            data.trendInfo = this.getTrendInfo(profile, data.tmValueRowEur);
            data.markers = this.getTransferMarkers(profile, data);
        } catch (error) {
            data.tmError = String(error?.message || error || 'tm_failed');
            data.markers = this.getTransferMarkers(null, data);
        }
        data.contextMarkers = [];
        data.status = this.classifyStatus(data);
        data.reasons = data.status?.reasons || [];
        data.updatedAt = new Date().toISOString();
        return data;
    },

    async readPlayer(row, indexMap, enrich = false) {
        const data = this.readPlayerFromDom(row, indexMap);
        if (enrich) await this.enrichWithTmProfile(data);
        data.updatedAt = new Date().toISOString();
        this.setSessionCached(row, data);
        this.cacheTooltipHtml(data);
        return data;
    },

    markerRowHtml(marker) {
        if (!marker) return '';
        const text = marker.text ? `<div class="muted">${this.escapeHtml(marker.text)}</div>` : '';
        return `<div><span class="slf-status-badge ${this.escapeAttr(marker.className || 'neutral')}">${this.escapeHtml(marker.label)}</span>${text}</div>`;
    },

    buildTipHtml(data) {
        const reasons = (data.status?.reasons || []).map(reason => `<div>+ ${this.escapeHtml(reason)}</div>`).join('');
        const tmLine = data.tmLink
            ? `<a class="slf-status-link" href="${this.escapeAttr(data.tmLink)}" target="_blank">TM</a>`
            : '<span class="muted">TM ?</span>';
        const tmProfile = data.tmProfile || {};
        const trend = data.trendInfo || {};
        const tmCurrent = trend.current ? this.formatMoney(trend.current) : (data.tmValueRowEur ? this.formatMoney(data.tmValueRowEur) : '?');
        const tmPeak = trend.peak ? this.formatMoney(trend.peak) : '?';
        const ratioText = trend.pct != null ? `${trend.pct}%` : '?';
        const minutesPct = tmProfile.activity?.minutesPct != null ? `${tmProfile.activity.minutesPct}%` : '?';
        const markerHtml = this.filterRealMarkers(data.markers).map(marker => this.markerRowHtml(marker)).join('');
        return `
            <div class="title">${this.escapeHtml(data.name)} — ${this.escapeHtml(data.status?.code || '?')}</div>
            <div class="row"><b>Статус:</b> ${this.escapeHtml(data.status?.label || '?')} · уверенность ${this.escapeHtml(data.status?.confidence || '?')}</div>
            <div class="row"><b>Возраст/позиция:</b> ${this.escapeHtml(data.position || '?')} · ${this.escapeHtml(data.age ?? '?')} · ${this.escapeHtml(data.ageStage?.label || '?')}</div>
            <div class="row"><b>TM:</b> ${this.escapeHtml(tmCurrent)} / peak ${this.escapeHtml(tmPeak)} · ${this.escapeHtml(ratioText)} · ${this.escapeHtml(trend.label || '')}</div>
            <div class="row"><b>MIN:</b> ${this.escapeHtml(minutesPct)}</div>
            <div class="row"><b>Клуб:</b> ${this.escapeHtml(tmProfile.currentClub || data.club || '?')}</div>
            <div class="row"><b>Агент:</b> ${this.escapeHtml(tmProfile.playerAgent || '?')}</div>
            <div class="row"><b>Контракт:</b> ${this.escapeHtml(tmProfile.contractExpires || data.tmContractRow || '?')}</div>
            <div class="row"><b>Профиль:</b> ${tmLine}</div>
            <div class="row"><b>Маркеры реала:</b>${markerHtml || '<div class="muted">нет маркеров</div>'}</div>
            <div class="row"><b>Почему:</b>${reasons || '<div class="muted">нет явных причин</div>'}</div>
            ${data.tmError ? `<div class="row muted">TM error: ${this.escapeHtml(data.tmError)}</div>` : ''}
            <div class="row muted">обновлено · ${this.escapeHtml(data.updatedAt || '?')}</div>
        `;
    },

    cacheTooltipHtml(data) {
        const playerId = data?.slfPlayerId || '';
        if (!playerId) return '';
        const html = this.buildTipHtml(data);
        this.tooltipHtmlCache.set(playerId, html);
        return html;
    },

    statusMarker(data) {
        const code = data?.status?.code || '?';
        const type = data?.status?.className || 'neutral';
        const playerId = data?.slfPlayerId || '';
        const titleParts = [];
        if (data?.trendInfo?.label) titleParts.push(data.trendInfo.label);
        if (data?.tmProfile?.activity?.minutesPct != null) titleParts.push(`MIN ${data.tmProfile.activity.minutesPct}%`);
        if (data?.status?.confidence) titleParts.push(`conf ${data.status.confidence}`);
        this.cacheTooltipHtml(data);
        return `<button type="button" class="slf-status-badge ${this.MARKER_CLASS} ${type}" data-player-id="${this.escapeAttr(playerId)}" aria-label="${this.escapeAttr(code)}" title="${this.escapeAttr(titleParts.join(' · '))}">${this.escapeHtml(code)}</button>`;
    },

    loadingMarker(text = '...') {
        return `<span class="slf-status-badge neutral slf-status-loading">${this.escapeHtml(text)}</span>`;
    },

    makeCellHtml(row) {
        const cached = this.getSessionCached(row);
        if (!cached) return '<span class="slf-status-muted">-</span>';
        return this.statusMarker(cached);
    },

    ensureStyle() {
        if (document.getElementById(this.STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            #generallist th.${this.HEAD_CLASS} {
                text-align:center;
                background:hsl(96, 5%, 19%);
                color:#9cff57;
                font-weight:bold;
                cursor:pointer;
                user-select:none;
                width:72px;
                min-width:72px;
                max-width:72px;
            }
            #generallist th.${this.HEAD_CLASS}:hover { color:#fff; }
            #generallist td.${this.CELL_CLASS} {
                width:72px;
                min-width:72px;
                max-width:72px;
                background:rgba(28,28,28,.72);
                border-left:1px solid #444;
                vertical-align:middle;
                white-space:nowrap;
                line-height:1.25;
                overflow:hidden;
                text-align:center;
            }
            .slf-status-title { white-space:nowrap; }
            .slf-status-badge,
            .slf-status-link {
                display:inline-block;
                padding:1px 4px;
                border-radius:3px;
                border:1px solid #555;
                background:#242424;
                color:#ddd;
                font:10px Verdana,Arial,sans-serif;
                text-decoration:none;
                cursor:default;
            }
            .${this.MARKER_CLASS} {
                cursor:pointer;
                max-width:68px;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
            }
            .slf-status-link {
                color:#9bd4ff;
                text-decoration:underline;
                cursor:pointer;
            }
            .slf-status-badge.good { background:#053d1f; border-color:#1e9c50; color:#78ff9a; }
            .slf-status-badge.warn { background:#483500; border-color:#9b7a00; color:#ffd45a; }
            .slf-status-badge.bad { background:#471414; border-color:#a64040; color:#ff8a8a; }
            .slf-status-badge.neutral { background:#262626; border-color:#555; color:#d0d0d0; }
            .slf-status-muted { color:#777; font-size:10px; }
            #${this.TIP_ID} {
                position:absolute;
                z-index:999999;
                width:390px;
                max-width:390px;
                max-height:70vh;
                overflow:auto;
                padding:10px;
                background:#151515;
                color:#e8e8e8;
                border:1px solid #666;
                border-radius:6px;
                box-shadow:0 8px 24px rgba(0,0,0,.55);
                font:11px Verdana,Arial,sans-serif;
                line-height:1.38;
                display:none;
                pointer-events:auto;
            }
            #${this.TIP_ID} .title { color:#9cff57; font-weight:bold; margin-bottom:6px; }
            #${this.TIP_ID} .row { border-top:1px solid #333; padding:4px 0; }
            #${this.TIP_ID} .muted { color:#aaa; margin-top:2px; }
        `;
        document.head.appendChild(style);
    },

    ensureHeader() {
        const headRow = document.querySelector('#generallist thead tr');
        if (!headRow) return;
        let th = headRow.querySelector(`th.${this.HEAD_CLASS}`);
        if (!th) {
            th = document.createElement('th');
            th.className = this.HEAD_CLASS;
            headRow.appendChild(th);
        }
        th.innerHTML = '<div class="slf-status-title">обновить</div>';
        th.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.hideTip();
            this.render(true);
        };
    },

    ensureTip() {
        let tip = document.getElementById(this.TIP_ID);
        if (!tip) {
            tip = document.createElement('div');
            tip.id = this.TIP_ID;
            document.body.appendChild(tip);
        }
        return tip;
    },

    positionTip(tip, button) {
        if (!tip || !button) return;
        const rect = button.getBoundingClientRect();
        const margin = 8;
        const gap = 6;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
        const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const maxWidth = Math.max(260, Math.min(390, viewportWidth - margin * 2));

        tip.style.width = `${maxWidth}px`;
        tip.style.maxWidth = `${maxWidth}px`;
        tip.style.visibility = 'hidden';
        tip.style.display = 'block';
        const measured = tip.getBoundingClientRect();
        const width = measured.width || maxWidth;
        const height = measured.height || 260;

        let viewportLeft;
        if (rect.left + width <= viewportWidth - margin) viewportLeft = rect.left;
        else if (rect.right - width >= margin) viewportLeft = rect.right - width;
        else if (rect.left - width - gap >= margin) viewportLeft = rect.left - width - gap;
        else viewportLeft = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
        viewportLeft = Math.min(Math.max(viewportLeft, margin), viewportWidth - width - margin);

        let viewportTop = rect.bottom + gap;
        if (viewportTop + height > viewportHeight - margin && rect.top - height - gap >= margin) viewportTop = rect.top - height - gap;
        viewportTop = Math.min(Math.max(viewportTop, margin), viewportHeight - height - margin);

        tip.style.left = `${viewportLeft + scrollX}px`;
        tip.style.top = `${viewportTop + scrollY}px`;
        tip.style.visibility = 'visible';
    },

    showPreparedTip(button, playerId) {
        const tip = this.ensureTip();
        if (tip.style.display === 'block' && this.activeTipPlayerId === playerId) {
            this.hideTip();
            return;
        }
        let html = this.tooltipHtmlCache.get(playerId);
        if (!html) {
            const data = [...this.sessionCache.values()].find(row => row.slfPlayerId === playerId);
            if (!data) return;
            html = this.cacheTooltipHtml(data);
        }
        tip.innerHTML = html;
        this.activeTipButton = button;
        this.positionTip(tip, button);
        tip.dataset.playerId = playerId;
        this.activeTipPlayerId = playerId;
        tip.style.display = 'block';
    },

    hideTip() {
        const tip = document.getElementById(this.TIP_ID);
        if (tip) {
            tip.style.display = 'none';
            tip.dataset.playerId = '';
        }
        this.activeTipPlayerId = '';
        this.activeTipButton = null;
    },

    handleMarkerClick(event) {
        const button = event.target.closest?.(`.${this.MARKER_CLASS}`);
        if (!button) return false;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        const playerId = button.dataset.playerId || '';
        if (!playerId) return true;
        this.showPreparedTip(button, playerId);
        return true;
    },

    async refreshRow(row, indexMap, seq) {
        let cell = row.querySelector(`td.${this.CELL_CLASS}`);
        if (!cell) return;
        const baseData = this.readPlayerFromDom(row, indexMap);
        this.setSessionCached(row, baseData);
        cell.innerHTML = this.statusMarker(baseData);

        const data = await this.readPlayer(row, indexMap, true);
        if (seq !== this.renderSeq) return;
        cell = row.querySelector(`td.${this.CELL_CLASS}`);
        if (!cell) return;
        cell.innerHTML = this.statusMarker(data);
    },

    async runLimited(items, limit, worker) {
        const queue = [...items];
        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                await worker(item);
            }
        });
        await Promise.all(workers);
    },

    render(refreshVisible = false) {
        if (!this.isPage()) return;
        const seq = ++this.renderSeq;
        this.ensureStyle();
        this.ensureHeader();

        const indexMap = this.getHeaderIndexMap();
        const rows = this.getRows();
        const activeRows = this.getActiveRows();
        const activeRowSet = new Set(activeRows);
        const show = this.shouldShowModule();
        const head = document.querySelector(`th.${this.HEAD_CLASS}`);
        if (head) head.style.display = show ? '' : 'none';

        rows.forEach(row => {
            let cell = row.querySelector(`td.${this.CELL_CLASS}`);
            if (!cell) {
                cell = document.createElement('td');
                cell.className = this.CELL_CLASS;
                row.appendChild(cell);
            }
            cell.style.display = show ? '' : 'none';
            cell.innerHTML = refreshVisible && show && activeRowSet.has(row)
                ? this.loadingMarker('...')
                : this.makeCellHtml(row);
        });

        if (!refreshVisible || !show) return;

        this.runLimited(activeRows, 3, async row => {
            try {
                await this.refreshRow(row, indexMap, seq);
            } catch (error) {
                debugWarn('[SLF Статус] refresh row failed', error);
                const cell = row.querySelector(`td.${this.CELL_CLASS}`);
                const fallback = this.readPlayerFromDom(row, indexMap);
                fallback.tmError = String(error?.message || error || 'refresh_failed');
                this.setSessionCached(row, fallback);
                if (cell) cell.innerHTML = this.statusMarker(fallback);
            }
        }).then(() => {
            if (seq === this.renderSeq) this.saveToLocalStorage();
        });
    },

    bindTabs() {
        if (this.mounted) return;
        this.mounted = true;
        document.addEventListener('click', event => {
            const tab = event.target.closest('.tpanel-a, .tpanel-b');
            if (!tab) return;
            setTimeout(() => {
                this.hideTip();
                this.render(false);
            }, 90);
        }, true);
        document.addEventListener('click', event => {
            this.handleMarkerClick(event);
        }, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.hideTip();
        });
        window.addEventListener('resize', () => {
            const tip = document.getElementById(this.TIP_ID);
            if (tip?.style.display === 'block') this.hideTip();
        });
        document.addEventListener('click', event => {
            if (event.target.closest(`.${this.MARKER_CLASS}`)) return;
            if (event.target.closest(`#${this.TIP_ID}`)) return;
            this.hideTip();
        }, true);
    },

    mount() {
        if (!this.isPage()) return;
        this.bindTabs();
        this.loadFromLocalStorage();
        this.render(false);
    }
};
// ============================================================
// <<< src/modules/team-management/team4-player-status-helper.js


// >>> src/modules/team-management/team4-alter-current-season-minutes-fix.js
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
// <<< src/modules/team-management/team4-alter-current-season-minutes-fix.js


// >>> src/app/bootstrap.js
// 15. App Bootstrap
// ============================================================

const App = {
    mountUI() {
    UI.addMatchParserPanel();
    SnapshotEngine.autoResumeIfNeeded();
    DataInspector.addGlobalMenuButton();
    TrainingGuidePanel.mount();
    LoanLimitPanel.mount();
    PlayerStatusPanel.mount();
    EventTracker.startManualTacticWatcher();


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
            DataInspector,
            YouthExternalMonitor,
            YouthApplicationAutofill,
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
            },

            checkYouthPlayer: tmId => YouthExternalMonitor.checkSlfExists(tmId)
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

    // BEGIN SLF FINAL RUNTIME VERSION EXPORT
    var SLF_VERSION_INFO = {
        version: '4.4.79',
        scriptVersion: '4.4.79',
        releaseChannel: 'github-tampermonkey',
        updateURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js',
        downloadURL: 'https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js'
    };
    var SLF_RUNTIME_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    SLF_RUNTIME_TARGET.SLF = Object.assign({}, SLF_RUNTIME_TARGET.SLF || {}, {
        scriptVersion: '4.4.79',
        versionInfo: SLF_VERSION_INFO
    });
    // END SLF FINAL RUNTIME VERSION EXPORT

})();
