#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy-code.sh --repo DIR --commit SHA --component api|exporter-rag [--backup-root DIR]

Deploys source-controlled VPS code from an exact Git commit. Run on the VPS only
after separate operational approval. The script never copies data, environment
files, credentials, logs, virtual environments, cron state, or generated data.
EOF
}

REPO_DIR=''
COMMIT=''
COMPONENT=''
BACKUP_ROOT='/var/backups/slf-code'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO_DIR=${2:-}; shift 2 ;;
    --commit) COMMIT=${2:-}; shift 2 ;;
    --component) COMPONENT=${2:-}; shift 2 ;;
    --backup-root) BACKUP_ROOT=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$REPO_DIR" ] || { echo '--repo is required' >&2; exit 2; }
[ -n "$COMMIT" ] || { echo '--commit is required' >&2; exit 2; }
case "$COMPONENT" in api|exporter-rag) ;; *) echo '--component must be api or exporter-rag' >&2; exit 2 ;; esac

for command_name in git sha256sum install; do command -v "$command_name" >/dev/null; done
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on the VPS.' >&2; exit 1; }
[ -d "$REPO_DIR/.git" ] || { echo "Not a Git checkout: $REPO_DIR" >&2; exit 1; }
git -C "$REPO_DIR" cat-file -e "${COMMIT}^{commit}"
RESOLVED_COMMIT=$(git -C "$REPO_DIR" rev-parse "$COMMIT")
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP-$COMPONENT-$RESOLVED_COMMIT"
STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT

