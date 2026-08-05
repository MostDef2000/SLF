#!/usr/bin/env python3

import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
ARTIFACT = ROOT / "releases" / "latest.user.js"
VERSION = json.loads((ROOT / "data" / "version.json").read_text(encoding="utf-8"))["scriptVersion"]

MATCH_HTML = """<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>FM 2026 match rendering compatibility</title>
  <style>
    :root{--fm-font:Roboto,Arial,sans-serif}
    body{margin:0;background:#0d0f18;color:#eef1f8;font-family:var(--fm-font)}
    .fm-topbar{height:56px}.fm-deck{height:80px}.fm-stage{max-width:1200px;margin:auto}
    .content-ui__wrapper{padding:20px}.g3{display:block}
    .g3 #fieldgrass{position:relative;width:800px;height:550px;background-image:linear-gradient(#1f8240,#1c7639);box-shadow:inset 0 0 60px rgba(0,0,0,.34)}
  </style>
</head>
<body id="body" class="dark-theme">
  <div class="fm-topbar"></div><div class="fm-deck"></div>
  <div class="fm-stage"><div class="content-ui__wrapper">
    <div id="head">match</div>
    <main class="match_content">
      <p>Идёт '20 мин</p>
      <div class="score_board"><div class="indarkbig"><div>1</div><div>0</div></div></div>
      <a href="/roster.php?id=23698">Луч</a><a href="/roster.php?id=99999">Соперник</a>
      <section class="stats">
        <span class="stat-23698-power2">102</span><span class="stat-99999-power2">96</span>
        <span class="stat-23698-pos">54</span><span class="stat-99999-pos">46</span>
      </section>
      <div class="g3"><div id="fieldgrass"><canvas id="letsdance" width="800" height="550"></canvas></div></div>
      <section class="team_general_content">
        <label><input type="radio" name="def_line" value="2" checked></label>
        <label><input type="radio" name="press_line" value="3" checked></label>
        <label><input type="radio" name="def_width" value="2" checked></label>
        <label><input type="radio" name="press_intense" value="3" checked></label>
        <label><input type="radio" name="build_type" value="2" checked></label>
        <label><input type="radio" name="build_temp" value="2" checked></label>
        <label><input type="radio" name="build_long" value="2" checked></label>
        <label><input type="radio" name="build_fast" value="2" checked></label>
        <label><input type="radio" name="style" value="3" checked></label>
        <label><input type="radio" name="pass_risk" value="3" checked></label>
        <label><input type="radio" name="dribble" value="2" checked></label>
        <label><input type="radio" name="cross" value="2" checked></label>
        <label><input type="radio" name="corner" value="1" checked></label>
        <label><input type="radio" name="shot" value="2" checked></label>
        <label><input type="checkbox" name="priority_c" value="1" checked></label>
      </section>
    </main>
  </div></div>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] != "/game.php":
            self.send_error(404)
            return
        payload = MATCH_HTML.encode("utf-8")
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
  window.__slfUnhandled = [];
  window.__renderScaleCalls = [];
  window.unsafeWindow = window;
  window.addEventListener('error', event => window.__slfUnhandled.push(`error:${event.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', event => window.__slfUnhandled.push(`rejection:${String(event.reason?.message || event.reason || 'unknown')}`));
  window.GM_getValue = (key, fallback = '') => key === 'slf_api_token' ? 'match-render-token' : (store.has(key) ? store.get(key) : fallback);
  window.GM_setValue = (key, value) => store.set(key, value);
  window.GM_deleteValue = key => store.delete(key);
  window.GM_registerMenuCommand = () => 1;
  window.GM_xmlhttpRequest = request => {
    setTimeout(() => request.onload?.({status:200,statusText:'OK',responseText:request.method === 'GET' ? '[]' : '{}',finalUrl:String(request.url || '')}), 0);
    return {abort(){}};
  };
  const jq = function(){return {on(){return this;},off(){return this;},find(){return this;},each(){return this;},first(){return this;},text(){return '';},val(){return '';},attr(){return undefined;},data(){return undefined;},append(){return this;},prepend(){return this;},remove(){return this;},length:0};};
  jq.ajax = () => Promise.resolve({});
  window.$ = window.jQuery = jq;
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
  window.game_2d = {
    set_render_scale(value) { window.__renderScaleCalls.push(value); }
  };
  window.game2dRefreshRenderScale = () => window.game_2d.set_render_scale(4);
})();
"""


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU")
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(init_script())
        page.goto(base_url + "/game.php?id=34368005", wait_until="domcontentloaded")
        page.add_script_tag(path=str(ARTIFACT))
        page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
        page.wait_for_selector("#slf-match-rendering-compatibility", state="attached")
        page.wait_for_function("() => window.game_2d?.__slfSmoothRenderScaleInstalled === true")

        style = page.locator("#fieldgrass").evaluate(
            "el => ({background:getComputedStyle(el).backgroundImage,shadow:getComputedStyle(el).boxShadow})"
        )
        assert "play_field6.png" in style["background"], style
        assert style["shadow"] == "none", style

        page.evaluate("window.game_2d.set_render_scale(9)")
        assert page.evaluate("window.__renderScaleCalls.at(-1)") == 2

        page.locator("#fieldgrass").evaluate("el => el.classList.add('user-custom__game-field-23698')")
        custom_background = page.locator("#fieldgrass").evaluate("el => getComputedStyle(el).backgroundImage")
        assert "play_field6.png" not in custom_background, custom_background

        assert not page_errors, page_errors
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        context.close()
        browser.close()

    print("[match-rendering-compatibility] passed: legacy_pitch=true render_scale_cap=2 custom_pitch_preserved=true")


if __name__ == "__main__":
    main()
