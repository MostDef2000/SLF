# Tasks — Native site templates as canonical preset store (#409)

- [x] T1. Live protocol evidence (DONE — orchestrator probe on the owner's account, 2026-11-11):
  - `POST /ajax/team3.9.php?a=tactic_save` with form-encoded `name=<name>&data[def_line]=2&...` (all 17 keys) → JSON body `{success:1, tactic:{id,user_id,name,data,time,order,share_token,share_url}}` while `Content-Type` lies (`text/html`) — parsing must ignore the header.
  - Same-name save creates a NEW template (verified: ids 5143 + 5144, same name) — no upsert, no rejection.
  - `a=tactic_rename {id,name}` → `{success:1, tactic:{...}}`; `a=tactic_delete {id}` → `{success:1}`; `a=tactic_move {id,direction}` → `{success:1, tactics:[...]}` (exists on site, not used by the plugin). No CSRF hash for team3.9.php (hash belongs to tactic_ajax.php apply only).
  - Inventory is page-embedded `window.TACTIC_CFG.items` ONLY (no list endpoint) on team4.php?action=tactic and match pages («Управление» block); item shape `{id:"5143", user_id:"6945", name, data:{17 numeric keys}, time, order, share_token, share_url}`; user-scoped `user_id`. share.php is readonly — never ingested.
  - Save limit: 2 templates without VIP2+ (server rejects; site message «Без VIP 2+ можно сохранить до двух тактик»). Owner is VIP2 — unlimited; code must handle rejection loudly.
- [x] T2. `src/modules/tactics-presets/native-template-api.js`: mapping + manager API + structured results (spec R1).
- [x] T3. `preset-storage.js` rework: native-owned vectors, scoped cache, overlay removal, awaited `saveCustom`, `loadFromServerAndMerge` alias, diagnostics (spec R2/R4/R5); `ui-layer.js` three callers updated (spec R3).
- [x] T4. Migration coordinator (DONE — wave 2, 2026-11-11; review fixes applied): `src/modules/tactics-presets/preset-migration.js` — `PresetMigration.run()` with source precedence seeds (BASE_PRESETS) < legacy localStorage (`CONFIG.STORAGE_KEY`, raw read) < VPS `Api.getPromise(COLLECTIONS.TACTICS)` one-time read (failure = non-fatal skipped source) < `DEFAULT_CUSTOM_PRESETS`; destination-wins (`exists` skip, never overwrites); quota/transport rejection aborts the queue loudly (`failed[]` + `aborted_after_rejection` skips, partial receipt persisted, re-run resumes); AMBIGUOUS outcomes (`network`/`timeout`/`unknown_outcome`/`empty_response`/`not_json`) recorded in receipt `unknown[]` + immediate persist, re-run skips `unknown_outcome_previous`; incremental receipt persistence (after every ack, try/finally); cache-write failure never loses an ack; deprecated names scanned from RAW source keys and reported `deprecated`, never imported; writes via `NativeTemplateApi.saveTemplate` only, zero deletes; NO auto-trigger (ui-layer button only, failed runs alert instead of the success summary). Pinned by `tests/test-preset-migration.mjs` (14 scenarios).
- [x] T5. Identity sidecar (DONE — wave 2, 2026-11-11; review fixes applied): receipt at localStorage `slf_preset_migration_receipt_v1` (`{schema, ts, applied:[{name,id,source}], skipped, unknown, vectorFingerprints}`) is the name→site-template-id map; idempotent re-run (`already_migrated`); `reconcileReceipt(persist)` marks receipt entries whose site template disappeared externally as `stale` (+`reconciledAt`) without re-importing them, and reports `unavailable` (marks nothing) when the scope is unreadable; cache/managedNames updated through the `PresetStorage.recordMigratedTemplate` seam. Pinned by the same test file.
- [x] T6. Tests (this wave): `tests/test-native-template-mapping.mjs`, `tests/test-native-template-api.mjs`, `tests/test-preset-native-storage.mjs`, rewritten `tests/test-preset-storage-sync-status.mjs` — all green, no live network. Wave 2 adds `tests/test-preset-migration.mjs` (vm sandbox, fetch/Api seams, no live network): precedence, destination-wins, idempotency, resumability, quota-rejection detail, deprecated raw-key scan, VPS-failure non-fatal, stale detection, dryRun-writes-nothing, explicit no-delete, ambiguous-outcome unknown list + conservative re-run, cache-write resilience, unreadable-scope reconcile.
- [ ] T7. Independent review on the diff (different model family); orchestrator diff inspection.
- [ ] T8. PR → canonical CI green → merge → automatic release evaluation → release verification (userscript artifacts) → Tampermonkey instruction.

## Definition of Done

- All acceptance items A1–A8 (spec.md) demonstrably true with observed command output.
- Wave-2 items (T4/T5) implemented and pinned by `tests/test-preset-migration.mjs` (11 scenarios green).
- No forbidden-path edits; generated outputs only via `tools/build-latest-userscript.mjs`.

## Constraints

- Smallest complete change (ponytail): no apply-path changes, no direction-policy edits, no telemetry changes.
- Scratch only in `/tmp/opencode/409-wave1/`; nothing in repo root.
- Commit nothing from the worker session — orchestrator commits after review.
