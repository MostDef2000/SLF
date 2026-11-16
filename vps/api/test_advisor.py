"""Tests for the LLM second-opinion advisor endpoint (specs/434-llm-tactical-advisor).

Follows the test_server.py pattern: importlib load with env overrides,
Flask test client, advisor.call_openrouter mocked (no network).
AdvisorProxyTestCase covers the SLF_ADVISOR_PROXY SOCKS5 relay path against
a scripted loopback socket server — still no external network.
"""

import datetime
import importlib.util
import json
import os
import pathlib
import socket
import struct
import tempfile
import threading
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
        # Ф2a (#441): a successful answer carries a non-empty adviceId.
        self.assertIn("adviceId", payload)
        self.assertIsInstance(payload["adviceId"], str)
        self.assertTrue(payload["adviceId"])
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["outcome"], "ok")
        self.assertEqual(log[0]["llmPreset"], "Pep_BoxControl_bal2")
        self.assertEqual(log[0]["rulesPreset"], "Emery_BalancedBase_v11")
        self.assertEqual(log[0]["model"], self.advisor.DEFAULT_MODEL)
        # Ф2a (#441): the persisted record carries the same value under "id".
        self.assertEqual(log[0]["id"], payload["adviceId"])

    def test_error_record_has_no_id(self):
        # Ф2a (#441): only successful answers mint an advice id; error-path
        # records must not carry one (nothing to apply against).
        with mock.patch.object(self.advisor, "call_openrouter", return_value=("извините, не могу", 500)), \
                mock.patch.object(self.advisor.time, "sleep"):
            response = self.client.post("/api/advisor", json=self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.get_json()["available"])
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["outcome"], "error")
        self.assertNotIn("id", log[0], "error-path record must not carry an advice id")

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


