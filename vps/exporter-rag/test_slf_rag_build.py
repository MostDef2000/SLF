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
- the real repo file passing validation with claims C1..C396.

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
import re
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
EXPECTED_CLAIM_IDS = [f"C{i}" for i in range(1, 397)]


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


# ---------------------------------------------------------------------------
# T4 target contract (issue #405): tactical knowledge pack validation boundary.
#
# The constants below are PINNED to the userscript runtime sources so the
# exporter's validation boundary and the runtime loader/registry cannot drift.
# PinnedLiteralCrossCheckTests re-derives them from the JS files and fails
# visibly if the JS source changes.
# ---------------------------------------------------------------------------
REPO_ROOT = HERE.parent.parent
PACK_JS_PATH = REPO_ROOT / "src" / "modules" / "strategy-data-recommendations" / "tactical-knowledge-pack.js"
REGISTRY_JS_PATH = REPO_ROOT / "src" / "modules" / "tactics-presets" / "active-preset-registry.js"

# Mirrored from tactical-knowledge-pack.js SUPPORTED_WHEN_KEYS / SCORE_STATES /
# PRESSURE_LITERAL (the runtime loader's fail-closed when-clause contract).
PINNED_SUPPORTED_WHEN_KEYS = ["score_state", "minute_min", "my_bad_min", "my_bad_max", "pressure"]
PINNED_SCORE_STATES = ["losing", "winning", "draw"]
PINNED_PRESSURE_LITERAL = "opponent_advantage_xg_or_xt"

