from __future__ import annotations

import os
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
LAUNCHER = ROOT / "deploy" / "vps" / "slf-deploy-launcher"
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-vps.yml"

# Byte-exact unified contract strings (lifesim/deploy/deploy-engine:326,332;
# content/deploy/deploy-wrapper:335 prints the same fixed substrings).
MARKER_ACCEPTED = "DEPLOYMENT_ACCEPTED sha=${sha} previous=${prev}"
MARKER_ROLLED_BACK = "DEPLOY_ROLLED_BACK sha=${sha} previous=${prev}"
# Byte-exact contention string (single-flight refusal on the deploy lock).
LOCK_CONTENTION = 'flock -n 8 || err "another slf deploy is active (lock $LOCK_FILE)"'
LOCK_PATH = "/var/tmp/slf-deploy.lock"
SHA_REGEX = "^[0-9a-f]{40}$"


def strip_comments(source: str) -> str:
    """Drop comment-only lines so prose never satisfies a code assertion."""
    return "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("#")
    )


class LauncherTransportContractTest(unittest.TestCase):
    """slf-deploy-launcher must implement the unified deploy contract.

    Static contract pinning for the T7 push-model transport: exact-match
    verbs, 40-hex-only SHA acceptance, self-heal /var/tmp lock with
    fail-closed contention, byte-exact acceptance/rollback markers.
    """

    def setUp(self):
        self.assertTrue(
            LAUNCHER.is_file(),
            "deploy launcher missing: deploy/vps/slf-deploy-launcher",
        )
        self.launcher = LAUNCHER.read_text(encoding="utf-8")
        self.code = strip_comments(self.launcher)

    def test_launcher_is_executable_and_parses(self):
        self.assertTrue(
            os.access(LAUNCHER, os.X_OK),
            "deploy/vps/slf-deploy-launcher must keep the executable bit",
        )
        result = os.system(f"bash -n {LAUNCHER} 2>/dev/null")
        self.assertEqual(result, 0, "deploy launcher must pass bash -n")

    def test_engine_scripts_are_executable(self):
        # The launcher invokes both engines directly via sudo
        # (`sudo -n /opt/slf/slf-repo/vps/ops/{deploy,rollback}-code.sh`).
        # A non-executable git mode (100644) makes sudo fail with
        # "command not found" for every deploy — first live dispatch
        # 2026-10-12 (run 38207004853) failed exactly this way before any
        # mutation; caught here so it can never ship again.
        for rel in ("vps/ops/deploy-code.sh", "vps/ops/rollback-code.sh"):
            path = ROOT / rel
            self.assertTrue(path.is_file(), f"{rel} missing from the repo")
            self.assertTrue(
                os.access(path, os.X_OK),
                f"{rel} must keep the executable bit (engine is invoked via direct sudo exec)",
            )

    def test_launcher_uses_fail_closed_shell_semantics(self):
        self.assertIn("set -Eeuo pipefail", self.code)
        self.assertIn("trap on_err ERR", self.code)

    def test_launcher_contains_contract_lock_path(self):
        self.assertIn(
            LOCK_PATH,
            self.code,
            "deploy launcher must lock the unified contract path "
            f"{LOCK_PATH} (drill override default)",
        )
        self.assertIn("flock", self.code, "deploy launcher must flock the lock file")

    def test_launcher_contains_byte_exact_contention_string(self):
        self.assertIn(
            LOCK_CONTENTION,
            self.code,
            "deploy launcher contention refusal must match the unified "
            "contract string exactly",
        )

    def test_launcher_contains_byte_exact_markers(self):
        self.assertIn(
            MARKER_ACCEPTED,
            self.code,
            "deploy launcher must print the byte-exact unified acceptance marker",
        )
        self.assertIn(
            MARKER_ROLLED_BACK,
            self.code,
            "deploy launcher must print the byte-exact unified rollback marker",
        )

    def test_launcher_accepts_only_exact_40_hex_shas(self):
        # require_sha enforces the canonical regex verbatim.
        self.assertIn(
            SHA_REGEX,
            self.code,
            "deploy launcher must validate SHAs against ^[0-9a-f]{40}$",
        )
        # No free-form acceptance: the two mutating dispatch regexes must
        # anchor on a 40-hex group (never a laxer pattern).
        dispatches = re.findall(r'if \[\[ "\$cmd" =~ (.+?) \]\]; then', self.code)
        self.assertGreaterEqual(
            len(dispatches),
            2,
            "deploy launcher must dispatch deploy and rollback verbs via exact regex",
        )
        for pattern in dispatches:
            self.assertIn("[0-9a-f]{40}", pattern, f"dispatch regex lacks 40-hex sha: {pattern}")

    def test_launcher_declares_all_three_verbs(self):
        for verb in ("slf-deploy-v1", "slf-rollback-v1", "slf-status-v1"):
            self.assertIn(verb, self.code, f"deploy launcher must declare verb {verb}")

    def test_launcher_captures_dispatch_groups_before_any_call(self):
        # Regression (drill C4-C9): require_sha invokes its own `[[ =~ ]]`,
        # which clobbers BASH_REMATCH. Under `set -u`, passing
        # "${BASH_REMATCH[1]}" as a require_sha argument and reading the
        # groups afterwards aborts the launcher with an unbound variable.
        # The dispatch must copy the groups into locals first.
        self.assertNotIn(
            'require_sha "${BASH_REMATCH',
            self.code,
            "BASH_REMATCH must be copied into locals before require_sha clobbers it",
        )
        for mode in ("deploy", "rollback"):
            expected = (
                f'SHA="${{BASH_REMATCH[1]}}"; '
                f'COMPONENT="${{BASH_REMATCH[2]}}"; MODE="{mode}"'
            )
            self.assertRegex(
                self.code,
                r"(?m)^\s*" + re.escape(expected),
                f"{mode} dispatch must capture groups before validation",
            )

    def test_launcher_has_no_dynamic_execution_or_process_substitution(self):
        self.assertNotIn("eval ", self.code, "deploy launcher must not use eval")
        self.assertNotIn("<(", self.code, "deploy launcher must not use process substitution")
        self.assertNotIn(">(", self.code, "deploy launcher must not use process substitution")

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def function_body(code: str, name: str) -> str:
        m = re.search(rf"(?ms)^{re.escape(name)}\(\) \{{.*?^\}}$", code)
        assert m, f"function {name}() not found in launcher"
        return m.group(0)


