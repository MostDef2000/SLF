#!/usr/bin/env python3

import json
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-team-late-layout.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]

FORM_HTML = """<!doctype html><html><body>
<div id="player_form"><div id="coach_set"><div class="coach_expire"><span data-expire>Форма действует до 15.08.2026</span></div><input class="coachd" type="checkbox" checked></div></div>
</body></html>"""

CHAMP_HTML = """<!doctype html><html><body><div>Сезон 2026/27</div>
<table class="tourney_table">
<tr><th>№</th><th>Команда</th><th>И</th><th>Очки</th></tr>
<tr><td>1</td><td><a href="/roster.php?id=23698">Луч</a></td><td>4</td><td>12</td></tr>
<tr><td>2</td><td><a href="/roster.php?id=99999">Соперник</a></td><td>4</td><td>9</td></tr>
</table>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    champ_requests = 0

    def send_html(self, text: str):
        payload = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/team4.php" and query.get("action", [""])[0] == "form" and query.get("date", [""])[0] == "1":
            self.send_html(FORM_HTML)
        elif parsed.path == "/team4.php":
            self.send_html(FIXTURE.read_text(encoding="utf-8"))
        elif parsed.path == "/champ.php":
            type(self).champ_requests += 1
            time.sleep(0.30)
            self.send_html(CHAMP_HTML)
        elif parsed.path in {"/player.php", "/alter.php", "/roster.php", "/team.php"}:
            self.send_html("<!doctype html><html><body></body></html>")
        else:
            self.send_error(404)

    def log_message(self, _format, *_args):
        return


@contextmanager
def server():
    Handler.champ_requests = 0
    instance = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{instance.server_address[1]}"
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join(timeout=5)


def init_script() -> str:
    return """
(() => {
  'use strict';
  const store = new Map();
  window.__slfUnhandled = [];
  window.__slfPwned = 0;
  window.unsafeWindow = window;
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => key === 'slf_api_token' ? 'late-layout-token' : (store.has(key) ? store.get(key) : fallback);
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    setTimeout(() => request.onload?.({status: 200, statusText: 'OK', responseText: '[]', finalUrl: String(request.url || '')}), 0);
    return {abort() {}};
  };
  const jq = function() {
    return {
      on(){return this;}, off(){return this;}, find(){return this;}, each(){return this;}, first(){return this;},
      text(){return '';}, val(){return '';}, attr(){return undefined;}, data(){return undefined;}, append(){return this;},
      prepend(){return this;}, remove(){return this;}, length:0
    };
  };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
})();
"""


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE

    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(init_script())
        try:
            page.goto(base_url + "/team4.php", wait_until="domcontentloaded")
            page.add_script_tag(path=str(ARTIFACT))
            page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
            page.wait_for_function("() => window.__lateLayoutPromoted === true")
            page.wait_for_selector(".team-body > #slf-team4-championship-table #slf-team4-upcoming-matches")
            page.wait_for_function("() => document.getElementById('slf-team4-championship-table')?.dataset.slfUpcomingPromotion === 'ready'")

            evidence = page.evaluate("""() => {
              const panel = document.getElementById('slf-team4-championship-table');
              const upcoming = document.getElementById('slf-team4-upcoming-matches');
              const rows = [...upcoming.querySelectorAll('tbody tr')];
              return {
                beforePromotion: window.__lateLayoutBeforePromotion || '',
                failure: window.__lateLayoutFailure || '',
                sourcePresentBeforeRemoval: window.__legacyUpcomingPresentBeforeRemoval === true,
                sourceRemoved: window.__legacyUpcomingRemoved === true && !document.querySelector('.team-games__near'),
                panelCount: document.querySelectorAll('#slf-team4-championship-table').length,
                upcomingCount: document.querySelectorAll('#slf-team4-upcoming-matches').length,
                panelParent: panel.parentElement?.className || '',
                panelLayout: panel.dataset.slfTeamLayout || '',
                promotion: panel.dataset.slfUpcomingPromotion || '',
                rootPromotion: document.documentElement.dataset.slfTeamUpcomingPromotion || '',
                snapshotRows: document.documentElement.dataset.slfTeamUpcomingSnapshotRows || '',
                panelSource: panel.dataset.slfUpcomingSource || '',
                rootSource: document.documentElement.dataset.slfTeamUpcomingSource || '',
                rows: rows.length,
                chips: upcoming.querySelectorAll('.slf-form-chip').length,
                firstDate: rows[0]?.cells[0]?.textContent || '',
                firstOpponent: rows[0]?.cells[1]?.textContent || '',
                unsafeNodes: upcoming.querySelectorAll('img,script,svg,iframe').length,
                unsafeHref: upcoming.querySelector('a[href^="javascript:"]')?.getAttribute('href') || '',
                hostileText: upcoming.textContent.includes('<svg onload=window.__slfPwned=5>'),
                pwned: window.__slfPwned,
                unhandled: window.__slfUnhandled.slice()
              };
            }""")

            assert evidence["beforePromotion"] == "legacy-content", evidence
            assert evidence["failure"] == "", evidence
            assert evidence["sourcePresentBeforeRemoval"] and evidence["sourceRemoved"], evidence
            assert evidence["panelCount"] == 1 and evidence["upcomingCount"] == 1, evidence
            assert "team-body" in evidence["panelParent"], evidence
            assert evidence["panelLayout"] == "fm2026-roster-side", evidence
            assert evidence["promotion"] == "ready" and evidence["rootPromotion"] == "ready", evidence
            assert evidence["snapshotRows"] == "5", evidence
            assert evidence["panelSource"] == "pre-migration-snapshot" and evidence["rootSource"] == "pre-migration-snapshot", evidence
            assert evidence["rows"] == 5 and evidence["chips"] == 25, evidence
            assert evidence["firstDate"] == "09.08.2026" and evidence["firstOpponent"] == "Ньюпорт Каунти", evidence
            assert evidence["unsafeNodes"] == 0 and evidence["unsafeHref"] == "", evidence
            assert evidence["hostileText"] and evidence["pwned"] == 0, evidence
            assert evidence["unhandled"] == [] and page_errors == [], {"evidence": evidence, "page_errors": page_errors}
            assert Handler.champ_requests == 1, Handler.champ_requests
            print(f"[team-upcoming-pre-migration-snapshot] passed version={VERSION} requests={Handler.champ_requests}")
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
