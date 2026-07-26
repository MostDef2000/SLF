#!/usr/bin/env node
import fs from 'node:fs';

const files = [
  'src/app/bundle-order.json',
  'docs/architecture/slf-module-dependency-pilot.md'
];

for (const file of files) {
  const content = fs.readFileSync(file);
  console.log(`BEGIN_SLF_FILE_BASE64 ${file}`);
  console.log(content.toString('base64'));
  console.log(`END_SLF_FILE_BASE64 ${file}`);
}

// The original validator is fetched separately from the approved main blob SHA
// after this temporary analysis PR is closed. This branch is never merged.
console.log('SLF_ANALYSIS_EXPORT_COMPLETE');
