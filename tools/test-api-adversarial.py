#!/usr/bin/env python3

import importlib.util
import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path.cwd()
TOKEN = "security-test-token"


def load_server(data_dir: str):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location("slf_security_test_server", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load VPS API server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.app.config.update(TESTING=True)
    return module


def headers(token=TOKEN):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def post_json(client, path: str, payload, token=TOKEN):
    return client.post(path, headers=headers(token), data=json.dumps(payload))


def snapshot(index: int):
    return {
        "recordType": "match_snapshot",
        "schemaVersion": 2,
        "parserVersion": "match_snapshot_append_v1",
        "snapshotKey": f"match_snapshot|security-game|live|{index}|bucket|0:0|1-2",
        "gameId": "security-game",
        "status": "live",
        "minute": index,
        "ts": 1770000000000 + index,
    }


def main():
    with tempfile.TemporaryDirectory(prefix="slf-security-api-") as data_dir:
        server = load_server(data_dir)
        client = server.app.test_client()

        no_auth = client.get("/api/analysis")
        assert no_auth.status_code == 401
        assert no_auth.get_json() == {"error": "Unauthorized"}

        wrong_token_value = "wrong-secret-token-must-not-leak"
        wrong_auth = client.get("/api/analysis", headers=headers(wrong_token_value))
        assert wrong_auth.status_code == 401
        wrong_body = wrong_auth.get_data(as_text=True)
        assert wrong_token_value not in wrong_body
        assert TOKEN not in wrong_body

        malformed = client.post(
            "/api/match_snapshots_v2?mode=append",
            headers=headers(),
            data="{not-json",
        )
        assert malformed.status_code == 400
        assert malformed.get_json() == {"error": "No JSON"}

        unexpected_method = client.put("/api/match_snapshots_v2", headers=headers(), data="{}")
        assert unexpected_method.status_code == 405

        for invalid in (
            "../escape",
            "..\\escape",
            "/absolute",
            "name.json",
            "name?mode=append",
            "name%2fescape",
            "",
        ):
            assert server.is_valid_collection(invalid) is False, invalid

        encoded_traversal = client.get("/api/%2E%2E%2Fescape", headers=headers())
        assert encoded_traversal.status_code in {400, 404}
        assert str(Path(data_dir).resolve()) not in encoded_traversal.get_data(as_text=True)

        corrupt_path = Path(data_dir) / "corrupt.json"
        corrupt_path.write_text("{broken-json", encoding="utf-8")
        corrupt = client.get("/api/corrupt", headers=headers())
        assert corrupt.status_code == 500
        corrupt_json = corrupt.get_json()
        assert corrupt_json["kind"] == "collection_corrupt"
        assert corrupt_json["error"] == "Collection data is corrupt"
        assert str(corrupt_path) not in corrupt.get_data(as_text=True)
        corrupt_path.unlink()

        def append_unique(index: int):
            with server.app.test_client() as thread_client:
                response = post_json(
                    thread_client,
                    "/api/match_snapshots_v2?mode=append",
                    [snapshot(index)],
                )
                return response.status_code, response.get_json()

        with ThreadPoolExecutor(max_workers=8) as executor:
            unique_results = list(executor.map(append_unique, range(1, 25)))

        assert all(status == 200 for status, _ in unique_results)
        assert sum(result["added"] for _, result in unique_results) == 24
        assert sum(result["skippedDuplicates"] for _, result in unique_results) == 0

        shared_record = snapshot(999)

        def append_duplicate(_):
            with server.app.test_client() as thread_client:
                response = post_json(
                    thread_client,
                    "/api/match_snapshots_v2?mode=append",
                    [shared_record],
                )
                return response.status_code, response.get_json()

        with ThreadPoolExecutor(max_workers=8) as executor:
            duplicate_results = list(executor.map(append_duplicate, range(12)))

        assert all(status == 200 for status, _ in duplicate_results)
        assert sum(result["added"] for _, result in duplicate_results) == 1
        assert sum(result["skippedDuplicates"] for _, result in duplicate_results) == 11

        stored = client.get("/api/match_snapshots_v2", headers=headers())
        assert stored.status_code == 200
        stored_rows = stored.get_json()
        assert len(stored_rows) == 25
        assert len({row["snapshotKey"] for row in stored_rows}) == 25

        analysis = client.get("/api/analysis", headers=headers())
        assert analysis.status_code == 200
        analysis_json = analysis.get_json()
        assert analysis_json["status"] == "ok"
        assert analysis_json["games"] == 1
        health = analysis_json["collections"]["match_snapshots_v2"]
        assert health["valid"] is True
        assert health["count"] == 25
        assert health["duplicateKeys"] == 0
        assert health["missingUniqueKeys"] == 0

    print("[api-adversarial] passed: auth, malformed JSON, traversal, corruption, concurrency, dedupe")


if __name__ == "__main__":
    main()
