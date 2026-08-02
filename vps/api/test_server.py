import importlib.util
import json
import os
import pathlib
import tempfile
import threading
import unittest
from unittest import mock


class ServerTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["SLF_API_TOKEN"] = "test-token"
        os.environ["SLF_DATA_DIR"] = cls.temp_dir.name
        os.environ["SLF_FORUM_FAQ_DIR"] = os.path.join(cls.temp_dir.name, "forum")
        server_path = pathlib.Path(__file__).with_name("server.py")
        spec = importlib.util.spec_from_file_location("slf_api_server_test", server_path)
        cls.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.server)
        cls.client = cls.server.app.test_client()
        cls.auth = {"Authorization": "Bearer test-token"}

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
            path.unlink()

    def write_collection(self, name, value):
        with open(os.path.join(self.temp_dir.name, f"{name}.json"), "w", encoding="utf-8") as file_handle:
            json.dump(value, file_handle)

    def read_collection(self, name):
        with open(os.path.join(self.temp_dir.name, f"{name}.json"), "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def test_unauthorized_request_is_rejected(self):
        response = self.client.get("/api/match_snapshots_v2")
        self.assertEqual(response.status_code, 401)

    def test_tactical_append_is_idempotent(self):
        payload = {"snapshotKey": "snapshot-1", "gameId": "g1", "ts": 1}
        first = self.client.post("/api/match_snapshots_v2?mode=append", json=payload, headers=self.auth)
        second = self.client.post("/api/match_snapshots_v2?mode=append", json=payload, headers=self.auth)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.get_json()["added"], 1)
        self.assertEqual(second.get_json()["added"], 0)
        self.assertEqual(second.get_json()["skippedDuplicates"], 1)
        self.assertEqual(len(self.read_collection("match_snapshots_v2")), 1)

    def test_duplicate_inside_single_request_is_skipped(self):
        payload = [
            {"eventKey": "event-1", "gameId": "g1"},
            {"eventKey": "event-1", "gameId": "g1"}
        ]
        response = self.client.post("/api/preset_events_v2?mode=append", json=payload, headers=self.auth)
        body = response.get_json()
        self.assertEqual(body["received"], 2)
        self.assertEqual(body["added"], 1)
        self.assertEqual(body["skippedDuplicates"], 1)

    def test_missing_unique_key_remains_backward_compatible(self):
        response = self.client.post(
            "/api/preset_effects_v2?mode=append",
            json={"gameId": "legacy"},
            headers=self.auth
        )
        body = response.get_json()
        self.assertEqual(body["added"], 1)
        self.assertEqual(body["missingUniqueKey"], 1)

    def test_corrupt_collection_returns_controlled_error(self):
        with open(os.path.join(self.temp_dir.name, "preset_effects_v2.json"), "w", encoding="utf-8") as file_handle:
            file_handle.write("{invalid\n")
        response = self.client.get("/api/preset_effects_v2", headers=self.auth)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["kind"], "collection_corrupt")

    def test_failed_replace_preserves_previous_file(self):
        self.write_collection("match_results_v2", [{"resultKey": "old"}])
        with mock.patch.object(self.server.os, "replace", side_effect=OSError("simulated")):
            with self.assertRaises(OSError):
                self.server.save_collection("match_results_v2", [{"resultKey": "new"}])
        self.assertEqual(self.read_collection("match_results_v2"), [{"resultKey": "old"}])

    def test_concurrent_appends_preserve_all_unique_records(self):
        errors = []

        def append(index):
            try:
                with self.server.collection_lock("preset_effects_v2"):
                    existing = self.server.load_collection("preset_effects_v2", default=[])
                    accepted, _, _ = self.server.filter_append_duplicates(
                        "preset_effects_v2",
                        existing,
                        [{"effectKey": f"effect-{index}", "gameId": "g1"}]
                    )
                    existing.extend(accepted)
                    self.server.save_collection("preset_effects_v2", existing)
            except Exception as error:
                errors.append(error)

        threads = [threading.Thread(target=append, args=(index,)) for index in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(self.read_collection("preset_effects_v2")), 20)

    def test_analysis_reports_duplicate_and_missing_keys(self):
        self.write_collection("preset_events_v2", [
            {"eventKey": "event-1", "gameId": "g1", "ts": 1},
            {"eventKey": "event-1", "gameId": "g1", "ts": 2},
            {"gameId": "g1", "ts": 3}
        ])
        response = self.client.get("/api/analysis", headers=self.auth)
        health = response.get_json()["collections"]["preset_events_v2"]
        self.assertEqual(health["duplicateKeys"], 1)
        self.assertEqual(health["missingUniqueKeys"], 1)
        self.assertEqual(health["oldestTimestamp"], 1)
        self.assertEqual(health["newestTimestamp"], 3)


if __name__ == "__main__":
    unittest.main()
