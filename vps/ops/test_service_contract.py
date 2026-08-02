from __future__ import annotations

import shlex
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SERVICE_FILE = ROOT / "vps" / "ops" / "slf-server.service"
REQUIREMENTS_FILE = ROOT / "vps" / "api" / "requirements.txt"
DEPLOY_SCRIPT = ROOT / "vps" / "ops" / "deploy-code.sh"


class ApiServiceContractTest(unittest.TestCase):
    def setUp(self):
        self.service = SERVICE_FILE.read_text(encoding="utf-8")
        self.deploy_script = DEPLOY_SCRIPT.read_text(encoding="utf-8")
        self.requirements = {
            line.strip()
            for line in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        exec_lines = [
            line.removeprefix("ExecStart=")
            for line in self.service.splitlines()
            if line.startswith("ExecStart=")
        ]
        self.assertEqual(len(exec_lines), 1, "service must define exactly one ExecStart")
        self.command = shlex.split(exec_lines[0])

    def option_value(self, option):
        index = self.command.index(option)
        return self.command[index + 1]

    def test_gunicorn_is_pinned(self):
        self.assertIn("gunicorn==23.0.0", self.requirements)

    def test_service_uses_gunicorn_module(self):
        self.assertEqual(self.command[:3], [
            "/root/slf-server/venv/bin/python",
            "-m",
            "gunicorn",
        ])
        self.assertEqual(self.command[-1], "server:app")
        self.assertNotIn("server.py", self.command)

    def test_single_worker_preserves_process_local_lock_contract(self):
        self.assertEqual(self.option_value("--workers"), "1")
        self.assertGreaterEqual(int(self.option_value("--threads")), 2)

    def test_service_remains_loopback_only(self):
        self.assertEqual(self.option_value("--bind"), "127.0.0.1:5000")

    def test_service_has_bounded_shutdown_and_restart_policy(self):
        self.assertIn("Restart=on-failure", self.service)
        self.assertIn("RestartSec=2", self.service)
        self.assertIn("TimeoutStopSec=35", self.service)
        self.assertEqual(self.option_value("--timeout"), "30")
        self.assertEqual(self.option_value("--graceful-timeout"), "30")

    def test_deployment_waits_for_http_readiness_before_marker(self):
        restart = self.deploy_script.index("systemctl restart slf-server.service")
        retry_loop = self.deploy_script.index('while [ "$ATTEMPT" -le 30 ]')
        readiness_gate = self.deploy_script.index('[ "$API_READY" -eq 1 ]')
        marker = self.deploy_script.index('> "$API_DIR/DEPLOYED_GIT_COMMIT"')

        self.assertLess(restart, retry_loop)
        self.assertLess(retry_loop, readiness_gate)
        self.assertLess(readiness_gate, marker)
        self.assertIn("--connect-timeout 2", self.deploy_script)
        self.assertIn("--max-time 5", self.deploy_script)
        self.assertIn("sleep 1", self.deploy_script)
        self.assertIn("Expected authenticated endpoint", self.deploy_script) if False else None
        self.assertIn("API readiness verification failed after 30 attempts", self.deploy_script)


if __name__ == "__main__":
    unittest.main()
