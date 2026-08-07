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
VERSION_MANIFEST = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))
EXPECTED_VERSION = VERSION_MANIFEST["scriptVersion"]
FIXTURES = ROOT / "tests" / "browser" / "fixtures"
ARTIFACTS = ROOT / "tests" / "browser" / "artifacts"

ROUTES = {
    "owned": FIXTURES / "owned-live-match.html",
    "foreign": FIXTURES / "foreign-live-match.html",
    "finished": FIXTURES / "finished-match.html",
    "incomplete": FIXTURES / "incomplete-match.html",
    "tactic": FIXTURES / "team-tactic.html",
    "transfer": FIXTURES / "transfer-page.html",
}


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/game.php":
            fixture_name = query.get("fixture", ["owned"])[0]
        elif parsed.path == "/team4.php":
            fixture_name = "tactic"
        elif parsed.path == "/transfers.php":
            fixture_name = "transfer"
        else:
            self.send_error(404)
            return

        fixture_path = ROUTES.get(fixture_name)
        if not fixture_path or not fixture_path.is_file():
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


def browser_init_script(api_mode: str) -> str:
    return f"""
(() => {{
  'use strict';
  const apiMode = {json.dumps(api_mode)};
  const gmStore = new Map();
  const jqDataStore = new WeakMap();

  window.__slfRequests = [];
  window.__slfMenuCommands = [];
  window.__slfAlerts = [];
  window.__slfUnhandled = [];
  window.unsafeWindow = window;

  window.localStorage.setItem('slf_custom_presets', JSON.stringify({{
    DeZerbi_BaitPress_bal3: {{ style: '3' }},
    DeZerbi_Release_att4: {{ style: '4' }},
    Henta_LeftTrap_att3: {{ style: '4' }},
    Klopp_WideTrap_att4: {{ style: '4' }},
    Mourinho_WeakSide_def3: {{ style: '2' }},
    Pep_StandardControl_bal3: {{ style: '3' }},
    Xabi_BoxMidfield_bal3: {{ style: '3' }},
    'Henta abuse': {{ style: '3', def_line: '1', press_line: '2' }}
  }}));

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
      if (apiMode === 'offline') {{
        if (typeof request.onerror === 'function') {{
          request.onerror({{ status: 0, statusText: 'offline', responseText: '', finalUrl: entry.url }});
        }}
        return;
      }}

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


def request_rows(page: Page):
    return page.evaluate("window.__slfRequests.map(item => ({...item}))")


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


def inject_exact_artifact(page: Page):
    assert ARTIFACT.is_file(), ARTIFACT
    page.add_script_tag(path=str(ARTIFACT))
    assert_runtime_version(page)


def run_case(browser: Browser, base_url: str, name: str, path: str, api_mode: str, assertions):
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(locale="ru-RU")
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.add_init_script(browser_init_script(api_mode))

    try:
        page.goto(base_url + path, wait_until="domcontentloaded")
        inject_exact_artifact(page)
        assertions(page)
        assert_clean_runtime(page, page_errors)
        context.tracing.stop()
        print(f"[browser-e2e] passed: {name}")
    except Exception:
        page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True)
        context.tracing.stop(path=str(ARTIFACTS / f"{name}.zip"))
        raise
    finally:
        context.close()


def assert_owned_live(page: Page):
    page.wait_for_selector("#slf-match-parser-panel")
    page.wait_for_selector("#slf-manual-recommendation-btn")
    page.wait_for_selector("#slf-tactics-dropdown")
    page.wait_for_selector("#slf-live-lineup-preset-panel")
    page.wait_for_selector("#slf-live-lineup-preset-select")

    assert page.locator("#slf-match-parser-panel").count() == 1
    assert page.locator("#slf-manual-recommendation-btn").count() == 1
    assert page.locator("#slf-tactics-dropdown").count() == 1
    assert page.locator("#slf-live-lineup-preset-panel").count() == 1
    assert page.locator("#slf-live-lineup-preset-select option").count() == 11

    expected_dropdown_ids = [
        "Bielsa_ChaosPress_att5",
        "Pep_TwoThreeFive_att3",
        "Klopp_Gegenpress_att4",
        "standard",
        "Conte_WingbackWidth_bal4",
        "Pep_ControlledPush_att3",
        "Arteta_Control433_bal3",
        "Pep_BoxControl_bal2",
        "Compact_Counter_def3",
        "Henta abuse",
        "Pep_PressCooldown_bal2",
        "Simeone_Compact442_def4",
        "Simeone_LowBlock_def5",
    ]
    dropdown_ids = page.eval_on_selector_all(
        "#slf-tactics-dropdown select option",
        "options => options.map(option => option.dataset.presetId || option.value)",
    )
    assert dropdown_ids == expected_dropdown_ids, dropdown_ids
    assert page.locator("#slf-tactics-dropdown select optgroup").count() == 5
    assert page.eval_on_selector_all(
        "#slf-tactics-dropdown select optgroup",
        "groups => groups.map(group => group.dataset.style)",
    ) == ["5", "4", "3", "2", "1"]

    retired_ids = {
        "DeZerbi_BaitPress_bal3",
        "DeZerbi_Release_att4",
        "Henta_LeftTrap_att3",
        "Klopp_WideTrap_att4",
        "Mourinho_WeakSide_def3",
        "Pep_StandardControl_bal3",
        "Xabi_BoxMidfield_bal3",
    }
    assert retired_ids.isdisjoint(dropdown_ids), dropdown_ids
    stored_custom_keys = page.evaluate(
        "Object.keys(JSON.parse(localStorage.getItem('slf_custom_presets') || '{}')).sort()"
    )
    assert stored_custom_keys == ["Henta abuse"], stored_custom_keys

    dropdown_values = page.eval_on_selector_all(
        "#slf-tactics-dropdown select option",
        "options => options.map(option => option.value)",
    )
    assert dropdown_values == sorted(dropdown_values), dropdown_values
    assert all(value.startswith("slf-") for value in dropdown_values), dropdown_values

    page.evaluate("""
      const select = document.querySelector('#slf-tactics-dropdown select');
      const options = Array.from(select.querySelectorAll('option'))
        .sort((a, b) => String(a.value).localeCompare(String(b.value), 'en'));
      select.replaceChildren(...options);
    """)
    host_sorted_ids = page.eval_on_selector_all(
        "#slf-tactics-dropdown select option",
        "options => options.map(option => option.dataset.presetId || option.value)",
    )
    assert host_sorted_ids == expected_dropdown_ids, host_sorted_ids

    page.locator("#slf-manual-recommendation-btn").click()
    page.wait_for_function(
        "() => document.getElementById('slf-parser-status')?.textContent.includes('Подсказка обновлена вручную')"
    )
    page.wait_for_function(
        "() => window.__slfRequests.some(item => item.url.includes('/api/match_snapshots_v2?mode=append'))"
    )

    snapshot_requests = [
        row for row in request_rows(page)
        if "/api/match_snapshots_v2?mode=append" in row["url"]
    ]
    assert len(snapshot_requests) == 1, snapshot_requests
    payload = json.loads(snapshot_requests[0]["data"])
    records = payload if isinstance(payload, list) else [payload]
    assert len(records) == 1
    record = records[0]
    assert record["recordType"] == "match_snapshot"
    assert record["snapshotKey"].startswith("match_snapshot|e2e-owned|")
    assert record["source"]["scriptVersion"] == EXPECTED_VERSION

    page.evaluate("""
      window.__tacticPresetChanges = [];
      document.querySelector('#slf-tactics-dropdown select').addEventListener('change', event => {
        const option = event.target.selectedOptions && event.target.selectedOptions[0];
        window.__tacticPresetChanges.push(option?.dataset?.presetId || event.target.value);
      });
      document.getElementById('slf-parser-recommendation').textContent =
        'Coach Mode рекомендует Simeone_Compact442_def4';
    """)
    lineup_select = page.locator("#slf-live-lineup-preset-select")
    lineup_select.focus()
    recommended = page.locator('#slf-live-lineup-preset-select option[data-recommended="1"]')
    assert recommended.count() == 1
    assert recommended.get_attribute("value") == "Simeone_Compact442_def4"
    assert "рекомендовано" in recommended.text_content()

    expected_compact = {
        "gk", "ld", "cd1", "cd3", "rd", "lm", "cm2", "dm2", "rm", "st1", "st2"
    }
    lineup_select.select_option("Simeone_Compact442_def4")
    page.wait_for_function(
        "() => document.getElementById('slf-live-lineup-preset-status')?.textContent.includes('Расстановка подготовлена')"
    )
    page.wait_for_function(
        "() => window.__tacticPresetChanges.includes('Simeone_Compact442_def4')"
    )

    field_positions = set(page.eval_on_selector_all(
        ".cf1-pitch .control_line > .control_lineup",
        "cards => cards.map(card => card.parentElement.dataset.position)",
    ))
    assert field_positions == expected_compact, field_positions
    assert page.locator(".cf1-pitch .control_line > .control_lineup").count() == 11
    assert page.locator('#control_gk > .control_lineup[data-player="p-gk"]').count() == 1
    assert page.locator('#control_sub1 > .control_lineup[data-player="p-sub1"]').count() == 1
    assert page.locator(".cf1-pitch .control_lineup.position_modify").count() >= 1
    assert page.evaluate("window.__lineupSaveClicks") == 0
    assert page.evaluate("window.__lineupPreviewCalls") == 1

    lineup_select.select_option("Arteta_Control433_bal3")
    lineup_select.select_option("Simeone_Compact442_def4")
    assert page.locator("#slf-live-lineup-preset-panel").count() == 1
    assert page.locator('#control_sub1 > .control_lineup[data-player="p-sub1"]').count() == 1
    assert page.evaluate("window.__lineupSaveClicks") == 0

    page.evaluate("""
      const card = document.querySelector('.control_lineup[data-player="p-lw"]');
      const target = document.getElementById('control_am1');
      target.appendChild(card);
      card.dataset.position = 'am1';
      window.jQuery(card).data('position', 'am1');
      card.classList.add('position_modify');
      card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      window.cf1_options_load();
    """)
    assert page.evaluate("window.__playerBindingHits") == 1
    assert page.locator('#control_am1 > .control_lineup[data-player="p-lw"]').count() == 1
    assert page.evaluate("window.__lineupSaveClicks") == 0

    page.locator(".lineup_send").click()
    assert page.evaluate("window.__lineupSaveClicks") == 1
    save_payload = page.evaluate("window.__lineupSavePayload")
    assert save_payload["am1"] == "p-lw", save_payload
    assert save_payload["sub1"] == "p-sub1", save_payload

    page.evaluate("""
      for (let index = 0; index < 40; index += 1) {
        const node = document.createElement('span');
        node.textContent = `mutation-${index}`;
        document.body.appendChild(node);
        node.remove();
      }
    """)
    page.wait_for_timeout(300)
    assert page.locator("#slf-match-parser-panel").count() == 1
    assert page.locator("#slf-manual-recommendation-btn").count() == 1
    assert page.locator("#slf-tactics-dropdown").count() == 1
    assert page.locator("#slf-live-lineup-preset-panel").count() == 1


def assert_offline_bootstrap(page: Page):
    page.wait_for_selector("#slf-match-parser-panel")
    page.wait_for_selector("#slf-manual-recommendation-btn")
    page.wait_for_selector("#slf-tactics-dropdown")
    rows = request_rows(page)
    assert any("/api/tactics" in row["url"] for row in rows), rows
    assert page.locator("#slf-match-parser-panel").count() == 1


def assert_foreign_live(page: Page):
    page.wait_for_selector("#slf-match-parser-panel")
    page.wait_for_selector("#slf-manual-recommendation-btn")
    page.wait_for_selector("#slf-foreign-match-target")
    assert page.locator("#slf-tactics-dropdown").count() == 0

    page.locator("#slf-manual-recommendation-btn").click()
    page.wait_for_function(
        "() => document.getElementById('slf-parser-status')?.textContent.includes('Подсказка обновлена вручную')"
    )
    page.wait_for_timeout(150)
    rows = request_rows(page)
    assert not any("/api/match_snapshots_v2?mode=append" in row["url"] for row in rows), rows


def assert_finished_match(page: Page):
    page.wait_for_selector("#slf-match-parser-panel")
    page.get_by_role("button", name="Спарсить завершённый").click()
    page.wait_for_function(
        "() => window.__slfRequests.some(item => item.url.includes('/api/match_results_v2?mode=append'))"
    )
    rows = request_rows(page)
    result_rows = [row for row in rows if "/api/match_results_v2?mode=append" in row["url"]]
    assert len(result_rows) == 1, result_rows
    payload = json.loads(result_rows[0]["data"])
    records = payload if isinstance(payload, list) else [payload]
    assert records[0]["recordType"] == "match_result"
    assert records[0]["status"] == "finished"
    assert not any("/api/match_snapshots_v2?mode=append" in row["url"] for row in rows), rows


def assert_incomplete_match(page: Page):
    page.wait_for_selector("#slf-match-parser-panel")
    page.wait_for_selector("#slf-manual-recommendation-btn")
    assert page.locator("#slf-tactics-dropdown").count() == 0


def assert_tactic_page(page: Page):
    page.wait_for_selector("#slf-tactics-dropdown")
    assert page.locator("#slf-tactics-dropdown").count() == 1
    assert page.locator("#slf-match-parser-panel").count() == 0
    tactic_ids = page.eval_on_selector_all(
        "#slf-tactics-dropdown select option",
        "options => options.map(option => option.dataset.presetId || option.value)",
    )
    assert "DeZerbi_BaitPress_bal3" not in tactic_ids
    assert "Henta_LeftTrap_att3" not in tactic_ids
    assert "Henta abuse" in tactic_ids


def assert_transfer_page(page: Page):
    page.wait_for_timeout(300)
    assert page.locator("#slf-match-parser-panel").count() == 0
    assert page.locator("#slf-manual-recommendation-btn").count() == 0


def main():
    cases = [
        ("owned-live", "/game.php?id=e2e-owned&fixture=owned", "success", assert_owned_live),
        ("owned-api-offline", "/game.php?id=e2e-offline&fixture=owned", "offline", assert_offline_bootstrap),
        ("foreign-live", "/game.php?id=e2e-foreign&fixture=foreign", "success", assert_foreign_live),
        ("finished-match", "/game.php?id=e2e-finished&fixture=finished", "success", assert_finished_match),
        ("incomplete-match", "/game.php?id=e2e-incomplete&fixture=incomplete", "success", assert_incomplete_match),
        ("team-tactic", "/team4.php?action=tactic", "success", assert_tactic_page),
        ("transfer-page", "/transfers.php", "success", assert_transfer_page),
    ]

    with fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for name, path, api_mode, assertions in cases:
                run_case(browser, base_url, name, path, api_mode, assertions)
        finally:
            browser.close()

    print(f"[browser-e2e] passed all: cases={len(cases)} version={EXPECTED_VERSION}")


if __name__ == "__main__":
    main()
