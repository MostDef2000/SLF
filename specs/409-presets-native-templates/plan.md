# Plan — Native site templates as canonical preset store (#409)

Wave 1 of 2 (this scope): storage swap + SDD + first test battery. Wave 2 (separate order): migration coordinator + identity sidecar.

## 1. Architecture

- `src/modules/tactics-presets/native-template-api.js` (new, bundle-registered before `preset-storage.js`):
  - `NativeTemplateMapping` — pure 17-key mapping. Site data domains: `def_line`/`press_line`/`def_width` 1–3, `press_intense` 1–5, `build_type`/`build_temp`/`build_long`/`build_fast` 1–3, `style`/`pass_risk`/`dribble` 1–5, `cross` 1–3, `corner` 1–2, `shot` 1–3, `priority_l/c/r` 0|1. Plugin vector = 14 decimal strings + priority array; membership ↔ bit; [] ↔ 0/0/0 (never expanded, never «disable attacks»).
  - `NativeTemplateApi` — page-config read via `unsafeWindow` (fallback `window`, same pattern as `match-rendering-compatibility.js`); manager POSTs to `/ajax/team3.9.php` with page-context fetch (`unsafeWindow.fetch` preferred, same-origin, form-encoded); parse ignores Content-Type; structured results only.
- `preset-storage.js` — facade over the native inventory: `refreshNativeState()` (ingest → scoped cache → `readSource`), `inventoryToPresetMap()` (name-keyed; duplicate native names resolve to the freshest item: latest `time`, then highest numeric id), `saveCustom()` write protocol (pre-validate all vectors → per-item save ack → delete-old on updates → delete-missing per mode → persist acked state only), `loadFromServerAndMerge()` alias.
- `ui-layer.js` — three callers await and surface errors via the existing `alert()` convention; import previews adds/updates/managed-deletes.

## 2. Migration (wave 2, seams only)

- The cache envelope carries `userId` and `managedNames` — the identity sidecar reads the former, the migration coordinator reconciles the latter.
- Legacy continuity: with no native config and no cache, reads fail open to the legacy composite (old localStorage key + BASE_PRESETS). The wave-2 migration moves those into native templates and retires the fallback.
- VPS `tactics` collection: sync retired in wave 1; collection config untouched; reconciliation/deletion of the collection is wave 2.

## 3. Risks

- RISK: same-name native templates (site allows them; verified ids 5143+5144) collapse in the name-keyed facade → resolution rule: newest wins (time, then id); wave-2 identity work removes the ambiguity.
- RISK: update = save-new + delete-old (no site upsert). If the delete ack fails after a successful save, the error is `partial_replace` and the site temporarily holds two same-name templates; reported loudly, reconciled in wave 2.
- RISK: built-in registry presets disappear from the dropdown once the native store is readable but before wave-2 seeds them. Accepted by design (native absence is canonical); the legacy composite fallback covers only fully-unavailable stores.
- RISK: retired built-in names are display-filtered; a native template carrying such a name would be invisible. Deletion explicitly skips retired names so the filter can never cause a native delete.
- RISK: server save-limit rejection (non-VIP2) must surface loudly — covered by `server_rejected` → `SLFPresetWriteError` → `alert()`.
- RISK: `tools/test-coach-preset-aliases.mjs` (uneditable) loads preset-storage.js standalone → `NativeTemplateApi` access is `typeof`-guarded and the unavailable-store path preserves the legacy composite the test asserts.

## 4. Verification

- `node tests/test-native-template-mapping.mjs`
- `node tests/test-native-template-api.mjs`
- `node tests/test-preset-native-storage.mjs`
- `node tests/test-preset-storage-sync-status.mjs`
- `node tools/check-bundle-order.mjs`
- `node tools/build-latest-userscript.mjs` (rewrites `releases/latest.*.js`, `data/version.json`, `CHANGELOG.md` — generated outputs, expected)
- CI-listed local runs: `test-userscript-artifact-boundary`, `test-versioned-contracts`, `test-security-boundaries`, `sync-active-preset-inventory --check`, runtime-tactics preset-related suites that run without a browser.
- No live network from tests: the network seam is the module boundary (`NativeTemplateApi` mocked in storage tests; `fetch` injected in API tests).

## 5. Rollback

Single bounded PR on `409-presets-native-templates`; revert = drop the branch diff. Runtime rollback: reinstall the previous `release`-branch userscript (native cache key `slf_custom_presets_native_v1` is additive; the legacy `slf_custom_presets` key is never deleted, so the old build keeps working).

## 6. Wave 2 — migration coordinator + identity sidecar (implemented 2026-11-11)

- Built `src/modules/tactics-presets/preset-migration.js` (`PresetMigration`): one-time owner-triggered migration; source precedence seeds (`BASE_PRESETS`) < legacy localStorage (`CONFIG.STORAGE_KEY`, raw read) < VPS `tactics` one-time read (failure = non-fatal skipped source) < `DEFAULT_CUSTOM_PRESETS`; destination-wins (`exists` skip, never overwrite); writes via `NativeTemplateApi.saveTemplate` only, zero deletes; `server_rejected` aborts the queue loudly (`failed[]` + `aborted_after_rejection`, partial receipt persisted, re-run resumes); manual trigger only (ui-layer «⬆️ В шаблоны сайта» button: dry-run preview → confirm → run → summary alert).
- Identity sidecar: receipt `slf_preset_migration_receipt_v1` (`{schema, ts, applied:[{name,id,source}], skipped, vectorFingerprints}`) = name→site-id map; idempotent re-run (`already_migrated`); `reconcileReceipt(persist)` marks externally deleted templates `stale` (+`reconciledAt`) without re-importing. Cache/managedNames via the `PresetStorage.recordMigratedTemplate` seam. Module registered in `bundle-order.json` (94 modules).
- Tests: `tests/test-preset-migration.mjs` — 11 scenarios (0–10), vm sandbox, fetch/Api seams, no live network: precedence, destination-wins, idempotency, resumability, quota detail, deprecated, VPS failure, stale detection, dryRun-writes-nothing, explicit no-delete.
- First-execution findings (fixed): (1) module — the `deprecated` skip was unreachable because `loadLocalRaw`/`readVpsTactics` returned pre-normalized maps; fixed by raw-key scan in `mergeSource` fed by `readLegacyLocalRaw()`/raw VPS body (deprecated now reported, never silently dropped); (2) harness — `defaultCustomPresets` typo, bare `DEFAULT_CUSTOM_PRESETS` shorthand, duplicate `fetchCalls` declaration, cross-realm `deepEqual` (vm-realm arrays) → `namesOf`/`Array.from`, plus assertion corrections in scenarios 2/4/7/9/10.
