#!/usr/bin/env python3
"""E2E (#483): pre-LLM match-data refresh against releases/latest.user.js.

Direct run:  python3 tests/browser/test_llm_match_refresh.py   (from repo root)
Pytest run:  pytest tests/browser/test_llm_match_refresh.py

PRECONDITION / EXPECTED-RED: these cases execute the published artifact
`releases/latest.user.js`. On the current branch source the artifact predates
the #483 refresh change (the bundle contains no `get_stat_desktop` path), so a
button click still reaches the advisor without a fresh observation. Rebuild the
artifact from src (tools/build-latest-userscript.mjs) before expecting green.
Until then this file is py_compile-clean and the cases fail on the missing
desktop GET / stale payload — exactly the regression they pin.

Contract under test (issue #483):
  * Clicking #slf-llm-second-opinion-btn runs a guarded preflight that fetches
    ONE same-origin desktop observation:
      GET /ajax/game4.php?action=get_stat_desktop&game_id=<id>...
      (cache no-store, credentials same-origin, redirect error, 5s deadline)
  * On success the advisor POST carries the FRESH minute/score/signals (built
    from the JSON), not the stale DOM (fixture DOM = 20' / 1-0).
  * On refresh failure the advisor is never called and the answer shows the
    retryable message. No page reload, no DOM replacement in either case.

Oracle (observable only, production bundle exposes only the documented test
seam window.SLFStrategyTaskAInternals; this suite does not need it):
  window.__slfRequests  GM_xmlhttpRequest telemetry (advisor POSTs)
  page request events   native fetch to /ajax/game4.php
  window.__slfPreClickMarker  identity sentinel; absent after a page reload
"""
from __future__ import annotations

import json
import threading
import traceback
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "owned-live-match.html"
ARTIFACTS_DIR = ROOT / "tests" / "browser" / "artifacts"
VERSION_MANIFEST = ROOT / "data" / "version.json"

GAME_ID = "e2e-owned"
HOME_TEAM_ID = 23698  # fixture roster link: «Луч», detected as my team
AWAY_TEAM_ID = 99999  # fixture roster link: «Соперник»
STALE_MINUTE_TEXT = "Идёт '20 мин"
STALE_SCORE = ["1", "0"]  # .score_board .indarkbig div
FRESH_MINUTE = 55
FRESH_HOME_GOALS = 1
FRESH_AWAY_GOALS = 3

LLM_REFRESH_FAILED_TEXT = (
    "Не удалось обновить данные матча. "
    "Запрос к советнику не отправлен. Повторите попытку."
)


# ---------------------------------------------------------------------------
# Desktop observation payloads (the JSON /ajax/game4.php returns)
# ---------------------------------------------------------------------------
def _team_table(goals, pos=55, shots=9, ontarget=4, xg=1.2):
    # Every field normalizeDesktopObservation reads strictly. def_height and
    # press_height arrive HTML-wrapped on the live page; the parser strips tags.
    return {
        "goals": goals,
        "pos": pos,
        "shots": shots,
        "ontarget": ontarget,
        "xG": xg,
        "1": 100,
        "2": 50,
        "-1": 20,
        "-2": 10,
        "ttx": 180,
        "defective": 12,
        "def_height": '<div class="v">2</div>',
        "press_height": "3",
        "-7": 5,
        "14": 3,
        "-10": 1,
        "16": 0,
        "ind3": 7,
    }


def fresh_desktop_payload():
    # Fresh observation: minute 55, home 1 - away 3 => scoreState 'losing'.
    # The top-level score is deliberately stale/ignored (goals come from t[]).
    return {
        "status": 1,
        "score": {"home": 0, "away": 0},
        "minute": str(FRESH_MINUTE),
        "live": [
            {
                "id": GAME_ID,
                "team_1": HOME_TEAM_ID,
                "team_2": AWAY_TEAM_ID,
            }
        ],
        "t": {
            str(HOME_TEAM_ID): _team_table(FRESH_HOME_GOALS, pos=48, shots=6, ontarget=2, xg=0.7),
            str(AWAY_TEAM_ID): _team_table(FRESH_AWAY_GOALS, pos=52, shots=11, ontarget=6, xg=1.9),
        },
        "xt": {"home": 0.6, "away": 1.1},
        "game_comments": ["<b>55'</b> Гол!", {"text": "  Жёлтая карточка  "}],
    }


