from __future__ import annotations

import ast
import hashlib
import importlib.util
import inspect
import json
import os
from pathlib import Path
import stat
import sys
import types
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "purge_unknown_tactics.py"
SPEC = importlib.util.spec_from_file_location("purge_unknown_tactics", MODULE_PATH)
assert SPEC and SPEC.loader
purge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(purge)

EXPORTER_PATH = Path(__file__).resolve().parents[2] / "exporter-rag" / "slf_preset_evidence_561.py"


def _load_exporter():
    """Load the real exporter module so path-list drift fails the test."""
    try:
        import requests  # noqa: F401
    except ModuleNotFoundError:
        # The exporter only uses requests inside functions; a stub keeps the
        # module importable in environments without the dependency.
        sys.modules.setdefault("requests", types.ModuleType("requests"))
    spec = importlib.util.spec_from_file_location("slf_preset_evidence_561_under_test", EXPORTER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


exporter = _load_exporter()


def _exporter_preset_name_paths() -> tuple[str, ...]:
    source = inspect.getsource(exporter.preset_name)
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.List):
            return tuple(
                element.value
                for element in node.elts
                if isinstance(element, ast.Constant) and isinstance(element.value, str)
            )
    raise AssertionError("preset_name() dotted-path list not found in exporter source")


def write_collection(path: Path, records: list[dict]) -> None:
    path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class UnknownIdentityCriterionTests(unittest.TestCase):
    def test_literal_unknown_is_removed(self) -> None:
        self.assertTrue(purge.is_unknown_identity({"presetName": "unknown"}))

    def test_case_and_space_variants_are_removed(self) -> None:
        for name in ("Unknown", "UNKNOWN", " UNKNOWN ", "unknown\t"):
            self.assertTrue(purge.is_unknown_identity({"presetName": name}), name)

    def test_empty_and_whitespace_names_are_removed(self) -> None:
        self.assertTrue(purge.is_unknown_identity({"presetName": ""}))
        self.assertTrue(purge.is_unknown_identity({"presetName": "   "}))

    def test_missing_all_name_fields_is_removed(self) -> None:
        self.assertTrue(purge.is_unknown_identity({"id": "x"}))
        self.assertTrue(purge.is_unknown_identity({}))

    def test_valid_name_is_kept(self) -> None:
        self.assertFalse(purge.is_unknown_identity({"presetName": "4-4-2 v11"}))

    def test_quarantine_adjacent_names_are_kept(self) -> None:
        # Deliberate asymmetry vs the exporter quarantine set: these are
        # different evidence categories and must survive this purge.
        for name in ("manual", "manual_change", "null", "none"):
            self.assertFalse(purge.is_unknown_identity({"presetName": name}), name)

    def test_preset_dict_resolved_via_dotted_path(self) -> None:
        self.assertFalse(purge.is_unknown_identity({"preset": {"name": "4-4-2 v11"}}))
        self.assertTrue(purge.is_unknown_identity({"preset": {"name": "unknown"}}))
        self.assertTrue(purge.is_unknown_identity({"preset": {"id": "unknown"}}))
        self.assertTrue(purge.is_unknown_identity({"preset": {}}))

    def test_first_matching_path_wins_and_empty_strings_are_skipped(self) -> None:
        self.assertEqual(purge.preset_name({"presetName": "A", "preset": "B"}), "A")
        self.assertEqual(purge.preset_name({"presetName": "", "preset": "B"}), "B")
        self.assertEqual(purge.preset_name({"meta": {"presetName": "M"}}), "M")

    def test_breakdown_split(self) -> None:
        self.assertEqual(purge.unknown_identity_kind({"presetName": "unknown"}), "literalUnknown")
        self.assertEqual(purge.unknown_identity_kind({"presetName": "Unknown"}), "literalUnknown")
        self.assertEqual(purge.unknown_identity_kind({"presetName": ""}), "emptyOrMissing")
        self.assertEqual(purge.unknown_identity_kind({}), "emptyOrMissing")
        self.assertEqual(purge.unknown_identity_kind({"presetName": "  "}), "emptyOrMissing")


