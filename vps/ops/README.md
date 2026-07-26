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

The script validates Python and shell syntax, backs up the current executable file set, installs dependencies and code, runs the existing daily wrapper, verifies non-empty public catalog files, and writes `DEPLOYED_GIT_COMMIT` only after the wrapper and catalog checks succeed.

`DEPLOYED_GIT_COMMIT` is therefore a completed-deployment marker, not an installation-started marker. A failed service, exporter, RAG, or Drive-sync verification must leave the marker unchanged or absent.

## Rollback

```bash
bash vps/ops/rollback-code.sh \
  --backup /var/backups/slf-code/<timestamp>-<component>-<commit>
```

Rollback verifies backup checksums, restores only the preserved code/dependency declarations, reruns component verification, and removes `DEPLOYED_GIT_COMMIT` because the pre-Git legacy revision may be unknown. It does not roll back live data.

## Evidence required to accept DR-008

Record without secrets:

- approved Git commit SHA;
- component deployed;
- backup directory and checksum result;
- syntax-validation result;
- service or exporter verification result;
- `DEPLOYED_GIT_COMMIT` content;
- authenticated API read/write verification result when API is deployed;
- rollback command and verification result;
- confirmation that live data, environment values, and credentials were unchanged.

DR-008 remains `Proposed` until one separately approved deployment and safe rollback are executed and verified on the VPS.
