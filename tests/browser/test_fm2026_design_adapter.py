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
FIXTURES = ROOT / "tests" / "browser" / "fixtures"
AUDIT_MANIFEST = ROOT / "data" / "quality" / "fm2026-ui-migration-v1.json"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]

ROUTES = {
    "match": FIXTURES / "fm2026-owned-live-match.html",
    "transfer": FIXTURES / "fm2026-transfer-market.html",
    "history": FIXTURES / "fm2026-transfer-history.html",
    "team": FIXTURES / "fm2026-team-main.html",
    "training": FIXTURES / "fm2026-training.html",
}

FORM_HTML = """<!doctype html><html><body>
<div id="player_form"><div id="coach_set"><div class="coach_expire"><span data-expire>Форма действует до 15.08.2026</span></div><input class="coachd" type="checkbox" checked></div></div>
</body></html>"""
CHAMP_HTML = """<!doctype html><html><body><div>Сезон 2026/27</div>
<table class="tourney_table"><tr><th>№</th><th>Команда</th><th>И</th><th>Очки</th></tr>
<tr><td>1</td><td><a href="/roster.php?id=23698">Луч</a></td><td>4</td><td>12</td></tr>
<tr><td>2</td><td><a href="/roster.php?id=99999">&lt;img src=x onerror=window.__slfPwned=3&gt;</a></td><td>4</td><td>9</td></tr></table>
</body></html>"""
PLAYER_HTML = """<!doctype html><html><body><table>
<tr><td>Лидерство</td><td><a href="/player.php?action=view&id=1&up14=ok" title="Можно поднять до 15">Поднять до 15</a></td></tr>
</table></body></html>"""
MALICIOUS_TRANSFER_ROWS = [
    {
        "recordType": "completed_transfer",
        "eventType": "completed_transfer",
        "transfer": {"price": 120000000, "dateText": "05.08.2026"},
        "player": {
            "playerId": "9001",
            "name": "</a><img src=x onerror=window.__slfPwned=1>",
            "playerUrl": "javascript:window.__slfPwned=2",
            "age": 22,
            "talent": 5,
            "primaryPosition": "ST",
            "positions": ["ST"],
            "finalSkill": 151,
        },
        "clubs": {"fromName": "<svg onload=window.__slfPwned=4>", "toName": "Клуб"},
    }
]
TRAINING_ROLES = ["GK", "CD", "LD / RD", "DM", "LM / RM", "CM", "AM", "ST"]
TRAINING_GK_SKILLS = ["ПС", "СВ", "ТВ", "СК", "РЕ", "ИВ", "ВП", "РМ", "ПИ", "ВВ"]
TRAINING_FIELD_SKILLS = ["ПС", "СУ", "ТУ", "СК", "УС", "ОТ", "ВП", "ТХ", "БВ", "КР"]
TRAINING_CACHE = {
    "schema": "slf_training_league_benchmarks_v1",
    "championshipIds": [55742, 55683, 55664, 55690, 55705],
    "sources": [
        {"championshipId": league_id, "name": name, "status": "ok", "error": ""}
        for name, league_id in zip(
            ["Италия", "Англия", "Германия", "Испания", "Франция"],
            [55742, 55683, 55664, 55690, 55705],
        )
    ],
    "profiles": [
        {
            "role": role,
            "skills": {
                skill: {"value": 10 + role_index + skill_index, "sample": 5, "values": []}
                for skill_index, skill in enumerate(TRAINING_GK_SKILLS if role == "GK" else TRAINING_FIELD_SKILLS)
            },
        }
        for role_index, role in enumerate(TRAINING_ROLES)
    ],
    "calculatedAt": "2026-08-02T10:00:28.000Z",
}

BULK_TARGETS = [51 + index for index in range(10)]


def training_cache_with_targets(start: int = 51) -> dict:
    return {
        "schema": "slf_training_league_benchmarks_v1",
        "championshipIds": list(TRAINING_CACHE["championshipIds"]),
        "sources": [dict(source) for source in TRAINING_CACHE["sources"]],
        "profiles": [
            {
                "role": role,
                "skills": {
                    skill: {"value": start + skill_index, "sample": 5, "values": []}
                    for skill_index, skill in enumerate(TRAINING_GK_SKILLS if role == "GK" else TRAINING_FIELD_SKILLS)
                },
            }
            for role in TRAINING_ROLES
        ],
        "calculatedAt": TRAINING_CACHE["calculatedAt"],
    }


def training_cache_missing_skill(role: str, skill: str) -> dict:
    cache = training_cache_with_targets()
    for profile in cache["profiles"]:
        if profile["role"] == role:
            profile["skills"].pop(skill, None)
    return cache


