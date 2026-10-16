#!/usr/bin/env node
// SLF issue #353 — LoanLimitPanel re-anchored to the current team4.php squad
// markup (fm2026). Loads the REAL
// src/modules/team-management/team-loan-limit-helper.js (production file,
// unmodified) in a vm with a minimal jsdom-free DOM shim (same pattern as
// test-tactic-dropdown-mount.mjs from #351).
//
// Pre-fix failure map (base 71478b0 — run with SLF_LOAN_LIMIT_HELPER_PATH
// pointing at the unfixed helper to reproduce): T2, T3 and T6 FAIL —
// isLoanTabActive() can never return true under the current markup (dead
// .tpanel-a[data-tp="-1"] tab + dead tr.view-team__player.pl--1 rows), so the
// panel stays display:none forever and no MutationObserver is registered.
// T1, T4, T5 pass pre-fix too: they pin the PRESERVED old-design semantics
// (tab-gated legacy path) and the fail-closed no-op (regression guards).
// T7 FAILS pre-fix too, but differently from T2/T3: the base helper has no
// dual-anchor union, so with pl--1 rows present in the fixture the old
// tab/legacy path activates and getLoanRows() returns 2 instead of 3 — T7
// pins the NEW union semantics (a row matching BOTH anchors counted exactly
// once, span.player-loan-only rows included, visibility:hidden excluded),
// not the dead-panel symptom.
// T8 FAILS pre-fix at its union-count pins only (observed map, base helper):
// the main case fails at "loan rows ARE detected by the union" (the base
// tab-gates getLoanRows() itself → [] under an inactive tab, so the rows the
// fixture plants are invisible to it), and the companion fails the «1/10»
// count pin (base renders «0/10» — legacy-only row collection under an
// active tab). T8's tab-GATING pins pass pre-fix by design (non-matching
// present tab → inactive/hidden; matching present tab → active/visible):
// they pin the PRESERVED pre-#353 boundary, not new behaviour. T8's third
// block (the legacy pl--1 fallback positive pin) also passes pre-fix: the
// base helper still carries the pre-#353 fallback line (visible pl--1 rows
// under a present non-matching tab → active) — the block pins its
// RESTORATION in the re-anchored helper, and is the only test that fails if
// that fallback line regresses to `return false;`.
//
// Pins:
//   T1 old design: .tpanel-a[data-tp="-1"] «Аренды» tab + legacy
//      tr.view-team__player.pl--1 rows → «2/10», «1/5», panel visible;
//   T2 new markup: NO [data-tp="-1"] tab, rows carry span.player-loan →
//      panel visible with the right count (row-based detection, no tab gate);
//   T3 header-row trap: tablesorter-headerRow with «аренд. номинал» text is
//      NOT counted (structural th exclusion, not /аренд/i text matching);
//   T4 no #generallist → mount/render silent no-ops, no observer, box absent;
//   T5 no loan rows (empty squad) → box mounts but display:none, no crash;
//   T6 MutationObserver: observer registered on #generallist; firing the
//      mutation callback re-renders (count updates after a row is added);
//   T7 dedupe union: one row matches BOTH anchors (pl--1 class AND
//      span.player-loan child) and is counted exactly ONCE (Set union, not a
//      concatenation); a visibility:hidden loan row is NOT counted
//      (isVisible checks display AND visibility — fixtures previously
//      covered display:none only);
//   T8 tab-gating boundary: a PRESENT .tpanel-a[data-tp="-1"] tab with
//      non-matching text («Основная команда») is NOT overridden by the new
//      span.player-loan row anchor — isLoanTabActive() false, panel
//      display:none (visible pl--1 rows are the only fallback when the tab
//      exists; here none); companion: the same present tab WITH matching
//      text («Аренды») wins (active, visible, union rows still counted)
//      even though the new anchor is also present; third block (positive
//      legacy fallback pin): the same present NON-matching tab with NO
//      span.player-loan rows but VISIBLE legacy tr.view-team__player.pl--1
//      rows → isLoanTabActive() true, panel visible with the exact legacy
//      totals («1/10», «1/5») computed from those rows — pins the restored
//      pre-#353 fallback line inside the tab-present branch (a regression
//      replacing it with `return false;` fails this block only). Row-based
//      detection is reserved for the tab being ABSENT from the DOM
//      (T2/T5/T6).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = process.env.SLF_LOAN_LIMIT_HELPER_PATH
  || 'src/modules/team-management/team-loan-limit-helper.js';
