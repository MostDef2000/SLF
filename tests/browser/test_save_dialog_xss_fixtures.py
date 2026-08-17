#!/usr/bin/env python3
"""QR-005 malicious-string fixtures for the save dialog (ui-layer.js showSaveDialog).

Preset names are user-controlled: they are created through the save dialog,
persisted in localStorage (slf_custom_presets) and merged from the VPS API.
Before QR-005 the name was interpolated into dialog.innerHTML unescaped, so a
preset named `<img src=x onerror=...>` executed when the dialog opened.

This test proves the sink is escaped and that no script executes:
  - the dialog HTML contains the escaped forms (&lt;, &quot;, &amp;, &#39;);
  - the raw payload is not present in the dialog HTML;
  - the DOM option values/text decode back to the literal malicious names
    (escaping must not corrupt the user's data);
  - no XSS marker is set and the runtime stays clean.
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

MALICIOUS_PRESETS = {
    "img_onerror": "<img src=x onerror=\"window.__slfXss=1\">",
    "script_tag": "<script>window.__slfXss=2</script>",
    "attr_breakout": "\"><svg onload=window.__slfXss=3>",
    "amp_quote_angle": "A&B\"'<x>",
}


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/team4.php":
            fixture_path = FIXTURES / "team-tactic.html"
        else:
            self.send_error(404)
            return

        if not fixture_path.is_file():
            self.send_error(404)
            return

        payload = fixture_path.read_bytes()
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
    malicious = json.dumps(MALICIOUS_PRESETS, ensure_ascii=False)
    return f"""
(() => {{
  'use strict';
  const gmStore = new Map();
  const jqDataStore = new WeakMap();

  window.__slfRequests = [];
  window.__slfMenuCommands = [];
  window.__slfAlerts = [];
  window.__slfUnhandled = [];
  window.__slfXss = undefined;
  window.unsafeWindow = window;

  window.localStorage.setItem('slf_custom_presets', JSON.stringify({malicious}));

  window.addEventListener('error', event => {{
    window.__slfUnhandled.push(`error:${{event.message || 'unknown'}}`);
  }});
  window.addEventListener('unhandledrejection', event => {{
    window.__slfUnhandled.push(`rejection:${{String(event.reason?.message || event.reason || 'unknown')}}`);
  }});

  window.GM_getValue = (key, fallback = '') => {{
    if (key === 'slf_api_token') return 'browser-e2e-token';
    return gmStore.has(key) ? gmStore.get(key) : fallback;
  }};
  window.GM_setValue = (key, value) => gmStore.set(key, value);
  window.GM_deleteValue = key => gmStore.delete(key);
  window.GM_registerMenuCommand = (label, callback) => {{
    window.__slfMenuCommands.push({{ label, callbackType: typeof callback }});
    return window.__slfMenuCommands.length;
  }};

  window.GM_xmlhttpRequest = request => {{
    const entry = {{
      method: String(request.method || 'GET').toUpperCase(),
      url: String(request.url || ''),
      data: request.data == null ? null : String(request.data)
    }};
    window.__slfRequests.push(entry);

    setTimeout(() => {{
      let responseText = '{{}}';
      if (entry.method === 'GET' && !entry.url.includes('/api/tactics')) responseText = '[]';
      if (typeof request.onload === 'function') {{
        request.onload({{
          status: 200,
          statusText: 'OK',
          responseText,
          finalUrl: entry.url
        }});
      }}
    }}, 0);

    return {{ abort() {{}} }};
  }};

  const jq = function(target) {{
    const element = target && target.nodeType ? target : null;
    const api = {{
      on() {{ return this; }}, off() {{ return this; }}, find() {{ return this; }},
      each() {{ return this; }}, first() {{ return this; }}, text() {{ return ''; }},
      val() {{ return ''; }}, attr() {{ return undefined; }},
      data(key, value) {{
        if (!element) return arguments.length > 1 ? this : undefined;
        let store = jqDataStore.get(element);
        if (!store) {{
          store = {{}};
          jqDataStore.set(element, store);
        }}
        if (!Object.prototype.hasOwnProperty.call(store, key) && element.dataset && key in element.dataset) {{
          store[key] = element.dataset[key];
        }}
        if (arguments.length === 1) return store[key];
        store[key] = value;
        return this;
      }},
      append() {{ return this; }}, prepend() {{ return this; }}, remove() {{ return this; }},
      length: element ? 1 : 0
    }};
    return api;
  }};
  jq.ajax = () => Promise.resolve({{}});
  window.$ = window.jQuery = jq;

  window.alert = message => window.__slfAlerts.push(String(message));
  window.prompt = () => null;
}})();
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


def assert_save_dialog_escapes_malicious_presets(page: Page):
    page.wait_for_selector("#slf-tactics-dropdown")

    save_button = page.locator('button[title="Сохранить текущую тактику"]')
    assert save_button.count() == 1, save_button.count()
    save_button.click()

    page.wait_for_selector("#slf-save-dialog")
    dialog_html = page.evaluate(
        "document.getElementById('slf-save-dialog').innerHTML"
    )

    # The raw payload must never appear in the dialog HTML.
    assert "<img src=x" not in dialog_html, dialog_html
    assert "<script>" not in dialog_html, dialog_html
    assert "<svg onload" not in dialog_html, dialog_html

    # The escaped forms must be present for every malicious preset.
    assert "&lt;img" in dialog_html, dialog_html
    assert "&lt;script" in dialog_html, dialog_html
    assert "&lt;svg" in dialog_html, dialog_html
    assert "&quot;" in dialog_html, dialog_html
    assert "&amp;" in dialog_html, dialog_html
    assert "&#39;" in dialog_html, dialog_html

    # The DOM option values/text must decode back to the literal names:
    # escaping must not corrupt the user's data.
    option_values = page.eval_on_selector_all(
        "#slf-save-select option",
        "options => options.map(option => option.value)",
    )
    option_texts = page.eval_on_selector_all(
        "#slf-save-select option",
        "options => options.map(option => option.textContent)",
    )
    for name in MALICIOUS_PRESETS:
        assert name in option_values, (name, option_values)
        assert name in option_texts, (name, option_texts)

    # No XSS marker may have been set by any payload.
    assert page.evaluate("window.__slfXss") is None, page.evaluate("window.__slfXss")


def main():
    with fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            ARTIFACTS.mkdir(parents=True, exist_ok=True)
            context = browser.new_context(locale="ru-RU")
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            page = context.new_page()
            page_errors = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.add_init_script(browser_init_script())

            try:
                page.goto(base_url + "/team4.php?action=tactic", wait_until="domcontentloaded")
                assert ARTIFACT.is_file(), ARTIFACT
                page.add_script_tag(path=str(ARTIFACT))
                assert_runtime_version(page)
                assert_save_dialog_escapes_malicious_presets(page)
                assert_clean_runtime(page, page_errors)
                context.tracing.stop()
                print(f"[browser-e2e] passed: save-dialog-xss-fixtures version={EXPECTED_VERSION}")
            except Exception:
                page.screenshot(path=str(ARTIFACTS / "save-dialog-xss-fixtures.png"), full_page=True)
                context.tracing.stop(path=str(ARTIFACTS / "save-dialog-xss-fixtures.zip"))
                raise
            finally:
                context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()