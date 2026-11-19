# Tasks — FM 2026 «Применить к выбранным» (#475)

| Task | Work and evidence | Spec |
|---|---|---|
| [ ] T1 | Extend the dark FM 2026 training fixture with both player types, eleven indexed chips, native target inputs, and a native save control; keep `tfoot` absent. Observe the new Apply assertion fail on the base. | R1, R2, R6 |
| [ ] T2 | Preserve selection/profile guards. Validate the entire new-design panel before writing; distinguish absent panel from malformed panel. Keep absent-panel footer behavior unchanged. | R1, R4, R5 |
| [ ] T3 | Prepare role-correct targets and priorities, disable endurance, preserve selection, and show the manual-save instruction. | R1–R3, R6 |
| [ ] T4 | Exercise FIELD and GK via the real button; verify every target, order, enabled state, selection, and repeated Apply over a dirty draft. Assert zero native save clicks, submissions, and plan requests. | R1–R3, R6 |
| [ ] T5 | Check rejected selections, incomplete targets, and malformed markup against before/after snapshots. Review footer routing against the base; do not use old-design coverage as acceptance. | R4, R5 |
| [ ] T6 | Rebuild with the canonical tool, run the browser suite, verify keyboard activation and readable status, and record results and residual compatibility risk. | R1–R6, NFRs |
| [ ] T7 | For the runtime delivery, record exact-head CI, automatic release outcome, published artifact verification, and new-design acceptance separately. | R1, R6, release gate |

## Definition of Done

- [ ] A failing-before/passing-after dark new-design check reproduces the owner's operation, not merely guide mounting.
- [ ] Both vocabularies, chip 11, repeated Apply, unchanged selection, and preserved drafts on rejection have observable evidence.
- [ ] A prepared draft remains editable; status instructs the manager to press «Сохранить». No automatic save occurred.
- [ ] Footer fallback remains intact; no game save, VPS, other-module, or old-design enablement changes.
- [ ] Canonical build and browser checks pass. Generated outputs are **never hand-edited**.
- [ ] Review resolves NFR concerns or records their disposition. Release publication and product acceptance are evidenced separately from merge.
