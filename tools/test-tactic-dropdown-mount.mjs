#!/usr/bin/env node
// SLF issue #351 — team4 tactic dropdown mount target under BOTH site designs.
// Loads the REAL src/app/ui-layer.js in a vm (production file, unmodified) with
// a minimal jsdom-free DOM shim that models the offsetParent rule the fix relies
// on: offsetParent is null when the element itself or any ancestor has
// display:none (non-fixed elements), or when the element is detached.
// PresetStorage/registry are stubbed per the issue work order — addDropdown only
// needs getAllLabels()/getAllPresets() to build options (one preset is enough).
//
// Pins:
//   - OLD design: `.team > .team-head` visible (offsetParent non-null) AND
//     `.team_general_content` present → container mounts INSIDE the team header
//     (insertBefore .team-head__matches when present, appendChild otherwise),
//     with the slf-team4-tactic-header-selector class, dataset flag and header
//     style block — byte-for-byte the pre-#351 header path;
//   - NEW design (fm2026): header still in DOM but display:none (offsetParent
//     null), `.team_general_content` GONE, `.ui-tactic__wrap` inside a FORM →
//     container mounts as the FIRST CHILD of that form, WITHOUT the
//     header-selector class / dataset flag / header style block;
//   - NEW design without a form (paranoid): target falls back to the wrap, so
//     the container takes the same early-return fallback path (inserted as the
//     wrap's first child, i.e. before the wrap's tactic content — semantics
//     identical to the pre-existing no-teamHeader fallback);
//   - fm2026 mint dark design (issue #370, case 3b): NO classic anchors —
//     DIV.tc.mint wraps the tactic cards → container mounts directly BEFORE
//     the .mint-card.tc-tactics «Мои тактики» card; the VISIBLE header is
//     ignored (no header-selector class / dataset flag / header style block);
//   - fm2026 mint without the card (case 3c): named pill radios sit directly
//     in .tc.mint so readiness still resolves (>=10) → the container falls
//     back to the FIRST CHILD of .tc.mint, still header-selector-free;
//   - game.php path untouched: the parser panel still inserts before the
//     tactic control root (smoke);
//   - game.php fm2026 match tactic view (issue #370 follow-up, new dark
//     design): NO tactic radios — target resolves to DIV.tc.mint.tc--match
//     (pre-rendered HIDDEN until «Управление → тактика» opens) → container
//     mounts INSIDE the mint container as a DIRECT child of .tc.mint,
//     directly BEFORE the .tc-cols card grid (the .mint-card.tc-block cards
//     are direct children of that grid — inserting before a card would make
//     the panel a cramped grid cell, live check 2026-10-20 game.php?id=34923601);
//     the container must NEVER be a child of .tc-cols; without tc-block cards
//     it still goes before the bare .tc-cols grid; the panel inherits the
//     hidden state (no tab-state tracking) and header-selector mode never
//     applies on game pages;
//   - game.php without a mint match view and WITHOUT radios: NO MOUNT at all —
//     the old `#slf-match-parser-panel` / `.control_field_1` top-of-page
//     fallbacks (plus the tc-seg β anchor branch) are gone;
//   - game.php PRIORITY (B1 pin, case 4e): even when a game.php page carries
//     BOTH `.team_general_content` and the mint match view, the panel mounts
//     INSIDE .tc.mint (before .tc-cols) — game.php never targets
//     `.team_general_content`, even when present (document-wide position
//     assertion: the panel must never land inside that decoy).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- minimal DOM shim (only what ui-layer.addDropdown + waitForTacticReady touch) ---

const TACTIC_RADIO_NAMES = [
  'def_line', 'press_line', 'def_width', 'press_intense',
  'build_type', 'build_temp', 'build_long', 'build_fast',
  'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
];

class ShimElement {
  constructor(doc, tagName) {
    this._doc = doc;
    this.tagName = String(tagName).toLowerCase();
    this.id = '';
    this._classes = [];
    this.classList = {
      add: (...names) => { for (const name of names) if (!this._classes.includes(name)) this._classes.push(name); },
      remove: name => { const i = this._classes.indexOf(name); if (i >= 0) this._classes.splice(i, 1); },
      contains: name => this._classes.includes(name)
    };
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this._children = [];
    this.parentNode = null;
    this._text = '';
    this.value = '';
    this.title = '';
  }

  get parentElement() { return this.parentNode; }
  get firstChild() { return this._children[0] || null; }

