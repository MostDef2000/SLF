#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'src/app/bundle-order.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const files = manifest.files;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentifier(source, identifier) {
  return new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(identifier)}(?![A-Za-z0-9_$])`).test(source);
}

function maskNonCode(source) {
  let result = '';
  const stack = [{ type: 'code', templateExpression: false, braceDepth: 0 }];
  let escaped = false;
  let regexCharacterClass = false;
  let lastSignificant = '';

  const top = () => stack[stack.length - 1];
  const canStartRegex = () => !lastSignificant || /[([{:;,=!?&|+\-*%^~<>]/.test(lastSignificant);

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1] || '';
    const state = top();

    if (state.type === 'line-comment') {
      if (char === '\n') {
        stack.pop();
        result += char;
      } else result += ' ';
      continue;
    }

    if (state.type === 'block-comment') {
      if (char === '*' && next === '/') {
        result += '  ';
        index++;
        stack.pop();
      } else result += char === '\n' ? '\n' : ' ';
      continue;
    }

    if (state.type === 'single' || state.type === 'double') {
      const terminator = state.type === 'single' ? "'" : '"';
      result += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === terminator) {
        stack.pop();
        lastSignificant = terminator;
      }
      continue;
    }

    if (state.type === 'regex') {
      result += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '[') regexCharacterClass = true;
      else if (char === ']') regexCharacterClass = false;
      else if (char === '/' && !regexCharacterClass) {
        stack.pop();
        lastSignificant = '/';
      }
      continue;
    }

    if (state.type === 'template') {
      if (escaped) {
        result += char === '\n' ? '\n' : ' ';
        escaped = false;
        continue;
      }
      if (char === '\\') {
        result += ' ';
        escaped = true;
        continue;
      }
      if (char === '`') {
        result += ' ';
        stack.pop();
        lastSignificant = '`';
        continue;
      }
      if (char === '$' && next === '{') {
        result += '  ';
        index++;
        stack.push({ type: 'code', templateExpression: true, braceDepth: 1 });
        lastSignificant = '{';
        continue;
      }
      result += char === '\n' ? '\n' : ' ';
      continue;
    }

    if (char === '/' && next === '/') {
      result += '  ';
      index++;
      stack.push({ type: 'line-comment' });
      continue;
    }
    if (char === '/' && next === '*') {
      result += '  ';
      index++;
      stack.push({ type: 'block-comment' });
      continue;
    }
    if (char === '/' && canStartRegex()) {
      result += ' ';
      stack.push({ type: 'regex' });
      regexCharacterClass = false;
      escaped = false;
      continue;
    }
    if (char === "'") {
      result += ' ';
      stack.push({ type: 'single' });
      escaped = false;
      continue;
    }
    if (char === '"') {
      result += ' ';
      stack.push({ type: 'double' });
      escaped = false;
      continue;
    }
    if (char === '`') {
      result += ' ';
      stack.push({ type: 'template' });
      escaped = false;
      continue;
    }

    if (state.templateExpression) {
      if (char === '{') state.braceDepth++;
      if (char === '}') {
        state.braceDepth--;
        if (state.braceDepth === 0) {
          result += ' ';
          stack.pop();
          continue;
        }
      }
    }

    result += char;
    if (!/\s/.test(char)) lastSignificant = char;
  }

  return result;
}

function extractTopLevelDeclarations(source) {
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
    }
  }
  return declarations;
}

const HOST_CAPABILITIES = [
  'MutationObserver','ResizeObserver','IntersectionObserver','URL','URLSearchParams','DOMParser',
  'Event','MouseEvent','CustomEvent','Node','document','window','unsafeWindow','location',
  'localStorage','sessionStorage','navigator','fetch','alert','prompt','confirm','setTimeout',
  'clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame',
  'GM_xmlhttpRequest','GM_getValue','GM_setValue','GM_deleteValue','GM_registerMenuCommand',
  'GM_addStyle','GM_openInTab','performance','console'
];

const sourceByFile = new Map(files.map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
const codeByFile = new Map(files.map(file => [file, maskNonCode(sourceByFile.get(file))]));
const declarationsByFile = new Map(files.map(file => [file, extractTopLevelDeclarations(sourceByFile.get(file))]));
const owners = new Map();
const collisions = [];
for (const file of files) {
  for (const symbol of declarationsByFile.get(file)) {
    if (owners.has(symbol)) collisions.push({ symbol, files: [owners.get(symbol), file] });
    else owners.set(symbol, file);
  }
}

const usedByOtherFile = new Map();
for (const [symbol, provider] of owners) {
  const consumers = files.filter(file => file !== provider && containsIdentifier(codeByFile.get(file), symbol));
  usedByOtherFile.set(symbol, consumers);
}

const modules = files.map(file => {
  const declares = declarationsByFile.get(file);
  const publicSymbols = declares.filter(symbol => (usedByOtherFile.get(symbol) || []).length > 0);
  const grouped = new Map();
  for (const [symbol, provider] of owners) {
    if (provider === file || declares.includes(symbol)) continue;
    if (!containsIdentifier(codeByFile.get(file), symbol)) continue;
    if (!grouped.has(provider)) grouped.set(provider, []);
    grouped.get(provider).push(symbol);
  }
  const requires = [...grouped.entries()].map(([provider, symbols]) => ({
    file: provider,
    symbols: [...new Set(symbols)].sort(),
    phase: 'runtime'
  })).sort((a,b) => files.indexOf(a.file) - files.indexOf(b.file));
  const hostCapabilities = HOST_CAPABILITIES.filter(capability => containsIdentifier(codeByFile.get(file), capability));
  return { file, declares, public: publicSymbols, requires, hostCapabilities };
});

const report = {
  schema: 'slf_dependency_inventory_analysis_v1',
  fileCount: files.length,
  collisions,
  modules
};

console.log('BEGIN_SLF_DEPENDENCY_INVENTORY_JSON');
console.log(JSON.stringify(report, null, 2));
console.log('END_SLF_DEPENDENCY_INVENTORY_JSON');
