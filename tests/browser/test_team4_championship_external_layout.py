#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]

TEAM_HTML = """<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Team4 championship external layout</title>
  <style>
    :root{--fm-panel:#171b29;--fm-panel-2:#1c2132;--fm-panel-3:#222842;--fm-border-2:#38415f;--fm-text:#eef1f8;--fm-muted:#8b93ab;--fm-green:#2bd97c;--fm-green-2:#43f58c;--fm-radius:14px;--fm-font:Arial,sans-serif}
    *{box-sizing:border-box}html,body{margin:0;min-width:0;background:#0d1018;color:#eef1f8;font-family:Arial,sans-serif}
    .fm-topbar{height:42px}.fm-deck{padding:8px 16px}.tf3{display:flex;gap:12px}.fm-stage{padding:16px}.content-ui__wrapper{width:100%;padding:16px;overflow:hidden;background:#101522;border-radius:14px}
    #globalcontent{width:min(1460px,100%);max-width:100%}.team-body{display:grid;grid-template-columns:366px minmax(0,1fr);gap:16px;align-items:start}.team-dash,.team-content{min-width:0}.team-dash{height:420px;background:#182031;border:1px solid #38415f;border-radius:14px}.team-content{height:360px;background:#171b29;border:1px solid #38415f;border-radius:14px;overflow:hidden}
    #general{height:100%}.roster-scroll{width:100%;height:100%;overflow:hidden}#generallist{width:100%;height:100%;table-layout:fixed;border-collapse:collapse}#generallist th,#generallist td{border:1px solid #38415f;padding:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    a{color:#8dc0ff}
  </style>
</head>
<body>
  <header class="fm-topbar"><div class="fm-topbar__right"></div></header>
  <section class="fm-deck"><div class="tf3"><div class="team-name"><a href="/roster.php?id=23698">Луч</a></div><div class="champ-url"><a href="/champ.php?action=view&id=54164">Высшая лига</a></div></div></section>
  <main class="fm-stage">
    <section class="content-ui__wrapper">
      <div id="globalcontent" class="user-custom__team-23698">
        <div class="team">
          <div class="team-head"><div class="team-head__links"><a href="/champ.php?action=view&id=54164">Чемпионат</a></div></div>
          <div class="team-body">
            <div class="team-dash"><div class="team-lineup"><div class="fcpitch lineup__roster"></div></div></div>
            <div class="team-content"><div id="general"><div class="roster-scroll"><table id="generallist"><thead><tr><th>#</th><th>АМ</th><th></th><th>Фамилия</th><th></th><th>Форма</th><th>Физ</th><th>НУ</th><th>Мор</th><th>ИГП</th><th>Воз</th><th>Тал</th><th>ПТ</th><th>ОП</th><th>Скилл</th><th>Р-скилл</th></tr></thead><tbody><tr><td>1</td><td>AM</td><td>CM</td><td>Игрок</td><td></td><td>7</td><td>100</td><td>0</td><td>100</td><td>100</td><td>24</td><td>5</td><td>→</td><td>0</td><td>150</td><td>160</td></tr></tbody></table></div></div></div>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>"""

FORM_HTML = """<!doctype html><html><body><div id="player_form"><div id="coach_set"><div class="coach_expire"><span data-expire>15.08.2026</span></div></div></div></body></html>"""
CHAMP_HTML = """<!doctype html><html><body><div>Сезон 2026/27</div><table class="tourney_table">
<tr><th>№</th><th>Команда</th><th>И</th><th>Очки</th></tr>
<tr><td>1</td><td><a href="/roster.php?id=23698">Луч</a></td><td>4</td><td>12</td></tr>
<tr><td>2</td><td><a href="/roster.php?id=99999">&lt;img src=x onerror=window.__slfPwned=1&gt;</a></td><td>4</td><td>9</td></tr>
</table></body></html>"""


class Handler(BaseHTTPRequestHandler):
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
        if parsed.path == "/team4.php" and query.get("action", [""])[0] == "form":
            self.send_html(FORM_HTML)
        elif parsed.path == "/team4.php":
            self.send_html(TEAM_HTML)
        elif parsed.path == "/champ.php":
            self.send_html(CHAMP_HTML)
        elif parsed.path in {"/player.php", "/alter.php"}:
            self.send_html("<!doctype html><html><body></body></html>")
        else:
            self.send_error(404)

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


def init_script() -> str:
    return """
(() => {
  const store = new Map();
  window.__slfUnhandled = [];
  window.__slfPwned = 0;
  window.unsafeWindow = window;
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => store.has(key) ? store.get(key) : fallback;
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    setTimeout(() => request.onload?.({status:200,statusText:'OK',responseText:'[]',finalUrl:String(request.url || '')}), 0);
    return {abort(){}};
  };
  const jq = function(){return {on(){return this;},off(){return this;},find(){return this;},each(){return this;},first(){return this;},text(){return '';},val(){return '';},attr(){return undefined;},data(){return undefined;},append(){return this;},prepend(){return this;},remove(){return this;},length:0};};
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
})();
"""