class AdvisorEnrichmentTestCase(unittest.TestCase):
    """Ф2b (#441): server-side prompt enrichment (history + knowledge pack).

    The advisor prompt gains a labelled, budget-capped block built from the
    advisor log and the daily tactical knowledge-pack artifact. All tests
    hermetic: network is mocked and temporary dirs hold the data/pack files.
    """

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

    def data_dir(self):
        return self.temp_dir.name

    def read_log(self):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def seed_log(self, records):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")

    def seed_knowledge_pack(self, rules):
        """Write a pack-shaped artifact and return its path."""
        path = pathlib.Path(self.temp_dir.name) / "knowledge-pack.latest.json"
        pack = {
            "schema": "slf_tactical_knowledge_pack_v1",
            "version": 1,
            "source": "test",
            "rules": rules,
            "generatorContext": {},
        }
        path.write_text(json.dumps(pack, ensure_ascii=False), encoding="utf-8")
        return path

    def capture_messages(self, body=None):
        """POST /api/advisor with a mocked provider; return outgoing messages."""
        captured = {}
        answer = json.dumps({
            "preset": "Pep_BoxControl_bal2", "confidence": "high", "reason": "ок"
        })

        def fake_call(messages, api_key, model):
            captured["messages"] = messages
            return answer, 1

        with mock.patch.object(self.advisor, "call_openrouter", side_effect=fake_call):
            response = self.client.post(
                "/api/advisor", json=body or self.valid_body(), headers=self.auth)
        self.assertEqual(response.status_code, 200)
        return captured.get("messages", [])

    @staticmethod
    def user_content(messages):
        return next(m["content"] for m in messages if m.get("role") == "user")

    def legacy_messages(self, body):
        """Pre-Ф2b prompt, built independently as the byte-identity oracle."""
        # Mirror the test client wire round-trip (Flask's JSON provider sorts
        # keys), so the legacy payload reflects exactly what the server sees.
        wire_body = json.loads(self.server.app.json.dumps(body))
        context = self.advisor.validate_context(wire_body)
        catalog_lines = "\n".join(
            f"- {entry['id']} | {entry['label']}"
            + (f" | идея: {entry['idea']}" if entry["idea"] else "")
            + (f" | когда: {entry['use']}" if entry["use"] else "")
            + (f" | риск: {entry['risk']}" if entry["risk"] else "")
            for entry in context["presetCatalog"]
        )
        decision = context["ruleDecision"]
        candidates_text = ", ".join(
            f"{c['id']}={c['score']}" for c in decision["topCandidates"]
        ) or "нет"
        hints_text = "; ".join(context["developerHints"]) or "нет"
        situation = {
            k: context[k]
            for k in ("gameId", "minute", "bucket", "score", "currentPreset", "signals")
        }
        user_payload = (
            "Ситуация (JSON): " + json.dumps(situation, ensure_ascii=False) + "\n"
            "Подсказки тренеров: " + hints_text + "\n"
            "Решение правилого движка: пресет " + str(decision["preset"])
            + ", режим " + str(decision["gameMode"])
            + ", уверенность " + str(decision["confidence"])
            + "; кандидаты: " + candidates_text + "\n"
            "Каталог пресетов:\n" + catalog_lines + "\n"
            "Дай JSON-ответ."
        )
        return [
            {"role": "system", "content": self.advisor.SYSTEM_PROMPT},
            {"role": "user", "content": user_payload},
        ]

    def test_history_includes_same_game_apply_facts(self):
        self.seed_log([
            {"ts": 3500, "gameId": "g-123", "minute": 70, "rulesPreset": "A",
             "llmPreset": None, "confidence": None, "outcome": "error",
             "errorKind": "invalid_answer"},
            {"ts": 3000, "gameId": "g-123", "minute": 67,
             "rulesPreset": "Emery_BalancedBase_v11", "llmPreset": "Pep_BoxControl_bal2",
             "confidence": "high", "outcome": "ok", "apply": {"ok": True}},
            {"ts": 2000, "gameId": "g-123", "minute": 55,
             "rulesPreset": "A", "llmPreset": "B", "confidence": "medium",
             "outcome": "ok", "apply": {"ok": False}},
            {"ts": 1000, "gameId": "g-123", "minute": 40,
             "rulesPreset": "A", "llmPreset": "C", "confidence": "low",
             "outcome": "ok"},
        ])
        content = self.user_content(self.capture_messages())
        self.assertIn("История советов и знания (сервер):", content)
        self.assertIn("мин 67:", content)
        self.assertIn("Emery_BalancedBase_v11", content)
        self.assertIn("применён успешно", content)
        self.assertIn("применение не удалось", content)
        self.assertIn("применение не отмечено", content)
        self.assertIn("консультация с ошибкой (invalid_answer)", content)

    def test_history_prefers_same_game_before_newer_other_game(self):
        self.seed_log([
            {"ts": 9999, "gameId": "other-game", "minute": 10,
             "rulesPreset": "OG", "llmPreset": "OtherLatest",
             "confidence": "high", "outcome": "ok"},
            {"ts": 1000, "gameId": "g-123", "minute": 20,
             "rulesPreset": "SG", "llmPreset": "SameGameOlder",
             "confidence": "high", "outcome": "ok"},
        ])
        content = self.user_content(self.capture_messages())
        self.assertLess(
            content.index("SameGameOlder"), content.index("OtherLatest"),
            "same-game history must be rendered before newer other-game rows")

    def test_empty_log_prompt_is_byte_identical_to_legacy(self):
        body = self.valid_body()
        messages = self.capture_messages(body)
        self.assertEqual(messages, self.legacy_messages(body))
        self.assertNotIn("История советов и знания (сервер):",
                         self.user_content(messages))

    def test_budget_caps_block_and_truncates_at_entry_boundary(self):
        self.seed_log([
            {"ts": i, "gameId": "g-123", "minute": i % 90,
             "rulesPreset": "R" * 80, "llmPreset": "L" * 80,
             "confidence": "high", "outcome": "ok"}
            for i in range(12)
        ])
        pack = {
            "schema": "slf_tactical_knowledge_pack_v1",
            "rules": [
                {"id": f"k{i}",
                 "when": {"score_state": "losing", "minute_min": 55},
                 "recommendation": {
                     "preset": "Preset_" + "P" * 60,
                     "reason": "причина " * 60,
                 },
                 "confidence": "medium"}
                for i in range(80)
            ],
        }
        enrichment = self.advisor.build_enrichment(
            self.data_dir(), {"gameId": "g-123"}, lambda: pack)
        self.assertLessEqual(len(enrichment), self.advisor.ENRICHMENT_BUDGET_CHARS)
        self.assertIn(self.advisor.ENRICHMENT_TRUNCATION_MARKER, enrichment)

        expected_lines = set()
        for record in self.advisor._select_history(self.read_log(), "g-123"):
            expected_lines.add(self.advisor._render_history_record(record))
        for entry in pack["rules"]:
            expected_lines.add(self.advisor._render_knowledge_entry(entry))
        body = enrichment.replace(
            self.advisor.ENRICHMENT_TRUNCATION_MARKER + "\n", "")
        kept = 0
        for line in body.splitlines():
            if not line.startswith("- "):
                continue
            kept += 1
            self.assertIn(line, expected_lines, f"entry cut mid-line: {line!r}")
        self.assertLess(kept, len(expected_lines), "budget did not drop any entry")

    def test_corrupt_log_degrades_to_empty_history(self):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        path.write_text("{invalid json\n", encoding="utf-8")
        # Enrichment itself is read-only: the corrupt file is not reset.
        self.assertEqual(
            self.advisor.build_enrichment(
                self.data_dir(), {"gameId": "g-123"}, None), "")
        self.assertEqual(path.read_text(encoding="utf-8"), "{invalid json\n")
        # And the consultation still succeeds with no history section.
        content = self.user_content(self.capture_messages())
        self.assertNotIn("История советов (сервер):", content)

    def test_missing_or_corrupt_knowledge_pack_degrades_to_empty_knowledge(self):
        # No pack file at all: the server reader returns None.
        with mock.patch.object(
                self.server, "KNOWLEDGE_PACK_PATH",
                str(pathlib.Path(self.temp_dir.name) / "missing-pack.json")):
            content = self.user_content(self.capture_messages())
        self.assertNotIn("Гипотезы из тактической базы", content)
        # Corrupt pack: JSONDecodeError is swallowed by the reader.
        corrupt = pathlib.Path(self.temp_dir.name) / "corrupt-pack.json"
        corrupt.write_text("{bad json\n", encoding="utf-8")
        with mock.patch.object(self.server, "KNOWLEDGE_PACK_PATH", str(corrupt)):
            content = self.user_content(self.capture_messages())
        self.assertNotIn("Гипотезы из тактической базы", content)

    def test_raising_or_garbage_reader_is_ignored(self):
        def boom():
            raise RuntimeError("reader failure")

        enrichment = self.advisor.build_enrichment(
            self.data_dir(), {"gameId": None}, boom)
        self.assertNotIn("Гипотезы из тактической базы", enrichment)
        # A non-pack payload (e.g. a bare string) yields an empty section.
        enrichment = self.advisor.build_enrichment(
            self.data_dir(), {"gameId": None}, lambda: "garbage")
        self.assertNotIn("Гипотезы из тактической базы", enrichment)

    def test_read_knowledge_none_keeps_history_only(self):
        self.seed_log([
            {"ts": 1, "gameId": "g-123", "minute": 5, "rulesPreset": "A",
             "llmPreset": "B", "confidence": "high", "outcome": "ok"},
        ])
        enrichment = self.advisor.build_enrichment(
            self.data_dir(), {"gameId": "g-123"}, None)
        self.assertIn("История советов (сервер):", enrichment)
        self.assertIn("мин 5:", enrichment)
        self.assertNotIn("Гипотезы из тактической базы", enrichment)

    def test_knowledge_section_renders_pack_rules(self):
        long_reason = (
            "Если команда проигрывает после 55-й минуты при низком давлении, "
            "разумно сменить схему на более атакующую. " + "обоснование " * 40
        )
        path = self.seed_knowledge_pack([
            {"id": "case_losing_after_55_low_bad_press",
             "when": {"score_state": "losing", "minute_min": 55, "my_bad_max": 8},
             "recommendation": {"preset": "Pep_BoxControl_bal2",
                                "reason": long_reason},
             "confidence": "medium",
             "sources": ["forum:1"]},
            {"id": "case_winning_late", "when": {"score_state": "winning"},
             "recommendation": {"preset": "Emery_BalancedBase_v11",
                                "reason": "держать счёт"},
             "confidence": "low", "sources": []},
        ])
        with mock.patch.object(self.server, "KNOWLEDGE_PACK_PATH", str(path)):
            content = self.user_content(self.capture_messages())
        self.assertIn(
            "Гипотезы из тактической базы "
            "(сеяные гипотезы, не проверенные законы движка):", content)
        self.assertIn("case_losing_after_55_low_bad_press", content)
        self.assertIn("Pep_BoxControl_bal2", content)
        self.assertIn("проигрывает после 55-й минуты", content)
        self.assertIn("уверенность medium", content)
        # A >400-char reason is capped per entry: pin the rendered line length
        # (not just the ellipsis marker) against the module constant.
        knowledge_lines = [
            line for line in content.splitlines()
            if line.startswith("- [case_losing_after_55_low_bad_press]")
        ]
        self.assertEqual(len(knowledge_lines), 1, "knowledge line not rendered once")
        self.assertLessEqual(
            len(knowledge_lines[0]),
            self.advisor.ENRICHMENT_KNOWLEDGE_ENTRY_CHARS,
            "knowledge entry line exceeds the per-entry char cap")
        self.assertIn("…", knowledge_lines[0])


