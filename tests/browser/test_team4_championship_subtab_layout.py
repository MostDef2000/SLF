#!/usr/bin/env python3
"""Issue #363 regression: team4 championship roster-side layout must exist only while
the roster sub-tab is active.

Sub-tab switch (column-set switcher .sub-panel-*/squad switcher .tpanel-*) => the
`slf-team4-championship-*` classes are removed from `.team-body`, the panel is hidden and
`.team-content` regains the site-native full width; returning to the roster sub-tab
(«Основная команда» + «основные») re-applies the layout.

Issue #365 regression (same harness, real browser measurement): on the roster view the
fm2026 compaction CSS must not collapse the «Игрок» name column. The 16-column roster
fixture (tests/browser/fixtures/fm2026-team-main.html, content column ~656px — the live
688px regime at a 1280px viewport) must keep the name th >= 120px with the cell text
rendered, not clipped to invisibility. The old table-layout:fixed + per-column px budget
collapses it to < 30px — the fixture's inline verify encodes the same gate.

Run artifact override for local runs: SLF_TEST_ARTIFACT=/path/to/latest.user.js
(CI default stays releases/latest.user.js, built from the approved source commit).
"""

import json
import os
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path.cwd()
ARTIFACT = Path(os.environ.get("SLF_TEST_ARTIFACT") or (ROOT / "releases" / "latest.user.js"))
FIXTURE_TEAM = ROOT / "tests" / "browser" / "fixtures" / "fm2026-team-main.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]

# Site-native fm2026 grid (340px dash) — deliberately different from the plugin's 366px
# clamp so roster-side vs native flow are distinguishable in computed styles.
TEAM_CSS = """
    :root{--fm-panel:#171b29;--fm-panel-2:#1c2132;--fm-panel-3:#222842;--fm-border-2:#38415f;--fm-text:#eef1f8;--fm-muted:#8b93ab;--fm-green:#2bd97c;--fm-green-2:#43f58c;--fm-radius:14px;--fm-font:Arial,sans-serif}
    *{box-sizing:border-box}html,body{margin:0;min-width:0;background:#0d1018;color:#eef1f8;font-family:Arial,sans-serif}
    .fm-topbar{height:42px}.fm-deck{padding:8px 16px}.tf3{display:flex;gap:12px}.fm-stage{padding:16px}.content-ui__wrapper{width:100%;padding:16px;overflow:hidden;background:#101522;border-radius:14px}
    #globalcontent{width:min(1460px,100%);max-width:100%}.team-body{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start}.team-dash,.team-content{min-width:0}.team-dash{height:420px;background:#182031;border:1px solid #38415f;border-radius:14px}.team-content{height:360px;background:#171b29;border:1px solid #38415f;border-radius:14px;overflow:hidden}
    #general{height:100%}.roster-scroll{width:100%;height:100%;overflow:hidden}#generallist{width:100%;height:100%;table-layout:fixed;border-collapse:collapse}#generallist th,#generallist td{border:1px solid #38415f;padding:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tmr-groups,.tmr-seg{display:flex;gap:8px;padding:6px 0}.tpanel-a,.tpanel-b,.sub-panel-a,.sub-panel-b{padding:2px 10px;cursor:pointer;border:1px solid #38415f;border-radius:8px}
    a{color:#8dc0ff}
"""

SWITCHER_HTML = """
          <div class="tmr-groups">
            <div class="tpanel-a"><span class="wide_format">Основная команда</span><span class="mobile_format">Основа</span></div>
            <div class="tpanel-b"><span>Резерв</span></div>
            <div class="tpanel-b"><span>Академия</span></div>
          </div>
          <div class="tmr-seg">
            <div class="sub-panel-a"><span class="wide_format">основные</span><span class="mobile_format">состояние</span></div>
            <div class="sub-panel-b"><span class="wide_format">финансы</span><span class="mobile_format">контракты</span></div>
            <div class="sub-panel-b"><span>скиллы</span></div>
          </div>
"""

