#!/usr/bin/env node
// SLF issue #356 — boot hardening: one synchronous failure in the init chain
// must never permanently kill the rest of the chain. Loads the REAL production
// sources (unmodified) in vm contexts with a minimal jsdom-free DOM shim (same
// pattern as test-loan-limit-fm2026.mjs from #353 / test-tactic-dropdown-mount.mjs
// from #351). Env overrides for the RED proof against base sources:
//   SLF_BOOTSTRAP_PATH, SLF_TRAINING_GUIDE_PATH, SLF_TEAM4_PATH.
//
// bootstrap.js is a bundle SEGMENT: the IIFE opener lives in
// bootstrap-preamble.js and the segment itself ends with `})();`. The loader
// reproduces the bundle wrapping, drops the `App.start();` self-start (tests
// drive start()/mountUI() explicitly) and exposes App as a TEST-ONLY handle
// (no production export — the debug boundary in check-bundle-order.mjs forbids
// any page-global SLF export).
//
// Pre-fix failure map (base e775f72; reproduce with the three env vars pointed
// at `git show e775f72:<path>` copies):
//   T1  RED  (base bootstrap): mountUI has zero try/catch — TrainingGuidePanel.mount
//       throws → LoanLimitPanel.mount and UI.addDropdown never run in that pass,
//       DomUtils.installObserver is never registered (start() aborts before it)
//       and the error propagates out of start().
//   T2  RED  (base bootstrap): every individually-throwing step (all 6 variants)
//       aborts the tail: steps after the failing one never run, no failure is
//       logged, and for the LAST step (tactics-dropdown) the error propagates
//       out of mountUI on every observer pass.
//   T3a RED  (base training-reference-guide): eval-time self-start mount() with
//       document.body = null throws at the `(document.querySelector('.pad2')||
//       document.body).appendChild(panel)` fallback (no @run-at → document-start
//       eval is possible) and kills the rest of the bundle; no DOMContentLoaded
//       deferral exists.
//   T3b green pre-fix (preservation guard): with document.body present the
//       eval-time mount still mounts + is idempotent on both base and fix.
//   T4a RED  (base team4 adapter): decorate() overwrites an existing
//       data-slf-mount — bootstrap's `fm2026-training-before-champ` on the
//       training guide panel is clobbered to `fm2026-training-content`.
//   T4b green pre-fix (preservation guard): a node WITHOUT a marker still gets
//       the adapter value on both base and fix.
//
// Pins:
//   T1  TrainingGuidePanel.mount THROWS via App.start() (readyState complete,
//       PresetStorage callback synchronous) → LoanLimitPanel.mount AND
//       UI.addDropdown still ran in the same pass; DomUtils.installObserver
//       still registered; failure logged with the established message format
//       («[SLF] training-guide-mount failed; continuing startup» + the original
//       error object).
//   T2  loop over all 6 init steps (match-parser-panel, tactic-preset-library,
//       training-guide-mount, training-benchmarks-card, loan-limit-panel,
//       tactics-dropdown), each rigged to throw in its own fresh sandbox:
//       head steps ran, tail steps still ran, exactly ONE failure logged with
//       the exact per-step message, and mountUI never propagates (the last
//       step's throw must not escape on any observer pass). The benchmarks-card
//       step is thrown via its real DOM path (/train.php + .train__champ whose
//       parent has no insertBefore); the tactic-preset-library step via a
//       throwing getter on the sandbox global (even a `void` read must not
//       kill the chain).
//   T3a eval-time TrainingGuidePanel.mount() with document.body = null → no
//       throw and mount deferred via a captured document.addEventListener
//       ('DOMContentLoaded', fn, { once: true }) registration.
//   T3b document.body present → eval-time mount still mounts (panel appended),
//       and a second mount() call is a no-op (idempotence semantics kept).
//   T4a node with dataset.slfMount = 'fm2026-training-before-champ' is NOT
//       overwritten by decorate(..., 'fm2026-training-content').
//   T4b node without a marker GETS 'fm2026-team-content'.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOTSTRAP_PATH = process.env.SLF_BOOTSTRAP_PATH || 'src/app/bootstrap.js';
const TRAINING_GUIDE_PATH = process.env.SLF_TRAINING_GUIDE_PATH
  || 'src/modules/team-management/training-reference-guide.js';
