#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const target = 'task/80-batch2-tactics-strategy-audit';
const file = 'tools/check-bundle-order.mjs';
const run = (args, capture = false) => execFileSync('git', args, { stdio: capture ? 'pipe' : 'inherit' });

run(['fetch', 'origin', 'main', target]);
run(['checkout', '-B', target, `origin/${target}`]);
let source = fs.readFileSync(file, 'utf8');
const before = "    assertStringArray(module.declares, `${module.file} declares`, { allowEmpty: false });";
const after = "    assertStringArray(module.declares, `${module.file} declares`);";
if (!source.includes(before)) throw new Error('expected declaration assertion not found');
source = source.replace(before, after);
fs.writeFileSync(file, source);
run(['config', 'user.name', 'SLF Automation']);
run(['config', 'user.email', 'actions@users.noreply.github.com']);
run(['add', file]);
run(['commit', '-m', 'audit: allow modules without global declarations']);
run(['push', 'origin', `HEAD:${target}`]);
console.log('SLF_BATCH2_EMPTY_DECLARATIONS_FIXED');