class Handler(BaseHTTPRequestHandler):
    def send_html(self, text: str):
        payload = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def send_fixture(self, fixture: Path):
        self.send_html(fixture.read_text(encoding="utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/game.php":
            self.send_fixture(ROUTES["match"])
        elif parsed.path == "/transfers.php" and query.get("action", [""])[0] == "history":
            self.send_fixture(ROUTES["history"])
        elif parsed.path == "/transfers.php":
            self.send_fixture(ROUTES["transfer"])
        elif parsed.path == "/team4.php" and query.get("action", [""])[0] == "form" and query.get("date", [""])[0] == "1":
            self.send_html(FORM_HTML)
        elif parsed.path == "/team4.php":
            self.send_fixture(ROUTES["team"])
        elif parsed.path == "/train.php":
            self.send_fixture(ROUTES["training"])
        elif parsed.path == "/champ.php":
            self.send_html(CHAMP_HTML)
        elif parsed.path in {"/player.php", "/alter.php"}:
            self.send_html(PLAYER_HTML)
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


def init_script(api_mode: str, training_cache=None) -> str:
    malicious_json = json.dumps(MALICIOUS_TRANSFER_ROWS, ensure_ascii=False)
    training_cache_json = json.dumps(training_cache or TRAINING_CACHE, ensure_ascii=False)
    return f"""
(() => {{
  'use strict';
  const apiMode = {json.dumps(api_mode)};
  const maliciousRows = {malicious_json};
  const trainingCache = {training_cache_json};
  const store = new Map();
  window.__slfRequests = [];
  window.__slfNativeFetches = [];
  window.__slfUnhandled = [];
  window.__slfAlerts = [];
  window.__slfPwned = 0;
  window.unsafeWindow = window;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {{
    window.__slfNativeFetches.push(String(input?.url || input || ''));
    return nativeFetch(input, init);
  }};
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${{event.message || 'unknown'}}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${{String(event.reason?.message || event.reason || 'unknown')}}`));
  window.GM_getValue = (key, fallback = '') => key === 'slf_api_token' ? 'fm2026-e2e-token' : (store.has(key) ? store.get(key) : fallback);
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {{
    const row = {{ method: String(request.method || 'GET').toUpperCase(), url: String(request.url || ''), data: request.data == null ? null : String(request.data) }};
    window.__slfRequests.push(row);
    setTimeout(() => {{
      let responseText = row.method === 'GET' && !row.url.includes('/api/tactics') ? '[]' : '{{}}';
      if (row.method === 'GET' && row.url.includes('/api/training_league_benchmarks_v1')) {{
        responseText = JSON.stringify(trainingCache);
      }}
      if (apiMode === 'malicious' && row.method === 'GET' && row.url.includes('/api/transfer_history')) {{
        responseText = JSON.stringify(maliciousRows);
      }}
      request.onload?.({{ status: 200, statusText: 'OK', responseText, finalUrl: row.url }});
    }}, 0);
    return {{ abort() {{}} }};
  }};
  const jq = function() {{ return {{ on(){{return this;}},off(){{return this;}},find(){{return this;}},each(){{return this;}},first(){{return this;}},text(){{return '';}},val(){{return '';}},attr(){{return undefined;}},data(){{return undefined;}},append(){{return this;}},prepend(){{return this;}},remove(){{return this;}},length:0 }}; }};
  jq.ajax = () => Promise.resolve({{}});
  window.$ = window.jQuery = jq;
  window.alert = message => window.__slfAlerts.push(String(message));
  window.confirm = () => true;
  window.prompt = () => null;
}})();
"""


def inject(page: Page):
    page.add_script_tag(path=str(ARTIFACT))
    page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
    assert page.evaluate("document.documentElement.dataset.slfDesign") == "fm2026"


def assert_clean(page: Page, page_errors):
    page.wait_for_timeout(150)
    assert not page_errors, page_errors
    assert page.evaluate("window.__slfUnhandled.slice()") == []
    assert page.evaluate("window.__slfPwned") == 0


def assert_inside_content(page: Page, selectors):
    violations = page.evaluate(
        """selectors => {
          const root = document.querySelector('.content-ui__wrapper');
          return selectors.flatMap(selector => [...document.querySelectorAll(selector)]
            .filter(node => !root || !root.contains(node))
            .map(node => `${selector}:${node.id || node.className}`));
        }""",
        selectors,
    )
    assert violations == [], violations


def assert_top_level_containment(page: Page, selectors):
    violations = page.evaluate(
        """selectors => {
          const root = document.querySelector('.content-ui__wrapper');
          if (!root) return ['content-root-missing'];
          const rr = root.getBoundingClientRect();
          return selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(node => {
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = node.getBoundingClientRect();
            return rect.left < rr.left - 1 || rect.right > rr.right + 1 || rect.width > rr.width + 1;
          }).map(node => `${selector}:${node.id || node.className}`));
        }""",
        selectors,
    )
    assert violations == [], violations
    dimensions = page.evaluate("() => ({viewport:innerWidth,scroll:document.documentElement.scrollWidth})")
    assert dimensions["scroll"] <= dimensions["viewport"] + 1, dimensions


def contrast_ratio(page: Page, selector: str) -> float:
    return page.eval_on_selector(
        selector,
        """el => {
          const parse = value => (value.match(/[0-9.]+/g) || []).slice(0,3).map(Number);
          const luminance = rgb => {
            const values = rgb.map(value => {
              const channel = value / 255;
              return channel <= .03928 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
            });
            return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
          };
          const style = getComputedStyle(el);
          let node = el;
          let background = [0,0,0,0];
          while (node) {
            const parts = (getComputedStyle(node).backgroundColor.match(/[0-9.]+/g) || []).map(Number);
            if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0)) { background = parts; break; }
            node = node.parentElement;
          }
          const fg = parse(style.color), bg = background.slice(0,3);
          const l1 = luminance(fg), l2 = luminance(bg);
          return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
        }""",
    )


def mutate_content(page: Page, prefix: str, count: int = 30):
    page.evaluate(
        """args => {
          const root = document.querySelector('.content-ui__wrapper');
          for (let index = 0; index < args.count; index += 1) {
            const node = document.createElement('i');
            node.textContent = `${args.prefix}-${index}`;
            root.appendChild(node);
            node.remove();
          }
        }""",
        {"prefix": prefix, "count": count},
    )
    page.wait_for_timeout(350)


def prepare_training_champ_fixture(page: Page):
    page.evaluate(
        """() => {
          const pad = document.querySelector('.pad2');
          if (!pad || pad.querySelector('.train__champ')) return;
          const champ = document.createElement('section');
          champ.className = 'train__champ';
          champ.innerHTML = `
            <h2>Средние значения навыков ТОП игроков вашего чемпионата</h2>
            <button id="native-skill-calc" type="button">Рассчитать скилы</button>
            <output id="native-skill-result">не рассчитано</output>
          `;
          champ.querySelector('#native-skill-calc').addEventListener('click', () => {
            const output = champ.querySelector('#native-skill-result');
            output.textContent = `рассчитано:${Number(output.dataset.clicks || 0) + 1}`;
            output.dataset.clicks = String(Number(output.dataset.clicks || 0) + 1);
          });
          pad.appendChild(champ);
        }"""
    )


def assert_match(page: Page):
    page.wait_for_selector(".content-ui__wrapper > #slf-match-parser-panel")
    page.wait_for_selector("#slf-tactics-dropdown.slf-ui.slf-panel")
    # Ф2a (#441): the manual hint button is never rendered; the LLM button is
    # the single primary entry and mounts on its own.
    page.wait_for_selector("#slf-llm-second-opinion-btn")
    assert page.locator("#slf-manual-recommendation-btn").count() == 0
    assert page.locator("#slf-llm-second-opinion-btn").count() == 1
    assert page.locator("#slf-match-parser-panel").get_attribute("data-slf-mount") == "fm2026-content"
    assert page.locator("#slf-tactics-dropdown").get_attribute("data-slf-mount") == "fm2026-tactic-root"
    assert_inside_content(page, ["#slf-match-parser-panel", "#slf-tactics-dropdown"])
    style = page.locator("#slf-match-parser-panel").evaluate("el => ({font:getComputedStyle(el).fontFamily,radius:getComputedStyle(el).borderRadius})")
    assert "Roboto" in style["font"] and float(style["radius"].replace("px", "")) >= 10, style
    # Ф2a (#441): the manual hint button is gone. The LLM button is the primary
    # entry; clicking it runs the fresh pipeline and renders the answer
    # container. The "Подсказка обновлена вручную" status is unreachable now, so
    # assert the LLM flow's actual output: the answer container renders.
    page.locator("#slf-llm-second-opinion-btn").click()
    page.wait_for_function("() => !!document.getElementById('slf-llm-second-opinion-answer')")
    # Ф2a (#441): the snapshot telemetry is sent on bootstrap (not by a button
    # click). The owned match fixture fires exactly one match_snapshots_v2
    # append on bootstrap, so by the time this runs it is already present.
    # Verify it fired (not zero) — the LLM click adds no further append.
    page.wait_for_function("() => window.__slfRequests.some(row => row.url.includes('/api/match_snapshots_v2?mode=append'))")
    snapshot_rows = page.evaluate(
        "window.__slfRequests.filter(row => row.url.includes('/api/match_snapshots_v2?mode=append'))"
    )
    assert len(snapshot_rows) == 1, snapshot_rows


def wait_transfer_market(page: Page):
    page.wait_for_selector(".content-ui__wrapper #slf-transfer-analyzer-toolbar.slf-ui.slf-panel")
    page.wait_for_selector(".content-ui__wrapper #slf-transfer-candidate-panel.slf-ui.slf-panel")
    page.wait_for_selector(".content-ui__wrapper #slf-purchase-forecast-row")
    page.wait_for_selector("#slf-purchase-forecast-panel.slf-ui.slf-panel")


def assert_transfer_market(page: Page):
    wait_transfer_market(page)
    selectors = ["#slf-transfer-analyzer-toolbar", "#slf-transfer-candidate-panel", "#slf-purchase-forecast-row"]
    assert_inside_content(page, selectors)
    assert page.locator("#slf-transfer-analyzer-toolbar").get_attribute("data-slf-mount") == "fm2026-transfer-content"
    assert page.locator("#slf-transfer-candidate-panel").get_attribute("data-slf-mount") == "fm2026-transfer-content"
    assert page.locator("#slf-purchase-forecast-row").get_attribute("data-slf-mount") == "fm2026-transfer-content"
    row_style = page.locator("#slf-purchase-forecast-row").evaluate("el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns})")
    assert row_style["display"] == "grid" and row_style["columns"] != "none", row_style
    page.locator("#slf-purchase-forecast-calc").click()
    page.wait_for_function("() => document.getElementById('slf-purchase-forecast-note')?.textContent.includes('выборка 0')")
    mutate_content(page, "transfer")
    assert page.locator("#slf-transfer-analyzer-toolbar").count() == 1
    assert page.locator("#slf-transfer-candidate-panel").count() == 1
    assert page.locator("#slf-purchase-forecast-panel").count() == 1


def assert_transfer_hostile(page: Page):
    wait_transfer_market(page)
    page.locator("#slf-purchase-forecast-calc").click()
    page.wait_for_function("() => document.getElementById('slf-purchase-forecast-count')?.textContent === '1'")
    page.locator("#slf-purchase-forecast-count-card").click()
    page.wait_for_selector("#slf-purchase-forecast-list a")
    list_box = page.locator("#slf-purchase-forecast-list")
    assert list_box.locator("img,script,svg,iframe").count() == 0
    assert "<img src=x onerror=window.__slfPwned=1>" in list_box.inner_text()
    href = list_box.locator("a").first.get_attribute("href") or ""
    assert not href.lower().startswith("javascript:"), href
    assert "/player.php" in href and "id=9001" in href, href
    assert page.evaluate("window.__slfPwned") == 0


def assert_transfer_history(page: Page):
    page.wait_for_selector(".content-ui__wrapper #slf-transfer-analyzer-toolbar.slf-ui.slf-panel")
    page.wait_for_function("() => document.getElementById('slf-transfer-status')?.textContent.includes('История')")
    assert page.locator("#slf-transfer-candidate-panel").count() == 0
    assert page.locator("#slf-purchase-forecast-panel").count() == 0
    assert_inside_content(page, ["#slf-transfer-analyzer-toolbar"])


def wait_team_core(page: Page):
    page.wait_for_selector(".content-ui__wrapper #slf-team4-form-saved-choice-notice.slf-ui.slf-panel")
    page.wait_for_selector(".content-ui__wrapper #slf-loan-limit-inline.slf-ui.slf-panel")


def assert_team_main(page: Page):
    wait_team_core(page)
    page.wait_for_selector(".content-ui__wrapper #slf-team4-championship-table.slf-ui.slf-panel")
    page.wait_for_timeout(250)
    assert page.locator(".slf-team4-leadership-upgrade-badge").count() == 0
    assert page.evaluate("window.SLFTeam4LeadershipUpgradeIndicator === undefined")
    assert not any("/player.php" in url for url in page.evaluate("window.__slfNativeFetches.slice()"))
    assert "15.08.2026" in page.locator("#slf-team4-form-saved-choice-notice").inner_text()
    assert "2/10" in page.locator("#slf-loan-limit-inline").inner_text()
    assert page.locator("#slf-team4-championship-table tr.slf-active-team").count() == 1
    assert page.locator("#slf-team4-championship-table img, #slf-team4-championship-table script, #slf-team4-championship-table svg").count() == 0
    assert "<img src=x onerror=window.__slfPwned=3>" in page.locator("#slf-team4-championship-table").inner_text()
    selectors = ["#slf-team4-form-saved-choice-notice", "#slf-loan-limit-inline", "#slf-team4-championship-table"]
    assert_inside_content(page, selectors)
    for selector in selectors:
        assert page.locator(selector).get_attribute("data-slf-mount-violation") is None
    layout = page.locator(".team_general_content.slf-team4-championship-layout").evaluate("el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns})")
    assert layout["display"] == "grid" and layout["columns"] != "none", layout
    mutate_content(page, "team")
    assert page.locator("#slf-team4-form-saved-choice-notice").count() == 1
    assert page.locator("#slf-loan-limit-inline").count() == 1
    assert page.locator("#slf-team4-championship-table").count() == 1
    assert page.locator(".slf-team4-leadership-upgrade-badge").count() == 0


def wait_training(page: Page):
    page.wait_for_selector(".content-ui__wrapper #slf-training-guide-layout.slf-ui")
    page.wait_for_selector("#slf-training-benchmarks-card > #slf-training-guide-panel.slf-ui.slf-panel")
    page.wait_for_selector("#slf-training-workspace > #slf-training-controls")
    page.wait_for_selector("#slf-training-workspace > #slf-training-results-pane")
    page.wait_for_selector("#slf-training-results-pane .slf-table tbody tr")
    page.wait_for_function("() => document.querySelector('#slf-training-guide-panel #slf-status')?.textContent.includes('VPS-кеш')")


def assert_training(page: Page):
    wait_training(page)
    selectors = [
        "#slf-training-guide-layout",
        "#slf-training-benchmarks-card",
        "#slf-training-guide-panel",
        "#slf-training-workspace",
        "#slf-training-controls",
        "#slf-training-results-pane",
        ".train__champ",
    ]
    assert_inside_content(page, selectors)
    assert page.locator("#slf-training-guide-layout").get_attribute("data-slf-mount") == "fm2026-training-content"
    assert page.locator("#slf-training-guide-panel").get_attribute("data-slf-mount-violation") is None
    assert page.locator("#slf-training-controls .slf-source").count() == 5
    assert page.locator("#slf-training-results-pane .slf-table tbody tr").count() == 8
    assert page.locator("#slf-training-controls #slf-status").count() == 1
    assert page.locator("#slf-training-results-pane #slf-result").count() == 1
    workspace = page.locator("#slf-training-workspace").evaluate(
        "el => ({children:[...el.children].map(node => node.id),display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns})"
    )
    assert workspace["children"] == ["slf-training-controls", "slf-training-results-pane"], workspace
    assert workspace["display"] == "grid" and len(workspace["columns"].split()) == 2, workspace
    geometry = page.evaluate(
        """() => {
          const controls = document.getElementById('slf-training-controls').getBoundingClientRect();
          const results = document.getElementById('slf-training-results-pane').getBoundingClientRect();
          return {controlsRight:controls.right,resultsLeft:results.left,controlsTop:controls.top,resultsTop:results.top};
        }"""
    )
    assert geometry["resultsLeft"] >= geometry["controlsRight"] - 1, geometry
    assert abs(geometry["controlsTop"] - geometry["resultsTop"]) <= 1, geometry
    native = page.locator(".train__champ")
    assert native.count() == 1
    assert native.get_attribute("data-slf-suppressed") == "top-player-skill-averages"
    assert native.get_attribute("aria-hidden") == "true"
    assert not native.is_visible()
    native_title = page.get_by_text("Средние значения навыков ТОП игроков вашего чемпионата", exact=True)
    assert native_title.count() == 1
    assert native_title.is_hidden()
    card_style = page.locator("#slf-training-benchmarks-card").evaluate(
        "el => ({display:getComputedStyle(el).display,border:getComputedStyle(el).borderTopWidth,radius:getComputedStyle(el).borderRadius,overflow:getComputedStyle(el).overflow})"
    )
    assert card_style["display"] == "block" and float(card_style["border"].replace("px", "")) >= 1, card_style
    assert float(card_style["radius"].replace("px", "")) >= 10 and card_style["overflow"] == "hidden", card_style
    layout = page.locator("#slf-training-guide-layout").evaluate("el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns})")
    assert layout["display"] == "grid" and layout["columns"] != "none", layout
    mutate_content(page, "training")
    assert page.locator("#slf-training-guide-layout").count() == 1
    assert page.locator("#slf-training-benchmarks-card").count() == 1
    assert page.locator("#slf-training-guide-panel").count() == 1
    assert page.locator("#slf-training-workspace").count() == 1
    assert page.locator("#slf-training-controls").count() == 1
    assert page.locator("#slf-training-results-pane").count() == 1
    assert page.locator(".train__champ").count() == 1
    assert not page.locator(".train__champ").is_visible()


def assert_transfer_responsive_accessibility(page: Page):
    wait_transfer_market(page)
    selectors = ["#slf-transfer-analyzer-toolbar", "#slf-transfer-candidate-panel", "#slf-purchase-forecast-row", "#slf-purchase-forecast-panel"]
    assert_top_level_containment(page, selectors)
    columns = page.locator("#slf-purchase-forecast-row").evaluate("el => getComputedStyle(el).gridTemplateColumns")
    assert len(columns.split()) == 1, columns
    page.locator("body").click(position={"x": 4, "y": 4})
    focused = ""
    for _ in range(40):
        page.keyboard.press("Tab")
        focused = page.evaluate("document.activeElement?.id || ''")
        if focused == "slf-purchase-forecast-calc":
            break
    assert focused == "slf-purchase-forecast-calc", focused
    focus_style = page.locator("#slf-purchase-forecast-calc").evaluate("el => ({style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth})")
    assert focus_style["style"] != "none" and float(focus_style["width"].replace("px", "")) > 0, focus_style
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.getElementById('slf-purchase-forecast-note')?.textContent.includes('выборка 0')")
    assert contrast_ratio(page, "#slf-transfer-analyzer-toolbar") >= 4.5
    motion = page.locator("#slf-transfer-analyzer-toolbar").evaluate("el => ({animation:getComputedStyle(el).animationDuration,transition:getComputedStyle(el).transitionDuration})")
    assert motion["animation"] in {"0s", "0ms"} and motion["transition"] in {"0s", "0ms"}, motion


def assert_team_responsive(page: Page):
    wait_team_core(page)
    assert page.locator("#slf-team4-championship-table").count() == 0
    assert page.locator(".slf-team4-leadership-upgrade-badge").count() == 0
    assert page.evaluate("window.SLFTeam4LeadershipUpgradeIndicator === undefined")
    selectors = ["#slf-team4-form-saved-choice-notice", "#slf-loan-limit-inline"]
    assert_top_level_containment(page, selectors)
    assert contrast_ratio(page, "#slf-loan-limit-inline") >= 4.5


def assert_training_responsive(page: Page):
    wait_training(page)
    selectors = [
        "#slf-training-guide-layout",
        "#slf-training-benchmarks-card",
        "#slf-training-guide-panel",
        "#slf-training-workspace",
        "#slf-training-controls",
        "#slf-training-results-pane",
        ".train__champ",
    ]
    assert_top_level_containment(page, selectors)
    columns = page.locator("#slf-training-guide-layout").evaluate("el => getComputedStyle(el).gridTemplateColumns")
    assert len(columns.split()) == 1, columns
    workspace_columns = page.locator("#slf-training-workspace").evaluate("el => getComputedStyle(el).gridTemplateColumns")
    assert len(workspace_columns.split()) == 1, workspace_columns
    geometry = page.evaluate(
        """() => {
          const controls = document.getElementById('slf-training-controls').getBoundingClientRect();
          const results = document.getElementById('slf-training-results-pane').getBoundingClientRect();
          return {controlsBottom:controls.bottom,resultsTop:results.top};
        }"""
    )
    assert geometry["resultsTop"] >= geometry["controlsBottom"] - 1, geometry
    assert not page.locator(".train__champ").is_visible()
    assert contrast_ratio(page, "#slf-training-benchmarks-card") >= 4.5


def run_case(browser: Browser, base_url: str, name: str, path: str, assertions, viewport, reduced_motion="no-preference", api_mode="normal"):
    context = browser.new_context(locale="ru-RU", viewport=viewport, reduced_motion=reduced_motion)
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(init_script(api_mode))
    try:
        page.goto(base_url + path, wait_until="domcontentloaded")
        if urlparse(path).path == "/train.php":
            prepare_training_champ_fixture(page)
        inject(page)
        assertions(page)
        assert_clean(page, page_errors)
        print(f"[fm2026-design-e2e] passed: {name} viewport={viewport['width']}x{viewport['height']} version={VERSION}")
    finally:
        context.close()


def run_apply_scenario(browser: Browser, base_url: str, name: str, setup, assertions, training_cache=None):
    context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 1000}, reduced_motion="no-preference")
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(init_script("normal", training_cache))
    try:
        page.goto(base_url + "/train.php", wait_until="domcontentloaded")
        prepare_training_champ_fixture(page)
        inject(page)
        wait_training(page)
        setup(page)
        assertions(page)
        assert_clean(page, page_errors)
        print(f"[fm2026-design-e2e] passed: {name} viewport=1440x1000 version={VERSION}")
    finally:
        context.close()