# ---------------------------------------------------------------------------
# Local HTTP server: fixture page + desktop endpoint with selectable failure
# ---------------------------------------------------------------------------
def _make_handler(mode: str):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, content_type: str, body: bytes):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            path = urlparse(self.path).path
            if path == "/game.php":
                self._send(200, "text/html; charset=utf-8", FIXTURE.read_bytes())
                return
            if path == "/ajax/game4.php":
                if mode == "fresh":
                    body = json.dumps(fresh_desktop_payload(), ensure_ascii=False).encode("utf-8")
                    self._send(200, "application/json; charset=utf-8", body)
                    return
                if mode == "http_status":
                    self._send(500, "text/plain; charset=utf-8", b"server error")
                    return
                if mode == "nonjson":
                    # A 200 login/redirect page is not a JSON observation.
                    self._send(200, "text/html; charset=utf-8", b"<html><form>login</form></html>")
                    return
                self._send(404, "text/plain; charset=utf-8", b"unsupported mode")
                return
            self._send(404, "text/plain; charset=utf-8", b"not found")

        def log_message(self, _format, *_args):
            return

    return Handler


@contextmanager
def fixture_endpoint(mode: str):
    server = ThreadingHTTPServer(("127.0.0.1", 0), _make_handler(mode))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


# ---------------------------------------------------------------------------
# Browser host stubs (Tampermonkey + jQuery). Native fetch is deliberately NOT
# stubbed: the desktop observation must hit the local server same-origin.
# ---------------------------------------------------------------------------
def browser_init_script() -> str:
    advisor_answer = json.dumps({
        "available": True,
        "adviceId": "e2e-advice-483",
        "preset": "Emery_BalancedBase_v11",
        "presetLabel": "Emery Balanced Base",
        "confidence": "high",
        "reason": "Тестовый совет",
        "model": "test-model",
        "latencyMs": 1200,
    }, ensure_ascii=False)
    template = r"""
(() => {
  'use strict';
  const gmStore = new Map();
  const jqDataStore = new WeakMap();
  const advisorAnswerText = __ADVISOR_ANSWER__;

  window.__slfRequests = [];
  window.__slfMenuCommands = [];
  window.__slfAlerts = [];
  window.__slfUnhandled = [];
  window.unsafeWindow = window;

  window.addEventListener('error', event => {
    window.__slfUnhandled.push(`error:${event.message || 'unknown'}`);
  });
  window.addEventListener('unhandledrejection', event => {
    window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`);
  });

  window.GM_getValue = (key, fallback = '') => {
    if (key === 'slf_api_token') return 'browser-e2e-token';
    return gmStore.has(key) ? gmStore.get(key) : fallback;
  };
  window.GM_setValue = (key, value) => gmStore.set(key, value);
  window.GM_deleteValue = key => gmStore.delete(key);
  window.GM_registerMenuCommand = (label, callback) => {
    window.__slfMenuCommands.push({ label, callbackType: typeof callback });
    return window.__slfMenuCommands.length;
  };

  window.GM_xmlhttpRequest = request => {
    const entry = {
      method: String(request.method || 'GET').toUpperCase(),
      url: String(request.url || ''),
      data: request.data == null ? null : String(request.data)
    };
    window.__slfRequests.push(entry);

    setTimeout(() => {
      let responseText = '{}';
      if (entry.method === 'GET' && !entry.url.includes('/api/tactics')) responseText = '[]';
      if (entry.url.includes('/api/advisor') && !entry.url.includes('/api/advisor_apply')) {
        responseText = advisorAnswerText;
      }
      if (typeof request.onload === 'function') {
        request.onload({ status: 200, statusText: 'OK', responseText, finalUrl: entry.url });
      }
    }, 0);

    return { abort() {} };
  };

  const jq = function(target) {
    const element = target && target.nodeType ? target : null;
    const api = {
      on() { return this; }, off() { return this; }, find() { return this; },
      each() { return this; }, first() { return this; }, text() { return ''; },
      val() { return ''; }, attr() { return undefined; },
      data(key, value) {
        if (!element) return arguments.length > 1 ? this : undefined;
        let store = jqDataStore.get(element);
        if (!store) { store = {}; jqDataStore.set(element, store); }
        if (!Object.prototype.hasOwnProperty.call(store, key) && element.dataset && key in element.dataset) {
          store[key] = element.dataset[key];
        }
        if (arguments.length === 1) return store[key];
        store[key] = value;
        return this;
      },
      append() { return this; }, prepend() { return this; }, remove() { return this; },
      length: element ? 1 : 0
    };
    return api;
  };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;

  window.alert = message => window.__slfAlerts.push(String(message));
  window.prompt = () => null;
})();
"""
    # Inline the advisor body as a JS string literal (double-encoded JSON).
    return template.replace("__ADVISOR_ANSWER__", json.dumps(advisor_answer))


