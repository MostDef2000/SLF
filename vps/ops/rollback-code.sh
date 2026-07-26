#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: rollback-code.sh --backup DIR

Restores only source-controlled code saved by deploy-code.sh. Live data,
environment files, credentials, cron state, virtual environments, logs, and
generated primary data are not restored or deleted.
EOF
}

BACKUP_DIR=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup) BACKUP_DIR=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$BACKUP_DIR" ] || { echo '--backup is required' >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on the VPS.' >&2; exit 1; }
[ -d "$BACKUP_DIR" ] || { echo "Backup directory not found: $BACKUP_DIR" >&2; exit 1; }
[ -f "$BACKUP_DIR/deployment.env" ] || { echo 'Backup manifest is missing.' >&2; exit 1; }
[ -f "$BACKUP_DIR/SHA256SUMS" ] || { echo 'Backup checksums are missing.' >&2; exit 1; }
(cd "$BACKUP_DIR" && sha256sum --check SHA256SUMS)

# shellcheck disable=SC1090
source "$BACKUP_DIR/deployment.env"
case "${component:-}" in
  api)
    API_DIR='/root/slf-server'
    UNIT_PATH='/etc/systemd/system/slf-server.service'
    [ -f "$BACKUP_DIR/server.py" ] || { echo 'server.py is missing from backup.' >&2; exit 1; }
    [ -f "$BACKUP_DIR/slf-server.service" ] || { echo 'service unit is missing from backup.' >&2; exit 1; }

    install -m 0644 "$BACKUP_DIR/server.py" "$API_DIR/server.py"
    [ -f "$BACKUP_DIR/requirements.txt" ] && install -m 0644 "$BACKUP_DIR/requirements.txt" "$API_DIR/requirements.txt"
    install -m 0644 "$BACKUP_DIR/slf-server.service" "$UNIT_PATH"
    rm -f "$API_DIR/DEPLOYED_GIT_COMMIT"

    "$API_DIR/venv/bin/python" -m py_compile "$API_DIR/server.py"
    systemd-analyze verify "$UNIT_PATH"
    systemctl daemon-reload
    systemctl restart slf-server.service
    systemctl is-active --quiet slf-server.service
    ;;

  exporter-rag)
    EXPORT_DIR='/opt/slf_ai_exporter_v2/slf_ai_exporter_v2'
    for file in slf_ai_export.py slf_rag_build.py run_daily_export.sh slf_drive_filter.txt requirements.txt; do
      [ -f "$BACKUP_DIR/$file" ] || continue
      mode=0644
      [ "$file" = 'run_daily_export.sh' ] && mode=0755
      install -m "$mode" "$BACKUP_DIR/$file" "$EXPORT_DIR/$file"
    done
    rm -f "$EXPORT_DIR/DEPLOYED_GIT_COMMIT"

    "$EXPORT_DIR/venv/bin/python" -m py_compile "$EXPORT_DIR/slf_ai_export.py" "$EXPORT_DIR/slf_rag_build.py"
    bash -n "$EXPORT_DIR/run_daily_export.sh"
    (cd "$EXPORT_DIR" && ./run_daily_export.sh)
    [ -s /var/www/html/slf_ai/catalog.json ] || { echo 'catalog.json verification failed after rollback' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/rag/catalog.json ] || { echo 'RAG catalog verification failed after rollback' >&2; exit 1; }
    ;;

  *)
    echo "Unsupported component in backup manifest: ${component:-missing}" >&2
    exit 1
    ;;
esac

echo "Rollback complete: component=$component backup=$BACKUP_DIR"