class ExporterParityTests(unittest.TestCase):
    def test_path_tuple_matches_exporter_literal(self) -> None:
        self.assertEqual(purge.PRESET_NAME_PATHS, _exporter_preset_name_paths())

    def test_every_exporter_path_resolves_in_purge_module(self) -> None:
        for index, path in enumerate(_exporter_preset_name_paths()):
            parts = path.split(".")
            probe: dict = {}
            cursor = probe
            for part in parts[:-1]:
                nested = cursor.get(part)
                if not isinstance(nested, dict):
                    nested = {}
                    cursor[part] = nested
                cursor = nested
            cursor[parts[-1]] = f"marker-{index}"
            self.assertEqual(
                purge.preset_name(probe),
                f"marker-{index}",
                f"dotted path not honoured: {path}",
            )

    def test_preset_name_matches_exporter_on_edge_cases(self) -> None:
        probes = [
            {},
            {"presetName": "unknown"},
            {"presetName": "Unknown "},
            {"presetName": ""},
            {"presetName": "   "},
            {"presetName": "4-4-2 v11"},
            {"preset": "P"},
            {"preset": {"name": "N"}},
            {"preset": {"id": "I"}},
            {"preset": {}},
            {"preset": {"name": "", "id": "via-id"}},
            {"event": {"presetName": "E"}},
            {"event": {"preset": "EP"}},
            {"tacticPreset": "T"},
            {"appliedPreset": "AP"},
            {"tacticContext": {"appliedPreset": "TC"}},
            {"telemetryContext": {"presetId": "unknown"}},
            {"phaseStart": {"presetId": "PS"}},
            {"phaseEnd": {"presetId": "PE"}},
            {"meta": {"presetName": "M"}},
            {"analysis": {"presetName": "A"}},
            {"presetName": 0},
            {"presetName": False},
        ]
        for probe in probes:
            self.assertEqual(
                purge.preset_name(probe),
                exporter.preset_name(probe),
                f"preset_name drift on probe {probe}",
            )
            self.assertEqual(
                purge.is_unknown_identity(probe),
                exporter.preset_name(probe).strip().lower() in {"", "unknown"},
                f"criterion drift on probe {probe}",
            )


class FilterStatsTests(unittest.TestCase):
    def test_mixed_fixture_stats_and_ids(self) -> None:
        records = [
            {"id": "e1", "presetName": "4-4-2 v11"},
            {"id": "e2", "presetName": "unknown"},
            {"id": "e3", "presetName": "Unknown"},
            {"id": "e4", "presetName": " UNKNOWN "},
            {"id": "e5", "presetName": ""},
            {"id": "e6", "presetName": "   "},
            {"id": "e7"},
            {"id": "e8", "presetName": "manual"},
            {"id": "e9", "presetName": "manual_change"},
            {"id": "e10", "presetName": "null"},
            {"id": "e11", "presetName": "none"},
            {"id": "e12", "preset": {"name": "4-4-2 v11"}},
            {"id": "e13", "preset": {"name": "unknown"}},
        ]
        kept, stats, removed_ids = purge.filter_unknown(records)
        self.assertEqual([row["id"] for row in kept], ["e1", "e8", "e9", "e10", "e11", "e12"])
        self.assertEqual(stats["before"], 13)
        self.assertEqual(stats["removed"], 7)
        self.assertEqual(stats["kept"], 6)
        self.assertEqual(
            stats["removedBreakdown"],
            {"literalUnknown": 4, "emptyOrMissing": 3},
        )
        self.assertEqual(removed_ids, ["e2", "e3", "e4", "e5", "e6", "e7", "e13"])

    def test_identifier_fallback_chain(self) -> None:
        self.assertEqual(purge.record_identifier({"id": "a", "gameId": "g"}, 0), "a")
        self.assertEqual(purge.record_identifier({"gameId": "g", "ts": 5}, 1), "g")
        self.assertEqual(purge.record_identifier({"ts": 123}, 2), "123")
        self.assertEqual(purge.record_identifier({}, 3), "<no-id:3>")