  // #417 compaction reads `Array.from(listRoot.children)` — expose the live
  // child list (DOM `children` is live; Array.from snapshots it).
  get children() { return this._children; }

  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value ?? ''); }

  // Fixture-visible text only (the game.php controlRoot walk reads innerText).
  get innerText() { return this._text; }

  set innerHTML(value) {
    if (value !== '') throw new Error(`DOM shim: only innerHTML="" is supported, got: ${String(value).slice(0, 40)}`);
    this._children = [];
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node === this._doc.body) return true;
      node = node.parentNode;
    }
    return false;
  }

  // Browser rule pinned by the #351 fix: null when self/ancestor display:none.
  get offsetParent() {
    if (!this.isConnected) return null;
    let node = this;
    while (node) {
      if (node.style && node.style.display === 'none') return null;
      node = node.parentNode;
    }
    return this._doc.body;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = this;
    this._children.push(node);
    return node;
  }

  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = this;
    const index = ref ? this._children.indexOf(ref) : -1;
    if (index === -1) this._children.push(node);
    else this._children.splice(index, 0, node);
    return node;
  }

  // #417 compaction inserts the «показать ещё» toggle via
  // listRoot.insertAdjacentElement('afterend', toggleBtn). Only that position
  // is implemented; anything else fails loudly instead of being swallowed by
  // the production try/catch (which would turn a regression into a no-op).
  insertAdjacentElement(position, node) {
    if (position !== 'afterend') {
      throw new Error(`DOM shim: unsupported insertAdjacentElement position: ${position}`);
    }
    const parent = this.parentNode;
    if (!parent) throw new Error('DOM shim: insertAdjacentElement(afterend) on a detached node');
    const index = parent._children.indexOf(this);
    if (index === -1) throw new Error('DOM shim: insertAdjacentElement(afterend) — node not found in its parent');
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = parent;
    parent._children.splice(index + 1, 0, node);
    return node;
  }

  append(...nodes) { for (const node of nodes) this.appendChild(node); }

  remove() {
    if (this.parentNode) this.parentNode._removeChild(this);
  }

  _removeChild(node) {
    const index = this._children.indexOf(node);
    if (index >= 0) this._children.splice(index, 1);
    node.parentNode = null;
  }

  addEventListener(type, fn) { (this._listeners ||= []).push({ type, fn }); }

  // #419 sync reads marked.getAttribute('data-tc-load'). No pre-#419 case
  // calls it (no fixture carries a [data-tc-load] button), so adding it is
  // opt-in-safe: existing sandboxes are byte-identical in behavior.
  getAttribute(name) { return this.attrs[name] ?? null; }

  get options() {
    const out = [];
    const walk = node => {
      for (const child of node._children) {
        if (child.tagName === 'option') out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selector.split(',').some(alt => matchesCompound(node, alt.trim(), null))) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = node => {
      for (const child of node._children) {
        if (selector.split(',').some(alt => matchesCompound(child, alt.trim(), this))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

// Selector subset used by addDropdown: tag / #id / .class / [attr] / [attr="v"],
// '>' combinators, ',' alternatives, ':scope'.
function matchesSimple(el, simple) {
  let rest = simple;
  const tag = rest.match(/^[a-zA-Z][a-zA-Z0-9_-]*/);
  if (tag) {
    if (el.tagName !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    const token = rest.match(/^([.#][A-Za-z0-9_-]+|\[[^\]]*\])/)?.[0];
    if (!token) return false;
    rest = rest.slice(token.length);
    if (token[0] === '.') {
      if (!el.classList.contains(token.slice(1))) return false;
    } else if (token[0] === '#') {
      if (el.id !== token.slice(1)) return false;
    } else {
      const attr = token.slice(1, -1);
      const eq = attr.indexOf('=');
      if (eq === -1) {
        if (el.attrs[attr] === undefined) return false;
      } else {
        const name = attr.slice(0, eq).trim();
        const value = attr.slice(eq + 1).trim().replace(/^["'](.*)["']$/, '$1');
        if (String(el.attrs[name] ?? '') !== value) return false;
      }
    }
  }
  return true;
}

function matchesCompound(el, selector, scope) {
  const parts = selector.split('>').map(part => part.trim()).filter(Boolean);
  let node = el;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === ':scope') {
      if (node !== scope) return false;
      continue;
    }
    if (!node || !matchesSimple(node, parts[i])) return false;
    node = node.parentNode;
  }
  return true;
}

function createDocument() {
  const doc = { readyState: 'complete' };
  doc.head = new ShimElement(doc, 'head');
  doc.body = new ShimElement(doc, 'body');
  doc.documentElement = new ShimElement(doc, 'html');
  doc.createElement = tag => new ShimElement(doc, tag);
  doc.getElementById = id => {
    for (const rootEl of [doc.head, doc.body]) {
      const walk = node => {
        if (node.id === id) return node;
        for (const child of node._children) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      const found = walk(rootEl);
      if (found) return found;
    }
    return null;
  };
  doc.querySelectorAll = selector => {
    const out = [];
    for (const rootEl of [doc.head, doc.body]) {
      const walk = node => {
        if (selector.split(',').some(alt => matchesCompound(node, alt.trim(), doc))) out.push(node);
        node._children.forEach(walk);
      };
      walk(rootEl);
    }
    return out;
  };
  doc.querySelector = selector => doc.querySelectorAll(selector)[0] || null;
  doc.addEventListener = () => {};
  return doc;
}

function addTacticRadios(doc, parent) {
  for (const name of TACTIC_RADIO_NAMES) {
    const radio = doc.createElement('input');
    radio.attrs = { type: 'radio', name, value: '3' };
    parent.appendChild(radio);
  }
}

// --- fixtures -------------------------------------------------------------------

// OLD design: header visible, `.team_general_content` hosts the tactic form.
function buildOldDesignDoc({ withMatches = true } = {}) {
  const doc = createDocument();
  const team = doc.createElement('div');
  team.classList.add('team');
  const head = doc.createElement('div');
  head.classList.add('team-head');
  const matches = doc.createElement('div');
  matches.classList.add('team-head__matches');
  if (withMatches) head.appendChild(matches);
  team.appendChild(head);
  doc.body.appendChild(team);

  const content = doc.createElement('div');
  content.classList.add('team_general_content');
  const form = doc.createElement('form');
  const wrap = doc.createElement('div');
  wrap.classList.add('ui-tactic__wrap');
  addTacticRadios(doc, wrap);
  form.appendChild(wrap);
  content.appendChild(form);
  doc.body.appendChild(content);
  return { doc, head, matches, content };
}

// NEW design (fm2026): header still in DOM but display:none; no
// `.team_general_content`; tactic wrap inside an optional form.
function buildNewDesignDoc({ withForm = true } = {}) {
  const doc = createDocument();
  const team = doc.createElement('div');
  team.classList.add('team');
  const head = doc.createElement('div');
  head.classList.add('team-head', 'drawer-head');
  head.style.display = 'none';
  team.appendChild(head);
  doc.body.appendChild(team);

  const wrap = doc.createElement('div');
  wrap.classList.add('ui-tactic__wrap');
  addTacticRadios(doc, wrap);

  if (withForm) {
    const form = doc.createElement('form');
    form.appendChild(wrap);
    doc.body.appendChild(form);
    return { doc, head, form, wrap };
  }

  const page = doc.createElement('div');
  page.classList.add('team-content');
  page.appendChild(wrap);
  doc.body.appendChild(page);
  return { doc, head, page, wrap };
}

// fm2026 NEW dark design (mint tactic page, issue #370): NO classic anchors
// at all (no .team_general_content, no form.tactics__form/.ui-tactic__wrap);
// DIV.tc.mint wraps the tactic cards, the «Мои тактики» mint card hosts the
// hidden pill radios. A VISIBLE .team > .team-head is kept in the fixture to
// pin that the mint mount ignores the header entirely (panel goes above the
// cards, header-selector mode must not trigger).
// withCard:false drops the «Мои тактики» card — the named pill radios then sit
// directly in .tc.mint so readiness still resolves (>=10) — pinning the
// no-card fallback mount (first child of the mint wrapper).
function buildMintDesignDoc({ withCard = true } = {}) {
  const doc = createDocument();
  const team = doc.createElement('div');
  team.classList.add('team');
  const head = doc.createElement('div');
  head.classList.add('team-head');
  team.appendChild(head);
  doc.body.appendChild(team);

  const mint = doc.createElement('div');
  mint.classList.add('tc', 'mint');
  let card = null;
  if (withCard) {
    card = doc.createElement('div');
    card.classList.add('mint-card', 'tc-tactics');
    addTacticRadios(doc, card);
    mint.appendChild(card);
  } else {
    addTacticRadios(doc, mint);
  }
  doc.body.appendChild(mint);
  return { doc, head, mint, card };
}

function buildGameDoc() {
  const doc = createDocument();
  const control = doc.createElement('div');
  control.textContent = 'Оборона Построение атаки Атака';
  const td = doc.createElement('td');
  const defInput = doc.createElement('input');
  defInput.attrs = { name: 'def_line', type: 'radio', value: '3' };
  td.appendChild(defInput);
  control.appendChild(td);
  doc.body.appendChild(control);
  return { doc, control };
}

// fm2026 match tactic view on game.php (issue #370 follow-up, new dark design,
// live DOM 2026-10-20): NO tactic radios (0 input[type=radio]), the match
// tactic view DIV.tc.mint.tc--match sits inside .team.ttxBody.control_field
// and is PRE-RENDERED HIDDEN (display:none chain → offsetParent null) until
// the «Управление» dropdown-tab → «тактика» item opens it. The tactic cards
// SECTION.mint-card.tc-block («Оборона», «Построение атаки», «Атака») are
// DIRECT children of the DIV.tc-cols grid, which is the (sole) child of the
// mint wrapper — so the panel must mount BEFORE .tc-cols, never inside it.
// withCards:false models the bare grid (empty .tc-cols, no cards).
// withTeamGeneralContent:true adds a leftover classic-design anchor
// (`.team_general_content`) elsewhere on the same game.php page — the B1 decoy
// for case 4e: nothing reads its contents, its bare presence in the document
// is the point (pre-fix code let it win the shared target chain and the mint
// insertion branch silently skipped the mount).
function buildGameMintDoc({ withCards = true, withTeamGeneralContent = false } = {}) {
  const doc = createDocument();
  const field = doc.createElement('div');
  field.classList.add('team', 'ttxBody', 'control_field');
  field.style.display = 'none';
  const mint = doc.createElement('div');
  mint.classList.add('tc', 'mint', 'tc--match');
  field.appendChild(mint);
  const cols = doc.createElement('div');
  cols.classList.add('tc-cols');
  mint.appendChild(cols);
  if (withCards) {
    for (const name of ['Оборона', 'Построение атаки', 'Атака']) {
      const card = doc.createElement('section');
      card.classList.add('mint-card', 'tc-block');
      card.textContent = name;
      cols.appendChild(card);
    }
  }
  doc.body.appendChild(field);
  let general = null;
  if (withTeamGeneralContent) {
    general = doc.createElement('div');
    general.classList.add('team_general_content');
    doc.body.appendChild(general);
  }
  return { doc, field, mint, cols, general };
}

// Issue #417: team4 mint design where the «Мои тактики» card hosts a
// [data-tc-list] of tactic rows — the compaction target. The site renders one
// row per saved tactic and marks the ACTIVE tactic with .tc-pill--cur either
// on the row itself or on a button inside it. markIndices lists the rows to
// mark; markInner puts the mark on an inner button instead of the row.
// The card also carries the 14 hidden pill radios so waitForTacticReady
// resolves (>=10 named radios inside the .tc.mint target) — the radios are
// card children, NOT list children, so they never count as tactic rows.
function buildMintTacticsListDoc({ rows = 5, markIndices = [], markInner = false } = {}) {
  const doc = createDocument();
  const mint = doc.createElement('div');
  mint.classList.add('tc', 'mint');
  const card = doc.createElement('div');
  card.classList.add('mint-card', 'tc-tactics');
  addTacticRadios(doc, card);
  const list = doc.createElement('div');
  list.attrs['data-tc-list'] = '';
  for (let i = 0; i < rows; i++) {
    const row = doc.createElement('div');
    row.classList.add('tc-pill-row');
    if (markIndices.includes(i)) {
      if (markInner) {
        const btn = doc.createElement('button');
        btn.classList.add('tc-pill', 'tc-pill--cur');
        row.appendChild(btn);
      } else {
        row.classList.add('tc-pill--cur');
      }
    }
    list.appendChild(row);
  }
  card.appendChild(list);
  mint.appendChild(card);
  doc.body.appendChild(mint);
  return { doc, mint, card, list };
}

// --- sandbox + real module load ---------------------------------------------------

// #417: installNativeTacticsCompaction() bails when MutationObserver is
// undefined, so the compaction path (and getActiveTacticRow) never runs. This
// stub exists only so the guard passes; the callback is never fired (no
// mutations are simulated) — the tests observe the synchronous
// compactNativeTacticsBlock() call that installNativeTacticsCompaction makes
// right after observer.observe().
class MutationObserverStub {
  constructor(callback) { this._callback = callback; }
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
}

function makeSandbox(location, doc, extra = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, Error,
    setTimeout: () => 0,
    clearTimeout: () => {},
    URLSearchParams,
    location,
    document: doc,
    // addDropdown option-building deps (work order: stubs are fine, one preset).
    PresetStorage: {
      getAllLabels: () => ({ my_preset: 'Мой пресет' }),
      getAllPresets: () => ({ my_preset: { def_line: '3', style: '4' } }),
      loadCustom: () => ({})
    },
    BASE_PRESETS: {},
    // Optional-chained in addDropdown; an undeclared binding would throw
    // ReferenceError even behind `?.`, so the binding must exist.
    TacticPresetLibrary: undefined,
    MatchStatsParser: {
      getAllTeamIds: () => [101, 202],
      readTeamNames: () => ({ 101: 'Home', 202: 'Away' }),
      detectMyTeamId: () => 101
    },
    // Only reachable from event handlers — must never fire during mount.
    applyPresetAsync: () => { throw new Error('applyPresetAsync must not run during mount'); },
    getCurrentTactic: () => { throw new Error('getCurrentTactic must not run during mount'); },
    // β design resolver (issue #370 follow-up): fixtures here have native
    // radios, so the resolver must never produce a β button during mount.
    TACTIC_CONTROL_KEYS: ['def_line', 'press_line', 'def_width', 'press_intense', 'build_type', 'build_temp', 'build_long', 'build_fast', 'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'],
    findBetaTacticButton: () => null,
    normalizePresets: data => data
  };
  // Opt-in extra globals (e.g. MutationObserver for the #417 compaction
  // cases). Existing cases pass nothing → their sandbox is unchanged.
  Object.assign(sandbox, extra);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadUiLayer(sandbox) {
  const source = fs.readFileSync(path.join(root, 'src/app/ui-layer.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;this.__UI = UI;`, sandbox, { filename: 'src/app/ui-layer.js' });
  return sandbox.__UI;
}

const TEAM4_LOCATION = { pathname: '/team4.php', search: '?action=tactic' };
const GAME_LOCATION = { pathname: '/game.php', search: '' };

// Bounded race for every mount await: the sandbox stubs setTimeout as a no-op
// (() => 0), so when waitForTacticReady() never becomes ready the in-vm poll
// never re-fires and UI.addDropdown() stays pending forever — but that can
// only happen on team4 fixtures (the readiness poll is team4-gated; on
// game.php this guard is a generic stall-catcher) — and such a regression
// would hang the suite instead of failing it. Race each mount against a REAL
// host timer (the stub only applies inside the vm) so a stuck mount fails
// fast with a named error pointing at the case.
const MOUNT_TIMEOUT_MS = 2500;
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      `${label}: UI.addDropdown() did not settle within ${ms} ms — ` +
      'waitForTacticReady() is stuck (no matching anchor? check the fixture)'
    )), ms);
  });
  // clearTimeout when the mount settles first: the losing timer must never
  // reject afterwards (that would surface as an unhandled rejection).
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- (1) OLD design: visible header + .team_general_content → header mount ------
{
  const { doc, head, matches } = buildOldDesignDoc({});
  assert.notEqual(head.offsetParent, null, 'old fixture sanity: visible header has non-null offsetParent');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'old design (case 1)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'old design: dropdown mounted');
  assert.equal(container.parentNode, head, 'old design: container mounts inside .team > .team-head');
  assert.equal(head.firstChild, container, 'old design: insertBefore .team-head__matches (container first)');
  assert.equal(head._children[1], matches, 'old design: .team-head__matches stays right after the container');
  assert.ok(container.classList.contains('slf-team4-tactic-header-selector'), 'old design: header-selector class applied');
  assert.equal(container.dataset.slfTeam4TacticHeader, '1', 'old design: header dataset flag set');
  assert.ok(doc.getElementById('slf-team4-tactic-header-selector-style'), 'old design: header style block injected');
}
// same layout without .team-head__matches → appendChild tail of the header path
{
  const { doc, head } = buildOldDesignDoc({ withMatches: false });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'old design (case 1, no matches)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'old design (no matches): dropdown mounted');
  assert.equal(container.parentNode, head, 'old design (no matches): header mount preserved');
  assert.equal(head._children[head._children.length - 1], container, 'old design (no matches): appendChild path');
  assert.ok(container.classList.contains('slf-team4-tactic-header-selector'), 'old design (no matches): header class applied');
}

// --- (2) NEW design: hidden header, form present → first child of the form -------
{
  const { doc, head, form, wrap } = buildNewDesignDoc({});
  assert.equal(head.offsetParent, null, 'new fixture sanity: display:none header has null offsetParent');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'new design (case 2)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'new design: dropdown mounted');
  assert.equal(container.parentNode, form, 'new design: container mounts into the tactic form');
  assert.equal(form.firstChild, container, 'new design: container is the FIRST child of the form');
  assert.equal(form._children[1], wrap, 'new design: .ui-tactic__wrap follows the dropdown');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'new design: no header-selector class');
  assert.equal(container.dataset.slfTeam4TacticHeader, undefined, 'new design: no header dataset flag');
  assert.equal(doc.getElementById('slf-team4-tactic-header-selector-style'), null, 'new design: header style block not injected');
}

// --- (3) NEW design without a form (paranoid) → fallback path onto the wrap ------
{
  const { doc, wrap } = buildNewDesignDoc({ withForm: false });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'new design (case 3, no form)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'new design (no form): dropdown mounted');
  assert.equal(container.parentNode, wrap, 'no form: target falls back to the wrap (existing fallback semantics)');
  assert.equal(wrap.firstChild, container, 'no form: container sits before the wrap tactic content');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'no form: no header-selector class');
}

// --- (3b) fm2026 NEW dark design (mint): before the «Мои тактики» card -----------
{
  const { doc, head, mint, card } = buildMintDesignDoc();
  assert.notEqual(head.offsetParent, null, 'mint fixture sanity: header is visible, the mint path must still ignore it');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'mint design (case 3b)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'mint design: dropdown mounted despite absent classic anchors');
  assert.equal(container.parentNode, mint, 'mint design: container mounts inside DIV.tc.mint');
  assert.equal(mint.firstChild, container, 'mint design: container sits directly BEFORE the tactics card');
  assert.equal(mint._children[1], card, 'mint design: .mint-card.tc-tactics follows the dropdown');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'mint design: no header-selector class despite visible header');
  assert.equal(container.dataset.slfTeam4TacticHeader, undefined, 'mint design: no header dataset flag');
  assert.equal(doc.getElementById('slf-team4-tactic-header-selector-style'), null, 'mint design: header style block not injected');
}

// --- (3c) fm2026 mint without the «Мои тактики» card → first child of mint ------
{
  const { doc, head, mint, card } = buildMintDesignDoc({ withCard: false });
  assert.equal(card, null, 'mint fixture sanity (no card): no .mint-card.tc-tactics exposed');
  assert.notEqual(head.offsetParent, null, 'mint fixture sanity (no card): header is visible, the mint path must still ignore it');
  assert.ok(
    mint.querySelectorAll('input[type="radio"][name], input[type="checkbox"][name]').length >= 10,
    'mint fixture sanity (no card): named pill radios keep readiness resolvable (>=10)'
  );
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'mint design without card (case 3c)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'mint (no card): dropdown mounted despite absent classic anchors');
  assert.equal(container.parentNode, mint, 'mint (no card): container mounts inside DIV.tc.mint');
  assert.equal(mint.firstChild, container, 'mint (no card): fallback — container is the FIRST child of the mint wrapper');
  assert.equal(mint._children[1].tagName, 'input', 'mint (no card): named pill radios follow the dropdown');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'mint (no card): no header-selector class');
  assert.equal(container.dataset.slfTeam4TacticHeader, undefined, 'mint (no card): no header dataset flag');
  assert.equal(doc.getElementById('slf-team4-tactic-header-selector-style'), null, 'mint (no card): header style block not injected');
}

// --- (4) game.php smoke: parser-panel insertion path unchanged -------------------
{
  const { doc, control } = buildGameDoc();
  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'game.php smoke (case 4)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'game.php: dropdown mounted');
  assert.equal(container.parentNode, doc.body, 'game.php: inserted into the control root parent');
  assert.equal(doc.body.firstChild, container, 'game.php: insertBefore control root (container first)');
  assert.equal(doc.body._children[1], control, 'game.php: control root stays right after the container');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'game.php: no header-selector class');
}

// --- (4b) game.php fm2026 match tactic view: before the .tc-cols grid ------------
{
  const { doc, field, mint, cols } = buildGameMintDoc();
  assert.equal(field.offsetParent, null, 'game mint fixture sanity: tab-closed ancestor chain reports offsetParent null');
  assert.equal(mint.offsetParent, null, 'game mint fixture sanity: DIV.tc.mint.tc--match is hidden until «Управление → тактика» opens');
  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'game.php mint view (case 4b)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'game mint: dropdown mounted inside the match tactic view');
  assert.equal(container.parentNode, mint, 'game mint: container is a DIRECT child of DIV.tc.mint.tc--match (full-width strip above the card grid)');
  assert.equal(cols.querySelectorAll('#slf-tactics-dropdown').length, 0, 'game mint: REGRESSION GUARD — container must NOT be a child of the .tc-cols grid (grid-cell placement = 260px cramped column)');
  assert.equal(mint.firstChild, container, 'game mint: container precedes the .tc-cols grid');
  assert.equal(mint._children[1], cols, 'game mint: .tc-cols grid follows the dropdown');
  assert.equal(cols._children[0]?.tagName, 'section', 'game mint: tactic cards stay DIRECT children of the grid');
  assert.equal(cols._children[0]?.textContent, 'Оборона', 'game mint: …and the first grid card is «Оборона»');
  assert.equal(container.offsetParent, null, 'game mint: panel inherits the hidden state — appears only when the tab view opens (no tab-state tracking)');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'game mint: no header-selector class');
  assert.equal(container.dataset.slfTeam4TacticHeader, undefined, 'game mint: no header dataset flag');
  assert.equal(doc.getElementById('slf-team4-tactic-header-selector-style'), null, 'game mint: no header style block');
}

// --- (4c) game.php mint view without tc-block cards → before the bare grid ------
{
  const { doc, mint, cols } = buildGameMintDoc({ withCards: false });
  assert.ok(cols, 'game mint (no cards) fixture sanity: bare .tc-cols child exposed');
  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'game.php mint no cards (case 4c)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'game mint (no cards): dropdown mounted inside the match tactic view');
  assert.equal(container.parentNode, mint, 'game mint (no cards): container is a DIRECT child of DIV.tc.mint (sibling of .tc-cols)');
  assert.equal(cols.querySelectorAll('#slf-tactics-dropdown').length, 0, 'game mint (no cards): REGRESSION GUARD — container must NOT be a child of the .tc-cols grid');
  assert.equal(mint.firstChild, container, 'game mint (no cards): container sits before the bare .tc-cols grid (first child of the mint wrapper)');
  assert.equal(mint._children[1], cols, 'game mint (no cards): .tc-cols follows the dropdown');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'game mint (no cards): no header-selector class');
}

