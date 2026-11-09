#!/usr/bin/env python3
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(os.environ.get("SLF_AI_OUT", "/var/www/html/slf_ai"))

# ---------------------------------------------------------------------------
# T4 pinned contract constants (issue #405).
#
# These mirror the userscript runtime sources so the exporter's validation
# boundary cannot drift from the runtime loader/registry. The authoritative
# pinned copies live in vps/exporter-rag/test_slf_rag_build.py (PINNED_*
# constants); PinnedLiteralCrossCheckTests re-derives them from the JS files
# and fails visibly on drift.
# ---------------------------------------------------------------------------

# Runtime when-clause vocabulary, pinned from
# src/modules/strategy-data-recommendations/tactical-knowledge-pack.js:31-33
# (checkout ef8ad9e): SUPPORTED_WHEN_KEYS / SCORE_STATES / PRESSURE_LITERAL.
# The runtime loader is fail-closed on exactly this vocabulary; the exporter
# must not emit cases the runtime would reject.
SUPPORTED_WHEN_KEYS = ["score_state", "minute_min", "my_bad_min", "my_bad_max", "pressure"]
SCORE_STATES = ["losing", "winning", "draw"]
PRESSURE_LITERAL = "opponent_advantage_xg_or_xt"

# Preset targets, pinned from src/modules/tactics-presets/active-preset-registry.js:18-23
# (checkout ef8ad9e): ACTIVE_PRESET_NAMES (line 18 — the 13 recommendation
# presets) and LEGACY_PRESET_ALIASES (line 22 — persisted v10 references that
# resolve to canonical presets; they never enter the active library themselves).
LEGACY_PRESET_ALIASES = {
    "Emery_BalancedControl4231_neutr": "Emery_BalancedBase_v11",
    "Mourinho_CompactCounter4411_neutr": "Mourinho_CleanCounter_v11",
    "Pep_BoxControl_bal2": "Guardiola_PressEscape_v11",
    "Arteta_Control433_bal3": "Arteta_SafePossession_v11",
    "Pep_PressCooldown_bal2": "Guardiola_PressCooldown_v11",
    "Pep_ControlledPush_att3": "Guardiola_ControlledPush_v11",
    "Pep_TwoThreeFive_att3": "Guardiola_PositionalSiege_v11",
    "Conte_WingbackWidth_bal4": "Conte_WideChannels_v11",
    "Klopp_Gegenpress_att4": "Klopp_LateGegenpress_v11",
    "Simeone_Compact442_def4": "Simeone_CompactLead_v11",
    "Simeone_LowBlock_def5": "Simeone_EmergencyBlock_v11",
    "Allegri_LeadManagement4141_def1": "Allegri_LeadOutlet_v11",
    "MidBlock_Control4231_neutr": "Emery_BalancedBase_v11",
    "MidBlock_Counter4411_neutr": "Mourinho_CleanCounter_v11",
    "Lead_Outlet4141_def1": "Allegri_LeadOutlet_v11",
}
RECOMMENDATION_PRESETS = [
    "Emery_BalancedBase_v11",
    "Mourinho_CleanCounter_v11",
    "Guardiola_PressEscape_v11",
    "Arteta_SafePossession_v11",
    "Guardiola_PressCooldown_v11",
    "Guardiola_ControlledPush_v11",
    "Guardiola_PositionalSiege_v11",
    "Conte_WideChannels_v11",
    "Klopp_LateGegenpress_v11",
    "Simeone_CompactLead_v11",
    "Simeone_EmergencyBlock_v11",
    "Allegri_LeadOutlet_v11",
    "Flick_LeadPressHold_v12",
]

# Forward-authored claims are context-only (docs/audit/preset-vector-revision-2026-11.md §6)
# and must never be cited as proof in a tactical case.
FORWARD_CLAIM_IDS = {"C264", "C304"}

# Placeholder source strings from the pre-T4 seed cases; never valid citations.
PLACEHOLDER_SOURCES = {"strategy_baseline", "match_evidence_pending"}