def bulk_state(page: Page) -> dict:
    return page.evaluate(
        """() => {
          const panel = document.querySelector('.train-bulk');
          return {
            chips: panel ? [...panel.querySelectorAll('.train-bulk__sk')].map(chip => {
              const input = chip.querySelector('.train-bulk__up');
              return {
                i: chip.dataset.i,
                order: chip.dataset.order,
                on: chip.classList.contains('is-on'),
                disabled: input ? input.disabled : null,
                value: input ? input.value : null,
                field: chip.querySelector('.train-bulk__name')?.dataset.f || '',
                gk: chip.querySelector('.train-bulk__name')?.dataset.gk || ''
              };
            }) : null,
            checked: [...document.querySelectorAll('#train input[name="pl_arr[]"]:checked')].map(box => box.value),
            status: document.getElementById('slf-status')?.textContent || '',
            events: (window.__trainBulkEvents || []).slice(),
            saveClicks: window.__trainSaveClicks || 0,
            submits: window.__trainSubmits || 0,
            nativeFetches: (window.__slfNativeFetches || []).slice(),
            requests: (window.__slfRequests || []).slice()
          };
        }"""
    )


def assert_no_native_save(state: dict):
    assert state["saveClicks"] == 0, state
    assert state["submits"] == 0, state
    assert not [url for url in state["nativeFetches"] if "/ajax/team3.9.php" in url], state
    assert not [row for row in state["requests"] if "team3.9.php" in row.get("url", "")], state


