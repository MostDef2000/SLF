// Dave 5.6 Etalon Mapping (issue #348)
// ============================================================
// Word→ordinal mapper over the dave56-etalon-data tables. Pure logic:
// no DOM, no engine calls. Exposes window.SLFDave56EtalonMapping with
// mapWords() (per-situation numeric partial vector + [preferred,
// alternate] resolution) and pickVector() (defense+buildup vectors,
// conservative pick policy, lane resolution, clamping, unknown flags).
//
// Conservative policy: the preferred element of a slash pair is the more
// conservative/middle/defensive word — the lower ordinal on the domain's
// defensive axis (e.g. Обычный/атака→Обычный, Средняя/высокая→Средняя,
// Низкий/средний→Низкий, Широкая/средняя→средняя). pickVector
// ({conservative:false}) resolves the aggressive alternate (max ordinal).

(function dave56EtalonMapping() {
    'use strict';

    const data = typeof window !== 'undefined' ? window.SLFDave56EtalonData : null;
    if (!data || data.schema !== 'slf_dave56_etalon_v1') return;

    const WORD_MAP = data.wordMap;
    const DOMAINS = data.domains;
    const CONTROL_ORDER = data.controlOrder;

    const clamp = (key, value) => {
        const domain = DOMAINS[key];
        if (!domain || !Number.isFinite(Number(value))) return null;
        return Math.min(domain[1], Math.max(domain[0], Math.round(Number(value))));
    };

    // Slash pair resolution: PREFERRED = conservative (min ordinal on the
    // defensive axis), alternate = aggressive (max ordinal). Unresolvable
    // words are skipped; a pair with no resolvable word yields null.
    function resolvePair(words, key, options = {}) {
        const conservative = options.conservative !== false;
        const ordinals = words
            .map(word => ({ word, ordinal: lookupWord(key, word) }))
            .filter(item => item.ordinal !== null && item.ordinal !== undefined)
            .sort((a, b) => a.ordinal - b.ordinal);
        if (!ordinals.length) return null;
        return { preferred: conservative ? ordinals[0].ordinal : ordinals[ordinals.length - 1].ordinal, alternateWords: words };
    }

    function lookupWord(key, word) {
        const map = WORD_MAP[key];
        if (!map) return null;
        const normalized = String(word || '').trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(map, normalized) ? map[normalized] : null;
    }

    // mapWords(situation, block, {conservative}) →
    //   { vector, resolved: {key: {preferred, alternateWords}}, unknownWords: [] }
    function mapWords(situation, block, options = {}) {
        const vector = {};
        const resolved = {};
        const unknownWords = [];
        if (!situation || !situation.words) return { vector, resolved, unknownWords };

        for (const key of CONTROL_ORDER[block] || []) {
            const words = situation.words[key];
            if (!Array.isArray(words) || !words.length) continue;

            let ordinal = null;
            if (words.length === 1) {
                ordinal = lookupWord(key, words[0]);
            } else {
                const pair = resolvePair(words, key, options);
                if (pair) {
                    ordinal = pair.preferred;
                    resolved[key] = pair;
                }
            }

            if (ordinal === null) {
                unknownWords.push(`${key}:${words.join('/')}`);
                continue; // unknown word → omitted from the vector + flagged
            }
            const clamped = clamp(key, ordinal);
            if (clamped === null) {
                unknownWords.push(`${key}:${words.join('/')}`);
                continue;
            }
            vector[key] = clamped;
        }

        return { vector, resolved, unknownWords };
    }

    // Lane resolution: unambiguous lane word → checkbox lanes array;
    // «все направления» → { defined: false } (omit entirely, all enabled);
    // anything else (slash pairs, «по силе команд») → null + ambiguous flag.
    function resolveLanes(lanesWord) {
        const normalized = String(lanesWord || '').trim().toLowerCase();
        if (!normalized) return { defined: false, lanes: null, ambiguous: false };
        if (Object.prototype.hasOwnProperty.call(data.laneWords, normalized)) {
            return { defined: data.laneWords[normalized] !== null, lanes: data.laneWords[normalized], ambiguous: false };
        }
        return { defined: false, lanes: null, ambiguous: true };
    }

    // pickVector(situationIds, {conservative}) →
    //   { defenseVector, buildupVector, mergedVector, priorityLanes,
    //     priorityDefined, unknownWords, labels }
    // situationIds: { defense: 'd5'|null, buildup: 'b5'|null }
    function pickVector(situationIds, options = {}) {
        const defenseSituation = situationIds?.defense ? data.defense[situationIds.defense] : null;
        const buildupSituation = situationIds?.buildup ? data.buildup[situationIds.buildup] : null;
        const defenseMapped = mapWords(defenseSituation, 'defense', options);
        const buildupMapped = mapWords(buildupSituation, 'buildup', options);

        const lanes = buildupSituation ? resolveLanes(buildupSituation.lanes) : { defined: false, lanes: null, ambiguous: false };

        return {
            defenseVector: defenseMapped.vector,
            buildupVector: buildupMapped.vector,
            mergedVector: Object.assign({}, defenseMapped.vector, buildupMapped.vector),
            priorityLanes: lanes.defined && Array.isArray(lanes.lanes) ? lanes.lanes.slice() : null,
            priorityDefined: lanes.defined,
            unknownWords: [...defenseMapped.unknownWords, ...buildupMapped.unknownWords],
            labels: {
                defense: defenseSituation ? `${defenseSituation.id} ${defenseSituation.label}` : null,
                buildup: buildupSituation ? `${buildupSituation.id} ${buildupSituation.label}` : null
            }
        };
    }

    const api = {
        schema: data.schema,
        WORD_MAP,
        DOMAINS,
        clamp,
        lookupWord,
        resolvePair,
        resolveLanes,
        mapWords,
        pickVector
    };

    if (typeof window !== 'undefined') {
        window.SLFDave56EtalonMapping = api;
    }
})();

// ============================================================
