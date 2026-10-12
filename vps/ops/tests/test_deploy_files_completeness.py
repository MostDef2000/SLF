from __future__ import annotations

import re
import shlex
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = ROOT / "vps" / "ops" / "deploy-code.sh"
DAILY_EXPORT_SCRIPT = ROOT / "vps" / "exporter-rag" / "run_daily_export.sh"
EXPORTER_DIR = ROOT / "vps" / "exporter-rag"
SERVICE_FILE = ROOT / "vps" / "ops" / "slf-server.service"

STAGED_FILE_PATTERN = re.compile(
    r'git -C "\$REPO_DIR" show "\$RESOLVED_COMMIT:([^"]+)"'
)
PYTHON_INVOCATION_PATTERN = re.compile(r"^\s*python\s+(\S+\.py)\b", re.MULTILINE)


class DeployFilesCompletenessTest(unittest.TestCase):
    """deploy-code.sh must ship every script the deployed runtime invokes.

    Regression guard for the missing-file deploy defect class (27.09
    slf_common_utils incident, 11.10 slf_manifest_integrity hand-install):
    a script invoked by run_daily_export.sh or required by the staged api
    runtime but absent from the deploy staging list silently produces a
    broken deployment.
    """

    def setUp(self):
        self.deploy_script = DEPLOY_SCRIPT.read_text(encoding="utf-8")
        self.exporter_files = self.parse_exporter_files()

    def parse_exporter_files(self):
        declarations = re.findall(r"^\s*FILES='([^']*)'$", self.deploy_script, re.MULTILINE)
        self.assertEqual(
            len(declarations),
            1,
            "deploy-code.sh must declare exactly one exporter FILES list",
        )
        return declarations[0].split()

    def staged_repo_paths(self):
        # Skip parameterized loop references ("vps/exporter-rag/$file"); the
        # FILES list they expand over is asserted by the dedicated tests above.
        return [
            path
            for path in STAGED_FILE_PATTERN.findall(self.deploy_script)
            if "$" not in path
        ]

    def test_daily_export_invoked_scripts_are_shipped(self):
        invoked = {
            match.group(1).rsplit("/", 1)[-1]
            for match in PYTHON_INVOCATION_PATTERN.finditer(
                DAILY_EXPORT_SCRIPT.read_text(encoding="utf-8")
            )
        }
        missing = sorted(invoked - set(self.exporter_files))
        self.assertEqual(
            missing,
            [],
            "deploy-code.sh exporter FILES is missing scripts invoked by "
            f"run_daily_export.sh: {', '.join(missing)}",
        )

    def test_exporter_package_scripts_are_shipped(self):
        package_scripts = {
            path.name
            for path in EXPORTER_DIR.glob("*.py")
            if not path.name.startswith("test_")
        }
        missing = sorted(package_scripts - set(self.exporter_files))
        self.assertEqual(
            missing,
            [],
            "deploy-code.sh exporter FILES is missing exporter package "
            f"scripts present in vps/exporter-rag/: {', '.join(missing)}",
        )

    def test_exporter_files_entries_are_flat_and_exist_in_repo(self):
        for entry in self.exporter_files:
            self.assertNotIn(
                "/",
                entry,
                f"FILES entry must be a flat basename staged into EXPORT_DIR, got: {entry}",
            )
            self.assertTrue(
                (EXPORTER_DIR / entry).is_file(),
                f"exporter FILES entry does not exist in the repo: vps/exporter-rag/{entry}",
            )

    def test_api_component_stages_the_service_entry_module(self):
        staged = self.staged_repo_paths()
        self.assertTrue(
            staged,
            "deploy-code.sh must stage files from the approved commit via git show",
        )
        exec_lines = [
            line.removeprefix("ExecStart=")
            for line in SERVICE_FILE.read_text(encoding="utf-8").splitlines()
            if line.startswith("ExecStart=")
        ]
        self.assertEqual(len(exec_lines), 1, "service must define exactly one ExecStart")
        entry_point = shlex.split(exec_lines[0])[-1]
        self.assertRegex(entry_point, r"^[A-Za-z0-9_.]+:[A-Za-z0-9_]+$")
        module_file = f"vps/api/{entry_point.split(':')[0]}.py"
        self.assertIn(
            module_file,
            staged,
            f"deploy-code.sh api component must stage the service entry module {module_file}",
        )

    def test_every_staged_repo_path_exists(self):
        for repo_path in self.staged_repo_paths():
            self.assertTrue(
                (ROOT / repo_path).is_file(),
                f"deploy-code.sh stages a file that does not exist in the repo: {repo_path}",
            )


if __name__ == "__main__":
    unittest.main()
