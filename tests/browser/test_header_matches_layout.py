#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-header-matches.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
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
        yield f"http://127.0.0.1:{instance.server_address[1]}/"
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join(timeout=5)


INIT_SCRIPT = """
(() => {
  'use strict';
  const store = new Map();
  window.unsafeWindow = window;
  window.__slfUnhandled = [];
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => store.has(key) ? store.get(key) : fallback;
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    setTimeout(() => request.onload?.({ status: 200, statusText: 'OK', responseText: '{}', finalUrl: String(request.url || '') }), 0);
    return { abort() {} };
  };
  const jq = function() {
    return {
      on(){return this;}, off(){return this;}, find(){return this;}, each(){return this;}, first(){return this;},
      filter(){return this;}, text(){return '';}, val(){return '';}, attr(){return undefined;}, data(){return undefined;},
      append(){return this;}, prepend(){return this;}, remove(){return this;}, css(){return this;}, length:0
    };
  };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
})();
"""


def layout_metrics(page):
    return page.evaluate(
        """() => {
          const controls = document.querySelector('.fm-card--controls');
          const matches = document.querySelector('.fm-card--matches');
          const scroll = document.querySelector('.fm-matches__scroll');
          const children = [...controls.querySelectorAll(':scope > .fm-card')];
          const logos = [...controls.querySelectorAll('img,.fm-avatar')];
          const rows = [...scroll.querySelectorAll('.fm-fixture')];
          const mr = matches.getBoundingClientRect();
          const sr = scroll.getBoundingClientRect();
          return {
            matchesLeft: mr.left,
            maxChildRight: Math.max(...children.map(node => node.getBoundingClientRect().right)),
            maxLogoRight: Math.max(...logos.map(node => node.getBoundingClientRect().right)),
            scrollHeight: scroll.scrollHeight,
            clientHeight: scroll.clientHeight,
            overflowY: getComputedStyle(scroll).overflowY,
            visibleRows: rows.filter(node => getComputedStyle(node).display !== 'none').length,
            maxRowBottom: Math.max(...rows.map(node => node.getBoundingClientRect().bottom)),
            scrollBottom: sr.bottom,
            expandDisplay: getComputedStyle(document.getElementById('fm-games-expand')).display,
            gridDisplay: getComputedStyle(controls).display,
            gridColumns: getComputedStyle(controls).gridTemplateColumns
          };
        }"""
    )


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE

    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU", viewport={"width": 1500, "height": 900})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(INIT_SCRIPT)
        try:
            page.goto(base_url, wait_until="domcontentloaded")
            before = layout_metrics(page)
            assert before["maxChildRight"] > before["matchesLeft"] + 1, before
            assert before["scrollHeight"] > before["clientHeight"] + 1, before

            page.add_script_tag(path=str(ARTIFACT))
            page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
            page.wait_for_function("() => document.documentElement.dataset.slfHeaderMatchesFit === '1'")
            page.wait_for_selector("#slf-header-matches-fit", state="attached")

            after = layout_metrics(page)
            assert after["gridDisplay"] == "grid", after
            assert after["gridColumns"] != "none", after
            assert after["maxChildRight"] <= after["matchesLeft"] + 1, after
            assert after["maxLogoRight"] <= after["matchesLeft"] + 1, after
            assert after["visibleRows"] == 4, after
            assert after["scrollHeight"] <= after["clientHeight"] + 1, after
            assert after["maxRowBottom"] <= after["scrollBottom"] + 1, after
            assert after["overflowY"] == "visible", after
            assert after["expandDisplay"] == "none", after
            page.wait_for_timeout(150)
            assert not page_errors, page_errors
            assert page.evaluate("window.__slfUnhandled.slice()") == []
            print(f"[header-matches-e2e] passed version={VERSION} metrics={after}")
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
