# Tasks — #353 loan-limit panel re-anchor (fm2026)

Checklist with Definition of Done. All items verified by the implementing agent before handoff; see spec.md acceptance criteria and plan.md test design.

- [x] [A1] Recon: read `team-loan-limit-helper.js`, `test-tactic-dropdown-mount.mjs` (shim conventions), both workflow files, spec format. — done (facts in delivery report)
- [x] [A2] Re-anchor `getLoanRows()`: union of legacy `tr.view-team__player.pl--1` (visible) ∪ visible `#generallist tbody tr` with `span.player-loan` descendant; dedupe via Set; exclude tablesorter header rows structurally (direct `th` children). — done
- [x] [A3] `isLoanTabActive()`: preserve tab-gated branch verbatim when `.tpanel-a[data-tp="-1"]` exists; otherwise row-based activity (`getLoanRows().length > 0`); fail-closed preserved. — done
- [x] [A4] `bindTabs()`: keep click listener; add debounced (~200ms) `MutationObserver` on `#generallist` calling `render()`; guard when table absent or `MutationObserver` unavailable. — done
- [x] [A5] Evidence comment block (2026-10-16 live verification facts) at the top of the changed logic section. — done
- [x] [A6] No touch: styles, LIMIT constants, mount logic, other modules, `releases/*`, `data/version.json`, `CHANGELOG.md`. — verified via `git diff --stat`
- [x] [A7] New test `tools/test-loan-limit-fm2026.mjs` (T1–T7, self-contained, plain asserts, no new deps), header documents pre-fix failure map (T2/T3/T6 fail pre-fix; T1/T4/T5 are preservation guards; T7 pins the union semantics and fails pre-fix against the base helper). — done
- [x] [A8] CI registration: `node tools/test-loan-limit-fm2026.mjs` in `build-latest-release.yml`; `node --check` + run lines in `quality-integration.yml` — only those lines changed. — done
- [x] [A9] Specs (this set): `spec.md`, `plan.md`, `tasks.md` under `specs/slf-353-loan-limit-fm2026/`. — done
- [x] [A10] Accepted follow-up (peer review of #353, 2026-10-16): T7 added to the test (dedupe union + `visibility:hidden` row) and plan.md T2 fixture description drift fixed; `src/app/bundle-order.json` `hostCapabilities` metadata for the helper lists document/location/setTimeout but not the newly used MutationObserver/clearTimeout (CI check is one-directional) — flagged for a later manifest-only update, outside this task's allowed paths. — done

## Definition of Done

- [x] `node --check src/modules/team-management/team-loan-limit-helper.js` → exit 0.
- [x] `node tools/test-loan-limit-fm2026.mjs` → all T1–T7 pass (observed output recorded in delivery report).
- [x] Pre-fix evidence: same test against base-71478b0 helper fails T2 with `'none' !== 'block'` (expected), T1 passes (preserved).
- [x] `git diff --stat` → only allowed paths changed.
- [x] No build scripts run, no commit, no push, no git lifecycle operations.
