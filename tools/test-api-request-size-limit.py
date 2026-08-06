#!/usr/bin/env python3

import importlib.util
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = "request-size-test-token"
DEFAULT_LIMIT = 8 * 1024 * 1024
TEST_LIMIT = 1024
COLLECTION = "match_snapshots_v2"


def load_server(data_dir: str, module_suffix: str, max_content_length=None):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    os.environ["SLF_FORUM_FAQ_DIR"] = str(Path(data_dir) / "forum_faq")
    if max_content_length is None:
        os.environ.pop("SLF_API_MAX_CONTENT_LENGTH", None)
    else:
        os.environ["SLF_API_MAX_CONTENT_LENGTH"] = str(max_content_length)
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location(f"slf_request_size_server_{module_suffix}", module_path)
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


def snapshot(index: int, padding=""):
    result = {
        "recordType": "match_snapshot",
        "schemaVersion": 2,
        "parserVersion": "match_snapshot_append_v1",
        "snapshotKey": f"match_snapshot|request-size-game|live|{index}|bucket|0:0|1-2",
        "gameId": "request-size-game",
        "status": "live",
        "minute": index,
        "ts": 1770000000000 + index,
    }
    if padding:
        result["padding"] = padding
    return result


def post_raw(client, payload, mode="append", token=TOKEN):
    return client.post(
        f"/api/{COLLECTION}?mode={mode}",
        headers=headers(token),
        data=payload,
    )


def main():
    with tempfile.TemporaryDirectory(prefix="slf-api-request-limit-default-") as data_dir:
        default_server = load_server(data_dir, "default")
        assert default_server.DEFAULT_MAX_CONTENT_LENGTH == DEFAULT_LIMIT
        assert default_server.MAX_CONTENT_LENGTH == DEFAULT_LIMIT
        assert default_server.app.config["MAX_CONTENT_LENGTH"] == DEFAULT_LIMIT

    for index, invalid_value in enumerate(("0", "-1", "not-a-number")):
        with tempfile.TemporaryDirectory(prefix="slf-api-request-limit-invalid-") as data_dir:
            try:
                load_server(data_dir, f"invalid_{index}", invalid_value)
            except RuntimeError as error:
                assert "SLF_API_MAX_CONTENT_LENGTH must be a positive integer" in str(error)
            else:
                raise AssertionError(f"invalid size limit was accepted: {invalid_value}")

    with tempfile.TemporaryDirectory(prefix="slf-api-request-limit-") as data_dir:
        server = load_server(data_dir, "bounded", TEST_LIMIT)
        client = server.app.test_client()
        assert server.MAX_CONTENT_LENGTH == TEST_LIMIT
        assert server.app.config["MAX_CONTENT_LENGTH"] == TEST_LIMIT

        baseline_payload = json.dumps([snapshot(1)]).encode("utf-8")
        assert len(baseline_payload) < TEST_LIMIT
        baseline_response = post_raw(client, baseline_payload)
        assert baseline_response.status_code == 200
        assert baseline_response.get_json()["added"] == 1

        collection_path = Path(server.get_file_path(COLLECTION))
        baseline_bytes = collection_path.read_bytes()

        oversized_payload = json.dumps([snapshot(2, "x" * (TEST_LIMIT * 2))]).encode("utf-8")
        assert len(oversized_payload) > TEST_LIMIT
        expected_error = {
            "error": "Request body too large",
            "kind": "request_too_large",
            "maxBytes": TEST_LIMIT,
        }

        oversized_append = post_raw(client, oversized_payload, mode="append")
        assert oversized_append.status_code == 413
        assert oversized_append.get_json() == expected_error
        assert collection_path.read_bytes() == baseline_bytes

        oversized_replace = post_raw(client, oversized_payload, mode="replace")
        assert oversized_replace.status_code == 413
        assert oversized_replace.get_json() == expected_error
        assert collection_path.read_bytes() == baseline_bytes

        unauthorized = post_raw(client, oversized_payload, mode="append", token="wrong-token")
        assert unauthorized.status_code == 401
        assert unauthorized.get_json() == {"error": "Unauthorized"}
        assert collection_path.read_bytes() == baseline_bytes

        follow_up_payload = json.dumps([snapshot(3)]).encode("utf-8")
        follow_up = post_raw(client, follow_up_payload)
        assert follow_up.status_code == 200
        assert follow_up.get_json()["added"] == 1

        stored = client.get(f"/api/{COLLECTION}", headers=headers())
        assert stored.status_code == 200
        rows = stored.get_json()
        assert [row["minute"] for row in rows] == [1, 3]
        assert not list(Path(data_dir).glob(".*.tmp-*"))

    print("[api-request-size-limit] passed: default, invalid config, 413 JSON, no mutation, auth order")


if __name__ == "__main__":
    main()
