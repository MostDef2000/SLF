#!/usr/bin/env python3

import importlib.util
import json
import multiprocessing
import os
import queue
import stat
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN = "multiprocess-lock-test-token"
COLLECTION = "match_snapshots_v2"


def load_server(data_dir: str, module_suffix: str):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    os.environ["SLF_FORUM_FAQ_DIR"] = str(Path(data_dir) / "forum_faq")
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location(f"slf_multiprocess_server_{module_suffix}", module_path)
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


def snapshot(index: int):
    return {
        "recordType": "match_snapshot",
        "schemaVersion": 2,
        "parserVersion": "match_snapshot_append_v1",
        "snapshotKey": f"match_snapshot|multiprocess-game|live|{index}|bucket|0:0|1-2",
        "gameId": "multiprocess-game",
        "status": "live",
        "minute": index,
        "ts": 1770000000000 + index,
    }


def append_worker(data_dir, start_event, ready_queue, result_queue, rows, worker_index):
    try:
        server = load_server(data_dir, f"worker_{worker_index}_{os.getpid()}")
        original_filter = server.filter_append_duplicates

        def delayed_filter(collection, existing, incoming):
            result = original_filter(collection, existing, incoming)
            time.sleep(0.2)
            return result

        server.filter_append_duplicates = delayed_filter
        client = server.app.test_client()
        ready_queue.put({"worker": worker_index, "pid": os.getpid()})
        if not start_event.wait(timeout=15):
            raise TimeoutError("start event was not released")
        response = client.post(
            f"/api/{COLLECTION}?mode=append",
            headers=headers(),
            data=json.dumps(rows),
        )
        result_queue.put({
            "worker": worker_index,
            "ok": response.status_code == 200,
            "status": response.status_code,
            "body": response.get_json(),
        })
    except BaseException as error:
        result_queue.put({
            "worker": worker_index,
            "ok": False,
            "error": f"{type(error).__name__}: {error}",
        })
        raise


def run_parallel_appends(context, data_dir, batches):
    start_event = context.Event()
    ready_queue = context.Queue()
    result_queue = context.Queue()
    processes = [
        context.Process(
            target=append_worker,
            args=(data_dir, start_event, ready_queue, result_queue, rows, index),
        )
        for index, rows in enumerate(batches)
    ]
    for process in processes:
        process.start()

    ready = []
    try:
        for _ in processes:
            ready.append(ready_queue.get(timeout=20))
    except queue.Empty as error:
        raise AssertionError(f"workers did not become ready: {ready}") from error

    start_event.set()
    results = []
    try:
        for _ in processes:
            results.append(result_queue.get(timeout=30))
    except queue.Empty as error:
        raise AssertionError(f"workers did not return results: {results}") from error
    finally:
        for process in processes:
            process.join(timeout=10)
            if process.is_alive():
                process.terminate()
                process.join(timeout=5)

    assert all(process.exitcode == 0 for process in processes), [process.exitcode for process in processes]
    assert all(result.get("ok") for result in results), results
    return sorted(results, key=lambda item: item["worker"])


def main():
    context = multiprocessing.get_context("spawn")
    with tempfile.TemporaryDirectory(prefix="slf-api-multiprocess-") as data_dir:
        parent_server = load_server(data_dir, "parent")

        with parent_server.collection_lock(COLLECTION):
            with parent_server.collection_lock(COLLECTION):
                assert parent_server.get_collection_lock_depths()[COLLECTION] == 2
        assert COLLECTION not in parent_server.get_collection_lock_depths()

        unique_batches = [
            [snapshot(worker * 20 + offset) for offset in range(1, 13)]
            for worker in range(4)
        ]
        unique_results = run_parallel_appends(context, data_dir, unique_batches)
        assert sum(item["body"]["added"] for item in unique_results) == 48
        assert sum(item["body"]["skippedDuplicates"] for item in unique_results) == 0

        shared = snapshot(999)
        duplicate_results = run_parallel_appends(context, data_dir, [[shared] for _ in range(6)])
        assert sum(item["body"]["added"] for item in duplicate_results) == 1
        assert sum(item["body"]["skippedDuplicates"] for item in duplicate_results) == 5

        client = parent_server.app.test_client()
        stored_response = client.get(f"/api/{COLLECTION}", headers=headers())
        assert stored_response.status_code == 200
        stored = stored_response.get_json()
        assert len(stored) == 49
        assert len({row["snapshotKey"] for row in stored}) == 49

        analysis_response = client.get("/api/analysis", headers=headers())
        assert analysis_response.status_code == 200
        health = analysis_response.get_json()["collections"][COLLECTION]
        assert health["valid"] is True
        assert health["count"] == 49
        assert health["duplicateKeys"] == 0
        assert health["missingUniqueKeys"] == 0

        lock_path = Path(parent_server.get_collection_lock_path(COLLECTION))
        assert lock_path.is_file()
        assert lock_path.stat().st_size == 0
        assert stat.S_IMODE(lock_path.stat().st_mode) & 0o077 == 0
        assert ".locks" not in parent_server.list_collections()

    print("[api-multiprocess-locking] passed: reentrancy, unique appends, duplicate race, empty lock files")


if __name__ == "__main__":
    main()