class _FakeSocks5Server:
    """Scripted single-connection SOCKS5 relay on 127.0.0.1 (ephemeral port).

    Records the greeting and CONNECT request it receives; reply behavior is
    scripted per instance. Hermetic: loopback only, always shut down via
    stop().
    """

    def __init__(self, connect_reply=None, close_after_greeting=False,
                 echo_after_connect=False, raw_connect_reply=None):
        # raw_connect_reply is an alias for connect_reply: bytes sent
        # verbatim after the greeting reply. Used to script ATYP=0x03/0x04
        # bound replies without special-casing each address type.
        self.connect_reply = (raw_connect_reply if raw_connect_reply is not None
                              else connect_reply)
        self.close_after_greeting = close_after_greeting
        self.echo_after_connect = echo_after_connect
        self.connected = False
        self.greeting = None
        self.connect = None  # (ver, cmd, atyp, host, port)
        self._listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._listener.bind(("127.0.0.1", 0))
        self._listener.listen(1)
        self.port = self._listener.getsockname()[1]
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    @staticmethod
    def _recv_exact(conn, count):
        chunks = []
        while count > 0:
            chunk = conn.recv(count)
            if not chunk:
                return None
            chunks.append(chunk)
            count -= len(chunk)
        return b"".join(chunks)

    def _serve(self):
        try:
            conn, _ = self._listener.accept()
            self.connected = True
            try:
                greeting = self._recv_exact(conn, 3)
                if greeting is None:
                    return
                self.greeting = greeting
                if self.close_after_greeting:
                    return
                conn.sendall(b"\x05\x00")
                header = self._recv_exact(conn, 5)
                if header is None:
                    return
                ver, cmd, _rsv, atyp, host_len = struct.unpack("!BBBBB", header)
                host = self._recv_exact(conn, host_len)
                port_bytes = self._recv_exact(conn, 2)
                if host is None or port_bytes is None:
                    return
                self.connect = (ver, cmd, atyp, host, struct.unpack("!H", port_bytes)[0])
                if self.connect_reply is None:
                    reply = (b"\x05\x00\x00\x01" + socket.inet_aton("127.0.0.1")
                             + struct.pack("!H", 0))
                else:
                    reply = self.connect_reply
                conn.sendall(reply)
                if self.echo_after_connect and self._recv_exact(conn, 4) is not None:
                    conn.sendall(b"pong")
            finally:
                conn.close()
        except OSError:
            pass

    def stop(self):
        # A thread blocked in accept() is not woken by closing the listener
        # on Linux; a throwaway connection makes accept() return so the
        # thread exits promptly (it sees an immediate EOF and stops).
        if self._thread.is_alive():
            try:
                wake = socket.create_connection(("127.0.0.1", self.port), timeout=0.5)
                wake.close()
            except OSError:
                pass
        try:
            self._listener.close()
        except OSError:
            pass
        self._thread.join(timeout=2.0)


