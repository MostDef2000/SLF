# 003-api-status-analysis — Spec

Status: Active
Feature ID: `003-api-status-analysis`

## WHAT / WHY

The userscript diagnostic "API" button (`src/app/ui-layer.js`) previously issued a full `GET` for every collection (`match_snapshots_v2`, `match_results_v2`, `preset_events_v2`, `preset_effects_v2`, `player_observations`, `transfer_history`, `tactics`) and computed `rows.length`. Two collections are very large on production (`match_snapshots_v2` ≈ 84 MB, `transfer_history` ≈ 87 MB). The userscript `API_REQUEST_TIMEOUT_MS = 15000` caused the large GETs to time out; the per-collection `.catch` converted the failure into `count: 0`, while the outer `Promise.all` still resolved and the UI printed "API OK v2". The user therefore saw `snapshots:0` although production holds 1777 valid snapshot records.

The server already exposes a compact `GET /api/analysis` endpoint (in `vps/api/server.py`) that returns per-collection health/count summaries without transferring collection payloads. The fix rewires the diagnostic button to call `/api/analysis` once and derive all counts from the compact summary, and to distinguish `missing` / `corrupt` / `request failed` from a real `count: 0`.

## Intended behaviour

- The "API" button issues exactly one `GET /api/analysis` and no raw collection GETs.
- It derives `games / snapshots / results / events / effects / players / transfers / tactics` counts from the analysis health summary.
- It distinguishes four states per collection: real `count:0`, `missing` (file absent), `corrupt` (invalid JSON), `request failed` (timeout/network). A failure or degraded collection is shown as `API WARN` / `API ERROR` with the actual state — never silently rendered as `0` under "API OK".
- Send paths (`Спарсить завершённый`, `sendSnapshot`, etc.) are unchanged.

## NFR assessment

| NFR | Target | Evidence method | Status |
|---|---|---|---|
| No raw collection download | 0 raw `/api/<collection>` GETs from the diagnostic button | `tools/test-api-status-analysis.mjs` asserts only `/api/analysis` is requested | PASS (test) |
| Failure not masked as 0 | analysis failure / corrupt collection surfaces as non-zero error state | `tools/test-api-status-analysis.mjs` (corrupt + failure cases) | PASS (test) |
| Behavioural scope | diagnostic read path only; no write/send change | PR diff inspection | PASS (expected) |
| No server change | `/api/analysis` already present and healthy on production | server.py review + production `/api/analysis` check | PASS |

## Acceptance criteria

1. `node tools/test-api-status-analysis.mjs` passes: only `/api/analysis` requested; corrupt/missing collection surfaces as non-zero error state; analysis request failure rejects (UI shows ERROR, not 0).
2. `node tools/build-latest-userscript.mjs` assembles cleanly.
3. After merge + automatic release (4.4.329), the "API" button reports `snapshots:1777` (and other counts) against production instead of `snapshots:0`.
