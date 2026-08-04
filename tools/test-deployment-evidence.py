#!/usr/bin/env python3

import importlib.util
import json
import os
import stat
import tempfile
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path.cwd()
TOKEN = "deployment-evidence-test-token"
EXPECTED_COMMIT = "0123456789abcdef0123456789abcdef01234567"
CANONICAL = (
    "match_results_v2",
    "preset_events_v2",
    "preset_effects_v2",
    "match_snapshots_v2",
)


def load_verifier():
    path = ROOT / "vps" / "ops" / "verify_api_deployment.py"
    spec = importlib.util.spec_from_file_location("slf_deployment_verifier", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load deployment verifier")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ApiState:
    def __init__(self):
        self.canaries = {}


class FixtureHandler(BaseHTTPRequestHandler):
    state = ApiState()

    def authorized(self):
        return self.headers.get("Authorization") == f"Bearer {TOKEN}"

    def send_json(self, status, payload):
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return

        if self.path == "/api/analysis":
            self.send_json(200, {
                "status": "ok",
                "serverTime": 1770000000,
                "games": 4,
                "collections": {
                    name: {
                        "exists": True,
                        "valid": True,
                        "count": index + 1,
                        "duplicateKeys": 0,
                        "missingUniqueKeys": 0,
                        "oldestTimestamp": 1760000000,
                        "newestTimestamp": 1770000000,
                    }
                    for index, name in enumerate(CANONICAL)
                },
            })
            return

        if self.path.startswith("/api/"):
            collection = self.path.removeprefix("/api/")
            if collection in CANONICAL:
                self.send_json(200, [{"collection": collection}])
                return
            if collection in self.state.canaries:
                self.send_json(200, self.state.canaries[collection])
                return

        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        path, _, query = self.path.partition("?")
        if not path.startswith("/api/") or query != "mode=replace":
            self.send_json(400, {"error": "Invalid request"})
            return
        collection = path.removeprefix("/api/")
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        self.state.canaries[collection] = payload
        self.send_json(200, {"status": "saved", "collection": collection})

    def log_message(self, _format, *_args):
        return


@contextmanager
def fixture_server():
    FixtureHandler.state = ApiState()
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def expect_verification_error(verifier, callback, expected_fragment):
    try:
        callback()
    except verifier.VerificationError as error:
        assert expected_fragment in str(error), str(error)
    else:
        raise AssertionError(f"expected VerificationError containing {expected_fragment!r}")


def main():
    verifier = load_verifier()

    with tempfile.TemporaryDirectory(prefix="slf-deployment-evidence-") as temp_dir:
        temp = Path(temp_dir)
        marker = temp / "DEPLOYED_GIT_COMMIT"
        marker.write_text(EXPECTED_COMMIT + "\n", encoding="utf-8")

        with fixture_server() as base_url:
            read_only = verifier.verify_api_deployment(
                base_url=base_url,
                token=TOKEN,
                expected_commit=EXPECTED_COMMIT,
                deployed_commit_file=marker,
                timeout=3,
                write_canary=False,
            )
            assert read_only["schema"] == "slf_api_deployment_verification_v1"
            assert read_only["result"] == "passed"
            assert read_only["expectedCommit"] == EXPECTED_COMMIT
            assert read_only["deployedCommit"] == EXPECTED_COMMIT
            assert read_only["checks"]["unauthenticatedAnalysisStatus"] == 401
            assert read_only["checks"]["authenticatedAnalysisStatus"] == 200
            assert read_only["checks"]["serverStatus"] == "ok"
            assert read_only["checks"]["canary"] == {"enabled": False}
            assert set(read_only["checks"]["collectionCounts"]) == set(CANONICAL)
            assert read_only["secretsIncluded"] is False
            assert TOKEN not in json.dumps(read_only)

            with_canary = verifier.verify_api_deployment(
                base_url=base_url,
                token=TOKEN,
                expected_commit=EXPECTED_COMMIT,
                deployed_commit_file=marker,
                timeout=3,
                write_canary=True,
                canary_collection="ops_release_evidence",
            )
            canary = with_canary["checks"]["canary"]
            assert canary["enabled"] is True
            assert canary["collection"] == "ops_release_evidence"
            assert canary["readVerified"] is True
            assert TOKEN not in json.dumps(with_canary)

            evidence_path = temp / "api-verification.json"
            verifier.write_evidence(evidence_path, with_canary)
            mode = stat.S_IMODE(evidence_path.stat().st_mode)
            assert mode == 0o600, oct(mode)
            persisted = json.loads(evidence_path.read_text(encoding="utf-8"))
            assert persisted == with_canary
            assert list(temp.glob(".api-verification.json.*")) == []

            expect_verification_error(
                verifier,
                lambda: verifier.verify_api_deployment(
                    base_url="http://user:password@127.0.0.1",
                    token=TOKEN,
                    expected_commit=EXPECTED_COMMIT,
                    deployed_commit_file=marker,
                ),
                "must not contain credentials",
            )
            expect_verification_error(
                verifier,
                lambda: verifier.verify_api_deployment(
                    base_url=base_url,
                    token="",
                    expected_commit=EXPECTED_COMMIT,
                    deployed_commit_file=marker,
                ),
                "SLF_API_TOKEN is required",
            )
            expect_verification_error(
                verifier,
                lambda: verifier.verify_api_deployment(
                    base_url=base_url,
                    token=TOKEN,
                    expected_commit=EXPECTED_COMMIT,
                    deployed_commit_file=marker,
                    write_canary=True,
                    canary_collection="match_results_v2",
                ),
                "canary collection must start with ops_",
            )

            marker.write_text("f" * 40 + "\n", encoding="utf-8")
            expect_verification_error(
                verifier,
                lambda: verifier.verify_api_deployment(
                    base_url=base_url,
                    token=TOKEN,
                    expected_commit=EXPECTED_COMMIT,
                    deployed_commit_file=marker,
                ),
                "deployed commit mismatch",
            )

    print("[deployment-evidence] passed: marker, auth, collections, canary, mode0600, redaction boundaries")


if __name__ == "__main__":
    main()