def assert_bulk_targets(state: dict, targets, expected_checked):
    chips = sorted(state["chips"] or [], key=lambda chip: int(chip["i"]))
    assert len(chips) == 11, state
    for index, target in enumerate(targets, start=1):
        chip = chips[index - 1]
        assert chip["i"] == str(index), state
        assert chip["on"] is True, (index, chip, state["status"])
        assert chip["order"] == str(index), (index, chip)
        assert chip["disabled"] is False, (index, chip)
        assert chip["value"] == str(target), (index, chip)
    endurance = chips[10]
    assert endurance["on"] is False, endurance
    assert endurance["order"] == "0", endurance
    assert endurance["disabled"] is True, endurance
    assert endurance["value"] == "", endurance
    assert state["checked"] == expected_checked, state
    assert "Сохранить" in state["status"], state["status"]
    assert_no_native_save(state)


def assert_bulk_events(state: dict, targets):
    for index, target in enumerate(targets, start=1):
        inputs = [event for event in state["events"] if event["type"] == "input" and event["i"] == str(index)]
        changes = [event for event in state["events"] if event["type"] == "change" and event["i"] == str(index)]
        assert inputs and inputs[-1]["value"] == str(target), (index, inputs)
        assert changes and changes[-1]["value"] == str(target), (index, changes)


