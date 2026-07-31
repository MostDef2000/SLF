#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/slf_ai_exporter_v2/slf_ai_exporter_v2"
OUT_DIR="/var/www/html/slf_ai"
FORUM_DIR="/root/slf-server/forum_faq"
ENV_FILE="/root/slf-server/slf_api.env"
FILTER_FILE="${BASE_DIR}/slf_drive_filter.txt"
GENERATOR_UPDATES_FILE="${BASE_DIR}/generator_updates.json"

cd "$BASE_DIR"
. .venv/bin/activate

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

export SLF_API_BASE="${SLF_API_BASE:-http://127.0.0.1:5000/api}"

if [ -z "${SLF_API_TOKEN:-}" ]; then
  echo "ERROR: SLF_API_TOKEN is not set"
  exit 1
fi

python slf_ai_export.py --out "$OUT_DIR"

SLF_AI_OUT="$OUT_DIR" \
SLF_FORUM_FAQ_DIR="$FORUM_DIR" \
python slf_rag_build.py

SLF_AI_OUT="$OUT_DIR" \
SLF_GENERATOR_UPDATES_FILE="$GENERATOR_UPDATES_FILE" \
python slf_generator_update_rag.py

if command -v rclone >/dev/null 2>&1; then
  echo "Starting Google Drive sync"
  if ! rclone sync "$OUT_DIR" gdrive:"SLF AI RAG/current" \
    --filter-from "$FILTER_FILE" \
    --transfers 4 \
    --checkers 8; then
    echo "ERROR: Google Drive sync failed"
    exit 1
  fi
  echo "Google Drive sync completed"
else
  echo "WARN: rclone not found; Google Drive sync skipped"
fi

echo "SLF daily export + RAG build + generator context + Drive current sync completed"
