# Tasks — Native site templates as canonical preset store (#409)

- [x] T1. Live protocol evidence (DONE — orchestrator probe on the owner's account, 2026-11-11):
  - `POST /ajax/team3.9.php?a=tactic_save` with form-encoded `name=<name>&data[def_line]=2&...` (all 17 keys) → JSON body `{success:1, tactic:{id,user_id,name,data,time,order,share_token,share_url}}` while `Content-Type` lies (`text/html`) — parsing must ignore the header.
  - Same-name save creates a NEW template (verified: ids 5143 + 5144, same name) — no upsert, no rejection.
  - `a=tactic_rename {id,name}` → `{success:1, tactic:{...}}`; `a=tactic_delete {id}` → `{success:1}`; `a=tactic_move {id,direction}` → `{success:1, tactics:[...]}` (exists on site, not used by the plugin). No CSRF hash for team3.9.php (hash belongs to tactic_ajax.php apply only).
  - Inventory is page-embedded `window.TACTIC_CFG.items` ONLY (no list endpoint) on team4.php?action=tactic and match pages («Управление» block); item shape `{id:"5143", user_id:"6945", name, data:{17 numeric keys}, time, order, share_token, share_url}`; user-scoped `user_id`. share.php is readonly — never ingested.
  - Save limit: 2 templates without VIP2+ (server rejects; site message «Без VIP 2+ можно сохранить до двух тактик»). Owner is VIP2 — unlimited; code must handle rejection loudly.
- [x] T2. `src/modules/tactics-presets/native-template-api.js`: mapping + manager API + structured results (spec R1).
- [x] T3. `preset-storage.js` rework: native-owned vectors, scoped cache, overlay removal, awaited `saveCustom`, `loadFromServerAndMerge` alias, diagnostics (spec R2/R4/R5); `ui-layer.js` three callers updated (spec R3).
- [ ] T4. Migration coordinator: legacy preset → native template reconciliation, VPS tactics collection retirement/deletion, import reconciliation beyond the managed subset. **Wave-2 pending.**
- [ ] T5. Identity sidecar: user-scoped cache validation beyond `user_id`-envelope, cross-account drift handling. **Wave-2 pending.**
- [ ] T6. Tests (this wave): `tests/test-native-template-mapping.mjs`, `tests/test-native-template-api.mjs`, `tests/test-preset-native-storage.mjs`, rewritten `tests/test-preset-storage-sync-status.mjs` — all green, no live network.
- [ ] T7. Independent review on the diff (different model family); orchestrator diff inspection.
- [ ] T8. PR → canonical CI green → merge → automatic release evaluation → release verification (userscript artifacts) → Tampermonkey instruction.

## Definition of Done

- All acceptance items A1–A8 (spec.md) demonstrably true with observed command output.
- Wave-2 items (T4/T5) explicitly marked pending — their absence does not block this wave's PR.
- No forbidden-path edits; generated outputs only via `tools/build-latest-userscript.mjs`.

## Constraints

- Smallest complete change (ponytail): no apply-path changes, no direction-policy edits, no telemetry changes.
- Scratch only in `/tmp/opencode/409-wave1/`; nothing in repo root.
- Commit nothing from the worker session — orchestrator commits after review.
