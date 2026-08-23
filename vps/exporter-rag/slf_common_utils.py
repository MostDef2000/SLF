#!/usr/bin/env python3
"""Shared helpers for SLF exporter-rag scripts.

Stage 5 of specs/002-refactoring-program: deduplicates semantically
identical helpers previously copy-defined across slf_preset_evidence_561,
slf_tactical_lab_v1 and slf_ai_export. Behaviour-preserving extraction;
variant implementations with different semantics stay local to their
owners (e.g. slf_ai_export.safe_int, slf_rag_build.write_json).
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Mapping, Sequence


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def get_path(obj: Mapping[str, Any] | None, path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def first_path(obj: Mapping[str, Any], paths: Sequence[str]) -> Any:
    for path in paths:
        value = get_path(obj, path)
        if value not in (None, ""):
            return value
    return None
