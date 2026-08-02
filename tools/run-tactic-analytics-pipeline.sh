#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATE_DIR=${SLF_TACTIC_STATE_DIR:-"$ROOT_DIR/var/tactics"}
RUN_ID=${SLF_TACTIC_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_DIR="$STATE_DIR/runs/$RUN_ID"
EXPORT_DIR="$RUN_DIR/export"
REPORT_DIR="$RUN_DIR/report"
PUBLISHED_DIR="$STATE_DIR/reports/runs/$RUN_ID"
LATEST_LINK="$STATE_DIR/reports/latest"
LOCK_FILE="$STATE_DIR/pipeline.lock"
RETENTION_DAYS=${SLF_TACTIC_RETENTION_DAYS:-90}

mkdir -p "$STATE_DIR" "$EXPORT_DIR" "$REPORT_DIR" "$STATE_DIR/reports/runs"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[tactic-pipeline] another run is active" >&2
  exit 1
fi

node "$ROOT_DIR/tools/export-tactic-telemetry.mjs" --output "$EXPORT_DIR"
node "$ROOT_DIR/tools/validate-tactic-data-quality.mjs" --input "$EXPORT_DIR" --output "$REPORT_DIR/quality-report.json"
node "$ROOT_DIR/tools/aggregate-tactic-performance.mjs" \
  --input "$EXPORT_DIR" \
  --contract "$ROOT_DIR/data/tactics/tactic-evaluation-contract-v1.json" \
  --output "$REPORT_DIR/tactic-performance-report.json" \
  --markdown "$REPORT_DIR/tactic-performance-report.md"
node "$ROOT_DIR/tools/enrich-tactic-match-outcomes.mjs" \
  --report "$REPORT_DIR/tactic-performance-report.json" \
  --results "$EXPORT_DIR/match_results_v2.json" \
  --output "$REPORT_DIR/tactic-performance-report.json"
node "$ROOT_DIR/tools/generate-tactic-policy-proposals.mjs" \
  --input "$REPORT_DIR/tactic-performance-report.json" \
  --output "$REPORT_DIR/tactic-policy-proposals.json" \
  --markdown "$REPORT_DIR/tactic-policy-proposals.md"

REPOSITORY_COMMIT=unknown
if git -C "$ROOT_DIR" rev-parse HEAD >/dev/null 2>&1; then
  REPOSITORY_COMMIT=$(git -C "$ROOT_DIR" rev-parse HEAD)
fi

CHECKSUM_FILE="$REPORT_DIR/report-checksums.sha256"
(
  cd "$REPORT_DIR"
  sha256sum quality-report.json tactic-performance-report.json tactic-performance-report.md tactic-policy-proposals.json tactic-policy-proposals.md > report-checksums.sha256
  sha256sum --check report-checksums.sha256
)

node - "$RUN_ID" "$REPOSITORY_COMMIT" "$EXPORT_DIR/export-manifest.json" "$REPORT_DIR/quality-report.json" "$REPORT_DIR/tactic-performance-report.json" "$CHECKSUM_FILE" "$REPORT_DIR/run-manifest.json" <<'NODE'
const fs = require('fs');
const [runId, repositoryCommit, exportManifestPath, qualityPath, performancePath, checksumPath, outputPath] = process.argv.slice(2);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const exportManifest = read(exportManifestPath);
const quality = read(qualityPath);
const performance = read(performancePath);
const checksums = Object.fromEntries(fs.readFileSync(checksumPath, 'utf8').trim().split(/\n+/).map(line => {
  const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  if (!match) throw new Error(`invalid checksum line: ${line}`);
  return [match[2], match[1]];
}));
const manifest = {
  schema: 'slf_tactic_analytics_run_v1',
  runId,
  startedAt: exportManifest.startedAt || null,
  completedAt: new Date().toISOString(),
  repositoryCommit,
  contract: performance.contract || null,
  exportManifest: 'export/export-manifest.json',
  qualityStatus: quality.status,
  sourceCounts: {
    matchResults: quality.checks?.matchResultsCount ?? null,
    presetEvents: quality.checks?.presetEventsCount ?? null,
    presetEffects: quality.checks?.presetEffectsCount ?? null,
    snapshots: quality.checks?.snapshotsCount ?? null,
    eligiblePhases: performance.summary?.eligiblePhases ?? null,
    rankingGroups: performance.summary?.rankingGroups ?? null,
    validMatchOutcomes: performance.matchOutcomeSummary?.validOutcomes ?? null,
    joinedPhaseGames: performance.matchOutcomeSummary?.joinedPhaseGames ?? null
  },
  reportFiles: Object.keys(checksums),
  reportChecksums: checksums,
  published: false
};
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
NODE

if [ -e "$PUBLISHED_DIR" ]; then
  echo "[tactic-pipeline] published directory already exists: $PUBLISHED_DIR" >&2
  exit 1
fi
mkdir -p "$PUBLISHED_DIR"
cp -a "$REPORT_DIR"/. "$PUBLISHED_DIR"/
printf '%s\n' "$RUN_ID" > "$PUBLISHED_DIR/run-id.txt"
cp "$EXPORT_DIR/export-manifest.json" "$PUBLISHED_DIR/export-manifest.json"

node - "$PUBLISHED_DIR/run-manifest.json" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.published = true;
manifest.publishedAt = new Date().toISOString();
const temp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.renameSync(temp, file);
NODE

TEMP_LINK="$STATE_DIR/reports/.latest-$RUN_ID"
rm -f "$TEMP_LINK"
ln -s "runs/$RUN_ID" "$TEMP_LINK"
mv -Tf "$TEMP_LINK" "$LATEST_LINK"

find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
LATEST_TARGET=$(readlink -f "$LATEST_LINK" 2>/dev/null || true)
while IFS= read -r old; do
  [ -n "$LATEST_TARGET" ] && [ "$(readlink -f "$old")" = "$LATEST_TARGET" ] && continue
  rm -rf "$old"
done < <(find "$STATE_DIR/reports/runs" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print)

echo "[tactic-pipeline] published run $RUN_ID"
