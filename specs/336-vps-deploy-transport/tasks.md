# Tasks: VPS deploy transport (push-model launcher + deploy workflow)

Tracking: deploy-unification T7b (orchestrator work order; no GitHub issue)
Base: 9864a050bd3634e944120b30d93eccf2f006368f

- [x] Extend `vps/ops/rollback-code.sh` exporter FILES to mirror deploy-code.sh (+removal branch, conditional py_compile).
- [x] Pin rollback/deploy FILES equality in `vps/ops/tests/test_deploy_files_completeness.py`.
- [x] Write `deploy/vps/slf-deploy-launcher` (3 verbs, exact dispatch, fail-closed shell, contract lock, bundle verification, byte-exact markers, verbatim exit codes, drill-only overrides); `chmod +x`.
- [x] Write `.github/workflows/deploy-vps.yml` (dispatch-only, validated inputs, fail-closed trusted-CI gate, pinned-SHA checkout, bundle build/verify, SSH stdin pipe + transcript, marker + previous-sha checks, api 401 probe, status probe, artifact upload).
- [x] Register deploy workflow: inventory entry + cap 3→4 in `workflow-inventory-v1.json`, `validate-workflow-inventory.mjs` (+deploy-source assertions), `validate-quality-governance.mjs`, `SLF_WORKFLOW_LIFECYCLE_POLICY.md` v1.1.0.
- [x] Write `vps/ops/tests/test_deploy_transport_contract.py` (now 20 tests incl. provenance/state-layer and workflow status-probe pins) and wire both test suites + launcher `bash -n` into canonical CI.
- [x] Review round: rollback restores the provenance chain (state-dir creation, restored-to checkout under `git cat-file -e` guard, `restored_to=unknown` fallback); manifest is append-only JSONL v2 with `kind` + `restored_to`; `prev`/`backup` resolution moved after the lock in both mutating verbs; status reports per-component drift (`<component>_drift=`) and exits 0/1; workflow status probe tolerates the launcher exit code and hard-gates on `launcher_sha256=` + `<target>_deployed_sha=<dispatch sha>`.
- [x] Commit the launcher drill into the repo as `vps/ops/tests/drill_deploy_transport.sh` (parameterized fixture, self-skipping) and wire it as a runtime-tactics CI step.
- [x] Update governance prose: `contracts/SLF_GOVERNANCE.md` §8 budget four; dated supplement appended to `docs/decision_records/DR-013-consolidated-ci-release-workflows.md` (history untouched, Status stays Active).
- [x] Write `specs/336-vps-deploy-transport/{spec,plan,tasks}.md`.
- [x] RED proof A: dropping a file from rollback FILES fails `test_rollback_files_match_deploy_files` (observed: `FAIL: test_rollback_files_match_deploy_files … FAILED (failures=1)`; restored + `cmp` OK).
- [x] RED proof B: mutating the launcher acceptance marker fails `test_launcher_contains_byte_exact_markers`; mutating the lock path fails `test_launcher_contains_contract_lock_path` (both observed; restored + `cmp`).
- [x] RED proof C: adding a `push:` trigger to the deploy workflow fails `test_workflow_is_workflow_dispatch_only` (observed; restored + `cmp`).
- [x] Launcher functional drill (now committed in-repo, PASS=19 FAIL=0) — bad SHA refused; unknown verb refused; empty stdin refused; bundle head mismatch refused; happy-path deploy emits byte-exact `DEPLOYMENT_ACCEPTED sha=<sha> previous=<prev>` (previous= falls back to checkout HEAD); second deploy carries the new previous; lock contention refused with the exact contract string; rollback emits `DEPLOY_ROLLED_BACK …`, the engine receives the resolved backup dir, the rollback record carries `kind=rollback` + `restored_to`, and the checkout moves to the restored-to sha; status after rollback reports no drift and exits 0; the post-rollback deploy's marker carries `previous=<restored-to>`; a forged stale record makes status report `api_drift=true` + `status=drift` and exit 1; engine exit code 7 propagated verbatim. (Drill found and fixed a real launcher bug: BASH_REMATCH clobbered by require_sha under `set -u` — see plan risks.)
- [x] Marker byte-diff: launcher's `echo "DEPLOYMENT_ACCEPTED sha=${sha} previous=${prev}"` and `echo "DEPLOY_ROLLED_BACK sha=${sha} previous=${prev}"` are character-identical to `lifesim/deploy/deploy-engine:326,332`; the fixed substrings `DEPLOYMENT_ACCEPTED sha=` and ` previous=` are byte-identical across launcher, engine, and `content/deploy/deploy-wrapper` (wrapper prints its own rollback verb `ROLLBACK_ACCEPTED`, which the unified contract does not require).
- [x] Validation battery (review round): 26 unittests green (6 files-completeness + 20 transport-contract); in-repo drill PASS=19 FAIL=0; `bash -n` on deploy-code.sh, rollback-code.sh, slf-deploy-launcher; YAML parse of both workflows; workflow-inventory (`active=4 permanent=4`), quality-governance (`workflows=4`), security-boundaries, deliberate-execution validators all pass; marker lines byte-identical to `lifesim/deploy/deploy-engine:326,332`; `git status --short` limited to the intended file set; nothing committed.
- [ ] Lane B/C handoff: provision SSH secret/vars + sudoers + first production dispatch (owner/sysadmin).

## Definition of Done

`deploy/vps/slf-deploy-launcher` implements the unified contract on-box
(verbs, contract lock, bundle verification, byte-exact markers, verbatim
exit codes, kind-tagged provenance records, restored-to chain, drift-
reporting status), `deploy-vps.yml` pushes trusted-CI-verified bundles to it
with fail-closed gates and a transcript audit trail, rollback completeness
is test-pinned, the fourth workflow is registered in all governance surfaces
(including the governance prose and the DR-013 supplement), the drill is
committed and CI-wired, static contract tests are green and CI-wired, and
every acceptance criterion above has an observed RED or GREEN proof. No
commits are made by the implementer.

## Battle-test incident log

- 2026-10-12, first live dispatch (run 38207004853, target exporter-rag,
  deploy_sha b657bbd9…): gate green, bundle verified on-box, launcher
  resolved previous=d704ff8d… from the exporter's DEPLOYED_GIT_COMMIT,
  engine invocation failed with sudo "command not found" — both engine
  scripts were committed as 100644 (non-executable); failure occurred
  before any mutation (prod untouched, no manifest record, no backup).
  Root cause never reachable by the sandbox drill (scratch engines were
  created executable). Fix: exec bits in git index (100755) + pin test
  `test_engine_scripts_are_executable` (RED-proven). Related dispatch-side
  defect fixed the same day: GitHub choice-index 422 for never-run
  workflows (UI dropdown empty) — target input changed to `type: string`
  with the in-workflow fail-closed whitelist unchanged (PR #340).
