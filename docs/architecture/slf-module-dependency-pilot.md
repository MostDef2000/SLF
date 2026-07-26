# SLF module dependency audit

Status: Complete
Current coverage: 55 of 55 registered userscript modules
Runtime behavior impact: None

## Purpose

`src/app/bundle-order.json` remains the only source for deterministic userscript assembly. Its `files` array defines the canonical file set and order. The adjacent `dependencyAudit` block records machine-checkable declarations, public globals, cross-file dependencies, phases, and host capabilities without creating a second runtime registry.

## Completion history

- Pilot: 8 base modules, SLF 4.4.222.
- Normal-change evidence: PR #83 exercised `src/core/api.js`; PR #89 exercised `src/core/config.js`; no recurring false-positive pattern was observed.
- Batch 1: remaining Live Parser modules, PR #90, SLF 4.4.226; coverage reached 10 modules.
- Batch 2: Tactics Presets and Strategy Data, PR #105, SLF 4.4.237; coverage reached 30 modules.
- Batch 3: Transfer Analyzer, PR #106, SLF 4.4.238; coverage reached 47 modules.
- Batch 4: App/bootstrap and Team Management; coverage reaches all 55 registered modules and audit status becomes `complete`.

## Metadata contract

Each registered runtime file has exactly one audit entry containing `file`, complete top-level `declares`, cross-file `public` symbols, provider/symbol/phase `requires`, and executable-code `hostCapabilities`. An empty `declares` array is valid for extension-only files that mutate existing public objects without introducing a top-level global.

Dependency phases remain:

- `evaluation`: provider must precede the consumer;
- `runtime`: provider must be registered, but may appear later in the canonical order.

## Complete-state validation

The validator requires exact equality between audited files and the canonical `files` array. It also checks source/declaration parity, public ownership, dependency providers and references, evaluation ordering, audited cross-use edges, global collisions, host references, and expected count.

The source masker preserves executable expressions inside nested template literals. Declaration extraction uses brace-depth scanning where balanced and a minimum-indentation fallback only for syntax the lightweight scanner cannot balance.

## Boundaries

The dependency audit does not change runtime source, business logic, storage, schemas, or canonical bundle order. It is metadata and validation attached to the existing manifest, not a second runtime registry or a module-system migration.

## Maintenance

Any added, removed, or renamed runtime file must update both `files` and `dependencyAudit.modules` in the same approved change. Changes to audited public globals or cross-file references must update metadata and pass the complete-state validator.

## Rollback

Revert the dependency metadata and validator/document changes. Runtime source and canonical bundle order remain unaffected.
