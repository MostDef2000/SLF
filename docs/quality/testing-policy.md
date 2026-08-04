# SLF Testing and Release Quality Policy

## Purpose

This policy defines the minimum engineering evidence required before SLF code may be merged, released, or deployed. The objective is not to claim that software is defect-free. The objective is to make regressions, security defects, supply-chain errors, and deployment mistakes materially harder to introduce and easier to detect.

The policy applies to userscript source, generated release artifacts, VPS API code, deployment automation, GitHub Actions, schemas, storage migrations, and release metadata.

## Reference models

SLF uses the following industry references as control catalogues:

- NIST Secure Software Development Framework (SSDF) for secure development lifecycle controls.
- OWASP ASVS for application and API security requirements.
- OWASP Web Security Testing Guide for negative and adversarial testing.
- SLSA for build provenance and release-artifact integrity.
- OpenSSF Scorecard for repository and workflow security hygiene.

These references do not imply formal certification. Each applicable control must be mapped to repository evidence, an automated check, a reviewed procedure, or an explicit risk acceptance.

## Independence rule

The implementation author must not be the only person defining acceptance criteria, writing the critical tests, and approving the change.

For security-sensitive, storage, API, release, deployment, authentication, and migration changes:

1. expected behaviour and failure behaviour must be documented before merge;
2. tests must verify the behavioural contract rather than implementation details;
3. at least one reviewer who did not author the implementation must review the test design;
4. unresolved security findings require documented risk acceptance;
5. the exact release artifact must be tested, not only source modules.

AI-generated tests are permitted only as drafts. A human reviewer remains accountable for the test oracle, boundary cases, negative cases, and production relevance of mocks and fixtures.

## Required test layers

### Unit tests

Unit tests cover pure functions, deterministic identities, parsers, migrations, deduplication, tactic differences, generation windows, collection validation, and secret-redaction helpers.

A unit-test name must describe the protected contract, for example:

- `effect retry preserves the original event identity`
- `legacy state migration writes only the active storage key`
- `finished match guard rejects live snapshots`

Tests named only after a function or method are insufficient when they do not state expected behaviour.

### Property and invariant tests

Critical invariants must be checked over generated input ranges where practical. Priority invariants include:

- identical logical records produce identical unique keys;
- retry metadata does not change record identity;
- different games do not share record identity;
- migration does not write to legacy storage;
- duplicate append does not increase a collection;
- invalid collection names cannot escape the configured data directory;
- secrets do not appear in logs, URLs, exceptions, or responses.

### Contract tests

Every persisted or transmitted record type must have a versioned contract. At minimum this includes:

- match snapshots;
- match results;
- preset events;
- preset effects;
- manual-match state;
- append API responses;
- analysis API responses;
- release version manifests.

Contract tests must cover required fields, types, enum values, schema version, unique-key semantics, malformed payload rejection, backward compatibility, and migration requirements.

### Integration tests

Integration tests must use real internal components and mock only external boundaries. Internal methods that do not exist in production must not be added to a test harness merely to make a test pass.

Mandatory integration paths include:

- source modules to assembled userscript;
- userscript bootstrap to UI mount;
- manual hint to snapshot append;
- preset application to pending event persistence;
- next generation window to deterministic effect append;
- network failure to recoverable retry;
- finished match to final result only;
- API unavailability without loss of UI bootstrap;
- legacy state to active-state migration.

### Exact-artifact tests

The file that is published or deployed is the test subject. For the Tampermonkey release this means `releases/latest.user.js`.

The minimum exact-artifact gate must verify:

- JavaScript syntax is valid;
- version metadata agrees across `data/version.json`, `latest.meta.js`, and `latest.user.js`;
- every file in `src/app/bundle-order.json` appears exactly once and in order;
- `App.start()` occurs exactly once after all bundled source modules;
- the final runtime version export occurs after bootstrap;
- removed legacy runtime capabilities remain absent;
- generated artifact provenance fields are structurally valid.

A later browser-execution gate must execute the exact artifact in a controlled browser fixture and fail on any uncaught top-level exception before UI mount.

### Browser end-to-end tests

