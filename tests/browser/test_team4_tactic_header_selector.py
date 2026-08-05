#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
FIXTURE = ROOT / "tests" / "browser" / "fixtures" / "fm2026-team-tactic.html"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path != "/team4.php":
            self.send_error(404)
            return
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
  window.unsafeWindow = window;
  window.__slfUnhandled = [];
  window.__slfAlerts = [];
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => store.has(key) ? store.get(key) : fallback;
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    setTimeout(() => request.onload?.({status:200,statusText:'OK',responseText:'{}',finalUrl:String(request.url || '')}), 0);
    return {abort(){}};
  };
  const jq = function() { return {on(){return this;},off(){return this;},find(){return this;},each(){return this;},first(){return this;},text(){return '';},val(){return '';},attr(){return undefined;},data(){return undefined;},append(){return this;},prepend(){return this;},remove(){return this;},length:0}; };
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = message => window.__slfAlerts.push(String(message));
  window.confirm = () => true;
  window.prompt = () => null;
})();
"""


def inject(page: Page):
    page.add_script_tag(path=str(ARTIFACT))
    page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
    page.wait_for_selector(".team > .team-head > #slf-tactics-dropdown")


def assert_header_selector(page: Page):
    evidence = page.locator("#slf-tactics-dropdown").evaluate(
        """node => {
          const header = node.parentElement;
          const matches = header.querySelector(':scope > .team-head__matches');
          const identity = header.querySelector(':scope > .team-head__id');
          const nr = node.getBoundingClientRect();
          const mr = matches.getBoundingClientRect();
          const ir = identity.getBoundingClientRect();
          const hr = header.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            parentClass: header.className,
            nextClass: node.nextElementSibling?.className || '',
            marker: node.dataset.slfTeam4TacticHeader || '',
            display: style.display,
            width: nr.width,
            left: nr.left,
            right: nr.right,
            identityRight: ir.right,
            matchesLeft: mr.left,
            headerLeft: hr.left,
            headerRight: hr.right,
            overflow: document.documentElement.scrollWidth - innerWidth,
            buttons: node.querySelectorAll('button').length,
            options: node.querySelectorAll('select option').length,
            duplicateCount: document.querySelectorAll('#slf-tactics-dropdown').length,
            bridgeClassRemaining: document.getElementById('team-tactic-form').classList.contains('team_general_content')
          };
        }"""
    )
    assert "team-head" in evidence["parentClass"], evidence
    assert "team-head__matches" in evidence["nextClass"], evidence
    assert evidence["marker"] == "1", evidence
    assert evidence["display"] == "grid", evidence
    assert evidence["width"] >= 360, evidence
    assert evidence["left"] >= evidence["identityRight"] - 1, evidence
    assert evidence["right"] <= evidence["matchesLeft"] + 1, evidence
    assert evidence["left"] >= evidence["headerLeft"] - 1, evidence
    assert evidence["right"] <= evidence["headerRight"] + 1, evidence
    assert evidence["overflow"] <= 1, evidence
    assert evidence["buttons"] == 5, evidence
    assert evidence["options"] >= 10, evidence
    assert evidence["duplicateCount"] == 1, evidence
    assert evidence["bridgeClassRemaining"] is False, evidence

    select = page.locator("#slf-tactics-dropdown select")
    preset_name = "Pep_StandardControl_bal3"
    assert select.locator(f"option[value='{preset_name}']").count() == 1
    select.select_option(preset_name)
    page.wait_for_timeout(1000)
    page.locator("#slf-tactics-dropdown button").first.click()

    expected_applied = """() => document.querySelector('input[name="def_line"][value="2"]')?.checked
      && document.querySelector('input[name="press_line"][value="2"]')?.checked
      && document.querySelector('input[name="press_intense"][value="3"]')?.checked
      && document.querySelector('input[name="style"][value="3"]')?.checked
      && document.querySelector('input[name="pass_risk"][value="3"]')?.checked"""
    try:
        page.wait_for_function(expected_applied, timeout=5000)
    except PlaywrightTimeoutError as error:
        actual = page.evaluate(
            """() => {
              const checked = name => document.querySelector(`input[type="radio"][name="${name}"]:checked`)?.value || '';
              return {
                selected: document.querySelector('#slf-tactics-dropdown select')?.value || '',
                def_line: checked('def_line'),
                press_line: checked('press_line'),
                press_intense: checked('press_intense'),
                style: checked('style'),
                pass_risk: checked('pass_risk'),
                alerts: window.__slfAlerts.slice(),
                unhandled: window.__slfUnhandled.slice()
              };
            }"""
        )
        raise AssertionError(f"Team4 preset application mismatch: {actual}") from error

    page.evaluate(
        """() => {
          const node = document.createElement('i');
          node.textContent = 'mutation';
          document.querySelector('.content-ui__wrapper').appendChild(node);
          node.remove();
        }"""
    )
    page.wait_for_timeout(500)
    assert page.locator("#slf-tactics-dropdown").count() == 1
    assert page.locator(".team > .team-head > #slf-tactics-dropdown").count() == 1


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    assert FIXTURE.is_file(), FIXTURE

    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(init_script())
        try:
            page.goto(base_url + "/team4.php?action=tactic", wait_until="domcontentloaded")
            inject(page)
            assert_header_selector(page)
            page.wait_for_timeout(200)
            assert page_errors == [], page_errors
            assert page.evaluate("window.__slfUnhandled.slice()") == []
            print(f"[team4-tactic-header] passed version={VERSION}")
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
