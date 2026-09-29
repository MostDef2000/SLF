# 003-api-status-analysis — Plan

## HOW

- `src/core/api.js`: rewrite `fetchCanonicalApiStatus()` to call `Api.getPromise('analysis')` once and map the compact `collections` health summary (count/exists/valid/type/fileSize/duplicateKeys/missingUniqueKeys) into the status object. On analysis request failure, reject (wrap error with `kind`) so the UI shows ERROR instead of masking as 0.
- `src/app/ui-layer.js`: update the "API" button handler to consume the new status shape, render `API OK v2` / `API WARN` based on `status.status`, show all collections (including `transfers`/`tactics`), and render `missing`/`corrupt`/`error` labels instead of `0`.
- `tools/test-api-status-analysis.mjs` (new): Node/vm test mocking `GM_xmlhttpRequest`; asserts (a) only `/api/analysis` requested, (b) corrupt collection → degraded + non-zero count, (c) analysis failure → reject with `kind`.

## Affected contours

- Userscript contour only (`src/**`). No VPS/server code change (`/api/analysis` already exists and is healthy on production). No generated artifacts edited.

## Risk profile

`Risk profile: LOW` — diagnostic read path only; no storage/schema/version impact; send paths untouched; fail-closed behaviour (analysis failure → ERROR) is strictly safer than the previous silent-0 behaviour.

## Test design

- unit: `tools/test-api-status-analysis.mjs` (mocked transport) covers the three required behaviours.
- integration: canonical `SLF CI / ci` is the only merge gate and must succeed on the exact final PR head.
- end-to-end: PR → CI → merge → automatic `SLF Release` (4.4.329) → verify button reports real counts against production.

## Correct-course

If a user runs an older server build without `/api/analysis`, the button shows `API ERROR` (fail-closed) instead of counts — acceptable and correct; no raw 84/87 MB fallback. If CI flags a governance validator on the new test file, keep the test and narrow the change set rather than weakening validators.

## Decisions / rejected alternatives

- **Single `/api/analysis` call instead of per-collection GETs** — eliminates all large downloads at once (including the 87 MB `transfer_history` the old code fetched but never displayed).
- **Reject on analysis failure rather than resolve-with-zeros** — matches the user's explicit requirement that a failed collection must never render as `0`.
- **Show `transfers`/`tactics` too** — they are now free from the analysis summary; more informative with no extra cost.