# Pinned from active-preset-registry.js LEGACY_PRESET_ALIASES (line 22).
PINNED_LEGACY_PRESET_ALIASES = {
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

# Pinned 13 recommendation presets (active-preset-registry.js ACTIVE_PRESET_NAMES).
PINNED_RECOMMENDATION_PRESETS = [
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

# Forward-authored claims are context only and must never be cited as proof.
PINNED_FORWARD_CLAIM_IDS = {"C264", "C304"}

# Placeholder source strings that must never appear as a tactical case source.
PINNED_PLACEHOLDER_SOURCES = {"strategy_baseline", "match_evidence_pending"}

# Coverage-limitation note that main() must surface in ai_context.md: the case
# vocabulary is the runtime's 5-key when-clause set, and gap topics that cannot
# be expressed in it are deferred (extending the vocabulary is a separate
# runtime contour). Pinned marker for the documentation test.
AI_CONTEXT_COVERAGE_MARKER = "не выражаются в текущем словаре условий"

# The three seed cases and their T4 target content (ids/situations unchanged;
# presets canonical; sources real claim ids; notes hypothesis-framed).
T4_CASE_IDS = [
    "case_losing_after_55_low_bad_press",
    "case_losing_after_55_high_bad_controlled_push",
    "case_winning_after_70_under_pressure_compact",
]
T4_CASE_SITUATIONS = {
    "case_losing_after_55_low_bad_press": {"score_state": "losing", "minute_min": 55, "my_bad_max": 16},
    "case_losing_after_55_high_bad_controlled_push": {"score_state": "losing", "minute_min": 55, "my_bad_min": 20},
    "case_winning_after_70_under_pressure_compact": {"score_state": "winning", "minute_min": 70, "pressure": "opponent_advantage_xg_or_xt"},
}
T4_CASE_PRESETS = {
    "case_losing_after_55_low_bad_press": "Klopp_LateGegenpress_v11",
    "case_losing_after_55_high_bad_controlled_push": "Guardiola_ControlledPush_v11",
    "case_winning_after_70_under_pressure_compact": "Simeone_CompactLead_v11",
}
T4_CASE_SOURCES = {
    "case_losing_after_55_low_bad_press": ["C324", "C379", "C329", "C325"],
    "case_losing_after_55_high_bad_controlled_push": ["C324", "C379", "C344", "C237"],
    "case_winning_after_70_under_pressure_compact": ["C325", "C344", "C237"],
}


def _claims_payload(claim_ids):
    """A valid slf_forum_official_claims_v1 corpus over the given claim ids."""
    return {
        "schema": EXPECTED_SCHEMA,
        "claims": [_valid_claim(id=cid) for cid in claim_ids],
    }


def _valid_case(**overrides):
    """A structurally valid tactical case (passes the T4 validation contract)."""
    case = {
        "id": "case_test",
        "situation": {"score_state": "losing", "minute_min": 55},
        "recommended_preset": "Klopp_LateGegenpress_v11",
        "coaching_note": "Гипотеза: тестовая эвристика (C324).",
        "confidence": "seed_rule",
        "sources": ["C324"],
    }
    case.update(overrides)
    return case


def _parse_js_string_array(text, name):
    match = re.search(name + r":\s*\[([^\]]*)\]", text)
    if not match:
        raise AssertionError(f"pinned-literal cross-check: could not extract {name} from JS source")
    return re.findall(r"'([^']*)'", match.group(1))


def _parse_js_string(text, name):
    match = re.search(name + r":\s*'([^']*)'", text)
    if not match:
        raise AssertionError(f"pinned-literal cross-check: could not extract {name} from JS source")
    return match.group(1)


def _parse_js_object(text, name):
    match = re.search(name + r"=(\{[^}]*\})", text)
    if not match:
        raise AssertionError(f"pinned-literal cross-check: could not extract {name} from JS source")
    return json.loads(match.group(1))


def _temp_dir():
    """A TemporaryDirectory rooted under /tmp/opencode (approved scratch)."""
    root = Path("/tmp/opencode")
    root.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=str(root))


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
        self.assertEqual(entry["count"], 396)
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
        self.assertEqual(summary["forum_official_claims"], 396)

    def test_search_index_includes_official_claims(self):
        self._run_main()
        index = json.loads((self.out / "rag" / "search_index.json").read_text(encoding="utf-8"))
        claim_rows = [item for item in index["items"] if item["type"] == "forum_official_claim"]
        self.assertEqual(len(claim_rows), 396)
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


class TacticalCaseValidationTests(unittest.TestCase):
    """validate_tactical_cases(tactical_cases, official_claims) fail-closed contract."""

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        self.rag_build = _import_rag_build(Path(self.tmp.name))
        # Corpus containing every claim id the cases below may cite.
        self.claims = _claims_payload(
            ["C324", "C379", "C329", "C325", "C344", "C237", "C36", "C264", "C304"])

    def _validate(self, cases):
        return self.rag_build.validate_tactical_cases(cases, self.claims)

    def test_empty_list_is_valid(self):
        # Withdrawal mechanism: an empty case list is valid, not an error.
        self._validate([])

    def test_cases_not_a_list_rejected(self):
        for bad in ("nope", None, {"id": "case_test"}, 42):
            with self.subTest(cases=bad):
                with self.assertRaises(RuntimeError) as ctx:
                    self._validate(bad)
                self.assertIn("tactical_cases", str(ctx.exception))

    def test_case_not_a_dict_rejected(self):
        for bad in ("nope", 42, ["nested"]):
            with self.subTest(case=bad):
                with self.assertRaises(RuntimeError):
                    self._validate([bad])

    def test_id_problems_rejected(self):
        with self.subTest(kind="duplicate"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(id="case_a"), _valid_case(id="case_a")])
        with self.subTest(kind="blank"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(id="   ")])
        with self.subTest(kind="non_string"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(id=123)])
        with self.subTest(kind="missing"):
            with self.assertRaises(RuntimeError):
                self._validate([{k: v for k, v in _valid_case().items() if k != "id"}])

    def test_situation_problems_rejected(self):
        with self.subTest(kind="empty"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(situation={})])
        with self.subTest(kind="non_dict"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(situation="losing")])
        with self.subTest(kind="missing"):
            with self.assertRaises(RuntimeError):
                self._validate([{k: v for k, v in _valid_case().items() if k != "situation"}])

    def test_situation_key_outside_supported_set_rejected(self):
        for key in ("minute_max", "score", "bad", "xg", "half"):
            with self.subTest(key=key):
                situation = {"score_state": "losing", "minute_min": 55, key: 1}
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(situation=situation)])

    def test_score_state_outside_set_rejected(self):
        for state in ("tied", "drawn", "LOSING", "", None):
            with self.subTest(state=state):
                situation = {"score_state": state, "minute_min": 55}
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(situation=situation)])

    def test_numeric_fields_type_and_finiteness(self):
        for field in ("minute_min", "my_bad_min", "my_bad_max"):
            for bad in (True, False, "55", None, float("nan"), float("inf"), float("-inf")):
                with self.subTest(field=field, value=bad):
                    situation = {"score_state": "losing", field: bad}
                    with self.assertRaises(RuntimeError):
                        self._validate([_valid_case(situation=situation)])

    def test_my_bad_min_greater_than_max_rejected(self):
        situation = {"score_state": "losing", "minute_min": 55, "my_bad_min": 20, "my_bad_max": 10}
        with self.assertRaises(RuntimeError):
            self._validate([_valid_case(situation=situation)])

    def test_pressure_literal_must_match(self):
        for bad in ("opponent_advantage", "opponent_advantage_xg", "", None):
            with self.subTest(pressure=bad):
                situation = {"score_state": "winning", "minute_min": 70, "pressure": bad}
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(situation=situation)])

    def test_recommended_preset_problems_rejected(self):
        with self.subTest(kind="blank"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(recommended_preset="   ")])
        with self.subTest(kind="non_string"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(recommended_preset=123)])

    def test_recommended_preset_must_resolve_to_pinned_13(self):
        for preset in (
            "Compact_Counter_def3",                 # retired
            "Bielsa_ChaosPress_att5",               # retired
            "Unknown_Preset_v99",                   # unknown
            "Bielsa_ChaosPress_att5_EXPERIMENT_ONLY",  # experiment-only
            "standard",                             # UI baseline, not a recommendation preset
        ):
            with self.subTest(preset=preset):
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(recommended_preset=preset)])

    def test_legacy_alias_preset_accepted(self):
        # Every pinned alias must resolve to one of the 13 and be accepted.
        for alias, target in PINNED_LEGACY_PRESET_ALIASES.items():
            with self.subTest(alias=alias):
                self.assertIn(target, PINNED_RECOMMENDATION_PRESETS)
                self._validate([_valid_case(recommended_preset=alias)])

    def test_all_pinned_13_presets_accepted(self):
        for preset in PINNED_RECOMMENDATION_PRESETS:
            with self.subTest(preset=preset):
                self._validate([_valid_case(recommended_preset=preset)])

    def test_coaching_note_problems_rejected(self):
        with self.subTest(kind="blank"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(coaching_note="")])
        with self.subTest(kind="non_string"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(coaching_note=123)])

    def test_confidence_must_be_seed_rule(self):
        for bad in ("high", "seed", "SEED_RULE", "", None):
            with self.subTest(confidence=bad):
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(confidence=bad)])

    def test_sources_problems_rejected(self):
        with self.subTest(kind="missing"):
            with self.assertRaises(RuntimeError):
                self._validate([{k: v for k, v in _valid_case().items() if k != "sources"}])
        with self.subTest(kind="empty"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources=[])])
        with self.subTest(kind="not_a_list"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources="C324")])

    def test_source_must_match_real_corpus_claim(self):
        with self.subTest(kind="unknown_id"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources=["C999"])])
        with self.subTest(kind="blank"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources=["   "])])
        with self.subTest(kind="non_string"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources=[123])])
        with self.subTest(kind="duplicate_in_list"):
            with self.assertRaises(RuntimeError):
                self._validate([_valid_case(sources=["C324", "C324"])])

    def test_placeholder_sources_rejected(self):
        for placeholder in sorted(PINNED_PLACEHOLDER_SOURCES):
            with self.subTest(placeholder=placeholder):
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(sources=[placeholder])])

    def test_forward_claims_rejected_as_proof(self):
        for cid in sorted(PINNED_FORWARD_CLAIM_IDS):
            with self.subTest(claim=cid):
                with self.assertRaises(RuntimeError):
                    self._validate([_valid_case(sources=[cid])])

    def test_mixed_valid_and_invalid_sources_rejected(self):
        with self.assertRaises(RuntimeError):
            self._validate([_valid_case(sources=["C324", "C999"])])
        with self.assertRaises(RuntimeError):
            self._validate([_valid_case(sources=["C324", "strategy_baseline"])])

    def test_corpus_duplicate_claim_ids_rejected(self):
        dup_claims = _claims_payload(["C324", "C324"])
        with self.assertRaises(RuntimeError):
            self.rag_build.validate_tactical_cases([_valid_case()], dup_claims)

    def test_error_message_names_case_and_prefix(self):
        with self.assertRaises(RuntimeError) as ctx:
            self._validate([_valid_case(id="case_named", sources=["C999"])])
        message = str(ctx.exception)
        self.assertTrue(message.startswith("tactical_cases:"), message)
        self.assertIn("case_named", message)


