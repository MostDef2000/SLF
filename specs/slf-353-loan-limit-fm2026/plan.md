# Plan — #353 loan-limit panel re-anchor (fm2026)

## Risk profile: LOW

- One production file touched (`src/modules/team-management/team-loan-limit-helper.js`), three methods (`isLoanTabActive`, `getLoanRows`, `bindTabs`); no data contracts, no build pipeline, no release artefacts.
- The userscript is additive on the page: worst case is a hidden or stale panel, never a broken squad page (fail-closed no-op preserved and tested).
- CI impact: one new must-pass test registered in both workflows next to the #351 registrations.

## Risk table

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Site ships yet another markup change | medium | panel goes stale/hidden again | detection is dual-anchored (legacy class ∪ `span.player-loan`); fail-closed keeps it invisible rather than wrong; live facts + date recorded in code comment |
| Text-matching regressions («аренд. номинал» header trap) | low | inflated loan counts | structural exclusion only (direct `th` children, `span.player-loan` presence); T3 pins it |
| MutationObserver feedback loop | low | render storm | observer watches only `#generallist`; `render()` writes its own box AFTER the table and never mutates table children; debounce 200ms; T6 pins re-render semantics |
| Old-design regression | low | broken legacy panel | tab-gated branch preserved verbatim (early-return on `.tpanel-a[data-tp="-1"]` + `/аренд/i`); T1 pins old-design totals |
| Environment without MutationObserver | very low | crash on mount | `typeof MutationObserver === 'function'` guard → click listener only (pre-#353 behaviour) |

## Test design

`tools/test-loan-limit-fm2026.mjs` — self-contained, node-runnable, no new deps (plain `node:assert/strict`, same pattern as `test-tactic-dropdown-mount.mjs`): the REAL production module is loaded unmodified in a `vm` context with a minimal DOM shim (elements with classes/attrs/children/textContent, descendant-aware selector matcher for the selector subset the module uses, `getComputedStyle` mapped to inline style, timer map with explicit flush, stub `MutationObserver` registry).

| Case | Fixture | Pin |
| --- | --- | --- |
| T1 | old design: `.tpanel-a[data-tp="-1"]` «Аренды» + 2 legacy `pl--1` rows (ages 23/20) | «2/10», «1/5», visible — legacy semantics preserved (passes pre-fix too) |
| T2 | new markup, no tab, 3 visible `span.player-loan` rows + 1 `display:none` loan row + 1 plain row | visible, 3/10, 2/5 — row-based detection, hidden rows excluded (fails pre-fix: panel display:none) |
| T3 | 2 loan rows + `tablesorter-headerRow` with «аренд. номинал» text | header row not counted (2/10, never 3/10) (fails pre-fix) |
| T4 | no `#generallist` | mount/render silent no-ops, box absent, no observer registered |
| T5 | table, zero loan rows | box mounts but `display:none`, `readLoanState().total === 0`, no crash |
| T6 | 1 loan row → mutation adds another | observer registered on `#generallist` (`childList`, `subtree`); firing the callback + flushing timers re-renders 1/10 → 2/10, 1/5 |
| T7 | 1 dual-anchor row (legacy `pl--1` class AND `span.player-loan` child) + 1 legacy-only row + 1 `span.player-loan`-only row + 1 plain row + 1 `visibility:hidden` loan row | union counts the dual-anchor row exactly ONCE (3/10, not 4 — Set dedupe); `visibility:hidden` excluded (`isVisible` checks display AND visibility) — pins the union semantics (fails pre-fix: base helper is legacy-only → 2 rows) |

Pre-fix failure map (base 71478b0, reproducible via `SLF_LOAN_LIMIT_HELPER_PATH=<old file> node tools/test-loan-limit-fm2026.mjs`): **T2, T3 fail** (`'none' !== 'block'` — the dead-panel symptom), **T6 fails** (no observer), **T7 fails differently** (no union in the base helper: with `pl--1` rows present the old tab/legacy path activates and returns 2 rows, so T7's count assert fails — it pins the NEW union semantics, not the dead-panel symptom). T1/T4/T5 pass pre-fix by design (preserved semantics).

## Correct-course check

- Work order bounds the change to the single module + new test + 2 workflow files + this SDD set; no scope drift (no styles/constants/mount/generated-file edits).
- Verification is machine-checked: `node --check`, the new test (post-fix green, pre-fix partially red as documented), `git diff --stat` path audit.
