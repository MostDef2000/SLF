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

    def test_all_tactical_collections_reject_retried_logical_records(self):
        cases = {
            "match_snapshots_v2": {"snapshotKey": "snapshot-1", "gameId": "g1"},
            "match_results_v2": {"resultKey": "result-1", "gameId": "g1"},
            "preset_events_v2": {"eventKey": "event-1", "gameId": "g1"},
            "preset_effects_v2": {"effectKey": "effect-1", "gameId": "g1"}
        }
        for collection, payload in cases.items():
            with self.subTest(collection=collection):
                first = self.client.post(
                    f"/api/{collection}?mode=append",
                    json=payload,
                    headers=self.auth
                )
                second = self.client.post(
                    f"/api/{collection}?mode=append",
                    json={**payload, "ts": 999, "source": {"trigger": "retry"}},
                    headers=self.auth
                )
                self.assertEqual(first.status_code, 200)
                self.assertEqual(second.status_code, 200)
                self.assertEqual(first.get_json()["added"], 1)
                self.assertEqual(second.get_json()["added"], 0)
                self.assertEqual(second.get_json()["skippedDuplicates"], 1)
                self.assertEqual(len(self.read_collection(collection)), 1)

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

    def test_missing_unique_key_is_rejected_before_persistence(self):
        response = self.client.post(
            "/api/preset_effects_v2?mode=append",
            json={"gameId": "legacy"},
            headers=self.auth
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(body["kind"], "missing_unique_key")
        self.assertEqual(body["missingUniqueKey"], 1)
        self.assertFalse(os.path.exists(os.path.join(self.temp_dir.name, "preset_effects_v2.json")))

    def test_mixed_append_with_missing_key_is_rejected_without_partial_write(self):
        payload = [
            {"effectKey": "effect-1", "gameId": "g1"},
            {"gameId": "g1"}
        ]
        response = self.client.post("/api/preset_effects_v2?mode=append", json=payload, headers=self.auth)
        body = response.get_json()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(body["kind"], "missing_unique_key")
        self.assertEqual(body["missingUniqueKey"], 1)
        self.assertFalse(os.path.exists(os.path.join(self.temp_dir.name, "preset_effects_v2.json")))

    def test_oversized_request_body_is_rejected(self):
        oversized = {"gameId": "g1", "blob": "x" * (1024 * 1024 + 1)}
        response = self.client.post("/api/tactics?mode=replace", json=oversized, headers=self.auth)
        body = response.get_json()
        self.assertEqual(response.status_code, 413)
        self.assertEqual(body["kind"], "payload_too_large")
        self.assertEqual(body["limitBytes"], 1024 * 1024)

    def test_cors_allows_explicit_origins_only(self):
        allowed = self.client.get(
            "/api/analysis",
            headers={**self.auth, "Origin": "https://slf.fm"}
        )
        self.assertEqual(allowed.headers.get("Access-Control-Allow-Origin"), "https://slf.fm")
        denied = self.client.get(
            "/api/analysis",
            headers={**self.auth, "Origin": "https://evil.example"}
        )
        self.assertIsNone(denied.headers.get("Access-Control-Allow-Origin"))

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

    def test_analysis_reports_configured_advisor_model_without_api_key(self):
        # Build the sentinel at runtime so no literal secret-shaped value is
        # embedded in the test source.
        sentinel_key = "unit" + "-test-" + "advisor-key-441"
        with mock.patch.dict(
            os.environ,
            {"SLF_ADVISOR_MODEL": "vendor/test-model-441:free", "OPENROUTER_API_KEY": sentinel_key},
        ):
            response = self.client.get("/api/analysis", headers=self.auth)
        body = response.get_json()
        self.assertEqual(body["advisor"]["model"], "vendor/test-model-441:free")
        self.assertEqual(body["advisor"]["service"], "OpenRouter")
        self.assertNotIn(sentinel_key, response.get_data(as_text=True))

    def test_analysis_survives_advisor_config_failure(self):
        with mock.patch.object(self.server.advisor, "get_config", side_effect=RuntimeError("boom")):
            response = self.client.get("/api/analysis", headers=self.auth)
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertIsNone(body["advisor"]["model"])
        self.assertEqual(body["advisor"]["service"], "OpenRouter")


class _ProbingCache(dict):
    """Cache dict that reports every visible state, as a reader sees it.

    A dict write is atomic, so each notification is exactly one publication:
    the test asserts every published (signature, index) pair is coherent.
    """

    def __init__(self, initial, on_publish):
        super().__init__(initial)
        self._on_publish = on_publish

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        # Report what a reader would see now, whatever shape the cache has:
        # a single "state" slot, or (regression guard) split keys.
        state = self.get("state")
        if state is None:
            state = (self.get("signature"), self.get("index"))
        if state is not None:
            self._on_publish(state)


class EvaluationHookTestCase(unittest.TestCase):
    """Ф2c (#441): server-side evaluation triggers and the results index cache.

    Covers the append hook (primary trigger), the cache contract (winners
    only, stat-guarded reuse) and the lock order under concurrency.
    """

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["SLF_API_TOKEN"] = "test-token"
        os.environ["SLF_DATA_DIR"] = cls.temp_dir.name
        os.environ["SLF_FORUM_FAQ_DIR"] = os.path.join(cls.temp_dir.name, "forum")
        server_path = pathlib.Path(__file__).with_name("server.py")
        spec = importlib.util.spec_from_file_location("slf_api_server_evaluation_test", server_path)
        cls.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.server)
        cls.advisor = cls.server.advisor
        cls.client = cls.server.app.test_client()
        cls.auth = {"Authorization": "Bearer test-token"}

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
            path.unlink()
        cache = getattr(self.server, "_RESULTS_INDEX_CACHE", None)
        if isinstance(cache, dict):
            cache["state"] = (None, {})

    def write_collection(self, name, value):
        with open(os.path.join(self.temp_dir.name, f"{name}.json"), "w", encoding="utf-8") as file_handle:
            json.dump(value, file_handle)

    def read_collection(self, name):
        with open(os.path.join(self.temp_dir.name, f"{name}.json"), "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def finished_result(self, result_key, score, game_id="g-123", parsed_at=2000):
        return {
            "recordType": "match_result",
            "resultType": "finished_match",
            "schemaVersion": 2,
            "resultKey": result_key,
            "gameId": game_id,
            "status": "finished",
            "score": score,
            "parsedAt": parsed_at,
        }

    def advice_record(self, advice_id="a", game_id="g-123"):
        return {
            "id": advice_id,
            "ts": 1,
            "gameId": game_id[:40],
            "evaluationGameId": game_id,
            "scoreAtAdvice": {"home": 0, "away": 0},
            "outcome": "ok",
        }

    def post_append(self, payload, collection="match_results_v2"):
        return self.client.post(f"/api/{collection}?mode=append", json=payload, headers=self.auth)

    def read_log(self):
        return {record["id"]: record for record in self.read_collection("advisor_log_v1")}

    # -- append hook (primary trigger) ---------------------------------------

    def test_append_hook_evaluates_matching_advice_record(self):
        self.write_collection("advisor_log_v1", [self.advice_record()])
        response = self.post_append(self.finished_result("rk-1", {"home": 2, "away": 1}))
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["added"], 1)
        log = self.read_log()
        self.assertEqual(log["a"]["evaluation"]["finalScore"], {"home": 2, "away": 1})
        self.assertEqual(log["a"]["evaluation"]["scoreDelta"], {"home": 2, "away": 1})

    def test_duplicate_only_append_repairs_evaluation_without_counter_change(self):
        self.write_collection("match_results_v2", [self.finished_result("rk-1", {"home": 2, "away": 1})])
        self.write_collection("advisor_log_v1", [self.advice_record()])
        response = self.post_append(
            self.finished_result("rk-1", {"home": 2, "away": 1}, parsed_at=9000))
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["received"], 1)
        self.assertEqual(body["added"], 0)
        self.assertEqual(body["skippedDuplicates"], 1)
        self.assertEqual(body["count"], 1)
        self.assertEqual(self.read_log()["a"]["evaluation"]["finalScore"], {"home": 2, "away": 1})

    def test_failed_evaluation_never_erases_accepted_results(self):
        with mock.patch.object(self.advisor, "materialize_evaluations", side_effect=RuntimeError("boom")):
            with self.assertLogs(self.server.app.logger, level="WARNING"):
                response = self.post_append(self.finished_result("rk-1", {"home": 2, "away": 1}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["added"], 1)
        stored = self.read_collection("match_results_v2")
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0]["score"], {"home": 2, "away": 1})

    # -- identity isolation --------------------------------------------------

    def test_result_for_another_game_never_evaluates_advice(self):
        self.write_collection("advisor_log_v1", [self.advice_record(game_id="g-other")])
        self.post_append(self.finished_result("rk-1", {"home": 2, "away": 1}, game_id="g-123"))
        self.assertNotIn("evaluation", self.read_log()["a"])
        # Positive control: the same advice record is evaluated once its own
        # game's result lands.
        self.post_append(self.finished_result("rk-2", {"home": 0, "away": 0}, game_id="g-other"))
        self.assertEqual(self.read_log()["a"]["evaluation"]["finalScore"], {"home": 0, "away": 0})

    def test_ids_sharing_the_truncated_prefix_stay_isolated(self):
        prefix = "g" * 40
        self.write_collection("advisor_log_v1", [
            self.advice_record("alpha", prefix + "-alpha"),
            self.advice_record("beta", prefix + "-beta"),
        ])
        self.post_append(self.finished_result("rk-beta", {"home": 1, "away": 0}, prefix + "-beta"))
        log = self.read_log()
        self.assertNotIn("evaluation", log["alpha"])
        self.assertEqual(log["beta"]["evaluation"]["finalScore"], {"home": 1, "away": 0})
        self.post_append(self.finished_result("rk-alpha", {"home": 3, "away": 2}, prefix + "-alpha"))
        log = self.read_log()
        self.assertEqual(log["alpha"]["evaluation"]["finalScore"], {"home": 3, "away": 2})
        self.assertEqual(log["beta"]["evaluation"]["finalScore"], {"home": 1, "away": 0})

    def test_missing_blank_or_non_string_ids_never_join(self):
        rows = [
            self.finished_result("rk-1", {"home": 1, "away": 0}, game_id="  "),
            self.finished_result("rk-2", {"home": 1, "away": 0}, game_id=123),
            {key: value for key, value in
             self.finished_result("rk-3", {"home": 1, "away": 0}).items() if key != "gameId"},
            self.finished_result("rk-4", {"home": 2, "away": 0}, game_id="g-123"),
        ]
        self.write_collection("match_results_v2", rows)
        index = self.server.read_results_index()
        self.assertEqual(list(index), ["g-123"])
        self.write_collection("advisor_log_v1", [
            {"id": "none", "outcome": "ok", "evaluationGameId": None, "scoreAtAdvice": {"home": 0, "away": 0}},
            {"id": "blank", "outcome": "ok", "evaluationGameId": "", "scoreAtAdvice": {"home": 0, "away": 0}},
            {"id": "numeric", "outcome": "ok", "evaluationGameId": 123, "scoreAtAdvice": {"home": 0, "away": 0}},
        ])
        self.assertEqual(self.advisor.materialize_evaluations(self.server.DATA_DIR, index), 0)
        log = self.read_log()
        for advice_id in ("none", "blank", "numeric"):
            self.assertNotIn("evaluation", log[advice_id])

    # -- cache ---------------------------------------------------------------

    def test_index_cache_is_reused_until_the_results_file_changes(self):
        self.write_collection("match_results_v2", [
            self.finished_result("rk-1", {"home": 1, "away": 0}, game_id="g-a")])
        with mock.patch.object(self.server, "load_collection",
                               wraps=self.server.load_collection) as loader:
            cold = self.server.read_results_index()
            warm = self.server.read_results_index()
            self.assertEqual(loader.call_count, 1, "unchanged file must not be re-parsed")
            self.assertIs(warm, cold)
            self.assertIsInstance(cold, dict)
            self.assertNotIsInstance(cold, list, "the raw results list is never retained")
            self.assertEqual(list(cold), ["g-a"])
            self.assertEqual(cold["g-a"]["resultKey"], "rk-1")
            self.assertIs(self.server._RESULTS_INDEX_CACHE["state"][1], cold)
            self.write_collection("match_results_v2", [
                self.finished_result("rk-1", {"home": 1, "away": 0}, game_id="g-a"),
                self.finished_result("rk-2", {"home": 2, "away": 0}, game_id="g-b"),
                {key: value for key, value in
                 self.finished_result("rk-3", {"home": 0, "away": 0}, game_id="g-a").items()
                 if key != "status"},
            ])
            rebuilt = self.server.read_results_index()
            self.assertEqual(loader.call_count, 2, "a changed file must be re-parsed")
        self.assertIsNot(rebuilt, cold)
        self.assertEqual(sorted(rebuilt), ["g-a", "g-b"])

    def test_index_keeps_only_the_winner_per_game(self):
        live_only = self.finished_result("rk-live", {"home": 0, "away": 0}, game_id="g-live")
        live_only["status"] = "live"
        self.write_collection("match_results_v2", [
            self.finished_result("rk-older", {"home": 1, "away": 0}, parsed_at=1000),
            self.finished_result("rk-newer", {"home": 3, "away": 2}, parsed_at=2000),
            live_only,
        ])
        index = self.server.read_results_index()
        self.assertEqual(list(index), ["g-123"])
        self.assertEqual(index["g-123"]["resultKey"], "rk-newer")

    def test_same_size_rewrite_with_preserved_mtime_invalidates_the_cache(self):
        path = os.path.join(self.temp_dir.name, "match_results_v2.json")
        self.write_collection("match_results_v2", [
            self.finished_result("rk-aaaa", {"home": 1, "away": 0}, game_id="g-aa")])
        first = self.server.read_results_index()
        self.assertEqual(list(first), ["g-aa"])
        original = os.stat(path)
        original_signature = self.server.results_file_signature()
        self.write_collection("match_results_v2", [
            self.finished_result("rk-bbbb", {"home": 2, "away": 0}, game_id="g-bb")])
        self.assertEqual(os.path.getsize(path), original.st_size,
                         "fixture must rewrite the same byte count")
        os.utime(path, ns=(original.st_atime_ns, original.st_mtime_ns))
        self.assertEqual(os.stat(path).st_mtime_ns, original.st_mtime_ns,
                         "mtime must stay frozen for the test to mean anything")
        self.assertNotEqual(self.server.results_file_signature(), original_signature)
        rebuilt = self.server.read_results_index()
        self.assertEqual(list(rebuilt), ["g-bb"])
        self.assertIsNot(rebuilt, first)

    def test_cache_publication_is_atomic_across_a_rebuild(self):
        # First publication: the old (signature, index) pair.
        self.write_collection("match_results_v2", [
            self.finished_result("rk-old", {"home": 1, "away": 0}, game_id="g-aa")])
        old_index = self.server.read_results_index()
        old_signature = self.server._RESULTS_INDEX_CACHE["state"][0]
        self.assertEqual(list(old_index), ["g-aa"])

        # A rewrite produces a new signature and a different index.
        self.write_collection("match_results_v2", [
            self.finished_result("rk-new", {"home": 2, "away": 0}, game_id="g-bb"),
            self.finished_result("rk-old", {"home": 1, "away": 0}, game_id="g-aa"),
        ])
        new_signature = self.server.results_file_signature()
        self.assertNotEqual(new_signature, old_signature)

        published = []
        recorder = _ProbingCache({"state": (old_signature, old_index)}, published.append)
        real_build = self.server.build_results_index
        built = threading.Event()
        release = threading.Event()

        def spying_build(rows):
            index = real_build(rows)
            built.set()
            self.assertTrue(release.wait(timeout=10), "writer was never released")
            return index

        writer = {}

        def rebuild():
            writer["index"] = self.server.read_results_index()

        original_cache = self.server._RESULTS_INDEX_CACHE
        self.server._RESULTS_INDEX_CACHE = recorder
        try:
            with mock.patch.object(self.server, "build_results_index", side_effect=spying_build):
                thread = threading.Thread(target=rebuild, daemon=True)
                thread.start()
                try:
                    self.assertTrue(built.wait(timeout=10),
                                    "writer never reached the publish window")
                    # Reader inside the window: the cache still publishes the
                    # OLD pair — never the new signature over the old index.
                    signature_now, index_now = recorder["state"]
                    self.assertEqual(signature_now, old_signature)
                    self.assertIs(index_now, old_index)
                finally:
                    release.set()
                thread.join(timeout=10)
                self.assertFalse(thread.is_alive(), "writer did not finish")
        finally:
            self.server._RESULTS_INDEX_CACHE = original_cache

        self.assertEqual(sorted(writer["index"]), ["g-aa", "g-bb"])
        self.assertEqual(recorder["state"], (new_signature, writer["index"]))
        coherent = [(old_signature, old_index), (new_signature, writer["index"])]
        self.assertEqual(len(published), 1, "exactly one publication of the new pair")
        for pair in published:
            self.assertIn(pair, coherent, "torn publication: signature/index mismatch")

    # -- lock order ----------------------------------------------------------

    def test_concurrent_append_read_and_evaluation_never_deadlocks(self):
        self.write_collection("advisor_log_v1", [self.advice_record()])
        errors = []

        def append(index):
            try:
                with self.server.collection_lock("match_results_v2"):
                    existing = self.server.load_collection("match_results_v2", default=[])
                    accepted, _, _ = self.server.filter_append_duplicates(
                        "match_results_v2",
                        existing,
                        [self.finished_result(f"rk-{index}", {"home": index, "away": 0})]
                    )
                    existing.extend(accepted)
                    self.server.save_collection("match_results_v2", existing)
                    self.server.refresh_results_evaluations(existing)
            except Exception as error:
                errors.append(error)

        def read_and_evaluate():
            try:
                self.advisor.materialize_evaluations(
                    self.server.DATA_DIR, self.server.read_results_index())
            except Exception as error:
                errors.append(error)

        def apply_event():
            try:
                self.advisor.update_log_record_apply(self.server.DATA_DIR, "a", True)
            except Exception as error:
                errors.append(error)

        threads = [threading.Thread(target=append, args=(index,), daemon=True) for index in range(6)]
        threads += [threading.Thread(target=read_and_evaluate, daemon=True) for _ in range(6)]
        threads += [threading.Thread(target=apply_event, daemon=True) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
            self.assertFalse(thread.is_alive(), "lock-order deadlock")
        self.assertEqual(errors, [])
        self.assertEqual(len(self.read_collection("match_results_v2")), 6)


if __name__ == "__main__":
    unittest.main()