class KnowledgePackBoundaryTests(unittest.TestCase):
    """build_knowledge_pack is the validation boundary and projects sources."""

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        case_dir = Path(self.tmp.name) / "boundary"
        case_dir.mkdir()
        corpus = _claims_payload(["C324", "C379", "C329", "C325", "C344", "C237", "C36"])
        self.module = _load_module_copy(case_dir, "slf_rag_build_boundary", payload=corpus)

    def test_valid_cases_return_pack(self):
        cases = [_valid_case(id="case_a", sources=["C324", "C379"])]
        pack = self.module.build_knowledge_pack(cases, self.module.build_forum_official_claims())
        self.assertEqual(pack["schema"], "slf_tactical_knowledge_pack_v1")
        self.assertEqual(len(pack["rules"]), 1)

    def test_invalid_cases_raise_and_abort(self):
        cases = [_valid_case(id="case_a", sources=["C999"])]  # C999 not in corpus
        with self.assertRaises(RuntimeError):
            self.module.build_knowledge_pack(cases, self.module.build_forum_official_claims())

    def test_none_claims_loads_corpus_and_validates(self):
        # official_claims=None must load the corpus via build_forum_official_claims()
        # and still validate: an unknown claim id is rejected.
        cases = [_valid_case(id="case_a", sources=["C999"])]
        with self.assertRaises(RuntimeError):
            self.module.build_knowledge_pack(cases)

    def test_none_claims_valid_cases_succeed(self):
        cases = [_valid_case(id="case_a", sources=["C324"])]
        pack = self.module.build_knowledge_pack(cases)
        self.assertEqual(pack["schema"], "slf_tactical_knowledge_pack_v1")
        self.assertEqual(len(pack["rules"]), 1)

    def test_projection_copies_sources_in_order(self):
        cases = [_valid_case(id="case_a", sources=["C324", "C379"])]
        pack = self.module.build_knowledge_pack(cases, self.module.build_forum_official_claims())
        rule = pack["rules"][0]
        self.assertEqual(rule["sources"], ["C324", "C379"])
        # Mutating the input afterwards must not affect the produced pack.
        cases[0]["sources"].append("C999")
        self.assertEqual(rule["sources"], ["C324", "C379"])

    def test_projection_preserves_rule_identity(self):
        cases = [_valid_case(id="case_a", sources=["C324"])]
        pack = self.module.build_knowledge_pack(cases, self.module.build_forum_official_claims())
        rule = pack["rules"][0]
        self.assertEqual(rule["id"], "case_a")
        self.assertEqual(rule["when"], {"score_state": "losing", "minute_min": 55})
        self.assertEqual(rule["recommendation"]["preset"], "Klopp_LateGegenpress_v11")
        self.assertEqual(rule["confidence"], "seed_rule")