# Mirrors the real site switch: the clicked item takes the active class, the previous
# active item is demoted — pure class-attribute mutations inside #general. Delegation on
# the group containers keeps every item clickable in BOTH directions (the real site binds
# onclick per item; a per-item binding on the initially-inactive items only would make
# the demoted active item dead after the first switch).
SWITCHER_JS = """
document.querySelectorAll('.tmr-groups, .tmr-seg').forEach(group => {
  group.addEventListener('click', event => {
    const el = event.target.closest('.tpanel-a, .tpanel-b, .sub-panel-a, .sub-panel-b');
    if (!el || !group.contains(el)) return;
    const kind = el.classList.contains('tpanel-a') || el.classList.contains('tpanel-b') ? 'tpanel' : 'sub-panel';
    const active = group.querySelector('.' + kind + '-a');
    if (active && active !== el) { active.classList.remove(kind + '-a'); active.classList.add(kind + '-b'); }
    el.classList.remove(kind + '-b');
    el.classList.add(kind + '-a');
  });
});
"""


def team_html(switcher: str) -> str:
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Team4 championship sub-tab layout</title>
  <style>{TEAM_CSS}</style>
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
            <div class="team-content"><div id="general"><form class="tmr">{switcher}<div class="roster-scroll"><table id="generallist"><thead><tr><th>#</th><th>АМ</th><th></th><th>Фамилия</th><th></th><th>Форма</th></tr></thead><tbody><tr><td>1</td><td>AM</td><td>CM</td><td>Игрок</td><td></td><td>7</td></tr></tbody></table></div></form></div></div>
          </div>
        </div>
      </div>
    </section>
  </main>
  <script>{SWITCHER_JS}</script>
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
            self.send_html(team_html("" if query.get("noswitch") else SWITCHER_HTML))
        elif parsed.path == "/fixtures/fm2026-team-main.html":
            # Issue #365: serve the 16-column roster fixture so the name-column
            # width is measured against the collapse regime (content ~656px).
            self.send_html(FIXTURE_TEAM.read_text(encoding="utf-8"))
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
            layoutClass: body ? body.classList.contains('slf-team4-championship-layout') : null,
            rosterSideClass: body ? body.classList.contains('slf-team4-championship-roster-side') : null,
            genericContentClass: body ? body.classList.contains('team_general_content') : null,
            externalClass: body ? body.classList.contains('slf-team4-championship-external') : null,
            columns: getComputedStyle(body).gridTemplateColumns.trim().split(/\\s+/),
            panelDisplay: panel ? getComputedStyle(panel).display : null,
            panelPresent: !!panel,
            rootOverflow: getComputedStyle(root).overflow,
            placement: panel ? (panel.dataset.slfTeamPlacement || '') : '',
            body: rect(body), dash: rect(dash), content: rect(content)
          };
        }"""
    )


def open_team(browser: Browser, base_url: str, viewport, query: str = ""):
    context = browser.new_context(locale="ru-RU", viewport=viewport)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(init_script())
    page.goto(base_url + "/team4.php" + query, wait_until="domcontentloaded")
    return context, page, errors


CHAMP_CLASSES = ("slf-team4-championship-layout", "slf-team4-championship-roster-side")


def assert_roster_layout(page: Page, errors):
    page.wait_for_selector("#slf-team4-championship-table")
    page.wait_for_function("() => document.querySelector('#slf-team4-championship-table tbody tr')")
    page.wait_for_function("() => document.querySelector('.team-body')?.classList.contains('slf-team4-championship-layout')")
    evidence = geometry(page)
    assert evidence["layoutClass"] and evidence["rosterSideClass"], evidence
    assert evidence["genericContentClass"], evidence
    assert evidence["columns"][0] == "366px", evidence
    assert abs(evidence["dash"]["width"] - 366) <= 1, evidence
    assert evidence["panelDisplay"] == "block", evidence
    assert evidence["panelPresent"], evidence
    assert evidence["placement"] == "below-content", evidence
    expected_roster = evidence["body"]["width"] - 366 - 16
    assert abs(evidence["content"]["width"] - expected_roster) <= 2, evidence
    assert errors == []
    return evidence


def assert_native_width(page: Page, errors, baseline_width):
    page.wait_for_function(
        "() => !document.querySelector('.team-body')?.classList.contains('slf-team4-championship-layout')"
    )
    page.wait_for_function(
        "() => { const p = document.getElementById('slf-team4-championship-table'); return p && getComputedStyle(p).display === 'none'; }"
    )
    evidence = geometry(page)
    assert not evidence["layoutClass"] and not evidence["rosterSideClass"], evidence
    assert not evidence["genericContentClass"], evidence
    assert not evidence["externalClass"], evidence
    assert evidence["columns"][0] == "340px", evidence
    assert evidence["panelDisplay"] == "none", evidence
    assert evidence["rootOverflow"] == "hidden", evidence
    assert abs(evidence["content"]["width"] - baseline_width) <= 2, evidence
    assert errors == []
    return evidence


def assert_subtab_cycle(browser: Browser, base_url: str):
    context, page, errors = open_team(browser, base_url, {"width": 1440, "height": 1000})
    try:
        # A/B baseline: no-plugin finance sub-tab width (before the userscript is injected).
        page.locator(".tmr-seg .sub-panel-b:has-text('финансы')").first.click()
        page.wait_for_function("() => document.querySelector('.sub-panel-a')?.textContent.includes('финансы')")
        baseline = geometry(page)
        assert baseline["columns"][0] == "340px", baseline
        baseline_width = baseline["content"]["width"]

        inject(page)

        # 1. Plugin loads while a non-roster sub-tab is active: layout must stay off.
        # state="attached": the panel is intentionally display:none on non-roster
        # sub-tabs (issue #363), so the default state="visible" would time out.
        page.wait_for_selector("#slf-team4-championship-table", state="attached")
        page.wait_for_function("() => document.querySelector('#slf-team4-championship-table tbody tr')")
        evidence = assert_native_width(page, errors, baseline_width)
        assert evidence["panelPresent"], evidence

        # 2. Return to the roster sub-tab: championship layout re-applies.
        # Active-agnostic click: after the baseline «финансы» click «основные» carries
        # .sub-panel-b, so a ".sub-panel-a:has-text(…)" selector would match nothing.
        page.locator(".tmr-seg > div:has-text('основные')").first.click()
        page.wait_for_function("() => document.querySelector('.sub-panel-a')?.textContent.includes('основные')")
        assert_roster_layout(page, errors)

        # 3. Column-set switch to «финансы»: classes removed, native width restored.
        page.locator(".tmr-seg .sub-panel-b:has-text('финансы')").first.click()
        assert_native_width(page, errors, baseline_width)

        # 4. Squad switch to «Резерв» (from the roster view): layout removed as well.
        page.locator(".tmr-seg > div:has-text('основные')").first.click()
        assert_roster_layout(page, errors)
        page.locator(".tmr-groups .tpanel-b:has-text('Резерв')").first.click()
        page.wait_for_function("() => document.querySelector('.tmr-groups .tpanel-a')?.textContent.includes('Резерв')")
        assert_native_width(page, errors, baseline_width)

        # 5. Back to the main squad, still «основные»: layout re-applies.
        page.locator(".tmr-groups .tpanel-b:has-text('Основная команда')").first.click()
        page.wait_for_function("() => document.querySelector('.tmr-groups .tpanel-a')?.textContent.includes('Основная')")
        assert_roster_layout(page, errors)

        assert page.evaluate("window.__slfPwned") == 0
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        assert errors == []
        print(f"[team4-championship-subtab] passed: sub-tab cycle viewport=1440 version={VERSION}")
    finally:
        context.close()


def assert_no_switcher_defaults_roster(browser: Browser, base_url: str):
    # Pages without the switcher (other site states, older mocks) keep the roster layout.
    context, page, errors = open_team(browser, base_url, {"width": 1440, "height": 1000}, query="?noswitch=1")
    try:
        inject(page)
        assert_roster_layout(page, errors)
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        print(f"[team4-championship-subtab] passed: no-switcher-default viewport=1440 version={VERSION}")
    finally:
        context.close()


def assert_roster_name_column_visible(browser: Browser, base_url: str):
    """Issue #365: the fm2026 roster compaction CSS must not collapse the «Игрок» column.

    Loads the 16-column roster fixture (name column 4th, numeric columns carrying the
    classes/rstat markup the compaction block targets; content column ~656px mirrors the
    live 688px@1280 regime) through a /team4.php route: the plugin's championship panel
    and the fixture's own inline verify are gated on the team4.php pathname plus a
    1280px viewport (isTeam4MainPage + matchMedia('(min-width: 1280px)')), so the routed
    load makes the fixture self-check — tableLayout 'auto', fit gates, nameThWidth >= 120,
    name text visible — execute inside this case; a fixture regression surfaces as a
    page error and fails the errors assertion below. Sub-resource fetches
    (/team4.php?action=…, /champ.php) do not match the end-anchored route glob and hit
    the live server handlers. Under the reverted fix the forced table-layout:fixed px
    budget leaves the name th < 30px and the text clipped; with the fix (auto layout,
    no px budget, min-width floor) the name th stays >= 120px and the text renders.
    """
    context = browser.new_context(locale="ru-RU", viewport={"width": 1280, "height": 1000})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(init_script())
    # Serve the fixture AS /team4.php so the pathname-gated championship panel mounts and
    # the fixture's inline self-verify actually runs; only the document is intercepted.
    fixture_html = FIXTURE_TEAM.read_text(encoding="utf-8")
    page.route(
        "**/team4.php",
        lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=fixture_html),
    )
    page.goto(base_url + "/team4.php", wait_until="domcontentloaded")
    try:
        inject(page)
        page.wait_for_function("() => !!document.querySelector('#generallist thead .player-column-name')")
        page.wait_for_function("() => document.getElementById('generallist')?.dataset.slfRosterFit === '1'")
        # The fixture verify assigns __slfRosterFitEvidence (non-skipped at this viewport)
        # immediately before its own pass/throw decision; waiting for it plus a short
        # settle (assert_clean convention) guarantees its outcome is already in `errors`.
        page.wait_for_function("() => window.__slfRosterFitEvidence && !window.__slfRosterFitEvidence.skipped")
        page.wait_for_timeout(150)
        evidence = page.evaluate(
            """() => {
              const table = document.getElementById('generallist');
              const th = table.tHead.rows[0].querySelector('.player-column-name');
              const td = table.tBodies[0].rows[0].querySelector('.player-column-name');
              const cell = td.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(td);
              const text = range.getBoundingClientRect();
              return {
                columns: table.tHead.rows[0].cells.length,
                tableLayout: getComputedStyle(table).tableLayout,
                nameThWidth: th.getBoundingClientRect().width,
                nameTdWidth: cell.width,
                nameTextWidth: text.width,
                nameTextInside: text.width > 0 && text.left >= cell.left - 1 && text.right <= cell.right + 1,
                wrapperOverflow: {scroll: table.closest('.roster-scroll').scrollWidth, client: table.closest('.roster-scroll').clientWidth},
                fixtureVerifyRan: !!(window.__slfRosterFitEvidence && !window.__slfRosterFitEvidence.skipped)
              };
            }"""
        )
        assert evidence["columns"] == 16, evidence
        assert evidence["nameThWidth"] >= 120, evidence
        assert evidence["nameTextInside"], evidence
        assert evidence["wrapperOverflow"]["scroll"] <= evidence["wrapperOverflow"]["client"] + 1, evidence
        assert evidence["fixtureVerifyRan"], evidence
        assert errors == [], errors
        print(
            f"[team4-championship-subtab] passed: roster-name-column viewport=1280 "
            f"nameTh={evidence['nameThWidth']:.0f}px textInside={evidence['nameTextInside']} "
            f"fixtureVerify={evidence['fixtureVerifyRan']} version={VERSION}"
        )
    finally:
        context.close()


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE_TEAM.is_file(), FIXTURE_TEAM
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            assert_subtab_cycle(browser, base_url)
            assert_no_switcher_defaults_roster(browser, base_url)
            assert_roster_name_column_visible(browser, base_url)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
