# Spec — Native site templates as the canonical preset store (issue #409)

Status: approved scope (owner `commit approved` 2026-11-11). Base: main `7eb1154`.
Canonical issue: #409. Evidence inputs: live protocol probe on the owner's account (2026-11-11, orchestrator session) — see T1 in tasks.md; verified site API supersedes any doc.

## Problem

The plugin keeps its preset store in localStorage plus a recurring VPS collection sync (`tactics` merge/delete-key/GET), while the site itself already persists tactic templates natively (team4.php?action=tactic «Управление» block, `window.TACTIC_CFG.items`). Two stores hold the same vectors, drift silently, and the VPS copy is a second source of truth that must be reconciled by hand. The native store is user-scoped, survives devices, and has a manager API (save/rename/delete) — it must become the canonical preset store; the VPS tactics transport is retired.

## Decision

- R1. New module `src/modules/tactics-presets/native-template-api.js`: page-config inventory read (`window.TACTIC_CFG.items`, validated envelope — a valid-empty list is not a missing config; share.php is readonly and never ingested); strict 17-key mapping (plugin vector = 14 numeric controls as decimal strings + priority array ↔ site data = 17 numeric fields incl. `priority_l/c/r`); same-origin manager POSTs (`tactic_save`/`tactic_rename`/`tactic_delete`; `tactic_ajax.php` apply and its CSRF hash are out of scope); response parsing that ignores the lying `Content-Type: text/html` and validates the body schema; structured results `{ok, tactic|tactics, code, message}`. Incomplete vectors are rejected on write; native items missing priority bits are malformed, not zero.
- R2. `preset-storage.js` rework: `PresetStorage` stays the name-keyed synchronous-read facade (`getAllPresets`/`getAllLabels`/`loadCustom`/`resolvePresetId` signatures unchanged). Native inventory owns vectors after cutover; localStorage holds only a read cache under a constant key, scoped by VALIDATION at read time: it is served as a preset source only when the page global `foot_login_id` (present on tactic and match pages) matches the envelope's site `user_id` — a missing or mismatched page user makes the cache unreadable for reads (shared-browser account isolation); it persists only id/name/data/time — never `share_token`/`share_url`. The BASE_PRESETS overlay in `getAllPresets()` is removed: native absence is canonical. Built-in registry vectors remain seed definitions (`active-preset-registry.js` untouched).
- R3. `saveCustom()` becomes awaited and returns a structured result or throws a structured `SLFPresetWriteError`; all three callers updated together (save, delete, file import). No optimistic success: the cache updates only from acknowledged responses. File import keeps replacement semantics for the plugin-managed subset only (name preview in the confirm; native templates absent from the file are never deleted — full reconciliation is wave 2).
- R4. `loadFromServerAndMerge(callback)` becomes a compatibility alias to a native refresh (fresh page-config read where available, cache otherwise); the callback fires exactly once on every outcome including failure (bootstrap.js contract).
- R5. Diagnostics: `lastSyncError`/`lastSyncAt` retained; `readSource` (`native|cache|unavailable`) and `lastSuccessfulRefreshAt` added. Writes fail loud via the existing `alert()` convention in ui-layer; never console-only.
- R6. The recurring VPS tactics sync is retired (the `Api.post` merge/delete-key calls and the GET in `loadFromServerAndMerge`). The VPS collection config and telemetry collections (`preset_events`/`preset_effects` via event-tracker.js) are untouched.
- R7. Wave-2 seams only: migration coordinator and identity sidecar are NOT implemented here; the seams are the scoped cache envelope (`userId`, `managedNames`) and the exposed `renameTemplate` API.

## Non-goals

- No migration of legacy presets into native templates (wave 2); no identity sidecar (wave 2).
- No changes to `tactical-lab-v1.js` (P03/P04), `tactic-preset-direction-policy.js` ranking weights/vectors, `event-tracker.js`, telemetry collections, `releases/**` hand edits, `CHANGELOG.md`, `data/**`, `vps/**`, `.github/**`, `contracts/**`.
- No apply-path change: plugin apply keeps using plugin vectors; the site's `tactic_ajax.php` apply endpoint is not used by the plugin.

## Acceptance

1. Mapping test proves all 17 keys, domains, numeric-string coercion, rejection classes (null/empty/bool/NaN/fractional/out-of-range), all 8 priority combinations, [] ↔ 0/0/0 round-trip, unknown priority member rejection, incomplete-vector rejection.
2. API test proves form serialization shape, JSON parsing despite `text/html`, structured errors for login-HTML bodies, `success:-6`, invalid success payloads, and unknown-outcome states. No live network from tests.
3. Storage test proves the name-keyed facade over native items, cache refresh + off-page stale fallback, valid-empty inventory, readonly/share rejection, `user_id` scope isolation, and no BASE_PRESETS overlay while the native store is present.
4. Sync-status test (rewritten) proves native-failure diagnostics: `lastSyncError`/`lastSyncAt` + console.warn on failed writes, callback-once on every `loadFromServerAndMerge` outcome, fail-open reads.
5. `node tools/check-bundle-order.mjs` green with the new module registered (93 modules); `node tools/build-latest-userscript.mjs` succeeds.
6. All three ui-layer callers await `saveCustom` and surface structured errors via `alert()`; import previews affected names and deletes only managed names.
7. `git diff --stat` shows changes only under `src/**`, `tests/**`, `specs/409-presets-native-templates/**`, plus build-generated `releases/latest.*.js`, `data/version.json`, `CHANGELOG.md` (generated outputs, written only by the build script).
8. No live network calls from tests; the network seam is mocked at the module boundary.

## NFR targets

- Write-path honesty: every persisted cache mutation traces to an acknowledged response (tested).
- Read availability: off-page reads fall back to the scoped cache with `nativeStale=true`; a fully unavailable store fails open to the legacy composite (pre-migration continuity).
- Loud failures: structured error codes (`server_rejected`, `invalid_payload`, `not_json`, `empty_response`, `http_*`, `unknown_outcome`, `timeout`, `network`, `transport_unavailable`, `native_unavailable`, `native_stale`, `invalid_option`, `save_failed`, `delete_failed`, `partial_replace`, `incomplete_vector`) surfaced in UI, never swallowed.
- Scope isolation: the cache is served as a preset source only when the page user (`foot_login_id`) matches the envelope `user_id`; a different user's ingest replaces the cache instead of merging across accounts.
