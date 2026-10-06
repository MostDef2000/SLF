from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().with_name("quarantine_duplicate_results.py")
SPEC = importlib.util.spec_from_file_location("quarantine_duplicate_results", MODULE_PATH)
assert SPEC and SPEC.loader
quarantine = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quarantine)


class QuarantineDuplicateResultsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.results_path = self.dir / "match_results_v2.json"

    def write(self, path, payload):
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def read(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def result_row(self, game_id, score, result_key=None, parsed_at=1770000000000, **extra):
        if result_key is None:
            score_part = "?:?"
            if (
                isinstance(score, dict)
                and type(score.get("home")) is int
                and type(score.get("away")) is int
            ):
                score_part = f"{score['home']}:{score['away']}"
            result_key = f"match_result|{game_id}|finished_match|{score_part}|101-202"
        row = {
            "recordType": "match_result",
            "resultType": "finished_match",
            "schemaVersion": 2,
            "parserVersion": "match_result_append_v1",
            "resultKey": result_key,
            "gameId": game_id,
            "status": "finished",
            "score": score,
            "teams": ["101", "202"],
            "parsedAt": parsed_at,
            "telemetryContext": {"scoreState": "missing"},
        }
        row.update(extra)
        return row

    def run_cli(self, *args):
        cmd = [sys.executable, str(MODULE_PATH), "--results", str(self.results_path), *args]
        return subprocess.run(cmd, capture_output=True, text=True)

    def run_cli_with_pinned_clock(self, epoch_ms, *args, pid=None):
        """Run the CLI in a subprocess with time.time pinned to a fixed value.

        Pins the epoch-ms suffix of the backup/quarantine file names so the
        refuse-if-exists gates can be exercised deterministically.  When
        ``pid`` is given, os.getpid is pinned too, making the pid-unique
        quarantine-tmp path predictable.
        """
        shim = self.dir / "run-quarantine-pinned.py"
        argv = ["quarantine_duplicate_results.py", "--results", str(self.results_path), *args]
        lines = [
            "import os\n"
            "import runpy\n"
            "import sys\n"
            "import time\n"
            f"time.time = lambda: {epoch_ms} / 1000\n",
        ]
        if pid is not None:
            lines.append(f"os.getpid = lambda: {pid}\n")
        lines.extend(
            [
                f"sys.argv = {argv!r}\n",
                f"runpy.run_path({str(MODULE_PATH)!r}, run_name='__main__')\n",
            ]
        )
        shim.write_text("".join(lines), encoding="utf-8")
        return subprocess.run([sys.executable, str(shim)], capture_output=True, text=True)

    def reset_fixtures(self, rows):
        for pattern in (
            "match_results_v2.json.bak-*",
            "match_results_v2.quarantine-*.json",
            "*quarantine-tmp*",
        ):
            for path in self.dir.glob(pattern):
                path.unlink()
        self.write(self.results_path, rows)

    def backup_files(self):
        return sorted(self.dir.glob("match_results_v2.json.bak-*"))

    def quarantine_files(self):
        return sorted(self.dir.glob("match_results_v2.quarantine-*.json"))

    def temp_files(self):
        return [p.name for p in self.dir.iterdir() if "quarantine-tmp" in p.name]

    def test_dry_run_reports_full_plan_without_mutation(self):
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 1, "away": 0})
        self.write(self.results_path, [invalid_row, kept_row])
        original = self.results_path.read_bytes()

        proc = self.run_cli("--quarantine", "game-1:?")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        plan = json.loads(proc.stdout)
        self.assertEqual(plan["schema"], "slf_quarantine_plan_v1")
        self.assertEqual(plan["toolVersion"], "slf_quarantine_v1")
        self.assertEqual(plan["mode"], "dry_run")
        self.assertEqual(plan["totalRecords"], 2)
        self.assertEqual(plan["quarantinedCount"], 1)
        self.assertEqual(plan["unmatchedRules"], [])

        self.assertEqual(len(plan["rules"]), 1)
        rule = plan["rules"][0]
        self.assertEqual(rule["gameId"], "game-1")
        self.assertEqual(rule["spec"], "?")
        self.assertEqual(rule["matchedIndices"], [0])
        # the full row dict is reported: every field incl. parsedAt/resultKey
        self.assertEqual(rule["matchedRows"], [invalid_row])

        # dry run touches nothing on disk
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])
        self.assertEqual(self.temp_files(), [])

    def test_apply_removes_invalid_rows_and_writes_quarantine_and_backup(self):
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 2, "away": 1})
        self.write(self.results_path, [invalid_row, kept_row])
        original = self.results_path.read_bytes()
        os.chmod(self.results_path, 0o640)

        proc = self.run_cli("--quarantine", "game-1:?", "--apply")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        plan = json.loads(proc.stdout)
        self.assertEqual(plan["mode"], "apply")
        self.assertEqual(plan["quarantinedCount"], 1)

        # invalid rows removed, scored rows kept
        self.assertEqual(self.read(self.results_path), [kept_row])

        # quarantine file contains exactly the removed rows
        quarantine_files = self.quarantine_files()
        self.assertEqual(len(quarantine_files), 1)
        self.assertEqual(self.read(quarantine_files[0]), [invalid_row])
        self.assertEqual(plan["quarantineFile"], str(quarantine_files[0]))

        # backup is byte-identical to the pre-state
        backups = self.backup_files()
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original)
        self.assertEqual(plan["backupFile"], str(backups[0]))

        # no temp file left behind, file mode preserved
        self.assertEqual(self.temp_files(), [])
        self.assertEqual(os.stat(self.results_path).st_mode & 0o777, 0o640)

    def test_second_apply_with_no_matches_is_idempotent_nothing_to_do(self):
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 2, "away": 1})
        self.write(self.results_path, [invalid_row, kept_row])

        first = self.run_cli("--quarantine", "game-1:?", "--apply")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(len(self.backup_files()), 1)
        self.assertEqual(len(self.quarantine_files()), 1)
        after_first = self.results_path.read_bytes()

        second = self.run_cli("--quarantine", "game-1:?", "--apply")

        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("nothing to do", second.stdout)
        plan = json.loads(second.stdout.strip().rsplit("\n", 1)[0])
        self.assertEqual(plan["quarantinedCount"], 0)
        self.assertEqual(len(plan["unmatchedRules"]), 1)
        self.assertEqual(plan["unmatchedRules"][0]["gameRows"], [kept_row])

        # idempotent rerun creates no new backup and mutates nothing
        self.assertEqual(len(self.backup_files()), 1)
        self.assertEqual(len(self.quarantine_files()), 1)
        self.assertEqual(self.results_path.read_bytes(), after_first)

    def test_exact_score_spec_matches_only_that_score(self):
        zero_zero = self.result_row("game-1", {"home": 0, "away": 0})
        one_zero = self.result_row("game-1", {"home": 1, "away": 0})
        self.write(self.results_path, [zero_zero, one_zero])

        proc = self.run_cli("--quarantine", "game-1:0:0", "--apply")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        # only the exact 0:0 row is quarantined; the 1:0 row is kept
        self.assertEqual(self.read(self.results_path), [one_zero])
        quarantine_files = self.quarantine_files()
        self.assertEqual(len(quarantine_files), 1)
        self.assertEqual(self.read(quarantine_files[0]), [zero_zero])

    def test_two_rules_on_one_game_quarantine_both_and_row_once(self):
        # issue #318 pattern (game 34473385): an unresolved ?:? row next to a
        # stray 0:0 row next to the real 1:0 row
        invalid_row = self.result_row(34473385, None)
        zero_zero = self.result_row(34473385, {"home": 0, "away": 0})
        one_zero = self.result_row(34473385, {"home": 1, "away": 0})
        self.write(self.results_path, [invalid_row, zero_zero, one_zero])

        dry = self.run_cli("--quarantine", "34473385:?", "--quarantine", "34473385:0:0")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        plan = json.loads(dry.stdout)
        self.assertEqual(plan["unmatchedRules"], [])
        self.assertEqual(len(plan["rules"]), 2)
        self.assertEqual(plan["rules"][0]["spec"], "?")
        self.assertEqual(plan["rules"][0]["matchedIndices"], [0])
        self.assertEqual(plan["rules"][1]["spec"], "0:0")
        self.assertEqual(plan["rules"][1]["matchedIndices"], [1])
        # the 0:0 row is matched by both rules but quarantined once
        self.assertEqual(plan["quarantinedCount"], 2)

        proc = self.run_cli(
            "--quarantine", "34473385:?", "--quarantine", "34473385:0:0", "--apply"
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)

        self.assertEqual(self.read(self.results_path), [one_zero])
        quarantine_files = self.quarantine_files()
        self.assertEqual(len(quarantine_files), 1)
        self.assertEqual(self.read(quarantine_files[0]), [invalid_row, zero_zero])

    def test_partial_unmatched_rules_fail_closed_without_mutation(self):
        invalid_row = self.result_row("game-1", None)
        other_row = self.result_row("game-2", {"home": 1, "away": 0})
        self.write(self.results_path, [invalid_row, other_row])
        original = self.results_path.read_bytes()

        proc = self.run_cli(
            "--quarantine", "game-1:?", "--quarantine", "game-2:0:0", "--apply"
        )

        self.assertNotEqual(proc.returncode, 0)
        plan = json.loads(proc.stdout)
        self.assertEqual(len(plan["unmatchedRules"]), 1)
        unmatched = plan["unmatchedRules"][0]
        self.assertEqual(unmatched["gameId"], "game-2")
        self.assertEqual(unmatched["spec"], "0:0")
        # the unmatched rule lists the game's actual rows to help fix the spec
        self.assertEqual(unmatched["gameRows"], [other_row])
        self.assertIn("ERROR", proc.stderr)

        # no mutation at all
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])
        self.assertEqual(self.temp_files(), [])

        # dry run treats unmatched rules as informational (exit 0)
        dry = self.run_cli("--quarantine", "game-1:?", "--quarantine", "game-2:0:0")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertEqual(len(json.loads(dry.stdout)["unmatchedRules"]), 1)

    def test_malformed_or_non_list_results_fail_without_mutation(self):
        for name, payload in (
            ("malformed", "{not valid json"),
            ("non-list", json.dumps({"not": "a list"})),
        ):
            with self.subTest(case=name):
                self.results_path.write_text(payload, encoding="utf-8")
                original = self.results_path.read_bytes()

                proc = self.run_cli("--quarantine", "game-1:?", "--apply")

                self.assertNotEqual(proc.returncode, 0)
                self.assertEqual(self.results_path.read_bytes(), original)
                self.assertEqual(self.backup_files(), [])
                self.assertEqual(self.quarantine_files(), [])

    def test_bool_and_float_scores_are_invalid_and_never_exact_match(self):
        # server contract mirror: type(x) is int, so bool/float are invalid
        self.assertFalse(quarantine.valid_finished_score({"home": True, "away": 0}))
        self.assertFalse(quarantine.valid_finished_score({"home": 1.0, "away": 0}))

        bool_row = self.result_row("game-1", {"home": True, "away": 0})
        float_row = self.result_row("game-1", {"home": 1.0, "away": 0})
        self.write(self.results_path, [bool_row, float_row])

        plan = json.loads(
            self.run_cli("--quarantine", "game-1:1:0", "--quarantine", "game-1:?").stdout
        )

        # True == 1 in Python, but neither row matches the exact 1:0 spec
        self.assertEqual(
            [rule for rule in plan["rules"] if rule["spec"] == "1:0"], []
        )
        self.assertEqual(len(plan["unmatchedRules"]), 1)
        self.assertEqual(plan["unmatchedRules"][0]["spec"], "1:0")

        # both rows ARE invalid-score rows for the ? spec mirror
        self.assertEqual(len(plan["rules"]), 1)
        self.assertEqual(plan["rules"][0]["spec"], "?")
        self.assertEqual(plan["rules"][0]["matchedIndices"], [0, 1])
        self.assertEqual(plan["quarantinedCount"], 2)

    def test_apply_refuses_existing_backup_or_quarantine_target(self):
        epoch_ms = 1700000000000
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 2, "away": 1})
        args = ("--quarantine", "game-1:?", "--apply")

        # .bak target already existing: refuse before any mutation
        self.reset_fixtures([invalid_row, kept_row])
        original = self.results_path.read_bytes()
        stale_backup = self.dir / f"match_results_v2.json.bak-{epoch_ms}"
        stale_backup.write_bytes(b"stale backup bytes\n")

        proc = self.run_cli_with_pinned_clock(epoch_ms, *args)

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Backup target already exists", proc.stderr)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.quarantine_files(), [])

        # quarantine target already existing: backup (step 1) completes, the
        # rewrite (step 3) never runs, and the stale file is not overwritten
        self.reset_fixtures([invalid_row, kept_row])
        original = self.results_path.read_bytes()
        stale_quarantine = self.dir / "match_results_v2.quarantine-1700000000000.json"
        stale_quarantine.write_bytes(b"stale quarantine bytes\n")

        proc = self.run_cli_with_pinned_clock(epoch_ms, *args)

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Quarantine target already exists", proc.stderr)
        self.assertIn("Quarantine aborted after completing", proc.stderr)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(stale_quarantine.read_bytes(), b"stale quarantine bytes\n")
        backups = self.backup_files()
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original)

    def test_apply_refuses_existing_temp_target(self):
        epoch_ms = 1700000000000
        pinned_pid = 4711
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 2, "away": 1})
        self.reset_fixtures([invalid_row, kept_row])
        original = self.results_path.read_bytes()

        stale_tmp = self.dir / f"match_results_v2.json.{pinned_pid}.quarantine-tmp"
        stale_tmp.write_bytes(b"stale tmp bytes\n")

        proc = self.run_cli_with_pinned_clock(
            epoch_ms, "--quarantine", "game-1:?", "--apply", pid=pinned_pid
        )

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("Temporary target already exists", proc.stderr)
        # refusal happens before any side effect
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])
        # the target this run refused to open is not ours to remove
        self.assertEqual(stale_tmp.read_bytes(), b"stale tmp bytes\n")

    def test_rows_missing_game_id_or_result_key_fail_without_mutation(self):
        good_row = self.result_row("game-1", {"home": 1, "away": 0})
        missing_game_id = self.result_row("game-1", None)
        del missing_game_id["gameId"]
        missing_result_key = self.result_row("game-1", None)
        del missing_result_key["resultKey"]
        non_dict_row = "not a row"

        for name, row in (
            ("missing-gameId", missing_game_id),
            ("missing-resultKey", missing_result_key),
            ("non-dict", non_dict_row),
        ):
            with self.subTest(case=name):
                self.write(self.results_path, [good_row, row])
                original = self.results_path.read_bytes()

                proc = self.run_cli("--quarantine", "game-1:?", "--apply")

                self.assertNotEqual(proc.returncode, 0)
                self.assertEqual(self.results_path.read_bytes(), original)
                self.assertEqual(self.backup_files(), [])
                self.assertEqual(self.quarantine_files(), [])


if __name__ == "__main__":
    unittest.main()
