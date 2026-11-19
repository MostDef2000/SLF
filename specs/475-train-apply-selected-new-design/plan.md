# Plan — Prepare the FM 2026 bulk training panel (#475)

## 1. Recommended design

Keep the change inside `TrainingGuidePanel.applyProfile()` and, if useful, one module-local bulk-panel helper. Retain profile lookup, checked-player resolution, role compatibility, and finite rounded target validation. The role arrays already define the ten skills (`training-reference-guide.js:9–20`); selection and role guards are at `:148–164,194–205`. Do not introduce a second role registry.

After validation and **before** `inspectGroupFooter()`:

1. Look for the native `.train-bulk` associated with the training form. If absent, continue through the existing footer behavior (`:166–191,206–233`). If present, do not inspect or write a footer, even on error.
2. Resolve eleven unique native indices, their `.train-bulk__name` role labels (`data-f` or `data-gk`), and associated `.train-bulk__up` inputs. Validate the complete correspondence before mutation. Use native indices, not incidental DOM order.
3. Prepare the state the native handler consumes: skills 1–10 active, priority 1–10, editable numeric targets; skill 11 in the native off state. Reconcile against the desired state rather than toggling blindly. Preserve selection, rotation, and experience controls.
4. Report the prepared role, selection count, and native «Сохранить» next step. Do not emulate Save, construct its payload, or change its validation.

**Rejected alternatives:** Synthesizing a `tfoot` would make the guide look successful while leaving the real save controls empty. Posting a plan would turn a reversible preview into a game-state change. Reworking both layouts behind a new abstraction increases regression risk without improving the owner's workflow.

## 2. Risk profile and test design

| Priority | Failure mode | Discriminating check |
|---|---|---|
| High | Right-looking chips but wrong targets or priorities | Use distinct values for every skill in FIELD and GK cases. Assert native indices, orders, enabled inputs, and numeric values, not just status or CSS. |
| High | Accidental save or selection change | After fixture/cache initialization, count native save clicks, submissions, and requests to `/ajax/team3.9.php?a=train&ia=plan`; all remain zero across Apply. Compare checked IDs before and after. |
| High | Stale order or endurance survives reapplication | Start with chip 11 active and several noncanonical priorities; apply twice and compare complete panel states. |
| Medium | Wrong selection, partial profile, or missing control produces a partial draft | Snapshot the draft before each rejected apply; assert unchanged state and a visible error. |
| Medium | A test passes without exercising the reported failure | Use the actual guide button on a dark FM 2026 fixture with `.train-bulk` and no footer. Confirm the test fails on the base because the panel was not filled. Keep existing layout assertions. |
| Low | Legacy footer regression | Review the absent-panel branch against the base; retain existing regression coverage. Do not add an old-design browser acceptance lane. |

The current fixture has one field checkbox and no bulk controls (`tests/browser/fixtures/fm2026-training.html:26–32`). Extend it with selectable FIELD and GK rows and faithful eleven-chip markup. Do not put profile-filling logic in the fixture: it could make a broken userscript pass. Use a profile with at least one target above a selected player's current value so the example is useful, without submitting it.

## 3. Verification and correct-course check

From `SLF/`, during implementation, with the repository browser-test dependencies and Playwright Chromium available:

```sh
node tools/check-bundle-order.mjs
node tools/build-latest-userscript.mjs
python3 tests/browser/test_fm2026_design_adapter.py
```

Build before the browser run: the runner checks the artifact and audit manifest and executes training cases from `main()` (`tests/browser/test_fm2026_design_adapter.py:566–599`). Invoke it directly rather than assuming pytest collected the cases.

**Correct-course gate:** If the regression passes on the unmodified base, first check that the test clicked Apply and asserted the native inputs. If inputs look correct but native state differs from the verified site contract, correct the fixture or adapter and rerun both roles. Do not weaken assertions, switch to a legacy fixture, or send a real save request to obtain a pass. Stop for scope review if the fix requires changing the site's save logic, VPS, or another module.

## 4. Release impact

The eventual `src/**` change affects userscript runtime; automatic userscript release is expected after exact-head green CI and merge. The documentation alone does not establish release readiness. Use only the canonical builder, never hand-edit generated outputs, and verify the published release against the merged change. No VPS deploy or migration.
