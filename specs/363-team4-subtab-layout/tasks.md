# #363 — executable acceptance checklist

- [x] [A1] `isRosterSubtabActive()` detects the roster view from live-verified switcher anchors (`.tpanel-a .wide_format` = «Основная команда», `.sub-panel-a .wide_format` = «основные»), strips `.tpanel__count` in the whole-tab fallback, and uses start-anchored prefix regexes tolerant of fixture long labels; absent switcher defaults to roster.
- [x] [A2] `applyLayoutState()` adds the roster-side layout classes (+ plugin-added `team_general_content`, tracked) when roster is active and removes them (+ `EXTERNAL_CLASS`, `OVERFLOW_CLASS`, panel display) otherwise; placement sync is guarded against re-adding on non-roster.
- [x] [A3] `installSubtabObserver()` watches `#general` (childList/subtree/class+style) with 150ms debounce + 300/1000/2500ms deferred re-checks; wired once per panel in `ensurePanel()`.
- [x] [A4] New regression test `tests/browser/test_team4_championship_subtab_layout.py`: sub-tab cycle (non-roster load → roster → финансы → roster → Резерв → roster) with A/B width equality, panel visibility/placement, XSS probe; no-switcher default case; robust selectors (attached wait, active-agnostic clicks, two-way delegated switcher).
- [x] [A5] `test_fm2026_design_adapter.py` team-main preserved: fixture `fm2026-team-main.html` activates the roster tab (loan count span kept; loan-limit «2/10» assertion verified independent of the active tab); inline `placementOk` gate unchanged and valid.
- [x] [A6] CI wiring: the new test added to both the py_compile list and the execute list of the `browser-e2e` job in `.github/workflows/quality-integration.yml`.
- [x] [A7] `src/app/bundle-order.json` dependencyAudit entry for the module refreshed (MutationObserver, setTimeout, clearTimeout); `node tools/check-bundle-order.mjs` green.
- [x] [A8] Local verification: `node --check` on the module; bundle rebuilt in `/tmp/opencode/363-subtab/build/SLF-full` from approved base `424cf135383fbfff9a02f8c326f7dba410245e8a` (SLF 4.4.340) with `isRosterSubtabActive` present; node mock replica all green; real-site e2e (`/tmp/opencode/363-subtab/e2e-team4.mjs`, READ-ONLY) — all non-roster sub-tabs equal the no-plugin baseline at 1280/1440/1600, roster keeps the two-column layout, no plugin console/page errors.
- [ ] [A9] External acceptance: CI green on the PR head (python browser tests run in CI; python playwright unavailable locally); live A/B confirmed from the e2e report.

## Operational, external and not implied

- [ ] Merge/PR/CI lifecycle handled by the delivery orchestrator; this task ships source changes only (no commit/push from the implementing agent).
- [ ] Legacy design branch intentionally untouched (live site serves fm2026 markup for team4; acceptance keeps legacy body layout as-is).