class BackupTests(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        self.tmp = Path(tempfile.mkdtemp(prefix="purge-backup-test-"))
        self.data = self.tmp / "data"
        self.data.mkdir()
        self.payloads = {
            collection: [{"id": f"{collection}-{i}"} for i in range(3)]
            for collection in purge.BACKUP_COLLECTIONS
        }
        for collection, records in self.payloads.items():
            write_collection(self.data / f"{collection}.json", records)

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_backup_creates_verified_copies_and_checksums(self) -> None:
        backup_dir = self.tmp / "backup"
        source_shas = purge.create_backup(self.data, backup_dir)

        self.assertEqual(set(source_shas), set(purge.BACKUP_COLLECTIONS))
        for collection in purge.BACKUP_COLLECTIONS:
            source = self.data / f"{collection}.json"
            copy = backup_dir / f"{collection}.json"
            expected = hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertEqual(source_shas[collection], expected)
            self.assertTrue(copy.is_file())
            self.assertEqual(copy.read_bytes(), source.read_bytes())

        sums = (backup_dir / "SHA256SUMS").read_text(encoding="utf-8")
        expected_lines = [
            f"{hashlib.sha256((self.data / f'{c}.json').read_bytes()).hexdigest()}  {c}.json"
            for c in purge.BACKUP_COLLECTIONS
        ]
        self.assertEqual(sums, "\n".join(expected_lines) + "\n")

    def test_backup_fails_loudly_on_missing_source(self) -> None:
        (self.data / "preset_effects_v2.json").unlink()
        backup_dir = self.tmp / "backup"
        with self.assertRaises(RuntimeError):
            purge.create_backup(self.data, backup_dir)
        self.assertFalse(backup_dir.exists(), "partial backup must be removed on failure")

    def test_backup_refuses_existing_directory_and_leaves_it_intact(self) -> None:
        backup_dir = self.tmp / "already-there"
        backup_dir.mkdir()
        sentinel = backup_dir / "sentinel.txt"
        sentinel.write_text("do-not-delete", encoding="utf-8")
        with self.assertRaises(RuntimeError) as ctx:
            purge.create_backup(self.data, backup_dir)
        self.assertIn("already exists", str(ctx.exception))
        self.assertTrue(backup_dir.is_dir(), "pre-existing directory must be untouched")
        self.assertTrue(sentinel.is_file())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "do-not-delete")


