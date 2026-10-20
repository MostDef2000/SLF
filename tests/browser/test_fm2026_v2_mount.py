#!/usr/bin/env python3
"""Issue #370 — fm2026v2 tactic-card markup mounting (team4.php + game.php).

Script-style browser e2e following tests/browser/test_exact_userscript.py
conventions: serves synthetic fixtures over localhost, injects the exact
`releases/latest.user.js` artifact, asserts observable mounting behavior for
the new "fm2026v2" tactic-card markup.

Cases:
  T1 team4 v2 (fixture fm2026-v2-team-tactic.html): the tactics dropdown mounts
     as a child of form.tactics__form (first child or directly before the wrap).
  T2 game v2 (fixture fm2026-v2-game.html): the dropdown mounts directly before
     the .team-control__block inside the defence card — not bailed out to a
     body-level fallback.
  T3 game v2 variant with every named input removed: no dropdown mounts and no
     error is thrown (addDropdown must bail silently, not via its try/catch).
  T4 game v2: the match observer engages — state leaves 'waiting' and target
     becomes 'match-content' (a WIDE root is asserted only through these
     observable flags, never by naming the root element) — and a late
     .team-control__block insertion triggers a subsequent observer run.
  T5 game v2: grid layout guard — the three tactic cards stay in a single row
     at usable width; if the dropdown lands as a direct grid item it must span
     the full row (guards the 3-card row against an unspanned reflow).
  T6 card-only page (only .ui-tactic__wrap present): html[data-slf-design]
     flips to "fm2026".
"""

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
VERSION_MANIFEST = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))
EXPECTED_VERSION = VERSION_MANIFEST["scriptVersion"]
FIXTURES = ROOT / "tests" / "browser" / "fixtures"
ARTIFACTS = ROOT / "tests" / "browser" / "artifacts"

ROUTES = {
    "v2game": FIXTURES / "fm2026-v2-game.html",
    "v2tactic": FIXTURES / "fm2026-v2-team-tactic.html",
}

# T6 page: ONLY .ui-tactic__wrap marks the fm2026 design (no .fm-stage,
# .fm-topbar, .fm-deck or .content-ui__wrapper). On clean main the design
# marker stays "legacy"; the #370 change adds .ui-tactic__wrap to the
# version-badge designSelector and must flip it to "fm2026".
CARD_ONLY_HTML = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>card-only</title>
<style>.ui-tactic__wrap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}</style>
</head><body>
<div class="ui-tactic__wrap">
  <section class="ui-tactic__card"><div class="ui-tactic__caption">Оборона</div>
    <input type="radio" name="def_line" value="1"><input type="radio" name="def_line" value="2">
  </section>
</div>
</body></html>"""


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/game.php":
            fixture_name = query.get("fixture", ["v2game"])[0]
            if fixture_name == "cardonly":
                payload = CARD_ONLY_HTML.encode("utf-8")
            else:
                fixture_path = ROUTES.get(fixture_name)
                if not fixture_path or not fixture_path.is_file():
                    self.send_error(404)
                    return
                payload = fixture_path.read_bytes()
        elif parsed.path == "/team4.php" and query.get("action", [""])[0] == "tactic":
            payload = ROUTES["v2tactic"].read_bytes()
        else:
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format, *_args):
        return


@contextmanager
def fixture_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def browser_init_script() -> str:
    return """
