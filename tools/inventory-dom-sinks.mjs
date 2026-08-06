#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const sinkPatterns = [
  { type: 'innerHTML-assignment', expression: /\.innerHTML\s*=/g },
  { type: 'outerHTML-assignment', expression: /\.outerHTML\s*=/g },
  { type: 'insertAdjacentHTML-call', expression: /\.insertAdjacentHTML\s*\(/g },
  { type: 'document-write-call', expression: /\bdocument\s*\.\s*write\s*\(/g },
  { type: 'contextual-fragment-call', expression: /\.createContextualFragment\s*\(/g },
  { type: 'dom-parser-html-call', expression: /\.parseFromString\s*\([^\n]*['"]text\/html['"]/g }
];

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(absolute);
  }
  return result.sort();
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function lineTextAt(source, lineNumber) {
  return source.split(/\r?\n/)[lineNumber - 1]?.trim() || '';
}

const sinks = [];
for (const absolute of walk(sourceRoot)) {
  const source = fs.readFileSync(absolute, 'utf8');
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  for (const pattern of sinkPatterns) {
    pattern.expression.lastIndex = 0;
    for (const match of source.matchAll(pattern.expression)) {
      const line = lineNumberAt(source, match.index);
      sinks.push({
        id: `${relative}:${line}:${pattern.type}`,
        file: relative,
        line,
        type: pattern.type,
        source: lineTextAt(source, line)
      });
    }
  }
}

sinks.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.type.localeCompare(right.type));

console.log(`[dom-sink-inventory] total=${sinks.length}`);
for (const sink of sinks) console.log(JSON.stringify(sink));