# Registered unresolved conflicts touching tactics, pinned from
# docs/audit/preset-vector-revision-2026-11.md §6 ("Registered conflicts
# touching tactics (unresolved)"). tactical_case_conflict_warnings() unions
# these with the corpus conflictsWithSuspected edges (symmetric).
AUDIT_CONFLICT_EDGES = [
    ("C173", "C95"), ("C173", "C125"), ("C173", "C96"), ("C173", "C97"),
    ("C221", "C95"),
    ("C264", "C95"),
    ("C304", "C95"), ("C304", "C96"), ("C304", "C97"), ("C304", "C125"),
    ("C313", "C28"),
    ("C314", "C28"),
    ("C330", "C28"),
    ("C333", "C9"),
    ("C335", "C96"), ("C335", "C95"), ("C335", "C97"), ("C335", "C125"),
    ("C379", "C36"),
]

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
    source_dir = Path(os.environ.get("SLF_FORUM_FAQ_DIR", "/opt/slf/slf-server/forum_faq"))
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

def build_forum_official_claims():
    source_path = Path(__file__).resolve().parent / "forum_official_claims.json"

    try:
        with open(source_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise RuntimeError(f"forum_official_claims: cannot read source file {source_path}: {exc}")

    if not isinstance(data, dict):
        raise RuntimeError("forum_official_claims: top-level value must be a dict")

    if data.get("schema") != "slf_forum_official_claims_v1":
        raise RuntimeError(f"forum_official_claims: unexpected schema {data.get('schema')!r}, expected 'slf_forum_official_claims_v1'")

    claims = data.get("claims")
    if not isinstance(claims, list) or not claims:
        raise RuntimeError("forum_official_claims: 'claims' must be a non-empty list")

    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            raise RuntimeError(f"forum_official_claims: claim at index {index} is not a dict")
        for field in ("id", "author", "permalink", "category"):
            value = claim.get(field)
            if not isinstance(value, str) or not value.strip():
                raise RuntimeError(f"forum_official_claims: claim {claim.get('id') or index} has invalid {field!r}: {value!r}")

    return data

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

    # Coverage limitation (T4): the case vocabulary is the runtime's 5-key
    # when-clause vocabulary (SUPPORTED_WHEN_KEYS above, mirrored from
    # tactical-knowledge-pack.js). Gap topics that cannot be expressed in it —
    # fitness/ПИ-roles, width, cross-type, probabilistic execution, version
    # context — are deliberately deferred: extending the vocabulary is a
    # separate runtime contour (src/**), and manufacturing score/minute
    # conditions for those topics here would fabricate evidence.

    # Seed cases: ids and situations unchanged; presets canonical (v11);
    # sources are real corpus claim ids; notes are hypothesis-framed.
    baseline = [
        {
            "id": "case_losing_after_55_low_bad_press",
            "situation": {
                "score_state": "losing",
                "minute_min": 55,
                "my_bad_max": 16
            },
            "recommended_preset": "Klopp_LateGegenpress_v11",
            "coaching_note": (
                "Гипотеза: при отставании после 55-й и низком браке рассмотреть усиление прессинга. "
                "Для высокого прессинга нужны 1–3 ПИ; при паре CD роль ПИ у CD не работает (C324, C379). "
                "Проверьте физику: разница между низкими и высокими линиями/прессингом достигает 50% (C329). "
                "Если прессинг пройден и соперник имеет +1 в атаке, защитники вынуждены принимать неоптимальные решения (C325). "
                "Порог и выбор пресета — эвристика, не вывод из этих цитат."
            ),
            "confidence": "seed_rule",
            "sources": ["C324", "C379", "C329", "C325"]
        },
        {
            "id": "case_losing_after_55_high_bad_controlled_push",
            "situation": {
                "score_state": "losing",
                "minute_min": 55,
                "my_bad_min": 20
            },
            "recommended_preset": "Guardiola_ControlledPush_v11",
            "coaching_note": (
                "Гипотеза: при отставании после 55-й и высоком браке рассмотреть Controlled Push, "
                "без гарантии улучшения. "
                "Для высокого прессинга нужны 1–3 ПИ; при паре CD роль ПИ у CD не работает (C324, C379). "
                "В очевидных ситуациях игроки действуют по внутренней логике, в пограничных слушаются установок (C344). "
                "Вероятность того, что команда выполнит задуманное, выше у сильной, но не 100% (C237). "
                "Порог и выбор пресета — эвристика, не вывод из этих цитат."
            ),
            "confidence": "seed_rule",
            "sources": ["C324", "C379", "C344", "C237"]
        },
        {
            "id": "case_winning_after_70_under_pressure_compact",
            "situation": {
                "score_state": "winning",
                "minute_min": 70,
                "pressure": "opponent_advantage_xg_or_xt"
            },
            "recommended_preset": "Simeone_CompactLead_v11",
            "coaching_note": (
                "Гипотеза: при позднем преимуществе под давлением рассмотреть Compact Lead. "
                "Это не гарантия удержания счёта: в очевидных ситуациях игроки действуют по внутренней логике, "
                "в пограничных слушаются установок (C344), а вероятность выполнения задуманного даже у "
                "сильной команды не 100% (C237). "
                "Если ваш прессинг пройден и соперник имеет +1 в атаке, защитники вынуждены принимать "
                "неоптимальные решения (C325); само давление соперника не доказывает наличие такого эпизода. "
                "Порог и выбор пресета — эвристика, не вывод из этих цитат."
            ),
            "confidence": "seed_rule",
            "sources": ["C325", "C344", "C237"]
        }
    ]

    cases.extend(baseline)

    return cases

def validate_tactical_cases(tactical_cases, official_claims):
    """Fail-closed validation of the tactical case collection (issue #405 T4).

    Raises RuntimeError("tactical_cases: <case-id-or-index>: <field>: <reason>")
    on the first violation and aborts the whole collection: no filtering, no
    fallback, no silent skip. An empty list is valid (withdrawal mechanism).
    """
    if not isinstance(tactical_cases, list):
        raise RuntimeError(
            f"tactical_cases: expected a list of cases, got {type(tactical_cases).__name__}")

    claims = official_claims.get("claims") if isinstance(official_claims, dict) else None
    if not isinstance(claims, list):
        raise RuntimeError("tactical_cases: official_claims: claims: must be a list")
    corpus_ids = set()
    for claim in claims:
        claim_id = claim.get("id") if isinstance(claim, dict) else None
        if not isinstance(claim_id, str) or not claim_id.strip():
            raise RuntimeError("tactical_cases: official_claims: claims: every claim needs a nonblank string id")
        if claim_id in corpus_ids:
            raise RuntimeError(f"tactical_cases: official_claims: claims: duplicate claim id {claim_id!r}")
        corpus_ids.add(claim_id)

    seen_case_ids = set()
    for index, case in enumerate(tactical_cases):
        if not isinstance(case, dict):
            raise RuntimeError(
                f"tactical_cases: {index}: case: must be a dict, got {type(case).__name__}")

        case_id = case.get("id")
        if isinstance(case_id, str) and case_id.strip():
            label = case_id  # error messages name the case id when it exists
        else:
            label = str(index)

        if not isinstance(case_id, str) or not case_id.strip():
            raise RuntimeError(
                f"tactical_cases: {label}: id: must be a nonblank string, got {case_id!r}")
        if case_id in seen_case_ids:
            raise RuntimeError(f"tactical_cases: {case_id}: id: duplicate case id")
        seen_case_ids.add(case_id)

        situation = case.get("situation")
        if not isinstance(situation, dict) or not situation:
            raise RuntimeError(
                f"tactical_cases: {case_id}: situation: must be a nonempty dict, got {situation!r}")

        unknown_keys = sorted(set(situation) - set(SUPPORTED_WHEN_KEYS), key=str)
        if unknown_keys:
            raise RuntimeError(
                f"tactical_cases: {case_id}: situation: unsupported key(s) {unknown_keys}, "
                f"supported vocabulary: {SUPPORTED_WHEN_KEYS}")

        if "score_state" in situation and situation["score_state"] not in SCORE_STATES:
            raise RuntimeError(
                f"tactical_cases: {case_id}: situation.score_state: must be one of "
                f"{SCORE_STATES}, got {situation['score_state']!r}")

        for field in ("minute_min", "my_bad_min", "my_bad_max"):
            if field not in situation:
                continue
            value = situation[field]
            # bool is a subclass of int — reject it explicitly before the
            # isinstance check, then require a finite number (no NaN/±inf).
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise RuntimeError(
                    f"tactical_cases: {case_id}: situation.{field}: must be a finite number "
                    f"(bool rejected), got {value!r}")
            if not math.isfinite(value):
                raise RuntimeError(
                    f"tactical_cases: {case_id}: situation.{field}: must be finite, got {value!r}")

        if "my_bad_min" in situation and "my_bad_max" in situation \
                and situation["my_bad_min"] > situation["my_bad_max"]:
            raise RuntimeError(
                f"tactical_cases: {case_id}: situation.my_bad_min: must not exceed my_bad_max "
                f"({situation['my_bad_min']!r} > {situation['my_bad_max']!r})")

        if "pressure" in situation and situation["pressure"] != PRESSURE_LITERAL:
            raise RuntimeError(
                f"tactical_cases: {case_id}: situation.pressure: must equal "
                f"{PRESSURE_LITERAL!r}, got {situation['pressure']!r}")

        preset = case.get("recommended_preset")
        if not isinstance(preset, str) or not preset.strip():
            raise RuntimeError(
                f"tactical_cases: {case_id}: recommended_preset: must be a nonblank string, got {preset!r}")
        resolved_preset = LEGACY_PRESET_ALIASES.get(preset, preset)
        if resolved_preset not in RECOMMENDATION_PRESETS:
            raise RuntimeError(
                f"tactical_cases: {case_id}: recommended_preset: {preset!r} does not resolve to "
                f"one of the pinned recommendation presets {RECOMMENDATION_PRESETS}")

        note = case.get("coaching_note")
        if not isinstance(note, str) or not note.strip():
            raise RuntimeError(
                f"tactical_cases: {case_id}: coaching_note: must be a nonblank string, got {note!r}")

        confidence = case.get("confidence")
        if confidence != "seed_rule":
            raise RuntimeError(
                f"tactical_cases: {case_id}: confidence: must be exactly 'seed_rule', got {confidence!r}")

        sources = case.get("sources")
        if not isinstance(sources, list) or not sources:
            raise RuntimeError(
                f"tactical_cases: {case_id}: sources: must be a nonempty list, got {sources!r}")
        seen_sources = set()
        for source in sources:
            if not isinstance(source, str) or not source.strip():
                raise RuntimeError(
                    f"tactical_cases: {case_id}: sources: every source must be a nonblank string, "
                    f"got {source!r}")
            if source in seen_sources:
                raise RuntimeError(
                    f"tactical_cases: {case_id}: sources: duplicate source {source!r}")
            seen_sources.add(source)
            if source in PLACEHOLDER_SOURCES:
                raise RuntimeError(
                    f"tactical_cases: {case_id}: sources: placeholder {source!r} is not a citation")
            if source in FORWARD_CLAIM_IDS:
                raise RuntimeError(
                    f"tactical_cases: {case_id}: sources: forward claim {source!r} is context-only "
                    f"and cannot be cited as proof")
            if source not in corpus_ids:
                raise RuntimeError(
                    f"tactical_cases: {case_id}: sources: unknown claim id {source!r} "
                    f"(not in the official claims corpus)")


def tactical_case_conflict_warnings(tactical_cases, official_claims):
    """Deterministic, sorted, deduplicated conflict warnings for the cases.

    Conflict edges are the union of the pinned audit edge list
    (docs/audit/preset-vector-revision-2026-11.md §6, AUDIT_CONFLICT_EDGES)
    and the corpus conflictsWithSuspected edges, treated as symmetric: citing
    either endpoint reports the pair. Warnings are advisory — the build still
    succeeds — and are never written into the pack.
    """
    edges = set()
    for left, right in AUDIT_CONFLICT_EDGES:
        edges.add((min(left, right), max(left, right)))

    claims = official_claims.get("claims", []) if isinstance(official_claims, dict) else []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        claim_id = claim.get("id")
        if not isinstance(claim_id, str):
            continue
        for other in claim.get("conflictsWithSuspected") or []:
            if not isinstance(other, str) or other == claim_id:
                continue
            edges.add((min(claim_id, other), max(claim_id, other)))

    warnings = set()
    cases = tactical_cases if isinstance(tactical_cases, list) else []
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            continue
        case_id = case.get("id")
        label = case_id if isinstance(case_id, str) and case_id.strip() else str(index)
        for source in case.get("sources") or []:
            if not isinstance(source, str):
                continue
            for left, right in edges:
                if source == left:
                    warnings.add(
                        f"tactical_case_conflict: {label}: source {left} conflicts with {right}")
                elif source == right:
                    warnings.add(
                        f"tactical_case_conflict: {label}: source {right} conflicts with {left}")
    return sorted(warnings)


def build_knowledge_pack(tactical_cases, official_claims=None):
    if official_claims is None:
        official_claims = build_forum_official_claims()

    # Validation boundary: abort before anything is projected or written.
    validate_tactical_cases(tactical_cases, official_claims)

    rules = []
    for case in tactical_cases:
        rules.append({
            "id": case["id"],
            "when": case["situation"],
            "recommendation": {
                "preset": case["recommended_preset"],
                "reason": case["coaching_note"]
            },
            "confidence": case["confidence"],
            # Copied in order so later mutation of the input cannot
            # retroactively change the produced pack.
            "sources": list(case["sources"])
        })

    return {
        "schema": "slf_tactical_knowledge_pack_v1",
        "version": now_iso(),
        "source": "slf_ai_rag_export",
        "rules": rules
    }

def build_search_index(rule_extracts, forum_notes, match_evidence, tactical_cases, official_claims):
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
                "tactical_case": "rag/tactical_cases.jsonl",
                "forum_official_claim": "rag/forum_official_claims.json"
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
    for item in official_claims.get("claims", []):
        add("forum_official_claim", {**item, "title": f"Official claim {item.get('id')}: {item.get('topic', '')}"}, ["topic", "claim", "quote"])

    return rows

def main():
    rag_dir = OUT / "rag"
    tactics_dir = OUT / "tactics"

    rule_extracts = build_rule_extracts()
    forum_notes = build_forum_notes()
    official_claims = build_forum_official_claims()
    match_evidence = build_match_evidence()
    tactical_cases = build_tactical_cases(match_evidence)
    # Validation boundary: build_knowledge_pack validates the tactical cases
    # against the corpus and aborts (RuntimeError) BEFORE anything is written.
    knowledge_pack = build_knowledge_pack(tactical_cases, official_claims)
    conflict_warnings = tactical_case_conflict_warnings(tactical_cases, official_claims)
    search_index = build_search_index(rule_extracts, forum_notes, match_evidence, tactical_cases, official_claims)

    write_json(rag_dir / "forum_official_claims.json", official_claims)
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

    manifest_path = OUT / "manifest.json"
    manifest = read_json(manifest_path, {})
    if isinstance(manifest, dict):
        files = manifest.setdefault("files", {})
        raw = (rag_dir / "forum_official_claims.json").read_bytes()
        files["forumOfficialClaims"] = {
            "path": "rag/forum_official_claims.json",
            "exists": True,
            "sizeBytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest()
        }
        write_json(manifest_path, manifest)

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
                "id": "forum_official_claims",
                "type": "official_claims",
                "authority": "official_claim",
                "path": "rag/forum_official_claims.json",
                "count": len(official_claims["claims"])
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
6. `rag/forum_official_claims.json`
7. `rag/match_evidence.jsonl`
8. `wiki/chunks.json`
9. `data/preset_effects_summary.json`

Runtime userscript should read only:

- `tactics/knowledge-pack.latest.json`

Notes:

- `rule_extracts` are derived from wiki chunks.
- `forum_notes` placeholder until forum_faq export is connected.
- `forum_official_claims` are account-reported claims from official forum posts (Dave = developer, Eywa = admin). They are priors, NOT engine laws, and are kept separate from derived heuristics.
- `tactical_cases` currently contain seed rules and will later be enriched from observed match evidence.

Tactical knowledge pack coverage:

- Пак тактических знаний покрывает только ситуации, выразимые в runtime-словаре условий из 5 ключей (score_state, minute_min, my_bad_min, my_bad_max, pressure).
- Тематические пробелы аудита 2026 — физика/роли ПИ, ширина, тип кроссов, вероятностное выполнение, контекст версий (audit §3) — не выражаются в текущем словаре условий и в пак не попадают.
- Расширение словаря — отдельный runtime-контур (src/**); придумывать score/minute-условия для этих тем значило бы фабриковать доказательства.
"""
    write_text(OUT / "ai_context.md", ai_context)

    # Conflict reporting is a warning, not a veto: the build already succeeded.
    for warning in conflict_warnings:
        print(warning, file=sys.stderr)

    print(json.dumps({
        "ok": True,
        "out": str(OUT),
        "rule_extracts": len(rule_extracts),
        "forum_notes": len(forum_notes),
        "forum_official_claims": len(official_claims["claims"]),
        "match_evidence": len(match_evidence),
        "tactical_cases": len(tactical_cases),
        "search_index": len(search_index),
        "knowledge_pack_rules": len(knowledge_pack["rules"])
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