class AdvisorProxyTestCase(unittest.TestCase):
    """SOCKS5 relay support (SLF_ADVISOR_PROXY) in advisor.py.

    Hermetic: a scripted stdlib socket server on 127.0.0.1 stands in for the
    relay; no external network is touched.
    """

    @classmethod
    def setUpClass(cls):
        advisor_path = pathlib.Path(__file__).with_name("advisor.py")
        spec = importlib.util.spec_from_file_location("slf_advisor_proxy_test", advisor_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        cls.advisor = module

    def _assert_invalid_proxy(self, raw):
        with mock.patch.dict(os.environ, {self.advisor.PROXY_ENV_VAR: raw}):
            with self.assertRaises(self.advisor.AdvisorError) as ctx:
                self.advisor._proxy_config()
        self.assertEqual(ctx.exception.kind, "misconfigured")
        self.assertIn("invalid SLF_ADVISOR_PROXY", str(ctx.exception))

    def test_proxy_config_unset_is_none(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(self.advisor._proxy_config())

    def test_proxy_config_empty_string_is_none(self):
        with mock.patch.dict(os.environ, {self.advisor.PROXY_ENV_VAR: "   "}):
            self.assertIsNone(self.advisor._proxy_config())

    def test_proxy_config_parses_socks5h(self):
        with mock.patch.dict(os.environ, {self.advisor.PROXY_ENV_VAR: "socks5h://127.0.0.1:1080"}):
            self.assertEqual(self.advisor._proxy_config(), ("127.0.0.1", 1080))

    def test_proxy_config_parses_socks5(self):
        with mock.patch.dict(os.environ, {self.advisor.PROXY_ENV_VAR: "socks5://proxy.example:9999"}):
            self.assertEqual(self.advisor._proxy_config(), ("proxy.example", 9999))

    def test_proxy_config_rejects_http_scheme(self):
        self._assert_invalid_proxy("http://127.0.0.1:1080")

    def test_proxy_config_rejects_missing_port(self):
        self._assert_invalid_proxy("socks5h://127.0.0.1")

    def test_proxy_config_rejects_garbage(self):
        self._assert_invalid_proxy("not a url")

    def test_socks5_connect_success_sends_remote_dns_connect(self):
        server = _FakeSocks5Server(echo_after_connect=True)
        sock = None
        try:
            sock = self.advisor._socks5_connect(
                "127.0.0.1", server.port, "openrouter.ai", 443, timeout=2.0)
            # Greeting: version 5, one method, "no authentication".
            self.assertEqual(server.greeting, b"\x05\x01\x00")
            # CONNECT: ATYP=0x03 carries the target hostname (remote DNS).
            ver, cmd, atyp, host, port = server.connect
            self.assertEqual((ver, cmd, atyp), (0x05, 0x01, 0x03))
            self.assertEqual(host, b"openrouter.ai")
            self.assertEqual(port, 443)
            # The returned socket is a live tunnel: data flows through it.
            sock.sendall(b"ping")
            self.assertEqual(sock.recv(4), b"pong")
        finally:
            if sock is not None:
                sock.close()
            server.stop()

    def test_socks5_connect_consumes_atyp03_bound_reply(self):
        # ATYP=0x03 bound reply: 05 00 00 03 + len + name + port. The client
        # must consume exactly 1 + len + 2 bytes after the 4-byte header; a
        # mis-consumption desyncs the tunnel and the echo below fails.
        reply = (b"\x05\x00\x00\x03" + bytes([len(b"relay")]) + b"relay"
                 + struct.pack("!H", 0))
        server = _FakeSocks5Server(raw_connect_reply=reply, echo_after_connect=True)
        sock = None
        try:
            sock = self.advisor._socks5_connect(
                "127.0.0.1", server.port, "openrouter.ai", 443, timeout=2.0)
            sock.sendall(b"ping")
            self.assertEqual(sock.recv(4), b"pong")
        finally:
            if sock is not None:
                sock.close()
            server.stop()

    def test_socks5_connect_consumes_atyp04_bound_reply(self):
        # ATYP=0x04 bound reply: 05 00 00 04 + 16-byte IPv6 + port. Same
        # desync check via the echo.
        reply = b"\x05\x00\x00\x04" + b"\x00" * 16 + struct.pack("!H", 0)
        server = _FakeSocks5Server(raw_connect_reply=reply, echo_after_connect=True)
        sock = None
        try:
            sock = self.advisor._socks5_connect(
                "127.0.0.1", server.port, "openrouter.ai", 443, timeout=2.0)
            sock.sendall(b"ping")
            self.assertEqual(sock.recv(4), b"pong")
        finally:
            if sock is not None:
                sock.close()
            server.stop()

    def test_socks5_connect_nonzero_reply_code_raises(self):
        server = _FakeSocks5Server(
            connect_reply=b"\x05\x01\x00\x01" + socket.inet_aton("127.0.0.1") + struct.pack("!H", 0))
        try:
            with self.assertRaises(OSError) as ctx:
                self.advisor._socks5_connect(
                    "127.0.0.1", server.port, "openrouter.ai", 443, timeout=2.0)
            self.assertIn("0x01", str(ctx.exception))
        finally:
            server.stop()

    def test_socks5_connect_mid_handshake_close_raises(self):
        # Server drops the connection before replying: _recv_exact must turn
        # the short read into an OSError, not hang or return a dead socket.
        server = _FakeSocks5Server(close_after_greeting=True)
        try:
            with self.assertRaises(OSError) as ctx:
                self.advisor._socks5_connect(
                    "127.0.0.1", server.port, "openrouter.ai", 443, timeout=2.0)
            self.assertIn("mid-handshake", str(ctx.exception))
        finally:
            server.stop()

    def test_call_openrouter_routes_through_socks_proxy(self):
        # The relay accepts the handshake, then drops the data connection:
        # the TLS handshake over the tunnel fails and call_openrouter must
        # surface it as a network error. The relay's connected flag proves
        # the proxy path was actually taken — the direct path never touches
        # the relay.
        server = _FakeSocks5Server()
        try:
            with mock.patch.dict(os.environ, {
                    self.advisor.PROXY_ENV_VAR: f"socks5h://127.0.0.1:{server.port}"}):
                with self.assertRaises(self.advisor.AdvisorError) as ctx:
                    self.advisor.call_openrouter(
                        [{"role": "user", "content": "hi"}], "test-key",
                        self.advisor.DEFAULT_MODEL, timeout_s=2.0)
            self.assertEqual(ctx.exception.kind, "network")
            self.assertTrue(
                server.connected, "SOCKS relay never saw a connection — proxy path not taken")
        finally:
            server.stop()


class AdvisorProxyE2ETestCase(unittest.TestCase):
    """E2E: a malformed SLF_ADVISOR_PROXY must surface as HTTP 502 with
    kind "misconfigured" through the Flask layer, without paying the retry
    sleep (review finding, SLF #434).

    Loads the server module the same way AdvisorTestCase does (importlib,
    temp dirs, env). No network: the malformed proxy raises in
    _proxy_config() before any egress.
    """

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["SLF_API_TOKEN"] = "test-token"
        os.environ["SLF_DATA_DIR"] = cls.temp_dir.name
        os.environ["SLF_FORUM_FAQ_DIR"] = os.path.join(cls.temp_dir.name, "forum")
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        cls.server = _load_server()
        cls.client = cls.server.app.test_client()
        cls.auth = {"Authorization": "Bearer test-token"}

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in pathlib.Path(self.temp_dir.name).glob("*.json"):
            path.unlink()

    def minimal_body(self):
        return {
            "gameId": "g-123",
            "ruleDecision": {"preset": "P1"},
            "presetCatalog": [{"id": "P1", "label": "P1"}],
        }

    def read_log(self):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def test_malformed_proxy_is_502_misconfigured_without_retry_sleep(self):
        with mock.patch.dict(os.environ, {
                self.server.advisor.PROXY_ENV_VAR: "http://127.0.0.1:1080"}), \
                mock.patch.object(self.server.advisor.time, "sleep") as sleep_mock:
            response = self.client.post("/api/advisor", json=self.minimal_body(),
                                        headers=self.auth)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["errorKind"], "misconfigured")
        # A config error must not pay the retry sleep.
        sleep_mock.assert_not_called()
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["outcome"], "error")
        self.assertEqual(log[0]["errorKind"], "misconfigured")


