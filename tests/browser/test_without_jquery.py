#!/usr/bin/env python3

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
HARNESS_PATH = ROOT / "tests" / "browser" / "test_exact_userscript.py"


def load_harness():
    spec = importlib.util.spec_from_file_location("slf_exact_browser_harness", HARNESS_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load exact browser harness")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def no_jquery_init_script():
    return """
(() => {
  'use strict';
  const gmStore = new Map();
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
    if (key === 'slf_api_token') return 'browser-no-jquery-token';
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
      if (typeof request.onload === 'function') {
        request.onload({
          status: 200,
          statusText: 'OK',
          responseText,
          finalUrl: entry.url
        });
      }
    }, 0);
    return { abort() {} };
  };

  window.alert = message => window.__slfAlerts.push(String(message));
  window.prompt = () => null;
  delete window.$;
  delete window.jQuery;
})();
"""


def main():
    harness = load_harness()
    with harness.fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU")
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(no_jquery_init_script())
        try:
            page.goto(base_url + "/team4.php?action=tactic", wait_until="domcontentloaded")
            assert page.evaluate("typeof window.jQuery") == "undefined"
            assert page.evaluate("typeof window.$") == "undefined"
            harness.inject_exact_artifact(page)
            page.wait_for_selector("#slf-tactics-dropdown")
            page.wait_for_timeout(150)
            assert page.locator("#slf-tactics-dropdown").count() == 1
            assert page.evaluate("typeof window.jQuery") == "undefined"
            assert page.evaluate("typeof window.$") == "undefined"
            assert page.evaluate("window.__slfUnhandled.slice()") == []
            assert page_errors == [], page_errors
            assert page.evaluate(
                "window.SLF && window.SLF.scriptVersion"
            ) == harness.EXPECTED_VERSION
        finally:
            context.close()
            browser.close()

    print(json.dumps({
        "status": "passed",
        "test": "userscript-startup-without-jquery",
        "version": harness.EXPECTED_VERSION,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
