#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const base = 'ebb260253ce3d335e2084210080e97e12b0d5af8';
const files = [
  'tools/check-bundle-order.mjs',
  'src/app/bundle-order.json',
  'docs/architecture/slf-module-dependency-pilot.md'
];

for (const file of files) {
  const content = execFileSync('git', ['show', `${base}:${file}`]);
  console.log(`BEGIN_SLF_FILE_BASE64 ${file}`);
  console.log(content.toString('base64'));
  console.log(`END_SLF_FILE_BASE64 ${file}`);
}

console.log('SLF_ANALYSIS_EXPORT_COMPLETE');
