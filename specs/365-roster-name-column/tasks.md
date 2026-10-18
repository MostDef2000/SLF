# #365 — executable acceptance checklist

- [x] [A1] `team4-leadership-upgrade-indicator.js` compaction block: `table-layout:fixed!important` removed from `#generallist`; all nine `nth-child` px-width rules (638px budget) deleted; `thead th`/`tbody td` horizontal padding 4px→3px; `.player-column-name{min-width:0;width:auto}` → `min-width:140px`; scroll-hidden, overflow/ellipsis, 12px body font and `.rstat` rules kept; #365 rationale comment in the template literal.
- [x] [A2] `tests/browser/fixtures/fm2026-team-main.html`: 16-column structure, `player-column-name` classes, `rstat` markup, lineup/badge/championship gates and `pl--1` loan rows all kept; content column narrowed to the 656px@1280 collapse regime (fm-stage rail 76→160px); th font 12px (site-like); roster names shortened to site-like strings; inline verify pins `tableLayout:'auto'`, adds `nameThWidth`/`nameTdWidth`/`nameTextVisible` evidence with `nameThWidth>=120` + text-inside gates.
- [x] [A3] `tests/browser/test_team4_championship_subtab_layout.py`: new `assert_roster_name_column_visible()` browser case @1280 (16 columns, `nameThWidth>=120`, `nameTextInside`) served from the fixture route; wired into `main()`; existing #363 sub-tab-cycle and no-switcher assertions untouched and passing in both RED and GREEN runs.
- [x] [A4] RED evidence (suite vs baseline bundle built from `git archive HEAD` — the `git stash`-equivalent pre-fix state; fixture routed as `/team4.php` so the pathname+1280px-gated championship panel mounts and the fixture's inline self-verify runs inside the case — `fixtureVerifyRan: True`):
  ```
  [team4-championship-subtab] passed: sub-tab cycle viewport=1440 version=4.4.339
  [team4-championship-subtab] passed: no-switcher-default viewport=1440 version=4.4.339
  Traceback (most recent call last):
    File "tests/browser/test_team4_championship_subtab_layout.py", line 421, in <module>
      main()
    File ".../test_team4_championship_subtab_layout.py", line 415, in main
      assert_roster_name_column_visible(browser, base_url)
    File ".../test_team4_championship_subtab_layout.py", line 393, in assert_roster_name_column_visible
      assert evidence["nameThWidth"] >= 120, evidence
  AssertionError: {'columns': 16, 'tableLayout': 'fixed', 'nameThWidth': 18, 'nameTdWidth': 18, 'nameTextWidth': 107.0625, 'nameTextInside': False, 'wrapperOverflow': {'scroll': 656, 'client': 656}, 'fixtureVerifyRan': True}
  ```
- [x] [A5] GREEN evidence (suite vs fixed bundle built from the working-tree module; new assertions in force: `wrapperOverflow.scroll <= client+1`, `fixtureVerifyRan`, `errors == []` — the fixture's own tableLayout/fit/name gates ran and passed without a page error):
  ```
  [team4-championship-subtab] passed: sub-tab cycle viewport=1440 version=4.4.339
  [team4-championship-subtab] passed: no-switcher-default viewport=1440 version=4.4.339
  [team4-championship-subtab] passed: roster-name-column viewport=1280 nameTh=146px textInside=True fixtureVerify=True version=4.4.339
  ```
- [x] [A6] Adapter suite (pristine `test_fm2026_design_adapter.py` bytes, fixture consumer) vs the fixed bundle built in `/tmp/opencode/365-roster/fixed` (repo `releases/` untouched): 10/10 green — match, transfer-market, transfer-hostile, transfer-history, team-main, training, transfer-responsive, transfer-narrow, team-responsive, training-responsive (version=4.4.339). Same suite vs the baseline bundle fails only team-main on the intentional `tableLayout:'auto'` fixture gate — CI builds from source, so the fixture gate and the fix ship together.
- [x] [A7] Static checks: `python3 -m py_compile` (both suites) OK; `node --check` module OK; `node tools/check-bundle-order.mjs` OK (90 modules, manifest complete, dependency audit green).
- [ ] [A8] External acceptance: CI green on the PR head (python playwright unavailable in the delivery sandbox by default — provisioned locally via pinned `tests/browser/requirements.txt` versions + extracted runtime libs under `/tmp/opencode/365-roster/`; CI installs its own pinned deps); live-site spot check on all five column-set tabs at 1280/1440/1600 by the owner.

## Operational, external and not implied

- [ ] Merge/PR/CI lifecycle handled by the delivery orchestrator; this task ships source changes only (no commit/push from the implementing agent; working tree left uncommitted for diff inspection).
- [ ] No release artifacts rebuilt or touched (`releases/`, `data/version.json`, `CHANGELOG.md` untouched in the repo; scratch builds live in `/tmp/opencode/365-roster/{baseline,fixed}`).
