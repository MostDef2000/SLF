# Required tactical identity boundary

## Scope

Append requests to these collections require one non-empty string identity field per row:

| Collection | Required key |
|---|---|
| `match_snapshots_v2` | `snapshotKey` |
| `match_results_v2` | `resultKey` |
| `preset_events_v2` | `eventKey` |
| `preset_effects_v2` | `effectKey` |

The current userscript producers construct these keys before calling `Api.postAppend()`.

## Transaction behavior

Validation runs inside the existing per-collection thread and process lock, before the collection is loaded or modified.

When any row is invalid, the complete request is rejected with HTTP `422`:

```json
{
  "error": "Tactical records require deterministic identity",
  "kind": "missing_unique_key",
  "collection": "match_snapshots_v2",
  "requiredKey": "snapshotKey",
  "invalidIndexes": [1, 3],
  "received": 4
}
```

No valid subset is persisted. Existing collection bytes and temporary-file state remain unchanged.

## Compatibility

- Fully valid tactical batches retain the existing success response.
- Duplicate keys are still reported through `skippedDuplicates`.
- Non-tactical append collections retain legacy payload compatibility.
- Existing stored rows are not migrated or rewritten by this change.
- `/api/analysis` continues to report historic `missingUniqueKeys` if such data already exists.

## Verification

```bash
python3 tools/test-api-contract-compatibility.py
python3 tools/test-api-required-tactical-identity.py
python3 tools/test-api-adversarial.py
python3 tools/test-api-multiprocess-locking.py
python3 tools/test-api-request-size-limit.py
```

The dedicated test covers all four collections, missing and blank keys, non-object rows, mixed batches, byte-level non-mutation, duplicate behavior, clean temporary-file state and non-tactical compatibility.

## Deployment and rollback

This repository change does not deploy the VPS or modify production data. Deployment requires the normal exact-commit operational approval and verification workflow.

Rollback is a direct revert. Reintroducing identity-less tactical persistence requires a separately reviewed migration and compatibility design; it must not be implemented as a silent exception.
