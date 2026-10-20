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
//   - game.php path untouched: the parser panel still inserts before the
//     tactic control root (smoke).

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

// --- sandbox + real module load ---------------------------------------------------

function makeSandbox(location, doc) {
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

// --- (1) OLD design: visible header + .team_general_content → header mount ------
{
  const { doc, head, matches } = buildOldDesignDoc({});
  assert.notEqual(head.offsetParent, null, 'old fixture sanity: visible header has non-null offsetParent');
  const UI = loadUiLayer(makeSandbox(TEAM4_LOCATION, doc));
  await UI.addDropdown();

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
  await UI.addDropdown();

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
  await UI.addDropdown();

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
  await UI.addDropdown();

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'new design (no form): dropdown mounted');
  assert.equal(container.parentNode, wrap, 'no form: target falls back to the wrap (existing fallback semantics)');
  assert.equal(wrap.firstChild, container, 'no form: container sits before the wrap tactic content');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'no form: no header-selector class');
}

// --- (4) game.php smoke: parser-panel insertion path unchanged -------------------
{
  const { doc, control } = buildGameDoc();
  const UI = loadUiLayer(makeSandbox(GAME_LOCATION, doc));
  await UI.addDropdown();

  const container = doc.getElementById('slf-tactics-dropdown');
  assert.ok(container, 'game.php: dropdown mounted');
  assert.equal(container.parentNode, doc.body, 'game.php: inserted into the control root parent');
  assert.equal(doc.body.firstChild, container, 'game.php: insertBefore control root (container first)');
  assert.equal(doc.body._children[1], control, 'game.php: control root stays right after the container');
  assert.equal(container.classList.contains('slf-team4-tactic-header-selector'), false, 'game.php: no header-selector class');
}

console.log('team4 tactic dropdown mount: old design header mount (insertBefore/appendChild + class + style), new design form-first-child fallback, no-form wrap fallback, game.php smoke: OK');
