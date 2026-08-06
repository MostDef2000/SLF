from flask import Flask, request, jsonify
from flask_cors import CORS
import fcntl
import hmac
import os
import json
import time
import re
import threading
from contextlib import contextmanager

app = Flask(__name__)
CORS(app)

API_TOKEN = os.environ.get("SLF_API_TOKEN", "").strip()
if not API_TOKEN:
    raise RuntimeError("SLF_API_TOKEN must be set")

DATA_DIR = os.environ.get("SLF_DATA_DIR", "data")
FORUM_FAQ_DIR = os.environ.get("SLF_FORUM_FAQ_DIR", "forum_faq")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FORUM_FAQ_DIR, exist_ok=True)

COLLECTION_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
TACTICAL_UNIQUE_KEYS = {
    "match_snapshots_v2": "snapshotKey",
    "match_results_v2": "resultKey",
    "preset_events_v2": "eventKey",
    "preset_effects_v2": "effectKey"
}
_COLLECTION_LOCK_DIR = os.path.join(DATA_DIR, ".locks")
os.makedirs(_COLLECTION_LOCK_DIR, exist_ok=True)
_COLLECTION_LOCKS = {}
_COLLECTION_LOCKS_GUARD = threading.Lock()
_COLLECTION_LOCK_STATE = threading.local()


class CollectionCorruptError(RuntimeError):
    pass


def check_token():
    auth = request.headers.get("Authorization", "")
    return hmac.compare_digest(auth, f"Bearer {API_TOKEN}")


def is_valid_collection(collection):
    return bool(COLLECTION_RE.match(collection or ""))


def get_file_path(collection):
    return os.path.join(DATA_DIR, f"{collection}.json")


def get_collection_lock_path(collection):
    if not is_valid_collection(collection):
        raise ValueError("invalid collection lock name")
    return os.path.join(_COLLECTION_LOCK_DIR, f"{collection}.lock")


def get_collection_lock(collection):
    with _COLLECTION_LOCKS_GUARD:
        if collection not in _COLLECTION_LOCKS:
            _COLLECTION_LOCKS[collection] = threading.RLock()
        return _COLLECTION_LOCKS[collection]


def get_collection_lock_depths():
    depths = getattr(_COLLECTION_LOCK_STATE, "depths", None)
    if depths is None:
        depths = {}
        _COLLECTION_LOCK_STATE.depths = depths
    return depths


@contextmanager
def collection_lock(collection):
    thread_lock = get_collection_lock(collection)
    thread_lock.acquire()
    depths = get_collection_lock_depths()
    previous_depth = depths.get(collection, 0)
    lock_handle = None
    file_locked = False
    try:
        if previous_depth == 0:
            lock_fd = os.open(get_collection_lock_path(collection), os.O_CREAT | os.O_RDWR, 0o600)
            lock_handle = os.fdopen(lock_fd, "r+")
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
            file_locked = True
        depths[collection] = previous_depth + 1
        yield
    finally:
        current_depth = depths.get(collection, 0)
        if current_depth <= 1:
            depths.pop(collection, None)
        else:
            depths[collection] = current_depth - 1
        if previous_depth == 0:
            if file_locked and lock_handle is not None:
                fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            if lock_handle is not None:
                lock_handle.close()
        thread_lock.release()


def load_collection(collection, default=None):
    if default is None:
        default = {}
    path = get_file_path(collection)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        raise CollectionCorruptError(f"collection {collection} cannot be read: {error}") from error


def save_collection(collection, data):
    path = get_file_path(collection)
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    temp_path = os.path.join(directory, f".{os.path.basename(path)}.tmp-{os.getpid()}-{threading.get_ident()}")
    try:
        with open(temp_path, "w", encoding="utf-8") as file_handle:
            json.dump(data, file_handle, ensure_ascii=False, indent=2)
            file_handle.write("\n")
            file_handle.flush()
            os.fsync(file_handle.fileno())
        os.replace(temp_path, path)
        try:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def list_collections():
    result = []
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"):
            continue
        collection = filename[:-5]
        if is_valid_collection(collection):
            result.append(collection)
    return sorted(result)


def count_items(data):
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        return len(data.keys())
    return 1 if data is not None else 0


