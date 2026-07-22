# Knowledge Export/RAG Contract

Status: Active

Owner: PM/Core Release

Runtime source: `vps/exporter-rag/`

## Scope

This contract owns the source-controlled exporter, RAG builder, daily wrapper, Drive filter, and their direct Python dependencies.

Canonical repository paths:

```text
vps/exporter-rag/slf_ai_export.py
vps/exporter-rag/slf_rag_build.py
vps/exporter-rag/run_daily_export.sh
vps/exporter-rag/slf_drive_filter.txt
vps/exporter-rag/requirements.txt
```

Current VPS directory:

```text
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/
```

The repository owns executable source and dependency declarations. The VPS remains authoritative for live input data, environment values, rclone credentials, cron configuration, and generated output under `/var/www/html/slf_ai/`. None of those runtime artifacts belong in Git.

## Deployment and rollback

Deployment is currently manual and requires separate operational approval. Before replacing files, preserve the previous exporter/RAG files together. Install `vps/exporter-rag/requirements.txt` in the exporter virtual environment, validate Python and shell syntax, install the files in the current VPS directory, run the export/RAG workflow, and verify the public manifest.

Rollback restores the preserved file set and reruns verification. Generated export can be rebuilt; rollback must not delete or overwrite primary API data.

No Git-backed deploy or rollback has been performed yet. Until one is verified, the exact deployed Git revision remains unknown.
