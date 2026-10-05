# Spec: Security CI gates (secret scanning + dependency audit)

Issue: #302
Status: Approved implementation
Base: 735d869a9b504f7034b9c942f6838cabb119bf63

## Problem

The canonical `SLF CI / ci` gate enforced static analysis, contracts, security boundary tests, governance, runtime, reliability, browser and release evidence, but it did not scan the full git history for committed secret material and did not audit Python dependencies for known advisories. A historical secret literal can remain reachable in git history even after source remediation, and a transitive dependency advisory can reach `main` without any repository source change.

## Required behavior

- Run a full git history secret scan on every pull request as a mandatory `secret-dependency-scan` job inside the canonical `SLF CI` workflow.
- Use the pinned official gitleaks v8.30.1 binary, verified against its published SHA-256 checksum, because `gitleaks-action@v2` is PR-diff-only and does not scan history.
- Configure gitleaks through inline `GITLEAKS_CONFIG_TOML` with `[extend] useDefault = true` and a baseline allowlist bounded by **both** commit SHA and repository path (`condition = "AND"`). Only the 10 commits that introduced the 16 adjudicated historical findings are exempt; new commits on any path remain fully scanned, so there are no future blind spots. No secret value is ever embedded in the repository configuration.
- Fail the job (and therefore the aggregate `ci` job) on any gitleaks leak (`--exit-code 1`) and on any pip-audit advisory.
- Audit both `vps/api/requirements.txt` and `vps/exporter-rag/requirements.txt` with pinned `pip-audit==2.10.1`.
- Add the new job to the aggregate `ci` job's `needs` list while preserving `if: always()` so a failing scan blocks the single required context `SLF CI / ci`.

## Non-functional requirements

- All external tool versions are pinned: gitleaks v8.30.1 with checksum verification; `pip-audit==2.10.1`.
- The workflow remains least-privilege: workflow-level `permissions: contents: read`; the new job requests no elevated permissions.
- The new job uses `runs-on: ubuntu-24.04`, a bounded `timeout-minutes`, and the repository-pinned `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5` with `fetch-depth: 0`.
- No artifact uploads, no dependency caching, no secret values in repository files.
- The allowlist matches commit SHA **and** path together (`condition = "AND"`), so suppression cannot extend to future commits; values are never written to the repository.

## Documented deviations

- **Job-in-canonical-CI per inventory contract.** Secret scanning and dependency audit are added as a job inside `.github/workflows/quality-integration.yml` rather than a separate workflow, so the workflow-inventory permanent budget (3) and the single required context `SLF CI / ci` remain intact.
- **Binary instead of gitleaks-action.** `gitleaks-action@v2` scans only the PR diff (`src/gitleaks.js:108-115`); the full-history requirement mandates the official pinned binary.
- **pip-audit stronger-than-HIGH+ semantics.** pip-audit 2.10.1 has no `--audit-level` flag. Plain invocation exits non-zero on *any* known vulnerability, which is stronger than a HIGH-and-above threshold. This is intentional and documented in `plan.md`.
