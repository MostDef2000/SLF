#!/usr/bin/env python3

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
HARNESS_PATH = ROOT / "tests" / "browser" / "test_exact_userscript.py"
MALICIOUS_NAME = "</option><img id=\"slf-xss-probe\" src=x onerror=\"window.__slfXss=1\"><svg onload=\"window.__slfXss=2\"></svg><script>window.__slfXss=3</script>"
TACTIC = {
    "def_line": "2",
    "press_line": "2",
    "def_width": "2",
    "press_intense": "2",
    "build_type": "2",
    "build_temp": "2",
    "build_long": "2",
    "build_fast": "2",
    "style": "2",
    "pass_risk": "2",
    "dribble": "2",
    "cross": "2",
    "shot": "2",
    "priority": ["attack"],
}


def load_harness():
    spec = importlib.util.spec_from_file_location("slf_exact_browser_harness_xss", HARNESS_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load exact browser harness")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    harness = load_harness()
    with harness.fixture_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU")
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(harness.browser_init_script("success"))
        try:
            page.goto(base_url + "/team4.php?action=tactic", wait_until="domcontentloaded")
            page.evaluate(
                """
                ([name, tactic]) => {
                  window.__slfXss = 0;
                  localStorage.setItem('slf_custom_presets', JSON.stringify({ [name]: tactic }));
                }
                """,
                [MALICIOUS_NAME, TACTIC],
            )
            harness.inject_exact_artifact(page)
            page.wait_for_selector("#slf-tactics-dropdown")

            assert page.locator("#slf-xss-probe").count() == 0
            assert page.locator("#slf-tactics-dropdown img").count() == 0
            assert page.locator("#slf-tactics-dropdown svg").count() == 0
            assert page.locator("#slf-tactics-dropdown script").count() == 0

            save_button = page.locator('button[title="Сохранить текущую тактику"]')
            assert save_button.count() == 1
            save_button.click()
            page.wait_for_selector("#slf-save-dialog")

            dialog = page.locator("#slf-save-dialog")
            assert dialog.locator("img, svg, script").count() == 0
            assert dialog.locator("[onerror], [onload], [onclick], [srcdoc]").count() == 0
            assert page.locator("#slf-xss-probe").count() == 0
            assert page.evaluate("window.__slfXss") == 0

            option_texts = dialog.locator("option").all_text_contents()
            normalized_matches = [text for text in option_texts if "＜/option＞＜img" in text]
            assert len(normalized_matches) == 1, option_texts
            assert "<" not in normalized_matches[0]
            assert ">" not in normalized_matches[0]
            assert '"' not in normalized_matches[0]

            stored = page.evaluate(
                "JSON.parse(localStorage.getItem('slf_custom_presets'))"
            )
            stored_names = list(stored.keys())
            assert len(stored_names) == 1
            assert all(char not in stored_names[0] for char in '<>"\'`&')
            assert page_errors == [], page_errors
            assert page.evaluate("window.__slfUnhandled.slice()") == []
        finally:
            context.close()
            browser.close()

    print(json.dumps({
        "status": "passed",
        "test": "malicious-preset-name-dom-xss",
        "version": harness.EXPECTED_VERSION,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
