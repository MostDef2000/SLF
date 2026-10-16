# Loan-limit panel re-anchored to the current team4.php squad markup (#353)

**Status:** orchestrator-dispatched work order (edit-only; no commit/push from the implementing agent). Branch: `fix/loan-limit-fm2026`, base `71478b0` (main at admission).

## Goal and user-visible behaviour

The inline loan-limit panel (`LoanLimitPanel`, `src/modules/team-management/team-loan-limit-helper.js`) works again on `team4.php` (default squad page) under the site's current markup (fm2026, both design states design=0 and design=1). The panel counts loaned players and the 23+ sub-limit («Всего N/10 · 23+ M/5» + status line) and mounts after `#generallist` as before. Old-design behaviour is preserved exactly; the fail-closed no-op is preserved exactly.

## Live DOM facts the fix is anchored to (verified 2026-10-16, owner session)

1. Squad table `#generallist` is ALIVE on `team4.php` (default action) with `tr.view-team__player` rows (69 rows on the probe team).
2. Loaned players are marked by `span.player-loan` INSIDE their row (text «аренда», title «Взят в аренду у клуба …»); stable in BOTH designs (3/3 loaned players matched live).
3. Old selectors are dead SITE-WIDE (not fm2026-only): `tr.view-team__player.pl--1` matches nothing (line classes now pl-0/pl-1/pl--3 with different semantics); `.tpanel-a[data-tp="-1"]` loan tab is absent (only one `.tpanel-a[data-tp="0"]` «Основная команда»).
4. Traps: `/аренд/i` text-matching also hits the table header «аренд. номинал»; tablesorter duplicates a header row (`tr.tablesorter-headerRow` with direct `th` children) inside tbody — row filters must exclude rows with direct `th` children.
5. Age column: `#generallist thead th` includes «Воз» at index 10 — existing `getAgeColumnIndex()` still works, untouched.
6. Mount point unchanged: `#generallist` → `table.insertAdjacentElement('afterend', box)`, untouched.
7. Pre-fix failure mode: under fm2026 the panel mounts but stays `display:none` forever because `isLoanTabActive()` always returns false (dead tab selector + dead pl--1 rows).

## Behaviour

- `getLoanRows()` returns the deduplicated union of (a) legacy visible `tr.view-team__player.pl--1` rows and (b) visible `tbody tr` rows of `#generallist` containing a `span.player-loan` descendant; rows with direct `th` children (tablesorter header duplicates) are excluded structurally, never by text matching.
- `isLoanTabActive()`: when a `.tpanel-a[data-tp="-1"]` tab EXISTS, the decision stays tab-based — return true iff its text matches `/аренд/i`; otherwise fall back to the LEGACY row check only (any visible `tr.view-team__player.pl--1` row), mirroring the pre-#353 behaviour exactly: a present non-matching tab is never overridden by the new row anchor. The row-based fallback (`getLoanRows().length > 0`, which includes the new `span.player-loan` anchor) applies ONLY when the `.tpanel-a[data-tp="-1"]` tab does not exist in the DOM at all (current site state, both designs).
- `bindTabs()`: the existing click listener stays; a `MutationObserver` on `#generallist` (debounced ~200ms) re-renders the panel when the squad table changes under the new markup. No loop risk: `render()` writes only its own box after the table and never mutates table children.
- Fail-closed: no `#generallist` → no box, silent no-ops; no visible loan rows → panel hidden (`display:none`), no crash.

## Out of scope

Styles, LIMIT constants (10/5), mount logic, `parseAge`/`getAgeColumnIndex`/`readLoanState`/`render`/`ensureBox`, all other modules, generated files (`releases/*`, `data/version.json`, `CHANGELOG.md`).

## Acceptance criteria

1. `node --check src/modules/team-management/team-loan-limit-helper.js` passes.
2. `node tools/test-loan-limit-fm2026.mjs` — T1–T8 all pass (T1 old-design tab-gated totals «2/10»/«1/5» visible; T2 new-markup row-based detection visible; T3 header trap not counted; T4 no anchors → silent no-op, no observer, box absent; T5 empty squad → hidden panel, no crash; T6 observer registered on `#generallist` and mutation callback re-renders with updated counts; T8 tab-gating boundary — a present non-matching `.tpanel-a[data-tp="-1"]` tab («Основная команда») with visible `span.player-loan` rows and no legacy pl--1 rows keeps the panel `display:none` (never overridden by the new row anchor), and the companion case with a present matching «Аренды» tab stays active/visible even with the new anchor present; third block positively pins the restored pre-#353 fallback line — present non-matching tab + visible legacy `pl--1` rows (no `span.player-loan`) → ACTIVE with legacy totals «1/10»/«1/5»).
3. Pre-fix failure map reproduced: T2 (and T3 by the same root cause) fail against the base-71478b0 helper with `'none' !== 'block'`; T6 fails pre-fix (no observer registered). T1/T4/T5 pass pre-fix (behaviour-preservation guards). T7 fails pre-fix differently (`2 !== 3`, no union). T8 fails pre-fix only at its union-count pins: main case at «loan rows ARE detected by the union» (base `getLoanRows()` is tab-gated → `[]` under an inactive tab) and companion at the «1/10» pin (base renders «0/10»); T8's tab-gating pins pass pre-fix (preserved legacy boundary).
4. Test registered in BOTH workflow files adjacent to the #351 registrations: `build-latest-release.yml` (validate step), `quality-integration.yml` (`node --check` step + runtime regressions step). Only registration lines changed.
5. `git diff --stat` shows changes only in: the helper module, `tools/test-loan-limit-fm2026.mjs` (new), both workflow files, `specs/slf-353-loan-limit-fm2026/*` (this SDD set).

## NFR assessment

- **Correctness:** evidence-anchored (live DOM facts 2026-10-16 encoded in comments + regression test); legacy path byte-equivalent in behaviour (tab present → same gate; pl--1 rows still counted via the union).
- **Fail-closed:** no `#generallist` / no rows → empty list / hidden panel (T4/T5).
- **Performance:** row scan is O(rows) per render; renders are event-driven (click, debounced 200ms mutations).
- **Risk:** low — single module, no schema/contract changes, no build/release artefacts touched.
