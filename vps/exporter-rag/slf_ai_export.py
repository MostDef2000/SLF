#!/usr/bin/env python3
"""
SLF AI Exporter v2

Creates read-only, AI-readable static exports from the private SLF VPS API.
The goal is to let ChatGPT/web readers access aggregates and knowledge files
without exposing the private bearer token or raw operational collections.
"""
from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import hashlib
import json
import math
import os
import re
import statistics
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import requests
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slf_common_utils import first_path, get_path  # noqa: E402

EXPORTER_VERSION = "slf_ai_exporter_v2"
DEFAULT_COLLECTIONS = [
    "tactics",
    "match_snapshots_v2",
    "match_results_v2",
    "preset_events_v2",
    "preset_effects_v2",
    "player_observations",
    "transfer_history",
    "wiki_docs",
]

TRANSFER_GROUP_LIMIT = 2500
MAX_BARGAIN_EXAMPLES = 80
MAX_WIKI_CHUNKS_PER_DOC = 80
WIKI_CHUNK_TARGET_CHARS = 2200
WIKI_CHUNK_OVERLAP_CHARS = 350


class ApiError(RuntimeError):
    pass


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def safe_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return None
        return int(value)
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("'", "").replace(" ", "").replace("\u00a0", "")
    s = re.sub(r"[^0-9\-]", "", s)
    if not s or s == "-":
        return None
    try:
        return int(s)
    except ValueError:
        return None


def safe_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    s = str(value).strip().replace("'", "").replace(" ", "").replace("\u00a0", "")
    s = s.replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    if not s or s in {"-", "."}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def pctile(sorted_values: Sequence[float], p: float) -> Optional[float]:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * p
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return float(sorted_values[lo])
    weight = pos - lo
    return float(sorted_values[lo] * (1 - weight) + sorted_values[hi] * weight)


