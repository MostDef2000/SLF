#!/usr/bin/env node
// Weekly background form-training automation — VM unit/integration tests.
// ================================================================
// The module under test (src/modules/team-management/weekly-form-training.js)
// exposes exactly one entry, start(); every parser, ranking rule, guard and
// coordinator step is private. These tests therefore load the REAL module
// source into a Node vm realm with injected fake host capabilities
// (document, window, unsafeWindow-less page window, location, fetch,
// navigator.locks, localStorage, BroadcastChannel, DOMParser, Date via the
// realm intrinsic, timers, GM_getValue/GM_setValue, console).
//
// Oracle: observable behaviour only — the exact HTTP requests the coordinator
// issues against a scripted in-memory site, the persisted localStorage state
// envelope, and the bounded console.warn diagnostics. No production debug
// export is added; the test captures the closure's own {start} handle in the
// test realm (same pattern as test-preset-migration.mjs).
//
// No live slf.fm traffic. No production source is modified by this file.
//
// The mini-DOM below is the fake host's HTML parser + selector engine: the
// module's querySelectorAll/querySelector/DOMParser calls run against real
// markup strings, so the parsed fixtures (switcher, active-team markers,
// .fcpitch XI, tt-base table, form table ПОСЛЕ column, coach[] checkboxes,
// fm_md_* literals) are the single source of truth for every scenario.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = path.join(root, 'src/modules/team-management/weekly-form-training.js');
if (!fs.existsSync(MODULE_PATH)) {
    console.error(`test-weekly-form-training: module under test is MISSING: ${MODULE_PATH}`);
    process.exit(1);
}
const moduleSource = fs.readFileSync(MODULE_PATH, 'utf8');

const LOCK_NAME = 'slf:weekly-form-training:v1';
const STATE_KEY = 'slf_weekly_form_training_v1:6945';
const ACTIVITY_KEY = 'slf_weekly_form_activity_v1';
const USER_ID = '6945';
const SUBMIT_LABEL = 'сохранить дополнительные тренировки';
// Exact application/x-www-form-urlencoded rendering of SUBMIT_LABEL
// (URLSearchParams: space -> '+', non-ASCII -> UTF-8 percent escapes).
const ENCODED_LABEL = '%D1%81%D0%BE%D1%85%D1%80%D0%B0%D0%BD%D0%B8%D1%82%D1%8C+'
    + '%D0%B4%D0%BE%D0%BF%D0%BE%D0%BB%D0%BD%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5+'
    + '%D1%82%D1%80%D0%B5%D0%BD%D0%B8%D1%80%D0%BE%D0%B2%D0%BA%D0%B8';
const XI = ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
const POST_BODY_PREFIX = 'coach%5B%5D=';
// Exact captured gamelist endpoint contract (cache-buster stripped by the
// fake site handler before comparison).
const GAMELIST_URL = '/team4.php?action=playerstats&team_id=&season=0&gamelist&gametype%5B%5D=3';

// ---------------------------------------------------------------------------
// Mini-DOM: tiny HTML parser + selector engine (fake host capability).
// Supports exactly the selector grammar and element surface the module uses.
// ---------------------------------------------------------------------------
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);

function parseAttributeList(raw) {
    const attrs = [];
    const re = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = re.exec(raw))) {
        attrs.push({ name: match[1].toLowerCase(), value: match[3] ?? match[4] ?? match[5] ?? '' });
    }
    return attrs;
}

class MiniText {
    constructor(value) {
        this.nodeType = 3;
        this.value = String(value);
        this.parentNode = null;
    }
    get textContent() { return this.value; }
}

function classListOf(element) {
    const raw = element.getAttribute('class');
    return raw ? String(raw).split(/\s+/).filter(Boolean) : [];
}

function serializeNode(node) {
    if (node.nodeType === 3) return node.value;
    const attrs = node._attrs.map(attr => ` ${attr.name}="${attr.value}"`).join('');
    const inner = node.childNodes.map(serializeNode).join('');
    if (VOID_TAGS.has(node.localName)) return `<${node.localName}${attrs}>`;
    return `<${node.localName}${attrs}>${inner}</${node.localName}>`;
}

