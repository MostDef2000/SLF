#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(os.environ.get("SLF_AI_OUT", "/var/www/html/slf_ai"))

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def read_json(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)

def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    tmp.replace(path)

def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    tmp.replace(path)

def safe_id(value):
    value = str(value or "").lower()
    value = re.sub(r"[^a-z0-9а-яё]+", "_", value, flags=re.I)
    return value.strip("_")[:120] or "item"

def extract_items_from_summary(summary):
    if isinstance(summary, list):
        return summary
    if isinstance(summary, dict):
        for key in ("items", "rows", "data", "results", "records"):
            if isinstance(summary.get(key), list):
                return summary[key]
    return []

def build_rule_extracts():
    chunks = read_json(OUT / "wiki" / "chunks.json", [])
    rows = []

    if isinstance(chunks, dict):
        chunks = chunks.get("chunks") or chunks.get("items") or []

    keywords = [
        "тактик", "прессинг", "скилл", "сила", "форма", "устал",
        "сыгран", "пас", "контратак", "xg", "момент", "генератор",
        "оборона", "атака", "фланг", "центр"
    ]

    for i, chunk in enumerate(chunks if isinstance(chunks, list) else []):
        text = str(chunk.get("text") or chunk.get("content") or "").strip()
        title = str(chunk.get("title") or chunk.get("source_title") or chunk.get("doc_title") or "").strip()
        haystack = f"{title} {text}".lower()

        if not text or not any(k in haystack for k in keywords):
            continue

        rows.append({
            "id": f"wiki_rule_{i+1:05d}",
            "schema": "slf_rule_extract_v1",
            "authority": "hard_or_doc_rule",
            "source": "wiki_chunks",
            "title": title,
            "topic": infer_topic(haystack),
            "text": text[:1800],
            "use_for": infer_use_for(haystack),
        })

    return rows[:500]

def infer_topic(text):
    if "пресс" in text:
        return "pressing"
    if "скилл" in text or "сила" in text:
        return "skills_strength"
    if "устал" in text or "форма" in text:
        return "fatigue_form"
    if "пас" in text or "брак" in text:
        return "passing_bad_actions"
    if "контратак" in text:
        return "counter_attack"
    if "фланг" in text:
        return "wide_play"
    if "xg" in text:
        return "xg_chances"
    if "тактик" in text:
        return "tactics"
    return "general"

def infer_use_for(text):
    use = []
    if "пресс" in text:
        use.append("pressing")
    if "скилл" in text or "сила" in text:
        use.append("strength_context")
    if "устал" in text or "форма" in text:
        use.append("fatigue")
    if "пас" in text or "брак" in text:
        use.append("bad_actions")
    if "контратак" in text:
        use.append("counter_attack")
    if "фланг" in text or "центр" in text:
        use.append("attack_direction")
    if "xg" in text:
        use.append("xg_reasoning")
    return use or ["tactical_reasoning"]

def build_forum_notes():
    source_dir = Path(os.environ.get("SLF_FORUM_FAQ_DIR", "/root/slf-server/forum_faq"))
    index_path = source_dir / "index.json"

    forum_dir = OUT / "forum_faq"
    docs_dir = forum_dir / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    index_data = read_json(index_path, {})
    documents = index_data.get("documents", []) if isinstance(index_data, dict) else []

    rows = []
    public_documents = []

    for i, doc in enumerate(documents if isinstance(documents, list) else []):
        if not isinstance(doc, dict):
            continue

        rel_file = str(doc.get("file") or "").strip()
        if not rel_file:
            continue

        normalized = os.path.normpath(rel_file)
        if normalized.startswith("..") or os.path.isabs(normalized):
            continue

        full_path = source_dir / normalized
        if not full_path.exists() or not full_path.is_file():
            continue

        try:
            markdown = full_path.read_text(encoding="utf-8").strip()
        except Exception:
            continue

        if not markdown:
            continue

        title = str(doc.get("title") or doc.get("name") or full_path.stem).strip()
        doc_id = str(doc.get("id") or rel_file or title or f"forum_{i+1}")
        row_id = "forum_" + safe_id(doc_id)

        rel_doc_path = f"docs/{row_id}.md"
        write_text(forum_dir / rel_doc_path, markdown)

        haystack = f"{title} {markdown}".lower()
        topic = infer_topic(haystack)

        public_documents.append({
            "id": row_id,
            "title": title,
            "source_file": rel_file,
            "path": f"forum_faq/{rel_doc_path}",
            "topic": topic,
            "chars": len(markdown)
        })

        rows.append({
            "id": row_id,
            "schema": "slf_forum_note_v1",
            "authority": "soft_heuristic",
            "source": "forum_faq",
            "source_file": rel_file,
            "title": title,
            "topic": topic,
            "text": markdown[:2200],
            "use_for": infer_use_for(haystack),
            "path": f"forum_faq/{rel_doc_path}"
        })

    write_json(forum_dir / "index.json", {
        "schema": "slf_forum_faq_export_v1",
        "source": index_data.get("source", "forum_faq") if isinstance(index_data, dict) else "forum_faq",
        "updatedAt": index_data.get("updated_at") if isinstance(index_data, dict) else None,
        "generatedAt": now_iso(),
        "count": len(public_documents),
        "documents": public_documents
    })

    return rows

