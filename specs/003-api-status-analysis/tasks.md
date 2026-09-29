# 003-api-status-analysis — Tasks

## Definition of Done

All tasks complete, PR merged into `main` with green canonical CI, automatic release 4.4.329 published, button reports real counts against production, no secrets tracked.

| # | Task | Acceptance evidence | Status |
|---|---|---|---|
| 1 | Rewrite `fetchCanonicalApiStatus()` to use `/api/analysis` | `src/core/api.js` updated; only analysis endpoint used | DONE |
| 2 | Update "API" button rendering (WARN/ERROR, all collections) | `src/app/ui-layer.js` updated | DONE |
| 3 | Add `tools/test-api-status-analysis.mjs` | test passes locally and in CI | DONE |
| 4 | Add `specs/003-api-status-analysis/{spec,plan,tasks}.md` | SDD artifacts tracked | DONE |
| 5 | Branch → commits → PR → canonical CI → exact-green-head merge | PR linked to #296; `SLF CI / ci = SUCCESS` on exact head | PENDING |
| 6 | Automatic release evaluation → 4.4.329 published → verify button | release commit on `release`; button shows `snapshots:1777` | PENDING |