class TacticalCaseContentContractTests(unittest.TestCase):
    """build_tactical_cases() content contract for the three seed cases."""

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        self.rag_build = _import_rag_build(Path(self.tmp.name))
        self.cases = self.rag_build.build_tactical_cases([])
        self.by_id = {case["id"]: case for case in self.cases}

    def test_case_ids_unchanged(self):
        self.assertEqual([case["id"] for case in self.cases], T4_CASE_IDS)

    def test_situations_unchanged(self):
        for case_id, situation in T4_CASE_SITUATIONS.items():
            with self.subTest(case=case_id):
                self.assertEqual(self.by_id[case_id]["situation"], situation)

    def test_recommended_presets_are_canonical(self):
        for case_id, preset in T4_CASE_PRESETS.items():
            with self.subTest(case=case_id):
                self.assertEqual(self.by_id[case_id]["recommended_preset"], preset)

    def test_sources_are_real_claim_ids(self):
        for case_id, sources in T4_CASE_SOURCES.items():
            with self.subTest(case=case_id):
                self.assertEqual(self.by_id[case_id]["sources"], sources)

    def test_coaching_notes_hypothesis_framed(self):
        for case_id, sources in T4_CASE_SOURCES.items():
            note = self.by_id[case_id]["coaching_note"]
            with self.subTest(case=case_id):
                self.assertIsInstance(note, str)
                self.assertIn("Гипотеза:", note)
                for cid in sources:
                    self.assertIn(cid, note)
                self.assertNotIn("без хаоса", note)
                self.assertIn("эвристика", note)


