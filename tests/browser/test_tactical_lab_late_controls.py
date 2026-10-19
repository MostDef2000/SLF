#!/usr/bin/env python3
"""RED repro: Tactical Lab apply button stays "Тактика загружается…" forever
when the FM2026 tactic radio controls render lazily outside the observed root.

Bug (base_sha 89b50df): the Tactical Lab panel mounts once during install()
via mountUI() (src/modules/tactics-presets/tactical-lab-v1.js:755). If the
native radio controls (input[name="def_line"] and friends) are not in the DOM
at that moment, controlsAvailable() (tactical-lab-v1.js:528) returns false and
the apply button is frozen at "Тактика загружается…" (renderUI,
tactical-lab-v1.js:693). The tactical-lab module itself never re-renders
(the only manual renderUI() sits in the click handler of the disabled button,
tactical-lab-v1.js:726). The userscript's only recovery path is the match-page
DOM observer (src/core/dom-utils.js installObserver -> App.mountUI -> patched
UI.addMatchParserPanel -> STATE.tacticalLabRuntime.mountUI), but it is scoped
to the .content-ui__wrapper/.match_content subtree, while controlsAvailable()
queries the whole document. On the production live-match page the tactic block
is injected lazily outside that root, so the observer never fires and the
button hangs forever — exactly what this test reproduces.

The fixture fm2026-owned-live-match-late-controls.html mirrors
fm2026-owned-live-match.html but renders the tactic radio groups ~1200 ms
after the load event, outside .content-ui__wrapper. This test asserts the
post-fix contract, not the current broken behaviour: once the controls exist,
the apply button must become ready (text "Применить эксперимент", not
disabled) within a reasonable window. A correct fix (document-wide observer or
polling of controlsAvailable) passes regardless of where the block lands.
On base_sha the final wait times out -> RED.

Run (from repo root):
    PYTHONPATH=<pylibs> python3 -m pytest tests/browser/test_tactical_lab_late_controls.py \
        -x -q -p no:cacheprovider
"""

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import pytest
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-owned-live-match-late-controls.html"

# Sandbox-local Chromium (never download via `playwright install`).
CHROMIUM = Path("/home/mostdef/vibe/projects/ai-playground/.opencode/browser/chromium")
# Diagnostics go to scratch, never into the repo.
SCRATCH = Path("/tmp/opencode/np-live/lab-e2e")

PENDING_TEXT = "Тактика загружается…"
READY_TEXT = "Применить эксперимент"

# Native-domain value grid checked by controlsAvailable() in the Tactical Lab
# module (tactical-lab-v1.js `ranges`). The fixture's deferred renderer must
# create every one of these inputs, so after it runs controlsAvailable() is
# guaranteed to be true for ANY assigned experiment — the only thing that can
# keep the button frozen is the missing re-render.
RANGES = {
    "def_line": ["1", "2", "3"], "press_line": ["1", "2", "3"], "def_width": ["1", "2", "3"],
    "press_intense": ["1", "2", "3", "4", "5"],
    "build_type": ["1", "2", "3"], "build_temp": ["1", "2", "3"],
    "build_long": ["1", "2", "3"], "build_fast": ["1", "2", "3"],
    "style": ["1", "2", "3", "4", "5"], "pass_risk": ["1", "2", "3", "4", "5"],
    "dribble": ["1", "2", "3", "4", "5"], "cross": ["1", "2", "3"],
    "corner": ["1", "2"], "shot": ["1", "2", "3"],
}
PRIORITY_NAMES = ["priority_l", "priority_c", "priority_r"]

# Window after the radio controls appear within which a fixed implementation
# must re-render the panel and mark the button ready. 10 s is ~8x the fixture
# delay: generous for a correct observer/poll, still a hard failure for the
# current "mount once, never re-render" code.
READY_WINDOW_MS = 10_000


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path != "/game.php":
            self.send_error(404)
            return
        payload = FIXTURE.read_bytes()
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
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def init_script() -> str:
    """Minimal GM/API stubs, same approach as the existing browser suites."""
    return """
(() => {
  'use strict';
  const store = new Map();
  window.__slfRequests = [];
  window.__slfUnhandled = [];
  window.unsafeWindow = window;
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => key === 'slf_api_token' ? 'late-controls-e2e-token' : (store.has(key) ? store.get(key) : fallback);
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    const row = { method: String(request.method || 'GET').toUpperCase(), url: String(request.url || ''), data: request.data == null ? null : String(request.data) };
    window.__slfRequests.push(row);
    setTimeout(() => {
      const responseText = row.method === 'GET' && !row.url.includes('/api/tactics') ? '[]' : '{}';
      request.onload?.({ status: 200, statusText: 'OK', responseText, finalUrl: row.url });
    }, 0);
    return { abort() {} };
  };
  const jq = function() { return { on(){return this;},off(){return this;},find(){return this;},each(){return this;},first(){return this;},text(){return '';},val(){return '';},attr(){return undefined;},data(){return undefined;},append(){return this;},prepend(){return this;},remove(){return this;},length:0 }; };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = message => window.__slfUnhandled.push(`alert:${String(message)}`);
  window.confirm = () => true;
  window.prompt = () => null;
})();
"""


def button_state(page):
    return page.evaluate("""() => {
      const button = document.getElementById('slf-tactical-lab-apply');
      return {
        exists: !!button,
        text: button ? button.textContent : null,
        disabled: button ? button.disabled : null,
      };
    }""")


