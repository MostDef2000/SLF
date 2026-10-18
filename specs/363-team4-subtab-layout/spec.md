# Team4 championship sub-tab layout awareness (#363)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `feat/363-team4-subtab-layout`, base `424cf135383fbfff9a02f8c326f7dba410245e8a`.

## Problem

On `team4.php` (fm2026 design) the championship roster-side layout — `.team-body` gets `team_general_content` + `slf-team4-championship-layout` + `slf-team4-championship-roster-side`, CSS clamps the dash to 366px — is applied once at load and never revisited. Team4 sub-tab switching is pure client-side (squad switcher `.tpanel-a/.tpanel-b`, column-set switcher `.sub-panel-a/.sub-panel-b`; `#generallist` never leaves the DOM), so the layout classes persist on every non-roster sub-tab («финансы», «в реале», «скиллы», «номера», «Резерв», «Академия», «Аренды», «Сборная») and clamp content that should be full-width.

## Goal and user-visible behaviour

The championship two-column roster layout exists only while the roster view is active (squad tab «Основная команда» + column set «основные»). Switching to any other sub-tab removes the plugin layout classes (and the plugin-added `team_general_content`) and hides the panel, restoring the site-native full-width flow (340px dash grid) identical to the no-plugin state. Returning to the roster view re-applies the layout. Pages without the switcher (older states, mocks) default to the roster layout — existing behaviour preserved. Legacy design branch untouched.

## Scope

Plugin-only (`src/modules/team-management/team4-form-saved-choice-notice.js` championship IIFE): roster-active detection (`isRosterSubtabActive`), layout apply/remove (`applyLayoutState`), `#general` MutationObserver + deferred re-checks (`installSubtabObserver`), placement sync guard. No site-side files, no other modules, no storage/schema changes.

## Tests

- New `tests/browser/test_team4_championship_subtab_layout.py`: sub-tab cycle (non-roster load → roster → финансы → roster → Резерв → roster) with A/B content-width equality vs no-plugin baseline, panel visibility, placement; no-switcher default; XSS probe untouched. Wired into `.github/workflows/quality-integration.yml` (py_compile + execute).
- Existing `test_fm2026_design_adapter.py` team-main keeps its assertions (incl. loan «2/10»); its fixture `fm2026-team-main.html` now has the roster tab active so the new gate semantics (roster-active ⇒ layout applied) hold.

## NFR / risk (brief)

- No new network calls, storage keys or permissions; hostCapabilities audit refreshed (MutationObserver, setTimeout, clearTimeout).
- Risk: misclassification flips the layout on the live site — mitigated by live-verified anchors (`.tpanel-a .wide_format` = «Основная команда», `.sub-panel-a .wide_format` = «основные»; switching is client-side) and prefix matching tolerant of fixture long labels («основные показатели», counter badges).
- Risk: resize re-adding external placement on non-roster — closed by the inactive guard in `syncPanelPlacement`.

## Acceptance

1. CI green on the PR head (incl. both team4 championship browser tests).
2. Live A/B e2e on the real site: every non-roster sub-tab content width equals the no-plugin baseline at 1280/1440/1600; roster keeps the two-column layout (366px dash); no console/page errors from the plugin.
