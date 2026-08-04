# Release and deployment evidence

This stage separates repository release evidence from production deployment evidence.

## Repository release evidence

CI must prove that:

- `tools/build-latest-userscript.mjs` reproduces the checked-in latest-only release artifacts byte-for-byte;
- release provenance validates against the approved source revision and approved file scope;
- the exact userscript, metadata, version manifest, changelog, bundle manifest, build tools, all source modules, and deployable VPS files have recorded SHA-256 digests;
- a direct-dependency SPDX 2.3 SBOM is generated;
- the evidence bundle has its own `SHA256SUMS` file;
- no deployment or production verification is falsely claimed.

The CI bundle contains:

- `release-evidence.json` using schema `slf_release_evidence_v1`;
- `sbom.spdx.json` using SPDX 2.3;
- `SHA256SUMS` covering both generated evidence files.

The SBOM currently records direct declared dependencies and userscript `@require` URLs. It does not claim complete transitive dependency resolution.

## Deterministic rebuild rule

The workflow records current release-file hashes, runs the canonical builder with the approved provenance already stored in `data/version.json`, and verifies that all release files remain byte-for-byte identical.

A rebuild after testing invalidates prior evidence. The rebuilt bytes must pass the complete gate again.

## Deployment evidence boundary

Repository CI does not deploy the VPS and cannot prove the VPS state.

An approved API deployment remains incomplete until `vps/ops/verify_api_deployment.py` verifies:

- exact `DEPLOYED_GIT_COMMIT` marker;
- unauthenticated analysis returns HTTP 401;
- authenticated analysis returns `status: ok`;
- canonical tactical collections exist, are valid, and return JSON arrays;
- bounded health counters are captured without raw records;
- an optional isolated `ops_` canary can be written and read back;
- evidence is atomically written with mode `0600` and contains no token.

The deployment verifier's contract is exercised in CI against an isolated local HTTP fixture. This validates the verifier itself; it is not production deployment evidence.

## Rollback evidence

`vps/ops/deploy-code.sh` and `vps/ops/rollback-code.sh` remain manual, separately approved operational tools. CI checks shell syntax and required safety markers:

- exact commit resolution;
- pre-replacement backup;
- SHA-256 backup manifest;
- service or exporter verification before writing `DEPLOYED_GIT_COMMIT`;
- checksum verification before rollback;
- removal of `DEPLOYED_GIT_COMMIT` during rollback;
- code-only scope that excludes live data and secrets.

A real rollback claim requires separately captured VPS evidence. Syntax checks and fixture tests do not replace that operational exercise.

## Secret handling

Release evidence must not include bearer tokens, environment values, credentials, private keys, raw tactical records, or live VPS paths beyond documented non-secret marker and tool paths.

The API token is accepted only from `SLF_API_TOKEN` by the deployment verifier. It is never accepted as a command-line argument or written into the evidence payload.
