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


def init_script(api_mode: str) -> str:
    malicious_json = json.dumps(MALICIOUS_TRANSFER_ROWS, ensure_ascii=False)
    return f"""
(() => {{
  'use strict';
  const apiMode = {json.dumps(api_mode)};
  const maliciousRows = {malicious_json};
  const store = new Map();
  window.__slfRequests = [];
  window.__slfUnhandled = [];
  window.__slfAlerts = [];
  window.__slfPwned = 0;
  window.unsafeWindow = window;
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


def assert_match(page: Page):
    page.wait_for_selector(".content-ui__wrapper > #slf-match-parser-panel")
    page.wait_for_selector("#slf-tactics-dropdown.slf-ui.slf-panel")
    page.wait_for_selector("#slf-manual-recommendation-btn")
    assert page.locator("#slf-match-parser-panel").get_attribute("data-slf-mount") == "fm2026-content"
    assert page.locator("#slf-tactics-dropdown").get_attribute("data-slf-mount") == "fm2026-tactic-root"
    assert_inside_content(page, ["#slf-match-parser-panel", "#slf-tactics-dropdown"])
    style = page.locator("#slf-match-parser-panel").evaluate("el => ({font:getComputedStyle(el).fontFamily,radius:getComputedStyle(el).borderRadius})")
    assert "Roboto" in style["font"] and float(style["radius"].replace("px", "")) >= 10, style
    page.locator("#slf-manual-recommendation-btn").click()
    page.wait_for_function("() => document.getElementById('slf-parser-status')?.textContent.includes('Подсказка обновлена вручную')")
    page.wait_for_function("() => window.__slfRequests.some(row => row.url.includes('/api/match_snapshots_v2?mode=append'))")


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
    page.wait_for_selector(".content-ui__wrapper .slf-team4-leadership-upgrade-badge.slf-ui")


def assert_team_main(page: Page):
    wait_team_core(page)
    page.wait_for_selector(".content-ui__wrapper #slf-team4-championship-table.slf-ui.slf-panel")
    assert page.locator(".slf-team4-leadership-upgrade-badge").count() == 2
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


def wait_training(page: Page):
    page.wait_for_selector(".content-ui__wrapper #slf-training-guide-layout.slf-ui")
    page.wait_for_selector("#slf-training-guide-panel.slf-ui.slf-panel")
    page.wait_for_function("() => document.querySelector('#slf-training-guide-panel #slf-status')?.textContent.includes('VPS-кеш')")


def assert_training(page: Page):
    wait_training(page)
    assert_inside_content(page, ["#slf-training-guide-layout", "#slf-training-guide-panel"])
    assert page.locator("#slf-training-guide-layout").get_attribute("data-slf-mount") == "fm2026-training-content"
    assert page.locator("#slf-training-guide-panel").get_attribute("data-slf-mount-violation") is None
    layout = page.locator("#slf-training-guide-layout").evaluate("el => ({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns})")
    assert layout["display"] == "grid" and layout["columns"] != "none", layout
    mutate_content(page, "training")
    assert page.locator("#slf-training-guide-layout").count() == 1
    assert page.locator("#slf-training-guide-panel").count() == 1


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
    selectors = ["#slf-team4-form-saved-choice-notice", "#slf-loan-limit-inline"]
    assert_top_level_containment(page, selectors)
    assert contrast_ratio(page, "#slf-loan-limit-inline") >= 4.5


def assert_training_responsive(page: Page):
    wait_training(page)
    selectors = ["#slf-training-guide-layout", "#slf-training-guide-panel"]
    assert_top_level_containment(page, selectors)
    columns = page.locator("#slf-training-guide-layout").evaluate("el => getComputedStyle(el).gridTemplateColumns")
    assert len(columns.split()) == 1, columns
    assert contrast_ratio(page, "#slf-training-guide-panel") >= 4.5


def run_case(browser: Browser, base_url: str, name: str, path: str, assertions, viewport, reduced_motion="no-preference", api_mode="normal"):
    context = browser.new_context(locale="ru-RU", viewport=viewport, reduced_motion=reduced_motion)
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(init_script(api_mode))
    try:
        page.goto(base_url + path, wait_until="domcontentloaded")
        inject(page)
        assertions(page)
        assert_clean(page, page_errors)
        print(f"[fm2026-design-e2e] passed: {name} viewport={viewport['width']}x{viewport['height']} version={VERSION}")
    finally:
        context.close()


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
        finally:
            browser.close()


if __name__ == "__main__":
    main()
