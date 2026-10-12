# Spec: VPS deploy transport (push-model launcher + deploy workflow)

Tracking: deploy-unification T7b (orchestrator work order; no GitHub issue)
Status: Approved implementation
Base: 9864a050bd3634e944120b30d93eccf2f006368f

## Problem

The SLF VPS has two independent on-box code paths (`vps/ops/deploy-code.sh`,
`vps/ops/rollback-code.sh`) but no transport that carries code from GitHub to
the VPS. Earlier deploy paths pulled from the VPS side or relied on manual
scp, which has no provenance chain: nothing binds a deploy to a specific
commit that passed canonical CI, and rollback completeness is not pinned by
tests. The unified deploy contract (byte-exact `DEPLOYMENT_ACCEPTED` /
`DEPLOY_ROLLED_BACK` markers, git bundle as the code carrier, push-model
on-box launcher) is already established in `lifesim/deploy/deploy-engine` and
`content/deploy/deploy-wrapper`; SLF needs the same contract.

## Required behavior

- `deploy/vps/slf-deploy-launcher` implements the unified contract on-box:
  - `slf-deploy-v1 <40-hex sha> <api|exporter-rag>`: validate SHA and
    component, take the contract lock (`/var/tmp/slf-deploy.lock`, `flock -n`,
    self-healing 0666 file), verify the piped stdin is a git bundle whose
    `refs/slf-deploy-ship` head is exactly the requested SHA, fetch its
    objects into the existing checkout `$APP_REPO_DIR` (default
    `/opt/slf/slf-repo`) and detach HEAD onto the requested SHA, then run
    `sudo -n vps/ops/deploy-code.sh --repo $APP_REPO_DIR --commit <sha>
    --component <component>` (engine-from-checkout) and propagate the
    engine's exit code verbatim.
  - `slf-rollback-v1 <40-hex sha> <component>`: after taking the lock, create
    the state dir when missing, resolve the newest backup matching
    `YYYYMMDDTHHMMSSZ-<component>-<sha>` under the backup root (sha = the
    deploy whose backup is used), run `sudo -n vps/ops/rollback-code.sh
    --backup <dir>`, then restore the provenance chain: the restored-to sha
    is the `previous` field of that deploy's manifest record, checked out in
    `$APP_REPO_DIR` under a `git cat-file -e` guard; when no record exists
    (pre-transport manual state) or its objects are absent, the checkout is
    left unchanged and `restored_to=unknown` is recorded.
  - State layer: every accepted operation appends a provenance record to
    `$APP_REPO_DIR/deploy-state/deployment-manifest.jsonl` (JSONL, one object
    per line, schema `slf_deployment_manifest_v2`) carrying `kind`
    (`deploy|rollback`) and — on rollback records only — `restored_to`
    (explicit sha or `"unknown"`), alongside component/sha/previous/
    deployed_at/launcher_sha256.
  - `slf-status-v1`: read-only report of the transport block (launcher path
    and sha256, engine paths, lock path, checkout HEAD), the latest manifest
    records, and per-component recorded deployed shas (`DEPLOYED_GIT_COMMIT`,
    falling back to the manifest record) with a drift verdict against the
    on-disk checkout HEAD: `<component>_drift=false|true|absent`.
    Exit codes: `0` (`status=ok`) when every recorded component matches the
    checkout HEAD or has no recorded state yet, `1` (`status=drift`) when at
    least one recorded component drifted. Status is read-only.
  - Only the three verbs above are accepted (exact regex dispatch, anchored
    `^...$`); any other command is refused with exit 1, and the usage text
    exits 64; internal failures exit 1.
  - `set -Eeuo pipefail` + ERR trap; no `eval`, no process substitution; all
    acceptance via capture-then-match.
  - Markers are the engine's, byte-exact: `DEPLOYMENT_ACCEPTED sha=<sha>
    previous=<prev>` and `DEPLOY_ROLLED_BACK sha=<sha> previous=<prev>`.
    On the rollback verb the bytes stay `DEPLOY_ROLLED_BACK sha=${sha}
    previous=${prev}` with the semantics: sha = the deploy whose backup was
    used; previous = the sha that was live when the rollback started.
- `.github/workflows/deploy-vps.yml` is the GitHub-side push transport:
  - `workflow_dispatch` only (no push/pull_request/schedule triggers);
    inputs `deploy_sha` (must match `^[0-9a-f]{40}$`), `target`
    (`api|exporter-rag`), `confirmation` (must equal `deploy confirmed`,
    routed through `env` to avoid expression injection).
  - Trusted-CI gate, fail-closed: query the Actions API for the latest
    *completed* `quality-integration.yml` run triggered by `push` for
    `deploy_sha` on `refs/heads/main`, require head_sha == deploy_sha, event
    == push, status == completed, conclusion == success, the aggregate `ci`
    job successful, and every other job success or skipped. The gate only
    outputs `sha` after all checks pass.
  - Checkout pinned SHA with `ref: ${{ needs.gate.outputs.sha }}` plus a
    HEAD == SHA assertion (the runner cannot race the checkout).
  - Build the code bundle with `git update-ref refs/slf-deploy-ship` +
    `git bundle create` (raw-SHA bundles are refused by git) + `git bundle
    verify`.
  - Ship over SSH with the bundle piped on stdin, tee-transcribed to a
    `deploy-transcript` artifact (uploaded `always()` with overwrite);
    on-box acceptance is the byte-exact `DEPLOYMENT_ACCEPTED sha=<deploy_sha>
    previous=` line in the transcript (previous= is additionally validated
    as 40-hex when present).
  - `api` target additionally probes `https://slf-api.mostdef.ru/api/analysis`
    expecting HTTP 401 (unauthenticated) — DR-009: the SLF API bearer
    credential never enters GitHub secrets, so public read-only verification
    is used.
  - Post-deploy `slf-status-v1` probe captures the launcher's exit code (a
    sibling component may legitimately drift from the shared checkout HEAD
    right after deploying only one component — tolerated and documented) and
    hard-verifies the transcript by grep: it must contain
    `launcher_sha256=` AND record the target component's deployed sha equal
    to the dispatch sha (`<target>_deployed_sha=<deploy_sha>`); any miss
    fails the job.
  - All `uses:` pinned to full 40-hex SHAs (checkout
    `34e114876b0b11c390a56381ad16ebd13914f8d5`, upload-artifact
    `ea165f8d65b6e75b540449e92b4886f43607fa02`); job-level least-privilege
    `permissions`; bounded timeouts; SSH known_hosts supplied via repo
    variable (`SLF_VPS_KNOWN_HOSTS`), never `ssh-keyscan`.
