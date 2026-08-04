# Versioned data and API contracts

This document defines how SLF telemetry, manual state, API responses, and release manifests evolve.

Canonical machine-readable contracts:

- `data/contracts/slf-contracts-v1.schema.json`
- `data/contracts/fixtures-v1.json`
- `data/contracts/contract-policy-v1.json`

The contract gate is implemented by:

- `tools/test-versioned-contracts.mjs`
- `tools/test-api-contract-compatibility.py`
- `.github/workflows/versioned-contracts.yml`

## Contract ownership

| Data surface | Contract | Current version | Identity field |
| --- | --- | ---: | --- |
| `match_snapshots_v2` | `matchSnapshot` | 2 | `snapshotKey` |
| `match_results_v2` | `matchResult` | 2 | `resultKey` |
| `preset_events_v2` | `presetEvent` | 3 | `eventKey` |
| `preset_effects_v2` | `presetEffect` | 3 | `effectKey` |
| local manual state | `manualMatchState` | `slf_manual_match_state_v1` | storage key includes `gameId` |
| append response | `appendResponse` | v1 contract | not applicable |
| analysis response | `analysisResponse` | v1 contract | not applicable |
| release manifest | `releaseManifest` | `slf_version_manifest_v3_latest_only_build_from_src` | approved commit and artifact metadata |

## Compatibility rules

A change is backward compatible only when old valid records remain readable and their identity does not change.

The following changes may remain within a schema version:

- adding an optional field;
- adding a new optional nested object;
- widening documentation without changing validation semantics.

The following changes require a new schema version and migration plan:

- removing or renaming a required field;
- changing a field type;
- changing unique-key construction;
- changing collection identity semantics;
- making an optional field required;
- changing the meaning of an existing enum value.

## Manual-state migration boundary

`slf_manual_match_state_v1` is the only writable manual-state schema.

`slf_live_parser_state_v2` may be read only as a migration source. Migration direction is one-way:

```text
slf_live_parser_state_v2 -> slf_manual_match_state_v1
```

No active code may write or dual-write the legacy state.

## Missing tactical unique keys

The client contracts require all tactical records to contain their collection identity field.

The current VPS API retains a compatibility path: a tactical record without its unique key is accepted, persisted, and reported through `missingUniqueKey`. This behaviour is intentionally documented and regression-tested because it creates a deduplication risk.

The strict target is to reject such a record before persistence. That behaviour change belongs to the security and adversarial API stage, where deployment compatibility and existing producers can be validated together.

Until strict rejection is deployed:

- `missingUniqueKey` must remain present in append responses;
- analysis health must report `missingUniqueKeys`;
- all SLF-produced fixtures must fail contract validation when the required key is absent;
- any non-zero production counter requires investigation.

## Fixture rules

Each contract requires:

- at least one positive fixture;
- at least one negative fixture for a required field or invariant;
- a regression fixture for every production contract defect;
- human review of expected outcomes.

Negative fixtures must fail for the intended contract reason. Weakening a schema only to make an invalid fixture pass is prohibited unless the contract is intentionally changed and versioned.

## Release rule

`data/version.json` must validate against `releaseManifest`. The release status must be derived from `scriptVersion`, and latest-only publication must keep `archiveCreated` set to `false`.

Only release artifacts built from an approved commit and validated against the active contract may be published.
