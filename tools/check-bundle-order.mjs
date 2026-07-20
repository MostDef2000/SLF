#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const MANIFEST_PATH = 'src/app/bundle-order.json';
const OBSOLETE_MODULE_REGISTRY = 'src/app/module-registry.json';
const EXCLUDED_SOURCE_FILES = new Set([
  'src/app/bootstrap-preamble.js',
  'src/app/userscript-header.js',
  'src/modules/team-management/team4-alter-minutes-strict-link-hotfix.js'
]);
const BOOTSTRAP = 'src/app/bootstrap.js';

const absolute = rel => path.join(ROOT, rel);
const normalize = rel => rel.replace(/\\/g, '/');

function fail(message, details = []) {
  console.error(`[bundle-order] ${message}`);
  details.forEach(item => console.error(`  - ${item}`));
  process.exit(1);
}

function listJavaScriptFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(normalize(path.relative(ROOT, fullPath)));
  }
  return files.sort();
}

function validateProductionDebugBoundary() {
  const raw = fs.readFileSync(absolute(BOOTSTRAP), 'utf8');
  const source = maskNonCode(raw);
  const forbidden = [
    {
      label: 'debug export identifier',
      pattern: /\bSLF_DEBUG(?:_EXPORT)?\b/
    },
    {
      label: 'page-global SLF/debug assignment',
      pattern: /\b(?:window|unsafeWindow)\s*\.\s*(?:SLF_DEBUG|SLF|slf)\s*=/
    },
    {
      label: 'legacy cleanup entrypoint',
      pattern: /\b(?:clearLegacyCollections|clearLegacy|deleteLegacyCollections|resetLegacyCollections|clearLegacyMatchCollections)\b/
    },
    {
      label: 'collection mutation closure',
      pattern: /\bApi\s*\.\s*clearCollection\s*\(/
    }
  ];

  const violations = forbidden
    .filter(rule => rule.pattern.test(source))
    .map(rule => rule.label);

  if (violations.length) {
    fail('production bootstrap exposes a forbidden debug or mutation capability', violations);
  }

  return { forbiddenPatternCount: forbidden.length };
}


function createApiTransportHarness() {
  const requests = [];
  const debugLogs = [];
  const debugWarnings = [];
  const clientKey = 'TEST_PUBLIC_CLIENT_KEY';
  const sandbox = {
    CONFIG: { SERVER_URL: 'http://slf.test' },
    getApiToken: () => clientKey,
    warnMissingApiTokenOnce: () => {},
    debugLog: (...args) => debugLogs.push(args),
    debugWarn: (...args) => debugWarnings.push(args),
    GM_xmlhttpRequest: request => requests.push(request)
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(absolute('src/core/api.js'), 'utf8');
  vm.runInContext(
    `(() => {\n${source}\nglobalThis.__SLF_API__ = Api;\nglobalThis.__SLF_API_TIMEOUT__ = API_REQUEST_TIMEOUT_MS;\n})();`,
    sandbox,
    { filename: 'src/core/api.js' }
  );

  return {
    api: sandbox.__SLF_API__,
    timeout: sandbox.__SLF_API_TIMEOUT__,
    requests,
    debugLogs,
    debugWarnings,
    clientKey
  };
}

async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected API request to reject');
}

function assertSafeApiError(error, expectedKind, harness) {
  assert.equal(error?.name, 'SLFApiError');
  assert.equal(error?.kind, expectedKind);
  const serialized = `${error?.message || ''} ${JSON.stringify(error)} ${JSON.stringify(harness.debugWarnings)}`;
  assert.equal(serialized.includes(harness.clientKey), false, 'client key leaked through API error or log');
  assert.equal(Object.hasOwn(error || {}, 'request'), false, 'raw request must not be attached to API errors');
}

async function validateApiTransportContract() {
  try {
    {
      const harness = createApiTransportHarness();
      const promise = harness.api.post('writes', { ok: true }, 'write test');
      const request = harness.requests[0];
      assert.equal(request.timeout, 15000);
      assert.equal(request.headers.Authorization, `Bearer ${harness.clientKey}`);
      request.onload({ status: 201, statusText: 'Created', finalUrl: 'http://slf.test/api/writes', responseText: '{}' });
      const result = await promise;
      assert.equal(result.status, 201);
      assert.equal(harness.debugLogs.length, 1);
    }

    {
      const harness = createApiTransportHarness();
      const promise = harness.api.getPromise('reads');
      harness.requests[0].onload({
        status: 200,
        statusText: 'OK',
        finalUrl: 'http://slf.test/api/reads',
        responseText: '{"items":[1,2]}'
      });
      const result = await promise;
      assert.deepEqual(Array.from(result.data.items), [1, 2]);
    }

    {
      const harness = createApiTransportHarness();
      const promise = harness.api.post('writes', { ok: false }, 'rejected write');
      harness.requests[0].onload({
        status: 500,
        statusText: `Failure ${harness.clientKey}`,
        finalUrl: `http://slf.test/api/writes?echo=${harness.clientKey}`,
        responseText: harness.clientKey
      });
      const error = await captureRejection(promise);
      assertSafeApiError(error, 'http', harness);
      assert.equal(error.status, 500);
      assert.equal(harness.debugLogs.length, 0, 'rejected POST must not log success');
    }

    {
      const harness = createApiTransportHarness();
      const promise = harness.api.getPromise('missing');
      harness.requests[0].onload({
        status: 404,
        statusText: 'Not Found',
        finalUrl: 'http://slf.test/api/missing',
        responseText: '<html>not json</html>'
      });
      const error = await captureRejection(promise);
      assertSafeApiError(error, 'http', harness);
      assert.equal(error.status, 404);
    }

    {
      const harness = createApiTransportHarness();
      const promise = harness.api.getPromise('invalid-json');
      harness.requests[0].onload({
        status: 200,
        statusText: 'OK',
        finalUrl: 'http://slf.test/api/invalid-json',
        responseText: '{invalid'
      });
      assertSafeApiError(await captureRejection(promise), 'parse', harness);
    }

    for (const [handler, kind] of [['onerror', 'network'], ['ontimeout', 'timeout'], ['onabort', 'abort']]) {
      const harness = createApiTransportHarness();
      const promise = harness.api.getPromise(kind);
      harness.requests[0][handler]({ status: 0, responseText: harness.clientKey });
      assertSafeApiError(await captureRejection(promise), kind, harness);
    }
  } catch (error) {
    fail(`API transport contract validation failed: ${error.message}`);
  }

  return { scenarioCount: 8 };
}

function identifierPattern(identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`);
}

function containsIdentifier(source, identifier) {
  return identifierPattern(identifier).test(source);
}

function assertStringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  if (!allowEmpty && value.length === 0) fail(`${label} must not be empty`);

  const invalid = value.filter(item => typeof item !== 'string' || !item.trim());
  if (invalid.length) fail(`${label} contains invalid strings`);

  const duplicates = value.filter((item, index) => value.indexOf(item) !== index);
  if (duplicates.length) fail(`${label} contains duplicates`, [...new Set(duplicates)]);
}

function maskNonCode(source) {
  let result = '';
  let state = 'code';
  let escaped = false;
  let regexCharacterClass = false;
  let lastSignificant = '';

  const canStartRegex = () => !lastSignificant || /[([{:;,=!?&|+\-*%^~<>]/.test(lastSignificant);

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1] || '';

    if (state === 'line-comment') {
      if (char === '\n') {
        state = 'code';
        result += char;
      } else {
        result += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        result += '  ';
        index++;
        state = 'code';
      } else {
        result += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (['single-quote', 'double-quote', 'template'].includes(state)) {
      const terminator = state === 'single-quote' ? "'" : state === 'double-quote' ? '"' : '`';
      result += char === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === terminator) {
        state = 'code';
        lastSignificant = terminator;
      }
      continue;
    }

    if (state === 'regex') {
      result += char === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '[') {
        regexCharacterClass = true;
      } else if (char === ']') {
        regexCharacterClass = false;
      } else if (char === '/' && !regexCharacterClass) {
        state = 'code';
        lastSignificant = '/';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      result += '  ';
      index++;
      state = 'line-comment';
      continue;
    }
    if (char === '/' && next === '*') {
      result += '  ';
      index++;
      state = 'block-comment';
      continue;
    }
    if (char === '/' && canStartRegex()) {
      result += ' ';
      state = 'regex';
      regexCharacterClass = false;
      escaped = false;
      continue;
    }
    if (char === "'") {
      result += ' ';
      state = 'single-quote';
      escaped = false;
      continue;
    }
    if (char === '"') {
      result += ' ';
      state = 'double-quote';
      escaped = false;
      continue;
    }
    if (char === '`') {
      result += ' ';
      state = 'template';
      escaped = false;
      continue;
    }

    result += char;
    if (!/\s/.test(char)) lastSignificant = char;
  }

  return result;
}

