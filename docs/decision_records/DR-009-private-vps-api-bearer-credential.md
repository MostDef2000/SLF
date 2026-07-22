# DR-009 — Private VPS API bearer credential

Status: Accepted

Date: 2026-07-22

Decision: Treat `SLF_API_TOKEN` as a private shared bearer credential and keep its value outside version control.

Scope: Flask API authentication, systemd configuration, Tampermonkey-local token storage, rotation, and transport limitations.

Supersedes: DR-007

Related contracts: `contracts/SLF_GOVERNANCE.md`, `contracts/branches/server-api-operations.md`, `docs/architecture/slf-system-contract.md`

## Context

The Flask API uses one bearer value for GET and write-capable POST endpoints.
The value imported with the legacy VPS baseline was published in repository
history after DR-007 classified it as a public client key. Because possession
authorizes writes, that classification does not provide an acceptable boundary.

The userscript already supports entering the value through `SLF: Set API token`
and stores it in Tampermonkey-local storage. The credential therefore does not
need to be embedded in source or generated userscript artifacts.

## Decision

`SLF_API_TOKEN` is a private shared bearer credential:

- the server reads it only from the process environment;
- systemd loads `/root/slf-server/slf_api.env`;
- the service fails closed when the value is absent or empty;
- the value must not appear in Git, generated artifacts, logs, chat, issues,
  pull requests, or deployment command history;
- clients store the value locally through the existing Tampermonkey menu;
- rotation generates a new value directly on the VPS and revokes the old value
  only after the server and intended clients have been verified.

The published old value remains in Git history. Rewriting repository history is
not required once rotation makes that value invalid.

## Limitations

This is a shared credential, not per-user identity or fine-grained
authorization. Anyone who obtains it receives the same API access, including
write access. Sensitive, destructive, administrative, or externally costly
capabilities require stronger authentication and authorization.

Plain HTTP can expose or modify the credential in transit. Moving the value out
of Git removes repository disclosure but does not solve transport security;
HTTPS remains separate required hardening.

## Deployment boundary

Repository merge alone does not rotate production. A separately approved VPS
deployment must create the replacement on the VPS, install the environment and
service configuration, restart and verify the API, update the local userscript
credential, and verify both reads and writes before the old value is considered
revoked.