(() => {
  'use strict';
  const gmStore = new Map();

  window.__slfRequests = [];
  window.__slfAlerts = [];
  window.__slfUnhandled = [];
  window.unsafeWindow = window;

  window.localStorage.setItem('slf_custom_presets', JSON.stringify({
    'Henta abuse': { style: '3', def_line: '1', press_line: '2' }
  }));

  window.addEventListener('error', event => {
    window.__slfUnhandled.push(`error:${event.message || 'unknown'}`);
  });
  window.addEventListener('unhandledrejection', event => {
    window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`);
  });

  window.GM_getValue = (key, fallback = '') => {
    if (key === 'slf_api_token') return 'browser-e2e-token';
    return gmStore.has(key) ? gmStore.get(key) : fallback;
  };
  window.GM_setValue = (key, value) => gmStore.set(key, value);
  window.GM_deleteValue = key => gmStore.delete(key);
  window.GM_registerMenuCommand = () => 1;

  window.GM_xmlhttpRequest = request => {
    const entry = {
      method: String(request.method || 'GET').toUpperCase(),
      url: String(request.url || ''),
      data: request.data == null ? null : String(request.data)
    };
    window.__slfRequests.push(entry);

    setTimeout(() => {
      let responseText = '{}';
      if (entry.method === 'GET' && !entry.url.includes('/api/tactics')) responseText = '[]';
      if (typeof request.onload === 'function') {
        request.onload({
          status: 200,
          statusText: 'OK',
          responseText,
          finalUrl: entry.url
        });
      }
    }, 0);

    return { abort() {} };
  };

  const jq = function(target) {
    const element = target && target.nodeType ? target : null;
    const api = {
      on() { return this; }, off() { return this; }, find() { return this; },
      each() { return this; }, first() { return this; }, text() { return ''; },
      val() { return ''; }, attr() { return undefined; },
      data() { return undefined; },
      append() { return this; }, prepend() { return this; }, remove() { return this; },
      length: element ? 1 : 0
    };
    return api;
  };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;

  window.alert = message => window.__slfAlerts.push(String(message));
  window.prompt = () => null;
})();
"""


def assert_runtime_version(page: Page):
    page.wait_for_function(
        "expected => window.SLF && window.SLF.scriptVersion === expected",
        arg=EXPECTED_VERSION,
    )
    actual = page.evaluate("window.SLF.scriptVersion")
    assert actual == EXPECTED_VERSION, (actual, EXPECTED_VERSION)


def assert_clean_runtime(page: Page, page_errors):
    page.wait_for_timeout(100)
    unhandled = page.evaluate("window.__slfUnhandled.slice()")
    assert not page_errors, f"uncaught page errors: {page_errors}"
    assert not unhandled, f"unhandled browser events: {unhandled}"


def inject_exact_artifact(page: Page):
    assert ARTIFACT.is_file(), ARTIFACT
    page.add_script_tag(path=str(ARTIFACT))
    assert_runtime_version(page)


def strip_canonical_inputs(page: Page):
    page.evaluate("() => document.querySelectorAll('input[name]').forEach(node => node.remove())")


# ---------------------------------------------------------------------------
# T1 — team4.php v2: dropdown mounts as a child of form.tactics__form.
# ---------------------------------------------------------------------------
def assert_t1_team4_form_mount(page: Page, logs):
    page.wait_for_selector("#slf-tactics-dropdown", timeout=10000)
    placement = page.evaluate("""() => {
      const dropdown = document.getElementById('slf-tactics-dropdown');
      const form = document.querySelector('form.tactics__form');
      const wrap = document.querySelector('.ui-tactic__wrap');
      return {
        count: document.querySelectorAll('#slf-tactics-dropdown').length,
        parentIsForm: !!dropdown && dropdown.parentElement === form,
        firstChild: !!form && !!dropdown && form.firstElementChild === dropdown,
        beforeWrap: !!dropdown && dropdown.nextElementSibling === wrap,
      };
    }""")
    assert placement["count"] == 1, placement
    assert placement["parentIsForm"], placement
    assert placement["firstChild"] or placement["beforeWrap"], placement


# ---------------------------------------------------------------------------
# T2 — game.php v2: dropdown mounts directly before .team-control__block.
# ---------------------------------------------------------------------------
def assert_t2_game_mount_before_block(page: Page, logs):
    page.wait_for_selector("#slf-tactics-dropdown", timeout=10000)
    placement = page.evaluate("""() => {
      const dropdown = document.getElementById('slf-tactics-dropdown');
      const block = document.querySelector('.ui-tactic__card .team-control__block');
      return {
        count: document.querySelectorAll('#slf-tactics-dropdown').length,
        blockExists: !!block,
        insideWrap: !!dropdown && !!dropdown.closest('.ui-tactic__wrap'),
        parentIsCard: !!dropdown && dropdown.parentElement.classList.contains('ui-tactic__card'),
        nextIsBlock: !!dropdown && dropdown.nextElementSibling === block,
      };
    }""")
    assert placement["count"] == 1, placement
    assert placement["blockExists"], placement
    # The mount must stay inside the tactic area, not bail out to a body-level
    # fallback (the reviewer's "body-miss" bail is the failure mode here).
    assert placement["insideWrap"], placement
    assert placement["parentIsCard"], placement
    assert placement["nextIsBlock"], placement


# ---------------------------------------------------------------------------
# T3 — game.php v2 without canonical radios: no dropdown, no throw.
# ---------------------------------------------------------------------------
def assert_t3_no_radios_no_mount(page: Page, logs):
    page.wait_for_timeout(800)
    assert page.locator("#slf-tactics-dropdown").count() == 0, (
        "dropdown must not mount without canonical radio controls"
    )
    # addDropdown is wrapped in a try/catch that logs
    # "[SLF] tactics-dropdown failed; continuing startup" — the bail must be
    # silent, so that warning is the observable signal for "threw".
    failed = [text for text in logs["console_warnings"] if "tactics-dropdown failed" in text]
    assert not failed, failed


# ---------------------------------------------------------------------------
# T4 — game.php v2: match observer engages on a wide root and reacts to a
#      late .team-control__block insertion.
# ---------------------------------------------------------------------------
def assert_t4_match_observer(page: Page, logs):
    # A WIDE root is asserted only through these observable flags — never by
    # naming the root element (a companion fix climbs from the narrow
    # .ui-tactic__wrap fallback to .ui-tactic-manager/form/parent).
    page.wait_for_function(
        """() => window.__slf_match_ui_observer_state === 'ready'
             && window.__slf_ui_observer_target === 'match-content'""",
        timeout=6000,
    )
    page.wait_for_function(
        "() => Number(window.__slf_match_ui_observer_runs || 0) >= 1",
        timeout=3000,
    )
    runs_before = page.evaluate("Number(window.__slf_match_ui_observer_runs || 0)")

    page.evaluate("""() => {
      const card = document.querySelector('.ui-tactic__card');
      const block = document.createElement('div');
      block.className = 'team-control__block';
      block.dataset.probe = 'late-insert';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'def_width';
      input.value = '3';
      block.appendChild(input);
      card.appendChild(block);
    }""")

    page.wait_for_function(
        "runsBefore => Number(window.__slf_match_ui_observer_runs || 0) > runsBefore",
        arg=runs_before,
        timeout=3000,
    )
    assert page.evaluate("window.__slf_match_ui_observer_state") == "ready"
    assert page.evaluate("window.__slf_ui_observer_target") == "match-content"


# ---------------------------------------------------------------------------
# T5 — game.php v2: grid layout guard for the three-card row.
# ---------------------------------------------------------------------------
def assert_t5_grid_guard(page: Page, logs):
    page.wait_for_selector("#slf-tactics-dropdown", timeout=10000)
    page.wait_for_timeout(250)
    layout = page.evaluate("""() => {
      const wrap = document.querySelector('.ui-tactic__wrap');
      const cards = [...wrap.children].filter(node => node.classList.contains('ui-tactic__card'));
      const wrapRect = wrap.getBoundingClientRect();
      const cardRects = cards.map(node => node.getBoundingClientRect());
      const dropdown = document.getElementById('slf-tactics-dropdown');
      return {
        cardCount: cards.length,
        rowTops: [...new Set(cardRects.map(rect => Math.round(rect.top)))],
        minCardWidthRatio: Math.min(...cardRects.map(rect => rect.width / wrapRect.width)),
        dropdownWidthRatio: dropdown.getBoundingClientRect().width / wrapRect.width,
        isDirectGridItem: dropdown.parentElement === wrap,
        dropdownOverflowX: getComputedStyle(dropdown).overflowX,
      };
    }""")
    assert layout["cardCount"] == 3, layout
    # The three cards must stay on a single grid row...
    assert len(layout["rowTops"]) == 1, layout
    # ...each at usable width (nominal 1/3 of the row; 0.25 is the floor).
    assert layout["minCardWidthRatio"] >= 0.25, layout
    # If the dropdown lands as a direct grid item it must span the full row
    # (companion fix may set grid-column:1/-1); an unspanned grid item is the
    # reflow this guard catches.
    if layout["isDirectGridItem"]:
        assert layout["dropdownWidthRatio"] >= 0.9, layout
    # The game.php container is inserted with inline overflow:visible so the
    # select/buttons are not clipped inside the card.
    assert layout["dropdownOverflowX"] == "visible", layout


# ---------------------------------------------------------------------------
# T6 — card-only page: design marker flips to fm2026.
# ---------------------------------------------------------------------------
def assert_t6_card_only_marker(page: Page, logs):
    assert page.evaluate("() => !document.querySelector('.content-ui__wrapper, .fm-stage, .fm-topbar, .fm-deck')")
    page.wait_for_function(
        "() => document.documentElement.dataset.slfDesign === 'fm2026'",
        timeout=5000,
    )


def run_case(browser: Browser, base_url: str, name: str, path: str, assertions, pre_inject=None):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(locale="ru-RU")
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page_errors = []
    logs = {"console_warnings": []}
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "console",
        lambda message: logs["console_warnings"].append(message.text)
        if message.type == "warning" else None,
    )
    page.add_init_script(browser_init_script())

    try:
        page.goto(base_url + path, wait_until="domcontentloaded")
        if pre_inject:
            pre_inject(page)
        inject_exact_artifact(page)
        assertions(page, logs)
        assert_clean_runtime(page, page_errors)
        context.tracing.stop()
        print(f"[fm2026-v2-e2e] passed: {name}")
    except Exception:
        page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True)
        context.tracing.stop(path=str(ARTIFACTS / f"{name}.zip"))
        raise
    finally:
        context.close()


def main():
    cases = [
        ("t1-team4-v2-form-mount", "/team4.php?action=tactic", assert_t1_team4_form_mount, None),
        ("t2-game-v2-mount-before-block", "/game.php?id=e2e-v2-game&fixture=v2game", assert_t2_game_mount_before_block, None),
        ("t3-game-v2-no-canonical-radios", "/game.php?id=e2e-v2-noradio&fixture=v2game", assert_t3_no_radios_no_mount, strip_canonical_inputs),
        ("t4-game-v2-match-observer", "/game.php?id=e2e-v2-observer&fixture=v2game", assert_t4_match_observer, None),
        ("t5-game-v2-grid-guard", "/game.php?id=e2e-v2-grid&fixture=v2game", assert_t5_grid_guard, None),
        ("t6-card-only-marker", "/game.php?id=e2e-cardonly&fixture=cardonly", assert_t6_card_only_marker, None),
    ]

    with fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for name, path, assertions, pre_inject in cases:
                run_case(browser, base_url, name, path, assertions, pre_inject)
        finally:
            browser.close()

    print(f"[fm2026-v2-e2e] passed all: cases={len(cases)} version={EXPECTED_VERSION}")


if __name__ == "__main__":
    main()
