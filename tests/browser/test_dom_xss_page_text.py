#!/usr/bin/env python3

import importlib.util
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
HARNESS_PATH = ROOT / "tests" / "browser" / "test_exact_userscript.py"
MALICIOUS_TEXT = "</div><img id=\"slf-page-xss\" src=x onerror=\"window.__slfXss=11\"><svg onload=\"window.__slfXss=12\"></svg><script>window.__slfXss=13</script> javascript:alert(1)"


def load_harness():
    spec = importlib.util.spec_from_file_location("slf_exact_browser_harness_page_xss", HARNESS_PATH)
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
            page.goto(base_url + "/game.php?id=e2e-xss-page&fixture=owned", wait_until="domcontentloaded")
            page.evaluate(
                """
                malicious => {
                  window.__slfXss = 0;
                  const opponent = document.querySelector('a[href="roster.php?id=99999"]');
                  const comment = document.querySelector('.game_comments td');
                  const heading = document.querySelector('.team_general_content h2');
                  opponent.textContent = malicious;
                  comment.textContent = `20' ${malicious}`;
                  heading.textContent = malicious;
                }
                """,
                MALICIOUS_TEXT,
            )
            harness.inject_exact_artifact(page)
            page.wait_for_selector("#slf-manual-recommendation-btn")
            page.locator("#slf-manual-recommendation-btn").click()
            page.wait_for_function(
                "() => document.getElementById('slf-parser-status')?.textContent.includes('Подсказка обновлена вручную')"
            )
            recommendation = page.locator("#slf-parser-recommendation")
            assert recommendation.count() == 1
            assert recommendation.locator("img, svg, script, iframe, object, embed").count() == 0
            assert recommendation.locator("[onerror], [onload], [onclick], [srcdoc], [formaction]").count() == 0
            assert page.locator("#slf-page-xss").count() == 0
            assert page.evaluate("window.__slfXss") == 0

            html = recommendation.inner_html()
            assert '<img id="slf-page-xss"' not in html
            assert "&lt;/div&gt;&lt;img" in html or MALICIOUS_TEXT not in recommendation.text_content()
            assert page_errors == [], page_errors
            assert page.evaluate("window.__slfUnhandled.slice()") == []
        finally:
            context.close()
            browser.close()

    print(json.dumps({
        "status": "passed",
        "test": "malicious-match-page-text-dom-xss",
        "version": harness.EXPECTED_VERSION,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