// --- (4d) game.php without mint view and without radios → NO mount anywhere ------
{
  const doc = createDocument();
  // The old top-of-page trap, exactly as production exposed it: parser strip
  // + .control_field_1 + a β tc-seg group for the canonical key — but NO
  // tactic radios and NO .tc.mint match view. Old code mounted the dropdown
  // next to the parser strip (above the match header); new contract: nothing.
  const parserPanel = doc.createElement('div');
  parserPanel.id = 'slf-match-parser-panel';
  doc.body.appendChild(parserPanel);
  const controlField = doc.createElement('div');
  controlField.classList.add('control_field_1');
  doc.body.appendChild(controlField);
  const seg = doc.createElement('span');
  seg.classList.add('mint-seg', 'tc-seg');
  seg.attrs = { 'data-option': 'def_line' };
  controlField.appendChild(seg);

  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'game.php no mint no radios (case 4d)');

  assert.equal(doc.getElementById('slf-tactics-dropdown'), null, 'game (no mint, no radios): dropdown must NOT mount anywhere — the top-of-page fallbacks are gone');
  assert.equal(doc.querySelectorAll('#slf-tactics-dropdown').length, 0, 'game (no mint, no radios): no stray containers either');
}

// --- (4e) game.php B1 priority pin: mint beats .team_general_content ------------
{
  const { doc, mint, cols, general } = buildGameMintDoc({ withTeamGeneralContent: true });
  assert.ok(general, 'game mint (both anchors) fixture sanity: .team_general_content decoy exposed');
  assert.equal(doc.querySelectorAll('.team_general_content').length, 1, 'game mint (both anchors): decoy IS present in the document — the case discriminates the priority');
  assert.equal(doc.querySelector('input[name="def_line"]'), null, 'game mint (both anchors): no def_line radios — the mint target branch is the one under test');
  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'game.php mint + team_general_content (case 4e)');

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'game mint (both anchors): dropdown mounted — a present .team_general_content must NOT suppress the mint mount');
  assert.equal(container.parentNode, mint, 'game mint (both anchors): container is a DIRECT child of DIV.tc.mint.tc--match');
  assert.equal(mint.firstChild, container, 'game mint (both anchors): container precedes the .tc-cols grid');
  assert.equal(mint._children[1], cols, 'game mint (both anchors): .tc-cols grid follows the dropdown');
  // Document-wide position assertion (not implementation mirroring): walk the
  // real ancestor chain of the mounted panel — no ancestor may be the decoy.
  let insideDecoy = false;
  for (let node = container.parentNode; node; node = node.parentNode) {
    if (node.classList && node.classList.contains('team_general_content')) { insideDecoy = true; break; }
  }
  assert.equal(insideDecoy, false, 'game mint (both anchors): REGRESSION GUARD — panel must NEVER land inside .team_general_content on game.php');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'game mint (both anchors): no header-selector class');
}

