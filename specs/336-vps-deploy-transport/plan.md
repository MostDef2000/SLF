# Plan: VPS deploy transport (push-model launcher + deploy workflow)

Tracking: deploy-unification T7b (orchestrator work order; no GitHub issue)
Base: 9864a050bd3634e944120b30d93eccf2f006368f

## Implementation

1. **PART 1 — rollback completeness.** Extend `vps/ops/rollback-code.sh`
   exporter `FILES` to exactly mirror `deploy-code.sh` (add
   `slf_common_utils.py`, `slf_manifest_integrity.py`), extend the removal
   branch to clean them when present, keep `py_compile` conditional on the
   file being restored. Pin equality with a new test in
   `vps/ops/tests/test_deploy_files_completeness.py`.
2. **Launcher.** Write `deploy/vps/slf-deploy-launcher` against the unified
   contract: verbs `slf-deploy-v1`, `slf-rollback-v1`, `slf-status-v1`; exact
   regex dispatch; fail-closed shell (`set -Eeuo pipefail`, ERR trap, no
   eval/process substitution); contract lock with `flock -n` + self-heal;
   bundle acceptance via `git bundle list-heads` capture-then-match on
   `refs/slf-deploy-ship`; engine invocation `sudo -n` with verbatim exit-code
   propagation; byte-exact acceptance markers; drill-only `SLF_DEPLOY_*`
   overrides (repo dir, state dir, backup root, lock file).
3. **Workflow.** Write `.github/workflows/deploy-vps.yml`: workflow_dispatch
   with validated inputs; trusted-CI gate (Actions API query, fail-closed
   python verifier); pinned-SHA checkout + HEAD assertion; bundle build
   (`update-ref refs/slf-deploy-ship` → `bundle create` → `bundle verify`);
   SSH pipe with tee transcript; marker grep + previous-sha validation; api
   401 probe; `slf-status-v1` launcher-sha probe; transcript artifact.
4. **Governance registration (3 → 4).** Add the DEPLOY entry to
   `data/quality/workflow-inventory-v1.json` and bump `maxPermanentWorkflows`
   to 4; mirror the cap/count/roles in `tools/validate-workflow-inventory.mjs`
   and `tools/validate-quality-governance.mjs`; add deploy-source assertions
   to the inventory validator; update
   `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md` to v1.1.0 (§2 budget+roles,
   §3 PERMANENT wording, §9 validator list).
5. **Static contract tests.** `vps/ops/tests/test_deploy_transport_contract.py`
   (regex-based, no PyYAML dependency): launcher structure (verbs, markers,
   lock path + contention string, 40-hex anchoring, fail-closed semantics,
   no dynamic execution) and workflow structure (dispatch-only triggers,
   inputs, confirmation, gate reference, pinned checkout ref, marker
   presence, DR-009 secret absence). Wire both suites into canonical CI
   (runtime-tactics unittest step; `bash -n` the launcher in the
   release-evidence syntax step).
6. **Spec trio.** `specs/336-vps-deploy-transport/{spec,plan,tasks}.md`.

## Empirical anchors (verified during recon)

- `git bundle create <file> <raw-sha>` fails ("Refusing to create empty
  bundle"); bundling a ref created via `git update-ref` works and
  `list-heads` reports it. Hence the workflow's update-ref step.
- Unified markers are fixed substrings in both reference engines
  (`lifesim/deploy/deploy-engine`, `content/deploy/deploy-wrapper`):
  `DEPLOYMENT_ACCEPTED sha=… previous=…` / `DEPLOY_ROLLED_BACK sha=… previous=…`.
- The on-box engines: `deploy-code.sh --repo DIR --commit SHA --component
  api|exporter-rag [--backup-root DIR]` (api readiness = HTTP 401 on
  `http://127.0.0.1:5000/api/analysis`; writes `DEPLOYED_GIT_COMMIT`);
  `rollback-code.sh --backup DIR`; backups named
  `YYYYMMDDTHHMMSSZ-<component>-<sha>`.
- GitHub `choice` inputs use the `choices:` key.
- PyYAML is not a CI dependency → the contract test is regex-based.

## Risks and mitigations

- *BASH_REMATCH clobbering (found by the drill, fixed).* The original dispatch
  passed `${BASH_REMATCH[1]}` as a `require_sha` argument; `require_sha`'s own
  `[[ =~ ]]` overwrote `BASH_REMATCH`, so under `set -u` every valid verb
  aborted with an unbound-variable error before the lock was taken. Fix: copy
  the dispatch groups into `SHA`/`COMPONENT`/`MODE` locals before calling
  `require_sha`; pinned by
  `test_launcher_captures_dispatch_groups_before_any_call` and proven by the
  full functional drill.

- *Runner races a push between gate and checkout* → checkout uses the gate's
  output SHA and asserts HEAD == SHA; a race fails the deploy, never deploys
  the wrong tree.
- *Bundle transport mangles binary* → bundle is piped raw on stdin and
  verified on-box (`git bundle verify` + list-heads match) before any engine
  runs; transcript tee proves the on-box view.
- *Lock pre-check races* → acceptance is capture-then-match on `flock -n`
  output; the pre-check is advisory only.
- *Sandbox cannot write `/var/tmp`* → drill-only `SLF_DEPLOY_LOCK_FILE`
  override; production default remains the contract path.

## Out of scope (lane B/C handoff)

- Provisioning `secrets.SLF_VPS_DEPLOY_KEY/HOST/USER` and
  `SLF_VPS_KNOWN_HOSTS` values; sudoers entry; first production battle-test.
- Public exporter probe (no stable public exporter URL in the repo).
