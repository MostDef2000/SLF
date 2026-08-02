#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATE_DIR=${SLF_TACTIC_STATE_DIR:-"$ROOT_DIR/var/tactics"}
RUN_ID=${SLF_TACTIC_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}
RUN_DIR="$STATE_DIR/runs/$RUN_ID"
EXPORT_DIR="$RUN_DIR/export"
REPORT_DIR="$RUN_DIR/report"
LATEST_DIR="$STATE_DIR/reports/latest"
LOCK_FILE="$STATE_DIR/pipeline.lock"

mkdir -p "$STATE_DIR" "$EXPORT_DIR" "$REPORT_DIR" "$STATE_DIR/reports"
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
node "$ROOT_DIR/tools/generate-tactic-policy-proposals.mjs" \
  --input "$REPORT_DIR/tactic-performance-report.json" \
  --output "$REPORT_DIR/tactic-policy-proposals.json" \
  --markdown "$REPORT_DIR/tactic-policy-proposals.md"

TEMP_LATEST="$STATE_DIR/reports/.latest-$RUN_ID"
rm -rf "$TEMP_LATEST"
mkdir -p "$TEMP_LATEST"
cp "$REPORT_DIR"/* "$TEMP_LATEST/"
printf '%s\n' "$RUN_ID" > "$TEMP_LATEST/run-id.txt"
rm -rf "$LATEST_DIR"
mv "$TEMP_LATEST" "$LATEST_DIR"

find "$STATE_DIR/runs" -mindepth 1 -maxdepth 1 -type d -mtime +${SLF_TACTIC_RETENTION_DAYS:-90} -exec rm -rf {} +
echo "[tactic-pipeline] published run $RUN_ID"