def assert_draft_unchanged(before: dict, after: dict):
    assert before["chips"] == after["chips"], (before["chips"], after["chips"])
    assert before["checked"] == after["checked"], (before["checked"], after["checked"])
    assert_no_native_save(after)


def setup_field_selection(page: Page):
    page.check('#train input[name="pl_arr[]"][value="4001"]')
    page.check('#train input[name="pl_arr[]"][value="4002"]')


def assert_training_bulk_field(page: Page):
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    state = bulk_state(page)
    assert_bulk_targets(state, BULK_TARGETS, ["4001", "4002"])
    assert_bulk_events(state, BULK_TARGETS)


def setup_gk_selection(page: Page):
    page.check('#train input[name="pl_arr[]"][value="3001"]')


def assert_training_bulk_gk(page: Page):
    page.locator('#slf-result .slf-apply-profile[data-role="GK"]').click()
    state = bulk_state(page)
    assert_bulk_targets(state, BULK_TARGETS, ["3001"])
    assert_bulk_events(state, BULK_TARGETS)
    chips = sorted(state["chips"], key=lambda chip: int(chip["i"]))
    assert chips[1]["gk"] == "СВ" and chips[4]["gk"] == "РЕ", chips


def setup_dirty_draft(page: Page):
    setup_field_selection(page)
    page.evaluate(
        """() => {
          const chips = [...document.querySelectorAll('.train-bulk .train-bulk__sk')];
          const set = (index, order, value) => {
            const chip = chips.find(node => node.dataset.i === String(index));
            const input = chip.querySelector('.train-bulk__up');
            chip.classList.add('is-on');
            chip.dataset.order = String(order);
            input.disabled = false;
            input.value = String(value);
          };
          set(11, 1, 9);
          set(1, 2, 3);
          set(4, 3, 7);
        }"""
    )


