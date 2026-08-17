#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const result = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) result.push(...walk(child));
    else if (entry.isFile()) result.push(child.replaceAll('\\', '/'));
  }
  return result;
}

function linesMatching(source, expression) {
  return source.split(/\r?\n/).filter(line => expression.test(line));
}

function assertExplicitWorkflowPermissions(source, file) {
  if (/^permissions:\s*$/m.test(source)) return;

  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex(line => /^jobs:\s*$/.test(line));
  assert.ok(jobsIndex >= 0, `${file} must define jobs`);

  const jobStarts = [];
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (match) jobStarts.push({ id: match[1], index });
  }
  assert.ok(jobStarts.length > 0, `${file} must define at least one job`);

  for (let index = 0; index < jobStarts.length; index += 1) {
    const start = jobStarts[index];
    const end = jobStarts[index + 1]?.index ?? lines.length;
    const block = lines.slice(start.index + 1, end).join('\n');
    assert.match(block, /^    permissions:\s*$/m, `${file} job ${start.id} must declare explicit permissions`);
  }
}

const header = read('src/app/userscript-header.js');
const apiSource = read('src/core/api.js');
const tokenSource = read('src/core/token-storage.js');
const serverSource = read('vps/api/server.py');

const expectedGrants = new Set([
  'GM_xmlhttpRequest',
  'unsafeWindow',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_registerMenuCommand'
]);
const actualGrants = new Set(
  [...header.matchAll(/^\/\/\s*@grant\s+([^\s]+)\s*$/gm)].map(match => match[1])
);
assert.deepEqual(actualGrants, expectedGrants, 'userscript grant set changed; security review is required');

const expectedConnectHosts = new Set([
  'slf-api.mostdef.ru',
  'www.transfermarkt.com',
  'transfermarkt.com',
  'slf.fm',
  'www.slf.fm',
  'soccerlife.ru',
  'www.soccerlife.ru'
]);
const actualConnectHosts = new Set(
  [...header.matchAll(/^\/\/\s*@connect\s+([^\s]+)\s*$/gm)].map(match => match[1])
);
assert.deepEqual(actualConnectHosts, expectedConnectHosts, 'userscript connect allowlist changed; security review is required');
assert.equal(actualConnectHosts.has('*'), false, 'userscript must not use wildcard @connect');

const requireUrls = [...header.matchAll(/^\/\/\s*@require\s+(\S+)\s*$/gm)].map(match => match[1]);
assert.deepEqual(
  requireUrls,
  ['https://raw.githubusercontent.com/MostDef2000/SLF/release/vendor/jquery-3.6.0.min.js'],
  'external userscript dependencies changed; supply-chain review is required'
);

// QR-004: the vendored jQuery copy is content-addressed in the repository.
// The pinned digest is the official jQuery 3.6.0 minified build fetched from
// code.jquery.com on 2026-08-17; any byte change fails this check.
const vendoredJquery = read('vendor/jquery-3.6.0.min.js');
const vendoredDigest = crypto.createHash('sha256').update(vendoredJquery).digest('hex');
assert.equal(
  vendoredDigest,
  'ff1523fb7389539c84c65aba19260648793bb4f5e29329d2ee8804bc37a3fe6e',
  'vendored jQuery 3.6.0 digest changed; supply-chain review is required'
);
assert.ok(vendoredJquery.includes('jQuery v3.6.0'), 'vendored jQuery header is missing');
assert.ok(fs.existsSync(path.join(root, 'vendor/jquery-3.6.0.LICENSE.txt')), 'vendored jQuery license is missing');

