# Tasks — Tactics 2026 revision (#405)

- [ ] T1. Review matrix `docs/audit/preset-vector-revision-2026-11.md`: 13×15 cells + per-preset records + «unchanged, not validated» labels (plan §1).
- [ ] T2. Engine semantic fixes per R2, each with claim citation in code comment or audit doc; no uncited behavior changes.
- [ ] T3. P04 population + transition protocol in `tactical-lab-v1.js` (plan §3): pinning, legacy resolution, attribution, endpoints.
- [ ] T4. Pack cases + fail-closed schema extension (exporter contour, separate PR).
- [ ] T5. Tests: transition suite, seam contract (+3/non-stack/±5/fail-closed/no-auto-apply), acceptance cases for every R2 fix.
- [ ] T6. Owner-visible before/after summary (issue comment or audit doc section) mapped to acceptance cases.
- [ ] T7. Independent review on diff (different model family); resolve findings.
- [ ] T8. PR → CI green → merge to `release` → userscript artifacts; exporter deploy if T4 landed.
- [ ] T9. Close #405 with evidence links (matrix, tests, release run).

## Constraints

- Numeric vectors unchanged. Retune gate untouched. Conflicts unresolved. Forward = context only.
- Test files for a landed fix are forbidden paths for follow-up code orders (fix orders are test-protected).
- Scratch only in `.tmp/` or `/tmp/opencode/`; nothing in repo root.