// --- (5) Issue #417: active tactic row selection in the native compaction -----
// getActiveTacticRow(rows) is a closure-local helper inside addDropdown,
// reached only through compactNativeTacticsBlock() (called synchronously by
// installNativeTacticsCompaction() during addDropdown). It is not exported,
// so these cases drive it through the REAL mount path with a MutationObserver
// stub and assert the OBSERVABLE contract: after compaction, exactly the
// active row keeps style.display '' (visible) and every other row is folded
// to 'none'. The «показать ещё» toggle must also be created — its presence
// proves the compaction ran to completion rather than being swallowed by the
// production try/catch (a silent no-op would leave every row untouched).
//
// Fixture: team4 mint design .tc.mint > .mint-card.tc-tactics > [data-tc-list]
// > rows. The card also hosts the 14 hidden pill radios so waitForTacticReady
// resolves; the radios are card children, not list children, so they never
// count as tactic rows.
const COMPACTION_SANDBOX = { MutationObserver: MutationObserverStub };

function assertRowDisplays(list, visibleIndex, label) {
  const rows = list._children;
  rows.forEach((row, i) => {
    const expected = i === visibleIndex ? '' : 'none';
    assert.equal(
      row.style.display, expected,
      `${label}: row ${i} must be ${expected === '' ? 'visible (display "")' : 'folded (display "none")'}`
    );
  });
}

