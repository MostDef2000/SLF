#!/usr/bin/env python3
"""Issue #385 e2e: team4 championship-table-swap module.

The new module (src/modules/team-management/team4-championship-table-swap.js) replaces the
legacy #slf-team4-championship-table side panel on the fm2026 team4 main page: it fetches
the championship table from /roster.php?id=<teamId>, mounts it as a .pcard.slf-champ card
right below the lineup pitch, moves the infirmary / disqualified / loan-request cards into a
.slf-moved container at the bottom of the right column, removes the legacy panel, and cleans
the legacy layout classes.

Run artifact override for local runs: SLF_TEST_ARTIFACT=/path/to/latest.user.js
(CI default stays releases/latest.user.js, built from the approved source commit).

The base page is tests/browser/fixtures/fm2026-team-main.html served verbatim by a local
HTTP server, plus server-side injections (the fixture file is never modified):
  (a) the third titled .pcard card («Ваши заявки на аренду») — the fixture ships only two of
      the three the module's ready-gate requires;
  (b) the legacy-conflict state: the #slf-team4-championship-table panel node, the legacy
      classes on .team-body, and slf-team4-championship-overflow on the .content-ui__wrapper.

The /roster.php stub carries a .roster_champ_table that begins with the live .top-head
header — an inline .rstr-ico SVG with NO width/height attributes (the production defect
trigger: on team4.php nothing styles it, so it renders as a ~322px placeholder block),
a .rstr-head__title league link, and a .rstr-head__end with two .champ-toggle anchors the
module must strip — followed by the table whose own-team row links via
roster.php?id=<teamId>; a player.php row carries the SAME id to prove the module's
club-link-only own-row matching excludes player.php; one row ships a .champ-toggle button
and an inline display:none to prove the module expands every row. The stub never pre-marks
slf-own — the module computes it.

NOTE on the fixture's inline self-verify: fm2026-team-main.html embeds a legacy
(#363/#365) self-check that asserts the side-panel layout (panel present in .team-body with
a computed placement). The #385 module intentionally removes that panel and re-lays the page
out, so that legacy self-check is expected to fail on the happy path (and, due to a
placement race, intermittently elsewhere). Those two specific messages are filtered from the
pageerror assertions below; every other pageerror still fails the test.
"""

import json
import os
import re
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, Page, sync_playwright

ROOT = Path.cwd()
ARTIFACT = Path(os.environ.get("SLF_TEST_ARTIFACT") or (ROOT / "releases" / "latest.user.js"))
FIXTURE_TEAM = ROOT / "tests" / "browser" / "fixtures" / "fm2026-team-main.html"


def expected_version() -> str:
    """The scriptVersion the injected artifact must report.

    CI default (releases/latest.user.js): the data/version.json manifest of the approved
    build. SLF_TEST_ARTIFACT override: the repo manifest describes the repo's own build,
    not the override, so the artifact's own // @version header is the expected version —
    the gate still proves the override actually loaded and registered window.SLF.
    """
    if not os.environ.get("SLF_TEST_ARTIFACT"):
        return json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]
    for line in ARTIFACT.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.match(r"\s*//\s*@version\s+(\S+)", line)
        if match:
            return match.group(1)
    raise AssertionError(f"no // @version header in {ARTIFACT}")


VERSION = expected_version()

TEAM_ID = "23698"
CLUB_NAME = "Луч"
LEAGUE_NAME = "Тестовая лига"
MOVED_TITLES = ["Лазарет клуба", "Дисквалифицированные игроки", "Ваши заявки на аренду"]

# The fixture's legacy (#363/#365) inline self-verify throws one of these two messages when
# the #385 module removes the side panel / re-lays the page. They are expected here and are
# not module defects; all other pageerrors still fail the assertions.
FIXTURE_VERIFY_ERROR_PREFIXES = (
    "SLF team layout adapters did not attach",
    "SLF roster/version/championship/full-lineup-names regression",
)

# Server-side injections (the fixture file itself is never modified).
THIRD_CARD = (
    '<div class="pcard"><div class="pcard__head2">Ваши заявки на аренду</div>'
    '<table class="team-mini"><tr><td>Нет заявок</td></tr></table></div>'
)
LEGACY_PANEL = (
    '<aside id="slf-team4-championship-table">'
    '<div class="slf-champ-title"><a href="/champ.php?action=view&id=54164">Высшая лига</a></div>'
    '<table><thead><tr><th>№</th><th>Команда</th><th>И</th><th>О</th></tr></thead>'
    '<tbody><tr><td>1</td><td>Луч</td><td>4</td><td>12</td></tr></tbody></table></aside>'
)

