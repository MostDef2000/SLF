# SLF VPS code deployment and rollback

Status: repository tooling only
Operational execution: requires separate explicit approval

## Boundary

These scripts deploy or restore source-controlled code only. They do not copy,
read, print, rotate, replace, or delete:

- `slf_api.env` or credential values;
- API JSON data or forum content;
- virtual environments as directories;
- cron configuration or rclone credentials;
- logs, backups outside the selected code backup, or generated primary data.

A repository merge does not deploy the VPS.

## Prerequisites

- Run as `root` on the VPS.
- Use a local Git checkout of `MostDef2000/SLF` containing the exact approved commit.
- Confirm the affected component and commit SHA before execution.
- Obtain separate operational approval for deploy, service restart, exporter run, and rollback verification.

## Deploy API code

```bash
bash vps/ops/deploy-code.sh \
  --repo /path/to/SLF \
  --commit <full-approved-commit-sha> \
  --component api
```

The script:

1. resolves and verifies the exact Git commit;
2. stages `vps/api/server.py`, requirements, and the systemd unit from that commit;
3. validates Python and systemd syntax;
4. backs up the currently deployed code and service unit under `/var/backups/slf-code/`;
5. records checksums before replacement;
6. installs dependencies and files;
7. restarts the service;
8. verifies that the service is active and the protected endpoint returns `401` without credentials;
9. writes `/root/slf-server/DEPLOYED_GIT_COMMIT` only after verification succeeds.

Authenticated read/write verification remains a separate operator check. Never put the bearer value in the command line, logs, Issue, PR, or chat.

## Deploy exporter/RAG code

```bash
bash vps/ops/deploy-code.sh \
  --repo /path/to/SLF \
  --commit <full-approved-commit-sha> \
  --component exporter-rag
```

The exporter/RAG source-controlled set includes:

- `slf_ai_export.py`;
- `slf_rag_build.py`;
- `slf_generator_update_rag.py`;
- `generator_updates.json`;
- `run_daily_export.sh`;
- `slf_drive_filter.txt`;
- `requirements.txt`.

`generator_updates.json` is the versioned source-of-truth for generator mechanics and temporal balance context. `slf_generator_update_rag.py` validates that source after the base RAG build and publishes it into:

- `rag/generator_update_pack.json`;
- `rag/generator_updates.jsonl`;
- `rag/search_index.json`;
- `rag/catalog.json`;
- `tactics/knowledge-pack.latest.json` as a backward-compatible `generatorContext` section;
- `ai_context.md`.

The source metadata must distinguish verified URLs from user-supplied official changelog text. Missing public provenance must remain explicit, for example `verificationStatus: pending_source_url`; it must not be silently upgraded to verified.

The deployment script validates Python, shell, and generator-pack JSON syntax, backs up the current executable/source file set, installs dependencies and code, runs the existing daily wrapper, verifies non-empty `/var/www/html/slf_ai/manifest.json`, `/var/www/html/slf_ai/rag/catalog.json`, `/var/www/html/slf_ai/rag/generator_update_pack.json`, and `/var/www/html/slf_ai/rag/generator_updates.jsonl`, then confirms that the catalog reports generator version `5.61` before writing `DEPLOYED_GIT_COMMIT`.

`DEPLOYED_GIT_COMMIT` is therefore a completed-deployment marker, not an installation-started marker. A failed service, exporter, RAG, generator-context, Drive-sync, manifest, or catalog verification must leave the marker unchanged or absent.

## Rollback

```bash
bash vps/ops/rollback-code.sh \
  --backup /var/backups/slf-code/<timestamp>-<component>-<commit>
```

Rollback verifies backup checksums, restores only the preserved code/dependency declarations, reruns component verification, and removes `DEPLOYED_GIT_COMMIT` because the pre-Git legacy revision may be unknown. Exporter rollback verifies the root `manifest.json` and `rag/catalog.json`; it does not require a root `catalog.json`. If the selected backup predates generator-context support, rollback removes the newly introduced `slf_generator_update_rag.py` and `generator_updates.json` source files before running the restored wrapper. It does not roll back live data.

## Evidence required for an exporter/RAG deployment

Record without secrets:

- approved Git commit SHA;
- component deployed;
- backup directory and checksum result;
- Python, shell, and generator-pack validation result;
- exporter and base RAG result;
- generator version, generator rule count, and runtime-safe rule count;
- `rag/catalog.json` generator context verification;
- Google Drive sync result;
- `DEPLOYED_GIT_COMMIT` content;
- rollback command and verification result when rollback is exercised;
- confirmation that live data, environment values, and credentials were unchanged.

## DR-008 evidence

DR-008 was accepted after a separately approved exporter/RAG deployment and rollback were executed and verified. Future API deployments still require authenticated read/write verification without exposing credentials.
