# Plan — Team4 roster name column collapse (#365)

## Contour

Userscript CSS only (`team4-leadership-upgrade-indicator.js` compaction block) + browser fixture + roster-subtab regression test + specs. No VPS, no CI-file, no release-artifact changes.

## Decisions

1. **Auto layout over fixed + px budget** (validated live, issue comment 6247010409): forcing `table-layout:auto` and dropping the per-column px widths fully restores the table (non-roster name th 398px; roster@1280 ≈ 180px). The fixed algorithm cannot be patched from CSS (`min-width` ignored, `calc()` probes dead), so the px budget itself is the defect. Percentage widths "work" but hard-code a budget that breaks per colset — rejected.
2. **Padding compensation math**: measured cost of auto layout at the plugin's 4px padding = **+12px** (roster table 700px vs 688px content column). Cell horizontal padding 4px→3px removes 2px from every one of the 16 columns' widest cell (cell padding is inside the column's auto width; the `rstat` 34px border-box floor is independent of td padding) → **32px saved ≥ 12px needed**; roster table ≈ 668px ≤ 688px (20px margin). Vertical padding untouched; `.rstat` inner rule untouched.
3. **`min-width:140px` floor kept** (works in auto layout, ignored in fixed): never binds on live @1280 (auto name ≈ 180–200px, others ≈ 490px → name space ≈ 198px), so no bloat; at narrower viewports it keeps names readable; if the table ever overflows, `.roster-scroll{overflow-x:hidden}` + the fixture `scrollWidth ≤ clientWidth+1` gate catch it. Horizontal scroll (last-resort option in the order) not needed.
4. **Kept as-is**: `.roster-scroll{overflow-x:hidden;max-width:100%}` (fit guard for the #363 grid), `th,td{box-sizing/overflow/ellipsis}` (paint protection only — does not affect auto sizing), `tbody td{font-size:12px}`, `.rstat{display:block;width:100%;padding:2px}` (inside the cell, no column impact). Removed exactly one selector group (nth-child 1,2,3,5–16 px widths) — audited lines 54–98: no other colset-specific width/fixed-layout rules exist in the block.
5. **Fixture reproduces the collapse regime, not a synthetic one**: content column 742→658px (fm-stage rail 76→160px) puts the roster scroll at 656px @1280 — the live 688px regime; reverted-fix name th = 656 − 638 = **18px < 30** (measured, see RED). Site-like adjustments: 12px header font (live probe ths 21–35px), short roster names («Мелихар Мелихар»-scale; no test asserted the old strings). Inline verify flipped `tableLayout` gate `fixed→auto` and added `nameThWidth>=120` + name-text-visibility gates — the flip is *required* by the fix (auto is now the contract) and keeps `test_fm2026_design_adapter.py` (team-main @1440: name th = 178px old / 140px new, both ≥120, so that suite passes exactly when the fixed bundle is present, as CI builds from source).
6. **RED mechanism** (harness facts): the roster-subtab test injects the artifact via `SLF_TEST_ARTIFACT` override (documented in its docstring); the adapter test has no override and pins `releases/latest.user.js`, so local adapter verification ran from the `/tmp` scratch tree whose `releases/latest.user.js` was genuinely built from the fixed source (repo `releases/` untouched). Baseline artifact = `git archive HEAD` build (module unfixed) ≡ the `git stash` state; literal stash skipped to protect uncommitted work.

## Risk profile

- **Live regression risk**: CSS-only change in one module; all #363/#364 behavioural rules byte-identical (sub-tab cycle + no-switcher cases pass in RED *and* GREEN runs).
- **Fit risk**: covered by the padding math (−32px vs +12px measured), the fixture fit gates (`scrollWidth ≤ clientWidth+1`, `tableRight ≤ wrapperRight+1`) and the roster-name case's own overflow readout (656/656 in RED, fit in GREEN).
- **Test design**: width assertions measured in the real browser against a real built bundle (baseline vs fixed), threshold 120px sits between the collapsed 18px and the floored 140px; the fixture page also self-checks, so a future re-introduction of `table-layout:fixed` throws in *both* suites.

## Correct-course impact

None — presentation-only CSS change inside one module; no contract, release-policy or VPS impact.
