#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

function p(rel) {
  return path.join(ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(p(rel));
}

function read(rel) {
  return fs.readFileSync(p(rel), 'utf8');
}

function write(rel, text) {
  fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
  fs.writeFileSync(p(rel), text.endsWith('\n') ? text : text + '\n', 'utf8');
}

function argValue(name, fallback = '') {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return fallback;
}

function sanitizeModuleName(value) {
  return String(value || 'local')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'local';
}

function currentGitBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function runtimeBlock(moduleName) {
  return `\n    // BEGIN SLF PREVIEW RUNTIME MARKER\n    var SLF_PREVIEW_INFO = {\n        preview: true,\n        module: '${moduleName}',\n        builtAt: '${new Date().toISOString()}',\n        branch: '${currentGitBranch() || 'unknown'}'\n    };\n    var SLF_PREVIEW_TARGET = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;\n    SLF_PREVIEW_TARGET.SLF_PREVIEW = SLF_PREVIEW_INFO;\n    console.info('[SLF PREVIEW ${moduleName}] loaded', SLF_PREVIEW_INFO);\n    // END SLF PREVIEW RUNTIME MARKER\n`;
}

function patchHeader(header, moduleName) {
  const previewName = `SLF Tactics Helper PREVIEW - ${moduleName}`;
  const lines = header.split(/\r?\n/)
    .filter(line => !/^\/\/\s*@updateURL\b/.test(line))
    .filter(line => !/^\/\/\s*@downloadURL\b/.test(line));

  return lines.map(line => {
    if (/^\/\/\s*@name\b/.test(line)) return `// @name         ${previewName}`;
    if (/^\/\/\s*@version\b/.test(line)) return `// @version      0.0.0-preview-${moduleName}`;
    if (/^\/\/\s*@description\b/.test(line)) return `// @description  PREVIEW build for ${moduleName}; local testing only; no production update URL`;
    return line;
  }).join('\n');
}

function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out.sort();
}

function sourceForBundle(rel) {
  let text = read(rel).trimEnd();
  if (rel === 'src/app/bootstrap.js') {
    text = text.replace(/\n\s*\}\)\(\);\s*$/u, '');
  }
  return text;
}

function loadBundleFiles() {
  if (!exists('src/app/bundle-order.json')) {
    throw new Error('Missing src/app/bundle-order.json');
  }

  const order = JSON.parse(read('src/app/bundle-order.json')).files || [];
  const files = [];
  const seen = new Set();

  for (const rel of order) {
    if (exists(rel)) {
      files.push(rel);
      seen.add(rel);
    } else {
      console.warn(`[SLF PREVIEW] bundle-order file missing, skipped: ${rel}`);
    }
  }

  for (const rel of jsFiles(p('src/modules'))) {
    if (!seen.has(rel) && !rel.includes('team4-alter-minutes-strict-link-hotfix.js')) {
      files.push(rel);
      seen.add(rel);
    }
  }

  return files;
}

function buildPreview() {
  const moduleName = sanitizeModuleName(argValue('module', currentGitBranch() || 'local'));
  const output = argValue('out', `dist/preview/SLF_preview_${moduleName}.user.js`);

  if (!exists('src/app/userscript-header.js')) {
    throw new Error('Missing src/app/userscript-header.js');
  }

  const header = patchHeader(read('src/app/userscript-header.js'), moduleName);
  const files = loadBundleFiles();

  let body = "\n(function () {\n    'use strict';\n" + runtimeBlock(moduleName);
  for (const rel of files) {
    body += `\n\n// >>> ${rel}\n${sourceForBundle(rel)}\n// <<< ${rel}\n`;
  }
  body += runtimeBlock(moduleName) + '\n})();\n';

  const userscript = `${header.trimEnd()}\n${body}`;

  if (userscript.includes('@updateURL')) throw new Error('Preview build must not contain @updateURL');
  if (userscript.includes('@downloadURL')) throw new Error('Preview build must not contain @downloadURL');
  if (output.replace(/\\/g, '/').startsWith('releases/')) throw new Error('Preview output must not be written to releases/**');

  write(output, userscript);
  execFileSync('node', ['--check', output], { cwd: ROOT, stdio: 'inherit' });

  console.log(`[SLF PREVIEW] Built ${output}`);
  console.log(`[SLF PREVIEW] Module: ${moduleName}`);
  console.log(`[SLF PREVIEW] Source files: ${files.length}`);
  console.log('[SLF PREVIEW] Production @updateURL/@downloadURL removed.');
}

try {
  buildPreview();
} catch (error) {
  console.error('[SLF PREVIEW] Build failed:', error.message || error);
  process.exit(1);
}