function assertToggleCreated(card, label) {
  const toggle = card._children.find(el => el.tagName === 'button' && el.dataset.slfTacticsToggle === '1');
  assert.ok(toggle, `${label}: «показать ещё» toggle created (compaction ran to completion, not a swallowed no-op)`);
}

// (5a) Active row marked ON THE ROW ITSELF → that row stays visible.
{
  const { doc, list } = buildMintTacticsListDoc({ rows: 5, markIndices: [2] });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'active row on the row itself (case 5a)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5a: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children.length, 5, '5a fixture sanity: 5 tactic rows in the list');
  assert.equal(list._children[2].classList.contains('tc-pill--cur'), true, '5a fixture sanity: row 2 carries .tc-pill--cur on itself');
  assertRowDisplays(list, 2, '5a (mark on row)');
  assertToggleCreated(list.parentNode, '5a (mark on row)');
}

// (5b) Active row marked ON AN INNER ELEMENT → that row stays visible.
{
  const { doc, list } = buildMintTacticsListDoc({ rows: 5, markIndices: [3], markInner: true });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'active row on inner element (case 5b)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5b: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children[3].classList.contains('tc-pill--cur'), false, '5b fixture sanity: row 3 itself is NOT marked');
  assert.ok(list._children[3].querySelector('.tc-pill--cur'), '5b fixture sanity: row 3 has an inner .tc-pill--cur element');
  assertRowDisplays(list, 3, '5b (mark on inner element)');
  assertToggleCreated(list.parentNode, '5b (mark on inner element)');
}