def build_match_evidence():
    rows = []

    for filename, source_type in [
        ("preset_effects_summary.json", "preset_effects"),
        ("preset_events_summary.json", "preset_events"),
        ("match_data_summary.json", "match_data"),
    ]:
        data = read_json(OUT / "data" / filename, {})
        items = extract_items_from_summary(data)

        if not items and isinstance(data, dict):
            rows.append({
                "id": safe_id(filename),
                "schema": "slf_match_evidence_v1",
                "source": source_type,
                "summary_file": f"data/{filename}",
                "summary_keys": sorted(list(data.keys()))[:50],
                "note": "Summary file exists; detailed extraction will be added after schema inspection."
            })
            continue

        for i, item in enumerate(items[:1000]):
            rows.append({
                "id": f"{source_type}_{i+1:05d}",
                "schema": "slf_match_evidence_v1",
                "source": source_type,
                "raw": item
            })

    return rows

def build_tactical_cases(match_evidence):
    cases = []

    # Baseline cases пока простые. Они нужны, чтобы userscript/AI уже видели структуру.
    baseline = [
        {
            "id": "case_losing_after_55_low_bad_press",
            "situation": {
                "score_state": "losing",
                "minute_min": 55,
                "my_bad_max": 16
            },
            "recommended_preset": "Klopp_Gegenpress_att4",
            "coaching_note": "Проигрываем после 55-й и брак низкий — можно аккуратно поднять давление.",
            "confidence": "seed_rule",
            "sources": ["strategy_baseline", "match_evidence_pending"]
        },
        {
            "id": "case_losing_after_55_high_bad_controlled_push",
            "situation": {
                "score_state": "losing",
                "minute_min": 55,
                "my_bad_min": 20
            },
            "recommended_preset": "Pep_ControlledPush_att3",
            "coaching_note": "Проигрываем, но брак высокий — усиливать атаку контролируемо, без хаоса.",
            "confidence": "seed_rule",
            "sources": ["strategy_baseline", "match_evidence_pending"]
        },
        {
            "id": "case_winning_after_70_under_pressure_compact",
            "situation": {
                "score_state": "winning",
                "minute_min": 70,
                "pressure": "opponent_advantage_xg_or_xt"
            },
            "recommended_preset": "Simeone_Compact442_def4",
            "coaching_note": "Ведём поздно, соперник давит — компактнее закрыть переходы.",
            "confidence": "seed_rule",
            "sources": ["strategy_baseline", "match_evidence_pending"]
        }
    ]

    cases.extend(baseline)

    return cases

def build_knowledge_pack(tactical_cases):
    rules = []
    for case in tactical_cases:
        rules.append({
            "id": case["id"],
            "when": case.get("situation", {}),
            "recommendation": {
                "preset": case.get("recommended_preset"),
                "reason": case.get("coaching_note")
            },
            "confidence": case.get("confidence", "unknown")
        })

    return {
        "schema": "slf_tactical_knowledge_pack_v1",
        "version": now_iso(),
        "source": "slf_ai_rag_export",
        "rules": rules
    }

