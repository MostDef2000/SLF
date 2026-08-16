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

component=$(sed -n 's/^component=//p' "$BACKUP_DIR/deployment.env")
case "$component" in
  api)
    API_DIR='/root/slf-server'
    UNIT_PATH='/etc/systemd/system/slf-server.service'
    [ -f "$BACKUP_DIR/server.py" ] || { echo 'server.py is missing from backup.' >&2; exit 1; }
    [ -f "$BACKUP_DIR/slf-server.service" ] || { echo 'service unit is missing from backup.' >&2; exit 1; }

    install -m 0644 "$BACKUP_DIR/server.py" "$API_DIR/server.py"
    if [ -f "$BACKUP_DIR/requirements.txt" ]; then
      install -m 0644 "$BACKUP_DIR/requirements.txt" "$API_DIR/requirements.txt"
      "$API_DIR/venv/bin/pip" install -r "$API_DIR/requirements.txt"
    fi
    install -m 0644 "$BACKUP_DIR/slf-server.service" "$UNIT_PATH"
    rm -f "$API_DIR/DEPLOYED_GIT_COMMIT"

    "$API_DIR/venv/bin/python" -m py_compile "$API_DIR/server.py"
    systemd-analyze verify "$UNIT_PATH"
    systemctl daemon-reload
    systemctl restart slf-server.service
    systemctl is-active --quiet slf-server.service
    HTTP_STATUS=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:5000/api/analysis)
    [ "$HTTP_STATUS" = '401' ] || { echo "Expected 401 after rollback, got $HTTP_STATUS" >&2; exit 1; }
    ;;

  exporter-rag)
    EXPORT_DIR='/opt/slf_ai_exporter_v2/slf_ai_exporter_v2'
    VENV_PY="$EXPORT_DIR/.venv/bin/python"
    VENV_PIP="$EXPORT_DIR/.venv/bin/pip"
    FILES='slf_ai_export.py slf_rag_build.py slf_generator_update_rag.py slf_preset_evidence_561.py slf_tactical_lab_v1.py generator_updates.json run_daily_export.sh slf_drive_filter.txt requirements.txt'
    [ -x "$VENV_PY" ] || { echo "Missing exporter Python: $VENV_PY" >&2; exit 1; }
    [ -x "$VENV_PIP" ] || { echo "Missing exporter pip: $VENV_PIP" >&2; exit 1; }

    for file in $FILES; do
      if [ -f "$BACKUP_DIR/$file" ]; then
        mode=0644
        [ "$file" = 'run_daily_export.sh' ] && mode=0755
        install -m "$mode" "$BACKUP_DIR/$file" "$EXPORT_DIR/$file"
      elif [ "$file" = 'slf_generator_update_rag.py' ] || [ "$file" = 'generator_updates.json' ] || [ "$file" = 'slf_preset_evidence_561.py' ] || [ "$file" = 'slf_tactical_lab_v1.py' ]; then
        rm -f "$EXPORT_DIR/$file"
      fi
    done
    [ -f "$BACKUP_DIR/requirements.txt" ] && "$VENV_PIP" install -r "$EXPORT_DIR/requirements.txt"
    rm -f "$EXPORT_DIR/DEPLOYED_GIT_COMMIT"

    PY_FILES="$EXPORT_DIR/slf_ai_export.py $EXPORT_DIR/slf_rag_build.py"
    [ -f "$EXPORT_DIR/slf_generator_update_rag.py" ] && PY_FILES="$PY_FILES $EXPORT_DIR/slf_generator_update_rag.py"
    [ -f "$EXPORT_DIR/slf_preset_evidence_561.py" ] && PY_FILES="$PY_FILES $EXPORT_DIR/slf_preset_evidence_561.py"
    [ -f "$EXPORT_DIR/slf_tactical_lab_v1.py" ] && PY_FILES="$PY_FILES $EXPORT_DIR/slf_tactical_lab_v1.py"
    "$VENV_PY" -m py_compile $PY_FILES
    if [ -f "$EXPORT_DIR/generator_updates.json" ]; then
      "$VENV_PY" -c 'import json,sys; p=json.load(open(sys.argv[1], encoding="utf-8")); assert p.get("schema") == "slf_generator_update_pack_v1"; assert p.get("rules")' "$EXPORT_DIR/generator_updates.json"
    fi
    bash -n "$EXPORT_DIR/run_daily_export.sh"
    (cd "$EXPORT_DIR" && ./run_daily_export.sh)
    [ -s /var/www/html/slf_ai/manifest.json ] || { echo 'manifest.json verification failed after rollback' >&2; exit 1; }
    [ -s /var/www/html/slf_ai/rag/catalog.json ] || { echo 'RAG catalog verification failed after rollback' >&2; exit 1; }
    if [ -f "$EXPORT_DIR/slf_generator_update_rag.py" ] && [ -f "$EXPORT_DIR/generator_updates.json" ]; then
      [ -s /var/www/html/slf_ai/rag/generator_update_pack.json ] || { echo 'generator update pack verification failed after rollback' >&2; exit 1; }
      [ -s /var/www/html/slf_ai/rag/generator_updates.jsonl ] || { echo 'generator updates verification failed after rollback' >&2; exit 1; }
    fi
    if [ -f "$EXPORT_DIR/slf_preset_evidence_561.py" ]; then
      [ -s /var/www/html/slf_ai/data/preset_evidence_561.json ] || { echo 'preset evidence verification failed after rollback' >&2; exit 1; }
    fi
    ;;

  *) echo "Unsupported component in backup manifest: ${component:-missing}" >&2; exit 1 ;;
esac

echo "Rollback complete: component=$component backup=$BACKUP_DIR"