# The roster.php stub: the .roster_champ_table begins with the live .top-head header —
# .rstr-ico SVG (no width/height attributes: the defect trigger), .rstr-head__title league
# link, .rstr-head__end with two .champ-toggle anchors (the module must strip them too) —
# then the table: own-team row links via roster.php?id=<teamId>; a player.php row carries
# the SAME id (must NOT be marked own); a team.php row carries a different id; one row
# ships a .champ-toggle + inline display:none (the module must expand it). No slf-own.
ROSTER_HTML = f"""<!doctype html><html><body>
<div class="roster_champ_table">
  <div class="top-head">
    <svg class="rstr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8m-4-4v4M7 4h10l3 8H4l3-8zm0 8v5h10v-5"/></svg>
    <span class="rstr-head__title"><a href="/champ.php?action=view&id=56627" class="rstr-a">{LEAGUE_NAME}</a></span>
    <span class="rstr-head__end">
      <a href="javascript:void(0)" class="champ-line-btn-1 champ-toggle">1</a>
      <a href="javascript:void(0)" class="champ-line-btn-0 champ-toggle">0</a>
    </span>
  </div>
  <table>
    <thead><tr><th>№</th><th>Команда</th><th>И</th><th>О</th></tr></thead>
    <tbody>
      <tr><td>1</td><td><a href="/roster.php?id={TEAM_ID}">{CLUB_NAME}</a></td><td>4</td><td>12</td></tr>
      <tr style="display:none"><td>2</td><td><a href="/team.php?id=99999">Соперник</a></td><td>4</td><td>9</td><td><button class="champ-toggle">показать</button></td></tr>
      <tr><td>3</td><td><a href="/player.php?id={TEAM_ID}">Игрок с тем же id</a></td><td>4</td><td>7</td></tr>
    </tbody>
  </table>
</div>
</body></html>"""

# Served to the legacy module's /champ.php fetch (keeps it quiet; the panel is injected).
CHAMP_HTML = """<!doctype html><html><body><div>Сезон 2026/27</div><table class="tourney_table">
<tr><th>№</th><th>Команда</th><th>И</th><th>Очки</th></tr>
<tr><td>1</td><td><a href="/roster.php?id=23698">Луч</a></td><td>4</td><td>12</td></tr>
<tr><td>2</td><td><a href="/roster.php?id=99999">Соперник</a></td><td>4</td><td>9</td></tr>
</table></body></html>"""

# Mutable per-run roster.php status (the module fetches /roster.php?id=… with no flag of its
# own, so the failure case is driven by this server-side switch).
ROSTER_STATUS = {"status": 200}


def fixture_html() -> str:
    return FIXTURE_TEAM.read_text(encoding="utf-8")


def with_third_card(html: str) -> str:
    anchor = (
        '<div class="pcard"><div class="pcard__head2">Дисквалифицированные игроки</div>'
        '<table class="team-mini"><tr><td>Нет дисквалификаций</td></tr></table></div>'
    )
    assert anchor in html, "fixture anchor for the 3rd-card injection not found"
    return html.replace(anchor, anchor + "\n              " + THIRD_CARD, 1)


def legacy_conflict_html() -> str:
    """Fixture + 3rd card + legacy panel node + legacy classes + wrapper overflow class."""
    html = with_third_card(fixture_html())
    html = html.replace(
        '<div class="team-body">',
        '<div class="team-body slf-team4-championship-layout slf-team4-championship-roster-side '
        'team_general_content" data-slf-champ-generic-content="1">' + LEGACY_PANEL,
        1,
    )
    html = html.replace(
        '<section class="content-ui__wrapper">',
        '<section class="content-ui__wrapper slf-team4-championship-overflow">',
        1,
    )
    return html


def nonfm2026_html() -> str:
    """Legacy-conflict page with every fm2026 design marker removed (gate case).

    The version-badge module (src/app/version-badge.js) sets documentElement.dataset.slfDesign
    to 'fm2026' when ANY of .fm-stage/.fm-topbar/.fm-deck/.content-ui__wrapper/.ui-tactic__wrap
    is present, and the swap module's isFm2026Design() also accepts that dataset flag. So a true
    non-fm2026 page must drop all of those markers, not just .fm-stage.
    """
    html = legacy_conflict_html()
    # legacy_conflict_html() already appended the overflow class to the wrapper, so its
    # class attribute is "content-ui__wrapper slf-team4-championship-overflow".
    renames = (
        ('class="fm-stage"', 'class="fm-stage-nonfm"'),
        ('class="fm-topbar"', 'class="fm-topbar-nonfm"'),
        ('class="fm-deck"', 'class="fm-deck-nonfm"'),
        ('class="content-ui__wrapper slf-team4-championship-overflow"',
         'class="content-ui__wrapper-nonfm slf-team4-championship-overflow"'),
    )
    for old, new in renames:
        assert old in html, f"fm2026 marker not found: {old}"
        html = html.replace(old, new, 1)
    return html


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
        if parsed.path == "/roster.php":
            if ROSTER_STATUS["status"] == 500:
                self.send_error(500)
            else:
                self.send_html(ROSTER_HTML)
        elif parsed.path == "/team4.php":
            if query.get("case", [""])[0] == "nonfm":
                self.send_html(nonfm2026_html())
            else:
                self.send_html(legacy_conflict_html())
        elif parsed.path == "/champ.php":
            self.send_html(CHAMP_HTML)
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


