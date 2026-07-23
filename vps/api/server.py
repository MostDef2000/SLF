from flask import Flask, request, jsonify
from flask_cors import CORS
import hmac
import os
import json
import time
import re

app = Flask(__name__)
CORS(app)

API_TOKEN = os.environ.get("SLF_API_TOKEN", "").strip()
if not API_TOKEN:
    raise RuntimeError("SLF_API_TOKEN must be set")

DATA_DIR = "data"
FORUM_FAQ_DIR = "forum_faq"
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FORUM_FAQ_DIR, exist_ok=True)

COLLECTION_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def check_token():
    auth = request.headers.get("Authorization", "")
    return hmac.compare_digest(auth, f"Bearer {API_TOKEN}")


def is_valid_collection(collection):
    return bool(COLLECTION_RE.match(collection or ""))


def get_file_path(collection):
    return os.path.join(DATA_DIR, f"{collection}.json")


def load_collection(collection, default=None):
    if default is None:
        default = {}

    path = get_file_path(collection)

    if not os.path.exists(path):
        return default

    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return default


def save_collection(collection, data):
    path = get_file_path(collection)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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

    event_key = item.get("eventKey")
    if event_key:
        keys.append(f"event:{event_key}")

    event_key_source = item.get("eventKeySource")
    if event_key_source:
        keys.append(f"source:{event_key_source}")

    return keys


def filter_transfer_history_append_duplicates(existing, incoming):
    existing_keys = set()

    for item in existing:
        for key in transfer_history_unique_keys(item):
            existing_keys.add(str(key))

    accepted = []
    skipped = 0

    for item in incoming:
        item_keys = [str(key) for key in transfer_history_unique_keys(item)]

        if item_keys and any(key in existing_keys for key in item_keys):
            skipped += 1
            continue

        accepted.append(item)

        for key in item_keys:
            existing_keys.add(key)

    return accepted, skipped


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

        compact = {
            "recordType": "completed_transfer",
            "playerId": str(player_id).strip(),
            "dateText": str(date_text).strip()
        }

        if price is not None:
            compact["price"] = price
        if date_ts is not None:
            compact["dateTs"] = date_ts

        result.append(compact)

    return result


def load_forum_faq(default=None):
    if default is None:
        default = {
            "source": "forum_faq",
            "updated_at": None,
            "documents": []
        }

    index_path = os.path.join(FORUM_FAQ_DIR, "index.json")

    if not os.path.exists(index_path):
        return default

    with open(index_path, "r", encoding="utf-8") as f:
        try:
            index_data = json.load(f)
        except Exception:
            return default

    documents = index_data.get("documents", [])
    result_documents = []

    for doc in documents:
        if not isinstance(doc, dict):
            continue

        rel_file = doc.get("file")
        if not rel_file:
            continue

        # Safety: allow only files inside forum_faq directory.
        normalized = os.path.normpath(rel_file)
        if normalized.startswith("..") or os.path.isabs(normalized):
            continue

        full_path = os.path.join(FORUM_FAQ_DIR, normalized)

        item = dict(doc)
        item["markdown"] = ""

        if os.path.exists(full_path) and os.path.isfile(full_path):
            with open(full_path, "r", encoding="utf-8") as mf:
                item["markdown"] = mf.read()

        result_documents.append(item)

    return {
        "source": index_data.get("source", "forum_faq"),
        "updated_at": index_data.get("updated_at"),
        "documents": result_documents,
        "count": len(result_documents)
    }


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

    if collection == "transfer_history" and request.args.get("view") == "index":
        data = load_collection(collection, default=[])
        return jsonify(build_transfer_history_index(data))

    return jsonify(load_collection(collection, default={}))


@app.route("/api/<collection>", methods=["POST"])
def api_post(collection):
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401

    if not is_valid_collection(collection):
        return jsonify({"error": "Invalid collection"}), 400

    data = request.get_json()

    if data is None:
        return jsonify({"error": "No JSON"}), 400

    mode = request.args.get("mode", "replace")

    if mode == "append":
        existing = load_collection(collection, default=[])

        if not isinstance(existing, list):
            existing = []

        incoming = data if isinstance(data, list) else [data]
        skipped_duplicates = 0

        if collection == "transfer_history":
            incoming, skipped_duplicates = filter_transfer_history_append_duplicates(existing, incoming)

        existing.extend(incoming)
        added = len(incoming)

        save_collection(collection, existing)

        return jsonify({
            "status": "appended",
            "collection": collection,
            "added": added,
            "skippedDuplicates": skipped_duplicates,
            "count": len(existing)
        })

    if mode == "replace":
        save_collection(collection, data)

        return jsonify({
            "status": "saved",
            "collection": collection,
            "count": count_items(data)
        })

    return jsonify({"error": "Invalid mode"}), 400


@app.route("/api/analysis", methods=["GET"])
def api_analysis():
    if not check_token():
        return jsonify({"error": "Unauthorized"}), 401

    collections = list_collections()

    stats = {}
    all_game_ids = set()

    for collection in collections:
        data = load_collection(collection, default=[])

        stats[collection] = {
            "type": "list" if isinstance(data, list) else "dict" if isinstance(data, dict) else type(data).__name__,
            "count": count_items(data)
        }

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and item.get("gameId"):
                    all_game_ids.add(str(item.get("gameId")))

        if isinstance(data, dict):
            game_id = data.get("gameId")
            if game_id:
                all_game_ids.add(str(game_id))

    return jsonify({
        "status": "ok",
	"games": len(all_game_ids),
        "collections": stats,
        "serverTime": int(time.time())
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