class AdvisorApplyTestCase(unittest.TestCase):
    """Ф2a (#441): POST /api/advisor_apply — apply-event reporting.

    Token-gated like the advisor route. Updates the advisor_log_v1 record
    found by id with {"apply": {"ok": bool, "at": iso8601}}. Honest codes:
    unknown id -> 404, malformed body -> 400, persistence failure -> 500.
    """

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

    def read_log(self):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def seed_log(self, records):
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")

    def test_apply_updates_record(self):
        self.seed_log([{"id": "abc123", "outcome": "ok"}])
        response = self.client.post(
            "/api/advisor_apply", json={"adviceId": "abc123", "ok": True}, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        log = self.read_log()
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["apply"]["ok"], True)
        self.assertIn("at", log[0]["apply"])
        # apply.at must be a valid ISO-8601 timestamp.
        datetime.datetime.fromisoformat(log[0]["apply"]["at"])

    def test_apply_unknown_id_is_404(self):
        self.seed_log([{"id": "abc123", "outcome": "ok"}])
        response = self.client.post(
            "/api/advisor_apply", json={"adviceId": "nope", "ok": True}, headers=self.auth)
        self.assertEqual(response.status_code, 404)

    def test_apply_malformed_bodies_are_400(self):
        self.seed_log([{"id": "abc123", "outcome": "ok"}])
        # missing ok
        r = self.client.post("/api/advisor_apply", json={"adviceId": "abc123"}, headers=self.auth)
        self.assertEqual(r.status_code, 400)
        # missing adviceId
        r = self.client.post("/api/advisor_apply", json={"ok": True}, headers=self.auth)
        self.assertEqual(r.status_code, 400)
        # adviceId not a string
        r = self.client.post("/api/advisor_apply", json={"adviceId": 123, "ok": True}, headers=self.auth)
        self.assertEqual(r.status_code, 400)
        # ok not a bool (ok:1 must be rejected)
        r = self.client.post("/api/advisor_apply", json={"adviceId": "abc123", "ok": 1}, headers=self.auth)
        self.assertEqual(r.status_code, 400)
        # non-dict body
        r = self.client.post("/api/advisor_apply", json=["abc123"], headers=self.auth)
        self.assertEqual(r.status_code, 400)

    def test_apply_unauthorized_is_401(self):
        self.seed_log([{"id": "abc123", "outcome": "ok"}])
        response = self.client.post("/api/advisor_apply", json={"adviceId": "abc123", "ok": True})
        self.assertEqual(response.status_code, 401)

    def test_apply_corrupt_log_is_500(self):
        # Pre-seed a CORRUPT advisor_log_v1.json (invalid JSON). The update
        # must refuse to blind-write and the endpoint must return 500.
        path = pathlib.Path(self.temp_dir.name) / "advisor_log_v1.json"
        path.write_text("{invalid json\n", encoding="utf-8")
        response = self.client.post(
            "/api/advisor_apply", json={"adviceId": "abc123", "ok": True}, headers=self.auth)
        self.assertEqual(response.status_code, 500)
        # The corrupt file must be preserved (no blind write).
        self.assertEqual(path.read_text(encoding="utf-8"), "{invalid json\n")


if __name__ == "__main__":
    unittest.main()