def module_pageerrors(errors):
    """Pageerrors minus the fixture's legacy (#363/#365) self-verify messages."""
    return [e for e in errors if not any(e.startswith(p) for p in FIXTURE_VERIFY_ERROR_PREFIXES)]


def open_team(browser: Browser, base_url: str, query: str = ""):
    context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(init_script())
    page.goto(base_url + "/team4.php" + query, wait_until="domcontentloaded")
    return context, page, errors


EVIDENCE_JS = """() => {
  const champ = document.querySelector('.pcard.slf-champ');
  const lineup = document.querySelector('.pcard.team-lineup');
  const moved = document.querySelector('.slf-moved');
  const teamContent = document.querySelector('.team-content');
  const teamBody = document.querySelector('.team-body');
  // The non-fm2026 gate page renames .content-ui__wrapper, so locate the wrapper via its
  // stable child #globalcontent instead of the (possibly renamed) class.
  const wrapper = document.querySelector('.content-ui__wrapper')
    || document.querySelector('#globalcontent')?.parentElement;
  const panel = document.getElementById('slf-team4-championship-table');
  const ownRows = [...document.querySelectorAll('.slf-champ tr.slf-own')];
  const rows = [...document.querySelectorAll('.slf-champ tr')];
  const movedCards = moved
    ? [...moved.querySelectorAll('.pcard')].map(c => (c.querySelector('.pcard__head2')?.textContent || '').replace(/\\s+/g, ' ').trim())
    : [];
  return {
    champPresent: !!champ,
    champAfterLineup: !!(champ && lineup && lineup.nextElementSibling === champ),
    movedPresent: !!moved,
    movedIsLastChild: !!(moved && teamContent && teamContent.lastElementChild === moved),
    movedCards,
    panelPresent: !!panel,
    bodyClasses: teamBody ? [...teamBody.classList] : [],
    wrapperClasses: wrapper ? [...wrapper.classList] : [],
    ownRowCount: ownRows.length,
    ownRowText: ownRows[0] ? ownRows[0].textContent.replace(/\\s+/g, ' ').trim() : '',
    toggleCount: document.querySelectorAll('.slf-champ .champ-toggle').length,
    rowDisplay: rows.map(r => getComputedStyle(r).display),
    rowCount: rows.length
  };
}"""


# Live-header defect probe (issue #385 follow-up): the roster.php .top-head carries an
# inline .rstr-ico SVG with no width/height; on team4.php nothing styles it, so the
# un-fixed module mounts it verbatim and it renders as a ~322px placeholder block.
# Approved fix (option Б): the icon is stripped at mount time, the head stays a slim
# text row with the league link.
HEADER_JS = """() => {
  const card = document.querySelector('.pcard.slf-champ');
  const head = card ? card.querySelector('.top-head') : null;
  const rect = head ? head.getBoundingClientRect() : null;
  return {
    cardPresent: !!card,
    iconCount: card ? card.querySelectorAll('.rstr-ico').length : -1,
    headPresent: !!head,
    headHeight: rect ? rect.height : -1,
    headText: head ? head.textContent.replace(/\\s+/g, ' ').trim() : ''
  };
}"""