class LauncherProvenanceContractTest(unittest.TestCase):
    """State-layer pins: rollback must restore the provenance chain
    (state dir, restored-to checkout, kind-tagged manifest records) and
    status must report per-component drift with a fail-closed exit code."""

    @classmethod
    def setUpClass(cls):
        path = LAUNCHER
        assert path.is_file(), f"deploy launcher missing: {path}"
        cls.code = path.read_text(encoding="utf-8")

    def body(self, name: str) -> str:
        return LauncherTransportContractTest.function_body(self.code, name)

    def test_rollback_prepares_state_dir_before_write_state(self):
        body = self.body("do_rollback")
        self.assertIn(
            'install -d -m 0700 "$STATE_DIR"',
            body,
            "do_rollback must create the state dir before writing state",
        )
        self.assertLess(
            body.index('install -d -m 0700 "$STATE_DIR"'),
            body.index("write_state "),
            "state-dir creation must precede write_state in do_rollback",
        )

    def test_rollback_restores_provenance_chain(self):
        body = self.body("do_rollback")
        self.assertIn(
            "manifest_previous_of_deploy",
            body,
            "do_rollback must resolve the restored-to sha from the deploy record",
        )
        self.assertIn(
            'cat-file -e "${restored_to}^{commit}"',
            body,
            "do_rollback must guard the restored-to checkout with git cat-file -e",
        )
        self.assertIn(
            'checkout --quiet --detach "$restored_to"',
            body,
            "do_rollback must check out the restored-to sha when objects are present",
        )
        self.assertIn(
            'restored_to=\'\'',
            body,
            "do_rollback must fall back to restored_to=unknown when unresolvable",
        )

    def test_manifest_records_carry_kind_and_restored_to(self):
        body = self.body("write_state")
        self.assertIn("slf_deployment_manifest_v2", body, "manifest schema must be v2")
        self.assertIn('"kind": "', body, "manifest records must carry a kind field")
        self.assertIn('"restored_to": "', body, "rollback records must record restored_to")
        deploy_call = re.search(r'write_state "\$component" "\$sha" "\$prev" "deploy" ""', self.code)
        rollback_call = re.search(
            r'write_state "\$component" "\$sha" "\$prev" "rollback" "\$restored_to"', self.code
        )
        self.assertIsNotNone(deploy_call, "do_deploy must record kind=deploy")
        self.assertIsNotNone(rollback_call, "do_rollback must record kind=rollback with restored_to")

    def test_status_reports_drift_with_fail_closed_exit(self):
        body = self.body("do_status")
        self.assertIn('_deployed_sha=${deployed:-absent}', body, "status must print per-component deployed shas")
        self.assertIn('_drift=false', body, "status must report per-component drift verdicts")
        self.assertIn('_drift=true deployed=${deployed} checkout=${repo_head}', body)
        self.assertIn("status=drift", body)
        self.assertIn("exit 1", body, "status must exit 1 on drift")
        self.assertIn("status=ok", body)
        self.assertIn("exit 0", body, "status must exit 0 when no drift")


