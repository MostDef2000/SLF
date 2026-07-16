#!/usr/bin/env node
import fs from 'node:fs';

const bundle = fs.readFileSync('releases/latest.user.js', 'utf8');
const source = fs.readFileSync('src/modules/team-management/team4-alter-current-season-minutes-fix.js', 'utf8');

function fail(message) {
  console.error(`[team-management] ${message}`);
  process.exit(1);
}

if (!bundle.includes('Team4AlterCurrentSeasonMinutesBridge')) fail('Team4 alter minutes bridge missing');
if (bundle.includes('Team4AlterMinutesStrictLinkHotfix')) fail('obsolete strict hotfix module bundled');
if (bundle.includes('team4-alter-minutes-strict-link-hotfix.js')) fail('obsolete strict hotfix source reference bundled');
const schema = source.match(/schema:\s*[^\n]*['"](slf_team4_current_season_minutes(?:_v\d+)?)['"]/);
if (!schema) fail('Team4 schema marker missing');
if (!bundle.includes(schema[1])) fail(`schema missing from bundle: ${schema[1]}`);
if (source.includes('refreshTeam4AlterMinutes') && !bundle.includes('refreshTeam4AlterMinutes')) fail('refresh workflow missing');

console.log(`[team-management] OK: ${schema[1]}`);