const TEAM4_PATH = process.env.SLF_TEAM4_PATH
  || 'src/modules/team-management/team4-leadership-upgrade-indicator.js';

// --- minimal DOM shim (only what the tested code paths touch) -----------------

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
    // dataset proxies onto data-* attributes (camelCase → kebab), so selector
    // matching on [data-slf-mount="…"] sees what decorate()/bootstrap wrote.
    const kebab = name => String(name).replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
    this.dataset = new Proxy({}, {
      get: (_t, prop) => typeof prop !== 'string' ? undefined : this.attrs[`data-${kebab(prop)}`],
      set: (_t, prop, value) => { if (typeof prop === 'string') this.attrs[`data-${kebab(prop)}`] = String(value); return true; },
      has: (_t, prop) => typeof prop === 'string' && Object.hasOwn(this.attrs, `data-${kebab(prop)}`),
      deleteProperty: (_t, prop) => { if (typeof prop === 'string') delete this.attrs[`data-${kebab(prop)}`]; return true; }
    });
  }

  get parentElement() { return this.parentNode; }
  get children() { return this._children; }

  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value ?? ''); }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value ?? ''); }

  appendChild(node) {
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = this;
    this._children.push(node);
    return node;
  }

  contains(node) {
    if (node === this) return true;
    return this._children.some(child => child.contains(node));
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

// Selector subset used by the tested paths: tag / #id / .class / [attr="v"],
// ',' alternatives, whitespace-descendant parts ('.team #generallist').
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
      const m = token.slice(1, -1).match(/^([^*=]+)(\*?=)(.*)$/) || token.slice(1, -1).match(/^([^*=]+)()()$/);
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

function createDocument({ readyState = 'complete' } = {}) {
  const doc = { readyState };
  doc.head = new ShimElement(doc, 'head');
  doc.body = new ShimElement(doc, 'body');
  doc.documentElement = new ShimElement(doc, 'html');
  doc.createElement = tag => new ShimElement(doc, tag);
  const roots = () => [doc.head, doc.body].filter(Boolean);
  const findByIdIn = (node, id) => {
    if (node.id === id) return node;
    for (const child of node._children) {
      const found = findByIdIn(child, id);
      if (found) return found;
    }
    return null;
  };
  doc.getElementById = id => {
    for (const rootEl of roots()) {
      const found = findByIdIn(rootEl, id);
      if (found) return found;
    }
    return null;
  };
  doc.querySelectorAll = selector => {
    const out = [];
    const descend = node => {
      if (selector.split(',').some(alt => matchesDescendant(node, alt.trim()))) out.push(node);
      for (const child of node._children) descend(child);
    };
    for (const rootEl of roots()) descend(rootEl);
    return out;
  };
  doc.querySelector = selector => doc.querySelectorAll(selector)[0] || null;
  doc.__domListeners = [];
  doc.addEventListener = (type, fn, options) => { doc.__domListeners.push({ type, fn, opts: options }); };
  return doc;
}

// --- sandboxes ------------------------------------------------------------------

function makeSandbox(doc, { pathname = '/team4.php', search = '' } = {}) {
  const warnings = [];
  const sandbox = {
    console: { log() {}, warn: (...args) => warnings.push(args), error() {}, info() {}, debug() {} },
    Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, RegExp, Error, TypeError,
    setTimeout: () => 0,
    clearTimeout: () => {},
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
    location: { pathname, search },
    document: doc
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__warnings = warnings;
  return sandbox;
}

// bootstrap.js is a bundle segment: reproduce the IIFE wrapping, drop the
// self-start, expose App as a test-only handle.
function loadBootstrap(sandbox) {
  const raw = fs.readFileSync(path.resolve(root, BOOTSTRAP_PATH), 'utf8');
  const segment = raw
    .replace(/^\s*App\.start\(\);\s*$/m, '')
    .replace(/\}\)\(\);\s*$/, 'globalThis.__SLF_BOOT_APP = App;\n})();');
  const source = `(function () {\n'use strict';\n${segment}`;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: BOOTSTRAP_PATH });
  return sandbox.__SLF_BOOT_APP;
}

