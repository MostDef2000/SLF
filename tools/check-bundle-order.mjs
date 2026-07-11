#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = 'src/app/bundle-order.json';
const EXCLUDED_SOURCE_FILES = new Set([
  'src/app/bootstrap-preamble.js',
  'src/app/userscript-header.js',
  'src/modules/team-management/team4-alter-minutes-strict-link-hotfix.js'
]);
const EXPECTED_POST_BOOTSTRAP = [
  'src/modules/strategy-data-recommendations/preset-fit-scoring.js'
];

function absolute(rel) {
  return path.join(ROOT, rel);
}

function normalize(rel) {
  return rel.replace(/\\/g, '/');
}

function listJavaScriptFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(normalize(path.relative(ROOT, fullPath)));
    }
  }
  return files.sort();
}

function fail(message, details = []) {
  console.error(`[bundle-order] ${message}`);
  details.forEach(item => console.error(`  - ${item}`));
  process.exit(1);
}

if (!fs.existsSync(absolute(MANIFEST_PATH))) {
  fail(`manifest not found: ${MANIFEST_PATH}`);
}

const manifest = JSON.parse(fs.readFileSync(absolute(MANIFEST_PATH), 'utf8'));
const files = Array.isArray(manifest.files) ? manifest.files.map(normalize) : [];

if (!files.length) fail('manifest contains no files');

const duplicates = files.filter((file, index) => files.indexOf(file) !== index);
if (duplicates.length) fail('duplicate manifest entries', [...new Set(duplicates)]);

const missing = files.filter(file => !fs.existsSync(absolute(file)));
if (missing.length) fail('registered files are missing', missing);

const invalid = files.filter(file => !file.startsWith('src/') || !file.endsWith('.js'));
if (invalid.length) fail('manifest contains non-runtime paths', invalid);

const bootstrap = 'src/app/bootstrap.js';
const bootstrapIndex = files.indexOf(bootstrap);
if (bootstrapIndex < 0) fail('bootstrap is not registered');

const postBootstrap = files.slice(bootstrapIndex + 1);
if (JSON.stringify(postBootstrap) !== JSON.stringify(EXPECTED_POST_BOOTSTRAP)) {
  fail('post-bootstrap runtime tail changed', [
    `expected: ${EXPECTED_POST_BOOTSTRAP.join(' -> ')}`,
    `actual: ${postBootstrap.join(' -> ') || '(empty)'}`
  ]);
}

const sourceFiles = listJavaScriptFiles(absolute('src'))
  .filter(file => !EXCLUDED_SOURCE_FILES.has(file));
const registered = new Set(files);
const unregistered = sourceFiles.filter(file => !registered.has(file));
if (unregistered.length) fail('unregistered src JavaScript files', unregistered);

const excludedButRegistered = files.filter(file => EXCLUDED_SOURCE_FILES.has(file));
if (excludedButRegistered.length) fail('excluded source files must not be bundled', excludedButRegistered);

console.log(`[bundle-order] OK: ${files.length} registered runtime modules; explicit post-bootstrap tail preserved.`);
