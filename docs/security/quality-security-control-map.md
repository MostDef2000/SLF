# SLF Quality and Security Control Map

## Purpose

This document maps engineering controls to evidence expected before release.

## Secure development lifecycle

| Area | Evidence |
| --- | --- |
| Requirement control | documented behaviour and risks |
| Secure design | threat and boundary review |
| Implementation control | reviewed code and tests |
| Verification | automated and human-reviewed checks |
| Release integrity | artifact provenance |
| Deployment assurance | revision and health verification |

## Application security controls

### Authentication and authorization

Evidence:

- negative authentication tests;
- permission boundary tests;
- no secret disclosure in errors or logs.

### Input validation

Evidence:

- malformed JSON tests;
- invalid collection tests;
- path traversal tests;
- oversized input handling.

### Output safety

Evidence:

- DOM injection tests;
- HTML escaping checks;
- stored-data poisoning tests.

### API security

Evidence:

- unauthorized access rejection;
- schema validation;
- deterministic identity checks;
- concurrency tests.

### Client security

Evidence:

- userscript grant review;
- external request boundary review;
- browser fixture tests.

## Release security controls

Evidence:

- deterministic build;
- artifact digest;
- version consistency;
- provenance metadata;
- exact artifact execution test.

## Workflow security controls

Evidence:

- least privilege permissions;
- pinned third-party actions;
- secret scanning;
- dependency scanning;
- no production debug export.

## Exceptions

Any missing control requires:

- documented reason;
- affected risk;
- owner;
- expiry or follow-up action.