const BOX_ID = 'slf-loan-limit-inline';

// --- minimal DOM shim (only what LoanLimitPanel touches) ----------------------

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
    this.style = {};
    this._children = [];
    this.parentNode = null;
    this._text = '';
    this._innerHTML = '';
  }

  get parentElement() { return this.parentNode; }
  get children() { return this._children; }

  // DOM textContent semantics: concatenation of all descendant text.
  get textContent() {
    if (this._children.length) return this._children.map(child => child.textContent).join('');
    return this._text;
  }
  set textContent(value) { this._text = String(value ?? ''); }

  // The panel box is only ever written via innerHTML; the shim stores the raw
  // string so tests can pin the rendered totals (no HTML parsing).
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this._children = [];
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = this;
    this._children.push(node);
    return node;
  }

  // Mount point contract: the box lands directly AFTER #generallist.
  insertAdjacentElement(position, node) {
    if (position !== 'afterend') throw new Error(`DOM shim: only "afterend" is supported, got: ${position}`);
    const parent = this.parentNode;
    if (!parent) throw new Error('DOM shim: insertAdjacentElement("afterend") without a parent');
    if (node.parentNode) node.parentNode._removeChild(node);
    const index = parent._children.indexOf(this);
    parent._children.splice(index + 1, 0, node);
    node.parentNode = parent;
    return node;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = node => {
      for (const child of node._children) {
        if (selector.split(',').some(alt => matchesDescendant(child, alt.trim()))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  addEventListener() {}

  _removeChild(node) {
    const index = this._children.indexOf(node);
    if (index >= 0) this._children.splice(index, 1);
    node.parentNode = null;
  }
}

// Selector subset used by the module: tag / #id / .class / [attr] /
// [attr="v"] / [attr*="v"], ',' alternatives, whitespace-descendant parts
// ('tbody tr', '#generallist thead th').
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
      const m = attr.match(/^([^*=]+)(\*?=)(.*)$/) || attr.match(/^([^*=]+)()()$/);
      const name = m[1].trim();
      const op = m[2];
      const value = String(m[3] || '').replace(/^["'](.*)["']$/, '$1');
      const actual = el.attrs[name];
      if (op === '*=') {
        if (!String(actual ?? '').includes(value)) return false;
      } else if (op === '=') {
        if (String(actual ?? '') !== value) return false;
      } else if (actual === undefined) {
        return false;
      }
    }
  }
  return true;
}

// Rightmost compound must match el; remaining parts walk strict ancestors.
function matchesDescendant(el, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  let node = el;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i === parts.length - 1) {
      if (!matchesSimple(node, parts[i])) return false;
      continue;
    }
    node = node.parentNode;
    while (node && !matchesSimple(node, parts[i])) node = node.parentNode;
    if (!node) return false;
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
        if (selector.split(',').some(alt => matchesDescendant(node, alt.trim()))) out.push(node);
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

// --- fixtures -------------------------------------------------------------------

// 11-cell squad row: player link + optional span.player-loan in the name
// cell, age in the «Воз» cell at index 10 (live column order).
function makePlayerRow(doc, { name, age, loan = false, legacyClass = false, hidden = false, visibilityHidden = false } = {}) {
  const tr = doc.createElement('tr');
  tr.classList.add('view-team__player');
  if (legacyClass) tr.classList.add('pl--1');
  if (hidden) tr.style.display = 'none';
  if (visibilityHidden) tr.style.visibility = 'hidden';

  for (let i = 0; i <= 10; i++) {
    const td = doc.createElement('td');
    if (i === 2) {
      const link = doc.createElement('a');
      link.attrs = { href: `player.php?id=${encodeURIComponent(name)}` };
      link.textContent = name;
      td.appendChild(link);
      if (loan) {
        const span = doc.createElement('span');
        span.classList.add('player-loan');
        span.textContent = 'аренда';
        span.attrs = { title: 'Взят в аренду у клуба «Тест»' };
        td.appendChild(span);
      }
    } else if (i === 10) {
      td.textContent = String(age);
    }
    tr.appendChild(td);
  }
  return tr;
}

// Tablesorter duplicate: header row INSIDE tbody with direct th children —
// its text contains «аренд. номинал» (the /аренд/i trap).
function makeHeaderTrapRow(doc) {
  const tr = doc.createElement('tr');
  tr.classList.add('tablesorter-headerRow');
  for (const label of ['№', 'Игрок', 'Воз', 'аренд. номинал']) {
    const th = doc.createElement('th');
    th.textContent = label;
    tr.appendChild(th);
  }
  return tr;
}

function addSquadTable(doc, { tab = false, tabText = 'Аренды', withTable = true, rows = [] } = {}) {
  if (tab) {
    const tabEl = doc.createElement('a');
    tabEl.classList.add('tpanel-a');
    tabEl.attrs = { 'data-tp': '-1' };
    tabEl.textContent = tabText;
    doc.body.appendChild(tabEl);
  }
  let table = null;
  let tbody = null;
  if (withTable) {
    table = doc.createElement('table');
    table.id = 'generallist';
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    for (let i = 0; i <= 10; i++) {
      const th = doc.createElement('th');
      th.textContent = i === 10 ? 'Воз' : `h${i}`;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    tbody = doc.createElement('tbody');
    for (const row of rows) tbody.appendChild(row);
    table.appendChild(tbody);
    doc.body.appendChild(table);
  }
  return { table, tbody };
}

// --- sandbox + real module load -------------------------------------------------

function makeSandbox(doc) {
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target, options) { observers.push({ observer: this, callback: this.callback, target, options }); }
    disconnect() {}
  }

  const timers = new Map();
  let nextId = 1;
  const setTimeout = fn => { const id = nextId++; timers.set(id, fn); return id; };
  const clearTimeout = id => { timers.delete(id); };
  // Runs the debounce chain to exhaustion (bounded), like the event loop would.
  const flushTimers = () => {
    let guard = 0;
    while (timers.size && guard++ < 100) {
      const batch = [...timers.values()];
      timers.clear();
      for (const fn of batch) fn();
    }
    assert.equal(timers.size, 0, 'timer flush converged (no runaway rescheduling)');
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, Error,
    setTimeout,
    clearTimeout,
    // isVisible() only reads display/visibility; the element's inline style
    // doubles as the "computed" style in the shim.
    getComputedStyle: el => el.style,
    MutationObserver,
    location: { pathname: '/team4.php' },
    document: doc
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // Observer/timer plumbing is exposed on the DOCUMENT (the shim's DOM root),
  // so tests can drive registrations and flush the debounce queue.
  doc.__observers = observers;
  doc.__flushTimers = flushTimers;
  return sandbox;
}

function loadHelper(sandbox) {
  const source = fs.readFileSync(path.resolve(root, MODULE_PATH), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;this.__LLP = LoanLimitPanel;`, sandbox, { filename: MODULE_PATH });
  return sandbox.__LLP;
}

// ============================================================================
// T1 — old design: loan tab + legacy pl--1 rows → tab-gated totals, visible
// ============================================================================

{
  const doc = createDocument();
  addSquadTable(doc, {
    tab: true,
    rows: [
      makePlayerRow(doc, { name: 'Veteran', age: 23, legacyClass: true }),
      makePlayerRow(doc, { name: 'Youngster', age: 20, legacyClass: true }),
      makePlayerRow(doc, { name: 'Regular', age: 27 })
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T1: panel box mounted');
  assert.equal(box.style.display, 'block', 'T1: panel visible under the old design');
  assert.ok(box.innerHTML.includes('<b>2/10</b>'), `T1: total 2/10, got: ${box.innerHTML}`);
  assert.ok(box.innerHTML.includes('<b>1/5</b>'), `T1: over-23 1/5 (age 23 counts), got: ${box.innerHTML}`);
  assert.equal(LLP.getLoanRows().length, 2, 'T1: exactly the two legacy pl--1 rows detected');
  console.log('T1 ok: old design (tab «Аренды» + pl--1 rows) → 2/10, 1/5, visible');
}

// ============================================================================
// T2 — new markup: no tab, span.player-loan rows → row-based, visible
// ============================================================================

{
  const doc = createDocument();
  addSquadTable(doc, {
    tab: false,
    rows: [
      makePlayerRow(doc, { name: 'LoanA', age: 20, loan: true }),
      makePlayerRow(doc, { name: 'LoanB', age: 25, loan: true }),
      makePlayerRow(doc, { name: 'LoanC', age: 30, loan: true }),
      makePlayerRow(doc, { name: 'Plain1', age: 24 }),
      makePlayerRow(doc, { name: 'LoanHidden', age: 30, loan: true, hidden: true })
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T2: panel box mounted');
  assert.equal(box.style.display, 'block', 'T2: panel visible without any loan tab (row-based activity)');
  assert.ok(box.innerHTML.includes('<b>3/10</b>'), `T2: total 3/10 (hidden row excluded), got: ${box.innerHTML}`);
  assert.ok(box.innerHTML.includes('<b>2/5</b>'), `T2: over-23 2/5 (ages 25+30), got: ${box.innerHTML}`);
  assert.equal(LLP.getLoanRows().length, 3, 'T2: exactly the visible loan-marked rows detected');
  assert.equal(LLP.isLoanTabActive(), true, 'T2: row-based activity true without a tab');
  console.log('T2 ok: new markup (span.player-loan, no tab) → 3/10, 2/5, visible');
}

// ============================================================================
// T3 — tablesorter header-row trap: «аренд. номинал» row is not a loan row
// ============================================================================

{
  const doc = createDocument();
  addSquadTable(doc, {
    tab: false,
    rows: [
      makePlayerRow(doc, { name: 'LoanA', age: 22, loan: true }),
      makePlayerRow(doc, { name: 'LoanB', age: 30, loan: true }),
      makeHeaderTrapRow(doc)
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T3: panel box mounted');
  assert.equal(box.style.display, 'block', 'T3: panel visible');
  assert.equal(LLP.getLoanRows().length, 2, 'T3: header row excluded from loan rows');
  assert.ok(box.innerHTML.includes('<b>2/10</b>'), `T3: total 2/10, got: ${box.innerHTML}`);
  assert.ok(!box.innerHTML.includes('3/10'), 'T3: header row never inflates the count');
  console.log('T3 ok: tablesorter-headerRow («аренд. номинал») not counted');
}

// ============================================================================
// T4 — no anchors (no #generallist): mount/render are silent no-ops
// ============================================================================

{
  const doc = createDocument();
  const LLP = loadHelper(makeSandbox(doc));

  assert.doesNotThrow(() => LLP.mount(), 'T4: mount is a silent no-op without #generallist');
  assert.doesNotThrow(() => LLP.render(), 'T4: render is a silent no-op without #generallist');
  assert.equal(doc.getElementById(BOX_ID), null, 'T4: panel box absent');
  assert.equal(doc.__observers.length, 0, 'T4: no MutationObserver registered without #generallist');
  assert.equal(LLP.isLoanTabActive(), false, 'T4: activity false without anchors');
  console.log('T4 ok: no #generallist → silent no-op, box absent, no observer');
}

// ============================================================================
// T5 — no loan rows (empty squad): fail-closed hidden panel, no crash
// ============================================================================

{
  const doc = createDocument();
  const { table } = addSquadTable(doc, {
    tab: false,
    rows: [makePlayerRow(doc, { name: 'Plain1', age: 24 }), makePlayerRow(doc, { name: 'Plain2', age: 19 })]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T5: box still mounts after the table (mount point intact)');
  assert.equal(box.parentNode, table.parentNode, 'T5: box is a sibling of #generallist');
  assert.equal(box.style.display, 'none', 'T5: panel hidden with no loan rows (fail-closed)');
  assert.equal(LLP.readLoanState().total, 0, 'T5: zero loan rows counted');
  assert.equal(LLP.isLoanTabActive(), false, 'T5: row-based activity false for an empty squad');
  console.log('T5 ok: empty squad → box mounted but display:none, no crash');
}

// ============================================================================
// T6 — MutationObserver: registered on #generallist, callback re-renders
// ============================================================================

{
  const doc = createDocument();
  const { table, tbody } = addSquadTable(doc, {
    tab: false,
    rows: [makePlayerRow(doc, { name: 'LoanA', age: 21, loan: true })]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  assert.equal(doc.__observers.length, 1, 'T6: MutationObserver registered on mount');
  const registration = doc.__observers[0];
  assert.equal(registration.target, table, 'T6: observer watches #generallist');
  assert.equal(registration.options.childList, true, 'T6: childList observation');
  assert.equal(registration.options.subtree, true, 'T6: subtree observation');

  const box = doc.getElementById(BOX_ID);
  assert.ok(box.innerHTML.includes('<b>1/10</b>'), `T6: initial render 1/10, got: ${box.innerHTML}`);

  // Simulate a site mutation: another loaned player appears in the table.
  tbody.appendChild(makePlayerRow(doc, { name: 'LoanB', age: 25, loan: true }));
  registration.callback([], registration.observer);
  doc.__flushTimers();

  assert.ok(box.innerHTML.includes('<b>2/10</b>'), `T6: re-render after mutation → 2/10, got: ${box.innerHTML}`);
  assert.ok(box.innerHTML.includes('<b>1/5</b>'), `T6: over-23 updated to 1/5 (age 25), got: ${box.innerHTML}`);
  console.log('T6 ok: mutation callback → debounced re-render (1/10 → 2/10)');
}

// ============================================================================
// T7 — dedupe union: a row matching BOTH anchors (legacy pl--1 class AND
//      span.player-loan child) is counted exactly once; visibility:hidden
//      loan rows are not counted
// ============================================================================

{
  const doc = createDocument();
  // Matches BOTH anchors at once: legacy tr.view-team__player.pl--1 AND a
  // span.player-loan descendant (also matches the new-markup tbody query).
  const bothRow = makePlayerRow(doc, { name: 'BothAnchors', age: 25, loan: true, legacyClass: true });
  const visHiddenRow = makePlayerRow(doc, { name: 'LoanVisHidden', age: 30, loan: true, visibilityHidden: true });
  addSquadTable(doc, {
    tab: false,
    rows: [
      bothRow,
      makePlayerRow(doc, { name: 'LegacyOnly', age: 20, legacyClass: true }),
      makePlayerRow(doc, { name: 'LoanOnly', age: 30, loan: true }),
      makePlayerRow(doc, { name: 'Plain1', age: 24 }),
      visHiddenRow
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T7: panel box mounted');
  assert.equal(box.style.display, 'block', 'T7: panel visible');
  const loanRows = LLP.getLoanRows();
  assert.equal(loanRows.length, 3, 'T7: union counts the dual-anchor row ONCE — 3 loan rows (BothAnchors, LegacyOnly, LoanOnly), not 4');
  assert.equal(loanRows.filter(row => row === bothRow).length, 1, 'T7: the pl--1 + span.player-loan row is present exactly once (Set dedupe)');
  assert.ok(!loanRows.includes(visHiddenRow), 'T7: visibility:hidden loan row is NOT counted');
  assert.ok(box.innerHTML.includes('<b>3/10</b>'), `T7: total 3/10 (dedupe + hidden excluded), got: ${box.innerHTML}`);
  assert.ok(box.innerHTML.includes('<b>2/5</b>'), `T7: over-23 2/5 (ages 25+30; visibility:hidden age 30 excluded), got: ${box.innerHTML}`);
  console.log('T7 ok: dedupe union (both-anchor row counted once) + visibility:hidden row not counted');
}

// ============================================================================
// T8 — tab-gating boundary: a PRESENT .tpanel-a[data-tp="-1"] tab with
//      NON-matching text is NOT overridden by the new row anchor (legacy
//      pl--1 fallback only → inactive); companion: a present MATCHING tab
//      wins (active) even when the new row anchor is also present;
//      third block: the same present NON-matching tab with visible legacy
//      pl--1 rows (no span.player-loan rows) → ACTIVE via the pre-#353
//      fallback line (positive pin: regression to `return false;` fails here)
// ============================================================================

{
  // Main case: tab exists with non-loan text «Основная команда» + visible
  // span.player-loan rows, legacy pl--1 rows ABSENT. Tab-based decision:
  // /аренд/i does not match the tab text, the legacy pl--1 fallback finds
  // nothing → isLoanTabActive() false → panel display:none, even though
  // getLoanRows() would find span.player-loan rows.
  const doc = createDocument();
  addSquadTable(doc, {
    tab: true,
    tabText: 'Основная команда',
    rows: [
      makePlayerRow(doc, { name: 'LoanA', age: 21, loan: true }),
      makePlayerRow(doc, { name: 'LoanB', age: 26, loan: true })
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T8: panel box mounted');
  assert.equal(LLP.isLoanTabActive(), false, 'T8: present non-matching tab → inactive (new row anchor must NOT override the tab gate)');
  assert.equal(box.style.display, 'none', 'T8: panel stays display:none (legacy tab-gating preserved)');
  assert.ok(LLP.getLoanRows().length > 0, 'T8: loan rows ARE detected by the union — the tab gate is what keeps the panel hidden');
  console.log('T8 ok: present non-matching tab («Основная команда») + span.player-loan rows, no pl--1 → inactive, display:none');
}

{
  // Companion: same present tab WITH matching «аренда» text → tab branch
  // wins (legacy active behaviour) even though the new span.player-loan
  // anchor is also present in the fixture.
  const doc = createDocument();
  addSquadTable(doc, {
    tab: true,
    tabText: 'Аренды',
    rows: [makePlayerRow(doc, { name: 'LoanNew', age: 21, loan: true })]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T8: companion panel box mounted');
  assert.equal(LLP.isLoanTabActive(), true, 'T8: matching tab text → active (tab branch wins over the row anchor)');
  assert.equal(box.style.display, 'block', 'T8: companion panel visible (legacy tab behaviour)');
  assert.ok(box.innerHTML.includes('<b>1/10</b>'), `T8: union anchor still counted under an active tab (1/10), got: ${box.innerHTML}`);
  console.log('T8 ok: companion — present matching tab («Аренды») wins even with the new anchor present → active, visible');
}

{
  // Third block — POSITIVE pin on the legacy pl--1 fallback line inside the
  // tab-present branch (peer-review gap F2). Tab exists with NON-matching
  // text, NO span.player-loan rows anywhere, but VISIBLE legacy
  // tr.view-team__player.pl--1 rows (one visible, one display:none — legacy
  // row shape, age in the «Воз» cell). The pre-#353 fallback
  // (`[...document.querySelectorAll('tr.view-team__player.pl--1')]
  // .some(isVisible)`) must activate the panel and the exact legacy totals
  // must be rendered from those rows. Replacing the fallback line with
  // `return false;` keeps the two T8 gating blocks green — only this block
  // catches that regression.
  const doc = createDocument();
  addSquadTable(doc, {
    tab: true,
    tabText: 'Основная команда',
    rows: [
      makePlayerRow(doc, { name: 'LegacyLoan', age: 25, legacyClass: true }),
      makePlayerRow(doc, { name: 'LegacyHidden', age: 30, legacyClass: true, hidden: true }),
      makePlayerRow(doc, { name: 'Plain1', age: 24 })
    ]
  });
  const LLP = loadHelper(makeSandbox(doc));
  LLP.mount();

  const box = doc.getElementById(BOX_ID);
  assert.ok(box, 'T8: legacy-fallback panel box mounted');
  assert.equal(LLP.isLoanTabActive(), true, 'T8: present non-matching tab + visible legacy pl--1 rows → ACTIVE (pre-#353 fallback line restored)');
  assert.equal(box.style.display, 'block', 'T8: legacy fallback path leaves the panel visible, not fail-closed');
  assert.equal(LLP.getLoanRows().length, 1, 'T8: exactly the visible pl--1 row counted (hidden pl--1 row excluded, no span.player-loan rows planted)');
  assert.ok(box.innerHTML.includes('<b>1/10</b>'), `T8: legacy totals 1/10 from the pl--1 rows, got: ${box.innerHTML}`);
  assert.ok(box.innerHTML.includes('<b>1/5</b>'), `T8: legacy over-23 1/5 (visible age 25; hidden age 30 excluded), got: ${box.innerHTML}`);
  console.log('T8 ok: legacy fallback pin — present non-matching tab + visible pl--1 rows, no span.player-loan → ACTIVE, 1/10, 1/5');
}

console.log('loan limit fm2026: T1-T8 (old design, new markup, header trap, no-op, fail-closed, observer, dedupe union, tab-gating boundary + legacy pl--1 fallback pin): OK');