- Rollback completeness is pinned: `vps/ops/rollback-code.sh` exporter `FILES`
  must exactly equal `deploy-code.sh`'s exporter `FILES`
  (`slf_common_utils.py` and `slf_manifest_integrity.py` were missing), and
  the rollback removal branch must clean them when present, with conditional
  `py_compile` unchanged in spirit.
- State layer: `write_state` appends one provenance record per accepted
  operation to `$APP_REPO_DIR/deploy-state/deployment-manifest.jsonl`
  (schema `slf_deployment_manifest_v2`). Every record carries `kind`
  (`deploy|rollback`); rollback records additionally carry `restored_to` —
  the sha the provenance chain was restored to (the `previous` of the deploy
  record whose backup was used), or `"unknown"` when the chain cannot be
  reconstructed or its objects are absent from the checkout.
- Governance: the permanent workflow budget grows 3 → 4 and `deploy-vps.yml`
  registers as PERMANENT with role `DEPLOY`; the budget is enforced in
  `data/quality/workflow-inventory-v1.json`, `tools/validate-workflow-inventory.mjs`
  (plus new deploy-source assertions: name, workflow_dispatch-only, no other
  triggers, dispatch inputs, gate reference), `tools/validate-quality-governance.mjs`
  (count/roles), and `contracts/SLF_WORKFLOW_LIFECYCLE_POLICY.md` (§2/§3/§9).
  Note: `data/quality/quality-gates-v1.json` `componentWorkflows` (== 3)
  intentionally scopes the PR-gate architecture and excludes the DEPLOY
  workflow — that mapping is about PR merge gates, not the workflow budget.
- Static contract tests pin all of the above
  (`vps/ops/tests/test_deploy_transport_contract.py`,
  `vps/ops/tests/test_deploy_files_completeness.py`) and both are wired into
  the canonical CI workflow (`quality-integration.yml` runtime-tactics job +
  `bash -n deploy/vps/slf-deploy-launcher` in the release-evidence job).
  The end-to-end launcher drill is committed as
  `vps/ops/tests/drill_deploy_transport.sh` (throwaway repo, stub engines,
  sudo shim, drill-only `SLF_DEPLOY_*` overrides; self-skips with exit 0
  when git/flock/sha256sum/mktemp are missing) and runs as a runtime-tactics
  CI step.

## Non-functional requirements

- The launcher is POSIX-shell-faithful bash with no dynamic execution; every
  mutation path is drill-overridable via `SLF_DEPLOY_*` env vars for tests
  only (production defaults are the contract paths: checkout and engine
  source `/opt/slf/slf-repo`, state `$APP_REPO_DIR/deploy-state`, backups
  `/var/backups/slf-code`, lock `/var/tmp/slf-deploy.lock`).
- No secret material in the repository: the workflow references secrets by
  name only (`secrets.SLF_VPS_DEPLOY_KEY`, `secrets.SLF_VPS_HOST`,
  `secrets.SLF_VPS_USER`); values are provisioned out-of-band (lane B/C).
- On-box engine invocation is `sudo -n` (non-interactive, fail-closed);
  the launcher header documents the sudoers shape (lane-B bootstrap).
- Every acceptance check is fail-closed: gate errors, empty stdin, bundle
  head mismatch, marker absence, and lock contention all abort the deploy.
- No dependency caching, no third-party actions, no tag-based deploys.

## Documented deviations

- **Third verb token.** The unified deploy-engine contract is
  `<verb> <40-hex sha>`; the SLF launcher adds a third closed-allowlist token
  `<api|exporter-rag>` because one VPS hosts two independent components and
  the on-box engines already dispatch on `--component`. Allowlist-closed,
  exact-regex dispatched.
- **Permanent workflow budget 3 → 4.** `deploy-vps.yml` is registered as a
  fourth PERMANENT workflow with role `DEPLOY` (policy v1.1.0). The
  workspace-level explore note suggested MIGRATION class; the work order
  decided PERMANENT because dispatch deploys are a standing lane-A duty.
  The cap change is enforced consistently in all three governance surfaces.
- **Drill-only env overrides.** The unified contract's lock path and
  directories are constants; the launcher additionally honors `SLF_DEPLOY_*`
  overrides so the full transport can be exercised in tests/sandboxes where
  `/var/tmp` is not writable. Defaults keep the contract
  paths; production bootstrap may pin them.
- **Status drift exit code.** `slf-status-v1` exits 1 on drift of any
  recorded component vs the shared checkout HEAD (`status=drift`), 0
  otherwise (`status=ok`). The deploy workflow tolerates a non-zero status
  exit (sibling-component drift is normal right after a single-component
  deploy) and instead hard-gates on transcript greps: `launcher_sha256=`
  plus `<target>_deployed_sha=<dispatch sha>`.