class ReplaceCollectionsTests(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        self.tmp = Path(tempfile.mkdtemp(prefix="purge-replace-test-"))
        self.data = self.tmp / "data"
        self.data.mkdir()
        self.snapshots = [{"id": "s1", "ts": "2026-10-01T00:00:00Z"}]
        self.results = [{"id": "r1", "recordType": "match_result"}]
        self.events = [
            {"id": "e1", "presetName": "4-4-2 v11"},
            {"id": "e2", "presetName": "unknown"},
            {"id": "e3"},
        ]
        self.effects = [{"id": "f1", "presetName": "Guardiola_PressEscape_v11"}]
        write_collection(self.data / "match_snapshots_v2.json", self.snapshots)
        write_collection(self.data / "match_results_v2.json", self.results)
        write_collection(self.data / "preset_events_v2.json", self.events)
        write_collection(self.data / "preset_effects_v2.json", self.effects)
        os.chmod(self.data / "preset_events_v2.json", 0o640)

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_only_purge_collections_with_removals_are_rewritten(self) -> None:
        before = {
            path.name: path.read_bytes()
            for path in self.data.glob("*.json")
        }
        kept, stats, _ = purge.scan_purge(self.data)
        removed_counts = {c: stats[c]["removed"] for c in purge.PURGE_COLLECTIONS}
        rewritten = purge.replace_collections(self.data, kept, removed_counts)

        self.assertEqual(rewritten, ["preset_events_v2"])

        # Untouched collections stay byte-identical.
        self.assertEqual(
            (self.data / "match_snapshots_v2.json").read_bytes(),
            before["match_snapshots_v2.json"],
        )
        self.assertEqual(
            (self.data / "match_results_v2.json").read_bytes(),
            before["match_results_v2.json"],
        )
        # Zero-removal purge collection stays byte-identical.
        self.assertEqual(
            (self.data / "preset_effects_v2.json").read_bytes(),
            before["preset_effects_v2.json"],
        )

        survivors = json.loads((self.data / "preset_events_v2.json").read_text(encoding="utf-8"))
        self.assertEqual([row["id"] for row in survivors], ["e1"])

        # File mode preserved, no temp files left behind.
        self.assertEqual(
            stat.S_IMODE((self.data / "preset_events_v2.json").stat().st_mode),
            0o640,
        )
        self.assertEqual(list(self.data.glob(".*unknown-purge-tmp")), [])

        final_stats = purge.verify_clean(self.data)
        self.assertEqual(final_stats["preset_events_v2"]["removed"], 0)
        self.assertEqual(final_stats["preset_effects_v2"]["removed"], 0)

    def test_verify_untouched_detects_changes(self) -> None:
        kept, stats, _ = purge.scan_purge(self.data)
        removed_counts = {c: stats[c]["removed"] for c in purge.PURGE_COLLECTIONS}
        purge.replace_collections(self.data, kept, removed_counts)
        expected = {
            collection: purge.sha256_file(self.data / f"{collection}.json")
            for collection in purge.untouched_collections()
        }
        purge.verify_untouched(self.data, expected)

        write_collection(self.data / "match_results_v2.json", [{"id": "tampered"}])
        with self.assertRaises(RuntimeError):
            purge.verify_untouched(self.data, expected)


class PreviewEndToEndTests(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        self.tmp = Path(tempfile.mkdtemp(prefix="purge-preview-test-"))
        self.data = self.tmp / "data"
        self.data.mkdir()
        self.events = (
            [{"id": f"known-{i}", "presetName": "4-4-2 v11"} for i in range(10)]
            + [{"id": f"unknown-{i}", "presetName": "unknown"} for i in range(25)]
        )
        self.effects = [{"id": "f1", "presetName": "Simeone_CompactLead_v11"}]
        write_collection(self.data / "match_snapshots_v2.json", [{"id": "s1"}])
        write_collection(self.data / "match_results_v2.json", [{"id": "r1"}])
        write_collection(self.data / "preset_events_v2.json", self.events)
        write_collection(self.data / "preset_effects_v2.json", self.effects)

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_preview_changes_no_bytes(self) -> None:
        before = {path.name: path.read_bytes() for path in sorted(self.data.glob("*.json"))}
        preview = purge.build_preview(self.data)
        after = {path.name: path.read_bytes() for path in sorted(self.data.glob("*.json"))}
        self.assertEqual(before, after)

        self.assertEqual(preview["mode"], "preview")
        events_stats = preview["collections"]["preset_events_v2"]
        self.assertEqual(events_stats["before"], 35)
        self.assertEqual(events_stats["removed"], 25)
        self.assertEqual(events_stats["kept"], 10)
        self.assertEqual(
            events_stats["removedBreakdown"],
            {"literalUnknown": 25, "emptyOrMissing": 0},
        )
        self.assertEqual(preview["collections"]["preset_effects_v2"]["removed"], 0)
        self.assertEqual(len(preview["samples"]["preset_events_v2"]), 20)
        self.assertEqual(preview["samples"]["preset_events_v2"][0], "unknown-0")

    def test_preview_list_ids_returns_everything(self) -> None:
        preview = purge.build_preview(self.data, list_ids=True)
        self.assertEqual(len(preview["samples"]["preset_events_v2"]), 25)
        self.assertEqual(preview["samples"]["preset_events_v2"][-1], "unknown-24")

    def test_verify_clean_raises_while_unknowns_remain(self) -> None:
        with self.assertRaises(RuntimeError):
            purge.verify_clean(self.data)


if __name__ == "__main__":
    unittest.main()
