"""Tests for the LLM second-opinion advisor endpoint (specs/434-llm-tactical-advisor).

Follows the test_server.py pattern: importlib load with env overrides,
Flask test client, advisor.call_openrouter mocked (no network).
"""

import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock


def _load_server():
    sys_path_added = str(pathlib.Path(__file__).parent)
    if sys_path_added not in __import__("sys").path:
        __import__("sys").path.insert(0, sys_path_added)
    server_path = pathlib.Path(__file__).with_name("server.py")
    spec = importlib.util.spec_from_file_location("slf_api_server_advisor_test", server_path)
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
    return server


class AdvisorTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["SLF_API_TOKEN"] = "test-token"
        os.environ["SLF_DATA_DIR"] = cls.temp_dir.name
        os.environ["SLF_FORUM_FAQ_DIR"] = os.path.join(cls.temp_dir.name, "forum")
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        cls.server = _load_server()
        cls.advisor = cls.server.advisor
        cls.client = cls.server.app.test_client()
        cls.auth = {"Authorization": "Bearer test-token"}

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
            path.unlink()

    def valid_body(self):
        return {
            "gameId": "g-123",
            "minute": 30,
            "bucket": "16-30",
            "score": {"home": 0, "away": 0},
            "currentPreset": "Emery_BalancedBase_v11",
            "developerHints": ["[Клопп] Отключите атаку по центру"],
            "ruleDecision": {
                "preset": "Emery_BalancedBase_v11",
                "gameMode": "active_control",
                "confidence": "medium",
                "topCandidates": [
                    {"id": "Emery_BalancedBase_v11", "score": 35.7},
                    {"id": "Pep_BoxControl_bal2", "score": 23.5}
                ]
            },
            "signals": {"strengthGap": -12, "pressureRisk": 41.4, "underPressure": True},
            "presetCatalog": [
                {"id": "Emery_BalancedBase_v11", "label": "Emery Balanced Base", "idea": "баланс", "use": "база", "risk": "низкий"},
                {"id": "Pep_BoxControl_bal2", "label": "Pep Box Control", "idea": "контроль", "use": "при контроле", "risk": "средний"}
            ]
        }

    def read_log(self):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def test_unauthorized_request_is_rejected(self):
        response = self.client.post("/api/advisor", json=self.valid_body())
        self.assertEqual(response.status_code, 401)

    def test_missing_key_returns_503(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["errorKind"], "advisor_not_configured")
        self.assertEqual(self.read_log(), [])

    def test_invalid_request_returns_400(self):
        body = self.valid_body()
        body.pop("presetCatalog")
        response = self.client.post("/api/advisor", json=body, headers=self.auth)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["errorKind"], "invalid_request")

    def test_success_returns_validated_answer(self):
        answer = json.dumps({
            "preset": "Pep_BoxControl_bal2",
            "confidence": "high",
            "reason": "Контроль центра при ничейном счёте оправдан."
        }, ensure_ascii=False)
        with mock.patch.object(self.advisor, "call_openrouter", return_value=(answer, 1234)):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["available"])
        self.assertEqual(payload["preset"], "Pep_BoxControl_bal2")
        self.assertEqual(payload["presetLabel"], "Pep Box Control")
        self.assertEqual(payload["confidence"], "high")
        self.assertEqual(payload["latencyMs"], 1234)
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["outcome"], "ok")
        self.assertEqual(log[0]["llmPreset"], "Pep_BoxControl_bal2")
        self.assertEqual(log[0]["rulesPreset"], "Emery_BalancedBase_v11")
        self.assertEqual(log[0]["model"], self.advisor.DEFAULT_MODEL)

    def test_rate_limited_then_success(self):
        answer = json.dumps({"preset": "Emery_BalancedBase_v11", "confidence": "low", "reason": "Держим базу."})
        effects = [
            self.advisor.AdvisorError("rate_limited", "limited", retry_after=1.0, status=429),
            (answer, 2000),
        ]
        with mock.patch.object(self.advisor, "call_openrouter", side_effect=effects), \
                mock.patch.object(self.advisor.time, "sleep") as sleep_mock:
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["available"])
        sleep_mock.assert_called_once()
        self.assertLessEqual(sleep_mock.call_args[0][0], self.advisor.RETRY_AFTER_CAP_S)
        self.assertEqual(len(self.read_log()), 1)

    def test_invalid_json_retry_then_502(self):
        with mock.patch.object(self.advisor, "call_openrouter", return_value=("извините, не могу", 500)), \
                mock.patch.object(self.advisor.time, "sleep"):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 502)
        payload = response.get_json()
        self.assertFalse(payload["available"])
        self.assertEqual(payload["errorKind"], "invalid_answer")
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["outcome"], "error")
        self.assertEqual(log[0]["errorKind"], "invalid_answer")

    def test_unknown_preset_rejected(self):
        answer = json.dumps({"preset": "Hallucinated_433_ultra", "confidence": "high", "reason": "нет такого"})
        with mock.patch.object(self.advisor, "call_openrouter", return_value=(answer, 700)), \
                mock.patch.object(self.advisor.time, "sleep"):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["errorKind"], "invalid_answer")
        self.assertEqual(self.read_log()[0]["llmPreset"], None)

    def test_rate_limited_both_attempts_returns_503(self):
        effects = [
            self.advisor.AdvisorError("rate_limited", "limited", retry_after=1.0, status=429),
            self.advisor.AdvisorError("rate_limited", "limited", retry_after=1.0, status=429),
        ]
        with mock.patch.object(self.advisor, "call_openrouter", side_effect=effects), \
                mock.patch.object(self.advisor.time, "sleep"):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["errorKind"], "rate_limited")
        self.assertEqual(self.read_log()[0]["outcome"], "error")

    def test_context_budget_enforced(self):
        # Defense-in-depth backstop: with every per-field cap maxed the body
        # still fits the 64KiB budget, so shrink the budget to exercise the
        # rejection branch. Network is mocked — no real provider call.
        body = self.valid_body()
        body["signals"] = {f"sig_{i}": "x" * 120 for i in range(40)}
        body["developerHints"] = ["h" * 300] * 20
        body["presetCatalog"] = [
            {"id": f"preset_{i}", "label": "L" * 120, "idea": "i" * 300, "use": "u" * 300, "risk": "r" * 300}
            for i in range(40)
        ]
        answer = json.dumps({"preset": "preset_0", "confidence": "low", "reason": "ок"})
        with mock.patch.object(self.advisor, "MAX_CONTEXT_BYTES", 100), \
                mock.patch.object(self.advisor, "call_openrouter", return_value=(answer, 10)):
            response = self.client.post("/api/advisor", json=body, headers=self.auth)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["errorKind"], "invalid_request")

        # The same maxed-out body fits the real budget and reaches the LLM.
        with mock.patch.object(self.advisor, "call_openrouter", return_value=(answer, 10)):
            response = self.client.post("/api/advisor", json=body, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["available"])


if __name__ == "__main__":
    unittest.main()