# ---------------------------------------------------------------------------
# Harness helpers
# ---------------------------------------------------------------------------
def assert_script_version(page):
    expected = json.loads(VERSION_MANIFEST.read_text(encoding="utf-8"))["scriptVersion"]
    actual = page.evaluate("() => (window.SLF && window.SLF.scriptVersion) || null")
    assert actual == expected, f"scriptVersion mismatch: {actual!r} != {expected!r}"
    return expected


def request_rows(page):
    return page.evaluate("window.__slfRequests.map(item => ({...item}))")


def advisor_requests(rows):
    # /api/advisor_apply is a different endpoint; exclude it explicitly.
    return [
        row for row in rows
        if "/api/advisor" in row["url"] and "/api/advisor_apply" not in row["url"]
    ]


def wait_llm_button(page):
    page.wait_for_selector("#slf-match-parser-panel", timeout=15000)
    page.wait_for_selector("#slf-llm-second-opinion-btn", timeout=15000)


@contextmanager
def case(name: str, mode: str):
    assert ARTIFACT.is_file(), f"missing artifact {ARTIFACT} — run from repo root"
    assert FIXTURE.is_file(), f"missing fixture {FIXTURE}"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    desktop_requests = []
    page_errors = []
    console_logs = []

    with fixture_endpoint(mode) as base_url, sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU", viewport={"width": 1366, "height": 900})
        page = context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_logs.append(f"console.{message.type}: {message.text}"))
        page.on("request", lambda request: (
            desktop_requests.append(request.url)
            if "/ajax/game4.php" in request.url else None
        ))
        page.add_init_script(browser_init_script())
        try:
            page.goto(f"{base_url}/game.php?id={GAME_ID}", wait_until="domcontentloaded")
            page.add_script_tag(path=str(ARTIFACT))
            assert_script_version(page)
            yield page, page_errors, console_logs, desktop_requests
        except Exception:
            try:
                page.screenshot(path=str(ARTIFACTS_DIR / f"{name}.png"), full_page=True)
            except Exception:
                pass
            try:
                (ARTIFACTS_DIR / f"{name}.log").write_text(
                    "\n".join(console_logs[-80:]), encoding="utf-8"
                )
            except Exception:
                pass
            print("\n".join(console_logs[-40:]))
            raise
        finally:
            context.close()
            browser.close()