// (5c) No active row → fall back to the FIRST row.
{
  const { doc, list } = buildMintTacticsListDoc({ rows: 5, markIndices: [] });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'no active row fallback (case 5c)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5c: dropdown mounted (addDropdown ran to completion)');
  assert.equal(
    list._children.some(row => row.classList.contains('tc-pill--cur') || row.querySelector('.tc-pill--cur')),
    false, '5c fixture sanity: no row is marked'
  );
  assertRowDisplays(list, 0, '5c (no mark → first row)');
  assertToggleCreated(list.parentNode, '5c (no mark → first row)');
}

// (5d) Empty rows array → getActiveTacticRow([]) returns undefined.
// NOTE: via the public path this is UNREACHABLE — compactNativeTacticsBlock
// early-returns on `!foldable.length` (rows < 4) BEFORE calling
// getActiveTacticRow, so an empty list never reaches the helper. The
// observable contract for an empty list is therefore: no rows are touched,
// no toggle is created, and nothing throws. We pin that here; the literal
// `undefined` return is a pure-function property that only a module-level
// extraction (out of scope) could assert directly.
{
  const { doc, list, card } = buildMintTacticsListDoc({ rows: 0, markIndices: [] });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'empty rows (case 5d)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5d: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children.length, 0, '5d (empty list): no rows to fold — nothing touched');
  const toggle = card._children.find(el => el.tagName === 'button' && el.dataset.slfTacticsToggle === '1');
  assert.equal(toggle, undefined, '5d (empty list): no «показать ещё» toggle created (nothing foldable)');
}