def transfer_history_unique_keys(item):
    if not isinstance(item, dict):
        return []
    keys = []
    if item.get("eventKey"):
        keys.append(f"event:{item['eventKey']}")
    if item.get("eventKeySource"):
        keys.append(f"source:{item['eventKeySource']}")
    return keys


def unique_keys_for_item(collection, item):
    if collection == "transfer_history":
        return transfer_history_unique_keys(item)
    field = TACTICAL_UNIQUE_KEYS.get(collection)
    if not field or not isinstance(item, dict) or not item.get(field):
        return []
    return [f"{field}:{item[field]}"]


def filter_append_duplicates(collection, existing, incoming):
    existing_keys = set()
    for item in existing:
        existing_keys.update(str(key) for key in unique_keys_for_item(collection, item))
    accepted = []
    skipped = 0
    missing_unique_key = 0
    for item in incoming:
        item_keys = [str(key) for key in unique_keys_for_item(collection, item)]
        if collection in TACTICAL_UNIQUE_KEYS and not item_keys:
            missing_unique_key += 1
        if item_keys and any(key in existing_keys for key in item_keys):
            skipped += 1
            continue
        accepted.append(item)
        existing_keys.update(item_keys)
    return accepted, skipped, missing_unique_key


def build_transfer_history_index(data):
    if not isinstance(data, list):
        return []
    result = []
    for item in data:
        if not isinstance(item, dict):
            continue
        record_type = item.get("recordType") or item.get("eventType")
        if record_type != "completed_transfer":
            continue
        player = item.get("player") if isinstance(item.get("player"), dict) else {}
        transfer = item.get("transfer") if isinstance(item.get("transfer"), dict) else {}
        player_id = player.get("playerId") or item.get("playerId") or ""
        price = transfer.get("price") if transfer.get("price") is not None else item.get("price")
        date_text = transfer.get("dateText") or item.get("dateText") or ""
        date_ts = transfer.get("dateTs") if transfer.get("dateTs") is not None else item.get("dateTs")
        compact = {"recordType": "completed_transfer", "playerId": str(player_id).strip(), "dateText": str(date_text).strip()}
        if price is not None:
            compact["price"] = price
        if date_ts is not None:
            compact["dateTs"] = date_ts
        result.append(compact)
    return result


def load_forum_faq(default=None):
    if default is None:
        default = {"source": "forum_faq", "updated_at": None, "documents": []}
    index_path = os.path.join(FORUM_FAQ_DIR, "index.json")
    if not os.path.exists(index_path):
        return default
    try:
        with open(index_path, "r", encoding="utf-8") as file_handle:
            index_data = json.load(file_handle)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError):
        return default
    result_documents = []
    for doc in index_data.get("documents", []):
        if not isinstance(doc, dict) or not doc.get("file"):
            continue
        normalized = os.path.normpath(doc["file"])
        if normalized.startswith("..") or os.path.isabs(normalized):
            continue
        full_path = os.path.join(FORUM_FAQ_DIR, normalized)
        item = dict(doc)
        item["markdown"] = ""
        if os.path.isfile(full_path):
            with open(full_path, "r", encoding="utf-8") as markdown_file:
                item["markdown"] = markdown_file.read()
        result_documents.append(item)
    return {"source": index_data.get("source", "forum_faq"), "updated_at": index_data.get("updated_at"), "documents": result_documents, "count": len(result_documents)}


def collection_health(collection):
    path = get_file_path(collection)
    result = {"exists": os.path.exists(path), "valid": True, "type": "missing", "count": 0, "fileSize": 0, "duplicateKeys": 0, "missingUniqueKeys": 0, "oldestTimestamp": None, "newestTimestamp": None}
    if not result["exists"]:
        return result
    result["fileSize"] = os.path.getsize(path)
    try:
        data = load_collection(collection, default=[])
    except CollectionCorruptError as error:
        result.update({"valid": False, "type": "corrupt", "error": str(error)})
        return result
    result["type"] = "list" if isinstance(data, list) else "dict" if isinstance(data, dict) else type(data).__name__
    result["count"] = count_items(data)
    if not isinstance(data, list):
        return result
    seen = set()
    timestamps = []
    for item in data:
        keys = unique_keys_for_item(collection, item)
        if collection in TACTICAL_UNIQUE_KEYS and not keys:
            result["missingUniqueKeys"] += 1
        for key in keys:
            if key in seen:
                result["duplicateKeys"] += 1
            seen.add(key)
        if isinstance(item, dict):
            for field in ("ts", "parsedAt", "collectedAt", "dateTs"):
                value = item.get(field)
                if isinstance(value, (int, float)):
                    timestamps.append(int(value))
                    break
    if timestamps:
        result["oldestTimestamp"] = min(timestamps)
        result["newestTimestamp"] = max(timestamps)
    return result


