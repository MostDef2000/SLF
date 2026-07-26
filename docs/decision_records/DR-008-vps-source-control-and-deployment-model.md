# DR-008 — VPS source-control and deployment model

Status: Proposed

Date: 2026-07-22

Decision: Store the deployable VPS code baseline in this repository while keeping live data and operational configuration on the VPS.

Scope: Flask API, exporter/RAG pipeline, service-unit baseline, dependencies, manual deployment, provenance, and rollback boundaries.

Related contracts: `contracts/branches/server-api-operations.md`, `contracts/branches/knowledge-export-rag.md`, `docs/architecture/slf-system-contract.md`, `vps/ops/README.md`

## Context

The active API and exporter/RAG files were deployed directly on the VPS and were not backed by a Git repository. A read-only inventory verified the live files by SHA-256 and recorded the two Python environments, but no Git commit can yet be identified as the deployed revision.

## Proposed decision

`MostDef2000/SLF` is the canonical repository for deployable VPS code:

```text
vps/api/            Flask API and direct dependencies
vps/exporter-rag/   exporter, RAG builder, wrapper, filter, and direct dependencies
vps/ops/            service baseline plus deployment/rollback tooling
```

The imported files are a `legacy pre-git baseline`. Git owns deployable code and operational scripts. The VPS remains authoritative for live JSON data, forum content, environment values, virtual environments, cron state, rclone credentials, logs, backups, and generated export artifacts.

Deployment and rollback remain manual and require separate operational approval. Repository scripts require an exact Git commit, preserve the previous code before replacement, write non-secret deployed-commit provenance, and verify the affected service or export workflow afterward. Code rollback must not implicitly roll back live data.

## Repository tooling

The repository contains:

- `vps/ops/deploy-code.sh` for commit-pinned API or exporter/RAG code deployment;
- `vps/ops/rollback-code.sh` for checksum-verified code-only rollback;
- `vps/ops/README.md` for approval boundaries, commands, exclusions, and evidence requirements.

Tooling availability is not evidence that it has been executed successfully on production.

## Current evidence

- API runtime baseline: Python `3.12.3`, Flask `3.1.3`, Flask-CORS `6.0.2`.
- Exporter runtime baseline: Python `3.12.3`, Requests `2.34.2`.
- Both inventoried runtime environments passed `pip check` at audit time.
- Imported executable files matched the SHA-256 values recorded by the VPS audit.
- At audit time, `slf-server.service` was active and the daily export was scheduled by root cron.
- Repository-side deployment and rollback tooling now exists.
- No Git-backed production deployment or verified code rollback has been performed.

## Acceptance condition

This record remains `Proposed` until a separately approved operational run establishes all of the following without exposing credentials:

1. an exact deployed Git commit for at least one component;
2. a preserved pre-deployment code backup with valid checksums;
3. successful syntax and component verification after deployment;
4. authenticated read/write verification when the API component is deployed;
5. successful code-only rollback and post-rollback verification;
6. evidence that live data, environment values, credentials, cron state, and rclone configuration were not modified implicitly.

Repository merge alone does not establish production provenance.

## Consequences

- VPS source changes can be reviewed in Git without changing the userscript release.
- Deployments can be tied to an exact commit while keeping credentials out of Git and command history.
- Rollback operates on code and dependency declarations, not live data.
- Secrets, environment values, live data, and generated artifacts remain outside Git.
- Runtime behavior is unchanged until separately approved operational execution occurs.
- DR-008 remains Proposed until deployment and rollback evidence satisfies the acceptance condition.