// (5e) Multiple active rows → the FIRST match wins.
{
  const { doc, list } = buildMintTacticsListDoc({ rows: 5, markIndices: [0, 3] });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'multiple active rows (case 5e)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5e: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children[0].classList.contains('tc-pill--cur'), true, '5e fixture sanity: row 0 is marked');
  assert.equal(list._children[3].classList.contains('tc-pill--cur'), true, '5e fixture sanity: row 3 is ALSO marked');
  assertRowDisplays(list, 0, '5e (multiple marks → first match)');
  assertToggleCreated(list.parentNode, '5e (multiple marks → first match)');
}

// --- (5f) Issue #419: empty list + stale toggle → the !activeRow early return ---
// getActiveTacticRow([]) returns undefined, so compactNativeTacticsBlock returns
// early BEFORE the toggle lookup. A stale toggle (left over from a previous
// compaction run, e.g. after the site re-rendered the list empty) is therefore
// UNTOUCHED. The pre-#419 code had no such early return: it fell into the
// `!foldable.length` branch and HIDE the stale toggle. This is the only
// observable that distinguishes the new early return from the old path (case 5d
// passes on both, so it cannot prove the guard).
{
  const { doc, list, card } = buildMintTacticsListDoc({ rows: 0, markIndices: [] });
  const staleToggle = doc.createElement('button');
  staleToggle.attrs['data-slf-tactics-toggle'] = '';
  staleToggle.dataset.slfTacticsToggle = '1';
  staleToggle.dataset.slfExpanded = '0';
  staleToggle.style.display = '';
  card.appendChild(staleToggle);
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'empty list + stale toggle (case 5f)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '5f: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children.length, 0, '5f fixture sanity: empty list');
  assert.equal(staleToggle.style.display, '', '5f (empty list): stale toggle UNTOUCHED — the !activeRow early return fires before the toggle lookup (pre-#419 code would have hidden it)');
}

// --- (6) Issue #419: syncSelectWithNativeActive mirrors the site's active tactic ---
// syncSelectWithNativeActive() is a closure-local helper inside addDropdown,
// called synchronously at init (after refreshSelect + updateSchemeLabel). It is
// not exported, so these cases drive it through the REAL mount path and assert
// the OBSERVABLE contract: after mount, the select's value reflects the site's
// active tactic (resolved via the native cache) — or stays unchanged on any
// miss (no marked button / no cache item / no matching option).
//
// Fixture: team4 mint design (buildMintTacticsListDoc) + an optional marked
// [data-tc-load].tc-pill--cur button appended to the body. The button is
// OUTSIDE the tactic list so it never counts as a compaction row. The shim's
// getAttribute (added above) backs marked.getAttribute('data-tc-load').
//
// The select's options come from PresetStorage.getAllLabels() (one option per
// preset: value = preset key, textContent = label). refreshSelect() seeds
// select.value with the FIRST option's value; the sync overwrites it only on a
// full match (marked button + cache item + matching option text).