def inject(page: Page):
    page.add_script_tag(path=str(ARTIFACT))
    page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)


def geometry(page: Page):
    return page.evaluate(
        """() => {
          const body = document.querySelector('.team-body');
          const dash = document.querySelector('.team-dash');
          const content = document.querySelector('.team-content');
          const panel = document.getElementById('slf-team4-championship-table');
          const root = document.querySelector('.content-ui__wrapper');
          const rect = node => { const r = node.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
          return {
            viewport: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            columns: getComputedStyle(body).gridTemplateColumns.trim().split(/\\s+/),
            panelPosition: getComputedStyle(panel).position,
            rootOverflow: getComputedStyle(root).overflow,
            placement: panel.dataset.slfTeamPlacement || '',
            body: rect(body), dash: rect(dash), content: rect(content), panel: rect(panel)
          };
        }"""
    )


def open_team(browser: Browser, base_url: str, viewport):
    context = browser.new_context(locale="ru-RU", viewport=viewport)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(init_script())
    page.goto(base_url + "/team4.php", wait_until="domcontentloaded")
    inject(page)
    return context, page, errors


def assert_common_panel(page: Page, errors):
    page.wait_for_selector("#slf-team4-championship-table")
    page.wait_for_function("() => document.querySelector('#slf-team4-championship-table tbody tr')")
    assert page.locator("#slf-team4-championship-table tr.slf-active-team").count() == 1
    assert page.locator("#slf-team4-championship-table img, #slf-team4-championship-table script, #slf-team4-championship-table svg").count() == 0
    assert "<img src=x onerror=window.__slfPwned=1>" in page.locator("#slf-team4-championship-table").inner_text()
    assert page.evaluate("window.__slfPwned") == 0
    assert page.evaluate("window.__slfUnhandled.slice()") == []
    assert errors == []


def assert_wide(browser: Browser, base_url: str):
    context, page, errors = open_team(browser, base_url, {"width": 1920, "height": 1000})
    try:
        assert_common_panel(page, errors)
        page.wait_for_function("() => document.getElementById('slf-team4-championship-table')?.dataset.slfTeamPlacement === 'external-right'")
        evidence = geometry(page)
        assert len(evidence["columns"]) == 2, evidence
        assert abs(evidence["dash"]["width"] - 366) <= 1, evidence
        expected_roster = evidence["body"]["width"] - evidence["dash"]["width"] - 16
        assert abs(evidence["content"]["width"] - expected_roster) <= 2, evidence
        assert evidence["panelPosition"] == "absolute", evidence
        assert evidence["panel"]["left"] >= evidence["body"]["right"] + 13, evidence
        assert evidence["panel"]["right"] <= evidence["viewport"] - 7, evidence
        assert evidence["panel"]["left"] >= evidence["content"]["right"] + 13, evidence
        assert evidence["rootOverflow"] == "visible", evidence
        assert evidence["scrollWidth"] <= evidence["viewport"] + 1, evidence
        print(f"[team4-championship-layout] passed: external viewport=1920 version={VERSION}")
    finally:
        context.close()


def assert_fallback(browser: Browser, base_url: str):
    context, page, errors = open_team(browser, base_url, {"width": 1440, "height": 1000})
    try:
        assert_common_panel(page, errors)
        page.wait_for_function("() => document.getElementById('slf-team4-championship-table')?.dataset.slfTeamPlacement === 'below-content'")
        evidence = geometry(page)
        assert len(evidence["columns"]) == 2, evidence
        assert abs(evidence["dash"]["width"] - 366) <= 1, evidence
        expected_roster = evidence["body"]["width"] - evidence["dash"]["width"] - 16
        assert abs(evidence["content"]["width"] - expected_roster) <= 2, evidence
        assert evidence["panelPosition"] == "static", evidence
        assert evidence["panel"]["top"] >= max(evidence["dash"]["bottom"], evidence["content"]["bottom"]) + 15, evidence
        assert evidence["panel"]["left"] >= evidence["body"]["left"] - 1, evidence
        assert evidence["panel"]["right"] <= evidence["body"]["right"] + 1, evidence
        assert evidence["scrollWidth"] <= evidence["viewport"] + 1, evidence
        print(f"[team4-championship-layout] passed: fallback viewport=1440 version={VERSION}")
    finally:
        context.close()


def assert_mobile_unchanged(browser: Browser, base_url: str):
    context, page, errors = open_team(browser, base_url, {"width": 1024, "height": 900})
    try:
        page.wait_for_timeout(300)
        assert page.locator("#slf-team4-championship-table").count() == 0
        assert page.locator(".team-body.slf-team4-championship-layout").count() == 0
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        assert errors == []
        print(f"[team4-championship-layout] passed: mobile-unchanged viewport=1024 version={VERSION}")
    finally:
        context.close()


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            assert_wide(browser, base_url)
            assert_fallback(browser, base_url)
            assert_mobile_unchanged(browser, base_url)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
