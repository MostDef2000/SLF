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

The repository owns code and the service-unit baseline. The VPS remains authoritative for live data and environment values. `slf_api.env`, JSON data, forum content, virtual environments, logs, and backups must not be committed.

`SLF_API_TOKEN` is a credential. The server must read it from
`/root/slf-server/slf_api.env` through the systemd `EnvironmentFile` directive
and must fail to start when it is absent or empty. The value must never appear
in repository source, generated artifacts, logs, chat, or deployment command
history.

## Deployment and rollback

Deployment is currently manual and requires separate operational approval. Before replacing files, preserve the previous deployed code and service unit together. Install `vps/api/requirements.txt` in the API virtual environment, validate Python syntax, install the files at the mapped VPS paths, restart `slf-server.service`, and verify the existing API behavior.

Credential rotation is a separate operational step: generate the replacement
on the VPS, store it in `slf_api.env`, deploy the compatible server and service
unit, restart and verify the service, update the Tampermonkey-local value via
`SLF: Set API token`, and verify both reads and writes. Never place the
replacement value in Git or share it in an issue or pull request.

Rollback restores the preserved code and service unit, then restarts and verifies the service. Data rollback is separate and must never happen implicitly with code rollback.

No Git-backed deploy or rollback has been performed yet. Until one is verified, the exact deployed Git revision remains unknown.
