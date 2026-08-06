import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const manifest = JSON.parse(read('src/app/bundle-order.json'));
const bootstrapFile = 'src/app/bootstrap.js';
const runnerFile = 'src/app/compatibility-runner.js';
const headerFile = 'src/app/header-matches-layout-compatibility.js';
const matchFile = 'src/app/match-rendering-compatibility.js';
const dropdownFile = 'src/app/tactics-dropdown-ui-policy.js';
const compatibilityFiles = [runnerFile, headerFile, matchFile, dropdownFile];
const expectedTail = [...compatibilityFiles, bootstrapFile];

assert.deepEqual(
    manifest.files.slice(-expectedTail.length),
    expectedTail,
    'compatibility modules must be contiguous immediately before the final bootstrap module'
);
assert.equal(manifest.files.at(-1), bootstrapFile, 'bootstrap must remain the final bundle module');

const bootstrapSource = read(bootstrapFile);
const appStartIndex = bootstrapSource.indexOf('App.start();');
assert.ok(appStartIndex > 0, 'bootstrap must contain App.start()');
assert.equal(
    bootstrapSource.indexOf('App.start();', appStartIndex + 1),
    -1,
    'bootstrap must invoke App.start() exactly once'
);
assert.ok(bootstrapSource.includes('const App ='), 'bootstrap must own App');

for (const forbidden of [
    'compactSnapshotForStorage.bind',
    'runCompatibilityAdapter(',
    'HeaderMatchesLayoutCompatibility',
    'MatchRenderingCompatibility',
    'TacticsDropdownUiPolicy',
    'applyTacticsDropdownUiPolicy'
]) {
    assert.equal(
        bootstrapSource.includes(forbidden),
        false,
        `bootstrap must not retain compatibility implementation: ${forbidden}`
    );
}

const sources = new Map(compatibilityFiles.map(file => [file, read(file)]));
const combinedCompatibilitySource = compatibilityFiles.map(file => sources.get(file)).join('\n');
assert.equal(
    combinedCompatibilitySource.includes('compactSnapshotForStorage.bind'),
    false,
    'known fatal startup pattern must never return in compatibility modules'
);

const bindMatches = [...combinedCompatibilitySource.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.bind\(([^)]*)\)/g)]
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

const runnerSource = sources.get(runnerFile);
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

const adapters = [
    {
        file: headerFile,
        owner: 'const HeaderMatchesLayoutCompatibility =',
        call: "runCompatibilityAdapter('header-matches-layout', () => HeaderMatchesLayoutCompatibility.install());"
    },
    {
        file: matchFile,
        owner: 'const MatchRenderingCompatibility =',
        call: "runCompatibilityAdapter('match-rendering', () => MatchRenderingCompatibility.install());"
    },
    {
        file: dropdownFile,
        owner: 'const TacticsDropdownUiPolicy =',
        call: "runCompatibilityAdapter('tactics-dropdown', () => TacticsDropdownUiPolicy.install());"
    }
];

for (const adapter of adapters) {
    const source = sources.get(adapter.file);
    const ownerIndex = source.indexOf(adapter.owner);
    const callIndex = source.indexOf(adapter.call);
    assert.ok(ownerIndex >= 0, `compatibility owner is missing: ${adapter.file}`);
    assert.ok(callIndex > ownerIndex, `adapter must run after its owner is declared: ${adapter.file}`);
    assert.equal(
        source.indexOf(adapter.call, callIndex + adapter.call.length),
        -1,
        `adapter must be invoked exactly once: ${adapter.file}`
    );
}

console.log('Bootstrap risk boundary: OK');
