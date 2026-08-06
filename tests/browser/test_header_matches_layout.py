#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-header-matches.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]
EXPECTED_TIMES = ["17:00", "18:48", "19:48", "20:24", "21:12", "03:24", "04:24"]
PAGE_CASES = [
    ("team4-expanded", "/team4.php", False, True),
    ("train-collapsed", "/train.php", True, False),
    ("roster-expanded", "/roster.php", False, False),
    ("office-collapsed", "/office.php", True, False),
]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/plain.php":
            payload = b"<!doctype html><html><body><main id='plain'>No matches</main></body></html>"
        else:
            query = parse_qs(parsed.query)
            text = FIXTURE.read_text(encoding="utf-8")
            if query.get("collapsed", ["0"])[0] == "1":
                text = text.replace('class="fm-deck"', 'class="fm-deck fm-deck--collapsed"', 1)
            payload = text.encode("utf-8")

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
          const deck = document.querySelector('.fm-deck');
          const controls = document.querySelector('.fm-card--controls');
          const matches = document.querySelector('.fm-card--matches');
          const field = matches.querySelector('#field-f7');
          const scroll = document.querySelector('.fm-matches__scroll');
          const list = document.querySelector('.fm-fixtures');
          const children = [...controls.querySelectorAll(':scope > .fm-card')];
          const logos = [...controls.querySelectorAll('img,.fm-avatar')];
          const rows = [...list.querySelectorAll(':scope > .fm-fixture')];
          const mine = list.querySelector('.fm-fixture--mine');
          const mr = matches.getBoundingClientRect();
          const sr = scroll.getBoundingClientRect();
          const mineStyle = getComputedStyle(mine);
          return {
            pathname: location.pathname,
            deckClass: deck.className,
            deckExpanded: deck.dataset.slfMatchesExpanded || '',
            deckHeight: deck.getBoundingClientRect().height,
            deckScrollHeight: deck.scrollHeight,
            deckOverflow: getComputedStyle(deck).overflow,
            matchesDisplay: getComputedStyle(matches).display,
            fieldDisplay: getComputedStyle(field).display,
            scrollDisplay: getComputedStyle(scroll).display,
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
            gridColumns: getComputedStyle(controls).gridTemplateColumns,
            times: rows.map(node => node.querySelector('.fm-fixture__time')?.textContent.trim()),
            rowIds: rows.map(node => node.dataset.fixtureId),
            mineIndex: rows.indexOf(mine),
            mineCount: list.querySelectorAll('.fm-fixture--mine').length,
            mineBackground: mineStyle.backgroundColor,
            mineBorder: mineStyle.borderTopColor,
            minePosition: mineStyle.position,
            rootChronological: document.documentElement.dataset.slfHeaderMatchesChronological || '',
            listChronological: list.dataset.slfChronologicalOrder || '',
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
          };
        }"""
    )


def inject_artifact(page):
    page.add_script_tag(path=str(ARTIFACT))
    page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
    page.wait_for_function("() => document.documentElement.dataset.slfHeaderMatchesFit === '1'")
    page.wait_for_function(
        "expected => [...document.querySelectorAll('.fm-fixture__time')].map(node => node.textContent.trim()).join(',') === expected.join(',')",
        arg=EXPECTED_TIMES,
    )
    page.wait_for_selector("#slf-header-matches-fit", state="attached")


def assert_normalized(before, after, collapsed):
    assert after["gridDisplay"] == "grid", after
    assert after["gridColumns"] != "none", after
    assert after["matchesDisplay"] == "flex", after
    assert after["fieldDisplay"] == "flex", after
    assert after["scrollDisplay"] == "block", after
    assert after["deckExpanded"] == "1", after
    assert after["deckOverflow"] == "visible", after
    assert after["deckHeight"] + 1 >= after["deckScrollHeight"], after
    assert after["maxChildRight"] <= after["matchesLeft"] + 1, after
    assert after["maxLogoRight"] <= after["matchesLeft"] + 1, after
    assert after["visibleRows"] == 7, after
    assert after["scrollHeight"] <= after["clientHeight"] + 1, after
    assert after["maxRowBottom"] <= after["scrollBottom"] + 1, after
    assert after["overflowY"] == "visible", after
    assert after["expandDisplay"] == "none", after
    assert after["times"] == EXPECTED_TIMES, after
    assert after["mineIndex"] == 1, after
    assert after["mineCount"] == 1, after
    assert after["mineBackground"] == before["mineBackground"], (before, after)
    assert after["mineBorder"] == before["mineBorder"], (before, after)
    assert after["minePosition"] == "relative", after
    assert after["rootChronological"] == "1", after
    assert after["listChronological"] == "1", after
    assert after["pageOverflow"] <= 1, after
    if collapsed:
        assert "fm-deck--collapsed" in after["deckClass"], after
        assert before["matchesDisplay"] == "none", before


def exercise_dynamic_replacement(page, before):
    page.evaluate(
        """() => {
          const list = document.querySelector('.fm-fixtures');
          const replacement = list.cloneNode(true);
          const mine = replacement.querySelector('.fm-fixture--mine');
          replacement.prepend(mine);
          const createRow = (id, label) => {
            const row = document.createElement('div');
            row.className = 'fm-fixture';
            row.dataset.fixtureId = id;
            row.innerHTML = `<span class="fm-fixture__time">22:00</span><span>КТ</span><span class="fm-fixture__team">${label}</span><span class="fm-score">vs</span><span class="fm-fixture__team">Соперник</span>`;
            return row;
          };
          replacement.append(createRow('equal-a', 'Первый'));
          replacement.append(createRow('equal-b', 'Второй'));
          list.replaceWith(replacement);
        }"""
    )
    expected_dynamic = ["17:00", "18:48", "19:48", "20:24", "21:12", "22:00", "22:00", "03:24", "04:24"]
    page.wait_for_function(
        "expected => [...document.querySelectorAll('.fm-fixture__time')].map(node => node.textContent.trim()).join(',') === expected.join(',')",
        arg=expected_dynamic,
    )
    dynamic = layout_metrics(page)
    assert dynamic["times"] == expected_dynamic, dynamic
    assert dynamic["mineIndex"] == 1, dynamic
    assert dynamic["mineCount"] == 1, dynamic
    assert dynamic["rowIds"].index("equal-a") < dynamic["rowIds"].index("equal-b"), dynamic
    assert len(dynamic["rowIds"]) == len(set(dynamic["rowIds"])), dynamic
    assert dynamic["mineBackground"] == before["mineBackground"], (before, dynamic)
    assert dynamic["mineBorder"] == before["mineBorder"], (before, dynamic)
    assert dynamic["scrollHeight"] <= dynamic["clientHeight"] + 1, dynamic
    assert dynamic["maxRowBottom"] <= dynamic["scrollBottom"] + 1, dynamic
    assert dynamic["pageOverflow"] <= 1, dynamic


def run_matches_case(browser, base_url, name, path, collapsed, dynamic):
    context = browser.new_context(locale="ru-RU", viewport={"width": 1500, "height": 900})
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(INIT_SCRIPT)
    suffix = "?collapsed=1" if collapsed else ""
    try:
        page.goto(base_url + path + suffix, wait_until="domcontentloaded")
        before = layout_metrics(page)
        assert before["times"][0:2] == ["18:48", "17:00"], before
        assert before["mineIndex"] == 0, before
        assert before["mineCount"] == 1, before
        if not collapsed:
            assert before["maxChildRight"] > before["matchesLeft"] + 1, before
            assert before["scrollHeight"] > before["clientHeight"] + 1, before

        inject_artifact(page)
        after = layout_metrics(page)
        assert after["pathname"] == path, after
        assert_normalized(before, after, collapsed)
        if dynamic:
            exercise_dynamic_replacement(page, before)

        page.wait_for_timeout(150)
        assert not page_errors, page_errors
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        print(f"[header-matches-e2e] passed: {name} version={VERSION}")
    finally:
        context.close()


def run_plain_case(browser, base_url):
    context = browser.new_context(locale="ru-RU", viewport={"width": 1200, "height": 800})
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(INIT_SCRIPT)
    try:
        page.goto(base_url + "/plain.php", wait_until="domcontentloaded")
        page.add_script_tag(path=str(ARTIFACT))
        page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
        page.wait_for_timeout(150)
        assert page.locator(".fm-card--matches").count() == 0
        assert page.locator("[data-slf-matches-expanded]").count() == 0
        assert not page_errors, page_errors
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        print(f"[header-matches-e2e] passed: plain-page version={VERSION}")
    finally:
        context.close()


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE

    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for name, path, collapsed, dynamic in PAGE_CASES:
                run_matches_case(browser, base_url, name, path, collapsed, dynamic)
            run_plain_case(browser, base_url)
        finally:
            browser.close()

    print(f"[header-matches-e2e] passed all: cases={len(PAGE_CASES) + 1} version={VERSION}")


if __name__ == "__main__":
    main()
