# Tasks: Security CI gates (secret scanning + dependency audit)

Issue: #302
Base: 735d869a9b504f7034b9c942f6838cabb119bf63

- [x] Add `secret-dependency-scan` job to canonical `SLF CI` with full-history checkout.
- [x] Install pinned gitleaks v8.30.1 with published checksum verification.
- [x] Scan full git history with inline commit+path-bounded `GITLEAKS_CONFIG_TOML` (`condition = "AND"`).
- [x] Audit `vps/api/requirements.txt` and `vps/exporter-rag/requirements.txt` with pinned `pip-audit==2.10.1`.
- [x] Wire `secret-dependency-scan` into aggregate `ci` needs/result loop preserving `if: always()`.
- [x] Extend `CI` purpose in `data/quality/workflow-inventory-v1.json` (gitleaks + pip-audit).
- [x] Write `spec.md`, `plan.md`, `tasks.md` under `specs/302-security-ci-gates/`.
- [x] Positive proof: exact inline TOML scans the worktree with 0 leaks / exit 0.
- [x] Negative-control proof A: fake token at an allowlisted path in a NEW (unlisted) commit is flagged (exit 1).
- [x] Negative-control proof B: fake token on a non-allowlisted path is flagged (exit 1).
- [x] Sanity proof: paths+`AND` without the `commits` list would suppress control A (exit 0), showing the commit list is load-bearing.
- [x] Validation battery: YAML parse + workflow-inventory + quality-governance + bundle-order pass.
- [x] Scope check: diff limited to the five approved paths.
- [ ] Issue #302 acceptance: CI run green with gitleaks + pip-audit as blocking `secret-dependency-scan`.
- [ ] Issue #302 acceptance: baseline triaged — fixed or documented (16 historical findings / 4 distinct literals / 10 distinct commits adjudicated by commit+path).

## Definition of Done

`secret-dependency-scan` runs inside the canonical `SLF CI` workflow, blocks the single required context `SLF CI / ci`, uses pinned/checksum-verified tooling with read-only permissions, embeds no secret values, suppresses only the 10 adjudicated historical commits (never future commits), and the baseline is triaged so that a green CI run is achievable. The five approved paths are the only changed files.
