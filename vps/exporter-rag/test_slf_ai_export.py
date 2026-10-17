#!/usr/bin/env python3
"""Regression checks for the dave56 wiki supplement merge in the daily exporter.

The daily exporter owns wiki/index.json, wiki/chunks.json and wiki/docs/**;
without the supplement merged inside slf_ai_export.py it rebuilds them with
97 docs / 665 chunks and wipes any externally merged Dave 5.6 content within
one daily run (see KB JOURNAL 2026-10-17). These tests pin the supplement
load, the fail-open behaviour, the dedup merge and the end-to-end wiki build
(10 docs / 129 chunks with the exact expected chunk char counts,
 produced by the exporter's own deterministic chunker).

Local-only tests (CI does not run exporter tests): no network, filesystem
writes only inside temp directories.
"""
import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import slf_ai_export

REPO_SUPPLEMENT_PATH = Path(__file__).resolve().with_name("dave56_supplement.json")
EXPECTED_SUPPLEMENT_IDS = {238, 241, 243, 244, 245, 246, 249, 252, 254, 255}
EXPECTED_SUPPLEMENT_IDS_TEXT = {str(post_id) for post_id in EXPECTED_SUPPLEMENT_IDS}


def supplement_records():
    return json.loads(REPO_SUPPLEMENT_PATH.read_text(encoding="utf-8"))["records"]


# Total is derived from the supplement's per-record chunk pins, which the
# exporter's own deterministic chunker produced (see data regeneration note).
EXPECTED_TOTAL_CHUNKS = sum(len(r["expectedChunkCharCounts"]) for r in supplement_records())


@lru_cache(maxsize=1)
def supplement_docs_cached():
    return slf_ai_export._load_supplement_docs(REPO_SUPPLEMENT_PATH)


class GetDocTextTests(unittest.TestCase):
    def test_get_doc_text_recognizes_article_text(self):
        # RED on unmodified code: "articleText" was not in the recognized keys.
        doc = {"postId": 238, "articleText": "full article body"}
        self.assertEqual(slf_ai_export.get_doc_text(doc), "full article body")
        # Explicit ordering guard: markdown still wins when both keys exist.
        self.assertEqual(slf_ai_export.get_doc_text({"markdown": "md body", "articleText": "at body"}), "md body")


class LoadSupplementDocsTests(unittest.TestCase):
    def test_load_supplement_docs_valid(self):
        docs = slf_ai_export._load_supplement_docs(REPO_SUPPLEMENT_PATH)
        self.assertEqual(len(docs), 10)
        self.assertEqual({doc["postId"] for doc in docs}, EXPECTED_SUPPLEMENT_IDS)
        for doc in docs:
            self.assertTrue(doc["markdown"].strip())
            # Exactly the key names the exporter getters read.
            self.assertEqual(set(doc.keys()), {"postId", "title", "section", "url", "markdown"})
        # The real file carries section: null on every record; the loader
        # validates key presence, not non-empty values.
        self.assertTrue(all(doc["section"] is None for doc in docs))
        records = {record["postId"]: record for record in supplement_records()}
        for post_id, record in records.items():
            self.assertEqual(len(record["expectedChunkCharCounts"]), record["expectedChunkCount"])
        # The production default resolves next to the module itself.
        self.assertEqual(len(slf_ai_export._load_supplement_docs()), 10)

    def test_load_supplement_docs_fail_open(self):
        cases = {}
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            cases["missing"] = tmp_path / "dave56_supplement_missing.json"
            cases["directory"] = tmp_path
            cases["empty_records"] = tmp_path / "empty_records.json"
            (tmp_path / "empty_records.json").write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v1", "records": []}), encoding="utf-8")
            cases["records_not_list"] = tmp_path / "records_not_list.json"
            (tmp_path / "records_not_list.json").write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v1", "records": {"postId": 1}}), encoding="utf-8")
            cases["record_not_dict"] = tmp_path / "record_not_dict.json"
            (tmp_path / "record_not_dict.json").write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v1", "records": ["nope"]}), encoding="utf-8")
            malformed = tmp_path / "malformed.json"
            malformed.write_text("{not json", encoding="utf-8")
            cases["malformed_json"] = malformed
            wrong_schema = tmp_path / "wrong_schema.json"
            wrong_schema.write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v9", "records": [
                    {"postId": 1, "title": "t", "section": None, "url": "u", "markdown": "m"}]}),
                encoding="utf-8")
            cases["wrong_schema"] = wrong_schema
            missing_markdown = tmp_path / "missing_markdown.json"
            missing_markdown.write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v1", "records": [
                    {"postId": 1, "title": "t", "section": None, "url": "u"}]}),
                encoding="utf-8")
            cases["malformed_record"] = missing_markdown
            empty_markdown = tmp_path / "empty_markdown.json"
            empty_markdown.write_text(
                json.dumps({"schema": "dave56_wiki_supplement_v1", "records": [
                    {"postId": 1, "title": "t", "section": None, "url": "u", "markdown": "   "}]}),
                encoding="utf-8")
            cases["empty_markdown_record"] = empty_markdown
            for name, path in cases.items():
                with self.subTest(case=name):
                    stderr = io.StringIO()
                    with contextlib.redirect_stderr(stderr):
                        docs = slf_ai_export._load_supplement_docs(path)
                    self.assertEqual(docs, [])
                    self.assertIn("WARN", stderr.getvalue())


class MergeSupplementDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.supplement = supplement_docs_cached()
        cls.supp_241 = next(doc for doc in cls.supplement if doc["postId"] == 241)

    def test_merge_supplement_dedup(self):
        stub = {"postId": 241, "text": "stub"}
        unrelated = {"id": "abc", "title": "Other", "text": "other body"}
        fetched = [stub, unrelated]

        merged = slf_ai_export._merge_supplement_docs(fetched, self.supplement)

        merged_ids = [slf_ai_export.get_doc_id(doc) for doc in merged]
        # 241 replaced in place by the supplement record.
        self.assertEqual(merged_ids[0], "241")
        merged_241 = merged[0]
        self.assertEqual(merged_241["markdown"], self.supp_241["markdown"])
        self.assertNotEqual(merged_241.get("text"), "stub")
        # Unrelated fetched record preserved at its position.
        self.assertEqual(merged_ids[1], "abc")
        self.assertIn(unrelated, merged)
        # Supplement-only records appended, numeric postId ascending.
        self.assertEqual(
            merged_ids[2:],
            ["238", "243", "244", "245", "246", "249", "252", "254", "255"],
        )
        self.assertEqual(len(merged_ids), 11)
        # Input list untouched.
        self.assertEqual(fetched[0]["text"], "stub")
        self.assertEqual(len(fetched), 2)

        # Idempotent: merging the merged list again changes nothing.
        merged_twice = slf_ai_export._merge_supplement_docs(merged, self.supplement)
        self.assertEqual([slf_ai_export.get_doc_id(doc) for doc in merged_twice], merged_ids)
        self.assertEqual(len(merged_twice), len(merged))
        merged_twice_241 = next(doc for doc in merged_twice if slf_ai_export.get_doc_id(doc) == "241")
        self.assertEqual(merged_twice_241["markdown"], self.supp_241["markdown"])

    def test_merge_dedup_handles_prefixed_and_float_ids(self):
        # Live API may render the same post under prefixed/float ids; the
        # first digit run normalizes them onto the supplement's postId.
        prefixed = {"id": "wiki_241", "text": "stub"}
        floatish = {"postId": 238.0, "text": "stub"}
        unrelated = {"id": "wiki_2410", "text": "other post"}
        merged = slf_ai_export._merge_supplement_docs([prefixed, floatish, unrelated], self.supplement)
        merged_ids = [slf_ai_export.get_doc_id(doc) for doc in merged]
        # The prefixed stub was matched (digit run '241') and replaced in
        # place by the supplement record, so the merged id is '241'.
        self.assertEqual(merged_ids[0], "241")
        self.assertEqual(merged[0]["markdown"], self.supp_241["markdown"])
        # The replacement carries the supplement record, so the id is '238'.
        self.assertEqual(merged_ids[1], "238")
        self.assertEqual(merged[1]["markdown"], next(d["markdown"] for d in self.supplement if d["postId"] == 238))
        # 'wiki_2410' is a different post (digit run '2410' != '241') and
        # must survive as a separate document.
        self.assertEqual(merged_ids[2], "wiki_2410")
        self.assertEqual(merged[2].get("text"), "other post")
        # 3 fetched positions (2 replaced in place) + 8 supplement-only.
        self.assertEqual(len(merged), 11)


class BuildWikiExportSupplementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Merged supplement-only docs: the same list main() builds when the
        # fetched wiki_docs list has none of the supplement ids.
        cls.merged_docs = slf_ai_export._merge_supplement_docs([], supplement_docs_cached())
        cls.out_base = Path(tempfile.mkdtemp(prefix="slf_wiki_export_supplement_"))
        cls.addClassCleanup(shutil.rmtree, cls.out_base, ignore_errors=True)
        cls.manifest = slf_ai_export.build_wiki_export(list(cls.merged_docs), cls.out_base)
        cls.index = json.loads((cls.out_base / "wiki" / "index.json").read_text(encoding="utf-8"))
        cls.chunks = json.loads((cls.out_base / "wiki" / "chunks.json").read_text(encoding="utf-8"))
        cls.records = {str(record["postId"]): record for record in supplement_records()}

    def test_build_wiki_export_supplement_end_to_end(self):
        self.assertEqual(self.manifest["documentCount"], 10)
        self.assertEqual(self.manifest["chunkCount"], EXPECTED_TOTAL_CHUNKS)
        disk_manifest = json.loads((self.out_base / "wiki" / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(disk_manifest["documentCount"], 10)
        self.assertEqual(disk_manifest["chunkCount"], EXPECTED_TOTAL_CHUNKS)
        self.assertEqual(len(self.index["documents"]), 10)
        self.assertEqual(len(self.chunks["chunks"]), EXPECTED_TOTAL_CHUNKS)

        produced_char_counts = {}
        for chunk in self.chunks["chunks"]:
            self.assertEqual(chunk["charCount"], len(chunk["text"]))
            produced_char_counts.setdefault(chunk["postId"], []).append(chunk["charCount"])
        for post_id, record in self.records.items():
            self.assertEqual(
                produced_char_counts[post_id],
                record["expectedChunkCharCounts"],
                f"chunk charCounts mismatch for postId {post_id}",
            )

        for doc in self.index["documents"]:
            record = self.records[doc["postId"]]
            self.assertEqual(doc["charCount"], len(record["markdown"]))
            doc_file = self.out_base / "wiki" / doc["markdownPath"]
            expected = record["markdown"] if record["markdown"].endswith("\n") else record["markdown"] + "\n"
            self.assertEqual(doc_file.read_text(encoding="utf-8"), expected)

    def test_supplement_ids_not_lost(self):
        index_ids = {doc["postId"] for doc in self.index["documents"]}
        self.assertTrue(
            EXPECTED_SUPPLEMENT_IDS_TEXT.issubset(index_ids),
            f"missing supplement postIds in index: {sorted(EXPECTED_SUPPLEMENT_IDS_TEXT - index_ids)}",
        )


if __name__ == "__main__":
    unittest.main()
