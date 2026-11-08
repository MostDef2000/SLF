#!/usr/bin/env python3
"""Regression checks for the forum official claims feature in slf_rag_build.py.

The exporter copies the repo's forum_official_claims.json (schema
slf_forum_official_claims_v1) into the RAG output, registers it in the
export manifest, the catalog and the ai_context read order, and fails
closed (RuntimeError) on any malformed source. These tests pin:

- end-to-end main(): the written file equals the repo source, the catalog
  gains the official_claim source entry right after forum_notes,
  ai_context.md lists it in the read order with the priors-not-engine-laws
  note, and the manifest gains a forumOfficialClaims entry whose size and
  sha256 match the written file;
- fail-closed validation of broken source files (loaded from a temp-dir
  copy of the module so repo files are never touched);
- the real repo file passing validation with claims C1..C169.

Local-only tests: no network, filesystem writes only inside temp
directories. slf_rag_build captures SLF_AI_OUT at import time, so the
module is (re)imported with the env var pointed at a per-test temp dir.
"""
import contextlib
import hashlib
import importlib
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

MODULE_PATH = HERE / "slf_rag_build.py"
REPO_CLAIMS_PATH = HERE / "forum_official_claims.json"
EXPECTED_SCHEMA = "slf_forum_official_claims_v1"
EXPECTED_CLAIM_IDS = [f"C{i}" for i in range(1, 170)]


def _valid_claim(**overrides):
    claim = {
        "id": "C1",
        "category": "mechanics",
        "author": "Eywa",
        "permalink": "https://slf.fm/forum/view_post.php?m=1",
    }
    claim.update(overrides)
    return claim


def _import_rag_build(out_dir):
    """(Re)import slf_rag_build with SLF_AI_OUT pointed at out_dir.

    OUT is captured at import time, so the env var must be set before the
    module (re)executes; the previous env value is restored afterwards.
    """
    previous = os.environ.get("SLF_AI_OUT")
    os.environ["SLF_AI_OUT"] = str(out_dir)
    try:
        if "slf_rag_build" in sys.modules:
            return importlib.reload(sys.modules["slf_rag_build"])
        import slf_rag_build
        return slf_rag_build
    finally:
        if previous is None:
            os.environ.pop("SLF_AI_OUT", None)
        else:
            os.environ["SLF_AI_OUT"] = previous


def _load_module_copy(case_dir, module_name, payload=None, raw=None):
    """Load a copy of slf_rag_build.py from case_dir so its
    forum_official_claims.json source resolves next to the copy."""
    target = case_dir / "slf_rag_build.py"
    shutil.copyfile(MODULE_PATH, target)
    if raw is not None:
        (case_dir / "forum_official_claims.json").write_text(raw, encoding="utf-8")
    elif payload is not None:
        (case_dir / "forum_official_claims.json").write_text(json.dumps(payload), encoding="utf-8")
    spec = importlib.util.spec_from_file_location(module_name, target)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RagBuildMainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)
        self.rag_build = _import_rag_build(self.out)

    def _run_main(self):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.rag_build.main()
        return json.loads(buffer.getvalue())

    def test_main_writes_claims_file_matching_repo_source(self):
        self._run_main()
        written = self.out / "rag" / "forum_official_claims.json"
        self.assertTrue(written.is_file())
        self.assertEqual(
            json.loads(written.read_text(encoding="utf-8")),
            json.loads(REPO_CLAIMS_PATH.read_text(encoding="utf-8")),
        )

    def test_main_catalog_entry_after_forum_notes(self):
        self._run_main()
        catalog = json.loads((self.out / "rag" / "catalog.json").read_text(encoding="utf-8"))
        sources = catalog["sources"]
        by_id = {source["id"]: source for source in sources}
        entry = by_id["forum_official_claims"]
        self.assertEqual(entry["type"], "official_claims")
        self.assertEqual(entry["authority"], "official_claim")
        self.assertEqual(entry["path"], "rag/forum_official_claims.json")
        self.assertEqual(entry["count"], 169)
        self.assertEqual(sources.index(entry), sources.index(by_id["forum_notes"]) + 1)

    def test_main_ai_context_read_order_and_priors_note(self):
        self._run_main()
        context = (self.out / "ai_context.md").read_text(encoding="utf-8")
        self.assertIn("6. `rag/forum_official_claims.json`", context)
        self.assertIn("priors, NOT engine laws", context)

    def test_main_manifest_entry_matches_written_file(self):
        (self.out / "manifest.json").write_text(
            json.dumps({"schema": "slf_ai_manifest_v1", "files": {}}), encoding="utf-8")
        self._run_main()
        written = self.out / "rag" / "forum_official_claims.json"
        manifest = json.loads((self.out / "manifest.json").read_text(encoding="utf-8"))
        entry = manifest["files"]["forumOfficialClaims"]
        raw = written.read_bytes()
        self.assertEqual(entry["path"], "rag/forum_official_claims.json")
        self.assertIs(entry["exists"], True)
        self.assertEqual(entry["sizeBytes"], len(raw))
        self.assertEqual(entry["sha256"], hashlib.sha256(raw).hexdigest())

    def test_main_creates_manifest_when_absent(self):
        self.assertFalse((self.out / "manifest.json").exists())
        self._run_main()
        manifest = json.loads((self.out / "manifest.json").read_text(encoding="utf-8"))
        self.assertIn("forumOfficialClaims", manifest["files"])

    def test_main_summary_reports_claims_count(self):
        summary = self._run_main()
        self.assertIs(summary["ok"], True)
        self.assertEqual(summary["forum_official_claims"], 169)

    def test_search_index_includes_official_claims(self):
        self._run_main()
        index = json.loads((self.out / "rag" / "search_index.json").read_text(encoding="utf-8"))
        claim_rows = [item for item in index["items"] if item["type"] == "forum_official_claim"]
        self.assertEqual(len(claim_rows), 169)
        self.assertEqual([row["id"] for row in claim_rows], EXPECTED_CLAIM_IDS)
        for row in claim_rows:
            self.assertEqual(row["path"], "rag/forum_official_claims.json")
            self.assertTrue(row["title"].startswith("Official claim "))
            self.assertIn(row["topic"], row["title"])
            self.assertTrue(row["text"].strip())
        # One known substring from the repo claims file: a distinctive
        # fragment of C1's claim field (not present in its quote).
        c1_row = next(row for row in claim_rows if row["id"] == "C1")
        self.assertIn("с перечитыванием состава, тактики, физики, морали и ролей", c1_row["text"])

    def test_search_index_keeps_existing_kinds(self):
        # Seed the optional sources so every index kind has at least one
        # row: wiki chunks (rule_extract) and a forum FAQ dir (forum_note).
        wiki_dir = self.out / "wiki"
        wiki_dir.mkdir(parents=True)
        (wiki_dir / "chunks.json").write_text(
            json.dumps([{"title": "Тестовое правило", "text": "Тактика: прессинг после потери мяча."}]),
            encoding="utf-8",
        )
        faq_dir = self.out / "forum_faq_source"
        faq_dir.mkdir()
        (faq_dir / "index.json").write_text(
            json.dumps({"documents": [{"id": "faq1", "title": "Тестовый FAQ", "file": "faq1.md"}]}),
            encoding="utf-8",
        )
        (faq_dir / "faq1.md").write_text("Тестовый форумный FAQ про тактику.", encoding="utf-8")
        previous = os.environ.get("SLF_FORUM_FAQ_DIR")
        os.environ["SLF_FORUM_FAQ_DIR"] = str(faq_dir)
        try:
            self._run_main()
        finally:
            if previous is None:
                os.environ.pop("SLF_FORUM_FAQ_DIR", None)
            else:
                os.environ["SLF_FORUM_FAQ_DIR"] = previous
        index = json.loads((self.out / "rag" / "search_index.json").read_text(encoding="utf-8"))
        kinds = {item["type"] for item in index["items"]}
        for kind in ("rule_extract", "forum_note", "match_evidence", "tactical_case", "forum_official_claim"):
            self.assertIn(kind, kinds)


class ForumOfficialClaimsValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.tmp_path = Path(self.tmp.name)

    def test_broken_sources_fail_closed(self):
        cases = [
            ("missing_file", None, None),
            ("malformed_json", None, "{not json"),
            ("top_level_not_dict", None, "[1, 2, 3]"),
            ("wrong_schema", {"schema": "slf_forum_official_claims_v9", "claims": [_valid_claim()]}, None),
            ("empty_claims", {"schema": EXPECTED_SCHEMA, "claims": []}, None),
            ("claims_not_list", {"schema": EXPECTED_SCHEMA, "claims": {}}, None),
            ("claim_not_dict", {"schema": EXPECTED_SCHEMA, "claims": ["nope"]}, None),
            ("claim_empty_author", {"schema": EXPECTED_SCHEMA, "claims": [_valid_claim(author="   ")]}, None),
            ("claim_missing_permalink", {"schema": EXPECTED_SCHEMA, "claims": [{k: v for k, v in _valid_claim().items() if k != "permalink"}]}, None),
            ("claim_missing_id", {"schema": EXPECTED_SCHEMA, "claims": [{k: v for k, v in _valid_claim().items() if k != "id"}]}, None),
            ("claim_blank_category", {"schema": EXPECTED_SCHEMA, "claims": [_valid_claim(category="")]}, None),
        ]
        for name, payload, raw in cases:
            with self.subTest(case=name):
                case_dir = self.tmp_path / name
                case_dir.mkdir()
                module = _load_module_copy(case_dir, f"slf_rag_build_{name}", payload=payload, raw=raw)
                with self.assertRaises(RuntimeError):
                    module.build_forum_official_claims()

    def test_valid_source_returns_parsed_dict(self):
        # Positive control: the same temp-dir-copy harness accepts a valid
        # source and returns the parsed dict unchanged.
        case_dir = self.tmp_path / "valid"
        case_dir.mkdir()
        payload = {"schema": EXPECTED_SCHEMA, "claims": [_valid_claim()]}
        module = _load_module_copy(case_dir, "slf_rag_build_valid", payload=payload)
        self.assertEqual(module.build_forum_official_claims(), payload)

    def test_claims_field_non_string_rejected(self):
        # Coverage pin for the isinstance branch: a non-string value in a
        # validated field (id here) must fail closed, not just a missing one.
        data = json.loads(REPO_CLAIMS_PATH.read_text(encoding="utf-8"))
        data["claims"][0]["id"] = 123
        case_dir = self.tmp_path / "non_string_id"
        case_dir.mkdir()
        module = _load_module_copy(case_dir, "slf_rag_build_non_string_id", payload=data)
        with self.assertRaises(RuntimeError) as ctx:
            module.build_forum_official_claims()
        self.assertIn("invalid", str(ctx.exception))


class RealRepoClaimsSanityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.rag_build = _import_rag_build(Path(self.tmp.name))

    def test_repo_file_passes_validation(self):
        data = self.rag_build.build_forum_official_claims()
        self.assertEqual(data["schema"], EXPECTED_SCHEMA)
        self.assertEqual([claim["id"] for claim in data["claims"]], EXPECTED_CLAIM_IDS)
        for claim in data["claims"]:
            for field in ("id", "author", "permalink", "category"):
                self.assertIsInstance(claim[field], str)
                self.assertTrue(claim[field].strip())


if __name__ == "__main__":
    unittest.main()
