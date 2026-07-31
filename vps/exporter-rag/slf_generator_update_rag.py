#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUT = Path(os.environ.get("SLF_AI_OUT", "/var/www/html/slf_ai"))
SOURCE_FILE = Path(
    os.environ.get("SLF_GENERATOR_UPDATES_FILE", str(BASE_DIR / "generator_updates.json"))
)
CONTEXT_BEGIN = "<!-- SLF_GENERATOR_CONTEXT_BEGIN -->"
CONTEXT_END = "<!-- SLF_GENERATOR_CONTEXT_END -->"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def read_json_required(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as error:
        raise RuntimeError(f"cannot read JSON {path}: {error}") from error


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    tmp.replace(path)


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(text)
    tmp.replace(path)


def normalize_search_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        return " ".join(normalize_search_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(
            f"{key} {normalize_search_text(item)}" for key, item in sorted(value.items())
        )
    return str(value)


def validate_pack(pack):
    if not isinstance(pack, dict):
        raise ValueError("generator update pack must be an object")
    if pack.get("schema") != "slf_generator_update_pack_v1":
        raise ValueError("unsupported generator update pack schema")
    for field in ("id", "generatorVersion", "publishedAt", "status"):
        if not str(pack.get(field) or "").strip():
            raise ValueError(f"generator update pack is missing {field}")

    source = pack.get("source")
    if not isinstance(source, dict):
        raise ValueError("generator update source metadata is required")
    for field in ("type", "authority", "verificationStatus"):
        if not str(source.get(field) or "").strip():
            raise ValueError(f"generator update source is missing {field}")

    rules = pack.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ValueError("generator update rules must be a non-empty list")

    seen = set()
    for index, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict):
            raise ValueError(f"generator rule {index} must be an object")
        rule_id = str(rule.get("id") or "").strip()
        if not rule_id:
            raise ValueError(f"generator rule {index} has no id")
        if rule_id in seen:
            raise ValueError(f"duplicate generator rule id: {rule_id}")
        seen.add(rule_id)
        if rule.get("schema") != "slf_generator_rule_v1":
            raise ValueError(f"generator rule {rule_id} has unsupported schema")
        for field in ("kind", "authority", "confidence", "status", "topic", "title", "text"):
            if not str(rule.get(field) or "").strip():
                raise ValueError(f"generator rule {rule_id} is missing {field}")
        if not isinstance(rule.get("facts"), list) or not rule["facts"]:
            raise ValueError(f"generator rule {rule_id} must include facts")
        if not isinstance(rule.get("implications"), list):
            raise ValueError(f"generator rule {rule_id} implications must be a list")
        if not isinstance(rule.get("useFor"), list) or not rule["useFor"]:
            raise ValueError(f"generator rule {rule_id} must include useFor")
        runtime = rule.get("runtime")
        if not isinstance(runtime, dict) or not isinstance(runtime.get("safe"), bool):
            raise ValueError(f"generator rule {rule_id} runtime.safe must be boolean")


def build_rows(pack):
    source = pack["source"]
    rows = []
    for rule in pack["rules"]:
        row = dict(rule)
        row.update({
            "packId": pack["id"],
            "generatorVersion": pack["generatorVersion"],
            "packPublishedAt": pack["publishedAt"],
            "source": "generator_updates",
            "sourceType": source.get("type"),
            "sourceAuthority": source.get("authority"),
            "sourceUrl": source.get("sourceUrl"),
            "verificationStatus": source.get("verificationStatus"),
        })
        rows.append(row)
    return rows


def build_search_items(rows):
    items = []
    for row in rows:
        text = " ".join(
            normalize_search_text(row.get(field))
            for field in ("title", "topic", "text", "facts", "implications", "useFor")
        )
        items.append({
            "id": row["id"],
            "type": "generator_update",
            "title": row["title"],
            "topic": row["topic"],
            "generatorVersion": row["generatorVersion"],
            "authority": row["authority"],
            "status": row["status"],
            "effectiveFrom": row.get("effectiveFrom"),
            "effectiveUntil": row.get("effectiveUntil"),
            "text": text[:1600],
            "path": "rag/generator_updates.jsonl"
        })
    return items


def build_safe_rules(rows):
    safe_rules = []
    for row in rows:
        runtime = row.get("runtime") or {}
        if not runtime.get("safe"):
            continue
        safe_rules.append({
            "id": row["id"],
            "generatorVersion": row["generatorVersion"],
            "effectiveFrom": row.get("effectiveFrom"),
            "status": row.get("status"),
            "topic": row.get("topic"),
            "title": row.get("title"),
            "rule": row.get("text"),
            "runtimeType": runtime.get("type"),
            "runtimeAction": runtime.get("action"),
            "confidence": row.get("confidence"),
            "authority": row.get("authority")
        })
    return safe_rules


def update_search_index(pack, rows):
    path = OUT / "rag" / "search_index.json"
    index = read_json_required(path)
    if not isinstance(index, dict) or not isinstance(index.get("items"), list):
        raise ValueError("rag/search_index.json has an unsupported shape")

    generator_ids = {row["id"] for row in rows}
    retained = [
        item for item in index["items"]
        if item.get("type") != "generator_update" and item.get("id") not in generator_ids
    ]
    index["items"] = build_search_items(rows) + retained
    index["count"] = len(index["items"])
    index["updatedAt"] = now_iso()
    index["generatorContext"] = {
        "version": pack["generatorVersion"],
        "effectiveFrom": pack["publishedAt"],
        "packId": pack["id"]
    }
    write_json(path, index)


def update_knowledge_pack(pack, rows):
    path = OUT / "tactics" / "knowledge-pack.latest.json"
    knowledge = read_json_required(path)
    if not isinstance(knowledge, dict) or not isinstance(knowledge.get("rules"), list):
        raise ValueError("tactics/knowledge-pack.latest.json has an unsupported shape")

    safe_rules = build_safe_rules(rows)
    knowledge["version"] = now_iso()
    knowledge["generatorContext"] = {
        "packId": pack["id"],
        "generatorVersion": pack["generatorVersion"],
        "effectiveFrom": pack["publishedAt"],
        "expectationsResetAt": pack.get("expectationsResetAt"),
        "verificationStatus": pack["source"].get("verificationStatus"),
        "historicalSegmentation": {
            "before": f"before_{pack['publishedAt']}",
            "transition": {
                "from": pack["publishedAt"],
                "through": pack.get("expectationsResetAt")
            },
            "current": f"generator_{pack['generatorVersion'].replace('.', '_')}"
        },
        "safeRules": safe_rules
    }
    write_json(path, knowledge)
    return len(safe_rules)


def update_catalog(pack, row_count, safe_count):
    path = OUT / "rag" / "catalog.json"
    catalog = read_json_required(path)
    if not isinstance(catalog, dict) or not isinstance(catalog.get("sources"), list):
        raise ValueError("rag/catalog.json has an unsupported shape")

    source_entry = {
        "id": "generator_updates",
        "type": "official_generator_changelog",
        "authority": "user_supplied_official_changelog",
        "path": "rag/generator_updates.jsonl",
        "packPath": "rag/generator_update_pack.json",
        "generatorVersion": pack["generatorVersion"],
        "verificationStatus": pack["source"].get("verificationStatus"),
        "count": row_count,
        "runtimeSafeRuleCount": safe_count
    }
    retained = [source for source in catalog["sources"] if source.get("id") != "generator_updates"]
    catalog["sources"] = [source_entry] + retained
    catalog["updatedAt"] = now_iso()
    catalog["generatorContext"] = {
        "version": pack["generatorVersion"],
        "effectiveFrom": pack["publishedAt"],
        "expectationsResetAt": pack.get("expectationsResetAt"),
        "packId": pack["id"],
        "verificationStatus": pack["source"].get("verificationStatus")
    }
    write_json(path, catalog)


def update_ai_context(pack, row_count, safe_count):
    path = OUT / "ai_context.md"
    current = path.read_text(encoding="utf-8") if path.exists() else "# SLF AI RAG Current Export\n"
    if CONTEXT_BEGIN in current and CONTEXT_END in current:
        prefix, remainder = current.split(CONTEXT_BEGIN, 1)
        _, suffix = remainder.split(CONTEXT_END, 1)
        current = prefix.rstrip() + "\n\n" + suffix.lstrip()

    block = f"""{CONTEXT_BEGIN}
## Generator context

- Active version: `{pack['generatorVersion']}` from `{pack['publishedAt']}`.
- Expectations reset: `{pack.get('expectationsResetAt')}`.
- Source authority: `{pack['source'].get('authority')}`.
- Source verification: `{pack['source'].get('verificationStatus')}`.
- Generator rules: `{row_count}` total, `{safe_count}` safe for runtime context.
- Read `rag/generator_update_pack.json` and `rag/generator_updates.jsonl` before historical match evidence.
- Segment evidence around generator 5.61; the temporary defense/form imbalance is historical context, not a permanent tactical bias.
{CONTEXT_END}"""
    write_text(path, current.rstrip() + "\n\n" + block + "\n")


def main():
    pack = read_json_required(SOURCE_FILE)
    validate_pack(pack)
    rows = build_rows(pack)

    rag_dir = OUT / "rag"
    write_json(rag_dir / "generator_update_pack.json", pack)
    write_jsonl(rag_dir / "generator_updates.jsonl", rows)
    update_search_index(pack, rows)
    safe_count = update_knowledge_pack(pack, rows)
    update_catalog(pack, len(rows), safe_count)
    update_ai_context(pack, len(rows), safe_count)

    print(json.dumps({
        "ok": True,
        "out": str(OUT),
        "source_file": str(SOURCE_FILE),
        "generator_version": pack["generatorVersion"],
        "generator_updates": len(rows),
        "generator_safe_rules": safe_count,
        "verification_status": pack["source"].get("verificationStatus")
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