def assert_training_bulk_repeat(page: Page):
    button = page.locator('#slf-result .slf-apply-profile[data-role="CM"]')
    button.click()
    first = bulk_state(page)
    assert_bulk_targets(first, BULK_TARGETS, ["4001", "4002"])
    button.click()
    second = bulk_state(page)
    assert_bulk_targets(second, BULK_TARGETS, ["4001", "4002"])
    assert first["chips"] == second["chips"], (first["chips"], second["chips"])


def setup_no_selection(page: Page):
    pass


def assert_reject_no_selection(page: Page):
    before = bulk_state(page)
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    after = bulk_state(page)
    assert "Сначала отметьте" in after["status"], after["status"]
    assert_draft_unchanged(before, after)


def setup_mixed_selection(page: Page):
    page.check('#train input[name="pl_arr[]"][value="4001"]')
    page.check('#train input[name="pl_arr[]"][value="3001"]')


def assert_reject_mixed_selection(page: Page):
    before = bulk_state(page)
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    after = bulk_state(page)
    assert "одновременно" in after["status"], after["status"]
    assert_draft_unchanged(before, after)


def setup_gk_only_for_field(page: Page):
    page.check('#train input[name="pl_arr[]"][value="3001"]')


def assert_reject_gk_only_for_field(page: Page):
    before = bulk_state(page)
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    after = bulk_state(page)
    assert "Полевой профиль нельзя применить" in after["status"], after["status"]
    assert_draft_unchanged(before, after)


