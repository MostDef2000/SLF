#!/usr/bin/env python3

import importlib.util
import json
import os
import random
import re
import string
import tempfile
from pathlib import Path

ROOT = Path.cwd()
BUDGET = json.loads((ROOT / "data" / "quality" / "reliability-budget-v1.json").read_text(encoding="utf-8"))
SEED = int(BUDGET["fuzz"]["seed"])
CASES = int(BUDGET["fuzz"]["pythonCases"])
TOKEN = "fuzz-test-token"


def load_server(data_dir: str):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location("slf_fuzz_test_server", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load VPS API server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.app.config.update(TESTING=True)
    return module


def headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def random_text(rng: random.Random, max_length: int = 60) -> str:
    alphabet = string.ascii_letters + string.digits + "_-./\\ ?&=%\x00Жé中"
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(0, max_length)))


def random_json_value(rng: random.Random, depth: int = 0):
    if depth >= 3:
        leaf_kind = rng.randrange(5)
        if leaf_kind == 0:
            return None
        if leaf_kind == 1:
            return rng.choice([True, False])
        if leaf_kind == 2:
            return rng.randint(-10**6, 10**6)
        if leaf_kind == 3:
            return rng.random() * 1000 - 500
        return random_text(rng, 30)

    kind = rng.randrange(7)
    if kind < 4:
        return random_json_value(rng, 3)
    if kind == 4:
        return [random_json_value(rng, depth + 1) for _ in range(rng.randint(0, 5))]
    return {
        random_text(rng, 12): random_json_value(rng, depth + 1)
        for _ in range(rng.randint(0, 5))
    }


def assert_collection_name_properties(server, data_dir: str, rng: random.Random):
    expected_pattern = re.compile(r"^[a-zA-Z0-9_-]+$")
    root = Path(data_dir).resolve()

    edge_cases = [
        "",
        ".",
        "..",
        "../escape",
        "..\\escape",
        "/absolute",
        "name.json",
        "name/child",
        "name\\child",
        "white space",
        "unicode-Ж",
        "safe_name-123",
    ]
    samples = edge_cases + [random_text(rng) for _ in range(CASES)]

    for value in samples:
        expected = bool(expected_pattern.fullmatch(value or ""))
        actual = server.is_valid_collection(value)
        assert actual is expected, (value, expected, actual)
        if actual:
            resolved = Path(server.get_file_path(value)).resolve()
            assert resolved.parent == root, (value, resolved, root)
            assert resolved.name == f"{value}.json"


def assert_deduplication_properties(server, rng: random.Random):
    collection = "match_snapshots_v2"
    for _ in range(CASES):
        existing_count = rng.randint(0, 20)
        existing_keys = [f"snapshot-{rng.randint(0, 60)}" for _ in range(existing_count)]
        existing = [{"snapshotKey": key} for key in existing_keys]

        incoming_count = rng.randint(0, 30)
        incoming = []
        for index in range(incoming_count):
            kind = rng.randrange(5)
            if kind == 0:
                incoming.append({"gameId": f"missing-{index}"})
            elif kind == 1:
                incoming.append(random_text(rng, 20))
            else:
                incoming.append({"snapshotKey": f"snapshot-{rng.randint(0, 80)}", "index": index})

        accepted, skipped, missing = server.filter_append_duplicates(collection, existing, incoming)

        seen = {f"snapshotKey:{key}" for key in existing_keys}
        expected_accepted = []
        expected_skipped = 0
        expected_missing = 0
        for item in incoming:
            keys = [str(key) for key in server.unique_keys_for_item(collection, item)]
            if not keys:
                expected_missing += 1
            if keys and any(key in seen for key in keys):
                expected_skipped += 1
                continue
            expected_accepted.append(item)
            seen.update(keys)

        assert accepted == expected_accepted
        assert skipped == expected_skipped
        assert missing == expected_missing

        accepted_keys = [
            key
            for item in accepted
            for key in server.unique_keys_for_item(collection, item)
        ]
        assert len(accepted_keys) == len(set(accepted_keys))


def assert_atomic_write_recovery(server, data_dir: str):
    collection = "atomic_recovery"
    original = [{"value": "original"}]
    replacement = [{"value": "replacement"}]
    server.save_collection(collection, original)
    path = Path(data_dir) / f"{collection}.json"
    before = path.read_bytes()

    original_replace = server.os.replace

    def fail_replace(_source, _destination):
        raise OSError("simulated atomic replace failure")

    server.os.replace = fail_replace
    try:
        try:
            server.save_collection(collection, replacement)
        except OSError as error:
            assert "simulated atomic replace failure" in str(error)
        else:
            raise AssertionError("save_collection unexpectedly succeeded during replace failure")
    finally:
        server.os.replace = original_replace

    assert path.read_bytes() == before
    assert json.loads(path.read_text(encoding="utf-8")) == original
    leftovers = list(Path(data_dir).glob(f".{collection}.json.tmp-*"))
    assert leftovers == [], leftovers


def assert_corruption_properties(server, data_dir: str):
    corpus = [
        b"{",
        b"[1,",
        b"not-json",
        b"\xff\xfe\x00\x00",
        b'{"unterminated":"value}',
    ]
    for index, payload in enumerate(corpus):
        collection = f"corrupt_{index}"
        path = Path(data_dir) / f"{collection}.json"
        path.write_bytes(payload)
        try:
            server.load_collection(collection, default=[])
        except server.CollectionCorruptError:
            pass
        else:
            raise AssertionError(f"corrupt collection was accepted: {collection}")


def assert_http_fuzz(server, rng: random.Random):
    client = server.app.test_client()
    malformed_corpus = [
        "",
        "{",
        "[1,",
        "null trailing",
        "\x00",
        "{" + "x" * 1000,
    ]
    for body in malformed_corpus:
        response = client.post(
            "/api/fuzz_collection?mode=append",
            headers=headers(),
            data=body,
        )
        assert response.status_code == 400, (body[:30], response.status_code)
        assert TOKEN not in response.get_data(as_text=True)

    for index in range(min(CASES, 250)):
        payload = random_json_value(rng)
        response = client.post(
            "/api/fuzz_collection?mode=append",
            headers=headers(),
            data=json.dumps(payload, ensure_ascii=False),
        )
        assert response.status_code in {200, 400}, (index, type(payload).__name__, response.status_code)
        assert response.status_code < 500
        assert TOKEN not in response.get_data(as_text=True)

    stored = client.get("/api/fuzz_collection", headers=headers())
    assert stored.status_code == 200
    json.loads(stored.get_data(as_text=True))


def main():
    rng = random.Random(SEED)
    with tempfile.TemporaryDirectory(prefix="slf-fuzz-recovery-") as data_dir:
        server = load_server(data_dir)
        assert_collection_name_properties(server, data_dir, rng)
        assert_deduplication_properties(server, rng)
        assert_atomic_write_recovery(server, data_dir)
        assert_corruption_properties(server, data_dir)
        assert_http_fuzz(server, rng)

    print(
        f"[api-fuzz-recovery] passed: seed={SEED} cases={CASES} "
        "collectionNames,dedupe,atomicRecovery,corruption,httpFuzz"
    )


if __name__ == "__main__":
    main()
