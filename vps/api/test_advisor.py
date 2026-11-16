"""Tests for the LLM second-opinion advisor endpoint (specs/434-llm-tactical-advisor).

Follows the test_server.py pattern: importlib load with env overrides,
Flask test client, advisor.call_openrouter mocked (no network).
AdvisorProxyTestCase covers the SLF_ADVISOR_PROXY SOCKS5 relay path against
a scripted loopback socket server — still no external network.
"""

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


if __name__ == "__main__":
    unittest.main()
