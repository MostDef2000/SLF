import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bootstrapPath = new URL('../src/app/bootstrap.js', import.meta.url);
const source = fs.readFileSync(bootstrapPath, 'utf8');

const appStartIndex = source.indexOf('App.start();');
assert.ok(appStartIndex > 0, 'bootstrap must contain App.start()');
assert.equal(source.indexOf('App.start();', appStartIndex + 1), -1, 'bootstrap must invoke App.start() exactly once');

const preStart = source.slice(0, appStartIndex);

assert.ok(
    !preStart.includes('compactSnapshotForStorage.bind'),
    'known fatal startup pattern must never return before App.start()'
);

const bindMatches = [...preStart.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.bind\(([^)]*)\)/g)]
    .map(match => `${match[1]}.bind(${match[2].trim()})`)
    .sort();

const allowedCompatibilityBinds = [
    'UI.addDropdown.bind(UI)',
    'current.bind(pageWindow)',
    'engine.set_render_scale.bind(engine)'
].sort();

assert.deepEqual(
    bindMatches,
    allowedCompatibilityBinds,
    [
        'compatibility bind boundary changed before App.start()',
        'New monkey patches must be isolated behind runCompatibilityAdapter or explicitly reviewed here.',
        `Expected: ${allowedCompatibilityBinds.join(', ')}`,
        `Actual: ${bindMatches.join(', ')}`
    ].join('\n')
);

const runnerStart = source.indexOf('function reportCompatibilityFailure');
const runnerEnd = source.indexOf('const HeaderMatchesLayoutCompatibility', runnerStart);
assert.ok(runnerStart >= 0 && runnerEnd > runnerStart, 'compatibility fail-open runner must be defined');

const runnerSource = source.slice(runnerStart, runnerEnd);
const sandbox = {
    console: {
        warnings: [],
        warn(...args) {
            this.warnings.push(args);
        }
    }
};
vm.createContext(sandbox);
vm.runInContext(`${runnerSource}\nthis.runCompatibilityAdapter = runCompatibilityAdapter;`, sandbox);

assert.equal(
    sandbox.runCompatibilityAdapter('healthy-adapter', () => {}),
    true,
    'healthy compatibility adapter must report success'
);
assert.equal(
    sandbox.runCompatibilityAdapter('broken-adapter', () => { throw new Error('expected failure'); }),
    false,
    'broken compatibility adapter must fail open'
);
assert.equal(sandbox.console.warnings.length, 1, 'broken compatibility adapter must emit one warning');
assert.match(String(sandbox.console.warnings[0][0]), /broken-adapter/, 'warning must identify the failed adapter');

const adapterCalls = [
    "runCompatibilityAdapter('header-matches-layout', () => HeaderMatchesLayoutCompatibility.install());",
    "runCompatibilityAdapter('match-rendering', () => MatchRenderingCompatibility.install());",
    "runCompatibilityAdapter('tactics-dropdown', () => TacticsDropdownUiPolicy.install());"
];

let previousIndex = runnerEnd;
for (const call of adapterCalls) {
    const index = source.indexOf(call);
    assert.ok(index > previousIndex, `compatibility adapter order is invalid: ${call}`);
    assert.ok(index < source.indexOf('const App ='), `compatibility adapter must run before App creation: ${call}`);
    previousIndex = index;
}

for (const marker of [
    'function applyTacticsDropdownUiPolicy()',
    'const HeaderMatchesLayoutCompatibility =',
    'const MatchRenderingCompatibility =',
    'const TacticsDropdownUiPolicy =',
    'const App =',
    'App.start();'
]) {
    assert.ok(source.includes(marker), `bootstrap owner marker is missing: ${marker}`);
}

const compatibilityEntry = 'applyTacticsDropdownUiPolicy();';
const compatibilityEntryIndex = source.indexOf(compatibilityEntry);
assert.ok(compatibilityEntryIndex > previousIndex, 'compatibility owner must run after its three adapters are declared');
assert.ok(compatibilityEntryIndex < source.indexOf('const App ='), 'compatibility owner must run before App creation');
assert.equal(
    source.indexOf(compatibilityEntry, compatibilityEntryIndex + compatibilityEntry.length),
    -1,
    'compatibility owner must be invoked exactly once'
);

console.log('Bootstrap risk boundary: OK');
