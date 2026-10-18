# Plan — Team4 championship sub-tab layout awareness (#363)

## Contour

Userscript only (`src/modules/team-management/team4-form-saved-choice-notice.js`, championship IIFE) + browser tests/fixture + CI wiring + bundle-order audit. No VPS changes.

## Decisions

1. **State machine keyed on `panel.dataset.slfRosterSideActive`** (`applyLayoutState`): one idempotent transition per state change; active ⇒ add `slf-team4-championship-layout` + `slf-team4-championship-roster-side` (+ `team_general_content` only when the plugin added it, tracked via `host.dataset.slfChampGenericContent`) and sync placement; inactive ⇒ remove all of them plus `EXTERNAL_CLASS`/`OVERFLOW_CLASS` and set panel `display:none`. No counter-CSS needed: every plugin grid rule is keyed on those classes, so removal restores the site-native `340px minmax(0,1fr)` flow.
2. **Roster detection by switcher anchors** (`isRosterSubtabActive`): prefer `.tpanel-a .wide_format` / `.sub-panel-a .wide_format` (live-verified exact labels «Основная команда» / «основные»); whole-tab fallback strips `.tpanel__count` badges; start-anchored prefix regexes (`/^основная\s+команда/i`, `/^основные/i`) classify both live short labels and repo-fixture long labels («основные показатели», «Основная команда 19») as roster, while «Аренды…», «финансы…», «в реале», «скиллы», «номера» classify non-roster. Absent switcher ⇒ default roster (legacy/mock behaviour unchanged).
3. **Change detection**: MutationObserver on `#general` (`childList`, `subtree`, `class`/`style` attributes) debounced 150ms (loan-limit convention) plus deferred re-checks at 300/1000/2500ms (leadership convention) for late tablesorter/redraw state changes; the site switch is pure class mutation, so attribute observation is sufficient and cheap.
4. **Placement guard**: `syncPanelPlacement` early-returns when the layout is inactive, so resize/ResizeObserver cannot re-add `EXTERNAL_CLASS`/`OVERFLOW_CLASS` on non-roster sub-tabs.
5. **Fixture over assertion edits** (minimal diff for the existing `test_fm2026_design_adapter.py::team-main`): activate the roster tab in `fm2026-team-main.html` (keep the «Аренды 2/10» count span — the loan-limit panel computes its numbers from visible `pl--1`/`player-loan` rows, not from the active tab, verified in `team-loan-limit-helper.js`). The inline `placementOk` gate then sees the roster-active behaviour it was written for.
6. **Test robustness fixes** (review blockers): `wait_for_selector(..., state="attached")` for the intentionally hidden panel on non-roster load; active-agnostic click selectors (`.tmr-seg > div:has-text(…)`) after class demotion; delegated switcher JS in the fixture so items stay clickable in both directions (real site binds onclick per item).

## Risk profile

- **Misclassification on the live site** (layout on a non-roster tab, or removed on roster): mitigated by the live probe evidence (probe6: exact active-marker texts; switching client-side), prefix-only matching, and the default-roster fallback for unknown states. Live e2e measures all 25 squad×column-set combos per viewport against the no-plugin baseline.
- **Observer feedback loops**: the observer only reads; class writes happen on `.team-body` (outside `#general`) and the panel hides itself outside `#general` — no self-triggered cycle; debounce coalesces bursts.
- **Test design**: new sub-tab cycle test asserts class presence/absence, computed 366px/340px columns, panel display, placement and content-width equality with the no-plugin baseline (±2px); the no-switcher case pins the default; the adapter suite pins roster-active behaviour end-to-end (grid, placement, containment, loan «2/10», XSS probes).

## Correct-course impact

None — UI-only layout awareness inside one module; no contract, release-policy or VPS impact.
