import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Fixture-driven regression test for SLFAlterLayer stat-row parsing.
//
// Cell fixtures mirror the live alter.php markup observed on 2026-08-23
// (2026 redesign, issue #280) and the pre-redesign legacy layout. The values
// are data extracted from a user-supplied page sample; they carry no
// instructions and are used only as parser input.

const root = new URL('../', import.meta.url);
const source = path => fs.readFileSync(new URL(path, root), 'utf8');

const context = {
    console,
    CONFIG: {
        TRANSFER_ANALYZER: {
            slfAlter: { cacheTtlDays: 1, eligibleMinutesPct: 40 }
        }
    },
    buildSlfUrl: path => `https://slf.fm${path}`,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: async () => { throw new Error('network disabled in tests'); }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source('src/modules/transfer-analyzer/slf-alter-layer.js') + '\n;globalThis.SLFAlterLayer = SLFAlterLayer;', context, { filename: 'slf-alter-layer.js' });

const L = context.SLFAlterLayer;

const currentSeason = {
    label: 'Сезон 2026/2027',
    startYear: 2026,
    endYear: 2027,
    actualYear: 2027,
    seasonYear: 2027,
    isCurrent: true
};

// --- 2026 redesigned layout (leading column removed) -----------------------
const redesignedRow = [
    '4/182 [1] Czech Liga',   // league cell: VIP hint + level marker + flag + link
    'Slovan Liberec',         // team
    '5/5',                    // games played/possible
    '5',                      // starts
    '450′ 100%',              // minutes + percentage
    '0',                      // goals
    '0',                      // assists
    '',                       // status icon
    ''                        // view link
];

const parsed = L.parseStatCells(redesignedRow, currentSeason);

assert.ok(parsed, 'redesigned row must parse');
assert.equal(parsed.leagueLevel, 4, 'league level from VIP hint');
assert.equal(parsed.leagueSkill, 182, 'league skill from VIP hint');
assert.equal(parsed.teamText, 'Slovan Liberec');
assert.equal(parsed.gamesPlayed, 5);
assert.equal(parsed.gamesPossible, 5);
assert.equal(parsed.starts, 5);
assert.equal(parsed.minutes, 450, 'minutes must come from the minutes cell, not goals');
assert.equal(parsed.minutesPct, 100);
assert.equal(parsed.goals, 0);
assert.equal(parsed.isCurrentSeason, true);

// --- national-team row (no VIP hint in league cell) -------------------------
const nationRow = [
    'UEFA World Cup Qualifiers 2026',
    'Czechia',
    '0/10',
    '0',
    "0′ 0%",
    '0',
    '0',
    '',
    ''
];
const parsedNation = L.parseStatCells(nationRow, currentSeason);
assert.ok(parsedNation);
assert.equal(parsedNation.minutes, 0);
assert.equal(parsedNation.minutesPct, 0);
assert.equal(parsedNation.gamesPossible, 10);

// --- legacy layout fallback (leading column present) ------------------------
const legacyRow = [
    '',                       // leading icon column
    '4/182 [1] Czech Liga',
    'Slovan Liberec',
    '32/35',
    '32',
    '91% 2880′',              // legacy order: percentage first
    '0',
    '0'
];
const parsedLegacy = L.parseStatCells(legacyRow, currentSeason);
assert.ok(parsedLegacy, 'legacy row must parse via fallback');
assert.equal(parsedLegacy.teamText, 'Slovan Liberec');
assert.equal(parsedLegacy.gamesPlayed, 32);
assert.equal(parsedLegacy.gamesPossible, 35);
assert.equal(parsedLegacy.minutes, 2880, 'legacy percentage-first format still yields minutes');
assert.equal(parsedLegacy.minutesPct, 91);

// --- header row is skipped ---------------------------------------------------
const headerRow = ['Лига', 'Команда', 'Игр', 'Старт', 'Минут', '', '', 'Статус'];
assert.equal(L.parseStatCells(headerRow, currentSeason), null, 'header row must be skipped');

// --- parseMinutes robustness --------------------------------------------------
assert.equal(L.parseMinutes('450′ 100%').minutes, 450);
assert.equal(L.parseMinutes('100% 450′').minutes, 450);
assert.equal(L.parseMinutes("614′ 21%").minutes, 614);
assert.equal(L.parseMinutes('0').minutes, 0);
assert.equal(L.parseMinutes('').minutes, null);

console.log('[alter-layer-parsing] OK: redesigned layout, national rows, legacy fallback, header skip, minutes formats');