create_backup_dir() {
  mkdir -p "$BACKUP_ROOT"
  mkdir "$BACKUP_DIR"
}
write_manifest() {
  printf 'component=%s\ncommit=%s\ndeployed_at_utc=%s\n' \
    "$COMPONENT" "$RESOLVED_COMMIT" "$TIMESTAMP" > "$BACKUP_DIR/deployment.env"
}
write_checksums() {
  (cd "$BACKUP_DIR" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
}

case "$COMPONENT" in
  api)
    API_DIR='/root/slf-server'
    UNIT_PATH='/etc/systemd/system/slf-server.service'
    VENV_PY="$API_DIR/venv/bin/python"
    VENV_PIP="$API_DIR/venv/bin/pip"
    for command_name in systemctl systemd-analyze curl; do command -v "$command_name" >/dev/null; done
    [ -x "$VENV_PY" ] || { echo "Missing API Python: $VENV_PY" >&2; exit 1; }
    [ -x "$VENV_PIP" ] || { echo "Missing API pip: $VENV_PIP" >&2; exit 1; }
    [ -f "$API_DIR/slf_api.env" ] || { echo 'Missing slf_api.env; refusing deployment.' >&2; exit 1; }

    git -C "$REPO_DIR" show "$RESOLVED_COMMIT:vps/api/server.py" > "$STAGE_DIR/server.py"
    git -C "$REPO_DIR" show "$RESOLVED_COMMIT:vps/api/requirements.txt" > "$STAGE_DIR/requirements.txt"
    git -C "$REPO_DIR" show "$RESOLVED_COMMIT:vps/ops/slf-server.service" > "$STAGE_DIR/slf-server.service"
    "$VENV_PY" -m py_compile "$STAGE_DIR/server.py"
    systemd-analyze verify "$STAGE_DIR/slf-server.service"

    create_backup_dir
    [ -f "$API_DIR/server.py" ] && cp -a "$API_DIR/server.py" "$BACKUP_DIR/server.py"
    [ -f "$API_DIR/requirements.txt" ] && cp -a "$API_DIR/requirements.txt" "$BACKUP_DIR/requirements.txt"
    [ -f "$UNIT_PATH" ] && cp -a "$UNIT_PATH" "$BACKUP_DIR/slf-server.service"
    write_manifest
    write_checksums

    "$VENV_PIP" install -r "$STAGE_DIR/requirements.txt"
    install -m 0644 "$STAGE_DIR/server.py" "$API_DIR/server.py"
    install -m 0644 "$STAGE_DIR/requirements.txt" "$API_DIR/requirements.txt"
    install -m 0644 "$STAGE_DIR/slf-server.service" "$UNIT_PATH"
    systemctl daemon-reload
    systemctl restart slf-server.service
    systemctl is-active --quiet slf-server.service

    HTTP_STATUS=''
    API_READY=0
    ATTEMPT=1
    while [ "$ATTEMPT" -le 30 ]; do
      if HTTP_STATUS=$(curl \
        --silent \
        --output /dev/null \
        --write-out '%{http_code}' \
        --connect-timeout 2 \
        --max-time 5 \
        http://127.0.0.1:5000/api/analysis); then
        if [ "$HTTP_STATUS" = '401' ]; then
          API_READY=1
          break
        fi
      fi
      sleep 1
      ATTEMPT=$((ATTEMPT + 1))
    done
    [ "$API_READY" -eq 1 ] || {
      echo "API readiness verification failed after 30 attempts; last HTTP status: ${HTTP_STATUS:-connection_failed}" >&2
      exit 1
    }
    printf '%s\n' "$RESOLVED_COMMIT" > "$API_DIR/DEPLOYED_GIT_COMMIT"
    ;;

  exporter-rag)
    EXPORT_DIR='/opt/slf_ai_exporter_v2/slf_ai_exporter_v2'
    VENV_PY="$EXPORT_DIR/.venv/bin/python"
    VENV_PIP="$EXPORT_DIR/.venv/bin/pip"
    FILES='slf_ai_export.py slf_rag_build.py slf_generator_update_rag.py slf_preset_evidence_561.py slf_tactical_lab_v1.py generator_updates.json run_daily_export.sh slf_drive_filter.txt requirements.txt'
    [ -d "$EXPORT_DIR" ] || { echo "Missing exporter directory: $EXPORT_DIR" >&2; exit 1; }
    [ -x "$VENV_PY" ] || { echo "Missing exporter Python: $VENV_PY" >&2; exit 1; }
    [ -x "$VENV_PIP" ] || { echo "Missing exporter pip: $VENV_PIP" >&2; exit 1; }

    for file in $FILES; do
      git -C "$REPO_DIR" show "$RESOLVED_COMMIT:vps/exporter-rag/$file" > "$STAGE_DIR/$file"
    done
    "$VENV_PY" -m py_compile \
      "$STAGE_DIR/slf_ai_export.py" \
      "$STAGE_DIR/slf_rag_build.py" \
      "$STAGE_DIR/slf_generator_update_rag.py" \
      "$STAGE_DIR/slf_preset_evidence_561.py" \
      "$STAGE_DIR/slf_tactical_lab_v1.py"
    "$VENV_PY" -c 'import json,sys; p=json.load(open(sys.argv[1], encoding="utf-8")); assert p.get("schema") == "slf_generator_update_pack_v1"; assert p.get("generatorVersion") == "5.61"; assert p.get("rules")' "$STAGE_DIR/generator_updates.json"
    bash -n "$STAGE_DIR/run_daily_export.sh"

    create_backup_dir
    for file in $FILES; do
      [ -f "$EXPORT_DIR/$file" ] && cp -a "$EXPORT_DIR/$file" "$BACKUP_DIR/$file"
    done
    write_manifest
    write_checksums

    "$VENV_PIP" install -r "$STAGE_DIR/requirements.txt"
    install -m 0644 "$STAGE_DIR/slf_ai_export.py" "$EXPORT_DIR/slf_ai_export.py"
    install -m 0644 "$STAGE_DIR/slf_rag_build.py" "$EXPORT_DIR/slf_rag_build.py"
    install -m 0644 "$STAGE_DIR/slf_generator_update_rag.py" "$EXPORT_DIR/slf_generator_update_rag.py"
    install -m 0644 "$STAGE_DIR/slf_preset_evidence_561.py" "$EXPORT_DIR/slf_preset_evidence_561.py"
    install -m 0644 "$STAGE_DIR/slf_tactical_lab_v1.py" "$EXPORT_DIR/slf_tactical_lab_v1.py"
    install -m 0644 "$STAGE_DIR/generator_updates.json" "$EXPORT_DIR/generator_updates.json"
    install -m 0755 "$STAGE_DIR/run_daily_export.sh" "$EXPORT_DIR/run_daily_export.sh"
    install -m 0644 "$STAGE_DIR/slf_drive_filter.txt" "$EXPORT_DIR/slf_drive_filter.txt"
    install -m 0644 "$STAGE_DIR/requirements.txt" "$EXPORT_DIR/requirements.txt"
    (cd "$EXPORT_DIR" && ./run_daily_export.sh)
    [ -s /var/www/html/slf_ai/manifest.json ] || { echo 'manifest.json verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/rag/catalog.json ] || { echo 'RAG catalog verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/rag/generator_update_pack.json ] || { echo 'generator update pack verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/rag/generator_updates.jsonl ] || { echo 'generator updates verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/data/preset_evidence_561.json ] || { echo 'preset evidence 5.61 verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/data/tactical_lab_summary.json ] || { echo 'Tactical Lab summary verification failed' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/data/tactical_lab_quality.json ] || { echo 'Tactical Lab quality verification failed' >&2; exit 1; }
    "$VENV_PY" -c 'import json; c=json.load(open("/var/www/html/slf_ai/rag/catalog.json", encoding="utf-8")); assert c.get("generatorContext", {}).get("version") == "5.61"; ids={s.get("id") for s in c.get("sources", [])}; assert "generator_updates" in ids; assert "preset_evidence_561" in ids; assert "tactical_lab_summary" in ids; assert "tactical_lab_quality" in ids'
    "$VENV_PY" -c 'import json; m=json.load(open("/var/www/html/slf_ai/manifest.json", encoding="utf-8")); f=m.get("files", {}); assert f.get("tacticalLabSummary", {}).get("exists") is True; assert f.get("tacticalLabQuality", {}).get("exists") is True; assert m.get("recommendedReadOrder", [])[:2] == ["data/tactical_lab_quality.json", "data/tactical_lab_summary.json"]'
    printf '%s\n' "$RESOLVED_COMMIT" > "$EXPORT_DIR/DEPLOYED_GIT_COMMIT"
    ;;
esac

echo "Deployment complete: component=$COMPONENT commit=$RESOLVED_COMMIT backup=$BACKUP_DIR"