def compact_stats(values: Iterable[Any]) -> Dict[str, Any]:
    nums = [safe_float(v) for v in values]
    nums = [v for v in nums if v is not None]
    if not nums:
        return {"sample": 0}
    nums.sort()
    return {
        "sample": len(nums),
        "min": nums[0],
        "p25": pctile(nums, 0.25),
        "median": pctile(nums, 0.50),
        "p75": pctile(nums, 0.75),
        "max": nums[-1],
        "avg": sum(nums) / len(nums),
    }


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def json_size(obj: Any) -> int:
    return len(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def normalize_api_payload(payload: Any) -> List[Dict[str, Any]]:
    """Handle list responses and a few common wrapped shapes."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "documents", "records", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
        # Some APIs return {id: doc}
        dict_values = list(payload.values())
        if dict_values and all(isinstance(x, dict) for x in dict_values):
            return dict_values  # type: ignore[return-value]
    return []


def fetch_collection(api_base: str, token: str, collection: str, timeout: int = 60) -> List[Dict[str, Any]]:
    url = f"{api_base.rstrip('/')}/{collection}"
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
    if response.status_code == 404:
        return []
    if response.status_code >= 400:
        raise ApiError(f"GET {url} failed: {response.status_code} {response.text[:500]}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise ApiError(f"GET {url} did not return JSON: {response.text[:500]}") from exc
    return normalize_api_payload(payload)




def age_bucket(age: Any) -> str:
    a = safe_int(age)
    if a is None:
        return "unknown"
    if a <= 18:
        return "<=18"
    if a <= 21:
        return "19-21"
    if a <= 24:
        return "22-24"
    if a <= 28:
        return "25-28"
    if a <= 32:
        return "29-32"
    if a <= 36:
        return "33-36"
    return "37+"


def skill_bucket(skill: Any) -> str:
    s = safe_int(skill)
    if s is None:
        return "unknown"
    if s < 120:
        return "<120"
    if s < 140:
        return "120-139"
    if s < 150:
        return "140-149"
    if s < 160:
        return "150-159"
    if s < 170:
        return "160-169"
    if s < 180:
        return "170-179"
    if s < 190:
        return "180-189"
    return "190+"


def minute_bucket(minute: Any) -> str:
    m = safe_int(minute)
    if m is None:
        return "unknown"
    if m < 15:
        return "000-014"
    if m < 30:
        return "015-029"
    if m < 45:
        return "030-044"
    if m < 60:
        return "045-059"
    if m < 75:
        return "060-074"
    if m < 90:
        return "075-089"
    return "090+"


def primary_position(record: Mapping[str, Any]) -> str:
    positions = get_path(record, "player.positions")
    if isinstance(positions, list) and positions:
        return str(positions[0] or "unknown")
    value = first_path(record, ["player.primaryPosition", "primaryPosition", "position", "pos"])
    return str(value or "unknown")


def compact_transfer_record(record: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "date": get_path(record, "transfer.dateText"),
        "price": safe_int(get_path(record, "transfer.price")),
        "priceText": get_path(record, "transfer.priceText"),
        "playerId": get_path(record, "player.playerId"),
        "player": get_path(record, "player.name"),
        "position": primary_position(record),
        "age": safe_int(get_path(record, "player.age")),
        "talent": safe_int(get_path(record, "player.talent")),
        "skill": safe_int(get_path(record, "player.skill")),
        "from": get_path(record, "clubs.fromName"),
        "to": get_path(record, "clubs.toName"),
        "verdict": get_path(record, "analysis.verdict.label"),
        "score": safe_float(get_path(record, "analysis.verdict.score")),
        "eventKey": record.get("eventKey"),
    }


def group_price_summary(records: Sequence[Mapping[str, Any]], key_fn, min_sample: int = 1) -> List[Dict[str, Any]]:
    groups: Dict[Tuple[Any, ...], List[Mapping[str, Any]]] = collections.defaultdict(list)
    for rec in records:
        price = safe_int(get_path(rec, "transfer.price"))
        if price is None:
            continue
        key = key_fn(rec)
        if not isinstance(key, tuple):
            key = (key,)
        groups[key].append(rec)
    rows: List[Dict[str, Any]] = []
    for key, group in groups.items():
        if len(group) < min_sample:
            continue
        prices = [safe_int(get_path(rec, "transfer.price")) for rec in group]
        prices = [p for p in prices if p is not None]
        stats = compact_stats(prices)
        row = {
            "key": list(key),
            **stats,
            "bargainCountLt1000": sum(1 for p in prices if p < 1000),
            "trimmed": compact_stats(trim_extremes(prices)) if len(prices) >= 8 else None,
        }
        rows.append(row)
    rows.sort(key=lambda r: (r.get("sample", 0), r.get("median") or 0), reverse=True)
    return rows[:TRANSFER_GROUP_LIMIT]


def trim_extremes(values: Sequence[int], lower: float = 0.05, upper: float = 0.95) -> List[int]:
    if not values:
        return []
    vals = sorted(values)
    if len(vals) < 8:
        return vals
    lo_idx = int(math.floor((len(vals) - 1) * lower))
    hi_idx = int(math.ceil((len(vals) - 1) * upper))
    return vals[lo_idx : hi_idx + 1]


def build_transfer_market_summary(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    completed = [r for r in records if r.get("recordType") == "completed_transfer" or r.get("eventType") == "completed_transfer"]
    v2 = [r for r in completed if safe_int(r.get("schemaVersion")) == 2 or r.get("parserVersion") == "history_v2_cells"]
    invalid_price = [r for r in v2 if safe_int(get_path(r, "transfer.price")) is None]
    valid = [r for r in v2 if safe_int(get_path(r, "transfer.price")) is not None]

    prices = [safe_int(get_path(r, "transfer.price")) for r in valid]
    prices = [p for p in prices if p is not None]

    schema_counts = collections.Counter(str(r.get("schemaVersion", "missing")) for r in completed)
    parser_counts = collections.Counter(str(r.get("parserVersion", "missing")) for r in completed)

    def key_profile(r: Mapping[str, Any]) -> Tuple[str, str, str, str]:
        return (
            primary_position(r),
            age_bucket(get_path(r, "player.age")),
            str(safe_int(get_path(r, "player.talent")) or "unknown"),
            skill_bucket(get_path(r, "player.skill")),
        )

    bargains = [compact_transfer_record(r) for r in valid if (safe_int(get_path(r, "transfer.price")) or 0) < 1000]
    bargains.sort(key=lambda r: (r.get("price") if r.get("price") is not None else 10**18))

    return {
        "schema": "transfer_market_summary_v1",
        "generatedAt": now_iso(),
        "sourceCollection": "transfer_history",
        "counts": {
            "rawRecords": len(records),
            "completedTransferRecords": len(completed),
            "schemaV2Records": len(v2),
            "validPriceRecords": len(valid),
            "invalidPriceRecords": len(invalid_price),
            "schemaCounts": dict(schema_counts),
            "parserCounts": dict(parser_counts),
        },
        "globalPriceStats": compact_stats(prices),
        "globalTrimmedPriceStats": compact_stats(trim_extremes(prices)) if len(prices) >= 8 else None,
        "notes": [
            "Very low prices can be real completed deals in SLF and are preserved.",
            "Use trimmed stats only as an additional view; do not discard bargain deals from storage.",
        ],
        "bargainsLt1000": bargains[:MAX_BARGAIN_EXAMPLES],
        "groups": {
            "positionAgeTalentSkill": group_price_summary(valid, key_profile),
            "position": group_price_summary(valid, lambda r: primary_position(r)),
            "ageBucket": group_price_summary(valid, lambda r: age_bucket(get_path(r, "player.age"))),
            "talent": group_price_summary(valid, lambda r: str(safe_int(get_path(r, "player.talent")) or "unknown")),
            "skillBucket": group_price_summary(valid, lambda r: skill_bucket(get_path(r, "player.skill"))),
        },
    }


def flatten_numeric(obj: Any, prefix: str = "") -> Dict[str, float]:
    out: Dict[str, float] = {}
    if isinstance(obj, Mapping):
        for key, value in obj.items():
            key_str = str(key)
            new_prefix = f"{prefix}.{key_str}" if prefix else key_str
            out.update(flatten_numeric(value, new_prefix))
    elif isinstance(obj, list):
        # lists are intentionally skipped for summary stability
        return out
    else:
        val = safe_float(obj)
        if val is not None:
            out[prefix] = val
    return out


def is_interesting_metric_path(path: str) -> bool:
    p = path.lower()
    needles = [
        "delta", "xg", "xt", "shot", "goal", "score", "danger", "moment", "mistake", "error", "possession", "attack", "defense",
    ]
    return any(n in p for n in needles)


def preset_name(record: Mapping[str, Any]) -> str:
    value = first_path(record, [
        "presetName", "preset", "preset.name", "event.presetName", "event.preset", "tacticPreset",
        "appliedPreset", "meta.presetName", "analysis.presetName", "name",
    ])
    if isinstance(value, Mapping):
        value = value.get("name") or value.get("id")
    return str(value or "unknown")


def score_state(record: Mapping[str, Any]) -> str:
    for path in ["scoreState", "context.scoreState", "snapshot.scoreState", "event.scoreState", "bucket", "context.bucket"]:
        value = get_path(record, path)
        if value not in (None, ""):
            return str(value)
    my_goals = safe_int(first_path(record, ["snapshot.score.my", "score.my", "myGoals", "teamGoals"]))
    opp_goals = safe_int(first_path(record, ["snapshot.score.opp", "score.opp", "oppGoals", "opponentGoals"]))
    if my_goals is not None and opp_goals is not None:
        if my_goals > opp_goals:
            return "winning"
        if my_goals < opp_goals:
            return "losing"
        return "draw"
    return "unknown"


def record_minute(record: Mapping[str, Any]) -> Optional[int]:
    return safe_int(first_path(record, ["minute", "matchMinute", "snapshot.minute", "event.minute", "context.minute"]))


def summarize_numeric_records(records: Sequence[Mapping[str, Any]], max_paths: int = 120) -> Dict[str, Any]:
    buckets: Dict[str, List[float]] = collections.defaultdict(list)
    for rec in records:
        for path, value in flatten_numeric(rec).items():
            if is_interesting_metric_path(path):
                buckets[path].append(value)
    ranked_paths = sorted(buckets, key=lambda p: len(buckets[p]), reverse=True)[:max_paths]
    return {path: compact_stats(buckets[path]) for path in ranked_paths}


def build_preset_effects_summary(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    by_preset: Dict[str, List[Mapping[str, Any]]] = collections.defaultdict(list)
    by_context: Dict[Tuple[str, str, str], List[Mapping[str, Any]]] = collections.defaultdict(list)
    for rec in records:
        name = preset_name(rec)
        by_preset[name].append(rec)
        ctx = (name, score_state(rec), minute_bucket(record_minute(rec)))
        by_context[ctx].append(rec)

    preset_rows = []
    for name, group in by_preset.items():
        preset_rows.append({
            "presetName": name,
            "sample": len(group),
            "numericMetrics": summarize_numeric_records(group, max_paths=40),
        })
    preset_rows.sort(key=lambda r: r["sample"], reverse=True)

    context_rows = []
    for (name, state, mb), group in by_context.items():
        context_rows.append({
            "presetName": name,
            "scoreState": state,
            "minuteBucket": mb,
            "sample": len(group),
            "numericMetrics": summarize_numeric_records(group, max_paths=30),
        })
    context_rows.sort(key=lambda r: r["sample"], reverse=True)

    return {
        "schema": "preset_effects_summary_v1",
        "generatedAt": now_iso(),
        "sourceCollection": "preset_effects_v2",
        "count": len(records),
        "byPreset": preset_rows,
        "byPresetContext": context_rows[:1500],
        "notes": [
            "This exporter is schema-tolerant and aggregates numeric fields whose path suggests xG/xT/shots/goals/delta/score/risk.",
            "After enough data is collected, tighten metric paths in the exporter to match the final preset_effects schema.",
        ],
    }


def build_preset_events_summary(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    rows: Dict[Tuple[str, str, str], int] = collections.Counter()
    presets: Dict[str, int] = collections.Counter()
    for rec in records:
        name = preset_name(rec)
        presets[name] += 1
        rows[(name, score_state(rec), minute_bucket(record_minute(rec)))] += 1
    return {
        "schema": "preset_events_summary_v1",
        "generatedAt": now_iso(),
        "sourceCollection": "preset_events_v2",
        "count": len(records),
        "byPreset": [{"presetName": k, "count": v} for k, v in presets.most_common()],
        "byPresetContext": [
            {"presetName": k[0], "scoreState": k[1], "minuteBucket": k[2], "count": v}
            for k, v in rows.most_common(1500)
        ],
    }


def build_player_observations_summary(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    by_position = collections.Counter()
    by_team = collections.Counter()
    by_mode = collections.Counter()
    by_side = collections.Counter()
    by_player = collections.Counter()
    for rec in records:
        pos = first_path(rec, ["position", "primaryPosition", "pos", "player.position", "player.primaryPosition"])
        if pos:
            by_position[str(pos)] += 1
        team = first_path(rec, ["teamId", "team.id", "clubId", "teamName", "team.name"])
        if team:
            by_team[str(team)] += 1
        mode = first_path(rec, ["displayMetricMode", "metricMode", "mode"])
        if mode:
            by_mode[str(mode)] += 1
        side = first_path(rec, ["side", "teamSide", "homeAway"])
        if side:
            by_side[str(side)] += 1
        player = first_path(rec, ["playerId", "id", "player.playerId"])
        if player:
            by_player[str(player)] += 1
    return {
        "schema": "player_observations_summary_v1",
        "generatedAt": now_iso(),
        "sourceCollection": "player_observations",
        "count": len(records),
        "byPosition": counter_rows(by_position),
        "byTeam": counter_rows(by_team),
        "byMetricMode": counter_rows(by_mode),
        "bySide": counter_rows(by_side),
        "topObservedPlayers": counter_rows(by_player, limit=200),
    }


def build_match_summary(collections: Mapping[str, Sequence[Dict[str, Any]]]) -> Dict[str, Any]:
    snapshots = collections.get("match_snapshots_v2", []) or collections.get("match_snapshots", [])
    results = collections.get("match_results_v2", []) or collections.get("match_results", [])
    by_game = collections_counter_path(snapshots, ["gameId", "matchId", "id"])
    result_types = collections_counter_path(results, ["resultType", "type"])
    statuses = collections_counter_path(snapshots, ["status", "matchStatus"])
    return {
        "schema": "match_data_summary_v1",
        "generatedAt": now_iso(),
        "counts": {
            "match_snapshots_v2": len(snapshots),
            "match_results_v2": len(results),
            "uniqueGamesFromSnapshots": len(by_game),
        },
        "snapshotStatuses": counter_rows(statuses),
        "resultTypes": counter_rows(result_types),
        "topGamesBySnapshotCount": counter_rows(by_game, limit=100),
    }


def collections_counter_path(records: Sequence[Mapping[str, Any]], paths: Sequence[str]) -> collections.Counter:
    c: collections.Counter = collections.Counter()
    for rec in records:
        value = first_path(rec, paths)
        if value not in (None, ""):
            c[str(value)] += 1
    return c


def counter_rows(counter: collections.Counter, limit: int = 1000) -> List[Dict[str, Any]]:
    return [{"key": k, "count": v} for k, v in counter.most_common(limit)]


def build_analytics_summary(collections_map: Mapping[str, Sequence[Dict[str, Any]]]) -> Dict[str, Any]:
    rows: Dict[str, Any] = {}
    for name, records in collections_map.items():
        versions = collections.Counter()
        schemas = collections.Counter()
        for rec in records:
            script = get_path(rec, "source.scriptVersion") or rec.get("scriptVersion")
            if script:
                versions[str(script)] += 1
            schema = rec.get("schemaVersion") or rec.get("parserVersion") or rec.get("schema")
            if schema:
                schemas[str(schema)] += 1
        rows[name] = {
            "count": len(records),
            "approxJsonBytes": json_size(records),
            "scriptVersions": dict(versions.most_common()),
            "schemaVersions": dict(schemas.most_common()),
        }
    return {
        "schema": "analytics_summary_v1",
        "generatedAt": now_iso(),
        "collections": rows,
        "notes": [
            "This file is safe for AI read-only usage: counts, sizes and schema/version distributions only.",
            "Private raw API collections remain behind bearer token and are not required for ChatGPT web access.",
        ],
    }


def get_doc_id(doc: Mapping[str, Any]) -> str:
    value = first_path(doc, ["postId", "id", "source.postId", "docId"])
    if value:
        return str(value)
    title = str(first_path(doc, ["title", "source.title"]) or "untitled")
    return hash_text(title)[:12]


def get_doc_text(doc: Mapping[str, Any]) -> str:
    value = first_path(doc, ["markdown", "text", "content", "body", "plainText"])
    if value is None:
        return ""
    return str(value)


def get_doc_title(doc: Mapping[str, Any]) -> str:
    return str(first_path(doc, ["title", "source.title"]) or f"wiki_{get_doc_id(doc)}")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9а-яА-ЯёЁ_-]+", "_", text.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80] or "doc"


def chunk_text(text: str, target_chars: int = WIKI_CHUNK_TARGET_CHARS, overlap: int = WIKI_CHUNK_OVERLAP_CHARS) -> List[str]:
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not text:
        return []
    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(n, start + target_chars)
        if end < n:
            # Try to end on paragraph or sentence boundary.
            para = text.rfind("\n\n", start, end)
            sent = max(text.rfind(". ", start, end), text.rfind("! ", start, end), text.rfind("? ", start, end))
            cut = para if para > start + target_chars * 0.55 else sent
            if cut > start + target_chars * 0.55:
                end = cut + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
        if len(chunks) >= MAX_WIKI_CHUNKS_PER_DOC:
            break
    return chunks


def build_wiki_export(docs: Sequence[Dict[str, Any]], out_base: Path) -> Dict[str, Any]:
    wiki_dir = out_base / "wiki"
    docs_dir = wiki_dir / "docs"
    index: List[Dict[str, Any]] = []
    chunks: List[Dict[str, Any]] = []

    for doc in docs:
        doc_id = get_doc_id(doc)
        title = get_doc_title(doc)
        text = get_doc_text(doc)
        if not text.strip():
            continue
        source_url = first_path(doc, ["url", "source.url", "sourceUrl"])
        section = first_path(doc, ["section", "category", "categoryPath", "source.section"])
        content_hash = str(first_path(doc, ["contentHash", "hash"]) or hash_text(text))
        filename = f"wiki_{doc_id}_{slugify(title)}.md"
        write_text(docs_dir / filename, text if text.endswith("\n") else text + "\n")
        index.append({
            "postId": doc_id,
            "title": title,
            "section": section,
            "sourceUrl": source_url,
            "contentHash": content_hash,
            "markdownPath": f"docs/{filename}",
            "charCount": len(text),
        })
        for i, chunk in enumerate(chunk_text(text)):
            chunks.append({
                "chunkId": f"wiki:{doc_id}:{i}",
                "postId": doc_id,
                "title": title,
                "section": section,
                "sourceUrl": source_url,
                "chunkIndex": i,
                "text": chunk,
                "charCount": len(chunk),
            })

    rules = {
        "schema": "wiki_rules_v0_placeholder",
        "generatedAt": now_iso(),
        "status": "placeholder",
        "notes": [
            "Rule extraction is intentionally not automated yet.",
            "Use wiki/chunks.json and wiki/docs/*.md as source material until curated wiki_rule_extracts are produced.",
        ],
        "rules": [],
    }

    wiki_manifest = {
        "schema": "wiki_ai_export_v1",
        "generatedAt": now_iso(),
        "documentCount": len(index),
        "chunkCount": len(chunks),
        "files": {
            "index": "wiki/index.json",
            "chunks": "wiki/chunks.json",
            "rules": "wiki/rules.json",
            "docsDir": "wiki/docs/",
        },
    }
    write_json(wiki_dir / "index.json", {"schema": "wiki_index_v1", "generatedAt": now_iso(), "documents": index})
    write_json(wiki_dir / "chunks.json", {"schema": "wiki_chunks_v1", "generatedAt": now_iso(), "chunks": chunks})
    write_json(wiki_dir / "rules.json", rules)
    write_json(wiki_dir / "manifest.json", wiki_manifest)
    return wiki_manifest


def build_manifest(out_base: Path, files: Mapping[str, str], collection_counts: Mapping[str, int]) -> Dict[str, Any]:
    file_rows = {}
    for key, rel in files.items():
        path = out_base / rel
        file_rows[key] = {
            "path": rel,
            "exists": path.exists(),
            "sizeBytes": path.stat().st_size if path.exists() else 0,
            "sha256": hash_text(path.read_text(encoding="utf-8", errors="replace")) if path.exists() else None,
        }
    return {
        "schema": "slf_ai_manifest_v1",
        "exporterVersion": EXPORTER_VERSION,
        "generatedAt": now_iso(),
        "purpose": "Read-only AI knowledge and analytics export for SLF userscript redesign.",
        "collectionCounts": dict(collection_counts),
        "files": file_rows,
        "recommendedReadOrder": [
            "data/analytics_summary.json",
            "wiki/index.json",
            "wiki/chunks.json",
            "wiki/rules.json",
            "data/transfer_market_summary.json",
            "data/preset_effects_summary.json",
            "data/preset_events_summary.json",
            "data/player_observations_summary.json",
            "data/match_data_summary.json",
        ],
        "security": {
            "containsApiToken": False,
            "containsRawPrivateCollections": False,
            "writeAccess": False,
        },
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build SLF read-only AI exports from private VPS API collections.")
    parser.add_argument("--api-base", default=os.getenv("SLF_API_BASE", "http://77.105.142.206:5000/api"))
    parser.add_argument("--api-token", default=os.getenv("SLF_API_TOKEN", ""))
    parser.add_argument("--out", default="/var/www/html/slf_ai")
    parser.add_argument("--collections", default=",".join(DEFAULT_COLLECTIONS), help="Comma-separated API collections to fetch.")
    parser.add_argument("--skip-api", action="store_true", help="Build only from cached JSON files in --cache-dir.")
    parser.add_argument("--cache-dir", default="cache", help="Local cache for fetched collection JSON.")
    parser.add_argument("--no-cache-write", action="store_true")
    parser.add_argument("--fail-fast", action="store_true")
    args = parser.parse_args(argv)

    out_base = Path(args.out)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    collection_names = [x.strip() for x in args.collections.split(",") if x.strip()]
    collections_map: Dict[str, List[Dict[str, Any]]] = {}

    for name in collection_names:
        cache_file = cache_dir / f"{name}.json"
        records: List[Dict[str, Any]] = []
        if args.skip_api:
            if cache_file.exists():
                records = normalize_api_payload(json.loads(cache_file.read_text(encoding="utf-8")))
        else:
            if not args.api_token:
                print("ERROR: --api-token or SLF_API_TOKEN is required unless --skip-api is used", file=sys.stderr)
                return 2
            try:
                records = fetch_collection(args.api_base, args.api_token, name)
                if not args.no_cache_write:
                    write_json(cache_file, records)
            except Exception as exc:
                print(f"WARN: failed to fetch collection {name}: {exc}", file=sys.stderr)
                if args.fail_fast:
                    raise
                if cache_file.exists():
                    print(f"INFO: using cache for {name}: {cache_file}", file=sys.stderr)
                    records = normalize_api_payload(json.loads(cache_file.read_text(encoding="utf-8")))
                else:
                    records = []
        collections_map[name] = records
        print(f"collection {name}: {len(records)} records")

    data_dir = out_base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    analytics_summary = build_analytics_summary(collections_map)
    transfer_summary = build_transfer_market_summary(collections_map.get("transfer_history", []))
    preset_effects_summary = build_preset_effects_summary(collections_map.get("preset_effects_v2", []) or collections_map.get("preset_effects", []))
    preset_events_summary = build_preset_events_summary(collections_map.get("preset_events_v2", []) or collections_map.get("preset_events", []))
    player_summary = build_player_observations_summary(collections_map.get("player_observations", []))
    match_summary = build_match_summary(collections_map)

    write_json(data_dir / "analytics_summary.json", analytics_summary)
    write_json(data_dir / "transfer_market_summary.json", transfer_summary)
    write_json(data_dir / "preset_effects_summary.json", preset_effects_summary)
    write_json(data_dir / "preset_events_summary.json", preset_events_summary)
    write_json(data_dir / "player_observations_summary.json", player_summary)
    write_json(data_dir / "match_data_summary.json", match_summary)

    wiki_manifest = build_wiki_export(collections_map.get("wiki_docs", []), out_base)

    files = {
        "analyticsSummary": "data/analytics_summary.json",
        "transferMarketSummary": "data/transfer_market_summary.json",
        "presetEffectsSummary": "data/preset_effects_summary.json",
        "presetEventsSummary": "data/preset_events_summary.json",
        "playerObservationsSummary": "data/player_observations_summary.json",
        "matchDataSummary": "data/match_data_summary.json",
        "wikiManifest": "wiki/manifest.json",
        "wikiIndex": "wiki/index.json",
        "wikiChunks": "wiki/chunks.json",
        "wikiRules": "wiki/rules.json",
    }
    collection_counts = {name: len(records) for name, records in collections_map.items()}
    manifest = build_manifest(out_base, files, collection_counts)
    write_json(out_base / "manifest.json", manifest)

    print("export complete")
    print(f"out: {out_base}")
    print(f"manifest: {out_base / 'manifest.json'}")
    if wiki_manifest.get("documentCount") == 0:
        print("NOTE: wiki_docs is empty; run wiki scraper sync first, or use the separate wiki static exporter.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