function extractTopLevelDeclarations(source, file = 'unknown source') {
  const maskedLines = maskNonCode(source).split(/\r?\n/);
  const declarations = [];
  let braceDepth = 0;

  for (const line of maskedLines) {
    if (braceDepth === 0) {
      const match = line.match(/^\s*(?:(?:async\s+)?function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/);
      if (match) declarations.push(match[1]);
    }

    for (const char of line) {
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (braceDepth < 0) fail(`source contains an unmatched closing brace during dependency audit: ${file}`);
    }
  }

  if (braceDepth !== 0) fail(`source contains unbalanced braces during dependency audit: ${file}`);
  return declarations;
}

function compareStringSets(expected, actual) {
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  return expectedSorted.length === actualSorted.length
    && expectedSorted.every((item, index) => item === actualSorted[index]);
}

function sourceDeclaresIdentifier(source, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(
    `^\\s*(?:(?:async\\s+)?function|class|const|let|var)\\s+${escaped}\\b`,
    'm'
  );
  return declaration.test(source);
}

function validateDependencyAudit(manifest, files) {
  const audit = manifest.dependencyAudit;
  if (!audit || typeof audit !== 'object') fail('dependency audit metadata is missing');
  if (audit.schema !== 'slf_module_dependency_audit_v1') {
    fail(`unsupported dependency audit schema: ${audit.schema}`);
  }
  if (audit.status !== 'pilot') fail(`dependency audit status must be pilot: ${audit.status}`);
  if (!Array.isArray(audit.modules)) fail('dependency audit modules must be an array');
  if (audit.modules.length < 5 || audit.modules.length > 10) {
    fail(`dependency audit pilot must cover 5-10 modules, found ${audit.modules.length}`);
  }
  if (!Number.isInteger(audit.expectedModuleCount)
      || audit.expectedModuleCount !== audit.modules.length) {
    fail(`dependency audit expectedModuleCount must equal ${audit.modules.length}`);
  }

  const registered = new Set(files);
  const moduleFiles = audit.modules.map(module => module?.file);
  const duplicateModuleFiles = moduleFiles.filter((file, index) => moduleFiles.indexOf(file) !== index);
  if (duplicateModuleFiles.length) {
    fail('dependency audit contains duplicate module entries', [...new Set(duplicateModuleFiles)]);
  }

  const sourceByFile = new Map();
  const declarationsByFile = new Map();
  const auditedByFile = new Map();
  const declarationOwners = new Map();

  const readSource = file => {
    if (!sourceByFile.has(file)) sourceByFile.set(file, fs.readFileSync(absolute(file), 'utf8'));
    return sourceByFile.get(file);
  };

  const readDeclarations = file => {
    if (!declarationsByFile.has(file)) {
      declarationsByFile.set(file, extractTopLevelDeclarations(readSource(file), file));
    }
    return declarationsByFile.get(file);
  };

  for (const module of audit.modules) {
    if (!module || typeof module !== 'object') fail('dependency audit contains an invalid module entry');
    if (typeof module.file !== 'string' || !module.file) fail('dependency audit module file is invalid');
    if (!registered.has(module.file)) fail(`audited module is not registered: ${module.file}`);

    assertStringArray(module.declares, `${module.file} declares`, { allowEmpty: false });
    assertStringArray(module.public, `${module.file} public`);
    assertStringArray(module.hostCapabilities, `${module.file} hostCapabilities`);
    if (!Array.isArray(module.requires)) fail(`${module.file} requires must be an array`);

    const actualDeclarations = readDeclarations(module.file);
    if (!compareStringSets(module.declares, actualDeclarations)) {
      fail(`declared globals do not match source: ${module.file}`, [
        `metadata: ${module.declares.join(', ')}`,
        `source: ${actualDeclarations.join(', ')}`
      ]);
    }

    const declaredSet = new Set(module.declares);
    const undeclaredPublic = module.public.filter(symbol => !declaredSet.has(symbol));
    if (undeclaredPublic.length) {
      fail(`public symbols are not declared by ${module.file}`, undeclaredPublic);
    }

    const source = readSource(module.file);
    const missingCapabilities = module.hostCapabilities.filter(capability => !containsIdentifier(source, capability));
    if (missingCapabilities.length) {
      fail(`host capabilities are not referenced by ${module.file}`, missingCapabilities);
    }

    for (const symbol of module.declares) {
      const owner = declarationOwners.get(symbol);
      if (owner) fail(`audited global symbol collision: ${symbol}`, [owner, module.file]);
      declarationOwners.set(symbol, module.file);
    }

    auditedByFile.set(module.file, module);
  }

  let dependencySymbolCount = 0;

  for (const module of audit.modules) {
    const source = readSource(module.file);
    const seenProviders = new Set();

    for (const dependency of module.requires) {
      if (!dependency || typeof dependency !== 'object') {
        fail(`${module.file} contains an invalid dependency entry`);
      }
      if (typeof dependency.file !== 'string' || !dependency.file) {
        fail(`${module.file} dependency provider is invalid`);
      }
      if (dependency.file === module.file) fail(`${module.file} cannot depend on itself`);
      if (seenProviders.has(dependency.file)) {
        fail(`${module.file} contains duplicate dependency providers`, [dependency.file]);
      }
      seenProviders.add(dependency.file);

      if (!registered.has(dependency.file)) {
        fail(`${module.file} dependency provider is not registered`, [dependency.file]);
      }
      if (!['evaluation', 'runtime'].includes(dependency.phase)) {
        fail(`${module.file} dependency phase is invalid for ${dependency.file}: ${dependency.phase}`);
      }
      if (dependency.phase === 'evaluation'
          && files.indexOf(dependency.file) >= files.indexOf(module.file)) {
        fail(`${module.file} evaluation dependency must precede it`, [dependency.file]);
      }

      assertStringArray(
        dependency.symbols,
        `${module.file} dependency symbols from ${dependency.file}`,
        { allowEmpty: false }
      );

      const auditedProvider = auditedByFile.get(dependency.file);
      const auditedPublic = auditedProvider ? new Set(auditedProvider.public) : null;
      const providerSource = readSource(dependency.file);

      for (const symbol of dependency.symbols) {
        const providerDeclaresSymbol = auditedProvider
          ? auditedProvider.declares.includes(symbol)
          : sourceDeclaresIdentifier(providerSource, symbol);
        if (!providerDeclaresSymbol) {
          fail(`${dependency.file} does not declare required symbol ${symbol}`, [module.file]);
        }
        if (auditedPublic && !auditedPublic.has(symbol)) {
          fail(`${module.file} uses non-public audited symbol ${symbol}`, [dependency.file]);
        }
        if (!containsIdentifier(source, symbol)) {
          fail(`${module.file} does not reference declared dependency ${symbol}`, [dependency.file]);
        }
        dependencySymbolCount++;
      }
    }

    for (const provider of audit.modules) {
      if (provider.file === module.file) continue;

      for (const symbol of provider.public) {
        if (!containsIdentifier(source, symbol)) continue;

        const declaredDependency = module.requires.some(dependency => (
          dependency.file === provider.file && dependency.symbols.includes(symbol)
        ));
        if (!declaredDependency) {
          fail(`${module.file} uses undeclared audited dependency ${symbol}`, [provider.file]);
        }
      }
    }
  }

  return {
    moduleCount: audit.modules.length,
    dependencySymbolCount,
    hostCapabilityCount: audit.modules.reduce(
      (count, module) => count + module.hostCapabilities.length,
      0
    )
  };
}

if (!fs.existsSync(absolute(MANIFEST_PATH))) fail(`manifest not found: ${MANIFEST_PATH}`);
if (fs.existsSync(absolute(OBSOLETE_MODULE_REGISTRY))) fail(`obsolete module registry must not exist: ${OBSOLETE_MODULE_REGISTRY}`);
let manifest;
try { manifest = JSON.parse(fs.readFileSync(absolute(MANIFEST_PATH), 'utf8')); }
catch (error) { fail(`manifest is invalid JSON: ${error.message}`); }
if (manifest.schema !== 'slf_bundle_order_v1') fail(`unsupported manifest schema: ${manifest.schema}`);
if (!Array.isArray(manifest.files) || !manifest.files.length) fail('manifest contains no files');

const files = manifest.files;
const unsafe = files.filter(rel => typeof rel !== 'string'
  || rel.includes('\\')
  || path.isAbsolute(rel)
  || rel.split('/').includes('..')
  || !rel.startsWith('src/')
  || !rel.endsWith('.js'));
if (unsafe.length) fail('manifest contains unsafe or non-runtime paths', unsafe);

const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
if (duplicates.length) fail('duplicate manifest entries', [...new Set(duplicates)]);
const missing = files.filter(file => !fs.existsSync(absolute(file)));
if (missing.length) fail('registered files are missing', missing);
const excludedButRegistered = files.filter(file => EXCLUDED_SOURCE_FILES.has(file));
if (excludedButRegistered.length) fail('excluded source files must not be bundled', excludedButRegistered);

const bootstrapIndex = files.indexOf(BOOTSTRAP);
if (bootstrapIndex < 0) fail('bootstrap is not registered');
if (bootstrapIndex !== files.length - 1) fail('bootstrap must remain the final manifest entry', files.slice(bootstrapIndex + 1));

const sourceFiles = listJavaScriptFiles(absolute('src')).filter(file => !EXCLUDED_SOURCE_FILES.has(file));
const registered = new Set(files);
const unregistered = sourceFiles.filter(file => !registered.has(file));
if (unregistered.length) fail('unregistered src JavaScript files', unregistered);

const dependencyAudit = validateDependencyAudit(manifest, files);
const debugBoundary = validateProductionDebugBoundary();
const apiTransport = await validateApiTransportContract();

console.log(
  `[bundle-order] OK: ${files.length} registered runtime modules; manifest is complete and bootstrap is final; `
  + `dependency pilot validates ${dependencyAudit.moduleCount} modules, `
  + `${dependencyAudit.dependencySymbolCount} dependency symbols, and `
  + `${dependencyAudit.hostCapabilityCount} host capabilities; `
  + `production debug boundary rejects ${debugBoundary.forbiddenPatternCount} privileged export patterns; `
  + `API transport contract validates ${apiTransport.scenarioCount} deterministic scenarios.`
);
