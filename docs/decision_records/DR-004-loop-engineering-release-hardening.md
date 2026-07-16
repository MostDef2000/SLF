# DR-004 Loop Engineering Release Hardening

Status: Accepted
Date: 2026-07-16

## Decision

The SLF release lifecycle is a deterministic reconcile loop:

- a source commit and the previous published release commit define the release input;
- `src/app/bundle-order.json` is the only bundle assembly source;
- generated release files are workflow-owned outputs;
- provenance records exact commits and changed paths;
- release publication is serialized and protected from stale `main` writes;
- domain-specific validation is separate from generic assembly validation.

## Scope

Applies to the userscript builder, bundle-order validation, provenance validation, Team4 validation, and the GitHub Actions release workflow.

It does not change userscript runtime behavior, VPS or RAG architecture, or cache/schema/storage keys.

## Consequences

- identical inputs must produce identical release artifacts;
- unregistered source modules fail validation instead of being auto-discovered;
- malformed, wildcard, or incomplete provenance fails before publication;
- a newer `main` commit prevents an older queued release from publishing stale artifacts;
- rollback is performed by reverting source changes and allowing the workflow to publish a new patch release.

## Related contracts

- `SLF_GOVERNANCE.md`
- `SLF_AUTOMATIC_RELEASE_POLICY.md`
- `SLF_TASK_RUNTIME.md`
- `core-release.md`