Sanitised, versioned fixtures must cover owned live matches, foreign matches, finished matches, incomplete DOM, tactic pages, transfer pages, API failure, corrupt active storage, and valid legacy storage.

The browser suite must check duplicate UI prevention, one active tactic watcher, snapshot deduplication, deterministic effect retry, finished-match boundaries, and UI availability when the API is unavailable.

### Security tests

Every pull request must run applicable static analysis, secret scanning, dependency scanning, workflow-permission validation, dangerous DOM-sink checks, and production-debug boundary checks.

API negative tests must include authentication failure, malformed input, path traversal, oversized payloads, unexpected methods, corrupt collection files, concurrent append, duplicate append, missing unique keys, partial-write recovery, and secret leakage.

Browser security tests must include DOM XSS, stored-data poisoning, unsafe HTML rendering, URL injection, overbroad userscript grants, cross-domain request boundaries, and token disclosure.

### Fuzz, mutation, and reliability tests

Parsers, API payloads, local-storage envelopes, tactic objects, and money/date parsers should receive malformed, unexpected, Unicode, oversized, missing-field, and wrong-type inputs.

Mutation tests are required for critical guards such as authentication, result status, deterministic keys, duplicate filtering, retry restoration, migration direction, release provenance, and bootstrap order.

Reliability checks must bound timers, observers, memory growth, userscript evaluation time, artifact size, API concurrency behaviour, and recovery from interrupted writes.

## Pull-request quality gate

Merge is blocked until all applicable checks succeed:

- syntax and lint checks;
- unit and invariant tests;
- contract tests;
- integration tests;
- exact-artifact boundary test;
- schema validation;
- static security analysis;
- secret and dependency scans;
- GitHub Actions security validation;
- deterministic build comparison;
- changed-code coverage requirements.

A test failure may not be bypassed by weakening or deleting the assertion unless the behavioural contract was intentionally changed and independently approved.

## Review requirements

Normal changes require at least one approval.

Changes affecting authentication, API persistence, storage, migrations, release generation, deployment, security controls, or GitHub Actions require two approvals where repository settings permit it. At least one approver must not be the implementation author.

Emergency hotfixes still require:

- the smallest viable change;
- a failing regression test reproduced against the prior behaviour;
- a documented risk assessment;
- exact-artifact verification;
- follow-up independent review.

## Release gate

A release candidate must provide:

- fixed source commit;
- deterministic build output;
- exact-artifact test evidence;
- full integration and browser evidence applicable to the change;
- security findings resolved or formally accepted;
- artifact digest;
- build provenance;
- generated SBOM when dependencies exist;
- rollback procedure and rollback verification;
- release notes identifying behavioural, schema, storage, and compatibility effects.

Only tested bytes may be published. Rebuilding after tests requires the rebuilt artifact to be tested again.

## Deployment gate

Before production activation, deployment automation must verify the exact commit or artifact digest, configuration validity, secret presence without disclosure, process health, authenticated and unauthenticated API behaviour, canonical collections, and rollback availability.

After activation, deployment evidence must include deployed revision, runtime version, health status, error-log review, duplicate and missing-key counters, and a smoke test of the changed path.

Deployment is incomplete until post-deploy verification succeeds.

## Coverage policy

A single line-coverage percentage is not accepted as proof of quality. SLF uses:

- a coverage ratchet that must not decrease without justification;
- changed-code coverage;
- branch coverage for guards and failure paths;
- explicit invariant-to-test mapping;
- mutation score for critical modules;
- scenario coverage for user-visible workflows.

Coverage exclusions must be reviewed and documented.

## Production-defect procedure

Every production defect must result in permanent regression evidence:

1. reproduce the defect with a failing test;
2. demonstrate that the test fails against the affected revision;
3. implement the minimal correction;
4. demonstrate that the test passes;
5. add adjacent negative and boundary cases;
6. test the exact generated artifact;
7. retain the regression test permanently unless the underlying feature is removed.

## Definition of done

A change is not complete without:

- documented requirement and risk classification;
- reviewed tests and negative cases;
- successful mandatory CI checks;
- exact-artifact evidence when release output can change;
- security findings resolved or accepted;
- release provenance when publishing;
- rollback path when deploying;
- post-deploy evidence when production is changed.
