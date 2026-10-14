// Dave 5.6 Etalon Data (issue #348)
// ============================================================
// Authoritative Dave 5.6 etalon tables for the «Подсказка» hint panel:
// defense-12 and buildup-12 situations, score-play scenarios and
// calibration constants. Pure data module — no logic, no DOM access.
//
// Provenance: transcribed 2026-10-14 from shared/slf-wiki-diagrams/
// defense-12.jpg and buildup-12.jpg (Dave 5.6 generator knowledge).
// The word order inside each situation line follows the canonical
// control order below; a slash pair ("Широкая / средняя") is ONE slot
// holding two candidate words. Preference inside a pair is resolved by
// the mapping layer (dave56-etalon-mapping.js): the conservative pick is
// the lower ordinal on the domain's defensive axis, the alternate is the
// aggressive pick.

(function dave56EtalonData() {
    'use strict';

    const DATA = {
        schema: 'slf_dave56_etalon_v1',
        title: 'Dave 5.6 etalon recommendation tables',
        // Canonical control order per block; etalon vectors are partial and
        // only ever cover these keys (pass_risk/dribble/cross/corner/shot are
        // NOT part of the etalon tables and are never applied).
        controlOrder: {
            defense: ['def_line', 'press_line', 'def_width', 'press_intense'],
            buildup: ['build_type', 'build_temp', 'build_long', 'build_fast', 'style']
        },

        provenance: {
            source: 'Dave 5.6 generator knowledge (etalon tables)',
            transcribedFrom: [
                'shared/slf-wiki-diagrams/defense-12.jpg',
                'shared/slf-wiki-diagrams/buildup-12.jpg'
            ],
            transcribedAt: '2026-10-14',
            controlDomainsVerifiedAt: '2026-10-14',
            controlDomainsVerifiedVia: 'live tactic radios (hard ordinals below)',
            provisional: true,
            provisionalNote: 'Calibration constants are provisional markers pending match evidence.'
        },

        // Hard ordinals (verified live 2026-10-14 via tactic radios).
        wordMap: {
            def_line: { 'низкая': 1, 'средняя': 2, 'высокая': 3 },
            press_line: { 'низкая': 1, 'низкий': 1, 'средняя': 2, 'средний': 2, 'высокая': 3, 'высокий': 3 },
            def_width: { 'узкая': 1, 'средняя': 2, 'широкая': 3 },
            press_intense: { 'мин': 1, 'низкая': 2, 'средняя': 3, 'высокая': 4, 'макс': 5 },
            build_type: { 'выносы': 1, 'смешанный': 2, 'позиционный': 3 },
            build_temp: { 'низкий': 1, 'средний': 2, 'высокий': 3 },
            build_long: { 'редко': 1, 'умеренно': 2, 'часто': 3 },
            build_fast: { 'редко': 1, 'умеренно': 2, 'часто': 3 },
            style: { 'защ+': 1, 'защита+': 1, 'защита': 2, 'обычный': 3, 'атака': 4, 'атака+': 5 }
        },

        // Inclusive ordinal domains for clamping (mirror of the native contract).
        domains: {
            def_line: [1, 3],
            press_line: [1, 3],
            def_width: [1, 3],
            press_intense: [1, 5],
            build_type: [1, 3],
            build_temp: [1, 3],
            build_long: [1, 3],
            build_fast: [1, 3],
            style: [1, 5]
        },

        // Priority lanes (checkboxes priority_l/c/r). Lane words that do not
        // resolve to one unambiguous checkbox set are omitted from the vector.
        laneWords: {
            'все направления': null,          // omit entirely (all lanes enabled)
            'фланги': ['left', 'right'],
            'фланг + центр': ['left', 'center', 'right'],
            'центр': ['center']
        },

        // Slash-pair lane words and non-lane words are ambiguous in v1.
        ambiguousLaneWords: ['по силе команд', 'фланги / фланг+центр', 'все направления / центр'],

        defense: {
            d1: { id: 'd1', label: 'Равный матч', words: { def_line: ['Средняя'], press_line: ['Средний'], def_width: ['Средняя'], press_intense: ['Средняя'] } },
            d2: { id: 'd2', label: 'Ты фаворит', words: { def_line: ['Высокая'], press_line: ['Высокий'], def_width: ['Широкая', 'средняя'], press_intense: ['Средняя', 'высокая'] } },
            d3: { id: 'd3', label: 'Ты андердог', words: { def_line: ['Низкая'], press_line: ['Низкий', 'средний'], def_width: ['Узкая'], press_intense: ['Низкая', 'средняя'] } },
            d4: { id: 'd4', label: 'Нужно отыграться', words: { def_line: ['Высокая'], press_line: ['Высокий'], def_width: ['Широкая'], press_intense: ['Высокая'] } },
            d5: { id: 'd5', label: 'Нужно удержать', words: { def_line: ['Низкая'], press_line: ['Низкий'], def_width: ['Узкая'], press_intense: ['Средняя', 'низкая'] } },
            d6: { id: 'd6', label: 'Высокий вектор обороны', words: { def_line: ['Высокая'], press_line: ['Средний', 'высокий'], def_width: ['Широкая'], press_intense: ['Средняя', 'высокая'] } },
            d7: { id: 'd7', label: 'Низкий вектор обороны', words: { def_line: ['Низкая'], press_line: ['Средний', 'низкий'], def_width: ['Узкая'], press_intense: ['Средняя', 'низкая'] } },
            d8: { id: 'd8', label: 'Высокий вектор прессинга', words: { def_line: ['Средняя', 'высокая'], press_line: ['Высокий'], def_width: ['Средняя'], press_intense: ['Средняя', 'высокая'] } },
            d9: { id: 'd9', label: 'Низкий вектор прессинга', words: { def_line: ['Средняя', 'низкая'], press_line: ['Низкий'], def_width: ['Средняя', 'узкая'], press_intense: ['Средняя', 'низкая'] } },
            d10: { id: 'd10', label: 'Соперник через фланги/кроссы', words: { def_line: ['Низкая', 'средняя'], press_line: ['Низкий'], def_width: ['Широкая'], press_intense: ['Средняя'] } },
            d11: { id: 'd11', label: 'Соперник через центр', words: { def_line: ['Высокая', 'средняя'], press_line: ['Высокий', 'средний'], def_width: ['Узкая'], press_intense: ['Средняя', 'высокая'] } },
            d12: { id: 'd12', label: 'Много фолов/ЖК', words: { def_line: ['Средняя', 'низкая'], press_line: ['Средний', 'низкий'], def_width: ['Средняя'], press_intense: ['Низкая'] } }
        },

        buildup: {
            b1: { id: 'b1', label: 'Равный матч', lanes: 'все направления', words: { build_type: ['Смешанный'], build_temp: ['Средний'], build_long: ['Умеренно'], build_fast: ['Умеренно'], style: ['Обычный'] } },
            b2: { id: 'b2', label: 'Ты фаворит', lanes: 'все направления', words: { build_type: ['Позиционный'], build_temp: ['Средний'], build_long: ['Умеренно'], build_fast: ['Умеренно', 'часто'], style: ['Обычный', 'атака'] } },
            b3: { id: 'b3', label: 'Ты андердог', lanes: 'фланги', words: { build_type: ['Смешанный'], build_temp: ['Средний'], build_long: ['Редко'], build_fast: ['Редко'], style: ['Защита', 'обычный'] } },
            b4: { id: 'b4', label: 'Нужно забить', lanes: 'фланг + центр', words: { build_type: ['Позиционный'], build_temp: ['Средний', 'высокий'], build_long: ['Умеренно'], build_fast: ['Умеренно', 'часто'], style: ['Атака', 'атака+'] } },
            b5: { id: 'b5', label: 'Нужно удержать', lanes: 'фланги', words: { build_type: ['Смешанный', 'выносы'], build_temp: ['Низкий', 'средний'], build_long: ['Редко'], build_fast: ['Редко', 'умеренно'], style: ['Защита', 'защита+'] } },
            b6: { id: 'b6', label: 'Соперник сильно прессингует', lanes: 'фланги', words: { build_type: ['Смешанный'], build_temp: ['Средний', 'высокий'], build_long: ['Редко'], build_fast: ['Редко'], style: ['По силе команд'] } },
            b7: { id: 'b7', label: 'Соперник почти не прессингует', lanes: 'все направления / центр', words: { build_type: ['Позиционный'], build_temp: ['Низкий', 'средний'], build_long: ['Умеренно', 'часто'], build_fast: ['Умеренно', 'часто'], style: ['Обычный', 'атака'] } },
            b8: { id: 'b8', label: 'Взлом автобуса', lanes: 'все направления', words: { build_type: ['Позиционный'], build_temp: ['Низкий', 'средний'], build_long: ['Умеренно', 'часто'], build_fast: ['Умеренно', 'часто'], style: ['Обычный', 'атака'] } },
            b9: { id: 'b9', label: 'Хаотичный матч', lanes: 'фланги', words: { build_type: ['Смешанный'], build_temp: ['Средний'], build_long: ['Редко'], build_fast: ['Редко'], style: ['Обычный'] } },
            b10: { id: 'b10', label: 'Игра через «столба»', lanes: 'фланги', words: { build_type: ['Выносы'], build_temp: ['Средний'], build_long: ['Редко'], build_fast: ['Редко'], style: ['Обычный', 'защита'] } },
            b11: { id: 'b11', label: 'Схема контроля', lanes: 'все направления', words: { build_type: ['Позиционный'], build_temp: ['Низкий'], build_long: ['Умеренно'], build_fast: ['Умеренно', 'часто'], style: ['Обычный'] } },
            b12: { id: 'b12', label: 'Самолёт/много атаки', lanes: 'фланги / фланг+центр', words: { build_type: ['Смешанный', 'выносы'], build_temp: ['Высокий'], build_long: ['Редко', 'умеренно'], build_fast: ['Редко'], style: ['Обычный', 'атака'] } }
        },

        // Score-play scenarios: deltas applied over the matched base
        // situations when the conditions hold. Deltas are numeric shifts
        // clamped to the domain of each control; override scenarios replace
        // the matched base situations with d5/b5.
        scenarios: {
            s1: {
                id: 's1', slug: 'lead10_equal', label: 'Ведём 1:0 при равных силах',
                requires: { scoreState: 'winning', diff: 1, strength: 'equal' },
                override: { defense: 'd5', buildup: 'b5' },
                notes: ['атаковать фланг, где соперник не играет']
            },
            s2: {
                id: 's2', slug: 'lead10_dominating', label: 'Ведём 1:0 и доминируем',
                requires: { scoreState: 'winning', diff: 1, anyTag: ['attacking_momentum', 'generator_attack_working'] },
                overrideMinute: 60,
                override: { defense: 'd5', buildup: 'b5' },
                notes: ['сначала 2-0 — потом сушка']
            },
            s3: {
                id: 's3', slug: 'playing_better_losing', label: 'Играем лучше, но проигрываем',
                requires: { scoreState: 'losing', diff: -1, tags: ['attacking_momentum'] },
                delta: { style: 1, build_temp: 1, build_long: 1, build_fast: 1, press_line: 1 },
                notes: ['атаковать его активный фланг']
            },
            s4: {
                id: 's4', slug: 'stronger_losing', label: 'Мы сильнее, но проигрываем',
                requires: { scoreState: 'losing', tags: ['strength_advantage_clear'] },
                override: { defense: 'd5', buildup: 'b5' },
                lateMinute: 80,
                lateDelta: { press_intense: 1 },
                lateNote: 'навал'
            },
            s5: {
                id: 's5', slug: 'stronger_00', label: '0:0 при явном преимуществе',
                requires: { scoreState: 'draw', tags: ['strength_advantage_clear'] },
                override: { defense: 'd5', buildup: 'b5' },
                notes: ['сушка']
            },
            s6: {
                id: 's6', slug: 'equal_low_01', label: 'Проигрываем 0:1 при низком xG',
                requires: { scoreState: 'losing', diff: -1, xgMax: 0.35 },
                forceBase: { defense: 'd1', buildup: 'b1' },
                delta: { style: 1 }
            }
        },

        // Calibration constants (PROVISIONAL markers — not yet tuned by
        // match evidence; they are shipped as data for future calibration
        // work and are not consulted by the v1 matcher except where noted).
        calibration: {
            intensityThresholds: [50, 45, 40, 35, 30],
            intensityStepPct: 5,
            aggressionPerPoint: 2,
            ycDefender: { threshold: 5, chance: -5 },
            foulsNormPerMatch: 5,
            foulRateReduceMin: 15,
            crossesWidthSignalPerMatch: 5,
            vectorCompassPct: 20,
            neighborOptionPhysicsPct: [15, 20],
            stylePressurePct: 2,
            styleDefenseAttackPct: 4,
            busPoints: { LD: 1, CD: 1, RD: 1, DM: 0.5, LB: 0.5, RB: 0.5 },
            busMin: 5,
            pressRatioFormula: 'опекуны = розыгрыш соперника − 1'
        }
    };

    if (typeof window !== 'undefined') {
        window.SLFDave56EtalonData = DATA;
    }
})();

// ============================================================
