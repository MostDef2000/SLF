#!/usr/bin/env python3
"""E2E: β design (mint-seg button groups) tactic controls vs releases/latest.user.js.

Direct run:  python3 tests/browser/test_beta_tcseg_controls.py   (from repo root)
Pytest run:  pytest tests/browser/test_beta_tcseg_controls.py

Oracle: observable DOM/window state only — production bundle exposes no test
globals (except the documented window.SLF.scriptVersion used by the version
assert). Each case asserts against the fixture's recorders:
  window.__betaClicks        native β seg clicks {key,value,ts}
  window.__slfRequests       GM_xmlhttpRequest telemetry
  window.__slfNativeFetches  native fetch/XHR telemetry
"""
from __future__ import annotations

import json
import re
import shutil
import threading
import traceback
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "beta-owned-live-match.html"
ROUTES = {"/game.php": FIXTURE}
ARTIFACTS_DIR = ROOT / "tests" / "browser" / "artifacts"

CANONICAL_KEYS = [
    "def_line", "press_line", "def_width", "press_intense", "build_type",
    "build_temp", "build_long", "build_fast", "style", "pass_risk",
    "dribble", "cross", "corner", "shot",
]
# fixture seed: every canonical key is-on "1" except def_line "2"
SEED = {k: "1" for k in CANONICAL_KEYS}
SEED["def_line"] = "2"
# mixed-representation probe: the legacy radio group `style` is checked ("2")
# and is the control of record for that key at seed — the β seg for `style`
# is deliberately seeded to a DIFFERENT value ("1") to verify the script
# treats the radio as authoritative and never touches that seg.
SEED["style"] = "2"

LAB_READY_TEXT = "Применить эксперимент"
LAB_LOADING_TEXT = "Тактика загружается…"

# ── JS snippets (observable state readers) ──────────────────────────────────
READ_ALL_JS = """() => {
  const out = {};
  document.querySelectorAll('.tc-seg[data-option]').forEach((seg) => {
    const on = seg.querySelector('button.is-on');
    out[seg.getAttribute('data-option')] = on ? on.getAttribute('data-value') : null;
  });
  // mixed representation: a checked radio is the control of record for its
  // key — it overrides the β seg read (mirrors the script's radio-first rule)
  const styleRadio = document.querySelector('input[type="radio"][name="style"]:checked');
  if (styleRadio) out['style'] = styleRadio.value;
  return out;
}"""

CLICK_PAIRS_JS = "() => (window.__betaClicks || []).map((c) => c.key + '=' + c.value)"

CLICKS_LEN_JS = "() => (window.__betaClicks || []).length"

MANUAL_TELEMETRY_COUNT_JS = """() => (window.__slfRequests || []).filter((r) =>
  String(r.url || '').indexOf('preset_events') !== -1 &&
  String(r.data || '').indexOf('manual_change') !== -1 &&
  String(r.data || '').indexOf('def_line') !== -1
).length"""

DROPDOWN_MOUNT_JS = """() => {
  const dd = document.querySelector('#slf-tactics-dropdown');
  if (!dd) return { exists: false };
  const parser = document.querySelector('#slf-match-parser-panel');
  const cf1 = document.querySelector('.control_field_1');
  const prev = dd.previousElementSibling;
  return {
    exists: true,
    count: document.querySelectorAll('#slf-tactics-dropdown').length,
    prevIsParser: !!parser && prev === parser,
    prevIsCf1: !parser && !!cf1 && prev === cf1,
    prevDesc: prev ? (prev.id || prev.className) : null
  };
}"""

APPLY_BTN_RE = re.compile("примен", re.I)


# ── server / page harness ────────────────────────────────────────────────────
class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        f = ROUTES.get(path)
        if f is None or not Path(f).exists():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"not found")
            return
        body = Path(f).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _start_server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _url(srv, query=""):
    # served under /game.php so location.pathname.includes('/game.php') is true
    return f"http://127.0.0.1:{srv.server_address[1]}/game.php?id=1001{query}"


def assert_script_version(page):
    expected = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]
    actual = page.evaluate("() => (window.SLF && window.SLF.scriptVersion) || null")
    assert actual == expected, f"scriptVersion mismatch: {actual!r} != {expected!r}"
    return expected


