# Tasks — Visible parse confirmation (#479)

Base: `1ff8489a3d8c057a885f30e2660330009b412e78`.

| Task | Work and evidence | Spec |
|---|---|---|
| [ ] T1 | Add a browser test asserting `#slf-parser-status` shows a success message after clicking «Спарсить завершённый» in the finished-match fixture; observe RED on base. | R1 |
| [ ] T2 | Add a failure-case assertion for a rejected send naming the error kind. | R2 |
| [ ] T3 | Update the parse handler to call `setParserStatus()` on resolve/reject; keep `addParserLog()` for detail. | R1, R2 |
| [ ] T4 | Make `#slf-parser-status` readable in the new design (no clipping, sufficient width); verify computed style in the dark fixture. | R1, NFR |
| [ ] T5 | Verify other log writers do not overwrite the status; verify no extra API request or tactic change from displaying status. | R3, R4 |
| [ ] T6 | Run canonical checks, rebuild bundle via builder only, peer + validator, exact-head CI, merge, release verification. | all |

## Definition of Done

- [ ] A manager sees a clear, visible success/failure message in `#slf-parser-status` after pressing the button.
- [ ] The message survives other log writes and is readable in the new design.
- [ ] No game-state mutation, no API logic change, no old-design regression.
- [ ] Generated outputs are never hand-edited; release verification is distinct from merge.
