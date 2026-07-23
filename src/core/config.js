// 1. Config / Constants
// ============================================================

const CONFIG = {
    DEBUG: false,
    SERVER_URL: "https://slf-api.mostdef.ru",

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
        airbus: 19703,
        northDistrict: 105995
    },

    MY_TEAM_ALIASES: {
        luch: ['луч', 'luch'],
        carrarese: ['каррарезе', 'carrarese'],
        pribram: ['пршибрам', 'příbram', 'pribram', 'fk pribram', '1 fk pribram'],
        boa: ['боа', 'boa'],
        chester: ['честер', 'chester', 'fc chester'],
        airbus: ['эйрбас', 'airbus'],
        northDistrict: ['норт дистрикт', 'north district']
    }
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