@contextmanager
def case(name, query=""):
    assert ARTIFACT.exists(), f"missing artifact {ARTIFACT} — run from repo root"
    assert FIXTURE.exists(), f"missing fixture {FIXTURE}"
    srv = _get_server()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1366, "height": 900}).new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"[{name}] console.{m.type}: {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"[{name}] pageerror: {e}"))
        try:
            page.goto(_url(srv, query), wait_until="domcontentloaded")
            page.add_script_tag(path=str(ARTIFACT))
            assert_script_version(page)
            yield page, logs
        except Exception:
            try:
                page.screenshot(path=str(ARTIFACTS_DIR / f"{name}.png"), full_page=True)
            except Exception:
                pass
            try:
                (ARTIFACTS_DIR / f"{name}.log").write_text("\n".join(logs), encoding="utf-8")
            except Exception:
                pass
            print("\n".join(logs[-60:]))
            raise
        finally:
            browser.close()


# ── module-level lazy server singleton (shared by direct runner + pytest) ────
_SERVER = None


def _get_server():
    global _SERVER
    if _SERVER is None:
        _SERVER = _start_server()
    return _SERVER


# ── deterministic preset ──────────────────────────────────────────────────────
# Verified against src/modules/tactics-presets/active-preset-registry.js:
# built-in preset `Simeone_CompactLead_v11`, dropdown option label contains
# "Simeone" AND "Compact" (full label «Diego Simeone — Compact Lead», possibly
# with a style suffix). priority: [] — priority_l/c/r checkboxes stay untouched.
PRESET_HINT_SUBSTRINGS = ("simeone", "compact")
PRESET_VECTOR = {
    "def_line": "1", "press_line": "2", "def_width": "1", "press_intense": "2",
    "build_type": "1", "build_temp": "2", "build_long": "2", "build_fast": "2",
    "style": "2", "pass_risk": "2", "dribble": "1", "cross": "2",
    "corner": "1", "shot": "1",
}
# Derived, NOT hardcoded: against the fixture seed the first apply changes
# exactly the keys where the vector differs from SEED. `style` drops out
# automatically (radio is control of record, checked "2" == preset "2").
CHANGED_KEYS = [k for k in CANONICAL_KEYS if PRESET_VECTOR[k] != SEED[k]]

# artifacts dir: cleaned at import, created if missing
if ARTIFACTS_DIR.exists():
    shutil.rmtree(ARTIFACTS_DIR)
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


# ── shared helpers ────────────────────────────────────────────────────────────
def open_compare(page, wait_key="def_line"):
    page.click('.match_tab[data-tab="compare"]')
    page.wait_for_selector(f'#tc-cards .tc-seg[data-option="{wait_key}"]', timeout=10000)


def wait_dropdown(page):
    page.wait_for_selector("#slf-tactics-dropdown", timeout=10000)


def canonical_state(page):
    state = page.evaluate(READ_ALL_JS)
    return {k: state.get(k) for k in CANONICAL_KEYS}


def clicks_len(page):
    return page.evaluate(CLICKS_LEN_JS)


def click_pairs(page):
    return page.evaluate(CLICK_PAIRS_JS)


def pageerror_lines(logs):
    return [line for line in logs if "pageerror" in line]


def select_and_apply_preset(page):
    """Pick the Simeone/Compact option in the dropdown and click its apply."""
    sel = page.locator("#slf-tactics-dropdown select").first
    opts = sel.locator("option")
    labels, chosen = [], None
    for i in range(opts.count()):
        o = opts.nth(i)
        value = o.get_attribute("value") or ""
        text = (o.inner_text() or "").strip()
        labels.append(f"{value!r}:{text!r}")
        hay = f"{value} {text}".lower()
        if chosen is None and all(s in hay for s in PRESET_HINT_SUBSTRINGS):
            chosen = i
    assert chosen is not None, (
        f"no dropdown option matching substrings {PRESET_HINT_SUBSTRINGS!r}; "
        f"actual options: {labels}"
    )
    sel.select_option(index=chosen)
    # apply button is the emoji button whose title says «Применить выбранный
    # пресет» — its visible text is an emoji, so match by title attribute
    page.locator(
        '#slf-tactics-dropdown button[title*="Применить выбранный"]'
    ).first.click()


def wait_settled(page, min_clicks, settle_ms=400):
    page.wait_for_function(
        "(n) => (window.__betaClicks || []).length >= n", arg=min_clicks, timeout=10000
    )
    page.wait_for_timeout(settle_ms)


