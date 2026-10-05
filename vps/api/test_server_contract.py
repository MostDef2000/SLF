import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


class FinishedScoreContractTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["SLF_API_TOKEN"] = "contract-test-token"
        os.environ["SLF_DATA_DIR"] = cls.temp_dir.name
        os.environ["SLF_FORUM_FAQ_DIR"] = os.path.join(cls.temp_dir.name, "forum")
        server_path = pathlib.Path(__file__).with_name("server.py")
        spec = importlib.util.spec_from_file_location("slf_api_server_contract_test", server_path)
        assert spec is not None and spec.loader is not None
        cls.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.server)
        cls.client = cls.server.app.test_client()
        cls.auth = {"Authorization": "Bearer contract-test-token"}

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
            path.unlink()

    def read_collection(self, name):
        with open(os.path.join(self.temp_dir.name, f"{name}.json"), "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def collection_path(self, name):
        return os.path.join(self.temp_dir.name, f"{name}.json")

    def finished_result(self, result_key, score, game_id="game-finished"):
        return {
            "recordType": "match_result",
            "resultType": "finished_match",
            "schemaVersion": 2,
            "parserVersion": "match_result_append_v1",
            "resultKey": result_key,
            "gameId": game_id,
            "status": "finished",
            "score": score,
            "parsedAt": 1770000000000,
        }

    def post_append(self, collection, payload):
        return self.client.post(f"/api/{collection}?mode=append", json=payload, headers=self.auth)

    def test_finished_result_with_score_is_appended_and_read_back(self):
        record = self.finished_result("match_result|game-a|finished_match|2:1|1-2", {"home": 2, "away": 1}, "game-a")
        response = self.post_append("match_results_v2", record)
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["added"], 1)
        self.assertEqual(body["received"], 1)

        stored = self.client.get("/api/match_results_v2", headers=self.auth).get_json()
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0]["score"], {"home": 2, "away": 1})
        self.assertEqual(stored[0]["resultKey"], "match_result|game-a|finished_match|2:1|1-2")
        self.assertIn("|2:1|", stored[0]["resultKey"])

    def test_draw_score_is_not_treated_as_missing(self):
        record = self.finished_result("match_result|game-b|finished_match|1:1|1-2", {"home": 1, "away": 1}, "game-b")
        response = self.post_append("match_results_v2", record)
        self.assertEqual(response.status_code, 200)
        stored = self.client.get("/api/match_results_v2", headers=self.auth).get_json()
        self.assertEqual(stored[0]["score"], {"home": 1, "away": 1})

    def test_zero_scores_are_persisted_exactly(self):
        payload = [
            self.finished_result("match_result|game-c0|finished_match|0:0|1-2", {"home": 0, "away": 0}, "game-c0"),
            self.finished_result("match_result|game-c1|finished_match|1:0|1-2", {"home": 1, "away": 0}, "game-c1"),
            self.finished_result("match_result|game-c2|finished_match|0:2|1-2", {"home": 0, "away": 2}, "game-c2"),
        ]
        response = self.post_append("match_results_v2", payload)
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["added"], 3)
        self.assertEqual(body["received"], 3)

        stored = self.client.get("/api/match_results_v2", headers=self.auth).get_json()
        scores = {row["resultKey"]: row["score"] for row in stored}
        self.assertEqual(scores["match_result|game-c0|finished_match|0:0|1-2"], {"home": 0, "away": 0})
        self.assertEqual(scores["match_result|game-c1|finished_match|1:0|1-2"], {"home": 1, "away": 0})
        self.assertEqual(scores["match_result|game-c2|finished_match|0:2|1-2"], {"home": 0, "away": 2})

    def test_finished_result_without_valid_score_is_rejected_before_persistence(self):
        invalid_scores = {
            "null": None,
            "string": {"home": "2", "away": 1},
            "bool_home": {"home": True, "away": 1},
            "bool_away": {"home": 2, "away": False},
            "out_of_range": {"home": 100, "away": 0},
        }
        for name, score in invalid_scores.items():
            with self.subTest(case=name):
                for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
                    path.unlink()
                record = self.finished_result(
                    f"match_result|game-d|finished_match|?:?|1-2", score, "game-d"
                )
                response = self.post_append("match_results_v2", record)
                body = response.get_json()
                self.assertEqual(response.status_code, 422)
                self.assertEqual(body["error"], "Finished match result requires a valid score")
                self.assertEqual(body["kind"], "invalid_finished_score")
                self.assertEqual(body["collection"], "match_results_v2")
                self.assertEqual(body["invalidFinishedScore"], 1)
                self.assertEqual(body["received"], 1)
                self.assertFalse(os.path.exists(self.collection_path("match_results_v2")))
                stored = self.client.get("/api/match_results_v2", headers=self.auth).get_json()
                self.assertEqual(stored, [])

    def test_mixed_append_rejects_whole_request_without_partial_write(self):
        payload = [
            self.finished_result("match_result|game-e1|finished_match|2:1|1-2", {"home": 2, "away": 1}, "game-e1"),
            self.finished_result("match_result|game-e2|finished_match|?:?|1-2", None, "game-e2"),
        ]
        response = self.post_append("match_results_v2", payload)
        body = response.get_json()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(body["kind"], "invalid_finished_score")
        self.assertEqual(body["invalidFinishedScore"], 1)
        self.assertEqual(body["received"], 2)
        self.assertFalse(os.path.exists(self.collection_path("match_results_v2")))

    def test_non_finished_result_without_score_is_accepted(self):
        record = {
            "recordType": "match_result",
            "resultKey": "match_result|game-f|live|?:?|1-2",
            "gameId": "game-f",
            "status": "live",
        }
        response = self.post_append("match_results_v2", record)
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["added"], 1)
        stored = self.client.get("/api/match_results_v2", headers=self.auth).get_json()
        self.assertEqual(stored[0]["status"], "live")

    def test_finished_snapshot_without_score_is_accepted(self):
        record = {
            "recordType": "match_snapshot",
            "schemaVersion": 2,
            "parserVersion": "match_snapshot_append_v1",
            "snapshotKey": "match_snapshot|game-g|finished|||?:?|1-2",
            "gameId": "game-g",
            "status": "finished",
        }
        response = self.post_append("match_snapshots_v2", record)
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["added"], 1)
        stored = self.client.get("/api/match_snapshots_v2", headers=self.auth).get_json()
        self.assertEqual(len(stored), 1)

    def test_duplicate_finished_result_key_is_skipped(self):
        record = self.finished_result("match_result|game-h|finished_match|2:1|1-2", {"home": 2, "away": 1}, "game-h")
        first = self.post_append("match_results_v2", record)
        second = self.post_append("match_results_v2", {**record, "parsedAt": 1770000000999})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.get_json()["added"], 1)
        second_body = second.get_json()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second_body["added"], 0)
        self.assertEqual(second_body["skippedDuplicates"], 1)
        self.assertEqual(len(self.read_collection("match_results_v2")), 1)


if __name__ == "__main__":
    unittest.main()
