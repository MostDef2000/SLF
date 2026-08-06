#!/usr/bin/env python3

import importlib.util
import json
import os
import tempfile
from pathlib import Path

ROOT = Path.cwd()


def load_server(data_dir: str):
    os.environ["SLF_API_TOKEN"] = "contract-test-token"
    os.environ["SLF_DATA_DIR"] = data_dir
    os.environ.pop("SLF_API_CORS_ORIGINS", None)
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location("slf_contract_test_server", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load VPS API server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.app.config.update(TESTING=True)
    return module


def auth_headers(origin=None):
    result = {
        "Authorization": "Bearer contract-test-token",
        "Content-Type": "application/json",
    }
    if origin is not None:
        result["Origin"] = origin
    return result


def post_json(client, path: str, payload):
    return client.post(path, headers=auth_headers(), data=json.dumps(payload))


def main():
    with tempfile.TemporaryDirectory(prefix="slf-contract-api-") as data_dir:
        server = load_server(data_dir)
        client = server.app.test_client()

        allowed_origin = "https://slf.fm"
        allowed_cors = client.get("/api/analysis", headers=auth_headers(allowed_origin))
        assert allowed_cors.status_code == 200
        assert allowed_cors.headers.get("Access-Control-Allow-Origin") == allowed_origin
        assert allowed_cors.headers.get("Access-Control-Allow-Origin") != "*"

        disallowed_cors = client.get(
            "/api/analysis",
            headers=auth_headers("https://attacker.example"),
        )
        assert disallowed_cors.status_code == 200
        assert disallowed_cors.headers.get("Access-Control-Allow-Origin") is None

        no_origin = client.get("/api/analysis", headers=auth_headers())
        assert no_origin.status_code == 200

        unauthorized = client.post(
            "/api/match_snapshots_v2?mode=append",
            data=json.dumps([]),
            content_type="application/json",
        )
        assert unauthorized.status_code == 401
        assert unauthorized.get_json() == {"error": "Unauthorized"}

        invalid_collection = post_json(client, "/api/../escape?mode=append", [])
        assert invalid_collection.status_code in {400, 404}

        valid_snapshot = {
            "recordType": "match_snapshot",
            "schemaVersion": 2,
            "parserVersion": "match_snapshot_append_v1",
            "snapshotKey": "match_snapshot|game-1|live|10|01-15|0:0|1-2",
            "gameId": "game-1",
            "status": "live",
            "ts": 1770000000000,
        }

        first = post_json(
            client,
            "/api/match_snapshots_v2?mode=append",
            [valid_snapshot],
        )
        assert first.status_code == 200
        assert first.get_json() == {
            "status": "appended",
            "collection": "match_snapshots_v2",
            "received": 1,
            "added": 1,
            "skippedDuplicates": 0,
            "missingUniqueKey": 0,
            "count": 1,
        }

        duplicate = post_json(
            client,
            "/api/match_snapshots_v2?mode=append",
            [valid_snapshot],
        )
        assert duplicate.status_code == 200
        duplicate_json = duplicate.get_json()
        assert duplicate_json["received"] == 1
        assert duplicate_json["added"] == 0
        assert duplicate_json["skippedDuplicates"] == 1
        assert duplicate_json["missingUniqueKey"] == 0
        assert duplicate_json["count"] == 1

        missing_key_snapshot = {
            "recordType": "match_snapshot",
            "schemaVersion": 2,
            "parserVersion": "match_snapshot_append_v1",
            "gameId": "game-2",
            "status": "live",
            "ts": 1770000001000,
        }
        rejected = post_json(
            client,
            "/api/match_snapshots_v2?mode=append",
            [missing_key_snapshot],
        )
        assert rejected.status_code == 422
        assert rejected.get_json() == {
            "error": "Tactical records require deterministic identity",
            "kind": "missing_unique_key",
            "collection": "match_snapshots_v2",
            "requiredKey": "snapshotKey",
            "invalidIndexes": [0],
            "received": 1,
        }

        collection_path = Path(data_dir) / "match_snapshots_v2.json"
        stored = json.loads(collection_path.read_text(encoding="utf-8"))
        assert stored == [valid_snapshot]

        analysis = client.get("/api/analysis", headers=auth_headers())
        assert analysis.status_code == 200
        analysis_json = analysis.get_json()
        assert analysis_json["status"] == "ok"
        assert analysis_json["games"] == 1
        assert isinstance(analysis_json["serverTime"], int)
        health = analysis_json["collections"]["match_snapshots_v2"]
        assert health["count"] == 1
        assert health["duplicateKeys"] == 0
        assert health["missingUniqueKeys"] == 0

    print("[api-contract-compatibility] passed: CORS, auth, dedupe, required identity, analysis")


if __name__ == "__main__":
    main()