assert.ok(apiSource.includes('"Authorization": buildApiAuthorizationHeader()'), 'API token must be sent through Authorization header');
assert.ok(apiSource.includes("return \"Bearer \" + token"), 'API authorization must use Bearer token format');
assert.ok(apiSource.includes('function redactApiText(value)'), 'API errors must redact token text');
assert.ok(apiSource.includes("text.split(token).join('[redacted]')"), 'API error redaction implementation is missing');
assert.equal(/(?:\?|&)token=/i.test(apiSource), false, 'API token must not be placed in a URL query parameter');
assert.equal(/console\.(?:log|info|warn|error)\([^\n]*getApiToken\s*\(/.test(apiSource + tokenSource), false, 'API token must not be logged');
assert.equal(tokenSource.includes('alert(`SLF API token: ${token}`)'), false, 'API token value must not be displayed');

for (const marker of [
  'hmac.compare_digest',
  'COLLECTION_RE = re.compile(r"^[a-zA-Z0-9_-]+$")',
  'threading.RLock()',
  'os.replace(temp_path, path)',
  'os.fsync(file_handle.fileno())'
]) {
  assert.ok(serverSource.includes(marker), `VPS API security boundary is missing: ${marker}`);
}
assert.equal(serverSource.includes('debug=True'), false, 'Flask debug mode must not be enabled in production source');
assert.equal(serverSource.includes('eval('), false, 'VPS API must not evaluate dynamic code');

const executableFiles = [
  ...walk('src').filter(file => file.endsWith('.js')),
  ...walk('vps').filter(file => file.endsWith('.py'))
];
const dangerousCodePatterns = [
  { expression: /\beval\s*\(/, label: 'eval' },
  { expression: /\bnew\s+Function\s*\(/, label: 'new Function' },
  { expression: /document\.write\s*\(/, label: 'document.write' },
  { expression: /setTimeout\s*\(\s*['"]/, label: 'string setTimeout' },
  { expression: /setInterval\s*\(\s*['"]/, label: 'string setInterval' }
];
for (const file of executableFiles) {
  const source = read(file);
  for (const pattern of dangerousCodePatterns) {
    assert.equal(pattern.expression.test(source), false, `${file} contains prohibited dynamic execution sink: ${pattern.label}`);
  }
}

const secretScanFiles = [
  ...walk('.github'),
  ...walk('src'),
  ...walk('tools'),
  ...walk('vps'),
  ...walk('data'),
  ...walk('docs')
].filter(file => /\.(?:js|mjs|json|py|md|ya?ml|txt|service)$/.test(file));

const secretPatterns = [
  { expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: 'private key' },
  { expression: /\bghp_[A-Za-z0-9]{30,}\b/, label: 'GitHub classic token' },
  { expression: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, label: 'GitHub fine-grained token' },
  { expression: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key' },
  { expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, label: 'Slack token' }
];
for (const file of secretScanFiles) {
  const source = read(file);
  for (const pattern of secretPatterns) {
    assert.equal(pattern.expression.test(source), false, `${file} contains a possible ${pattern.label}`);
  }
}

const workflowFiles = walk('.github/workflows').filter(file => /\.ya?ml$/.test(file));
assert.ok(workflowFiles.length > 0, 'no GitHub Actions workflows found');
for (const file of workflowFiles) {
  const source = read(file);
  assertExplicitWorkflowPermissions(source, file);
  assert.equal(/permissions:\s*write-all/.test(source), false, `${file} must not use write-all permissions`);
  assert.equal(/\bpull_request_target\s*:/.test(source), false, `${file} must not use pull_request_target`);
  assert.equal(/(?:curl|wget)[^\n|]*\|\s*(?:ba)?sh\b/.test(source), false, `${file} must not pipe downloads into a shell`);

  for (const line of linesMatching(source, /^\s*-?\s*uses:\s*/)) {
    const rawValue = line.replace(/^\s*-?\s*uses:\s*/, '').trim();
    const value = rawValue.replace(/\s+#.*$/, '').trim();
    if (value.startsWith('./')) continue;
    const match = value.match(/^([^@\s]+)@([^\s#]+)$/);
    assert.ok(match, `${file} has an invalid action reference: ${rawValue}`);
    assert.match(match[2], /^[0-9a-f]{40}$/i, `${file} action is not pinned to a full commit SHA: ${rawValue}`);
  }
}

const htmlSinkCount = executableFiles.reduce((total, file) => {
  const source = read(file);
  return total + (source.match(/\.innerHTML\s*=/g) || []).length;
}, 0);

console.log(
  `[security-boundaries] passed: workflows=${workflowFiles.length} scannedFiles=${secretScanFiles.length} innerHtmlInventory=${htmlSinkCount}`
);