def assert_happy_path(browser: Browser, base_url: str):
    """Case 1: legacy-conflict page, roster.php 200 → full swap."""
    ROSTER_STATUS["status"] = 200
    context, page, errors = open_team(browser, base_url)
    try:
        inject(page)
        page.wait_for_selector(".pcard.slf-champ")
        page.wait_for_function("() => !document.getElementById('slf-team4-championship-table')")
        page.wait_for_selector(".slf-moved")
        evidence = page.evaluate(EVIDENCE_JS)
        assert evidence["champPresent"], evidence
        assert evidence["champAfterLineup"], evidence
        assert evidence["movedPresent"], evidence
        assert evidence["movedIsLastChild"], evidence
        assert sorted(evidence["movedCards"]) == sorted(MOVED_TITLES), evidence
        assert not evidence["panelPresent"], evidence
        for legacy in ("slf-team4-championship-layout", "slf-team4-championship-roster-side",
                       "team_general_content", "slf-team4-championship-external"):
            assert legacy not in evidence["bodyClasses"], evidence
        assert "slf-team4-championship-overflow" not in evidence["wrapperClasses"], evidence
        assert evidence["ownRowCount"] == 1, evidence
        assert CLUB_NAME in evidence["ownRowText"], evidence
        assert evidence["toggleCount"] == 0, evidence
        assert evidence["rowCount"] >= 3, evidence
        assert all(d != "none" for d in evidence["rowDisplay"]), evidence
        # Live-header defect probe: the mounted card must not carry the unstyled .rstr-ico
        # SVG (option Б strips it at mount time), the .top-head must stay a slim text row
        # (≤ 40px rendered — the user-visible outcome), and the league link must survive.
        header = page.evaluate(HEADER_JS)
        assert header["cardPresent"], header
        assert header["iconCount"] == 0, f"live header bug: mounted card still contains .rstr-ico icon(s): {header}"
        assert header["headPresent"], header
        assert header["headHeight"] <= 40, f"live header bug: .top-head renders {header['headHeight']}px tall (unstyled .rstr-ico SVG): {header}"
        assert LEAGUE_NAME in header["headText"], f"league link lost from .top-head: {header}"
        assert module_pageerrors(errors) == [], errors
        print(f"[team4-champ-table-swap] passed: happy-path viewport=1440 version={VERSION}")
    finally:
        context.close()


def assert_failure_path(browser: Browser, base_url: str):
    """Case 2: legacy-conflict page, roster.php 500 → no mount, native layout kept."""
    ROSTER_STATUS["status"] = 500
    context, page, errors = open_team(browser, base_url)
    try:
        inject(page)
        # The module's ready-gate settles (~300ms) then the roster fetch 500s → console.warn,
        # zero DOM mutation. Give it time to settle so a (buggy) late mount would be caught.
        page.wait_for_timeout(2000)
        evidence = page.evaluate(EVIDENCE_JS)
        assert not evidence["champPresent"], evidence
        assert not evidence["movedPresent"], evidence
        assert evidence["panelPresent"], evidence
        for legacy in ("slf-team4-championship-layout", "slf-team4-championship-roster-side",
                       "team_general_content"):
            assert legacy in evidence["bodyClasses"], evidence
        assert "slf-team4-championship-overflow" in evidence["wrapperClasses"], evidence
        assert module_pageerrors(errors) == [], errors
        print(f"[team4-champ-table-swap] passed: failure-path(roster-500) viewport=1440 version={VERSION}")
    finally:
        ROSTER_STATUS["status"] = 200
        context.close()


def assert_gate_noop(browser: Browser, base_url: str):
    """Case 3: same legacy-conflict page, but gated out → module no-op.

    3a: ?action=present (isTeam4MainPage false). 3b: non-fm2026 design (isFm2026Design false).
    """
    ROSTER_STATUS["status"] = 200
    for label, query in (("action=present", "?action=present"), ("non-fm2026", "?case=nonfm")):
        context, page, errors = open_team(browser, base_url, query=query)
        try:
            inject(page)
            page.wait_for_timeout(2000)
            evidence = page.evaluate(EVIDENCE_JS)
            assert not evidence["champPresent"], (label, evidence)
            assert not evidence["movedPresent"], (label, evidence)
            assert evidence["panelPresent"], (label, evidence)
            for legacy in ("slf-team4-championship-layout", "slf-team4-championship-roster-side",
                           "team_general_content"):
                assert legacy in evidence["bodyClasses"], (label, evidence)
            assert "slf-team4-championship-overflow" in evidence["wrapperClasses"], (label, evidence)
            assert module_pageerrors(errors) == [], (label, errors)
        finally:
            context.close()
    print(f"[team4-champ-table-swap] passed: gate-noop(action+nonfm2026) viewport=1440 version={VERSION}")


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE_TEAM.is_file(), FIXTURE_TEAM
    # Run every case even when one fails, so a single invocation reports the full
    # pass/fail picture (e.g. RED: happy-path fails on the header probe while the
    # failure-path and gate-noop cases still pass). Exit non-zero if any case failed.
    failures = []
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for case in (assert_happy_path, assert_failure_path, assert_gate_noop):
                try:
                    case(browser, base_url)
                except AssertionError as error:
                    failures.append((case.__name__, str(error)))
        finally:
            browser.close()
    if failures:
        for name, message in failures:
            print(f"[team4-champ-table-swap] FAILED: {name}: {message}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