def assert_full_control_grid_present(page):
    """Prove the fixture rendered every input controlsAvailable() needs.

    If this holds while the button stays frozen, the hang is attributable to
    the missing re-render, not to absent DOM controls.
    """
    missing = page.evaluate(
        """args => {
          const missing = [];
          for (const [name, values] of Object.entries(args.ranges)) {
            for (const value of values) {
              if (!document.querySelector(`input[name="${name}"][value="${value}"]`)) {
                missing.push(`${name}:${value}`);
              }
            }
          }
          for (const name of args.priorityNames) {
            if (!document.querySelector(`input[name="${name}"]`)) missing.push(name);
          }
          return missing;
        }""",
        {"ranges": RANGES, "priorityNames": PRIORITY_NAMES},
    )
    assert missing == [], f"fixture did not render the full native control grid: {missing}"


def test_tactical_lab_apply_button_becomes_ready_after_late_controls():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE
    assert CHROMIUM.is_file(), CHROMIUM

    with fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=str(CHROMIUM),
            args=[
                "--no-sandbox",
                "--proxy-server=http://gateway.docker.internal:3128",
                "--proxy-bypass-list=127.0.0.1;localhost",
                "--ignore-certificate-errors",
            ],
        )
        context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(init_script())
        try:
            page.goto(base_url + "/game.php?id=e2e-late-controls", wait_until="domcontentloaded")

            # The exact published artifact, same as the other browser suites.
            page.add_script_tag(path=str(ARTIFACT))
            page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
            assert page.evaluate("document.documentElement.dataset.slfDesign") == "fm2026"

            # 1. Panel mounts while the tactic radios are still absent from
            #    the DOM (install-time mountUI sees no native controls).
            page.wait_for_selector("#slf-tactical-lab-panel", timeout=8_000)
            assert page.locator("#slf-tactical-lab-panel").count() == 1
            assert page.evaluate('document.querySelectorAll(\'input[name="def_line"]\').length') == 0, (
                "repro invalid: radio controls were present before the deferred renderer ran"
            )

            # 2. At mount time the button is frozen in the pending state.
            initial = button_state(page)
            assert initial["exists"], "apply button missing inside the panel"
            assert initial["text"] == PENDING_TEXT, initial
            assert initial["disabled"] is True, initial

            # 3. The native tactic controls appear ~1.2 s after load, outside
            #    the .content-ui__wrapper root that the match-page DOM observer
            #    watches. state="attached": most grid radios are hidden.
            observer_runs_before = page.evaluate("Number(window.__slf_match_ui_observer_runs || 0)")
            page.wait_for_selector('input[name="def_line"]', timeout=10_000, state="attached")
            assert page.evaluate("window.__slfLateControlsAdded === true")
            assert_full_control_grid_present(page)
            # Give the scoped observer its full debounce window (400 ms on the
            # match page) to prove it cannot see this mutation batch.
            page.wait_for_timeout(800)
            observer_runs_after = page.evaluate("Number(window.__slf_match_ui_observer_runs || 0)")

            # 4. RED assertion (the post-fix contract): once the controls the
            #    experiment needs exist, the panel must re-render and the
            #    button must become ready within a reasonable window.
            #    base_sha 89b50df: the tactical-lab module never re-renders on
            #    its own, and the only recovery path — the match-page DOM
            #    observer — is scoped to .content-ui__wrapper/.match_content
            #    and misses this mutation -> the wait times out.
            try:
                page.wait_for_function(
                    """readyText => {
                      const button = document.getElementById('slf-tactical-lab-apply');
                      return !!button && !button.disabled && button.textContent.trim() === readyText;
                    }""",
                    arg=READY_TEXT,
                    timeout=READY_WINDOW_MS,
                )
            except PlaywrightTimeoutError:
                frozen = button_state(page)
                diagnostics = {
                    "button_after_controls_appeared": frozen,
                    "lateControlsAdded": page.evaluate("window.__slfLateControlsAdded === true"),
                    "defLineInputs": page.evaluate('document.querySelectorAll(\'input[name="def_line"]\').length'),
                    "matchObserverRuns": {"beforeControls": observer_runs_before, "afterControls": observer_runs_after},
                    "panelCount": page.evaluate("document.querySelectorAll('#slf-tactical-lab-panel').length"),
                    "statusText": page.evaluate("document.getElementById('slf-tactical-lab-status')?.textContent || null"),
                    "detailText": page.evaluate("document.getElementById('slf-tactical-lab-detail')?.textContent || null"),
                    "unhandled": page.evaluate("window.__slfUnhandled.slice()"),
                    "pageErrors": page_errors,
                }
                SCRATCH.mkdir(parents=True, exist_ok=True)
                screenshot = SCRATCH / "late-controls-red.png"
                page.screenshot(path=str(screenshot), full_page=True)
                pytest.fail(
                    "Tactical Lab apply button stayed frozen after the native controls appeared: "
                    f"expected text={READY_TEXT!r} and enabled within {READY_WINDOW_MS} ms, "
                    f"observed text={frozen['text']!r} disabled={frozen['disabled']!r}. "
                    "The full native control grid is present (document-wide), so "
                    "controlsAvailable() would now return true — but nothing re-renders the "
                    "mounted panel: the tactical-lab module renders once at mount, and the "
                    "match-page recovery observer is scoped to .content-ui__wrapper/.match_content "
                    "and never saw the lazy tactic block (see matchObserverRuns diagnostics). "
                    f"diagnostics={json.dumps(diagnostics, ensure_ascii=False)} "
                    f"screenshot={screenshot}"
                )
        finally:
            context.close()
            browser.close()