def build_search_index(rule_extracts, forum_notes, match_evidence, tactical_cases):
    rows = []

    def add(kind, item, text_fields):
        text = " ".join(str(item.get(f, "")) for f in text_fields)
        rows.append({
            "id": item.get("id") or safe_id(text),
            "type": kind,
            "title": item.get("title") or item.get("id") or kind,
            "topic": item.get("topic", ""),
            "text": text[:1200],
            "path": {
                "rule_extract": "rag/rule_extracts.jsonl",
                "forum_note": "rag/forum_notes.jsonl",
                "match_evidence": "rag/match_evidence.jsonl",
                "tactical_case": "rag/tactical_cases.jsonl"
            }.get(kind)
        })

    for item in rule_extracts:
        add("rule_extract", item, ["title", "topic", "text"])
    for item in forum_notes:
        add("forum_note", item, ["title", "topic", "text"])
    for item in match_evidence[:500]:
        add("match_evidence", item, ["source", "note"])
    for item in tactical_cases:
        add("tactical_case", item, ["id", "coaching_note", "recommended_preset"])

    return rows

def main():
    rag_dir = OUT / "rag"
    tactics_dir = OUT / "tactics"

    rule_extracts = build_rule_extracts()
    forum_notes = build_forum_notes()
    match_evidence = build_match_evidence()
    tactical_cases = build_tactical_cases(match_evidence)
    knowledge_pack = build_knowledge_pack(tactical_cases)
    search_index = build_search_index(rule_extracts, forum_notes, match_evidence, tactical_cases)

    write_jsonl(rag_dir / "rule_extracts.jsonl", rule_extracts)
    write_jsonl(rag_dir / "forum_notes.jsonl", forum_notes)
    write_jsonl(rag_dir / "match_evidence.jsonl", match_evidence)
    write_jsonl(rag_dir / "tactical_cases.jsonl", tactical_cases)
    write_json(rag_dir / "search_index.json", {
        "schema": "slf_rag_search_index_v1",
        "updatedAt": now_iso(),
        "count": len(search_index),
        "items": search_index
    })
    write_json(tactics_dir / "knowledge-pack.latest.json", knowledge_pack)

    catalog = {
        "schema": "slf_rag_catalog_v1",
        "updatedAt": now_iso(),
        "base": "/slf_ai",
        "sources": [
            {
                "id": "wiki_chunks",
                "type": "rules_and_docs",
                "authority": "hard_or_doc_rule",
                "path": "wiki/chunks.json"
            },
            {
                "id": "rule_extracts",
                "type": "derived_rules",
                "authority": "hard_or_doc_rule",
                "path": "rag/rule_extracts.jsonl",
                "count": len(rule_extracts)
            },
            {
                "id": "forum_notes",
                "type": "forum_experience",
                "authority": "soft_heuristic",
                "path": "rag/forum_notes.jsonl",
                "count": len(forum_notes)
            },
            {
                "id": "match_evidence",
                "type": "match_evidence",
                "authority": "observed_data",
                "path": "rag/match_evidence.jsonl",
                "count": len(match_evidence)
            },
            {
                "id": "tactical_cases",
                "type": "derived_tactical_cases",
                "authority": "mixed",
                "path": "rag/tactical_cases.jsonl",
                "count": len(tactical_cases)
            },
            {
                "id": "runtime_knowledge_pack",
                "type": "userscript_runtime_pack",
                "authority": "sanitized_runtime",
                "path": "tactics/knowledge-pack.latest.json",
                "count": len(knowledge_pack["rules"])
            }
        ]
    }

    write_json(rag_dir / "catalog.json", catalog)

    ai_context = f"""# SLF AI RAG Current Export

Updated: {now_iso()}

Read order for ChatGPT / Strategy Agent:

1. `rag/catalog.json`
2. `rag/search_index.json`
3. `rag/tactical_cases.jsonl`
4. `rag/rule_extracts.jsonl`
5. `rag/forum_notes.jsonl`
6. `rag/match_evidence.jsonl`
7. `wiki/chunks.json`
8. `data/preset_effects_summary.json`

Runtime userscript should read only:

- `tactics/knowledge-pack.latest.json`

Notes:

- `rule_extracts` are derived from wiki chunks.
- `forum_notes` placeholder until forum_faq export is connected.
- `tactical_cases` currently contain seed rules and will later be enriched from observed match evidence.
"""
    write_text(OUT / "ai_context.md", ai_context)

    print(json.dumps({
        "ok": True,
        "out": str(OUT),
        "rule_extracts": len(rule_extracts),
        "forum_notes": len(forum_notes),
        "match_evidence": len(match_evidence),
        "tactical_cases": len(tactical_cases),
        "search_index": len(search_index),
        "knowledge_pack_rules": len(knowledge_pack["rules"])
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
