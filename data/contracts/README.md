# SLF contract assets

- `slf-contracts-v1.schema.json` — JSON Schema Draft 2020-12 contracts.
- `fixtures-v1.json` — positive and negative contract fixtures.
- `contract-policy-v1.json` — collection ownership, versioning, migration, and compatibility policy.

Validation entrypoints:

- `node tools/test-versioned-contracts.mjs`
- `python3 tools/test-api-contract-compatibility.py`
