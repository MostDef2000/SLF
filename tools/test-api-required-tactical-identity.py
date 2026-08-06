#!/usr/bin/env python3

import importlib.util
import json
import os
import tempfile
from pathlib import Path

ROOT = Path.cwd()
TOKEN = "required-identity-test-token"
TACTICAL_KEYS = {
    "match_snapshots_v2": "snapshotKey",
    "match_results_v2": "resultKey",
    "preset_events_v2": "eventKey",
    "preset_effects_v2": "effectKey",
}


def load_server(data_dir: str):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    os.environ["SLF_FORUM_FAQ_DIR"] = str(Path(data_dir) / "forum_faq")
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location("slf_required_identity_server", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load VPS API server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.app.config.update(TESTING=True)
    return module


def headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }


def post_json(client, path, payload):
    return client.post(path, headers=headers(), data=json.dumps(payload))


def valid_row(collection, key_field, suffix):
    return {
        key_field: f"{collection}|{suffix}",
        "recordType": collection,
        "gameId": "identity-test-game",
        "ts": 1770000000000,
    }


def assert_rejected(response, collection, key_field, invalid_indexes, received):
    assert response.status_code == 422, response.get_data(as_text=True)
    assert response.get_json() == {
        "error": "Tactical records require deterministic identity",
        "kind": "missing_unique_key",
        "collection": collection,
        "requiredKey": key_field,
        "invalidIndexes": invalid_indexes,
        "received": received,
    }


def main():
    with tempfile.TemporaryDirectory(prefix="slf-api-required-identity-") as data_dir:
        server = load_server(data_dir)
        client = server.app.test_client()

        for collection, key_field in TACTICAL_KEYS.items():
            collection_path = Path(data_dir) / f"{collection}.json"
            seed = valid_row(collection, key_field, "seed")
            seeded = post_json(client, f"/api/{collection}?mode=append", [seed])
            assert seeded.status_code == 200
            before = collection_path.read_bytes()

            cases = [
                ([{"gameId": "missing"}], [0]),
                ([{key_field: "   ", "gameId": "empty"}], [0]),
                (["not-an-object"], [0]),
                ([valid_row(collection, key_field, "valid-mixed"), {}, None], [1, 2]),
            ]
            for payload, invalid_indexes in cases:
                response = post_json(client, f"/api/{collection}?mode=append", payload)
                assert_rejected(response, collection, key_field, invalid_indexes, len(payload))
                assert collection_path.read_bytes() == before
                assert list(Path(data_dir).glob(f".{collection}.json.tmp-*")) == []

            single_non_list = post_json(client, f"/api/{collection}?mode=append", {})
            assert_rejected(single_non_list, collection, key_field, [0], 1)
            assert collection_path.read_bytes() == before

            valid = valid_row(collection, key_field, "accepted")
            accepted = post_json(client, f"/api/{collection}?mode=append", valid)
            assert accepted.status_code == 200
            assert accepted.get_json()["added"] == 1
            duplicate = post_json(client, f"/api/{collection}?mode=append", valid)
            assert duplicate.status_code == 200
            assert duplicate.get_json()["added"] == 0
            assert duplicate.get_json()["skippedDuplicates"] == 1
            assert duplicate.get_json()["missingUniqueKey"] == 0

            stored = json.loads(collection_path.read_text(encoding="utf-8"))
            assert len(stored) == 2
            assert all(isinstance(row.get(key_field), str) and row[key_field].strip() for row in stored)

        generic_path = Path(data_dir) / "generic_events.json"
        generic = post_json(client, "/api/generic_events?mode=append", [{"value": 1}, "legacy-row"])
        assert generic.status_code == 200
        assert generic.get_json()["added"] == 2
        assert json.loads(generic_path.read_text(encoding="utf-8")) == [{"value": 1}, "legacy-row"]

        analysis = client.get("/api/analysis", headers=headers())
        assert analysis.status_code == 200
        for collection in TACTICAL_KEYS:
            health = analysis.get_json()["collections"][collection]
            assert health["missingUniqueKeys"] == 0
            assert health["duplicateKeys"] == 0

    print("[api-required-tactical-identity] passed: four collections, atomic rejection, valid dedupe, generic compatibility")


if __name__ == "__main__":
    main()