function loadTrainingGuide(sandbox) {
  const source = fs.readFileSync(path.resolve(root, TRAINING_GUIDE_PATH), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;globalThis.__SLF_TGP = TrainingGuidePanel;`, sandbox, { filename: TRAINING_GUIDE_PATH });
  return sandbox.__SLF_TGP;
}

function loadTeam4(sandbox) {
  const source = fs.readFileSync(path.resolve(root, TEAM4_PATH), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: TEAM4_PATH });
}

// Shared mountUI stub set; the rig replaces the single step that must throw.
function makeBootstrapEnv({ pathname = '/team4.php', search = '' } = {}) {
  const doc = createDocument();
  const sandbox = makeSandbox(doc, { pathname, search });
  const calls = [];
  sandbox.UI = {
    addMatchParserPanel: () => calls.push('match-parser-panel'),
    addDropdown: () => calls.push('tactics-dropdown')
  };
  sandbox.TacticPresetLibraryPanel = {};
  sandbox.TrainingGuidePanel = { mount: () => calls.push('training-guide-mount') };
  sandbox.LoanLimitPanel = { mount: () => calls.push('loan-limit-panel') };
  sandbox.TransferMarketAnalyzer = { start: () => calls.push('transfer-analyzer') };
  sandbox.PresetStorage = { loadFromServerAndMerge: callback => callback() };
  sandbox.DomUtils = { installObserver: () => calls.push('install-observer') };
  return { doc, sandbox, calls };
}

// --- runner (collects every failing case so a RED run prints the full map) ------

const failures = [];
function testCase(name, fn) {
  try {
    fn();
    console.log(`${name}: ok`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`${name}: FAIL — ${error.message}`);
  }
}

// ============================================================================
// T1 — mountUI continuation: TrainingGuidePanel.mount throws, the rest of the
//      chain still runs in the SAME pass and the failure is logged with the
//      established format. RED pre-fix (missing-tail semantics).
// ============================================================================

testCase('T1 mountUI continuation (training-guide-mount throws)', () => {
  const { sandbox, calls } = makeBootstrapEnv();
  const thrown = new Error('boom training-guide-mount');
  sandbox.TrainingGuidePanel = { mount: () => { calls.push('training-guide-mount'); throw thrown; } };
  const App = loadBootstrap(sandbox);

  let propagated = null;
  try { App.start(); } catch (error) { propagated = error; }
  assert.equal(propagated, null, 'start() must not propagate a single mount step failure');

  assert.ok(calls.includes('match-parser-panel'), 'match-parser-panel ran before the failure');
  assert.ok(calls.includes('training-guide-mount'), 'training-guide-mount ran (and threw)');
  assert.ok(calls.includes('loan-limit-panel'), 'LoanLimitPanel.mount still ran in the same pass');
  assert.ok(calls.includes('tactics-dropdown'), 'UI.addDropdown still ran in the same pass');
  assert.ok(calls.includes('install-observer'), 'DomUtils.installObserver still registered after the throwing pass');

  assert.equal(sandbox.__warnings.length, 1, 'exactly one failure logged for the single throwing step');
  const [message, error] = sandbox.__warnings[0];
  assert.match(String(message), /^\[SLF\] training-guide-mount failed; continuing startup$/, 'established message format');
  assert.equal(error, thrown, 'the original error object is passed through');
});

// ============================================================================
// T2 — every init step individually throwing (6 variants) still lets the
//      later steps run; the LAST step's throw must not escape mountUI.
// ============================================================================

const T2_STEPS = [
  {
    name: 'match-parser-panel',
    rig: (env, thrown) => { env.sandbox.UI.addMatchParserPanel = () => { throw thrown; }; },
    tail: ['training-guide-mount', 'training-benchmarks-card', 'loan-limit-panel', 'tactics-dropdown'],
    head: []
  },
  {
    name: 'tactic-preset-library',
    // Even a failed READ of `TacticPresetLibraryPanel` must not kill the chain:
    // the rig deletes the sandbox global so the unqualified `void` read throws
    // a ReferenceError (the same accident class as a bundle-order regression
    // dropping the provider; plain bundle consts cannot throw, but the guard
    // contains any throw at this step either way).
    rig: env => { delete env.sandbox.TacticPresetLibraryPanel; },
    throwsReferenceError: true,
    tail: ['training-guide-mount', 'training-benchmarks-card', 'loan-limit-panel', 'tactics-dropdown'],
    head: ['match-parser-panel']
  },
  {
    name: 'training-guide-mount',
    rig: (env, thrown) => { env.sandbox.TrainingGuidePanel = { mount: () => { throw thrown; } }; },
    tail: ['training-benchmarks-card', 'loan-limit-panel', 'tactics-dropdown'],
    head: ['match-parser-panel']
  },
  {
    name: 'training-benchmarks-card',
    // Thrown via the REAL step path: /train.php + a .train__champ whose parent
    // (the shim body) has no insertBefore → the placement call throws.
    rig: null,
    domRig: env => {
      env.sandbox.location.pathname = '/train.php';
      env.sandbox.location.search = '';
      const panel = env.doc.createElement('div');
      panel.id = 'slf-training-guide-panel';
      env.doc.body.appendChild(panel);
      const champ = env.doc.createElement('div');
      champ.classList.add('train__champ');
      env.doc.body.appendChild(champ);
    },
    tail: ['loan-limit-panel', 'tactics-dropdown'],
    head: ['match-parser-panel', 'training-guide-mount']
  },
  {
    name: 'loan-limit-panel',
    rig: (env, thrown) => { env.sandbox.LoanLimitPanel = { mount: () => { throw thrown; } }; },
    tail: ['tactics-dropdown'],
    head: ['match-parser-panel', 'training-guide-mount', 'training-benchmarks-card']
  },
  {
    name: 'tactics-dropdown',
    rig: (env, thrown) => { env.sandbox.UI.addDropdown = () => { throw thrown; }; },
    tail: [],
    head: ['match-parser-panel', 'training-guide-mount', 'training-benchmarks-card', 'loan-limit-panel']
  }
];

for (const step of T2_STEPS) {
  testCase(`T2 step «${step.name}» throws → tail continues`, () => {
    const env = makeBootstrapEnv();
    const thrown = new Error(`boom ${step.name}`);
    if (step.rig) step.rig(env, thrown);
    else step.domRig(env, thrown);
    const App = loadBootstrap(env.sandbox);
    // Spy the placement step so its "ran" fact is observable in every variant
    // except its own (where the real method runs and throws via the DOM rig).
    if (step.name !== 'training-benchmarks-card') {
      App.placeTrainingGuideBeforeChampAverages = () => env.calls.push('training-benchmarks-card');
    }

    let propagated = null;
    try { App.mountUI(); } catch (error) { propagated = error; }
    assert.equal(propagated, null, 'a single step failure must never propagate out of mountUI');

    for (const entry of step.head) {
      assert.ok(env.calls.includes(entry), `head step ran: ${entry}`);
    }
    for (const entry of step.tail) {
      assert.ok(env.calls.includes(entry), `tail step still ran after «${step.name}» threw: ${entry}`);
    }
    assert.equal(env.sandbox.__warnings.length, 1, 'exactly one failure logged');
    const [message, error] = env.sandbox.__warnings[0];
    assert.match(String(message), new RegExp(`^\\[SLF\\] ${step.name} failed; continuing startup$`), 'established message format');
    if (step.throwsReferenceError) assert.equal(error?.constructor?.name, 'ReferenceError', 'the failed symbol read (ReferenceError) is passed through (cross-realm safe: name check)');
    else if (step.rig) assert.equal(error, thrown, 'the original error object is passed through');
    else assert.equal(error?.constructor?.name, 'TypeError', 'the natural DOM TypeError is passed through (cross-realm safe: name check)');
  });
}

// ============================================================================
// T3a — body-null guard: eval-time self-start with document.body = null must
//       not throw and must defer mount to DOMContentLoaded.
// ============================================================================
testCase('T3a body-null at eval → deferred to DOMContentLoaded, no throw', () => {
  const doc = createDocument({ readyState: 'loading' });
  doc.body = null;
  const sandbox = makeSandbox(doc, { pathname: '/train.php' });
  sandbox.Api = { getPromise: () => new Promise(() => {}) };

  let evalError = null;
  try { loadTrainingGuide(sandbox); } catch (error) { evalError = error; }
  assert.equal(evalError, null, 'eval-time self-start must not throw when document.body is null');

  const registration = doc.__domListeners.find(item => item.type === 'DOMContentLoaded');
  assert.ok(registration, 'mount deferred via a DOMContentLoaded listener registration');
  assert.equal(typeof registration.fn, 'function', 'deferral registers a callable handler');
  assert.equal(registration.opts && registration.opts.once, true, 'deferral is a once-listener');
});

// T3b — preservation guard: body present → eval-time mount still mounts and
// stays idempotent (green pre-fix too).
testCase('T3b body present → eval-time mount mounts, second mount is a no-op', () => {
  const doc = createDocument();
  const sandbox = makeSandbox(doc, { pathname: '/train.php' });
  sandbox.Api = { getPromise: () => new Promise(() => {}) };
  for (const id of ['slf-calc', 'slf-sources', 'slf-result']) {
    const el = doc.createElement('div');
    el.id = id;
    doc.body.appendChild(el);
  }

  const TGP = loadTrainingGuide(sandbox);
  const panel = doc.getElementById('slf-training-guide-panel');
  assert.ok(panel, 'panel mounted at eval time when body exists');
  assert.equal(panel.parentNode, doc.body, 'panel appended to the fallback root');
  assert.equal(doc.body._children.filter(node => node.id === 'slf-training-guide-panel').length, 1, 'exactly one panel');

  assert.doesNotThrow(() => TGP.mount(), 'second mount() call is an idempotent no-op');
  assert.equal(doc.body._children.filter(node => node.id === 'slf-training-guide-panel').length, 1, 'idempotence: still exactly one panel');
});

// ============================================================================
// T4 — decorate() single-owner marker: an existing data-slf-mount wins.
// ============================================================================

testCase('T4a decorate keeps an existing data-slf-mount (bootstrap marker wins)', () => {
  const doc = createDocument();
  const root = doc.createElement('div');
  root.classList.add('content-ui__wrapper');
  doc.body.appendChild(root);
  const panel = doc.createElement('div');
  panel.id = 'slf-training-guide-panel';
  panel.dataset.slfMount = 'fm2026-training-before-champ'; // bootstrap.js:28 marker
  root.appendChild(panel);
  const notice = doc.createElement('div');
  notice.id = 'slf-team4-form-saved-choice-notice';
  root.appendChild(notice);

  const sandbox = makeSandbox(doc);
  doc.documentElement.dataset.slfDesign = 'fm2026';
  loadTeam4(sandbox); // IIFE self-starts → adapt() decorates immediately

  assert.equal(panel.dataset.slfMount, 'fm2026-training-before-champ', 'existing marker NOT overwritten (RED pre-fix: clobbered to fm2026-training-content)');
});

testCase('T4b decorate stamps nodes without a marker (preservation guard)', () => {
  const doc = createDocument();
  const root = doc.createElement('div');
  root.classList.add('content-ui__wrapper');
  doc.body.appendChild(root);
  const notice = doc.createElement('div');
  notice.id = 'slf-team4-form-saved-choice-notice';
  root.appendChild(notice);

  const sandbox = makeSandbox(doc);
  doc.documentElement.dataset.slfDesign = 'fm2026';
  loadTeam4(sandbox);

  assert.equal(notice.dataset.slfMount, 'fm2026-team-content', 'node without a marker GETS the adapter value');
});

// --- summary ---------------------------------------------------------------------

if (failures.length) {
  console.error(`boot continuation: ${failures.length} failing case(s):`);
  for (const { name, error } of failures) console.error(`  - ${name}: ${error.message}`);
  process.exit(1);
}
console.log('boot continuation: T1-T4 (mountUI continuation, 6 per-step throw variants, body-null deferral, decorate single-owner marker): OK');
