#!/usr/bin/env python3
"""Regression checks for the final-stage SLF export manifest gate."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slf_manifest_integrity import ExportIntegrityError, finalize, verify, REQUIRED_ARTIFACTS


class ManifestIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        files = {}
        for name in sorted(REQUIRED_ARTIFACTS):
            relative = f"data/{name}.json"
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('{"schema":"stage_one"}\n', encoding="utf-8")
            files[name] = {"path": relative, "exists": True, "sizeBytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
        (self.root / "manifest.json").write_text(json.dumps({"schema": "slf_ai_manifest_v1", "files": files}), encoding="utf-8")

    def test_two_stage_overwrite_is_reflected_in_final_manifest(self):
        events = self.root / "data/presetEventsSummary.json"
        effects = self.root / "data/presetEffectsSummary.json"
        events.write_text('{"schema":"tactical_phase_events_v2"}\n', encoding="utf-8")
        effects.write_text('{"schema":"tactical_phase_effects_v2"}\n', encoding="utf-8")
        with self.assertRaises(ExportIntegrityError):
            verify(self.root)
        summary = finalize(self.root)
        self.assertEqual(summary["verifiedFiles"], len(REQUIRED_ARTIFACTS))
        self.assertEqual(verify(self.root)["ok"], True)
        manifest = json.loads((self.root / "manifest.json").read_text())
        self.assertEqual(manifest["files"]["presetEffectsSummary"]["sizeBytes"], effects.stat().st_size)

    def test_modified_artifact_after_finalize_fails_closed(self):
        finalize(self.root)
        (self.root / "data/tacticalLabQuality.json").write_text('{"corrupted":true}', encoding="utf-8")
        with self.assertRaisesRegex(ExportIntegrityError, "mismatch"):
            verify(self.root)

    def test_missing_artifact_cannot_be_hidden_by_finalize(self):
        (self.root / "data/presetEffectsSummary.json").unlink()
        with self.assertRaisesRegex(ExportIntegrityError, "not found"):
            finalize(self.root)

    def test_path_traversal_is_rejected(self):
        manifest_file = self.root / "manifest.json"
        manifest = json.loads(manifest_file.read_text())
        manifest["files"]["presetEventsSummary"]["path"] = "../secret.json"
        manifest_file.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ExportIntegrityError, "Unsafe"):
            finalize(self.root)

    def test_symlink_outside_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as other:
            external = Path(other) / "external.json"
            external.write_text("{}")
            artifact = self.root / "data/presetEventsSummary.json"
            artifact.unlink()
            artifact.symlink_to(external)
            with self.assertRaisesRegex(ExportIntegrityError, "escapes"):
                finalize(self.root)

    def test_missing_manifest_entry_is_rejected(self):
        path = self.root / "manifest.json"
        manifest = json.loads(path.read_text())
        del manifest["files"]["tacticalLabQuality"]
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ExportIntegrityError, "missing required"):
            verify(self.root)


if __name__ == "__main__":
    unittest.main()