class ConflictWarningTests(unittest.TestCase):
    """tactical_case_conflict_warnings: deterministic, sorted, deduplicated."""

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        self.rag_build = _import_rag_build(Path(self.tmp.name))
        self.real_claims = json.loads(REPO_CLAIMS_PATH.read_text(encoding="utf-8"))

    def _case(self, case_id, sources):
        return _valid_case(id=case_id, sources=sources)

    def test_returns_sorted_deduplicated_list_of_strings(self):
        cases = [self._case("case_a", ["C379"]), self._case("case_b", ["C379"])]
        warnings = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        self.assertIsInstance(warnings, list)
        for warning in warnings:
            self.assertIsInstance(warning, str)
        self.assertEqual(warnings, sorted(warnings))
        self.assertEqual(len(warnings), len(set(warnings)))

    def test_conflict_citation_warns_both_claim_ids(self):
        cases = [self._case("case_a", ["C379"])]
        warnings = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        self.assertTrue(
            any("C379" in w and "C36" in w for w in warnings),
            f"expected a C379/C36 conflict warning, got {warnings!r}",
        )

    def test_symmetric_either_endpoint_triggers(self):
        # Citing the other endpoint of the same edge must warn identically.
        cases = [self._case("case_a", ["C36"])]
        warnings = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        self.assertTrue(
            any("C379" in w and "C36" in w for w in warnings),
            f"expected a C379/C36 conflict warning, got {warnings!r}",
        )

    def test_no_conflict_yields_no_warning(self):
        cases = [self._case("case_a", ["C324"])]
        warnings = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        self.assertEqual(warnings, [])

    def test_deterministic_across_calls(self):
        cases = [self._case("case_a", ["C379", "C324"]), self._case("case_b", ["C36"])]
        first = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        second = self.rag_build.tactical_case_conflict_warnings(cases, self.real_claims)
        self.assertEqual(first, second)

    def test_build_succeeds_despite_conflict(self):
        # Conflict reporting is a warning, not a veto: the build still succeeds.
        cases = [self._case("case_a", ["C379"])]
        pack = self.rag_build.build_knowledge_pack(cases, self.real_claims)
        self.assertEqual(pack["schema"], "slf_tactical_knowledge_pack_v1")
        self.assertEqual(len(pack["rules"]), 1)


