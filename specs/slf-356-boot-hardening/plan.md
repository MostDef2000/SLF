# Plan — #356 boot hardening (per-step init isolation)

## Risk profile: LOW

- Three production files touched, each with a one-point behavioural change (guard wrapper, deferral branch, single-owner condition). No data contracts, no build pipeline, no release artefacts, no dependency changes.
- Worst case is a warning line in the console plus a degraded-but-alive UI; the fix strictly widens what survives a failure, it cannot break a currently-working path (every previously-successful sequence runs identically inside the new guards).
- CI impact: one new must-pass test registered in both workflows next to the #353 registrations; no workflow inventory change.

## Risk table

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Guard swallows a failure silently | low | debugging becomes harder | every catch logs the established `'[SLF] <step> failed; continuing startup'` format with the original error object; T1/T2 pin the exact per-step message and exactly-one-warning per pass |
| `console.warn` instead of `debugWarn` is noisy in production | low | a failing step warns on every observer pass | a step failing IS an abnormal condition worth surfacing (fail-visible); `debugWarn`/`CONFIG` references in bootstrap fail the dependency audit (observed), and the deviation + reason are documented in source comment and spec |
| Deferral changes mount timing on train.php | low | panel appears one microtask later | the deferral branch only triggers when `document.body` is null (document-start eval), where the current behaviour is a crash; body-present path is byte-identical in behaviour (T3b pins mount + idempotence) |
| Single-owner marker leaves an element un-stamped by the adapter | low | adapter styling keyed on `data-slf-mount` misses the panel | only nodes that ALREADY carry a marker from another owner are skipped — bootstrap's placement is that owner for the training panel; the layout wrapper (`fm2026-training-content`) still carries the adapter marker and stays inside the violation-check selector |
| New try/catch alters bundle audit metadata expectations | low | check-bundle-order fails | no new top-level declarations, no new audited-symbol references (debugWarn/CONFIG explicitly probed and avoided); check-bundle-order observed green after each edit |

## Test design

`tools/test-boot-continuation.mjs` — self-contained, node-runnable, no new deps (`node:assert/strict`; same vm + minimal DOM shim pattern as `test-loan-limit-fm2026.mjs`). Loads the REAL unmodified sources; bootstrap.js is loaded as a bundle segment (IIFE opener reproduced from bootstrap-preamble.js, self-start dropped, App exposed as a test-only handle — no production export). Env overrides (`SLF_BOOTSTRAP_PATH`, `SLF_TRAINING_GUIDE_PATH`, `SLF_TEAM4_PATH`) make the base-revision RED run a pure env change. A catch-and-continue runner prints the FULL failure map on a RED run and exits 1.

| Case | Fixture | Pin |
| --- | --- | --- |
| T1 | App.start() (readyState complete, synchronous PresetStorage callback), `TrainingGuidePanel.mount` throws | loan-limit-panel AND tactics-dropdown still ran in the same pass; install-observer still registered; start() does not propagate; exactly one warning in the established format with the original error object |
| T2 (×6) | each of the 6 steps rigged to throw in its own fresh sandbox (benchmarks-card via its real DOM path: /train.php + `.train__champ` under a parent without `insertBefore`; tactic-preset-library via a deleted sandbox global so the unqualified read throws) | head steps ran; all later steps still ran; mountUI never propagates (incl. the LAST step's throw); exact per-step warning message; error identity/name |
| T3a | eval-time self-start with `document.body = null`, readyState loading, /train.php | no throw at eval; a `DOMContentLoaded` listener registration is captured (`{ once: true }`) |
| T3b | body present, `#slf-calc`/`#slf-sources`/`#slf-result` planted, `Api.getPromise` stubbed pending | eval-time mount still mounts (panel appended to body), second `mount()` is an idempotent no-op |
| T4a | fm2026 doc with a panel already marked `fm2026-training-before-champ` | marker NOT overwritten by decorate(..., 'fm2026-training-content') |
| T4b | fm2026 doc with an unmarked notice element | node without a marker GETS `fm2026-team-content` |

Pre-fix failure map (base e775f72, `git show` copies + env overrides — OBSERVED, exit 1, 9 failing cases): T1 FAIL (`Error: boom training-guide-mount` propagates out of start()); all six T2 variants FAIL at `a single step failure must never propagate out of mountUI` (the base mountUI aborts at the rigged step — missing-tail semantics; for the last step the error escapes mountUI itself); T3a FAILS with `TypeError: Cannot read properties of null (reading 'appendChild')` at base training-reference-guide.js:271 thrown from the :279 eval-time self-start; T4a FAILS with `'fm2026-training-content' !== 'fm2026-training-before-champ'` (the exact clobber the fix prevents). T3b and T4b pass pre-fix by design (preservation guards).

## Correct-course check

- Work order bounds the change to 3 modules + 1 new test + 2 workflow files + this SDD set; `git diff --stat` audited at handoff; no scope drift.
- The debugWarn-vs-console.warn conflict inside the order (use debugWarn / don't touch bundle-order.json / check-bundle-order must pass) is resolved through the order's own explicit fallback clause and recorded as a finding, not silently.
