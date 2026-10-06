from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

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

    # ---- issue #321: @keep modifier for exact-score specs -------------------

    def duplicate_triple(self):
        """Three 33723318-style rows: same resultKey, same 2:1, parsedAt t1<t2<t3."""
        return (
            self.result_row(33723318, {"home": 2, "away": 1}, parsed_at=1770000001000),
            self.result_row(33723318, {"home": 2, "away": 1}, parsed_at=1770000002000),
            self.result_row(33723318, {"home": 2, "away": 1}, parsed_at=1770000003000),
        )

    def test_keep_modifier_quarantines_all_but_oldest_or_latest_row(self):
        for keep, kept_index, quarantined in (
            ("oldest", 0, (1, 2)),
            ("latest", 2, (0, 1)),
        ):
            with self.subTest(keep=keep):
                rows = self.duplicate_triple()
                self.reset_fixtures(rows)

                proc = self.run_cli("--quarantine", f"33723318:2:1@keep={keep}", "--apply")

                self.assertEqual(proc.returncode, 0, proc.stderr)
                plan = json.loads(proc.stdout)
                self.assertEqual(plan["mode"], "apply")
                self.assertEqual(plan["unmatchedRules"], [])
                self.assertEqual(len(plan["rules"]), 1)
                rule = plan["rules"][0]
                self.assertEqual(rule["gameId"], "33723318")
                self.assertEqual(rule["spec"], f"2:1@keep={keep}")
                self.assertEqual(rule["keep"], keep)
                # keptRow is the FULL surviving row dict (the t1 / t3 row)
                self.assertEqual(rule["keptRow"], rows[kept_index])
                self.assertEqual(rule["matchedIndices"], [0, 1, 2])
                self.assertEqual(rule["quarantinedIndices"], list(quarantined))
                self.assertEqual(plan["quarantinedCount"], 2)

                # results file holds only the survivor, the rest are quarantined
                self.assertEqual(self.read(self.results_path), [rows[kept_index]])
                quarantine_files = self.quarantine_files()
                self.assertEqual(len(quarantine_files), 1)
                self.assertEqual(
                    self.read(quarantine_files[0]), [rows[index] for index in quarantined]
                )
                self.assertEqual(plan["quarantineFile"], str(quarantine_files[0]))

    def test_keep_without_resolvable_parsed_at_fails_closed(self):
        # parsedAt true/None/"x" are all non-numeric -> the keep rule cannot
        # pick a survivor and is refused like an unmatched rule
        unresolvable = []
        for parsed_at in (True, None, "x"):
            row = self.result_row(33723318, {"home": 2, "away": 1})
            row["parsedAt"] = parsed_at
            unresolvable.append(row)
        unresolvable = tuple(unresolvable)
        # a second, matching rule makes the run PARTIALLY unmatched: that is
        # the existing fail-closed path on --apply (a lone refused rule takes
        # the existing all-unmatched "nothing to do" path, asserted below)
        other_row = self.result_row("game-2", {"home": 1, "away": 0})
        self.reset_fixtures([*unresolvable, other_row])
        original = self.results_path.read_bytes()

        # dry run: exit 0, refused rule listed in unmatchedRules with reason
        dry = self.run_cli("--quarantine", "33723318:2:1@keep=oldest", "--quarantine", "game-2:1:0")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        plan = json.loads(dry.stdout)
        self.assertEqual(len(plan["rules"]), 1)
        self.assertEqual(plan["rules"][0]["spec"], "1:0")
        self.assertEqual(len(plan["unmatchedRules"]), 1)
        unmatched = plan["unmatchedRules"][0]
        self.assertEqual(unmatched["gameId"], "33723318")
        self.assertEqual(unmatched["spec"], "2:1@keep=oldest")
        self.assertEqual(unmatched["reason"], "no_resolvable_parsed_at")
        self.assertEqual(unmatched["matchedRows"], list(unresolvable))
        self.assertEqual(plan["quarantinedCount"], 1)

        # --apply: fail-closed, byte-identical results file, no artifacts
        proc = self.run_cli(
            "--quarantine", "33723318:2:1@keep=oldest", "--quarantine", "game-2:1:0", "--apply"
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("ERROR", proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["unmatchedRules"][0]["reason"], "no_resolvable_parsed_at")
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])
        self.assertEqual(self.temp_files(), [])

        # a LONE refused keep rule behaves exactly like an unmatched rule:
        # --apply is the existing idempotent "nothing to do" (exit 0, no mutation)
        self.reset_fixtures(unresolvable)
        original = self.results_path.read_bytes()
        lone = self.run_cli("--quarantine", "33723318:2:1@keep=latest", "--apply")
        self.assertEqual(lone.returncode, 0, lone.stderr)
        self.assertIn("nothing to do", lone.stdout)
        self.assertEqual(
            json.loads(lone.stdout.strip().rsplit("\n", 1)[0])["unmatchedRules"][0]["reason"],
            "no_resolvable_parsed_at",
        )
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])

    def test_keep_single_match_preserves_the_row(self):
        # keep semantics are "quarantine all except one": with exactly one
        # matched row the kept row IS that row and nothing is quarantined —
        # the rule still counts as matched (the match record is preserved)
        solo = self.result_row(33723318, {"home": 2, "away": 1}, parsed_at=1770000001000)
        self.reset_fixtures([solo])
        original = self.results_path.read_bytes()

        dry = self.run_cli("--quarantine", "33723318:2:1@keep=oldest")
        self.assertEqual(dry.returncode, 0, dry.stderr)
        self.assertIn("nothing to do", dry.stdout)
        plan = json.loads(dry.stdout.strip().rsplit("\n", 1)[0])
        self.assertEqual(plan["unmatchedRules"], [])
        self.assertEqual(plan["quarantinedCount"], 0)
        self.assertEqual(len(plan["rules"]), 1)
        self.assertEqual(plan["rules"][0]["keep"], "oldest")
        self.assertEqual(plan["rules"][0]["keptRow"], solo)
        self.assertEqual(plan["rules"][0]["quarantinedIndices"], [])

        # --apply is an idempotent no-op: byte-identical results, no artifacts
        proc = self.run_cli("--quarantine", "33723318:2:1@keep=oldest", "--apply")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("nothing to do", proc.stdout)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])
        self.assertEqual(self.quarantine_files(), [])
        self.assertEqual(self.temp_files(), [])

    def test_keep_suffix_grammar_rejections(self):
        self.write(self.results_path, [self.result_row("game-1", None)])
        for spec in ("game-1:?@keep=latest", "game-1:?@keep=oldest"):
            with self.subTest(spec=spec):
                # the '?' spec must REJECT a @keep suffix with an argparse error
                proc = self.run_cli("--quarantine", spec)
                self.assertEqual(proc.returncode, 2, proc.stderr)
                self.assertIn("invalid quarantine rule", proc.stderr)
                self.assertIn("must not carry a @keep suffix", proc.stderr)
        for spec in ("game-1:2:1@keep=nope", "game-1:2:1@keep"):
            with self.subTest(spec=spec):
                # malformed keep values are argparse errors too
                proc = self.run_cli("--quarantine", spec)
                self.assertEqual(proc.returncode, 2, proc.stderr)
                self.assertIn("invalid quarantine rule", proc.stderr)

        # base (non-keep) rule reports stay additive-free
        self.reset_fixtures(list(self.duplicate_triple()))
        plan = json.loads(self.run_cli("--quarantine", "33723318:2:1").stdout)
        self.assertEqual(plan["rules"][0]["spec"], "2:1")
        self.assertNotIn("keep", plan["rules"][0])
        self.assertNotIn("keptRow", plan["rules"][0])
        self.assertNotIn("quarantinedIndices", plan["rules"][0])

    def test_apply_chowns_artifacts_to_original_owner(self):
        # prod incident (issue #321): os.replace re-created match_results_v2.json
        # as root:root while gunicorn runs as slf.  All three apply artifacts
        # must be chowned to the ORIGINAL results file's uid/gid, and the temp
        # file must be chowned BEFORE os.replace.
        invalid_row = self.result_row("game-1", None)
        kept_row = self.result_row("game-1", {"home": 2, "away": 1})
        self.reset_fixtures([invalid_row, kept_row])
        stat_before = os.stat(self.results_path)
        original_uid, original_gid = stat_before.st_uid, stat_before.st_gid
        temp_path = f"{self.results_path}.{os.getpid()}.quarantine-tmp"

        events = []
        real_replace = os.replace

        def record_chown(path, chown_uid, chown_gid, *args, **kwargs):
            events.append(("chown", os.fspath(path), chown_uid, chown_gid))

        def record_replace(src, dst):
            events.append(("replace", os.fspath(src), os.fspath(dst)))
            return real_replace(src, dst)

        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with mock.patch("os.chown") as mock_os_chown:
                with mock.patch("shutil.chown") as mock_shutil_chown:
                    with mock.patch("os.replace", record_replace):
                        # the tool uses os.chown; shutil.chown is patched too so
                        # the test catches whichever mechanism is used
                        mock_os_chown.side_effect = record_chown
                        mock_shutil_chown.side_effect = record_chown
                        code = quarantine.main(
                            [
                                "--results",
                                str(self.results_path),
                                "--quarantine",
                                "game-1:?",
                                "--apply",
                            ]
                        )

        self.assertEqual(code, 0, stderr.getvalue())
        chown_events = [event for event in events if event[0] == "chown"]
        # exactly three artifacts chowned: backup, quarantine file, temp file
        self.assertEqual(len(chown_events), 3)
        backup_path = self.backup_files()[0]
        quarantine_path = self.quarantine_files()[0]
        self.assertEqual(
            {os.path.basename(event[1]) for event in chown_events},
            {backup_path.name, quarantine_path.name, os.path.basename(temp_path)},
        )
        for _, path, chown_uid, chown_gid in chown_events:
            self.assertEqual(
                (chown_uid, chown_gid),
                (original_uid, original_gid),
                f"chown({path}) must reuse the original file's owner",
            )
        # the temp file is chowned BEFORE os.replace lands it on the final inode
        temp_chown_index = events.index(("chown", temp_path, original_uid, original_gid))
        replace_index = events.index(("replace", temp_path, str(self.results_path)))
        self.assertLess(temp_chown_index, replace_index)

        # the rewrite actually happened, no temp left behind
        self.assertEqual(self.read(self.results_path), [kept_row])
        self.assertEqual(self.temp_files(), [])

        # PermissionError path (non-root run): warn to stderr, run succeeds
        self.reset_fixtures([invalid_row, kept_row])
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            with mock.patch(
                "os.chown", side_effect=PermissionError(1, "Operation not permitted")
            ):
                code = quarantine.main(
                    [
                        "--results",
                        str(self.results_path),
                        "--quarantine",
                        "game-1:?",
                        "--apply",
                    ]
                )
        self.assertEqual(code, 0, stderr.getvalue())
        warnings = [line for line in stderr.getvalue().splitlines() if "WARNING" in line]
        self.assertEqual(len(warnings), 3)  # backup, quarantine file, temp file
        self.assertIn("chown", stderr.getvalue())
        self.assertEqual(self.read(self.results_path), [kept_row])
        self.assertEqual(len(self.backup_files()), 1)
        self.assertEqual(len(self.quarantine_files()), 1)


if __name__ == "__main__":
    unittest.main()
