# DR-008 — VPS source-control and deployment model

Status: Proposed

Date: 2026-07-22

Decision: Store the deployable VPS code baseline in this repository while keeping live data and operational configuration on the VPS.

Scope: Flask API, exporter/RAG pipeline, service-unit baseline, dependencies, manual deployment, and rollback boundaries.

Related contracts: `contracts/branches/server-api-operations.md`, `contracts/branches/knowledge-export-rag.md`, `docs/architecture/slf-system-contract.md`

## Context

The active API and exporter/RAG files were deployed directly on the VPS and were not backed by a Git repository. A read-only inventory verified the live files by SHA-256 and recorded the two Python environments, but no Git commit can yet be identified as the deployed revision.

## Proposed decision

`MostDef2000/SLF` is the canonical repository for deployable VPS code:

```text
vps/api/            Flask API and direct dependencies
vps/exporter-rag/   exporter, RAG builder, wrapper, filter, and direct dependencies
vps/ops/            systemd unit baseline
```

The imported files are a `legacy pre-git baseline`. Git owns deployable code; the VPS remains authoritative for live JSON data, forum content, environment values, virtual environments, cron state, rclone credentials, logs, backups, and generated export artifacts.

Deployment and rollback remain manual and require separate operational approval. A deployment must preserve the previous code before replacement and verify the affected service or export workflow afterward. Code rollback must not implicitly roll back live data.

## Current evidence

- API runtime: Python `3.12.3`, Flask `3.1.3`, Flask-CORS `6.0.2`.
- Exporter runtime: Python `3.12.3`, Requests `2.34.2`.
- Both runtime environments pass `pip check`.
- Imported executable files match the SHA-256 values recorded by the VPS audit.
- `slf-server.service` is active; the daily export is scheduled by root cron.
- No Git-backed deployment or code rollback has been performed.

## Acceptance condition

This record remains Proposed until a separately approved deployment establishes an exact deployed commit and a safe rollback is verified. Repository import alone does not establish production provenance.

## Consequences

- VPS source changes can be reviewed in Git without changing the userscript release.
- Secrets, environment values, live data, and generated artifacts remain outside Git.
- Runtime behavior is unchanged by the baseline import.
- Health/version endpoints and automated deployment tooling are not introduced by this decision.
