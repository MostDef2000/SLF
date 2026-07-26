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
vps/ops/deploy-code.sh
vps/ops/rollback-code.sh
vps/ops/README.md
```

Current VPS directory:

```text
/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/
```

The repository owns executable source, dependency declarations, and deployment tooling. The VPS remains authoritative for live input data, environment values, rclone credentials, cron configuration, and generated output under `/var/www/html/slf_ai/`. None of those runtime artifacts belong in Git.

## Deployment and rollback

Deployment remains manual and requires separate operational approval. The approved operator may use `vps/ops/deploy-code.sh` with an exact approved Git commit and component `exporter-rag`. The script stages files from that commit, validates Python and shell syntax, preserves the previous executable file set, records backup checksums, installs dependencies and files, writes non-secret `DEPLOYED_GIT_COMMIT`, runs the existing export/RAG wrapper, and verifies public catalog artifacts.

Rollback may use `vps/ops/rollback-code.sh` with the exact backup directory created by deployment. It verifies checksums, restores only the preserved executable code and dependency declarations, reruns the workflow, and verifies the public catalogs. Generated export can be rebuilt; rollback must not delete or overwrite primary API data.

Cron state, rclone credentials, environment values, live inputs, and generated primary data are outside the scripts' write scope.

No Git-backed deploy or rollback has been performed yet. Repository tooling alone does not establish production provenance; the exact deployed Git revision remains unknown until separately approved operational verification succeeds.