@app.errorhandler(CollectionCorruptError)
def handle_collection_corruption(error):
    app.logger.error("collection corruption detected: %s", error)
    return jsonify({"error": "Collection data is corrupt", "kind": "collection_corrupt"}), 500


@app.route("/api/forum_faq", methods=["GET"])
def api_forum_faq():
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(load_forum_faq())


@app.route("/api/<collection>", methods=["GET"])
def api_get(collection):
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401
    if not is_valid_collection(collection):
        return jsonify({"error": "Invalid collection"}), 400
    with collection_lock(collection):
        data = load_collection(collection, default=[] if collection in TACTICAL_UNIQUE_KEYS or collection == "transfer_history" else {})
    if collection == "transfer_history" and request.args.get("view") == "index":
        return jsonify(build_transfer_history_index(data))
    return jsonify(data)


@app.route("/api/<collection>", methods=["POST"])
def api_post(collection):
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401
    if not is_valid_collection(collection):
        return jsonify({"error": "Invalid collection"}), 400
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "No JSON"}), 400
    mode = request.args.get("mode", "replace")
    with collection_lock(collection):
        if mode == "append":
            existing = load_collection(collection, default=[])
            if not isinstance(existing, list):
                return jsonify({"error": "Append requires list collection", "kind": "collection_type"}), 409
            received = len(data) if isinstance(data, list) else 1
            incoming = data if isinstance(data, list) else [data]
            accepted, skipped_duplicates, missing_unique_key = filter_append_duplicates(collection, existing, incoming)
            existing.extend(accepted)
            save_collection(collection, existing)
            return jsonify({
                "status": "appended", "collection": collection, "received": received,
                "added": len(accepted), "skippedDuplicates": skipped_duplicates,
                "missingUniqueKey": missing_unique_key, "count": len(existing)
            })
        if mode == "replace":
            save_collection(collection, data)
            return jsonify({"status": "saved", "collection": collection, "count": count_items(data)})
        if mode == "merge":
            if collection != "tactics" or not isinstance(data, dict):
                return jsonify({"error": "Merge is supported only for tactics objects"}), 400
            existing = load_collection(collection, default={})
            if not isinstance(existing, dict):
                return jsonify({"error": "Tactics collection is not an object", "kind": "collection_type"}), 409
            existing.update(data)
            save_collection(collection, existing)
            return jsonify({"status": "merged", "collection": collection, "updated": len(data), "count": len(existing)})
        if mode == "delete-key":
            if collection != "tactics" or not isinstance(data, dict) or not data.get("key"):
                return jsonify({"error": "delete-key requires a tactics key"}), 400
            existing = load_collection(collection, default={})
            removed = existing.pop(str(data["key"]), None) is not None
            save_collection(collection, existing)
            return jsonify({"status": "deleted" if removed else "not_found", "collection": collection, "key": str(data["key"]), "count": len(existing)})
    return jsonify({"error": "Invalid mode"}), 400


@app.route("/api/analysis", methods=["GET"])
def api_analysis():
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401
    stats = {}
    all_game_ids = set()
    overall_status = "ok"
    for collection in list_collections():
        with collection_lock(collection):
            health = collection_health(collection)
            stats[collection] = health
            if not health.get("valid", True):
                overall_status = "degraded"
                continue
            try:
                data = load_collection(collection, default=[])
            except CollectionCorruptError:
                overall_status = "degraded"
                continue
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and item.get("gameId"):
                    all_game_ids.add(str(item["gameId"]))
        elif isinstance(data, dict) and data.get("gameId"):
            all_game_ids.add(str(data["gameId"]))
    return jsonify({"status": overall_status, "games": len(all_game_ids), "collections": stats, "serverTime": int(time.time())})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
