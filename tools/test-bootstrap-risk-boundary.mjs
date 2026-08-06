import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrapPath = new URL('../src/app/bootstrap.js', import.meta.url);
const source = fs.readFileSync(bootstrapPath, 'utf8');

const appStartIndex = source.indexOf('App.start();');
assert.ok(appStartIndex > 0, 'bootstrap must contain App.start()');

const preStart = source.slice(0, appStartIndex);

assert.ok(
    !preStart.includes('compactSnapshotForStorage.bind'),
    'known fatal startup pattern must never return before App.start()'
);

const bindMatches = [...preStart.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.bind\(([^)]*)\)/g)]
    .map(match => `${match[1]}.bind(${match[2].trim()})`)
    .sort();

const allowedTopLevelBinds = [
    'UI.addDropdown.bind(UI)',
    'current.bind(pageWindow)',
    'engine.set_render_scale.bind(engine)'
].sort();

assert.deepEqual(
    bindMatches,
    allowedTopLevelBinds,
    [
        'top-level bind boundary changed before App.start()',
        'New compatibility patches must be isolated or explicitly reviewed here.',
        `Expected: ${allowedTopLevelBinds.join(', ')}`,
        `Actual: ${bindMatches.join(', ')}`
    ].join('\n')
);

const requiredStartupOrder = [
    'installHeaderMatchesLayoutCompatibility',
    'installMatchRenderingCompatibility',
    'applyTacticsDropdownUiPolicy();',
    'const App =',
    'App.start();'
];

let previousIndex = -1;
for (const marker of requiredStartupOrder) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `bootstrap startup order is invalid at marker: ${marker}`);
    previousIndex = index;
}

console.log('Bootstrap risk boundary: OK');