# ---------------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------------
def test_llm_preflight_success_uses_fresh_match_data():
    """Case A: fresh JSON reaches the advisor; stale DOM stays untouched."""
    with case("a-refresh-success", mode="fresh") as (page, page_errors, _logs, desktop_requests):
        wait_llm_button(page)

        stale_minute = page.locator(".match_content > p").first.text_content().strip()
        stale_score = page.eval_on_selector_all(
            ".score_board .indarkbig div",
            "els => els.map(el => el.textContent.trim())",
        )
        assert stale_minute == STALE_MINUTE_TEXT, stale_minute
        assert stale_score == STALE_SCORE, stale_score

        marker = "slf-pre-click-marker-483"
        page.evaluate("value => { window.__slfPreClickMarker = value; }", marker)

        page.locator("#slf-llm-second-opinion-btn").click()
        page.wait_for_function(
            "() => window.__slfRequests.some(item => "
            "item.url.includes('/api/advisor') && !item.url.includes('/api/advisor_apply'))",
            timeout=15000,
        )
        page.wait_for_selector("#slf-llm-second-opinion-answer", timeout=15000)
        page.wait_for_timeout(150)

        rows = request_rows(page)
        advisor = advisor_requests(rows)
        assert len(advisor) == 1, f"expected exactly 1 advisor POST, got {advisor}"
        payload = json.loads(advisor[0]["data"])

        assert payload.get("gameId") == GAME_ID, payload.get("gameId")
        assert payload.get("minute") == FRESH_MINUTE, payload.get("minute")
        score = payload.get("score") or {}
        assert score.get("home") == FRESH_HOME_GOALS, score
        assert score.get("away") == FRESH_AWAY_GOALS, score

        signals = payload.get("signals") or {}
        assert signals.get("minute") == FRESH_MINUTE, signals
        assert signals.get("scoreState") == "losing", signals

        # Exactly one same-origin desktop GET, addressed to this game.
        assert len(desktop_requests) == 1, desktop_requests
        assert "game_id=e2e-owned" in desktop_requests[0], desktop_requests[0]

        # No reload (sentinel survives) and the stale DOM was not replaced.
        assert page.evaluate("window.__slfPreClickMarker") == marker, "page reloaded during refresh"
        assert page.locator(".match_content > p").first.text_content().strip() == STALE_MINUTE_TEXT
        assert page.eval_on_selector_all(
            ".score_board .indarkbig div",
            "els => els.map(el => el.textContent.trim())",
        ) == STALE_SCORE

        unhandled = page.evaluate("window.__slfUnhandled.slice()")
        assert not page_errors, f"uncaught page errors: {page_errors}"
        assert not unhandled, f"unhandled browser events: {unhandled}"


def test_llm_preflight_failure_blocks_advisor():
    """Case B: refresh failure => zero advisor POSTs and the retryable message."""
    for name, mode in (
        ("b-refresh-http-500", "http_status"),
        ("b-refresh-nonjson", "nonjson"),
    ):
        with case(name, mode=mode) as (page, page_errors, _logs, desktop_requests):
            wait_llm_button(page)

            marker = "slf-pre-click-marker-483"
            page.evaluate("value => { window.__slfPreClickMarker = value; }", marker)

            page.locator("#slf-llm-second-opinion-btn").click()
            page.wait_for_function(
                "() => (document.getElementById('slf-llm-second-opinion-answer')?.textContent || '')"
                ".includes('Не удалось обновить данные матча')",
                timeout=15000,
            )
            page.wait_for_timeout(150)

            rows = request_rows(page)
            assert advisor_requests(rows) == [], (
                f"refresh failure must not reach the advisor: {advisor_requests(rows)}"
            )

            answer_text = page.locator("#slf-llm-second-opinion-answer").text_content() or ""
            assert "Не удалось обновить данные матча" in answer_text, answer_text
            assert "Повторите попытку" in answer_text, answer_text
            assert LLM_REFRESH_FAILED_TEXT in answer_text, answer_text

            # The failed refresh still issued exactly one desktop GET and did
            # not reload or replace the stale match DOM.
            assert len(desktop_requests) == 1, desktop_requests
            assert "game_id=e2e-owned" in desktop_requests[0], desktop_requests[0]
            assert page.evaluate("window.__slfPreClickMarker") == marker, "page reloaded during refresh"
            assert page.locator(".match_content > p").first.text_content().strip() == STALE_MINUTE_TEXT
            assert page.eval_on_selector_all(
                ".score_board .indarkbig div",
                "els => els.map(el => el.textContent.trim())",
            ) == STALE_SCORE

            unhandled = page.evaluate("window.__slfUnhandled.slice()")
            assert not page_errors, f"uncaught page errors: {page_errors}"
            assert not unhandled, f"unhandled browser events: {unhandled}"


# ---------------------------------------------------------------------------
# Direct runner (pytest discovers the test_* functions above as well)
# ---------------------------------------------------------------------------
CASES = [
    ("A success: fresh data reaches advisor", test_llm_preflight_success_uses_fresh_match_data),
    ("B failure: refresh error blocks advisor", test_llm_preflight_failure_blocks_advisor),
]


def main():
    failed = []
    for label, fn in CASES:
        try:
            fn()
            print(f"PASS {label}")
        except Exception:
            failed.append(label)
            print(f"FAIL {label}")
            traceback.print_exc()
    if failed:
        raise SystemExit(f"[llm-match-refresh-e2e] FAILED: {failed}")
    print(f"[llm-match-refresh-e2e] passed all: cases={len(CASES)}")


if __name__ == "__main__":
    main()
