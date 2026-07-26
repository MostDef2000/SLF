#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const BASE = 'ebb260253ce3d335e2084210080e97e12b0d5af8';
const TARGET = 'task/80-batch2-tactics-strategy-audit';
const MANIFEST = 'src/app/bundle-order.json';
const CHECKER = 'tools/check-bundle-order.mjs';
const DOC = 'docs/architecture/slf-module-dependency-pilot.md';
const run = (args, options = {}) => execFileSync('git', args, { cwd: ROOT, stdio: options.capture ? 'pipe' : 'inherit' });
const fromBase = file => run(['show', `${BASE}:${file}`], { capture: true }).toString('utf8');
const normalize = rel => rel.replace(/\\/g, '/');

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
      if (char === '\n') { stack.pop(); result += char; } else result += ' ';
      continue;
    }
    if (state.type === 'block-comment') {
      if (char === '*' && next === '/') { result += '  '; index++; stack.pop(); }
      else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (state.type === 'single' || state.type === 'double') {
      const terminator = state.type === 'single' ? "'" : '"';
      result += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === terminator) { stack.pop(); lastSignificant = terminator; }
      continue;
    }
    if (state.type === 'regex') {
      result += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '[') regexCharacterClass = true;
      else if (char === ']') regexCharacterClass = false;
      else if (char === '/' && !regexCharacterClass) { stack.pop(); lastSignificant = '/'; }
      continue;
    }
    if (state.type === 'template') {
      if (escaped) { result += char === '\n' ? '\n' : ' '; escaped = false; continue; }
      if (char === '\\') { result += ' '; escaped = true; continue; }
      if (char === '`') { result += ' '; stack.pop(); lastSignificant = '`'; continue; }
      if (char === '$' && next === '{') {
        result += '  '; index++; stack.push({ type: 'code', templateExpression: true, braceDepth: 1 }); lastSignificant = '{'; continue;
      }
      result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (char === '/' && next === '/') { result += '  '; index++; stack.push({ type: 'line-comment' }); continue; }
    if (char === '/' && next === '*') { result += '  '; index++; stack.push({ type: 'block-comment' }); continue; }
    if (char === '/' && canStartRegex()) { result += ' '; stack.push({ type: 'regex' }); regexCharacterClass = false; escaped = false; continue; }
    if (char === "'") { result += ' '; stack.push({ type: 'single' }); escaped = false; continue; }
    if (char === '"') { result += ' '; stack.push({ type: 'double' }); escaped = false; continue; }
    if (char === '`') { result += ' '; stack.push({ type: 'template' }); escaped = false; continue; }
    if (state.templateExpression) {
      if (char === '{') state.braceDepth++;
      if (char === '}') {
        state.braceDepth--;
        if (state.braceDepth === 0) { result += ' '; stack.pop(); continue; }
      }
    }
    result += char;
    if (!/\s/.test(char)) lastSignificant = char;
  }
  return result;
}
function extractTopLevelDeclarations(source) {
  const lines = maskNonCode(source).split(/\r?\n/);
  const declarations = [];
  let depth = 0;
  for (const line of lines) {
    if (depth === 0) {
      const match = line.match(/^\s*(?:(?:async\s+)?function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/);
      if (match) declarations.push(match[1]);
    }
    for (const char of line) {
      if (char === '{') depth++;
      if (char === '}') depth--;
    }
  }
  return declarations;
}

const manifest = JSON.parse(fromBase(MANIFEST));
const files = manifest.files;
const sourceByFile = new Map(files.map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
const codeByFile = new Map(files.map(file => [file, maskNonCode(sourceByFile.get(file))]));
const declarationsByFile = new Map(files.map(file => [file, extractTopLevelDeclarations(sourceByFile.get(file))]));
const owners = new Map();
for (const file of files) {
  for (const symbol of declarationsByFile.get(file)) {
    if (owners.has(symbol)) throw new Error(`global collision ${symbol}: ${owners.get(symbol)} / ${file}`);
    owners.set(symbol, file);
  }
}
const publicBySymbol = new Map();
for (const [symbol, provider] of owners) {
  publicBySymbol.set(symbol, files.some(file => file !== provider && containsIdentifier(codeByFile.get(file), symbol)));
}
const hosts = ['MutationObserver','ResizeObserver','IntersectionObserver','URL','URLSearchParams','DOMParser','Event','MouseEvent','CustomEvent','Node','document','window','unsafeWindow','location','localStorage','sessionStorage','navigator','fetch','alert','prompt','confirm','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','GM_xmlhttpRequest','GM_getValue','GM_setValue','GM_deleteValue','GM_registerMenuCommand','GM_addStyle','GM_openInTab','performance','console'];
const inventory = files.map(file => {
  const declares = declarationsByFile.get(file);
  const grouped = new Map();
  for (const [symbol, provider] of owners) {
    if (provider === file || declares.includes(symbol) || !containsIdentifier(codeByFile.get(file), symbol)) continue;
    if (!grouped.has(provider)) grouped.set(provider, []);
    grouped.get(provider).push(symbol);
  }
  return {
    file,
    declares,
    public: declares.filter(symbol => publicBySymbol.get(symbol)),
    requires: [...grouped.entries()].map(([provider, symbols]) => ({ file: provider, symbols: [...new Set(symbols)].sort(), phase: 'runtime' })).sort((a,b) => files.indexOf(a.file) - files.indexOf(b.file)),
    hostCapabilities: hosts.filter(capability => containsIdentifier(codeByFile.get(file), capability))
  };
});
const byFile = new Map(inventory.map(item => [item.file, item]));
const existing = new Set(manifest.dependencyAudit.modules.map(item => item.file));
const batch = new Set([
  'src/modules/tactics-presets/preset-storage.js','src/modules/tactics-presets/tactic-control-engine.js','src/modules/tactics-presets/tactic-preset-library.js','src/modules/tactics-presets/tactic-preset-library-panel.js','src/modules/tactics-presets/active-preset-registry.js','src/modules/tactics-presets/tactic-preset-direction-policy.js',
  'src/modules/strategy-data-recommendations/developer-hint-parser.js','src/modules/strategy-data-recommendations/generator-advice-details-parser.js','src/modules/strategy-data-recommendations/generator-expected-performance-and-strength-context.js','src/modules/strategy-data-recommendations/dave-engine-knowledge.js','src/modules/strategy-data-recommendations/tactical-urgency-model.js','src/modules/strategy-data-recommendations/recommendation-engine.js','src/modules/strategy-data-recommendations/preset-fit-scoring.js','src/modules/strategy-data-recommendations/current-action-hint-engine.js','src/modules/strategy-data-recommendations/coach-hint-snapshot-context-layer.js','src/modules/strategy-data-recommendations/signal-noise-filter-layer.js','src/modules/strategy-data-recommendations/adaptive-opponent-style-layer.js','src/modules/strategy-data-recommendations/coach-mode-policy.js','src/modules/strategy-data-recommendations/moment-drift-stabilizer.js','src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js'
]);
const selected = files.filter(file => existing.has(file) || batch.has(file)).map(file => byFile.get(file));
if (selected.length !== 30) throw new Error(`expected 30 modules, found ${selected.length}`);
manifest.dependencyAudit = { schema: 'slf_module_dependency_audit_v1', status: 'expanding', expectedModuleCount: 30, modules: selected };

let checker = fromBase(CHECKER);
const maskStart = checker.indexOf('function maskNonCode(source) {');
const maskEnd = checker.indexOf('\nfunction extractTopLevelDeclarations', maskStart);
const improvedMask = maskNonCode.toString() + '\n';
checker = checker.slice(0, maskStart) + improvedMask + checker.slice(maskEnd);
checker = checker.replace("  if (audit.status !== 'pilot') fail(`dependency audit status must be pilot: ${audit.status}`);\n  if (!Array.isArray(audit.modules)) fail('dependency audit modules must be an array');\n  if (audit.modules.length < 5 || audit.modules.length > 10) {\n    fail(`dependency audit pilot must cover 5-10 modules, found ${audit.modules.length}`);\n  }", "  if (!['pilot', 'expanding', 'complete'].includes(audit.status)) {\n    fail(`dependency audit status is invalid: ${audit.status}`);\n  }\n  if (!Array.isArray(audit.modules)) fail('dependency audit modules must be an array');\n  if (audit.modules.length < 5 || audit.modules.length > files.length) {\n    fail(`dependency audit must cover 5-${files.length} modules, found ${audit.modules.length}`);\n  }");
checker = checker.replace("  const registered = new Set(files);\n  const moduleFiles = audit.modules.map(module => module?.file);", "  const registered = new Set(files);\n  const moduleFiles = audit.modules.map(module => module?.file);\n  if (audit.status === 'complete' && !compareStringSets(moduleFiles, files)) {\n    fail('complete dependency audit must cover every registered runtime module', [\n      `audited: ${moduleFiles.length}`,\n      `registered: ${files.length}`\n    ]);\n  }");
checker = checker.replace('dependency pilot validates ${dependencyAudit.moduleCount} modules,', 'dependency audit validates ${dependencyAudit.moduleCount} modules,');

const doc = `# SLF module dependency audit\n\nStatus: Active incremental expansion\nCurrent coverage: 30 of 55 registered userscript modules\nRuntime behavior impact: None\n\n## Purpose\n\n\`src/app/bundle-order.json\` remains the only source for deterministic userscript assembly. Its \`files\` array defines the canonical file set and order. The adjacent \`dependencyAudit\` block records machine-checkable declarations, public globals, cross-file dependencies, phases, and host capabilities without creating a second runtime registry.\n\n## Evidence and expansion history\n\n- Pilot: 8 base modules, SLF 4.4.222.\n- Normal-change evidence: PR #83 exercised \`src/core/api.js\`; PR #89 exercised \`src/core/config.js\`; no recurring false-positive pattern was observed.\n- Batch 1: remaining Live Parser modules, PR #90, SLF 4.4.226; coverage reached 10 modules.\n- Batch 2: Tactics Presets and Strategy Data; coverage reaches 30 of 55 modules.\n\n## Metadata contract\n\nEach entry records \`file\`, complete top-level \`declares\`, cross-file \`public\` symbols, provider/symbol/phase \`requires\`, and executable-code \`hostCapabilities\`. Phases remain \`evaluation\` or \`runtime\`.\n\n## Validator states\n\n- \`pilot\`: bounded proof-of-concept coverage;\n- \`expanding\`: approved incremental coverage;\n- \`complete\`: every registered runtime file must have exactly one audit entry.\n\nThe validator checks source/declaration parity, public ownership, dependency providers and references, evaluation ordering, audited cross-use edges, collisions, host references, expected count, and exact all-file coverage in \`complete\` state. The masker now preserves executable expressions inside nested template literals.\n\n## Remaining batches\n\n1. Transfer Analyzer: 17 modules, coverage 47/55.\n2. App/bootstrap and Team Management: final 8 modules, coverage 55/55 and status \`complete\`.\n\nThe canonical \`files\` array and order, runtime source, storage, schemas, and business logic remain unchanged.\n\n## Rollback\n\nRevert the dependency metadata and validator/document changes. Runtime source and canonical bundle order remain unaffected.\n`;

run(['fetch', 'origin', 'main']);
run(['checkout', '-B', TARGET, 'origin/main']);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(CHECKER, checker);
fs.writeFileSync(DOC, doc);
run(['config', 'user.name', 'SLF Automation']);
run(['config', 'user.email', 'actions@users.noreply.github.com']);
run(['add', MANIFEST, CHECKER, DOC]);
run(['commit', '-m', 'audit: expand dependencies across tactics and strategy']);
run(['push', '--force-with-lease', 'origin', `HEAD:${TARGET}`]);
console.log('SLF_BATCH2_BRANCH_PUBLISHED');
