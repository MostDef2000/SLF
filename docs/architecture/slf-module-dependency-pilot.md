# SLF module dependency audit

Status: Active incremental expansion
Current coverage: 30 of 55 registered userscript modules
Runtime behavior impact: None

## Purpose

`src/app/bundle-order.json` remains the only source for deterministic userscript assembly. Its `files` array defines the canonical file set and order. The adjacent `dependencyAudit` block records machine-checkable declarations, public globals, cross-file dependencies, phases, and host capabilities without creating a second runtime registry.

## Evidence and expansion history

- Pilot: 8 base modules, SLF 4.4.222.
- Normal-change evidence: PR #83 exercised `src/core/api.js`; PR #89 exercised `src/core/config.js`; no recurring false-positive pattern was observed.
- Batch 1: remaining Live Parser modules, PR #90, SLF 4.4.226; coverage reached 10 modules.
- Batch 2: Tactics Presets and Strategy Data; coverage reaches 30 of 55 modules.

## Metadata contract

Each entry records `file`, complete top-level `declares`, cross-file `public` symbols, provider/symbol/phase `requires`, and executable-code `hostCapabilities`. Phases remain `evaluation` or `runtime`.

An empty `declares` array is valid for extension-only files that mutate an existing public object without creating a new top-level global. Their dependency edges and host capabilities remain mandatory and machine-checked.

## Validator states

- `pilot`: bounded proof-of-concept coverage;
- `expanding`: approved incremental coverage;
- `complete`: every registered runtime file must have exactly one audit entry.

The validator checks source/declaration parity, public ownership, dependency providers and references, evaluation ordering, audited cross-use edges, collisions, host references, expected count, and exact all-file coverage in `complete` state. The masker now preserves executable expressions inside nested template literals.

## Remaining batches

1. Transfer Analyzer: 17 modules, coverage 47/55.
2. App/bootstrap and Team Management: final 8 modules, coverage 55/55 and status `complete`.

The canonical `files` array and order, runtime source, storage, schemas, and business logic remain unchanged.

## Rollback

Revert the dependency metadata and validator/document changes. Runtime source and canonical bundle order remain unaffected.
