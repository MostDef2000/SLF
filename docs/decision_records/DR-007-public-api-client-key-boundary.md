# DR-007 — Public API client-key boundary

Status: Superseded by DR-009
Date: 2026-07-20
Decision: Treat the current SLF API token as a public client key, not a secret credential.
Scope: SLF client/server API boundary, future sensitive endpoints, transport risk, and security documentation.
Consequences: Key-only endpoints are effectively public; sensitive capabilities require separate real authentication and authorization.
Related contracts: `contracts/SLF_GOVERNANCE.md`, `docs/architecture/slf-system-contract.md`

> **HISTORICAL RECORD ONLY — DO NOT APPLY.**
> DR-009 is authoritative. The deployed bearer credential protects write-capable
> endpoints and must not be published, embedded in source, logged, pasted into
> chat, or treated as a public client key.

> Superseded on 2026-07-22. The deployed bearer value protects write-capable
> endpoints and must not be published as a public client key. DR-009 defines
> the replacement credential boundary and rotation model.

## Context

The current SLF client must possess the API token in order to call the server. A value distributed to arbitrary userscript clients cannot provide secret-based authentication, even if it is named a token or is also stored in server configuration.

Treating the current value as a secret creates misleading incident responses such as rotation, removal from client artifacts, or Tampermonkey-only storage without creating a real security boundary.

## Decision

For the current SLF threat model, the API token is a **public client key**.

It may be embedded in userscript and server source and may appear in repository source, generated runtime output, terminal output, or chat. Those appearances are explicitly accepted by the owner and are not credential compromise.

The public client key:

- may identify the expected SLF client population;
- may reject accidental requests that omit the key;
- must not be represented as strong authentication;
- must not protect capabilities that are unsafe for arbitrary callers.

Any endpoint protected only by this key is effectively publicly callable.

Separate real authentication and authorization are mandatory before introducing:

- private data;
- destructive or administrative operations;
- material external cost;
- any capability the owner does not intend to expose to arbitrary callers.

## Independent risks

Plain HTTP is an independent transport confidentiality and integrity risk. Traffic may be observed or modified in transit. The owner currently accepts that risk; future HTTPS work is tracked independently and is not public-client-key compromise remediation.

Production debug capabilities are an independent hardening concern tracked by GitHub Issue #68. Debug-surface restrictions must not be framed as token rotation or secrecy work.

## Consequences

- No rotation of the current client key is required solely because it appeared in client/server source, repository content, generated output, terminal output, or chat.
- Protected environment storage is not required solely to conceal the current key.
- Removing the key from userscript source or generated releases is not required.
- Tampermonkey-only key storage is not required.
- Prior exposure is not treated as a security incident.
- Future sensitive endpoints must introduce a separate real identity and authorization model.
- API schema, collection data, runtime behavior, and deployment are unchanged by this documentation decision.

## Supersession

This record supersedes the earlier DR-004 API token handling entry wherever that entry treats the current client key as a secret credential or requires secrecy-based remediation.

## Related work

- GitHub Issue #67 — canonical public client-key boundary.
- GitHub Issue #68 — independent production debug-capability hardening.
- GitHub Issue #69 — independent HTTP status and API error contract.
- GitHub Issue #71 — independent VPS source, deployment, and rollback ownership.
