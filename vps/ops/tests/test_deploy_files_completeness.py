from __future__ import annotations

import ast
import json
import re
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = ROOT / "vps" / "ops" / "deploy-code.sh"
ROLLBACK_SCRIPT = ROOT / "vps" / "ops" / "rollback-code.sh"
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
        self.rollback_script = ROLLBACK_SCRIPT.read_text(encoding="utf-8")
        self.exporter_files = self.parse_exporter_files()
        self.rollback_exporter_files = self.parse_rollback_exporter_files()

    def parse_exporter_files(self):
        declarations = re.findall(r"^\s*FILES='([^']*)'$", self.deploy_script, re.MULTILINE)
        self.assertEqual(
            len(declarations),
            1,
            "deploy-code.sh must declare exactly one exporter FILES list",
        )
        return declarations[0].split()

    def parse_rollback_exporter_files(self):
        declarations = re.findall(r"^\s*FILES='([^']*)'$", self.rollback_script, re.MULTILINE)
        self.assertEqual(
            len(declarations),
            1,
            "rollback-code.sh must declare exactly one exporter FILES list",
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

    def test_rollback_files_match_deploy_files(self):
        """Rollback must restore the exact deploy file set (order included).

        Regression guard for the same missing-file defect class on the
        restore path: a rollback from a deploy-created backup must restore
        the full exporter file set, including slf_common_utils.py and
        slf_manifest_integrity.py.
        """
        self.assertEqual(
            self.rollback_exporter_files,
            self.exporter_files,
            "rollback-code.sh exporter FILES must match deploy-code.sh "
            "exporter FILES exactly (same entries, same order)",
        )

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

    def test_every_repo_json_referenced_by_exporter_is_staged(self):
        """Guard the "new data file read added, FILES= forgotten" defect class: every bare *.json filename referenced by an exporter script and present in vps/exporter-rag/ must be staged by both deploy and rollback."""
        derived = set()
        for script in sorted(EXPORTER_DIR.glob("*.py")):
            if script.name.startswith("test_"):
                continue
            tree = ast.parse(script.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    name = node.value
                    if name.endswith(".json") and "/" not in name and (EXPORTER_DIR / name).is_file():
                        derived.add(name)
        missing_deploy = sorted(derived - set(self.exporter_files))
        self.assertEqual(
            missing_deploy,
            [],
            "deploy-code.sh exporter FILES is missing repo data files referenced "
            f"by exporter scripts: {', '.join(missing_deploy)}",
        )
        missing_rollback = sorted(derived - set(self.rollback_exporter_files))
        self.assertEqual(
            missing_rollback,
            [],
            "rollback-code.sh exporter FILES is missing repo data files referenced "
            f"by exporter scripts: {', '.join(missing_rollback)}",
        )

    def test_stage_validation_one_liner_mirrors_exporter(self):
        """Pin the deploy-time stage validation for forum_official_claims.json.

        Regression guard for the silent-gate-drop defect class: the exporter-rag
        case in deploy-code.sh must keep exactly one python -c assert line
        validating $STAGE_DIR/forum_official_claims.json. The pin is behavioral:
        the extracted one-liner is executed against (a) the valid repo claims
        file (must pass), (b) a copy with a blank claim author (must fail), and
        (c) a copy with an empty claims list (must fail — pins the non-empty
        claims assert). If the line is removed or its asserts weakened, this
        test fails.
        """
        candidates = [
            line
            for line in self.deploy_script.splitlines()
            if "forum_official_claims.json" in line
            and ("python -c" in line or "$VENV_PY" in line)
        ]
        self.assertEqual(
            len(candidates),
            1,
            "deploy-code.sh must contain exactly one stage-validation line for "
            "forum_official_claims.json (python -c assert against "
            "$STAGE_DIR/forum_official_claims.json); found "
            f"{len(candidates)} — the deploy-time gate was removed or duplicated",
        )
        match = re.search(
            r"""(?:python|\$VENV_PY)"?\s+-c\s+'([^']*)'\s+"?\$STAGE_DIR/forum_official_claims\.json"?\s*$""",
            candidates[0],
        )
        self.assertIsNotNone(
            match,
            "the forum_official_claims.json stage-validation line must invoke "
            "python -c with a single-quoted code argument and the "
            "$STAGE_DIR/forum_official_claims.json path argument",
        )
        code = match.group(1)
        repo_file = EXPORTER_DIR / "forum_official_claims.json"
        self.assertTrue(
            repo_file.is_file(),
            f"repo claims file missing: {repo_file}",
        )

        def run_validation(path):
            return subprocess.run(
                [sys.executable, "-c", code, str(path)],
                capture_output=True,
                text=True,
            )

        ok = run_validation(repo_file)
        self.assertEqual(
            ok.returncode,
            0,
            "stage validation must pass on the valid repo claims file "
            f"({repo_file}); stderr: {ok.stderr.strip()}",
        )

        payload = json.loads(repo_file.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            blank_author = tmp_dir / "forum_official_claims.json"
            mutated = json.loads(json.dumps(payload))
            mutated["claims"][0]["author"] = ""
            blank_author.write_text(
                json.dumps(mutated, ensure_ascii=False), encoding="utf-8"
            )
            blank_result = run_validation(blank_author)
            self.assertNotEqual(
                blank_result.returncode,
                0,
                "stage validation must fail-closed on a claims file with a blank "
                f"author (first claim); stderr: {blank_result.stderr.strip()}",
            )

            empty_claims = tmp_dir / "forum_official_claims.json"
            mutated = json.loads(json.dumps(payload))
            mutated["claims"] = []
            empty_claims.write_text(
                json.dumps(mutated, ensure_ascii=False), encoding="utf-8"
            )
            empty_result = run_validation(empty_claims)
            self.assertNotEqual(
                empty_result.returncode,
                0,
                "stage validation must fail-closed on a claims file with an "
                "empty claims list (non-empty claims assert missing or "
                f"weakened); stderr: {empty_result.stderr.strip()}",
            )


if __name__ == "__main__":
    unittest.main()
