#!/usr/bin/env python3
"""Focused, no-VPS contract tests for issue #327 permanent invalid-result cleanup."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().with_name("purge_invalid_match_results.py")
SPEC = importlib.util.spec_from_file_location("purge_invalid_match_results", MODULE_PATH)
assert SPEC and SPEC.loader
purge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(purge)
inspect = purge.inspect
delete_if_exact = purge.delete_if_exact
valid_score = purge.valid_score


def row(game, score):
    return {'gameId': game, 'recordType': 'match_result', 'resultType': 'finished_match', 'score': score, 'extra': {'stable': True}}


class InvalidResultPurgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'match_results_v2.json'
        self.rows = [row('a', {'home': 1, 'away': 2}), row('a', None), row('b', {'home': 1.0, 'away': 2}), row('c', {'home': 0, 'away': 0}), row('d', {'home': True, 'away': 0})]
        self.path.write_text(json.dumps(self.rows, ensure_ascii=False), encoding='utf-8')

    def test_strict_qr010_score_contract(self):
        self.assertTrue(valid_score({'home': 0, 'away': 99}))
        for score in (None, '0:0', {'home': 0.0, 'away': 1}, {'home': True, 'away': 0}, {'home': 100, 'away': 0}):
            self.assertFalse(valid_score(score))

    def test_preview_reports_fingerprints_without_writing(self):
        original = self.path.read_bytes()
        plan, valid, invalid = inspect(self.path)
        self.assertEqual((plan['totalRows'], len(valid), len(invalid)), (5, 2, 3))
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(plan['sourceSha256'], hashlib.sha256(original).hexdigest())

    def test_count_and_source_hash_mismatch_are_non_destructive(self):
        plan, _, _ = inspect(self.path)
        original = self.path.read_bytes()
        with self.assertRaisesRegex(RuntimeError, 'count drift'):
            delete_if_exact(self.path, 4, plan['sourceSha256'])
        with self.assertRaisesRegex(RuntimeError, 'Source bytes changed'):
            delete_if_exact(self.path, 3, '0' * 64)
        self.assertEqual(self.path.read_bytes(), original)

    def test_delete_only_invalid_and_preserve_survivors(self):
        before, survivors, invalid = inspect(self.path)
        result = delete_if_exact(self.path, 3, before['sourceSha256'])
        after, kept, removed = inspect(self.path)
        self.assertEqual(result['deletedRows'], 3)
        self.assertEqual(len(invalid), 3)
        self.assertEqual(removed, [])
        self.assertEqual(kept, survivors)
        self.assertEqual(after['survivorDigestSha256'], before['survivorDigestSha256'])
        self.assertEqual(result['backupCreated'], False)
        self.assertEqual(result['archiveCreated'], False)

    def test_malformed_collection_and_schema_fail_closed(self):
        self.path.write_text('{}', encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'malformed'):
            inspect(self.path)
        self.path.write_text(json.dumps([{'score': None}]), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'unexpected record'):
            inspect(self.path)


if __name__ == '__main__':
    unittest.main()
