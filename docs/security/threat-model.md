# SLF threat model

## Scope

This threat model covers:

- the Tampermonkey userscript and its browser privileges;
- local token and manual-match state;
- the VPS Flask API and JSON collections;
- GitHub Actions and generated release artifacts;
- external runtime and data dependencies.

It does not claim complete penetration-test coverage. It records trust boundaries, protected assets, existing controls, known gaps, and required verification evidence.

## Protected assets

| Asset | Security objective |
| --- | --- |
| VPS API bearer token | confidentiality; never written to URL, logs, errors, repository, or UI |
| tactical telemetry | integrity, deduplication, correct game ownership, schema consistency |
| tactics and presets | integrity and controlled modification |
| manual-match state | same-game isolation, one-way legacy migration, recoverable retries |
| generated userscript | provenance, deterministic assembly, no top-level bootstrap failure |
| VPS collection files | path confinement, atomic writes, corruption detection, concurrency safety |
| GitHub workflows | least privilege, pinned actions, no untrusted privileged execution |

## Trust boundaries

### Browser page to userscript

The SLF page DOM is untrusted input. Team names, match text, transfer data, developer hints, scores, URLs, and stored browser values may be malformed or attacker-controlled.

Controls:

- page and ownership guards;
- bounded manual watcher installation;
- typed parsing and normalized records;
- no dynamic JavaScript evaluation;
- explicit Tampermonkey grants and connection allowlist.

Required future evidence:

- sanitised browser fixtures;
- DOM XSS tests for all dynamic render paths;
- repeated-mutation tests for duplicate panels and listeners.

### Userscript to VPS API

The network request boundary uses HTTPS and a bearer token in the `Authorization` header.

Controls:

- token stored through Tampermonkey value storage;
- token omitted from URLs;
- API error metadata redacts token text;
- server compares authorization with `hmac.compare_digest`;
- collection names are restricted by an allowlist regular expression.

Known gaps:

- one shared bearer token has no per-client identity or rotation protocol;
- no rate limiting.

### VPS API to filesystem

Collection names and record payloads cross into persistent JSON files.

Controls:

- collection-name validation;
- collection-scoped reentrant locks;
- temporary-file writes;
- file and directory `fsync`;
- atomic `os.replace`;
- corruption detection with non-detailed client errors;
- duplicate filtering for known identity fields.

Known gaps:

- no explicit symlink policy for the data directory;
- no storage quota;
- no transaction spanning multiple collections.

### Repository to GitHub Actions

Pull-request content executes on hosted runners.

Controls:

- workflows declare explicit permissions;
- actions are pinned to full commit SHAs;
- `pull_request_target` is prohibited;
- downloaded content must not be piped directly into a shell;
- release and contract checks run against the PR merge ref.

Known gaps:

- Python transitive dependencies are version-constrained only indirectly;
- no generated SBOM yet;
- no signed build provenance yet;
- branch protection enforcement remains a later stage.

### External userscript dependency

The userscript loads jQuery from the repository release branch using a content-pinned vendored copy.

Controls:

- jQuery 3.6.0 is vendored at `vendor/jquery-3.6.0.min.js` with its MIT license;
- the `@require` URL points to the repository release branch, not an external CDN;
- the vendored digest is pinned in the merge-blocking security boundary test;
- the `@require` allowlist is merge-blocking.

## Threat catalogue

| Threat | Current control | Verification |
| --- | --- | --- |
| token in query string | Authorization header contract | static security boundary test |
| token disclosed in errors | redaction helper and safe response metadata | static marker checks and adversarial response checks |
| path traversal | collection regex | direct validation and encoded traversal tests |
| malformed JSON | silent parser plus explicit 400 response | adversarial API test |
| corrupt collection | typed exception and generic 500 response | adversarial API test |
| concurrent lost update | collection lock and atomic save | multi-threaded append test |
| duplicate tactical record | identity-key filtering | concurrent duplicate test |
| missing tactical identity | fail-closed 400 rejection before persistence | API unit tests and contract compatibility test |
| workflow supply-chain substitution | full-SHA action pins | workflow scan |
| privileged untrusted PR execution | prohibition of `pull_request_target` | workflow scan |
| committed secret | repository pattern scan | security boundary test |
| dynamic code execution | ban on eval/new Function/string timers | source scan |
| DOM XSS | all innerHTML sinks classified; untrusted paths escaped | sink inventory and malicious-string browser fixtures |
| oversized request DoS | 1 MiB request-body limit with JSON 413 | API unit test |
| API brute force | not implemented | deployment/rate-limit follow-up |

## Risk acceptance rules

A known security gap must include:

- an owner;
- affected boundary and assets;
- exploit consequence;
- temporary compensating control;
- target stage or review date;
- evidence required to close it.

High-severity findings block merge unless explicitly accepted by a human owner. Test changes that weaken a security invariant require the same review as production security code.

## Stage 3 follow-up enforcement

The production-behaviour security change (QR-001..QR-005, 2026-08-17) is implemented in source and covered by tests:

1. rejection of tactical records missing the configured identity field before persistence (fail-closed 400);
2. a bounded request-body limit (1 MiB, JSON 413);
3. explicit CORS origins (SLF domains only);
4. negative tests for each rejected path;
5. vendored content-pinned jQuery with a merge-blocking digest;
6. sink-complete innerHTML classification with malicious-string browser fixtures.

The VPS API deployment of items 1-3 remains a separate operational boundary: it requires an explicit owner action running `vps/ops/deploy-code.sh` and `vps/ops/verify_api_deployment.py` against the production host, with deployment compatibility evidence showing all active clients emit identity keys.
