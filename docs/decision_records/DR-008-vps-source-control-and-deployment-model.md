# DR-008 — VPS source-control and deployment model

Status: Accepted

Date: 2026-07-22

Accepted: 2026-07-26

Decision: Store the deployable VPS code baseline in this repository while keeping live data and operational configuration on the VPS.

Scope: Flask API, exporter/RAG pipeline, service-unit baseline, dependencies, manual deployment, provenance, and rollback boundaries.

Related contracts: `contracts/branches/server-api-operations.md`, `contracts/branches/knowledge-export-rag.md`, `docs/architecture/slf-system-contract.md`, `vps/ops/README.md`

## Context

The active API and exporter/RAG files were originally deployed directly on the VPS and were not backed by a Git repository. A read-only inventory verified the live files by SHA-256 and recorded the two Python environments, but no Git commit could initially be identified as the deployed revision.

## Decision

`MostDef2000/SLF` is the canonical repository for deployable VPS code:

```text
vps/api/            Flask API and direct dependencies
vps/exporter-rag/   exporter, RAG builder, wrapper, filter, and direct dependencies
vps/ops/            service baseline plus deployment/rollback tooling
```

The imported files are a `legacy pre-git baseline`. Git owns deployable code and operational scripts. The VPS remains authoritative for live JSON data, forum content, environment values, virtual environments, cron state, rclone credentials, logs, backups, and generated export artifacts.

Deployment and rollback remain manual and require separate operational approval. Repository scripts require an exact Git commit, preserve the previous code before replacement, write non-secret deployed-commit provenance only after verification succeeds, and verify the affected service or export workflow afterward. Code rollback does not implicitly roll back live data.

## Repository tooling

The repository contains:

- `vps/ops/deploy-code.sh` for commit-pinned API or exporter/RAG code deployment;
- `vps/ops/rollback-code.sh` for checksum-verified code-only rollback;
- `vps/ops/README.md` for approval boundaries, commands, exclusions, and evidence requirements.

## Acceptance evidence

A separately approved production run on 2026-07-26 satisfied the acceptance condition for the `exporter-rag` component.

- Final deployed commit: `59aa4cef4c5278bade2fb8a4dd7986bb2a91e7a7`.
- Pre-deployment rollback backup: `/var/backups/slf-code/20260726T094322Z-exporter-rag-f4edd74753a6c866c8ccbd8d35445b36db55f623`.
- Final deployment backup: `/var/backups/slf-code/20260726T100454Z-exporter-rag-59aa4cef4c5278bade2fb8a4dd7986bb2a91e7a7`.
- Both backup manifests passed `sha256sum --check` for the preserved source-controlled files.
- Deployment and rollback scripts passed shell syntax validation before execution.
- The code-only rollback restored the preserved exporter/RAG files, reinstalled the preserved dependency declaration, removed `DEPLOYED_GIT_COMMIT`, reran the exporter/RAG workflow, and completed successfully.
- During rollback, Google Drive returned a transient per-minute quota error on the first attempt; rclone retried automatically and the second attempt succeeded. The rollback completed normally after the recovered retry.
- The final deployment completed exporter generation, RAG generation, and Google Drive synchronization.
- `/var/www/html/slf_ai/manifest.json` and `/var/www/html/slf_ai/rag/catalog.json` were non-empty after final deployment.
- `/opt/slf_ai_exporter_v2/slf_ai_exporter_v2/DEPLOYED_GIT_COMMIT` contains the exact final deployed commit.
- No deployment, rollback, exporter, or rclone process remained active after completion.
- The operation did not replace or expose environment values, credentials, rclone configuration, cron state, live primary data, or virtual-environment directories.

The operational result was recorded as `DR008_RESULT=PASS`.

## Acceptance condition

The acceptance condition is satisfied for the deployment model because the approved operational run established:

1. an exact deployed Git commit for the exporter/RAG component;
2. preserved pre-deployment and final code backups with valid checksums;
3. successful syntax and component verification after deployment;
4. successful code-only rollback and post-rollback verification;
5. final redeployment with verified output artifacts and provenance marker;
6. evidence that live data, environment values, credentials, cron state, and rclone configuration were not modified implicitly.

Authenticated API read/write verification was not required because the API component was not deployed in this acceptance run.

## Consequences

- VPS source changes can be reviewed in Git without changing the userscript release.
- Deployments can be tied to an exact commit while keeping credentials out of Git and command history.
- `DEPLOYED_GIT_COMMIT` represents a completed and verified deployment, not merely an installation attempt.
- Rollback operates on code and dependency declarations, not live data.
- Secrets, environment values, live data, and generated artifacts remain outside Git.
- Future API deployments still require their own authenticated read/write verification under the existing operational boundary.