# ── cases ─────────────────────────────────────────────────────────────────────
def test_t1_read_apply_end_to_end():
    # GM storage stubs (GM_getValue/GM_setValue, in-memory) are provided by the
    # FIXTURE — nothing to prepare here.
    with case("t1-read-apply") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        assert canonical_state(page) == SEED, "seed is-on drifted before apply"
        assert page.evaluate(READ_ALL_JS).get("press_style") is None, "unknown group has is-on"
        before = clicks_len(page)
        select_and_apply_preset(page)
        wait_settled(page, before + len(CHANGED_KEYS))
        after = page.evaluate(READ_ALL_JS)
        assert {k: after[k] for k in CANONICAL_KEYS} == PRESET_VECTOR
        assert after.get("press_style") is None, "unknown group was touched"
        pairs = click_pairs(page)[before:]
        keys = sorted({p.split("=")[0] for p in pairs})
        assert keys == sorted(CHANGED_KEYS), f"clicked keys {keys} != changed {sorted(CHANGED_KEYS)}"
        expected_pairs = {f"{k}={PRESET_VECTOR[k]}" for k in CHANGED_KEYS}
        assert set(pairs) == expected_pairs, f"click values {sorted(set(pairs))} != {sorted(expected_pairs)}"
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t2_noop_apply():
    with case("t2-noop") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        select_and_apply_preset(page)
        wait_settled(page, len(CHANGED_KEYS))
        # setup must have landed (RED on clean main: apply fails outright here)
        assert canonical_state(page) == PRESET_VECTOR, "setup apply did not reach preset state"
        len1 = clicks_len(page)
        select_and_apply_preset(page)  # same preset, state already equal → no-op
        page.wait_for_timeout(1500)
        assert clicks_len(page) == len1, "no-op apply produced clicks"
        assert canonical_state(page) == PRESET_VECTOR
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t3_all_or_nothing_preflight():
    with case("t3-preflight") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        page.evaluate("""() => {
          const seg = document.querySelector('.tc-seg[data-option="build_type"]');
          seg.closest('.tc-block').remove();
        }""")
        select_and_apply_preset(page)  # preset vector touches build_type context
        page.wait_for_timeout(1500)
        assert clicks_len(page) == 0, f"preflight leaked clicks: {click_pairs(page)}"
        # The test removed the build_type block itself, so the key is unreadable
        # after the abort (canonical_state projects it to None); everything
        # still in the DOM must equal the seed.
        strip_bt = lambda d: {k: v for k, v in d.items() if k != "build_type"}
        assert strip_bt(canonical_state(page)) == strip_bt(SEED), (
            f"preflight mutated state: {canonical_state(page)} vs {SEED}"
        )
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t4_rollback():
    with case("t4-rollback") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        page.evaluate("() => { window.__betaRejectNext = 'def_line'; }")
        select_and_apply_preset(page)
        # The native handler rejects def_line, so its is-on stays at the seed
        # value "2"; the bridge skips re-clicking a control that is already
        # correct (same contract as the radio path's !el.checked skip). Every
        # other changed key gets first-pass + restore clicks:
        # 2 * len(CHANGED_KEYS) - 1 total.
        expected_clicks = 2 * len(CHANGED_KEYS) - 1
        page.wait_for_function(
            f"() => (window.__betaClicks || []).length >= {expected_clicks}", timeout=10000
        )
        page.wait_for_timeout(800)
        assert canonical_state(page) == SEED, "rollback did not restore seed"
        pairs = click_pairs(page)
        assert "def_line=1" in pairs, "rejected click was not recorded by the fixture"
        i1 = pairs.index("def_line=1")
        assert "def_line=2" not in pairs[i1 + 1:], (
            "def_line was already at seed value; a re-click would be redundant: "
            f"{pairs[i1:]}"
        )
        assert len(pairs) == expected_clicks, (
            f"expected {expected_clicks} clicks (first-pass + restore, def_line restore skipped), got {pairs}"
        )
        # failure-UI state is NOT asserted here — the bridge handles it silently.
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t5_lab_ready_on_late_cards():
    with case("t5-lab-ready") as (page, logs):
        page.evaluate("() => { window.__betaCardsDelay = 1200; }")
        page.click('.match_tab[data-tab="compare"]')
        page.wait_for_selector('#tc-cards .tc-seg[data-option="def_line"]', timeout=10000)
        wait_dropdown(page)
        page.wait_for_selector("#slf-tactical-lab-panel", timeout=10000)
        page.wait_for_function("""() => {
          const b = document.querySelector('#slf-tactical-lab-apply');
          return !!b && b.textContent.trim() === 'Применить эксперимент';
        }""", timeout=10000)
        # remove/re-insert cycle must not duplicate script UI
        page.click('.match_tab[data-tab="match"]')
        page.wait_for_selector("#tc-cards", state="detached", timeout=10000)
        page.click('.match_tab[data-tab="compare"]')
        page.wait_for_selector("#tc-cards", timeout=10000)
        page.wait_for_selector("#slf-tactical-lab-panel", timeout=10000)
        counts = page.evaluate("""() => ({
          panels: document.querySelectorAll('#slf-tactical-lab-panel').length,
          dropdowns: document.querySelectorAll('#slf-tactics-dropdown').length
        })""")
        assert counts == {"panels": 1, "dropdowns": 1}, counts
        assert not pageerror_lines(logs), pageerror_lines(logs)
    # unknown-only variant: lab never becomes ready
    with case("t5-unknownonly", query="&beta=unknownonly") as (page, logs):
        open_compare(page, wait_key="press_style")
        page.wait_for_selector("#slf-tactical-lab-apply", timeout=10000)
        page.wait_for_timeout(1500)
        txt = page.locator("#slf-tactical-lab-apply").inner_text().strip()
        assert txt == "Тактика загружается…", f"unknown-only lab became ready: {txt!r}"
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t6_dropdown_mount():
    with case("t6-dropdown-mount") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        info = page.evaluate(DROPDOWN_MOUNT_JS)
        assert info["exists"], f"no #slf-tactics-dropdown: {info}"
        assert info["count"] == 1, f"dropdown duplicated after cards insertion: {info}"
        # No #head on the fixture page: the parser panel is prepended to body
        # (ui-layer addMatchParserPanel) and the dropdown is inserted before
        # its anchor, so the dropdown legitimately ends up as the first body
        # child (previousElementSibling=None). Anchor check is therefore
        # positional: when the parser panel exists it must FOLLOW the dropdown.
        if info.get("prevDesc"):
            assert info["prevIsParser"] or info["prevIsCf1"], (
                f"dropdown anchored wrong; previousElementSibling={info['prevDesc']!r} ({info})"
            )
        assert page.evaluate("""() => {
          const dd = document.getElementById('slf-tactics-dropdown');
          const panel = document.getElementById('slf-match-parser-panel');
          return !dd || !panel ||
            (dd.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        }"""), "parser panel appears before the dropdown in body order"
        assert not pageerror_lines(logs), pageerror_lines(logs)


