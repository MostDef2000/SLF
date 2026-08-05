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
  <title>FM 2026 classic match performance</title>
  <style>
    :root{--fm-font:Roboto,Arial,sans-serif}
    body{margin:0;background:#0d0f18;color:#eef1f8;font-family:var(--fm-font)}
    .fm-topbar{height:56px}.fm-deck{height:80px}.fm-stage{max-width:1400px;margin:auto}
    .content-ui__wrapper{padding:20px}.g3{display:block}
    .g3-grid{display:grid;grid-template-columns:200px minmax(0,1fr) 200px;gap:8px;width:1240px;margin:auto}
    .g3-col--center{min-width:0;text-align:center}
    .g3-timeline{height:18px;width:1280px;margin:0 auto 4px;background:#272d42}
    .g3 #fieldgrass{
      position:relative;width:800px;height:550px;margin:0 auto 330px;
      transform:scale(1.6);transform-origin:top center;
      background-image:linear-gradient(#1f8240,#1c7639);
      box-shadow:inset 0 0 60px rgba(0,0,0,.34);
      filter:saturate(1.12);
      transition:transform .2s ease;
    }
    .g3 #letsdance{width:800px;height:550px;transform:translateZ(0);filter:contrast(1.02)}
    .user-custom__game-field-23698{background-image:url('/custom-pitch.jpg') !important}
    .user-custom__game-field-99999{background-image:url('/second-custom-pitch.jpg') !important}
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
      <div class="g3"><div class="g3-grid">
        <aside></aside>
        <section class="g3-col--center">
          <div class="g3-timeline"></div>
          <div id="fieldgrass" class="user-custom__game-field-23698"><canvas id="letsdance" width="3200" height="2200"></canvas></div>
        </section>
        <aside></aside>
      </div></div>
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
        path = self.path.split("?", 1)[0]
        if path in {"/custom-pitch.jpg", "/second-custom-pitch.jpg"}:
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path != "/game.php":
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
  window.__canvasReallocations = 0;
  window.__fieldSizerCalls = 0;
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
    set_render_scale(value) {
      window.__renderScaleCalls.push(value);
      const canvas = document.getElementById('letsdance');
      const width = Math.round(800 * value);
      const height = Math.round(550 * value);
      if (canvas && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
        window.__canvasReallocations += 1;
      }
    }
  };
  window.game2dRefreshRenderScale = () => window.game_2d.set_render_scale(4);
  window.game2dSetFieldSize = () => {
    window.__fieldSizerCalls += 1;
    const field = document.querySelector('.g3 [id^="fieldgrass"]');
    const timeline = document.querySelector('.g3-timeline');
    if (field) {
      field.style.transform = 'scale(1.6)';
      field.style.transformOrigin = 'top center';
      field.style.marginBottom = '330px';
      field.style.filter = 'saturate(1.12)';
    }
    if (timeline) timeline.style.width = '1280px';
    window.game2dRefreshRenderScale();
  };
})();
"""


def assert_classic_geometry(page):
    geometry = page.locator("#fieldgrass").evaluate(
        """el => {
          const rect = el.getBoundingClientRect();
          const center = el.closest('.g3-col--center').getBoundingClientRect();
          const style = getComputedStyle(el);
          const canvas = el.querySelector('#letsdance');
          const canvasStyle = getComputedStyle(canvas);
          const timelineRect = document.querySelector('.g3-timeline').getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            centerDelta: Math.abs((rect.left + rect.width / 2) - (center.left + center.width / 2)),
            transform: style.transform,
            filter: style.filter,
            shadow: style.boxShadow,
            marginBottom: style.marginBottom,
            background: style.backgroundImage,
            contain: style.contain,
            isolation: style.isolation,
            canvasWidth: canvasStyle.width,
            canvasHeight: canvasStyle.height,
            canvasBitmapWidth: canvas.width,
            canvasBitmapHeight: canvas.height,
            canvasTransform: canvasStyle.transform,
            timelineWidth: timelineRect.width,
            marker: el.dataset.slfClassicPerformance,
            pitchMarker: el.dataset.slfClassicPitchForced,
            rasterMarker: el.dataset.slfClassicRaster
          };
        }"""
    )
    assert abs(geometry["width"] - 800) < 0.5, geometry
    assert abs(geometry["height"] - 550) < 0.5, geometry
    assert geometry["centerDelta"] < 0.5, geometry
    assert geometry["transform"] == "none", geometry
    assert geometry["filter"] == "none", geometry
    assert geometry["shadow"] == "none", geometry
    assert geometry["marginBottom"] == "0px", geometry
    assert "play_field6.png" in geometry["background"], geometry
    assert "custom-pitch.jpg" not in geometry["background"], geometry
    assert "second-custom-pitch.jpg" not in geometry["background"], geometry
    contain_tokens = set(geometry["contain"].split())
    assert geometry["contain"] == "content" or {"layout", "paint", "style"}.issubset(contain_tokens), geometry
    assert geometry["isolation"] == "isolate", geometry
    assert geometry["canvasWidth"] == "800px", geometry
    assert geometry["canvasHeight"] == "550px", geometry
    assert geometry["canvasBitmapWidth"] == 800, geometry
    assert geometry["canvasBitmapHeight"] == 550, geometry
    assert geometry["canvasTransform"] == "none", geometry
    assert abs(geometry["timelineWidth"] - 800) < 0.5, geometry
    assert geometry["marker"] == "1", geometry
    assert geometry["pitchMarker"] == "1", geometry
    assert geometry["rasterMarker"] == "1", geometry


def main():
    assert ARTIFACT.is_file(), ARTIFACT
    with server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ru-RU", viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.add_init_script(init_script())
        page.goto(base_url + "/game.php?id=34368005", wait_until="domcontentloaded")
        page.add_script_tag(path=str(ARTIFACT))
        page.wait_for_function("expected => window.SLF?.scriptVersion === expected", arg=VERSION)
        page.wait_for_selector("#slf-match-rendering-compatibility", state="attached")
        page.wait_for_function("() => document.documentElement.dataset.slfClassicMatchPerformance === '1'")
        page.wait_for_function("() => document.documentElement.dataset.slfMatchRenderHooks === 'ready'")
        page.wait_for_function("() => document.documentElement.dataset.slfMatchRenderScale === '1'")
        page.wait_for_function("() => window.game_2d?.__slfSmoothRenderScaleInstalled === true")
        page.wait_for_function("() => window.game2dSetFieldSize?.__slfClassicMatchPerformanceInstalled === true")

        assert_classic_geometry(page)
        assert page.locator("#fieldgrass").evaluate("el => el.classList.contains('user-custom__game-field-23698')")
        assert page.locator("#slf-match-rendering-compatibility").count() == 1
        assert page.evaluate("window.__renderScaleCalls.slice()") == [1]
        assert page.evaluate("window.__canvasReallocations") == 1

        stable_calls = page.evaluate("window.__renderScaleCalls.length")
        stable_reallocations = page.evaluate("window.__canvasReallocations")
        page.wait_for_timeout(500)
        assert page.evaluate("window.__renderScaleCalls.length") == stable_calls
        assert page.evaluate("window.__canvasReallocations") == stable_reallocations

        page.evaluate("window.game2dSetFieldSize()")
        page.wait_for_timeout(150)
        assert page.evaluate("window.__fieldSizerCalls") >= 1
        assert_classic_geometry(page)
        assert page.evaluate("window.__renderScaleCalls.length") == stable_calls
        assert page.evaluate("window.__canvasReallocations") == stable_reallocations

        page.evaluate("window.game_2d.set_render_scale(9)")
        assert page.evaluate("window.__renderScaleCalls.length") == stable_calls
        assert page.evaluate("window.__canvasReallocations") == stable_reallocations

        page.locator("#fieldgrass").evaluate(
            "el => { el.classList.remove('user-custom__game-field-23698'); el.classList.add('user-custom__game-field-99999'); }"
        )
        page.wait_for_timeout(150)
        assert_classic_geometry(page)

        page.set_viewport_size({"width": 1600, "height": 1000})
        page.wait_for_timeout(150)
        assert_classic_geometry(page)
        assert page.evaluate("window.__renderScaleCalls.length") == stable_calls
        assert page.evaluate("window.__canvasReallocations") == stable_reallocations

        assert not page_errors, page_errors
        assert page.evaluate("window.__slfUnhandled.slice()") == []
        context.close()
        browser.close()

    print("[match-rendering-compatibility] passed: classic_geometry=800x550 render_scale=1 bitmap=800x550 reallocations=1 duplicate_scale_calls=0")


if __name__ == "__main__":
    main()
