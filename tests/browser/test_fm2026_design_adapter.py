#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-owned-live-match.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith("/game.php"):
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
def server():
    instance = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{instance.server_address[1]}"
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join(timeout=5)


INIT = """
(() => {
  'use strict';
  const store = new Map();
  window.__slfRequests = [];
  window.__slfUnhandled = [];
  window.__slfAlerts = [];
  window.unsafeWindow = window;
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => key === 'slf_api_token' ? 'fm2026-e2e-token' : (store.has(key) ? store.get(key) : fallback);
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
  window.alert = message => window.__slfAlerts.push(String(message));
  window.prompt = () => null;
})();
"""


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU")
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(INIT)
        try:
            page.goto(f"{base_url}/game.php?id=e2e-fm2026", wait_until="domcontentloaded")
            page.add_script_tag(path=str(ARTIFACT))
            page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
            page.wait_for_selector(".content-ui__wrapper > #slf-match-parser-panel")
            page.wait_for_selector("#slf-tactics-dropdown.slf-ui.slf-panel")
            page.wait_for_selector("#slf-manual-recommendation-btn")
            page.wait_for_selector(".fm-account__status #slf-version-inline-badge")

            assert page.evaluate("document.documentElement.dataset.slfDesign") == "fm2026"
            assert page.locator("#slf-match-parser-panel").get_attribute("data-slf-mount") == "fm2026-content"
            assert page.locator("#slf-tactics-dropdown").get_attribute("data-slf-mount") == "fm2026-tactic-root"
            assert page.locator(".fm-topbar #slf-match-parser-panel, .fm-deck #slf-match-parser-panel, .fm-slots #slf-match-parser-panel").count() == 0
            assert page.locator("#slf-match-parser-panel").count() == 1
            assert page.locator("#slf-tactics-dropdown").count() == 1

            style = page.locator("#slf-match-parser-panel").evaluate("el => ({font:getComputedStyle(el).fontFamily,radius:getComputedStyle(el).borderRadius,width:getComputedStyle(el).width})")
            assert "Roboto" in style["font"], style
            assert float(style["radius"].replace("px", "")) >= 10, style

            page.locator("#slf-manual-recommendation-btn").click()
            page.wait_for_function("() => document.getElementById('slf-parser-status')?.textContent.includes('Подсказка обновлена вручную')")
            page.wait_for_function("() => window.__slfRequests.some(row => row.url.includes('/api/match_snapshots_v2?mode=append'))")
            page.wait_for_timeout(150)
            assert not page_errors, page_errors
            assert page.evaluate("window.__slfUnhandled.slice()") == []
            print(f"[fm2026-design-e2e] passed: version={VERSION}")
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