function buildSyncFixture({ markedId = null, rows = 5 } = {}) {
  const { doc, mint, card, list } = buildMintTacticsListDoc({ rows, markIndices: [] });
  let btn = null;
  if (markedId !== null) {
    btn = doc.createElement('button');
    btn.classList.add('tc-pill', 'tc-pill--cur');
    btn.attrs['data-tc-load'] = markedId;
    doc.body.appendChild(btn);
  }
  return { doc, mint, card, list, btn };
}

function getSelect(doc, label) {
  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, `${label}: dropdown mounted`);
  const select = container.querySelector('select');
  assert.ok(select, `${label}: select present in the mounted container`);
  return select;
}

// (6a) Marked button + matching cache item + matching option → select.value =
// the option's value (the preset key).
{
  const { doc, btn } = buildSyncFixture({ markedId: '5174' });
  assert.ok(btn, '6a fixture sanity: marked [data-tc-load="5174"].tc-pill--cur button present');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, {
    PresetStorage: {
      getAllLabels: () => ({ my_preset: 'Мой пресет', henta_abuse: 'Henta abuse' }),
      getAllPresets: () => ({ my_preset: { def_line: '3', style: '4' }, henta_abuse: { def_line: '3', style: '4' } }),
      loadCustom: () => ({}),
      readScopedNativeCache: () => ({ items: [{ id: '5174', name: 'Henta abuse' }] })
    }
  }));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'sync: marked + cache + option (case 6a)');

  const select = getSelect(doc, '6a');
  assert.equal(select.value, 'henta_abuse', '6a: select.value mirrors the site active tactic (the matching option value)');
}

// (6b) No marked button on the page → select.value unchanged (initial value).
{
  const { doc, btn } = buildSyncFixture({ markedId: null });
  assert.equal(btn, null, '6b fixture sanity: no marked button');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'sync: no marked button (case 6b)');

  const select = getSelect(doc, '6b');
  assert.equal(select.value, 'my_preset', '6b: no marked button → select.value unchanged (refreshSelect first-option seed)');
}

// (6c) Marked button but NO matching cache item → select.value unchanged.
{
  const { doc, btn } = buildSyncFixture({ markedId: '9999' });
  assert.ok(btn, '6c fixture sanity: marked [data-tc-load="9999"] button present (id absent from the cache)');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, {
    PresetStorage: {
      getAllLabels: () => ({ my_preset: 'Мой пресет' }),
      getAllPresets: () => ({ my_preset: { def_line: '3', style: '4' } }),
      loadCustom: () => ({}),
      readScopedNativeCache: () => ({ items: [{ id: '5174', name: 'Henta abuse' }] })
    }
  }));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'sync: no cache item (case 6c)');

  const select = getSelect(doc, '6c');
  assert.equal(select.value, 'my_preset', '6c: no matching cache item → select.value unchanged');
}

// (6d) Cache item present but NO matching option → select.value unchanged.
{
  const { doc, btn } = buildSyncFixture({ markedId: '5174' });
  assert.ok(btn, '6d fixture sanity: marked [data-tc-load="5174"] button present (cache name matches no option)');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, {
    PresetStorage: {
      getAllLabels: () => ({ my_preset: 'Мой пресет' }),
      getAllPresets: () => ({ my_preset: { def_line: '3', style: '4' } }),
      loadCustom: () => ({}),
      readScopedNativeCache: () => ({ items: [{ id: '5174', name: 'Henta abuse' }] })
    }
  }));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, 'sync: no matching option (case 6d)');

  const select = getSelect(doc, '6d');
  assert.equal(select.value, 'my_preset', '6d: no matching option (cache name "Henta abuse" matches no option text) → select.value unchanged');
}

// (6e) compactNativeTacticsBlock never hides ALL rows: 3 rows, none marked →
// collapsed shows the FIRST row only. The #419 change folds <4-row lists to the
// active row (pre-#419 code never folded <4-row lists — it showed all rows and
// created no toggle). With no mark, the active row falls back to rows[0], so
// exactly row 0 stays visible and a toggle IS created.
{
  const { doc, list } = buildMintTacticsListDoc({ rows: 3, markIndices: [] });
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc, COMPACTION_SANDBOX));
  await withTimeout(UI.addDropdown(), MOUNT_TIMEOUT_MS, '3 rows no mark (case 6e)');

  assert.ok(doc.getElementById('slf-tactics-dropdown'), '6e: dropdown mounted (addDropdown ran to completion)');
  assert.equal(list._children.length, 3, '6e fixture sanity: 3 tactic rows');
  assert.equal(
    list._children.some(row => row.classList.contains('tc-pill--cur') || row.querySelector('.tc-pill--cur')),
    false, '6e fixture sanity: no row is marked'
  );
  assertRowDisplays(list, 0, '6e (3 rows, no mark → first row only, never all hidden)');
  assertToggleCreated(list.parentNode, '6e (3 rows, no mark → first row only)');
}

console.log('team4 tactic dropdown mount: old design header mount (insertBefore/appendChild + class + style), new design form-first-child fallback, no-form wrap fallback, fm2026 mint card-anchored mount, mint no-card first-child fallback, game.php smoke, game.php mint-view mounts (direct child of .tc.mint before the .tc-cols grid, never a grid child) + no-mint-no-radios never mounts + mint beats a present .team_general_content on game.php (B1 priority pin) + #417 active tactic row selection (mark on row / mark on inner element / no-mark first-row fallback / empty list no-op / multiple marks first-match) + #419 active tactic sync (empty-list stale-toggle early return / native→select sync on full match + no-change on each miss / <4-row list folds to first row, never all hidden): OK');