class PinnedLiteralCrossCheckTests(unittest.TestCase):
    """Pinned python constants must match the userscript JS sources."""

    def test_supported_when_keys_match(self):
        text = PACK_JS_PATH.read_text(encoding="utf-8")
        self.assertEqual(_parse_js_string_array(text, "SUPPORTED_WHEN_KEYS"), PINNED_SUPPORTED_WHEN_KEYS)

    def test_score_states_match(self):
        text = PACK_JS_PATH.read_text(encoding="utf-8")
        self.assertEqual(_parse_js_string_array(text, "SCORE_STATES"), PINNED_SCORE_STATES)

    def test_pressure_literal_matches(self):
        text = PACK_JS_PATH.read_text(encoding="utf-8")
        self.assertEqual(_parse_js_string(text, "PRESSURE_LITERAL"), PINNED_PRESSURE_LITERAL)

    def test_legacy_aliases_match(self):
        text = REGISTRY_JS_PATH.read_text(encoding="utf-8")
        self.assertEqual(_parse_js_object(text, "LEGACY_PRESET_ALIASES"), PINNED_LEGACY_PRESET_ALIASES)

    def test_pinned_13_presets_present_in_registry(self):
        # Guard: the pinned recommendation presets must EXACTLY match the
        # registry's ACTIVE_PRESET_NAMES array (extracted, not substring-matched,
        # so a renamed/added/removed preset cannot slip through as a substring).
        text = REGISTRY_JS_PATH.read_text(encoding="utf-8")
        # ACTIVE_PRESET_NAMES is declared as `const ACTIVE_PRESET_NAMES=[...]`
        # (no colon, double-quoted entries) — the single-quote/colon
        # _parse_js_string_array helper cannot match that shape, so extract it
        # with a targeted regex and fail visibly if the declaration is absent.
        match = re.search(r"ACTIVE_PRESET_NAMES\s*=\s*\[([^\]]*)\]", text)
        if not match:
            raise AssertionError(
                "pinned-literal cross-check: could not extract ACTIVE_PRESET_NAMES from JS source")
        extracted = re.findall(r'"([^"]*)"', match.group(1))
        self.assertEqual(set(extracted), set(PINNED_RECOMMENDATION_PRESETS))


class RepoSanityTests(unittest.TestCase):
    """Real corpus + real build_tactical_cases() output + real main()."""

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)
        self.rag_build = _import_rag_build(self.out)

    def test_real_cases_pass_validation(self):
        claims = self.rag_build.build_forum_official_claims()
        cases = self.rag_build.build_tactical_cases([])
        # Must not raise: the real seed cases are valid against the real corpus.
        self.rag_build.validate_tactical_cases(cases, claims)

    def test_real_main_writes_pack_with_sources(self):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.rag_build.main()
        pack = json.loads((self.out / "tactics" / "knowledge-pack.latest.json").read_text(encoding="utf-8"))
        self.assertEqual(pack["schema"], "slf_tactical_knowledge_pack_v1")
        self.assertTrue(pack["rules"])
        for rule in pack["rules"]:
            self.assertIn("sources", rule)
            self.assertIsInstance(rule["sources"], list)
            self.assertTrue(rule["sources"])

    def test_real_main_conflict_warnings_to_stderr(self):
        # The real seed cases cite C379 (conflicts with C36): the warning must
        # go to stderr while stdout stays valid JSON.
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.rag_build.main()
        summary = json.loads(stdout.getvalue())
        self.assertIs(summary["ok"], True)
        self.assertIn("C379", stderr.getvalue())
        self.assertIn("C36", stderr.getvalue())

    def test_real_main_ai_context_documents_coverage_limitation(self):
        # The generated ai_context.md must carry a coverage-limitation note: the
        # case vocabulary is the runtime's 5-key when-clause set, and gap topics
        # that cannot be expressed in it are deferred (extending the vocabulary
        # is a separate runtime contour). Pinned by AI_CONTEXT_COVERAGE_MARKER.
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.rag_build.main()
        context = (self.out / "ai_context.md").read_text(encoding="utf-8")
        self.assertIn(AI_CONTEXT_COVERAGE_MARKER, context)


