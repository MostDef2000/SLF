# Team4 roster name column collapse (#365)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `feat/365-roster-name-column`, base `f4cceb75147140808d7eceead4622acf394bbb8b`.

## Problem

On `team4.php` (fm2026 design) the plugin's roster-table compaction block (`team4-leadership-upgrade-indicator.js`, `html[data-slf-design="fm2026"] .team` selectors) forced `table-layout:fixed` on `#generallist` plus a per-column px budget (`nth-child(1,2,3,5..16)` = 26+34+34+24+52+54×4+36+34×3+54+60 = **638px**). The name column (4th, `.player-column-name`) carried `min-width:0;width:auto` — and in the fixed layout algorithm Chrome ignores `min-width` on cells, so on every column-set tab the «Игрок» column was squeezed to the table's leftover: **12–24px on the live site, 1px on the roster@1280** (issue comments 6246769608 / 6247010409). Site CSS sets no width on the name column (no colgroup, no inline widths), so only the plugin rules caused the collapse.

## Root cause

`table-layout:fixed` + px budget sized every numeric column larger than its auto-layout width (live probe: `#` 21→26, «Амплуа» 27→34, numeric block ≈ +80px), leaving ~0 for the name column; `min-width` cannot defend a cell under the fixed algorithm, and `calc()`/`!important` probes do not override it.

## Goal and user-visible behaviour

The «Игрок» column keeps a readable width on all five team4 column-set tabs: auto layout sizes the name column to its content (live roster@1280 ≈ 180–200px, non-roster ≈ 398px), with a `min-width:140px` floor that works in auto layout. Compaction (12px body font, tight cell padding, hidden overflow protection) is preserved.

## Scope

Plugin CSS only (`src/modules/team-management/team4-leadership-upgrade-indicator.js` compaction block): remove `table-layout:fixed` + the nine nth-child px-width rules; tighten cell horizontal padding 4px→3px; replace the name-column rule with a `min-width:140px` floor. Fixture + roster-subtab regression test extended. **#363/#364 contract untouched**: roster sub-tab keeps the 366px dash + championship panel, non-roster sub-tabs keep full width; no other modules, no storage/schema, no site files.

## Tests

- `tests/browser/fixtures/fm2026-team-main.html`: content column narrowed to the live 688px regime (656px scroll viewport @1280) so the reverted fix collapses the name th to **18px (<30)**; 16-column structure, targeted classes and all existing inline gates kept; inline verify now pins `tableLayout:'auto'`, `nameThWidth>=120` and name-text visibility.
- `tests/browser/test_team4_championship_subtab_layout.py`: new browser-measured case `roster-name-column` (viewport 1280): name th ≥ 120px and name text inside the cell; existing #363 sub-tab-cycle assertions untouched.
- `test_fm2026_design_adapter.py` (unchanged): team-main @1440 keeps passing — name th = 140px (floor) with the fix.

## NFR / risk (brief)

- No new network calls, storage keys, permissions or module inventory changes (90 bundle modules unchanged; `check-bundle-order` green).
- Risk: auto layout at narrow viewports could overflow the content column — compensated: 3px padding saves 2px × 16 columns = 32px ≥ the 12px overflow measured at 4px padding (roster table ≈ 668px ≤ 688px @1280); the 140px floor does not bind on live @1280 (auto name ≈ 180–200px) and `.roster-scroll{overflow-x:hidden}` plus the fixture `scrollWidth ≤ clientWidth+1` gate guard regressions.

## Acceptance

1. RED: suite against the pre-fix bundle fails on `nameThWidth: 18 < 120` (verbatim output in tasks.md).
2. GREEN: suite against the fixed bundle passes (`nameTh=146px textInside=True`); adapter suite 10/10 green.
3. CI green on the PR head (tests build from source, so the fixture gate and the fix ship together).
