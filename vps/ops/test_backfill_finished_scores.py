from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().with_name("backfill_finished_scores.py")
SPEC = importlib.util.spec_from_file_location("backfill_finished_scores", MODULE_PATH)
assert SPEC and SPEC.loader
backfill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backfill)


class BackfillFinishedScoresTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.results_path = self.dir / "match_results_v2.json"
        self.snapshots_path = self.dir / "match_snapshots_v2.json"

    def write(self, path, payload):
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def read(self, path):
        return json.loads(path.read_text(encoding="utf-8"))

    def finished_result(self, game_id, score=None, teams=("101", "202"), result_key=None, **extra):
        if result_key is None:
            result_key = (
                f"match_result|{game_id}|finished_match|?:?|{'-'.join(str(t) for t in teams)}"
            )
        record = {
            "recordType": "match_result",
            "resultType": "finished_match",
            "schemaVersion": 2,
            "parserVersion": "match_result_append_v1",
            "resultKey": result_key,
            "gameId": game_id,
            "status": "finished",
            "score": score,
            "teams": list(teams),
            "parsedAt": 1770000000000,
            "telemetryContext": {"scoreState": "missing"},
        }
        record.update(extra)
        return record

    def snapshot(self, game_id, score, parsed_at, snapshot_key=None, status="finished"):
        if snapshot_key is None:
            score_part = f"{score['home']}:{score['away']}" if score is not None else "?:?"
            snapshot_key = f"match_snapshot|{game_id}|{status}|90|full|{score_part}|101-202"
        return {
            "recordType": "match_snapshot",
            "schemaVersion": 2,
            "parserVersion": "match_snapshot_append_v1",
            "snapshotKey": snapshot_key,
            "gameId": game_id,
            "status": status,
            "score": score,
            "parsedAt": parsed_at,
        }

    def run_cli(self, *args):
        cmd = [
            sys.executable,
            str(MODULE_PATH),
            "--results",
            str(self.results_path),
            "--snapshots",
            str(self.snapshots_path),
            *args,
        ]
        return subprocess.run(cmd, capture_output=True, text=True)

    def backup_files(self):
        return sorted(self.dir.glob("match_results_v2.json.bak-*"))

    def test_happy_path_picks_max_parsed_at_snapshot(self):
        self.write(self.results_path, [self.finished_result("game-1", None)])
        self.write(
            self.snapshots_path,
            [
                self.snapshot("game-1", None, 1000),  # invalid score -> ignored
                self.snapshot("game-1", {"home": 1, "away": 0}, 2000),
                self.snapshot("game-1", {"home": 2, "away": 1}, 3000),
            ],
        )

        proc = self.run_cli()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        plan = json.loads(proc.stdout)

        self.assertEqual(plan["schema"], "slf_backfill_plan_v1")
        self.assertEqual(plan["mode"], "dry_run")
        self.assertEqual(plan["toolVersion"], "backfill_v1")
        self.assertEqual(plan["totalRecords"], 1)
        self.assertEqual(plan["candidateCount"], 1)
        self.assertEqual(plan["resolvedCount"], 1)
        self.assertEqual(plan["skippedCount"], 0)

        candidate = plan["candidates"][0]
        self.assertEqual(candidate["gameId"], "game-1")
        self.assertEqual(candidate["currentResultKey"], "match_result|game-1|finished_match|?:?|101-202")
        self.assertEqual(candidate["resolvedScore"], {"home": 2, "away": 1})
        self.assertEqual(candidate["newResultKey"], "match_result|game-1|finished_match|2:1|101-202")
        self.assertEqual(candidate["snapshotParsedAt"], 3000)
        self.assertEqual(candidate["snapshotKey"], "match_snapshot|game-1|finished|90|full|2:1|101-202")

    def test_apply_rewrites_record_with_provenance(self):
        self.write(self.results_path, [self.finished_result("game-1", None)])
        self.write(
            self.snapshots_path,
            [self.snapshot("game-1", {"home": 2, "away": 1}, 3000)],
        )

        proc = self.run_cli("--apply")
        self.assertEqual(proc.returncode, 0, proc.stderr)

        records = self.read(self.results_path)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["score"], {"home": 2, "away": 1})
        self.assertEqual(record["resultKey"], "match_result|game-1|finished_match|2:1|101-202")
        self.assertEqual(record["scoreSource"], "backfill_from_snapshots_v1")
        self.assertEqual(record["backfill"]["fromCollection"], "match_snapshots_v2")
        self.assertEqual(record["backfill"]["snapshotKey"], "match_snapshot|game-1|finished|90|full|2:1|101-202")
        self.assertEqual(record["backfill"]["snapshotParsedAt"], 3000)
        self.assertEqual(record["backfill"]["toolVersion"], "backfill_v1")
        self.assertIsInstance(record["backfill"]["appliedAt"], int)
        self.assertGreater(record["backfill"]["appliedAt"], 0)

        # every other field preserved as-is
        self.assertEqual(record["teams"], ["101", "202"])
        self.assertEqual(record["status"], "finished")
        self.assertEqual(record["parsedAt"], 1770000000000)
        self.assertEqual(record["telemetryContext"], {"scoreState": "missing"})

    def test_no_valid_snapshot_skips_with_no_snapshot_score(self):
        self.write(self.results_path, [self.finished_result("game-2", None)])
        self.write(
            self.snapshots_path,
            [
                self.snapshot("game-2", None, 1000),  # invalid score
                self.snapshot("game-other", {"home": 1, "away": 1}, 2000),  # wrong game
            ],
        )

        plan = json.loads(self.run_cli().stdout)
        self.assertEqual(plan["candidateCount"], 1)
        self.assertEqual(plan["resolvedCount"], 0)
        self.assertEqual(plan["skippedCount"], 1)
        self.assertEqual(plan["candidates"], [])
        self.assertEqual(plan["skipped"][0]["reason"], "no_snapshot_score")
        self.assertEqual(plan["skipped"][0]["gameId"], "game-2")

    def test_already_resolved_skips_when_same_game_has_valid_result(self):
        invalid = self.finished_result(
            "game-3", None, result_key="match_result|game-3|finished_match|?:?|101-202"
        )
        valid = self.finished_result(
            "game-3",
            {"home": 2, "away": 1},
            result_key="match_result|game-3|finished_match|2:1|101-202",
        )
        self.write(self.results_path, [invalid, valid])
        self.write(self.snapshots_path, [self.snapshot("game-3", {"home": 2, "away": 1}, 3000)])

        plan = json.loads(self.run_cli().stdout)
        self.assertEqual(plan["totalRecords"], 2)
        self.assertEqual(plan["candidateCount"], 1)
        self.assertEqual(plan["resolvedCount"], 0)
        self.assertEqual(plan["skippedCount"], 1)
        self.assertEqual(plan["skipped"][0]["reason"], "already_resolved")

    def test_dry_run_writes_nothing(self):
        self.write(self.results_path, [self.finished_result("game-4", None)])
        self.write(self.snapshots_path, [self.snapshot("game-4", {"home": 1, "away": 1}, 3000)])
        original_results = self.results_path.read_bytes()
        original_snapshots = self.snapshots_path.read_bytes()

        proc = self.run_cli()
        self.assertEqual(proc.returncode, 0, proc.stderr)

        self.assertEqual(self.results_path.read_bytes(), original_results)
        self.assertEqual(self.snapshots_path.read_bytes(), original_snapshots)
        self.assertEqual(self.backup_files(), [])

    def test_apply_backs_up_and_second_run_is_idempotent(self):
        self.write(self.results_path, [self.finished_result("game-5", None)])
        self.write(self.snapshots_path, [self.snapshot("game-5", {"home": 3, "away": 2}, 3000)])
        original_bytes = self.results_path.read_bytes()

        first = self.run_cli("--apply")
        self.assertEqual(first.returncode, 0, first.stderr)

        backups = self.backup_files()
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), original_bytes)

        temp_files = [p.name for p in self.dir.iterdir() if ".backfill-tmp" in p.name]
        self.assertEqual(temp_files, [])

        record = self.read(self.results_path)[0]
        self.assertEqual(record["score"], {"home": 3, "away": 2})
        self.assertEqual(record["scoreSource"], "backfill_from_snapshots_v1")

        # second dry-run reports zero candidates
        plan = json.loads(self.run_cli().stdout)
        self.assertEqual(plan["candidateCount"], 0)
        self.assertEqual(plan["resolvedCount"], 0)
        self.assertEqual(plan["skippedCount"], 0)

        # second --apply does nothing and creates no new backup
        second = self.run_cli("--apply")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("nothing to do", second.stdout)
        self.assertEqual(len(self.backup_files()), 1)

    def test_empty_plan_apply_prints_nothing_to_do_and_no_backup(self):
        self.write(self.results_path, [self.finished_result("game-6", {"home": 1, "away": 0})])
        self.write(self.snapshots_path, [])

        proc = self.run_cli("--apply")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("nothing to do", proc.stdout)
        self.assertEqual(self.backup_files(), [])

    def test_malformed_results_json_fails_without_mutation(self):
        self.results_path.write_text("{not valid json", encoding="utf-8")
        self.write(self.snapshots_path, [])
        original = self.results_path.read_bytes()

        proc = self.run_cli("--apply")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])

    def test_non_list_results_fails(self):
        self.write(self.results_path, {"not": "a list"})
        self.write(self.snapshots_path, [])
        proc = self.run_cli()
        self.assertNotEqual(proc.returncode, 0)

    def test_apply_requires_both_files_exist(self):
        self.write(self.results_path, [self.finished_result("game-7", None)])
        # snapshots file intentionally absent
        original = self.results_path.read_bytes()

        proc = self.run_cli("--apply")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])

    def test_malformed_snapshots_json_fails_without_mutation(self):
        self.write(self.results_path, [self.finished_result("game-7", None)])
        self.snapshots_path.write_text("[1,2,", encoding="utf-8")
        original = self.results_path.read_bytes()

        proc = self.run_cli("--apply")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(self.results_path.read_bytes(), original)
        self.assertEqual(self.backup_files(), [])

    def test_valid_finished_score_mirrors_server_contract(self):
        self.assertTrue(backfill.valid_finished_score({"home": 0, "away": 0}))
        self.assertTrue(backfill.valid_finished_score({"home": 99, "away": 99}))
        self.assertFalse(backfill.valid_finished_score(None))
        self.assertFalse(backfill.valid_finished_score("2:1"))
        self.assertFalse(backfill.valid_finished_score([]))
        self.assertFalse(backfill.valid_finished_score({"home": "2", "away": 1}))
        self.assertFalse(backfill.valid_finished_score({"home": True, "away": 1}))
        self.assertFalse(backfill.valid_finished_score({"home": 2, "away": False}))
        self.assertFalse(backfill.valid_finished_score({"home": 2.5, "away": 1}))
        self.assertFalse(backfill.valid_finished_score({"home": 100, "away": 0}))
        self.assertFalse(backfill.valid_finished_score({"home": -1, "away": 0}))
        self.assertFalse(backfill.valid_finished_score({"home": 2}))

    def test_invalid_score_variants_are_candidates(self):
        invalid_scores = [
            None,
            "2:1",
            {"home": True, "away": 1},
            {"home": 2, "away": False},
            {"home": 2.5, "away": 1},
            {"home": 100, "away": 0},
            {"home": -1, "away": 0},
        ]
        records = [self.finished_result(f"game-b{i}", score) for i, score in enumerate(invalid_scores)]
        records.append(self.finished_result("game-valid", {"home": 1, "away": 0}))
        self.write(self.results_path, records)
        self.write(self.snapshots_path, [])

        plan = json.loads(self.run_cli().stdout)
        self.assertEqual(plan["candidateCount"], len(invalid_scores))
        self.assertEqual(plan["resolvedCount"], 0)
        self.assertEqual(plan["skippedCount"], len(invalid_scores))
        for skipped in plan["skipped"]:
            self.assertEqual(skipped["reason"], "no_snapshot_score")

    def test_missing_or_short_teams_skip(self):
        missing = self.finished_result("game-t", None)
        del missing["teams"]
        short = self.finished_result("game-t", None, teams=("101",))

        for name, record in (("missing", missing), ("short", short)):
            with self.subTest(case=name):
                self.write(self.results_path, [record])
                self.write(self.snapshots_path, [self.snapshot("game-t", {"home": 2, "away": 1}, 3000)])
                plan = json.loads(self.run_cli().stdout)
                self.assertEqual(plan["candidateCount"], 1)
                self.assertEqual(plan["resolvedCount"], 0)
                self.assertEqual(plan["skippedCount"], 1)
                self.assertEqual(plan["skipped"][0]["reason"], "teams_missing")

    def test_ts_only_snapshots_pick_latest_ts(self):
        self.write(self.results_path, [self.finished_result("game-ts", None)])

        early = self.snapshot("game-ts", {"home": 1, "away": 0}, 2000)
        early.pop("parsedAt")
        early["ts"] = 2000
        late = self.snapshot("game-ts", {"home": 2, "away": 1}, 3000)
        late.pop("parsedAt")
        late["ts"] = 3000
        self.write(self.snapshots_path, [early, late])

        proc = self.run_cli()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        plan = json.loads(proc.stdout)

        candidate = plan["candidates"][0]
        self.assertEqual(candidate["snapshotKey"], late["snapshotKey"])
        self.assertEqual(candidate["resolvedScore"], {"home": 2, "away": 1})
        self.assertEqual(candidate["snapshotParsedAt"], late["ts"])

    def test_no_timestamp_and_bool_ts_resolve_to_lowest(self):
        # A snapshot with no timestamp fields ties at 0 and loses to one with ts.
        self.write(self.results_path, [self.finished_result("game-ts0", None)])
        no_ts = self.snapshot("game-ts0", {"home": 1, "away": 0}, 1000)
        no_ts.pop("parsedAt")
        with_ts = self.snapshot("game-ts0", {"home": 2, "away": 1}, 2000)
        with_ts.pop("parsedAt")
        with_ts["ts"] = 2000
        self.write(self.snapshots_path, [no_ts, with_ts])

        plan = json.loads(self.run_cli().stdout)
        candidate = plan["candidates"][0]
        self.assertEqual(candidate["snapshotKey"], with_ts["snapshotKey"])
        self.assertEqual(candidate["snapshotParsedAt"], 2000)

        # A bool ts is not numeric and resolves to 0, so it loses to a real ts=1.
        bool_ts = self.snapshot("game-ts0", {"home": 3, "away": 2}, 3000)
        bool_ts.pop("parsedAt")
        bool_ts["ts"] = True
        numeric_ts = self.snapshot("game-ts0", {"home": 4, "away": 3}, 4000)
        numeric_ts.pop("parsedAt")
        numeric_ts["ts"] = 1
        self.write(self.snapshots_path, [bool_ts, numeric_ts])

        plan = json.loads(self.run_cli().stdout)
        candidate = plan["candidates"][0]
        self.assertEqual(candidate["snapshotKey"], numeric_ts["snapshotKey"])
        self.assertEqual(candidate["snapshotParsedAt"], 1)


if __name__ == "__main__":
    unittest.main()