class MiniElement {
    constructor(localName, attrs) {
        this.nodeType = 1;
        this.localName = localName;
        this.tagName = localName.toUpperCase();
        this._attrs = attrs || [];
        this.childNodes = [];
        this.parentNode = null;
    }
    appendChild(node) {
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    getAttribute(name) {
        const key = String(name).toLowerCase();
        for (const attr of this._attrs) if (attr.name === key) return attr.value;
        return null;
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    get classList() {
        const names = classListOf(this);
        return { contains: name => names.includes(name) };
    }
    get className() { return this.getAttribute('class') || ''; }
    get dataset() {
        const out = {};
        for (const attr of this._attrs) {
            if (attr.name.startsWith('data-')) {
                out[attr.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr.value;
            }
        }
        return out;
    }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
    get value() {
        const value = this.getAttribute('value');
        return value === null ? '' : value;
    }
    get checked() { return this.hasAttribute('checked'); }
    get disabled() { return this.hasAttribute('disabled'); }
    get type() {
        const type = this.getAttribute('type');
        return type === null ? '' : type;
    }
    get cellIndex() {
        const siblings = this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode.children : [];
        return siblings.indexOf(this);
    }
    get outerHTML() { return serializeNode(this); }
    querySelectorAll(selector) { return selectFrom(this, selector); }
    querySelector(selector) { return selectFrom(this, selector)[0] || null; }
}

class MiniDocument {
    constructor() {
        this.nodeType = 9;
        this.childNodes = [];
        this.parentNode = null;
        this.readyState = 'complete';
        this.hidden = false;
        this.activeElement = null;
        this._listeners = new Map();
    }
    appendChild(node) {
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get documentElement() {
        return this.children.find(el => el.localName === 'html') || this.children[0] || null;
    }
    get body() { return this.getElementsByTagName('body')[0] || null; }
    get scripts() { return this.getElementsByTagName('script'); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
    getElementsByTagName(name) {
        const out = [];
        const walk = node => {
            for (const child of node.childNodes || []) {
                if (child.nodeType !== 1) continue;
                if (child.localName === name) out.push(child);
                walk(child);
            }
        };
        walk(this);
        return out;
    }
    querySelectorAll(selector) { return selectFrom(this, selector); }
    querySelector(selector) { return selectFrom(this, selector)[0] || null; }
    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(listener);
    }
    removeEventListener(type, listener) {
        const list = this._listeners.get(type) || [];
        const index = list.indexOf(listener);
        if (index >= 0) list.splice(index, 1);
    }
    dispatch(type, event) {
        for (const listener of [...(this._listeners.get(type) || [])]) listener(event);
    }
}

function parseCompound(source) {
    const compound = { tag: null, ids: [], classes: [], attrs: [], checked: false };
    let i = 0;
    const tagMatch = /^[a-zA-Z][\w-]*/.exec(source);
    if (tagMatch) {
        compound.tag = tagMatch[0].toLowerCase();
        i = tagMatch[0].length;
    }
    while (i < source.length) {
        const char = source[i];
        if (char === '#') {
            const m = /^[\w-]+/.exec(source.slice(i + 1));
            if (!m) throw new Error(`bad id selector: ${source}`);
            compound.ids.push(m[0]);
            i += 1 + m[0].length;
        } else if (char === '.') {
            const m = /^[\w-]+/.exec(source.slice(i + 1));
            if (!m) throw new Error(`bad class selector: ${source}`);
            compound.classes.push(m[0]);
            i += 1 + m[0].length;
        } else if (char === '[') {
            let j = i + 1;
            let quote = '';
            while (j < source.length) {
                const ch = source[j];
                if (quote) {
                    if (ch === quote) quote = '';
                } else if (ch === '"' || ch === "'") {
                    quote = ch;
                } else if (ch === ']') {
                    break;
                }
                j++;
            }
            const inner = source.slice(i + 1, j);
            const m = /^\s*([\w-]+)\s*(?:([*^$|~]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*$/.exec(inner);
            if (!m) throw new Error(`bad attribute selector: ${source}`);
            compound.attrs.push({ name: m[1].toLowerCase(), op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null });
            i = j + 1;
        } else if (char === ':') {
            if (source.startsWith(':checked', i)) {
                compound.checked = true;
                i += 8;
            } else {
                throw new Error(`unsupported pseudo-selector: ${source}`);
            }
        } else {
            throw new Error(`unsupported selector: ${source}`);
        }
    }
    return compound;
}

function parseComplexSelector(selector) {
    const steps = [];
    let i = 0;
    let pendingCombinator = null;
    while (i < selector.length) {
        const char = selector[i];
        if (char === ' ') {
            if (steps.length && !pendingCombinator) pendingCombinator = 'descendant';
            i++;
            continue;
        }
        if (char === '>') {
            pendingCombinator = 'child';
            i++;
            continue;
        }
        const start = i;
        let depth = 0;
        let quote = '';
        while (i < selector.length) {
            const ch = selector[i];
            if (quote) {
                if (ch === quote) quote = '';
                i++;
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                i++;
                continue;
            }
            if (ch === '[') depth++;
            else if (ch === ']') depth--;
            else if (depth === 0 && (ch === ' ' || ch === '>')) break;
            i++;
        }
        steps.push({
            combinator: steps.length ? (pendingCombinator || 'descendant') : null,
            compound: parseCompound(selector.slice(start, i))
        });
        pendingCombinator = null;
    }
    if (!steps.length) throw new Error(`empty selector: ${selector}`);
    return steps;
}

function matchCompound(element, compound) {
    if (element.nodeType !== 1) return false;
    if (compound.tag && element.localName !== compound.tag) return false;
    for (const id of compound.ids) if (element.getAttribute('id') !== id) return false;
    if (compound.classes.length) {
        const names = classListOf(element);
        for (const cls of compound.classes) if (!names.includes(cls)) return false;
    }
    for (const attr of compound.attrs) {
        const actual = element.getAttribute(attr.name);
        if (actual === null) return false;
        if (attr.op === '=' && actual !== attr.value) return false;
        if (attr.op === '*=' && !actual.includes(attr.value)) return false;
        if (attr.op === '^=' && !actual.startsWith(attr.value)) return false;
        if (attr.op === '$=' && !actual.endsWith(attr.value)) return false;
        if (attr.op === '~=' && !actual.split(/\s+/).includes(attr.value)) return false;
        if (attr.op === '|=' && actual !== attr.value && !actual.startsWith(`${attr.value}-`)) return false;
    }
    if (compound.checked && !element.checked) return false;
    return true;
}

function matchChain(element, steps) {
    let index = steps.length - 1;
    if (!matchCompound(element, steps[index].compound)) return false;
    let current = element;
    while (index > 0) {
        index--;
        const step = steps[index];
        if (step.combinator === 'child') {
            current = current.parentNode;
            if (!current || current.nodeType !== 1 || !matchCompound(current, step.compound)) return false;
        } else {
            let ancestor = current.parentNode;
            while (ancestor && (ancestor.nodeType !== 1 || !matchCompound(ancestor, step.compound))) {
                ancestor = ancestor.parentNode;
            }
            if (!ancestor) return false;
            current = ancestor;
        }
    }
    return true;
}

function selectFrom(rootNode, selector) {
    const selectors = String(selector).split(',').map(part => parseComplexSelector(part.trim()));
    const out = [];
    const walk = node => {
        for (const child of node.childNodes || []) {
            if (child.nodeType !== 1) continue;
            if (selectors.some(steps => matchChain(child, steps))) out.push(child);
            walk(child);
        }
    };
    walk(rootNode);
    return out;
}

function parseHtml(html) {
    const doc = new MiniDocument();
    const stack = [doc];
    const source = String(html);
    let i = 0;
    const pushText = text => {
        if (text) stack[stack.length - 1].appendChild(new MiniText(text));
    };
    while (i < source.length) {
        const lt = source.indexOf('<', i);
        if (lt < 0) {
            pushText(source.slice(i));
            break;
        }
        pushText(source.slice(i, lt));
        if (source.startsWith('<!--', lt)) {
            const end = source.indexOf('-->', lt + 4);
            i = end < 0 ? source.length : end + 3;
            continue;
        }
        if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
            const end = source.indexOf('>', lt);
            i = end < 0 ? source.length : end + 1;
            continue;
        }
        if (source.startsWith('</', lt)) {
            const end = source.indexOf('>', lt);
            const name = source.slice(lt + 2, end < 0 ? source.length : end).trim().toLowerCase();
            for (let k = stack.length - 1; k > 0; k--) {
                if (stack[k].localName === name) {
                    stack.length = k;
                    break;
                }
            }
            i = end < 0 ? source.length : end + 1;
            continue;
        }
        const openMatch = /^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(source.slice(lt));
        if (!openMatch) {
            pushText('<');
            i = lt + 1;
            continue;
        }
        const localName = openMatch[1].toLowerCase();
        let attrRaw = openMatch[2];
        const selfClosed = attrRaw.trim().endsWith('/');
        if (selfClosed) attrRaw = attrRaw.trim().slice(0, -1);
        const element = new MiniElement(localName, parseAttributeList(attrRaw));
        stack[stack.length - 1].appendChild(element);
        const tagEnd = lt + openMatch[0].length;
        if (RAW_TEXT_TAGS.has(localName) && !selfClosed) {
            const closeIdx = source.toLowerCase().indexOf(`</${localName}`, tagEnd);
            const textEnd = closeIdx < 0 ? source.length : closeIdx;
            if (textEnd > tagEnd) element.appendChild(new MiniText(source.slice(tagEnd, textEnd)));
            const closeEnd = closeIdx < 0 ? source.length : source.indexOf('>', closeIdx);
            i = closeEnd < 0 ? source.length : closeEnd + 1;
            continue;
        }
        if (!VOID_TAGS.has(localName) && !selfClosed) stack.push(element);
        i = tagEnd;
    }
    return doc;
}

// ---------------------------------------------------------------------------
// Scripted in-memory site (the fetch seam).
// ---------------------------------------------------------------------------
const DEFAULT_PAGE_HTML = `<!doctype html>
<html lang="ru" data-slf-design="fm2026">
<head><meta charset="utf-8"><title>SLF</title>
<script>let foot_login_id = ${USER_ID};</script>
</head>
<body class="dark-theme">
<div class="fm-stage"><div class="content-ui__wrapper">
<div id="globalcontent" class="game-ui__background user-custom__team-18280">
<a class="fmc-navclub" href="/roster.php?id=18280">Клуб 18280</a>
</div></div></div>
</body>
</html>`;

function defaultClub(overrides = {}) {
    return Object.assign({
        xi: XI.slice(),
        form: {
            '101': '9', '102': '8', '103': '7', '104': '6', '105': '5', '106': '4',
            '107': '3', '108': '2', '109': '1', '110': '0,5', '111': '0', '199': '99'
        },
        ttd: {
            '101': 50, '102': 40, '103': 30, '104': 20, '105': 10, '106': 9,
            '107': 8, '108': 7, '109': 6, '110': 5, '111': 4, '199': 9999
        },
        level: 2,
        capacity: 3,
        levelUnknown: false,
        expiry: '01/01/2020',
        checked: [],
        extendOnPost: true,
        applyPost: true,
        extraFormTable: ''
    }, overrides);
}

function matchdayLiteral(matchday) {
    const day = value => {
        if (value === null || value === undefined) return 'null';
        return `{final:${Number(value.final)}, online:${Number(value.online)}, unix:${Number(value.unix)}}`;
    };
    return `var fm_md_today = ${day(matchday.today)}; var fm_md_next = ${day(matchday.next)};`;
}

function pageHead(site) {
    const identity = site.identity === null ? '' : `<script>let foot_login_id = ${site.identity};</script>`;
    return `<meta charset="utf-8"><title>SLF</title>${identity}<script>${matchdayLiteral(site.matchday)}</script>`;
}

function lineupHtml(site) {
    const current = site.current;
    const club = site.clubOf(current);
    const tabs = site.clubs.map(id =>
        `<div data-team="${id}" onclick="setgo(this, ${id}, 0, 0)"${id === current ? ' class="b"' : ''}>Клуб ${id}</div>`
    ).join('');
    const pitch = club.xi.map(pid => `<a href="/player.php?action=view&id=${pid}">Игрок ${pid}</a>`).join('');
    const navHref = site.navOverride ? `/roster.php?id=${site.navOverride}` : `/roster.php?id=${current}`;
    return `<!doctype html>
<html lang="ru" data-slf-design="fm2026">
<head>${pageHead(site)}</head>
<body class="dark-theme">
<div class="fm-stage">
<div class="fmc-tabs-host"><div class="lt3 fmc-tabs">${tabs}<div class="team-add" onclick="buycell(8)">+</div></div></div>
<div id="globalcontent" class="game-ui__background user-custom__team-${current}">
<a class="fmc-navclub" href="${navHref}">Клуб ${current}</a>
<div class="fcpitch">${pitch}</div>
</div>
</div>
</body>
</html>`;
}

function formHtml(site) {
    const club = site.clubOf(site.current);
    const rows = Object.entries(club.form).map(([pid, value]) =>
        `<tr><td><a href="/player.php?action=view&id=${pid}">Игрок ${pid}</a></td><td>${value}</td></tr>`
    ).join('');
    const checks = club.xi.map(pid =>
        `<input type="checkbox" class="coachd" name="coach[]" value="${pid}"${club.checked.includes(pid) ? ' checked' : ''}>`
    ).join('');
    return `<!doctype html>
<html lang="ru" data-slf-design="fm2026">
<head>${pageHead(site)}</head>
<body class="dark-theme">
<div id="globalcontent" class="game-ui__background user-custom__team-${site.current}">
<a class="fmc-navclub" href="/roster.php?id=${site.current}">Клуб ${site.current}</a>
<form id="player_form">
<div class="need_base" data-base="1">для поддержания дополнительных тренировок необходим 2 уровень базы</div>
<div id="coach_set"><span class="coach_expire">ваш выбор сохранён до ${club.expiry}</span>
<input type="submit" name="coach_set" value="${site.submitLabel}"></div>
<table>
<tr><th>Игрок</th><th>ПОСЛЕ</th></tr>
${rows}
</table>
${club.extraFormTable || ''}
${checks}
</form>
</div>
</body>
</html>`;
}

function trainHtml(site) {
    const club = site.clubOf(site.current);
    if (club.levelUnknown) {
        return `<!doctype html>
<html lang="ru" data-slf-design="fm2026">
<head>${pageHead(site)}</head>
<body class="dark-theme">
<table class="tt-base">
<tr><th>Параметр</th><th>Уровень 1</th></tr>
<tr><td>Тренировки формы игроков</td><td>1</td></tr>
</table>
</body>
</html>`;
    }
    return `<!doctype html>
<html lang="ru" data-slf-design="fm2026">
<head>${pageHead(site)}</head>
<body class="dark-theme">
<table class="tt-base">
<tr><th>Параметр</th><th class="is-current">Уровень ${club.level}</th><th>Уровень 1</th></tr>
<tr><td>Тренировки формы игроков</td><td>${club.capacity}</td><td>1</td></tr>
</table>
</body>
</html>`;
}

function gamestatPayload(site) {
    const club = site.clubOf(site.current);
    const rows = [];
    for (const [pid, ttd] of Object.entries(club.ttd)) {
        if (site.omitTtdPids && site.omitTtdPids.includes(pid)) continue;
        const row = new Array(68).fill(0);
        row[0] = pid;
        row[63] = ttd;
        rows.push(row);
    }
    if (site.duplicateTtdPid) {
        const row = new Array(68).fill(0);
        row[0] = site.duplicateTtdPid;
        row[63] = club.ttd[site.duplicateTtdPid];
        rows.push(row);
    }
    // Structurally invalid rows (wrong length / bad PID) for players outside
    // the top five: they must be skipped by the module, never abort the fetch.
    for (const spec of site.invalidTtdRows || []) {
        const row = new Array(spec.length || 68).fill(0);
        row[0] = spec.pid;
        if (row.length > 63) row[63] = spec.ttd == null ? 0 : spec.ttd;
        rows.push(row);
    }
    return { stat: rows, summary: [], show: 1 };
}

function makeSite(config = {}) {
    const site = Object.assign({
        identity: USER_ID,
        serverNow: Math.floor(Date.now() / 1000) * 1000,
        home: '18280',
        clubs: ['18280', '20001'],
        clubData: {},
        matchday: { today: null, next: { final: 0, online: 0, unix: 1999999999 } },
        submitLabel: SUBMIT_LABEL,
        gamelistHtml: '<html><body><input name="gamechoice[]" value="9001"></body></html>',
        gamelistJson: null,
        failGoto: null,
        failLineupFor: null,
        failPostForm: false,
        navOverride: null,
        omitTtdPids: null,
        duplicateTtdPid: null,
        invalidTtdRows: null,
        onRequest: null,
        corruptPersistKeys: null,
        // Contract violations recorded by the fake site (goto header/todo,
        // exact gamelist URL). Scenarios assert this array directly.
        contractViolations: []
    }, config);
    if (config.current === undefined) site.current = site.home;
    site.gotoCounts = new Map();
    site.clubs.forEach(id => {
        if (!site.clubData[id]) site.clubData[id] = defaultClub();
    });
    site.clubOf = id => site.clubData[id] || defaultClub();

    const dateHeader = () => new Date(site.serverNow).toUTCString();
    const respond = body => ({
        ok: true,
        status: 200,
        headers: { get: name => (String(name).toLowerCase() === 'date' ? dateHeader() : null) },
        text: () => Promise.resolve(body)
    });
    const fail = status => ({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => (String(name).toLowerCase() === 'date' ? dateHeader() : null) },
        text: () => Promise.resolve('')
    });
    const transport = message => {
        throw new Error(message);
    };

    site.handle = entry => {
        if (typeof site.onRequest === 'function') site.onRequest(entry, site);
        const url = new URL(entry.url, 'https://slf.fm');
        const pathname = url.pathname;
        const query = url.searchParams;

        if (pathname === '/ajax/userset.php' && query.get('action') === 'goto') {
            // Captured goto contract: same-origin XHR header + todo flag.
            if (!entry.headers || entry.headers['X-Requested-With'] !== 'XMLHttpRequest') {
                site.contractViolations.push(`goto-header:${entry.url}`);
            }
            if (query.get('todo') !== '0') {
                site.contractViolations.push(`goto-todo:${entry.url}`);
            }
            const id = query.get('idteam') || '';
            const call = (site.gotoCounts.get(id) || 0) + 1;
            site.gotoCounts.set(id, call);
            if (site.failGoto && site.failGoto.id === id && call >= (site.failGoto.failOnCall || 1)) {
                return fail(500);
            }
            if (/^\d+$/.test(id) && id !== '0') site.current = id;
            return respond(JSON.stringify({ result: 'ok' }));
        }
        if (pathname === '/team4.php' && query.get('action') === 'lineup') {
            if (Array.isArray(site.failLineupFor) && site.failLineupFor.includes(site.current)) {
                transport('simulated lineup transport failure');
            }
            return respond(lineupHtml(site));
        }
        if (pathname === '/train.php' && query.get('action') === 'team') {
            return respond(trainHtml(site));
        }
        if (pathname === '/team4.php' && query.get('action') === 'form') {
            if (entry.method === 'POST') {
                const club = site.clubOf(site.current);
                const posted = new URLSearchParams(entry.body).getAll('coach[]');
                if (club.applyPost !== false) club.checked = posted;
                if (club.extendOnPost !== false) club.expiry = '01/01/2099';
                return respond('<html><body>ok</body></html>');
            }
            return respond(formHtml(site));
        }
        if (pathname === '/team4.php' && query.get('action') === 'playerstats') {
            if (entry.method === 'POST' && query.has('gamestat')) {
                return respond(JSON.stringify(gamestatPayload(site)));
            }
            if (entry.method === 'GET' && query.has('gamelist')) {
                const stripped = entry.url.replace(/&_=\d+$/, '');
                if (stripped !== GAMELIST_URL) {
                    site.contractViolations.push(`gamelist-url:${entry.url}`);
                }
                if (site.gamelistJson) return respond(JSON.stringify(site.gamelistJson));
                return respond(site.gamelistHtml);
            }
            if (entry.method === 'GET') {
                return respond('<html><body>playerstats</body></html>');
            }
            return fail(404);
        }
        return fail(404);
    };
    return site;
}

const singleClubSite = (overrides = {}) => makeSite(Object.assign({
    clubs: ['18280'],
    home: '18280'
}, overrides));

// ---------------------------------------------------------------------------
// Fake host environment + sandbox factory.
// ---------------------------------------------------------------------------
function makeShared() {
    const shared = {
        storage: new Map(),
        gm: new Map(),
        channels: new Map(),
        held: new Set(),
        lockLog: []
    };
    shared.locks = {
        request(name, options, callback) {
            shared.lockLog.push({
                name,
                mode: options && options.mode,
                ifAvailable: !!(options && options.ifAvailable)
            });
            if (shared.held.has(name)) return Promise.resolve(callback(null));
            shared.held.add(name);
            let result;
            try {
                result = Promise.resolve(callback({ name, mode: (options || {}).mode }));
            } catch (error) {
                shared.held.delete(name);
                return Promise.reject(error);
            }
            return result.then(
                value => {
                    shared.held.delete(name);
                    return value;
                },
                error => {
                    shared.held.delete(name);
                    throw error;
                }
            );
        }
    };
    return shared;
}

function channelClassFor(shared) {
    return class FakeBroadcastChannel {
        constructor(name) {
            this.name = name;
            this.onmessage = null;
            if (!shared.channels.has(name)) shared.channels.set(name, new Set());
            shared.channels.get(name).add(this);
        }
        postMessage(data) {
            for (const channel of shared.channels.get(this.name) || []) {
                if (channel !== this && typeof channel.onmessage === 'function') {
                    channel.onmessage({ data });
                }
            }
        }
        close() {
            shared.channels.get(this.name)?.delete(this);
        }
    };
}

function createSandbox({ site, shared = makeShared(), pageHtml = DEFAULT_PAGE_HTML, pageLocation = null, frame = false } = {}) {
    const warns = [];
    const fetchLog = [];
    const timers = [];
    let timerSeq = 0;
    const clock = { now: Date.now() };
    class SandboxDate extends Date {
        constructor(...args) {
            if (args.length === 0) super(clock.now);
            else super(...args);
        }
        static now() { return clock.now; }
    }

    const win = {
        listeners: new Map(),
        addEventListener(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(listener);
        },
        removeEventListener(type, listener) {
            const list = this.listeners.get(type) || [];
            const index = list.indexOf(listener);
            if (index >= 0) list.splice(index, 1);
        },
        dispatch(type, event) {
            for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
        }
    };
    win.top = frame ? {} : win;
    win.self = win;

    const document = parseHtml(pageHtml);
    document.readyState = 'complete';
    document.hidden = false;
    document.activeElement = document.body;

    const context = {
        console: {
            warn: (...args) => warns.push(args.map(value => String(value)).join(' ')),
            log() {},
            info() {},
            error() {}
        },
        window: win,
        document,
        location: pageLocation || { origin: 'https://slf.fm', pathname: '/team4.php', href: 'https://slf.fm/team4.php' },
        navigator: { locks: shared.locks },
        localStorage: {
            getItem: key => (shared.storage.has(key) ? shared.storage.get(key) : null),
            setItem: (key, value) => {
                if (site.corruptPersistKeys && site.corruptPersistKeys.has(key)) return;
                shared.storage.set(key, String(value));
            },
            removeItem: key => shared.storage.delete(key)
        },
        GM_getValue: (key, fallback) => (shared.gm.has(key) ? shared.gm.get(key) : fallback),
        GM_setValue: (key, value) => {
            shared.gm.set(key, value);
        },
        BroadcastChannel: channelClassFor(shared),
        Date: SandboxDate,
        DOMParser: class FakeDOMParser {
            parseFromString(text) {
                return parseHtml(String(text));
            }
        },
        URLSearchParams,
        fetch: (url, options = {}) => {
            const entry = {
                method: String((options && options.method) || 'GET').toUpperCase(),
                url: String(url),
                body: options && options.body != null ? String(options.body) : '',
                headers: (options && options.headers) || {}
            };
            fetchLog.push(entry);
            if (site.failPostForm && entry.method === 'POST' && entry.url.includes('action=form')) {
                return Promise.reject(new Error('simulated lost POST response'));
            }
            let response;
            try {
                response = site.handle(entry);
            } catch (error) {
                return Promise.reject(error);
            }
            return Promise.resolve(response);
        },
        setTimeout: (fn, ms) => {
            timerSeq += 1;
            timers.push({ id: timerSeq, fn, ms: Number(ms) || 0, cleared: false });
            return timerSeq;
        },
        clearTimeout: id => {
            const timer = timers.find(entry => entry.id === id);
            if (timer) timer.cleared = true;
        },
        setInterval: () => 0,
        clearInterval: () => {}
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(`${moduleSource}\n;globalThis.__WFT = SLFWeeklyFormTraining;`, context, {
        filename: 'weekly-form-training.js'
    });

    return {
        shared,
        site,
        clock,
        warns,
        fetchLog,
        timers,
        context,
        window: win,
        document,
        async settle() {
            let lastLength = -1;
            for (let round = 0; round < 300; round++) {
                const due = timers.splice(0, timers.length);
                for (const timer of due) if (!timer.cleared) timer.fn();
                await new Promise(resolve => setImmediate(resolve));
                if (timers.length === 0 && fetchLog.length === lastLength) return;
                lastLength = fetchLog.length;
            }
            throw new Error('sandbox did not quiesce');
        },
        start() {
            context.__WFT.start();
        },
        wake() {
            win.dispatch('focus', { isTrusted: true });
        },
        fireActivity(type = 'pointerdown') {
            win.dispatch(type, { isTrusted: true });
        }
    };
}

async function runCycle(sandbox) {
    sandbox.start();
    await sandbox.settle();
}

async function wakeCycle(sandbox) {
    sandbox.wake();
    await sandbox.settle();
}

// ---------------------------------------------------------------------------
// Observation helpers.
// ---------------------------------------------------------------------------
const gotosOf = log => log.filter(entry => entry.url.includes('/ajax/userset.php'));
const formPostsOf = log => log.filter(entry => entry.method === 'POST' && entry.url.includes('action=form'));
const lineupGetsOf = log => log.filter(entry => entry.method === 'GET' && entry.url.includes('action=lineup'));
const formGetsOf = log => log.filter(entry => entry.method === 'GET' && entry.url.includes('action=form'));
const gotoId = entry => new URL(entry.url, 'https://slf.fm').searchParams.get('idteam');

const readState = shared => {
    const raw = shared.storage.get(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
};

const seedState = (shared, overrides = {}) => {
    shared.storage.set(STATE_KEY, JSON.stringify({
        v: 1,
        userId: USER_ID,
        startedAt: 0,
        lastCompletedAt: 0,
        retryAfter: 0,
        restorePending: false,
        phase: 'idle',
        homeTeamId: '',
        clubs: {},
        ...overrides
    }));
};

const expectedBody = pids =>
    `${pids.map(pid => `${POST_BODY_PREFIX}${pid}`).join('&')}&coach_set=${ENCODED_LABEL}`;

const assertClean = sandbox => {
    const noisy = sandbox.warns.filter(line => /coordinator-failed|start-failed|storage/.test(line));
    assert.deepEqual(noisy, [], `unexpected diagnostics: ${sandbox.warns.join(' | ')}`);
};

const assertNoWrites = sandbox => {
    assert.deepEqual(gotosOf(sandbox.fetchLog), [], 'no team switch may be issued');
    assert.deepEqual(formPostsOf(sandbox.fetchLog), [], 'no training POST may be issued');
};

// Club-level fail-closed cases still switch TO the club (that is how its
// pages are read); the approved contract for incomplete data is zero saves.
const assertNoPosts = sandbox => {
    assert.deepEqual(formPostsOf(sandbox.fetchLog), [], 'no training POST may be issued');
};

// Controllable clock: the module's Date capability is injected, so tests can
// move local + server time forward between wakes (retry windows, cadence).
const advance = (sandbox, ms) => {
    sandbox.clock.now += ms;
    sandbox.site.serverNow += ms;
};

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---- 1. Ranking ------------------------------------------------------------

test('ranking: top five by form then top three by ТТД posts the exact trio', async () => {
    const site = singleClubSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'exactly one training POST');
    assert.equal(posts[0].url, '/team4.php?action=form&date=1');
    assert.equal(posts[0].headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    assert.equal(
        posts[0].body,
        'coach%5B%5D=101&coach%5B%5D=102&coach%5B%5D=103'
            + `&coach_set=${ENCODED_LABEL}`,
        'exact urlencoded body: three coach[] values (form-top-5 -> ТТД-top-3) + observed submit label'
    );

    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
    assert.equal(state.phase, 'complete');
    assert.equal(state.lastCompletedAt, site.serverNow, 'completion stamped from the server clock');
});

test('ranking: sixth player by form is never promoted (fifth-form tie broken by ascending PID)', async () => {
    // 105 and 106 tie on form for the last top-five slot; 106 carries the
    // highest ТТД of all. Ascending-PID tie-break keeps 105, so 106 must
    // never reach the trio — a tie-break regression flips the POST body.
    const site = singleClubSite({
        clubData: {
            '18280': defaultClub({
                form: {
                    '101': '10', '102': '9', '103': '8', '104': '7', '105': '6', '106': '6',
                    '107': '5', '108': '4', '109': '3', '110': '2', '111': '1', '199': '99'
                },
                ttd: {
                    '101': 50, '102': 40, '103': 30, '104': 10, '105': 0, '106': 999,
                    '107': 5, '108': 4, '109': 3, '110': 2, '111': 1, '199': 9999
                }
            })
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'one POST');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']),
        'the tied 106 (highest ТТД) must stay out of the top five and out of the trio');
    assert.ok(!posts[0].body.includes('106'), posts[0].body);
});

test('ranking: third-ТТД tie inside the top five is broken by form then PID', async () => {
    // 103/104/105 all carry ТТД 30; within the five, 104 has the highest
    // form of the tied trio and must take the third coach slot (a PID-only
    // tie-break would wrongly pick 103).
    const site = singleClubSite({
        clubData: {
            '18280': defaultClub({
                form: {
                    '101': '10', '102': '9', '103': '5', '104': '8', '105': '7',
                    '106': '4', '107': '3', '108': '2', '109': '1', '110': '0,5', '111': '0', '199': '99'
                },
                ttd: {
                    '101': 50, '102': 40, '103': 30, '104': 30, '105': 30,
                    '106': 9, '107': 8, '108': 7, '109': 6, '110': 5, '111': 4, '199': 9999
                }
            })
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'one POST');
    assert.equal(posts[0].body, expectedBody(['101', '102', '104']),
        'form-then-PID tie-break must award the third slot to 104');
});

test('ranking: reserve outside the XI with the best form and ТТД is never selected', async () => {
    // Player 199 sits in the form table and in the gamestat rows with form
    // 99 and ТТД 9999 but is NOT in the 11 .fcpitch links: no sixth-form
    // / substitute promotion.
    const site = singleClubSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'one POST');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']),
        'the reserve (form 99, ТТД 9999) must never enter the trio');
    assert.ok(!posts[0].body.includes('199'), posts[0].body);
});

test('ranking: a legitimate zero ТТД inside the top five still posts', async () => {
    const site = singleClubSite({
        clubData: {
            '18280': defaultClub({
                ttd: {
                    '101': 50, '102': 40, '103': 30, '104': 0, '105': 0,
                    '106': 9, '107': 8, '108': 7, '109': 6, '110': 5, '111': 4, '199': 9999
                }
            })
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'zero is a valid non-negative integer ТТД — the run must not fail closed');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']));
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
});

test('ranking: missing ТТД row for a top-five starter posts nothing', async () => {
    const site = singleClubSite({ omitTtdPids: ['103'] });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoPosts(sandbox);
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'blocked');
    assert.equal(state.clubs['18280'].reason, 'ttd-missing-or-duplicate',
        'missing ТТД for a starter inside the top five must fail closed');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

test('ranking: duplicate ТТД PID for a top-five starter posts nothing', async () => {
    const site = singleClubSite({ duplicateTtdPid: '103' });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoPosts(sandbox);
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'blocked');
    assert.equal(state.clubs['18280'].reason, 'ttd-missing-or-duplicate',
        'an ambiguous (duplicated) ТТД row must fail closed');
    assert.equal(state.phase, 'partial');
});

test('ranking: missing form for a starter posts nothing', async () => {
    // One of the 11 starters (111) has no row on the form page: the top-5
    // set is indeterminate (111 could have been inside it), so the club
    // must fail closed with zero saves.
    const form = { ...defaultClub().form };
    delete form['111'];
    const site = singleClubSite({ clubData: { '18280': defaultClub({ form }) } });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoPosts(sandbox);
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'blocked',
        `a starter without a form value must block the club, observed status=${state.clubs['18280'] && state.clubs['18280'].status} reason=${state.clubs['18280'] && state.clubs['18280'].reason}`);
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

test('ranking: fewer than five starters with form posts nothing', async () => {
    const site = singleClubSite({
        clubData: {
            '18280': defaultClub({
                form: { '101': '9', '102': '8', '103': '7', '104': '6', '199': '99' }
            })
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoPosts(sandbox);
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'blocked');
    assert.equal(state.clubs['18280'].reason, 'valid-starters-lt-5');
    assert.equal(state.phase, 'partial');
});

test('ranking: XI without eleven unique player links posts nothing', async () => {
    const site = singleClubSite({
        clubData: { '18280': defaultClub({ xi: XI.slice(0, 10) }) }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoPosts(sandbox);
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'blocked');
    assert.equal(state.clubs['18280'].reason, 'xi-incomplete');
    assert.equal(state.phase, 'partial');
});

// ---- 2. State / timing -----------------------------------------------------

test('state: a missing record is due and exactly one sweep starts', async () => {
    const site = makeSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    // one goto per discovered club + one restore goto in finally
    assert.equal(gotosOf(sandbox.fetchLog).length, site.clubs.length + 1);
    assert.equal(formPostsOf(sandbox.fetchLog).length, site.clubs.length,
        'one POST per eligible club in a single sweep');
    const state = readState(sandbox.shared);
    assert.equal(state.phase, 'complete');
    assert.equal(state.lastCompletedAt, site.serverNow);
});

test('state: a malformed record issues no request', async () => {
    const site = makeSite();
    const shared = makeShared();
    shared.storage.set(STATE_KEY, '{not-json');
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [], 'fail closed before any network activity');
    assert.ok(sandbox.warns.some(line => line.includes('state-malformed')), sandbox.warns.join(' | '));
});

test('state: a future-inconsistent record issues no request', async () => {
    const site = makeSite();
    const shared = makeShared();
    seedState(shared, { lastCompletedAt: Date.now() + 60 * 60 * 1000 });
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [],
        'lastCompletedAt in the future is inconsistent — no sweep, no discovery');
});

test('state: exactly seven days since completion runs; one hour short discovers but does not sweep', async () => {
    // Boundary run: completion exactly WEEK_MS before the server clock.
    const dueSite = makeSite();
    const dueShared = makeShared();
    seedState(dueShared, { lastCompletedAt: dueSite.serverNow - WEEK_MS, phase: 'complete' });
    const dueSandbox = createSandbox({ site: dueSite, shared: dueShared });
    await runCycle(dueSandbox);
    assert.ok(gotosOf(dueSandbox.fetchLog).length > 0,
        'exactly 7 elapsed days must be due (>= boundary)');

    // Not-due run: one hour inside the week — discovery may happen, the sweep may not.
    const notDueSite = makeSite();
    const notDueShared = makeShared();
    seedState(notDueShared, { lastCompletedAt: notDueSite.serverNow - WEEK_MS + 60 * 60 * 1000, phase: 'complete' });
    const notDueSandbox = createSandbox({ site: notDueSite, shared: notDueShared });
    await runCycle(notDueSandbox);
    assert.ok(lineupGetsOf(notDueSandbox.fetchLog).length >= 1, 'the due check runs after discovery');
    assertNoWrites(notDueSandbox);
});

test('state: retryAfter in the future blocks before any request', async () => {
    const site = makeSite();
    const shared = makeShared();
    seedState(shared, { retryAfter: Date.now() + RETRY_MS, phase: 'partial' });
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [], 'retryAfter gate closes before discovery');
});

test('state: a three-week-old completion triggers exactly one catch-up sweep', async () => {
    const site = makeSite();
    const shared = makeShared();
    seedState(shared, { lastCompletedAt: site.serverNow - 3 * WEEK_MS, phase: 'complete' });
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);
    assertClean(sandbox);

    const afterFirst = sandbox.fetchLog.length;
    assert.ok(gotosOf(sandbox.fetchLog).length > 0, 'a stale completion runs one catch-up sweep');

    await wakeCycle(sandbox);
    assert.equal(sandbox.fetchLog.length, afterFirst,
        'the completed catch-up is not due again — one sweep, not one per missed week');
    const state = readState(shared);
    assert.equal(state.lastCompletedAt, site.serverNow);
});

test('state: a read-back mismatch aborts before the first switch', async () => {
    const site = singleClubSite({ corruptPersistKeys: new Set([STATE_KEY]) });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assertNoWrites(sandbox);
    assert.ok(sandbox.warns.some(line => line.includes('storage')), sandbox.warns.join(' | '));
});

test('state: a blocked club closes partial without advancing lastCompletedAt', async () => {
    const site = makeSite({
        clubData: { '20001': defaultClub({ levelUnknown: true }) }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
    assert.equal(state.clubs['20001'].status, 'blocked');
    assert.equal(state.clubs['20001'].reason, 'current-column-missing',
        'an unknown training-base schema is blocked, never guessed');
    assert.equal(state.phase, 'partial', 'partial is reported honestly');
    assert.equal(state.lastCompletedAt, 0, 'partial must not claim completion');
    assert.equal(state.retryAfter, site.serverNow + RETRY_MS,
        'a blocked club arms the bounded 15-minute retry');
});

test('state: all-terminal clubs with a verified home close complete from the server clock', async () => {
    const site = makeSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const state = readState(sandbox.shared);
    assert.equal(state.phase, 'complete');
    assert.equal(state.lastCompletedAt, site.serverNow);
    assert.equal(state.retryAfter, 0);
    assert.equal(state.restorePending, false);
    assert.equal(state.homeTeamId, '18280');
});

test('state: lastCompletedAt does not advance when home restoration fails', async () => {
    // Both clubs verify, but the restore goto (2nd call for 18280) fails:
    // without the home gate this cycle would close complete.
    const site = makeSite({ failGoto: { id: '18280', failOnCall: 2 } });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
    assert.equal(state.clubs['20001'].status, 'verified');
    assert.equal(state.phase, 'partial', 'all clubs verified but home not restored -> partial');
    assert.equal(state.lastCompletedAt, 0, 'completion requires an independently verified home');
    assert.equal(state.restorePending, true, 'the recovery marker stays set');
    assert.ok(sandbox.warns.some(line => line.includes('restore-failed')), sandbox.warns.join(' | '));
});

// ---- 3. Coordination -------------------------------------------------------

test('coordination: an unavailable lock performs no work and writes no lease', async () => {
    const site = makeSite();
    const shared = makeShared();
    shared.held.add(LOCK_NAME);
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [], 'ifAvailable:false work must be skipped entirely');
    assert.equal(shared.lockLog.length, 1, 'exactly one lock probe');
    assert.equal(shared.lockLog[0].name, LOCK_NAME);
    assert.equal(shared.lockLog[0].mode, 'exclusive');
    assert.equal(shared.lockLog[0].ifAvailable, true);
    assert.deepEqual([...shared.storage.keys()], [],
        'no localStorage lease fallback may be written');
});

test('coordination: two concurrent probes produce exactly one sweep', async () => {
    const shared = makeShared();
    const site = makeSite();
    const tabA = createSandbox({ site, shared });
    const tabB = createSandbox({ site, shared });
    tabA.start();
    tabB.start();
    await Promise.all([tabA.settle(), tabB.settle()]);

    const combined = [...tabA.fetchLog, ...tabB.fetchLog];
    const writers = [tabA, tabB].filter(sandbox => gotosOf(sandbox.fetchLog).length > 0);
    assert.equal(writers.length, 1, 'exactly one tab may write');
    assert.equal(gotosOf(combined).length, site.clubs.length + 1,
        'one sweep total: one goto per club + one restore');
    assert.equal(formPostsOf(combined).length, site.clubs.length, 'one POST per club total');
    assert.ok(shared.lockLog.length >= 1, 'the lock was probed');
    for (const probe of shared.lockLog) {
        assert.equal(probe.name, LOCK_NAME);
        assert.equal(probe.mode, 'exclusive');
        assert.equal(probe.ifAvailable, true);
    }
    assert.deepEqual([...shared.storage.keys()], [STATE_KEY],
        'only the state key is written — no lease key');
    const state = readState(shared);
    assert.equal(state.phase, 'complete');
});

test('coordination: recent activity blocks before the first switch', async () => {
    const site = makeSite();
    const shared = makeShared();
    shared.storage.set(ACTIVITY_KEY, String(Date.now() - 10 * 1000));
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);

    assert.ok(lineupGetsOf(sandbox.fetchLog).length >= 1, 'discovery still runs');
    assertNoWrites(sandbox);
    assert.ok(sandbox.warns.some(line => line.includes('activity-guard')), sandbox.warns.join(' | '));
});

test('coordination: activity arriving before the save blocks the POST', async () => {
    const site = makeSite({ clubs: ['18280'], home: '18280' });
    const sandbox = createSandbox({ site });
    let fired = false;
    site.onRequest = entry => {
        if (!fired && entry.method === 'GET' && entry.url.includes('action=team')) {
            fired = true;
            sandbox.fireActivity('pointerdown');
        }
    };
    await runCycle(sandbox);

    assert.ok(fired, 'the activity seam must have fired during the sweep');
    assert.deepEqual(formPostsOf(sandbox.fetchLog), [],
        'the re-read guard before save must see the fresh activity and stop');
    const state = readState(sandbox.shared);
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

test('coordination: a match in progress blocks before any switch', async () => {
    const site = makeSite({
        matchday: { today: { final: 0, online: 0, unix: 1999999999 }, next: { final: 0, online: 0, unix: 1999999999 } }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assert.ok(lineupGetsOf(sandbox.fetchLog).length >= 1, 'discovery still runs');
    assertNoWrites(sandbox);
    assert.ok(sandbox.warns.some(line => line.includes('match-guard')), sandbox.warns.join(' | '));
});

test('coordination: a match becoming unsafe blocks the save before POST', async () => {
    const site = makeSite({ clubs: ['18280'], home: '18280' });
    const sandbox = createSandbox({ site });
    let mutated = false;
    site.onRequest = entry => {
        if (!mutated && entry.method === 'GET' && entry.url.includes('action=form')) {
            mutated = true;
            site.matchday = {
                today: { final: 0, online: 0, unix: 1999999999 },
                next: { final: 0, online: 0, unix: 1999999999 }
            };
        }
    };
    await runCycle(sandbox);

    assert.ok(mutated, 'the match-day seam must have fired');
    assert.deepEqual(formPostsOf(sandbox.fetchLog), [],
        'the re-read match guard before save must stop the POST');
    const state = readState(sandbox.shared);
    assert.equal(state.phase, 'partial');
});

test('coordination: unknown page identity elects no writer', async () => {
    const site = makeSite();
    const pageHtml = DEFAULT_PAGE_HTML.replace(`let foot_login_id = ${USER_ID};`, 'let foot_login_id = 77777;');
    const sandbox = createSandbox({ site, pageHtml });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [], 'a non-owner page must not even probe the coordinator');
    assert.equal(sandbox.shared.storage.has(STATE_KEY), false, 'no state is written');
});

test('coordination: identity mismatch in the fetched lineup stops before any switch', async () => {
    const site = makeSite({ identity: '77777' });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assert.ok(lineupGetsOf(sandbox.fetchLog).length >= 1, 'the lineup was fetched');
    assertNoWrites(sandbox);
    assert.ok(sandbox.warns.some(line => line.includes('discovery-failed')), sandbox.warns.join(' | '));
});

// ---- 4. Failure model ------------------------------------------------------

test('failure: restorePending is persisted before the first goto', async () => {
    const site = makeSite();
    const sandbox = createSandbox({ site });
    let captured = null;
    site.onRequest = entry => {
        if (captured === null && entry.url.includes('/ajax/userset.php')) {
            captured = readState(sandbox.shared);
        }
    };
    await runCycle(sandbox);

    assert.ok(captured, 'the state was observed at the first switch');
    assert.equal(captured.restorePending, true,
        'the recovery marker must already be on disk before the first goto');
    assert.equal(captured.homeTeamId, '18280', 'the cycle-start team is captured with the marker');
    assert.equal(readState(sandbox.shared).restorePending, false,
        'the marker is cleared only after the verified restore');
});

test('failure: the captured home team is restored after a successful sweep', async () => {
    const site = makeSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const gotos = gotosOf(sandbox.fetchLog);
    assert.equal(gotoId(gotos[gotos.length - 1]), '18280', 'the last switch restores the cycle-start team');
    const state = readState(sandbox.shared);
    assert.equal(state.restorePending, false);
    assert.equal(state.homeTeamId, '18280');
});

test('failure: the captured home team is restored after a mid-sweep failure', async () => {
    const site = makeSite({ failLineupFor: ['20001'] });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const gotos = gotosOf(sandbox.fetchLog);
    assert.equal(gotoId(gotos[gotos.length - 1]), '18280',
        'a transport failure mid-sweep still restores home in finally');
    const state = readState(sandbox.shared);
    assert.equal(state.restorePending, false, 'restore verified -> marker cleared');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
    assert.equal(state.clubs['20001'], undefined, 'the failed club was never touched');
});

// What this scenario actually asserts: the failed restore keeps the recovery
// marker, and the NEXT wake performs only the restore retry — no discovery,
// no switch to a club, no training POST — while the marker survives.
test('failure: a failed restore keeps restorePending and the next wake retries only the restore, never discovery or saves', async () => {
    const site = makeSite({ failGoto: { id: '18280', failOnCall: 1 } });
    const shared = makeShared();
    const sandbox = createSandbox({ site, shared });
    await runCycle(sandbox);
    let state = readState(shared);
    assert.equal(state.restorePending, true, 'a failed restore keeps the marker');
    assert.equal(state.phase, 'partial');

    const afterFirst = sandbox.fetchLog.length;
    await wakeCycle(sandbox);
    const delta = sandbox.fetchLog.slice(afterFirst);
    assert.equal(delta.length, 1, `the next holder only retries the restore, got: ${delta.map(e => e.url).join(', ')}`);
    assert.ok(delta[0].url.includes('/ajax/userset.php'), delta[0].url);
    assert.equal(gotoId(delta[0]), '18280');
    assert.equal(lineupGetsOf(delta).length, 0, 'no discovery while restore is pending');
    assert.equal(formPostsOf(delta).length, 0, 'no training POST while restore is pending');
    state = readState(shared);
    assert.equal(state.restorePending, true, 'the marker survives the failed retry');
    assert.ok(sandbox.warns.some(line => line.includes('restore-pending')), sandbox.warns.join(' | '));
});

test('failure: a lost POST response stays uncertain and is never re-POSTed that cycle', async () => {
    const site = singleClubSite({ failPostForm: true });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'the POST was dispatched exactly once');
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'uncertain');
    assert.equal(state.clubs['18280'].reason, 'post-transport', 'the lost response is recorded honestly');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
    assert.equal(state.restorePending, false, 'home was restored first');
});

test('failure: an uncertain club is re-inspected read-only after the retry window without a second POST', async () => {
    // 18280 loses its POST response (uncertain); 20001 is blocked, which
    // arms the bounded 15-minute retry. Once it elapses the next wake must
    // re-inspect the uncertain club read-only — zero new saves.
    const site = makeSite({
        failPostForm: true,
        clubData: { '20001': defaultClub({ levelUnknown: true }) }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'exactly one dispatch in cycle 1');
    let state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'uncertain');
    assert.equal(state.clubs['18280'].reason, 'post-transport');
    assert.equal(state.retryAfter, site.serverNow + RETRY_MS, 'the blocked club armed the 15-minute retry');

    advance(sandbox, RETRY_MS + 60 * 1000);
    await wakeCycle(sandbox);

    assert.equal(formPostsOf(sandbox.fetchLog).length, 1,
        'no repeat POST on an uncertain club — the retry is read-only inspection');
    state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'uncertain');
    assert.equal(state.clubs['18280'].reason, 'inspection-not-proven');
    assert.equal(state.clubs['20001'].reason, 'current-column-missing', 'the blocked club stays blocked');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

// ---- 5. Request contract ---------------------------------------------------

test('request: the POST body carries exactly three coach[] values and the observed coach_set label', async () => {
    const site = singleClubSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].method, 'POST');
    assert.equal(posts[0].url, '/team4.php?action=form&date=1',
        'the training POST hits the exact FORM_URL (no cache-buster)');
    assert.equal(posts[0].headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    assert.equal(posts[0].body,
        'coach%5B%5D=101&coach%5B%5D=102&coach%5B%5D=103'
            + '&coach_set=%D1%81%D0%BE%D1%85%D1%80%D0%B0%D0%BD%D0%B8%D1%82%D1%8C+'
            + '%D0%B4%D0%BE%D0%BF%D0%BE%D0%BB%D0%BD%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5+'
            + '%D1%82%D1%80%D0%B5%D0%BD%D0%B8%D1%80%D0%BE%D0%B2%D0%BA%D0%B8',
        'exact bytes: coach[]=×3 then coach_set=<observed submit label>');
    assert.equal(posts[0].body.split('&').length, 4, 'exactly four parameters');
});

test('request: verification is a fresh form read after the POST with checked set and future expiry', async () => {
    const site = singleClubSite();
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    const log = sandbox.fetchLog;
    const postIndex = log.findIndex(entry => entry.method === 'POST' && entry.url.includes('action=form'));
    assert.ok(postIndex >= 0, 'the POST exists');
    const verifyReads = log.slice(postIndex + 1)
        .filter(entry => entry.method === 'GET' && entry.url.includes('action=form'));
    assert.equal(verifyReads.length, 1, 'exactly one fresh form read follows the POST');

    const state = readState(sandbox.shared);
    const record = state.clubs['18280'];
    assert.equal(record.status, 'verified');
    assert.equal(record.reason, 'state-verified');
    assert.deepEqual([...record.intendedPids], ['101', '102', '103']);
    assert.equal(record.priorExpiry, '01/01/2020');
    assert.equal(record.observedExpiry, '01/01/2099',
        'verification observed a future expiry on the fresh read');
    assert.equal(record.extensionProven, true,
        'the expiry extension is provable because the observed date changed');
});

test('request: verification with a past expiry records uncertain, never verified', async () => {
    const site = singleClubSite({ clubData: { '18280': defaultClub({ extendOnPost: false }) } });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'the POST itself was sent');
    const state = readState(sandbox.shared);
    const record = state.clubs['18280'];
    assert.equal(record.status, 'uncertain',
        'checked set may match, but an expired date must not verify');
    assert.equal(record.reason, 'verify-expiry');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

test('request: verification with a different checked set records uncertain', async () => {
    const site = singleClubSite({ clubData: { '18280': defaultClub({ applyPost: false }) } });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'the POST itself was sent');
    const state = readState(sandbox.shared);
    const record = state.clubs['18280'];
    assert.equal(record.status, 'uncertain');
    assert.equal(record.reason, 'verify-checked',
        'state verification requires the intended trio to be checked');
    assert.equal(state.phase, 'partial');
    assert.equal(state.lastCompletedAt, 0);
});

test('request: the restored home team follows the cycle-start team, never a hardcoded id', async () => {
    const siteA = makeSite();
    const sandboxA = createSandbox({ site: siteA });
    await runCycle(sandboxA);

    const siteB = makeSite({ home: '21473', clubs: ['21473', '20001'] });
    const sandboxB = createSandbox({ site: siteB });
    await runCycle(sandboxB);

    const gotosA = gotosOf(sandboxA.fetchLog);
    const gotosB = gotosOf(sandboxB.fetchLog);
    assert.equal(gotoId(gotosA[gotosA.length - 1]), '18280');
    assert.equal(gotoId(gotosB[gotosB.length - 1]), '21473',
        'the restore target is whatever team was active at cycle start');
    assert.ok(gotosB.every(entry => !entry.url.includes('18280')),
        'no hardcoded 18280 appears in the second run');
    assert.equal(readState(sandboxA.shared).homeTeamId, '18280');
    assert.equal(readState(sandboxB.shared).homeTeamId, '21473');
});

test('request: an ambiguous active-team marker aborts with no writes', async () => {
    const site = makeSite({ navOverride: '99999' });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);

    assert.ok(lineupGetsOf(sandbox.fetchLog).length >= 1, 'the lineup was fetched');
    assertNoWrites(sandbox);
    assert.ok(sandbox.warns.some(line => line.includes('discovery-failed') && line.includes('active-team')),
        sandbox.warns.join(' | '));
});

// ---- 6. Independent-review coverage (previously unguarded behaviours) ------
// One scenario per reviewer item; each asserts observable behaviour only
// (requests, persisted state envelope, diagnostics) — no production export.

test('state: after MAX_RETRIES blocked retries the backoff becomes a week and the sweep stops', async () => {
    // Bounded retry cap (MAX_RETRIES = 2): a permanently blocked club may arm
    // the 15-minute retry twice; the third blocked cycle must escalate
    // retryAfter to a full WEEK_MS, after which a wake must not sweep — or
    // even discover — anything.
    const site = makeSite({ clubData: { '20001': defaultClub({ levelUnknown: true }) } });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    let state = readState(sandbox.shared);
    assert.equal(state.phase, 'partial');
    assert.equal(state.retryCount, 1, 'first blocked cycle consumes retry 1 of MAX_RETRIES=2');
    assert.equal(state.retryAfter, site.serverNow + RETRY_MS, 'retry 1 arms the bounded 15-minute window');
    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'only the eligible club POSTed in cycle 1');

    advance(sandbox, RETRY_MS + 60 * 1000);
    await wakeCycle(sandbox);
    state = readState(sandbox.shared);
    assert.equal(state.retryCount, 2, 'second blocked cycle consumes retry 2 of MAX_RETRIES=2');
    assert.equal(state.retryAfter, site.serverNow + RETRY_MS, 'still inside the bounded window at the cap');

    advance(sandbox, RETRY_MS + 60 * 1000);
    await wakeCycle(sandbox);
    state = readState(sandbox.shared);
    assert.equal(state.retryCount, 3, 'the third blocked cycle exceeds MAX_RETRIES=2');
    assert.equal(state.retryAfter, site.serverNow + WEEK_MS,
        'past the cap the backoff escalates from RETRY_MS to a full week');
    const weeklyBackoff = state.retryAfter;
    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'no club is re-POSTed across the retries');

    const afterCap = sandbox.fetchLog.length;
    advance(sandbox, WEEK_MS - 60 * 1000);
    await wakeCycle(sandbox);
    assert.equal(sandbox.fetchLog.length, afterCap,
        'inside the weekly backoff no further sweep (not even discovery) occurs');
    state = readState(sandbox.shared);
    assert.equal(state.retryCount, 3, 'retryCount is not reset while the backoff holds');
    assert.equal(state.retryAfter, weeklyBackoff, 'the weekly backoff timestamp is untouched by the blocked wake');
    assertClean(sandbox);
});

test('eligibility: a capacity other than 3 marks the club ineligible with zero POSTs', async () => {
    const site = makeSite({
        clubData: {
            '18280': defaultClub({ capacity: 2 }),
            '20001': defaultClub({ capacity: 0 })
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'ineligible', 'capacity 2 is not 3');
    assert.equal(state.clubs['18280'].reason, 'capacity');
    assert.equal(state.clubs['20001'].status, 'ineligible', 'capacity 0 is not 3');
    assert.equal(state.clubs['20001'].reason, 'capacity');
    assert.deepEqual(formPostsOf(sandbox.fetchLog), [], 'an ineligible club must issue ZERO training POSTs');
    assert.equal(state.phase, 'complete', 'ineligible is terminal: nothing to save, nothing pending');
    assert.equal(state.lastCompletedAt, site.serverNow);
    assert.equal(state.restorePending, false);
});

test('admission: a body without dark-theme elects no writer and issues no requests', async () => {
    const site = makeSite();
    const pageHtml = DEFAULT_PAGE_HTML.replace('<body class="dark-theme">', '<body>');
    assert.ok(!pageHtml.includes('dark-theme'), 'fixture sanity: legacy/light body');
    const sandbox = createSandbox({ site, pageHtml });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [], 'a legacy/light theme page must not elect a writer');
    assert.equal(sandbox.shared.storage.has(STATE_KEY), false, 'no state is written');
});

test('restore: a pending restore under a foreign identity issues no goto', async () => {
    const site = makeSite();
    const shared = makeShared();
    seedState(shared, { restorePending: true, homeTeamId: '18280', phase: 'partial' });
    const pageHtml = DEFAULT_PAGE_HTML.replace(`let foot_login_id = ${USER_ID};`, 'let foot_login_id = 77777;');
    const sandbox = createSandbox({ site, shared, pageHtml });
    await runCycle(sandbox);

    assert.deepEqual(sandbox.fetchLog, [],
        'restorePending for account 6945 must never drive a goto/restore on another account\'s page');
    const state = readState(shared);
    assert.equal(state.restorePending, true, 'the marker is left untouched for its rightful account');
    assert.equal(state.homeTeamId, '18280');
});

test('state: a resumed sweep keeps the seeded homeTeamId and restores it, not the discovered active team', async () => {
    // Seeded partial record: home is 18280, but discovery sees 20001 active.
    // A resume must not overwrite homeTeamId with the discovered team, and
    // the final restore must target the seeded home.
    const site = makeSite({ home: '20001', clubs: ['18280', '20001'] });
    const shared = makeShared();
    seedState(shared, {
        startedAt: site.serverNow - 60 * 1000,
        phase: 'partial',
        homeTeamId: '18280'
    });
    const sandbox = createSandbox({ site, shared });
    let captured = null;
    site.onRequest = entry => {
        if (captured === null && entry.url.includes('/ajax/userset.php')) {
            captured = readState(shared);
        }
    };
    await runCycle(sandbox);
    assertClean(sandbox);

    assert.ok(captured, 'the sweep issued at least one switch');
    assert.equal(captured.homeTeamId, '18280',
        'discovery saw 20001 active, but a resume must not overwrite the seeded home');
    const state = readState(shared);
    assert.equal(state.homeTeamId, '18280', 'homeTeamId stays the seeded team through the whole cycle');
    const gotos = gotosOf(sandbox.fetchLog);
    assert.equal(gotoId(gotos[gotos.length - 1]), '18280',
        'restoration targets the seeded home, never the discovered active team');
    assert.equal(state.phase, 'complete');
    assert.equal(state.restorePending, false);
});

test('ranking: wrong-length, bad-PID and missing ТТД rows outside the top five are skipped and the POST still happens', async () => {
    // Top five by form is 101..105. Everything broken here belongs to players
    // OUTSIDE that five (106 missing row, 111 wrong-length row, a non-PID row):
    // none of it may abort the fetch or fail the club closed — the trio is
    // still ranked and posted.
    const site = singleClubSite({
        omitTtdPids: ['106'],
        invalidTtdRows: [
            { pid: '111', length: 67 },
            { pid: '110x', length: 68, ttd: 555 }
        ]
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1,
        'invalid/missing rows outside the selected five must not fail the club closed');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']),
        'the correct trio is posted despite the broken rows');
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
    assert.equal(state.phase, 'complete');
});

test('form: a second ПОСЛЕ table can never override the player-form table values', async () => {
    // A second table inside the form carries the same ПОСЛЕ header and links
    // for all 11 starters, with values that would select 111/104/105 instead
    // of the real top trio. Only the player-form table may win.
    const decoy = `<table class="decoy-form">
<tr><th>Игрок</th><th>ПОСЛЕ</th></tr>
<tr><td><a href="/player.php?action=view&id=101">Игрок 101</a></td><td>1</td></tr>
<tr><td><a href="/player.php?action=view&id=102">Игрок 102</a></td><td>2</td></tr>
<tr><td><a href="/player.php?action=view&id=103">Игрок 103</a></td><td>3</td></tr>
<tr><td><a href="/player.php?action=view&id=104">Игрок 104</a></td><td>90</td></tr>
<tr><td><a href="/player.php?action=view&id=105">Игрок 105</a></td><td>80</td></tr>
<tr><td><a href="/player.php?action=view&id=106">Игрок 106</a></td><td>70</td></tr>
<tr><td><a href="/player.php?action=view&id=107">Игрок 107</a></td><td>60</td></tr>
<tr><td><a href="/player.php?action=view&id=108">Игрок 108</a></td><td>5</td></tr>
<tr><td><a href="/player.php?action=view&id=109">Игрок 109</a></td><td>4</td></tr>
<tr><td><a href="/player.php?action=view&id=110">Игрок 110</a></td><td>3</td></tr>
<tr><td><a href="/player.php?action=view&id=111">Игрок 111</a></td><td>99</td></tr>
</table>`;
    const site = singleClubSite({
        clubData: { '18280': defaultClub({ extraFormTable: decoy }) }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'one POST');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']),
        'the decoy table (which would post 111/104/105) must never win silently');
    const state = readState(sandbox.shared);
    assert.equal(state.clubs['18280'].status, 'verified');
});

test('admission: a mirror origin and a framed window take no lock and issue no requests', async () => {
    const mirrorSite = makeSite();
    const mirror = createSandbox({
        site: mirrorSite,
        pageLocation: { origin: 'https://www.slf.fm', pathname: '/team4.php', href: 'https://www.slf.fm/team4.php' }
    });
    await runCycle(mirror);
    assert.deepEqual(mirror.fetchLog, [], 'the www mirror origin is not the writer origin');
    assert.equal(mirror.shared.lockLog.length, 0, 'the mirror must not even probe the lock');

    const frameSite = makeSite();
    const frame = createSandbox({ site: frameSite, frame: true });
    await runCycle(frame);
    assert.deepEqual(frame.fetchLog, [], 'a framed (non-top-level) window is not the writer context');
    assert.equal(frame.shared.lockLog.length, 0, 'the frame must not even probe the lock');
});

test('request: goto carries X-Requested-With with todo=0 and the exact gamelist JSON contract', async () => {
    // The fake goto handler records a violation unless every switch carries
    // X-Requested-With: XMLHttpRequest and todo=0; the fake gamelist handler
    // records a violation unless the exact captured URL (cache-buster
    // stripped) is requested. The JSON {"list":[[gid,"/game.php?id=<gid>",…]]}
    // payload must actually drive the gamestat POST.
    const site = singleClubSite({
        gamelistJson: {
            list: [
                ['9001', '/game.php?id=9001', 'home'],
                ['9002', '/game.php?id=9002', 'away']
            ]
        }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    assert.deepEqual(site.contractViolations, [],
        `every goto and gamelist request must honor the captured contract: ${site.contractViolations.join(' | ')}`);

    const gamelists = sandbox.fetchLog.filter(entry =>
        entry.method === 'GET' && new URL(entry.url, 'https://slf.fm').searchParams.has('gamelist'));
    assert.equal(gamelists.length, 1, 'exactly one gamelist fetch');
    assert.equal(gamelists[0].url.replace(/&_=\d+$/, ''), GAMELIST_URL,
        'the exact captured gamelist URL, cache-buster stripped');

    const stats = sandbox.fetchLog.filter(entry =>
        entry.method === 'POST' && new URL(entry.url, 'https://slf.fm').searchParams.has('gamestat'));
    assert.equal(stats.length, 1, 'the gamestat POST happened');
    assert.equal(stats[0].body, 'gamechoice%5B%5D=9001&gamechoice%5B%5D=9002',
        'both gids parsed out of the {"list":[[gid,"/game.php?id=<gid>",…]]} JSON payload');

    const posts = formPostsOf(sandbox.fetchLog);
    assert.equal(posts.length, 1, 'the JSON gamelist path still completes the sweep');
    assert.equal(posts[0].body, expectedBody(['101', '102', '103']));
});

test('coordination: next-match online and next-match due both block before any switch or POST', async () => {
    // Branch 1: fm_md_next.online === 1.
    const onlineSite = makeSite({
        matchday: { today: null, next: { final: 0, online: 1, unix: 1999999999 } }
    });
    const online = createSandbox({ site: onlineSite });
    await runCycle(online);
    assert.ok(lineupGetsOf(online.fetchLog).length >= 1, 'discovery still runs for the online branch');
    assertNoWrites(online);
    assert.ok(online.warns.some(line => line.includes('match-guard') && line.includes('next-match-online')),
        online.warns.join(' | '));

    // Branch 2: fm_md_next.unix <= serverNow (the match is already due).
    const dueSite = makeSite();
    dueSite.matchday = { today: null, next: { final: 0, online: 0, unix: Math.floor(dueSite.serverNow / 1000) } };
    const due = createSandbox({ site: dueSite });
    await runCycle(due);
    assert.ok(lineupGetsOf(due.fetchLog).length >= 1, 'discovery still runs for the due branch');
    assertNoWrites(due);
    assert.ok(due.warns.some(line => line.includes('match-guard') && line.includes('next-match-due')),
        due.warns.join(' | '));
});

test('request: a verified save with an unchanged expiry records extensionProven=false', async () => {
    // The expiry is already future before the save and the POST does not
    // change it: the save still verifies, but no extension is proven and the
    // record must carry the explicit unchanged reason.
    const site = singleClubSite({
        clubData: { '18280': defaultClub({ expiry: '01/01/2099', extendOnPost: false }) }
    });
    const sandbox = createSandbox({ site });
    await runCycle(sandbox);
    assertClean(sandbox);

    assert.equal(formPostsOf(sandbox.fetchLog).length, 1, 'the POST itself was sent');
    const state = readState(sandbox.shared);
    const record = state.clubs['18280'];
    assert.equal(record.status, 'verified', 'a future, unchanged expiry still verifies');
    assert.equal(record.extensionProven, false, 'no date change means no proven extension');
    assert.equal(record.reason, 'state-verified-expiry-unchanged',
        'the explicit unchanged-expiry reason is recorded');
    assert.equal(record.priorExpiry, '01/01/2099');
    assert.equal(record.observedExpiry, '01/01/2099');
    assert.equal(state.phase, 'complete');
});

// ---------------------------------------------------------------------------
// Runner.
// ---------------------------------------------------------------------------
const failures = [];
for (const { name, fn } of tests) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures.push(name);
        console.log(`FAIL ${name}`);
        const detail = error && error.stack ? error.stack : String(error);
        console.log(detail.split('\n').map(line => `    ${line}`).join('\n'));
    }
}

if (failures.length) {
    console.log(`test-weekly-form-training: ${failures.length} of ${tests.length} scenarios FAILED`);
    process.exit(1);
}
console.log(`test-weekly-form-training: all ${tests.length} scenarios passed`);