def test_t7_manual_telemetry():
    with case("t7-telemetry") as (page, logs):
        open_compare(page)
        wait_dropdown(page)
        page.click('.tc-seg[data-option="def_line"] button[data-value="1"]')
        page.wait_for_function("""() => (window.__slfRequests || []).filter((r) =>
          String(r.url || '').indexOf('preset_events') !== -1 &&
          String(r.data || '').indexOf('manual_change') !== -1 &&
          String(r.data || '').indexOf('def_line') !== -1
        ).length >= 1""", timeout=1500)
        page.wait_for_timeout(1000)
        n_manual = page.evaluate(MANUAL_TELEMETRY_COUNT_JS)
        assert n_manual == 1, f"expected exactly one manual_change entry, got {n_manual}"
        # scripted apply: def_line is already at the preset value after the
        # manual click → one fewer scripted click expected; suppression must
        # keep the manual_change count at 1.
        before = clicks_len(page)
        select_and_apply_preset(page)
        page.wait_for_function(
            "(n) => (window.__betaClicks || []).length >= n",
            arg=before + len(CHANGED_KEYS) - 1,
            timeout=10000,
        )
        page.wait_for_timeout(1200)
        assert clicks_len(page) > before, "apply did not run — suppression check would be vacuous"
        assert page.evaluate(MANUAL_TELEMETRY_COUNT_JS) == 1, "scripted apply leaked manual_change telemetry"
        assert not pageerror_lines(logs), pageerror_lines(logs)


# ── runner ────────────────────────────────────────────────────────────────────
CASES = [
    ("t1 read+apply end-to-end", test_t1_read_apply_end_to_end),
    ("t2 no-op apply", test_t2_noop_apply),
    ("t3 all-or-nothing preflight", test_t3_all_or_nothing_preflight),
    ("t4 rollback", test_t4_rollback),
    ("t5 lab ready on late cards", test_t5_lab_ready_on_late_cards),
    ("t6 dropdown mount", test_t6_dropdown_mount),
    ("t7 manual telemetry", test_t7_manual_telemetry),
]


def main():
    failed = []
    for label, fn in CASES:
        try:
            fn()
            print(f"PASS {label}")
        except Exception:
            failed.append(label)
            print(f"FAIL {label}")
            traceback.print_exc()
    if failed:
        raise SystemExit(f"[beta-tcseg-e2e] FAILED: {failed}")
    version = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]
    print(f"[beta-tcseg-e2e] passed all: cases=7 version={version}")
    if _SERVER is not None:
        _SERVER.shutdown()


if __name__ == "__main__":
    main()
