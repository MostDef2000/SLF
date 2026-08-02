from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from vps.ops.verify_api_deployment import (
    CANONICAL_COLLECTIONS,
    VerificationError,
    verify_api_deployment,
    write_evidence,
)


class VerificationHandler(BaseHTTPRequestHandler):
    token = "test-token"
    collections = {
        "match_results_v2": [{"gameId": "g1", "resultKey": "r1"}],
        "preset_events_v2": [{"gameId": "g1", "eventKey": "e1"}],
        "preset_effects_v2": [{"gameId": "g1", "effectKey": "f1"}],
        "match_snapshots_v2": [{"gameId": "g1", "snapshotKey": "s1"}],
    }

    def log_message(self, _format, *_args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        return self.headers.get("Authorization") == f"Bearer {self.token}"

    def do_GET(self):
        path = urlsplit(self.path).path
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        if path == "/api/analysis":
            health = {
                name: {
                    "exists": True,
                    "valid": True,
                    "count": len(rows),
                    "duplicateKeys": 0,
                    "missingUniqueKeys": 0,
                    "oldestTimestamp": None,
                    "newestTimestamp": None,
                }
                for name, rows in self.collections.items()
            }
            self.send_json(
                200,
                {
                    "status": "ok",
                    "games": 1,
                    "collections": health,
                    "serverTime": 1785680000,
                },
            )
            return
        if path.startswith("/api/"):
            collection = path.removeprefix("/api/")
            if collection in self.collections:
                self.send_json(200, self.collections[collection])
                return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        query = parse_qs(urlsplit(self.path).query)
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        if not path.startswith("/api/") or query.get("mode") != ["replace"]:
            self.send_json(400, {"error": "Invalid request"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        collection = path.removeprefix("/api/")
        self.collections[collection] = payload
        self.send_json(200, {"status": "saved", "collection": collection, "count": 1})


class ApiDeploymentVerificationTest(unittest.TestCase):
    expected_commit = "a" * 40

    def setUp(self):
        VerificationHandler.collections = {
            "match_results_v2": [{"gameId": "g1", "resultKey": "r1"}],
            "preset_events_v2": [{"gameId": "g1", "eventKey": "e1"}],
            "preset_effects_v2": [{"gameId": "g1", "effectKey": "f1"}],
            "match_snapshots_v2": [{"gameId": "g1", "snapshotKey": "s1"}],
        }
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), VerificationHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        self.temp_dir = tempfile.TemporaryDirectory()
        self.marker = Path(self.temp_dir.name) / "DEPLOYED_GIT_COMMIT"
        self.marker.write_text(f"{self.expected_commit}\n", encoding="utf-8")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temp_dir.cleanup()

    def test_read_and_write_verification(self):
        evidence = verify_api_deployment(
            base_url=self.base_url,
            token=VerificationHandler.token,
            expected_commit=self.expected_commit,
            deployed_commit_file=self.marker,
            timeout=2,
            write_canary=True,
        )
        self.assertEqual(evidence["result"], "passed")
        self.assertEqual(evidence["deployedCommit"], self.expected_commit)
        self.assertEqual(
            set(evidence["checks"]["collectionCounts"]), set(CANONICAL_COLLECTIONS)
        )
        self.assertTrue(evidence["checks"]["canary"]["readVerified"])
        self.assertNotIn(VerificationHandler.token, json.dumps(evidence))

    def test_commit_mismatch_is_rejected(self):
        with self.assertRaisesRegex(VerificationError, "deployed commit mismatch"):
            verify_api_deployment(
                base_url=self.base_url,
                token=VerificationHandler.token,
                expected_commit="b" * 40,
                deployed_commit_file=self.marker,
                timeout=2,
            )

    def test_canary_cannot_target_tactical_collection(self):
        with self.assertRaisesRegex(VerificationError, "must start with ops_"):
            verify_api_deployment(
                base_url=self.base_url,
                token=VerificationHandler.token,
                expected_commit=self.expected_commit,
                deployed_commit_file=self.marker,
                timeout=2,
                write_canary=True,
                canary_collection="preset_events_v2",
            )

    def test_atomic_evidence_file_contains_no_token(self):
        evidence = verify_api_deployment(
            base_url=self.base_url,
            token=VerificationHandler.token,
            expected_commit=self.expected_commit,
            deployed_commit_file=self.marker,
            timeout=2,
        )
        output = Path(self.temp_dir.name) / "evidence.json"
        write_evidence(output, evidence)
        raw = output.read_text(encoding="utf-8")
        self.assertNotIn(VerificationHandler.token, raw)
        self.assertEqual(json.loads(raw)["result"], "passed")
        self.assertEqual(os.stat(output).st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
