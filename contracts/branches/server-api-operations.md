# Server/API Operations Contract

Status: Active

Owner: PM/Core Release

Runtime source: `vps/api/`

## Scope

This contract owns the source-controlled Flask API baseline and its direct Python dependencies.

Canonical repository paths:

```text
vps/api/server.py
vps/api/requirements.txt
vps/ops/slf-server.service
vps/ops/deploy-code.sh
vps/ops/rollback-code.sh
vps/ops/README.md
```

Current VPS paths:

```text
/root/slf-server/server.py
/root/slf-server/venv/
/root/slf-server/slf_api.env
/root/slf-server/data/
/root/slf-server/forum_faq/
/etc/systemd/system/slf-server.service
```

The repository owns code, dependency declarations, the service-unit baseline, and deployment tooling. The VPS remains authoritative for live data and environment values. `slf_api.env`, JSON data, forum content, virtual environments, logs, and backups must not be committed.

`SLF_API_TOKEN` is a credential. The server must read it from `/root/slf-server/slf_api.env` through the systemd `EnvironmentFile` directive and must fail to start when it is absent or empty. The value must never appear in repository source, generated artifacts, logs, chat, deployment command history, Issues, or pull requests.

## Deployment and rollback

Deployment remains manual and requires separate operational approval. The approved operator may use `vps/ops/deploy-code.sh` with an exact approved Git commit and component `api`. The script stages source from that commit, validates Python and systemd syntax, preserves the previous deployed code and service unit, records backup checksums, installs dependencies and files, writes non-secret `DEPLOYED_GIT_COMMIT`, restarts the service, and verifies the protected endpoint without transmitting a credential.

Authenticated read/write verification is still required as an operator step and must not expose the bearer value.

Credential rotation is a separate operational step: generate the replacement on the VPS, store it in `slf_api.env`, deploy compatible server/service code, restart and verify the service, update the Tampermonkey-local value through `SLF: Set API token`, and verify reads and writes. Never place the replacement value in Git or public task records.

Rollback may use `vps/ops/rollback-code.sh` with the exact backup directory created by deployment. It verifies checksums, restores code, dependency declarations, and the service unit, then restarts and verifies the service. Data rollback is separate and must never happen implicitly with code rollback.

No Git-backed deploy or rollback has been performed yet. Repository tooling alone does not establish production provenance; the exact deployed Git revision remains unknown until separately approved operational verification succeeds.