class DeployWorkflowContractTest(unittest.TestCase):
    """.github/workflows/deploy-vps.yml must be a workflow_dispatch-only
    transport with exact-SHA inputs and the trusted-CI gate — no push,
    pull_request or schedule trigger, and no SLF_API_TOKEN (DR-009).
    """

    def setUp(self):
        self.assertTrue(
            WORKFLOW.is_file(),
            "deploy workflow missing: .github/workflows/deploy-vps.yml",
        )
        self.workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_workflow_is_workflow_dispatch_only(self):
        self.assertRegex(self.workflow, r"(?m)^on:\s*$")
        self.assertRegex(self.workflow, r"(?m)^\s*workflow_dispatch:\s*$")
        for trigger in ("push", "pull_request", "pull_request_target", "schedule"):
            self.assertNotRegex(
                self.workflow,
                rf"(?m)^\s*{trigger}:\s*$",
                f"deploy workflow must not carry a {trigger} trigger",
            )

    def test_workflow_declares_required_dispatch_inputs(self):
        for input_name in ("deploy_sha", "target", "confirmation"):
            self.assertIn(
                f"{input_name}:",
                self.workflow,
                f"deploy workflow dispatch input missing: {input_name}",
            )

    def test_workflow_checks_out_the_exact_validated_sha(self):
        self.assertIn(
            "ref: ${{ needs.gate.outputs.sha }}",
            self.workflow,
            "deploy workflow must check out exactly the gate-validated sha",
        )
        self.assertNotRegex(
            self.workflow,
            r"ref:\s*\$\{\{\s*github\.ref\s*\}\}",
            "deploy workflow must not check out a free-text ref",
        )

    def test_workflow_surfaces_byte_exact_acceptance_marker(self):
        self.assertIn(
            'grep -Fq "DEPLOYMENT_ACCEPTED sha=${DEPLOY_SHA} previous="',
            self.workflow,
            "deploy workflow must verify the byte-exact acceptance marker",
        )

    def test_workflow_gates_on_trusted_canonical_ci(self):
        self.assertIn(
            "quality-integration.yml/runs",
            self.workflow,
            "deploy gate must select trusted runs of quality-integration.yml",
        )

    def test_workflow_carries_no_api_token_secret(self):
        # DR-009: the SLF API bearer credential never enters GitHub secrets.
        # Comments may explain the policy; the usage pointer must not exist.
        self.assertNotIn(
            "secrets.SLF_API_TOKEN",
            self.workflow,
            "DR-009: the deploy workflow must never reference secrets.SLF_API_TOKEN",
        )
        self.assertIn(
            "secrets.SLF_VPS_DEPLOY_KEY",
            self.workflow,
            "deploy workflow must reference the SSH key secret by name",
        )

    def test_workflow_status_probe_hard_verifies_deployed_sha(self):
        # The status probe captures the launcher's exit code (a sibling
        # component may legitimately drift from the shared checkout HEAD)
        # but must hard-fail unless the transcript proves the transport
        # report and records the target component's deployed sha equal to
        # the dispatch sha.
        self.assertIn('grep -Fq "launcher_sha256="', self.workflow)
        self.assertIn(
            'grep -Fq "${{ needs.gate.outputs.target }}_deployed_sha=${{ needs.gate.outputs.sha }}"',
            self.workflow,
            "status probe must hard-verify the target component's deployed sha",
        )
        self.assertIn(
            "probe_rc=$?",
            self.workflow,
            "status probe must capture the launcher exit code instead of failing on sibling drift",
        )


if __name__ == "__main__":
    unittest.main()
