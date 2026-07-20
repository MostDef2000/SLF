#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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

console.log(`[bundle-order] OK: ${files.length} registered runtime modules; manifest is complete and bootstrap is final.`);