def assert_reject_missing_target(page: Page):
    before = bulk_state(page)
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    after = bulk_state(page)
    assert "неполный набор навыков" in after["status"], after["status"]
    assert_draft_unchanged(before, after)


def setup_malformed_panel(page: Page):
    setup_field_selection(page)
    page.evaluate(
        """() => {
          document.querySelector('.train-bulk .train-bulk__sk[data-i="5"] .train-bulk__up')?.remove();
        }"""
    )


def assert_reject_malformed_panel(page: Page):
    before = bulk_state(page)
    page.locator('#slf-result .slf-apply-profile[data-role="CM"]').click()
    after = bulk_state(page)
    assert "не применён" in after["status"] and "панель" in after["status"], after["status"]
    assert_draft_unchanged(before, after)


def validate_audit_manifest():
    audit = json.loads(AUDIT_MANIFEST.read_text(encoding="utf-8"))
    assert audit["schema"] == "slf_fm2026_ui_migration_v1"
    assert audit["status"] == "staged_not_released"
    assert audit["designContract"]["contentRoot"] == ".content-ui__wrapper"
    selectors = audit["retainedClassicSelectors"]
    assert len(selectors) >= 6
    assert all(row.get("selector") and row.get("owner") and row.get("removalCondition") for row in selectors)
    assert audit["rolloutBoundary"] == {
        "merged": False,
        "releasePublished": False,
        "productionDeployed": False,
        "classicFallbackRemovalApproved": False,
    }


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert AUDIT_MANIFEST.is_file(), AUDIT_MANIFEST
    validate_audit_manifest()
    for fixture in ROUTES.values():
        assert fixture.is_file(), fixture

    desktop = {"width": 1440, "height": 1000}
    medium = {"width": 1024, "height": 900}
    narrow = {"width": 820, "height": 900}
    cases = [
        ("match", "/game.php?id=e2e-fm2026", assert_match, desktop, "no-preference", "normal"),
        ("transfer-market", "/transfers.php", assert_transfer_market, desktop, "no-preference", "normal"),
        ("transfer-hostile", "/transfers.php#hostile", assert_transfer_hostile, desktop, "no-preference", "malicious"),
        ("transfer-history", "/transfers.php?action=history", assert_transfer_history, desktop, "no-preference", "normal"),
        ("team-main", "/team4.php", assert_team_main, desktop, "no-preference", "normal"),
        ("training", "/train.php", assert_training, desktop, "no-preference", "normal"),
        ("transfer-responsive", "/transfers.php", assert_transfer_responsive_accessibility, medium, "reduce", "normal"),
        ("transfer-narrow", "/transfers.php", assert_transfer_responsive_accessibility, narrow, "reduce", "normal"),
        ("team-responsive", "/team4.php", assert_team_responsive, medium, "reduce", "normal"),
        ("training-responsive", "/train.php", assert_training_responsive, medium, "reduce", "normal"),
    ]

    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for name, path, assertions, viewport, reduced_motion, api_mode in cases:
                run_case(browser, base_url, name, path, assertions, viewport, reduced_motion, api_mode)
            apply_cases = [
                ("training-apply-field", setup_field_selection, assert_training_bulk_field, training_cache_with_targets()),
                ("training-apply-gk", setup_gk_selection, assert_training_bulk_gk, training_cache_with_targets()),
                ("training-apply-repeat", setup_dirty_draft, assert_training_bulk_repeat, training_cache_with_targets()),
                ("training-apply-reject-no-selection", setup_no_selection, assert_reject_no_selection, training_cache_with_targets()),
                ("training-apply-reject-mixed", setup_mixed_selection, assert_reject_mixed_selection, training_cache_with_targets()),
                ("training-apply-reject-gk-for-field", setup_gk_only_for_field, assert_reject_gk_only_for_field, training_cache_with_targets()),
                ("training-apply-reject-missing-target", setup_field_selection, assert_reject_missing_target, training_cache_missing_skill("CM", "КР")),
                ("training-apply-reject-malformed-panel", setup_malformed_panel, assert_reject_malformed_panel, training_cache_with_targets()),
            ]
            for name, setup, assertions, cache in apply_cases:
                run_apply_scenario(browser, base_url, name, setup, assertions, cache)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
