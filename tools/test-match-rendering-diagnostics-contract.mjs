import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./match-rendering-diagnostics.js', import.meta.url), 'utf8');

for (const prohibited of [
    'fetch(',
    'XMLHttpRequest',
    'GM_xmlhttpRequest',
    'localStorage.setItem',
    'sessionStorage.setItem',
    'game_2d.set_render_scale =',
    'game2dSetFieldSize ='
]) {
    assert.equal(source.includes(prohibited), false, `diagnostics must remain read-only: ${prohibited}`);
}

for (const required of [
    "schema: 'slf_match_rendering_diagnostics_v1'",
    'requestAnimationFrame(onFrame)',
    "type: 'longtask'",
    'medianMs',
    'p95Ms',
    'p99Ms',
    'gapsOver40Ms',
    'gapsOver50Ms',
    'gapsOver100Ms',
    'bitmapWidth',
    'bitmapHeight',
    'devicePixelRatio',
    'observerRuns',
    'visibilityChanges'
]) {
    assert.ok(source.includes(required), `diagnostics contract marker missing: ${required}`);
}

assert.ok(source.length < 15000, 'diagnostics snippet must remain small enough for manual DevTools use');
console.log('Match rendering diagnostics contract: OK');