class TacticalPackAbortTests(unittest.TestCase):
    """main() aborts fail-closed: an invalid tactical case aborts the build
    BEFORE the tactical/RAG outputs are written (validation before any pack
    write). Regression guards for the write-ordering property.

    Uses a temp-dir COPY of the module (not the shared real module) so the
    build_tactical_cases monkeypatch is isolated to this test.
    """

    def setUp(self):
        self.tmp = _temp_dir()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name) / "out"
        self.out.mkdir()
        case_dir = Path(self.tmp.name) / "mod"
        case_dir.mkdir()
        # Valid corpus so the copy's build_forum_official_claims() works and the
        # valid case's citation (C324) resolves.
        corpus = _claims_payload(["C324", "C379", "C329", "C325", "C344", "C237", "C36"])
        # Point the copied module's OUT at our temp out dir (captured at exec).
        previous = os.environ.get("SLF_AI_OUT")
        os.environ["SLF_AI_OUT"] = str(self.out)
        try:
            self.module = _load_module_copy(case_dir, "slf_rag_build_abort", payload=corpus)
        finally:
            if previous is None:
                os.environ.pop("SLF_AI_OUT", None)
            else:
                os.environ["SLF_AI_OUT"] = previous

    def _patch_cases(self, cases):
        # main() looks up build_tactical_cases in the module globals at call
        # time, so patching the copy's attribute is picked up by main().
        self.module.build_tactical_cases = lambda match_evidence: cases

    def _valid_plus_invalid(self):
        valid = _valid_case(id="case_ok", sources=["C324"])
        invalid = _valid_case(id="case_bad", confidence="unknown")  # must be 'seed_rule'
        return [valid, invalid]

    def test_abort_writes_no_tactical_or_rag_outputs(self):
        self._patch_cases(self._valid_plus_invalid())
        with self.assertRaises(RuntimeError):
            self.module.main()
        # No knowledge-pack, no jsonl, no corpus copy — none of the tactical/RAG
        # outputs are written when validation aborts the build. (build_forum_notes
        # writes OUT/forum_faq before validation; that pre-existing side effect is
        # out of scope for the tactical-pack write-ordering property.)
        self.assertFalse((self.out / "tactics" / "knowledge-pack.latest.json").exists())
        for name in ("rule_extracts.jsonl", "forum_notes.jsonl",
                     "match_evidence.jsonl", "tactical_cases.jsonl"):
            self.assertFalse((self.out / "rag" / name).exists(), name)
        self.assertFalse((self.out / "rag" / "forum_official_claims.json").exists())
        self.assertFalse((self.out / "rag" / "search_index.json").exists())
        self.assertFalse((self.out / "rag" / "catalog.json").exists())
        self.assertFalse((self.out / "manifest.json").exists())
        self.assertFalse((self.out / "ai_context.md").exists())

    def test_abort_preserves_prior_pack(self):
        # A pre-existing pack must survive the abort byte-for-byte.
        pack_path = self.out / "tactics" / "knowledge-pack.latest.json"
        pack_path.parent.mkdir(parents=True, exist_ok=True)
        sentinel = json.dumps({"sentinel": True}).encode("utf-8")
        pack_path.write_bytes(sentinel)
        self._patch_cases(self._valid_plus_invalid())
        with self.assertRaises(RuntimeError):
            self.module.main()
        self.assertEqual(pack_path.read_bytes(), sentinel)


if __name__ == "__main__":
    unittest.main()
